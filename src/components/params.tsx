import { useState, type ReactElement } from "react";
import {
  BORE_DIAMETERS,
  HDPE_DIAMETERS,
  PLATES,
  PZK,
  TRAYS,
  TRENCH_META,
} from "../data/catalogs";
import type {
  ParamsMap,
  PipeEntry,
  ProjectState,
  TrenchType,
} from "../lib/types";
import { TrenchDiagram } from "./diagrams";
import {
  Field,
  IconBlock,
  IconGnb,
  IconLotok,
  IconOpen,
  IconPlus,
  IconTrash,
  NumInput,
  Sel,
} from "./ui";

let uid = 100;
const nextId = () => `p${++uid}`;

function NumField({ label, value, onChange, suffix = "" }: { label: string; value: number; onChange: (n: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="block mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-mut">{label}</span>
      <div className="relative">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
          className="w-full bg-well border border-line rounded-md px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
        />
        {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-mut">{suffix}</span>}
      </div>
    </label>
  );
}

export const TYPE_ICONS: Record<TrenchType, (p: { className?: string }) => ReactElement> = {
  gnb: IconGnb,
  block: IconBlock,
  lotok: IconLotok,
  open: IconOpen,
  splice: IconShieldLike,
};

function IconShieldLike({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className}>
      <path d="M4 10h24M8 10l3 14h10l3-14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="12.5" y="15.5" width="7" height="4.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9 17.75h3.5M19.5 17.75H23" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export const TYPE_ORDER: TrenchType[] = ["gnb", "block", "lotok", "open", "splice"];

export function defaultParamsFor(type: TrenchType): ParamsMap[TrenchType] {
  switch (type) {
    case "gnb":
      return { boreDiameter: 300, pipes: [{ id: nextId(), diameter: 110, count: 4 }] };
    case "block":
      return { width: 0.8, bedding: 0.1, beddingType: "sand", pipes: [{ id: nextId(), diameter: 160, count: 2 }] };
    case "lotok":
      return {
        width: 1.0, bedding: 0.1, beddingType: "sand",
        trayMark: "Л4-8", plateMark: "П5-8",
        topFill: 300, tapeWidth: 950,
        pgsAbove: 100, pgsTop: 70, pgsInside: 70,
      };
    case "open":
      return { width: 0.7, bedding: 0.1, beddingType: "sand", cover: "pzk", plateMark: "П5д-8" };
    case "splice":
      return { width: 1.5, bedding: 0.1, beddingType: "sand" };
  }
}

/* ================= сегмент-контроль ================= */
function Seg({
  value,
  onChange,
  options,
  vertical = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  vertical?: boolean;
}) {
  return (
    <div className={`inline-flex bg-well border border-line rounded-lg p-1 gap-1 ${vertical ? "flex-col w-full" : ""}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`btn flex-1 px-3 ${vertical ? "py-1" : "py-1.5"} rounded-md text-xs font-semibold transition-colors ${
            value === o.value ? "bg-surface text-accent shadow-sm ring-1 ring-line" : "text-mut hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ================= редактор пучка труб ================= */
export function PipeBundleEditor({
  pipes,
  onChange,
  verb,
}: {
  pipes: PipeEntry[];
  onChange: (pipes: PipeEntry[]) => void;
  verb: string;
}) {
  const set = (id: string, part: Partial<PipeEntry>) =>
    onChange(pipes.map((p) => (p.id === id ? { ...p, ...part } : p)));
  const total = pipes.reduce((s, p) => s + Math.max(0, Math.round(p.count)), 0);
  return (
    <div className="border border-line rounded-lg bg-raise/60 overflow-hidden">
      <div className="px-3 py-2 flex items-center justify-between border-b border-line bg-well/70">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mut">
          Пучок труб ПНД · {verb}
        </span>
        <span className="font-mono text-xs text-accent font-semibold">Σ {total} труб</span>
      </div>
      <div className="p-3 space-y-2">
        {pipes.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2 rowin">
            <span className="font-mono text-[11px] text-mut2 w-5 text-right">{i + 1}.</span>
            <Sel
              value={String(p.diameter)}
              onChange={(v) => set(p.id, { diameter: Number(v) })}
              options={HDPE_DIAMETERS.map((d) => ({ value: String(d), label: `Ø ${d} мм` }))}
              className="flex-1"
            />
            <NumInput value={p.count} onChange={(n) => set(p.id, { count: Math.round(n) })} step={1} suffix="шт" className="w-24" />
            <button
              type="button"
              onClick={() => onChange(pipes.filter((x) => x.id !== p.id))}
              disabled={pipes.length <= 1}
              className="btn p-2 text-mut2 hover:text-danger disabled:opacity-30 rounded-md hover:bg-danger-soft"
              title="Убрать трубу из пучка"
            >
              <IconTrash />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...pipes, { id: nextId(), diameter: 110, count: 1 }])}
          className="btn w-full flex items-center justify-center gap-2 border border-dashed border-line2 rounded-md py-2 text-xs font-semibold uppercase tracking-wider text-mut hover:text-accent hover:border-accent/60"
        >
          <IconPlus className="w-3.5 h-3.5" /> добавить трубу другого диаметра
        </button>
      </div>
    </div>
  );
}

/* ================= базовые поля траншеи ================= */
function BeddingRow<T extends { width: number; bedding: number; beddingType: "sand" | "pgs" }>({
  value,
  onChange,
}: {
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
      <Field label="Ширина траншеи">
        <NumInput value={value.width} onChange={(n) => onChange({ ...value, width: n })} step={0.1} suffix="м" />
      </Field>
      <Field label="Толщина подсыпки">
        <NumInput
          value={Math.round(value.bedding * 100)}
          onChange={(n) => onChange({ ...value, bedding: n / 100 })}
          step={1}
          suffix="см"
        />
      </Field>
      <Field label="Тип подсыпки">
        <Seg
          vertical
          value={value.beddingType}
          onChange={(v) => onChange({ ...value, beddingType: v as "sand" | "pgs" })}
          options={[
            { value: "sand", label: "Песок" },
            { value: "pgs", label: "ПГС" },
          ]}
        />
      </Field>
    </div>
  );
}

/* ================= форма параметров типа ================= */
export function TrenchTypeForm({
  type,
  value,
  onChange,
}: {
  type: TrenchType;
  value: ParamsMap[TrenchType];
  onChange: (v: ParamsMap[TrenchType]) => void;
}) {
  if (type === "gnb") {
    const v = value as ParamsMap["gnb"];
    return (
      <div className="space-y-4">
        <Field label="Диаметр скважины (расширение, до 1000 мм)">
          <Sel
            value={String(v.boreDiameter)}
            onChange={(d) => onChange({ ...v, boreDiameter: Number(d) })}
            options={BORE_DIAMETERS.map((d) => ({ value: String(d), label: `Ø ${d} мм` }))}
          />
        </Field>
        <PipeBundleEditor pipes={v.pipes} onChange={(pipes) => onChange({ ...v, pipes })} verb="затягивание в скважину" />
      </div>
    );
  }
  if (type === "block") {
    const v = value as ParamsMap["block"];
    return (
      <div className="space-y-4">
        <BeddingRow value={v} onChange={(nv) => onChange(nv as ParamsMap[TrenchType])} />
        <PipeBundleEditor pipes={v.pipes} onChange={(pipes) => onChange({ ...v, pipes })} verb="укладка в блок" />
      </div>
    );
  }
  if (type === "lotok") {
    const v = value as ParamsMap["lotok"];
    return (
      <div className="space-y-4">
        <BeddingRow value={v} onChange={(nv) => onChange(nv as ParamsMap[TrenchType])} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Тип лотка · Сер. 3.006.1-2">
            <Sel
              value={v.trayMark}
              onChange={(m) => onChange({ ...v, trayMark: m })}
              options={TRAYS.map((t) => ({ value: t.mark, label: `${t.mark} (${t.innerW}×${t.innerH})` }))}
            />
          </Field>
          <Field label="Плита перекрытия · Сер. 3.006.1-2">
            <Sel
              value={v.plateMark}
              onChange={(m) => onChange({ ...v, plateMark: m })}
              options={PLATES.map((p) => ({ value: p.mark, label: `${p.mark} · ${p.load}` }))}
            />
          </Field>
        </div>
        <div className="border-t border-line pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mut mb-3">Толщины слоёв (мм)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <NumField label="Верхняя засыпка" value={v.topFill} onChange={(n) => onChange({ ...v, topFill: n })} suffix="мм" />
            <NumField label="Ширина ленты" value={v.tapeWidth} onChange={(n) => onChange({ ...v, tapeWidth: n })} suffix="мм" />
            <NumField label="ПГС над плитой" value={v.pgsAbove} onChange={(n) => onChange({ ...v, pgsAbove: n })} suffix="мм" />
            <NumField label="ПГС над лотком" value={v.pgsTop} onChange={(n) => onChange({ ...v, pgsTop: n })} suffix="мм" />
            <NumField label="ПГС внутри лотка" value={v.pgsInside} onChange={(n) => onChange({ ...v, pgsInside: n })} suffix="мм" />
          </div>
        </div>
      </div>
    );
  }
  if (type === "open") {
    const v = value as ParamsMap["open"];
    return (
      <div className="space-y-4">
        <BeddingRow value={v} onChange={(nv) => onChange(nv as ParamsMap[TrenchType])} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <Field label="Защита кабеля поверх">
            <Seg
              value={v.cover}
              onChange={(c) => onChange({ ...v, cover: c as "plates" | "pzk" })}
              options={[
                { value: "plates", label: "Плиты сер. 3.006.1-2" },
                { value: "pzk", label: "ПЗК" },
              ]}
            />
          </Field>
          {v.cover === "plates" ? (
            <Field label="Тип плит · Сер. 3.006.1-2">
              <Sel
                value={v.plateMark}
                onChange={(m) => onChange({ ...v, plateMark: m })}
                options={PLATES.map((p) => ({ value: p.mark, label: `${p.mark} · ${p.load}` }))}
              />
            </Field>
          ) : (
            <p className="text-[11px] text-mut border border-dashed border-line2 rounded-md px-3 py-2">
              {PZK.mark} — 1 ряд на каждую кабельную линию (4 шт/м).
            </p>
          )}
        </div>
      </div>
    );
  }
  const v = value as ParamsMap["splice"];
  return <BeddingRow value={v} onChange={(nv) => onChange(nv as ParamsMap[TrenchType])} />;
}

/* ================= выбор типа (модалка) ================= */
export function TypePickerList({
  added,
  onPick,
}: {
  added: TrenchType[];
  onPick: (t: TrenchType) => void;
}) {
  return (
    <div className="space-y-2">
      {TYPE_ORDER.map((t) => {
        const m = TRENCH_META[t];
        const Icon = TYPE_ICONS[t];
        const used = added.includes(t);
        return (
          <button
            key={t}
            type="button"
            disabled={used}
            onClick={() => onPick(t)}
            className={`btn w-full flex items-center gap-3 border rounded-lg px-3.5 py-3 text-left transition-colors ${
              used
                ? "border-line bg-well opacity-60 cursor-default"
                : "border-line2 bg-surface hover:border-accent/60 hover:bg-accent-soft"
            }`}
          >
            <span className={`font-mono text-xs font-bold w-6 h-6 flex items-center justify-center rounded-md ${used ? "bg-line text-mut" : "bg-accent-soft text-accent"}`}>
              {m.letter}
            </span>
            <span className={used ? "text-mut2" : "text-accent"}>
              <Icon className="w-7 h-7" />
            </span>
            <span className="flex-1 min-w-0">
              <span className={`block font-display text-sm uppercase tracking-wide ${used ? "text-mut" : "text-ink"}`}>{m.label}</span>
              <span className="block text-[11px] text-mut2 truncate">{m.desc}</span>
            </span>
            {used ? (
              <span className="text-[10px] font-mono uppercase tracking-wider text-mut2">добавлен</span>
            ) : (
              <IconPlus className="w-4 h-4 text-accent" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ================= сводка параметров ================= */
function summaryFor(type: TrenchType, p: ParamsMap): string[] {
  if (type === "gnb")
    return [
      `скважина Ø${p.gnb.boreDiameter} мм`,
      ...p.gnb.pipes.map((x) => `Ø${x.diameter} × ${x.count}`),
    ];
  if (type === "block")
    return [
      `B=${p.block.width} м`,
      `подсыпка ${p.block.beddingType === "sand" ? "песок" : "ПГС"} ${Math.round(p.block.bedding * 100)} см`,
      ...p.block.pipes.map((x) => `Ø${x.diameter} × ${x.count}`),
    ];
  if (type === "lotok")
    return [
      `B=${p.lotok.width} м`,
      p.lotok.trayMark,
      p.lotok.plateMark,
      `подсыпка ${Math.round(p.lotok.bedding * 100)} см`,
    ];
  if (type === "open")
    return [
      `B=${p.open.width} м`,
      p.open.cover === "plates" ? p.open.plateMark : PZK.mark,
      `подсыпка ${Math.round(p.open.bedding * 100)} см`,
    ];
  return [`B=${p.splice.width} м`, `подсыпка ${p.splice.beddingType === "sand" ? "песок" : "ПГС"} ${Math.round(p.splice.bedding * 100)} см`];
}

/* ================= карточки раздела 03 ================= */
export function TrenchTypeCards({
  state,
  cables,
  onEdit,
  onDelete,
}: {
  state: ProjectState;
  cables: number;
  onEdit: (t: TrenchType) => void;
  onDelete: (t: TrenchType) => void;
}) {
  const [confirming, setConfirming] = useState<TrenchType | null>(null);

  if (state.types.length === 0) {
    return (
      <div className="border border-dashed border-line2 rounded-lg px-6 py-10 text-center">
        <p className="text-sm font-medium text-mut">Типы прокладки ещё не добавлены</p>
        <p className="text-xs text-mut2 mt-1">Добавьте тип в разделе 02 — здесь появится разрез с параметрами</p>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-4">
      {state.types.map((t, i) => {
        const m = TRENCH_META[t];
        const Icon = TYPE_ICONS[t];
        return (
          <div key={t} className="reveal revealed border border-line rounded-lg bg-surface shadow-card overflow-hidden flex flex-col rowin" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-raise">
              <span className="font-mono text-xs font-bold w-6 h-6 flex items-center justify-center rounded-md bg-accent text-white">{m.letter}</span>
              <span className="text-accent">
                <Icon className="w-6 h-6" />
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-sm uppercase tracking-wide text-ink leading-tight">{m.label}</h3>
                <p className="text-[10px] text-mut2 truncate">{m.desc}</p>
              </div>
              <button
                onClick={() => onEdit(t)}
                className="btn text-xs font-semibold text-accent border border-line2 rounded-md px-2.5 py-1.5 hover:bg-accent-soft hover:border-accent/50"
              >
                Изменить
              </button>
              {confirming === t ? (
                <button
                  onClick={() => {
                    onDelete(t);
                    setConfirming(null);
                  }}
                  onMouseLeave={() => setConfirming(null)}
                  className="btn text-xs font-semibold text-white bg-danger rounded-md px-2.5 py-1.5 rowin"
                >
                  Точно?
                </button>
              ) : (
                <button
                  onClick={() => setConfirming(t)}
                  className="btn p-1.5 text-mut2 hover:text-danger hover:bg-danger-soft rounded-md border border-transparent hover:border-danger/30"
                  title="Удалить тип"
                >
                  <IconTrash />
                </button>
              )}
            </div>
            <div className="px-3 pt-2 bg-well/60">
              <TrenchDiagram type={t} params={state.params} cables={cables} />
            </div>
            <div className="px-4 py-3 flex flex-wrap gap-1.5 border-t border-line">
              {summaryFor(t, state.params).map((s, j) => (
                <span key={j} className="font-mono text-[10.5px] text-body bg-well border border-line rounded-md px-2 py-0.5">
                  {s}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
