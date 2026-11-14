import type { DaySummary } from "../../lib/engine";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Ramp bin edges as a percentage of the mission window (50 is the Good threshold, 20 the Poor one). */
export const RAMP_EDGES_PCT = [20, 35, 50, 75] as const;
export const RAMP_STEPS = RAMP_EDGES_PCT.length + 1;

/** Luminance step 0 (deepest surface) to 4 (primary ink) for the hours of Sun and Earth together. */
export function rampStep(bothH: number, windowH: number): number {
  const pct = windowH > 0 ? (bothH / windowH) * 100 : 0;
  let step = 0;
  for (const edge of RAMP_EDGES_PCT) if (pct >= edge) step++;
  return step;
}

/** Legend labels in hours: "under 67", "67 to 117", ..., "252+". */
export function rampLegend(windowH: number): string[] {
  const edges = RAMP_EDGES_PCT.map((p) => Math.round((windowH * p) / 100));
  return Array.from({ length: RAMP_STEPS }, (_, i) => {
    if (i === 0) return `under ${edges[0]}`;
    if (i === RAMP_STEPS - 1) return `${edges[i - 1]}+`;
    return `${edges[i - 1]} to ${edges[i] - 1}`;
  });
}

/** 00:00 UTC on the 1st of the month containing `ms`. */
export function firstOfMonthMs(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** The picked day at 00:00 UTC plus the time of day of the current landing. */
export function keepTimeOfDay(dayMs: number, currentT0Ms: number): number {
  const day = Math.floor(dayMs / DAY_MS) * DAY_MS;
  return day + (((currentT0Ms % DAY_MS) + DAY_MS) % DAY_MS);
}

/**
 * Reduce 6 h Good hits (ascending) to distinct windows: at least 24 h apart. A run that is already
 * under way at `fromMs` (the current landing is itself Good) is skipped, since it is not a next date.
 */
export function distinctWindows<T extends { t0Ms: number }>(
  hits: T[],
  fromMs: number,
  count: number,
  stepMs = 6 * HOUR_MS,
  minGapMs = DAY_MS,
): T[] {
  const out: T[] = [];
  let skipping = hits.length > 0 && hits[0].t0Ms - fromMs < stepMs;
  let prev: number | null = null;
  for (const h of hits) {
    if (skipping && prev !== null && h.t0Ms - prev > stepMs) skipping = false;
    prev = h.t0Ms;
    if (skipping) continue;
    const last = out[out.length - 1];
    if (!last || h.t0Ms - last.t0Ms >= minGapMs) out.push(h);
    if (out.length >= count) break;
  }
  return out;
}

/** The `n` best days (Poor ones never listed) by hours of Sun and Earth together, at least `minSepDays` apart, best first. */
export function bestDays(days: DaySummary[], n: number, minSepDays = 3): DaySummary[] {
  const ranked = [...days].filter((d) => d.bothH > 0 && d.verdict !== "poor").sort((a, b) => b.bothH - a.bothH || a.t0Ms - b.t0Ms);
  const out: DaySummary[] = [];
  for (const d of ranked) {
    if (out.every((o) => Math.abs(o.t0Ms - d.t0Ms) >= minSepDays * DAY_MS)) out.push(d);
    if (out.length >= n) break;
  }
  return out;
}

export const CAL_DAYS = 365;
export const VERDICT_LABEL = { good: "Good", marginal: "Marginal", poor: "Poor" } as const;
