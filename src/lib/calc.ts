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
  items: RawItem[];
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

const pipesVolume = (pipes: PipeEntry[], length: number) =>
  pipes.reduce(
    (s, p) => s + (Math.PI / 4) * Math.pow(p.diameter / 1000, 2) * p.count * length,
    0,
  );

const totalPipes = (pipes: PipeEntry[]) => pipes.reduce((s, p) => s + p.count, 0);

const beddingName = (t: "sand" | "pgs") => (t === "sand" ? "песка" : "ПГС");

export const segLabel = (s: Segment) => `${s.from || "?"}–${s.to || "?"}`;

/** Ширина траншеи поверху с учётом откосов */
function trenchTopWidth(B: number, H: number, m: number): number {
  return B + 2 * m * H;
}

/** Объём траншеи по трапеции: V = (B + m·H)·H·L */
function trenchVolume(B: number, H: number, L: number, m: number): number {
  return (B + m * H) * H * L;
}

function calcSegment(state: ProjectState, seg: Segment): SegmentCalc {
  const v = VOLTAGE_META[state.voltage];
  const label = segLabel(seg);
  const active = state.types.includes(seg.type);
  const L = Math.max(0, seg.length || 0);
  const hAvg = ((seg.h1 || 0) + (seg.h2 || 0)) / 2;
  const items: RawItem[] = [];
  const warnings: Warning[] = [];

  // Кабель с запасом на прокладку и разделку
  const cablePerChain = L * (1 + CALC.cableReserve);
  const cableEnds = state.chains * v.cablesPerChain * 2; // концы для разделки
  const cable = cablePerChain * state.chains * v.cablesPerChain + cableEnds * CALC.cableStripLength;

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

      // Приямки входа и выхода (2 шт)
      const pitVol = CALC.gnbPitVolume * 2;

      push(1, "Бурение пилотной скважины (ГНБ)", "м", L);
      push(1, `Расширение скважины до Ø${D} мм (ГНБ)`, "м", L);
      push(1, `Разработка грунта механизированным бурением, скважина Ø${D} мм`, "м³", Vb);
      // Шлам — отдельная позиция с Кшл
      push(1, "Погрузка и вывоз бурового шлама автомобилями-самосвалами", "м³", round3(Vb * CALC.sludgeFactor));
      // Приямки
      push(1, "Разработка грунта в приямках входа и выхода (ГНБ)", "м³", pitVol);
      push(1, "Обратная засыпка приямков (ГНБ)", "м³", pitVol);

      for (const pe of p.pipes) {
        push(2, `Затягивание трубы ПНД Ø${pe.diameter} мм в скважину (ГНБ)`, "м", L * pe.count);
      }
      const spacers = Math.ceil(L / CALC.spacerStep) * totalPipes(p.pipes);
      push(2, "Монтаж дистанционных фиксаторов труб (шаг 1,5 м)", "шт", spacers);
      structVol = pipesVolume(p.pipes, L);

      excavation = Vb + pitVol;
      note = `скважина Ø${D} мм; труб: ${totalPipes(p.pipes)} шт; приямки 2 шт`;

      // Предупреждение: перегруз скважины
      const pipeArea = pipesVolume(p.pipes, 1);
      const boreArea = (Math.PI / 4) * Math.pow(D / 1000, 2);
      if (boreArea > 0 && pipeArea / boreArea > 0.7) {
        warnings.push({
          code: "gnb-overload",
          text: `Трубы занимают ${Math.round(pipeArea / boreArea * 100)}% скважины (норма ≤70%)`,
          severity: "warn",
        });
      }

      // Сигнальная лента для ГНБ НЕ укладывается
    } else {
      const p = state.params[seg.type];
      const B = p.width;
      const m = CALC.slopeK; // заложение откосов

      // Предупреждение: глубина меньше ПУЭ 2.3.84
      if (hAvg < CALC.minDepth) {
        warnings.push({
          code: "depth-pue",
          text: `Глубина ${hAvg.toFixed(1)} м меньше минимальной по ПУЭ 2.3.84 (${CALC.minDepth} м)`,
          severity: "warn",
        });
      }

      // Объём по трапеции
      excavation = trenchVolume(B, hAvg, L, m);
      const Btop = trenchTopWidth(B, hAvg, m);

      beddingVol = B * p.bedding * L;
      topFillVol = B * CALC.topFill * L;

      push(
        1,
        `Разработка грунта в траншеях (${TRENCH_META[seg.type].short}), экскаватор`,
        "м³",
        excavation,
      );

      // Ручная доработка дна (доля от объёма разработки)
      const handWork = excavation * CALC.handWorkShare;
      push(1, "Ручная доработка дна траншеи", "м³", handWork);

      // Планировка дна
      push(1, "Планировка дна траншеи", "м²", round2(B * L));

      push(
        1,
        `Устройство постели из ${beddingName(p.beddingType)} под конструкции, t=${Math.round(p.bedding * 100)} см`,
        "м³",
        beddingVol,
      );
      push(
        1,
        `Засыпка ${beddingName(p.beddingType)} поверх конструкций, t=${CALC.topFill * 100} см`,
        "м³",
        topFillVol,
      );

      // Закупка песка/ПГС с коэффициентом уплотнения
      const sandPurchase = (beddingVol + topFillVol) * CALC.compactionFactor;
      push(1, `Закупка ${beddingName(p.beddingType)} (с учётом уплотнения)`, "м³", round3(sandPurchase));

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
        // Объём лотка по фактическим наружным размерам
        const trayOuterW = (tray.innerW + 2 * CALC.trayWall) / 1000;
        const trayOuterH = (tray.innerH + CALC.trayBottom + CALC.trayPlateH) / 1000;
        structVol = trayOuterW * trayOuterH * L;
        note = `лоток ${tray.mark} (${tray.innerW}×${tray.innerH}); плита ${plate.mark}`;

        // Предупреждение: лоток шире траншеи
        if (trayOuterW > B) {
          warnings.push({
            code: "tray-wide",
            text: `Лоток (${(trayOuterW * 1000).toFixed(0)} мм) шире траншеи (${(B * 1000).toFixed(0)} мм)`,
            severity: "error",
          });
        }
        // Предупреждение: глубина меньше высоты лотка
        if (hAvg < trayOuterH) {
          warnings.push({
            code: "tray-deep",
            text: `Глубина ${hAvg.toFixed(2)} м меньше высоты лотка с плитой ${trayOuterH.toFixed(2)} м`,
            severity: "warn",
          });
        }
      } else if (seg.type === "open") {
        const op = state.params.open;
        if (op.cover === "plates") {
          const plate = PLATES.find((t) => t.mark === op.plateMark) ?? PLATES[0];
          const plates = Math.ceil(L / (plate.length / 1000));
          push(2, `Укладка плит перекрытия ${plate.mark} по Серии 3.006.1-2`, "шт", plates);
          // Объём плит по каталожной массе / плотность ж/б (2500 кг/м³)
          structVol = plates * plate.weight * 1000 / 2500;
          note = `защита — плиты ${plate.mark}`;
        } else {
          const rows = state.chains * v.cablesPerChain;
          const pzks = Math.ceil(L / (PZK.length / 1000)) * rows;
          push(2, `Укладка плит защитных кабельных ${PZK.mark} (${PZK.dims})`, "шт", pzks);
          // Объём ПЗК по фактическим размерам
          structVol = pzks * (PZK.w / 1000) * (PZK.h / 1000) * (PZK.t / 1000);
          note = `защита — ${PZK.mark}, ${rows} ряд(а)`;
        }
      } else {
        // splice — муфтовое поле
        const nCables = state.chains * v.cablesPerChain;
        push(3, `Монтаж соединительной муфты (кабель ${v.label})`, "шт", nCables);
        note = `котлован B=${B} м под муфты, ${nCables} каб.`;
      }

      backfill = Math.max(0, excavation - beddingVol - topFillVol - structVol - handWork);
      // Вывоз с коэффициентом разрыхления
      surplus = Math.min(excavation, beddingVol + topFillVol + structVol + handWork);
      push(1, "Обратная засыпка траншеи грунтом с послойным уплотнением", "м³", backfill);
      push(1, "Погрузка и вывоз излишнего грунта автомобилями-самосвалами", "м³", round3(surplus * CALC.soilLoosen));
    }

    // === Общие позиции (все типы прокладки) ===

    // Кабель
    push(3, `Прокладка кабеля ${v.label} (${v.cableNote})`, "м", round3(cable));

    // Сигнальная лента (не для ГНБ)
    if (seg.type !== "gnb") {
      push(3, "Укладка сигнальной ленты «Осторожно кабель»", "м", L * state.chains);
    }

    // Муфты: соединительные + концевые
    const nCablesInTrench = state.chains * v.cablesPerChain;
    if (seg.type === "splice") {
      // Для муфтового поля — только соединительные (уже добавлены выше)
    } else {
      // Концевые муфты: 2 на каждый кабель в траншее
      const endMufs = nCablesInTrench * 2;
      push(3, `Монтаж концевых муфт (кабель ${v.label})`, "компл", endMufs);
    }

    /* ---- благоустройство по бровке + уширение (не для ГНБ) ---- */
    if (seg.type !== "gnb") {
      const surf = state.surfaces.find((s) => s.id === seg.surfaceId) ?? state.surfaces[0];
      if (surf && surf.layers.length > 0) {
        const p = state.params[seg.type];
        const B = p.width;
        const m = CALC.slopeK;
        const Btop = trenchTopWidth(B, hAvg, m);
        const area = (Btop + 2 * CALC.rehabWiden) * L;
        let waste = 0;
        for (const layer of surf.layers) {
          const t = Math.round(layer.thickness);
          push(4, `Разработка покрытия «${surf.name}»: ${layer.name} (t=${t} см)`, "м²", round2(area));
          push(4, `Восстановление покрытия «${surf.name}»: ${layer.name} (t=${t} см)`, "м²", round2(area));
          waste += (area * layer.thickness) / 100;
        }
        push(4, `Погрузка и вывоз отходов от разборки покрытия «${surf.name}»`, "м³", round3(waste * CALC.soilLoosen));
      }

      // Предупреждение: участок без покрытия
      if (!state.surfaces.find((s) => s.id === seg.surfaceId)) {
        warnings.push({
          code: "no-surface",
          text: `Участок ${label}: не выбрано покрытие для благоустройства`,
          severity: "warn",
        });
      }
    }
  } else if (!active && L > 0) {
    warnings.push({
      code: "type-disabled",
      text: `Участок ${label}: тип прокладки «${TRENCH_META[seg.type].label}» отключён`,
      severity: "warn",
    });
  }

  if (L <= 0) {
    warnings.push({
      code: "no-length",
      text: `Участок ${label}: длина не задана`,
      severity: "error",
    });
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
    warnings,
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

  // Сортировка по разделам и наименованию
  const rows = Array.from(map.values()).sort((a, b) => {
    if (a.section !== b.section) return a.section - b.section;
    return a.name.localeCompare(b.name, "ru");
  });

  const lengthByType: Partial<Record<string, number>> = {};
  for (const c of calcs) {
    if (!c.active) continue;
    lengthByType[c.seg.type] = (lengthByType[c.seg.type] ?? 0) + c.seg.length;
  }

  // Собрать все предупреждения
  const allWarnings = calcs.flatMap((c) => c.warnings);

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
