"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildTimeline, frameAt, timeOf, type Frame } from "@/lib/replay";
import type { Excluded, Point, Segment } from "@/lib/types";

export type Replay = {
  available: boolean;
  active: boolean;
  playing: boolean;
  /** From the first point of the tour to the one just reached. */
  range: [number, number] | null;
  /** Wall-clock time of the current moment, rounded to the minute. */
  clock: number | null;
  toggle: () => void;
  stop: () => void;
  seek: (pos: number) => void;
};

/** Everything the view needs to redraw, changing at most once per point and minute. */
type Mark = { pos: number; minute: number | null };

/**
 * Plays the active segments back in tour time. Each animation frame goes straight to the
 * map via `onFrame`; React only re-renders when the reached point or the shown minute changes.
 */
export function useReplay(
  points: Point[],
  excluded: Excluded,
  segments: Segment[],
  onFrame: (frame: Frame | null) => void,
): Replay {
  const timeline = useMemo(() => buildTimeline(points, excluded, segments), [points, excluded, segments]);
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [mark, setMark] = useState<Mark | null>(null);
  /** Current tour time in ms, kept out of state so every frame stays free. */
  const at = useRef(0);
  const emit = useRef(onFrame);
  emit.current = onFrame;

  const show = useCallback(
    (ms: number) => {
      if (!timeline) return;
      at.current = Math.min(Math.max(ms, 0), timeline.total);
      const frame = frameAt(timeline, points, at.current);
      emit.current(frame);
      const minute = frame.t == null ? null : Math.round(frame.t / 60_000);
      setMark((m) => (m && m.pos === frame.pos && m.minute === minute ? m : { pos: frame.pos, minute }));
    },
    [timeline, points],
  );

  const stop = useCallback(() => {
    at.current = 0;
    setActive(false);
    setPlaying(false);
    setMark(null);
    emit.current(null);
  }, []);

  // A new route or an edit to the segments invalidates a running replay.
  useEffect(() => stop(), [timeline, stop]);

  useEffect(() => {
    if (!active || !playing || !timeline) return;
    const rate = timeline.total / timeline.playback;
    let last = performance.now();
    let raf = requestAnimationFrame(function step(now: number) {
      const elapsed = now - last;
      last = now;
      show(at.current + elapsed * rate);
      if (at.current >= timeline.total) setPlaying(false);
      else raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [active, playing, timeline, show]);

  const toggle = useCallback(() => {
    if (!timeline) return;
    if (!active) {
      show(0);
      setActive(true);
      setPlaying(true);
      return;
    }
    // Pressing play at the very end starts over.
    if (!playing && at.current >= timeline.total) show(0);
    setPlaying((p) => !p);
  }, [active, playing, timeline, show]);

  const seek = useCallback(
    (pos: number) => {
      if (!timeline || !active) return;
      const t = timeOf(timeline, pos);
      if (t != null) show(t);
    },
    [timeline, active, show],
  );

  return {
    available: timeline != null,
    active,
    playing,
    range: timeline && mark ? [timeline.pos[0], mark.pos] : null,
    clock: mark?.minute != null ? mark.minute * 60_000 : null,
    toggle,
    stop,
    seek,
  };
}
