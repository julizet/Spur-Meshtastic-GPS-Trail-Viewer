import { includedPositions } from "./clean";
import type { RouteData } from "./types";

const TOLERANCE_MS = 10 * 60_000;

/**
 * Finds the waypoint closest in time to a photo, only within active segments.
 * Returns the original point index (Point.i) or null if the photo was taken outside the route.
 */
export function matchPhoto(data: RouteData, takenAt: number): number | null {
  let best: { i: number; d: number } | null = null;
  for (const s of data.segments) {
    if (!s.on) continue;
    const v = includedPositions(data.points, data.excluded, s.a, s.b);
    if (!v.length) continue;
    const t0 = data.points[v[0]].t ?? 0;
    const t1 = data.points[v[v.length - 1]].t ?? 0;
    if (takenAt < t0 - TOLERANCE_MS || takenAt > t1 + TOLERANCE_MS) continue;
    for (const k of v) {
      const d = Math.abs((data.points[k].t ?? 0) - takenAt);
      if (!best || d < best.d) best = { i: data.points[k].i, d };
    }
  }
  return best ? best.i : null;
}
