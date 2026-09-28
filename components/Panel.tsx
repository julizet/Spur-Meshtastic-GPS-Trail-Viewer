"use client";

import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { includedPositions } from "@/lib/clean";
import { fmtDate, fmtDuration, fmtKm } from "@/lib/geo";
import { KIND_LABEL } from "@/lib/segments";
import { rangeSummary } from "@/lib/stats";
import type { RouteData, Segment } from "@/lib/types";

type UploadProps = {
  state: "upload";
  error: string | null;
  onFile: (file: File) => void;
  onExample: () => void;
};

export type RouteProps = {
  state: "route";
  data: RouteData;
  role: "owner" | "viewer";
  open: boolean;
  onToggleOpen: () => void;
  editing: boolean;
  adding: "start" | "end" | null;
  selectedSegs: string[];
  modified: boolean;
  canUndo: boolean;
  excludedCount: number;
  showExcluded: boolean;
  shared: boolean;
  busy: boolean;
  shareLabel: string;
  canAddPhotos: boolean;
  onRename: (name: string) => void;
  onToggle: (id: string) => void;
  onEdit: (on: boolean) => void;
  onSelectSeg: (id: string) => void;
  onSegName: (id: string, name: string) => void;
  onSegKind: (id: string) => void;
  onSegDelete: (id: string) => void;
  onMerge: () => void;
  onAdd: () => void;
  onUndo: () => void;
  onReset: () => void;
  onShowExcluded: () => void;
  onDeleteLink: () => void;
  onStartOver: () => void;
  onShare: () => void;
  onAddPhotos: () => void;
};

export default function Panel(props: UploadProps | RouteProps) {
  return (
    <section
      className={`float panel${props.state === "route" && !props.open ? " collapsed" : ""}`}
      aria-label="Route"
    >
      {props.state === "upload" ? <Upload {...props} /> : <Route {...props} />}
    </section>
  );
}

function Upload({ error, onFile, onExample }: UploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <div className="panel-head">
        <h1 className="title">Neue Route</h1>
        <div className="sub">Meshtastic-Export laden</div>
      </div>
      <div className="panel-body">
        <label
          className={`drop${over ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
        >
          <strong className="pointer-only">Datei hierher ziehen</strong>
          <span className="small muted pointer-only">oder auswählen</span>
          <strong className="touch-only">Datei auswählen</strong>
          <input
            ref={input}
            type="file"
            accept=".txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <p className="hint">Tab-getrennt, .txt oder .csv. Die Datei wird nur in deinem Browser verarbeitet.</p>
      </div>
      <div className="panel-foot">
        <button className="link" onClick={onExample}>Beispielroute ansehen</button>
      </div>
    </>
  );
}

function Route(p: RouteProps) {
  const { data } = p;
  const firstT = data.points.find((pt) => pt.t && pt.t > Date.UTC(2000, 0, 1))?.t ?? null;
  const isOwner = p.role === "owner";
  const count = new Set(
    data.segments.filter((s) => s.on).flatMap((s) => includedPositions(data.points, data.excluded, s.a, s.b)),
  ).size;

  return (
    <>
      <div className="panel-head">
        {isOwner ? (
          <input
            className="title"
            value={data.name}
            maxLength={80}
            aria-label="Name der Route"
            onChange={(e) => p.onRename(e.target.value)}
          />
        ) : (
          <h1 className="title">{data.name}</h1>
        )}
        <div className="panel-meta">
          {!data.name.includes(fmtDate(firstT)) && <span>{fmtDate(firstT)}</span>}
          <div className="panel-meta-actions">
            <span className="num">{count} Wegpunkte</span>
            {isOwner && p.excludedCount > 0 && (
              <button className="link" aria-pressed={p.showExcluded} onClick={p.onShowExcluded}>
                {p.excludedCount} verworfen
              </button>
            )}
            {isOwner && p.shared && <button className="link danger" onClick={p.onDeleteLink}>Link löschen</button>}
            {isOwner && p.open && !p.editing && (
              <button className="link" onClick={() => p.onEdit(true)} style={{ color: "var(--ink)" }}>Bearbeiten</button>
            )}
          </div>
        </div>
      </div>

      {p.open && (
        <div className="panel-body">
          {p.editing && (
            p.adding ? (
              <p className="notice">
                {p.adding === "start" ? "Wähle den Startpunkt auf der Karte oder im Profil." : "Wähle jetzt den Endpunkt."}{" "}
                <button className="link" onClick={p.onAdd}>Abbrechen</button>
              </p>
            ) : (
              <p className="small" style={{ margin: "0 0 6px" }}>
                <button className="link" onClick={p.onAdd}>Abschnitt hinzufügen</button>
              </p>
            )
          )}
          {p.editing && !p.adding && p.selectedSegs.length > 1 && (
            <p className="notice">
              {p.selectedSegs.length} Etappen ausgewählt.{" "}
              <button className="link" onClick={p.onMerge}>Zusammenführen</button>
            </p>
          )}
          <ul className="segs">
            {data.segments.map((s, k) => (
              <SegmentRow key={s.id} seg={s} index={k} {...p} />
            ))}
          </ul>
        </div>
      )}

      <div className="panel-foot">
        {p.editing ? (
          <>
            {p.canUndo && <button className="link" onClick={p.onUndo}>Rückgängig</button>}
            {p.modified && <button className="link" onClick={p.onReset}>Vorschlag zurücksetzen</button>}
            <button className="link push" onClick={() => p.onEdit(false)} style={{ color: "var(--ink)" }}>Fertig</button>
          </>
        ) : (
          <>
            {isOwner ? (
              <>
                <button className="link" onClick={p.onStartOver}>Neu</button>
                <button className="link project-primary" disabled={p.busy} onClick={p.onShare}>{p.shareLabel}</button>
              </>
            ) : p.canAddPhotos ? (
              <button className="link project-primary" disabled={p.busy} onClick={p.onAddPhotos}>Fotos hinzufügen</button>
            ) : null}
            <button className="link push surface-toggle" onClick={p.onToggleOpen} aria-expanded={p.open}>
              {p.open ? "Weniger" : "Mehr"}
              <FontAwesomeIcon className="toggle-icon" icon={p.open ? faChevronUp : faChevronDown} />
            </button>
          </>
        )}
      </div>
    </>
  );
}

function SegmentRow({ seg, index, ...p }: { seg: Segment; index: number } & RouteProps) {
  const sum = rangeSummary(p.data.points, p.data.excluded, seg.a, seg.b);
  const isOwner = p.role === "owner";
  const selected = p.editing && p.selectedSegs.includes(seg.id);
  const single = p.editing && p.selectedSegs.length === 1 && p.selectedSegs[0] === seg.id;
  const cls = ["seg", seg.on ? "" : "off", p.editing ? "pick" : "", selected ? "current" : "", seg.kind === "fahrt" && !/fahrt/i.test(seg.name) ? "fahrt" : ""]
    .filter(Boolean).join(" ");

  return (
    <li className={cls}>
      <div
        className="seg-row"
        onClick={p.editing ? () => p.onSelectSeg(seg.id) : undefined}
      >
        {isOwner && !p.editing && (
          <input type="checkbox" checked={seg.on} onChange={() => p.onToggle(seg.id)} aria-label={`${seg.name} anzeigen`} />
        )}
        {single ? (
          <input
            className="seg-name-input"
            value={seg.name}
            maxLength={60}
            autoFocus
            aria-label="Name des Abschnitts"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => p.onSegName(seg.id, e.target.value)}
          />
        ) : (
          <span className="seg-name">{seg.name}</span>
        )}
        <span className="seg-meta">{fmtDuration(sum.duration)}</span>
        <span className="seg-meta" style={{ minWidth: 52, textAlign: "right" }}>{fmtKm(sum.distance)}</span>
      </div>
      {single && (
        <div className="seg-actions">
          <button className="link" onClick={() => p.onSegKind(seg.id)}>Typ: {KIND_LABEL[seg.kind]}</button>
          {p.data.segments.length > 1 && (
            <button
              className="link danger"
              title={index > 0 ? "Verbindet den Abschnitt mit dem vorherigen. Die Wegpunkte bleiben erhalten." : "Verbindet den Abschnitt mit dem nächsten. Die Wegpunkte bleiben erhalten."}
              onClick={() => p.onSegDelete(seg.id)}
            >
              Löschen
            </button>
          )}
        </div>
      )}
    </li>
  );
}
