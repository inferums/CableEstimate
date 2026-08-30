import { useMemo } from "react";
import type { ProjectState, Segment } from "../lib/types";
import { TRENCH_META } from "../data/catalogs";

/* ================================================================
   Цвета типов траншеи для визуализации
   ================================================================ */

const TYPE_COLORS: Record<string, string> = {
  open: "#3B82F6",
  lotok: "#8B5CF6",
  block: "#F59E0B",
  gnb: "#EF4444",
  splice: "#10B981",
};

/* ================================================================
   Генерация синтетических координат плана
   (когда нет реальных XY-данных съёмки)
   ================================================================ */

interface PlanPoint {
  x: number;
  y: number;
  label: string;
}

function generatePlanPoints(segments: Segment[]): PlanPoint[] {
  if (segments.length === 0) return [];

  const pts: PlanPoint[] = [{ x: 0, y: 0, label: segments[0].from }];
  let cx = 0,
    cy = 0;
  const baseAngle = -Math.PI / 4;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const angle = baseAngle + (i * Math.PI) / (segments.length + 1);
    cx += Math.cos(angle) * seg.length;
    cy += Math.sin(angle) * seg.length;
    pts.push({ x: cx, y: cy, label: seg.to });
  }

  return pts;
}

/* ================================================================
   План трассы (вид сверху) — SVG
   ================================================================ */

export function PlanView({
  state,
}: {
  state: ProjectState;
}) {
  const { points, bounds } = useMemo(() => {
    const pts = generatePlanPoints(state.segments);
    if (pts.length === 0) return { points: [], bounds: null };

    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = Math.max(maxX - minX, maxY - minY) * 0.12 || 10;

    return {
      points: pts,
      bounds: {
        minX: minX - pad,
        maxX: maxX + pad,
        minY: minY - pad,
        maxY: maxY + pad,
      },
    };
  }, [state.segments]);

  if (!bounds || points.length < 2) {
    return (
      <div className="border border-dashed border-line2 rounded-lg p-8 text-center text-sm text-mut2">
        Добавьте участки для отображения плана трассы
      </div>
    );
  }

  const W = 800;
  const H = 400;
  const rangeX = bounds.maxX - bounds.minX;
  const rangeY = bounds.maxY - bounds.minY;
  const scale = Math.min(W / rangeX, H / rangeY);

  const toSvg = (p: PlanPoint) => ({
    x: (p.x - bounds.minX) * scale,
    y: H - (p.y - bounds.minY) * scale,
  });

  const svgPts = points.map(toSvg);
  const polyline = svgPts.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="border border-line rounded-lg bg-surface overflow-hidden">
      <div className="px-4 py-2 border-b border-line bg-raise flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-mut">
          План трассы (схема)
        </span>
        <span className="text-[10px] font-mono text-mut2">
          {state.segments.length} участков · {state.segments.reduce((s, seg) => s + seg.length, 0).toFixed(0)} м
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 420 }}>
        <defs>
          <marker id="arrow-end" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#94A3B8" />
          </marker>
        </defs>

        {/* Фоновая сетка */}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`gx${i}`} x1={(i + 1) * W / 9} y1={0} x2={(i + 1) * W / 9} y2={H}
            stroke="#F1F5F9" strokeWidth={0.5} />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <line key={`gy${i}`} x1={0} y1={(i + 1) * H / 5} x2={W} y2={(i + 1) * H / 5}
            stroke="#F1F5F9" strokeWidth={0.5} />
        ))}

        {/* Сегменты — цветные линии */}
        {state.segments.map((seg, i) => {
          const p1 = svgPts[i];
          const p2 = svgPts[i + 1];
          if (!p1 || !p2) return null;
          const color = TYPE_COLORS[seg.type] ?? "#6B7280";
          return (
            <g key={seg.id}>
              {/* Тень */}
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke={color} strokeWidth={6} strokeOpacity={0.15} strokeLinecap="round" />
              {/* Основная линия */}
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke={color} strokeWidth={2.5} strokeLinecap="round" />
              {/* Подпись типа */}
              <text
                x={(p1.x + p2.x) / 2}
                y={(p1.y + p2.y) / 2 - 8}
                textAnchor="middle"
                fontSize={9}
                fontWeight={600}
                fill={color}
                className="select-none"
              >
                {TRENCH_META[seg.type]?.short ?? seg.type} · {seg.length.toFixed(0)}м
              </text>
            </g>
          );
        })}

        {/* Точки пикетов */}
        {svgPts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={4} fill="white" stroke={TYPE_COLORS[state.segments[i]?.type ?? state.segments[i - 1]?.type] ?? "#6B7280"} strokeWidth={2} />
            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={9} fontWeight={700} fill="#1E293B">
              {points[i].label}
            </text>
          </g>
        ))}

        {/* Масштабная линейка */}
        <g transform={`translate(${W - 120}, ${H - 25})`}>
          <line x1={0} y1={0} x2={scale * 10} y2={0} stroke="#64748B" strokeWidth={1.5} />
          <line x1={0} y1={-3} x2={0} y2={3} stroke="#64748B" strokeWidth={1.5} />
          <line x1={scale * 10} y1={-3} x2={scale * 10} y2={3} stroke="#64748B" strokeWidth={1.5} />
          <text x={scale * 5} y={12} textAnchor="middle" fontSize={8} fill="#64748B" fontFamily="monospace">
            10 м
          </text>
        </g>

        {/* Условные обозначения */}
        <g transform="translate(10, 10)">
          {Object.entries(TYPE_COLORS).map(([type, color], i) => {
            const meta = TRENCH_META[type as keyof typeof TRENCH_META];
            if (!meta) return null;
            return (
              <g key={type} transform={`translate(0, ${i * 14})`}>
                <rect x={0} y={-4} width={12} height={3} rx={1} fill={color} />
                <text x={16} y={0} fontSize={8} fill="#64748B">{meta.short}</text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/* ================================================================
   Продольный профиль — SVG
   ================================================================ */

interface ProfilePoint {
  cumDist: number;
  ground: number;
  bottom: number;
  cable: number;
  label: string;
}

function buildProfile(segments: Segment[]): ProfilePoint[] {
  if (segments.length === 0) return [];

  const pts: ProfilePoint[] = [];
  let cumDist = 0;
  const firstSeg = segments[0];

  pts.push({
    cumDist: 0,
    ground: firstSeg.groundElev1 ?? 100,
    bottom: (firstSeg.groundElev1 ?? 100) - firstSeg.h1,
    cable: (firstSeg.groundElev1 ?? 100) - firstSeg.h1 + 0.05,
    label: firstSeg.from,
  });

  for (const seg of segments) {
    cumDist += seg.length;
    const gnd = seg.groundElev2 ?? seg.groundElev1 ?? 100;
    pts.push({
      cumDist,
      ground: gnd,
      bottom: gnd - seg.h2,
      cable: gnd - seg.h2 + 0.05,
      label: seg.to,
    });
  }

  return pts;
}

export function ProfileView({
  state,
}: {
  state: ProjectState;
}) {
  const profile = useMemo(() => buildProfile(state.segments), [state.segments]);

  if (profile.length < 2) {
    return (
      <div className="border border-dashed border-line2 rounded-lg p-8 text-center text-sm text-mut2">
        Добавьте участки для отображения продольного профиля
      </div>
    );
  }

  const W = 800;
  const H = 300;
  const padL = 55;
  const padR = 15;
  const padT = 20;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const totalDist = profile[profile.length - 1].cumDist;
  const allElevs = profile.flatMap((p) => [p.ground, p.bottom]);
  const minElev = Math.min(...allElevs) - 0.5;
  const maxElev = Math.max(...allElevs) + 0.5;
  const elevRange = maxElev - minElev || 1;

  const toX = (dist: number) => padL + (dist / totalDist) * plotW;
  const toY = (elev: number) => padT + plotH - ((elev - minElev) / elevRange) * plotH;

  const groundPath = profile.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.cumDist)},${toY(p.ground)}`).join(" ");
  const bottomPath = profile.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.cumDist)},${toY(p.bottom)}`).join(" ");
  const cablePath = profile.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.cumDist)},${toY(p.cable)}`).join(" ");

  // Земляная засыпка (area между ground и bottom)
  const groundFill =
    groundPath +
    ` L${toX(profile[profile.length - 1].cumDist)},${toY(minElev)}` +
    ` L${toX(0)},${toY(minElev)} Z`;

  // Оси Y — засечки
  const yTicks = 5;
  const yTickStep = elevRange / yTicks;

  // Оси X — засечки (каждые N метров)
  const xTickStep = totalDist <= 50 ? 5 : totalDist <= 200 ? 20 : 50;

  return (
    <div className="border border-line rounded-lg bg-surface overflow-hidden">
      <div className="px-4 py-2 border-b border-line bg-raise flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-mut">
          Продольный профиль
        </span>
        <span className="text-[10px] font-mono text-mut2">
          {totalDist.toFixed(0)} м · отм. {minElev.toFixed(1)}–{maxElev.toFixed(1)} м
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 320 }}>
        <defs>
          <linearGradient id="ground-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4A76A" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#D4A76A" stopOpacity={0.08} />
          </linearGradient>
        </defs>

        {/* Область графика */}
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="#FAFAFA" stroke="#E2E8F0" strokeWidth={0.5} />

        {/* Горизонтальные линии сетки + подписи Y */}
        {Array.from({ length: yTicks + 1 }, (_, i) => {
          const elev = minElev + i * yTickStep;
          const y = toY(elev);
          return (
            <g key={`yt${i}`}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#E2E8F0" strokeWidth={0.5} />
              <text x={padL - 5} y={y + 3} textAnchor="end" fontSize={8} fill="#94A3B8" fontFamily="monospace">
                {elev.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Вертикальные линии сетки + подписи X */}
        {Array.from({ length: Math.ceil(totalDist / xTickStep) + 1 }, (_, i) => {
          const dist = Math.min(i * xTickStep, totalDist);
          const x = toX(dist);
          return (
            <g key={`xt${i}`}>
              <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="#E2E8F0" strokeWidth={0.5} />
              <text x={x} y={padT + plotH + 12} textAnchor="middle" fontSize={8} fill="#94A3B8" fontFamily="monospace">
                {dist.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Подписи осей */}
        <text x={padL + plotW / 2} y={H - 3} textAnchor="middle" fontSize={9} fill="#64748B">
          Расстояние, м
        </text>
        <text x={12} y={padT + plotH / 2} textAnchor="middle" fontSize={9} fill="#64748B"
          transform={`rotate(-90, 12, ${padT + plotH / 2})`}>
          Отметка, м
        </text>

        {/* Земляная засыпка */}
        <path d={groundFill} fill="url(#ground-grad)" />

        {/* Линия земли */}
        <path d={groundPath} fill="none" stroke="#92400E" strokeWidth={2} strokeLinejoin="round" />

        {/* Дно траншеи */}
        <path d={bottomPath} fill="none" stroke="#3B82F6" strokeWidth={1.5} strokeDasharray="6,3" strokeLinejoin="round" />

        {/* Кабель */}
        <path d={cablePath} fill="none" stroke="#16A34A" strokeWidth={1.5} strokeLinejoin="round" />

        {/* Точки пикетов + подписи */}
        {profile.map((p, i) => {
          const x = toX(p.cumDist);
          const yGnd = toY(p.ground);
          return (
            <g key={i}>
              {/* Вертикальная линия от земли до дна */}
              <line x1={x} y1={yGnd} x2={x} y2={toY(p.bottom)}
                stroke="#94A3B8" strokeWidth={0.5} strokeDasharray="2,2" />
              {/* Точка на земле */}
              <circle cx={x} cy={yGnd} r={3} fill="#92400E" />
              {/* Точка на дне */}
              <circle cx={x} cy={toY(p.bottom)} r={2.5} fill="#3B82F6" />
              {/* Подпись пикета */}
              <text x={x} y={padT - 5} textAnchor="middle" fontSize={8} fontWeight={600} fill="#1E293B">
                {p.label}
              </text>
              {/* Глубина */}
              <text x={x + 4} y={(yGnd + toY(p.bottom)) / 2 + 3} fontSize={7} fill="#64748B" fontFamily="monospace">
                {(p.ground - p.bottom).toFixed(1)}м
              </text>
            </g>
          );
        })}

        {/* Легенда */}
        <g transform={`translate(${padL + 10}, ${padT + 12})`}>
          <rect x={-4} y={-8} width={130} height={42} rx={4} fill="white" fillOpacity={0.85} stroke="#E2E8F0" strokeWidth={0.5} />
          <line x1={0} y1={0} x2={14} y2={0} stroke="#92400E" strokeWidth={2} />
          <text x={18} y={3} fontSize={8} fill="#64748B">Поверхность земли</text>
          <line x1={0} y1={12} x2={14} y2={12} stroke="#3B82F6" strokeWidth={1.5} strokeDasharray="6,3" />
          <text x={18} y={15} fontSize={8} fill="#64748B">Дно траншеи</text>
          <line x1={0} y1={24} x2={14} y2={24} stroke="#16A34A" strokeWidth={1.5} />
          <text x={18} y={27} fontSize={8} fill="#64748B">Кабель</text>
        </g>
      </svg>
    </div>
  );
}
