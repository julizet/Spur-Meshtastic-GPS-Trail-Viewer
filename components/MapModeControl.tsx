"use client";

import { COLOR_LABEL, LEGEND } from "@/lib/colors";
import type { ColorMode } from "@/lib/types";

const MODES: ColorMode[] = ["strecke", "hoehe", "steil", "gps", "pace"];

type Props = {
  mode: ColorMode;
  onChange: (mode: ColorMode) => void;
};

export default function MapModeControl({ mode, onChange }: Props) {
  const legend = LEGEND[mode];

  return (
    <div className="map-modes">
      <div className="mode-switch" role="group" aria-label="Kartendarstellung">
        {MODES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => onChange(value)}
          >
            {COLOR_LABEL[value]}
          </button>
        ))}
      </div>
      {legend && (
        <div className="mode-legend" aria-label={`Legende ${COLOR_LABEL[mode]}`}>
          <span>{legend.min}</span>
          <i style={{ background: `linear-gradient(90deg, ${legend.colors.join(", ")})` }} />
          <span>{legend.max}</span>
        </div>
      )}
    </div>
  );
}
