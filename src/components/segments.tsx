import { TRENCH_META } from "../data/catalogs";
import { fmt, segLabel, type SegmentCalc } from "../lib/calc";
import type { ProjectState, Segment, TrenchType } from "../lib/types";
import { FlashValue, IconPlus, IconTrash, IconWarn, NumInput, Panel, Sel } from "./ui";

const TH =
  "px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-mut whitespace-nowrap";
const TD = "px-3 py-2.5 align-middle";

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
  const { segments, types } = state;
  const activeTypes = types;
  const typeOptions = activeTypes.map((t) => ({
    value: t,
    label: `${TRENCH_META[t].letter}) ${TRENCH_META[t].short}`,
  }));
  const maxH = Math.max(1, ...segments.map((s) => Math.max(s.h1, s.h2)));

  const sum = {
    L: 0,
    V: 0,
    cable: 0,
  };
  for (const c of calcs) {
    if (!c.active) continue;
    sum.L += c.seg.length;
    sum.V += c.excavation;
    sum.cable += c.cable;
  }

  return (
    <Panel className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[860px]">
          <thead>
            <tr className="bg-raise border-b border-line text-left">
              <th className={TH}>Участок</th>
              <th className={TH}>Тип траншеи</th>
              <th className={`${TH} text-right`}>L, м</th>
              <th className={`${TH} text-right`}>H₁, м</th>
              <th className={`${TH} text-right`}>H₂, м</th>
              <th className={TH}>Профиль</th>
              <th className={`${TH} text-right`}>H ср.</th>
              <th className={`${TH} text-right`}>Земля, м³</th>
              <th className={`${TH} text-right`}>Кабель, м</th>
              <th className={`${TH} w-10`}> </th>
            </tr>
          </thead>
          <tbody>
            {segments.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-mut">
                  Участков пока нет — добавьте первый ниже.
                </td>
              </tr>
            )}
            {segments.map((s, i) => {
              const c = calcs[i];
              const inactive = !c.active;
              return (
                <tr
                  key={s.id}
                  className={`rowin border-b border-line transition-colors ${
                    inactive
                      ? "bg-warn-soft/60"
                      : "hover:bg-accent-soft/40"
                  }`}
                >
                  <td className={TD}>
                    <div className="flex items-center gap-1.5 font-mono font-semibold text-ink">
                      <input
                        value={s.from}
                        onChange={(e) => onUpdate(s.id, { from: e.target.value })}
                        className="w-11 h-9 text-center bg-surface border border-line rounded-md font-mono text-sm font-bold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
                        aria-label="Точка от"
                      />
                      <span className="text-mut2">–</span>
                      <input
                        value={s.to}
                        onChange={(e) => onUpdate(s.id, { to: e.target.value })}
                        className="w-11 h-9 text-center bg-surface border border-line rounded-md font-mono text-sm font-bold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
                        aria-label="Точка до"
                      />
                    </div>
                  </td>
                  <td className={TD}>
                    <Sel
                      value={s.type}
                      onChange={(v) => onUpdate(s.id, { type: v as TrenchType })}
                      options={typeOptions}
                      className="min-w-[170px]"
                    />
                  </td>
                  <td className={`${TD} text-right`}>
                    <NumInput
                      value={s.length}
                      onChange={(n) => onUpdate(s.id, { length: n })}
                      step={1}
                      className="w-24 inline-block"
                    />
                  </td>
                  <td className={`${TD} text-right`}>
                    <NumInput
                      value={s.h1}
                      onChange={(n) => onUpdate(s.id, { h1: n })}
                      step={0.1}
                      className="w-24 inline-block"
                    />
                  </td>
                  <td className={`${TD} text-right`}>
                    <NumInput
                      value={s.h2}
                      onChange={(n) => onUpdate(s.id, { h2: n })}
                      step={0.1}
                      className="w-24 inline-block"
                    />
                  </td>
                  <td className={TD}>
                    <div
                      className="w-16 h-8 border border-line rounded-md bg-surface overflow-hidden"
                      title={`Глубина ${fmt(s.h1)} → ${fmt(s.h2)} м`}
                    >
                      <svg viewBox="0 0 64 32" className="w-full h-full block">
                        <rect width="64" height="32" fill="var(--color-raise)" />
                        <path d="M0 4h64" stroke="var(--color-line2)" strokeWidth="1" />
                        <path
                          d={`M0 ${(s.h1 / maxH) * 22 + 6} L64 ${(s.h2 / maxH) * 22 + 6} L64 32 L0 32 Z`}
                          fill={inactive ? "rgba(217,119,6,0.15)" : "rgba(37,99,235,0.16)"}
                        />
                        <path
                          d={`M0 ${(s.h1 / maxH) * 22 + 6} L64 ${(s.h2 / maxH) * 22 + 6}`}
                          stroke={inactive ? "var(--color-warn)" : "var(--color-accent)"}
                          strokeWidth="1.6"
                        />
                      </svg>
                    </div>
                  </td>
                  <td className={`${TD} text-right font-mono font-semibold ${inactive ? "text-mut2" : "text-accent-deep"}`}>
                    <FlashValue value={c.hAvg} />
                  </td>
                  <td className={`${TD} text-right font-mono font-bold ${inactive ? "text-mut2" : "text-ink"}`}>
                    <FlashValue value={c.excavation} />
                  </td>
                  <td className={`${TD} text-right font-mono ${inactive ? "text-mut2" : "text-body"}`}>
                    <FlashValue value={c.cable} decimals={0} />
                  </td>
                  <td className={TD}>
                    <button
                      type="button"
                      onClick={() => onRemove(s.id)}
                      className="btn p-2 rounded-lg text-mut2 hover:text-danger hover:bg-danger-soft"
                      title="Удалить участок"
                    >
                      <IconTrash />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {segments.length > 0 && (
            <tfoot>
              <tr className="bg-accent-soft/70">
                <td className={`${TD} font-bold text-accent-deep text-xs uppercase tracking-wide`} colSpan={2}>
                  Итого по активным участкам
                </td>
                <td className={`${TD} text-right font-mono font-extrabold text-accent-deep`}>
                  <FlashValue value={sum.L} decimals={0} />
                </td>
                <td colSpan={4} className={TD} />
                <td className={`${TD} text-right font-mono font-extrabold text-accent-deep`}>
                  <FlashValue value={sum.V} />
                </td>
                <td className={`${TD} text-right font-mono font-bold text-accent-deep`}>
                  <FlashValue value={sum.cable} decimals={0} />
                </td>
                <td className={TD} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {segments.some((s) => !state.types.includes(s.type)) && (
        <div className="flex items-center gap-2.5 px-4 py-3 border-t border-line bg-warn-soft text-warn text-xs font-medium">
          <IconWarn className="w-4 h-4 shrink-0" />
          Участок «{segLabel(segments.find((s) => !state.types.includes(s.type))!)}» использует
          отключенный тип траншеи и исключен из ведомости.
        </div>
      )}

      <div className="p-3 border-t border-line bg-surface">
        <button
          type="button"
          onClick={onAdd}
          disabled={activeTypes.length === 0}
          className="btn w-full flex items-center justify-center gap-2 border border-dashed border-line2 rounded-lg py-2.5 text-xs font-bold uppercase tracking-wide text-mut hover:text-accent hover:border-accent/60 hover:bg-accent-soft/50 disabled:opacity-40 disabled:pointer-events-none"
        >
          <IconPlus className="w-4 h-4" /> Добавить участок
        </button>
        {activeTypes.length === 0 && (
          <p className="mt-2 text-center text-[11px] text-mut2">
            Сначала выберите типы траншей в разделе 02
          </p>
        )}
      </div>
    </Panel>
  );
}
