import { CALC } from "../data/catalogs";
import { add, div, inNumbers, inSymbols, mul, num, rendered, v, value, type Expr } from "./formula";
import { lotokGeometry, lotokVolumes, type LotokGeometry } from "./section-lotok";
import type { ProjectState, Segment, SubSection, VorItem } from "./types";

/*
 * Ведомость для разреза «Тип I» — прокладка в железобетонных лотках.
 *
 * Объёмы берутся из слоёв разреза (lib/section-lotok.ts), поэтому подписанный
 * на чертеже размер и посчитанный объём — одно и то же число. Каждая позиция
 * несёт две записи формулы: в обозначениях и с подставленными числами.
 */

const ceil = (n: number) => Math.ceil(n - 1e-9);

/** Позиция из выражения: величина и обе записи считаются по одному дереву */
function item(name: string, unit: string, e: Expr, digits = 3): VorItem {
  const r = rendered(e, digits);
  return { name, unit, qty: r.qty, formula: r.formula, symbols: r.symbols };
}

/** Штучная позиция: округление вверх показываем в записи, а не прячем */
function countItem(name: string, e: Expr, perRow: number): VorItem {
  const n = ceil(value(e)) * Math.max(1, perRow);
  const rows = perRow > 1 ? ` · ${perRow}` : "";
  return {
    name,
    unit: "шт",
    qty: n,
    formula: `⌈${inNumbers(e)}⌉${rows} = ${n}`,
    symbols: `⌈${inSymbols(e)}⌉${rows}`,
  };
}

const mat = (t: "sand" | "pgs") => (t === "sand" ? "песка" : "ПГС");
const matName = (t: "sand" | "pgs") => (t === "sand" ? "Песок" : "ПГС");

/**
 * Земляные работы участка в лотках.
 *
 * Разработка делится ровно так же, как для остальных типов: механизированная
 * и ручная, сухой и мокрый грунт, в отвал и на вывоз. Отличие в том, откуда
 * берутся объёмы: не из усреднённой траншеи, а из слоёв разреза.
 */
export function lotokEarthItems(state: ProjectState, seg: Segment, g: LotokGeometry, L: number, rows: number): VorItem[] {
  const p = state.params.lotok;
  const V = lotokVolumes(g, L, rows);
  const { dry, wet, group } = splitSoil(state);

  const total = value(V.total);
  const returned = value(V.backfill);
  /* Всё, что не вернулось в траншею грунтом, уезжает: основание, конструкции,
     засыпка вокруг них и объём под благоустройством */
  const surplus = Math.max(0, total - returned);

  const hand = total * CALC.handWorkShare;
  const mech = Math.max(0, total - hand);
  const toDump = total > 0 ? mech * (returned / total) : 0;
  const toTruck = mech - toDump;

  const Vtotal = v("V_тр", total);
  const items: VorItem[] = [];

  items.push(
    item(`Разработка сухого грунта экскаватором с ковшом 0,5 м³ в отвал, группа грунтов ${group}`, "м³",
      mul(v("V_отв", toDump), num(dry))),
    item(`Разработка мокрого грунта экскаватором с ковшом 0,5 м³ в отвал, группа грунтов ${group}`, "м³",
      mul(v("V_отв", toDump), num(wet))),
    item(`Разработка сухого грунта ${group} гр. с погрузкой на автомобили-самосвалы`, "м³",
      mul(v("V_выв", toTruck), num(dry))),
    item(`Разработка мокрого грунта ${group} гр. с погрузкой на автомобили-самосвалы`, "м³",
      mul(v("V_выв", toTruck), num(wet))),
    item(`Зачистка котлована вручную в сухих грунтах ${group} группы`, "м³",
      mul(Vtotal, num(CALC.handWorkShare), num(dry))),
    item(`Зачистка котлована вручную во влажных грунтах ${group} группы`, "м³",
      mul(Vtotal, num(CALC.handWorkShare), num(wet))),
    item(`Вывоз лишнего грунта на полигон`, "т",
      mul(v("V_изл", surplus), num(CALC.soilLoosen), num(CALC.soilDensity))),
  );

  items.push(
    item(`Устройство основания из ${mat(p.beddingType)} (h=${p.h1} мм) с уплотнением`, "м³", V.bedding),
    item(`Засыпка пазух и слоя над лотком ${mat(p.beddingType)} (до верха плиты)`, "м³", V.around),
    item(`Подсыпка ${mat(p.beddingType)} под кабель в лотке (h=${p.h2} мм)`, "м³", V.inside),
    item(`${matName(p.beddingType)} (закупка с уплотнением к=${CALC.compactionFactor})`, "м³",
      mul(
        add(v("V_осн", value(V.bedding)), v("V_пазух", value(V.around)), v("V_подс", value(V.inside))),
        num(CALC.compactionFactor),
      )),
  );

  /* Обратная засыпка: у конструкций вручную, остальное механизировано */
  const back = value(V.backfill);
  const backName = p.backfillType === "sand" ? "песком" : "местным грунтом";
  items.push(
    item(`Обратная засыпка ${backName} вручную с послойным уплотнением`, "м³",
      mul(v("V_обр", back), num(0.1))),
    item(`Обратная засыпка ${backName} бульдозером 108 л.с. с уплотнением`, "м³",
      mul(v("V_обр", back), num(0.9))),
    item(`Уплотнение грунта пневматическими трамбовками`, "м³", mul(v("V_обр", back), num(0.1))),
  );

  /* Крепление стенок: щиты стоят по обеим сторонам на всю глубину траншеи */
  const shields = mul(v("H_тр", g.Htr / 1000), v("L", L), num(2));
  items.push(
    item(`Крепление стенок траншеи деревянными щитами (толщина ${p.bShield} мм)`, "м²", shields, 2),
    item(`Щиты деревянные`, "м²", shields, 2),
    item(`Демонтаж деревянных щитов`, "м²", shields, 2),
  );

  return items;
}

/** Конструкции: лотки, плиты и их гидроизоляция */
export function lotokStructItems(state: ProjectState, seg: Segment, g: LotokGeometry, L: number, rows: number): VorItem[] {
  const trayLen = g.tray.length / 1000;
  const plateLen = g.plate.length / 1000;
  const trays = ceil(L / trayLen) * rows;
  const plates = ceil(L / plateLen) * rows;

  const trayOuterW = g.tray.width / 1000;
  const hydro = mul(
    num(2),
    add(v("B_лот", trayOuterW), v("h_лот", g.tray.height / 1000), v("h_пл", g.plate.thickness / 1000)),
    v("l_лот", trayLen),
    v("n_лот", trays),
  );

  const items: VorItem[] = [];
  items.push(
    countItem(`Лоток ${g.tray.mark} ${g.tray.length}×${g.tray.width}×${g.tray.height} мм`,
      div(v("L", L), v("l_лот", trayLen)), rows),
    item(`Монтаж железобетонных лотков`, "м³", mul(v("n_лот", trays), v("V₁_лот", g.tray.volume))),
    countItem(`Плита перекрытия ${g.plate.mark} ${g.plate.length}×${g.plate.width}×${g.plate.thickness} мм`,
      div(v("L", L), v("l_пл", plateLen)), rows),
    item(`Монтаж железобетонных плит перекрытия`, "м³", mul(v("n_пл", plates), v("V₁_пл", g.plate.volume))),
    item(`Гидроизоляция битумно-эмульсионной мастикой в 3 слоя`, "м²", hydro, 2),
    item(`Мастика битумно-эмульсионная (расход 2,5 кг/м²)`, "кг",
      mul(v("S_гидро", value(hydro)), num(3), num(2.5)), 2),
  );
  return items;
}

/**
 * Кабельные работы разреза: то, что лежит в траншее рядом с кабелем.
 *
 * Состав взят с чертежа: защитные трубы ЗПТ, ВОЛС, электронные маркеры,
 * две сигнальные ленты и хомуты. Шаг маркеров и хомутов задаёт пользователь —
 * он зависит от проекта, а не от разреза.
 */
export function lotokCableItems(state: ProjectState, seg: Segment, g: LotokGeometry, L: number, rows: number): VorItem[] {
  const p = state.params.lotok;
  const len = v("L", L);
  const items: VorItem[] = [];

  const zpt = mul(len, v("n_зпт", Math.max(0, p.zptCount)), ...(rows > 1 ? [num(rows)] : []));
  items.push(
    item(`Прокладка защитных труб ЗПТ 50/4,5 мм`, "м", zpt, 2),
    item(`Труба ЗПТ 50/4,5 мм (с запасом 2%)`, "м", mul(v("L_зпт", value(zpt)), num(1.02)), 2),
  );

  if (p.volsCount > 0) {
    const vols = mul(len, v("n_волс", p.volsCount));
    items.push(
      item(`Прокладка кабеля ВОЛС`, "м", vols, 2),
      item(`Кабель ВОЛС (с запасом 2%)`, "м", mul(v("L_волс", value(vols)), num(1.02)), 2),
    );
  }

  if (p.markerStep > 0) {
    items.push(countItem(`Электронный маркер полноразмерный`, div(len, v("шаг_м", p.markerStep)), 1));
  }
  if (p.clampStep > 0) {
    items.push(countItem(`Хомут крепления`, div(len, v("шаг_х", p.clampStep)), rows));
  }

  items.push(
    item(`Лента сигнальная 450 мм`, "м", len, 2),
    item(`Лента сигнальная 100 мм`, "м", len, 2),
  );

  return items;
}

function splitSoil(state: ProjectState) {
  const wetPct = Math.min(100, Math.max(0, Number.isFinite(state.soil?.wetShare) ? state.soil.wetShare : 50));
  const group = Math.min(6, Math.max(1, Math.round(state.soil?.group ?? 2)));
  return { wet: wetPct / 100, dry: (100 - wetPct) / 100, group };
}

export interface LotokSection {
  subs: SubSection[];
  g: LotokGeometry;
  /** Сводка по объёмам — та же, по которой построены позиции */
  total: number;
  bedding: number;
  around: number;
  struct: number;
  backfill: number;
  blago: number;
}

/**
 * Позиции участка в лотках и сводка объёмов.
 *
 * Сводка берётся из тех же выражений, что и позиции ведомости, поэтому
 * сходимость баланса в сводке означает сходимость и в документе.
 */
export function lotokSection(state: ProjectState, seg: Segment, L: number, rows: number, blago: number): LotokSection {
  const depth = (seg.h1 + seg.h2) / 2;
  const g = lotokGeometry(state.params.lotok, depth, rows, blago);
  const V = lotokVolumes(g, L, rows);
  return {
    subs: [
      { section: 1, title: "", items: lotokEarthItems(state, seg, g, L, rows) },
      { section: 2, title: "", items: lotokStructItems(state, seg, g, L, rows) },
      { section: 3, title: "", items: lotokCableItems(state, seg, g, L, rows) },
    ],
    g,
    total: value(V.total),
    bedding: value(V.bedding),
    around: value(V.around),
    struct: value(V.struct),
    backfill: value(V.backfill),
    blago: value(V.blago),
  };
}

