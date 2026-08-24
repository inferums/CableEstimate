import {
  CALC,
  PLATES,
  PZK,
  TRAYS,
  TRENCH_META,
  VOLTAGE_META,
} from "../data/catalogs";
import type {
  PipeEntry,
  ProjectState,
  Segment,
  VorRow,
} from "./types";

export interface RawItem {
  section: number;
  name: string;
  unit: string;
  qty: number;
}

export interface SegmentCalc {
  seg: Segment;
  label: string;
  active: boolean;
  hAvg: number;
  excavation: number; // м³ (для ГНБ — объем выбуренного грунта)
  beddingVol: number;
  topFillVol: number;
  structVol: number;
  backfill: number;
  surplus: number;
  cable: number; // м
  items: RawItem[];
  note: string;
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
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const pipesVolume = (pipes: PipeEntry[], length: number) =>
  pipes.reduce(
    (s, p) => s + (Math.PI / 4) * Math.pow(p.diameter / 1000, 2) * p.count * length,
    0,
  );
const totalPipes = (pipes: PipeEntry[]) => pipes.reduce((s, p) => s + p.count, 0);
const beddingName = (t: "sand" | "pgs") => (t === "sand" ? "песка" : "ПГС");

export const segLabel = (s: Segment) => `${s.from || "?"}–${s.to || "?"}`;

function calcSegment(state: ProjectState, seg: Segment): SegmentCalc {
  const v = VOLTAGE_META[state.voltage];
  const label = segLabel(seg);
  const active = state.types.includes(seg.type);
  const L = Math.max(0, seg.length || 0);
  const hAvg = ((seg.h1 || 0) + (seg.h2 || 0)) / 2;
  const items: RawItem[] = [];
  const cable = L * state.chains * v.cablesPerChain;

  let excavation = 0;
  let beddingVol = 0;
  let topFillVol = 0;
  let structVol = 0;
  let backfill = 0;
  let surplus = 0;
  let note = "";

  const push = (section: number, name: string, unit: string, qty: number) => {
    if (qty > 0) items.push({ section, name, unit, qty: round3(qty) });
  };

  if (active && L > 0) {
    if (seg.type === "gnb") {
      const p = state.params.gnb;
      const D = p.boreDiameter;
      const Vb = (Math.PI / 4) * Math.pow(D / 1000, 2) * L;
      excavation = Vb;
      surplus = Vb;
      push(1, "Бурение пилотной скважины (ГНБ)", "м", L);
      push(1, `Расширение скважины до Ø${D} мм (ГНБ)`, "м", L);
      push(1, `Разработка грунта механизированным бурением, скважина Ø${D} мм`, "м³", Vb);
      push(1, "Погрузка и вывоз излишнего грунта автомобилями-самосвалами", "м³", Vb);
      for (const pe of p.pipes) {
        push(2, `Затягивание трубы ПНД Ø${pe.diameter} мм в скважину (ГНБ)`, "м", L * pe.count);
      }
      const spacers = Math.ceil(L / CALC.spacerStep) * totalPipes(p.pipes);
      push(2, "Монтаж дистанционных фиксаторов труб (шаг 1,5 м)", "шт", spacers);
      structVol = pipesVolume(p.pipes, L);
      note = `скважина Ø${D} мм; труб: ${totalPipes(p.pipes)} шт`;
    } else {
      const p = state.params[seg.type];
      const B = p.width;
      const k = hAvg > CALC.slopeDepth ? CALC.slopeK : 1;
      excavation = B * hAvg * L * k;
      beddingVol = B * p.bedding * L;
      topFillVol = B * CALC.topFill * L;

      push(
        1,
        `Разработка грунта в траншеях (${TRENCH_META[seg.type].short}), экскаватор${
          k > 1 ? ", с откосами k=1,15" : ""
        }`,
        "м³",
        excavation,
      );
      push(
        1,
        `Устройство постели из ${beddingName(p.beddingType)} под конструкции, t=${Math.round(
          p.bedding * 100,
        )} см`,
        "м³",
        beddingVol,
      );
      push(
        1,
        `Засыпка ${beddingName(p.beddingType)} поверх конструкций, t=${CALC.topFill * 100} см`,
        "м³",
        topFillVol,
      );

      if (seg.type === "block") {
        const bp = state.params.block;
        for (const pe of bp.pipes) {
          push(2, `Монтаж трубы ПНД Ø${pe.diameter} мм в трубный блок`, "м", L * pe.count);
        }
        const spacers = Math.ceil(L / CALC.spacerStep) * totalPipes(bp.pipes);
        push(2, "Монтаж дистанционных фиксаторов труб (шаг 1,5 м)", "шт", spacers);
        structVol = pipesVolume(bp.pipes, L);
        note = `траншея B=${B} м; труб: ${totalPipes(bp.pipes)} шт`;
      } else if (seg.type === "lotok") {
        const lp = state.params.lotok;
        const tray = TRAYS.find((t) => t.mark === lp.trayMark) ?? TRAYS[0];
        const plate = PLATES.find((t) => t.mark === lp.plateMark) ?? PLATES[0];
        const trays = Math.ceil(L / (tray.length / 1000));
        const plates = Math.ceil(L / (plate.length / 1000));
        push(2, `Укладка лотков ${tray.mark} по Серии 3.006.1-2`, "шт", trays);
        push(2, `Укладка плит перекрытия ${plate.mark} по Серии 3.006.1-2`, "шт", plates);
        structVol =
          (tray.innerW / 1000 + 0.14) * (tray.innerH / 1000 + CALC.wallThk + 0.16) * L;
        note = `лоток ${tray.mark}; плита ${plate.mark}`;
      } else if (seg.type === "open") {
        const op = state.params.open;
        if (op.cover === "plates") {
          const plate = PLATES.find((t) => t.mark === op.plateMark) ?? PLATES[0];
          const plates = Math.ceil(L / (plate.length / 1000));
          push(2, `Укладка плит перекрытия ${plate.mark} по Серии 3.006.1-2`, "шт", plates);
          note = `защита — плиты ${plate.mark}`;
        } else {
          const rows = state.chains * v.cablesPerChain;
          const pzks = Math.ceil(L / (PZK.length / 1000)) * rows;
          push(2, `Укладка плит защитных кабельных ${PZK.mark} (${PZK.dims})`, "шт", pzks);
          structVol = rows * L * 0.124 * 0.05;
          note = `защита — ${PZK.mark}, ${rows} ряд(а)`;
        }
      } else {
        // splice — муфтовое поле
        push(3, `Монтаж соединительной муфты (кабель ${v.label})`, "шт", cable / L);
        note = `котлован B=${B} м под муфты`;
      }

      backfill = Math.max(0, excavation - beddingVol - topFillVol - structVol);
      surplus = Math.min(excavation, beddingVol + topFillVol + structVol);
      push(1, "Обратная засыпка траншеи грунтом с послойным уплотнением", "м³", backfill);
      push(1, "Погрузка и вывоз излишнего грунта автомобилями-самосвалами", "м³", surplus);
    }

    push(3, `Прокладка кабеля ${v.label} (${v.cableNote})`, "м", cable);
    push(3, "Укладка сигнальной ленты «Осторожно кабель»", "м", L * state.chains);

    /* ---- благоустройство ---- */
    if (seg.type !== "gnb") {
      const surf =
        state.surfaces.find((s) => s.id === seg.surfaceId) ?? state.surfaces[0];
      if (surf && surf.layers.length > 0) {
        const B = state.params[seg.type].width;
        const area = B * L;
        let waste = 0;
        for (const layer of surf.layers) {
          const t = Math.round(layer.thickness);
          push(4, `Разработка покрытия «${surf.name}»: ${layer.name} (t=${t} см)`, "м²", area);
          push(
            4,
            `Восстановление покрытия «${surf.name}»: ${layer.name} (t=${t} см)`,
            "м²",
            area,
          );
          waste += (area * layer.thickness) / 100;
        }
        push(4, `Погрузка и вывоз отходов от разборки покрытия «${surf.name}»`, "м³", waste);
      }
    }
  }

  return {
    seg,
    label,
    active,
    hAvg: round3(hAvg),
    excavation: round3(excavation),
    beddingVol: round3(beddingVol),
    topFillVol: round3(topFillVol),
    structVol: round3(structVol),
    backfill: round3(backfill),
    surplus: round3(surplus),
    cable: round3(cable),
    items,
    note,
  };
}

export function buildVor(state: ProjectState): VorResult {
  const calcs = state.segments.map((s) => calcSegment(state, s));

  const map = new Map<string, VorRow>();
  for (const c of calcs) {
    if (!c.active) continue;
    for (const it of c.items) {
      const key = `${it.section}|${it.name}|${it.unit}`;
      const row = map.get(key);
      if (row) {
        row.qty = round3(row.qty + it.qty);
        if (!row.segments.includes(c.label)) row.segments.push(c.label);
      } else {
        map.set(key, {
          section: it.section,
          name: it.name,
          unit: it.unit,
          qty: it.qty,
          segments: [c.label],
        });
      }
    }
  }

  const rows = Array.from(map.values());
  const lengthByType: Partial<Record<string, number>> = {};
  for (const c of calcs) {
    if (!c.active) continue;
    lengthByType[c.seg.type] = (lengthByType[c.seg.type] ?? 0) + c.seg.length;
  }

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
  };
}

/** Русское форматирование чисел */
export const fmt = (n: number, d = 2) =>
  n
    .toLocaleString("ru-RU", { maximumFractionDigits: d, minimumFractionDigits: 0 })
    .replace(/\u00a0/g, " ");
