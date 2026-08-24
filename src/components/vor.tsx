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
    <Panel className="flex flex-col max-h-[calc(100vh-6.5rem)] sticky top-[5.5rem] overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center justify-between bg-raise">
        <div>
          <h3 className="font-display font-semibold text-[15px] text-ink">ВОР · предпросмотр</h3>
          <p className="text-[11px] text-mut mt-0.5">пересчет при каждом изменении</p>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-ok bg-ok-soft border border-ok/20 rounded-full px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-ok pulse-dot" />
          live
        </span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-line border-b border-line bg-surface">
        {[
          { l: "Траншея", v: vor.totals.length, d: 0, u: "м" },
          { l: "Земля", v: vor.totals.earth, d: 1, u: "м³" },
          { l: "Кабель", v: vor.totals.cable, d: 0, u: "м" },
        ].map((s) => (
          <div key={s.l} className="px-3.5 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-mut">{s.l}</div>
            <div className="font-mono text-lg font-bold text-accent-deep leading-tight mt-0.5">
              <FlashValue value={s.v} decimals={s.d} />
              <span className="text-[10px] font-semibold text-mut2 ml-1">{s.u}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 bg-surface">
        {empty && (
          <div className="py-10 text-center">
            <svg viewBox="0 0 32 32" fill="none" className="w-12 h-12 mx-auto mb-3 text-line2">
              <path d="M2 11h28M8 11v12h16V11" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 17h8" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.5 2.5" />
            </svg>
            <p className="text-sm font-semibold text-body">Ведомость пуста</p>
            <p className="text-xs text-mut mt-1">
              Задайте параметры траншей и добавьте участки в разделе 04
            </p>
          </div>
        )}
        {VOR_SECTIONS.map((sec) => {
          const rows = vor.rows.filter((r) => r.section === sec.id);
          if (!rows.length) return null;
          return (
            <div key={sec.id}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-[10px] font-bold text-white bg-accent rounded px-1.5 py-px">
                  {sec.id}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-mut">
                  {sec.title}
                </span>
              </div>
              <ul className="space-y-0.5">
                {rows.map((r) => (
                  <li
                    key={r.name}
                    className="group flex items-baseline justify-between gap-2 py-1.5 px-2 -mx-2 rounded-md border-l-2 border-transparent hover:border-accent hover:bg-accent-soft/60 transition-colors"
                    title={`уч. ${r.segments.join(", ")}`}
                  >
                    <span className="text-xs leading-snug text-body group-hover:text-ink transition-colors min-w-0">
                      {r.name}
                    </span>
                    <span className="shrink-0 font-mono text-xs font-bold text-ink whitespace-nowrap">
                      {fmt(r.qty)} <span className="text-mut2 font-medium text-[10px]">{r.unit}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line p-4 space-y-2 bg-raise">
        <div className="flex items-center justify-between text-[10px] font-mono font-semibold uppercase tracking-wider text-mut2">
          <span>{vor.totals.rows} позиций</span>
          <span>{vor.totals.activeSegments} уч. в расчете</span>
        </div>
        <BtnPrimary onClick={onExport} disabled={empty} className="w-full h-11">
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
    <div className="print-sheet bg-surface text-ink border border-line rounded-xl shadow-card">
      <div className="p-2 sm:p-3">
        <div className="border-2 border-ink/80 p-4 sm:p-7 relative rounded-sm">
          <div className="absolute top-1.5 left-1.5 w-3 h-3 border-l border-t border-ink/30" />
          <div className="absolute bottom-1.5 right-1.5 w-3 h-3 border-r border-b border-ink/30" />

          <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink/80 pb-3">
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-mut">
                {state.projectCode ? `Шифр ${state.projectCode} · ` : ""}Кабельная линия {v.label}
              </div>
              <h3 className="font-display font-bold text-lg sm:text-2xl leading-tight mt-1 text-ink">
                Ведомость объемов выполненных работ
              </h3>
            </div>
            <div className="font-mono text-[10px] font-medium uppercase tracking-wider text-right text-mut leading-relaxed">
              Лист: 1 · Формат: А4
              <br />
              Стадия: Р
            </div>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 py-3 border-b border-line font-mono text-xs">
            <div>
              <dt className="text-mut2 text-[10px] font-semibold uppercase tracking-wider">Объект</dt>
              <dd className="font-bold text-ink">{state.projectName || "—"}</dd>
            </div>
            <div>
              <dt className="text-mut2 text-[10px] font-semibold uppercase tracking-wider">Тип объекта</dt>
              <dd className="font-bold text-ink">{v.label}</dd>
            </div>
            <div>
              <dt className="text-mut2 text-[10px] font-semibold uppercase tracking-wider">Цепей в траншее</dt>
              <dd className="font-bold text-ink">{state.chains}</dd>
            </div>
            <div>
              <dt className="text-mut2 text-[10px] font-semibold uppercase tracking-wider">Способы прокладки</dt>
              <dd className="font-bold text-ink">
                {state.types.map((t) => TRENCH_META[t].letter).join(", ") || "—"}
              </dd>
            </div>
          </dl>

          <table className="w-full text-xs sm:text-[13px] mt-2">
            <thead>
              <tr className="border-b-2 border-ink/80 text-left">
                <th className="py-2 pr-2 w-10 font-mono font-bold">№</th>
                <th className="py-2 pr-2 font-bold">Наименование работ и затрат</th>
                <th className="py-2 pr-2 w-14 font-mono font-bold">Ед.</th>
                <th className="py-2 pr-3 w-20 text-right font-mono font-bold">Кол-во</th>
                <th className="py-2 w-36 font-mono font-bold hidden md:table-cell">Примечание</th>
              </tr>
            </thead>
            <tbody>
              {vor.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-mut">
                    Нет данных — добавьте участки в разделе 04
                  </td>
                </tr>
              )}
              {VOR_SECTIONS.map((sec) => {
                const rows = vor.rows.filter((r) => r.section === sec.id);
                if (!rows.length) return null;
                return [
                  <tr key={`s${sec.id}`} className="border-t border-line">
                    <td colSpan={5} className="pt-3 pb-1 font-display font-semibold text-[12px] uppercase tracking-wide text-accent-deep">
                      Раздел {sec.id}. {sec.title}
                    </td>
                  </tr>,
                  ...rows.map((r) => {
                    n += 1;
                    return (
                      <tr key={r.name} className="border-t border-line/70 align-top hover:bg-accent-soft/40 transition-colors">
                        <td className="py-1.5 pr-2 font-mono text-mut">{n}</td>
                        <td className="py-1.5 pr-2 text-body">{r.name}</td>
                        <td className="py-1.5 pr-2 font-mono text-mut">{r.unit}</td>
                        <td className="py-1.5 pr-3 text-right font-mono font-bold text-ink">{fmt(r.qty)}</td>
                        <td className="py-1.5 font-mono text-[10px] text-mut hidden md:table-cell">
                          уч. {r.segments.join(", ")}
                        </td>
                      </tr>
                    );
                  }),
                ];
              })}
            </tbody>
          </table>

          <div className="mt-4 pt-3 border-t-2 border-ink/80 flex flex-wrap gap-x-8 gap-y-1 font-mono text-xs">
            <span className="text-body">
              Всего траншей: <b className="text-accent-deep">{fmt(vor.totals.length, 0)} м</b>
            </span>
            <span className="text-body">
              Земляные работы: <b className="text-accent-deep">{fmt(vor.totals.earth)} м³</b>
            </span>
            <span className="text-body">
              Кабель: <b className="text-accent-deep">{fmt(vor.totals.cable, 0)} м</b>
            </span>
          </div>

          <div className="mt-8 grid sm:grid-cols-2 gap-x-16 gap-y-4 text-xs text-body">
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
