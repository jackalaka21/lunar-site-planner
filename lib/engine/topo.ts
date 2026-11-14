import type { SiteFrame, Topo, Vec3 } from "./types";
import { clamp, dot, norm, sub, toDeg } from "./vec";

/** Topocentric az/el/angular radius/range of a Moon-centred body vector. az in [0,360). */
export function topocentric(body: Vec3, f: SiteFrame, bodyRadiusKm: number): Topo {
  const v = sub(body, f.p);
  const dist = norm(v);
  const el = toDeg(Math.asin(clamp(dot(v, f.u) / dist, -1, 1)));
  let az = toDeg(Math.atan2(dot(v, f.e), dot(v, f.n))) % 360;
  if (az < 0) az += 360;
  if (az >= 360) az = 0; // tiny negative angles round up to exactly 360
  const r = toDeg(Math.asin(bodyRadiusKm / dist));
  return { az, el, r, distKm: dist };
}

/** Subsolar latitude (deg) from a Moon-centred Sun vector. */
export function subsolarLatitude(sun: Vec3): number {
  return toDeg(Math.asin(clamp(sun[2] / norm(sun), -1, 1)));
}
