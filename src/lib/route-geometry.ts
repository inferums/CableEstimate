import type { Segment } from "./types";

/*
 * Геометрия трассы для плана, продольного профиля и выгрузки в DXF.
 *
 * Раньше экран и DXF независимо рисовали «веер» из синтетических координат,
 * а профиль подставлял отметку 100 м там, где её не было. Теперь геометрия
 * считается в одном месте, и каждый потребитель знает, откуда она взялась:
 * из съёмки или условно — и может сказать об этом пользователю.
 *
 * Плановые координаты участка хранятся в геодезической системе (X — север,
 * Y — восток). Здесь они переводятся в «чертёжные»: e — восток (ось X
 * чертежа), n — север (ось Y чертежа).
 */

export interface PlanPoint {
  e: number;
  n: number;
}

export interface PlanLine {
  seg: Segment;
  a: PlanPoint;
  b: PlanPoint;
}

export interface PlanNode extends PlanPoint {
  label: string;
}

export interface PlanGeometry {
  lines: PlanLine[];
  nodes: PlanNode[];
  /** true — положение трассы взято из съёмки; false — условная схема в линию */
  surveyed: boolean;
  /** Участков без плановых координат */
  missing: number;
  /** Мест, где начало участка не совпадает с концом предыдущего */
  breaks: number;
}

/** Расхождение концов соседних участков, которое считаем разрывом трассы, м */
export const PLAN_BREAK_TOLERANCE = 0.5;

const finite = (...xs: (number | undefined)[]) => xs.every((x) => typeof x === "number" && Number.isFinite(x));

export const hasPlan = (s: Segment) => finite(s.planX1, s.planY1, s.planX2, s.planY2);

export const hasElevations = (s: Segment) => finite(s.groundElev1, s.groundElev2);

const dist = (p: PlanPoint, q: PlanPoint) => Math.hypot(p.e - q.e, p.n - q.n);

export function planGeometry(segments: Segment[]): PlanGeometry {
  const missing = segments.filter((s) => !hasPlan(s)).length;
  /* Смешивать съёмку и условную схему нельзя: участок без координат
     «повис» бы в произвольном месте. Поэтому план либо целиком по
     съёмке, либо целиком условный. */
  const surveyed = segments.length > 0 && missing === 0;

  const lines: PlanLine[] = [];
  if (surveyed) {
    for (const seg of segments) {
      lines.push({
        seg,
        a: { e: seg.planY1!, n: seg.planX1! },
        b: { e: seg.planY2!, n: seg.planX2! },
      });
    }
  } else {
    /* Условная схема: участки в линию с запада на восток, в масштабе длин */
    let e = 0;
    for (const seg of segments) {
      const len = Math.max(0, seg.length || 0);
      lines.push({ seg, a: { e, n: 0 }, b: { e: e + len, n: 0 } });
      e += len;
    }
  }

  const nodes: PlanNode[] = [];
  let breaks = 0;
  lines.forEach((l, i) => {
    const prev = lines[i - 1];
    if (!prev) {
      nodes.push({ ...l.a, label: l.seg.from });
    } else if (dist(prev.b, l.a) > PLAN_BREAK_TOLERANCE) {
      breaks++;
      nodes.push({ ...l.a, label: l.seg.from });
    }
    nodes.push({ ...l.b, label: l.seg.to });
  });

  return { lines, nodes, surveyed, missing, breaks };
}

export interface ProfileNode {
  /** Расстояние от начала трассы по горизонтальному проложению, м */
  dist: number;
  ground: number;
  bottom: number;
  /** Подпись пикета; пустая у промежуточного узла ступеньки глубины */
  label: string;
}

export interface ProfileGeometry {
  nodes: ProfileNode[];
  /** true — отметки из съёмки; false — профиль относительно поверхности (земля = 0) */
  absolute: boolean;
  /** Участков без отметок */
  missing: number;
  total: number;
}

export function profileGeometry(segments: Segment[]): ProfileGeometry {
  const missing = segments.filter((s) => !hasElevations(s)).length;
  /* Без отметок земли профиль строится от поверхности, а не от условной
     отметки: раньше подставлялось 100 м, и это выглядело как данные съёмки */
  const absolute = segments.length > 0 && missing === 0;

  const nodes: ProfileNode[] = [];
  let d = 0;
  for (const seg of segments) {
    const g1 = absolute ? seg.groundElev1! : 0;
    const g2 = absolute ? seg.groundElev2! : 0;
    const L = Math.max(0, seg.length || 0);

    const start: ProfileNode = { dist: d, ground: g1, bottom: g1 - (seg.h1 || 0), label: seg.from };
    const last = nodes[nodes.length - 1];
    if (!last) {
      nodes.push(start);
    } else if (Math.abs(last.ground - start.ground) > 1e-6 || Math.abs(last.bottom - start.bottom) > 1e-6) {
      /* На стыке участков глубина меняется скачком — нужен второй узел в
         той же точке, иначе ступенька сгладится в наклонную линию */
      nodes.push({ ...start, label: "" });
    }

    d += L;
    nodes.push({ dist: d, ground: g2, bottom: g2 - (seg.h2 || 0), label: seg.to });
  }

  return { nodes, absolute, missing, total: d };
}

/** Круглая длина масштабной линейки, близкая к заданной: 1, 2, 5 × 10ⁿ */
export function niceLength(target: number): number {
  if (!(target > 0)) return 1;
  const pow = 10 ** Math.floor(Math.log10(target));
  const m = target / pow;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * pow;
}
