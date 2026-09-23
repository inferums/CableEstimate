import { useCallback, useEffect, useMemo, useState } from "react";
import type { Kv } from "../lib/kv";
import type { ProjectMeta } from "../lib/projects";
import type { ProjectState } from "../lib/types";
import type { RemoteMeta } from "../lib/cloud-shared";
import { mergePulled } from "../lib/cloud-shared";
import {
  CloudConflict,
  cloudDelete,
  cloudList,
  cloudPing,
  cloudPull,
  cloudPush,
  cloudRows,
  type CloudPing,
  forgetSync,
  PASSWORD_KEY,
  readSync,
  STATUS_LABEL,
  writeSync,
  type CloudRow,
  type SyncRecord,
} from "../lib/cloud";
import { BtnGhost, BtnPrimary, Modal } from "./ui";

/* ================================================================
   Синхронизация объектов с облаком

   Обмен запускает человек: файловое хранилище не умеет сливать правки, и
   молчаливая двусторонняя синхронизация рано или поздно затёрла бы чью-то
   работу. Приложение показывает, что где лежит, и спрашивает при расхождении.
   ================================================================ */

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const when = (iso?: string) => (iso ? dt.format(new Date(iso)) : "—");

const STATUS_STYLE: Record<string, string> = {
  "local-only": "text-mut",
  "remote-only": "text-accent",
  synced: "text-ok",
  "local-newer": "text-accent-deep",
  "remote-newer": "text-warn",
  "both-changed": "text-danger",
};

export function CloudPanel({
  kv,
  projects,
  currentId,
  currentState,
  loadLocal,
  onApply,
  onRefresh,
  onClose,
}: {
  kv: Kv | null;
  projects: ProjectMeta[];
  currentId: string | null;
  currentState: ProjectState;
  /** Читает объект из браузера — нужен, чтобы отправить не открытый сейчас объект */
  loadLocal: (id: string) => Promise<ProjectState | null>;
  /** Кладёт полученный из облака объект на место открытого или в реестр */
  onApply: (id: string, state: ProjectState) => Promise<void>;
  onRefresh: () => Promise<void>;
  onClose: () => void;
}) {
  const [password, setPassword] = useState(() => {
    try {
      return localStorage.getItem(PASSWORD_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [remote, setRemote] = useState<RemoteMeta[] | null>(null);
  const [syncs, setSyncs] = useState<Map<string, SyncRecord>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ping, setPing] = useState<CloudPing | null>(null);

  const check = async () => {
    setBusy("проверка");
    setError(null);
    setPing(null);
    try {
      setPing(await cloudPing(password));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const readSyncs = useCallback(async () => {
    if (!kv) return;
    const pairs = await Promise.all(projects.map(async (p) => [p.id, await readSync(kv, p.id)] as const));
    setSyncs(new Map(pairs.filter((x): x is [string, SyncRecord] => Boolean(x[1]))));
  }, [kv, projects]);

  const connect = useCallback(
    async (pw: string) => {
      setBusy("список");
      setError(null);
      try {
        const objects = await cloudList(pw);
        setRemote(objects);
        try {
          localStorage.setItem(PASSWORD_KEY, pw);
        } catch {
          /* приватное окно — пароль просто не запомнится */
        }
        await readSyncs();
      } catch (err) {
        setRemote(null);
        setError((err as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [readSyncs],
  );

  /* Подключаемся один раз при открытии, если пароль уже известен */
  useEffect(() => {
    if (password) void connect(password);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => cloudRows(projects, remote ?? [], syncs), [projects, remote, syncs]);

  const stateFor = async (id: string) => (id === currentId ? currentState : await loadLocal(id));

  const push = async (row: CloudRow, force = false) => {
    if (!kv) return;
    setBusy(row.id);
    setError(null);
    try {
      const state = await stateFor(row.id);
      if (!state) throw new Error("Объект не читается из браузера");
      const base = syncs.get(row.id)?.remoteUpdatedAt ?? null;
      const meta = await cloudPush(password, row.id, state, base, force);
      await writeSync(kv, row.id, meta.updatedAt);
      await connect(password);
    } catch (err) {
      if (err instanceof CloudConflict) {
        const ok = confirm(
          `В облаке более свежая версия объекта «${row.name}»: ` +
            `${when(err.remote.updatedAt)}, машина «${err.remote.device}», актов ${err.remote.acts}.\n\n` +
            `Перезаписать её тем, что здесь? Принятые акты облачной версии не пропадут — ` +
            `они хранятся отдельно и вернутся при получении. Остальное в ней будет заменено.`,
        );
        if (ok) await push(row, true);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setBusy(null);
    }
  };

  const pull = async (row: CloudRow) => {
    if (!kv) return;
    setBusy(row.id);
    setError(null);
    try {
      const got = await cloudPull(password, row.id);
      const here = await stateFor(row.id);
      await onApply(row.id, mergePulled(here, got.state, got.acts));
      if (got.meta) await writeSync(kv, row.id, got.meta.updatedAt);
      await onRefresh();
      await connect(password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const drop = async (row: CloudRow) => {
    if (!kv) return;
    const tail = row.local ? "" : " — но здесь его нет, копии не останется";
    if (!confirm(`Удалить объект «${row.name}» из облака?\n\nВ браузере он останется${tail}.`)) return;
    setBusy(row.id);
    try {
      await cloudDelete(password, row.id);
      await forgetSync(kv, row.id);
      await connect(password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /* Пока не подключились, сравнивать не с чем — и отправлять нечего */
  const changed =
    remote === null ? [] : rows.filter((r) => r.status === "local-only" || r.status === "local-newer");

  const pushChanged = async () => {
    for (const r of changed) await push(r);
  };

  return (
    <Modal
      title="Облако"
      sub="Объекты хранятся в браузере; облако переносит их между машинами и хранит копию"
      onClose={onClose}
      wide
      footer={
        <>
          <BtnGhost onClick={() => void connect(password)} disabled={busy !== null}>
            Обновить список
          </BtnGhost>
          <BtnPrimary
            onClick={() => void pushChanged()}
            disabled={busy !== null || remote === null || changed.length === 0}
          >
            Отправить изменённые — {changed.length}
          </BtnPrimary>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <label className="flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-mut mb-1">
              Пароль синхронизации
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void connect(password)}
              placeholder="задан в настройках проекта на Vercel"
              className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <BtnPrimary onClick={() => void connect(password)} disabled={!password || busy !== null}>
            {busy === "список" ? "Проверка…" : "Подключиться"}
          </BtnPrimary>
        </div>

        {error && (
          <div className="border border-danger/40 bg-danger-soft rounded-lg px-3 py-2 text-xs text-danger space-y-1.5">
            <div>{error}</div>
            <button
              onClick={() => void check()}
              disabled={busy !== null}
              className="btn text-[11px] font-semibold underline decoration-dotted"
            >
              {busy === "проверка" ? "Проверка…" : "Проверить сервер"}
            </button>
          </div>
        )}

        {ping && (
          <div className="border border-line rounded-lg px-3 py-2 text-[11px] font-mono text-mut space-y-0.5">
            <div>Node {ping.node}</div>
            <div className={ping.sdk === "ок" ? "" : "text-danger"}>SDK хранилища: {ping.sdk}</div>
            {Object.entries(ping.env).map(([k, v]) => (
              <div key={k} className={v ? "text-ok" : "text-warn"}>
                {k}: {v ? "задан" : "нет"}
              </div>
            ))}
          </div>
        )}

        {remote === null ? (
          <p className="text-xs text-mut leading-relaxed">
            Пароль хранится в этом браузере и уходит только на ваш адрес на Vercel. Объекты лежат в
            приватном хранилище: без пароля их не получить.
          </p>
        ) : (
          <div className="border border-line rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-raise">
                <tr className="text-left border-b border-line">
                  <th className="px-2 py-1.5 font-semibold">Объект</th>
                  <th className="px-2 py-1.5 w-28 font-semibold">Здесь</th>
                  <th className="px-2 py-1.5 w-32 font-semibold">В облаке</th>
                  <th className="px-2 py-1.5 w-28 font-semibold">Состояние</th>
                  <th className="px-2 py-1.5 w-44 font-semibold text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60">
                    <td className="px-2 py-1.5">
                      <span className="block text-body">{r.name}</span>
                      <span className="block font-mono text-[10px] text-mut2">{r.code}</span>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-mut">
                      {r.local ? (
                        <>
                          {when(r.local.updatedAt)}
                          <span className="block text-mut2">актов {r.local.acts}</span>
                        </>
                      ) : (
                        "нет"
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-mut">
                      {r.remote ? (
                        <>
                          {when(r.remote.updatedAt)}
                          <span className="block text-mut2">
                            актов {r.remote.acts} · {r.remote.device}
                          </span>
                        </>
                      ) : (
                        "нет"
                      )}
                    </td>
                    <td className={`px-2 py-1.5 ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      {r.local && (
                        <button
                          onClick={() => void push(r)}
                          disabled={busy !== null}
                          className="btn text-[11px] text-mut hover:text-accent px-1.5 py-1 rounded disabled:opacity-40"
                        >
                          {busy === r.id ? "…" : "отправить"}
                        </button>
                      )}
                      {r.remote && (
                        <button
                          onClick={() => void pull(r)}
                          disabled={busy !== null}
                          className="btn text-[11px] text-mut hover:text-accent px-1.5 py-1 rounded disabled:opacity-40"
                        >
                          забрать
                        </button>
                      )}
                      {r.remote && (
                        <button
                          onClick={() => void drop(r)}
                          disabled={busy !== null}
                          className="btn text-[11px] text-mut hover:text-danger px-1.5 py-1 rounded disabled:opacity-40"
                        >
                          удалить
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-mut2">
                      Ни здесь, ни в облаке объектов нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-mut2 leading-relaxed">
          Акты хранятся в облаке отдельными файлами и никогда не переписываются: даже перезапись
          объекта не может потерять принятые объёмы — они вернутся при получении.
        </p>
      </div>
    </Modal>
  );
}
