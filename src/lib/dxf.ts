import DxfParser from "dxf-parser";

export interface DxfEntity {
  type: string;
  layer?: string;
  lineType?: string;
  color?: number;
  vertices?: { x: number; y: number }[];
  startPoint?: { x: number; y: number; z: number };
  endPoint?: { x: number; y: number; z: number };
  center?: { x: number; y: number; z: number };
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  text?: string;
  insertionPoint?: { x: number; y: number; z: number };
  name?: string;
  xScale?: number;
  yScale?: number;
  rotation?: number;
  height?: number;
  width?: number;
  closed?: boolean;
  bulge?: number;
}

export interface ParsedDxf {
  entities: DxfEntity[];
  blocks: Record<string, DxfEntity[]>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

function resolveInserts(
  entities: DxfEntity[],
  blocks: Record<string, DxfEntity[]>,
  depth = 0,
): DxfEntity[] {
  if (depth > 10) return [];
  const result: DxfEntity[] = [];
  for (const e of entities) {
    if (e.type === "INSERT" && e.name && blocks[e.name]) {
      const blockEnts = blocks[e.name];
      const ox = e.insertionPoint?.x ?? 0;
      const oy = e.insertionPoint?.y ?? 0;
      const sx = e.xScale ?? 1;
      const sy = e.yScale ?? 1;
      const rot = ((e.rotation ?? 0) * Math.PI) / 180;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const resolved = resolveInserts(blockEnts, blocks, depth + 1);
      for (const be of resolved) {
        const transformed = transformEntity(be, ox, oy, sx, sy, cosR, sinR);
        if (transformed) result.push(transformed);
      }
    } else {
      result.push(e);
    }
  }
  return result;
}

function transformEntity(
  e: DxfEntity,
  ox: number,
  oy: number,
  sx: number,
  sy: number,
  cosR: number,
  sinR: number,
): DxfEntity | null {
  const tx = (x: number, y: number) => ox + x * sx * cosR - y * sy * sinR;
  const ty = (x: number, y: number) => oy + x * sx * sinR + y * sy * cosR;

  if (e.type === "LINE" && e.startPoint && e.endPoint) {
    return {
      ...e,
      startPoint: { x: tx(e.startPoint.x, e.startPoint.y), y: ty(e.startPoint.x, e.startPoint.y), z: 0 },
      endPoint: { x: tx(e.endPoint.x, e.endPoint.y), y: ty(e.endPoint.x, e.endPoint.y), z: 0 },
    };
  }
  if (e.type === "CIRCLE" && e.center) {
    return {
      ...e,
      center: { x: tx(e.center.x, e.center.y), y: ty(e.center.x, e.center.y), z: 0 },
      radius: (e.radius ?? 0) * Math.abs(sx),
    };
  }
  if (e.type === "ARC" && e.center) {
    return {
      ...e,
      center: { x: tx(e.center.x, e.center.y), y: ty(e.center.x, e.center.y), z: 0 },
      radius: (e.radius ?? 0) * Math.abs(sx),
      startAngle: (e.startAngle ?? 0) + (e.rotation ?? 0),
      endAngle: (e.endAngle ?? 0) + (e.rotation ?? 0),
    };
  }
  if ((e.type === "LWPOLYLINE" || e.type === "POLYLINE") && e.vertices) {
    return {
      ...e,
      vertices: e.vertices.map((v) => ({ x: tx(v.x, v.y), y: ty(v.x, v.y) })),
    };
  }
  if (e.type === "TEXT" && e.insertionPoint) {
    return {
      ...e,
      insertionPoint: { x: tx(e.insertionPoint.x, e.insertionPoint.y), y: ty(e.insertionPoint.x, e.insertionPoint.y), z: 0 },
    };
  }
  if (e.type === "MTEXT" && e.insertionPoint) {
    return {
      ...e,
      insertionPoint: { x: tx(e.insertionPoint.x, e.insertionPoint.y), y: ty(e.insertionPoint.x, e.insertionPoint.y), z: 0 },
    };
  }
  return e;
}

function computeBounds(entities: DxfEntity[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const expand = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const e of entities) {
    if (e.type === "LINE" && e.startPoint && e.endPoint) {
      expand(e.startPoint.x, e.startPoint.y);
      expand(e.endPoint.x, e.endPoint.y);
    } else if (e.type === "CIRCLE" && e.center && e.radius) {
      expand(e.center.x - e.radius, e.center.y - e.radius);
      expand(e.center.x + e.radius, e.center.y + e.radius);
    } else if (e.type === "ARC" && e.center && e.radius) {
      expand(e.center.x - e.radius, e.center.y - e.radius);
      expand(e.center.x + e.radius, e.center.y + e.radius);
    } else if ((e.type === "LWPOLYLINE" || e.type === "POLYLINE") && e.vertices) {
      for (const v of e.vertices) expand(v.x, v.y);
    } else if (e.type === "TEXT" && e.insertionPoint) {
      expand(e.insertionPoint.x, e.insertionPoint.y);
    } else if (e.type === "MTEXT" && e.insertionPoint) {
      expand(e.insertionPoint.x, e.insertionPoint.y);
    }
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  return { minX, minY, maxX, maxY };
}

export function parseDxf(text: string): ParsedDxf {
  const parser = new DxfParser();
  const dxf = parser.parse(text);
  if (!dxf) throw new Error("DXF parse error");

  const rawEntities: DxfEntity[] = (dxf.entities ?? []) as DxfEntity[];
  const blocks: Record<string, DxfEntity[]> = {};
  if (dxf.blocks) {
    for (const [name, block] of Object.entries(dxf.blocks)) {
      blocks[name] = (block.entities ?? []) as DxfEntity[];
    }
  }

  const entities = resolveInserts(rawEntities, blocks);
  const bounds = computeBounds(entities);

  return { entities, blocks, bounds };
}

export async function fetchAndParseDxf(url: string): Promise<ParsedDxf> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DXF fetch failed: ${res.status}`);
  const text = await res.text();
  return parseDxf(text);
}
