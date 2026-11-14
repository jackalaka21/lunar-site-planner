import { landingCheck, metrics } from "./metrics";
import { sample } from "./sample";
import type { Settings } from "./settings";
import type { EphemerisSource, SiteContext } from "./types";

export interface Range {
  min: number;
  max: number;
}
export type RobustnessResult = Record<"bothH" | "sunlitH" | "earthH" | "longestDarkH", Range> & {
  /** Number of evaluated variants: nominal, horizon +/- uncertainty, and each neighbour. */
  points: number;
};

const STEP_MIN = 10;

/**
 * Spread of the headline metrics under (a) the horizon shifted by +/- horizonUncertDeg and (b) every
 * neighbouring context (grid points within ellipseKm). The nominal case is always included, so
 * min <= nominal <= max. Neighbours may be empty, leaving only the horizon band.
 */
export function robustness(
  ctx: SiteContext,
  neighbours: SiteContext[],
  eph: EphemerisSource,
  t0Ms: number,
  s: Settings,
): RobustnessResult {
  const u = s.horizonUncertDeg;
  const variants: Array<[SiteContext, number]> = [[ctx, 0]];
  if (u !== 0) variants.push([ctx, u], [ctx, -u]);
  for (const nb of neighbours) variants.push([nb, 0]);

  const landing = landingCheck(ctx, eph, t0Ms, s);
  const keys = ["bothH", "sunlitH", "earthH", "longestDarkH"] as const;
  const range = (): Range => ({ min: Infinity, max: -Infinity });
  const out: RobustnessResult = {
    bothH: range(),
    sunlitH: range(),
    earthH: range(),
    longestDarkH: range(),
    points: variants.length,
  };
  for (const [c, off] of variants) {
    const series = sample(c, eph, t0Ms, s.durationDays * 24, STEP_MIN, s, undefined, off);
    const m = metrics(series, landing, s);
    for (const k of keys) {
      out[k].min = Math.min(out[k].min, m[k]);
      out[k].max = Math.max(out[k].max, m[k]);
    }
  }
  return out;
}

/** Both-hours at each neighbouring context (map overlay). Coarser step keeps a 20 km radius cheap. */
export function heatmapValues(
  nodes: SiteContext[],
  eph: EphemerisSource,
  t0Ms: number,
  s: Settings,
): Array<{ lat: number; lon: number; bothH: number }> {
  return nodes.map((c) => {
    const series = sample(c, eph, t0Ms, s.durationDays * 24, 20, s);
    const m = metrics(series, { ok: true, reason: null }, s);
    return { lat: c.lat, lon: c.lon, bothH: m.bothH };
  });
}
