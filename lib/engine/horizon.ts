import { R_MOON_KM } from "./constants";
import type { HorizonProfile } from "./types";
import { toDeg } from "./vec";

/** Linear interpolation of a horizon profile (value k at az = k*step) with wrap-around. */
export function horizonAt(h: HorizonProfile, az: number): number {
  const n = h.elevDeg.length;
  const wrapped = ((az % 360) + 360) % 360;
  const x = wrapped / h.stepDeg;
  const i = Math.floor(x);
  const f = x - i;
  const i0 = i % n;
  const i1 = (i + 1) % n;
  return h.elevDeg[i0] * (1 - f) + h.elevDeg[i1] * f;
}

/** Smooth-sphere horizon dip at observer height obsHeightM (m): constant -acos(R/(R+h)), 1 deg steps. */
export function sphereHorizon(obsHeightM: number): HorizonProfile {
  const dip = -toDeg(Math.acos(R_MOON_KM / (R_MOON_KM + obsHeightM / 1000)));
  return { stepDeg: 1, elevDeg: new Float32Array(360).fill(dip) };
}
