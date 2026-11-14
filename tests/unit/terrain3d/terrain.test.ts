import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLocalTerrainPatch,
  POLAR_DEM_NODATA,
  POLAR_DEM_SIDE,
  samplePolarDem,
} from "../../../lib/data/terrain";
import type { HorizonProfile } from "../../../lib/engine/types";

const demPath = join(process.cwd(), "public/data/v1/terrain/south-pole-dem.bin");
const rawBuf = readFileSync(demPath);
const realPolarDem = new Int16Array(
  rawBuf.buffer,
  rawBuf.byteOffset,
  rawBuf.byteLength / Int16Array.BYTES_PER_ELEMENT,
);

const mockHorizon: HorizonProfile = {
  stepDeg: 1,
  elevDeg: Float32Array.from({ length: 360 }, (_, az) =>
    az >= 70 && az <= 110 ? 4.5 : az >= 240 && az <= 280 ? -1.2 : 0.8,
  ),
};

describe("polar DEM sampling & 3D local terrain patch", () => {
  it("loads the 191x191 real south-polar LOLA DEM and interpolates heights around the South Pole", () => {
    expect(realPolarDem.length).toBe(POLAR_DEM_SIDE * POLAR_DEM_SIDE);
    const poleH = samplePolarDem(realPolarDem, 0, 0);
    expect(poleH).not.toBeNull();
    expect(poleH!).toBeGreaterThan(-5000);
    expect(poleH!).toBeLessThan(8000);

    // Sub-grid bilinear interpolation between (0, 0) and (2000, 2000)
    const midH = samplePolarDem(realPolarDem, 1000, 1000);
    expect(midH).not.toBeNull();

    // Outside the [-190 km, 190 km] grid returns null
    expect(samplePolarDem(realPolarDem, 250_000, 0)).toBeNull();
    expect(samplePolarDem(realPolarDem, 0, -250_000)).toBeNull();
  });

  it("returns null on nodata cells", () => {
    const emptyDem = new Int16Array(POLAR_DEM_SIDE * POLAR_DEM_SIDE).fill(POLAR_DEM_NODATA);
    expect(samplePolarDem(emptyDem, 0, 0)).toBeNull();
  });

  it("builds a polar DEM terrain patch for South Pole sites (lat <= -84)", () => {
    const patch = buildLocalTerrainPatch({
      lat: -84.78,
      lon: 29.13,
      hDemM: 5312.4,
      horizon: mockHorizon,
      polarDem: realPolarDem,
      radiusKm: 10,
      gridSize: 21,
    });
    expect(patch.isPolarGrid).toBe(true);
    expect(patch.gridSize).toBe(21);
    expect(patch.heightsM.length).toBe(21 * 21);
    // Center vertex (10, 10) is anchored to the exact site elevation
    expect(patch.heightsM[10 * 21 + 10]).toBeCloseTo(5312.4, 1);
    expect(patch.maxHM).toBeGreaterThan(patch.minHM);
  });

  it("reconstructs a 3D horizon-matched terrain patch for non-polar sites (e.g. Apollo 11)", () => {
    const patch = buildLocalTerrainPatch({
      lat: 0.67416,
      lon: 23.47314,
      hDemM: -1925.6,
      horizon: mockHorizon,
      polarDem: realPolarDem,
      radiusKm: 10,
      gridSize: 21,
    });
    expect(patch.isPolarGrid).toBe(false);
    // Center vertex (10, 10) is anchored to hDemM
    expect(patch.heightsM[10 * 21 + 10]).toBeCloseTo(-1925.6, 1);
    // East edge (az = 90 deg, where mockHorizon has a +4.5 deg ridge) is higher than West edge (az = 270 deg, -1.2 deg)
    const eastEdgeH = patch.heightsM[10 * 21 + 20];
    const westEdgeH = patch.heightsM[10 * 21 + 0];
    expect(eastEdgeH).toBeGreaterThan(-1925.6 + 300);
    expect(westEdgeH).toBeLessThan(-1925.6);
  });
});
