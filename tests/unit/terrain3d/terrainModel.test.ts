import { describe, expect, it } from "vitest";
import type { LocalTerrainPatch } from "../../../lib/data/terrain";
import {
  contourSegments,
  findBlocker,
  localPsrRings,
  psrVertexMask,
  sampleHeightM,
  slopeGridDeg,
} from "../../../components/terrain3d/terrainModel";
import { viewportHeightPx } from "../../../components/terrain3d/viewport";
import { psToLatLon } from "../../../lib/data/ps";

function patchOf(fn: (eastKm: number, northKm: number) => number, gs = 41, r = 10): LocalTerrainPatch {
  const h = new Float32Array(gs * gs);
  for (let iy = 0; iy < gs; iy++)
    for (let ix = 0; ix < gs; ix++) h[iy * gs + ix] = fn(((ix / (gs - 1)) * 2 - 1) * r, ((iy / (gs - 1)) * 2 - 1) * r);
  let min = Infinity;
  let max = -Infinity;
  for (const v of h) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return {
    gridSize: gs,
    radiusKm: r,
    heightsM: h,
    minHM: min,
    maxHM: max,
    centerHM: h[Math.floor(gs / 2) * gs + Math.floor(gs / 2)],
    source: "LOLA polar 40 m",
    resM: 40,
    spacingM: (2 * r * 1000) / (gs - 1),
  };
}

describe("terrainModel", () => {
  it("samples bilinearly and rejects points outside the patch", () => {
    const p = patchOf((e) => e * 100);
    expect(sampleHeightM(p, 2.5, 0)).toBeCloseTo(250, 3);
    expect(sampleHeightM(p, 11, 0)).toBeNull();
  });

  it("computes slope from the DEM", () => {
    const p = patchOf((e) => e * 1000 * Math.tan((12 * Math.PI) / 180));
    const s = slopeGridDeg(p);
    expect(s[20 * 41 + 20]).toBeCloseTo(12, 1);
  });

  it("finds a ridge that blocks the ray inside the tile and none when it clears", () => {
    // Wall 300 m high at about 5 km north of the lander.
    const p = patchOf((_e, n) => (n > 4.9 && n < 5.4 ? 300 : 0));
    const hit = findBlocker(p, 0, 1, 2);
    expect(hit).not.toBeNull();
    expect(hit!.distKm).toBeGreaterThan(4.4);
    expect(hit!.distKm).toBeLessThan(5.5);
    expect(findBlocker(p, 0, 10, 2)).toBeNull();
    expect(findBlocker(p, 180, 1, 2)).toBeNull();
  });

  it("emits contour segments at 250 m multiples only", () => {
    const p = patchOf((e) => e * 100);
    const seg = contourSegments(p, 250);
    expect(seg.length).toBeGreaterThan(0);
    for (let i = 1; i < seg.length; i += 3) {
      const abs = seg[i] * 1000 + p.centerHM;
      expect(Math.abs(abs / 250 - Math.round(abs / 250))).toBeLessThan(1e-3);
    }
  });

  it("marks only vertices inside a projected PSR polygon", () => {
    const lat = -88;
    const lon = 30;
    const lam = (lon * Math.PI) / 180;
    const p = patchOf(() => 0);
    const rho = 2 * 1737400 * Math.tan(Math.PI / 4 + (lat * Math.PI) / 360);
    const cx = rho * Math.sin(lam);
    const cy = rho * Math.cos(lam);
    const es = [-3, 3, 3, -3, -3];
    const ns = [-3, -3, 3, 3, -3];
    const ring = es.map((e, i) => {
      const em = e * 1000;
      const nm = ns[i] * 1000;
      const ll = psToLatLon(
        cx + em * Math.cos(lam) + nm * Math.sin(lam),
        cy - em * Math.sin(lam) + nm * Math.cos(lam),
      );
      return [ll.lon, ll.lat] as [number, number];
    });
    const polys = localPsrRings([{ coordinates: [ring] }], lat, lon, 10);
    expect(polys.length).toBe(1);
    const mask = psrVertexMask(p, polys);
    expect(mask[20 * 41 + 20]).toBe(1);
    expect(mask[0]).toBe(0);
    expect(mask[20 * 41 + 38]).toBe(0);
  });
});

describe("PSR polygon with a hole", () => {
  it("leaves vertices inside the hole unmarked (even-odd across rings)", () => {
    const lat = -88;
    const lon = 30;
    const lam = (lon * Math.PI) / 180;
    const p = patchOf(() => 0);
    const rho = 2 * 1737400 * Math.tan(Math.PI / 4 + (lat * Math.PI) / 360);
    const cx = rho * Math.sin(lam);
    const cy = rho * Math.cos(lam);
    const square = (h: number) => {
      const es = [-h, h, h, -h, -h];
      const ns = [-h, -h, h, h, -h];
      return es.map((e, i) => {
        const em = e * 1000;
        const nm = ns[i] * 1000;
        const ll = psToLatLon(
          cx + em * Math.cos(lam) + nm * Math.sin(lam),
          cy - em * Math.sin(lam) + nm * Math.cos(lam),
        );
        return [ll.lon, ll.lat] as [number, number];
      });
    };
    const polys = localPsrRings([{ coordinates: [square(6), square(2)] }], lat, lon, 10);
    const mask = psrVertexMask(p, polys);
    expect(mask[20 * 41 + 20]).toBe(0); // centre, inside the hole
    expect(mask[20 * 41 + 29]).toBe(1); // 4.4 km east: inside the outer ring, outside the hole
    expect(mask[20 * 41 + 38]).toBe(0); // 8.8 km east: outside everything
  });
});

describe("viewportHeightPx", () => {
  it("treats exactly 48 rem as a phone, matching the max-width media query", () => {
    expect(viewportHeightPx({ columns: 1, viewportWidthPx: 768, remPx: 16 })).toBe(340);
    expect(viewportHeightPx({ columns: 1, viewportWidthPx: 769, remPx: 16 })).toBe(520);
  });
  it("is 520 on a single desktop card, 400 in two columns, 340 on phones", () => {
    expect(viewportHeightPx({ columns: 1, viewportWidthPx: 1440, remPx: 16 })).toBe(520);
    expect(viewportHeightPx({ columns: 2, viewportWidthPx: 1440, remPx: 16 })).toBe(400);
    expect(viewportHeightPx({ columns: 1, viewportWidthPx: 390, remPx: 16 })).toBe(340);
  });
});
