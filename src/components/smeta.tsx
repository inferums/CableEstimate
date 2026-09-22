import { useMemo, useRef, useState } from "react";
import type { ProjectState } from "../lib/types";
import type { VorResult } from "../lib/calc";
import { fmt } from "../lib/calc";
import { normUnit, parseSmetaFile, similarity, type SmetaPosition } from "../lib/smeta-import";
import { autoLink, reconcile, type ProjectSmeta, type SmetaLink } from "../lib/reconcile";
import { BtnGhost, BtnPrimary } from "./ui";

/* ================================================================
   Сверка ведомости с импортированной сметой

   Смета и ведомость называют одни и те же работы по-разному, поэтому
   связь между позициями задаёт пользователь. Подсказка по схожести
   наименований только предлагает вариант.
   ================================================================ */

const num = (n: number | null) => (n === null ? "—" : fmt(n));

export function SmetaPanel({
  state,
  vor,
  onChange,
}: {
  state: ProjectState;
  vor: VorResult;
  onChange: (smeta: ProjectSmeta | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "unlinked" | "diff">("all");
  const report = useMemo(() => reconcile(state, vor.rows), [state, vor.rows]);
  const smeta = state.smeta;

  const load = async (file: File) => {
    setLoading(true);
    try {
      const parsed = await parseSmetaFile(await file.arrayBuffer(), file.name);
      if (parsed.positions.length === 0) {
        alert(parsed.warnings.join("\n") || "В файле не найдено позиций сметы");
        return;
      }
      onChange({
        fileName: parsed.fileName,
        importedAt: parsed.importedAt,
        positions: parsed.positions,
        /* Связи прежней сметы не переносим: позиции могли смениться */
        links: [],
      });
      if (parsed.warnings.length > 0) alert(parsed.warnings.join("\n"));
    } catch (err) {
      alert(`Не удалось прочитать смету: ${(err as Error).message}`);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const setLinks = (links: SmetaLink[]) => smeta && onChange({ ...smeta, links });

  const link = (key: string, smetaId: string) => {
    if (!smeta) return;
    const rest = smeta.links.filter((l) => l.key !== key);
    setLinks(smetaId ? [...rest, { key, smetaId, factor: 1 }] : rest);
  };

  const setFactor = (key: string, factor: number) => {
    if (!smeta) return;
    setLinks(smeta.links.map((l) => (l.key === key ? { ...l, factor } : l)));
  };

  /*
   * Список выбора строится не из всей сметы: в ней бывает под тысячу
   * позиций, и выпадающий список на каждую строку превращает страницу в
   * десятки тысяч узлов. Показываем подходящие по единице измерения и самые
   * близкие по наименованию, плюс уже связанную позицию.
   */
  const OPTIONS_LIMIT = 50;
  const optionsFor = (name: string, unit: string, linkedId: string | null): SmetaPosition[] => {
    if (!smeta) return [];
    const base = normUnit(unit);
    const fit = smeta.positions
      .filter((p) => p.baseUnit === base)
      .map((p) => ({ p, score: similarity(name, p.name) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, OPTIONS_LIMIT)
      .map((x) => x.p);
    const linked = linkedId ? smeta.positions.find((p) => p.id === linkedId) : null;
    return linked && !fit.some((p) => p.id === linked.id) ? [linked, ...fit] : fit;
  };

  const rows = report.rows.filter((r) => {
    if (filter === "unlinked") return r.smeta === null;
    if (filter === "diff") return r.overSmeta || (r.deltaPlan !== null && Math.abs(r.deltaPlan) > 0.01);
    return true;
  });

  if (!smeta) {
    return (
      <div className="border border-dashed border-line2 rounded-lg p-6 text-center">
        <p className="text-sm text-mut mb-3">
          Смета не загружена. Импортируйте выгрузку локальных смет в Excel — приложение возьмёт из неё
          позиции, единицы и объёмы и сверит их с ведомостью.
        </p>
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); }} />
        <BtnPrimary onClick={() => fileRef.current?.click()} disabled={loading}>
          {loading ? "Чтение…" : "Загрузить смету"}
        </BtnPrimary>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-body">
          <span className="font-mono text-accent-deep">{smeta.fileName}</span>
          <span className="text-mut2">
            {" · "}{smeta.positions.length} позиций · связано {smeta.links.length} · без связи {report.unlinked}
            {report.overruns > 0 && ` · перерасход по ${report.overruns}`}
          </span>
        </span>
        <div className="flex-1" />
        <input ref={fileRef} type="file" accept=".xlsx" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); }} />
        <BtnGhost onClick={() => setLinks(autoLink(state, vor.rows))}>Подобрать связи</BtnGhost>
        <BtnGhost onClick={() => fileRef.current?.click()}>Заменить файл</BtnGhost>
        <BtnGhost onClick={() => { if (confirm("Удалить смету и все связи?")) onChange(undefined); }}>
          Удалить
        </BtnGhost>
      </div>

      <div className="flex gap-2">
        {([["all", "все"], ["unlinked", "без связи"], ["diff", "расхождения"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`px-3 py-1 rounded-lg border text-xs ${
              filter === id ? "border-accent bg-accent-soft text-accent-deep font-semibold" : "border-line bg-surface text-mut"
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="border border-line rounded-lg overflow-auto max-h-[36rem]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-raise">
            <tr className="text-left border-b border-line">
              <th className="px-2 py-1.5 font-semibold">Позиция ведомости</th>
              <th className="px-2 py-1.5 w-16 font-semibold">Ед.</th>
              <th className="px-2 py-1.5 w-20 text-right font-semibold">Проект</th>
              <th className="px-2 py-1.5 w-20 text-right font-semibold">Принято</th>
              <th className="px-2 py-1.5 w-64 font-semibold">Позиция сметы</th>
              <th className="px-2 py-1.5 w-16 text-right font-semibold">Коэф.</th>
              <th className="px-2 py-1.5 w-20 text-right font-semibold">По смете</th>
              <th className="px-2 py-1.5 w-20 text-right font-semibold">Остаток</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const linkFactor = smeta.links.find((l) => l.key === r.key)?.factor ?? 1;
              return (
                <tr key={r.key} className={`border-b border-line/60 ${r.overSmeta ? "bg-danger-soft" : ""}`}>
                  <td className="px-2 py-1 text-body">{r.name}</td>
                  <td className="px-2 py-1 font-mono text-mut">{r.unit}</td>
                  <td className="px-2 py-1 text-right font-mono text-mut">{r.plan ? fmt(r.plan) : "—"}</td>
                  <td className="px-2 py-1 text-right font-mono text-ink">{r.done ? fmt(r.done) : ""}</td>
                  <td className="px-2 py-1">
                    <select
                      value={r.smeta?.id ?? ""}
                      onChange={(e) => link(r.key, e.target.value)}
                      className={`w-full bg-surface border rounded px-1.5 py-1 text-[11px] outline-none focus:border-accent ${
                        r.unitMismatch ? "border-warn" : "border-line"
                      }`}
                    >
                      <option value="">
                        {r.suggestion
                          ? `— не связано (похоже: ${r.suggestion.position.name.slice(0, 40)})`
                          : "— не связано"}
                      </option>
                      {optionsFor(r.name, r.unit, r.smeta?.id ?? null).map((p: SmetaPosition) => (
                        <option key={p.id} value={p.id}>
                          {p.sheet} №{p.no} · {p.name.slice(0, 60)} · {p.qty} {p.unit}
                        </option>
                      ))}
                    </select>
                    {!r.smeta && optionsFor(r.name, r.unit, null).length === 0 && (
                      <span className="text-[10px] text-mut2">
                        в смете нет позиций в «{r.unit}»
                      </span>
                    )}
                    {r.unitMismatch && (
                      <span className="text-[10px] text-warn">
                        единицы разные: в смете {r.smeta?.unit} — задайте коэффициент
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1">
                    {r.smeta && (
                      <input
                        type="number"
                        step="0.01"
                        value={linkFactor}
                        onChange={(e) => setFactor(r.key, Number(e.target.value) || 1)}
                        className="w-14 bg-surface border border-line rounded px-1 py-0.5 font-mono text-[11px] text-right outline-none focus:border-accent"
                      />
                    )}
                  </td>
                  <td className="px-2 py-1 text-right font-mono text-mut">{num(r.smetaQty)}</td>
                  <td className={`px-2 py-1 text-right font-mono ${r.overSmeta ? "text-danger font-bold" : "text-accent-deep"}`}>
                    {num(r.remainingBySmeta)}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-2 py-6 text-center text-mut2">Нет строк по этому фильтру</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {report.unusedSmeta.length > 0 && (
        <details className="border border-line rounded-lg px-3 py-2">
          <summary className="text-[11px] font-semibold uppercase tracking-wider text-mut cursor-pointer">
            Позиции сметы без связи — {report.unusedSmeta.length}
          </summary>
          <div className="mt-2 max-h-56 overflow-auto">
            {report.unusedSmeta.map((p) => (
              <div key={p.id} className="text-[11px] text-mut py-0.5 border-b border-line/50">
                <span className="font-mono text-mut2">{p.sheet} №{p.no}</span> {p.name}
                <span className="font-mono text-mut2"> · {p.qty} {p.unit}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
