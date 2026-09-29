"use client";

import { COLOR_LABEL, type ColorScale } from "@/lib/colors";
import type { ColorMode } from "@/lib/types";

const MODES: ColorMode[] = ["strecke", "hoehe", "steil", "gps", "pace"];

type Props = {
  mode: ColorMode;
  scale: ColorScale | null;
  onChange: (mode: ColorMode) => void;
};

export default function MapModeControl({ mode, scale, onChange }: Props) {

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
      {scale && (
        <div className="mode-legend" aria-label={`Legende ${COLOR_LABEL[mode]}`}>
          <span>{scale.minLabel}</span>
          <i style={{ background: `linear-gradient(90deg, ${scale.colors.join(", ")})` }} />
          <span>{scale.maxLabel}</span>
        </div>
      )}
    </div>
  );
}
