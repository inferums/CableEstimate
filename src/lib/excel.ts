import { TRENCH_META, VOLTAGE_META } from "../data/catalogs";
import { fmt, segLabel, type VorResult } from "./calc";
import { type ProjectState } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function exportVorExcel(state: ProjectState, vor: VorResult) {
  const XLSX = await import("xlsx");
  const v = VOLTAGE_META[state.voltage];
  const aoa: (string | number)[][] = [];

  // === Шапка документа (как в 0086-ТКР.ВР) ===
  aoa.push(["Документ", "", "", "", "Ведомость объемов работ"]);
  aoa.push([]);
  aoa.push(["Наименование стройки", "", "", state.projectName || "—"]);
  aoa.push(["Наименование объекта", "", "", state.projectCode || "—"]);
  aoa.push(["Ведомость объемов работ №", "", "", `${state.projectCode || "КЛ"}-ВР`]);
  aoa.push(["Основание", "", "", state.projectCode || "—"]);
  aoa.push(["Дата составления", "", "", new Date().toLocaleDateString("ru-RU")]);
  aoa.push([]);
  aoa.push(["Составил ФИО", "", "", ""]);
  aoa.push(["Составил должность", "", "", "Инженер"]);
  aoa.push(["Проверил ФИО", "", "", ""]);
  aoa.push(["Проверил должность", "", "", "Главный инженер проекта"]);
  aoa.push([]);

  // Заголовки таблицы
  aoa.push(["№ п.п.", "Наименование работ, ресурсов, затрат по проекту", "Ед. изм.", "Объем работ / Количество", "Формула расчета"]);
  aoa.push(["1", "2", "3", "4", "5"]);

  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  const headerRows = 15; // строк до начала данных (0-indexed: строка 14)

  // Мерджи шапки
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } });
  merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: 3 } });
  merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: 3 } });
  merges.push({ s: { r: 4, c: 0 }, e: { r: 4, c: 3 } });
  merges.push({ s: { r: 5, c: 0 }, e: { r: 5, c: 3 } });
  merges.push({ s: { r: 6, c: 0 }, e: { r: 6, c: 3 } });
  merges.push({ s: { r: 8, c: 0 }, e: { r: 8, c: 3 } });
  merges.push({ s: { r: 9, c: 0 }, e: { r: 9, c: 3 } });
  merges.push({ s: { r: 10, c: 0 }, e: { r: 10, c: 3 } });
  merges.push({ s: { r: 11, c: 0 }, e: { r: 11, c: 3 } });

  // === Данные — по разделам, внутри раздела по способам прокладки ===
  let currentSection = 0;
  let currentSub = "";
  let n = 0;

  for (const row of vor.rows) {
    if (row.section !== currentSection) {
      currentSection = row.section;
      currentSub = "";
      const sectionRow = aoa.length;
      aoa.push([`Раздел ${row.section}. ${row.sectionTitle}`, "", "", "", ""]);
      merges.push({ s: { r: sectionRow, c: 0 }, e: { r: sectionRow, c: 4 } });
    }
    if (row.subSection !== currentSub) {
      currentSub = row.subSection;
      const subRow = aoa.length;
      aoa.push([`    ${currentSub}`, "", "", "", ""]);
      merges.push({ s: { r: subRow, c: 0 }, e: { r: subRow, c: 4 } });
    }

    n++;
    aoa.push([n, row.name, row.unit, r2(row.qty), row.formula || ""]);
  }

  // Итого
  aoa.push([]);
  aoa.push([`Итого позиций: ${n}`, "", "", "", ""]);
  merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: 4 } });
  aoa.push([
    `Всего: траншей ${fmt(vor.totals.length, 0)} м · земляные работы ${fmt(vor.totals.earth)} м³ · кабель ${fmt(vor.totals.cable, 0)} м`,
    "", "", "", "",
  ]);
  merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: 4 } });

  // Предупреждения
  if (vor.warnings.length > 0) {
    aoa.push([]);
    aoa.push(["ПРЕДУПРЕЖДЕНИЯ:", "", "", "", ""]);
    merges.push({ s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: 4 } });
    for (const w of vor.warnings) {
      aoa.push([w.severity === "error" ? "⛔" : "⚠️", w.text, "", "", ""]);
    }
  }

  // Подписи
  aoa.push([]);
  aoa.push(["Составил: ______________", "", "Проверил: ______________", "", ""]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 7 }, { wch: 66 }, { wch: 9 }, { wch: 14 }, { wch: 50 }];
  ws["!merges"] = merges;

  // === Лист 2 — участки ===
  const sAoa: (string | number)[][] = [
    ["Участок", "Тип траншеи", "Покрытие", "L, м", "H1, м", "H2, м", "H ср., м", "V земляных работ, м³", "Кабель, м", "Примечание"],
  ];
  for (const c of vor.calcs) {
    const surfName =
      c.seg.type === "gnb"
        ? "без вскрытия (ГНБ)"
        : state.surfaces.find((s) => s.id === c.seg.surfaceId)?.name ?? "—";
    sAoa.push([
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
  }
  sAoa.push([]);
  sAoa.push(["Итого", "", "", r2(vor.totals.length), "", "", "", r2(vor.totals.earth), r2(vor.totals.cable), ""]);

  const ws2 = XLSX.utils.aoa_to_sheet(sAoa);
  ws2["!cols"] = [
    { wch: 9 }, { wch: 22 }, { wch: 18 }, { wch: 8 }, { wch: 8 },
    { wch: 8 }, { wch: 10 }, { wch: 20 }, { wch: 11 }, { wch: 40 },
  ];

  // === Лист 3 — исходные данные ===
  const dAoa: (string | number)[][] = [
    ["ПАРАМЕТР", "ЗНАЧЕНИЕ", "", ""],
    ["Наименование объекта", state.projectName, "", ""],
    ["Шифр проекта", state.projectCode, "", ""],
    ["Класс напряжения", v.label, "", ""],
    ["Цепей в траншее", state.chains, "", ""],
    ["Типы прокладки", state.types.map((t) => TRENCH_META[t].label).join(", "), "", ""],
    [],
    ["УЧАСТОК", "ТИП", "ДЛИНА, м", "H1, м", "H2, м", "ПОКРЫТИЕ"],
  ];
  for (const s of state.segments) {
    const surf = state.surfaces.find((sf) => sf.id === s.surfaceId);
    dAoa.push([
      `${s.from}–${s.to}`,
      TRENCH_META[s.type].label,
      s.length,
      s.h1,
      s.h2,
      surf?.name ?? "—",
    ]);
  }

  const ws3 = XLSX.utils.aoa_to_sheet(dAoa);
  ws3["!cols"] = [{ wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 18 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ВОР");
  XLSX.utils.book_append_sheet(wb, ws2, "Участки");
  XLSX.utils.book_append_sheet(wb, ws3, "Исходные данные");

  const fname = `ВОР_${(state.projectCode || "КЛ").replace(/\s+/g, "_")}_${v.short.replace(/\s+/g, "")}.xlsx`;
  XLSX.writeFile(wb, fname);
}
