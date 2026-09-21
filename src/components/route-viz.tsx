import { useMemo } from "react";
import type { ProjectState } from "../lib/types";
import { TRENCH_META } from "../data/catalogs";
import { niceLength, planGeometry, profileGeometry, type PlanPoint } from "../lib/route-geometry";

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

/** Плашка в заголовке: откуда взяты данные */
function SourceBadge({ ok, okText, noText }: { ok: boolean; okText: string; noText: string }) {
  return (
    <span
      className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-semibold normal-case tracking-normal ${
        ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
      }`}
    >
      {ok ? okText : noText}
    </span>
  );
}

/* ================================================================
   План трассы (вид сверху) — SVG
   ================================================================ */

export function PlanView({
  state,
}: {
  state: ProjectState;
}) {
  const geo = useMemo(() => planGeometry(state.segments), [state.segments]);

  if (geo.lines.length === 0) {
    return (
      <div className="border border-dashed border-line2 rounded-lg p-8 text-center text-sm text-mut2">
        Добавьте участки для отображения плана трассы
      </div>
    );
  }

  const W = 800;
  const H = 400;
  const margin = 40;

  const pts = geo.lines.flatMap((l) => [l.a, l.b]);
  const minE = Math.min(...pts.map((p) => p.e));
  const maxE = Math.max(...pts.map((p) => p.e));
  const minN = Math.min(...pts.map((p) => p.n));
  const maxN = Math.max(...pts.map((p) => p.n));
  const rangeE = Math.max(maxE - minE, 1);
  const rangeN = Math.max(maxN - minN, 1);
  /* Масштаб одинаков по обеим осям — иначе план исказит углы поворота трассы */
  const scale = Math.min((W - 2 * margin) / rangeE, (H - 2 * margin) / rangeN);
  const offE = (W - rangeE * scale) / 2;
  const offN = (H - rangeN * scale) / 2;

  const toSvg = (p: PlanPoint) => ({
    x: offE + (p.e - minE) * scale,
    /* Север — вверх */
    y: H - offN - (p.n - minN) * scale,
  });

  const bar = niceLength(rangeE / 5);
  const totalLen = state.segments.reduce((s, seg) => s + (seg.length || 0), 0);

  return (
    <div className="border border-line rounded-lg bg-surface overflow-hidden">
      <div className="px-4 py-2 border-b border-line bg-raise flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-mut">
          План трассы
          <SourceBadge
            ok={geo.surveyed}
            okText="по съёмке"
            noText={`условная схема: нет координат у ${geo.missing} уч.`}
          />
        </span>
        <span className="text-[10px] font-mono text-mut2">
          {state.segments.length} участков · {totalLen.toFixed(0)} м
        </span>
      </div>
      {geo.breaks > 0 && (
        <div className="px-4 py-1.5 border-b border-line bg-amber-50 text-[11px] text-amber-800">
          Трасса разорвана в {geo.breaks} мест(ах): начало участка не совпадает с концом предыдущего.
          Проверьте порядок участков.
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 420 }}>
        {/* Фоновая сетка */}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`gx${i}`} x1={(i + 1) * W / 10} y1={0} x2={(i + 1) * W / 10} y2={H}
            stroke="#F1F5F9" strokeWidth={0.5} />
        ))}
        {Array.from({ length: 4 }, (_, i) => (
          <line key={`gy${i}`} x1={0} y1={(i + 1) * H / 5} x2={W} y2={(i + 1) * H / 5}
            stroke="#F1F5F9" strokeWidth={0.5} />
        ))}

        {/* Участки — цветные линии */}
        {geo.lines.map(({ seg, a, b }) => {
          const p1 = toSvg(a);
          const p2 = toSvg(b);
          const color = TYPE_COLORS[seg.type] ?? "#6B7280";
          /* Подпись вдоль участка, но без переворота вверх ногами */
          let angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
          if (angle > 90) angle -= 180;
          if (angle < -90) angle += 180;
          const mx = (p1.x + p2.x) / 2;
          const my = (p1.y + p2.y) / 2;
          return (
            <g key={seg.id}>
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke={color} strokeWidth={6} strokeOpacity={0.15} strokeLinecap="round" />
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                stroke={color} strokeWidth={2.5} strokeLinecap="round" />
              <text
                x={mx}
                y={my - 6}
                textAnchor="middle"
                fontSize={9}
                fontWeight={600}
                fill={color}
                transform={`rotate(${angle}, ${mx}, ${my})`}
                className="select-none"
              >
                {TRENCH_META[seg.type]?.short ?? seg.type} · {(seg.length || 0).toFixed(1)} м
              </text>
            </g>
          );
        })}

        {/* Пикеты */}
        {geo.nodes.map((node, i) => {
          const p = toSvg(node);
          return (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3.5} fill="white" stroke="#475569" strokeWidth={1.5} />
              <text x={p.x + 6} y={p.y - 6} fontSize={9} fontWeight={700} fill="#1E293B">
                {node.label}
              </text>
            </g>
          );
        })}

        {/* Стрелка севера — только когда план по съёмке */}
        {geo.surveyed && (
          <g transform={`translate(${W - 30}, 40)`}>
            <path d="M0,-18 L6,4 L0,-1 L-6,4 Z" fill="#334155" />
            <text x={0} y={16} textAnchor="middle" fontSize={10} fontWeight={700} fill="#334155">С</text>
          </g>
        )}

        {/* Масштабная линейка */}
        <g transform={`translate(${W - 30 - bar * scale}, ${H - 20})`}>
          <line x1={0} y1={0} x2={bar * scale} y2={0} stroke="#64748B" strokeWidth={1.5} />
          <line x1={0} y1={-3} x2={0} y2={3} stroke="#64748B" strokeWidth={1.5} />
          <line x1={bar * scale} y1={-3} x2={bar * scale} y2={3} stroke="#64748B" strokeWidth={1.5} />
          <text x={(bar * scale) / 2} y={-6} textAnchor="middle" fontSize={8} fill="#64748B" fontFamily="monospace">
            {bar} м
          </text>
        </g>

        {/* Условные обозначения */}
        <g transform="translate(10, 14)">
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

export function ProfileView({
  state,
}: {
  state: ProjectState;
}) {
  const geo = useMemo(() => profileGeometry(state.segments), [state.segments]);
  const profile = geo.nodes;

  if (profile.length < 2 || geo.total <= 0) {
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

  const totalDist = geo.total;
  const allElevs = profile.flatMap((p) => [p.ground, p.bottom]);
  const minElev = Math.min(...allElevs) - 0.5;
  const maxElev = Math.max(...allElevs) + 0.5;
  const elevRange = maxElev - minElev || 1;

  const toX = (dist: number) => padL + (dist / totalDist) * plotW;
  const toY = (elev: number) => padT + plotH - ((elev - minElev) / elevRange) * plotH;

  const path = (get: (p: (typeof profile)[number]) => number) =>
    profile.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.dist)},${toY(get(p))}`).join(" ");
  const groundPath = path((p) => p.ground);
  const bottomPath = path((p) => p.bottom);
  /* Кабель рисуется у дна — на толщину подсыпки выше */
  const cablePath = path((p) => p.bottom + 0.05);

  const groundFill =
    groundPath +
    ` L${toX(totalDist)},${toY(minElev)}` +
    ` L${toX(0)},${toY(minElev)} Z`;

  const yTicks = 5;
  const yTickStep = elevRange / yTicks;
  const xTickStep = niceLength(totalDist / 8);

  return (
    <div className="border border-line rounded-lg bg-surface overflow-hidden">
      <div className="px-4 py-2 border-b border-line bg-raise flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-mut">
          Продольный профиль
          <SourceBadge
            ok={geo.absolute}
            okText="отметки по съёмке"
            noText={`от поверхности: нет отметок у ${geo.missing} уч.`}
          />
        </span>
        <span className="text-[10px] font-mono text-mut2">
          {totalDist.toFixed(0)} м · {geo.absolute ? "отм." : "глубины"} {minElev.toFixed(1)}…{maxElev.toFixed(1)} м
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 320 }}>
        <defs>
          <linearGradient id="ground-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4A76A" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#D4A76A" stopOpacity={0.08} />
          </linearGradient>
        </defs>

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
        {Array.from({ length: Math.floor(totalDist / xTickStep) + 1 }, (_, i) => {
          const dist = i * xTickStep;
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

        <text x={padL + plotW / 2} y={H - 3} textAnchor="middle" fontSize={9} fill="#64748B">
          Расстояние, м
        </text>
        <text x={12} y={padT + plotH / 2} textAnchor="middle" fontSize={9} fill="#64748B"
          transform={`rotate(-90, 12, ${padT + plotH / 2})`}>
          {geo.absolute ? "Отметка, м" : "От поверхности, м"}
        </text>

        <path d={groundFill} fill="url(#ground-grad)" />
        <path d={groundPath} fill="none" stroke="#92400E" strokeWidth={2} strokeLinejoin="round" />
        <path d={bottomPath} fill="none" stroke="#3B82F6" strokeWidth={1.5} strokeDasharray="6,3" strokeLinejoin="round" />
        <path d={cablePath} fill="none" stroke="#16A34A" strokeWidth={1.5} strokeLinejoin="round" />

        {/* Пикеты: подпись и глубина только у узлов с именем — промежуточный
            узел ступеньки глубины стоит в той же точке */}
        {profile.map((p, i) => {
          const x = toX(p.dist);
          const yGnd = toY(p.ground);
          return (
            <g key={i}>
              <line x1={x} y1={yGnd} x2={x} y2={toY(p.bottom)}
                stroke="#94A3B8" strokeWidth={0.5} strokeDasharray="2,2" />
              <circle cx={x} cy={yGnd} r={3} fill="#92400E" />
              <circle cx={x} cy={toY(p.bottom)} r={2.5} fill="#3B82F6" />
              {p.label && (
                <text x={x} y={padT - 5} textAnchor="middle" fontSize={8} fontWeight={600} fill="#1E293B">
                  {p.label}
                </text>
              )}
              <text x={x + 4} y={(yGnd + toY(p.bottom)) / 2 + 3} fontSize={7} fill="#64748B" fontFamily="monospace">
                {(p.ground - p.bottom).toFixed(2)}м
              </text>
            </g>
          );
        })}

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
