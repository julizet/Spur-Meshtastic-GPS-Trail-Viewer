import { includedPositions } from "./clean";
import { dist, speedBetween } from "./geo";
import type { Excluded, Kind, Point, Segment } from "./types";

const DRIVE_KMH = 15;
const PAUSE_RADIUS_KM = 0.08;
const PAUSE_MIN_MS = 8 * 60_000;
const MIN_RUN_MS = 5 * 60_000;
const WALK_MAX_MS = 90 * 60_000;

let counter = 0;
export const newId = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;

export const KIND_LABEL: Record<Kind, string> = {
  wandern: "Wanderung",
  pause: "Pause",
  fahrt: "Fahrt",
};

type Run = { a: number; b: number; kind: Kind };

/** Proposes segments. The result is a suggestion the user is free to change. */
export function suggestSegments(points: Point[], ex: Excluded): Segment[] {
  const v = includedPositions(points, ex);
  if (v.length < 2) return [];

  // 1. Label each interval between consecutive valid points.
  const labels: Kind[] = [];
  for (let j = 1; j < v.length; j++) {
    const s = speedBetween(points[v[j - 1]], points[v[j]]) ?? 0;
    labels.push(s > DRIVE_KMH ? "fahrt" : "wandern");
  }

  // 2. Stationary clusters become pauses.
  for (let j = 0; j < v.length - 1; j++) {
    const anchor = points[v[j]];
    let k = j;
    while (k + 1 < v.length && dist(anchor, points[v[k + 1]]) <= PAUSE_RADIUS_KM) k++;
    const span = (points[v[k]].t ?? 0) - (anchor.t ?? 0);
    if (k > j && span >= PAUSE_MIN_MS) {
      for (let q = j; q < k; q++) if (labels[q] !== "fahrt") labels[q] = "pause";
      j = k - 1;
    }
  }

  // 3. Build runs (in positions of v), then absorb short runs into their neighbours.
  let runs: Run[] = [];
  labels.forEach((kind, j) => {
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.b = j + 1;
    else runs.push({ a: j, b: j + 1, kind });
  });
  const dur = (r: Run) => (points[v[r.b]].t ?? 0) - (points[v[r.a]].t ?? 0);
  let changed = true;
  while (changed && runs.length > 1) {
    changed = false;
    let shortest = -1;
    runs.forEach((r, k) => {
      if (dur(r) < MIN_RUN_MS && (shortest < 0 || dur(r) < dur(runs[shortest]))) shortest = k;
    });
    if (shortest >= 0) {
      const k = shortest;
      const target = k === 0 ? 1 : k === runs.length - 1 ? k - 1 : dur(runs[k - 1]) >= dur(runs[k + 1]) ? k - 1 : k + 1;
      const lo = Math.min(k, target);
      runs[lo] = { a: runs[lo].a, b: runs[lo + 1].b, kind: runs[target].kind };
      runs.splice(lo + 1, 1);
      changed = true;
    }
    // Merge neighbours of the same kind.
    runs = runs.reduce<Run[]>((acc, r) => {
      const last = acc[acc.length - 1];
      if (last && last.kind === r.kind) last.b = r.b;
      else acc.push({ ...r });
      return acc;
    }, []);
  }

  // Short stops between two drives (traffic, parking) belong to the drive.
  for (let k = 1; k < runs.length - 1; k++) {
    if (runs[k].kind !== "fahrt" && runs[k - 1].kind === "fahrt" && runs[k + 1].kind === "fahrt" && dur(runs[k]) < 20 * 60_000) {
      runs[k - 1] = { a: runs[k - 1].a, b: runs[k + 1].b, kind: "fahrt" };
      runs.splice(k, 2);
      k--;
    }
  }

  // 4. Name runs.
  const firstHike = runs.findIndex((r) => r.kind !== "fahrt");
  const lastHike = runs.length - 1 - [...runs].reverse().findIndex((r) => r.kind !== "fahrt");
  const maxAlt = Math.max(...v.map((k) => points[k].alt ?? -Infinity));

  return runs.map((r, k) => {
    const a = v[r.a];
    const b = v[r.b];
    let name = KIND_LABEL[r.kind];
    if (r.kind === "fahrt") {
      name = firstHike >= 0 && k < firstHike ? "Anfahrt" : k > lastHike ? "Rückfahrt" : "Fahrt";
    } else if (r.kind === "wandern") {
      const up = (points[b].alt ?? 0) - (points[a].alt ?? 0);
      name = up > 150 ? "Aufstieg" : up < -150 ? "Abstieg" : dur(r) < WALK_MAX_MS ? "Spaziergang" : "Wanderung";
    } else {
      const top = Math.max(...includedPositions(points, ex, a, b).map((q) => points[q].alt ?? -Infinity));
      if (Number.isFinite(maxAlt) && maxAlt - top < 40) name = "Gipfelpause";
    }
    return { id: newId(), a, b, name, kind: r.kind, on: r.kind !== "fahrt" };
  });
}

/** Guess a kind from average speed and stillness. */
export function inferKind(points: Point[], ex: Excluded, a: number, b: number): Kind {
  const v = includedPositions(points, ex, a, b);
  if (v.length < 2) return "pause";
  let d = 0;
  for (let j = 1; j < v.length; j++) d += dist(points[v[j - 1]], points[v[j]]);
  const h = ((points[v[v.length - 1]].t ?? 0) - (points[v[0]].t ?? 0)) / 3_600_000;
  const s = h > 0 ? d / h : 0;
  return s > DRIVE_KMH ? "fahrt" : s < 0.8 ? "pause" : "wandern";
}

/* ---------- Editing. All operations return a new array and never touch points. ---------- */

export function segmentAt(segs: Segment[], pos: number): number {
  return segs.findIndex((s) => pos >= s.a && pos <= s.b);
}

export function split(segs: Segment[], pos: number): Segment[] {
  const k = segs.findIndex((s) => pos > s.a && pos < s.b);
  if (k < 0) return segs;
  const s = segs[k];
  return [
    ...segs.slice(0, k),
    { ...s, b: pos },
    { ...s, id: newId(), a: pos, name: s.name },
    ...segs.slice(k + 1),
  ];
}

/** Removes a boundary: the segment merges into its previous neighbour (or the next one if first). */
export function remove(segs: Segment[], k: number): Segment[] {
  if (segs.length < 2) return segs;
  if (k === 0) {
    const next = segs[1];
    return [{ ...next, a: segs[0].a }, ...segs.slice(2)];
  }
  const prev = segs[k - 1];
  return [...segs.slice(0, k - 1), { ...prev, b: segs[k].b }, ...segs.slice(k + 1)];
}

export function mergeWithPrevious(segs: Segment[], k: number): Segment[] {
  if (k <= 0) return segs;
  return remove(segs, k);
}

/** Merges the segments spanning indices k..j into one, keeping the first segment's name and kind. */
export function mergeRange(segs: Segment[], k: number, j: number): Segment[] {
  const lo = Math.min(k, j);
  const hi = Math.max(k, j);
  if (lo < 0 || hi >= segs.length || lo === hi) return segs;
  return [...segs.slice(0, lo), { ...segs[lo], b: segs[hi].b }, ...segs.slice(hi + 1)];
}

/** Adds a segment between two positions. Segments fully covered by it are absorbed. */
export function addRange(
  segs: Segment[], points: Point[], ex: Excluded, p: number, q: number,
): { segments: Segment[]; id: string | null } {
  const a = Math.min(p, q);
  const b = Math.max(p, q);
  if (a === b || segs.length === 0) return { segments: segs, id: null };
  const lo = Math.max(a, segs[0].a);
  const hi = Math.min(b, segs[segs.length - 1].b);
  if (lo >= hi) return { segments: segs, id: null };
  let out = split(split(segs, lo), hi);
  const inside = out.filter((s) => s.a >= lo && s.b <= hi);
  const first = out.indexOf(inside[0]);
  const id = newId();
  const created: Segment = {
    id, a: lo, b: hi, name: "Neuer Abschnitt", kind: inferKind(points, ex, lo, hi), on: true,
  };
  out = [...out.slice(0, first), created, ...out.slice(first + inside.length)];
  return { segments: out, id };
}

export function update(segs: Segment[], id: string, patch: Partial<Segment>): Segment[] {
  return segs.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export function nextKind(k: Kind): Kind {
  return k === "wandern" ? "pause" : k === "pause" ? "fahrt" : "wandern";
}
