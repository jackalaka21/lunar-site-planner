import type { LocalTerrainPatch } from "../../lib/data/terrain";
import { psToXY } from "../../lib/data/ps";

/** Lunar mean radius, km (matches lib/engine/constants R_MOON_KM; repeated here to keep this module dependency-free). */
const R_MOON_KM = 1737.4;
/** Slopes steeper than this (degrees, at the DEM baseline) are flagged as a hazard. */
export const HAZARD_SLOPE_DEG = 10;
/** Contour interval, metres. */
export const CONTOUR_INTERVAL_M = 250;
/** PSR shading is only drawn for patches south of this latitude (the PGDA polygons start at 80 deg S). */
export const PSR_MIN_ABS_LAT_DEG = 80;

export interface PsrRing {
  /** East/north offsets from the patch centre, km, flat [e0, n0, e1, n1, ...]. */
  pts: Float64Array;
  minE: number;
  maxE: number;
  minN: number;
  maxN: number;
}

/** GeoJSON-like polygon: rings of [lon, lat]. */
export interface PsrPolygon {
  coordinates: [number, number][][];
}

/** East and north offsets (km) of a south-polar point from the patch centre, on the polar stereographic plane. */
export function psToLocalKm(
  lat: number,
  lon: number,
  centerLat: number,
  centerLon: number,
): { east: number; north: number } {
  const c = psToXY(centerLat, centerLon);
  const p = psToXY(lat, lon);
  const lam = (centerLon * Math.PI) / 180;
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return {
    east: (dx * Math.cos(lam) - dy * Math.sin(lam)) / 1000,
    north: (dx * Math.sin(lam) + dy * Math.cos(lam)) / 1000,
  };
}

/** Bilinear height (m) at an east/north offset (km) from the patch centre; null outside the patch. */
export function sampleHeightM(patch: LocalTerrainPatch, eastKm: number, northKm: number): number | null {
  const gs = patch.gridSize;
  const r = patch.radiusKm;
  const gx = ((eastKm / r + 1) / 2) * (gs - 1);
  const gy = ((northKm / r + 1) / 2) * (gs - 1);
  if (!(gx >= 0 && gx <= gs - 1 && gy >= 0 && gy <= gs - 1)) return null;
  const x0 = Math.min(Math.floor(gx), gs - 2);
  const y0 = Math.min(Math.floor(gy), gs - 2);
  const fx = gx - x0;
  const fy = gy - y0;
  const h = patch.heightsM;
  const h00 = h[y0 * gs + x0];
  const h10 = h[y0 * gs + x0 + 1];
  const h01 = h[(y0 + 1) * gs + x0];
  const h11 = h[(y0 + 1) * gs + x0 + 1];
  return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
}

/** Slope in degrees at every vertex, by central differences at the patch's own sample spacing. */
export function slopeGridDeg(patch: LocalTerrainPatch): Float32Array {
  const gs = patch.gridSize;
  const h = patch.heightsM;
  const out = new Float32Array(gs * gs);
  const d = patch.spacingM;
  for (let iy = 0; iy < gs; iy++) {
    const y0 = Math.max(0, iy - 1);
    const y1 = Math.min(gs - 1, iy + 1);
    for (let ix = 0; ix < gs; ix++) {
      const x0 = Math.max(0, ix - 1);
      const x1 = Math.min(gs - 1, ix + 1);
      const dzdx = (h[iy * gs + x1] - h[iy * gs + x0]) / ((x1 - x0) * d);
      const dzdy = (h[y1 * gs + ix] - h[y0 * gs + ix]) / ((y1 - y0) * d);
      out[iy * gs + ix] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
    }
  }
  return out;
}

export interface Blocker {
  /** Horizontal distance from the lander along the azimuth, km. */
  distKm: number;
  /** Terrain height at that point, metres (same datum as the patch). */
  heightM: number;
  /** East/north offsets, km. */
  eastKm: number;
  northKm: number;
}

/**
 * Ray-march over the patch DEM from the lander along an azimuth and report the first terrain point that rises
 * above a ray at elevation elDeg. Includes the curvature drop d^2 / 2R. Returns null when the ray clears the
 * whole patch (so any blocking terrain lies beyond the tile edge).
 */
export function findBlocker(
  patch: LocalTerrainPatch,
  azDeg: number,
  elDeg: number,
  obsHeightM: number,
): Blocker | null {
  const az = (azDeg * Math.PI) / 180;
  const sinA = Math.sin(az);
  const cosA = Math.cos(az);
  const tanEl = Math.tan((elDeg * Math.PI) / 180);
  const eyeM = patch.centerHM + obsHeightM;
  const stepKm = Math.max(0.02, patch.spacingM / 2000);
  const maxKm = patch.radiusKm * 1.4143;
  for (let d = stepKm; d <= maxKm; d += stepKm) {
    const e = d * sinA;
    const n = d * cosA;
    const h = sampleHeightM(patch, e, n);
    if (h === null) break;
    const dropM = ((d * d) / (2 * R_MOON_KM)) * 1000;
    const rayM = eyeM + d * 1000 * tanEl;
    if (h - dropM > rayM) return { distKm: d, heightM: h, eastKm: e, northKm: n };
  }
  return null;
}

/** Project PSR polygons to patch-local rings (km) and keep only rings overlapping the patch. */
export function localPsrRings(
  features: readonly PsrPolygon[],
  centerLat: number,
  centerLon: number,
  radiusKm: number,
): PsrRing[][] {
  const c = psToXY(centerLat, centerLon);
  const lam = (centerLon * Math.PI) / 180;
  const cosL = Math.cos(lam);
  const sinL = Math.sin(lam);
  const out: PsrRing[][] = [];
  for (const f of features) {
    const rings: PsrRing[] = [];
    let touches = false;
    for (const ring of f.coordinates) {
      const pts = new Float64Array(ring.length * 2);
      let minE = Infinity;
      let maxE = -Infinity;
      let minN = Infinity;
      let maxN = -Infinity;
      ring.forEach(([lon, lat], i) => {
        const p = psToXY(lat, lon);
        const dx = p.x - c.x;
        const dy = p.y - c.y;
        const e = (dx * cosL - dy * sinL) / 1000;
        const n = (dx * sinL + dy * cosL) / 1000;
        pts[2 * i] = e;
        pts[2 * i + 1] = n;
        if (e < minE) minE = e;
        if (e > maxE) maxE = e;
        if (n < minN) minN = n;
        if (n > maxN) maxN = n;
      });
      rings.push({ pts, minE, maxE, minN, maxN });
      if (minE <= radiusKm && maxE >= -radiusKm && minN <= radiusKm && maxN >= -radiusKm) touches = true;
    }
    if (touches) out.push(rings);
  }
  return out;
}

function inRing(ring: PsrRing, e: number, n: number): boolean {
  if (e < ring.minE || e > ring.maxE || n < ring.minN || n > ring.maxN) return false;
  const p = ring.pts;
  const cnt = p.length / 2;
  let inside = false;
  for (let i = 0, j = cnt - 1; i < cnt; j = i++) {
    const ei = p[2 * i];
    const ni = p[2 * i + 1];
    const ej = p[2 * j];
    const nj = p[2 * j + 1];
    if (ni > n !== nj > n && e < ((ej - ei) * (n - ni)) / (nj - ni) + ei) inside = !inside;
  }
  return inside;
}

/** 1 for every patch vertex inside a PSR polygon (even-odd across the rings of a feature, so holes work). */
export function psrVertexMask(patch: LocalTerrainPatch, polys: readonly PsrRing[][]): Uint8Array {
  const gs = patch.gridSize;
  const r = patch.radiusKm;
  const mask = new Uint8Array(gs * gs);
  if (polys.length === 0) return mask;
  for (let iy = 0; iy < gs; iy++) {
    const n = ((iy / (gs - 1)) * 2 - 1) * r;
    for (let ix = 0; ix < gs; ix++) {
      const e = ((ix / (gs - 1)) * 2 - 1) * r;
      for (const rings of polys) {
        let inside = false;
        for (const ring of rings) if (inRing(ring, e, n)) inside = !inside;
        if (inside) {
          mask[iy * gs + ix] = 1;
          break;
        }
      }
    }
  }
  return mask;
}

/**
 * Contour line segments every `intervalM` (absolute metres) by marching squares on the DEM cells.
 * Output is [x0, y0, z0, x1, y1, z1, ...] in km with X = East, Y = (height - centre) in km, Z = -North.
 */
export function contourSegments(patch: LocalTerrainPatch, intervalM = CONTOUR_INTERVAL_M): Float32Array {
  const gs = patch.gridSize;
  const r = patch.radiusKm;
  const h = patch.heightsM;
  const out: number[] = [];
  const px = (ix: number) => ((ix / (gs - 1)) * 2 - 1) * r;
  const lvlFirst = Math.ceil(patch.minHM / intervalM);
  const lvlLast = Math.floor(patch.maxHM / intervalM);
  for (let iy = 0; iy < gs - 1; iy++) {
    for (let ix = 0; ix < gs - 1; ix++) {
      const hs = [h[iy * gs + ix], h[iy * gs + ix + 1], h[(iy + 1) * gs + ix + 1], h[(iy + 1) * gs + ix]];
      const lo = Math.min(hs[0], hs[1], hs[2], hs[3]);
      const hi = Math.max(hs[0], hs[1], hs[2], hs[3]);
      const a = Math.max(lvlFirst, Math.ceil(lo / intervalM));
      const b = Math.min(lvlLast, Math.floor(hi / intervalM));
      if (b < a) continue;
      const cx = [px(ix), px(ix + 1), px(ix + 1), px(ix)];
      const cn = [px(iy), px(iy), px(iy + 1), px(iy + 1)];
      for (let k = a; k <= b; k++) {
        const level = k * intervalM;
        const pts: Array<[number, number]> = [];
        for (let e = 0; e < 4; e++) {
          const i0 = e;
          const i1 = (e + 1) % 4;
          const v0 = hs[i0];
          const v1 = hs[i1];
          if (v0 === v1 || (v0 < level) === (v1 < level)) continue;
          const t = (level - v0) / (v1 - v0);
          pts.push([cx[i0] + (cx[i1] - cx[i0]) * t, cn[i0] + (cn[i1] - cn[i0]) * t]);
        }
        const y = (level - patch.centerHM) / 1000;
        for (let s = 0; s + 1 < pts.length; s += 2) {
          out.push(pts[s][0], y, -pts[s][1], pts[s + 1][0], y, -pts[s + 1][1]);
        }
      }
    }
  }
  return Float32Array.from(out);
}

/** Landing ellipse ring points (km, patch-local): east/north offsets at the given radius. */
export function ringPointsKm(radiusKm: number, count = 72): Array<{ east: number; north: number }> {
  const pts: Array<{ east: number; north: number }> = [];
  for (let i = 0; i <= count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push({ east: Math.sin(a) * radiusKm, north: Math.cos(a) * radiusKm });
  }
  return pts;
}

/** Fraction of the patch radius at which the landing ellipse ring is clipped. */
export const RING_CLIP_FRACTION = 0.95;
/** Landing ellipse ring radius actually drawn (km): the requested radius, clipped to the tile. */
export function ellipseRingKm(ellipseKm: number, patchRadiusKm: number): number {
  return Math.min(ellipseKm, patchRadiusKm * RING_CLIP_FRACTION);
}
