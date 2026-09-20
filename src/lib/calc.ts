import {
  CALC,
  PLATES,
  PZK,
  STRUCTURE_GAP,
  TRAYS,
  trayInnerH,
  trayInnerW,
  TRENCH_META,
  VOLTAGE_META,
  isTypeAllowed,
} from "../data/catalogs";
import type {
  PipeEntry,
  ProjectState,
  Segment,
  SubSection,
  TrenchParamsBase,
  TrenchType,
  VorItem,
  VorRow,
} from "./types";

/** Типы прокладки, выполняемые в открытой траншее или котловане (у них есть ширина и основание) */
export type DugTrenchType = Exclude<TrenchType, "gnb">;

export const isDugType = (t: TrenchType): t is DugTrenchType => t !== "gnb";

/** Параметры траншеи, общие для всех типов, кроме ГНБ */
const dugParams = (state: ProjectState, type: DugTrenchType): TrenchParamsBase =>
  state.params[type];

export interface Warning {
  code: string;
  text: string;
  severity: "warn" | "error";
}

export interface SegmentCalc {
  seg: Segment;
  label: string;
  active: boolean;
  hAvg: number;
  excavation: number;
  beddingVol: number;
  topFillVol: number;
  structVol: number;
  backfill: number;
  surplus: number;
  cable: number;
  subSections: SubSection[];
  note: string;
  warnings: Warning[];
}

export interface VorResult {
  calcs: SegmentCalc[];
  rows: VorRow[];
  totals: {
    length: number;
    lengthByType: Partial<Record<string, number>>;
    earth: number;
    cable: number;
    rows: number;
    activeSegments: number;
  };
  warnings: Warning[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;
/* Число для графы формулы: убираются только незначащие нули после запятой.
   Ограничение на дробную часть обязательно, иначе f(100, 0) даёт «1». */
const f = (n: number, d = 2) => {
  const s = n.toFixed(d);
  return s.includes(".") ? s.replace(/\.?0+$/, "") || "0" : s;
};

const pipesVolume = (pipes: PipeEntry[], length: number) =>
  pipes.reduce(
    (s, p) => s + (Math.PI / 4) * Math.pow(p.diameter / 1000, 2) * p.count * length,
    0,
  );

const totalPipes = (pipes: PipeEntry[]) => pipes.reduce((s, p) => s + p.count, 0);

const beddingName = (t: "sand" | "pgs") => (t === "sand" ? "песка" : "ПГС");


export const segLabel = (s: Segment) => `${s.from || "?"}–${s.to || "?"}`;

/**
 * Сколько параллельных конструкций (лотков, трубных блоков) в траншее.
 * На 110–220 кВ каждая цепь идёт в собственной конструкции, на 0,4–35 кВ цепи
 * укладывают в общую.
 */
export const structureCount = (state: ProjectState) =>
  VOLTAGE_META[state.voltage].structurePerChain ? Math.max(1, state.chains) : 1;

/** Ширина траншеи, нужная чтобы конструкции встали в ряд с зазорами, мм */
export const requiredWidth = (structW: number, count: number) =>
  count * structW + (count - 1) * STRUCTURE_GAP;

function trenchTopWidth(B: number, H: number, m: number): number {
  return B + 2 * m * H;
}

function trenchVolume(B: number, H: number, L: number, m: number): number {
  return (B + m * H) * H * L;
}

/**
 * Баланс грунта по участку, м³. Весь вынутый грунт обязан куда-то деться:
 *
 *   Vtotal = Vbedding + VtopFill + structVol + Vbackfill
 *
 * Основание, защитный слой и конструкции занимают место привозным материалом,
 * поэтому вытесненный ими родной грунт обратно не помещается и идёт на вывоз:
 *
 *   Vsurplus = Vbedding + VtopFill + structVol
 *
 * Ручная доработка дна — часть того же Vtotal, а не добавка к нему, поэтому из
 * объёма засыпки она не вычитается.
 */
export interface EarthBalance {
  total: number; // разработка всего
  bedding: number; // основание из песка/ПГС
  topFill: number; // защитный слой над конструкцией
  struct: number; // объём конструкций в траншее
  backfill: number; // обратная засыпка местным грунтом
  surplus: number; // вывозится
  handWork: number; // в т.ч. доработка дна вручную
}

export function earthBalance(total: number, beddingVol: number, topFillVol: number, structVol: number): EarthBalance {
  /* Слои обрезаются по остатку, чтобы сумма никогда не превысила вынутый объём:
     при заведомо неверных исходных данных баланс обязан остаться сходящимся,
     а о нехватке сечения сообщает отдельное предупреждение. */
  const bedding = Math.min(total, Math.max(0, beddingVol));
  const topFill = Math.min(total - bedding, Math.max(0, topFillVol));
  const struct = Math.min(total - bedding - topFill, Math.max(0, structVol));
  const backfill = total - bedding - topFill - struct;
  return {
    total,
    bedding,
    topFill,
    struct,
    backfill,
    surplus: bedding + topFill + struct,
    handWork: total * CALC.handWorkShare,
  };
}

/** Баланс для траншеи с откосами — то, что нужно лотку, блоку и открытой прокладке */
const trenchBalance = (B: number, hAvg: number, L: number, structVol: number, bedding: number) =>
  earthBalance(trenchVolume(B, hAvg, L, CALC.slopeK), B * bedding * L, B * CALC.topFill * L, structVol);

/* ================= генерация земляных работ (общий паттерн) ================= */
function earthworkItems(B: number, hAvg: number, L: number, structVol: number, beddingType: "sand" | "pgs", bedding: number): VorItem[] {
  const b = trenchBalance(B, hAvg, L, structVol, bedding);
  const mat = beddingType === "sand" ? "Песок" : "ПГС";

  /* Механизированная разработка делится по назначению грунта, а внутри — поровну
     на сухой и мокрый; ручная доработка дна учитывается отдельной расценкой. */
  const Vmech = Math.max(0, b.total - b.handWork);
  const toDump = Vmech * (b.total > 0 ? b.backfill / b.total : 0);
  const toTruck = Vmech - toDump;
  const handHalf = b.handWork * 0.5;

  const items: VorItem[] = [];

  items.push({ name: `Разработка сухого грунта экскаватором с ковшом 0,5 м³ в отвал, группа грунтов 2`, unit: "м³", qty: round3(toDump * 0.5), formula: `${f(toDump,3)}·0,5 = ${f(toDump * 0.5,3)}` });
  items.push({ name: `Разработка мокрого грунта экскаватором с ковшом 0,5 м³ в отвал, группа грунтов 2`, unit: "м³", qty: round3(toDump * 0.5), formula: `${f(toDump,3)}·0,5 = ${f(toDump * 0.5,3)}` });
  items.push({ name: `Разработка сухого грунта 2 гр. с погрузкой на автомобили-самосвалы`, unit: "м³", qty: round3(toTruck * 0.5), formula: `${f(toTruck,3)}·0,5 = ${f(toTruck * 0.5,3)}` });
  items.push({ name: `Разработка мокрого грунта 2 гр. с погрузкой на автомобили-самосвалы`, unit: "м³", qty: round3(toTruck * 0.5), formula: `${f(toTruck,3)}·0,5 = ${f(toTruck * 0.5,3)}` });
  items.push({ name: `Зачистка котлована вручную в сухих грунтах 2 группы`, unit: "м³", qty: round3(handHalf), formula: `${f(b.total,3)}·${CALC.handWorkShare}·0,5 = ${f(handHalf,3)}` });
  items.push({ name: `Зачистка котлована вручную во влажных грунтах 2 группы`, unit: "м³", qty: round3(handHalf), formula: `${f(b.total,3)}·${CALC.handWorkShare}·0,5 = ${f(handHalf,3)}` });

  /* На вывоз идёт ровно вытесненный объём, с учётом разрыхления при погрузке */
  const hauled = b.surplus * CALC.soilLoosen;
  const massTransport = hauled * CALC.soilDensity;
  items.push({ name: `Вывоз лишнего грунта на полигон`, unit: "т", qty: round3(massTransport), formula: `(${f(b.bedding,3)}+${f(b.topFill,3)}+${f(b.struct,3)})·${CALC.soilLoosen}·${CALC.soilDensity} = ${f(massTransport,3)}` });

  items.push({ name: `Устройство основания из ${beddingName(beddingType)} (h=${Math.round(bedding * 100)} см) с уплотнением`, unit: "м³", qty: round3(b.bedding), formula: `${f(B)}·${f(bedding)}·${f(L)} = ${f(b.bedding,3)}` });
  items.push({ name: `Защитный слой ${beddingName(beddingType)} над конструкцией (h=${Math.round(CALC.topFill * 100)} см)`, unit: "м³", qty: round3(b.topFill), formula: `${f(B)}·${f(CALC.topFill)}·${f(L)} = ${f(b.topFill,3)}` });
  const matVol = (b.bedding + b.topFill) * CALC.compactionFactor;
  items.push({ name: `${mat} (закупка с уплотнением к=${CALC.compactionFactor})`, unit: "м³", qty: round3(matVol), formula: `(${f(b.bedding,3)}+${f(b.topFill,3)})·${CALC.compactionFactor} = ${f(matVol,3)}` });

  /* Обратная засыпка — местным грунтом из отвала: 10% вручную у конструкции,
     остальное бульдозером. В сумме даёт ровно b.backfill. */
  const backManual = b.backfill * 0.1;
  const backDozer = b.backfill - backManual;
  items.push({ name: `Обратная засыпка местным грунтом вручную с послойным уплотнением`, unit: "м³", qty: round3(backManual), formula: `${f(b.backfill,3)}·0,1 = ${f(backManual,3)}` });
  items.push({ name: `Обратная засыпка местным грунтом бульдозером 108 л.с. с уплотнением`, unit: "м³", qty: round3(backDozer), formula: `${f(b.backfill,3)}·0,9 = ${f(backDozer,3)}` });
  items.push({ name: `Уплотнение грунта пневматическими трамбовками`, unit: "м³", qty: round3(backManual), formula: `${f(backManual,3)}` });

  if (hAvg > 1.5) {
    const shieldArea = hAvg * L * 2;
    items.push({ name: `Крепление стенок траншеи деревянными щитами`, unit: "м²", qty: round2(shieldArea), formula: `${f(hAvg)}·${f(L)}·2 = ${f(shieldArea)}` });
    items.push({ name: `Щиты деревянные`, unit: "м²", qty: round2(shieldArea), formula: `${f(shieldArea)}` });
    items.push({ name: `Демонтаж деревянных щитов`, unit: "м²", qty: round2(shieldArea), formula: `${f(shieldArea)}` });
  }

  return items;
}

/* ================= генерация монтажных работ для лотков ================= */
function lotokInstallItems(seg: Segment, state: ProjectState): VorItem[] {
  const lp = state.params.lotok;
  const L = seg.length;
  const tray = TRAYS.find((t) => t.mark === lp.trayMark) ?? TRAYS[0];
  const plate = PLATES.find((t) => t.mark === lp.plateMark) ?? PLATES[0];
  const trayLen = tray.length / 1000;
  const plateLen = plate.length / 1000;
  /* На 110–220 кВ каждая цепь идёт в своём лотке, поэтому ряд конструкций кратен числу цепей */
  const n = structureCount(state);
  const perRow = `${n > 1 ? `·${n} ряда` : ""}`;
  const trays = Math.ceil(L / trayLen) * n;
  const plates = Math.ceil(L / plateLen) * n;

  const trayOuterW = tray.width / 1000;
  const trayOuterH = (tray.height + plate.thickness) / 1000;
  /* Объём бетона — из номенклатуры серии, а не из габаритов изделия */
  const trayVol = trays * tray.volume;
  const plateVol = plates * plate.volume;

  const hydroArea = (2 * trayOuterW + 2 * trayOuterH) * trayLen * trays;
  const masticKg = hydroArea * 3 * 2.5;

  const zptLen = L * 2 * n;

  const items: VorItem[] = [];

  items.push({ name: `Монтаж железобетонных лотков`, unit: "м³", qty: round3(trayVol), formula: `${trays}·${f(tray.volume, 3)} = ${f(trayVol,3)}` });
  items.push({ name: `Лоток ${tray.mark} ${tray.length}×${tray.width}×${tray.height} мм`, unit: "шт", qty: trays, formula: `⌈${f(L)}/${f(trayLen)}⌉${perRow} = ${trays}` });

  items.push({ name: `Монтаж железобетонных плит перекрытия`, unit: "м³", qty: round3(plateVol), formula: `${plates}·${f(plate.volume, 3)} = ${f(plateVol,3)}` });
  items.push({ name: `Плита перекрытия ${plate.mark} ${plate.length}×${plate.width}×${plate.thickness} мм`, unit: "шт", qty: plates, formula: `⌈${f(L)}/${f(plateLen)}⌉${perRow} = ${plates}` });

  items.push({ name: `Гидроизоляция битумно-эмульсионной мастикой в 3 слоя`, unit: "м²", qty: round2(hydroArea), formula: `(${f(trayOuterW)}+${f(trayOuterH)})·2·${f(trayLen)}·${trays} = ${f(hydroArea)}` });
  items.push({ name: `Мастика битумно-эмульсионная (расход 2,5 кг/м²)`, unit: "кг", qty: round2(masticKg), formula: `${f(hydroArea)}·3·2,5 = ${f(masticKg)}` });

  items.push({ name: `Прокладка ЗТП труб 50/6,5 мм`, unit: "м", qty: round2(zptLen), formula: `${f(L)}·2${perRow} = ${f(zptLen)}` });
  items.push({ name: `ЗТП трубы 50/6,5 мм (с запасом 2%)`, unit: "м", qty: round2(zptLen * 1.02), formula: `${f(zptLen)}·1,02 = ${f(zptLen * 1.02)}` });

  return items;
}

/* ================= генерация монтажных работ для открытой траншеи ================= */
function openInstallItems(seg: Segment, state: ProjectState): VorItem[] {
  const op = state.params.open;
  const L = seg.length;
  const nCables = state.chains * VOLTAGE_META[state.voltage].cablesPerChain;
  const items: VorItem[] = [];

  if (op.cover === "plates") {
    const plate = PLATES.find((t) => t.mark === op.plateMark) ?? PLATES[0];
    const plateLen = plate.length / 1000;
    const plates = Math.ceil(L / plateLen);
    items.push({ name: `Укладка плит перекрытия ${plate.mark}`, unit: "шт", qty: plates, formula: `⌈${f(L)}/${f(plateLen)}⌉ = ${plates}` });
    items.push({ name: `Плита ${plate.mark} (с запасом 2%)`, unit: "шт", qty: Math.ceil(plates * 1.02), formula: `${plates}·1,02 = ${Math.ceil(plates * 1.02)}` });
  } else {
    const rows = nCables;
    const pzks = Math.ceil(L / (PZK.length / 1000)) * rows;
    items.push({ name: `Укладка ПЗК ${PZK.mark} (${PZK.dims})`, unit: "шт", qty: pzks, formula: `⌈${f(L)}/${PZK.length / 1000}⌉·${rows} = ${pzks}` });
    items.push({ name: `ПЗК ${PZK.mark} (с запасом 2%)`, unit: "шт", qty: Math.ceil(pzks * 1.02), formula: `${pzks}·1,02 = ${Math.ceil(pzks * 1.02)}` });
  }

  return items;
}

/* ================= генерация монтажных работ для блока ================= */
function blockInstallItems(seg: Segment, state: ProjectState): VorItem[] {
  const bp = state.params.block;
  const L = seg.length;
  /* На 110–220 кВ каждая цепь идёт в своём трубном блоке */
  const n = structureCount(state);
  const perBlock = n > 1 ? `·${n} блока` : "";
  const items: VorItem[] = [];

  for (const pe of bp.pipes) {
    const len = L * pe.count * n;
    items.push({ name: `Монтаж трубы ПНД Ø${pe.diameter} мм в трубный блок`, unit: "м", qty: round2(len), formula: `${f(L)}·${pe.count}${perBlock} = ${f(len)}` });
    items.push({ name: `Труба ПНД Ø${pe.diameter} мм (с запасом 2%)`, unit: "м", qty: round2(len * 1.02), formula: `${f(len)}·1,02 = ${f(len * 1.02)}` });
  }

  const pipesPerBlock = totalPipes(bp.pipes);
  const spacers = Math.ceil(L / CALC.spacerStep) * pipesPerBlock * n;
  items.push({ name: `Монтаж дистанционных фиксаторов труб (шаг ${CALC.spacerStep} м)`, unit: "шт", qty: spacers, formula: `⌈${f(L)}/${CALC.spacerStep}⌉·${pipesPerBlock}${perBlock} = ${spacers}` });

  return items;
}

/* ================= генерация работ для ГНБ ================= */
function gnbItems(seg: Segment, state: ProjectState): VorItem[] {
  const p = state.params.gnb;
  const L = seg.length;
  const D = p.boreDiameter;
  /* Бурение и раствор относятся к скважине, а не к трубе: в одну скважину
     затягивается весь пучок. На 110–220 кВ каждая цепь идёт своей скважиной. */
  const bores = structureCount(state);
  const pipesPerBore = totalPipes(p.pipes);
  const perBore = bores > 1 ? `·${bores} скв.` : "";
  const items: VorItem[] = [];

  items.push({ name: `Монтаж комплекса установки ГНБ`, unit: "шт", qty: 1, formula: "1" });
  /* При одной скважине длина совпадает с длиной перехода — «100 = 100» не пишем */
  const boreLen = bores > 1 ? `${f(L)}${perBore} = ${f(L * bores)}` : f(L);
  items.push({ name: `Пилотное бурение`, unit: "м", qty: round2(L * bores), formula: boreLen });
  items.push({ name: `Расширение скважины до Ø${D} мм`, unit: "м", qty: round2(L * bores), formula: boreLen });

  for (const pe of p.pipes) {
    const pipeLen = L * pe.count * bores * 1.02;
    items.push({ name: `Протаскивание трубы ПНД Ø${pe.diameter} мм`, unit: "м", qty: round2(pipeLen), formula: `${f(L)}·${pe.count}${perBore}·1,02 = ${f(pipeLen)}` });
    items.push({ name: `Труба ПНД Ø${pe.diameter} мм`, unit: "м", qty: round2(pipeLen), formula: `${f(pipeLen)}` });

    /* Труба приходит плетями по 13 м: на N плетей приходится N−1 стык */
    const lengths = Math.ceil(L / CALC.hdpeStickLength);
    const welds = Math.max(0, lengths - 1) * pe.count * bores;
    items.push({ name: `Сварка ПНД труб Ø${pe.diameter} мм встык`, unit: "соед.", qty: welds, formula: `(⌈${f(L)}/${CALC.hdpeStickLength}⌉−1)·${pe.count}${perBore} = ${welds}` });
  }

  const plugs = pipesPerBore * bores * 2;
  items.push({ name: `Монтаж заглушек постоянных`, unit: "шт", qty: plugs, formula: `${pipesPerBore}${perBore}·2 = ${plugs}` });
  items.push({ name: `Монтаж заглушек временных`, unit: "шт", qty: plugs, formula: `${pipesPerBore}${perBore}·2 = ${plugs}` });

  const cableCount = state.chains * VOLTAGE_META[state.voltage].cablesPerChain;
  const tiesPerMeter = 3;
  const ties = Math.floor(L) * tiesPerMeter * cableCount;
  items.push({ name: `Монтаж стяжки кабельной l=2000 мм`, unit: "шт", qty: ties, formula: `⌊${f(L)}⌋·${tiesPerMeter}·${cableCount} = ${ties}` });

  const ropeLen = (L * 1.02 + 2) * (tiesPerMeter * cableCount + 2);
  items.push({ name: `Синтетический трос`, unit: "м", qty: round2(ropeLen), formula: `(${f(L)}·1,02+2)·(${tiesPerMeter}·${cableCount}+2) = ${f(ropeLen)}` });

  /* Раствор и реагенты — на скважину: 8 м³ на замес плюс объём скважины с запасом 10% */
  const slurryVol = (8 + 0.785 * Math.pow(D / 1000, 2) * (L + 0.1 * L)) * bores;
  items.push({ name: `Буровой раствор`, unit: "м³", qty: round3(slurryVol), formula: `(8+0,785·${f(D / 1000, 2)}²·(${f(L)}+0,1·${f(L)}))${perBore} = ${f(slurryVol, 3)}` });

  const bentoniteKg = L * 337.4 * bores;
  items.push({ name: `Порошок бентонитовый`, unit: "кг", qty: round2(bentoniteKg), formula: `${f(L)}·337,4${perBore} = ${f(bentoniteKg)}` });

  const polymerKg = L * 20.5 * bores;
  items.push({ name: `Состав полимерный для кондиционирования грунтов`, unit: "кг", qty: round2(polymerKg), formula: `${f(L)}·20,5${perBore} = ${f(polymerKg)}` });

  const pipeAreas = p.pipes.reduce((s, pe) => s + (Math.PI / 4) * Math.pow(pe.diameter / 1000, 2) * pe.count, 0);
  const slurryPump = L * pipeAreas * bores;
  items.push({ name: `Откачка буровых жидкостей`, unit: "м³", qty: round3(slurryPump), formula: `${f(L)}·${f(pipeAreas, 4)}${perBore} = ${f(slurryPump, 3)}` });
  items.push({ name: `Утилизация бурового шлама`, unit: "м³", qty: round3(slurryPump), formula: `${f(slurryPump, 3)}` });

  items.push({ name: `Демонтаж комплекса установки ГНБ`, unit: "шт", qty: 1, formula: "1" });

  return items;
}

/* ================= генерация работ для муфтового поля ================= */
function spliceItems(seg: Segment, state: ProjectState): { earth: VorItem[]; install: VorItem[] } {
  const B = state.params.splice.width;
  const L = seg.length;
  const hAvg = (seg.h1 + seg.h2) / 2;
  const v = VOLTAGE_META[state.voltage];
  const nCables = state.chains * v.cablesPerChain;

  const p = state.params.splice;
  const b = earthBalance(B * hAvg * L, B * p.bedding * L, 0, 0);
  const earth: VorItem[] = [
    { name: `Разработка грунта в котловане экскаватором`, unit: "м³", qty: round3(b.total), formula: `${f(B)}·${f(hAvg)}·${f(L)} = ${f(b.total, 3)}` },
    { name: `Устройство основания из ${beddingName(p.beddingType)} (h=${Math.round(p.bedding * 100)} см) с уплотнением`, unit: "м³", qty: round3(b.bedding), formula: `${f(B)}·${f(p.bedding)}·${f(L)} = ${f(b.bedding, 3)}` },
    { name: `Обратная засыпка котлована местным грунтом`, unit: "м³", qty: round3(b.backfill), formula: `${f(b.total, 3)}−${f(b.bedding, 3)} = ${f(b.backfill, 3)}` },
    { name: `Вывоз лишнего грунта на полигон`, unit: "т", qty: round3(b.surplus * CALC.soilLoosen * CALC.soilDensity), formula: `${f(b.surplus, 3)}·${CALC.soilLoosen}·${CALC.soilDensity} = ${f(b.surplus * CALC.soilLoosen * CALC.soilDensity, 3)}` },
  ];

  const install: VorItem[] = [
    { name: `Монтаж соединительной муфты (кабель ${v.label})`, unit: "шт", qty: nCables, formula: `${state.chains}·${v.cablesPerChain} = ${nCables}` },
  ];

  return { earth, install };
}

/* ================= благоустройство ================= */
function surfaceItems(seg: Segment, state: ProjectState): VorItem[] {
  if (seg.type === "gnb") return [];
  const surf = state.surfaces.find((s) => s.id === seg.surfaceId) ?? state.surfaces[0];
  if (!surf || surf.layers.length === 0) return [];

  const p = state.params[seg.type];
  const B = p.width;
  const m = CALC.slopeK;
  const hAvg = (seg.h1 + seg.h2) / 2;
  const Btop = trenchTopWidth(B, hAvg, m);
  const area = (Btop + 2 * CALC.rehabWiden) * seg.length;
  const items: VorItem[] = [];

  for (const layer of surf.layers) {
    const t = Math.round(layer.thickness);
    items.push({ name: `Разработка покрытия «${surf.name}»: ${layer.name} (t=${t} см)`, unit: "м²", qty: round2(area), formula: `(${f(Btop)}+2·${CALC.rehabWiden})·${f(seg.length)} = ${f(area)}` });
    items.push({ name: `Восстановление покрытия «${surf.name}»: ${layer.name} (t=${t} см)`, unit: "м²", qty: round2(area), formula: `${f(area)}` });
  }

  const waste = surf.layers.reduce((s, l) => s + (area * l.thickness) / 100, 0);
  items.push({ name: `Погрузка и вывоз отходов от разборки покрытия «${surf.name}»`, unit: "м³", qty: round3(waste * CALC.soilLoosen), formula: `${f(waste, 3)}·${CALC.soilLoosen} = ${f(waste * CALC.soilLoosen, 3)}` });

  return items;
}

/* ================= кабельные работы ================= */
function cableItems(seg: Segment, state: ProjectState): VorItem[] {
  const v = VOLTAGE_META[state.voltage];
  const L = seg.length;
  const Lcable = seg.slopeLength ? Math.max(0, seg.slopeLength) : L;
  const nCables = state.chains * v.cablesPerChain;
  /* Запас на разделку в муфтах относится к концам линии, а не к каждому участку,
     поэтому здесь считается только прокладываемая длина */
  const cable = Lcable * (1 + CALC.cableReserve) * nCables;

  const items: VorItem[] = [];
  items.push({ name: `Прокладка кабеля ${v.label} (${v.cableNote})`, unit: "м", qty: round3(cable), formula: `${f(Lcable)}·(1+${CALC.cableReserve})·${nCables} = ${f(cable)}` });

  /* Единственная позиция сигнальной ленты: одна лента на цепь.
     Раньше лента попадала в ведомость дважды — в монтажных и в кабельных работах. */
  if (seg.type !== "gnb" && seg.type !== "splice") {
    const tapeLen = L * state.chains;
    items.push({ name: `Укладка сигнальной ленты ЛС-450 «Осторожно кабель»`, unit: "м", qty: round2(tapeLen), formula: `${f(L)}·${state.chains} = ${f(tapeLen)}` });
    items.push({ name: `Сигнальная лента ЛС-450 (с запасом 2%)`, unit: "м", qty: round2(tapeLen * 1.02), formula: `${f(tapeLen)}·1,02 = ${f(tapeLen * 1.02)}` });
  }

  return items;
}

/* ================= работы, относящиеся к линии целиком ================= */

/** Пометка в графе «участки» для позиций, относящихся к линии, а не к участку */
export const LINE_LABEL = "линия";

function lineItems(state: ProjectState): SubSection[] {
  const v = VOLTAGE_META[state.voltage];
  const nCables = state.chains * v.cablesPerChain;
  /* Концевые муфты ставятся на двух концах линии, а не на каждом участке */
  const ends = nCables * 2;
  const strip = ends * CALC.cableStripLength;
  return [
    {
      title: "Кабельные работы",
      items: [
        { name: `Монтаж концевых муфт (кабель ${v.label})`, unit: "компл", qty: ends, formula: `${nCables}·2 = ${ends}` },
        { name: `Запас кабеля на разделку в концевых муфтах`, unit: "м", qty: round2(strip), formula: `${ends}·${CALC.cableStripLength} = ${f(strip)}` },
      ],
    },
  ];
}

/* ================= основной расчёт сегмента ================= */
function calcSegment(state: ProjectState, seg: Segment): SegmentCalc {
  const label = segLabel(seg);
  /* Способ прокладки может быть неприменим на этом классе напряжения —
     например, лотков на 35 кВ не бывает */
  const allowed = isTypeAllowed(state.voltage, seg.type);
  const active = allowed && state.types.includes(seg.type);
  const L = Math.max(0, seg.length || 0);
  const hAvg = ((seg.h1 || 0) + (seg.h2 || 0)) / 2;
  const subSections: SubSection[] = [];
  const warnings: Warning[] = [];

  let excavation = 0;
  let beddingVol = 0;
  let topFillVol = 0;
  let structVol = 0;
  let backfill = 0;
  let surplus = 0;
  let note = "";

  if (active && L > 0) {
    /* У ГНБ нет траншеи: ширины и основания не существует, объёмы считаются в своей ветке */
    const dug = isDugType(seg.type) ? dugParams(state, seg.type) : null;
    const B = dug?.width ?? 0;
    const m = CALC.slopeK;

    if (hAvg < CALC.minDepth) {
      warnings.push({ code: "depth-pue", text: `Глубина ${hAvg.toFixed(1)} м меньше минимальной по ПУЭ 2.3.84 (${CALC.minDepth} м)`, severity: "warn" });
    }

    if (seg.type === "gnb") {
      const gnbItemsList = gnbItems(seg, state);
      subSections.push({ title: `ГНБ`, items: gnbItemsList });

      const D = state.params.gnb.boreDiameter;
      /* У каждой скважины свои входной и выходной приямки */
      const bores = structureCount(state);
      const Vb = (Math.PI / 4) * Math.pow(D / 1000, 2) * L * bores;
      const pitVol = CALC.gnbPitVolume * 2 * bores;
      excavation = Vb + pitVol;
      structVol = pipesVolume(state.params.gnb.pipes, L) * bores;
      const pipesPerBore = totalPipes(state.params.gnb.pipes);
      note = bores > 1
        ? `${bores} скв. Ø${D} мм × ${pipesPerBore} труб, по скважине на цепь`
        : `скважина Ø${D} мм; труб: ${pipesPerBore} шт`;

      const pipeArea = pipesVolume(state.params.gnb.pipes, 1);
      const boreArea = (Math.PI / 4) * Math.pow(D / 1000, 2);
      if (boreArea > 0 && pipeArea / boreArea > 0.7) {
        warnings.push({ code: "gnb-overload", text: `Трубы занимают ${Math.round(pipeArea / boreArea * 100)}% скважины (норма ≤70%)`, severity: "warn" });
      }
    } else if (seg.type === "lotok") {
      const lp = state.params.lotok;
      const tray = TRAYS.find((t) => t.mark === lp.trayMark) ?? TRAYS[0];
      const plate = PLATES.find((t) => t.mark === lp.plateMark) ?? PLATES[0];
      const n = structureCount(state);
      const trayOuterW = tray.width / 1000;
      const trayOuterH = (tray.height + plate.thickness) / 1000;
      structVol = trayOuterW * trayOuterH * L * n;
      note = n > 1
        ? `${n}×лоток ${tray.mark} (канал ${trayInnerW(tray)}×${trayInnerH(tray)} мм), по лотку на цепь`
        : `лоток ${tray.mark} (канал ${trayInnerW(tray)}×${trayInnerH(tray)} мм)`;

      if (plate.width !== tray.width) {
        warnings.push({ code: "plate-mismatch", text: `Плита ${plate.mark} (${plate.width} мм) не подходит к лотку ${tray.mark} (${tray.width} мм)`, severity: "error" });
      }
      const needW = requiredWidth(tray.width, n);
      if (needW > B * 1000) {
        warnings.push({ code: "tray-wide", text: `${n > 1 ? `${n} лотка в ряд требуют` : `Лоток требует`} ${needW} мм, а траншея ${(B * 1000).toFixed(0)} мм`, severity: "error" });
      }
      if (hAvg < trayOuterH) {
        warnings.push({ code: "tray-deep", text: `Глубина ${hAvg.toFixed(2)} м меньше высоты лотка с плитой ${trayOuterH.toFixed(2)} м`, severity: "warn" });
      }

      const earthItemsList = earthworkItems(B, hAvg, L, structVol, lp.beddingType, lp.bedding);
      subSections.push({ title: `Земляные работы. Прокладка в ж.б.лотках`, items: earthItemsList });
      subSections.push({ title: `Монтаж кабельных каналов`, items: lotokInstallItems(seg, state) });
    } else if (seg.type === "open") {
      const op = state.params.open;
      const earthItemsList = earthworkItems(B, hAvg, L, structVol, op.beddingType, op.bedding);
      subSections.push({ title: `Земляные работы. Открытая траншея`, items: earthItemsList });
      subSections.push({ title: `Монтаж конструкций`, items: openInstallItems(seg, state) });
      note = `открытая траншея B=${B} м`;
    } else if (seg.type === "block") {
      const bp = state.params.block;
      const n = structureCount(state);
      structVol = pipesVolume(bp.pipes, L) * n;
      const earthItemsList = earthworkItems(B, hAvg, L, structVol, bp.beddingType, bp.bedding);
      subSections.push({ title: `Земляные работы. Трубный блок`, items: earthItemsList });
      subSections.push({ title: `Монтаж трубного блока`, items: blockInstallItems(seg, state) });
      note = n > 1
        ? `${n} блока по ${totalPipes(bp.pipes)} труб, по блоку на цепь; B=${B} м`
        : `блок B=${B} м; труб: ${totalPipes(bp.pipes)} шт`;
    } else if (seg.type === "splice") {
      const { earth, install } = spliceItems(seg, state);
      subSections.push({ title: `Земляные работы. Муфтовое поле`, items: earth });
      subSections.push({ title: `Монтаж муфт`, items: install });
      excavation = B * hAvg * L;
      note = `котлован B=${B} м`;
    }

    /* Баланс грунта считается тем же кодом, что порождает позиции ведомости,
       поэтому сводка и ВОР не могут разойтись. */
    if (dug) {
      const b = seg.type === "splice"
        /* Муфтовое поле — котлован без откосов и без постоянных конструкций */
        ? earthBalance(B * hAvg * L, B * dug.bedding * L, 0, 0)
        : trenchBalance(B, hAvg, L, structVol, dug.bedding);
      excavation = b.total;
      beddingVol = b.bedding;
      topFillVol = b.topFill;
      backfill = b.backfill;
      surplus = b.surplus;
      if (structVol > b.struct + 1e-6) {
        warnings.push({ code: "struct-overflow", text: `Конструкции (${structVol.toFixed(2)} м³) не помещаются в сечение траншеи ${B} м × ${hAvg.toFixed(2)} м`, severity: "error" });
      }
    } else {
      /* ГНБ: обратной засыпки нет, весь объём скважины вытеснен трубами и раствором */
      backfill = 0;
      surplus = Math.min(excavation, structVol);
    }

    // Кабельные работы — отдельный подраздел
    const cableItemsList = cableItems(seg, state);
    if (cableItemsList.length > 0) {
      subSections.push({ title: `Кабельные работы`, items: cableItemsList });
    }

    const surfItemsList = surfaceItems(seg, state);
    if (surfItemsList.length > 0) {
      subSections.push({ title: `Благоустройство`, items: surfItemsList });
    }
  } else if (!active && L > 0) {
    warnings.push(
      allowed
        ? { code: "type-disabled", text: `Участок ${label}: тип прокладки «${TRENCH_META[seg.type].label}» отключён`, severity: "warn" }
        : { code: "type-not-applicable", text: `Участок ${label}: «${TRENCH_META[seg.type].label}» не применяется на ${VOLTAGE_META[state.voltage].label} — выберите другой способ прокладки`, severity: "error" },
    );
  }

  if (L <= 0) {
    warnings.push({ code: "no-length", text: `Участок ${label}: длина не задана`, severity: "error" });
  }

  /* Та же формула, что в позиции «Прокладка кабеля»: запас на разделку сюда не
     входит — он относится к концам линии и учитывается один раз в buildVor */
  const Lcable = seg.slopeLength ? Math.max(0, seg.slopeLength) : L;
  const v = VOLTAGE_META[state.voltage];
  const cable = active && L > 0
    ? Lcable * (1 + CALC.cableReserve) * state.chains * v.cablesPerChain
    : 0;

  return {
    seg, label, active,
    hAvg: round3(hAvg),
    excavation: round3(excavation),
    beddingVol: round3(beddingVol),
    topFillVol: round3(topFillVol),
    structVol: round3(structVol),
    backfill: round3(backfill),
    surplus: round3(surplus),
    cable: round3(cable),
    subSections,
    note,
    warnings,
  };
}

export function buildVor(state: ProjectState): VorResult {
  const calcs = state.segments.map((s) => calcSegment(state, s));

  const rows: VorRow[] = [];
  /* Позиции, объём которых не удалось посчитать (нет данных в справочнике, деление на ноль) */
  const buildWarnings: Warning[] = [];

  const addItems = (subs: SubSection[], label: string) => {
    for (const sub of subs) {
      for (const item of sub.items) {
        if (!Number.isFinite(item.qty)) {
          buildWarnings.push({
            code: "qty-not-finite",
            text: `${label === LINE_LABEL ? "Линия" : `Участок ${label}`}: позиция «${item.name}» не рассчитана — проверьте исходные данные`,
            severity: "error",
          });
          continue;
        }
        if (item.qty <= 0) continue;

        // Ищем существующую строку с таким же подразделом + наименованием + единицей
        const existing = rows.find(
          (r) => r.subSection === sub.title && r.name === item.name && r.unit === item.unit,
        );

        if (existing) {
          existing.qty = round3(existing.qty + item.qty);
          if (!existing.segments.includes(label)) existing.segments.push(label);
          if (item.formula) existing.formula += (existing.formula ? "; " : "") + `уч.${label}: ${item.formula}`;
        } else {
          rows.push({
            section: 0, // номер присвоим позже
            subSection: sub.title,
            name: item.name,
            unit: item.unit,
            qty: round3(item.qty),
            segments: [label],
            formula: item.formula ? `уч.${label}: ${item.formula}` : "",
          });
        }
      }
    }
  };

  for (const c of calcs) {
    if (!c.active) continue;
    addItems(c.subSections, c.label);
  }

  /* Работы по концам линии добавляются один раз, а не на каждый участок */
  if (calcs.some((c) => c.active && c.seg.length > 0)) {
    addItems(lineItems(state), LINE_LABEL);
  }

  // Группируем по subSection и нумеруем разделы последовательно
  const sectionOrder: string[] = [];
  for (const r of rows) {
    if (!sectionOrder.includes(r.subSection)) sectionOrder.push(r.subSection);
  }

  for (const r of rows) {
    r.section = sectionOrder.indexOf(r.subSection) + 1;
  }

  // Сортируем строки: сначала по subSection, затем по имени
  rows.sort((a, b) => {
    const secDiff = sectionOrder.indexOf(a.subSection) - sectionOrder.indexOf(b.subSection);
    if (secDiff !== 0) return secDiff;
    return a.name.localeCompare(b.name, "ru");
  });

  const lengthByType: Partial<Record<string, number>> = {};
  for (const c of calcs) {
    if (!c.active) continue;
    lengthByType[c.seg.type] = (lengthByType[c.seg.type] ?? 0) + c.seg.length;
  }

  const allWarnings = [...calcs.flatMap((c) => c.warnings), ...buildWarnings];

  return {
    calcs,
    rows,
    totals: {
      length: calcs.reduce((s, c) => s + (c.active ? c.seg.length : 0), 0),
      lengthByType,
      earth: calcs.reduce((s, c) => s + c.excavation, 0),
      cable: calcs.reduce((s, c) => s + c.cable, 0),
      rows: rows.length,
      activeSegments: calcs.filter((c) => c.active).length,
    },
    warnings: allWarnings,
  };
}

/** Русское форматирование чисел */
export const fmt = (n: number, d = 2) =>
  n
    .toLocaleString("ru-RU", { maximumFractionDigits: d, minimumFractionDigits: 0 })
    .replace(/\u00a0/g, " ");
