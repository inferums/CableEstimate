import { describe, expect, it } from "vitest";
import { buildVor, earthBalance, structureCount } from "./calc";
import { CALC } from "../data/catalogs";
import { DUG_TYPES, project, rowQty, sumRows } from "../test/fixtures";
import type { TrenchType } from "./types";

const CHAIN_COUNTS = [1, 2, 3, 4];

describe("баланс грунта", () => {
  it("раскладывает вынутый объём без остатка", () => {
    const b = earthBalance(100, 10, 5, 20);
    expect(b.bedding + b.topFill + b.struct + b.backfill).toBeCloseTo(b.total, 9);
    expect(b.surplus).toBeCloseTo(b.bedding + b.topFill + b.struct, 9);
  });

  it("не даёт слоям превысить вынутый объём при заведомо неверных данных", () => {
    const b = earthBalance(10, 50, 50, 50);
    expect(b.bedding + b.topFill + b.struct + b.backfill).toBeCloseTo(b.total, 9);
    expect(b.backfill).toBeGreaterThanOrEqual(0);
  });

  it("ручная доработка — часть разработки, а не добавка к ней", () => {
    const b = earthBalance(100, 10, 5, 0);
    expect(b.handWork).toBeCloseTo(100 * CALC.handWorkShare, 9);
    expect(b.handWork).toBeLessThan(b.total);
  });

  /* Главный инвариант: всё, что вынули, либо вернулось в траншею, либо заняла
     конструкция. Проверяется по фактическим позициям ведомости, а не по
     внутренним величинам, чтобы ловить расхождение сводки и документа. */
  for (const type of DUG_TYPES) {
    for (const chains of CHAIN_COUNTS) {
      it(`сходится по позициям ведомости: ${type}, цепей ${chains}`, () => {
        const vor = buildVor(project({ type, chains, voltage: "110-220" }));
        const c = vor.calcs[0];
        const dug = sumRows(vor.rows, /^(Разработка|Зачистка)/);
        const placed =
          sumRows(vor.rows, /^Обратная засыпка/) +
          sumRows(vor.rows, /^(Устройство основания|Защитный слой)/) +
          c.structVol;

        expect(dug, "разработка по позициям против объёма траншеи").toBeCloseTo(c.excavation, 1);
        expect(placed, "засыпка с конструкциями против объёма траншеи").toBeCloseTo(c.excavation, 1);
      });
    }
  }

  it("объём траншеи не зависит от числа цепей — меняется только его распределение", () => {
    const volumes = CHAIN_COUNTS.map(
      (chains) => buildVor(project({ type: "lotok", chains, voltage: "110-220" })).calcs[0].excavation,
    );
    expect(new Set(volumes).size).toBe(1);
  });

  it("чем больше конструкций, тем больше грунта на вывоз", () => {
    const surplus = CHAIN_COUNTS.map(
      (chains) => buildVor(project({ type: "lotok", chains, voltage: "110-220" })).calcs[0].surplus,
    );
    for (let i = 1; i < surplus.length; i++) {
      expect(surplus[i]).toBeGreaterThan(surplus[i - 1]);
    }
  });
});

describe("своя конструкция на каждую цепь", () => {
  it("на 110–220 кВ число конструкций равно числу цепей", () => {
    for (const chains of CHAIN_COUNTS) {
      expect(structureCount(project({ type: "lotok", chains, voltage: "110-220" }))).toBe(chains);
    }
  });

  it("на 0,4–10 и 35 кВ конструкция одна на все цепи", () => {
    for (const voltage of ["0.4-10", "35"] as const) {
      for (const chains of CHAIN_COUNTS) {
        expect(structureCount(project({ type: "block", chains, voltage }))).toBe(1);
      }
    }
  });

  it("лотки и плиты кратны числу цепей на 110–220 кВ", () => {
    const base = buildVor(project({ type: "lotok", chains: 1, voltage: "110-220" }));
    const trays1 = rowQty(base.rows, /^Лоток /)!;
    const plates1 = rowQty(base.rows, /^Плита перекрытия/)!;
    for (const chains of CHAIN_COUNTS) {
      const vor = buildVor(project({ type: "lotok", chains, voltage: "110-220" }));
      expect(rowQty(vor.rows, /^Лоток /), `цепей ${chains}`).toBe(trays1 * chains);
      expect(rowQty(vor.rows, /^Плита перекрытия/), `цепей ${chains}`).toBe(plates1 * chains);
    }
  });

  it("на 0,4–10 кВ число лотков от цепей не зависит", () => {
    const counts = CHAIN_COUNTS.map(
      (chains) => rowQty(buildVor(project({ type: "lotok", chains, voltage: "0.4-10" })).rows, /^Лоток /),
    );
    expect(new Set(counts).size).toBe(1);
  });

  it("трубы блока кратны числу цепей на 110–220 кВ", () => {
    const one = rowQty(buildVor(project({ type: "block", chains: 1, voltage: "110-220" })).rows, /^Труба ПНД/)!;
    const four = rowQty(buildVor(project({ type: "block", chains: 4, voltage: "110-220" })).rows, /^Труба ПНД/)!;
    expect(four).toBeCloseTo(one * 4, 6);
  });

  it("узкая траншея под ряд лотков поднимает ошибку", () => {
    const vor = buildVor(project({ type: "lotok", chains: 4, voltage: "110-220", width: 1.2 }));
    const err = vor.warnings.find((w) => w.code === "tray-wide");
    expect(err?.severity).toBe("error");
    expect(err?.text).toContain("3720");
  });
});

describe("ГНБ", () => {
  it("бурение считается на скважину, а не на трубу в пучке", () => {
    const vor = buildVor(project({ type: "gnb", length: 100 }));
    expect(rowQty(vor.rows, /^Пилотное бурение/)).toBe(100);
    expect(rowQty(vor.rows, /^Расширение скважины/)).toBe(100);
  });

  it("на 110–220 кВ у каждой цепи своя скважина", () => {
    for (const chains of CHAIN_COUNTS) {
      const vor = buildVor(project({ type: "gnb", chains, voltage: "110-220", length: 100 }));
      expect(rowQty(vor.rows, /^Пилотное бурение/), `цепей ${chains}`).toBe(100 * chains);
    }
  });

  it("стыков на один меньше, чем плетей трубы", () => {
    const vor = buildVor(project({ type: "gnb", length: 100 }));
    const sticks = Math.ceil(100 / CALC.hdpeStickLength);
    expect(rowQty(vor.rows, /^Сварка ПНД/)).toBe((sticks - 1) * 4);
  });

  it("стяжки считаются по шагу на пучок, а не на каждый кабель", () => {
    const vor = buildVor(project({ type: "gnb", chains: 1, voltage: "110-220", length: 100 }));
    expect(rowQty(vor.rows, /стяжки кабельной/)).toBe(Math.ceil(100 / CALC.cableTieStep));
  });

  it("длина троса сопоставима с длиной скважины", () => {
    const vor = buildVor(project({ type: "gnb", length: 100 }));
    const rope = rowQty(vor.rows, /^Синтетический трос/)!;
    expect(rope).toBeGreaterThan(100);
    expect(rope).toBeLessThan(120);
  });
});

describe("применимость способа прокладки", () => {
  it("лоток на 35 кВ выключает участок и поднимает ошибку", () => {
    const vor = buildVor(project({ type: "lotok", voltage: "35" }));
    expect(vor.totals.activeSegments).toBe(0);
    const err = vor.warnings.find((w) => w.code === "type-not-applicable");
    expect(err?.severity).toBe("error");
    expect(vor.rows.some((r) => /^Лоток /.test(r.name))).toBe(false);
  });

  it("остальные способы на 35 кВ считаются", () => {
    for (const type of ["gnb", "block", "open", "splice"] as TrenchType[]) {
      const vor = buildVor(project({ type, voltage: "35" }));
      expect(vor.totals.activeSegments, type).toBe(1);
    }
  });
});

describe("ведомость в целом", () => {
  const ALL_TYPES: TrenchType[] = ["lotok", "open", "block", "gnb", "splice"];

  it("ни одна позиция не выходит нечисловой", () => {
    for (const voltage of ["0.4-10", "35", "110-220"] as const) {
      for (const chains of CHAIN_COUNTS) {
        for (const type of ALL_TYPES) {
          const vor = buildVor(project({ type, chains, voltage }));
          for (const r of vor.rows) {
            expect(Number.isFinite(r.qty), `${voltage}/${chains}ц/${type}: «${r.name}»`).toBe(true);
          }
          expect(vor.warnings.some((w) => w.code === "qty-not-finite")).toBe(false);
        }
      }
    }
  });

  it("сигнальная лента попадает в ведомость одной позицией укладки", () => {
    const vor = buildVor(project({ type: "open", chains: 2 }));
    const laying = vor.rows.filter((r) => /^Укладка сигнальной ленты/.test(r.name));
    expect(laying).toHaveLength(1);
  });

  it("концевые муфты относятся к линии и не множатся по участкам", () => {
    const seg = (id: string, from: string, to: string) => ({
      id, from, to, type: "open" as TrenchType, length: 50, h1: 1.5, h2: 1.5, surfaceId: "lawn",
    });
    const one = buildVor(project({ type: "open", segments: [seg("a", "1", "2")] }));
    const three = buildVor(project({
      type: "open",
      segments: [seg("a", "1", "2"), seg("b", "2", "3"), seg("c", "3", "4")],
    }));
    expect(rowQty(three.rows, /^Монтаж концевых муфт/)).toBe(rowQty(one.rows, /^Монтаж концевых муфт/));
  });

  it("длина кабеля растёт пропорционально числу цепей", () => {
    const one = buildVor(project({ type: "open", chains: 1 })).totals.cable;
    for (const chains of CHAIN_COUNTS) {
      const vor = buildVor(project({ type: "open", chains }));
      expect(vor.totals.cable, `цепей ${chains}`).toBeCloseTo(one * chains, 6);
    }
  });

  it("участок нулевой длины помечается ошибкой и не даёт позиций", () => {
    const vor = buildVor(project({
      type: "open",
      segments: [{ id: "z", from: "1", to: "2", type: "open", length: 0, h1: 1.5, h2: 1.5, surfaceId: "lawn" }],
    }));
    expect(vor.warnings.some((w) => w.code === "no-length")).toBe(true);
    expect(vor.rows).toHaveLength(0);
  });
});

describe("оформление графы «формула»", () => {
  it("десятичный разделитель — запятая, а не точка", () => {
    /* В ведомости нельзя мешать «1.2» и «0,5» в одной строке */
    for (const type of ["lotok", "open", "block", "gnb", "splice"] as const) {
      const vor = buildVor(project({ type, length: 82.4, depth: 1.55 }));
      for (const r of vor.rows) {
        expect(r.formula, `${type}: ${r.name}`).not.toMatch(/\d\.\d/);
      }
    }
  });

  it("целые числа не теряют разряды", () => {
    /* f(100, 0) когда-то давало «1»: жадная срезка хвостовых нулей */
    const vor = buildVor(project({ type: "open", length: 100 }));
    const cable = vor.rows.find((r) => /Прокладка кабеля/.test(r.name));
    expect(cable).toBeDefined();
    expect(cable!.formula).toContain("100");
  });
});
