import type { Point } from "./types";

export class ParseError extends Error {}

const COLS: Record<string, string[]> = {
  lat: ["latitude", "lat", "breite", "breitengrad"],
  lon: ["longitude", "lon", "lng", "long", "länge", "laenge", "längengrad"],
  alt: ["altitude", "alt", "höhe", "hoehe", "elevation"],
  sats: ["sats", "satellites", "satelliten", "sats_in_view"],
  speed: ["speed", "geschwindigkeit", "ground_speed"],
  t: ["zeitstempel", "timestamp", "time", "zeit", "date", "datum", "rx_time"],
};

function detectDelimiter(line: string): string {
  const counts = ["\t", ";", ","].map((d) => [d, line.split(d).length] as const);
  counts.sort((x, y) => y[1] - x[1]);
  return counts[0][1] > 1 ? counts[0][0] : "\t";
}

function num(raw: string | undefined, decimalComma: boolean): number | null {
  if (raw == null) return null;
  let s = raw.trim().replace(/^"|"$/g, "");
  if (s === "") return null;
  if (decimalComma) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Accepts "26.9.2026 10:39", "26.09.2026 10:39:05", ISO strings and unix seconds/ms. */
export function parseTime(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().replace(/^"|"$/g, "");
  const de = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (de) {
    const [, d, m, y, h, min, sec] = de;
    return new Date(+y, +m - 1, +d, +h, +min, sec ? +sec : 0).getTime();
  }
  if (/^\d{9,10}$/.test(s)) return +s * 1000;
  if (/^\d{12,13}$/.test(s)) return +s;
  const iso = Date.parse(s);
  return Number.isFinite(iso) ? iso : null;
}

export function parseExport(text: string): Point[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) throw new ParseError("Die Datei enthält keine Datenzeilen.");

  const delim = detectDelimiter(lines[0]);
  const header = lines[0].split(delim).map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
  const idx: Record<string, number> = {};
  for (const [key, names] of Object.entries(COLS)) {
    idx[key] = header.findIndex((h) => names.includes(h));
  }
  if (idx.lat < 0 || idx.lon < 0) {
    throw new ParseError("Spalten für Breite und Länge fehlen. Erwartet werden z. B. „Latitude“ und „Longitude“.");
  }
  const decimalComma = delim === ";";

  const rows: Omit<Point, "i">[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(delim);
    const lat = num(c[idx.lat], decimalComma);
    const lon = num(c[idx.lon], decimalComma);
    if (lat == null || lon == null) continue;
    rows.push({
      lat,
      lon,
      alt: idx.alt >= 0 ? num(c[idx.alt], decimalComma) : null,
      sats: idx.sats >= 0 ? num(c[idx.sats], decimalComma) : null,
      speed: idx.speed >= 0 ? num(c[idx.speed], decimalComma) : null,
      t: idx.t >= 0 ? parseTime(c[idx.t]) : null,
    });
  }
  if (rows.length < 2) throw new ParseError("Zu wenige gültige Positionen gefunden.");

  // Stable sort by time; rows without time keep their place at the start.
  const sorted = rows
    .map((r, k) => ({ r, k }))
    .sort((x, y) => (x.r.t ?? -Infinity) - (y.r.t ?? -Infinity) || x.k - y.k)
    .map(({ r }, i) => ({ ...r, i }));
  return sorted;
}
