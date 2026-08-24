import * as XLSX from "xlsx";
import { TRENCH_META, VOLTAGE_META } from "../data/catalogs";
import { fmt, segLabel, type VorResult } from "./calc";
import { VOR_SECTIONS, type ProjectState } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function exportVorExcel(state: ProjectState, vor: VorResult) {
  const v = VOLTAGE_META[state.voltage];
  const aoa: (string | number)[][] = [];

  // Шапка
  aoa.push(["ВЕДОМОСТЬ ОБЪЕМОВ ВЫПОЛНЕННЫХ РАБОТ", "", "", "", ""]);
  aoa.push([`Кабельная линия ${v.label}`, "", "", "", ""]);
  aoa.push([`Объект: ${state.projectName || "—"}${state.projectCode ? ` · шифр ${state.projectCode}` : ""}`, "", "", "", ""]);
  aoa.push([
    `Цепей в одной траншее: ${state.chains} · Типы прокладки: ${state.types
      .map((t) => `${TRENCH_META[t].letter}) ${TRENCH_META[t].short}`)
      .join(", ") || "—"}`,
    "", "", "", "",
  ]);
  aoa.push([]);
  aoa.push(["№ п/п", "Наименование работ и затрат", "Ед. изм.", "Кол-во", "Примечание"]);

  let n = 0;
  for (const section of VOR_SECTIONS) {
    const rows = vor.rows.filter((r) => r.section === section.id);
    if (!rows.length) continue;
    aoa.push([`Раздел ${section.id}. ${section.title}`, "", "", "", ""]);
    for (const r of rows) {
      n += 1;
      aoa.push([n, r.name, r.unit, r2(r.qty), `уч. ${r.segments.join(", ")}`]);
    }
  }

  aoa.push([]);
  aoa.push([`Итого позиций: ${n}`, "", "", "", ""]);
  aoa.push([
    `Всего: траншей ${fmt(vor.totals.length, 0)} м · земляные работы ${fmt(vor.totals.earth)} м³ · кабель ${fmt(vor.totals.cable, 0)} м`,
    "", "", "", "",
  ]);
  aoa.push([]);
  aoa.push(["Составил: ______________", "", "Проверил: ______________", "", ""]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 7 }, { wch: 66 }, { wch: 9 }, { wch: 11 }, { wch: 34 }];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },
  ];
  // объединение строк-разделов
  aoa.forEach((row, i) => {
    if (typeof row[0] === "string" && row[0].startsWith("Раздел")) {
      ws["!merges"]!.push({ s: { r: i, c: 0 }, e: { r: i, c: 4 } });
    }
  });

  // Лист 2 — участки
  const sAoa: (string | number)[][] = [
    ["Участок", "Тип траншеи", "L, м", "H1, м", "H2, м", "H ср., м", "V земляных работ, м³", "Кабель, м", "Примечание"],
  ];
  for (const c of vor.calcs) {
    sAoa.push([
      segLabel(c.seg),
      `${TRENCH_META[c.seg.type].letter}) ${TRENCH_META[c.seg.type].label}`,
      r2(c.seg.length),
      r2(c.seg.h1),
      r2(c.seg.h2),
      r2(c.hAvg),
      r2(c.excavation),
      r2(c.cable),
      c.active ? c.note : "тип траншеи не активен",
    ]);
  }
  sAoa.push([]);
  sAoa.push(["Итого", "", r2(vor.totals.length), "", "", "", r2(vor.totals.earth), r2(vor.totals.cable), ""]);

  const ws2 = XLSX.utils.aoa_to_sheet(sAoa);
  ws2["!cols"] = [
    { wch: 9 }, { wch: 22 }, { wch: 8 }, { wch: 8 }, { wch: 8 },
    { wch: 10 }, { wch: 20 }, { wch: 11 }, { wch: 40 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ВОР");
  XLSX.utils.book_append_sheet(wb, ws2, "Участки");

  const fname = `ВОР_${(state.projectCode || "КЛ").replace(/\s+/g, "_")}_${v.short.replace(/\s+/g, "")}.xlsx`;
  XLSX.writeFile(wb, fname);
}
