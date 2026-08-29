import { useId } from "react";
import { PLATES, PZK, TRAYS } from "../data/catalogs";
import type { ParamsMap, Surface, TrenchType } from "../lib/types";
import { DxfViewer } from "./DxfViewer";

/* инженерные разрезы по типам прокладки + разрезы покрытий */

const INK = "#3F3F46";
const MUT = "#71717A";
const ACC = "#2563EB";
const SOIL = "#F2F2F3";

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const uid = (base: string) => `${base}${useId().replace(/:/g, "")}`;

function Arrow({ x, y, dir }: { x: number; y: number; dir: "l" | "r" | "u" | "d" }) {
  const s = 4;
  const d =
    dir === "l"
      ? `M${x + s} ${y - s / 1.6}L${x} ${y}L${x + s} ${y + s / 1.6}`
      : dir === "r"
        ? `M${x - s} ${y - s / 1.6}L${x} ${y}L${x - s} ${y + s / 1.6}`
        : dir === "u"
          ? `M${x - s / 1.6} ${y + s}L${x} ${y}L${x + s / 1.6} ${y + s}`
          : `M${x - s / 1.6} ${y - s}L${x} ${y}L${x + s / 1.6} ${y - s}`;
  return <path d={d} fill="none" stroke={ACC} strokeWidth="1" />;
}

function DimH({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  return (
    <g>
      <line x1={x1} y1={y - 6} x2={x1} y2={y + 3} stroke={ACC} strokeWidth="0.7" />
      <line x1={x2} y1={y - 6} x2={x2} y2={y + 3} stroke={ACC} strokeWidth="0.7" />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={ACC} strokeWidth="0.9" />
      <Arrow x={x1} y={y} dir="l" />
      <Arrow x={x2} y={y} dir="r" />
      <text x={(x1 + x2) / 2} y={y - 3.5} textAnchor="middle" fontSize="8" fontFamily="JetBrains Mono, monospace" fill={ACC} fontWeight="600">
        {label}
      </text>
    </g>
  );
}

function DimV({ x, y1, y2, label, side = "l" }: { x: number; y1: number; y2: number; label: string; side?: "l" | "r" }) {
  return (
    <g>
      <line x1={x - 5} y1={y1} x2={x + 3} y2={y1} stroke={ACC} strokeWidth="0.7" />
      <line x1={x - 5} y1={y2} x2={x + 3} y2={y2} stroke={ACC} strokeWidth="0.7" />
      <line x1={x} y1={y1} x2={x} y2={y2} stroke={ACC} strokeWidth="0.9" />
      <Arrow x={x} y={y1} dir="u" />
      <Arrow x={x} y={y2} dir="d" />
      <text
        x={side === "l" ? x - 6 : x + 6}
        y={(y1 + y2) / 2 + 2.5}
        textAnchor={side === "l" ? "end" : "start"}
        fontSize="8"
        fontFamily="JetBrains Mono, monospace"
        fill={ACC}
        fontWeight="600"
      >
        {label}
      </text>
    </g>
  );
}

function Ground({ y, soilId }: { y: number; soilId: string }) {
  const ticks = [];
  for (let x = 14; x < 326; x += 9) {
    ticks.push(<line key={x} x1={x} y1={y + 1} x2={x - 5} y2={y + 7} stroke="#D4D4D8" strokeWidth="0.8" />);
  }
  return (
    <g>
      <rect x={10} y={y} width={320} height={180 - y} fill={`url(#${soilId})`} opacity="0.55" />
      <line x1={10} y1={y} x2={330} y2={y} stroke={INK} strokeWidth="1.4" />
      {ticks}
    </g>
  );
}

function Defs({ sand, gravel, conc }: { sand: string; gravel: string; conc: string }) {
  return (
    <defs>
      <pattern id={sand} width="7" height="7" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.8" fill="#A1A1AA" />
        <circle cx="5.5" cy="5" r="0.8" fill="#A1A1AA" />
      </pattern>
      <pattern id={gravel} width="10" height="9" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="3" r="1.7" fill="none" stroke="#A1A1AA" strokeWidth="0.7" />
        <circle cx="7.5" cy="6.5" r="1.4" fill="none" stroke="#A1A1AA" strokeWidth="0.7" />
      </pattern>
      <pattern id={conc} width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M0 8 8 0M-2 2 2 -2M6 10 10 6" stroke="#C9CBD1" strokeWidth="0.9" />
      </pattern>
      <pattern id={`${sand}-soil`} width="14" height="14" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="4" r="0.6" fill="#D4D4D8" />
        <circle cx="10" cy="9" r="0.6" fill="#D4D4D8" />
        <circle cx="6" cy="12" r="0.5" fill="#D4D4D8" />
      </pattern>
    </defs>
  );
}

const Txt = ({ x, y, t, anchor = "start", fill = MUT, size = 8, bold = false }: { x: number; y: number; t: string; anchor?: "start" | "middle" | "end"; fill?: string; size?: number; bold?: boolean }) => (
  <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={bold ? 700 : 400} fontFamily="JetBrains Mono, monospace" fill={fill}>
    {t}
  </text>
);

function Trench(B: number, y0 = 42, yB = 158, cx = 168) {
  const wb = clamp(46 + B * 105, 60, 190);
  const wt = wb + 70;
  const x1t = cx - wt / 2, x2t = cx + wt / 2, x1b = cx - wb / 2, x2b = cx + wb / 2;
  return {
    wb, wt, x1t, x2t, x1b, x2b,
    el: (
      <g>
        <path d={`M${x1t} ${y0}L${x1b} ${yB}H${x2b}L${x2t} ${y0}`} fill="#FFFFFF" stroke={INK} strokeWidth="1.2" />
        <path d={`M${x1t} ${y0}L${x1b} ${yB}H${x2b}L${x2t} ${y0}`} fill="none" stroke={INK} strokeWidth="1.2" opacity="0" />
      </g>
    ),
  };
}

function Pipes({ pipes, cx, baseY, maxW }: { pipes: { diameter: number; count: number }[]; cx: number; baseY: number; maxW: number }) {
  const list: { cx: number; cy: number; r: number }[] = [];
  let x = cx - maxW / 2 + 8;
  let y = baseY;
  const rows: number[] = [];
  for (const p of pipes) {
    const r = clamp(2.5 + (p.diameter / 630) * 10, 3.5, 11);
    for (let i = 0; i < Math.min(p.count, 14); i++) {
      if (x + r * 2 > cx + maxW / 2 - 6) {
        x = cx - maxW / 2 + 8;
        y -= rows[rows.length - 1] * 2 + 3;
        rows.push(r);
      } else {
        if (rows.length === 0) rows.push(r);
      }
      list.push({ cx: x + r, cy: y - r, r });
      x += r * 2 + 2.5;
    }
  }
  return (
    <g>
      {list.map((c, i) => (
        <g key={i}>
          <circle cx={c.cx} cy={c.cy} r={c.r} fill="#fff" stroke={ACC} strokeWidth="1.1" />
          <circle cx={c.cx} cy={c.cy} r={Math.max(0.8, c.r * 0.25)} fill={ACC} opacity="0.55" />
        </g>
      ))}
    </g>
  );
}

/* ============================ ГНБ ============================ */
function GnbDiagram({ bore, pipes }: { bore: number; pipes: { diameter: number; count: number }[] }) {
  const soilId = uid("soil");
  const yG = 44, yB = 138;
  const rb = clamp(15 + ((bore - 200) / 800) * 26, 15, 41);
  const n = pipes.reduce((s, p) => s + p.count, 0);
  const rp = clamp(3 + (pipes[0]?.diameter ?? 110) / 630 * 8, 3.5, 9);
  const shown = Math.min(n, 5);
  const pts = Array.from({ length: shown }, (_, i) => {
    const a = Math.PI * (0.18 + (0.64 * i) / Math.max(1, shown - 1));
    return { x: 168 + Math.cos(a) * rb * 0.62, y: yB + Math.sin(a) * rb * 0.62 - rp };
  });
  return (
    <svg viewBox="0 0 340 200" className="w-full h-auto select-none">
      <Defs sand={soilId + "s"} gravel={soilId + "g"} conc={soilId + "c"} />
      <pattern id={soilId} width="14" height="14" patternUnits="userSpaceOnUse">
        <circle cx="3" cy="4" r="0.6" fill="#D4D4D8" />
        <circle cx="10" cy="9" r="0.6" fill="#D4D4D8" />
      </pattern>
      <Ground y={yG} soilId={soilId} />
      {/* приямки */}
      <rect x={26} y={yG} width={26} height={30} fill="#fff" stroke={INK} strokeWidth="1.1" />
      <rect x={288} y={yG} width={26} height={30} fill="#fff" stroke={INK} strokeWidth="1.1" />
      {/* траектория */}
      <path d={`M52 ${yG + 26}C100 ${yG + 30} 112 ${yB} 168 ${yB}C224 ${yB} 236 ${yG + 30} 288 ${yG + 26}`} fill="none" stroke={INK} strokeWidth="1" strokeDasharray="4 3" opacity="0.55" />
      {/* скважина */}
      <circle cx={168} cy={yB} r={rb} fill="#fff" stroke={ACC} strokeWidth="1.1" strokeDasharray="4 3" />
      {/* трубы */}
      {shown > 0 ? (
        pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={rp} fill="#fff" stroke={ACC} strokeWidth="1.1" />
            <circle cx={p.x} cy={p.y} r={Math.max(0.7, rp * 0.25)} fill={ACC} opacity="0.55" />
          </g>
        ))
      ) : (
        <Txt x={168} y={yB + 3} t="нет труб" anchor="middle" />
      )}
      <line x1={168 + rb * 0.72} y1={yB - rb * 0.72} x2={216} y2={84} stroke={MUT} strokeWidth="0.7" />
      <Txt x={219} y={82} t={`Ø${bore} мм`} fill={ACC} />
      <Txt x={168} y={yB + rb + 12} t={n > 0 ? `труб: ${n} шт` : "пучок труб пуст"} anchor="middle" />
      {pipes.slice(0, 3).map((p, i) => (
        <Txt key={i} x={168} y={yB + rb + 22 + i * 9} t={`Ø${p.diameter} × ${p.count}`} anchor="middle" fill={MUT} />
      ))}
      <DimV x={318} y1={yG} y2={yB} label="H по уч." side="l" />
      <Txt x={16} y={yG - 5} t="поверхность" />
    </svg>
  );
}

/* ======================== трубный блок ======================= */
function BlockDiagram({ p }: { p: ParamsMap["block"] }) {
  const sand = uid("sand");
  const t = Trench(p.width);
  const hb = clamp(p.bedding * 220, 8, 26);
  return (
    <svg viewBox="0 0 340 200" className="w-full h-auto select-none">
      <Defs sand={sand} gravel={sand + "g"} conc={sand + "c"} />
      <Ground y={42} soilId={sand + "-soil"} />
      {t.el}
      <rect x={t.x1b + 3} y={158 - hb} width={t.wb - 6} height={hb} fill={`url(#${sand})`} stroke={MUT} strokeWidth="0.7" />
      <Pipes pipes={p.pipes} cx={168} baseY={158 - hb} maxW={t.wb} />
      <DimH x1={t.x1t} x2={t.x2t} y={28} label={`B=${p.width.toFixed(2).replace(".", ",")} м`} />
      <DimV x={318} y1={42} y2={158} label="H" />
      <line x1={t.x1b + 2} y1={158 - hb / 2} x2={70} y2={176} stroke={MUT} strokeWidth="0.7" />
      <Txt x={66} y={184} t={`подсыпка ${p.beddingType === "sand" ? "песок" : "ПГС"} t=${Math.round(p.bedding * 100)} см`} />
      <Txt x={168} y={194} t={`труб: ${p.pipes.reduce((s, x) => s + x.count, 0)} шт`} anchor="middle" fill={ACC} />
    </svg>
  );
}

/* =========================== лотки (DXF) =========================== */
function LotokDiagram({ p, cables }: { p: ParamsMap["lotok"]; cables: number }) {
  const tray = TRAYS.find((t) => t.mark === p.trayMark) ?? TRAYS[0];
  const plate = PLATES.find((t) => t.mark === p.plateMark) ?? PLATES[0];

  const annotations = [
    { x: 23, y: 4.5, label: `Лоток: ${tray.mark}`, color: ACC },
    { x: 23, y: 7.5, label: `${tray.innerW}×${tray.innerH} мм`, color: MUT },
    { x: 23, y: 10, label: `Плита: ${plate.mark}`, color: ACC },
    { x: 23, y: 12.5, label: `B=${p.width.toFixed(2).replace(".", ",")} м`, color: ACC },
    { x: 23, y: 15, label: `Подсыпка: ${p.beddingType === "sand" ? "песок" : "ПГС"} ${Math.round(p.bedding * 100)} см`, color: MUT },
    { x: 23, y: 17.5, label: `Кабелей: ${cables} шт`, color: ACC },
  ];

  return (
    <div className="relative">
      <DxfViewer url="/lotok.dxf" annotations={annotations} />
      <div className="absolute bottom-1 right-2 font-mono text-[9px] text-mut2 opacity-70">
        Сер. 3.006.1-2
      </div>
    </div>
  );
}

/* ===================== открытый способ ======================= */
function OpenDiagram({ p, cables }: { p: ParamsMap["open"]; cables: number }) {
  const sand = uid("sand");
  const conc = uid("conc");
  const t = Trench(p.width);
  const hb = clamp(p.bedding * 220, 8, 24);
  const bedTop = 158 - hb;
  const showCables = Math.min(cables, 6);
  const cableY = bedTop - 7;
  const protY = cableY - 14;
  const protW = Math.min(t.wb - 10, 120);
  return (
    <svg viewBox="0 0 340 200" className="w-full h-auto select-none">
      <Defs sand={sand} gravel={sand + "g"} conc={conc} />
      <Ground y={42} soilId={sand + "-soil"} />
      {t.el}
      <rect x={t.x1b + 3} y={bedTop} width={t.wb - 6} height={hb} fill={`url(#${sand})`} stroke={MUT} strokeWidth="0.7" />
      {Array.from({ length: showCables }, (_, i) => {
        const gap = (t.wb - 20) / (showCables + 1);
        return (
          <g key={i}>
            <circle cx={t.x1b + 10 + gap * (i + 1)} cy={cableY} r={3.6} fill="#fff" stroke={ACC} strokeWidth="1.1" />
            <path d={`M${t.x1b + 10 + gap * (i + 1) - 2} ${cableY}h4`} stroke={ACC} strokeWidth="0.8" />
          </g>
        );
      })}
      {p.cover === "plates" ? (
        <rect x={168 - protW / 2} y={protY - 9} width={protW} height={9} fill={`url(#${conc})`} stroke={INK} strokeWidth="1" />
      ) : (
        Array.from({ length: 5 }, (_, i) => (
          <rect key={i} x={168 - protW / 2 + i * (protW / 5) + 1.5} y={protY - 7} width={protW / 5 - 3} height={7} fill="#fff" stroke={INK} strokeWidth="1" />
        ))
      )}
      <DimH x1={t.x1t} x2={t.x2t} y={26} label={`B=${p.width.toFixed(2).replace(".", ",")} м`} />
      <DimV x={318} y1={42} y2={158} label="H" />
      <line x1={168 + protW / 2 - 4} y1={protY - 4} x2={258} y2={protY - 20} stroke={MUT} strokeWidth="0.7" />
      <Txt x={261} y={protY - 22} t={p.cover === "plates" ? `${p.plateMark}` : PZK.mark} fill={ACC} />
      <line x1={168} y1={cableY + 6} x2={90} y2={178} stroke={MUT} strokeWidth="0.7" />
      <Txt x={86} y={186} t={`кабелей: ${cables}`} />
      <line x1={t.x1b + 2} y1={bedTop + hb / 2} x2={52} y2={176} stroke={MUT} strokeWidth="0.7" />
      <Txt x={48} y={184} t={`t=${Math.round(p.bedding * 100)} см`} />
    </svg>
  );
}

/* ======================= муфтовое поле ======================= */
function SpliceDiagram({ p }: { p: ParamsMap["splice"] }) {
  const sand = uid("sand");
  const t = Trench(Math.max(p.width, 1.2), 42, 150);
  const hb = clamp(p.bedding * 220, 8, 24);
  const bedTop = 150 - hb;
  return (
    <svg viewBox="0 0 340 200" className="w-full h-auto select-none">
      <Defs sand={sand} gravel={sand + "g"} conc={sand + "c"} />
      <Ground y={42} soilId={sand + "-soil"} />
      {t.el}
      <rect x={t.x1b + 3} y={bedTop} width={t.wb - 6} height={hb} fill={`url(#${sand})`} stroke={MUT} strokeWidth="0.7" />
      {/* кабель с муфтой */}
      <line x1={t.x1b + 8} y1={bedTop - 7} x2={150} y2={bedTop - 7} stroke={ACC} strokeWidth="1.6" />
      <line x1={186} y1={bedTop - 7} x2={t.x2b - 8} y2={bedTop - 7} stroke={ACC} strokeWidth="1.6" />
      <rect x={150} y={bedTop - 13} width={36} height={12} rx={3} fill="#fff" stroke={ACC} strokeWidth="1.3" />
      <path d={`M154 ${bedTop - 7}h6M176 ${bedTop - 7}h6`} stroke={ACC} strokeWidth="1.3" />
      <circle cx={168} cy={bedTop - 7} r={2.2} fill={ACC} />
      <DimH x1={t.x1t} x2={t.x2t} y={26} label={`B=${Math.max(p.width, 1.2).toFixed(2).replace(".", ",")} м`} />
      <DimV x={318} y1={42} y2={150} label="H" />
      <line x1={186} y1={bedTop - 13} x2={250} y2={bedTop - 34} stroke={MUT} strokeWidth="0.7" />
      <Txt x={253} y={bedTop - 36} t="соед. муфта" fill={ACC} />
      <line x1={t.x1b + 2} y1={bedTop + hb / 2} x2={52} y2={176} stroke={MUT} strokeWidth="0.7" />
      <Txt x={48} y={184} t={`подсыпка t=${Math.round(p.bedding * 100)} см`} />
      <Txt x={168} y={192} t="поле монтажа муфт" anchor="middle" />
    </svg>
  );
}

/* ========================== switch =========================== */
export function TrenchDiagram({
  type,
  params,
  cables,
  className = "",
}: {
  type: TrenchType;
  params: ParamsMap;
  cables: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {type === "gnb" && <GnbDiagram bore={params.gnb.boreDiameter} pipes={params.gnb.pipes} />}
      {type === "block" && <BlockDiagram p={params.block} />}
      {type === "lotok" && <LotokDiagram p={params.lotok} cables={cables} />}
      {type === "open" && <OpenDiagram p={params.open} cables={cables} />}
      {type === "splice" && <SpliceDiagram p={params.splice} />}
    </div>
  );
}

/* ======================= разрез покрытия ===================== */
function patternFor(name: string, id: string) {
  const n = name.toLowerCase();
  let inner: React.ReactNode;
  if (n.includes("асфальт")) inner = <path d="M0 6 6 0M-1.5 1.5 1.5 -1.5M4.5 7.5 7.5 4.5" stroke="#52525B" strokeWidth="0.9" />;
  else if (n.includes("плитк")) inner = <path d="M0 0h6v6H0zM6 6h6v6H6z" stroke="#71717A" strokeWidth="0.7" fill="none" />;
  else if (n.includes("щеб")) inner = <><circle cx="3" cy="3" r="1.6" fill="none" stroke="#71717A" strokeWidth="0.7" /><circle cx="8" cy="7" r="1.3" fill="none" stroke="#71717A" strokeWidth="0.7" /></>;
  else if (n.includes("пес") || n.includes("пгс")) inner = <><circle cx="2.5" cy="2.5" r="0.8" fill="#A1A1AA" /><circle cx="7" cy="6" r="0.8" fill="#A1A1AA" /></>;
  else inner = <path d="M0 3h5M4 7h5" stroke="#A1A1AA" strokeWidth="0.8" />;
  return (
    <pattern id={id} width="10" height="10" patternUnits="userSpaceOnUse">
      {inner}
    </pattern>
  );
}

export function SurfaceDiagram({ surface, className = "" }: { surface: Surface; className?: string }) {
  const base = uid("sf");
  const layers = surface.layers.filter((l) => l.thickness > 0);
  const total = layers.reduce((s, l) => s + l.thickness, 0) || 1;
  const H = 150;
  let y = 34;
  const boxes = layers.map((l, i) => {
    const h = Math.max(22, (l.thickness / total) * H);
    const b = { l, y, h, i };
    y += h;
    return b;
  });
  const bx = 48;
  const bw = 190;
  return (
    <svg viewBox="0 0 430 268" className={`w-full h-auto select-none ${className}`}>
      <defs>
        {layers.map((l, i) => patternFor(l.name, `${base}${i}`))}
        <pattern id={`${base}soil`} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="4" r="0.6" fill="#D4D4D8" />
          <circle cx="10" cy="9" r="0.6" fill="#D4D4D8" />
        </pattern>
      </defs>
      <line x1={14} y1={34} x2={416} y2={34} stroke={INK} strokeWidth="1.4" />
      <Txt x={14} y={22} t={`Разрез: «${surface.name}»`} fill={ACC} size={13} bold />
      <Txt x={416} y={22} t={`Σ ${(total / 100).toFixed(2).replace(".", ",")} м`} anchor="end" size={11} fill={MUT} />
      {boxes.map(({ l, y: by, h, i }) => (
        <g key={i}>
          <rect x={bx} y={by} width={bw} height={h} fill={`url(#${base}${i})`} stroke={INK} strokeWidth="1" />
          <rect x={bx} y={by} width={bw} height={h} fill="#fff" opacity="0.25" />
          <line x1={bx + bw} y1={by + h / 2} x2={bx + bw + 10} y2={by + h / 2} stroke={MUT} strokeWidth="0.8" />
          <Txt x={bx + bw + 14} y={by + h / 2 + 4} t={l.name} size={11.5} />
          <text x={416} y={by + h / 2 + 4} textAnchor="end" fontSize="12.5" fontFamily="JetBrains Mono, monospace" fontWeight="700" fill={ACC}>
            {Math.round(l.thickness)} см
          </text>
          {/* размерная скобка */}
          <line x1={bx - 8} y1={by + 2} x2={bx - 8} y2={by + h - 2} stroke={ACC} strokeWidth="1" />
          <line x1={bx - 11} y1={by + 2} x2={bx - 5} y2={by + 2} stroke={ACC} strokeWidth="0.8" />
          <line x1={bx - 11} y1={by + h - 2} x2={bx - 5} y2={by + h - 2} stroke={ACC} strokeWidth="0.8" />
        </g>
      ))}
      <rect x={bx} y={y} width={bw} height={30} fill={`url(#${base}soil)`} stroke={INK} strokeWidth="1" strokeDasharray="3 2" />
      <Txt x={bx + bw + 14} y={y + 19} t="земляное полотно" size={10.5} fill={MUT} />
    </svg>
  );
}
