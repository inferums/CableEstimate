import { CALC, PLATES, TRAYS, type PlateMark, type TrayMark } from "../data/catalogs";
import { add, div, mul, num, sub, v, type Expr } from "./formula";
import type { LotokParams } from "./types";

/*
 * Разрез «Тип I» — прокладка в железобетонных лотках.
 *
 * Здесь живёт геометрия разреза: отметки слоёв снизу вверх и ширина траншеи
 * на каждой из них. Отсюда её берут и расчёт объёмов, и картинка на экране —
 * поэтому подписанный размер и посчитанный объём не могут разойтись.
 *
 * Обозначения — те же, что на чертеже: B₁…B₅, h₁…h₆, H_тр. Размеры участка
 * (глубина) приходят в метрах, размеры разреза хранятся в миллиметрах.
 */

export type SymbolKind = "input" | "catalog" | "derived";

export interface SymbolSpec {
  /** Поле параметров или имя расчётной величины */
  id: string;
  /** Обозначение с чертежа */
  sym: string;
  label: string;
  unit: "мм" | "м";
  kind: SymbolKind;
  /** Откуда берётся, если не вводится руками */
  note?: string;
}

/**
 * Таблица обозначений разреза — единственный источник подписей.
 *
 * По ней подписываются поля настроек, выноски на разрезе и множители в
 * формулах ведомости. Менять обозначение здесь — значит менять его везде.
 */
export const LOTOK_SYMBOLS: SymbolSpec[] = [
  { id: "B1", sym: "B₁", label: "Ширина траншеи по дну", unit: "мм", kind: "derived", note: "ширина лотка + B₃ + B₄" },
  { id: "b2", sym: "B₂", label: "Ширина траншеи по верху", unit: "мм", kind: "input", note: "пусто — равна B₁" },
  { id: "b3", sym: "B₃", label: "Пазух слева (со щитом)", unit: "мм", kind: "input" },
  { id: "b4", sym: "B₄", label: "Пазух справа (со щитом)", unit: "мм", kind: "input" },
  { id: "b5", sym: "B₅", label: "От плиты до трубы ЗПТ", unit: "мм", kind: "input" },
  { id: "bShield", sym: "B_щит", label: "Толщина щитов крепления", unit: "мм", kind: "input" },
  { id: "h1", sym: "h₁", label: "Подсыпка под лоток", unit: "мм", kind: "input" },
  { id: "h2", sym: "h₂", label: "Подсыпка под кабель в лотке", unit: "мм", kind: "input" },
  { id: "hTray", sym: "h_лот", label: "Высота лотка", unit: "мм", kind: "catalog", note: "серия 3.006.1-2.87" },
  { id: "h3", sym: "h₃", label: "От верха лотка до плиты", unit: "мм", kind: "input" },
  { id: "hPlate", sym: "h_пл", label: "Толщина плиты", unit: "мм", kind: "catalog", note: "серия 3.006.1-2.87" },
  { id: "h4", sym: "h₄", label: "От плиты до электронного маркера", unit: "мм", kind: "input", note: "только для разреза" },
  { id: "h5", sym: "h₅", label: "От плиты до сигнальной ленты", unit: "мм", kind: "input" },
  { id: "h6", sym: "h₆", label: "От ленты до благоустройства", unit: "мм", kind: "derived", note: "H_тр − h₁ − h_лот − h₃ − h_пл − h₅ − H_благо" },
  { id: "hBlago", sym: "H_благо", label: "Толщина благоустройства", unit: "мм", kind: "catalog", note: "из типа покрытия" },
  { id: "hCable", sym: "h_каб", label: "Глубина заложения кабеля", unit: "мм", kind: "derived", note: "проверка: не менее 1500" },
  { id: "hZpt", sym: "h_зпт", label: "Глубина заложения ЗПТ", unit: "мм", kind: "derived", note: "проверка: не менее 1200" },
  { id: "Htr", sym: "H_тр", label: "Глубина траншеи", unit: "м", kind: "input", note: "задаётся на участке" },
];

export const symbolOf = (id: string): string => LOTOK_SYMBOLS.find((s) => s.id === id)?.sym ?? id;

/** Нормы глубины заложения, мм — по ним приложение предупреждает */
export const MIN_CABLE_DEPTH = 1500;
export const MIN_ZPT_DEPTH = 1200;

export interface Level {
  /** Отметка от дна траншеи, мм */
  y: number;
  /** Что на этой отметке */
  name: string;
}

export interface LotokGeometry {
  tray: TrayMark;
  plate: PlateMark;
  /** Ширина по дну и по верху, мм */
  B1: number;
  B2: number;
  /** Глубина траншеи, мм */
  Htr: number;
  /** Толщина благоустройства, мм */
  hBlago: number;
  /** Засыпка от ленты до благоустройства, мм; отрицательная — глубины не хватает */
  h6: number;
  /** Отметки снизу вверх */
  levels: Record<
    "bottom" | "trayBottom" | "trayTop" | "plateBottom" | "plateTop" | "marker" | "tape" | "blago" | "surface",
    number
  >;
  /** Подсыпка под кабель внутри лотка, мм */
  h2Inside: number;
  /** Глубина заложения кабеля и ЗПТ от поверхности, мм */
  hCable: number;
  hZpt: number;
}

export const trayOf = (mark: string): TrayMark => TRAYS.find((t) => t.mark === mark) ?? TRAYS[0];
export const plateOf = (mark: string): PlateMark => PLATES.find((p) => p.mark === mark) ?? PLATES[0];

/**
 * Ширина траншеи на отметке y от дна.
 *
 * Стенки идут по прямой от B₁ внизу до B₂ наверху, поэтому ширина —
 * линейная по высоте, а объём любого слоя считается как трапеция. При
 * B₂ = B₁ это обычная прямоугольная траншея, и формула остаётся верной.
 */
export const widthAt = (g: LotokGeometry, y: number): number =>
  g.Htr <= 0 ? g.B1 : g.B1 + ((g.B2 - g.B1) * Math.min(Math.max(y, 0), g.Htr)) / g.Htr;

/** Площадь сечения слоя между отметками, мм² — трапеция по ширине стенок */
export const layerArea = (g: LotokGeometry, y1: number, y2: number): number =>
  ((widthAt(g, y1) + widthAt(g, y2)) / 2) * Math.max(0, y2 - y1);

/**
 * Геометрия разреза для участка.
 *
 * @param depth  глубина траншеи на участке, м (H_тр)
 * @param count  число лотков в ряду — на 110–220 кВ по лотку на цепь
 * @param blago  толщина благоустройства, мм
 */
export function lotokGeometry(p: LotokParams, depth: number, count: number, blago: number): LotokGeometry {
  const tray = trayOf(p.trayMark);
  const plate = plateOf(p.plateMark);

  /* Щиты крепления стоят внутри пазух, поэтому в ширину не добавляются */
  const B1 = tray.width * Math.max(1, count) + p.b3 + p.b4;
  const B2 = Number.isFinite(p.b2) && (p.b2 ?? 0) > 0 ? p.b2! : B1;
  const Htr = Math.max(0, depth * 1000);

  const bottom = 0;
  const trayBottom = bottom + p.h1;
  const trayTop = trayBottom + tray.height;
  const plateBottom = trayTop + p.h3;
  const plateTop = plateBottom + plate.thickness;
  const marker = plateTop + p.h4;
  const tape = plateTop + p.h5;
  const surface = Htr;
  const blagoY = Math.max(tape, surface - blago);
  const h6 = blagoY - tape;

  /* Кабели лежат треугольником на подсыпке внутри лотка: верх пакета — это
     два ряда кабеля, по нему и считается глубина заложения */
  const cableTop = trayBottom + CALC.trayBottom + p.h2 + 2 * CABLE_D;
  const zptY = plateBottom;

  return {
    tray,
    plate,
    B1,
    B2,
    Htr,
    hBlago: blago,
    h6,
    h2Inside: p.h2,
    levels: { bottom, trayBottom, trayTop, plateBottom, plateTop, marker, tape, blago: blagoY, surface },
    hCable: Math.max(0, surface - cableTop),
    hZpt: Math.max(0, surface - zptY),
  };
}

/** Диаметр кабеля 110 кВ, мм — по нему считается глубина заложения */
const CABLE_D = 100;

/* ================= объёмы по слоям разреза ================= */

/** Миллиметры в метры — размеры разреза хранятся как на чертеже */
const m = (mm: number) => mm / 1000;

export interface LotokVolumes {
  /** Разработка грунта — вся траншея */
  total: Expr;
  /** Основание под лотком, h₁ */
  bedding: Expr;
  /** Лоток и плита — вытесненный ими объём */
  struct: Expr;
  /** Засыпка вокруг конструкций: пазухи и слой h₃ */
  around: Expr;
  /** Подсыпка под кабель внутри лотка, h₂ — в баланс траншеи не входит */
  inside: Expr;
  /** Обратная засыпка от верха плиты до низа благоустройства */
  backfill: Expr;
  /** Толщина благоустройства — этот грунт обратно не возвращается */
  blago: Expr;
}

/**
 * Ширина траншеи для слоя.
 *
 * У трапеции средняя ширина слоя равна ширине на его середине, поэтому объём
 * слоя считается точно. Пока стенки отвесные (B₂ = B₁), в формуле стоит B₁ —
 * так она и читается на чертеже; при наклонных стенках появляется средняя
 * ширина, и обозначение это показывает.
 */
function widthVar(g: LotokGeometry, y1: number, y2: number): Expr {
  const w = widthAt(g, (y1 + y2) / 2);
  return v(g.B1 === g.B2 ? "B₁" : "B_ср", m(w));
}

/**
 * Объёмы слоёв разреза на участке длиной L с n лотками в ряду.
 *
 * Слои разбивают траншею без остатка: основание, конструкции, засыпка вокруг
 * них, обратная засыпка и благоустройство в сумме дают разработку. Это баланс
 * грунта, и он проверяется тестом, а не подразумевается.
 *
 * Каждый объём — выражение с обозначениями разреза, поэтому в ведомости рядом
 * с числом стоит правило, по которому оно получено.
 */
export function lotokVolumes(g: LotokGeometry, L: number, n: number): LotokVolumes {
  const lv = g.levels;
  const len = v("L", L);
  const rows = Math.max(1, n);
  const perRow = (e: Expr): Expr => (rows > 1 ? mul(e, num(rows)) : e);

  /* Высота слоя — это сумма своих составляющих, а не одна подпись: так в
     числовой записи видно каждое слагаемое, и скобки расставляются сами */
  const layer = (y1: number, y2: number, height: Expr): Expr =>
    mul(widthVar(g, y1, y2), height, len);

  const total = mul(
    div(add(v("B₁", m(g.B1)), v("B₂", m(g.B2))), num(2)),
    v("H_тр", m(g.Htr)),
    len,
  );

  const struct = perRow(
    mul(
      add(
        mul(v("B_лот", m(g.tray.width)), v("h_лот", m(g.tray.height))),
        mul(v("B_пл", m(g.plate.width)), v("h_пл", m(g.plate.thickness))),
      ),
      len,
    ),
  );

  return {
    total,
    bedding: layer(lv.bottom, lv.trayBottom, v("h₁", m(lv.trayBottom - lv.bottom))),
    struct,
    /* Всё между низом лотка и верхом плиты, кроме самих изделий */
    around: sub(
      layer(
        lv.trayBottom,
        lv.plateTop,
        add(
          v("h_лот", m(g.tray.height)),
          v("h₃", m(lv.plateBottom - lv.trayTop)),
          v("h_пл", m(g.plate.thickness)),
        ),
      ),
      struct,
    ),
    inside: perRow(mul(v("B_вн", m(trayInnerWidth(g))), v("h₂", m(g.h2Inside)), len)),
    backfill: layer(lv.plateTop, lv.blago, add(v("h₅", m(lv.tape - lv.plateTop)), v("h₆", m(g.h6)))),
    blago: layer(lv.blago, lv.surface, v("H_благо", m(g.hBlago))),
  };
}

const trayInnerWidth = (g: LotokGeometry) => g.tray.width - 2 * CALC.trayWall;
