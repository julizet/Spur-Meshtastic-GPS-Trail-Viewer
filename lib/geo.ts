import type { Point } from "./types";

const R = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function dist(p: Point, q: Point): number {
  const dLat = rad(q.lat - p.lat);
  const dLon = rad(q.lon - p.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(p.lat)) * Math.cos(rad(q.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** km/h between two points, null without time. */
export function speedBetween(p: Point, q: Point): number | null {
  if (p.t == null || q.t == null || q.t <= p.t) return null;
  return dist(p, q) / ((q.t - p.t) / 3_600_000);
}

/** Minutes per kilometre between two recorded points. */
export function paceBetween(p: Point, q: Point): number | null {
  if (p.t == null || q.t == null || q.t <= p.t) return null;
  const distance = dist(p, q);
  if (distance < 0.005) return null;
  return (q.t - p.t) / 60_000 / distance;
}

const nf1 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function fmtKm(km: number): string {
  if (km < 10) return `${nf1.format(km)} km`;
  return `${nf0.format(km)} km`;
}

export const fmtInt = (n: number) => nf0.format(Math.round(n));
export const fmtDec = (n: number) => nf1.format(n);

export function fmtClock(t: number | null): string {
  if (t == null) return "–";
  const d = new Date(t);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDate(t: number | null): string {
  if (t == null) return "";
  const d = new Date(t);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}
