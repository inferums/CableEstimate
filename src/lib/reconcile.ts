import type { ProjectState, VorRow } from "./types";
import type { SmetaPosition } from "./smeta-import";
import { normUnit, suggestMatch } from "./smeta-import";
import { progressReport, rowKey } from "./progress";

/*
 * Сверка ведомости со сметой.
 *
 * Смета и ВОР описывают одни и те же работы разными словами: в смете —
 * расценки ГЭСН со своими единицами («1000 м3», «100 м»), в ведомости —
 * наименования работ. Поэтому связь между позициями хранится явно и
 * задаётся пользователем; подсказка по схожести наименований только
 * помогает, но ничего не решает за него.
 *
 * Когда единицы всё же разные (в смете «шт» лотков, в ведомости «м³»
 * бетона), к связи задаётся коэффициент: объём сметы, умноженный на него,
 * сравнивается с объёмом ведомости.
 */

export interface SmetaLink {
  /** Ключ позиции ведомости */
  key: string;
  /** Идентификатор позиции сметы */
  smetaId: string;
  /** Во сколько раз объём сметы отличается от объёма ведомости */
  factor: number;
}

export interface ProjectSmeta {
  fileName: string;
  importedAt: string;
  positions: SmetaPosition[];
  links: SmetaLink[];
}

export interface ReconcileRow {
  key: string;
  section: number;
  sectionTitle: string;
  name: string;
  unit: string;
  /** По проекту (ведомость) */
  plan: number;
  /** Принято по актам */
  done: number;
  /** Позиция сметы, если связь задана */
  smeta: SmetaPosition | null;
  /** Объём сметы, приведённый к единицам ведомости */
  smetaQty: number | null;
  /** Проект минус смета: положительное — работ больше, чем в смете */
  deltaPlan: number | null;
  /** Смета минус принято: сколько ещё можно закрыть по смете */
  remainingBySmeta: number | null;
  /** Принято больше, чем есть в смете */
  overSmeta: boolean;
  /** Единицы сметы и ведомости не совпадают */
  unitMismatch: boolean;
  /** Подсказка: похожая позиция сметы, связь не задана */
  suggestion: { position: SmetaPosition; score: number } | null;
}

export interface ReconcileReport {
  rows: ReconcileRow[];
  /** Позиции ведомости без связи со сметой */
  unlinked: number;
  /** Позиции сметы, ни с чем не связанные */
  unusedSmeta: SmetaPosition[];
  overruns: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function reconcile(state: ProjectState, planRows: VorRow[]): ReconcileReport {
  const smeta = state.smeta;
  const progress = progressReport(state, planRows);
  const byId = new Map((smeta?.positions ?? []).map((p) => [p.id, p]));
  const links = new Map((smeta?.links ?? []).map((l) => [l.key, l]));
  const used = new Set<string>();

  const rows: ReconcileRow[] = progress.rows.map((r) => {
    const link = links.get(r.key);
    const position = link ? byId.get(link.smetaId) ?? null : null;
    if (position) used.add(position.id);

    const factor = link && Number.isFinite(link.factor) && link.factor > 0 ? link.factor : 1;
    const smetaQty = position ? round3(position.qtyBase * factor) : null;

    return {
      key: r.key,
      section: r.section,
      sectionTitle: r.sectionTitle,
      name: r.name,
      unit: r.unit,
      plan: r.plan,
      done: r.done,
      smeta: position,
      smetaQty,
      deltaPlan: smetaQty === null ? null : round3(r.plan - smetaQty),
      remainingBySmeta: smetaQty === null ? null : round3(smetaQty - r.done),
      overSmeta: smetaQty !== null && r.done > smetaQty + 1e-6,
      unitMismatch: position !== null && position.baseUnit !== normUnit(r.unit),
      suggestion:
        position || !smeta ? null : suggestMatch(r.name, r.unit, smeta.positions),
    };
  });

  return {
    rows,
    unlinked: rows.filter((r) => r.smeta === null).length,
    unusedSmeta: (smeta?.positions ?? []).filter((p) => !used.has(p.id)),
    overruns: rows.filter((r) => r.overSmeta).length,
  };
}

/**
 * Расставляет связи по подсказкам там, где их ещё нет. Позиция сметы
 * занимается один раз: одну расценку нельзя закрыть дважды разными работами.
 */
export function autoLink(state: ProjectState, planRows: VorRow[]): SmetaLink[] {
  const smeta = state.smeta;
  if (!smeta) return [];

  const links = [...smeta.links];
  const taken = new Set(links.map((l) => l.smetaId));
  const linked = new Set(links.map((l) => l.key));

  /* Сначала самые уверенные совпадения — иначе слабое заняло бы позицию */
  const candidates = planRows
    .map((r) => ({ key: rowKey(r), row: r, match: suggestMatch(r.name, r.unit, smeta.positions) }))
    .filter((c) => c.match !== null && !linked.has(c.key))
    .sort((a, b) => b.match!.score - a.match!.score);

  for (const c of candidates) {
    const id = c.match!.position.id;
    if (taken.has(id)) continue;
    taken.add(id);
    links.push({ key: c.key, smetaId: id, factor: 1 });
  }

  return links;
}
