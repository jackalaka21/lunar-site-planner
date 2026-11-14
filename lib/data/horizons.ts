import { sphereHorizon } from "../engine/horizon";
import type { HorizonProfile, HorizonSource, SiteContext } from "../engine/types";
import type { SiteRef } from "../state/url";
import { fetchJson, type Fetcher } from "./fetchers";
import { psToLatLon, psToXY } from "./ps";
import { loadSites, type SiteCatalog } from "./sites";

interface GridIndex {
  spacingM: number;
  halfCount: number;
  tilePoints: number;
  nAz: number;
  stepDeg: number;
  tiles: string[];
}

const EMPTY = -32768;
const SITE_N_AZ = 3600;
const SITE_STEP_DEG = 0.1;
const MASTS: readonly (2 | 10 | 50)[] = [2, 10, 50];

export interface GridNode {
  lat: number;
  lon: number;
  hDemM: number;
  profile: HorizonProfile;
}

export class HorizonStore {
  private readonly tiles = new Map<string, Promise<Int16Array | null>>();
  private readonly siteFiles = new Map<string, Promise<Int16Array>>();
  private catalog: Promise<SiteCatalog> | null = null;
  private readonly tileSet: Set<string>;

  private constructor(
    private readonly f: Fetcher,
    private readonly idx: GridIndex,
  ) {
    this.tileSet = new Set(idx.tiles);
  }

  static async open(f: Fetcher): Promise<HorizonStore> {
    return new HorizonStore(f, await fetchJson<GridIndex>(f, "horizons/grid/index.json"));
  }

  private siteFile(id: string): Promise<Int16Array> {
    let p = this.siteFiles.get(id);
    if (!p) {
      p = this.f(`horizons/sites/${id}.bin`).then((b) => new Int16Array(b));
      this.siteFiles.set(id, p);
    }
    return p;
  }

  async forSite(id: string, mastM: 2 | 10 | 50): Promise<{ profile: HorizonProfile; hDemM: number }> {
    const mi = MASTS.indexOf(mastM);
    if (mi < 0) throw new RangeError(`Unsupported mast height ${mastM} m`);
    this.catalog ??= loadSites(this.f);
    const [data, cat] = await Promise.all([this.siteFile(id), this.catalog]);
    const site = cat.byId.get(id);
    if (!site) throw new Error(`Unknown site ${id}`);
    const elevDeg = new Float32Array(SITE_N_AZ);
    for (let k = 0; k < SITE_N_AZ; k++) elevDeg[k] = data[mi * SITE_N_AZ + k] / 100;
    return { profile: { stepDeg: SITE_STEP_DEG, elevDeg }, hDemM: site.hDemM };
  }

  private tile(i: number, j: number): Promise<Int16Array | null> {
    const name = `${i}_${j}`;
    let p = this.tiles.get(name);
    if (!p) {
      p = this.tileSet.has(name)
        ? this.f(`horizons/grid/${name}.bin`).then((b) => new Int16Array(b))
        : Promise.resolve(null);
      this.tiles.set(name, p);
    }
    return p;
  }

  /** Profile at integer node (ix, iy), or null if outside the grid or the slot is empty. */
  private async node(ix: number, iy: number): Promise<{ hDemM: number; profile: HorizonProfile } | null> {
    const { halfCount: half, tilePoints: tp, nAz, stepDeg } = this.idx;
    if (Math.abs(ix) > half || Math.abs(iy) > half) return null;
    const i = Math.floor((ix + half) / tp);
    const j = Math.floor((iy + half) / tp);
    const data = await this.tile(i, j);
    if (!data) return null;
    const slot = (iy + half - tp * j) * tp + (ix + half - tp * i);
    const base = slot * (nAz + 1);
    if (data[base] === EMPTY) return null;
    const elevDeg = new Float32Array(nAz);
    for (let k = 0; k < nAz; k++) elevDeg[k] = data[base + 1 + k] / 100;
    return { hDemM: data[base], profile: { stepDeg, elevDeg } };
  }

  async forPoint(
    lat: number,
    lon: number,
  ): Promise<{ profile: HorizonProfile; hDemM: number; source: HorizonSource } | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat >= 0) return null;
    const { x, y } = psToXY(lat, lon);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    const sp = this.idx.spacingM;
    const ix = Math.round(x / sp);
    const iy = Math.round(y / sp);
    const n = await this.node(ix, iy);
    if (!n) return null;
    const distKm = Math.hypot(x - ix * sp, y - iy * sp) / 1000;
    return { profile: n.profile, hDemM: n.hDemM, source: { kind: "grid", distKm, spacingKm: sp / 1000 } };
  }

  /** Grid nodes within radiusKm (true PS distance) of the query point; empty slots are skipped. */
  async neighbours(lat: number, lon: number, radiusKm: number): Promise<GridNode[]> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat >= 0) return [];
    const { x, y } = psToXY(lat, lon);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    const sp = this.idx.spacingM;
    const r = radiusKm * 1000;
    const half = this.idx.halfCount;
    const jobs: Promise<GridNode | null>[] = [];
    for (let ix = Math.max(-half, Math.ceil((x - r) / sp)); ix <= Math.min(half, Math.floor((x + r) / sp)); ix++) {
      for (let iy = Math.max(-half, Math.ceil((y - r) / sp)); iy <= Math.min(half, Math.floor((y + r) / sp)); iy++) {
        if (Math.hypot(ix * sp - x, iy * sp - y) > r) continue;
        jobs.push(this.node(ix, iy).then((n) => (n ? { ...psToLatLon(ix * sp, iy * sp), ...n } : null)));
      }
    }
    return (await Promise.all(jobs)).filter((n): n is GridNode => n !== null);
  }
}

export async function resolveSiteContext(
  ref: SiteRef,
  catalog: SiteCatalog,
  store: HorizonStore,
  mastM: 2 | 10 | 50,
): Promise<SiteContext> {
  if (ref.kind === "catalog") {
    const site = catalog.byId.get(ref.id);
    if (!site) throw new Error(`Unknown site ${ref.id}`);
    const { profile } = await store.forSite(ref.id, mastM);
    return {
      lat: site.lat,
      lon: site.lon,
      hDemM: site.hDemM,
      obsHeightM: mastM,
      horizon: profile,
      source: { kind: "site", id: ref.id, mastM },
    };
  }
  const g = await store.forPoint(ref.lat, ref.lon);
  if (g) {
    return { lat: ref.lat, lon: ref.lon, hDemM: g.hDemM, obsHeightM: mastM, horizon: g.profile, source: g.source };
  }
  return {
    lat: ref.lat,
    lon: ref.lon,
    hDemM: 0,
    obsHeightM: mastM,
    horizon: sphereHorizon(mastM),
    source: { kind: "sphere" },
  };
}
