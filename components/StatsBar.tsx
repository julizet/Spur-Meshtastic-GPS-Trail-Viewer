"use client";

import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { fmtDuration, fmtInt, fmtKm, fmtDec } from "@/lib/geo";
import type { Stats } from "@/lib/types";

type Props = {
  stats: Stats;
  open: boolean;
  onToggle: () => void;
  focusLabel: string | null;
  onClearFocus: () => void;
  onFocusAsSegment: (() => void) | null;
  children: ReactNode;
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export default function StatsBar({ stats: s, open, onToggle, focusLabel, onClearFocus, onFocusAsSegment, children }: Props) {
  return (
    <section className="float stats" aria-label="Auswertung">
      {focusLabel && (
        <div className="focus-note">
          <span>{focusLabel}</span>
          {onFocusAsSegment && <button className="link" style={{ color: "inherit" }} onClick={onFocusAsSegment}>Als Abschnitt anlegen</button>}
          <button className="link" style={{ color: "inherit" }} onClick={onClearFocus}>Auswahl aufheben</button>
        </div>
      )}
      <div className="stats-main">
        <Stat value={fmtDuration(s.duration)} label="Dauer" />
        <Stat value={fmtKm(s.distance)} label="Distanz" />
        <Stat value={`${fmtInt(s.ascent)} m`} label="Aufstieg" />
        <Stat value={`${fmtInt(s.descent)} m`} label="Abstieg" />
        <button className="link push surface-toggle" onClick={onToggle} aria-expanded={open}>
          {open ? "Weniger" : "Mehr"}
          <FontAwesomeIcon className="toggle-icon" icon={open ? faChevronDown : faChevronUp } />
        </button>
      </div>
      {open && (
        <div className="stats-more">
          <Stat value={fmtDuration(s.moving)} label="In Bewegung" />
          <Stat value={`${fmtDec(s.speed)} km/h`} label="Tempo" />
          <Stat value={s.maxAlt != null ? `${fmtInt(s.maxAlt)} m` : "–"} label="Höchster Punkt" />
          <Stat value={s.climbRate != null ? `${fmtInt(s.climbRate)} Hm/h` : "–"} label="Steigleistung" />
        </div>
      )}
      {children}
    </section>
  );
}
