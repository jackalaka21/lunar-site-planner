import { landingCheck, metrics, type Verdict } from "./metrics";
import { sample, type TimeSeries } from "./sample";
import type { Settings } from "./settings";
import type { EphemerisSource, SiteContext } from "./types";

export interface DaySummary {
  t0Ms: number;
  bothH: number;
  verdict: Verdict;
  sunlitPct: number;
  earthPct: number;
}

const H_MS = 3_600_000;
/** Sampling step (same as evaluate, so scanned verdicts agree with the detail view). */
export const SCAN_STEP_MIN = 10;

/**
 * Sample the whole span once and evaluate each candidate landing as a window over it, instead of
 * resampling the 14-day overlap per candidate. Candidates before ephemeris coverage start are dropped, and
 * ones after coverage end are dropped (clipped); windows crossing coverage end are shortened like sample().
 */
function scanWindows(
  ctx: SiteContext,
  eph: EphemerisSource,
  fromMs: number,
  candidates: number,
  stepH: number,
  s: Settings,
  accept: (d: DaySummary) => boolean,
  limit: number,
): DaySummary[] {
  const [covStart, covEnd] = eph.coverage();
  const stride = Math.max(1, Math.round((stepH * 60) / SCAN_STEP_MIN));
  const winN = Math.round((s.durationDays * 24 * 60) / SCAN_STEP_MIN) + 1;
  let first = 0;
  if (fromMs < covStart) first = Math.ceil((covStart - fromMs) / (stepH * H_MS));
  const startMs = fromMs + first * stepH * H_MS;
  if (first >= candidates || startMs > covEnd) return [];
  const lastT0 = Math.min(fromMs + (candidates - 1) * stepH * H_MS, covEnd);
  const spanH = (lastT0 - startMs) / H_MS + s.durationDays * 24;
  const all = sample(ctx, eph, startMs, spanH, SCAN_STEP_MIN, s);

  const out: DaySummary[] = [];
  for (let k = first; k < candidates && out.length < limit; k++) {
    const t0Ms = fromMs + k * stepH * H_MS;
    if (t0Ms > covEnd) break;
    const i0 = (k - first) * stride;
    const n = Math.min(winN, all.n - i0);
    if (n < 1) break;
    const w: TimeSeries = {
      ...all,
      t0Ms,
      n,
      sunAz: all.sunAz.subarray(i0, i0 + n),
      sunEl: all.sunEl.subarray(i0, i0 + n),
      sunFrac: all.sunFrac.subarray(i0, i0 + n),
      eclipseFrac: all.eclipseFrac.subarray(i0, i0 + n),
      earthAz: all.earthAz.subarray(i0, i0 + n),
      earthEl: all.earthEl.subarray(i0, i0 + n),
      earthIn: all.earthIn.subarray(i0, i0 + n),
      interference: all.interference.subarray(i0, i0 + n),
      power: all.power.subarray(i0, i0 + n),
      lit: all.lit.subarray(i0, i0 + n),
      both: all.both.subarray(i0, i0 + n),
      dsnBits: all.dsnBits.subarray(i0, i0 + n),
    };
    const m = metrics(w, landingCheck(ctx, eph, t0Ms, s), s);
    const d: DaySummary = {
      t0Ms,
      bothH: m.bothH,
      verdict: m.verdict,
      sunlitPct: m.sunlitPct,
      earthPct: m.earthPct,
    };
    if (accept(d)) out.push(d);
  }
  return out;
}

/**
 * One summary per candidate landing time fromMs + k * stepH for k = 0 .. ceil(days*24/stepH) - 1.
 * Candidates outside ephemeris coverage are dropped (clipped); the caller must have loaded the data.
 */
export function scanDates(
  ctx: SiteContext,
  eph: EphemerisSource,
  fromMs: number,
  days: number,
  stepH: number,
  s: Settings,
): DaySummary[] {
  return scanWindows(ctx, eph, fromMs, Math.ceil((days * 24) / stepH), stepH, s, () => true, Infinity);
}

/** Up to `count` earliest landing times (ascending) with a good verdict, scanning at stepH for up to maxDays. */
export function nextGoodDates(
  ctx: SiteContext,
  eph: EphemerisSource,
  fromMs: number,
  s: Settings,
  count = 3,
  stepH = 6,
  maxDays = 365,
): DaySummary[] {
  return scanWindows(
    ctx,
    eph,
    fromMs,
    Math.ceil((maxDays * 24) / stepH),
    stepH,
    s,
    (d) => d.verdict === "good",
    count,
  );
}
