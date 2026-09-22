import type { Act, ProjectState } from "./types";

/*
 * Общее для браузера и серверной функции: раскладка объектов в хранилище
 * Vercel Blob, правила слияния и проверка идентификаторов.
 *
 * Blob — файловое хранилище без транзакций: две машины, записавшие объект
 * одна за другой, затрут работу друг друга. Поэтому акты лежат отдельными
 * файлами и никогда не переписываются: акт заморожен с момента подписания,
 * и даже проигранная гонка за project.json не может его потерять.
 */

export const PREFIX = "objects/";

/** Идентификатор объекта попадает в путь файла — посторонние символы недопустимы */
export const isValidId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

export const metaPath = (id: string) => `${PREFIX}${id}/meta.json`;
export const projectPath = (id: string) => `${PREFIX}${id}/project.json`;
export const actsPrefix = (id: string) => `${PREFIX}${id}/acts/`;
export const actPath = (id: string, actId: string) => `${actsPrefix(id)}${actId}.json`;

/** Идентификатор акта тоже попадает в путь */
export const safeActId = (actId: string) => /^[A-Za-z0-9_-]{1,64}$/.test(actId);

export interface RemoteMeta {
  id: string;
  name: string;
  code: string;
  /** Когда объект записан в облако */
  updatedAt: string;
  /** С какой машины записан — чтобы понимать, чья версия свежее */
  device: string;
  segments: number;
  acts: number;
  hasSmeta: boolean;
  size: number;
}

export function remoteMeta(id: string, state: ProjectState, device: string, size: number): RemoteMeta {
  return {
    id,
    name: state.projectName,
    code: state.projectCode,
    updatedAt: new Date().toISOString(),
    device,
    segments: state.segments.length,
    acts: state.acts?.length ?? 0,
    hasSmeta: Boolean(state.smeta),
    size,
  };
}

/**
 * Объединение актов: акт неизменен, поэтому совпадение по идентификатору —
 * это один и тот же акт, а не две версии. Ни одна сторона слияния не теряет
 * принятые объёмы.
 */
export function mergeActs(local: Act[] = [], remote: Act[] = []): Act[] {
  const seen = new Set(local.map((a) => a.id));
  return [...local, ...remote.filter((a) => !seen.has(a.id))];
}

/**
 * Состояние объекта после получения из облака: берём облачное, но акты
 * объединяем с местными — местный акт мог не успеть уехать.
 */
export function mergePulled(local: ProjectState | null, remote: ProjectState, remoteActs: Act[]): ProjectState {
  const acts = mergeActs(mergeActs(remote.acts ?? [], remoteActs), local?.acts ?? []);
  return { ...remote, acts };
}

export type SyncAction = "list" | "pull" | "push" | "delete";

export interface PushRequest {
  action: "push";
  id: string;
  state: ProjectState;
  device: string;
  /** Время облачной версии, от которой отталкиваемся; null — объекта ещё нет */
  base: string | null;
  /** Перезаписать облачную версию, даже если она свежее */
  force?: boolean;
}

export interface ConflictAnswer {
  error: "conflict";
  remote: RemoteMeta;
}
