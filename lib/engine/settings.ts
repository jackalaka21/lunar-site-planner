/**
 * Shared scenario settings. Lives in lib/engine so it stays pure (no React, DOM or fetch).
 * Defaults and ranges are the Global Constraints table (spec 7.5, 17).
 */
export interface Settings {
  litThreshold: "any" | "half" | "full";
  earthMarginDeg: number;
  durationDays: number;
  batteryH: number;
  flickerMergeMin: number;
  interferenceDeg: number;
  dsnEnabled: boolean;
  dsnMaskDeg: number;
  horizonUncertDeg: number;
  ellipseKm: number;
  mastM: 2 | 10 | 50;
  panel: { mode: "tracking" } | { mode: "fixed"; azDeg: number };
  axis: "met" | "cal";
  displayTz: string;
}

export const DEFAULT_SETTINGS: Settings = {
  litThreshold: "half",
  earthMarginDeg: 0,
  durationDays: 14,
  batteryH: 24,
  flickerMergeMin: 30,
  interferenceDeg: 2,
  dsnEnabled: false,
  dsnMaskDeg: 10,
  horizonUncertDeg: 0.3,
  ellipseKm: 2,
  mastM: 2,
  panel: { mode: "tracking" },
  axis: "met",
  displayTz: "UTC",
};

export interface NumericRange {
  min: number;
  max: number;
}

/** Inclusive ranges for the numeric settings the table bounds. */
export const SETTINGS_RANGES = {
  earthMarginDeg: { min: 0, max: 5 },
  durationDays: { min: 1, max: 30 },
  batteryH: { min: 0, max: 200 },
  flickerMergeMin: { min: 0, max: 120 },
  interferenceDeg: { min: 0, max: 10 },
  // The Global Constraints table gives no bounds for these; chosen as physically sensible
  // limits so hand-edited share links cannot request nonsense (Task 14).
  dsnMaskDeg: { min: 0, max: 90 },
  horizonUncertDeg: { min: 0, max: 5 },
  ellipseKm: { min: 0, max: 50 },
} as const satisfies Partial<Record<keyof Settings, NumericRange>>;
