import type { Surface, TrenchType, VoltageClass } from "../lib/types";

/** Стандартные наружные диаметры труб ПНД (ПЭ100), мм */
export const HDPE_DIAMETERS = [
  32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315,
  355, 400, 450, 500, 630,
];

/** Диаметры расширения скважины ГНБ, мм (интервал 100, до 1000) */
export const BORE_DIAMETERS = [200, 300, 400, 500, 600, 700, 800, 900, 1000];

/*
 * Лотки и плиты перекрытия — серия 3.006.1-2.87 (лотки — вып. 1, плиты — вып. 2).
 *
 * Размеры приведены габаритные (наружные), как в номенклатуре серии. Внутренний
 * канал в свету здесь не хранится: он выводится из габарита за вычетом стенок
 * (см. trayInnerW / trayInnerH), потому что для расчёта важны именно наружные
 * размеры — они определяют вытеснение грунта и посадку лотка в траншею.
 *
 * Объём бетона взят из номенклатуры, а не вычислен из габаритов: лоток
 * П-образный, и габаритный параллелепипед включает пустоту канала, из-за чего
 * расход бетона завышается примерно вдвое.
 *
 * Длины конструктивные: 5970 мм при номинальной 6000, 2970 при номинальной 3000
 * (разница — зазор в стыке). Исполнение «/2» — половинной длины, «д» — доборное.
 */

export interface TrayMark {
  mark: string;
  length: number; // мм, конструктивная длина
  width: number; // мм, наружная ширина
  height: number; // мм, наружная высота
  volume: number; // м³ бетона на изделие
  weight: number; // т / шт
}

/** Лотки типа Л, класс нагрузки 8 тс/м² — серия 3.006.1-2.87 вып. 1 */
export const TRAYS: TrayMark[] = [
  { mark: "Л3-8", length: 5970, width: 780, height: 380, volume: 0.6, weight: 1.5 },
  { mark: "Л3-8/2", length: 2970, width: 780, height: 380, volume: 0.3, weight: 0.75 },
  { mark: "Л3д-8", length: 720, width: 780, height: 380, volume: 0.075, weight: 0.19 },
  { mark: "Л4-8", length: 5970, width: 780, height: 530, volume: 0.72, weight: 1.8 },
  { mark: "Л4-8/2", length: 2970, width: 780, height: 530, volume: 0.36, weight: 0.9 },
  { mark: "Л4д-8", length: 720, width: 780, height: 530, volume: 0.09, weight: 0.23 },
  { mark: "Л5-8", length: 5970, width: 780, height: 680, volume: 0.88, weight: 2.25 },
  { mark: "Л5-8/2", length: 2970, width: 780, height: 680, volume: 0.44, weight: 1.13 },
  { mark: "Л5д-8", length: 720, width: 780, height: 680, volume: 0.11, weight: 0.28 },
  { mark: "Л6-8", length: 5970, width: 1160, height: 530, volume: 0.9, weight: 2.25 },
  { mark: "Л6-8/2", length: 2970, width: 1160, height: 530, volume: 0.45, weight: 1.13 },
  { mark: "Л6д-8", length: 720, width: 1160, height: 530, volume: 0.11, weight: 0.28 },
  { mark: "Л7-8", length: 5970, width: 1160, height: 680, volume: 1.06, weight: 2.7 },
  { mark: "Л7-8/2", length: 2970, width: 1160, height: 680, volume: 0.53, weight: 1.33 },
  { mark: "Л7д-8", length: 720, width: 1160, height: 680, volume: 0.14, weight: 0.35 },
  { mark: "Л8-8", length: 5970, width: 1160, height: 1000, volume: 1.56, weight: 3.9 },
  { mark: "Л8-8/2", length: 2970, width: 1160, height: 1000, volume: 0.78, weight: 1.95 },
  { mark: "Л8д-8", length: 720, width: 1160, height: 1000, volume: 0.2, weight: 0.5 },
  { mark: "Л9-8", length: 5970, width: 1160, height: 1310, volume: 2.04, weight: 5.1 },
  { mark: "Л9-8/2", length: 2970, width: 1160, height: 1310, volume: 1.02, weight: 2.55 },
  { mark: "Л9д-8", length: 720, width: 1160, height: 1310, volume: 0.26, weight: 0.65 },
];

export interface PlateMark {
  mark: string;
  length: number; // мм
  width: number; // мм — должна совпадать с наружной шириной лотка
  thickness: number; // мм
  volume: number; // м³ бетона на изделие
  weight: number; // т / шт
  load: string; // расчётная нагрузка
}

/** Плиты перекрытия типа П — серия 3.006.1-2.87 вып. 2 */
export const PLATES: PlateMark[] = [
  /* под лотки шириной 780 мм (Л3…Л5) */
  { mark: "П5-8", length: 2990, width: 780, thickness: 70, volume: 0.16, weight: 0.41, load: "8 тс/м²" },
  { mark: "П5-8/2", length: 1490, width: 780, thickness: 70, volume: 0.08, weight: 0.2, load: "8 тс/м²" },
  { mark: "П5д-8", length: 740, width: 780, thickness: 70, volume: 0.04, weight: 0.1, load: "8 тс/м²" },
  { mark: "П6-15", length: 2990, width: 780, thickness: 120, volume: 0.28, weight: 0.7, load: "15 тс/м²" },
  { mark: "П6-15/2", length: 1490, width: 780, thickness: 120, volume: 0.14, weight: 0.35, load: "15 тс/м²" },
  { mark: "П6д-15", length: 740, width: 780, thickness: 120, volume: 0.07, weight: 0.17, load: "15 тс/м²" },
  /* под лотки шириной 1160 мм (Л6…Л9) */
  { mark: "П7-5", length: 2990, width: 1160, thickness: 70, volume: 0.24, weight: 0.61, load: "5 тс/м²" },
  { mark: "П7-5/2", length: 1490, width: 1160, thickness: 70, volume: 0.12, weight: 0.3, load: "5 тс/м²" },
  { mark: "П7д-5", length: 740, width: 1160, thickness: 70, volume: 0.06, weight: 0.15, load: "5 тс/м²" },
  { mark: "П8-8", length: 2990, width: 1160, thickness: 100, volume: 0.35, weight: 0.87, load: "8 тс/м²" },
  { mark: "П8-8/2", length: 1490, width: 1160, thickness: 100, volume: 0.18, weight: 0.44, load: "8 тс/м²" },
  { mark: "П8д-8", length: 740, width: 1160, thickness: 100, volume: 0.09, weight: 0.21, load: "8 тс/м²" },
  { mark: "П9-15", length: 2990, width: 1160, thickness: 120, volume: 0.42, weight: 1.04, load: "15 тс/м²" },
  { mark: "П9-15/2", length: 1490, width: 1160, thickness: 120, volume: 0.21, weight: 0.52, load: "15 тс/м²" },
  { mark: "П9д-15", length: 740, width: 1160, thickness: 120, volume: 0.1, weight: 0.26, load: "15 тс/м²" },
];

/** Ширина канала в свету, мм — габарит за вычетом стенок */
export const trayInnerW = (t: TrayMark) => t.width - 2 * CALC.trayWall;

/** Высота канала в свету, мм — габарит за вычетом дна */
export const trayInnerH = (t: TrayMark) => t.height - CALC.trayBottom;

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
  {
    label: string;
    short: string;
    cablesPerChain: number;
    cableNote: string;
    /**
     * Каждая цепь прокладывается в собственной конструкции — своём лотке или
     * своём трубном блоке. На 110–220 кВ цепи не объединяют в один канал, поэтому
     * число лотков, плит и труб кратно числу цепей, а траншея должна вмещать их
     * в ряд. На 0,4–35 кВ цепи укладывают в общую конструкцию.
     */
    structurePerChain: boolean;
  }
> = {
  "0.4-10": {
    label: "0,4 – 10 кВ",
    short: "0,4-10 кВ",
    cablesPerChain: 1,
    cableNote: "кабель трёхжильный, 1 кабель на цепь",
    structurePerChain: false,
  },
  "35": {
    label: "35 кВ",
    short: "35 кВ",
    cablesPerChain: 3,
    cableNote: "кабель одножильный, 3 кабеля на цепь",
    structurePerChain: false,
  },
  "110-220": {
    label: "110 – 220 кВ",
    short: "110-220 кВ",
    cablesPerChain: 3,
    cableNote: "кабель одножильный, 3 кабеля на цепь",
    structurePerChain: true,
  },
};

/** Зазор между соседними конструкциями в траншее, мм */
export const STRUCTURE_GAP = 200;

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
  soilDensity: 1.7, // плотность грунта при перевозке, т/м³
  sludgeFactor: 1.3, // коэффициент бурового шлама ГНБ
  gnbPitVolume: 4, // объём одного приямка ГНБ, м³
  cableReserve: 0.02, // запас кабеля на прокладку (2%)
  cableStripLength: 3, // запас кабеля на разделку в муфте, м
  /*
   * Номинальные толщины стенки и дна лотка, мм. В серии 3.006.1-2.87 они
   * меняются от марки к марке (примерно 70…90 мм), поэтому используются только
   * для построения канала в свету и схемы разреза. Объёмы бетона и габариты
   * берутся из номенклатуры (TRAYS), а не считаются через эти толщины.
   */
  trayWall: 70,
  trayBottom: 70,
  rehabWiden: 0.15, // уширение при благоустройстве, м
};
