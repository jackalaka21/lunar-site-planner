import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SETTINGS_RANGES, type Settings } from "../../../lib/engine/settings";

describe("DEFAULT_SETTINGS", () => {
  it("matches the Global Constraints table", () => {
    const expected: Settings = {
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
    expect(DEFAULT_SETTINGS).toEqual(expected);
  });

  it("keeps every ranged default inside its range", () => {
    for (const [key, range] of Object.entries(SETTINGS_RANGES)) {
      const value = DEFAULT_SETTINGS[key as keyof typeof SETTINGS_RANGES];
      expect(value, key).toBeGreaterThanOrEqual(range.min);
      expect(value, key).toBeLessThanOrEqual(range.max);
    }
  });

  it("has well-formed ranges", () => {
    for (const range of Object.values(SETTINGS_RANGES)) {
      expect(range.min).toBeLessThan(range.max);
    }
  });
});
