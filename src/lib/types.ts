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

export interface ProjectState {
  projectName: string;
  projectCode: string;
  voltage: VoltageClass;
  types: TrenchType[];
  chains: number;
  params: ParamsMap;
  segments: Segment[];
  surfaces: Surface[];
  surveyMeta?: SurveyMeta;
  cableJournal?: CableSpec[];
}

export interface VorRow {
  section: number;
  name: string;
  unit: string;
  qty: number;
  segments: string[];
}

export const VOR_SECTIONS = [
  { id: 1, title: "Земляные работы" },
  { id: 2, title: "Каналы, трубы и конструкции" },
  { id: 3, title: "Кабельные работы" },
  { id: 4, title: "Благоустройство" },
] as const;
