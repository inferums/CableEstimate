import { describe, expect, it } from "vitest";
import {
  autoAssemble,
  autoDetectColumns,
  extractPicketNumber,
  parseRows,
  parseTextFile,
  toSegments,
  type SurveyPoint,
} from "./survey-import";
import { DEFAULT_SURFACES } from "../data/catalogs";

const pt = (name: string, x: number, y: number, z: number | null = 5, code = "OPN_GAZ"): SurveyPoint =>
  ({ name, x, y, z, code });

describe("номер пикета", () => {
  it("плюсовка — это метры от пикета", () => {
    expect(extractPicketNumber("ПК12")).toBe(12);
    expect(extractPicketNumber("ПК12+50")).toBeCloseTo(12.5);
    expect(extractPicketNumber("ПК12+5")).toBeCloseTo(12.05);
    expect(extractPicketNumber("ПК12+50,5")).toBeCloseTo(12.505);
  });

  it("ПК12+5 стоит раньше ПК12+40", () => {
    /* Раньше «+5» читалось как 12,5 и вставало после «+40» (12,4) */
    expect(extractPicketNumber("ПК12+5")).toBeLessThan(extractPicketNumber("ПК12+40"));
  });
});

describe("определение колонок", () => {
  it("колонка имени в самом начале не перехватывается следующей", () => {
    const m = autoDetectColumns(["Точка", "Пикет", "X", "Y", "H", "Код"]);
    expect(m.nameIdx).toBe(0);
  });

  it("север и восток распознаются по геодезической системе", () => {
    const m = autoDetectColumns(["name", "north", "east", "z", "code"]);
    expect(m.xIdx).toBe(1);
    expect(m.yIdx).toBe(2);
    const ru = autoDetectColumns(["Имя", "Восток", "Север", "Отметка", "Код"]);
    expect(ru.xIdx).toBe(2);
    expect(ru.yIdx).toBe(1);
  });
});

describe("сборка участков по координатам", () => {
  it("длина участка — расстояние между пикетами, а не константа", () => {
    /* 3-4-5: горизонтальное проложение ровно 50 м */
    const r = autoAssemble([pt("ПК0", 0, 0), pt("ПК1", 30, 40)], DEFAULT_SURFACES, 1.2);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0].length).toBeCloseTo(50, 2);
  });

  it("наклонная длина учитывает перепад отметок", () => {
    const r = autoAssemble([pt("ПК0", 0, 0, 10), pt("ПК1", 0, 40, 19)], DEFAULT_SURFACES, 1.2);
    expect(r.segments[0].length).toBeCloseTo(40, 2);
    expect(r.segments[0].slopeLength).toBeCloseTo(41, 2);
  });

  it("положение пикета — центр его точек", () => {
    /* Пикет снят двумя точками по бровкам: ось посередине */
    const r = autoAssemble(
      [pt("ПК0_Л", 0, -1), pt("ПК0_П", 0, 1), pt("ПК1", 100, 0)],
      DEFAULT_SURFACES,
      1.2,
    );
    expect(r.segments[0].planX1).toBeCloseTo(0);
    expect(r.segments[0].planY1).toBeCloseTo(0);
    expect(r.segments[0].length).toBeCloseTo(100, 2);
  });

  it("пикеты с плюсовками идут в порядке трассы", () => {
    const r = autoAssemble(
      [pt("ПК1+40", 140, 0), pt("ПК1", 100, 0), pt("ПК1+5", 105, 0)],
      DEFAULT_SURFACES,
      1.2,
    );
    expect(r.segments.map((s) => `${s.from}–${s.to}`)).toEqual(["ПК1–ПК1+5", "ПК1+5–ПК1+40"]);
    expect(r.segments.map((s) => s.length)).toEqual([5, 35]);
  });

  it("отсутствующая отметка не превращается в ноль", () => {
    const r = autoAssemble([pt("ПК0", 0, 0, null), pt("ПК1", 10, 0, 7)], DEFAULT_SURFACES, 1.2);
    expect(r.segments[0].groundElev1).toBeNull();
    expect(r.warnings.some((w) => w.includes("без отметки"))).toBe(true);
    const [seg] = toSegments(r.segments);
    expect(seg.groundElev1).toBeUndefined();
    expect(seg.groundElev2).toBe(7);
  });

  it("совпадающие пикеты дают предупреждение", () => {
    const r = autoAssemble([pt("ПК0", 5, 5), pt("ПК1", 5, 5)], DEFAULT_SURFACES, 1.2);
    expect(r.warnings.some((w) => w.includes("Совпадающие"))).toBe(true);
  });

  it("плановые координаты доходят до участка проекта", () => {
    const r = autoAssemble([pt("ПК0", 6543380, 2345755), pt("ПК1", 6543420, 2345785)], DEFAULT_SURFACES, 1.2);
    const [seg] = toSegments(r.segments);
    expect(seg.planX1).toBe(6543380);
    expect(seg.planY2).toBe(2345785);
    expect(seg.length).toBeCloseTo(50, 2);
  });
});

describe("разбор текстового файла", () => {
  it("строка без отметки читается, отметка остаётся пустой", () => {
    const parsed = parseTextFile("Имя;X;Y;Z;Код\nПК0;100,5;200;;OPN\nПК1;110,5;200;4,2;OPN");
    const { points } = parseRows(parsed.rawRows, { nameIdx: 0, xIdx: 1, yIdx: 2, zIdx: 3, codeIdx: 4 });
    expect(points).toHaveLength(2);
    expect(points[0].x).toBe(100.5);
    expect(points[0].z).toBeNull();
    expect(points[1].z).toBe(4.2);
  });
});
