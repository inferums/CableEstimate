import type { Kv } from "./kv";
import type { ProjectMeta } from "./projects";
import type { Act, ProjectState } from "./types";
import { encodeToken, type RemoteMeta } from "./cloud-shared";

/*
 * Клиент синхронизации с облаком.
 *
 * Объекты живут в браузере, облако — способ перенести их на другую машину и
 * не потерять при поломке компьютера. Отправку и получение запускает человек:
 * молчаливая двусторонняя синхронизация файлового хранилища без транзакций
 * рано или поздно затирает чью-то работу.
 */

const API = "/api/sync";
export const PASSWORD_KEY = "cableestimate:cloud-password";
const DEVICE_KEY = "cableestimate:device";

/** Чем записан объект — видно в списке, когда машин несколько */
export function deviceName(): string {
  try {
    const saved = localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const guess = /Windows/.test(navigator.userAgent)
      ? "Компьютер"
      : /Android|iPhone|iPad/.test(navigator.userAgent)
        ? "Телефон"
        : "Браузер";
    localStorage.setItem(DEVICE_KEY, guess);
    return guess;
  } catch {
    return "Браузер";
  }
}

export class CloudConflict extends Error {
  constructor(readonly remote: RemoteMeta) {
    super("В облаке более свежая версия объекта");
    this.name = "CloudConflict";
  }
}

async function call<T>(password: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${encodeToken(password)}` },
    body: JSON.stringify(body),
  });
  if (res.status === 409) {
    const data = (await res.json()) as { remote: RemoteMeta };
    throw new CloudConflict(data.remote);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (data.error) throw new Error(data.error);
    /*
     * Ответ без объяснения — это упавшая или не собранная функция, а не
     * отказ по делу. Подсказываем, где смотреть, вместо голого кода.
     */
    const hint =
      res.status >= 500
        ? "функция на сервере упала — посмотрите Runtime Logs в Vercel"
        : res.status === 404
          ? "функция /api/sync не развёрнута; при локальном npm run dev её и не бывает"
          : "неожиданный ответ";
    throw new Error(`Облако ответило ${res.status}: ${hint}`);
  }
  return (await res.json()) as T;
}

export interface CloudPing {
  node: string;
  /** «ок» либо текст ошибки загрузки SDK хранилища */
  sdk: string;
  env: Record<string, boolean>;
}

/** Что видит функция на сервере: версия Node, SDK хранилища, наличие переменных */
export const cloudPing = (password: string) => call<CloudPing>(password, { action: "ping" });

export const cloudList = (password: string) =>
  call<{ objects: RemoteMeta[] }>(password, { action: "list" }).then((r) => r.objects);

export const cloudPull = (password: string, id: string) =>
  call<{ state: ProjectState; acts: Act[]; meta: RemoteMeta | null }>(password, { action: "pull", id });

export const cloudPush = (password: string, id: string, state: ProjectState, base: string | null, force = false) =>
  call<{ meta: RemoteMeta }>(password, {
    action: "push",
    id,
    state,
    base,
    force,
    device: deviceName(),
  }).then((r) => r.meta);

export const cloudDelete = (password: string, id: string) =>
  call<{ ok: true }>(password, { action: "delete", id });

/* ---------- что приложение помнит о синхронизации ---------- */

export interface SyncRecord {
  /** Время облачной версии, с которой объект последний раз сводили */
  remoteUpdatedAt: string;
  /** Когда это было */
  syncedAt: string;
}

const syncKey = (id: string) => `sync:${id}`;

export const readSync = (kv: Kv, id: string) => kv.get<SyncRecord>(syncKey(id));
export const writeSync = (kv: Kv, id: string, remoteUpdatedAt: string) =>
  kv.set(syncKey(id), { remoteUpdatedAt, syncedAt: new Date().toISOString() });
export const forgetSync = (kv: Kv, id: string) => kv.delete(syncKey(id));

export type RowStatus =
  | "local-only"
  | "remote-only"
  | "synced"
  | "local-newer"
  | "remote-newer"
  | "both-changed";

export const STATUS_LABEL: Record<RowStatus, string> = {
  "local-only": "только здесь",
  "remote-only": "только в облаке",
  synced: "совпадает",
  "local-newer": "изменён здесь",
  "remote-newer": "изменён в облаке",
  "both-changed": "разошлись",
};

/**
 * Состояние объекта относительно облака.
 *
 * Сравниваем не содержимое, а отметки времени: местную правку и ту облачную
 * версию, с которой объект последний раз сводили. Если истории сведения нет,
 * а объект есть и там, и там, — считаем, что версии разошлись: обещать
 * совпадение, не зная его, опаснее, чем лишний раз спросить человека.
 */
export function rowStatus(
  local: ProjectMeta | null,
  remote: RemoteMeta | null,
  sync: SyncRecord | null,
): RowStatus {
  if (local && !remote) return "local-only";
  if (!local && remote) return "remote-only";
  if (!local || !remote) return "synced";
  if (!sync) return "both-changed";

  const remoteChanged = remote.updatedAt !== sync.remoteUpdatedAt;
  const localChanged = local.updatedAt > sync.syncedAt;
  if (remoteChanged && localChanged) return "both-changed";
  if (localChanged) return "local-newer";
  if (remoteChanged) return "remote-newer";
  return "synced";
}

/** Строка списка синхронизации: объект здесь, объект в облаке и их отношение */
export interface CloudRow {
  id: string;
  local: ProjectMeta | null;
  remote: RemoteMeta | null;
  status: RowStatus;
  name: string;
  code: string;
}

export function cloudRows(
  projects: ProjectMeta[],
  remote: RemoteMeta[],
  syncs: Map<string, SyncRecord>,
): CloudRow[] {
  const ids = [...new Set([...projects.map((p) => p.id), ...remote.map((r) => r.id)])];
  return ids
    .map((id) => {
      const l = projects.find((p) => p.id === id) ?? null;
      const r = remote.find((x) => x.id === id) ?? null;
      return {
        id,
        local: l,
        remote: r,
        status: rowStatus(l, r, syncs.get(id) ?? null),
        name: l?.name ?? r?.name ?? "Без названия",
        code: l?.code ?? r?.code ?? "",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
