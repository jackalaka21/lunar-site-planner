import { horizonAt } from "../engine/horizon";
import type { HorizonProfile } from "../engine/types";
import { browserFetcher, type Fetcher } from "./fetchers";
import { PS_R_M, psToXY } from "./ps";

export const POLAR_DEM_SPACING_M = 2000;
export const POLAR_DEM_HALF_COUNT = 95;
export const POLAR_DEM_SIDE = 191;
export const POLAR_DEM_NODATA = -32768;

let cachedPolarDem: Promise<Int16Array> | null = null;

/** Load the 191x191 south-polar LOLA DEM (2 km spacing, Int16 metres above 1737.4 km sphere). */
export function loadPolarDem(fetcher: Fetcher = browserFetcher): Promise<Int16Array> {
  if (fetcher === browserFetcher && cachedPolarDem) return cachedPolarDem;
  const job = fetcher("terrain/south-pole-dem.bin")
    .then((buf) => new Int16Array(buf))
    .catch((err: unknown) => {
      if (fetcher === browserFetcher && cachedPolarDem === job) cachedPolarDem = null;
      throw err;
    });
  if (fetcher === browserFetcher) cachedPolarDem = job;
  return job;
}

/**
 * Bilinear interpolation of the south-polar DEM at south-polar stereographic coordinates (xM, yM) in metres.
 * Returns null when outside the [-190 km, +190 km] grid or on a nodata cell.
 */
export function samplePolarDem(dem: Int16Array, xM: number, yM: number): number | null {
  if (!Number.isFinite(xM) || !Number.isFinite(yM)) return null;
  if (dem.length < POLAR_DEM_SIDE * POLAR_DEM_SIDE) return null;

  const gx = xM / POLAR_DEM_SPACING_M + POLAR_DEM_HALF_COUNT;
  const gy = yM / POLAR_DEM_SPACING_M + POLAR_DEM_HALF_COUNT;
  if (gx < 0 || gx > POLAR_DEM_SIDE - 1 || gy < 0 || gy > POLAR_DEM_SIDE - 1) return null;

  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, POLAR_DEM_SIDE - 1);
  const y1 = Math.min(y0 + 1, POLAR_DEM_SIDE - 1);
  const fx = gx - x0;
  const fy = gy - y0;

  const h00 = dem[y0 * POLAR_DEM_SIDE + x0];
  const h10 = dem[y0 * POLAR_DEM_SIDE + x1];
  const h01 = dem[y1 * POLAR_DEM_SIDE + x0];
  const h11 = dem[y1 * POLAR_DEM_SIDE + x1];

  const corners: Array<{ h: number; w: number }> = [
    { h: h00, w: (1 - fx) * (1 - fy) },
    { h: h10, w: fx * (1 - fy) },
    { h: h01, w: (1 - fx) * fy },
    { h: h11, w: fx * fy },
  ];

  let weightSum = 0;
  let valSum = 0;
  for (const c of corners) {
    if (c.w <= 0) continue;
    if (c.h === POLAR_DEM_NODATA) return null;
    weightSum += c.w;
    valSum += c.h * c.w;
  }
  if (weightSum <= 0) return null;
  return valSum / weightSum;
}

export interface LocalTerrainPatchOptions {
  lat: number;
  lon: number;
  hDemM: number;
  horizon: HorizonProfile;
  polarDem?: Int16Array | null;
  /** Half-width of the square patch in km (default 10 km -> 20 x 20 km patch). */
  radiusKm?: number;
  /** Number of vertices per side (default 41). */
  gridSize?: number;
}

export interface LocalTerrainPatch {
  gridSize: number;
  radiusKm: number;
  /** Row-major (iy * gridSize + ix) heights in metres, where ix is East (-R..+R) and iy is North (-R..+R). */
  heightsM: Float32Array;
  minHM: number;
  maxHM: number;
  isPolarGrid: boolean;
}

/**
 * Build a local 3D height patch in local East (+x) / North (+y) coordinates around (lat, lon).
 * Uses the real LOLA south-polar DEM when lat <= -84 and polarDem is available, blended with the
 * site's LOLA 360-azimuth horizon profile; otherwise reconstructs radial topography from the horizon profile.
 */
export function buildLocalTerrainPatch(opts: LocalTerrainPatchOptions): LocalTerrainPatch {
  const { lat, lon, hDemM, horizon, polarDem } = opts;
  const radiusKm = opts.radiusKm ?? 10;
  const gridSize = Math.max(3, opts.gridSize ?? 41);
  const radiusM = radiusKm * 1000;
  const heightsM = new Float32Array(gridSize * gridSize);

  const centerPs = psToXY(lat, lon);
  const centerDemSample =
    lat <= -84 && polarDem ? samplePolarDem(polarDem, centerPs.x, centerPs.y) : null;
  const isPolarGrid = centerDemSample !== null;
  const centerDelta = centerDemSample !== null ? hDemM - centerDemSample : 0;

  const lam = (lon * Math.PI) / 180;
  const cosLam = Math.cos(lam);
  const sinLam = Math.sin(lam);

  let minHM = Infinity;
  let maxHM = -Infinity;

  for (let iy = 0; iy < gridSize; iy++) {
    const northM = ((iy / (gridSize - 1)) * 2 - 1) * radiusM;
    for (let ix = 0; ix < gridSize; ix++) {
      const eastM = ((ix / (gridSize - 1)) * 2 - 1) * radiusM;
      const rM = Math.hypot(eastM, northM);
      const u = Math.min(1, rM / Math.max(radiusM, 1));
      const azDeg = rM > 1e-3 ? ((Math.atan2(eastM, northM) * 180) / Math.PI + 360) % 360 : 0;

      const el0 = horizonAt(horizon, azDeg);
      const elSmooth =
        0.5 * el0 +
        0.25 * horizonAt(horizon, azDeg - 1.5) +
        0.25 * horizonAt(horizon, azDeg + 1.5);
      const tanEl = Math.tan((elSmooth * Math.PI) / 180);
      // Radial shaping so ridges peak realistically toward the mid-to-outer ring while center is anchored at 0.
      const radialEnv = Math.pow(u, 1.1) * (0.88 + 0.12 * Math.sin(u * Math.PI));
      const curvatureDropM = (rM * rM) / (2 * PS_R_M);
      const horizonReliefM = rM * tanEl * radialEnv + curvatureDropM * 0.25 * u;

      let hM = hDemM;
      if (isPolarGrid && polarDem) {
        const psX = centerPs.x + eastM * cosLam + northM * sinLam;
        const psY = centerPs.y - eastM * sinLam + northM * cosLam;
        const sampled = samplePolarDem(polarDem, psX, psY);
        const demH = sampled !== null ? sampled + centerDelta : hDemM + horizonReliefM;
        // Anchor exact site height at r = 0 and blend DEM macro-topography with horizon-matched local ridges.
        const horizonBlend = 0.22 * Math.sin(u * Math.PI);
        hM =
          u < 1e-4
            ? hDemM
            : demH * (1 - horizonBlend) + (hDemM + horizonReliefM) * horizonBlend;
      } else {
        const microCrater =
          Math.sin(eastM * 0.00085 + lat * 0.7) *
          Math.cos(northM * 0.00085 - lon * 0.7) *
          14 *
          Math.sin(u * Math.PI);
        hM = u < 1e-4 ? hDemM : hDemM + horizonReliefM + microCrater;
      }

      heightsM[iy * gridSize + ix] = hM;
      if (hM < minHM) minHM = hM;
      if (hM > maxHM) maxHM = hM;
    }
  }

  return {
    gridSize,
    radiusKm,
    heightsM,
    minHM: Number.isFinite(minHM) ? minHM : hDemM,
    maxHM: Number.isFinite(maxHM) ? maxHM : hDemM,
    isPolarGrid,
  };
}
