import { buildVor, LINE_SUBSECTION } from "./calc";
import { VOR_SECTIONS, sectionTitle } from "./types";
import type {
  Act,
  ActItem,
  ActScope,
  ProjectState,
  Segment,
  VorRow,
  VorSectionId,
} from "./types";

/*
 * Накопительный учёт выполненных работ.
 *
 * Работы закрываются не всей линией сразу: сначала, например, только ГНБ,
 * потом траншея с прокладкой одной строительной длины. Поэтому единица
 * закрытия — это часть трассы (участки и метры внутри них) в сочетании с
 * частью разделов ведомости.
 *
 * Главное требование: принятые объёмы не должны теряться. Поэтому акт хранит
 * объёмы замороженными, вместе с наименованием и единицей, и не
 * пересчитывается при правке проекта. Если позиция потом исчезла из
 * ведомости, она всё равно попадёт в накопительную ведомость — с пометкой,
 * что в проекте её больше нет.
 */

/** Ключ позиции ведомости, устойчивый между пересчётами */
export const rowKey = (r: { section: number; subSection: string; name: string; unit: string }) =>
  `${r.section}|${r.subSection}|${r.name}|${r.unit}`;

export const ALL_SECTIONS: VorSectionId[] = VOR_SECTIONS.map((s) => s.id);

/** Длина участка, доступная для закрытия */
const segLength = (seg: Segment) => Math.max(0, seg.length || 0);

/**
 * Участок, урезанный до закрываемой длины. Наклонная длина и проектные
 * величины масштабируются пропорционально: акт закрывает часть той же работы.
 */
function cutSegment(seg: Segment, length: number): Segment {
  const full = segLength(seg);
  const k = full > 0 ? Math.min(1, Math.max(0, length / full)) : 0;
  return {
    ...seg,
    length: Math.max(0, length),
    slopeLength: seg.slopeLength !== undefined ? seg.slopeLength * k : undefined,
  };
}

export interface ActDraft {
  scope: ActScope[];
  sections: VorSectionId[];
  lineWorks: boolean;
}

/**
 * Позиции, которые закрывает акт: ведомость пересчитывается по урезанным
 * участкам, из неё берутся только выбранные разделы.
 *
 * Работы по линии целиком (концевые муфты) к участкам не привязаны, поэтому
 * включаются только явно — иначе они попадали бы в каждый акт.
 */
export function actItems(state: ProjectState, draft: ActDraft): ActItem[] {
  const byId = new Map(state.segments.map((s) => [s.id, s]));
  const segments = draft.scope
    .map((sc) => {
      const seg = byId.get(sc.segmentId);
      return seg ? cutSegment(seg, sc.length) : null;
    })
    .filter((s): s is Segment => s !== null && s.length > 0);

  if (segments.length === 0) return [];

  const vor = buildVor({ ...state, segments });
  const sections = new Set(draft.sections);

  return vor.rows
    .filter((r) => sections.has(r.section))
    .filter((r) => draft.lineWorks || r.subSection !== LINE_SUBSECTION)
    .map((r) => ({
      key: rowKey(r),
      section: r.section,
      subSection: r.subSection,
      name: r.name,
      unit: r.unit,
      qty: r.qty,
      calcQty: r.qty,
    }));
}

/** Закрытая длина каждого участка по разделам ведомости */
export interface SegmentCoverage {
  segmentId: string;
  length: number;
  /** Закрытая длина по каждому разделу, м */
  closed: Record<number, number>;
  /** Наибольшая закрытая длина среди разделов */
  maxClosed: number;
}

export function coverage(state: ProjectState): SegmentCoverage[] {
  const acts = state.acts ?? [];
  return state.segments.map((seg) => {
    const closed: Record<number, number> = {};
    for (const id of ALL_SECTIONS) closed[id] = 0;
    for (const act of acts) {
      const sc = act.scope.find((x) => x.segmentId === seg.id);
      if (!sc) continue;
      for (const id of act.sections) closed[id] += Math.max(0, sc.length);
    }
    return {
      segmentId: seg.id,
      length: segLength(seg),
      closed,
      maxClosed: Math.max(...ALL_SECTIONS.map((id) => closed[id])),
    };
  });
}

/** Сколько метров участка ещё не закрыто по выбранным разделам */
export function remainingLength(state: ProjectState, segmentId: string, sections: VorSectionId[]): number {
  const seg = state.segments.find((s) => s.id === segmentId);
  if (!seg) return 0;
  const cov = coverage(state).find((c) => c.segmentId === segmentId);
  if (!cov || sections.length === 0) return segLength(seg);
  /* Ограничивает самый «продвинутый» из выбранных разделов */
  const closed = Math.max(...sections.map((id) => cov.closed[id] ?? 0));
  return Math.max(0, segLength(seg) - closed);
}

export interface ProgressRow {
  key: string;
  section: VorSectionId;
  sectionTitle: string;
  subSection: string;
  name: string;
  unit: string;
  /** Объём по проекту; 0 — позиции в текущей ведомости нет */
  plan: number;
  /** Принято по каждому акту, в порядке актов */
  byAct: number[];
  done: number;
  remaining: number;
  /** Принято больше, чем по проекту */
  over: boolean;
  /** Позиция закрыта, но в текущей ведомости её нет */
  orphan: boolean;
}

export interface ProgressReport {
  acts: Act[];
  rows: ProgressRow[];
  /** Доля выполнения по количеству позиций, 0…1 */
  donePositions: number;
  orphans: number;
  overruns: number;
}

/**
 * Накопительная ведомость: проект, выполнение по каждому акту, итог и остаток.
 * Строки, закрытые актами, но отсутствующие в проекте, не выбрасываются.
 */
export function progressReport(state: ProjectState, planRows: VorRow[]): ProgressReport {
  const acts = [...(state.acts ?? [])].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number, "ru"));

  const rows = new Map<string, ProgressRow>();
  for (const r of planRows) {
    rows.set(rowKey(r), {
      key: rowKey(r),
      section: r.section,
      sectionTitle: r.sectionTitle,
      subSection: r.subSection,
      name: r.name,
      unit: r.unit,
      plan: r.qty,
      byAct: acts.map(() => 0),
      done: 0,
      remaining: r.qty,
      over: false,
      orphan: false,
    });
  }

  acts.forEach((act, i) => {
    for (const item of act.items) {
      let row = rows.get(item.key);
      if (!row) {
        /* Позиции нет в проекте — сохраняем её как есть, объём не теряем */
        row = {
          key: item.key,
          section: item.section,
          sectionTitle: sectionTitle(item.section),
          subSection: item.subSection,
          name: item.name,
          unit: item.unit,
          plan: 0,
          byAct: acts.map(() => 0),
          done: 0,
          remaining: 0,
          over: false,
          orphan: true,
        };
        rows.set(item.key, row);
      }
      row.byAct[i] += item.qty;
      row.done += item.qty;
    }
  });

  const list = [...rows.values()];
  for (const r of list) {
    r.done = Math.round(r.done * 1000) / 1000;
    r.remaining = Math.round(Math.max(0, r.plan - r.done) * 1000) / 1000;
    r.over = r.done > r.plan + 1e-6;
  }

  list.sort((a, b) =>
    a.section - b.section ||
    a.subSection.localeCompare(b.subSection, "ru") ||
    a.name.localeCompare(b.name, "ru"));

  const planned = list.filter((r) => !r.orphan);
  return {
    acts,
    rows: list,
    donePositions: planned.length === 0 ? 0 : planned.filter((r) => r.done >= r.plan - 1e-6).length / planned.length,
    orphans: list.filter((r) => r.orphan).length,
    overruns: list.filter((r) => r.over).length,
  };
}

/** Короткая сводка акта для списка */
export function actSummary(state: ProjectState, act: Act) {
  const byId = new Map(state.segments.map((s) => [s.id, s]));
  const length = act.scope.reduce((s, sc) => s + Math.max(0, sc.length), 0);
  const segments = act.scope
    .map((sc) => byId.get(sc.segmentId))
    .filter((s): s is Segment => !!s);
  return {
    length: Math.round(length * 100) / 100,
    positions: act.items.length,
    /* Участок мог быть удалён из проекта — акт от этого не портится */
    missingSegments: act.scope.length - segments.length,
    segments,
  };
}

export const newActId = () => `act${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
