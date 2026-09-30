import { dist, paceBetween } from "./geo";
import type { ColorMode, Excluded, Kind, Point, Segment } from "./types";

export const INK = "#1d2a24";
export const FADED = "#8f9994";

/** Swiss trail marker colours: yellow hiking trail, red mountain trail, blue alpine route. */
export const TRAIL = { gelb: "#dcae0a", rot: "#c62f2a", blau: "#2a61ae" };
const SIGNAL = { low: "#ff5100", middle: "#fad830", high : "#79db09" };
const SLOPE = { low: "#de98c1", middle: "#dd3497", high: "#49006a" };
const PACE_COLORS = [SIGNAL.high, SIGNAL.middle, SIGNAL.low];

export type ColorScale = { colors: string[]; min: number; max: number; minLabel: string; maxLabel: string };

export const COLOR_LABEL: Record<ColorMode, string> = {
  strecke: "Strecke",
  hoehe: "Höhe",
  steil: "Steilheit",
  gps: "GPS",
  pace: "Pace",
};

const range = (values: number[], fallback: [number, number]): [number, number] => {
  if (!values.length) return fallback;
  return [Math.min(...values), Math.max(...values)];
};

export function colorScaleFor(
  mode: ColorMode,
  points: Point[],
  excluded: Excluded,
  segments: Segment[],
): ColorScale | null {
  if (mode === "strecke") return null;
  if (mode === "steil") {
    return { colors: [SLOPE.low, SLOPE.middle, SLOPE.high], min: 0, max: 30, minLabel: "0 %", maxLabel: "30 %+" };
  }
  if (mode === "pace") {
    return { colors: PACE_COLORS, min: 15, max: 25, minLabel: "≤15", maxLabel: "≥25 min/km" };
  }

  const positions = new Set<number>();
  for (const segment of segments) {
    if (!segment.on) continue;
    for (let index = Math.max(0, segment.a); index <= Math.min(points.length - 1, segment.b); index++) {
      if (!excluded[index]) positions.add(index);
    }
  }
  const values = [...positions]
    .map((index) => mode === "gps" ? points[index].sats : points[index].alt)
    .filter((value): value is number => value != null);

  const [min, max] = range(values, [0, 1]);
  if (mode === "gps") {
    return { colors: [SIGNAL.low, SIGNAL.middle, SIGNAL.high], min, max, minLabel: String(min), maxLabel: `${max} Satelliten` };
  }
  return {
    colors: ["#7b9a74", "#c9a13b", "#7a3b2e"],
    min,
    max,
    minLabel: `${Math.round(min)} m`,
    maxLabel: `${Math.round(max)} m`,
  };
}

function mix(c1: string, c2: string, t: number): string {
  const p = (c: string) => [1, 3, 5].map((o) => parseInt(c.slice(o, o + 2), 16));
  const a = p(c1), b = p(c2);
  return "#" + a.map((x, k) => Math.round(x + (b[k] - x) * t).toString(16).padStart(2, "0")).join("");
}

function position(value: number, scale: ColorScale): number {
  if (scale.max === scale.min) return 0.5;
  return Math.min(1, Math.max(0, (value - scale.min) / (scale.max - scale.min)));
}

function average(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value != null);
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
}

export function colorFor(
  mode: ColorMode, p: Point, q: Point, kind: Kind, scale: ColorScale | null,
): string {
  if (mode === "strecke") return INK;
  if (!scale) return FADED;
  if (mode === "hoehe") {
    const alt = average([p.alt, q.alt]);
    if (alt == null) return FADED;
    const t = position(alt, scale);
    return t < 0.5 ? mix("#7b9a74", "#c9a13b", t * 2) : mix("#c9a13b", "#7a3b2e", (t - 0.5) * 2);
  }
  if (mode === "steil") {
    if (kind === "fahrt") return FADED;
    const d = dist(p, q) * 1000;
    if (d < 5 || p.alt == null || q.alt == null) return FADED;
    const slope = (Math.abs(q.alt - p.alt) / d) * 100;
    const t = position(slope, scale);
    return t < 0.5 ? mix(SLOPE.low, SLOPE.middle, t * 2) : mix(SLOPE.middle, SLOPE.high, (t - 0.5) * 2);
  }
  if (mode === "pace") {
    const pace = paceBetween(p, q);
    if (pace == null) return FADED;
    const t = position(pace, scale);
    return t < 0.5 ? mix(SIGNAL.high, SIGNAL.middle, t * 2) : mix(SIGNAL.middle, SIGNAL.low, (t - 0.5) * 2);
  }
  const satellites = average([p.sats, q.sats]);
  if (satellites == null) return FADED;
  const t = position(satellites, scale);
  return t < 0.5 ? mix(SIGNAL.low, SIGNAL.middle, t * 2) : mix(SIGNAL.middle, SIGNAL.high, (t - 0.5) * 2);
}
