import { useEffect, useRef, useState } from "react";
import type { ProjectMeta } from "../lib/projects";

/* ================================================================
   Переключение между объектами и состояние сохранения

   Приложение ведёт несколько объектов сразу. Список показывает, что за
   объект, когда его правили последний раз и есть ли в нём принятые акты —
   по одному шифру объекты путаются.
   ================================================================ */

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

const dt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dt.format(d);
};

const size = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;

/**
 * Состояние сохранения видно всегда.
 *
 * Прежде надпись «сохранено» была нарисованной: при отказе записи она
 * продолжала успокаивать пользователя, пока правки уходили в никуда.
 */
export function SaveBadge({ state }: { state: SaveState }) {
  if (state.kind === "error") {
    return (
      <span className="flex items-center gap-1.5 text-danger" title={state.message}>
        <span className="w-1.5 h-1.5 rounded-full bg-danger" />
        не сохранено
      </span>
    );
  }
  if (state.kind === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-mut">
        <span className="w-1.5 h-1.5 rounded-full bg-mut2 pulse-dot" />
        сохранение…
      </span>
    );
  }
  if (state.kind === "saved") {
    return (
      <span className="flex items-center gap-1.5 text-ok">
        <span className="w-1.5 h-1.5 rounded-full bg-ok pulse-dot" />
        сохранено {dt.format(new Date(state.at)).slice(-5)}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-mut2">
      <span className="w-1.5 h-1.5 rounded-full bg-mut2" />
      загрузка…
    </span>
  );
}

export function ProjectSwitcher({
  projects,
  currentId,
  storage,
  onOpen,
  onCreate,
  onDuplicate,
  onDelete,
  onExport,
}: {
  projects: ProjectMeta[];
  currentId: string | null;
  /** Где лежат объекты — на запасном хранилище это надо сказать вслух */
  storage: "indexeddb" | "localstorage" | null;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = projects.find((p) => p.id === currentId) ?? null;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-line hover:border-accent hover:bg-accent-soft/50 transition-colors max-w-[22rem]"
        title="Переключить объект"
      >
        <span className="text-left leading-tight min-w-0">
          <span className="block text-[12px] text-ink truncate">{current?.name || "Объект"}</span>
          <span className="block font-mono text-[10px] text-accent truncate">
            {current?.code || "без шифра"}
          </span>
        </span>
        <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-mut2 shrink-0">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-[32rem] max-w-[92vw] bg-surface border border-line rounded-xl shadow-pop z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-line flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-mut">
              Объекты — {projects.length}
            </span>
            <button
              onClick={() => {
                onCreate();
                setOpen(false);
              }}
              className="btn text-[11px] font-semibold text-accent hover:text-accent-deep px-2 py-1 rounded-md hover:bg-accent-soft"
            >
              + Новый объект
            </button>
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {projects.map((p) => (
              <div
                key={p.id}
                className={`flex items-start gap-2 px-3 py-2 border-b border-line/60 ${
                  p.id === currentId ? "bg-accent-soft/40" : "hover:bg-well"
                }`}
              >
                <button
                  onClick={() => {
                    if (p.id !== currentId) onOpen(p.id);
                    setOpen(false);
                  }}
                  className="btn flex-1 text-left min-w-0"
                >
                  <span className="block text-[12px] text-ink truncate">{p.name || "Без названия"}</span>
                  <span className="block font-mono text-[10px] text-mut2 truncate">
                    {p.code || "без шифра"} · {when(p.updatedAt)} · уч. {p.segments}
                    {p.acts > 0 && ` · актов ${p.acts}`}
                    {p.hasSmeta && " · смета"} · {size(p.size)}
                  </span>
                </button>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => onExport(p.id)}
                    title="Сохранить объект в JSON-файл"
                    className="btn text-[10px] text-mut hover:text-accent px-1.5 py-1 rounded"
                  >
                    JSON
                  </button>
                  <button
                    onClick={() => onDuplicate(p.id)}
                    title="Создать объект с теми же параметрами (без актов и сметы)"
                    className="btn text-[10px] text-mut hover:text-accent px-1.5 py-1 rounded"
                  >
                    копия
                  </button>
                  <button
                    onClick={() => onDelete(p.id)}
                    title="Удалить объект"
                    className="btn text-[10px] text-mut hover:text-danger px-1.5 py-1 rounded"
                  >
                    удалить
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="px-3 py-2 text-[10px] text-mut2 leading-snug border-t border-line">
            {storage === "localstorage"
              ? "Объекты лежат в запасном хранилище браузера (IndexedDB недоступна) — место ограничено, делайте копии в JSON."
              : "Объекты лежат в браузере этого компьютера. Копия в JSON — единственный способ перенести объект на другую машину."}
          </div>
        </div>
      )}
    </div>
  );
}
