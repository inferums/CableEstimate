import { DEFAULT_SURFACES } from "../data/catalogs";
import type { ProjectState, Segment, TrenchType, VoltageClass } from "../lib/types";

/**
 * Проект с одним участком — основа почти всех проверок расчёта.
 * Ширина траншеи по умолчанию взята заведомо достаточной, чтобы ряд лотков
 * помещался при любом числе цепей и посторонние предупреждения не мешали.
 */
export function project(over: {
  type: TrenchType;
  voltage?: VoltageClass;
  chains?: number;
  width?: number;
  length?: number;
  depth?: number;
  segments?: Segment[];
}): ProjectState {
  const width = over.width ?? 4.2;
  const length = over.length ?? 100;
  const depth = over.depth ?? 1.6;
  return {
    projectName: "тест",
    projectCode: "ТЕСТ",
    voltage: over.voltage ?? "0.4-10",
    chains: over.chains ?? 1,
    types: ["lotok", "open", "block", "gnb", "splice"],
    params: {
      gnb: { boreDiameter: 300, pipes: [{ id: "p1", diameter: 110, count: 4 }] },
      block: { width, bedding: 0.1, beddingType: "sand", pipes: [{ id: "p2", diameter: 160, count: 2 }] },
      lotok: {
        width, bedding: 0.1, beddingType: "sand",
        trayMark: "Л4-8", plateMark: "П5-8",
        topFill: 300, tapeWidth: 950, pgsAbove: 100, pgsTop: 70, pgsInside: 70,
      },
      open: { width, bedding: 0.1, beddingType: "sand", cover: "pzk", plateMark: "П5д-8" },
      splice: { width, bedding: 0.1, beddingType: "sand" },
    },
    segments: over.segments ?? [
      { id: "s1", from: "1", to: "2", type: over.type, length, h1: depth, h2: depth, surfaceId: "lawn" },
    ],
    surfaces: DEFAULT_SURFACES,
  };
}

/** Суммарный объём позиций ведомости, чьё наименование подходит под образец */
export const sumRows = (
  rows: { name: string; unit: string; qty: number }[],
  re: RegExp,
  unit = "м³",
) => rows.filter((r) => re.test(r.name) && r.unit === unit).reduce((s, r) => s + r.qty, 0);

/** Объём первой подходящей позиции, или null если такой нет */
export const rowQty = (rows: { name: string; qty: number }[], re: RegExp) =>
  rows.find((r) => re.test(r.name))?.qty ?? null;

/** Типы прокладки, разрабатываемые в траншее или котловане */
export const DUG_TYPES: TrenchType[] = ["lotok", "open", "block", "splice"];
