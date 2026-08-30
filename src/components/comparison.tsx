import { useMemo } from "react";
import type { ProjectState, Segment } from "../lib/types";
import { TRENCH_META } from "../data/catalogs";
import { segLabel } from "../lib/calc";

/* ================================================================
   Сравнение «Проект — Факт»
   Показывает отклонения фактических параметров от проектных
   ================================================================ */

interface Row {
  seg: Segment;
  label: string;
  designL: number | null;
  factL: number;
  deltaL: number | null;
  deltaLpct: number | null;
  designH: number | null;
  factH: number;
  deltaH: number | null;
  overDepth: boolean;
}

export function ComparisonTable({
  state,
  onUpdate,
}: {
  state: ProjectState;
  onUpdate: (id: string, part: Partial<Segment>) => void;
}) {
  const rows = useMemo(() => {
    const result: Row[] = [];
    for (const seg of state.segments) {
      const factH = (seg.h1 + seg.h2) / 2;
      const designL = seg.designLength ?? null;
      const designH = seg.designH1 != null && seg.designH2 != null
        ? (seg.designH1 + seg.designH2) / 2
        : seg.designH1 ?? null;

      result.push({
        seg,
        label: segLabel(seg),
        designL,
        factL: seg.length,
        deltaL: designL != null ? seg.length - designL : null,
        deltaLpct: designL != null && designL > 0 ? ((seg.length - designL) / designL) * 100 : null,
        designH,
        factH,
        deltaH: designH != null ? factH - designH : null,
        overDepth: factH < 0.7,
      });
    }
    return result;
  }, [state.segments]);

  const hasDesign = rows.some((r) => r.designL != null || r.designH != null);

  if (state.segments.length === 0) {
    return (
      <div className="border border-dashed border-line2 rounded-lg p-8 text-center text-sm text-mut2">
        Добавьте участки для сравнения
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hasDesign && (
        <div className="border border-accent/20 bg-accent-soft/40 rounded-lg px-4 py-3 text-xs text-body leading-relaxed">
          <span className="font-semibold text-accent-deep">Как использовать: </span>
          Заполните проектные значения (длина и глубина) из рабочей документации.
          Приложение покажет отклонения факта от проекта — то, что первым делом спросит проверяющий.
          Для ввода проектных данных кликните по ячейкам «L проект» и «H проект».
        </div>
      )}

      <div className="overflow-x-auto border border-line rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-raise border-b border-line">
              <th className="px-2 py-2 text-left font-mono text-mut2" rowSpan={2}>№</th>
              <th className="px-2 py-2 text-left font-mono text-mut" rowSpan={2}>Участок</th>
              <th className="px-2 py-2 text-left font-mono text-mut" rowSpan={2}>Тип</th>
              <th className="px-2 py-1 text-center font-mono text-mut border-b border-line/50" colSpan={3}>
                Длина, м
              </th>
              <th className="px-2 py-1 text-center font-mono text-mut border-b border-line/50" colSpan={3}>
                Глубина, м
              </th>
            </tr>
            <tr className="bg-raise/50 border-b border-line text-[9px]">
              <th className="px-1.5 py-1 text-right font-mono text-mut2">проект</th>
              <th className="px-1.5 py-1 text-right font-mono text-mut2">факт</th>
              <th className="px-1.5 py-1 text-right font-mono text-mut2">Δ</th>
              <th className="px-1.5 py-1 text-right font-mono text-mut2">проект</th>
              <th className="px-1.5 py-1 text-right font-mono text-mut2">факт</th>
              <th className="px-1.5 py-1 text-right font-mono text-mut2">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const lWarn = r.deltaLpct != null && Math.abs(r.deltaLpct) > 10;
              const hWarn = r.deltaH != null && r.deltaH > 0.1;
              return (
                <tr key={r.seg.id} className="border-b border-line/50 hover:bg-raise/30">
                  <td className="px-2 py-1.5 font-mono text-mut2">{i + 1}</td>
                  <td className="px-2 py-1.5 font-mono font-semibold text-ink">{r.label}</td>
                  <td className="px-2 py-1.5">
                    <span className="font-mono text-[10px] font-bold w-5 h-5 inline-flex items-center justify-center rounded bg-accent-soft text-accent">
                      {TRENCH_META[r.seg.type]?.letter ?? "?"}
                    </span>
                  </td>
                  {/* Длина — проект (редактируемое) */}
                  <td className="px-1.5 py-1">
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      placeholder="—"
                      value={r.seg.designLength ?? ""}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value.replace(",", "."));
                        onUpdate(r.seg.id, {
                          designLength: Number.isFinite(v) && v >= 0 ? v : undefined,
                        });
                      }}
                      className="w-16 h-7 bg-raise border border-line rounded px-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent text-right"
                    />
                  </td>
                  {/* Длина — факт */}
                  <td className="px-1.5 py-1.5 text-right font-mono text-ink">{r.factL.toFixed(1)}</td>
                  {/* Длина — отклонение */}
                  <td className={`px-1.5 py-1.5 text-right font-mono font-semibold ${
                    r.deltaL == null ? "text-mut2" :
                    lWarn ? "text-danger" : "text-ok"
                  }`}>
                    {r.deltaL != null
                      ? `${r.deltaL > 0 ? "+" : ""}${r.deltaL.toFixed(1)} (${r.deltaLpct! > 0 ? "+" : ""}${r.deltaLpct!.toFixed(0)}%)`
                      : "—"}
                  </td>
                  {/* Глубина — проект */}
                  <td className="px-1.5 py-1">
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      placeholder="—"
                      value={r.seg.designH1 ?? ""}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value.replace(",", "."));
                        const val = Number.isFinite(v) && v >= 0 ? v : undefined;
                        onUpdate(r.seg.id, { designH1: val, designH2: val });
                      }}
                      className="w-16 h-7 bg-raise border border-line rounded px-1.5 font-mono text-[11px] text-ink outline-none focus:border-accent text-right"
                    />
                  </td>
                  {/* Глубина — факт */}
                  <td className={`px-1.5 py-1.5 text-right font-mono ${r.overDepth ? "text-danger font-semibold" : "text-ink"}`}>
                    {r.factH.toFixed(2)}
                  </td>
                  {/* Глубина — отклонение */}
                  <td className={`px-1.5 py-1.5 text-right font-mono font-semibold ${
                    r.deltaH == null ? "text-mut2" :
                    hWarn ? "text-danger" : "text-ok"
                  }`}>
                    {r.deltaH != null
                      ? `${r.deltaH > 0 ? "+" : ""}${r.deltaH.toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-raise border-t border-line font-semibold text-[11px]">
              <td colSpan={3} className="px-2 py-1.5 text-right text-mut">Итого / средняя:</td>
              <td className="px-1.5 py-1.5 text-right font-mono text-accent-deep">
                {rows.filter(r => r.designL != null).reduce((s, r) => s + (r.designL ?? 0), 0).toFixed(1) || "—"}
              </td>
              <td className="px-1.5 py-1.5 text-right font-mono text-accent-deep">
                {rows.reduce((s, r) => s + r.factL, 0).toFixed(1)}
              </td>
              <td className="px-1.5 py-1.5 text-right font-mono">
                {(() => {
                  const dRows = rows.filter(r => r.deltaL != null);
                  if (dRows.length === 0) return "—";
                  const total = dRows.reduce((s, r) => s + (r.deltaL ?? 0), 0);
                  return `${total > 0 ? "+" : ""}${total.toFixed(1)}`;
                })()}
              </td>
              <td className="px-1.5 py-1.5" colSpan={3}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Сводка отклонений */}
      {hasDesign && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(() => {
            const lDevs = rows.filter(r => r.deltaL != null);
            const hDevs = rows.filter(r => r.deltaH != null);
            const lOver = lDevs.filter(r => (r.deltaL ?? 0) > 0);
            const hOver = hDevs.filter(r => (r.deltaH ?? 0) > 0);
            return (
              <>
                <div className="border border-line rounded-lg bg-raise px-3 py-2 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-mut2">Участков с +L</div>
                  <div className="font-mono text-lg font-bold text-danger">{lOver.length}</div>
                  <div className="text-[9px] text-mut">из {lDevs.length} с проектом</div>
                </div>
                <div className="border border-line rounded-lg bg-raise px-3 py-2 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-mut2">Среднее откл. L</div>
                  <div className="font-mono text-lg font-bold text-accent-deep">
                    {lDevs.length > 0
                      ? `${(lDevs.reduce((s, r) => s + (r.deltaL ?? 0), 0) / lDevs.length).toFixed(1)} м`
                      : "—"}
                  </div>
                </div>
                <div className="border border-line rounded-lg bg-raise px-3 py-2 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-mut2">Мельче проекта</div>
                  <div className="font-mono text-lg font-bold text-danger">{hOver.length}</div>
                  <div className="text-[9px] text-mut">из {hDevs.length} с проектом</div>
                </div>
                <div className="border border-line rounded-lg bg-raise px-3 py-2 text-center">
                  <div className="text-[9px] uppercase tracking-wider text-mut2">Мельче ПУЭ (&lt;0.7м)</div>
                  <div className="font-mono text-lg font-bold text-danger">
                    {rows.filter(r => r.overDepth).length}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
