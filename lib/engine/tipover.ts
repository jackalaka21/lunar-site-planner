import { mergeFlickers, powerFactor, type TimeSeries } from "./sample";
import type { Settings } from "./settings";
import { toRad } from "./vec";

export interface TipOverResult {
  tiltDeg: number;
  nominalPower: number;
  worstPower: number;
  worstPowerAzDeg: number;
  nominalBothH: number;
  worstBothH: number;
  worstBothAzDeg: number;
}

/**
 * Evaluates lander tip-over resilience by sweeping tilt azimuth 0..345 deg in 15 deg steps
 * at `tiltDeg` (default 10 deg) and computing the worst-case mean power proxy and
 * simultaneous Sun + Earth hours across all tilt directions.
 */
export function tipOverResilience(
  series: TimeSeries,
  settings: Settings,
  tiltDeg = 10,
): TipOverResult {
  const { n, stepMs } = series;
  const hrs = stepMs / 3_600_000;
  const clampedTilt = Math.max(0, tiltDeg);

  const nomLit = mergeFlickers(series.lit, stepMs, settings.flickerMergeMin).merged;
  const nomEarth = mergeFlickers(series.earthIn, stepMs, settings.flickerMergeMin).merged;

  let nomPowerSum = 0;
  let nomBothCount = 0;
  for (let i = 0; i < n; i++) {
    nomPowerSum += series.power[i];
    nomBothCount += nomLit[i] & nomEarth[i];
  }
  const nominalPower = n > 0 ? nomPowerSum / n : 0;
  const nominalBothH = nomBothCount * hrs;

  if (clampedTilt === 0 || n === 0) {
    return {
      tiltDeg: 0,
      nominalPower,
      worstPower: nominalPower,
      worstPowerAzDeg: 0,
      nominalBothH,
      worstBothH: nominalBothH,
      worstBothAzDeg: 0,
    };
  }

  let worstPower = nominalPower;
  let worstPowerAzDeg = 0;
  let worstBothH = nominalBothH;
  let worstBothAzDeg = 0;

  const tiltedLitRaw = new Uint8Array(n);
  const tiltedEarthRaw = new Uint8Array(n);

  for (let azDeg = 0; azDeg < 360; azDeg += 15) {
    let pSum = 0;
    for (let i = 0; i < n; i++) {
      const sunDiffRad = toRad(series.sunAz[i] - azDeg);
      const sunAway = Math.max(0, -Math.cos(sunDiffRad));
      const sunTiltPenaltyDeg = clampedTilt * sunAway;
      const effSunEl = series.sunEl[i] - sunTiltPenaltyDeg;

      // Tilting the mast by clampedTilt introduces a cosine projection loss on the panel normal
      // and deck self-shadowing when the Sun drops below the tilted deck plane.
      const tiltProj = Math.max(0, Math.cos(toRad(clampedTilt * Math.cos(sunDiffRad))));
      const deckFactor = effSunEl < 0 ? Math.max(0, Math.cos(toRad(clampedTilt))) * 0.5 : 1;
      const baseP = series.sunFrac[i] * powerFactor(series.sunAz[i], series.sunEl[i], settings.panel);
      pSum += baseP * tiltProj * deckFactor;

      tiltedLitRaw[i] = series.lit[i] && effSunEl >= 0 ? 1 : 0;

      const earthDiffRad = toRad(series.earthAz[i] - azDeg);
      const earthAway = Math.max(0, -Math.cos(earthDiffRad));
      const earthPenaltyDeg = clampedTilt * earthAway;
      const effEarthEl = series.earthEl[i] - earthPenaltyDeg;
      tiltedEarthRaw[i] =
        series.earthIn[i] && effEarthEl >= settings.earthMarginDeg ? 1 : 0;
    }

    const meanP = Math.min(nominalPower, pSum / n);
    if (meanP < worstPower) {
      worstPower = meanP;
      worstPowerAzDeg = azDeg;
    }

    const mLit = mergeFlickers(tiltedLitRaw, stepMs, settings.flickerMergeMin).merged;
    const mEarth = mergeFlickers(tiltedEarthRaw, stepMs, settings.flickerMergeMin).merged;
    let bothCount = 0;
    for (let i = 0; i < n; i++) bothCount += mLit[i] & mEarth[i];
    const bothH = Math.min(nominalBothH, bothCount * hrs);
    if (bothH < worstBothH) {
      worstBothH = bothH;
      worstBothAzDeg = azDeg;
    }
  }

  return {
    tiltDeg: clampedTilt,
    nominalPower,
    worstPower,
    worstPowerAzDeg,
    nominalBothH,
    worstBothH,
    worstBothAzDeg,
  };
}
