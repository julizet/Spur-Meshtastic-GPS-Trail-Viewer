"use client";

import L from "leaflet";
import { useEffect, useReducer, useRef, type MutableRefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { includedPositions } from "@/lib/clean";
import { colorFor, FADED, INK, type ColorScale } from "@/lib/colors";
import { fmtInt } from "@/lib/geo";
import type { ColorMode, Excluded, Photo, Point, Segment } from "@/lib/types";

export type MapHandle = {
  getView: () => { lat: number; lon: number; zoom: number } | null;
};

export type PhotoPin = { pos: number; photos: Photo[]; first: number };

type Props = {
  handleRef: MutableRefObject<MapHandle | null>;
  points: Point[];
  excluded: Excluded;
  segments: Segment[];
  colorMode: ColorMode;
  colorScale: ColorScale | null;
  showInactive: boolean;
  showExcluded: boolean;
  showDots: boolean;
  picking: boolean;
  hover: number | null;
  selected: number | null;
  highlight: [number, number] | null;
  pins: PhotoPin[];
  fitKey: string;
  fitSegmentIds: string[];
  initialView: { lat: number; lon: number; zoom: number } | null;
  popover: ReactNode;
  onPick: (pos: number) => void;
  onHover: (pos: number | null) => void;
  onPhoto: (index: number) => void;
  onBackground: () => void;
};

const HIT_PX = 22;

function fitPadding(): { tl: L.PointExpression; br: L.PointExpression } {
  const w = window.innerWidth;
  if (w <= 860) {
    const controls = document.querySelector(".panel-stack")?.getBoundingClientRect();
    const stats = document.querySelector(".stats-stack")?.getBoundingClientRect();
    const top = controls ? controls.bottom + 16 : 130;
    const bottom = stats ? window.innerHeight - stats.top + 16 : 200;
    return { tl: [28, top], br: [28, bottom] };
  }
  if (w <= 1180) return { tl: [360, 80], br: [60, 260] };
  return { tl: [360, 80], br: [80, 260] };
}

export default function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const groups = useRef<Record<"route" | "marks" | "pins", L.LayerGroup> | null>(null);
  const live = useRef(props);
  live.current = props;
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const [fitVersion, refit] = useReducer((x: number) => x + 1, 0);
  const activeSegmentKey = props.segments.filter((segment) => segment.on).map((segment) => segment.id).join(":");

  props.handleRef.current = {
    getView: () => {
      const m = map.current;
      if (!m) return null;
      const c = m.getCenter();
      return { lat: +c.lat.toFixed(5), lon: +c.lng.toFixed(5), zoom: m.getZoom() };
    },
  };

  /** Positions the pointer can snap to. */
  function candidates(): number[] {
    const p = live.current;
    const out: number[] = [];
    for (const s of p.segments) {
      if (!s.on && !p.showInactive) continue;
      out.push(...includedPositions(p.points, p.excluded, s.a, s.b));
    }
    if (p.showExcluded) for (const k of Object.keys(p.excluded)) out.push(Number(k));
    return out;
  }

  function nearest(pt: L.Point): number | null {
    const m = map.current;
    if (!m) return null;
    let best: number | null = null;
    let bestD = HIT_PX;
    for (const k of candidates()) {
      const p = live.current.points[k];
      const d = m.latLngToContainerPoint([p.lat, p.lon]).distanceTo(pt);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  // Create the map once.
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, preferCanvas: false, zoomSnap: 0.25 });
    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      maxNativeZoom: 17,
      subdomains: "abc",
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    const view = live.current.initialView;
    if (view) m.setView([view.lat, view.lon], view.zoom);
    else m.setView([46.8, 8.2], 8);

    groups.current = {
      route: L.layerGroup().addTo(m),
      marks: L.layerGroup().addTo(m),
      pins: L.layerGroup().addTo(m),
    };

    let frame = 0;
    m.on("mousemove", (e: L.LeafletMouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const k = nearest(e.containerPoint);
        el.current?.parentElement?.classList.toggle("hovering", k != null);
        if (k !== live.current.hover) live.current.onHover(k);
      });
    });
    m.on("mouseout", () => live.current.onHover(null));
    m.on("click", (e: L.LeafletMouseEvent) => {
      const k = nearest(e.containerPoint);
      if (k != null) live.current.onPick(k);
      else live.current.onBackground();
    });
    m.on("move zoom", rerender);
    m.on("resize", refit);
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit to the route when it loads and keep selected stages in view.
  useEffect(() => {
    const m = map.current;
    const p = live.current;
    if (!m || !p.fitKey || p.points.length === 0) return;
    const selectedIds = new Set(p.fitSegmentIds);
    const fittedSegments = selectedIds.size
      ? p.segments.filter((s) => selectedIds.has(s.id))
      : p.segments.filter((s) => s.on);
    const pts = fittedSegments.flatMap((s) => includedPositions(p.points, p.excluded, s.a, s.b));
    const use = pts.length ? pts : includedPositions(p.points, p.excluded);
    if (!use.length) return;
    const bounds = L.latLngBounds(use.map((k) => [p.points[k].lat, p.points[k].lon] as L.LatLngTuple));
    const fittedBounds = bounds.pad(-0.08);
    const pad = fitPadding();
    // Every device frames the route itself; the shared content stays exactly the same.
    if (p.fitKey.startsWith("shared:")) {
      m.fitBounds(fittedBounds, { paddingTopLeft: pad.tl, paddingBottomRight: pad.br, maxZoom: 19 });
      return;
    }
    m.flyToBounds(fittedBounds, { paddingTopLeft: pad.tl, paddingBottomRight: pad.br, duration: 0.9, maxZoom: 19 });
  }, [props.fitKey, props.fitSegmentIds, activeSegmentKey, fitVersion]);

  // Route lines.
  useEffect(() => {
    const g = groups.current?.route;
    if (!g) return;
    g.clearLayers();
    const { points, excluded, segments, colorMode, colorScale, showInactive } = props;
    const ll = (k: number): L.LatLngTuple => [points[k].lat, points[k].lon];

    for (const s of segments) {
      const v = includedPositions(points, excluded, s.a, s.b);
      if (v.length < 2) continue;
      if (!s.on) {
        if (showInactive) {
          L.polyline(v.map(ll), { color: FADED, weight: 3, opacity: 0.75, dashArray: "3 7", interactive: false }).addTo(g);
        }
        continue;
      }
      L.polyline(v.map(ll), { color: "#fff", weight: 8, opacity: 0.85, interactive: false }).addTo(g);
      if (colorMode === "strecke") {
        L.polyline(v.map(ll), {
          color: INK, weight: 3.5, opacity: 1, interactive: false,
          dashArray: s.kind === "fahrt" ? "6 7" : undefined,
        }).addTo(g);
      } else {
        for (let j = 1; j < v.length; j++) {
          const c = colorFor(colorMode, points[v[j - 1]], points[v[j]], s.kind, colorScale);
          L.polyline([ll(v[j - 1]), ll(v[j])], { color: c, weight: 4, opacity: 1, interactive: false, lineCap: "round" }).addTo(g);
        }
      }
    }
  }, [props.points, props.excluded, props.segments, props.colorMode, props.colorScale, props.showInactive]);

  // Markers: boundaries, start/end, peak, dots, hover, selection, highlight.
  useEffect(() => {
    const g = groups.current?.marks;
    if (!g) return;
    g.clearLayers();
    const { points, excluded, segments, hover, selected, highlight, showDots, showExcluded } = props;
    const ll = (k: number): L.LatLngTuple => [points[k].lat, points[k].lon];
    const active = segments.filter((s) => s.on);
    const activePos = active.flatMap((s) => includedPositions(points, excluded, s.a, s.b));

    if (highlight) {
      const [a, b] = highlight[0] <= highlight[1] ? highlight : [highlight[1], highlight[0]];
      const v = includedPositions(points, excluded, a, b);
      if (v.length > 1) L.polyline(v.map(ll), { color: "#2a61ae", weight: 11, opacity: 0.28, interactive: false }).addTo(g);
    }

    if (showDots) {
      const all = segments.flatMap((s) => includedPositions(points, excluded, s.a, s.b));
      for (const k of new Set(all)) {
        L.circleMarker(ll(k), { radius: 2.5, color: INK, weight: 1, fillColor: "#fff", fillOpacity: 1, interactive: false }).addTo(g);
      }
    }
    if (showExcluded) {
      for (const key of Object.keys(excluded)) {
        const k = Number(key);
        L.circleMarker(ll(k), { radius: 5, color: "#a8281f", weight: 1.5, dashArray: "2 2", fillOpacity: 0, interactive: false }).addTo(g);
      }
    }

    // Segment boundaries.
    for (let j = 1; j < active.length; j++) {
      const v = includedPositions(points, excluded, active[j].a, active[j].b);
      if (v.length) L.circleMarker(ll(v[0]), { radius: 4, color: INK, weight: 1.5, fillColor: "#fff", fillOpacity: 1, interactive: false }).addTo(g);
    }
    if (activePos.length) {
      L.circleMarker(ll(activePos[0]), { radius: 6, color: INK, weight: 2, fillColor: "#fff", fillOpacity: 1, interactive: false }).addTo(g);
      L.circleMarker(ll(activePos[activePos.length - 1]), { radius: 6, color: "#fff", weight: 2, fillColor: INK, fillOpacity: 1, interactive: false }).addTo(g);
      let peak = activePos[0];
      for (const k of activePos) if ((points[k].alt ?? -1e9) > (points[peak].alt ?? -1e9)) peak = k;
      if (points[peak].alt != null) {
        L.marker(ll(peak), {
          interactive: false,
          icon: L.divIcon({ className: "", html: `<div class="peak-label">${fmtInt(points[peak].alt!)} m</div>`, iconSize: [80, 16], iconAnchor: [-8, 18] }),
        }).addTo(g);
      }
    }
    if (hover != null && points[hover]) {
      L.circleMarker(ll(hover), { radius: 7, color: INK, weight: 2, fillColor: "#fff", fillOpacity: 1, interactive: false }).addTo(g);
    }
    if (selected != null && points[selected]) {
      L.circleMarker(ll(selected), { radius: 7, color: "#fff", weight: 2.5, fillColor: INK, fillOpacity: 1, interactive: false }).addTo(g);
    }
  }, [props.points, props.excluded, props.segments, props.hover, props.selected, props.highlight, props.showDots, props.showExcluded]);

  // Photo pins.
  useEffect(() => {
    const g = groups.current?.pins;
    if (!g) return;
    g.clearLayers();
    for (const pin of props.pins) {
      const p = props.points[pin.pos];
      if (!p) continue;
      const count = pin.photos.length > 1 ? `<span>${pin.photos.length}</span>` : "";
      const marker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: "",
          html: `<div class="photo-pin"><img src="${pin.photos[0].src}" alt="" loading="lazy">${count}</div>`,
          iconSize: [38, 38],
          iconAnchor: [19, 46],
        }),
        keyboard: true,
        title: "Foto ansehen",
      });
      marker.on("click", (e) => { L.DomEvent.stopPropagation(e); live.current.onPhoto(pin.first); });
      marker.addTo(g);
    }
  }, [props.pins, props.points]);

  // Popover position follows the map.
  let pop: ReactNode = null;
  if (props.popover && props.selected != null && map.current && props.points[props.selected]) {
    const p = props.points[props.selected];
    const xy = map.current.latLngToContainerPoint([p.lat, p.lon]);
    const x = Math.min(Math.max(xy.x, 130), window.innerWidth - 130);
    const below = xy.y < 260;
    pop = createPortal(
      <div className={`float popover${below ? " below" : ""}`} style={{ left: x, top: xy.y }} onClick={(e) => e.stopPropagation()}>
        {props.popover}
      </div>,
      document.body,
    );
  }

  return (
    <div className={`map${props.picking ? " picking" : ""}`}>
      <div ref={el} style={{ width: "100%", height: "100%" }} />
      {pop}
    </div>
  );
}
