/**
 * Engine-computed facts for the landing page's Mons Mouton showcase.
 * Pure: takes an engine API, so scripts/landing-facts.ts and the unit test share one evaluation.
 */
import { DEFAULT_SETTINGS } from "../engine/settings";
import type { EngineApi } from "../../workers/engineHandlers";

export const MONS_MOUTON_ID = "artemis3-mons-mouton";
export const MONS_MOUTON_T0_MS = Date.UTC(2027, 0, 14, 6, 0);

export interface LandingFacts {
  bothH: number;
  sunlitPct: number;
  earthPct: number;
  firstSunsetH: number | null;
  earthsetH: number | null;
  sunElMin: number;
  sunElMax: number;
  earthElMin: number;
  earthElMax: number;
  earthAzMin: number;
  earthAzMax: number;
  hDemM: number;
}

function compass(az: number): string {
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return names[Math.round((((az % 360) + 360) % 360) / 45) % 8];
}
export { compass };

export async function computeLandingFacts(api: EngineApi): Promise<LandingFacts> {
  const r = await api.evaluate({
    ref: { kind: "catalog", id: MONS_MOUTON_ID },
    t0Ms: MONS_MOUTON_T0_MS,
    settings: DEFAULT_SETTINGS,
  });
  const s = r.series;
  let sunElMin = Infinity;
  let sunElMax = -Infinity;
  let eMin = Infinity;
  let eMax = -Infinity;
  let azMin = Infinity;
  let azMax = -Infinity;
  let earthsetIdx: number | null = null;
  for (let i = 0; i < s.n; i++) {
    const el = s.sunEl[i];
    if (Number.isFinite(el)) {
      sunElMin = Math.min(sunElMin, el);
      sunElMax = Math.max(sunElMax, el);
    }
    if (s.earthIn[i]) {
      eMin = Math.min(eMin, s.earthEl[i]);
      eMax = Math.max(eMax, s.earthEl[i]);
      azMin = Math.min(azMin, s.earthAz[i]);
      azMax = Math.max(azMax, s.earthAz[i]);
    } else if (earthsetIdx === null && i > 0 && s.earthIn[i - 1]) {
      earthsetIdx = i;
    }
  }
  const hrs = (ms: number | null) => (ms === null ? null : (ms - s.t0Ms) / 3_600_000);
  return {
    bothH: r.metrics.bothH,
    sunlitPct: r.metrics.sunlitPct,
    earthPct: r.metrics.earthPct,
    firstSunsetH: hrs(r.metrics.firstSunsetMs),
    earthsetH: earthsetIdx === null ? null : (earthsetIdx * s.stepMs) / 3_600_000,
    sunElMin,
    sunElMax,
    earthElMin: eMin,
    earthElMax: eMax,
    earthAzMin: azMin,
    earthAzMax: azMax,
    hDemM: r.ctx.hDemM,
  };
}

export interface ComparisonFacts {
  shackletonBothH: number;
  shackletonFirstSunsetH: number | null;
  slipBothH: number;
  slipSunlitH: number;
  slipFirstSunsetH: number | null;
}

export async function computeComparisonFacts(api: EngineApi): Promise<ComparisonFacts> {
  const rim = await api.evaluate({
    ref: { kind: "catalog", id: "shackleton-rim" },
    t0Ms: MONS_MOUTON_T0_MS,
    settings: DEFAULT_SETTINGS,
  });
  const slip = await api.evaluate({
    ref: { kind: "catalog", id: MONS_MOUTON_ID },
    t0Ms: MONS_MOUTON_T0_MS + 14 * 86_400_000,
    settings: DEFAULT_SETTINGS,
  });
  const sunset = rim.metrics.firstSunsetMs;
  return {
    shackletonBothH: rim.metrics.bothH,
    shackletonFirstSunsetH: sunset === null ? null : (sunset - rim.series.t0Ms) / 3_600_000,
    slipBothH: slip.metrics.bothH,
    slipSunlitH: slip.metrics.sunlitH,
    slipFirstSunsetH:
      slip.metrics.firstSunsetMs === null ? null : (slip.metrics.firstSunsetMs - slip.series.t0Ms) / 3_600_000,
  };
}
