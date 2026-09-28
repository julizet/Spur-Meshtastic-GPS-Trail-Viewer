"use client";

import { useEffect } from "react";
import { fmtClock, fmtInt } from "@/lib/geo";
import type { Photo, Point } from "@/lib/types";

type Props = {
  photos: Photo[];
  index: number;
  pointOf: (photo: Photo) => Point | null;
  canDelete: boolean;
  onIndex: (i: number) => void;
  onDelete: (photo: Photo) => void;
  onClose: () => void;
};

export default function PhotoViewer({ photos, index, pointOf, canDelete, onIndex, onDelete, onClose }: Props) {
  const photo = photos[index];
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && index < photos.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [index, photos.length, onIndex]);
  if (!photo) return null;
  const pt = pointOf(photo);

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label="Foto" onClick={onClose}>
      <img src={photo.src} alt="" onClick={(e) => e.stopPropagation()} />
      <div className="viewer-bar" onClick={(e) => e.stopPropagation()}>
        <span className="num">
          {fmtClock(photo.takenAt ?? pt?.t ?? null)}
          {pt?.alt != null && `, ${fmtInt(pt.alt)} m`}
        </span>
        <span className="num" style={{ opacity: 0.6 }}>{index + 1} von {photos.length}</span>
        <span className="push" />
        {index > 0 && <button className="link" onClick={() => onIndex(index - 1)}>Zurück</button>}
        {index < photos.length - 1 && <button className="link" onClick={() => onIndex(index + 1)}>Weiter</button>}
        {canDelete && <button className="link danger" onClick={() => onDelete(photo)}>Löschen</button>}
        <button className="link" onClick={onClose}>Schließen</button>
      </div>
    </div>
  );
}
