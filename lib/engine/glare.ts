import type { TimeSeries } from "./sample";

export interface ApproachGlareResult {
  ok: boolean;
  sunAzAtLanding: number;
  sunElAtLanding: number;
  angularDiffDeg: number;
  shadowFraction: number;
  warning: string | null;
}

/** Shortest unsigned angular difference in degrees between two azimuths in [0, 180]. */
export function azimuthDiffDeg(aDeg: number, bDeg: number): number {
  const d = Math.abs((((aDeg - bDeg) % 360) + 540) % 360 - 180);
  return d;
}

/**
 * Checks whether the descent approach heading (degrees clockwise from North, 0..360)
 * points into the low Sun at landing (T0, sample 0), risking optical navigation / hazard camera glare.
 */
export function approachGlareCheck(
  series: TimeSeries,
  headingDeg: number,
  glareLimitDeg = 20,
): ApproachGlareResult {
  if (series.n === 0) {
    return {
      ok: true,
      sunAzAtLanding: 0,
      sunElAtLanding: 0,
      angularDiffDeg: 180,
      shadowFraction: 0,
      warning: null,
    };
  }

  const sunAzAtLanding = series.sunAz[0];
  const sunElAtLanding = series.sunEl[0];
  const sunAtApproach = series.sunFrac[0] > 0 || sunElAtLanding > -5;
  const angularDiffDeg = azimuthDiffDeg(headingDeg, sunAzAtLanding);

  // Low-sun terrain shadow fraction proxy in [0, 1]: grazing sun (< 5 deg) casts long crater/boulder shadows.
  const shadowFraction = !sunAtApproach
    ? 1
    : Math.max(0, Math.min(1, (5 - Math.max(0, sunElAtLanding)) / 5));

  const glareRisk = sunAtApproach && sunElAtLanding <= 45 && angularDiffDeg <= glareLimitDeg;
  const warning = glareRisk
    ? `Sun within ${glareLimitDeg}° of approach heading — descent camera glare risk`
    : null;

  return {
    ok: !glareRisk,
    sunAzAtLanding,
    sunElAtLanding,
    angularDiffDeg,
    shadowFraction,
    warning,
  };
}
