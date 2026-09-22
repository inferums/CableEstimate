import { useMemo, useState } from "react";
import type { Act, ActScope, ProjectState, VorSectionId } from "../lib/types";
import { VOR_SECTIONS } from "../lib/types";
import type { VorResult } from "../lib/calc";
import { fmt, segLabel } from "../lib/calc";
import {
  ALL_SECTIONS,
  actItems,
  actSummary,
  coverage,
  newActId,
  progressReport,
  remainingLength,
} from "../lib/progress";
import { BtnGhost, BtnPrimary, Modal, NumInput } from "./ui";

/* ================================================================
   Закрытие объёмов и накопительная ведомость

   Работы сдаются частями: сначала переход ГНБ, потом траншея с
   прокладкой одной строительной длины. Поэтому акт закрывает часть
   трассы (участки и метры внутри них) в части разделов ведомости.
   ================================================================ */

const today = () => new Date().toISOString().slice(0, 10);
const ruDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
};

/* ================= форма закрытия ================= */

function ActEditor({
  state,
  act,
  onSave,
  onClose,
}: {
  state: ProjectState;
  act: Act | null;
  onSave: (a: Act) => void;
  onClose: () => void;
}) {
  const editing = act !== null;
  const [number, setNumber] = useState(act?.number ?? String((state.acts?.length ?? 0) + 1));
  const [date, setDate] = useState(act?.date ?? today());
  const [title, setTitle] = useState(act?.title ?? "");
  const [sections, setSections] = useState<VorSectionId[]>(act?.sections ?? ALL_SECTIONS);
  const [lineWorks, setLineWorks] = useState(act?.lineWorks ?? false);
  const [scope, setScope] = useState<Record<string, number | null>>(() => {
    const init: Record<string, number | null> = {};
    for (const sc of act?.scope ?? []) init[sc.segmentId] = sc.length;
    return init;
  });
  /* Правка объёмов вручную: ключ позиции → принятый объём */
  const [edited, setEdited] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const i of act?.items ?? []) if (i.qty !== i.calcQty) init[i.key] = i.qty;
    return init;
  });

  /* При правке акта его собственные метры не должны считаться занятыми */
  const stateForRemains = useMemo(
    () => (editing ? { ...state, acts: (state.acts ?? []).filter((a) => a.id !== act.id) } : state),
    [state, act, editing],
  );

  const chosen: ActScope[] = Object.entries(scope)
    .filter(([, len]) => len !== null && len > 0)
    .map(([segmentId, len]) => ({ segmentId, length: len as number }));

  const items = useMemo(
    () => actItems(state, { scope: chosen, sections, lineWorks }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, JSON.stringify(chosen), JSON.stringify(sections), lineWorks],
  );

  const toggleSection = (id: VorSectionId) =>
    setSections((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id].sort()));

  const toggleSegment = (id: string, remains: number) =>
    setScope((prev) => ({ ...prev, [id]: prev[id] == null ? remains : null }));

  const save = () => {
    onSave({
      id: act?.id ?? newActId(),
      number: number.trim() || "б/н",
      date,
      title: title.trim(),
      scope: chosen,
      sections,
      lineWorks,
      items: items.map((i) => ({ ...i, qty: edited[i.key] ?? i.calcQty })),
    });
  };

  return (
    <Modal
      title={editing ? `Акт № ${act.number}` : "Закрытие объёмов"}
      sub="Выберите участки, метры и виды работ. Объёмы посчитаются сами, их можно поправить по факту."
      onClose={onClose}
      wide
      footer={
        <>
          <BtnGhost onClick={onClose}>Отмена</BtnGhost>
          <BtnPrimary onClick={save} disabled={items.length === 0}>
            {editing ? "Сохранить" : `Закрыть ${items.length} позиций`}
          </BtnPrimary>
        </>
      }
    >
      <div className="grid sm:grid-cols-[repeat(3,minmax(0,1fr))] gap-3">
        <label className="block">
          <span className="block mb-1 text-[10px] font-semibold uppercase tracking-wider text-mut">Номер акта</span>
          <input value={number} onChange={(e) => setNumber(e.target.value)}
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 font-mono text-sm outline-none focus:border-accent" />
        </label>
        <label className="block">
          <span className="block mb-1 text-[10px] font-semibold uppercase tracking-wider text-mut">Дата</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 font-mono text-sm outline-none focus:border-accent" />
        </label>
        <label className="block">
          <span className="block mb-1 text-[10px] font-semibold uppercase tracking-wider text-mut">Примечание</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: 1-я строительная длина"
            className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-mut2" />
        </label>
      </div>

      <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-mut">Какие работы закрываются</p>
      <div className="flex flex-wrap gap-2">
        {VOR_SECTIONS.map((s) => (
          <button key={s.id} onClick={() => toggleSection(s.id)}
            className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
              sections.includes(s.id)
                ? "border-accent bg-accent-soft text-accent-deep font-semibold"
                : "border-line bg-surface text-mut hover:border-line2"
            }`}>
            {s.id}. {s.title}
          </button>
        ))}
        <button onClick={() => setLineWorks((v) => !v)}
          className={`px-3 py-1.5 rounded-lg border text-xs transition-colors ${
            lineWorks ? "border-accent bg-accent-soft text-accent-deep font-semibold" : "border-line bg-surface text-mut hover:border-line2"
          }`}>
          + работы по линии целиком
        </button>
      </div>

      <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-mut">
        Участки и закрываемая длина
      </p>
      <div className="border border-line rounded-lg divide-y divide-line max-h-64 overflow-auto">
        {state.segments.map((seg) => {
          const remains = Math.round(remainingLength(stateForRemains, seg.id, sections) * 100) / 100;
          const picked = scope[seg.id] != null;
          const done = remains <= 0;
          return (
            <div key={seg.id} className={`flex items-center gap-3 px-3 py-2 ${picked ? "bg-accent-soft/40" : ""}`}>
              <input type="checkbox" checked={picked} onChange={() => toggleSegment(seg.id, remains || seg.length)}
                className="accent-[var(--color-accent)]" />
              <span className="font-mono text-xs w-24 shrink-0 text-ink">{segLabel(seg)}</span>
              <span className="text-[11px] text-mut flex-1 truncate">
                {seg.length} м · осталось закрыть {remains} м
                {done && <span className="ml-1 text-ok">· закрыт</span>}
              </span>
              {picked && (
                <div className="w-32 shrink-0">
                  <NumInput value={scope[seg.id] ?? 0}
                    onChange={(n) => setScope((prev) => ({ ...prev, [seg.id]: Math.max(0, n) }))}
                    step={1} min={0} suffix="м" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {chosen.some((sc) => {
        const rem = remainingLength(stateForRemains, sc.segmentId, sections);
        return sc.length > rem + 1e-6;
      }) && (
        <p className="mt-2 text-[11px] text-warn">
          По некоторым участкам закрывается больше, чем осталось. Это допустимо, но попадёт в перерасход.
        </p>
      )}

      <p className="mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-mut">
        Объёмы к закрытию · {items.length} позиций
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-mut2 py-4 text-center border border-dashed border-line2 rounded-lg">
          Выберите участки и разделы
        </p>
      ) : (
        <div className="border border-line rounded-lg max-h-72 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-raise">
              <tr className="text-left border-b border-line">
                <th className="px-2 py-1.5 font-semibold">Наименование</th>
                <th className="px-2 py-1.5 w-14 font-semibold">Ед.</th>
                <th className="px-2 py-1.5 w-24 text-right font-semibold">Расчёт</th>
                <th className="px-2 py-1.5 w-28 text-right font-semibold">Принято</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.key} className="border-b border-line/60">
                  <td className="px-2 py-1 text-body">{i.name}</td>
                  <td className="px-2 py-1 font-mono text-mut">{i.unit}</td>
                  <td className="px-2 py-1 text-right font-mono text-mut">{fmt(i.calcQty)}</td>
                  <td className="px-2 py-1">
                    <NumInput value={edited[i.key] ?? i.calcQty}
                      onChange={(n) => setEdited((prev) => ({ ...prev, [i.key]: Math.max(0, n) }))}
                      step={0.1} min={0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ================= накопительная ведомость ================= */

export function ProgressPanel({
  state,
  vor,
  onChange,
}: {
  state: ProjectState;
  vor: VorResult;
  onChange: (acts: Act[]) => void;
}) {
  const [editor, setEditor] = useState<{ act: Act | null } | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const acts = state.acts ?? [];
  const report = useMemo(() => progressReport(state, vor.rows), [state, vor.rows]);
  const cov = useMemo(() => coverage(state), [state]);

  const saveAct = (a: Act) => {
    const rest = acts.filter((x) => x.id !== a.id);
    onChange([...rest, a]);
    setEditor(null);
  };
  const removeAct = (id: string) => {
    if (!confirm("Удалить акт? Закрытые им объёмы вернутся в остаток.")) return;
    onChange(acts.filter((a) => a.id !== id));
  };

  const rows = onlyOpen ? report.rows.filter((r) => r.remaining > 0 || r.over || r.orphan) : report.rows;
  const closedLength = cov.reduce((s, c) => s + Math.min(c.length, c.maxClosed), 0);
  const totalLength = cov.reduce((s, c) => s + c.length, 0);

  return (
    <div className="space-y-4">
      {/* Сводка */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Актов", String(acts.length)],
          ["Закрыто трассы", `${fmt(closedLength, 0)} из ${fmt(totalLength, 0)} м`],
          ["Позиций закрыто", `${Math.round(report.donePositions * 100)}%`],
          ["Перерасход", String(report.overruns)],
        ].map(([label, value]) => (
          <div key={label} className="border border-line rounded-lg bg-surface px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-mut">{label}</div>
            <div className="font-mono text-lg font-bold text-accent-deep">{value}</div>
          </div>
        ))}
      </div>

      {report.orphans > 0 && (
        <div className="border border-warn/40 bg-warn-soft rounded-lg px-3 py-2 text-[12px] text-warn">
          {report.orphans} закрытых позиций больше нет в ведомости — проект изменился после их принятия.
          Объёмы сохранены и показаны ниже с пометкой «нет в проекте».
        </div>
      )}

      {/* Акты */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-mut">Акты закрытия</span>
        <BtnPrimary onClick={() => setEditor({ act: null })} disabled={state.segments.length === 0}>
          Закрыть объёмы
        </BtnPrimary>
      </div>

      {acts.length === 0 ? (
        <p className="text-sm text-mut2 py-6 text-center border border-dashed border-line2 rounded-lg">
          Ничего не закрыто. Нажмите «Закрыть объёмы» — например, только переход ГНБ.
        </p>
      ) : (
        <div className="border border-line rounded-lg divide-y divide-line">
          {report.acts.map((a) => {
            const s = actSummary(state, a);
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="font-mono text-sm font-bold text-accent-deep w-16 shrink-0">№ {a.number}</span>
                <span className="font-mono text-xs text-mut w-24 shrink-0">{ruDate(a.date)}</span>
                <span className="text-xs text-body flex-1 min-w-40">
                  {a.title || s.segments.map((seg) => segLabel(seg)).join(", ") || "—"}
                  <span className="text-mut2">
                    {" · "}{fmt(s.length, 0)} м · {s.positions} поз. · разделы {a.sections.join(", ")}
                    {a.lineWorks && " + линия"}
                    {s.missingSegments > 0 && ` · ${s.missingSegments} участк(ов) удалено из проекта`}
                  </span>
                </span>
                <BtnGhost onClick={() => setEditor({ act: a })}>Править</BtnGhost>
                <BtnGhost onClick={() => removeAct(a.id)}>Удалить</BtnGhost>
              </div>
            );
          })}
        </div>
      )}

      {/* Схема выполнения: что закрыто на каждом участке */}
      {acts.length > 0 && (
        <>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-mut">Схема выполнения</span>
          <div className="border border-line rounded-lg overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-raise">
                <tr className="text-left border-b border-line">
                  <th className="px-2 py-1.5 font-semibold">Участок</th>
                  <th className="px-2 py-1.5 w-20 text-right font-semibold">Длина</th>
                  {VOR_SECTIONS.map((sec) => (
                    <th key={sec.id} className="px-2 py-1.5 w-28 text-right font-semibold" title={sec.title}>
                      {sec.id}. {sec.title.split(" ")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.segments.map((seg, i) => {
                  const c = cov[i];
                  return (
                    <tr key={seg.id} className="border-b border-line/60">
                      <td className="px-2 py-1 font-mono text-ink">{segLabel(seg)}</td>
                      <td className="px-2 py-1 text-right font-mono text-mut">{fmt(c.length, 0)}</td>
                      {VOR_SECTIONS.map((sec) => {
                        const closed = Math.min(c.closed[sec.id], c.length);
                        const pct = c.length > 0 ? closed / c.length : 0;
                        return (
                          <td key={sec.id} className="px-2 py-1">
                            <div className="flex items-center gap-1.5 justify-end">
                              <div className="h-1.5 w-12 rounded-full bg-well overflow-hidden">
                                <div className="h-full bg-accent" style={{ width: `${Math.round(pct * 100)}%` }} />
                              </div>
                              <span className={`font-mono text-[10px] ${pct >= 1 ? "text-ok" : "text-mut2"}`}>
                                {Math.round(pct * 100)}%
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Накопительная ведомость */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-mut">Накопительная ведомость</span>
        <label className="flex items-center gap-2 text-[11px] text-mut">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)}
            className="accent-[var(--color-accent)]" />
          только незакрытое и перерасход
        </label>
      </div>

      <div className="border border-line rounded-lg overflow-auto max-h-[32rem]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-raise">
            <tr className="text-left border-b border-line">
              <th className="px-2 py-1.5 font-semibold">Наименование</th>
              <th className="px-2 py-1.5 w-12 font-semibold">Ед.</th>
              <th className="px-2 py-1.5 w-20 text-right font-semibold">Проект</th>
              {report.acts.map((a) => (
                <th key={a.id} className="px-2 py-1.5 w-20 text-right font-mono font-semibold">№ {a.number}</th>
              ))}
              <th className="px-2 py-1.5 w-20 text-right font-semibold">Всего</th>
              <th className="px-2 py-1.5 w-20 text-right font-semibold">Остаток</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={`border-b border-line/60 ${r.orphan ? "bg-warn-soft/60" : ""}`}>
                <td className="px-2 py-1 text-body">
                  {r.name}
                  {r.orphan && <span className="ml-1 text-[10px] text-warn">нет в проекте</span>}
                </td>
                <td className="px-2 py-1 font-mono text-mut">{r.unit}</td>
                <td className="px-2 py-1 text-right font-mono text-mut">{r.plan ? fmt(r.plan) : "—"}</td>
                {r.byAct.map((q, i) => (
                  <td key={i} className="px-2 py-1 text-right font-mono text-mut2">{q ? fmt(q) : ""}</td>
                ))}
                <td className={`px-2 py-1 text-right font-mono font-bold ${r.over ? "text-danger" : "text-ink"}`}>
                  {r.done ? fmt(r.done) : ""}
                </td>
                <td className={`px-2 py-1 text-right font-mono ${r.remaining > 0 ? "text-accent-deep" : "text-ok"}`}>
                  {r.remaining > 0 ? fmt(r.remaining) : "0"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5 + report.acts.length} className="px-2 py-6 text-center text-mut2">
                  Всё закрыто
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editor && (
        <ActEditor state={state} act={editor.act} onSave={saveAct} onClose={() => setEditor(null)} />
      )}
    </div>
  );
}
