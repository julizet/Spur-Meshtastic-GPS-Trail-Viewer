"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clean, includedPositions } from "@/lib/clean";
import { colorScaleFor } from "@/lib/colors";
import { fmtClock, fmtDate } from "@/lib/geo";
import { matchPhoto } from "@/lib/match";
import { parseExport, ParseError } from "@/lib/parse";
import { addRange, mergeRange, nextKind, remove, split, suggestSegments, update } from "@/lib/segments";
import { buildSnapshot } from "@/lib/snapshot";
import { computeStats, type Range } from "@/lib/stats";
import type { ColorMode, Photo, RouteData, Segment, Snapshot, SourceDoc } from "@/lib/types";
import {
  clearToken, createShared, deleteShared, getToken, loadSource, photoUrl, removePhoto, setToken, updateShared, uploadPhoto,
} from "@/lib/client/api";
import { MAX_PHOTOS, readTakenAt, shrinkPhoto } from "@/lib/client/photos";
import Panel from "./Panel";
import MapModeControl from "./MapModeControl";
import PhotoViewer from "./PhotoViewer";
import PointPopover from "./PointPopover";
import Profile from "./Profile";
import StatsBar from "./StatsBar";
import type { MapHandle, PhotoPin } from "./MapView";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

export type SharedInit = {
  id: string;
  snapshot: Snapshot;
  photos: { id: string; i: number; takenAt: number | null }[];
};

type Toast = { text: string; action?: { label: string; run: () => void } };
type Undo = Pick<RouteData, "segments" | "excluded">;

const isMobile = () => typeof window !== "undefined" && window.innerWidth <= 860;
const byPlace = (x: Photo, y: Photo) => x.i - y.i || (x.takenAt ?? 0) - (y.takenAt ?? 0);

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function App({ shared }: { shared?: SharedInit }) {
  const handle = useRef<MapHandle | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<number | null>(null);

  const [data, setData] = useState<RouteData | null>(() =>
    shared ? { name: shared.snapshot.name, points: shared.snapshot.points, excluded: shared.snapshot.excluded, segments: shared.snapshot.segments } : null,
  );
  const [suggestion, setSuggestion] = useState<Segment[]>([]);
  const [colorMode, setColorMode] = useState<ColorMode>(shared?.snapshot.colorMode ?? "strecke");
  const [photos, setPhotos] = useState<Photo[]>(() =>
    shared ? shared.photos.map((p) => ({ ...p, src: photoUrl(shared.id, p.id) })).sort(byPlace) : [],
  );
  const [link, setLink] = useState<{ id: string; token: string | null } | null>(shared ? { id: shared.id, token: null } : null);
  const [dirty, setDirty] = useState(false);
  const [fitKey, setFitKey] = useState(shared ? `shared:${shared.id}` : "");
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<"start" | "end" | null>(null);
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [selectedSegs, setSelectedSegs] = useState<string[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [undoStack, setUndoStack] = useState<Undo[]>([]);
  const [showExcluded, setShowExcluded] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const role: "owner" | "viewer" = !shared || link?.token ? "owner" : "viewer";
  const isOwner = role === "owner";

  /* ---------- Initial setup ---------- */

  useEffect(() => {
    if (isMobile() && shared) setPanelOpen(false);
  }, [shared]);

  // The creator is recognised by the token stored in this browser (or an edit link).
  useEffect(() => {
    if (!shared) return;
    const m = window.location.hash.match(/edit=([A-Za-z0-9]+)/);
    if (m) {
      setToken(shared.id, m[1]);
      window.history.replaceState(null, "", window.location.pathname);
    }
    const token = getToken(shared.id);
    if (!token) return;
    loadSource(shared.id, token)
      .then(({ source }) => {
        setData({ name: source.name, points: source.points, excluded: source.excluded, segments: source.segments });
        setSuggestion(source.suggestion);
        setColorMode(source.colorMode);
        setLink({ id: shared.id, token });
        setSelected(null);
      })
      .catch(() => clearToken(shared.id));
  }, [shared]);

  useEffect(() => {
    if (!toast || toast.action) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!dirty || link) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, link]);

  /* ---------- Loading a file ---------- */

  async function loadText(text: string, source: "file" | "example" = "file") {
    try {
      const points = parseExport(text);
      const excluded = clean(points);
      const segments = suggestSegments(points, excluded);
      if (segments.length === 0) throw new ParseError("Zu wenige gültige Positionen gefunden.");
      const first = points.find((p, k) => !excluded[k])?.t ?? null;
      let examplePhotos: Photo[] = [];
      if (source === "example") {
        setBusy("Beispielfoto wird vorbereitet");
        const point = points.find((p) => p.t != null && fmtClock(p.t) === "16:56");
        const response = await fetch("/summit_schiebengutsch.HEIC");
        if (!point || !response.ok) throw new Error("Beispielfoto konnte nicht geladen werden.");
        const original = new File([await response.blob()], "summit_schiebengut.HEIC", { type: "image/heic" });
        const photo = await shrinkPhoto(original);
        examplePhotos = [{ id: "example-summit", i: point.i, takenAt: point.t, src: URL.createObjectURL(photo), file: photo }];
      }
      setData({ name: first ? `Wanderung Schiebengutsch ${fmtDate(first)}` : "Wanderung", points, excluded, segments });
      setSuggestion(segments);
      setUndoStack([]);
      setPhotos(examplePhotos);
      setSelected(null);
      setFocus(null);
      setEditing(false);
      setShowExcluded(false);
      setError(null);
      setDirty(true);
      setPanelOpen(!isMobile());
      setFitKey(`${source}:${Date.now()}`);
    } catch (e) {
      setError(e instanceof ParseError ? e.message : e instanceof Error ? e.message : "Die Datei konnte nicht gelesen werden. Prüfe, ob es ein Meshtastic-Export ist.");
    } finally {
      setBusy(null);
    }
  }

  /* ---------- Editing (non-destructive, undoable) ---------- */

  const commit = useCallback((patch: Partial<Undo>) => {
    if (!data) return;
    setUndoStack((s) => [...s.slice(-49), { segments: data.segments, excluded: data.excluded }]);
    setData({ ...data, ...patch });
    setDirty(true);
  }, [data]);

  const undo = useCallback(() => {
    if (!data || undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack(undoStack.slice(0, -1));
    setData({ ...data, ...last });
    setDirty(true);
  }, [data, undoStack]);

  function finishRange(a: number, b: number) {
    if (!data) return;
    const { segments, id } = addRange(data.segments, data.points, data.excluded, a, b);
    if (id) {
      commit({ segments });
      setEditing(true);
      setPanelOpen(true);
      setSelectedSegs([id]);
    }
    setAdding(null);
    setRangeStart(null);
    setFocus(null);
  }

  function pick(pos: number) {
    if (adding === "start") {
      setRangeStart(pos);
      setAdding("end");
      return;
    }
    if (adding === "end" && rangeStart != null) {
      finishRange(rangeStart, pos);
      return;
    }
    setSelected(pos === selected ? null : pos);
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (e.key === "Escape") {
        if (viewer != null) setViewer(null);
        else if (adding) { setAdding(null); setRangeStart(null); }
        else if (selected != null) setSelected(null);
        else if (focus) setFocus(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing && isOwner) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [viewer, adding, selected, focus, undo, isOwner]);

  /* ---------- Derived ---------- */

  const derived = useMemo(() => {
    if (!data) return null;
    const active = data.segments.filter((s) => s.on);
    const visible = new Set(active.flatMap((s) => includedPositions(data.points, data.excluded, s.a, s.b)));
    const posOfI = new Map(data.points.map((p, k) => [p.i, k]));
    let ranges: Range[] = active;
    if (focus) {
      ranges = active
        .map((s) => ({ a: Math.max(s.a, focus[0]), b: Math.min(s.b, focus[1]), kind: s.kind }))
        .filter((r) => r.a < r.b);
    }
    const stats = computeStats(data.points, data.excluded, ranges);
    const visiblePhotos = photos.filter((p) => {
      const pos = posOfI.get(p.i);
      return pos != null && visible.has(pos);
    });
    const groups = new Map<number, PhotoPin>();
    visiblePhotos.forEach((photo, index) => {
      const pos = posOfI.get(photo.i)!;
      const g = groups.get(pos);
      if (g) g.photos.push(photo);
      else groups.set(pos, { pos, photos: [photo], first: index });
    });
    const modified =
      suggestion.length > 0 &&
      (JSON.stringify(data.segments) !== JSON.stringify(suggestion) ||
        JSON.stringify(data.excluded) !== JSON.stringify(clean(data.points)));
    return { visible, posOfI, stats, visiblePhotos, pins: [...groups.values()], modified };
  }, [data, photos, focus, suggestion]);

  /* ---------- Photos ---------- */

  async function addPhotos(files: File[], forcedPos: number | null) {
    if (!data) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setToast({ text: `Diese Route hat bereits ${MAX_PHOTOS} Fotos.` });
      return;
    }
    const list = files.slice(0, room);
    let added = 0, noTime = 0, outside = 0, failed = 0;
    let lastError = "";
    for (let n = 0; n < list.length; n++) {
      setBusy(list.length > 1 ? `Foto ${n + 1} von ${list.length}` : "Foto wird vorbereitet");
      try {
        const file = list[n];
        const takenAt = await readTakenAt(file);
        let i: number | null = forcedPos != null ? data.points[forcedPos].i : null;
        if (i == null) {
          if (takenAt == null) { noTime++; continue; }
          i = matchPhoto(data, takenAt);
          if (i == null) { outside++; continue; }
        }
        const blob = await shrinkPhoto(file);
        const photo: Photo = link
          ? await uploadPhoto(link.id, i, takenAt, blob, link.token)
          : { id: `local-${Date.now()}-${n}`, i, takenAt, src: URL.createObjectURL(blob), file: blob };
        setPhotos((ps) => [...ps, photo].sort(byPlace));
        added++;
      } catch (e) {
        failed++;
        lastError = e instanceof Error ? e.message : "";
      }
    }
    setBusy(null);
    const parts: string[] = [];
    if (added) parts.push(added === 1 ? "Foto hinzugefügt." : `${added} Fotos hinzugefügt.`);
    if (noTime) parts.push(`${noTime} ohne Aufnahmezeit: füge ${noTime === 1 ? "es" : "sie"} über einen Wegpunkt hinzu.`);
    if (outside) parts.push(`${outside} außerhalb der Route aufgenommen.`);
    if (failed) parts.push(lastError || `${failed} konnten nicht hochgeladen werden.`);
    if (files.length > room) parts.push(`Maximal ${MAX_PHOTOS} Fotos pro Route.`);
    if (!link && added) setDirty(true);
    setToast({ text: parts.join(" ") });
  }

  function openPhotoPicker(pos: number | null) {
    photoTarget.current = pos;
    photoInput.current?.click();
  }

  /** Guests confirm consent once before their first upload. */
  function requestPhotos(pos: number | null) {
    if (isOwner) return openPhotoPicker(pos);
    setToast({
      text: "Teile nur Fotos, mit denen alle Abgebildeten einverstanden sind.",
      action: { label: "Fotos auswählen", run: () => { setToast(null); openPhotoPicker(pos); } },
    });
  }

  async function deletePhoto(photo: Photo) {
    try {
      if (photo.file) URL.revokeObjectURL(photo.src);
      else if (link?.token) await removePhoto(link.id, link.token, photo.id);
      setPhotos((ps) => ps.filter((p) => p.id !== photo.id));
      setViewer(null);
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : "Das Foto konnte nicht gelöscht werden." });
    }
  }

  /* ---------- Sharing: one link, exactly this view ---------- */

  async function share() {
    if (!data) return;
    const snapshot = buildSnapshot(data, colorMode, handle.current?.getView() ?? null);
    if (snapshot.points.length < 2) {
      setToast({ text: "Wähle mindestens eine Etappe aus." });
      return;
    }
    const source: SourceDoc = { v: 1, ...data, suggestion, colorMode };
    setBusy(link ? "Link wird aktualisiert" : "Link wird erstellt");
    try {
      let id = link?.id;
      let token = link?.token ?? null;
      if (!id) {
        const res = await createShared(snapshot, source);
        id = res.id;
        token = res.token;
        setToken(id, token);
        setLink({ id, token });
        window.history.replaceState(null, "", `/r/${id}`);
      } else if (token) {
        await updateShared(id, token, snapshot, source);
      }
      const inSnapshot = new Set(snapshot.points.map((p) => p.i));
      for (const p of photos.filter((x) => x.file && inSnapshot.has(x.i))) {
        setBusy("Fotos werden hochgeladen");
        const up = await uploadPhoto(id, p.i, p.takenAt, p.file!, token);
        URL.revokeObjectURL(p.src);
        setPhotos((ps) => ps.map((x) => (x.id === p.id ? up : x)));
      }
      setDirty(false);
      await copyLinks(id, token);
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : "Der Link konnte nicht erstellt werden." });
    } finally {
      setBusy(null);
    }
  }

  async function copyLinks(id: string, token: string | null) {
    const url = `${window.location.origin}/r/${id}`;
    const ok = await copy(url);
    setToast({
      text: ok ? "Link kopiert" : url,
      action: token
        ? {
            label: "Bearbeitungslink kopieren",
            run: async () => {
              const edit = `${url}#edit=${token}`;
              const done = await copy(edit);
              setToast({ text: done ? "Bearbeitungslink kopiert. Behalte ihn für dich." : edit });
            },
          }
        : undefined,
    });
  }

  async function deleteLink() {
    if (!link?.token) return;
    if (!window.confirm("Link, Route und alle Fotos endgültig löschen?")) return;
    try {
      await deleteShared(link.id, link.token);
      clearToken(link.id);
      window.location.href = "/";
    } catch (e) {
      setToast({ text: e instanceof Error ? e.message : "Der Link konnte nicht gelöscht werden." });
    }
  }

  function startOver() {
    if (dirty && !link && !window.confirm("Die aktuelle Route ist noch nicht geteilt und geht verloren. Trotzdem neu beginnen?")) return;
    if (link) {
      window.location.href = "/";
      return;
    }
    photos.forEach((p) => p.file && URL.revokeObjectURL(p.src));
    setData(null);
    setPhotos([]);
    setDirty(false);
    setSelected(null);
    setFocus(null);
    setEditing(false);
    setError(null);
  }

  /* ---------- Render ---------- */

  const segOf = (id: string | null) => data?.segments.find((s) => s.id === id) ?? null;
  const curSel = editing && data ? data.segments.filter((s) => selectedSegs.includes(s.id)) : [];
  const highlight: [number, number] | null =
    adding === "end" && rangeStart != null && hover != null ? [rangeStart, hover]
      : focus ? focus
        : curSel.length ? [Math.min(...curSel.map((s) => s.a)), Math.max(...curSel.map((s) => s.b))] : null;

  const sel = data && selected != null ? data.points[selected] : null;
  const selPhotos = sel && derived ? derived.visiblePhotos.map((photo, index) => ({ photo, index })).filter((x) => x.photo.i === sel.i) : [];
  const popover = sel && data && derived ? (
    <PointPopover
      point={sel}
      reason={data.excluded[selected!]}
      photos={selPhotos}
      canAddPhoto={derived.visible.has(selected!) && photos.length < MAX_PHOTOS}
      canSplit={isOwner && editing && !data.excluded[selected!] && data.segments.some((s) => selected! > s.a && selected! < s.b)}
      canExclude={isOwner && (editing || !!data.excluded[selected!])}
      onPhoto={(i) => setViewer(i)}
      onAddPhoto={() => requestPhotos(selected)}
      onSplit={() => { commit({ segments: split(data.segments, selected!) }); setSelected(null); }}
      onToggleExclude={() => {
        const next = { ...data.excluded };
        if (next[selected!]) delete next[selected!];
        else next[selected!] = "manuell";
        commit({ excluded: next });
      }}
      onClose={() => setSelected(null)}
    />
  ) : null;

  const focusLabel = focus && data
    ? `Auswahl ${fmtClock(data.points[focus[0]].t)} bis ${fmtClock(data.points[focus[1]].t)}`
    : null;
  const shareLabel = !link ? "Teilen" : dirty ? "Link aktualisieren" : "Link kopieren";
  const colorScale = useMemo(
    () => data ? colorScaleFor(colorMode, data.points, data.excluded, data.segments) : null,
    [colorMode, data],
  );

  return (
    <main>
      <MapView
        handleRef={handle}
        points={data?.points ?? []}
        excluded={data?.excluded ?? {}}
        segments={data?.segments ?? []}
        colorMode={colorMode}
        colorScale={colorScale}
        showInactive={isOwner}
        showExcluded={isOwner && showExcluded}
        showDots={isOwner && editing}
        picking={adding != null}
        hover={hover}
        selected={adding ? rangeStart : selected}
        highlight={highlight}
        pins={derived?.pins ?? []}
        fitKey={fitKey}
        fitSegmentIds={selectedSegs}
        initialView={shared?.snapshot.view ?? null}
        popover={adding ? null : popover}
        onPick={pick}
        onHover={setHover}
        onPhoto={(i) => setViewer(i)}
        onBackground={() => setSelected(null)}
      />

      <div className="panel-stack">
        {!data ? (
          <Panel
            state="upload"
            error={error}
            onFile={(f) => f.text().then((text) => void loadText(text))}
            onExample={() => fetch("/beispiel.txt").then((r) => r.text()).then((text) => void loadText(text, "example"))}
          />
        ) : (
          <Panel
            state="route"
            data={data}
            role={role}
            open={panelOpen}
            onToggleOpen={() => setPanelOpen(!panelOpen)}
            editing={editing}
            adding={adding}
            selectedSegs={selectedSegs}
            modified={!!derived?.modified}
            canUndo={undoStack.length > 0}
            excludedCount={Object.keys(data.excluded).length}
            showExcluded={showExcluded}
            shared={!!link?.token}
            busy={!!busy}
            shareLabel={shareLabel}
            canAddPhotos={photos.length < MAX_PHOTOS}
            onRename={(name) => { setData({ ...data, name }); setDirty(true); }}
            onToggle={(id) => commit({ segments: update(data.segments, id, { on: !segOf(id)!.on }) })}
            onEdit={(on) => { setEditing(on); setAdding(null); setRangeStart(null); setSelectedSegs([]); }}
            onSelectSeg={(id) => setSelectedSegs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
            onSegName={(id, name) => { setData({ ...data, segments: update(data.segments, id, { name }) }); setDirty(true); }}
            onSegKind={(id) => commit({ segments: update(data.segments, id, { kind: nextKind(segOf(id)!.kind) }) })}
            onSegDelete={(id) => { commit({ segments: remove(data.segments, data.segments.findIndex((s) => s.id === id)) }); setSelectedSegs([]); }}
            onMerge={() => {
              const idx = data.segments.map((s, i) => (selectedSegs.includes(s.id) ? i : -1)).filter((i) => i >= 0);
              commit({ segments: mergeRange(data.segments, Math.min(...idx), Math.max(...idx)) });
              setSelectedSegs([]);
            }}
            onAdd={() => {
              if (adding) { setAdding(null); setRangeStart(null); }
              else { setAdding("start"); setSelected(null); setSelectedSegs([]); }
            }}
            onUndo={undo}
            onReset={() => { commit({ segments: suggestion, excluded: clean(data.points) }); setSelectedSegs([]); }}
            onShowExcluded={() => setShowExcluded(!showExcluded)}
            onDeleteLink={deleteLink}
            onStartOver={startOver}
            onShare={() => (link && !dirty ? copyLinks(link.id, link.token) : share())}
            onAddPhotos={() => requestPhotos(null)}
          />
        )}
        {data && derived && <MapModeControl mode={colorMode} scale={colorScale} onChange={setColorMode} />}
      </div>

      {data && derived && (
        <div className="stats-stack">
          <StatsBar
            stats={derived.stats}
            open={statsOpen}
            onToggle={() => setStatsOpen(!statsOpen)}
            focusLabel={focusLabel}
            onClearFocus={() => setFocus(null)}
            onFocusAsSegment={isOwner && focus ? () => finishRange(focus[0], focus[1]) : null}
          >
            <Profile
              points={data.points}
              excluded={data.excluded}
              segments={data.segments}
              hover={hover}
              highlight={highlight}
              onHover={setHover}
              onPick={pick}
              onRange={(a, b) => (adding ? finishRange(a, b) : setFocus([a, b]))}
            />
          </StatsBar>
        </div>
      )}

      {(toast || busy) && (
        <div className={`toast${busy ? " busy" : ""}`} role="status" aria-live="polite">
          <span>{busy ?? toast?.text}</span>
          {!busy && toast?.action && <button className="link" onClick={toast.action.run}>{toast.action.label}</button>}
          {!busy && toast && <button className="link" onClick={() => setToast(null)}>Schließen</button>}
        </div>
      )}

      {viewer != null && derived && data && (
        <PhotoViewer
          photos={derived.visiblePhotos}
          index={viewer}
          pointOf={(p) => { const k = derived.posOfI.get(p.i); return k != null ? data.points[k] : null; }}
          canDelete={isOwner}
          onIndex={setViewer}
          onDelete={deletePhoto}
          onClose={() => setViewer(null)}
        />
      )}

      <input
        ref={photoInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) addPhotos(files, photoTarget.current);
        }}
      />
    </main>
  );
}
