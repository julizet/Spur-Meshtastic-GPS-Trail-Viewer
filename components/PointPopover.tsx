"use client";

import { REASON_TEXT } from "@/lib/clean";
import { fmtClock, fmtInt } from "@/lib/geo";
import type { ExcludeReason, Photo, Point } from "@/lib/types";

type Props = {
  point: Point;
  reason: ExcludeReason | undefined;
  photos: { photo: Photo; index: number }[];
  canAddPhoto: boolean;
  canSplit: boolean;
  canExclude: boolean;
  onPhoto: (index: number) => void;
  onAddPhoto: () => void;
  onSplit: () => void;
  onToggleExclude: () => void;
  onClose: () => void;
};

export default function PointPopover(p: Props) {
  const { point } = p;
  return (
    <>
      <div className="pop-time">{fmtClock(point.t)}</div>
      <div className="pop-facts">
        {point.alt != null && <span>{fmtInt(point.alt)} m</span>}
        {point.speed != null && <span>{fmtInt(point.speed)} km/h</span>}
        {point.sats != null && <span>{point.sats} Satelliten</span>}
      </div>
      {p.reason && <div className="pop-reason">{REASON_TEXT[p.reason]}</div>}
      {p.photos.length > 0 && (
        <div className="thumbs">
          {p.photos.map(({ photo, index }) => (
            <button key={photo.id} onClick={() => p.onPhoto(index)} aria-label="Foto ansehen">
              <img src={photo.src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <div className="pop-actions">
        {p.canAddPhoto && <button className="link" onClick={p.onAddPhoto}>Foto hinzufügen</button>}
        {p.canSplit && <button className="link" onClick={p.onSplit}>Hier teilen</button>}
        {p.canExclude && (
          <button className="link" onClick={p.onToggleExclude}>{p.reason ? "Wieder aufnehmen" : "Punkt verwerfen"}</button>
        )}
        <button className="link" onClick={p.onClose} style={{ marginLeft: "auto" }}>Schließen</button>
      </div>
    </>
  );
}
