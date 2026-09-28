import { dist, paceBetween } from "./geo";
import type { ColorMode, Kind, Point } from "./types";

export const INK = "#1d2a24";
export const FADED = "#8f9994";

/** Swiss trail marker colours: yellow hiking trail, red mountain trail, blue alpine route. */
export const TRAIL = { gelb: "#dcae0a", rot: "#c62f2a", blau: "#2a61ae" };
const SIGNAL = { low: "#ff5100", middle: "#fad830", high : "#79db09" };
const SLOPE = { low: "#de98c1", middle: "#dd3497", high: "#49006a" };

type Legend = { colors: string[]; min: string; max: string };

export const COLOR_LABEL: Record<ColorMode, string> = {
  strecke: "Strecke",
  hoehe: "Höhe",
  steil: "Steilheit",
  gps: "GPS",
  pace: "Pace",
};

export const LEGEND: Record<ColorMode, Legend | null> = {
  strecke: null,
  hoehe: { colors: ["#7b9a74", "#c9a13b", "#7a3b2e"], min: "tief", max: "hoch" },
  steil: { colors: [SLOPE.low, SLOPE.middle, SLOPE.high], min: "0 %", max: "30 %+" },
  gps: { colors: [SIGNAL.low, SIGNAL.middle, SIGNAL.high], min: "0", max: "8+ Satelliten" },
  pace: { colors: [SIGNAL.low, SIGNAL.middle, SIGNAL.high], min: "≤15", max: "≥25 min/km" },
};

function mix(c1: string, c2: string, t: number): string {
  const p = (c: string) => [1, 3, 5].map((o) => parseInt(c.slice(o, o + 2), 16));
  const a = p(c1), b = p(c2);
  return "#" + a.map((x, k) => Math.round(x + (b[k] - x) * t).toString(16).padStart(2, "0")).join("");
}

export function colorFor(
  mode: ColorMode, p: Point, q: Point, kind: Kind, altRange: [number, number],
): string {
  if (mode === "strecke") return INK;
  if (mode === "hoehe") {
    const alt = ((p.alt ?? 0) + (q.alt ?? 0)) / 2;
    const [lo, hi] = altRange;
    const t = hi > lo ? Math.min(1, Math.max(0, (alt - lo) / (hi - lo))) : 0;
    return t < 0.5 ? mix("#7b9a74", "#c9a13b", t * 2) : mix("#c9a13b", "#7a3b2e", (t - 0.5) * 2);
  }
  if (mode === "steil") {
    if (kind === "fahrt") return FADED;
    const d = dist(p, q) * 1000;
    if (d < 5 || p.alt == null || q.alt == null) return SLOPE.low;
    const slope = (Math.abs(q.alt - p.alt) / d) * 100;
    const t = Math.min(1, slope / 30);
    return t < 0.5 ? mix(SLOPE.low, SLOPE.middle, t * 2) : mix(SLOPE.middle, SLOPE.high, (t - 0.5) * 2);
  }
  if (mode === "pace") {
    const pace = paceBetween(p, q);
    if (pace == null) return FADED;
    const t = Math.min(1, Math.max(0, (pace - 15) / 10));
    return t < 0.5 ? mix(SIGNAL.low, SIGNAL.middle, t * 2) : mix(SIGNAL.middle, SIGNAL.high, (t - 0.5) * 2);
  }
  const s = Math.min(p.sats ?? 0, q.sats ?? 0);
  const t = Math.min(1, Math.max(0, s / 8));
  return t < 0.5 ? mix(SIGNAL.low, SIGNAL.middle, t * 2) : mix(SIGNAL.middle, SIGNAL.high, (t - 0.5) * 2);
}
