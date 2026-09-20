import {
  CALC,
  PLATES,
  PZK,
  TRAYS,
  trayInnerH,
  trayInnerW,
  TRENCH_META,
  VOLTAGE_META,
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
const f = (n: number, d = 2) => { const s = n.toFixed(d); return s.replace(/\.?0+$/, "") || "0"; };

const pipesVolume = (pipes: PipeEntry[], length: number) =>
  pipes.reduce(
    (s, p) => s + (Math.PI / 4) * Math.pow(p.diameter / 1000, 2) * p.count * length,
    0,
  );

const totalPipes = (pipes: PipeEntry[]) => pipes.reduce((s, p) => s + p.count, 0);

const beddingName = (t: "sand" | "pgs") => (t === "sand" ? "песка" : "ПГС");


export const segLabel = (s: Segment) => `${s.from || "?"}–${s.to || "?"}`;

function trenchTopWidth(B: number, H: number, m: number): number {
  return B + 2 * m * H;
}

function trenchVolume(B: number, H: number, L: number, m: number): number {
  return (B + m * H) * H * L;
}

/* ================= генерация земляных работ (общий паттерн) ================= */
function earthworkItems(B: number, hAvg: number, L: number, structVol: number, beddingType: "sand" | "pgs", bedding: number): VorItem[] {
  const m = CALC.slopeK;
  const Vtotal = trenchVolume(B, hAvg, L, m);
  const Vhalf = Vtotal * 0.5;
  const Btop = trenchTopWidth(B, hAvg, m);

  const Vbedding = B * bedding * L;
  const VtopFill = B * CALC.topFill * L;
  const VhandWork = Vtotal * CALC.handWorkShare;
  const VhandHalf = VhandWork * 0.5;

  const VbackfillPgsManual = (Vtotal - Vbedding - VtopFill - structVol - VhandWork) * 0.1;
  const VbackfillPgsBulldozer = (Vtotal - Vbedding - VtopFill - structVol - VhandWork) * 0.9;
  const VbackfillSoil = Vtotal - VhandWork - Vbedding - VtopFill - structVol;
  const Vsurplus = Math.min(Vtotal, Vbedding + VtopFill + structVol + VhandWork);

  const Vshield = Btop * 2 * L > 0 ? hAvg * L * 2 : 0;

  const items: VorItem[] = [];

  items.push({ name: `Разработка сухого грунта экскаватором с ковшом 0,5 м³ в отвал, группа грунтов 2`, unit: "м³", qty: round3(Vhalf), formula: `${f(Vtotal,3)}·0,5 = ${f(Vhalf,3)}` });
  items.push({ name: `Разработка мокрого грунта экскаватором с ковшом 0,5 м³ в отвал, группа грунтов 2`, unit: "м³", qty: round3(Vhalf), formula: `${f(Vtotal,3)}·0,5 = ${f(Vhalf,3)}` });
  items.push({ name: `Разработка сухого грунта 2 гр. с погрузкой на автомобили-самосвалы`, unit: "м³", qty: round3(Vhalf), formula: `${f(Vtotal,3)}·0,5 = ${f(Vhalf,3)}` });
  items.push({ name: `Разработка мокрого грунта 2 гр. с погрузкой на автомобили-самосвалы`, unit: "м³", qty: round3(Vhalf), formula: `${f(Vtotal,3)}·0,5 = ${f(Vhalf,3)}` });
  items.push({ name: `Зачистка котлована вручную в сухих грунтах 2 группы`, unit: "м³", qty: round3(VhandHalf), formula: `${f(VhandWork,3)}·0,5 = ${f(VhandHalf,3)}` });
  items.push({ name: `Зачистка котлована вручную во влажных грунтах 2 группы`, unit: "м³", qty: round3(VhandHalf), formula: `${f(VhandWork,3)}·0,5 = ${f(VhandHalf,3)}` });

  const Vtransport = (Vtotal) * 0.5;
  const massTransport = Vtransport * 1.7;
  items.push({ name: `Вывоз грунта на полигон ТБО`, unit: "т", qty: round3(massTransport), formula: `${f(Vtransport,3)}·1,7 = ${f(massTransport,3)}` });

  items.push({ name: `Устройство основания из ${beddingName(beddingType)} (h=${Math.round(bedding * 100)} см) с уплотнением`, unit: "м³", qty: round3(Vbedding), formula: `${f(B)}·${f(bedding)}·${f(L)} = ${f(Vbedding,3)}` });
  items.push({ name: `${beddingType === "sand" ? "Песок" : "ПГС"} (закупка с уплотнением к=${CALC.compactionFactor})`, unit: "м³", qty: round3(Vbedding * CALC.compactionFactor), formula: `${f(Vbedding,3)}·${CALC.compactionFactor} = ${f(Vbedding * CALC.compactionFactor,3)}` });

  items.push({ name: `Обратная засыпка ${beddingName(beddingType)} вручную с послойным уплотнением`, unit: "м³", qty: round3(VbackfillPgsManual), formula: `(${f(Vtotal,3)}−${f(Vbedding,3)}−${f(VtopFill,3)}−${f(structVol,3)})·0,1 = ${f(VbackfillPgsManual,3)}` });
  items.push({ name: `${beddingType === "sand" ? "Песок" : "ПГС"} (закупка)`, unit: "м³", qty: round3(VbackfillPgsManual * CALC.compactionFactor), formula: `${f(VbackfillPgsManual,3)}·${CALC.compactionFactor} = ${f(VbackfillPgsManual * CALC.compactionFactor,3)}` });

  items.push({ name: `Обратная засыпка ${beddingName(beddingType)} бульдозером 108 л.с. с уплотнением`, unit: "м³", qty: round3(VbackfillPgsBulldozer), formula: `(${f(Vtotal,3)}−${f(Vbedding,3)}−${f(VtopFill,3)}−${f(structVol,3)})·0,9 = ${f(VbackfillPgsBulldozer,3)}` });
  items.push({ name: `${beddingType === "sand" ? "Песок" : "ПГС"} (закупка)`, unit: "м³", qty: round3(VbackfillPgsBulldozer * CALC.compactionFactor), formula: `${f(VbackfillPgsBulldozer,3)}·${CALC.compactionFactor} = ${f(VbackfillPgsBulldozer * CALC.compactionFactor,3)}` });

  items.push({ name: `Уплотнение грунта пневматическими трамбовками`, unit: "м³", qty: round3(VbackfillPgsBulldozer), formula: `${f(VbackfillPgsBulldozer,3)}` });

  items.push({ name: `Обратная засыпка местным грунтом бульдозером 108 л.с.`, unit: "м³", qty: round3(VbackfillSoil), formula: `${f(Vtotal,3)}−${f(VhandWork,3)} = ${f(VbackfillSoil,3)}` });

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
  const trays = Math.ceil(L / trayLen);
  const plates = Math.ceil(L / plateLen);

  const trayOuterW = tray.width / 1000;
  const trayOuterH = (tray.height + plate.thickness) / 1000;
  /* Объём бетона — из номенклатуры серии, а не из габаритов изделия */
  const trayVol = trays * tray.volume;
  const plateVol = plates * plate.volume;

  const hydroArea = (2 * trayOuterW + 2 * trayOuterH) * trayLen * trays;
  const masticKg = hydroArea * 3 * 2.5;

  const nCables = state.chains * VOLTAGE_META[state.voltage].cablesPerChain;
  const tapeLen = L * nCables;

  const items: VorItem[] = [];

  items.push({ name: `Монтаж железобетонных лотков`, unit: "м³", qty: round3(trayVol), formula: `${trays}·${f(tray.volume, 3)} = ${f(trayVol,3)}` });
  items.push({ name: `Лоток ${tray.mark} ${tray.length}×${tray.width}×${tray.height} мм`, unit: "шт", qty: trays, formula: `⌈${f(L)}/${f(trayLen)}⌉ = ${trays}` });

  items.push({ name: `Монтаж железобетонных плит перекрытия`, unit: "м³", qty: round3(plateVol), formula: `${plates}·${f(plate.volume, 3)} = ${f(plateVol,3)}` });
  items.push({ name: `Плита перекрытия ${plate.mark} ${plate.length}×${plate.width}×${plate.thickness} мм`, unit: "шт", qty: plates, formula: `⌈${f(L)}/${f(plateLen)}⌉ = ${plates}` });

  items.push({ name: `Гидроизоляция битумно-эмульсионной мастикой в 3 слоя`, unit: "м²", qty: round2(hydroArea), formula: `(${f(trayOuterW)}·${f(trayOuterH)}·2+${f(trayOuterW)}·${f(trayOuterH)}·2)·${trays} = ${f(hydroArea)}` });
  items.push({ name: `Мастика битумно-эмульсионная (расход 2,5 кг/м²)`, unit: "кг", qty: round2(masticKg), formula: `${f(hydroArea)}·3·2,5 = ${f(masticKg)}` });

  items.push({ name: `Прокладка ЗТП труб 50/6,5 мм`, unit: "м", qty: round2(L * 2), formula: `${f(L)}·2 = ${f(L * 2)}` });
  items.push({ name: `ЗТП трубы 50/6,5 мм (с запасом 2%)`, unit: "м", qty: round2(L * 2 * 1.02), formula: `${f(L * 2)}·1,02 = ${f(L * 2 * 1.02)}` });

  items.push({ name: `Укладка сигнальной ленты ЛС-450`, unit: "м", qty: round2(tapeLen), formula: `${f(L)}·${nCables} = ${f(tapeLen)}` });
  items.push({ name: `Сигнальная лента ЛС-450 (с запасом 2%)`, unit: "м", qty: round2(tapeLen * 1.02), formula: `${f(tapeLen)}·1,02 = ${f(tapeLen * 1.02)}` });

  return items;
}

/* ================= генерация монтажных работ для открытой траншеи ================= */
function openInstallItems(seg: Segment, state: ProjectState): VorItem[] {
  const op = state.params.open;
  const L = seg.length;
  const v = VOLTAGE_META[state.voltage];
  const nCables = state.chains * v.cablesPerChain;
  const tapeLen = L * nCables;
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

  items.push({ name: `Укладка сигнальной ленты ЛС-450`, unit: "м", qty: round2(tapeLen), formula: `${f(L)}·${nCables} = ${f(tapeLen)}` });
  items.push({ name: `Сигнальная лента ЛС-450 (с запасом 2%)`, unit: "м", qty: round2(tapeLen * 1.02), formula: `${f(tapeLen)}·1,02 = ${f(tapeLen * 1.02)}` });

  return items;
}

/* ================= генерация монтажных работ для блока ================= */
function blockInstallItems(seg: Segment, state: ProjectState): VorItem[] {
  const bp = state.params.block;
  const L = seg.length;
  const v = VOLTAGE_META[state.voltage];
  const nCables = state.chains * v.cablesPerChain;
  const tapeLen = L * nCables;
  const items: VorItem[] = [];

  for (const pe of bp.pipes) {
    items.push({ name: `Монтаж трубы ПНД Ø${pe.diameter} мм в трубный блок`, unit: "м", qty: round2(L * pe.count), formula: `${f(L)}·${pe.count} = ${f(L * pe.count)}` });
    items.push({ name: `Труба ПНД Ø${pe.diameter} мм (с запасом 2%)`, unit: "м", qty: round2(L * pe.count * 1.02), formula: `${f(L * pe.count)}·1,02 = ${f(L * pe.count * 1.02)}` });
  }

  const spacers = Math.ceil(L / CALC.spacerStep) * totalPipes(bp.pipes);
  items.push({ name: `Монтаж дистанционных фиксаторов труб (шаг ${CALC.spacerStep} м)`, unit: "шт", qty: spacers, formula: `⌈${f(L)}/${CALC.spacerStep}⌉·${totalPipes(bp.pipes)} = ${spacers}` });

  items.push({ name: `Укладка сигнальной ленты ЛС-450`, unit: "м", qty: round2(tapeLen), formula: `${f(L)}·${nCables} = ${f(tapeLen)}` });
  items.push({ name: `Сигнальная лента ЛС-450 (с запасом 2%)`, unit: "м", qty: round2(tapeLen * 1.02), formula: `${f(tapeLen)}·1,02 = ${f(tapeLen * 1.02)}` });

  return items;
}

/* ================= генерация работ для ГНБ ================= */
function gnbItems(seg: Segment, state: ProjectState): VorItem[] {
  const p = state.params.gnb;
  const L = seg.length;
  const D = p.boreDiameter;
  const nScw = totalPipes(p.pipes);
  const items: VorItem[] = [];

  items.push({ name: `Монтаж комплекса установки ГНБ`, unit: "шт", qty: 1, formula: "1" });
  items.push({ name: `Пилотное бурение`, unit: "м", qty: round2(L * nScw), formula: `${f(L)}·${nScw} = ${f(L * nScw)}` });
  items.push({ name: `Расширение скважины до Ø${D} мм`, unit: "м", qty: round2(L * nScw), formula: `${f(L)}·${nScw} = ${f(L * nScw)}` });

  for (const pe of p.pipes) {
    const pipeLen = L * pe.count * 1.02;
    items.push({ name: `Протаскивание трубы ПНД Ø${pe.diameter} мм`, unit: "м", qty: round2(pipeLen), formula: `${f(L)}·${pe.count}·1,02 = ${f(pipeLen)}` });
    items.push({ name: `Труба ПНД Ø${pe.diameter} мм`, unit: "м", qty: round2(pipeLen), formula: `${f(pipeLen)}` });

    const welds = Math.floor(L / 13) * pe.count * 2;
    items.push({ name: `Сварка ПНД труб Ø${pe.diameter} мм встык`, unit: "соед.", qty: welds, formula: `⌊${f(L)}/13⌋·${pe.count}·2 = ${welds}` });
  }

  items.push({ name: `Монтаж заглушек постоянных`, unit: "шт", qty: totalPipes(p.pipes) * 2, formula: `${totalPipes(p.pipes)}·2 = ${totalPipes(p.pipes) * 2}` });
  items.push({ name: `Монтаж заглушек временных`, unit: "шт", qty: totalPipes(p.pipes) * 2, formula: `${totalPipes(p.pipes)}·2 = ${totalPipes(p.pipes) * 2}` });

  const cableCount = state.chains * VOLTAGE_META[state.voltage].cablesPerChain;
  const tiesPerMeter = 3;
  const ties = Math.floor(L) * tiesPerMeter * cableCount;
  items.push({ name: `Монтаж стяжки кабельной l=2000 мм`, unit: "шт", qty: ties, formula: `⌊${f(L)}⌋·${tiesPerMeter}·${cableCount} = ${ties}` });

  const ropeLen = (L * 1.02 + 2) * (tiesPerMeter * cableCount + 2);
  items.push({ name: `Синтетический трос`, unit: "м", qty: round2(ropeLen), formula: `(${f(L)}·1,02+2)·(${tiesPerMeter}·${cableCount}+2) = ${f(ropeLen)}` });

  const boreArea = (Math.PI / 4) * Math.pow(D / 1000, 2);
  const slurryVol = (8 + 0.785 * Math.pow(D / 1000, 2) * (L + 0.1 * L)) * nScw;
  items.push({ name: `Буровой раствор`, unit: "м³", qty: round3(slurryVol), formula: `(8+0,785·${f(D / 1000, 2)}²·(${f(L)}+0,1·${f(L)}))·${nScw} = ${f(slurryVol, 3)}` });

  const bentoniteKg = L * 337.4 * nScw;
  items.push({ name: `Порошок бентонитовый`, unit: "кг", qty: round2(bentoniteKg), formula: `${f(L)}·337,4·${nScw} = ${f(bentoniteKg)}` });

  const polymerKg = L * 20.5 * nScw;
  items.push({ name: `Состав полимерный для кондиционирования грунтов`, unit: "кг", qty: round2(polymerKg), formula: `${f(L)}·20,5·${nScw} = ${f(polymerKg)}` });

  const pipeAreas = p.pipes.reduce((s, pe) => s + (Math.PI / 4) * Math.pow(pe.diameter / 1000, 2) * pe.count, 0);
  const slurryPump = L * pipeAreas;
  items.push({ name: `Откачка буровых жидкостей`, unit: "м³", qty: round3(slurryPump), formula: `${f(L)}·${f(pipeAreas, 4)} = ${f(slurryPump, 3)}` });
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

  const pitVol = B * hAvg * L;
  const earth: VorItem[] = [
    { name: `Разработка грунта в котловане экскаватором`, unit: "м³", qty: round3(pitVol), formula: `${f(B)}·${f(hAvg)}·${f(L)} = ${f(pitVol, 3)}` },
    { name: `Обратная засыпка котлована`, unit: "м³", qty: round3(pitVol * 0.8), formula: `${f(pitVol, 3)}·0,8 = ${f(pitVol * 0.8, 3)}` },
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
  const cablePerChain = Lcable * (1 + CALC.cableReserve);
  const cableEnds = nCables * 2;
  const cable = cablePerChain * nCables + cableEnds * CALC.cableStripLength;

  const items: VorItem[] = [];
  items.push({ name: `Прокладка кабеля ${v.label} (${v.cableNote})`, unit: "м", qty: round3(cable), formula: `${f(Lcable)}·(1+${CALC.cableReserve})·${nCables}+${cableEnds}·${CALC.cableStripLength} = ${f(cable)}` });

  if (seg.type !== "gnb" && seg.type !== "splice") {
    items.push({ name: `Укладка сигнальной ленты «Осторожно кабель»`, unit: "м", qty: round2(L * state.chains), formula: `${f(L)}·${state.chains} = ${f(L * state.chains)}` });
  }

  if (seg.type !== "splice") {
    items.push({ name: `Монтаж концевых муфт (кабель ${v.label})`, unit: "компл", qty: nCables * 2, formula: `${nCables}·2 = ${nCables * 2}` });
  }

  return items;
}

/* ================= основной расчёт сегмента ================= */
function calcSegment(state: ProjectState, seg: Segment): SegmentCalc {
  const label = segLabel(seg);
  const active = state.types.includes(seg.type);
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

    if (dug) {
      excavation = trenchVolume(B, hAvg, L, m);
      beddingVol = B * dug.bedding * L;
      topFillVol = B * CALC.topFill * L;
    }

    if (seg.type === "gnb") {
      const gnbItemsList = gnbItems(seg, state);
      subSections.push({ title: `ГНБ`, items: gnbItemsList });

      const D = state.params.gnb.boreDiameter;
      const Vb = (Math.PI / 4) * Math.pow(D / 1000, 2) * L;
      const pitVol = CALC.gnbPitVolume * 2;
      excavation = Vb + pitVol;
      structVol = pipesVolume(state.params.gnb.pipes, L);
      note = `скважина Ø${D} мм; труб: ${totalPipes(state.params.gnb.pipes)} шт`;

      const pipeArea = pipesVolume(state.params.gnb.pipes, 1);
      const boreArea = (Math.PI / 4) * Math.pow(D / 1000, 2);
      if (boreArea > 0 && pipeArea / boreArea > 0.7) {
        warnings.push({ code: "gnb-overload", text: `Трубы занимают ${Math.round(pipeArea / boreArea * 100)}% скважины (норма ≤70%)`, severity: "warn" });
      }
    } else if (seg.type === "lotok") {
      const lp = state.params.lotok;
      const tray = TRAYS.find((t) => t.mark === lp.trayMark) ?? TRAYS[0];
      const plate = PLATES.find((t) => t.mark === lp.plateMark) ?? PLATES[0];
      const trayOuterW = tray.width / 1000;
      const trayOuterH = (tray.height + plate.thickness) / 1000;
      structVol = trayOuterW * trayOuterH * L;
      note = `лоток ${tray.mark} (канал ${trayInnerW(tray)}×${trayInnerH(tray)} мм)`;

      if (plate.width !== tray.width) {
        warnings.push({ code: "plate-mismatch", text: `Плита ${plate.mark} (${plate.width} мм) не подходит к лотку ${tray.mark} (${tray.width} мм)`, severity: "error" });
      }
      if (trayOuterW > B) {
        warnings.push({ code: "tray-wide", text: `Лоток (${(trayOuterW * 1000).toFixed(0)} мм) шире траншеи (${(B * 1000).toFixed(0)} мм)`, severity: "error" });
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
      structVol = pipesVolume(bp.pipes, L);
      const earthItemsList = earthworkItems(B, hAvg, L, structVol, bp.beddingType, bp.bedding);
      subSections.push({ title: `Земляные работы. Трубный блок`, items: earthItemsList });
      subSections.push({ title: `Монтаж трубного блока`, items: blockInstallItems(seg, state) });
      note = `блок B=${B} м; труб: ${totalPipes(state.params.block.pipes)} шт`;
    } else if (seg.type === "splice") {
      const { earth, install } = spliceItems(seg, state);
      subSections.push({ title: `Земляные работы. Муфтовое поле`, items: earth });
      subSections.push({ title: `Монтаж муфт`, items: install });
      excavation = B * hAvg * L;
      note = `котлован B=${B} м`;
    }

    backfill = Math.max(0, excavation - beddingVol - topFillVol - structVol - excavation * CALC.handWorkShare);
    surplus = Math.min(excavation, beddingVol + topFillVol + structVol + excavation * CALC.handWorkShare);

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
    warnings.push({ code: "type-disabled", text: `Участок ${label}: тип прокладки «${TRENCH_META[seg.type].label}» отключён`, severity: "warn" });
  }

  if (L <= 0) {
    warnings.push({ code: "no-length", text: `Участок ${label}: длина не задана`, severity: "error" });
  }

  const Lcable = seg.slopeLength ? Math.max(0, seg.slopeLength) : L;
  const v = VOLTAGE_META[state.voltage];
  const cablePerChain = Lcable * (1 + CALC.cableReserve);
  const cableEnds = state.chains * v.cablesPerChain * 2;
  const cable = cablePerChain * state.chains * v.cablesPerChain + cableEnds * CALC.cableStripLength;

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

  for (const c of calcs) {
    if (!c.active) continue;
    for (const sub of c.subSections) {
      for (const item of sub.items) {
        if (!Number.isFinite(item.qty)) {
          buildWarnings.push({
            code: "qty-not-finite",
            text: `Участок ${c.label}: позиция «${item.name}» не рассчитана — проверьте исходные данные`,
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
          if (!existing.segments.includes(c.label)) existing.segments.push(c.label);
          if (item.formula) existing.formula += (existing.formula ? "; " : "") + `уч.${c.label}: ${item.formula}`;
        } else {
          rows.push({
            section: 0, // номер присвоим позже
            subSection: sub.title,
            name: item.name,
            unit: item.unit,
            qty: round3(item.qty),
            segments: [c.label],
            formula: item.formula ? `уч.${c.label}: ${item.formula}` : "",
          });
        }
      }
    }
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
