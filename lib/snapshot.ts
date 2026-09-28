import { includedPositions } from "./clean";
import type { ColorMode, Point, RouteData, Segment, Snapshot } from "./types";

/**
 * Exactly the current view: only active segments and their valid points.
 * Hidden segments and discarded points are not part of the shared link.
 */
export function buildSnapshot(
  data: RouteData, colorMode: ColorMode, view: Snapshot["view"],
): Snapshot {
  const points: Point[] = [];
  const posOf = new Map<number, number>();
  const segments: Segment[] = [];

  for (const s of data.segments) {
    if (!s.on) continue;
    const v = includedPositions(data.points, data.excluded, s.a, s.b);
    if (v.length === 0) continue;
    for (const k of v) {
      const p = data.points[k];
      if (!posOf.has(p.i)) {
        posOf.set(p.i, points.length);
        points.push(p);
      }
    }
    segments.push({
      ...s,
      a: posOf.get(data.points[v[0]].i)!,
      b: posOf.get(data.points[v[v.length - 1]].i)!,
    });
  }
  return { v: 1, name: data.name, points, excluded: {}, segments, colorMode, view };
}

const isNum = (x: unknown) => typeof x === "number" && Number.isFinite(x);

/** Light structural validation for data coming from clients. */
export function isRouteData(x: unknown): x is RouteData {
  if (!x || typeof x !== "object") return false;
  const d = x as RouteData;
  if (typeof d.name !== "string" || d.name.length > 120) return false;
  if (!Array.isArray(d.points) || d.points.length > 50_000) return false;
  if (!d.points.every((p) => p && isNum(p.i) && isNum(p.lat) && isNum(p.lon))) return false;
  if (!Array.isArray(d.segments) || d.segments.length > 500) return false;
  if (!d.segments.every((s) => s && isNum(s.a) && isNum(s.b) && typeof s.name === "string" && s.name.length <= 80)) return false;
  return typeof d.excluded === "object" && d.excluded !== null;
}
