"use client";

import { useMemo, useRef, useState } from "react";
import { includedPositions } from "@/lib/clean";
import { dist } from "@/lib/geo";
import type { Excluded, Point, Segment } from "@/lib/types";

type Props = {
  points: Point[];
  excluded: Excluded;
  segments: Segment[];
  hover: number | null;
  highlight: [number, number] | null;
  onHover: (pos: number | null) => void;
  onPick: (pos: number) => void;
  onRange: (a: number, b: number) => void;
};

const W = 1000;
const H = 100;

/** Elevation profile of the active segments. Drag to select a range, tap to pick a point. */
export default function Profile({ points, excluded, segments, hover, highlight, onHover, onPick, onRange }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<[number, number] | null>(null);

  const model = useMemo(() => {
    // Distance only accumulates inside segments; gaps from hidden segments are skipped.
    const pos: number[] = [];
    const xs: number[] = [];
    let acc = 0;
    for (const s of segments) {
      if (!s.on) continue;
      const v = includedPositions(points, excluded, s.a, s.b);
      v.forEach((k, j) => {
        if (j > 0) acc += dist(points[v[j - 1]], points[k]);
        if (pos[pos.length - 1] === k) return;
        pos.push(k);
        xs.push(acc);
      });
    }
    const alts = pos.map((k) => points[k].alt ?? 0);
    const lo = Math.min(...alts);
    const hi = Math.max(...alts);
    const total = acc || 1;
    const X = (x: number) => (x / total) * W;
    const Y = (a: number) => (hi > lo ? H - 4 - ((a - lo) / (hi - lo)) * (H - 14) : H / 2);
    const line = pos.map((k, j) => `${j ? "L" : "M"}${X(xs[j]).toFixed(1)} ${Y(alts[j]).toFixed(1)}`).join(" ");
    return { pos, xs, total, X, Y, alts, line, area: pos.length ? `${line} L${W} ${H} L0 ${H} Z` : "" };
  }, [points, excluded, segments]);

  if (model.pos.length < 2) return null;

  function posAt(clientX: number): number {
    const r = svg.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * model.total;
    let lo = 0, hi = model.xs.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (model.xs[mid] < x) lo = mid; else hi = mid;
    }
    return model.pos[x - model.xs[lo] < model.xs[hi] - x ? lo : hi];
  }
  const xOf = (k: number) => {
    const j = model.pos.indexOf(k);
    return j < 0 ? null : model.X(model.xs[j]);
  };

  const band = drag ?? highlight;
  const bandX = band ? [xOf(band[0]), xOf(band[1])] : null;
  const hx = hover != null ? xOf(hover) : null;

  return (
    <svg
      ref={svg}
      className="profile"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Höhenprofil der ausgewählten Etappen. Ziehen wählt einen Bereich."
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        const k = posAt(e.clientX);
        setDrag([k, k]);
      }}
      onPointerMove={(e) => {
        const k = posAt(e.clientX);
        if (drag) setDrag([drag[0], k]);
        onHover(k);
      }}
      onPointerUp={() => {
        if (!drag) return;
        const [a, b] = drag;
        setDrag(null);
        const ja = model.pos.indexOf(a), jb = model.pos.indexOf(b);
        if (Math.abs(ja - jb) < 2) onPick(b);
        else onRange(Math.min(a, b), Math.max(a, b));
      }}
      onPointerLeave={() => { if (!drag) onHover(null); }}
    >
      {bandX && bandX[0] != null && bandX[1] != null && (
        <rect x={Math.min(bandX[0], bandX[1])} y={0} width={Math.max(2, Math.abs(bandX[1] - bandX[0]))} height={H} fill="#2a61ae" opacity={0.14} />
      )}
      <path d={model.area} fill="#1d2a24" />
      {hx != null && <line x1={hx} x2={hx} y1={0} y2={H} stroke="#2a61ae" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
