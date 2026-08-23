import type { TrenchType, VoltageClass } from "../lib/types";

/** Стандартные наружные диаметры труб ПНД (ПЭ100), мм */
export const HDPE_DIAMETERS = [
  32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315,
  355, 400, 450, 500, 630,
];

/** Диаметры расширения скважины ГНБ, мм */
export const BORE_DIAMETERS = [160, 200, 250, 315, 400, 500, 630];

export interface TrayMark {
  mark: string;
  innerW: number; // мм, ширина канала в свету
  innerH: number; // мм, высота канала в свету
  length: number; // мм
  weight: number; // т / шт
}

/** Лотки ЛК по Серии 3.006.1-2.87 (вып. 1) */
export const TRAYS: TrayMark[] = [
  { mark: "ЛК 75.60.60-1", innerW: 750, innerH: 600, length: 590, weight: 0.53 },
  { mark: "ЛК 75.90.60-1", innerW: 750, innerH: 900, length: 590, weight: 0.64 },
  { mark: "ЛК 75.120.60-1", innerW: 750, innerH: 1200, length: 590, weight: 0.75 },
  { mark: "ЛК 75.180.60-1", innerW: 750, innerH: 1800, length: 590, weight: 0.97 },
  { mark: "ЛК 120.60.60-1", innerW: 1200, innerH: 600, length: 590, weight: 0.72 },
  { mark: "ЛК 120.120.60-1", innerW: 1200, innerH: 1200, length: 590, weight: 0.95 },
  { mark: "ЛК 150.60.60-1", innerW: 1500, innerH: 600, length: 590, weight: 0.84 },
  { mark: "ЛК 150.120.60-1", innerW: 1500, innerH: 1200, length: 590, weight: 1.1 },
  { mark: "ЛК 180.120.60-1", innerW: 1800, innerH: 1200, length: 590, weight: 1.24 },
];

export interface PlateMark {
  mark: string;
  forWidth: number; // для канала шириной, мм
  length: number; // мм
  weight: number; // т / шт
  load: string;
}

/** Плиты перекрытия П / ПТ по Серии 3.006.1-2.87 (вып. 1) */
export const PLATES: PlateMark[] = [
  { mark: "П 75.120.16-3", forWidth: 750, length: 1190, weight: 0.3, load: "до 10 тс" },
  { mark: "ПТ 75.120.20-3", forWidth: 750, length: 1190, weight: 0.4, load: "Н-30 (тяж.)" },
  { mark: "П 120.120.16-3", forWidth: 1200, length: 1190, weight: 0.36, load: "до 10 тс" },
  { mark: "ПТ 120.120.20-3", forWidth: 1200, length: 1190, weight: 0.48, load: "Н-30 (тяж.)" },
  { mark: "П 150.120.16-3", forWidth: 1500, length: 1190, weight: 0.42, load: "до 10 тс" },
  { mark: "ПТ 150.120.20-3", forWidth: 1500, length: 1190, weight: 0.55, load: "Н-30 (тяж.)" },
  { mark: "П 180.120.16-3", forWidth: 1800, length: 1190, weight: 0.47, load: "до 10 тс" },
  { mark: "ПТ 180.120.20-3", forWidth: 1800, length: 1190, weight: 0.61, load: "Н-30 (тяж.)" },
];

export const PZK = {
  mark: "ПЗК 250.124.50",
  dims: "250×124×50 мм",
  length: 250, // мм
  desc: "плита защитная кабельная",
};

export const VOLTAGE_META: Record<
  VoltageClass,
  { label: string; short: string; cablesPerChain: number; cableNote: string }
> = {
  "0.4-10": {
    label: "0,4 – 10 кВ",
    short: "0,4-10 кВ",
    cablesPerChain: 1,
    cableNote: "кабель трёхжильный, 1 кабель на цепь",
  },
  "35": {
    label: "35 кВ",
    short: "35 кВ",
    cablesPerChain: 3,
    cableNote: "кабель одножильный, 3 кабеля на цепь",
  },
  "110-220": {
    label: "110 – 220 кВ",
    short: "110-220 кВ",
    cablesPerChain: 3,
    cableNote: "кабель одножильный, 3 кабеля на цепь",
  },
};

export const TRENCH_META: Record<
  TrenchType,
  { letter: string; label: string; short: string; desc: string }
> = {
  gnb: {
    letter: "а",
    label: "ГНБ",
    short: "ГНБ",
    desc: "горизонтальное направленное бурение",
  },
  block: {
    letter: "б",
    label: "Трубные блоки",
    short: "трубные блоки",
    desc: "пучок труб ПНД в траншее",
  },
  lotok: {
    letter: "в",
    label: "Лотки",
    short: "лотки",
    desc: "канал из лотковых элементов",
  },
  open: {
    letter: "г",
    label: "Открытым способом",
    short: "открытая прокладка",
    desc: "кабель в траншее с защитой",
  },
};

/** Константы расчета */
export const CALC = {
  topFill: 0.1, // засыпка песком/ПГС поверх конструкций, м
  trayLength: 0.59, // длина лотка, м
  plateLength: 1.19, // длина плиты перекрытия, м
  spacerStep: 1.5, // шаг дистанционных фиксаторов, м
  slopeDepth: 1.5, // глубина, свыше которой учитываются откосы
  slopeK: 1.15, // коэффициент откосов
  wallThk: 0.07, // стенка/дно лотка, м
};
