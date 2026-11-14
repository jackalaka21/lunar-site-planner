import { STEP_MS } from "./constants";
import { fmtG, fmtHours, fmtPct } from "./format";
import { earthInAt, frameFor, litAt, mergeFlickers, type TimeSeries } from "./sample";
import type { Settings } from "./settings";
import type { EphemerisSource, SiteContext } from "./types";

export type Verdict = "good" | "marginal" | "poor";

export interface Metrics {
  verdict: Verdict;
  reason: string;
  bothH: number;
  bothPct: number;
  sunlitH: number;
  sunlitPct: number;
  earthH: number;
  earthPct: number;
  longestDarkH: number;
  longestDarkStartMs: number | null;
  longestCommsGapH: number;
  /** First lit-to-unlit transition after the first lit sample (merged states); null if none. */
  firstSunsetMs: number | null;
  meanPower: number;
  /** Merged flickers in the lit and Earth-in-view series combined. */
  flickersMerged: number;
  landing: { ok: boolean; reason: string | null };
}

export type Landing = Metrics["landing"];

/** Verdict thresholds (spec 7.6). */
export const GOOD_BOTH_PCT = 50;
export const POOR_BOTH_PCT = 20;

/** Seven raw samples [T0 - 1 h, T0] every 10 min. Samples before ephemeris coverage are skipped. */
export function landingCheck(ctx: SiteContext, eph: EphemerisSource, t0Ms: number, s: Settings): Landing {
  const frame = frameFor(ctx, s);
  const covStart = eph.coverage()[0];
  let litAll = true;
  let earthAll = true;
  for (let k = -6; k <= 0; k++) {
    const t = t0Ms + k * STEP_MS;
    if (t < covStart) continue;
    if (!litAt(ctx, frame, eph, t, s)) litAll = false;
    if (!earthInAt(ctx, frame, eph, t, s)) earthAll = false;
  }
  if (!litAll) return { ok: false, reason: "Landing in darkness" };
  if (!earthAll) return { ok: false, reason: "No DTE during descent" };
  return { ok: true, reason: null };
}

/** Longest run of `value` as (length, start index); first run wins ties; (0, 0) if none. */
function longestRun(state: Uint8Array, value: 0 | 1): [number, number] {
  let best = 0;
  let bestI = 0;
  let i = 0;
  const n = state.length;
  while (i < n) {
    if (state[i] !== value) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && state[j] === value) j++;
    if (j - i > best) {
      best = j - i;
      bestI = i;
    }
    i = j;
  }
  return [best, bestI];
}

export function metrics(series: TimeSeries, landing: Landing, s: Settings): Metrics {
  const { n, stepMs, t0Ms } = series;
  const { merged: lit, count: fLit } = mergeFlickers(series.lit, stepMs, s.flickerMergeMin);
  const { merged: earth, count: fEarth } = mergeFlickers(series.earthIn, stepMs, s.flickerMergeMin);
  const hrs = stepMs / 3_600_000;

  let litCount = 0;
  let earthCount = 0;
  let bothCount = 0;
  let firstSunsetIdx = -1;
  let seenLit = false;
  let powerSum = 0;
  for (let i = 0; i < n; i++) {
    litCount += lit[i];
    earthCount += earth[i];
    bothCount += lit[i] & earth[i];
    powerSum += series.power[i];
    if (lit[i]) seenLit = true;
    else if (seenLit && firstSunsetIdx < 0) firstSunsetIdx = i;
  }
  const [darkLen, darkI] = longestRun(lit, 0);
  const [gapLen] = longestRun(earth, 0);

  const pct = (k: number): number => (100 * k) / n;
  const bothPct = pct(bothCount);
  const darkH = darkLen * hrs;
  const battery = s.batteryH;
  const darkTxt = `${fmtHours(darkH)} darkness starting T+${Math.floor((darkI * hrs) / 24)} d`;

  let verdict: Verdict;
  let reason: string;
  if (earthCount === 0) {
    verdict = "poor";
    reason = "Earth never in view (relay needed)";
  } else if (!landing.ok) {
    verdict = "poor";
    reason = landing.reason ?? "Landing check failed";
  } else if (darkH > 2 * battery) {
    verdict = "poor";
    reason = darkTxt;
  } else if (bothPct < POOR_BOTH_PCT) {
    verdict = "poor";
    reason = `Only ${fmtPct(bothPct)} sun + Earth`;
  } else if (bothPct >= GOOD_BOTH_PCT && darkH <= battery) {
    verdict = "good";
    reason = `${fmtPct(bothPct)} lit with Earth in view, longest darkness ${fmtHours(darkH)}`;
  } else if (darkH > battery) {
    verdict = "marginal";
    reason = `${darkTxt}, over the ${fmtG(battery)} h battery reserve`;
  } else {
    verdict = "marginal";
    reason = `Lit with Earth in view ${fmtPct(bothPct)} of the window`;
  }

  return {
    verdict,
    reason,
    bothH: bothCount * hrs,
    bothPct,
    sunlitH: litCount * hrs,
    sunlitPct: pct(litCount),
    earthH: earthCount * hrs,
    earthPct: pct(earthCount),
    longestDarkH: darkH,
    longestDarkStartMs: darkLen ? t0Ms + darkI * stepMs : null,
    longestCommsGapH: gapLen * hrs,
    firstSunsetMs: firstSunsetIdx >= 0 ? t0Ms + firstSunsetIdx * stepMs : null,
    meanPower: powerSum / n,
    flickersMerged: fLit + fEarth,
    landing,
  };
}
