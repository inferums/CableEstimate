import { describe, expect, it } from "vitest";
import { inNumbers, inSymbols, value } from "./formula";
import {
  layerArea,
  lotokGeometry,
  lotokVolumes,
  LOTOK_SYMBOLS,
  MIN_CABLE_DEPTH,
  MIN_ZPT_DEPTH,
  widthAt,
} from "./section-lotok";
import type { LotokParams } from "./types";

/*
 * Разрез «Тип I» проверяется по чертежу «В лотке тип1»: лоток Л5-8 780×680,
 * плита П5-8 толщиной 70, пазухи 330 и 250, подсыпка 100. По этим числам на
 * чертеже стоит B₁ = 1360, и расчёт обязан давать то же самое.
 */

const TYPE1: LotokParams = {
  trayMark: "Л5-8",
  plateMark: "П5-8",
  b3: 330,
  b4: 250,
  bShield: 50,
  b5: 130,
  h1: 100,
  h2: 100,
  h3: 100,
  h4: 150,
  h5: 250,
  beddingType: "pgs",
  backfillType: "soil",
  zptCount: 2,
  volsCount: 1,
  clampStep: 1,
};

const geo = (over: Partial<LotokParams> = {}, depth = 1.956, count = 1, blago = 0) =>
  lotokGeometry({ ...TYPE1, ...over }, depth, count, blago);

describe("геометрия разреза по чертежу", () => {
  it("ширина по дну — лоток плюс пазухи, щиты внутрь не добавляются", () => {
    expect(geo().B1).toBe(1360);
  });

  it("ширина по верху по умолчанию равна ширине по дну", () => {
    expect(geo().B2).toBe(1360);
    expect(geo({ b2: 1800 }).B2).toBe(1800);
  });

  it("отметки слоёв идут снизу вверх как на чертеже", () => {
    const g = geo();
    expect(g.levels.trayBottom).toBe(100);
    expect(g.levels.trayTop).toBe(780);
    expect(g.levels.plateBottom).toBe(880);
    expect(g.levels.plateTop).toBe(950);
    expect(g.levels.marker).toBe(1100);
    expect(g.levels.tape).toBe(1200);
  });

  it("h₆ — остаток глубины от ленты до благоустройства", () => {
    /* H_тр 1956 минус 1200 до ленты — на чертеже 756 */
    expect(geo().h6).toBe(756);
    expect(geo({}, 1.956, 1, 300).h6).toBe(456);
  });

  it("два лотка в ряду расширяют дно на ширину второго лотка", () => {
    expect(geo({}, 1.956, 2).B1).toBe(1360 + 780);
  });

  it("глубина заложения кабеля и ЗПТ считается от поверхности", () => {
    const g = geo();
    /* Кабель: 1956 − (100 подсыпка + 70 дно лотка + 100 подсыпка + 200 пакет) */
    expect(g.hCable).toBe(1486);
    expect(g.hZpt).toBe(1956 - 880);
    /* На чертеже подписано «не менее» — нормы те же */
    expect(MIN_CABLE_DEPTH).toBe(1500);
    expect(MIN_ZPT_DEPTH).toBe(1200);
  });
});

describe("наклонные стенки", () => {
  it("при отвесных стенках ширина одинакова на любой отметке", () => {
    const g = geo();
    expect(widthAt(g, 0)).toBe(1360);
    expect(widthAt(g, g.Htr)).toBe(1360);
    expect(widthAt(g, g.Htr / 2)).toBe(1360);
  });

  it("при наклонных стенках ширина растёт линейно", () => {
    const g = geo({ b2: 2360 });
    expect(widthAt(g, 0)).toBe(1360);
    expect(widthAt(g, g.Htr / 2)).toBeCloseTo(1860, 6);
    expect(widthAt(g, g.Htr)).toBe(2360);
  });

  it("площадь слоя — трапеция, а не прямоугольник", () => {
    const g = geo({ b2: 2360 });
    /* Слой 0…H_тр: средняя ширина (1360 + 2360)/2 */
    expect(layerArea(g, 0, g.Htr)).toBeCloseTo(1860 * g.Htr, 6);
  });
});

describe("баланс грунта сходится по слоям", () => {
  const check = (over: Partial<LotokParams>, depth: number, count: number, blago: number) => {
    const g = geo(over, depth, count, blago);
    const V = lotokVolumes(g, 100, count);
    const sum =
      value(V.bedding) + value(V.struct) + value(V.around) + value(V.backfill) + value(V.blago);
    expect(sum).toBeCloseTo(value(V.total), 6);
  };

  it("отвесные стенки, один лоток", () => check({}, 1.956, 1, 0));
  it("с благоустройством", () => check({}, 1.956, 1, 300));
  it("наклонные стенки", () => check({ b2: 2360 }, 1.956, 1, 300));
  it("два лотка в ряду", () => check({}, 2.2, 2, 200));
  it("другие пазухи", () => check({ b3: 500, b4: 500 }, 2.5, 1, 150));
});

describe("формулы читаются дважды", () => {
  it("разработка — по средней ширине и глубине", () => {
    const V = lotokVolumes(geo(), 100, 1);
    expect(inSymbols(V.total)).toBe("(B₁ + B₂) / 2 · H_тр · L");
    expect(inNumbers(V.total)).toBe("(1,36 + 1,36) / 2 · 1,956 · 100");
    expect(value(V.total)).toBeCloseTo(266.016, 3);
  });

  it("основание — ширина, толщина, длина", () => {
    const V = lotokVolumes(geo(), 100, 1);
    expect(inSymbols(V.bedding)).toBe("B₁ · h₁ · L");
    expect(inNumbers(V.bedding)).toBe("1,36 · 0,1 · 100");
  });

  it("при наклонных стенках в формуле появляется средняя ширина", () => {
    const V = lotokVolumes(geo({ b2: 2360 }), 100, 1);
    expect(inSymbols(V.bedding)).toBe("B_ср · h₁ · L");
  });

  it("засыпка вокруг конструкций — слой минус изделия", () => {
    const V = lotokVolumes(geo(), 100, 1);
    expect(inSymbols(V.around)).toBe("B₁ · (h_лот + h₃ + h_пл) · L − (B_лот · h_лот + B_пл · h_пл) · L");
  });
});

describe("таблица обозначений", () => {
  it("обозначения не повторяются", () => {
    const syms = LOTOK_SYMBOLS.map((s) => s.sym);
    expect(new Set(syms).size).toBe(syms.length);
  });

  it("у каждого обозначения есть расшифровка и единица", () => {
    for (const s of LOTOK_SYMBOLS) {
      expect(s.label.length).toBeGreaterThan(3);
      expect(["мм", "м"]).toContain(s.unit);
    }
  });

  it("вычисляемые величины объясняют, откуда берутся", () => {
    for (const s of LOTOK_SYMBOLS.filter((x) => x.kind === "derived")) {
      expect(s.note, s.sym).toBeTruthy();
    }
  });
});
