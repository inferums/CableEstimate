import { useEffect, useMemo, useState } from "react";
import { fetchAndParseDxf, type ParsedDxf } from "../lib/dxf";

const INK = "#3F3F46";
const ACC = "#2563EB";
const MUT = "#71717A";
const SOIL = "#F4F4F5";

const SKIP_LAYERS = new Set(["СПДС_РАЗМЕРЫ", "DEFPOINTS", "0"]);

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = (startDeg * Math.PI) / 180;
  const e = (endDeg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(s);
  const y1 = cy + r * Math.sin(s);
  const x2 = cx + r * Math.cos(e);
  const y2 = cy + r * Math.sin(e);
  let sweep = endDeg - startDeg;
  if (sweep < 0) sweep += 360;
  const large = sweep > 180 ? 1 : 0;
  return `M${x1},${y1}A${r},${r} 0 ${large} 1 ${x2},${y2}`;
}

function polylinePath(vertices: { x: number; y: number }[], closed: boolean) {
  if (vertices.length === 0) return "";
  let d = `M${vertices[0].x},${vertices[0].y}`;
  for (let i = 1; i < vertices.length; i++) {
    d += `L${vertices[i].x},${vertices[i].y}`;
  }
  if (closed) d += "Z";
  return d;
}

function RenderEntity({ e, flipY }: { e: any; flipY: (y: number) => number }) {
  const layer = e.layer ?? "";
  if (SKIP_LAYERS.has(layer)) return null;

  const stroke = layer.includes("РАЗМЕР") || layer.includes("DIM") ? ACC : INK;
  const sw = 0.15;

  if (e.type === "LINE" && e.startPoint && e.endPoint) {
    return (
      <line
        x1={e.startPoint.x}
        y1={flipY(e.startPoint.y)}
        x2={e.endPoint.x}
        y2={flipY(e.endPoint.y)}
        stroke={stroke}
        strokeWidth={sw}
      />
    );
  }

  if (e.type === "CIRCLE" && e.center && e.radius) {
    return (
      <circle
        cx={e.center.x}
        cy={flipY(e.center.y)}
        r={e.radius}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
      />
    );
  }

  if (e.type === "ARC" && e.center && e.radius) {
    const sa = e.startAngle ?? 0;
    const ea = e.endAngle ?? 360;
    return (
      <path
        d={arcPath(e.center.x, flipY(e.center.y), e.radius, -ea, -sa)}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
      />
    );
  }

  if ((e.type === "LWPOLYLINE" || e.type === "POLYLINE") && e.vertices?.length > 1) {
    const pts = e.vertices.map((v: { x: number; y: number }) => ({ x: v.x, y: flipY(v.y) }));
    const closed = e.shape || false;
    return (
      <path
        d={polylinePath(pts, closed)}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
      />
    );
  }

  if ((e.type === "TEXT" || e.type === "MTEXT") && e.insertionPoint) {
    const text = e.text ?? "";
    if (!text.trim()) return null;
    const clean = text.replace(/\\[A-Za-z][^;]*;/g, "").replace(/[{}]/g, "").trim();
    if (!clean) return null;
    return (
      <text
        x={e.insertionPoint.x}
        y={flipY(e.insertionPoint.y)}
        fontSize={e.height ?? 0.3}
        fill={MUT}
        fontFamily="JetBrains Mono, monospace"
        textAnchor="middle"
      >
        {clean}
      </text>
    );
  }

  if (e.type === "SPLINE" && e.controlPoints?.length > 1) {
    const pts = e.controlPoints.map((v: { x: number; y: number }) => `${v.x},${flipY(v.y)}`);
    return (
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
      />
    );
  }

  return null;
}

export function DxfViewer({
  url,
  className = "",
  annotations,
}: {
  url: string;
  className?: string;
  annotations?: { x: number; y: number; label: string; color?: string }[];
}) {
  const [dxf, setDxf] = useState<ParsedDxf | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAndParseDxf(url)
      .then((d) => { if (!cancelled) setDxf(d); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [url]);

  const viewBox = useMemo(() => {
    if (!dxf) return "0 0 100 100";
    const { minX, minY, maxX, maxY } = dxf.bounds;
    const pad = Math.max(maxX - minX, maxY - minY) * 0.05;
    return `${minX - pad} ${-(maxY + pad)} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  }, [dxf]);

  if (error) {
    return (
      <div className="text-xs text-danger px-3 py-2 border border-danger/30 rounded-md bg-danger-soft">
        Ошибка загрузки DXF: {error}
      </div>
    );
  }

  if (!dxf) {
    return (
      <div className="text-xs text-mut px-3 py-4 text-center">
        Загрузка схемы…
      </div>
    );
  }

  const W = dxf.bounds.maxX - dxf.bounds.minX || 1;
  const fontScale = W / 120;

  return (
    <svg
      viewBox={viewBox}
      className={`w-full h-auto select-none ${className}`}
      style={{ maxHeight: 320 }}
    >
      {/* фон */}
      <rect
        x={dxf.bounds.minX}
        y={-dxf.bounds.maxY}
        width={W}
        height={dxf.bounds.maxY - dxf.bounds.minY}
        fill={SOIL}
        opacity={0.3}
      />

      {/* DXF-геометрия */}
      <g style={{ fontSize: fontScale }}>
        {dxf.entities.map((e, i) => (
          <RenderEntity
            key={i}
            e={e}
            flipY={(y) => -y}
          />
        ))}
      </g>

      {/* аннотации параметров */}
      {annotations?.map((a, i) => (
        <g key={`ann-${i}`}>
          <circle cx={a.x} cy={-a.y} r={W * 0.008} fill={a.color ?? ACC} opacity={0.3} />
          <text
            x={a.x}
            y={-a.y - W * 0.015}
            textAnchor="middle"
            fontSize={W * 0.022}
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
            fill={a.color ?? ACC}
          >
            {a.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
