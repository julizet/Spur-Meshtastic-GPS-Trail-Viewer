import { ImageResponse } from "next/og";
import { includedPositions } from "@/lib/clean";
import { dist, fmtDuration, fmtInt, fmtKm } from "@/lib/geo";
import { isValidId, loadSnapshot } from "@/lib/server/store";
import { computeStats } from "@/lib/stats";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Vorschau der Wanderung";

const INK = "#1d2a24";
const BG = "#eef1ee";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snap = isValidId(id) ? await loadSnapshot(id) : null;
  if (!snap) {
    return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: BG }} />, size);
  }

  const s = computeStats(snap.points, snap.excluded, snap.segments);
  // Points per segment; distance and lines never bridge a gap between segments.
  const pts: typeof snap.points = [];
  const cum: number[] = [];
  const starts = new Set<number>();
  let acc = 0;
  for (const seg of snap.segments) {
    const v = includedPositions(snap.points, snap.excluded, seg.a, seg.b);
    v.forEach((k, j) => {
      if (j > 0) acc += dist(snap.points[v[j - 1]], snap.points[k]);
      if (j === 0) starts.add(pts.length);
      pts.push(snap.points[k]);
      cum.push(acc);
    });
  }

  // Route outline, projected into a 440 x 340 box.
  const lats = pts.map((p) => p.lat);
  const lons = pts.map((p) => p.lon);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = lons.map((l) => l * kx);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...lats), maxY = Math.max(...lats);
  const scale = Math.min(440 / (maxX - minX || 1), 340 / (maxY - minY || 1));
  const ox = (440 - (maxX - minX) * scale) / 2;
  const oy = (340 - (maxY - minY) * scale) / 2;
  const outline = pts
    .map((p, j) => `${starts.has(j) ? "M" : "L"}${(ox + (xs[j] - minX) * scale).toFixed(1)} ${(oy + (maxY - p.lat) * scale).toFixed(1)}`)
    .join(" ");

  // Elevation silhouette across the full width.
  const alts = pts.map((p) => p.alt ?? 0);
  const lo = Math.min(...alts), hi = Math.max(...alts);
  const profile =
    pts.map((_, j) => `${j ? "L" : "M"}${((cum[j] / (acc || 1)) * 1200).toFixed(1)} ${(150 - ((alts[j] - lo) / (hi - lo || 1)) * 120).toFixed(1)}`).join(" ") +
    " L1200 160 L0 160 Z";

  const stat = (value: string, label: string) => (
    <div style={{ display: "flex", flexDirection: "column", marginRight: 48 }}>
      <div style={{ fontSize: 44, fontWeight: 700, color: INK, letterSpacing: -1 }}>{value}</div>
      <div style={{ fontSize: 22, color: "#57625c" }}>{label}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: BG, position: "relative" }}>
        <div style={{ display: "flex", flex: 1, padding: "60px 64px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 32 }}>
            <div style={{ fontSize: 60, fontWeight: 700, color: INK, lineHeight: 1.05, letterSpacing: -1.5 }}>{snap.name}</div>
            <div style={{ display: "flex", marginTop: 44 }}>
              {stat(fmtDuration(s.duration), "Dauer")}
              {stat(fmtKm(s.distance), "Distanz")}
              {stat(`${fmtInt(s.ascent)} m`, "Aufstieg")}
            </div>
          </div>
          <svg width="440" height="340" viewBox="0 0 440 340">
            <path d={outline} fill="none" stroke="#ffffff" strokeWidth="14" strokeLinejoin="round" strokeLinecap="round" />
            <path d={outline} fill="none" stroke={INK} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
        <svg width="1200" height="160" viewBox="0 0 1200 160" style={{ display: "flex" }}>
          <path d={profile} fill={INK} />
        </svg>
      </div>
    ),
    size,
  );
}
