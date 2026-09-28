export type Point = {
  /** Index in the original upload. Never changes, also used to attach photos. */
  i: number;
  lat: number;
  lon: number;
  alt: number | null;
  sats: number | null;
  /** Speed reported by the node (km/h). */
  speed: number | null;
  /** Unix time in ms, null if the row had no usable timestamp. */
  t: number | null;
};

export type Kind = "wandern" | "pause" | "fahrt";

export type Segment = {
  id: string;
  /** Array positions (inclusive). Neighbouring segments share their boundary point. */
  a: number;
  b: number;
  name: string;
  kind: Kind;
  /** Active = highlighted, counted in stats, included when sharing. */
  on: boolean;
};

export type ExcludeReason = "zeit" | "position" | "duplikat" | "ausreisser" | "manuell";

/** Array position -> reason. */
export type Excluded = Record<number, ExcludeReason>;

export type ColorMode = "strecke" | "hoehe" | "steil" | "gps" | "pace";

export type RouteData = {
  name: string;
  points: Point[];
  excluded: Excluded;
  segments: Segment[];
};

/** Full working state of the owner. Stored privately, only readable with the edit token. */
export type SourceDoc = RouteData & {
  v: 1;
  suggestion: Segment[];
  colorMode: ColorMode;
};

/** Exactly what the owner saw when sharing: only active segments and their valid points. */
export type Snapshot = RouteData & {
  v: 1;
  colorMode: ColorMode;
  view: { lat: number; lon: number; zoom: number } | null;
};

export type Photo = {
  id: string;
  /** Original point index (Point.i). */
  i: number;
  takenAt: number | null;
  src: string;
  /** Only set for photos not yet uploaded. */
  file?: Blob;
};

export type Stats = {
  duration: number;
  moving: number;
  distance: number;
  ascent: number;
  descent: number;
  speed: number;
  maxAlt: number | null;
  minAlt: number | null;
  climbRate: number | null;
  count: number;
};
