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
   PK0 → 0, PK7 → 7, PK12+50 → 12.5, ПКТ7 → 7
   ================================================================ */

export function extractPicketNumber(name: string): number {
  const m = name.match(/(\d+)(?:[+](\d+))?/);
  if (!m) return NaN;
  const whole = parseInt(m[1], 10);
  if (m[2]) {
    const pkPlus = parseInt(m[2], 10);
    const digits = m[2].length;
    return whole + pkPlus / Math.pow(10, digits);
  }
  return whole;
}

export function extractPicketName(pointName: string): string {
  const m = pointName.match(/^[A-Za-zА-Яа-я]*\d+(?:[+]\d+)?/);
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

export interface ColumnMapping {
  nameIdx: number;
  xIdx: number;
  yIdx: number;
  zIdx: number;
  codeIdx: number;
}

export function autoDetectColumns(headers: string[]): Partial<ColumnMapping> {
  const result: Partial<ColumnMapping> = {};
  headers.forEach((h, i) => {
    const hl = h.toLowerCase().trim();
    if (
      !result.nameIdx &&
      (hl === "name" ||
        hl === "имя" ||
        hl === "название" ||
        hl === "точка" ||
        hl === "point" ||
        hl === "пикет" ||
        hl === "pk")
    ) {
      result.nameIdx = i;
    } else if (
      result.xIdx === undefined &&
      (hl === "x" || hl === "x, м" || hl === "восток" || hl === "east")
    ) {
      result.xIdx = i;
    } else if (
      result.yIdx === undefined &&
      (hl === "y" || hl === "y, м" || hl === "север" || hl === "north")
    ) {
      result.yIdx = i;
    } else if (
      result.zIdx === undefined &&
      (hl === "z" ||
        hl === "z, м" ||
        hl === "н" ||
        hl === "h" ||
        hl === "отметка" ||
        hl === "высота" ||
        hl === "elevation")
    ) {
      result.zIdx = i;
    } else if (
      result.codeIdx === undefined &&
      (hl === "code" ||
        hl === "код" ||
        hl === "коды" ||
        hl === "кодировщик" ||
        hl === "attribute" ||
        hl === "атрибут" ||
        hl === "description" ||
        hl === "описание")
    ) {
      result.codeIdx = i;
    }
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

export interface SurveyPoint {
  name: string;
  x: number;
  y: number;
  z: number;
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

    points.push({ name, x, y, z: isNaN(z) ? 0 : z, code });
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
  length: number;
  slopeLength: number;
  h1: number;
  h2: number;
  surfaceId: string;
  groundElev1: number;
  groundElev2: number;
  pointCount: number;
}

export interface AssembleResult {
  points: SurveyPoint[];
  segments: AssembledSegment[];
  warnings: string[];
}

let segCounter = 5000;

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

  // 3. Для каждого пикета — средний код, средняя отметка
  const pickets = sorted.map((pk) => {
    const avgZ =
      pk.points.reduce((s, p) => s + p.z, 0) / pk.points.length;
    const mainCode = pk.points[0].code;
    const parsed = parseCode(mainCode);
    return {
      name: pk.name,
      num: pk.num,
      elevation: avgZ,
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

  for (let i = 0; i < pickets.length - 1; i++) {
    const p1 = pickets[i];
    const p2 = pickets[i + 1];

    const dx = 0; // координаты пока не используются для расстояния
    const dy = 0;
    const dz_ground = p2.elevation - p1.elevation;

    // Горизонтальное расстояние — из координат XY, если есть
    // Пока используем 0, т.к. реальные координаты будут в реальных данных
    // Для демо — задаём условное расстояние 10м между пикетами
    const horizDist = 10; // TODO: вычислять из реальных XY-координат

    const slopeDist = Math.sqrt(horizDist * horizDist + dz_ground * dz_ground);

    segments.push({
      from: p1.name,
      to: p2.name,
      type: p1.trenchType,
      length: Math.round(horizDist * 100) / 100,
      slopeLength: Math.round(slopeDist * 100) / 100,
      h1: designDepth,
      h2: designDepth,
      surfaceId: p1.surfaceId,
      groundElev1: Math.round(p1.elevation * 1000) / 1000,
      groundElev2: Math.round(p2.elevation * 1000) / 1000,
      pointCount: p1.pointCount + p2.pointCount,
    });
  }

  // 5. Предупреждения
  const noCode = pickets.filter((p) => !p.code);
  if (noCode.length > 0) {
    warnings.push(`${noCode.length} пикет(ов) без кода — тип прокладки принят по умолчанию`);
  }

  const noElev = pickets.filter((p) => p.elevation === 0);
  if (noElev.length > 0) {
    warnings.push(`${noElev.length} пикет(ов) без отметки`);
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
    groundElev1: a.groundElev1,
    groundElev2: a.groundElev2,
  }));
}

/* ================================================================
   Парсинг Excel-файла (.xlsx) через библиотеку xlsx
   ================================================================ */

export async function parseExcelFile(
  arrayBuffer: ArrayBuffer,
): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: (string | number | boolean)[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
  });

  if (rows.length < 2) {
    return { headers: [], rawRows: [], separator: ";", format: "xlsx", totalLines: 0 };
  }

  const headers = rows[0].map((h) => String(h).trim());
  const rawRows = rows
    .slice(1)
    .filter((r) => r.some((c) => c !== ""))
    .map((r) => r.map((c) => String(c).trim()));

  return { headers, rawRows, separator: ";", format: "xlsx", totalLines: rawRows.length };
}

/** Универсальный парсер: определяет формат по расширению имени файла */
export async function parseSurveyFile(
  content: string | ArrayBuffer,
  fileName: string,
): Promise<ParseResult> {
  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    return parseExcelFile(content as ArrayBuffer);
  }
  return parseTextFile(content as string);
}
