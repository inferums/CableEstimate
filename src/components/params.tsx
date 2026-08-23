import type { ReactElement } from "react";
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
import {
  Field,
  IconBlock,
  IconGnb,
  IconLotok,
  IconOpen,
  IconPlus,
  IconTrash,
  NumInput,
  Panel,
  Reveal,
  Sel,
} from "./ui";

let uid = 100;
const nextId = () => `p${++uid}`;

const TYPE_ICONS: Record<TrenchType, (p: { className?: string }) => ReactElement> = {
  gnb: IconGnb,
  block: IconBlock,
  lotok: IconLotok,
  open: IconOpen,
};

function Seg({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex border border-line2 divide-x divide-line2 w-full">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`btn flex-1 px-3 py-2 font-mono text-xs uppercase tracking-wider transition-colors ${
            value === o.value
              ? "bg-amber/15 text-amber2 shadow-[inset_0_0_0_1px_rgba(245,165,36,0.5)]"
              : "text-mut hover:text-white hover:bg-white/5"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PipeBundleEditor({
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
    <div className="border border-line2 bg-panel2/60">
      <div className="px-3 py-2 flex items-center justify-between border-b border-line2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mut">
          Пучок труб ПНД · {verb}
        </span>
        <span className="font-mono text-xs text-amber2">
          Σ {total} труб{total === 1 ? "а" : total >= 2 && total <= 4 ? "ы" : ""}
        </span>
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
            <NumInput
              value={p.count}
              onChange={(n) => set(p.id, { count: Math.round(n) })}
              step={1}
              className="w-24"
              suffix="шт"
            />
            <button
              type="button"
              onClick={() => onChange(pipes.filter((x) => x.id !== p.id))}
              disabled={pipes.length <= 1}
              className="btn p-2 text-mut2 hover:text-danger disabled:opacity-30 border border-transparent hover:border-line2"
              title="Убрать трубу из пучка"
            >
              <IconTrash />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...pipes, { id: nextId(), diameter: 110, count: 1 }])}
          className="btn w-full flex items-center justify-center gap-2 border border-dashed border-line2 py-2 text-xs font-semibold uppercase tracking-wider text-mut hover:text-amber2 hover:border-amber/60"
        >
          <IconPlus className="w-3.5 h-3.5" /> добавить трубу другого диаметра
        </button>
      </div>
    </div>
  );
}

function CardHead({ type }: { type: TrenchType }) {
  const meta = TRENCH_META[type];
  const Icon = TYPE_ICONS[type];
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-line bg-raise/40">
      <span className="text-amber">
        <Icon className="w-7 h-7" />
      </span>
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-deep bg-amber w-5 h-5 flex items-center justify-center">
            {meta.letter}
          </span>
          <h3 className="font-display text-sm uppercase tracking-wide text-white">
            {meta.label}
          </h3>
        </div>
        <p className="text-[11px] text-mut2 mt-0.5">{meta.desc}</p>
      </div>
    </div>
  );
}

export function TrenchParams({
  state,
  update,
}: {
  state: ProjectState;
  update: <K extends TrenchType>(type: K, p: ParamsMap[K]) => void;
}) {
  const { params, types } = state;
  if (types.length === 0) return null;

  const beddingFields = (
    type: "block" | "lotok" | "open",
    p: { width: number; bedding: number; beddingType: "sand" | "pgs" },
  ) => (
    <>
      <Field label="Ширина траншеи">
        <NumInput
          value={p.width}
          onChange={(n) => update(type, { ...p, width: n } as ParamsMap[typeof type])}
          step={0.1}
          suffix="м"
        />
      </Field>
      <Field label="Толщина подсыпки">
        <NumInput
          value={Math.round(p.bedding * 100)}
          onChange={(n) => update(type, { ...p, bedding: n / 100 } as ParamsMap[typeof type])}
          step={1}
          suffix="см"
        />
      </Field>
      <Field label="Тип подсыпки">
        <Seg
          value={p.beddingType}
          onChange={(v) =>
            update(type, { ...p, beddingType: v as "sand" | "pgs" } as ParamsMap[typeof type])
          }
          options={[
            { value: "sand", label: "Песок" },
            { value: "pgs", label: "ПГС" },
          ]}
        />
      </Field>
    </>
  );

  const order: TrenchType[] = ["gnb", "block", "lotok", "open"];

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {order
        .filter((t) => types.includes(t))
        .map((t, i) => (
          <Reveal key={t} delay={i * 70}>
            <Panel className="overflow-hidden">
              <CardHead type={t} />
              <div className="p-4 space-y-4">
                {t === "gnb" && (
                  <>
                    <Field label="Диаметр скважины (расширение)">
                      <Sel
                        value={String(params.gnb.boreDiameter)}
                        onChange={(v) =>
                          update("gnb", { ...params.gnb, boreDiameter: Number(v) })
                        }
                        options={BORE_DIAMETERS.map((d) => ({
                          value: String(d),
                          label: `Ø ${d} мм`,
                        }))}
                      />
                    </Field>
                    <PipeBundleEditor
                      pipes={params.gnb.pipes}
                      onChange={(pipes) => update("gnb", { ...params.gnb, pipes })}
                      verb="затягивание в скважину"
                    />
                  </>
                )}

                {t === "block" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {beddingFields("block", params.block)}
                    </div>
                    <PipeBundleEditor
                      pipes={params.block.pipes}
                      onChange={(pipes) => update("block", { ...params.block, pipes })}
                      verb="укладка в блок"
                    />
                  </>
                )}

                {t === "lotok" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {beddingFields("lotok", params.lotok)}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Тип лотка · Сер. 3.006.1-2.87">
                        <Sel
                          value={params.lotok.trayMark}
                          onChange={(v) => update("lotok", { ...params.lotok, trayMark: v })}
                          options={TRAYS.map((tr) => ({
                            value: tr.mark,
                            label: `${tr.mark} (${tr.innerW}×${tr.innerH})`,
                          }))}
                        />
                      </Field>
                      <Field label="Плита перекрытия · Сер. 3.006.1-2.87">
                        <Sel
                          value={params.lotok.plateMark}
                          onChange={(v) => update("lotok", { ...params.lotok, plateMark: v })}
                          options={PLATES.map((pl) => ({
                            value: pl.mark,
                            label: `${pl.mark} · ${pl.load}`,
                          }))}
                        />
                      </Field>
                    </div>
                  </>
                )}

                {t === "open" && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {beddingFields("open", params.open)}
                    </div>
                    <Field label="Защита кабеля поверх">
                      <Seg
                        value={params.open.cover}
                        onChange={(v) =>
                          update("open", {
                            ...params.open,
                            cover: v as "plates" | "pzk",
                          })
                        }
                        options={[
                          { value: "plates", label: "Плиты сер. 3.006.1-2.87" },
                          { value: "pzk", label: `ПЗК ${PZK.dims}` },
                        ]}
                      />
                    </Field>
                    {params.open.cover === "plates" && (
                      <Field label="Тип плит перекрытия · Сер. 3.006.1-2.87">
                        <Sel
                          value={params.open.plateMark}
                          onChange={(v) => update("open", { ...params.open, plateMark: v })}
                          options={PLATES.map((pl) => ({
                            value: pl.mark,
                            label: `${pl.mark} · ${pl.load}`,
                          }))}
                        />
                      </Field>
                    )}
                    {params.open.cover === "pzk" && (
                      <p className="text-[11px] text-mut2 border border-dashed border-line2 px-3 py-2">
                        {PZK.mark} укладывается в 1 ряд на каждую прокладываемую кабельную линию
                        (4 шт/м).
                      </p>
                    )}
                  </>
                )}
              </div>
            </Panel>
          </Reveal>
        ))}
    </div>
  );
}
