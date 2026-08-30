import type { ProjectState } from "./types";

/* ================================================================
   Экспорт трассы в DXF (AutoCAD R12 / формат ASCII)
   Файл открывается в AutoCAD, nanoCAD, Компас и др.
   ================================================================ */

/** Генерация синтетических координат (как в PlanView) */
function generateCoords(state: ProjectState): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [{ x: 0, y: 0 }];
  let cx = 0, cy = 0;
  const baseAngle = -Math.PI / 4;
  for (let i = 0; i < state.segments.length; i++) {
    const angle = baseAngle + (i * Math.PI) / (state.segments.length + 1);
    cx += Math.cos(angle) * state.segments[i].length;
    cy += Math.sin(angle) * state.segments[i].length;
    pts.push({ x: Math.round(cx * 1000) / 1000, y: Math.round(cy * 1000) / 1000 });
  }
  return pts;
}

function pair(code: number, val: string | number): string {
  return `  ${code}\n${val}\n`;
}

function line(x1: number, y1: number, x2: number, y2: number, layer: string): string {
  return (
    "0\nLINE\n" +
    pair(8, layer) +
    pair(10, x1) + pair(20, y1) + pair(30, 0) +
    pair(11, x2) + pair(21, y2) + pair(31, 0)
  );
}

function circle(cx: number, cy: number, r: number, layer: string): string {
  return (
    "0\nCIRCLE\n" +
    pair(8, layer) +
    pair(10, cx) + pair(20, cy) + pair(30, 0) +
    pair(40, r)
  );
}

function text(x: number, y: number, str: string, h: number, layer: string): string {
  return (
    "0\nTEXT\n" +
    pair(8, layer) +
    pair(10, x) + pair(20, y) + pair(30, 0) +
    pair(40, h) +
    pair(1, str)
  );
}

function lwpolyline(pts: { x: number; y: number }[], layer: string): string {
  let s =
    "0\nLWPOLYLINE\n" +
    pair(8, layer) +
    pair(90, pts.length) +
    pair(70, 0);
  for (const p of pts) {
    s += pair(10, p.x) + pair(20, p.y);
  }
  return s;
}

export function generateDxf(state: ProjectState): string {
  const coords = generateCoords(state);
  const e: string[] = [];

  // === Слой определения ===
  const tables =
    "0\nSECTION\n  2\nTABLES\n" +
    "0\nTABLE\n  2\nLAYER\n  70\n5\n" +
    "0\nLAYER\n  2\nТРАССА\n  70\n0\n  62\n3\n  6\nCONTINUOUS\n" +
    "0\nLAYER\n  2\nПИКЕТЫ\n  70\n0\n  62\n1\n  6\nCONTINUOUS\n" +
    "0\nLAYER\n  2\nПОДПИСИ\n  70\n0\n  62\n7\n  6\nCONTINUOUS\n" +
    "0\nLAYER\n  2\nРАЗМЕРЫ\n  70\n0\n  62\n5\n  6\nCONTINUOUS\n" +
    "0\nLAYER\n  2\nПРОФИЛЬ\n  70\n0\n  62\n6\n  6\nCONTINUOUS\n" +
    "0\nENDTAB\n" +
    "0\nENDSEC\n";

  // === План: полилиния трассы ===
  e.push(lwpolyline(coords, "ТРАССА"));

  // === План: пикеты и подписи ===
  for (let i = 0; i < coords.length; i++) {
    const p = coords[i];
    e.push(circle(p.x, p.y, 1.0, "ПИКЕТЫ"));
    const label = i === 0
      ? state.segments[0]?.from ?? "Н"
      : state.segments[i - 1]?.to ?? `PK${i}`;
    e.push(text(p.x + 1.5, p.y + 1.5, label, 2.0, "ПОДПИСИ"));

    if (i > 0) {
      const seg = state.segments[i - 1];
      const mx = (coords[i - 1].x + p.x) / 2;
      const my = (coords[i - 1].y + p.y) / 2;
      e.push(text(mx, my + 2, `${seg.length.toFixed(1)}м`, 1.5, "РАЗМЕРЫ"));
    }
  }

  // === Продольный профиль (ниже плана) ===
  const profY0 = -30;
  const profScaleX = 1;
  const profScaleZ = 5;
  const profPts: { x: number; y: number }[] = [];
  let cumDist = 0;

  for (let i = 0; i < state.segments.length; i++) {
    const seg = state.segments[i];
    const gnd1 = seg.groundElev1 ?? 100;
    const gnd2 = seg.groundElev2 ?? gnd1;

    if (i === 0) {
      profPts.push({
        x: cumDist * profScaleX,
        y: profY0 + (gnd1 - 100) * profScaleZ,
      });
    }
    cumDist += seg.length;
    profPts.push({
      x: cumDist * profScaleX,
      y: profY0 + (gnd2 - 100) * profScaleZ,
    });
  }

  if (profPts.length >= 2) {
    e.push(lwpolyline(profPts, "ПРОФИЛЬ"));

    for (let i = 0; i < state.segments.length; i++) {
      const seg = state.segments[i];
      const x = profPts[i].x;
      const gnd = profPts[i].y;
      const bottom = gnd - seg.h1 * profScaleZ;
      e.push(line(x, gnd, x, bottom, "ПРОФИЛЬ"));
    }
    const lastSeg = state.segments[state.segments.length - 1];
    const lastX = profPts[profPts.length - 1].x;
    const lastGnd = profPts[profPts.length - 1].y;
    e.push(line(lastX, lastGnd, lastX, lastGnd - lastSeg.h2 * profScaleZ, "ПРОФИЛЬ"));
  }

  // === Сборка файла ===
  return (
    "999\nCableEstimate VOR-KL DXF Export\n" +
    "0\nSECTION\n  2\nHEADER\n" +
    pair(9, "$ACADVER") + pair(1, "AC1009") +
    pair(9, "$INSBASE") + pair(10, 0) + pair(20, 0) + pair(30, 0) +
    "0\nENDSEC\n" +
    tables +
    "0\nSECTION\n  2\nENTITIES\n" +
    e.join("") +
    "0\nENDSEC\n" +
    "0\nEOF\n"
  );
}

/** Скачать DXF-файл */
export function downloadDxf(state: ProjectState) {
  const content = generateDxf(state);
  const blob = new Blob([content], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const code = (state.projectCode || "КЛ").replace(/\s+/g, "_");
  a.href = url;
  a.download = `trassa_${code}.dxf`;
  a.click();
  URL.revokeObjectURL(url);
}
