/* Тип берём статически, а сам exceljs грузим по требованию: библиотека
   весит около мегабайта и нужна только в момент выгрузки */
import type ExcelJS from "exceljs";
import { TRENCH_META, VOLTAGE_META } from "../data/catalogs";
import { fmt, segLabel, type VorResult } from "./calc";
import { type ProjectState } from "./types";

/*
 * Ведомость собирается по форме 0086-ТКР.ВР: восемь граф, сквозная нумерация
 * позиций через все разделы, заголовок раздела отдельной строкой во всю ширину
 * таблицы. Графы 6–6.2 (ссылки на чертежи и файлы) в расчёте не участвуют и
 * заполняются проектировщиком вручную, но в форме они есть, поэтому колонки
 * создаются и размечаются.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Графы ведомости: наименование, номер по форме и ширина колонки */
const VOR_COLUMNS: { title: string; num: string; width: number }[] = [
  { title: "№ п.п.", num: "1", width: 8 },
  { title: "Наименование работ, ресурсов, затрат по проекту", num: "2", width: 58 },
  { title: "Ед. изм.", num: "3", width: 10 },
  { title: "Объем работ / Количество", num: "4", width: 16 },
  { title: "Формула расчета объемов работ и расхода ресурсов", num: "5", width: 48 },
  { title: "Ссылка на чертежи, спецификации в проектной документации", num: "6", width: 24 },
  { title: "Наименование файла", num: "6.1", width: 18 },
  { title: "Номера страниц (через пробел)", num: "6.2", width: 14 },
];

const THIN = { style: "thin" as const, color: { argb: "FF7F7F7F" } };
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const fillOf = (argb: string): ExcelJS.FillPattern => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});

/** Заливки: раздел темнее подраздела, шапка таблицы — серая */
const FILL_HEAD = fillOf("FFD9D9D9");
const FILL_SECTION = fillOf("FFC5D9F1");
const FILL_SUB = fillOf("FFEAF1FB");

function borderRow(row: ExcelJS.Row, cols: number) {
  for (let c = 1; c <= cols; c++) row.getCell(c).border = ALL_BORDERS;
}

/** Строка «подпись — значение» в шапке документа */
function metaRow(ws: ExcelJS.Worksheet, label: string, value: string | number) {
  const row = ws.addRow([label, "", "", value]);
  row.getCell(1).font = { bold: true, size: 10 };
  row.getCell(4).font = { size: 10 };
  row.getCell(4).alignment = { wrapText: true, vertical: "top" };
  return row;
}

/** Заголовок раздела или подраздела — отдельной строкой во всю ширину таблицы */
function bandRow(ws: ExcelJS.Worksheet, text: string, kind: "section" | "sub") {
  const row = ws.addRow([text]);
  ws.mergeCells(row.number, 1, row.number, VOR_COLUMNS.length);
  const cell = row.getCell(1);
  cell.font = { bold: true, size: kind === "section" ? 11 : 10, italic: kind === "sub" };
  cell.fill = kind === "section" ? FILL_SECTION : FILL_SUB;
  cell.alignment = { vertical: "middle", indent: kind === "sub" ? 2 : 0 };
  borderRow(row, VOR_COLUMNS.length);
  row.height = kind === "section" ? 20 : 16;
  return row;
}

/** Шапка вспомогательной таблицы: жирная, с рамкой и заливкой */
function tableHeader(ws: ExcelJS.Worksheet, titles: string[], widths: number[]) {
  ws.columns = widths.map((width) => ({ width }));
  const row = ws.addRow(titles);
  row.font = { bold: true, size: 10 };
  row.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  row.height = 30;
  for (let c = 1; c <= titles.length; c++) {
    row.getCell(c).border = ALL_BORDERS;
    row.getCell(c).fill = FILL_HEAD;
  }
  return row;
}

/* ================= лист «ВОР» ================= */
function sheetVor(wb: ExcelJS.Workbook, state: ProjectState, vor: VorResult) {
  const ws = wb.addWorksheet("ВОР", {
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });
  ws.columns = VOR_COLUMNS.map((c) => ({ width: c.width }));

  /* --- шапка документа --- */
  metaRow(ws, "Документ", "Ведомость объемов работ");
  metaRow(ws, "Версия", "1");
  ws.addRow([]);
  metaRow(ws, "Наименование стройки", state.projectName || "—");
  metaRow(ws, "Наименование объекта капитального строительства", state.projectName || "—");
  metaRow(ws, "Ведомость объемов работ №", `${state.projectCode || "КЛ"}-ВР`);
  metaRow(ws, "Основание (наименование раздела проектной документации)", state.projectCode || "—");
  metaRow(ws, "Дата составления", new Date().toLocaleDateString("ru-RU"));
  ws.addRow([]);
  metaRow(ws, "Составил ФИО", "");
  metaRow(ws, "Составил должность", "Инженер");
  metaRow(ws, "Проверил ФИО", "");
  metaRow(ws, "Проверил должность", "Главный инженер проекта");
  ws.addRow([]);

  /* --- шапка таблицы: наименования граф и под ними их номера --- */
  const head = ws.addRow(VOR_COLUMNS.map((c) => c.title));
  head.font = { bold: true, size: 10 };
  head.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  head.height = 46;
  for (let c = 1; c <= VOR_COLUMNS.length; c++) {
    head.getCell(c).border = ALL_BORDERS;
    head.getCell(c).fill = FILL_HEAD;
  }

  const nums = ws.addRow(VOR_COLUMNS.map((c) => c.num));
  nums.font = { size: 9, italic: true };
  nums.alignment = { horizontal: "center" };
  borderRow(nums, VOR_COLUMNS.length);

  /* Шапка таблицы повторяется на каждой печатной странице и не уезжает при прокрутке */
  ws.pageSetup.printTitlesRow = `${head.number}:${nums.number}`;
  ws.views = [{ state: "frozen", ySplit: nums.number }];

  /* --- позиции: нумерация сквозная через все разделы --- */
  let currentSection = 0;
  let currentSub = "";
  let n = 0;

  for (const r of vor.rows) {
    if (r.section !== currentSection) {
      currentSection = r.section;
      currentSub = "";
      bandRow(ws, `Раздел ${r.section}. ${r.sectionTitle}`, "section");
    }
    if (r.subSection !== currentSub) {
      currentSub = r.subSection;
      bandRow(ws, currentSub, "sub");
    }

    n++;
    const row = ws.addRow([n, r.name, r.unit, r2(r.qty), r.formula || "", state.projectCode || "", "", ""]);
    row.font = { size: 10 };
    row.getCell(1).alignment = { horizontal: "center", vertical: "top" };
    row.getCell(2).alignment = { wrapText: true, vertical: "top" };
    row.getCell(3).alignment = { horizontal: "center", vertical: "top" };
    row.getCell(4).numFmt = "#,##0.00";
    row.getCell(4).alignment = { horizontal: "right", vertical: "top" };
    row.getCell(5).alignment = { wrapText: true, vertical: "top" };
    row.getCell(5).font = { size: 8, color: { argb: "FF595959" } };
    borderRow(row, VOR_COLUMNS.length);
  }

  /* --- итог --- */
  ws.addRow([]);
  const total = ws.addRow([
    `Итого позиций: ${n}. Траншей ${fmt(vor.totals.length, 0)} м, земляные работы ${fmt(vor.totals.earth)} м³, кабель ${fmt(vor.totals.cable, 0)} м`,
  ]);
  ws.mergeCells(total.number, 1, total.number, VOR_COLUMNS.length);
  total.getCell(1).font = { bold: true, size: 10 };
  borderRow(total, VOR_COLUMNS.length);

  ws.addRow([]);
  const sign = ws.addRow(["Составил: ______________", "", "", "Проверил: ______________"]);
  sign.font = { size: 10 };

  return ws;
}

/* ================= лист «Участки» ================= */
function sheetSegments(wb: ExcelJS.Workbook, state: ProjectState, vor: VorResult) {
  const ws = wb.addWorksheet("Участки", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const titles = [
    "Участок",
    "Тип траншеи",
    "Покрытие",
    "L, м",
    "H1, м",
    "H2, м",
    "H ср., м",
    "V земляных работ, м³",
    "Кабель, м",
    "Примечание",
  ];
  tableHeader(ws, titles, [12, 22, 18, 9, 9, 9, 10, 18, 11, 42]);

  for (const c of vor.calcs) {
    const surfName =
      c.seg.type === "gnb"
        ? "без вскрытия (ГНБ)"
        : state.surfaces.find((s) => s.id === c.seg.surfaceId)?.name ?? "—";
    const row = ws.addRow([
      segLabel(c.seg),
      `${TRENCH_META[c.seg.type].letter}) ${TRENCH_META[c.seg.type].label}`,
      surfName,
      r2(c.seg.length),
      r2(c.seg.h1),
      r2(c.seg.h2),
      r2(c.hAvg),
      r2(c.excavation),
      r2(c.cable),
      c.active ? c.note : "тип траншеи не активен",
    ]);
    /* Неактивный участок в ведомость не попал — это видно по цвету строки */
    row.font = c.active ? { size: 10 } : { size: 10, color: { argb: "FF9C0006" } };
    row.getCell(10).alignment = { wrapText: true, vertical: "top" };
    for (const col of [4, 5, 6, 7, 8, 9]) row.getCell(col).numFmt = "#,##0.00";
    borderRow(row, titles.length);
  }

  const total = ws.addRow([
    "Итого",
    "",
    "",
    r2(vor.totals.length),
    "",
    "",
    "",
    r2(vor.totals.earth),
    r2(vor.totals.cable),
    "",
  ]);
  total.font = { bold: true, size: 10 };
  for (const col of [4, 8, 9]) total.getCell(col).numFmt = "#,##0.00";
  borderRow(total, titles.length);

  return ws;
}

/* ================= лист «Исходные данные» ================= */
function sheetInput(wb: ExcelJS.Workbook, state: ProjectState) {
  const ws = wb.addWorksheet("Исходные данные");
  const v = VOLTAGE_META[state.voltage];
  ws.columns = [{ width: 30 }, { width: 30 }, { width: 12 }, { width: 9 }, { width: 9 }, { width: 20 }];

  const params: [string, string | number][] = [
    ["Наименование объекта", state.projectName || "—"],
    ["Шифр проекта", state.projectCode || "—"],
    ["Класс напряжения", v.label],
    ["Цепей в траншее", state.chains],
    ["Кабелей на цепь", v.cablesPerChain],
    ["Группа грунта", state.soil.group],
    ["Мокрый грунт на линии", `${state.soil.wetShare}%`],
    ["Типы прокладки", state.types.map((t) => TRENCH_META[t].label).join(", ")],
  ];
  for (const [label, value] of params) {
    const row = ws.addRow([label, value]);
    row.getCell(1).font = { bold: true, size: 10 };
    row.getCell(2).font = { size: 10 };
    borderRow(row, 2);
  }

  ws.addRow([]);
  tableHeader(ws, ["Участок", "Тип", "Длина, м", "H1, м", "H2, м", "Покрытие"], [30, 30, 12, 9, 9, 20]);

  for (const s of state.segments) {
    const surf = state.surfaces.find((sf) => sf.id === s.surfaceId);
    const row = ws.addRow([
      `${s.from}–${s.to}`,
      TRENCH_META[s.type].label,
      s.length,
      s.h1,
      s.h2,
      surf?.name ?? "—",
    ]);
    row.font = { size: 10 };
    borderRow(row, 6);
  }

  return ws;
}

/* ================= лист «Замечания» ================= */
function sheetWarnings(wb: ExcelJS.Workbook, vor: VorResult) {
  if (vor.warnings.length === 0) return null;
  const ws = wb.addWorksheet("Замечания");
  tableHeader(ws, ["Вид", "Замечание"], [10, 110]);
  for (const w of vor.warnings) {
    const row = ws.addRow([w.severity === "error" ? "ошибка" : "внимание", w.text]);
    row.font = { size: 10, color: { argb: w.severity === "error" ? "FF9C0006" : "FF9C6500" } };
    row.getCell(2).alignment = { wrapText: true };
    borderRow(row, 2);
  }
  return ws;
}

/**
 * Собирает книгу целиком. Вынесено отдельно от выгрузки, чтобы форму можно было
 * проверять тестами, не обращаясь к браузеру.
 */
export async function buildVorWorkbook(state: ProjectState, vor: VorResult): Promise<ExcelJS.Workbook> {
  const Excel = (await import("exceljs")).default;
  const wb = new Excel.Workbook();
  wb.creator = "CableEstimate";
  wb.created = new Date();

  sheetVor(wb, state, vor);
  sheetSegments(wb, state, vor);
  sheetInput(wb, state);
  sheetWarnings(wb, vor);

  return wb;
}

export function vorFileName(state: ProjectState) {
  const v = VOLTAGE_META[state.voltage];
  const code = (state.projectCode || "КЛ").replace(/\s+/g, "_");
  return `ВОР_${code}_${v.short.replace(/\s+/g, "")}.xlsx`;
}

export async function exportVorExcel(state: ProjectState, vor: VorResult) {
  const wb = await buildVorWorkbook(state, vor);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = vorFileName(state);
  a.click();
  URL.revokeObjectURL(url);
}
