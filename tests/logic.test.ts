import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseExport, parseTime } from "../lib/parse";
import { clean, includedPositions } from "../lib/clean";
import { suggestSegments, split, remove, addRange, mergeRange } from "../lib/segments";
import { computeStats, rangeSummary } from "../lib/stats";
import { buildSnapshot, isRouteData } from "../lib/snapshot";
import { fmtDuration, fmtKm, paceBetween } from "../lib/geo";

const text = readFileSync(new URL("../public/beispiel.txt", import.meta.url), "utf8");
const points = parseExport(text);
const ex = clean(points);
const segs = suggestSegments(points, ex);

const contiguous = (s: { a: number; b: number }[]) =>
  s.every((x, k) => k === 0 || s[k - 1].b === x.a);

test("parses all rows", () => {
  assert.equal(points.length, 117);
  assert.equal(parseTime("26.9.2026 10:39"), new Date(2026, 8, 26, 10, 39).getTime());
  assert.equal(parseTime("1.1.1970 1:00"), new Date(1970, 0, 1, 1, 0).getTime());
});

test("calculates pace between recorded markers", () => {
  const start = { ...points[0], lat: 47, lon: 8, t: 0 };
  const end = { ...points[0], lat: 47.01, lon: 8, t: 15 * 60_000 };
  const pace = paceBetween(start, end);
  assert.ok(pace != null && pace > 13 && pace < 14);
  assert.equal(paceBetween(start, { ...start, t: null }), null);
  assert.equal(paceBetween(start, { ...start, t: 60_000 }), null);
});

test("marks invalid points without removing any", () => {
  const validTime = new Date(2026, 8, 26, 10, 39).getTime();
  const dirty = [
    { i: 0, lat: 47, lon: 8, alt: 500, sats: 10, speed: 1, t: 0 },
    { i: 1, lat: 47.01, lon: 8, alt: 500, sats: 10, speed: 1, t: validTime },
    { i: 2, lat: 47.01, lon: 8, alt: 500, sats: 10, speed: 1, t: validTime },
    { i: 3, lat: 47.02, lon: 8, alt: -500, sats: 10, speed: 1, t: validTime + 60_000 },
  ];
  const dirtyExcluded = clean(dirty);
  const reasons = Object.values(dirtyExcluded);
  assert.ok(reasons.includes("zeit"), "1970 row");
  assert.ok(reasons.includes("duplikat"), "duplicates");
  assert.equal(dirtyExcluded[3], "ausreisser");
  assert.equal(dirty.length, 4, "originals untouched");
  console.log("excluded:", reasons.length, reasons.reduce<Record<string, number>>((a, r) => ((a[r] = (a[r] ?? 0) + 1), a), {}));
});

test("suggests walks, hikes, pauses, and a return drive", () => {
  assert.ok(contiguous(segs));
  const names = segs.map((s) => s.name);
  console.log(segs.map((s) => {
    const r = rangeSummary(points, ex, s.a, s.b);
    return `${s.name.padEnd(12)} ${s.kind.padEnd(8)} ${fmtDuration(r.duration).padStart(8)} ${fmtKm(r.distance).padStart(8)} on=${s.on}`;
  }).join("\n"));
  assert.equal(names[0], "Spaziergang");
  assert.equal(names[names.length - 1], "Rückfahrt");
  assert.ok(names.includes("Aufstieg"));
  assert.ok(segs.some((s) => s.kind === "pause"));
});

test("names walks shorter than 90 minutes Spaziergang", () => {
  const walk = (minutes: number) => suggestSegments([
    { i: 0, lat: 47, lon: 8, alt: 500, sats: 10, speed: 1, t: 0 },
    { i: 1, lat: 47, lon: 8.01, alt: 500, sats: 10, speed: 1, t: minutes * 60_000 },
  ], {});
  assert.equal(walk(89)[0].name, "Spaziergang");
  assert.equal(walk(90)[0].name, "Wanderung");
});

test("stats of active hike are plausible", () => {
  const st = computeStats(points, ex, segs.filter((s) => s.on));
  console.log({
    dauer: fmtDuration(st.duration), bewegt: fmtDuration(st.moving), km: st.distance.toFixed(2),
    auf: Math.round(st.ascent), ab: Math.round(st.descent), kmh: st.speed.toFixed(1),
    max: st.maxAlt, steig: st.climbRate && Math.round(st.climbRate), n: st.count,
  });
  assert.equal(st.maxAlt, 2055);
  assert.ok(st.ascent > 700 && st.ascent < 1100);
  assert.ok(st.distance > 5 && st.distance < 25);
  assert.ok(st.speed > 1 && st.speed < 6);
});

test("editing keeps a contiguous timeline and never touches points", () => {
  const before = JSON.stringify(points);
  const hike = segs.find((s) => s.name === "Aufstieg")!;
  const mid = Math.floor((hike.a + hike.b) / 2);
  const s1 = split(segs, mid);
  assert.equal(s1.length, segs.length + 1);
  assert.ok(contiguous(s1));
  const s2 = remove(s1, s1.findIndex((s) => s.a === mid));
  assert.equal(s2.length, segs.length);
  assert.ok(contiguous(s2));
  // Range across several segments absorbs the covered ones.
  const { segments: s3, id } = addRange(segs, points, ex, segs[1].a + 2, segs[segs.length - 2].b - 2);
  assert.ok(id);
  assert.ok(contiguous(s3));
  assert.equal(s3[0].a, segs[0].a);
  assert.equal(s3[s3.length - 1].b, segs[segs.length - 1].b);
  // Deleting the first segment merges it into the next one.
  const s4 = remove(segs, 0);
  assert.equal(s4[0].a, segs[0].a);
  assert.equal(JSON.stringify(points), before);
});

test("mergeRange combines a span of segments into one", () => {
  assert.ok(segs.length >= 3);
  const m = mergeRange(segs, 0, segs.length - 1);
  assert.equal(m.length, 1);
  assert.equal(m[0].a, segs[0].a);
  assert.equal(m[0].b, segs[segs.length - 1].b);
  assert.equal(m[0].name, segs[0].name);
  assert.ok(contiguous(m));
  // Order of indices does not matter and non-adjacent ends absorb the middle.
  assert.deepEqual(mergeRange(segs, segs.length - 1, 0), m);
  assert.equal(mergeRange(segs, 1, 1).length, segs.length);
});

test("snapshot only contains active segments and valid points", () => {
  const snap = buildSnapshot({ name: "Test", points, excluded: ex, segments: segs }, "strecke", null);
  assert.ok(isRouteData(snap));
  const active = segs.filter((s) => s.on);
  assert.equal(snap.segments.length, active.length);
  const allowed = new Set(active.flatMap((s) => includedPositions(points, ex, s.a, s.b).map((k) => points[k].i)));
  assert.ok(snap.points.every((p) => allowed.has(p.i)));
  assert.ok(!snap.points.some((p) => p.alt === -49));
  assert.ok(snap.segments.every((s) => s.a >= 0 && s.b < snap.points.length && s.a <= s.b));
  const full = computeStats(points, ex, active);
  const viaSnap = computeStats(snap.points, snap.excluded, snap.segments);
  assert.equal(viaSnap.distance.toFixed(6), full.distance.toFixed(6));
  assert.equal(viaSnap.count, full.count);
  console.log("snapshot points:", snap.points.length, "of", points.length);
});

import { matchPhoto } from "../lib/match";

test("photos are matched by capture time within active segments only", () => {
  const data = { name: "x", points, excluded: ex, segments: segs };
  const summit = new Date(2026, 8, 26, 16, 10).getTime();
  const i = matchPhoto(data, summit);
  assert.ok(i != null);
  assert.ok(points[i!].alt! > 2000);
  // During the (inactive) drive home: rejected.
  assert.equal(matchPhoto(data, new Date(2026, 8, 26, 19, 40).getTime()), null);
  // Another day: rejected.
  assert.equal(matchPhoto(data, new Date(2026, 8, 20, 12, 0).getTime()), null);
});
