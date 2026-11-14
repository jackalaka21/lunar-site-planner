import type { Topo } from "./types";
import { clamp, toDeg, toRad } from "./vec";

/** Visible fraction of a disc (centre elevation el, radius r) over a flat horizon H. All degrees. */
export function discFraction(el: number, H: number, r: number): number {
  const d = (el - H) / r;
  if (d >= 1) return 1;
  if (d <= -1) return 0;
  return 1 - (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI;
}

/** Fraction of disc 1 (radius rS) covered by disc 2 (radius rE) at separation d; same angular unit. */
export function eclipseFraction(d: number, rS: number, rE: number): number {
  if (d >= rS + rE) return 0;
  if (d <= Math.abs(rE - rS)) return rE >= rS ? 1 : (rE * rE) / (rS * rS);
  const a = (d * d + rS * rS - rE * rE) / (2 * d * rS);
  const b = (d * d + rE * rE - rS * rS) / (2 * d * rE);
  const tri = Math.sqrt(
    Math.max(0, (-d + rS + rE) * (d + rS - rE) * (d - rS + rE) * (d + rS + rE)),
  );
  const lens =
    rS * rS * Math.acos(clamp(a, -1, 1)) + rE * rE * Math.acos(clamp(b, -1, 1)) - 0.5 * tri;
  return Math.min(1, Math.max(0, lens / (Math.PI * rS * rS)));
}

function unitFromAzEl(t: Topo): [number, number, number] {
  const az = toRad(t.az);
  const el = toRad(t.el);
  const c = Math.cos(el);
  return [c * Math.sin(az), c * Math.cos(az), Math.sin(el)];
}

/** Angular separation (deg) of two bodies seen from the site, from their az/el. */
export function sunEarthSeparation(sun: Topo, earth: Topo): number {
  const a = unitFromAzEl(sun);
  const b = unitFromAzEl(earth);
  return toDeg(Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)));
}

/** Blocked fraction of the Sun's disc by Earth's disc (spec 7.8). */
export function sunBlockedByEarth(sun: Topo, earth: Topo): number {
  return eclipseFraction(sunEarthSeparation(sun, earth), sun.r, earth.r);
}

/** Earth phase seen from the site: illuminated fraction and bright-limb direction (deg clockwise from up). */
export function earthPhase(
  sun: Topo,
  earth: Topo,
): { illuminatedFraction: number; brightLimbDeg: number } {
  const e = toRad(sunEarthSeparation(sun, earth));
  const illuminatedFraction = (1 - Math.cos(e)) / 2;
  let daz = sun.az - earth.az;
  if (daz > 180) daz -= 360;
  if (daz <= -180) daz += 360;
  const dx = daz * Math.cos(toRad(earth.el));
  const dy = sun.el - earth.el;
  let limb = toDeg(Math.atan2(dx, dy));
  if (limb < 0) limb += 360;
  return { illuminatedFraction, brightLimbDeg: limb };
}
