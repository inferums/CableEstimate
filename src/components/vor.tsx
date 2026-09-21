import { CALC, TRENCH_META, VOLTAGE_META } from "../data/catalogs";
import { fmt, type VorResult } from "../lib/calc";
import { type ProjectState } from "../lib/types";
import {
  BtnGhost,
  BtnPrimary,
  FlashValue,
  IconDownload,
  IconPrint,
  Panel,
} from "./ui";

/* ============ full paper sheet (print target) ============ */
export function VorSheet({ state, vor }: { state: ProjectState; vor: VorResult }) {
  const v = VOLTAGE_META[state.voltage];
  let n = 0;
  /* Заголовки двух уровней: раздел ведомости и способ прокладки внутри него */
  let currentSection = 0;
  let currentSub = "";

  return (
    <div className="print-sheet bg-surface text-ink border border-line rounded-xl shadow-card">
      <div className="p-2 sm:p-3">
        <div className="border-2 border-ink/80 p-4 sm:p-7 relative rounded-sm">
          <div className="absolute top-1.5 left-1.5 w-3 h-3 border-l border-t border-ink/30" />
          <div className="absolute bottom-1.5 right-1.5 w-3 h-3 border-r border-b border-ink/30" />

          {/* Шапка документа */}
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-xs border-b-2 border-ink/80 pb-3 mb-3">
            <span className="text-mut text-[10px] font-semibold uppercase">Документ</span>
            <span className="font-bold">Ведомость объемов работ</span>

            <span className="text-mut text-[10px] font-semibold uppercase">Наименование стройки</span>
            <span className="font-bold">{state.projectName || "—"}</span>

            <span className="text-mut text-[10px] font-semibold uppercase">Объект</span>
            <span className="font-bold">{state.projectCode || "—"} · {v.label}</span>

            <span className="text-mut text-[10px] font-semibold uppercase">Основание</span>
            <span>{state.projectCode || "—"}</span>

            <span className="text-mut text-[10px] font-semibold uppercase">Дата</span>
            <span>{new Date().toLocaleDateString("ru-RU")}</span>
          </div>

          {/* Сводка */}
          <div className="grid grid-cols-3 divide-x divide-line border border-line rounded-lg mb-3 bg-raise/40">
            {[
              { l: "Траншея", v: vor.totals.length, d: 0, u: "м" },
              { l: "Земля", v: vor.totals.earth, d: 1, u: "м³" },
              { l: "Кабель", v: vor.totals.cable, d: 0, u: "м" },
            ].map((s) => (
              <div key={s.l} className="px-3 py-2 text-center">
                <div className="text-[9px] font-bold uppercase tracking-wider text-mut">{s.l}</div>
                <div className="font-mono text-sm font-bold text-accent-deep leading-tight">
                  {fmt(s.v, s.d)} <span className="text-[10px] text-mut2">{s.u}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Формулы */}
          <div className="mb-3 border border-line rounded-lg px-4 py-2 bg-raise/40">
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.12em] text-mut mb-1">Формулы расчёта</p>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-0.5 font-mono text-[10px] text-body leading-relaxed">
              <div>H<sub>ср</sub> = (H1 + H2) / 2</div>
              <div>V<sub>разр</sub> = (B + m·H<sub>ср</sub>) · H<sub>ср</sub> · L</div>
              <div>V<sub>обр.зас</sub> = V<sub>разр</sub> − V<sub>подс</sub> − V<sub>констр</sub></div>
              <div>L<sub>каб</sub> = L·(1+k<sub>зап</sub>)·n<sub>каб</sub> + 2n·l<sub>разд</sub></div>
            </div>
            <div className="mt-1 pt-1 border-t border-line flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[9px] text-mut2">
              <span>m={CALC.slopeK}</span>
              <span>k<sub>зап</sub>={CALC.cableReserve}</span>
              <span>k<sub>упл</sub>={CALC.compactionFactor}</span>
              <span>k<sub>разр</sub>={CALC.soilLoosen}</span>
              <span>l<sub>разд</sub>={CALC.cableStripLength} м</span>
            </div>
          </div>

          {/* Таблица */}
          <table className="w-full text-xs sm:text-[13px]">
            <thead>
              <tr className="border-b-2 border-ink/80 text-left">
                <th className="py-2 pr-2 w-10 font-mono font-bold">№</th>
                <th className="py-2 pr-2 font-bold">Наименование работ, ресурсов, затрат</th>
                <th className="py-2 pr-2 w-14 font-mono font-bold">Ед.</th>
                <th className="py-2 pr-3 w-20 text-right font-mono font-bold">Объём</th>
                <th className="py-2 font-mono font-bold hidden lg:table-cell">Формула</th>
              </tr>
            </thead>
            {vor.rows.length === 0 && (
              <tbody>
                <tr>
                  <td colSpan={5} className="py-8 text-center text-mut">
                    Нет данных — добавьте участки в разделе 04
                  </td>
                </tr>
              </tbody>
            )}
            {vor.rows.map((r, ri) => {
              const showSectionHeader = r.section !== currentSection;
              if (showSectionHeader) {
                currentSection = r.section;
                currentSub = "";
              }
              const showSubHeader = r.subSection !== currentSub;
              if (showSubHeader) currentSub = r.subSection;
              n++;
              return (
                <tbody key={ri} className="border-t border-line/70">
                  {showSectionHeader && (
                    <tr className="border-t-2 border-ink/60">
                      <td colSpan={5} className="pt-4 pb-1 font-display font-bold text-[12px] uppercase tracking-wide text-ink bg-raise/60">
                        Раздел {r.section}. {r.sectionTitle}
                      </td>
                    </tr>
                  )}
                  {showSubHeader && (
                    <tr>
                      <td colSpan={5} className="pt-2 pb-1 pl-3 font-display font-semibold text-[11px] uppercase tracking-wide text-accent-deep bg-raise/30">
                        {r.subSection}
                      </td>
                    </tr>
                  )}
                  <tr className="align-top hover:bg-accent-soft/40 transition-colors">
                    <td className="py-1 pr-2 font-mono text-mut text-[11px]">{n}</td>
                    <td className="py-1 pr-2 text-body">{r.name}</td>
                    <td className="py-1 pr-2 font-mono text-mut text-[11px]">{r.unit}</td>
                    <td className="py-1 pr-3 text-right font-mono font-bold text-ink">{fmt(r.qty)}</td>
                    <td className="py-1 font-mono text-[9px] text-mut2 hidden lg:table-cell max-w-[280px] truncate" title={r.formula}>
                      {r.formula || "—"}
                    </td>
                  </tr>
                </tbody>
              );
            })}
          </table>

          {/* Итого */}
          <div className="mt-3 pt-2 border-t-2 border-ink/80 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs">
            <span className="text-body">
              Позиций: <b className="text-accent-deep">{n}</b>
            </span>
            <span className="text-body">
              Траншей: <b className="text-accent-deep">{fmt(vor.totals.length, 0)} м</b>
            </span>
            <span className="text-body">
              Земляные: <b className="text-accent-deep">{fmt(vor.totals.earth)} м³</b>
            </span>
            <span className="text-body">
              Кабель: <b className="text-accent-deep">{fmt(vor.totals.cable, 0)} м</b>
            </span>
          </div>

          {/* Подписи */}
          <div className="mt-6 grid sm:grid-cols-2 gap-x-16 gap-y-4 text-xs text-body">
            <div className="flex items-end gap-2">
              <span>Составил:</span>
              <span className="flex-1 border-b border-ink/50 h-4" />
              <span className="text-mut2">подпись / дата</span>
            </div>
            <div className="flex items-end gap-2">
              <span>Проверил:</span>
              <span className="flex-1 border-b border-ink/50 h-4" />
              <span className="text-mut2">подпись / дата</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
