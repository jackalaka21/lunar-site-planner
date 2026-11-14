import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Fetcher } from "../../../lib/data/fetchers";
import {
  buildCoarsePolarPatch,
  loadSitePatch,
  loadSitePatchIndex,
  POLAR_DEM_NODATA,
  POLAR_DEM_SIDE,
  samplePolarDem,
} from "../../../lib/data/terrain";

const dataDir = join(process.cwd(), "public/data/v1");
const fileFetcher: Fetcher = async (path) => {
  const b = readFileSync(join(dataDir, path));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const rawBuf = readFileSync(join(dataDir, "terrain/south-pole-dem.bin"));
const realPolarDem = new Int16Array(
  rawBuf.buffer,
  rawBuf.byteOffset,
  rawBuf.byteLength / Int16Array.BYTES_PER_ELEMENT,
);
const sites = (JSON.parse(readFileSync(join(dataDir, "sites.json"), "utf8")) as {
  sites: Array<{ id: string; lat: number; lon: number; hDemM: number }>;
}).sites;

describe("polar DEM sampling", () => {
  it("loads the 191x191 real south-polar LOLA DEM and interpolates", () => {
    expect(realPolarDem.length).toBe(POLAR_DEM_SIDE * POLAR_DEM_SIDE);
    const poleH = samplePolarDem(realPolarDem, 0, 0);
    expect(poleH).not.toBeNull();
    expect(samplePolarDem(realPolarDem, 1000, 1000)).not.toBeNull();
    expect(samplePolarDem(realPolarDem, 250_000, 0)).toBeNull();
  });

  it("returns null on nodata cells", () => {
    const emptyDem = new Int16Array(POLAR_DEM_SIDE * POLAR_DEM_SIDE).fill(POLAR_DEM_NODATA);
    expect(samplePolarDem(emptyDem, 0, 0)).toBeNull();
  });
});

describe("real per-site LOLA patches", () => {
  it("has a 101x101 patch for every catalogue site, centred on the catalogue height", async () => {
    const index = await loadSitePatchIndex(fileFetcher);
    expect([index.gridSize, index.radiusKm, index.spacingM]).toEqual([101, 10, 200]);
    for (const s of sites) {
      const p = await loadSitePatch(s.id, fileFetcher);
      expect(p, s.id).not.toBeNull();
      expect(p!.gridSize).toBe(101);
      expect(p!.heightsM.length).toBe(101 * 101);
      expect(p!.spacingM).toBe(200);
      expect(Math.abs(p!.centerHM - s.hDemM), s.id).toBeLessThanOrEqual(30);
      expect(p!.maxHM).toBeGreaterThanOrEqual(p!.minHM);
      expect(["LOLA polar 40 m", "LOLA global 64 ppd", "LOLA polar 120 m"]).toContain(p!.source);
    }
  });

  it("returns heights exactly as stored (no blending or synthetic terms)", async () => {
    const p = await loadSitePatch("apollo-11", fileFetcher);
    const raw = readFileSync(join(dataDir, "terrain/sites/apollo-11.bin"));
    const i16 = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
    expect(Array.from(p!.heightsM)).toEqual(Array.from(i16));
  });

  it("returns null for an unknown site and rejects a wrong-sized file", async () => {
    expect(await loadSitePatch("nowhere", fileFetcher)).toBeNull();
    const bad: Fetcher = async (path) =>
      path.endsWith("index.json") ? fileFetcher(path) : new ArrayBuffer(10);
    await expect(loadSitePatch("apollo-11", bad)).rejects.toThrow();
  });
});

describe("custom-point coarse patch", () => {
  it("samples only the real 2 km grid and labels it so", () => {
    const p = buildCoarsePolarPatch(realPolarDem, -84.78, 29.13, 10, 21);
    expect(p).not.toBeNull();
    expect(p!.source).toBe("LOLA 2 km grid");
    expect(p!.resM).toBe(2000);
    expect(p!.heightsM.length).toBe(21 * 21);
  });

  it("reproduces a plane exactly (no synthetic terms)", () => {
    const dem = new Int16Array(POLAR_DEM_SIDE * POLAR_DEM_SIDE);
    for (let iy = 0; iy < POLAR_DEM_SIDE; iy++)
      for (let ix = 0; ix < POLAR_DEM_SIDE; ix++) dem[iy * POLAR_DEM_SIDE + ix] = 2 * (ix - 95);
    // lon 0: local east = +x, so heights must grow 2 m per 2 km east
    const p = buildCoarsePolarPatch(dem, -88, 0, 10, 11)!;
    const c = 5;
    for (let ix = 0; ix < 11; ix++) {
      const eastM = (ix - c) * 2000;
      const expected = p.heightsM[c * 11 + c] + (2 * eastM) / 2000;
      expect(p.heightsM[c * 11 + ix]).toBeCloseTo(expected, 3);
    }
  });

  it("returns null outside the grid or on nodata instead of fabricating terrain", () => {
    expect(buildCoarsePolarPatch(realPolarDem, 0.67, 23.47)).toBeNull();
    expect(buildCoarsePolarPatch(realPolarDem, -80, 10)).toBeNull();
    const empty = new Int16Array(POLAR_DEM_SIDE * POLAR_DEM_SIDE).fill(POLAR_DEM_NODATA);
    expect(buildCoarsePolarPatch(empty, -88, 0)).toBeNull();
  });
});

describe("no synthetic terrain path", () => {
  it("terrain.ts contains no horizon blending or crater terms", () => {
    const src = readFileSync(join(process.cwd(), "lib/data/terrain.ts"), "utf8");
    expect(src).not.toMatch(/horizonRelief|microCrater|horizonAt|buildLocalTerrainPatch/);
  });
});
