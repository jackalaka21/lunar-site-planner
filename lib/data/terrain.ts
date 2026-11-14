import { browserFetcher, fetchJson, type Fetcher } from "./fetchers";
import { psToXY } from "./ps";

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

export type TerrainSource = "LOLA polar 40 m" | "LOLA global 64 ppd" | "LOLA polar 120 m" | "LOLA 2 km grid";

export interface SitePatchIndex {
  gridSize: number;
  radiusKm: number;
  spacingM: number;
  sites: Record<string, { source: Exclude<TerrainSource, "LOLA 2 km grid">; resM: number }>;
}

export interface LocalTerrainPatch {
  gridSize: number;
  radiusKm: number;
  /** Row-major (iy * gridSize + ix) heights in metres, where ix is East (-R..+R) and iy is North (-R..+R). */
  heightsM: Float32Array;
  minHM: number;
  maxHM: number;
  /** Height at the patch centre (the site), metres above the 1737.4 km sphere. */
  centerHM: number;
  /** Which real LOLA product the heights were sampled from. */
  source: TerrainSource;
  /** Native resolution of that product in metres. */
  resM: number;
  /** Sample spacing of this patch in metres. */
  spacingM: number;
}

function finish(
  heightsM: Float32Array,
  gridSize: number,
  radiusKm: number,
  source: TerrainSource,
  resM: number,
): LocalTerrainPatch {
  let minHM = Infinity;
  let maxHM = -Infinity;
  for (const h of heightsM) {
    if (h < minHM) minHM = h;
    if (h > maxHM) maxHM = h;
  }
  const c = Math.floor(gridSize / 2);
  return {
    gridSize,
    radiusKm,
    heightsM,
    minHM,
    maxHM,
    centerHM: heightsM[c * gridSize + c],
    source,
    resM,
    spacingM: (2 * radiusKm * 1000) / (gridSize - 1),
  };
}

let cachedIndex: Promise<SitePatchIndex> | null = null;

/** Load terrain/sites/index.json (grid geometry and the LOLA product each site patch came from). */
export function loadSitePatchIndex(fetcher: Fetcher = browserFetcher): Promise<SitePatchIndex> {
  if (fetcher === browserFetcher && cachedIndex) return cachedIndex;
  const job = fetchJson<SitePatchIndex>(fetcher, "terrain/sites/index.json").catch((err: unknown) => {
    if (fetcher === browserFetcher && cachedIndex === job) cachedIndex = null;
    throw err;
  });
  if (fetcher === browserFetcher) cachedIndex = job;
  return job;
}

/**
 * Load the precomputed 20 x 20 km LOLA patch of a catalogue site (pipeline/lsp/terrain_patches.py).
 * Returns null when the site has no patch. The heights are used as stored.
 */
export async function loadSitePatch(
  siteId: string,
  fetcher: Fetcher = browserFetcher,
): Promise<LocalTerrainPatch | null> {
  const index = await loadSitePatchIndex(fetcher);
  const entry = index.sites[siteId];
  if (!entry) return null;
  const buf = await fetcher(`terrain/sites/${siteId}.bin`);
  if (buf.byteLength !== index.gridSize * index.gridSize * 2) {
    throw new Error(`terrain patch ${siteId}: unexpected size ${buf.byteLength}`);
  }
  const raw = new Int16Array(buf);
  const heights = Float32Array.from(raw);
  return finish(heights, index.gridSize, index.radiusKm, entry.source, entry.resM);
}

/**
 * Patch for a custom south-polar point, sampled bilinearly from the real 2 km LOLA grid. No horizon data and
 * no synthetic terms are used. Returns null unless every vertex lies inside the grid on valid data.
 */
export function buildCoarsePolarPatch(
  dem: Int16Array,
  lat: number,
  lon: number,
  radiusKm = 10,
  gridSize = 41,
): LocalTerrainPatch | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const n = Math.max(3, gridSize);
  const radiusM = radiusKm * 1000;
  const c = psToXY(lat, lon);
  const lam = (lon * Math.PI) / 180;
  const cosLam = Math.cos(lam);
  const sinLam = Math.sin(lam);
  const heights = new Float32Array(n * n);
  for (let iy = 0; iy < n; iy++) {
    const northM = ((iy / (n - 1)) * 2 - 1) * radiusM;
    for (let ix = 0; ix < n; ix++) {
      const eastM = ((ix / (n - 1)) * 2 - 1) * radiusM;
      const h = samplePolarDem(
        dem,
        c.x + eastM * cosLam + northM * sinLam,
        c.y - eastM * sinLam + northM * cosLam,
      );
      if (h === null) return null;
      heights[iy * n + ix] = h;
    }
  }
  return finish(heights, n, radiusKm, "LOLA 2 km grid", POLAR_DEM_SPACING_M);
}
