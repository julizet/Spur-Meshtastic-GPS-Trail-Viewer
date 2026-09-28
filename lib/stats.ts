import { includedPositions } from "./clean";
import { dist } from "./geo";
import type { Excluded, Kind, Point, Stats } from "./types";

export type Range = { a: number; b: number; kind: Kind };

const HYSTERESIS_M = 5;
const MOVING_KMH = 1;

/** Distance and duration of one range (used in the segment list). */
export function rangeSummary(points: Point[], ex: Excluded, a: number, b: number) {
  const v = includedPositions(points, ex, a, b);
  let d = 0;
  for (let j = 1; j < v.length; j++) d += dist(points[v[j - 1]], points[v[j]]);
  const t0 = v.length ? points[v[0]].t ?? 0 : 0;
  const t1 = v.length ? points[v[v.length - 1]].t ?? 0 : 0;
  return { distance: d, duration: Math.max(0, t1 - t0), count: v.length };
}

export function computeStats(points: Point[], ex: Excluded, ranges: Range[]): Stats {
  let duration = 0, moving = 0, distance = 0, ascent = 0, descent = 0;
  let climbUp = 0, climbTime = 0;
  let maxAlt: number | null = null, minAlt: number | null = null;
  const counted = new Set<number>();

  for (const r of ranges) {
    const v = includedPositions(points, ex, r.a, r.b);
    if (v.length === 0) continue;
    v.forEach((k) => counted.add(k));
    duration += Math.max(0, (points[v[v.length - 1]].t ?? 0) - (points[v[0]].t ?? 0));

    let ref: number | null = null;
    let up = 0, down = 0;
    for (let j = 0; j < v.length; j++) {
      const p = points[v[j]];
      if (p.alt != null) {
        maxAlt = maxAlt == null ? p.alt : Math.max(maxAlt, p.alt);
        minAlt = minAlt == null ? p.alt : Math.min(minAlt, p.alt);
        if (ref == null) ref = p.alt;
        else if (p.alt - ref >= HYSTERESIS_M) { up += p.alt - ref; ref = p.alt; }
        else if (ref - p.alt >= HYSTERESIS_M) { down += ref - p.alt; ref = p.alt; }
      }
      if (j === 0) continue;
      const q = points[v[j - 1]];
      const d = dist(q, p);
      const dt = (p.t ?? 0) - (q.t ?? 0);
      distance += d;
      if (dt > 0 && r.kind !== "pause" && d / (dt / 3_600_000) >= MOVING_KMH) {
        moving += dt;
        if (r.kind === "wandern") {
          if (p.alt != null && q.alt != null && p.alt > q.alt) { climbUp += p.alt - q.alt; climbTime += dt; }
        }
      }
    }
    ascent += up;
    descent += down;
  }

  return {
    duration, moving, distance, ascent, descent,
    speed: moving > 0 ? distance / (moving / 3_600_000) : 0,
    maxAlt, minAlt,
    climbRate: climbTime > 20 * 60_000 ? climbUp / (climbTime / 3_600_000) : null,
    count: counted.size,
  };
}
