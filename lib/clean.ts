import { dist } from "./geo";
import type { Excluded, Point } from "./types";

const YEAR_2000 = Date.UTC(2000, 0, 1);

export const REASON_TEXT: Record<string, string> = {
  zeit: "Kein gültiger Zeitstempel",
  position: "Keine gültige Position",
  duplikat: "Doppelter Punkt",
  ausreisser: "GPS-Ausreißer",
  manuell: "Von dir verworfen",
};

/**
 * Marks points that should not count. Nothing is removed; every mark can be undone.
 */
export function clean(points: Point[]): Excluded {
  const ex: Excluded = {};

  points.forEach((p, k) => {
    if (p.t == null || p.t < YEAR_2000) ex[k] = "zeit";
    else if ((p.lat === 0 && p.lon === 0) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) ex[k] = "position";
    else if (p.speed != null && p.speed > 250) ex[k] = "ausreisser";
    else if (p.alt != null && (p.alt < -450 || p.alt > 9000)) ex[k] = "ausreisser";
  });

  // Exact duplicates of the previous valid point.
  let prev = -1;
  points.forEach((p, k) => {
    if (ex[k]) return;
    if (prev >= 0) {
      const q = points[prev];
      if (q.lat === p.lat && q.lon === p.lon && q.t === p.t) {
        ex[k] = "duplikat";
        return;
      }
    }
    prev = k;
  });

  // Spikes: a point far away from both neighbours while the neighbours agree with each other.
  const valid = () => points.map((_, k) => k).filter((k) => !ex[k]);
  let changed = true;
  while (changed) {
    changed = false;
    const v = valid();
    for (let j = 1; j < v.length - 1; j++) {
      const a = points[v[j - 1]];
      const p = points[v[j]];
      const b = points[v[j + 1]];
      const around = dist(a, p) + dist(p, b);
      const direct = dist(a, b);
      const horizontalSpike = around > 6 * direct + 1.0;
      const verticalSpike =
        a.alt != null && p.alt != null && b.alt != null &&
        Math.abs(p.alt - a.alt) > 300 && Math.abs(p.alt - b.alt) > 300 && Math.abs(a.alt - b.alt) < 150;
      if (horizontalSpike || verticalSpike) {
        ex[v[j]] = "ausreisser";
        changed = true;
        break;
      }
    }
  }
  return ex;
}

export function includedPositions(points: Point[], ex: Excluded, a = 0, b = points.length - 1): number[] {
  const out: number[] = [];
  for (let k = Math.max(0, a); k <= Math.min(b, points.length - 1); k++) if (!ex[k]) out.push(k);
  return out;
}
