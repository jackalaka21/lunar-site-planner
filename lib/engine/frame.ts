import { OBS_HEIGHT_M, R_MOON_KM } from "./constants";
import type { SiteFrame, Vec3 } from "./types";
import { cross, norm, scale, toRad } from "./vec";

const POLE_TOL_DEG = 1e-12;

/**
 * Site vector (km) and up/east/north unit vectors in MOON_ME. At exactly +-90 deg latitude
 * the frame is the limit along lon = 0: e = +y; n = +x at the south pole (-x at the north).
 */
export function siteFrame(
  lat: number,
  lon: number,
  hDemM: number,
  obsHeightM: number = OBS_HEIGHT_M,
): SiteFrame {
  const phi = toRad(lat);
  const lam = toRad(lon);
  const radius = R_MOON_KM + (hDemM + obsHeightM) / 1000;
  const cphi = Math.cos(phi);
  let p: Vec3 = [
    radius * (cphi * Math.cos(lam)),
    radius * (cphi * Math.sin(lam)),
    radius * Math.sin(phi),
  ];
  let u: Vec3 = scale(p, 1 / norm(p));
  if (Math.abs(Math.abs(lat) - 90) <= POLE_TOL_DEG) {
    u = [0, 0, lat < 0 ? -1 : 1];
    p = scale(u, radius);
    const e: Vec3 = [0, 1, 0];
    return { p, u, e, n: cross(u, e) };
  }
  const e0 = cross([0, 0, 1], u);
  const e = scale(e0, 1 / norm(e0));
  return { p, u, e, n: cross(u, e) };
}
