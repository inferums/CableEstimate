import { useId } from "react";
import { CALC, PLATES, PZK, TRAYS, trayInnerH, trayInnerW } from "../data/catalogs";
import type { ParamsMap, Surface, TrenchType } from "../lib/types";

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

/* =========================== лотки (по «Разрез в лотке.svg» — геометрия CAD) =========================== */
function LotokDiagram({ p, cables }: { p: ParamsMap["lotok"]; cables: number }) {
  const tray = TRAYS.find((t) => t.mark === p.trayMark) ?? TRAYS[0];
  const plate = PLATES.find((t) => t.mark === p.plateMark) ?? PLATES[0];

  const wallT = CALC.trayWall;
  const botT  = CALC.trayBottom;
  const plH   = plate.thickness;
  const iW    = trayInnerW(tray);
  const iH    = trayInnerH(tray);
  const lW    = tray.width;

  const hPgsInside = p.pgsInside;
  const cavityH = iH - hPgsInside;
  const lH = botT + hPgsInside + cavityH;

  const B = Math.max(p.width * 1000, lW + 200);

  const hPgsBot   = p.bedding * 1000;
  const hPgsTop   = p.pgsTop;
  const hPgsAbove = p.pgsAbove;
  const hTopFill  = p.topFill;
  const hTapeY    = 50;
  const hSoil     = 100;
  const H         = hTopFill + hSoil + hTapeY + hPgsAbove + plH + hPgsTop + lH + hPgsBot;

  const yMM = {
    surf:     0,
    topFill:  hTopFill,
    tape:     hTopFill + hSoil,
    pgsAbove: hTopFill + hSoil + hTapeY,
    plateTop: hTopFill + hSoil + hTapeY + hPgsAbove,
    plateBot: hTopFill + hSoil + hTapeY + hPgsAbove + plH,
    trayTop:  hTopFill + hSoil + hTapeY + hPgsAbove + plH + hPgsTop,
    trayBot:  hTopFill + hSoil + hTapeY + hPgsAbove + plH + hPgsTop + lH,
    bottom:   H,
  };

  const s = 0.18;
  const cx = 300;
  const Y = (mm: number) => mm * s + 30;
  const dimX = 22;

  const Bpx = B * s;
  const xTL = cx - Bpx / 2;
  const xTR = cx + Bpx / 2;
  const xLL = cx - (lW * s) / 2;
  const xLR = cx + (lW * s) / 2;
  const xIL = cx - (iW * s) / 2;
  const xIR = cx + (iW * s) / 2;
  const wPx = wallT * s;
  const bPx = botT * s;
  const cavityW = xIR - xIL;

  const yG = Y(0);
  const yEnd = Y(H);

  const soilSideId = uid("ss");
  const soilTrId   = uid("st");
  const concId     = uid("c");
  const pgsId      = uid("p");

  const showCables = Math.min(cables, 6);
  const cableR = Math.max(3, Math.min(8, cavityW / (showCables * 3)));

  const grassTicks: React.ReactNode[] = [];
  for (let x = dimX + 4; x < xTL - 2; x += 14) {
    grassTicks.push(<line key={`gl${x}`} x1={x} y1={yG + 1} x2={x - 5} y2={yG + 9} stroke="#999" strokeWidth="0.8" />);
    grassTicks.push(<line key={`gr${x}`} x1={xTR + 4 + (x - dimX)} y1={yG + 1} x2={xTR + (x - dimX) - 1} y2={yG + 9} stroke="#999" strokeWidth="0.8" />);
  }

  return (
    <svg viewBox={`0 0 600 ${Math.round(yEnd + 36)}`} className="w-full h-auto select-none" style={{ maxHeight: 520 }}>
      <defs>
        {/* Боковой грунт — однотонный светло-серый */}
        {/* Грунт в траншее — сиенит (звёздочки) ГОСТ 21.302-2013 */}
        <pattern id={soilTrId} width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M9 5 L9 13 M5 9 L13 9 M6.5 6.5 L11.5 11.5 M11.5 6.5 L6.5 11.5" stroke="#999" strokeWidth="0.5" />
        </pattern>
        <pattern id={concId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#555" strokeWidth="0.9" />
        </pattern>
        <pattern id={pgsId} width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.5" fill="none" stroke="#777" strokeWidth="0.7" />
          <circle cx="7.5" cy="7" r="1.2" fill="none" stroke="#777" strokeWidth="0.7" />
        </pattern>
      </defs>

      {/* Боковой грунт — однотонный #E8E8E8 */}
      <rect x={0} y={yG} width={xTL} height={yEnd - yG} fill="#E8E8E8" />
      <rect x={xTR} y={yG} width={600 - xTR} height={yEnd - yG} fill="#E8E8E8" />

      {/* Поверхность */}
      <line x1={0} y1={yG} x2={xTL} y2={yG} stroke="#333" strokeWidth="1.5" />
      <line x1={xTR} y1={yG} x2={600} y2={yG} stroke="#333" strokeWidth="1.5" />
      {grassTicks}

      {/* Стенки траншеи */}
      <line x1={xTL} y1={yG} x2={xTL} y2={yEnd} stroke="#333" strokeWidth="1" />
      <line x1={xTR} y1={yG} x2={xTR} y2={yEnd} stroke="#333" strokeWidth="1" />

      {/* Грунт в траншее — сиенит (звёздочки) */}
      <rect x={xTL} y={yG} width={Bpx} height={Y(yMM.tape) - yG} fill={`url(#${soilTrId})`} />
      <line x1={xTL} y1={Y(yMM.tape)} x2={xTR} y2={Y(yMM.tape)} stroke="#999" strokeWidth="0.6" />

      {/* Сигнальная лента: 3 отрезка на ОДНОЙ отметке (250+450+250 по X) с зазорами */}
      {(() => {
        const tapeY = Y(yMM.tape);
        const gap = 3;
        const totalW = p.tapeWidth * s;
        const edgeW = totalW * (250 / 950);
        const midW  = totalW * (450 / 950);
        const startX = cx - totalW / 2;
        return (
          <>
            <rect x={startX} y={tapeY - 4} width={edgeW - gap} height={8} fill="#DC2626" rx={1} />
            <rect x={startX + edgeW} y={tapeY - 4} width={midW - gap * 2} height={8} fill="#DC2626" rx={1} />
            <rect x={startX + edgeW + midW} y={tapeY - 4} width={edgeW - gap} height={8} fill="#DC2626" rx={1} />
          </>
        );
      })()}

      {/* ПГС над плитой (по всей ширине траншеи) */}
      <rect x={xTL} y={Y(yMM.pgsAbove)} width={Bpx} height={Y(yMM.plateTop) - Y(yMM.pgsAbove)} fill={`url(#${pgsId})`} />
      <line x1={xTL} y1={Y(yMM.plateTop)} x2={xTR} y2={Y(yMM.plateTop)} stroke="#999" strokeWidth="0.6" />

      {/* Плита */}
      <rect x={xLL - 6} y={Y(yMM.plateTop)} width={(xLR - xLL) + 12} height={Y(yMM.plateBot) - Y(yMM.plateTop)} fill={`url(#${concId})`} stroke="#333" strokeWidth="0.9" />

      {/* ПГС по бокам: от верха плиты до низа лотка (засыпка вокруг ЗПТ) */}
      <rect x={xTL} y={Y(yMM.plateTop)} width={xLL - xTL} height={Y(yMM.trayBot) - Y(yMM.plateTop)} fill={`url(#${pgsId})`} />
      <rect x={xLR} y={Y(yMM.plateTop)} width={xTR - xLR} height={Y(yMM.trayBot) - Y(yMM.plateTop)} fill={`url(#${pgsId})`} />

      {/* ЗПТ (засыпаны в ПГС) */}
      <circle cx={(xTL + xLL) / 2} cy={Y((yMM.plateTop + yMM.plateBot) / 2)} r={5} fill="#fff" stroke="#333" strokeWidth="1.2" />
      <circle cx={(xTR + xLR) / 2} cy={Y((yMM.plateTop + yMM.plateBot) / 2)} r={5} fill="#fff" stroke="#333" strokeWidth="1.2" />

      {/* ПГС между лотком и плитой (по центру, над лотком) */}
      <rect x={xLL} y={Y(yMM.plateBot)} width={xLR - xLL} height={Y(yMM.trayTop) - Y(yMM.plateBot)} fill={`url(#${pgsId})`} />
      <line x1={xTL} y1={Y(yMM.plateBot)} x2={xTR} y2={Y(yMM.plateBot)} stroke="#999" strokeWidth="0.6" />

      {/* Лоток U-образный */}
      <path
        d={`M${xLL} ${Y(yMM.trayTop)} V${Y(yMM.trayBot)} H${xLR} V${Y(yMM.trayTop)} H${xLR - wPx} V${Y(yMM.trayBot) - bPx} H${xLL + wPx} V${Y(yMM.trayTop)} Z`}
        fill={`url(#${concId})`} stroke="#333" strokeWidth="0.9"
      />

      {/* ПГС внутри лотка (на всю высоту полости) */}
      <rect x={xIL} y={Y(yMM.trayTop)} width={cavityW} height={Y(yMM.trayBot) - bPx - Y(yMM.trayTop)} fill={`url(#${pgsId})`} />

      {/* ПГС под лотком */}
      <rect x={xTL} y={Y(yMM.trayBot)} width={Bpx} height={Y(yMM.bottom) - Y(yMM.trayBot)} fill={`url(#${pgsId})`} />
      <line x1={xTL} y1={Y(yMM.trayBot)} x2={xTR} y2={Y(yMM.trayBot)} stroke="#999" strokeWidth="0.6" />

      {/* Кабели поверх ПГС (3 шт в треугольник 2+1) */}
      {Array.from({ length: Math.min(showCables, 2) }, (_, i) => {
        const gap = cavityW / 3;
        const cableCx = xIL + gap * (i + 1);
        const cableCy = Y(yMM.trayBot) - bPx - cableR - 4;
        return (
          <g key={`b${i}`}>
            <circle cx={cableCx} cy={cableCy} r={cableR} fill="#fff" stroke={ACC} strokeWidth="1.3" />
            <circle cx={cableCx} cy={cableCy} r={cableR * 0.3} fill={ACC} opacity="0.55" />
          </g>
        );
      })}
      {showCables >= 3 && (
        <g>
          <circle cx={cx} cy={Y(yMM.trayBot) - bPx - cableR * 2 - 10} r={cableR} fill="#fff" stroke={ACC} strokeWidth="1.3" />
          <circle cx={cx} cy={Y(yMM.trayBot) - bPx - cableR * 2 - 10} r={cableR * 0.3} fill={ACC} opacity="0.55" />
        </g>
      )}

      {/* Размерные выноски */}
      <DimV x={dimX} y1={yG} y2={yEnd} label={`${Math.round(H)}`} side="l" />
      <DimV x={578} y1={Y(yMM.pgsAbove)} y2={Y(yMM.plateTop)} label={`${hPgsAbove}`} side="r" />
      <DimV x={578} y1={Y(yMM.plateTop)} y2={Y(yMM.plateBot)} label={`${plH}`} side="r" />
      <DimV x={578} y1={Y(yMM.plateBot)} y2={Y(yMM.trayTop)} label={`${hPgsTop}`} side="r" />
      <DimV x={578} y1={Y(yMM.trayTop)} y2={Y(yMM.trayBot)} label={`${Math.round(lH)}`} side="r" />
      <DimV x={578} y1={Y(yMM.trayBot)} y2={yEnd} label={`${Math.round(hPgsBot)}`} side="r" />
      <DimH x1={xTL} x2={xTR} y={yEnd + 14} label={`${Math.round(B)} мм`} />

      {/* Подписи */}
      <line x1={xLR + 4} y1={Y(yMM.trayTop) + (Y(yMM.trayBot) - Y(yMM.trayTop)) / 2} x2={xTR + 18} y2={Y(yMM.trayTop) + (Y(yMM.trayBot) - Y(yMM.trayTop)) / 2 - 14} stroke={MUT} strokeWidth="0.6" />
      <Txt x={xTR + 20} y={Y(yMM.trayTop) + (Y(yMM.trayBot) - Y(yMM.trayTop)) / 2 - 16} t="лоток" fill={ACC} size={9} />

      <line x1={xLR + 6} y1={Y((yMM.plateTop + yMM.plateBot) / 2)} x2={xTR + 18} y2={Y((yMM.plateTop + yMM.plateBot) / 2) - 12} stroke={MUT} strokeWidth="0.6" />
      <Txt x={xTR + 20} y={Y((yMM.plateTop + yMM.plateBot) / 2) - 14} t="плита" fill={ACC} size={9} />

      <line x1={xTL} y1={Y(yMM.trayBot) + (Y(yMM.bottom) - Y(yMM.trayBot)) / 2} x2={xTL - 14} y2={Y(yMM.trayBot) + (Y(yMM.bottom) - Y(yMM.trayBot)) / 2 + 10} stroke={MUT} strokeWidth="0.6" />
      <Txt x={xTL - 16} y={Y(yMM.trayBot) + (Y(yMM.bottom) - Y(yMM.trayBot)) / 2 + 12} t="ПГС" anchor="end" fill={ACC} size={9} />

      <line x1={xTL - 4} y1={yG + (Y(yMM.tape) - yG) / 2} x2={xTL - 14} y2={yG + (Y(yMM.tape) - yG) / 2 + 10} stroke={MUT} strokeWidth="0.6" />
      <Txt x={xTL - 16} y={yG + (Y(yMM.tape) - yG) / 2 + 12} t="грунт" anchor="end" fill={ACC} size={9} />

      <text x={cx} y={yEnd + 30} textAnchor="middle" fontSize="10" fontFamily="JetBrains Mono, monospace" fill={ACC} fontWeight="600">
        {tray.mark} · {plate.mark} · Сер. 3.006.1-2
      </text>
    </svg>
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
