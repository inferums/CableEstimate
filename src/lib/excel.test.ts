import { beforeAll, describe, expect, it } from "vitest";
import { buildVorWorkbook, vorFileName } from "./excel";
import { buildVor } from "./calc";
import { project } from "../test/fixtures";
import type { Segment, TrenchType } from "./types";

/** Трасса со всеми способами прокладки: в ведомости будут все четыре раздела */
const allTypes = () => {
  const types: TrenchType[] = ["open", "gnb", "lotok", "block", "splice"];
  const segments: Segment[] = types.map((type, i) => ({
    id: `s${i}`,
    from: `ПК${i}`,
    to: `ПК${i + 1}`,
    type,
    length: 60,
    h1: 1.6,
    h2: 1.6,
    surfaceId: "lawn",
  }));
  return project({ type: "open", voltage: "110-220", chains: 2, segments });
};

const workbook = async () => {
  const state = allTypes();
  const vor = buildVor(state);
  return { state, vor, wb: await buildVorWorkbook(state, vor) };
};

describe("выгрузка ведомости в Excel", () => {
  /* Первая загрузка exceljs в node занимает несколько секунд: прогреваем её
     заранее, иначе таймаут срабатывает на первом же тесте */
  beforeAll(async () => {
    await import("exceljs");
  }, 60_000);

  it("книга содержит листы ведомости, участков и исходных данных", async () => {
    const { wb } = await workbook();
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain("ВОР");
    expect(names).toContain("Участки");
    expect(names).toContain("Исходные данные");
  });

  it("таблица ведомости имеет восемь граф по форме", async () => {
    const { wb } = await workbook();
    const ws = wb.getWorksheet("ВОР")!;
    /* Строка с номерами граф идёт сразу под наименованиями */
    let numsRow = 0;
    ws.eachRow((row, i) => {
      if (String(row.getCell(1).value) === "1" && String(row.getCell(2).value) === "2") numsRow = i;
    });
    expect(numsRow).toBeGreaterThan(0);
    const nums = ws.getRow(numsRow);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((c) => String(nums.getCell(c).value))).toEqual([
      "1", "2", "3", "4", "5", "6", "6.1", "6.2",
    ]);
    expect(String(ws.getRow(numsRow - 1).getCell(1).value)).toBe("№ п.п.");
    expect(String(ws.getRow(numsRow - 1).getCell(3).value)).toBe("Ед. изм.");
  });

  it("нумерация позиций сквозная через все разделы", async () => {
    const { wb, vor } = await workbook();
    const ws = wb.getWorksheet("ВОР")!;
    const numbers: number[] = [];
    ws.eachRow((row) => {
      const first = row.getCell(1).value;
      /* Позиция — это строка, у которой в графе 1 число, а в графе 3 единица измерения */
      if (typeof first === "number" && row.getCell(3).value) numbers.push(first);
    });
    expect(numbers.length).toBe(vor.rows.length);
    expect(numbers).toEqual(vor.rows.map((_, i) => i + 1));
  });

  it("объёмы в ведомости совпадают с расчётом", async () => {
    const { wb, vor } = await workbook();
    const ws = wb.getWorksheet("ВОР")!;
    const cells: { name: string; qty: number }[] = [];
    ws.eachRow((row) => {
      if (typeof row.getCell(1).value === "number" && row.getCell(3).value) {
        cells.push({ name: String(row.getCell(2).value), qty: Number(row.getCell(4).value) });
      }
    });
    expect(cells.length).toBe(vor.rows.length);
    cells.forEach((c, i) => {
      expect(c.name).toBe(vor.rows[i].name);
      expect(c.qty).toBeCloseTo(Math.round(vor.rows[i].qty * 100) / 100, 2);
    });
  });

  it("заголовок каждого раздела объединён во всю ширину таблицы", async () => {
    const { wb, vor } = await workbook();
    const ws = wb.getWorksheet("ВОР")!;
    const bands: string[] = [];
    ws.eachRow((row) => {
      const v = row.getCell(1).value;
      if (typeof v === "string" && v.startsWith("Раздел ")) {
        bands.push(v);
        /* объединение до восьмой графы */
        expect(row.getCell(8).isMerged).toBe(true);
      }
    });
    const sections = [...new Set(vor.rows.map((r) => r.section))];
    expect(bands.length).toBe(sections.length);
    for (const s of sections) {
      expect(bands.some((b) => b.startsWith(`Раздел ${s}.`))).toBe(true);
    }
  });

  it("у позиций есть рамка со всех сторон", async () => {
    const { wb } = await workbook();
    const ws = wb.getWorksheet("ВОР")!;
    let checked = 0;
    ws.eachRow((row) => {
      if (typeof row.getCell(1).value !== "number" || !row.getCell(3).value) return;
      for (let c = 1; c <= 8; c++) {
        const b = row.getCell(c).border;
        expect(b?.top, `графа ${c}`).toBeDefined();
        expect(b?.left, `графа ${c}`).toBeDefined();
        expect(b?.bottom, `графа ${c}`).toBeDefined();
        expect(b?.right, `графа ${c}`).toBeDefined();
      }
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });

  it("шапка таблицы повторяется на каждой печатной странице", async () => {
    const { wb } = await workbook();
    const ws = wb.getWorksheet("ВОР")!;
    expect(ws.pageSetup.printTitlesRow).toMatch(/^\d+:\d+$/);
    expect(ws.pageSetup.orientation).toBe("landscape");
  });

  it("лист замечаний появляется только при наличии предупреждений", async () => {
    const clean = project({ type: "open" });
    const cleanVor = buildVor(clean);
    const cleanWb = await buildVorWorkbook(clean, cleanVor);
    expect(!!cleanWb.getWorksheet("Замечания")).toBe(cleanVor.warnings.length > 0);

    /* Лотки на 35 кВ недопустимы — предупреждение гарантировано */
    const broken = project({ type: "lotok", voltage: "35" });
    const brokenVor = buildVor(broken);
    expect(brokenVor.warnings.length).toBeGreaterThan(0);
    const brokenWb = await buildVorWorkbook(broken, brokenVor);
    expect(brokenWb.getWorksheet("Замечания")).toBeDefined();
  });

  it("на листе участков есть строка на каждый участок", async () => {
    const { wb, state } = await workbook();
    const ws = wb.getWorksheet("Участки")!;
    /* строки: шапка + участки + итог */
    expect(ws.rowCount).toBe(state.segments.length + 2);
    expect(String(ws.getRow(ws.rowCount).getCell(1).value)).toBe("Итого");
  });

  it("книга записывается и читается обратно без потерь", async () => {
    const { wb, vor } = await workbook();
    const buffer = await wb.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(5000);

    const ExcelJS = (await import("exceljs")).default;
    const again = new ExcelJS.Workbook();
    await again.xlsx.load(buffer as ArrayBuffer);
    const ws = again.getWorksheet("ВОР")!;
    let positions = 0;
    ws.eachRow((row) => {
      if (typeof row.getCell(1).value === "number" && row.getCell(3).value) positions++;
    });
    expect(positions).toBe(vor.rows.length);
  });

  it("имя файла содержит шифр проекта и класс напряжения", async () => {
    const name = vorFileName(project({ type: "open", voltage: "110-220" }));
    expect(name).toMatch(/^ВОР_ТЕСТ_.+\.xlsx$/);
    expect(name).not.toMatch(/\s/);
  });
});

/* ================= листы выполнения ================= */

import { ALL_SECTIONS, actItems, newActId } from "./progress";
import type { Act } from "./types";

const withActs = () => {
  const state = allTypes();
  const seg = state.segments[0];
  const draft = { scope: [{ segmentId: seg.id, length: 30 }], sections: ALL_SECTIONS, lineWorks: false };
  const act: Act = {
    id: newActId(), number: "1", date: "2026-02-01", title: "1-я строительная длина",
    scope: draft.scope, sections: draft.sections, lineWorks: false,
    items: actItems(state, draft),
  };
  return { ...state, acts: [act] };
};

describe("выгрузка выполнения", () => {
  it("без актов листов выполнения нет", async () => {
    const { wb } = await workbook();
    for (const name of ["Накопительная", "Схема выполнения"]) {
      expect(wb.getWorksheet(name), name).toBeUndefined();
    }
  });

  it("с актами появляются накопительная, схема и лист акта", async () => {
    const state = withActs();
    const wb = await buildVorWorkbook(state, buildVor(state));
    expect(wb.getWorksheet("Накопительная")).toBeDefined();
    expect(wb.getWorksheet("Схема выполнения")).toBeDefined();
    expect(wb.getWorksheet("Акт 1")).toBeDefined();
  });

  it("в накопительной есть колонка на каждый акт", async () => {
    const state = withActs();
    const wb = await buildVorWorkbook(state, buildVor(state));
    const ws = wb.getWorksheet("Накопительная")!;
    const head = ws.getRow(1);
    const titles = [1, 2, 3, 4, 5, 6, 7, 8].map((c) => String(head.getCell(c).value ?? ""));
    expect(titles[3]).toBe("По проекту");
    expect(titles[4]).toContain("Акт № 1");
    expect(titles[5]).toBe("Принято всего");
    expect(titles[6]).toBe("Остаток");
  });

  it("лист акта содержит все его позиции", async () => {
    const state = withActs();
    const wb = await buildVorWorkbook(state, buildVor(state));
    const ws = wb.getWorksheet("Акт 1")!;
    let positions = 0;
    ws.eachRow((row) => {
      if (typeof row.getCell(1).value === "number" && row.getCell(3).value) positions++;
    });
    expect(positions).toBe(state.acts![0].items.length);
    expect(positions).toBeGreaterThan(0);
  });

  it("имя листа акта не длиннее допустимого", async () => {
    const state = withActs();
    state.acts![0].number = "ВОР-2026/01 на прокладку КЛ 110 кВ, этап 1";
    const wb = await buildVorWorkbook(state, buildVor(state));
    const sheet = wb.worksheets.find((w) => w.name.startsWith("Акт "))!;
    expect(sheet.name.length).toBeLessThanOrEqual(31);
  });
});
