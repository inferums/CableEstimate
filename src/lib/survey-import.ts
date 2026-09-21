import type { Segment, Surface, TrenchType } from "./types";

/* ================================================================
   Кодировщик точек съёмки
   Префикс кода → тип траншеи, суффикс → тип покрытия
   ================================================================ */

export const CODE_TO_TRENCH: Record<string, TrenchType> = {
  OPN: "open",
  LOT: "lotok",
  BLK: "block",
  GNB: "gnb",
  SPL: "splice",
  SAF: "open",
  TROT: "open",
  GAZ: "open",
  SHEB: "open",
  NET: "open",
};

export const CODE_TO_SURFACE: Record<string, string> = {
  ASF: "road",
  SAF: "road",
  TROT: "sidewalk",
  GAZ: "lawn",
  SHEB: "gravel",
  NET: "lawn",
};

const TRENCH_PREFIXES = ["OPN", "LOT", "BLK", "GNB", "SPL"];

export function parseCode(code: string): {
  trenchType: TrenchType;
  surfaceId: string | null;
} {
  const upper = code.toUpperCase().trim();
  for (const prefix of TRENCH_PREFIXES) {
    if (upper.startsWith(prefix)) {
      const rest = upper.slice(prefix.length);
      const surfaceId = CODE_TO_SURFACE[rest] ?? null;
      return { trenchType: CODE_TO_TRENCH[prefix], surfaceId };
    }
  }
  const surfaceId = CODE_TO_SURFACE[upper] ?? null;
  return { trenchType: "open", surfaceId };
}

/* ================================================================
   Извлечение номера пикета из имени точки
   Пикет — 100 м, плюсовка — метры: ПК12+50 → 12,5; ПК12+5 → 12,05.
   ================================================================ */

export function extractPicketNumber(name: string): number {
  const m = name.match(/(\d+)(?:[+](\d+(?:[.,]\d+)?))?/);
  if (!m) return NaN;
  const whole = parseInt(m[1], 10);
  /* Плюсовка — это метры от пикета, а не дробная часть номера:
     раньше ПК12+5 давал 12,5 и вставал после ПК12+40 */
  if (m[2]) return whole + parseFloat(m[2].replace(",", ".")) / 100;
  return whole;
}

export function extractPicketName(pointName: string): string {
  const m = pointName.match(/^[A-Za-zА-Яа-я]*\d+(?:[+]\d+(?:[.,]\d+)?)?/);
  return m ? m[0] : pointName;
}

/* ================================================================
   Парсинг числовых значений (точка и запятая как десятичный разделитель)
   ================================================================ */

function parseNum(s: string): number {
  if (!s || s === "-" || s === "") return NaN;
  const cleaned = s.trim().replace(",", ".").replace(/\s/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/* ================================================================
   Авто-определение колонок по заголовкам
   ================================================================ */

/**
 * Привязка колонок файла. Координаты геодезические, как их отдают приборы и
 * каталоги координат: X — северная, Y — восточная.
 */
export interface ColumnMapping {
  nameIdx: number;
  xIdx: number;
  yIdx: number;
  zIdx: number;
  codeIdx: number;
}

const NAME_HEADERS = ["name", "имя", "название", "точка", "point", "пикет", "pk"];
const X_HEADERS = ["x", "x, м", "север", "north", "n", "northing"];
const Y_HEADERS = ["y", "y, м", "восток", "east", "e", "easting"];
const Z_HEADERS = ["z", "z, м", "н", "h", "отметка", "высота", "elevation"];
const CODE_HEADERS = ["code", "код", "коды", "кодировщик", "attribute", "атрибут", "description", "описание"];

export function autoDetectColumns(headers: string[]): Partial<ColumnMapping> {
  const result: Partial<ColumnMapping> = {};
  /* Проверка на undefined, а не на истинность: колонка с индексом 0 —
     законная, а !0 === true позволял следующему заголовку её перехватить */
  const take = (key: keyof ColumnMapping, list: string[], hl: string, i: number) => {
    if (result[key] === undefined && list.includes(hl)) {
      result[key] = i;
      return true;
    }
    return false;
  };
  headers.forEach((h, i) => {
    const hl = h.toLowerCase().trim();
    take("nameIdx", NAME_HEADERS, hl, i) ||
      take("xIdx", X_HEADERS, hl, i) ||
      take("yIdx", Y_HEADERS, hl, i) ||
      take("zIdx", Z_HEADERS, hl, i) ||
      take("codeIdx", CODE_HEADERS, hl, i);
  });
  return result;
}

/* ================================================================
   Результат начального разбора файла (для мастера импорта)
   ================================================================ */

export interface ParseResult {
  headers: string[];
  rawRows: string[][];
  separator: string;
  format: "csv" | "xlsx";
  totalLines: number;
}

/**
 * Разделить текст на заголовки и строки данных.
 * Авто-определение разделителя (; или ,).
 */
export function parseTextFile(content: string): ParseResult {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) {
    return { headers: [], rawRows: [], separator: ";", format: "csv", totalLines: 0 };
  }

  const sep = detectSeparator(lines[1]);
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const rawRows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitRow(lines[i], sep);
    if (cols.length >= 3) rawRows.push(cols);
  }

  return { headers, rawRows, separator: sep, format: "csv", totalLines: rawRows.length };
}

function detectSeparator(sampleLine: string): string {
  const sc = (sampleLine.match(/;/g) || []).length;
  const cc = (sampleLine.match(/,/g) || []).length;
  return sc > cc ? ";" : ",";
}

function splitRow(line: string, sep: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ""));
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ""));
  return result;
}

/* ================================================================
   Парсинг строк в SurveyPoint по привязке колонок
   ================================================================ */

/**
 * Точка съёмки. Система координат геодезическая: x — северная координата,
 * y — восточная. Отметка может отсутствовать — тогда z = null, а не 0:
 * нулевая отметка выглядела бы как реальная и попала бы в профиль.
 */
export interface SurveyPoint {
  name: string;
  x: number;
  y: number;
  z: number | null;
  code: string;
}

export function parseRows(
  rawRows: string[][],
  mapping: ColumnMapping,
): { points: SurveyPoint[]; warnings: string[] } {
  const { nameIdx, xIdx, yIdx, zIdx, codeIdx } = mapping;
  const points: SurveyPoint[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const name = (row[nameIdx] ?? "").trim();
    const x = parseNum(row[xIdx] ?? "");
    const y = parseNum(row[yIdx] ?? "");
    const z = parseNum(row[zIdx] ?? "");
    const code = (row[codeIdx] ?? "").trim();

    if (!name) continue;
    if (isNaN(x) || isNaN(y)) {
      warnings.push(`Строка ${i + 2} (${name}): некорректные координаты`);
      continue;
    }

    points.push({ name, x, y, z: isNaN(z) ? null : z, code });
  }

  return { points, warnings };
}

/* ================================================================
   Автосборка участков из точек съёмки
   ================================================================ */

export interface AssembledSegment {
  from: string;
  to: string;
  type: TrenchType;
  /** Горизонтальное проложение между пикетами по координатам, м */
  length: number;
  /** Наклонная длина с учётом перепада отметок, м */
  slopeLength: number;
  h1: number;
  h2: number;
  surfaceId: string;
  /** Отметки земли; null — в съёмке у пикета не было отметки */
  groundElev1: number | null;
  groundElev2: number | null;
  /** Плановое положение пикетов: x — север, y — восток */
  planX1: number;
  planY1: number;
  planX2: number;
  planY2: number;
  pointCount: number;
}

export interface AssembleResult {
  points: SurveyPoint[];
  segments: AssembledSegment[];
  warnings: string[];
}

let segCounter = 5000;

const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Пикеты ближе этого расстояния считаем совпадающими — это ошибка съёмки */
const MIN_PICKET_DISTANCE = 0.05;

export function autoAssemble(
  points: SurveyPoint[],
  surfaces: Surface[],
  designDepth: number,
): AssembleResult {
  const warnings: string[] = [];
  if (points.length < 2) {
    return { points, segments: [], warnings: ["Менее 2 точек — невозможно построить участки"] };
  }

  // 1. Группируем точки по имени пикета
  const picketMap = new Map<
    string,
    { num: number; name: string; points: SurveyPoint[] }
  >();

  for (const pt of points) {
    const pkName = extractPicketName(pt.name);
    const pkNum = extractPicketNumber(pt.name);
    if (!picketMap.has(pkName)) {
      picketMap.set(pkName, { num: isNaN(pkNum) ? picketMap.size : pkNum, name: pkName, points: [] });
    }
    picketMap.get(pkName)!.points.push(pt);
  }

  // 2. Сортируем пикеты по номеру
  const sorted = [...picketMap.values()].sort((a, b) => a.num - b.num);

  if (sorted.length < 2) {
    return {
      points,
      segments: [],
      warnings: [`Все точки имеют один пикет (${sorted[0]?.name}) — нужно минимум 2 пикета`],
    };
  }

  /* 3. Положение пикета — центр его точек. Если пикет снят несколькими
     точками поперёк траншеи (бровки), центр ложится на ось трассы. */
  const pickets = sorted.map((pk) => {
    const zs = pk.points.map((p) => p.z).filter((z): z is number => z !== null);
    const mainCode = pk.points[0].code;
    const parsed = parseCode(mainCode);
    return {
      name: pk.name,
      num: pk.num,
      x: mean(pk.points.map((p) => p.x)),
      y: mean(pk.points.map((p) => p.y)),
      elevation: zs.length > 0 ? mean(zs) : null,
      code: mainCode,
      trenchType: parsed.trenchType,
      surfaceId:
        parsed.surfaceId ??
        (surfaces.length > 0 ? surfaces[0].id : "lawn"),
      pointCount: pk.points.length,
    };
  });

  // 4. Собираем участки между последовательными пикетами
  const segments: AssembledSegment[] = [];
  const coincident: string[] = [];

  for (let i = 0; i < pickets.length - 1; i++) {
    const p1 = pickets[i];
    const p2 = pickets[i + 1];

    /* Горизонтальное проложение — по плановым координатам пикетов */
    const horizDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (horizDist < MIN_PICKET_DISTANCE) coincident.push(`${p1.name}–${p2.name}`);

    /* Наклонная длина учитывает перепад земли; без отметок она равна горизонтальной */
    const dz = p1.elevation !== null && p2.elevation !== null ? p2.elevation - p1.elevation : 0;
    const slopeDist = Math.hypot(horizDist, dz);

    segments.push({
      from: p1.name,
      to: p2.name,
      type: p1.trenchType,
      length: round(horizDist, 2),
      slopeLength: round(slopeDist, 2),
      h1: designDepth,
      h2: designDepth,
      surfaceId: p1.surfaceId,
      groundElev1: p1.elevation === null ? null : round(p1.elevation, 3),
      groundElev2: p2.elevation === null ? null : round(p2.elevation, 3),
      planX1: round(p1.x, 3),
      planY1: round(p1.y, 3),
      planX2: round(p2.x, 3),
      planY2: round(p2.y, 3),
      pointCount: p1.pointCount + p2.pointCount,
    });
  }

  // 5. Предупреждения
  if (coincident.length > 0) {
    warnings.push(`Совпадающие пикеты (участок нулевой длины): ${coincident.join(", ")}`);
  }

  const noCode = pickets.filter((p) => !p.code);
  if (noCode.length > 0) {
    warnings.push(`${noCode.length} пикет(ов) без кода — тип прокладки принят по умолчанию`);
  }

  const noElev = pickets.filter((p) => p.elevation === null);
  if (noElev.length > 0) {
    warnings.push(`${noElev.length} пикет(ов) без отметки — профиль будет построен относительно поверхности`);
  }

  return { points, segments, warnings };
}

/* ================================================================
   Конвертация собранных участков в Segment для ProjectState
   ================================================================ */

export function toSegments(assembled: AssembledSegment[]): Segment[] {
  return assembled.map((a) => ({
    id: `imp${++segCounter}`,
    from: a.from,
    to: a.to,
    type: a.type,
    length: a.length,
    h1: a.h1,
    h2: a.h2,
    surfaceId: a.surfaceId,
    slopeLength: a.slopeLength,
    /* Отсутствующая отметка не превращается в ноль */
    groundElev1: a.groundElev1 ?? undefined,
    groundElev2: a.groundElev2 ?? undefined,
    planX1: a.planX1,
    planY1: a.planY1,
    planX2: a.planX2,
    planY2: a.planY2,
  }));
}

/* ================================================================
   Парсинг Excel-файла (.xlsx) через библиотеку exceljs
   ================================================================ */

/** Значение ячейки в виде строки: формулы, даты и форматированный текст тоже */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toLocaleDateString("ru-RU");
  const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[]; hyperlink?: string };
  if (Array.isArray(o.richText)) return o.richText.map((p) => p.text).join("").trim();
  if (o.result !== undefined) return cellText(o.result);
  if (typeof o.text === "string") return o.text.trim();
  return "";
}

export async function parseExcelFile(
  arrayBuffer: ArrayBuffer,
): Promise<ParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  const ws = wb.worksheets[0];
  const empty: ParseResult = { headers: [], rawRows: [], separator: ";", format: "xlsx", totalLines: 0 };
  if (!ws) return empty;

  /* row.values — массив с единицы: нулевой элемент не используется */
  const width = ws.columnCount;
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as unknown[];
    const line: string[] = [];
    for (let c = 1; c <= width; c++) line.push(cellText(values[c]));
    rows.push(line);
  });

  if (rows.length < 2) return empty;

  const headers = rows[0].map((h) => h.trim());
  const rawRows = rows.slice(1).filter((r) => r.some((c) => c !== ""));

  return { headers, rawRows, separator: ";", format: "xlsx", totalLines: rawRows.length };
}

/** Универсальный парсер: определяет формат по расширению имени файла */
export async function parseSurveyFile(
  content: string | ArrayBuffer,
  fileName: string,
): Promise<ParseResult> {
  const name = fileName.toLowerCase();
  /* Старый двоичный .xls не читается: его надо пересохранить в .xlsx */
  if (name.endsWith(".xls")) {
    throw new Error("Формат .xls не поддерживается — пересохраните файл как .xlsx");
  }
  if (name.endsWith(".xlsx")) {
    return parseExcelFile(content as ArrayBuffer);
  }
  return parseTextFile(content as string);
}