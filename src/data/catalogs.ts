import type { Surface, TrenchType, VoltageClass } from "../lib/types";

/** Стандартные наружные диаметры труб ПНД (ПЭ100), мм */
export const HDPE_DIAMETERS = [
  32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315,
  355, 400, 450, 500, 630,
];

/** Диаметры расширения скважины ГНБ, мм (интервал 100, до 1000) */
export const BORE_DIAMETERS = [200, 300, 400, 500, 600, 700, 800, 900, 1000];

export interface TrayMark {
  mark: string;
  innerW: number; // мм, ширина канала в свету
  innerH: number; // мм, высота канала в свету
  length: number; // мм
  weight: number; // т / шт
}

/** Лотки типа Л по Серии 3.006.1-2 */
export const TRAYS: TrayMark[] = [
  { mark: "Л4-8", innerW: 400, innerH: 600, length: 1180, weight: 0.74 },
  { mark: "Л5-8", innerW: 500, innerH: 600, length: 1180, weight: 0.8 },
  { mark: "Л6-8", innerW: 600, innerH: 600, length: 1180, weight: 0.86 },
  { mark: "Л7-8", innerW: 700, innerH: 600, length: 1180, weight: 0.92 },
  { mark: "Л4-8/2", innerW: 400, innerH: 600, length: 590, weight: 0.37 },
  { mark: "Л5-8/2", innerW: 500, innerH: 600, length: 590, weight: 0.4 },
  { mark: "Л6-8/2", innerW: 600, innerH: 600, length: 590, weight: 0.43 },
  { mark: "Л7-8/2", innerW: 700, innerH: 600, length: 590, weight: 0.46 },
];

export interface PlateMark {
  mark: string;
  forWidth: number; // для канала шириной, мм
  length: number; // мм
  weight: number; // т / шт
  load: string;
}

/** Плиты перекрытия (покрытия) типа П по Серии 3.006.1-2 */
export const PLATES: PlateMark[] = [
  { mark: "П5-8", forWidth: 500, length: 790, weight: 0.24, load: "до 10 тс" },
  { mark: "П6-8", forWidth: 600, length: 790, weight: 0.28, load: "до 10 тс" },
  { mark: "П7-8", forWidth: 700, length: 790, weight: 0.33, load: "до 10 тс" },
  { mark: "П5д-8", forWidth: 500, length: 790, weight: 0.31, load: "Н-30 (тяж.)" },
  { mark: "П6д-8", forWidth: 600, length: 790, weight: 0.36, load: "Н-30 (тяж.)" },
  { mark: "П7д-8", forWidth: 700, length: 790, weight: 0.41, load: "Н-30 (тяж.)" },
];

export const PZK = {
  mark: "ПЗК 250.124.50",
  dims: "250×124×50 мм",
  length: 250, // мм
  w: 250, // мм
  h: 124, // мм
  t: 50, // мм
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
  splice: {
    letter: "д",
    label: "Муфтовое поле",
    short: "муфтовое поле",
    desc: "котлован для монтажа соединительных муфт",
  },
};

/** Покрытия для благоустройства (по умолчанию) */
export const DEFAULT_SURFACES: Surface[] = [
  {
    id: "lawn",
    name: "Газон",
    layers: [{ name: "Растительный (плодородный) грунт", thickness: 20 }],
  },
  {
    id: "sidewalk",
    name: "Тротуар",
    layers: [
      { name: "Плитка тротуарная", thickness: 6 },
      { name: "Песок", thickness: 5 },
      { name: "Щебень", thickness: 15 },
    ],
  },
  {
    id: "path",
    name: "Набивная дорожка",
    layers: [
      { name: "Щебень", thickness: 10 },
      { name: "Песок", thickness: 5 },
    ],
  },
  {
    id: "road",
    name: "Проезжая часть",
    layers: [
      { name: "Асфальтобетон (верхний слой)", thickness: 5 },
      { name: "Асфальтобетон (нижний слой)", thickness: 6 },
      { name: "Щебень", thickness: 15 },
    ],
  },
  {
    id: "gravel",
    name: "Щебеночная дорога",
    layers: [
      { name: "Щебень", thickness: 15 },
      { name: "ПГС", thickness: 10 },
    ],
  },
];

/** Константы расчета */
export const CALC = {
  topFill: 0.1, // засыпка песком/ПГС поверх конструкций, м
  spacerStep: 1.5, // шаг дистанционных фиксаторов, м
  slopeDepth: 1.5, // глубина, свыше которой учитываются откосы
  slopeK: 0.5, // заложение откосов m (СП 45.13330, песчаный грунт)
  wallThk: 0.07, // стенка лотка, м

  // Новые параметры
  minDepth: 0.7, // минимальная глубина по ПУЭ 2.3.84, м
  handWorkShare: 0.05, // доля ручной доработки дна от объёма разработки
  compactionFactor: 1.15, // коэффициент уплотнения песка/ПГС при закупке
  soilLoosen: 1.2, // коэффициент разрыхления грунта при вывозе
  sludgeFactor: 1.3, // коэффициент бурового шлама ГНБ
  gnbPitVolume: 4, // объём одного приямка ГНБ, м³
  cableReserve: 0.02, // запас кабеля на прокладку (2%)
  cableStripLength: 3, // запас кабеля на разделку в муфте, м
  trayWall: 70, // толщина стенки лотка, мм
  trayBottom: 70, // толщина дна лотка, мм
  trayPlateH: 100, // высота плиты перекрытия лотка, мм
  concreteDensity: 2.5, // плотность железобетона, т/м³
  rehabWiden: 0.15, // уширение при благоустройстве, м
};
