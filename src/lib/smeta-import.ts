import type ExcelJS from "exceljs";

/*
 * Разбор локальных смет из выгрузки в Excel (ГРАНД-Смета и совместимые).
 *
 * В такой выгрузке позиции идут вперемешку со строками ресурсов: под каждой
 * позицией — затраты труда, машины, материалы. Позицию отличает номер в
 * первой графе вместе с обоснованием (расценкой) и единицей измерения;
 * у строк ресурсов номера позиции нет.
 *
 * Объём позиции берётся из графы «всего с учётом коэффициентов», а если она
 * пуста — из графы «на единицу измерения»: в сметах без коэффициентов
 * заполнена только вторая.
 */

export interface SmetaPosition {
  id: string;
  /** Лист книги — обычно номер локальной сметы */
  sheet: string;
  /** Раздел сметы, если он объявлен */
  section: string;
  /** Номер позиции в смете */
  no: string;
  /** Обоснование: шифр расценки */
  code: string;
  name: string;
  /** Единица как написана в смете, например «1000 м3» */
  unit: string;
  /** Объём в единицах сметы */
  qty: number;
  /** Множитель из единицы: у «1000 м3» это 1000 */
  factor: number;
  /** Единица без множителя, приведённая к сравнимому виду */
  baseUnit: string;
  /** Объём в базовых единицах — им и сверяемся с ведомостью */
  qtyBase: number;
}

export interface SmetaImport {
  fileName: string;
  importedAt: string;
  positions: SmetaPosition[];
  warnings: string[];
}

/** Текст ячейки: формулы, форматированный текст и числа приводятся к строке */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.replace(/\s+/g, " ").trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
  if (Array.isArray(o.richText)) return o.richText.map((p) => p.text).join("").replace(/\s+/g, " ").trim();
  if (o.result !== undefined) return cellText(o.result);
  if (typeof o.text === "string") return o.text.replace(/\s+/g, " ").trim();
  return "";
}

const toNum = (s: string): number => {
  /* Number("") равно нулю — пустая графа не должна обнулять объём */
  if (!s.trim()) return NaN;
  const cleaned = s.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Единица измерения в смете часто идёт с множителем: «1000 м3», «100 м».
 * Без его учёта сверка ошибается на порядок.
 */
export function parseUnit(u: string): { factor: number; unit: string } {
  const m = u.trim().match(/^(\d+(?:[.,]\d+)?)\s*(\S.*)$/);
  if (!m) return { factor: 1, unit: normUnit(u) };
  const f = Number(m[1].replace(",", "."));
  return Number.isFinite(f) && f > 0 ? { factor: f, unit: normUnit(m[2]) } : { factor: 1, unit: normUnit(u) };
}

/** Номер позиции: «1», «12.1», «2 О» — но не «Раздел 1» и не пустая графа */
const isPositionNo = (s: string) => /^\d+(\.\d+)*( ?[A-Za-zА-Яа-я]{1,3})?$/.test(s);

interface Columns {
  no: number;
  code: number;
  name: number;
  unit: number;
  qtyUnit: number;
  qtyTotal: number;
}

/** Ищет шапку таблицы и возвращает номера граф */
function findColumns(ws: ExcelJS.Worksheet): { columns: Columns; headerRow: number } | null {
  const limit = Math.min(ws.rowCount, 200);
  for (let r = 1; r <= limit; r++) {
    const row = ws.getRow(r);
    let no = 0;
    for (let c = 1; c <= Math.min(ws.columnCount, 40); c++) {
      if (cellText(row.getCell(c).value) === "№ п/п") { no = c; break; }
    }
    if (!no) continue;

    /* Заголовки граф могут стоять в объединённых ячейках на нескольких строках */
    const find = (re: RegExp, upto = 3) => {
      for (let rr = r; rr < r + upto; rr++) {
        const rw = ws.getRow(rr);
        for (let c = 1; c <= Math.min(ws.columnCount, 40); c++) {
          if (re.test(cellText(rw.getCell(c).value))) return c;
        }
      }
      return 0;
    };
    const code = find(/^Обоснование$/);
    const name = find(/^Наименование работ и затрат/);
    const unit = find(/^Единица измерения$/);
    const qtyUnit = find(/^на единицу измерения$/);
    const qtyTotal = find(/^всего с уч[её]том коэффициентов$/i);

    if (code && name && unit) {
      return { columns: { no, code, name, unit, qtyUnit: qtyUnit || unit + 1, qtyTotal }, headerRow: r };
    }
  }
  return null;
}

/**
 * Разбирает книгу сметы. Листы без узнаваемой шапки пропускаются — в файле
 * обычно есть сводный расчёт и другие листы не того формата.
 */
export function parseSmetaWorkbook(wb: ExcelJS.Workbook, fileName: string): SmetaImport {
  const positions: SmetaPosition[] = [];
  const warnings: string[] = [];
  const skipped: string[] = [];

  for (const ws of wb.worksheets) {
    const found = findColumns(ws);
    if (!found) { skipped.push(ws.name); continue; }
    const { columns: col, headerRow } = found;

    let section = "";
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const no = cellText(row.getCell(col.no).value);

      /* \b здесь не работает: кириллица не входит в \w */
      if (/^Раздел[\s:.]/i.test(no)) {
        section = no.replace(/^Раздел:?\s*/i, "");
        continue;
      }
      if (!isPositionNo(no)) continue;

      const name = cellText(row.getCell(col.name).value);
      const unit = cellText(row.getCell(col.unit).value);
      if (!name || !unit) continue;
      /* Строка с номерами граф («1», «2», «3», …) — не позиция */
      if (no === "1" && cellText(row.getCell(col.code).value) === "2" && name === "3") continue;

      const total = col.qtyTotal ? toNum(cellText(row.getCell(col.qtyTotal).value)) : NaN;
      const perUnit = toNum(cellText(row.getCell(col.qtyUnit).value));
      const qty = Number.isFinite(total) ? total : perUnit;
      if (!Number.isFinite(qty)) continue;

      positions.push({
        id: `${ws.name}:${no}`,
        sheet: ws.name,
        section,
        no,
        code: cellText(row.getCell(col.code).value),
        name,
        unit,
        qty,
        factor: parseUnit(unit).factor,
        baseUnit: parseUnit(unit).unit,
        qtyBase: qty * parseUnit(unit).factor,
      });
    }
  }

  if (positions.length === 0) {
    warnings.push("В файле не найдено ни одной позиции сметы — проверьте, что это выгрузка локальных смет в Excel.");
  }
  if (skipped.length > 0) {
    warnings.push(`Пропущены листы без таблицы позиций: ${skipped.join(", ")}.`);
  }

  return { fileName, importedAt: new Date().toISOString(), positions, warnings };
}

export async function parseSmetaFile(buffer: ArrayBuffer, fileName: string): Promise<SmetaImport> {
  const Excel = (await import("exceljs")).default;
  const wb = new Excel.Workbook();
  await wb.xlsx.load(buffer);
  return parseSmetaWorkbook(wb, fileName);
}

/* ================= сопоставление со сметой ================= */

const STOP = new Set(["и", "в", "с", "на", "из", "по", "для", "до", "от", "к", "при", "под", "над"]);

/** Слова наименования, приведённые к сравнимому виду */
export function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[«»"(),.;:\-–—/]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    /* Окончания русских слов отбрасываем грубо: «лотков» и «лоток» — одно и то же */
    .map((w) => w.slice(0, 6));
}

/** Схожесть наименований, 0…1 — доля общих слов */
export function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.max(ta.size, tb.size);
}

/** Наименьшая схожесть, при которой предлагаем позицию сметы */
export const MATCH_THRESHOLD = 0.34;

/**
 * Подбирает позицию сметы к позиции ведомости. Совпадение единицы измерения
 * обязательно: «м» и «м³» — разные работы, даже если названы похоже.
 */
export function suggestMatch(
  vorName: string,
  unit: string,
  positions: SmetaPosition[],
): { position: SmetaPosition; score: number } | null {
  let best: { position: SmetaPosition; score: number } | null = null;
  for (const p of positions) {
    if (p.baseUnit !== normUnit(unit)) continue;
    const score = similarity(vorName, p.name);
    if (!best || score > best.score) best = { position: p, score };
  }
  return best && best.score >= MATCH_THRESHOLD ? best : null;
}

/** Единицы измерения пишут по-разному: «м3», «м³», «куб.м» */
export function normUnit(u: string): string {
  const s = u.toLowerCase().replace(/\s|\./g, "");
  if (/^(м3|м³|куб?м|кубм)$/.test(s)) return "м3";
  if (/^(м2|м²|кв?м|квм)$/.test(s)) return "м2";
  if (/^(шт|штук)$/.test(s)) return "шт";
  if (/^(т|тонн|тонна)$/.test(s)) return "т";
  if (/^(компл|комплект)$/.test(s)) return "компл";
  return s;
}
