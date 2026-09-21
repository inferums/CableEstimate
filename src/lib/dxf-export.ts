import type { ProjectState } from "./types";
import { niceLength, planGeometry, profileGeometry } from "./route-geometry";

/* ================================================================
   Экспорт трассы в DXF (AutoCAD R12, ASCII)
   Файл открывается в AutoCAD, nanoCAD, Компас и др.

   Формат R12 выбран ради совместимости, поэтому здесь только его
   примитивы: LINE, CIRCLE, TEXT и POLYLINE с вершинами. LWPOLYLINE
   появился в R14, и в файле с заголовком AC1009 AutoCAD его не читает.

   Кодировка — Windows-1251 с $DWGCODEPAGE = ANSI_1251: R12 не знает
   UTF-8, и кириллица в именах слоёв и подписях иначе превращается в мусор.

   План пишется в координатах съёмки (X чертежа — восток, Y — север),
   поэтому трасса ложится на топооснову без переноса. Профиль строится
   под планом: по горизонтали 1:1, по вертикали с превышением ×10.
   ================================================================ */

/** Превышение вертикального масштаба профиля над горизонтальным */
export const PROFILE_EXAGGERATION = 10;

const EOL = "\r\n";

const num = (n: number) => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

function pair(code: number, val: string | number): string {
  return `${String(code).padStart(3)}${EOL}${typeof val === "number" ? num(val) : val}${EOL}`;
}

/** Текст для DXF: символ диаметра и знаки, которых нет в 1251 */
const dxfText = (s: string) =>
  s.replace(/Ø/g, "%%c").replace(/×/g, "x").replace(/²/g, "2").replace(/³/g, "3");

function line(x1: number, y1: number, x2: number, y2: number, layer: string): string {
  return (
    pair(0, "LINE") +
    pair(8, layer) +
    pair(10, x1) + pair(20, y1) + pair(30, 0) +
    pair(11, x2) + pair(21, y2) + pair(31, 0)
  );
}

function circle(cx: number, cy: number, r: number, layer: string): string {
  return (
    pair(0, "CIRCLE") +
    pair(8, layer) +
    pair(10, cx) + pair(20, cy) + pair(30, 0) +
    pair(40, r)
  );
}

function text(x: number, y: number, str: string, h: number, layer: string, rotation = 0): string {
  return (
    pair(0, "TEXT") +
    pair(8, layer) +
    pair(10, x) + pair(20, y) + pair(30, 0) +
    pair(40, h) +
    pair(1, dxfText(str)) +
    (rotation ? pair(50, rotation) : "")
  );
}

/** Полилиния в формате R12: заголовок, вершины и SEQEND */
function polyline(pts: { x: number; y: number }[], layer: string): string {
  let s =
    pair(0, "POLYLINE") +
    pair(8, layer) +
    pair(66, 1) +
    pair(10, 0) + pair(20, 0) + pair(30, 0) +
    pair(70, 0);
  for (const p of pts) {
    s += pair(0, "VERTEX") + pair(8, layer) + pair(10, p.x) + pair(20, p.y) + pair(30, 0);
  }
  return s + pair(0, "SEQEND") + pair(8, layer);
}

/** Слои: имя и цвет ACI */
const LAYERS: [string, number][] = [
  ["ТРАССА", 3],
  ["ПИКЕТЫ", 1],
  ["ПОДПИСИ", 7],
  ["РАЗМЕРЫ", 5],
  ["ПРОФИЛЬ_ЗЕМЛЯ", 30],
  ["ПРОФИЛЬ_ДНО", 5],
  ["ПРОФИЛЬ_СЕТКА", 8],
];

function tables(): string {
  let s = pair(0, "SECTION") + pair(2, "TABLES");

  s += pair(0, "TABLE") + pair(2, "LTYPE") + pair(70, 1);
  s += pair(0, "LTYPE") + pair(2, "CONTINUOUS") + pair(70, 0) + pair(3, "Solid line") +
    pair(72, 65) + pair(73, 0) + pair(40, 0);
  s += pair(0, "ENDTAB");

  s += pair(0, "TABLE") + pair(2, "LAYER") + pair(70, LAYERS.length);
  for (const [name, color] of LAYERS) {
    s += pair(0, "LAYER") + pair(2, name) + pair(70, 0) + pair(62, color) + pair(6, "CONTINUOUS");
  }
  s += pair(0, "ENDTAB");

  return s + pair(0, "ENDSEC");
}

export function generateDxf(state: ProjectState): string {
  const plan = planGeometry(state.segments);
  const prof = profileGeometry(state.segments);
  const e: string[] = [];

  if (plan.lines.length === 0) {
    return assemble(e, 0, 0);
  }

  const pts = plan.lines.flatMap((l) => [l.a, l.b]);
  const minE = Math.min(...pts.map((p) => p.e));
  const maxE = Math.max(...pts.map((p) => p.e));
  const minN = Math.min(...pts.map((p) => p.n));
  const extent = Math.max(maxE - minE, Math.max(...pts.map((p) => p.n)) - minN, 10);
  /* Высота текста — от размера чертежа, чтобы подписи читались при любой длине трассы */
  const th = Math.max(0.5, niceLength(extent / 150));

  /* === План === */
  for (const { seg, a, b } of plan.lines) {
    e.push(polyline([{ x: a.e, y: a.n }, { x: b.e, y: b.n }], "ТРАССА"));
    let ang = (Math.atan2(b.n - a.n, b.e - a.e) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    e.push(text((a.e + b.e) / 2, (a.n + b.n) / 2 + th * 0.6, `${(seg.length || 0).toFixed(2)} м`, th * 0.8, "РАЗМЕРЫ", ang));
  }
  for (const node of plan.nodes) {
    e.push(circle(node.e, node.n, th * 0.4, "ПИКЕТЫ"));
    e.push(text(node.e + th * 0.6, node.n + th * 0.6, node.label, th, "ПОДПИСИ"));
  }
  if (!plan.surveyed) {
    e.push(text(minE, minN + th * 4, "Условная схема: у участков нет плановых координат съёмки", th, "ПОДПИСИ"));
  }

  /* === Продольный профиль — под планом === */
  const nodes = prof.nodes;
  if (nodes.length >= 2) {
    const elevs = nodes.flatMap((n) => [n.ground, n.bottom]);
    const zMin = Math.floor(Math.min(...elevs)) - 1;
    const zMax = Math.ceil(Math.max(...elevs)) + 1;
    const k = PROFILE_EXAGGERATION;
    const x0 = minE;
    const y0 = minN - th * 12 - (zMax - zMin) * k;
    const px = (d: number) => x0 + d;
    const py = (z: number) => y0 + (z - zMin) * k;

    /* Сетка отметок */
    for (let z = zMin; z <= zMax; z++) {
      e.push(line(px(0), py(z), px(prof.total), py(z), "ПРОФИЛЬ_СЕТКА"));
      e.push(text(px(0) - th * 5, py(z) - th * 0.4, z.toFixed(0), th * 0.8, "ПРОФИЛЬ_СЕТКА"));
    }

    e.push(polyline(nodes.map((n) => ({ x: px(n.dist), y: py(n.ground) })), "ПРОФИЛЬ_ЗЕМЛЯ"));
    e.push(polyline(nodes.map((n) => ({ x: px(n.dist), y: py(n.bottom) })), "ПРОФИЛЬ_ДНО"));

    for (const n of nodes) {
      e.push(line(px(n.dist), py(n.ground), px(n.dist), py(n.bottom), "ПРОФИЛЬ_СЕТКА"));
      if (n.label) {
        e.push(text(px(n.dist), py(zMax) + th, n.label, th, "ПОДПИСИ", 90));
      }
      e.push(text(px(n.dist) + th * 0.3, py(n.bottom) - th * 1.4, `h=${(n.ground - n.bottom).toFixed(2)}`, th * 0.7, "РАЗМЕРЫ", 90));
    }

    const caption = prof.absolute
      ? `Продольный профиль. Отметки по съёмке. Масштаб: гориз. 1:1, верт. x${k}`
      : `Продольный профиль относительно поверхности: отметки земли не заданы. Масштаб: гориз. 1:1, верт. x${k}`;
    e.push(text(px(0), py(zMin) - th * 3, caption, th, "ПОДПИСИ"));
  }

  return assemble(e, minE, minN);
}

function assemble(entities: string[], baseX: number, baseY: number): string {
  return (
    pair(999, "CableEstimate DXF R12") +
    pair(0, "SECTION") + pair(2, "HEADER") +
    pair(9, "$ACADVER") + pair(1, "AC1009") +
    pair(9, "$DWGCODEPAGE") + pair(3, "ANSI_1251") +
    pair(9, "$INSBASE") + pair(10, baseX) + pair(20, baseY) + pair(30, 0) +
    pair(0, "ENDSEC") +
    tables() +
    pair(0, "SECTION") + pair(2, "ENTITIES") +
    entities.join("") +
    pair(0, "ENDSEC") +
    pair(0, "EOF")
  );
}

/* ================================================================
   Windows-1251: кириллица и типографские знаки, остальное — «?»
   ================================================================ */

const CP1251_EXTRA: Record<number, number> = {
  0x0401: 0xa8, 0x0451: 0xb8, // Ё ё
  0x2116: 0xb9, // №
  0x2013: 0x96, 0x2014: 0x97, // – —
  0x00ab: 0xab, 0x00bb: 0xbb, // « »
  0x00b0: 0xb0, 0x00b7: 0xb7, // ° ·
  0x201c: 0x93, 0x201d: 0x94, 0x201e: 0x84, // “ ” „
};

export function encodeCp1251(s: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(s.length);
  let i = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out[i++] = c;
    else if (c >= 0x0410 && c <= 0x044f) out[i++] = c - 0x0410 + 0xc0;
    else out[i++] = CP1251_EXTRA[c] ?? 0x3f;
  }
  return out.slice(0, i);
}

/** Скачать DXF-файл */
export function downloadDxf(state: ProjectState) {
  const bytes = encodeCp1251(generateDxf(state));
  const blob = new Blob([bytes], { type: "application/dxf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const code = (state.projectCode || "КЛ").replace(/\s+/g, "_");
  a.href = url;
  a.download = `trassa_${code}.dxf`;
  a.click();
  URL.revokeObjectURL(url);
}
