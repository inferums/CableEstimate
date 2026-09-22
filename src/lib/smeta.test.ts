import { beforeAll, describe, expect, it } from "vitest";
import { buildVor } from "./calc";
import { parseSmetaWorkbook, parseUnit, similarity, suggestMatch, type SmetaPosition } from "./smeta-import";
import { autoLink, reconcile, type ProjectSmeta } from "./reconcile";
import { ALL_SECTIONS, actItems, newActId, rowKey } from "./progress";
import { project } from "../test/fixtures";
import type { Act, ProjectState } from "./types";

/**
 * Книга в формате выгрузки локальной сметы: шапка, строка с номерами граф,
 * заголовок раздела, позиции вперемешку со строками ресурсов.
 */
async function smetaWorkbook() {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet("02-01-01");
  ws.addRow(["Локальная смета"]);
  ws.addRow([]);
  const head = ws.addRow([]);
  head.getCell(1).value = "№ п/п";
  head.getCell(2).value = "Обоснование";
  head.getCell(3).value = "Наименование работ и затрат";
  head.getCell(8).value = "Единица измерения";
  head.getCell(9).value = "Количество";
  const sub = ws.addRow([]);
  sub.getCell(9).value = "на единицу измерения";
  sub.getCell(11).value = "всего с учетом коэффициентов";
  const nums = ws.addRow([]);
  ["1", "2", "3"].forEach((v, i) => (nums.getCell(i + 1).value = v));
  nums.getCell(8).value = "4";

  ws.addRow(["Раздел 1. Земляные работы"]);

  const pos = (no: string, code: string, name: string, unit: string, perUnit: number, total?: number) => {
    const r = ws.addRow([]);
    r.getCell(1).value = no;
    r.getCell(2).value = code;
    r.getCell(3).value = name;
    r.getCell(8).value = unit;
    r.getCell(9).value = perUnit;
    if (total !== undefined) r.getCell(11).value = total;
  };
  const resource = (code: string, name: string, unit: string, qty: number) => {
    const r = ws.addRow([]);
    r.getCell(2).value = code;
    r.getCell(3).value = name;
    r.getCell(8).value = unit;
    r.getCell(9).value = qty;
  };

  pos("1", "ГЭСН01-01-009-14", "Разработка грунта в траншеях экскаватором с ковшом 0,5 м3, группа грунтов 2", "1000 м3", 0.0436069);
  resource("1-100-42", "Средний разряд работы 4,2", "чел.-ч", 5.15);
  resource("91.05.05-015", "Краны на автомобильном ходу", "маш.-ч", 0.77);
  pos("2", "ГЭСН01-01-022-14", "Разработка грунта с погрузкой на автомобили-самосвалы", "1000 м3", 0.1, 0.167681);
  ws.addRow(["Раздел 2. Монтаж кабельных каналов"]);
  pos("3", "ГЭСН27-06-020-01", "Укладка лотков железобетонных", "100 шт", 0.28);
  pos("4", "ФСБЦ-01.1.02.03", "Мастика битумно-эмульсионная", "т", 3.46);

  /* Лист без таблицы позиций — сводный расчёт */
  const other = wb.addWorksheet("ССРСС");
  other.addRow(["Сводный сметный расчёт"]);

  return wb;
}

describe("разбор выгрузки сметы", () => {
  let positions: SmetaPosition[];
  let warnings: string[];

  beforeAll(async () => {
    const parsed = parseSmetaWorkbook(await smetaWorkbook(), "смета.xlsx");
    positions = parsed.positions;
    warnings = parsed.warnings;
  }, 60_000);

  it("берёт позиции и пропускает строки ресурсов", () => {
    expect(positions.map((p) => p.no)).toEqual(["1", "2", "3", "4"]);
  });

  it("строка с номерами граф не считается позицией", () => {
    expect(positions.some((p) => p.name === "3")).toBe(false);
  });

  it("подхватывает раздел сметы", () => {
    expect(positions[0].section).toBe("1. Земляные работы");
    expect(positions[2].section).toBe("2. Монтаж кабельных каналов");
  });

  it("множитель единицы учитывается: 1000 м3 это не м3", () => {
    /* Без этого сверка ошиблась бы в тысячу раз */
    expect(positions[0].unit).toBe("1000 м3");
    expect(positions[0].baseUnit).toBe("м3");
    expect(positions[0].factor).toBe(1000);
    expect(positions[0].qtyBase).toBeCloseTo(43.61, 2);
  });

  it("объём берётся с учётом коэффициентов, если он задан", () => {
    expect(positions[1].qty).toBe(0.167681);
    expect(positions[1].qtyBase).toBeCloseTo(167.68, 2);
  });

  it("лист без таблицы позиций пропускается с предупреждением", () => {
    expect(warnings.some((w) => w.includes("ССРСС"))).toBe(true);
  });
});

describe("единицы измерения", () => {
  it("множитель отделяется от единицы", () => {
    expect(parseUnit("1000 м3")).toEqual({ factor: 1000, unit: "м3" });
    expect(parseUnit("100 м")).toEqual({ factor: 100, unit: "м" });
    expect(parseUnit("м3")).toEqual({ factor: 1, unit: "м3" });
    expect(parseUnit("10 шт")).toEqual({ factor: 10, unit: "шт" });
  });

  it("разные написания одной единицы приводятся к одному виду", () => {
    expect(parseUnit("м3").unit).toBe(parseUnit("м³").unit);
    expect(parseUnit("100 м2").unit).toBe(parseUnit("м²").unit);
  });
});

describe("подсказка по наименованию", () => {
  it("похожие наименования получают высокую оценку", () => {
    expect(similarity("Разработка грунта экскаватором в траншеях", "Разработка грунта в траншеях экскаватором")).toBeGreaterThan(0.8);
    expect(similarity("Монтаж железобетонных лотков", "Вывоз грунта на полигон")).toBeLessThan(0.2);
  });

  it("позиция с другой единицей не предлагается", () => {
    const positions: SmetaPosition[] = [
      { id: "a", sheet: "s", section: "", no: "1", code: "", name: "Разработка грунта экскаватором", unit: "100 шт", qty: 1, factor: 100, baseUnit: "шт", qtyBase: 100 },
    ];
    expect(suggestMatch("Разработка грунта экскаватором", "м³", positions)).toBeNull();
  });
});

/* ================= сверка ================= */

function withSmeta(): { state: ProjectState; plan: ReturnType<typeof buildVor>["rows"] } {
  const base = project({ type: "open", length: 100 });
  const plan = buildVor(base).rows;
  const dig = plan.find((r) => /Разработка сухого грунта экскаватором/.test(r.name))!;

  const positions: SmetaPosition[] = [
    {
      id: "02-01-01:1", sheet: "02-01-01", section: "1. Земляные работы", no: "1",
      code: "ГЭСН01-01-009-14", name: "Разработка грунта в траншеях экскаватором",
      unit: "1000 м3", qty: dig.qty / 1000, factor: 1000, baseUnit: "м3", qtyBase: dig.qty,
    },
    {
      id: "02-01-01:9", sheet: "02-01-01", section: "1. Земляные работы", no: "9",
      code: "ГЭСН01-02-061", name: "Позиция, которой нет в ведомости",
      unit: "м3", qty: 5, factor: 1, baseUnit: "м3", qtyBase: 5,
    },
  ];
  const smeta: ProjectSmeta = {
    fileName: "смета.xlsx", importedAt: "2026-03-01T00:00:00.000Z",
    positions,
    links: [{ key: rowKey(dig), smetaId: "02-01-01:1", factor: 1 }],
  };
  return { state: { ...base, smeta }, plan };
}

describe("сверка со сметой", () => {
  it("объём сметы приводится к единицам ведомости", () => {
    const { state, plan } = withSmeta();
    const rep = reconcile(state, plan);
    const row = rep.rows.find((r) => r.smeta !== null)!;
    expect(row.smetaQty).toBeCloseTo(row.plan, 2);
    expect(row.deltaPlan).toBeCloseTo(0, 2);
    expect(row.unitMismatch).toBe(false);
  });

  it("остаток по смете уменьшается принятыми объёмами", () => {
    const { state, plan } = withSmeta();
    const draft = { scope: [{ segmentId: state.segments[0].id, length: 50 }], sections: ALL_SECTIONS, lineWorks: false };
    const act: Act = {
      id: newActId(), number: "1", date: "2026-03-05", title: "",
      scope: draft.scope, sections: draft.sections, lineWorks: false, items: actItems(state, draft),
    };
    const rep = reconcile({ ...state, acts: [act] }, plan);
    const row = rep.rows.find((r) => r.smeta !== null)!;
    expect(row.done).toBeGreaterThan(0);
    expect(row.remainingBySmeta).toBeCloseTo(row.smetaQty! - row.done, 2);
    expect(row.overSmeta).toBe(false);
  });

  it("принято больше, чем в смете — это видно", () => {
    const { state, plan } = withSmeta();
    const draft = { scope: [{ segmentId: state.segments[0].id, length: 100 }], sections: ALL_SECTIONS, lineWorks: false };
    const items = actItems(state, draft).map((i) => ({ ...i, qty: i.qty * 2 }));
    const act: Act = {
      id: newActId(), number: "1", date: "2026-03-05", title: "",
      scope: draft.scope, sections: draft.sections, lineWorks: false, items,
    };
    const rep = reconcile({ ...state, acts: [act] }, plan);
    const row = rep.rows.find((r) => r.smeta !== null)!;
    expect(row.overSmeta).toBe(true);
    expect(rep.overruns).toBeGreaterThan(0);
  });

  it("несвязанные позиции видны с обеих сторон", () => {
    const { state, plan } = withSmeta();
    const rep = reconcile(state, plan);
    expect(rep.unlinked).toBe(rep.rows.length - 1);
    expect(rep.unusedSmeta.map((p) => p.no)).toEqual(["9"]);
  });

  it("коэффициент связи применяется к объёму сметы", () => {
    const { state, plan } = withSmeta();
    const links = state.smeta!.links.map((l) => ({ ...l, factor: 2 }));
    const rep = reconcile({ ...state, smeta: { ...state.smeta!, links } }, plan);
    const row = rep.rows.find((r) => r.smeta !== null)!;
    expect(row.smetaQty).toBeCloseTo(row.plan * 2, 1);
  });

  it("без импортированной сметы сверка не падает", () => {
    const base = project({ type: "open" });
    const rep = reconcile(base, buildVor(base).rows);
    expect(rep.rows.length).toBeGreaterThan(0);
    expect(rep.unlinked).toBe(rep.rows.length);
    expect(rep.unusedSmeta).toEqual([]);
  });
});

describe("автоматическая расстановка связей", () => {
  it("одна позиция сметы не достаётся двум позициям ведомости", () => {
    const { state, plan } = withSmeta();
    const cleared = { ...state, smeta: { ...state.smeta!, links: [] } };
    const links = autoLink(cleared, plan);
    const ids = links.map((l) => l.smetaId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("уже заданные связи не переписываются", () => {
    const { state, plan } = withSmeta();
    const links = autoLink(state, plan);
    expect(links.filter((l) => l.key === state.smeta!.links[0].key)).toHaveLength(1);
    expect(links[0]).toEqual(state.smeta!.links[0]);
  });
});

describe("лист сверки в Excel", () => {
  it("появляется только когда смета загружена", async () => {
    const { buildVorWorkbook } = await import("./excel");
    const { state, plan } = withSmeta();
    void plan;
    const withIt = await buildVorWorkbook(state, buildVor(state));
    expect(withIt.getWorksheet("Сверка со сметой")).toBeDefined();

    const without = project({ type: "open" });
    const wb = await buildVorWorkbook(without, buildVor(without));
    expect(wb.getWorksheet("Сверка со сметой")).toBeUndefined();
  }, 60_000);

  it("несвязанные позиции сметы попадают в лист отдельным блоком", async () => {
    const { buildVorWorkbook } = await import("./excel");
    const { state } = withSmeta();
    const wb = await buildVorWorkbook(state, buildVor(state));
    const ws = wb.getWorksheet("Сверка со сметой")!;
    let found = false;
    ws.eachRow((row) => {
      if (String(row.getCell(1).value ?? "").startsWith("Позиции сметы без связи")) found = true;
    });
    expect(found).toBe(true);
  }, 60_000);
});
