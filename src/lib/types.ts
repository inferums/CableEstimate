export type VoltageClass = "0.4-10" | "35" | "110-220";
export type TrenchType = "gnb" | "block" | "lotok" | "open" | "splice";

export interface PipeEntry {
  id: string;
  diameter: number; // мм
  count: number;
}

export interface TrenchParamsBase {
  width: number; // м
  bedding: number; // м
  beddingType: "sand" | "pgs";
}

export interface GnbParams {
  boreDiameter: number; // мм
  pipes: PipeEntry[];
}

export interface LotokParams extends TrenchParamsBase {
  trayMark: string;
  plateMark: string;
  /* Толщины слоёв (мм) — задаются пользователем */
  topFill: number;      // верхняя засыпка
  tapeWidth: number;    // ширина сигнальной ленты
  pgsAbove: number;     // ПГС над плитой
  pgsTop: number;       // ПГС над лотком
  pgsInside: number;    // ПГС внутри лотка
}

export interface OpenParams extends TrenchParamsBase {
  cover: "plates" | "pzk";
  plateMark: string;
}

export type SpliceParams = TrenchParamsBase;

export interface ParamsMap {
  gnb: GnbParams;
  block: TrenchParamsBase & { pipes: PipeEntry[] };
  lotok: LotokParams;
  open: OpenParams;
  splice: SpliceParams;
}

/** Слой дорожного покрытия, см */
export interface SurfaceLayer {
  name: string;
  thickness: number; // см
}

/** Тип покрытия для благоустройства */
export interface Surface {
  id: string;
  name: string;
  layers: SurfaceLayer[];
}

export interface Segment {
  id: string;
  from: string;
  to: string;
  type: TrenchType;
  length: number; // м (горизонтальное проложение)
  h1: number; // глубина в точке 1, м
  h2: number; // глубина в точке 2, м
  surfaceId: string; // покрытие для благоустройства
  slopeLength?: number; // наклонная длина (по данным съёмки), м
  groundElev1?: number; // отметка земли в начале, м
  groundElev2?: number; // отметка земли в конце, м
  /* Плановые координаты начала и конца по съёмке, м. Система геодезическая:
     X — северная координата, Y — восточная. */
  planX1?: number;
  planY1?: number;
  planX2?: number;
  planY2?: number;
  designLength?: number; // проектная длина, м
  designH1?: number; // проектная глубина в начале, м
  designH2?: number; // проектная глубина в конце, м
}

/** Метаданные исполнительной съёмки */
export interface SurveyMeta {
  date: string;
  surveyor: string;
  fileName: string;
}

/** Марка кабеля в кабельном журнале */
export interface CableSpec {
  id: string;
  mark: string;
  crossSection: string;
  voltage: string;
  from: string;
  to: string;
  designLength: number;
}

/** Грунт — один на всю линию */
export interface SoilParams {
  /** Группа грунта по трудности разработки (ГЭСН 01), 1–6 */
  group: number;
  /** Доля мокрого грунта в разработке, % */
  wetShare: number;
}

export interface ProjectState {
  projectName: string;
  projectCode: string;
  voltage: VoltageClass;
  types: TrenchType[];
  chains: number;
  soil: SoilParams;
  params: ParamsMap;
  segments: Segment[];
  surfaces: Surface[];
  surveyMeta?: SurveyMeta;
  cableJournal?: CableSpec[];
}

export interface VorItem {
  name: string;
  unit: string;
  qty: number;
  formula: string;
}

/**
 * Четыре классических раздела ведомости. Разделы фиксированы: их номера не
 * зависят от того, какие способы прокладки встретились в проекте, иначе один и
 * тот же вид работ получал бы в разных проектах разные номера. Способ прокладки
 * — это подраздел внутри раздела.
 */
export const VOR_SECTIONS = [
  { id: 1, title: "Земляные работы" },
  { id: 2, title: "Каналы, трубы и конструкции" },
  { id: 3, title: "Кабельные работы" },
  { id: 4, title: "Благоустройство" },
] as const;

export type VorSectionId = (typeof VOR_SECTIONS)[number]["id"];

export const sectionTitle = (id: VorSectionId): string =>
  VOR_SECTIONS.find((s) => s.id === id)!.title;

export interface SubSection {
  /** Раздел ведомости, в который попадают позиции подраздела */
  section: VorSectionId;
  /** Подраздел — как правило, способ прокладки */
  title: string;
  items: VorItem[];
}

export interface VorRow {
  section: VorSectionId;
  sectionTitle: string;
  subSection: string;
  name: string;
  unit: string;
  qty: number;
  segments: string[];
  formula: string;
}
