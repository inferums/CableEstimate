import { TRENCH_META } from "../data/catalogs";
import { fmt, segLabel, type SegmentCalc } from "../lib/calc";
import type { ProjectState, Segment, TrenchType } from "../lib/types";
import {
  FlashValue,
  IconPlus,
  IconTrash,
  IconWarn,
  NumInput,
  Panel,
} from "./ui";

function PointInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-14 bg-panel2 border border-line2 px-2 py-1.5 text-center font-mono text-sm text-white outline-none focus:border-amber/70 placeholder:text-mut2"
    />
  );
}

export function SegmentsTable({
  state,
  calcs,
  onUpdate,
  onAdd,
  onRemove,
}: {
  state: ProjectState;
  calcs: SegmentCalc[];
  onUpdate: (id: string, part: Partial<Segment>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const calcOf = new Map(calcs.map((c) => [c.seg.id, c]));
  const activeOptions = state.types.map((t) => ({
    value: t,
    label: `${TRENCH_META[t].letter}) ${TRENCH_META[t].label}`,
  }));

  return (
    <Panel className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[980px]">
          <thead>
            <tr className="border-b border-line2 text-left">
              <th className="px-3 py-2.5 font-mono text-[11px] uppercase tracking-wider text-mut font-semibold">Участок</th>
              <th className="px-2 py-2.5 font-mono text-[11px] uppercase tracking-wider text-mut font-semibold">Тип траншеи</th>
              <th className="px-2 py-2.5 font-mono text-[11px] uppercase tracking-wider text-mut font-semibold text-right">L, м</th>
              <th className="px-2 py-2.5 font-mono text-[11px] uppercase tracking-wider text-mut font-semibold text-right">H1, м</th>
              <th className="px-2 py-2.5 font-mono text-[11px] uppercase tracking-wider text-mut font-semibold text-right">H2, м</th>
              <th className="px-2 py-2.5 font-mono text-[11px] uppercase tracking-wider text-amber font-semibold text-right">H ср., м</th>
              <th className="px-2 py-2.5 font-mono text-[11px] uppercase tracking-wider text-amber font-semibold text-right">V земли, м³</th>
              <th className="px-2 py-2.5 font-mono text-[11px] uppercase tracking-wider text-amber font-semibold text-right">Кабель, м</th>
              <th className="px-2 py-2.5 font-mono text-[11px] uppercase tracking-wider text-mut font-semibold">Примечание</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {state.segments.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-mut">
                  <p className="font-display uppercase tracking-wide text-white/70 mb-1">
                    Участков пока нет
                  </p>
                  <p className="text-xs text-mut2">
                    Добавьте первый участок: например, 1–2, тип б), L = 6 м, H1 = 2,5 м, H2 = 3 м
                  </p>
                </td>
              </tr>
            )}
            {state.segments.map((s, i) => {
              const c = calcOf.get(s.id);
              const typeActive = state.types.includes(s.type);
              return (
                <tr
                  key={s.id}
                  className={`rowin border-b border-line/70 transition-colors hover:bg-raise/50 ${
                    !typeActive ? "opacity-60" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-mut2 w-5 text-right">
                        {i + 1}.
                      </span>
                      <PointInput value={s.from} placeholder="А" onChange={(v) => onUpdate(s.id, { from: v })} />
                      <span className="text-amber font-mono">–</span>
                      <PointInput value={s.to} placeholder="Б" onChange={(v) => onUpdate(s.id, { to: v })} />
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="relative">
                      <select
                        value={s.type}
                        onChange={(e) => onUpdate(s.id, { type: e.target.value as TrenchType })}
                        className="w-44 bg-panel2 border border-line2 pl-2.5 pr-8 py-1.5 font-mono text-xs text-cyan2 outline-none cursor-pointer focus:border-amber/70"
                      >
                        {activeOptions.map((o) => (
                          <option key={o.value} value={o.value} className="bg-panel text-white">
                            {o.label}
                          </option>
                        ))}
                        {!typeActive && (
                          <option value={s.type} className="bg-panel text-danger">
                            {TRENCH_META[s.type].letter}) {TRENCH_META[s.type].label} (выкл.)
                          </option>
                        )}
                      </select>
                    </div>
                    {!typeActive && (
                      <span className="mt-1 flex items-center gap-1 text-[10px] text-danger">
                        <IconWarn className="w-3 h-3" /> тип не активен — не учитывается
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 w-24">
                    <NumInput value={s.length} onChange={(n) => onUpdate(s.id, { length: n })} step={0.5} suffix="" className="[&_input]:text-right" />
                  </td>
                  <td className="px-2 py-2 w-24">
                    <NumInput value={s.h1} onChange={(n) => onUpdate(s.id, { h1: n })} step={0.1} className="[&_input]:text-right" />
                  </td>
                  <td className="px-2 py-2 w-24">
                    <NumInput value={s.h2} onChange={(n) => onUpdate(s.id, { h2: n })} step={0.1} className="[&_input]:text-right" />
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-cyan2">
                    {c ? <FlashValue value={c.hAvg} /> : "—"}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-amber2 font-semibold">
                    {c && c.active ? <FlashValue value={c.excavation} /> : "—"}
                  </td>
                  <td className="px-2 py-2 text-right font-mono text-amber2 font-semibold">
                    {c && c.active ? <FlashValue value={c.cable} decimals={0} /> : "—"}
                  </td>
                  <td className="px-2 py-2 text-[11px] text-mut2 max-w-[220px]">
                    {c?.active ? c.note : "—"}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => onRemove(s.id)}
                      className="btn p-1.5 text-mut2 hover:text-danger border border-transparent hover:border-line2"
                      title="Удалить участок"
                    >
                      <IconTrash className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {state.segments.length > 0 && (
            <tfoot>
              <tr className="text-right">
                <td colSpan={5} className="px-3 py-2.5 text-left font-mono text-[11px] uppercase tracking-wider text-mut">
                  Итого по активным участкам
                </td>
                <td className="px-2 py-2.5" />
                <td className="px-2 py-2.5 font-mono text-amber font-bold">
                  {fmt(calcs.reduce((s, c) => s + (c.active ? c.excavation : 0), 0))}
                </td>
                <td className="px-2 py-2.5 font-mono text-amber font-bold">
                  {fmt(calcs.reduce((s, c) => s + (c.active ? c.cable : 0), 0), 0)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="px-4 py-3 flex flex-col sm:flex-row gap-3 sm:items-center justify-between border-t border-line bg-panel2/60">
        <button
          onClick={onAdd}
          className="btn flex items-center gap-2 border border-amber/60 text-amber2 px-4 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-amber/10 w-fit"
        >
          <IconPlus className="w-3.5 h-3.5" /> Добавить участок
        </button>
        <p className="text-[11px] text-mut2">
          Ввод вручную · загрузка полилинии из DXF — в следующей редакции
        </p>
      </div>
    </Panel>
  );
}
