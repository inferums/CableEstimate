import { TRENCH_META, VOLTAGE_META } from "../data/catalogs";
import { fmt, type VorResult } from "../lib/calc";
import { VOR_SECTIONS, type ProjectState } from "../lib/types";
import {
  BtnGhost,
  BtnPrimary,
  FlashValue,
  IconDownload,
  IconPrint,
  Panel,
} from "./ui";

/* ============ sticky live preview ============ */
export function VorPreview({
  state,
  vor,
  onExport,
  onPrint,
}: {
  state: ProjectState;
  vor: VorResult;
  onExport: () => void;
  onPrint: () => void;
}) {
  const empty = vor.rows.length === 0;
  return (
    <Panel className="flex flex-col max-h-[calc(100vh-6rem)] sticky top-6">
      <div className="px-4 py-3 border-b border-line flex items-center justify-between bg-raise/40">
        <div>
          <h3 className="font-display text-sm uppercase tracking-wide text-white">
            ВОР · предпросмотр
          </h3>
          <p className="text-[10px] text-mut2 mt-0.5">
            пересчитывается при каждом изменении
          </p>
        </div>
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-ok">
          <span className="w-2 h-2 rounded-full bg-ok pulse-dot" />
          live
        </span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
        {[
          { l: "Траншея", v: vor.totals.length, d: 0, u: "м" },
          { l: "Земля", v: vor.totals.earth, d: 1, u: "м³" },
          { l: "Кабель", v: vor.totals.cable, d: 0, u: "м" },
        ].map((s) => (
          <div key={s.l} className="px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-mut">{s.l}</div>
            <div className="font-mono text-base text-amber2 leading-tight">
              <FlashValue value={s.v} decimals={s.d} />
              <span className="text-[10px] text-mut2 ml-1">{s.u}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {empty && (
          <div className="py-8 text-center">
            <svg viewBox="0 0 32 32" fill="none" className="w-10 h-10 mx-auto mb-3 text-mut2">
              <path d="M2 11h28M8 11v12h16V11" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 17h8" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.5 2.5" />
            </svg>
            <p className="text-sm text-mut font-medium">Ведомость пуста</p>
            <p className="text-xs text-mut2 mt-1">
              Задайте параметры траншей и добавьте участки в разделе 04
            </p>
          </div>
        )}
        {VOR_SECTIONS.map((sec) => {
          const rows = vor.rows.filter((r) => r.section === sec.id);
          if (!rows.length) return null;
          return (
            <div key={sec.id}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-[10px] font-bold text-deep bg-amber w-4 h-4 flex items-center justify-center">
                  {sec.id}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan">
                  {sec.title}
                </span>
              </div>
              <ul className="space-y-1">
                {rows.map((r) => (
                  <li
                    key={r.name}
                    className="group flex items-baseline justify-between gap-2 py-1 px-1.5 -mx-1.5 border-l-2 border-transparent hover:border-amber/70 hover:bg-white/[0.03] transition-colors"
                    title={`уч. ${r.segments.join(", ")}`}
                  >
                    <span className="text-[11px] leading-snug text-mut group-hover:text-white transition-colors truncate">
                      {r.name}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-amber2 whitespace-nowrap">
                      {fmt(r.qty)} <span className="text-mut2 text-[10px]">{r.unit}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line p-3 space-y-2 bg-panel2/70">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-mut2">
          <span>{vor.totals.rows} позиций</span>
          <span>{vor.totals.activeSegments} уч. в расчете</span>
        </div>
        <BtnPrimary onClick={onExport} disabled={empty} className="w-full">
          <IconDownload /> Скачать ведомость в Excel
        </BtnPrimary>
        <BtnGhost onClick={onPrint} className="w-full">
          <IconPrint /> Печать
        </BtnGhost>
      </div>
    </Panel>
  );
}

/* ============ full paper sheet (print target) ============ */
export function VorSheet({ state, vor }: { state: ProjectState; vor: VorResult }) {
  const v = VOLTAGE_META[state.voltage];
  let n = 0;
  return (
    <div className="print-sheet bg-paper text-paperink shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]">
      {/* drawing-frame margin */}
      <div className="p-2 sm:p-3">
        <div className="border-2 border-paperink p-4 sm:p-6 relative">
          <div className="absolute top-1.5 left-1.5 w-3 h-3 border-l border-t border-paperink/50" />
          <div className="absolute bottom-1.5 right-1.5 w-3 h-3 border-r border-b border-paperink/50" />

          <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-paperink pb-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-paperink/60">
                {state.projectCode ? `Шифр ${state.projectCode} · ` : ""}Кабельная линия {v.label}
              </div>
              <h3 className="font-display text-lg sm:text-2xl uppercase leading-tight mt-1">
                Ведомость объемов выполненных работ
              </h3>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-right text-paperink/70 leading-relaxed">
              Лист: 1 · Формат: А4
              <br />
              Стадия: Р
            </div>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 py-3 border-b border-paperink/40 font-mono text-xs">
            <div>
              <dt className="text-paperink/55 text-[10px] uppercase tracking-wider">Объект</dt>
              <dd className="font-semibold">{state.projectName || "—"}</dd>
            </div>
            <div>
              <dt className="text-paperink/55 text-[10px] uppercase tracking-wider">Тип объекта</dt>
              <dd className="font-semibold">{v.label}</dd>
            </div>
            <div>
              <dt className="text-paperink/55 text-[10px] uppercase tracking-wider">Цепей в траншее</dt>
              <dd className="font-semibold">{state.chains}</dd>
            </div>
            <div>
              <dt className="text-paperink/55 text-[10px] uppercase tracking-wider">Способы прокладки</dt>
              <dd className="font-semibold">
                {state.types.map((t) => TRENCH_META[t].letter).join(", ") || "—"}
              </dd>
            </div>
          </dl>

          <table className="w-full text-xs sm:text-[13px] mt-2">
            <thead>
              <tr className="border-b-2 border-paperink text-left">
                <th className="py-1.5 pr-2 w-10 font-mono">№</th>
                <th className="py-1.5 pr-2 font-semibold">Наименование работ и затрат</th>
                <th className="py-1.5 pr-2 w-14 font-mono">Ед.</th>
                <th className="py-1.5 pr-3 w-20 text-right font-mono">Кол-во</th>
                <th className="py-1.5 w-36 font-mono hidden md:table-cell">Примечание</th>
              </tr>
            </thead>
            <tbody>
              {vor.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-paperink/50">
                    Нет данных — добавьте участки в разделе 04
                  </td>
                </tr>
              )}
              {VOR_SECTIONS.map((sec) => {
                const rows = vor.rows.filter((r) => r.section === sec.id);
                if (!rows.length) return null;
                return [
                  <tr key={`s${sec.id}`} className="border-t border-paperink/30">
                    <td colSpan={5} className="pt-2.5 pb-1 font-display text-[12px] uppercase tracking-wide">
                      Раздел {sec.id}. {sec.title}
                    </td>
                  </tr>,
                  ...rows.map((r) => {
                    n += 1;
                    return (
                      <tr key={r.name} className="border-t border-paperink/15 align-top">
                        <td className="py-1.5 pr-2 font-mono text-paperink/60">{n}</td>
                        <td className="py-1.5 pr-2">{r.name}</td>
                        <td className="py-1.5 pr-2 font-mono text-paperink/70">{r.unit}</td>
                        <td className="py-1.5 pr-3 text-right font-mono font-bold">{fmt(r.qty)}</td>
                        <td className="py-1.5 font-mono text-[10px] text-paperink/55 hidden md:table-cell">
                          уч. {r.segments.join(", ")}
                        </td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>

          <div className="mt-4 pt-3 border-t-2 border-paperink flex flex-wrap gap-x-8 gap-y-1 font-mono text-xs">
            <span>
              Всего траншей: <b>{fmt(vor.totals.length, 0)} м</b>
            </span>
            <span>
              Земляные работы: <b>{fmt(vor.totals.earth)} м³</b>
            </span>
            <span>
              Кабель: <b>{fmt(vor.totals.cable, 0)} м</b>
            </span>
          </div>

          <div className="mt-8 grid sm:grid-cols-2 gap-x-16 gap-y-4 text-xs">
            <div className="flex items-end gap-2">
              <span>Составил:</span>
              <span className="flex-1 border-b border-paperink/60 h-4" />
              <span className="text-paperink/50">подпись / дата</span>
            </div>
            <div className="flex items-end gap-2">
              <span>Проверил:</span>
              <span className="flex-1 border-b border-paperink/60 h-4" />
              <span className="text-paperink/50">подпись / дата</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
