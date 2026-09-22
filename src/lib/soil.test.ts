import { describe, expect, it } from "vitest";
import { buildVor, soilSplit } from "./calc";
import { migrateProject } from "./migrate";
import { DUG_TYPES, project, rowQty, sumRows } from "../test/fixtures";

const dug = (rows: { name: string; unit: string; qty: number }[]) =>
  sumRows(rows, /^(Разработка|Зачистка)/);

describe("доля мокрого грунта — одна на всю линию", () => {
  it("общий объём разработки от доли не зависит", () => {
    for (const type of DUG_TYPES) {
      const base = dug(buildVor(project({ type, soil: { group: 2, wetShare: 50 } })).rows);
      for (const wetShare of [0, 30, 100]) {
        const v = dug(buildVor(project({ type, soil: { group: 2, wetShare } })).rows);
        expect(v, `${type}, ${wetShare}%`).toBeCloseTo(base, 2);
      }
    }
  });

  it("мокрый грунт составляет заданную долю разработки", () => {
    for (const type of DUG_TYPES) {
      const rows = buildVor(project({ type, soil: { group: 2, wetShare: 30 } })).rows;
      const wet = sumRows(rows, /^(Разработка мокрого|Зачистка .*влажных)/);
      expect(wet / dug(rows), type).toBeCloseTo(0.3, 2);
    }
  });

  it("при 0% мокрого грунта позиций по мокрому нет, при 100% — по сухому", () => {
    for (const type of DUG_TYPES) {
      const allDry = buildVor(project({ type, soil: { group: 2, wetShare: 0 } })).rows;
      expect(allDry.some((r) => /мокрого|влажных/.test(r.name)), type).toBe(false);
      const allWet = buildVor(project({ type, soil: { group: 2, wetShare: 100 } })).rows;
      expect(allWet.some((r) => /сухого|сухих/.test(r.name)), type).toBe(false);
    }
  });

  it("доля за пределами 0–100% приводится к границе", () => {
    expect(soilSplit({ group: 2, wetShare: 140 }).wet).toBe(1);
    expect(soilSplit({ group: 2, wetShare: -5 }).wet).toBe(0);
    /* без погрешности плавающей точки: 1 − 0,33 */
    expect(soilSplit({ group: 2, wetShare: 33 }).dry).toBe(0.67);
  });
});

describe("группа грунта", () => {
  it("подставляется во все наименования разработки", () => {
    for (const type of DUG_TYPES) {
      const rows = buildVor(project({ type, soil: { group: 4, wetShare: 50 } })).rows;
      /* м³ — грунт; «Разработка покрытия» в м² относится к благоустройству */
      const earth = rows.filter((r) => /^(Разработка|Зачистка)/.test(r.name) && r.unit === "м³");
      expect(earth.length, type).toBeGreaterThan(0);
      for (const r of earth) {
        expect(r.name, type).toMatch(/4 гр\.|группа грунтов 4|4 группы/);
        expect(r.name, type).not.toMatch(/\b2 гр\.|группа грунтов 2|2 группы/);
      }
    }
  });

  it("выход за 1–6 приводится к границе", () => {
    expect(soilSplit({ group: 9, wetShare: 50 }).group).toBe(6);
    expect(soilSplit({ group: 0, wetShare: 50 }).group).toBe(1);
  });
});

describe("проект без параметров грунта", () => {
  it("после миграции считается как раньше: 2 группа, 50% мокрого, без сообщений", () => {
    const current = project({ type: "open" });
    const { soil: _soil, ...old } = current;
    const { state, notes } = migrateProject(old as typeof current, 2);
    expect(state.soil).toEqual({ group: 2, wetShare: 50 });
    expect(notes).toEqual([]);
    expect(buildVor(state).rows).toEqual(buildVor(current).rows);
  });
});

describe("стяжки ГНБ", () => {
  it("ставятся каждый метр", () => {
    const vor = buildVor(project({ type: "gnb", length: 100 }));
    expect(rowQty(vor.rows, /стяжки кабельной/)).toBe(100);
  });
});
