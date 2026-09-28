import { includedPositions } from "./clean";
import { dist } from "./geo";
import type { Excluded, Point, Segment } from "./types";

/** A single pause never stalls the replay for longer than this. */
const STEP_CAP = 15 * 60_000;
/** Rows without a usable timestamp advance by a nominal minute. */
const STEP_FALLBACK = 60_000;
const MIN_PLAYBACK = 20_000;
const MAX_PLAYBACK = 75_000;
/** A day on the trail plays in about a minute. */
const SPEEDUP = 400;

/** The active route laid out as a clock, ready to be played back. */
export type Timeline = {
  /** Array positions in playing order. */
  pos: number[];
  /** Tour time in ms at each position, starting at 0. */
  clock: number[];
  /** Distance in km at each position. */
  km: number[];
  /** Tour time of the whole replay in ms. */
  total: number;
  /** How long the replay should take on the wall clock, in ms. */
  playback: number;
};

export type Frame = {
  /** Nearest array position, used for stats and the profile cursor. */
  pos: number;
  lat: number;
  lon: number;
  alt: number | null;
  /** Interpolated wall-clock time of this moment, null without timestamps. */
  t: number | null;
  /** Distance covered so far in km. */
  km: number;
  /** Progress from 0 to 1. */
  done: number;
};

/**
 * Builds the replay clock from the active segments. Stretches hidden in between are
 * skipped in place: the replay jumps without adding time or distance, exactly like the
 * elevation profile does.
 */
export function buildTimeline(points: Point[], ex: Excluded, segments: Segment[]): Timeline | null {
  const pos: number[] = [];
  const clock: number[] = [];
  const km: number[] = [];
  let time = 0;
  let acc = 0;

  for (const s of segments) {
    if (!s.on) continue;
    // Neighbouring segments share their boundary point; anything else is a jump.
    let jump = pos.length > 0;
    for (const k of includedPositions(points, ex, s.a, s.b)) {
      const last = pos.length ? pos[pos.length - 1] : null;
      if (last === k) {
        jump = false;
        continue;
      }
      if (last != null && !jump) {
        const p = points[last];
        const q = points[k];
        time += p.t != null && q.t != null && q.t > p.t ? Math.min(q.t - p.t, STEP_CAP) : STEP_FALLBACK;
        acc += dist(p, q);
      }
      jump = false;
      pos.push(k);
      clock.push(time);
      km.push(acc);
    }
  }

  if (pos.length < 2 || time <= 0) return null;
  return {
    pos,
    clock,
    km,
    total: time,
    playback: Math.min(MAX_PLAYBACK, Math.max(MIN_PLAYBACK, time / SPEEDUP)),
  };
}

/** The moment `ms` into the tour, interpolated between the two surrounding points. */
export function frameAt(tl: Timeline, points: Point[], ms: number): Frame {
  const t = Math.min(Math.max(ms, 0), tl.total);
  let lo = 0;
  let hi = tl.pos.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tl.clock[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = tl.clock[hi] - tl.clock[lo];
  // A jump has no duration, so it resolves to the point on the far side right away.
  const f = span > 0 ? (t - tl.clock[lo]) / span : 1;
  const p = points[tl.pos[lo]];
  const q = points[tl.pos[hi]];
  const mix = (a: number, b: number) => a + (b - a) * f;

  return {
    pos: tl.pos[f < 0.5 ? lo : hi],
    lat: mix(p.lat, q.lat),
    lon: mix(p.lon, q.lon),
    alt: p.alt != null && q.alt != null ? mix(p.alt, q.alt) : q.alt ?? p.alt,
    t: p.t != null && q.t != null ? mix(p.t, q.t) : q.t ?? p.t,
    km: mix(tl.km[lo], tl.km[hi]),
    done: tl.total > 0 ? t / tl.total : 1,
  };
}

/** Tour time at which a given array position is reached, null if it is not part of the replay. */
export function timeOf(tl: Timeline, pos: number): number | null {
  const j = tl.pos.indexOf(pos);
  return j < 0 ? null : tl.clock[j];
}
