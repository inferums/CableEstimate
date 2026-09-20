import { describe, expect, it } from "vitest";
import {
  CALC,
  isTypeAllowed,
  PLATES,
  TRAYS,
  trayInnerH,
  trayInnerW,
  VOLTAGE_META,
} from "./catalogs";

/*
 * Справочник заполнен по серии 3.006.1-2.87 вручную. Эти проверки ловят
 * опечатку в цифре: величины в номенклатуре связаны между собой, и если
 * объём, масса и габариты перестали сходиться — данные внесены неверно.
 */

const CONCRETE_DENSITY = 2.5; // т/м³

/*
 * Номенклатура округляет объём до 0,01 м³, а массу до 0,01 т. У мелких
 * доборных изделий это округление само по себе даёт до 7% (П8д-8: 0,086 м³
 * записаны как 0,09), поэтому допуск учитывает и относительное расхождение,
 * и абсолютный шаг округления.
 */
const ROUNDING_STEP = 0.01;
const RELATIVE_TOLERANCE = 0.05;

function expectAgree(actual: number, expected: number, label: string) {
  const allowed = Math.max(ROUNDING_STEP, RELATIVE_TOLERANCE * expected);
  expect(
    Math.abs(actual - expected),
    `${label}: ${actual.toFixed(3)} против ${expected.toFixed(3)} (допуск ${allowed.toFixed(3)})`,
  ).toBeLessThanOrEqual(allowed);
}

describe("справочник лотков", () => {
  it("объём бетона согласован с массой изделия", () => {
    for (const t of TRAYS) {
      expectAgree(t.volume, t.weight / CONCRETE_DENSITY, `${t.mark}: объём против массы`);
    }
  });

  it("объём бетона меньше габаритного: лоток П-образный, а не монолит", () => {
    for (const t of TRAYS) {
      const gabarit = (t.length / 1000) * (t.width / 1000) * (t.height / 1000);
      expect(t.volume, `${t.mark}`).toBeLessThan(gabarit);
    }
  });

  it("исполнение /2 вдвое короче и вдвое легче полноразмерного", () => {
    for (const half of TRAYS.filter((t) => t.mark.endsWith("/2"))) {
      const full = TRAYS.find((t) => t.mark === half.mark.replace("/2", ""));
      expect(full, `нет полноразмерного для ${half.mark}`).toBeDefined();
      expect(half.volume * 2).toBeCloseTo(full!.volume, 2);
      expect(half.length * 2).toBeGreaterThan(full!.length - 60);
    }
  });

  it("канал в свету выводится из габарита и остаётся положительным", () => {
    for (const t of TRAYS) {
      expect(trayInnerW(t), `${t.mark}`).toBe(t.width - 2 * CALC.trayWall);
      expect(trayInnerH(t), `${t.mark}`).toBe(t.height - CALC.trayBottom);
      expect(trayInnerW(t)).toBeGreaterThan(0);
      expect(trayInnerH(t)).toBeGreaterThan(0);
    }
  });

  it("марки не повторяются", () => {
    expect(new Set(TRAYS.map((t) => t.mark)).size).toBe(TRAYS.length);
  });
});

describe("справочник плит перекрытия", () => {
  it("объём совпадает с габаритным: плита сплошная", () => {
    for (const p of PLATES) {
      const gabarit = (p.length / 1000) * (p.width / 1000) * (p.thickness / 1000);
      expectAgree(p.volume, gabarit, `${p.mark}: каталог против габарита`);
    }
  });

  it("объём согласован с массой", () => {
    for (const p of PLATES) {
      expectAgree(p.volume, p.weight / CONCRETE_DENSITY, `${p.mark}: объём против массы`);
    }
  });

  it("под каждую ширину лотка есть хотя бы одна плита той же ширины", () => {
    for (const width of new Set(TRAYS.map((t) => t.width))) {
      const fit = PLATES.filter((p) => p.width === width);
      expect(fit.length, `нет плит шириной ${width} мм`).toBeGreaterThan(0);
    }
  });

  it("марки не повторяются", () => {
    expect(new Set(PLATES.map((p) => p.mark)).size).toBe(PLATES.length);
  });
});

describe("классы напряжения", () => {
  it("на 35 кВ лотки не применяются", () => {
    expect(isTypeAllowed("35", "lotok")).toBe(false);
    expect(isTypeAllowed("0.4-10", "lotok")).toBe(true);
    expect(isTypeAllowed("110-220", "lotok")).toBe(true);
  });

  it("остальные способы прокладки допустимы везде", () => {
    for (const v of ["0.4-10", "35", "110-220"] as const) {
      for (const t of ["gnb", "block", "open", "splice"] as const) {
        expect(isTypeAllowed(v, t), `${v} / ${t}`).toBe(true);
      }
    }
  });

  it("своя конструкция на цепь — только на 110–220 кВ", () => {
    expect(VOLTAGE_META["0.4-10"].structurePerChain).toBe(false);
    expect(VOLTAGE_META["35"].structurePerChain).toBe(false);
    expect(VOLTAGE_META["110-220"].structurePerChain).toBe(true);
  });
});
