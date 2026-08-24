export type VoltageClass = "0.4-10" | "35" | "110-220";
export type TrenchType = "gnb" | "block" | "lotok" | "open";
export type BeddingType = "sand" | "pgs";
export type OpenCover = "plates" | "pzk";

export interface PipeEntry {
  id: string;
  diameter: number; // мм
  count: number; // шт труб в пучке
}

export interface GnbParams {
  boreDiameter: number; // диаметр скважины, мм
  pipes: PipeEntry[];
}

export interface BlockParams {
  width: number; // ширина траншеи, м
  bedding: number; // толщина подсыпки, м
  beddingType: BeddingType;
  pipes: PipeEntry[];
}

export interface LotokParams {
  width: number;
  bedding: number;
  beddingType: BeddingType;
  trayMark: string;
  plateMark: string;
}

export interface OpenParams {
  width: number;
  bedding: number;
  beddingType: BeddingType;
  cover: OpenCover; // плиты перекрытия либо ПЗК
  plateMark: string;
}

export interface ParamsMap {
  gnb: GnbParams;
  block: BlockParams;
  lotok: LotokParams;
  open: OpenParams;
}

export interface Segment {
  id: string;
  from: string; // точка А
  to: string; // точка Б
  type: TrenchType;
  length: number; // м
  h1: number; // глубина в точке А, м
  h2: number; // глубина в точке Б, м
}

export interface ProjectState {
  projectName: string;
  projectCode: string;
  voltage: VoltageClass;
  types: TrenchType[];
  chains: number;
  params: ParamsMap;
  segments: Segment[];
}

export interface VorRow {
  section: number;
  name: string;
  unit: string;
  qty: number;
  segments: string[];
}

export interface VorSection {
  id: number;
  title: string;
}

export const VOR_SECTIONS: VorSection[] = [
  { id: 1, title: "Земляные работы" },
  { id: 2, title: "Монтаж конструкций и защитных труб" },
  { id: 3, title: "Кабельные работы" },
];
