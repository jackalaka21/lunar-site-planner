import { describe, expect, it } from "vitest";
import {
  globalFromPixel,
  globalToPixel,
  scaleBar,
  southFromPixel,
  southToPixel,
  SOUTH_RADIUS_M,
} from "../../../components/picker/projection";

const SIZE = 4096;

describe("south polar projection", () => {
  it("puts the pole at the centre and 0 E at the top (north-up)", () => {
    const c = southToPixel(-90, 0, SIZE);
    expect(c?.x).toBeCloseTo(SIZE / 2, 6);
    expect(c?.y).toBeCloseTo(SIZE / 2, 6);
    const top = southToPixel(-88, 0, SIZE);
    expect(top!.x).toBeCloseTo(SIZE / 2, 6);
    expect(top!.y).toBeLessThan(SIZE / 2);
    const right = southToPixel(-88, 90, SIZE);
    expect(right!.x).toBeGreaterThan(SIZE / 2);
    expect(right!.y).toBeCloseTo(SIZE / 2, 6);
  });
  it("pixel to lat/lon round trips within 0.01 degrees", () => {
    for (const [px, py] of [
      [2048, 2048],
      [100, 200],
      [3900, 1000],
      [2500.5, 3333.25],
      [0, 0],
    ]) {
      const ll = southFromPixel(px, py, SIZE);
      const back = southToPixel(ll.lat, ll.lon, SIZE)!;
      const ll2 = southFromPixel(back.x, back.y, SIZE);
      expect(Math.abs(ll2.lat - ll.lat)).toBeLessThan(0.01);
      expect(Math.abs(back.x - px)).toBeLessThan(0.01);
      expect(Math.abs(back.y - py)).toBeLessThan(0.01);
    }
  });
  it("lat/lon to pixel to lat/lon round trips within 0.01 degrees", () => {
    for (const [lat, lon] of [
      [-85.3, 31.2],
      [-89.684, -163.261],
      [-86, 0],
      [-84.8, 177],
    ]) {
      const p = southToPixel(lat, lon, SIZE)!;
      const ll = southFromPixel(p.x, p.y, SIZE);
      expect(Math.abs(ll.lat - lat)).toBeLessThan(0.01);
      let dl = Math.abs(ll.lon - lon);
      if (dl > 180) dl = 360 - dl;
      expect(dl).toBeLessThan(0.01);
    }
  });
  it("returns null outside the map and works at any display size", () => {
    expect(southToPixel(-60, 0, SIZE)).toBeNull();
    expect(southToPixel(10, 0, SIZE)).toBeNull();
    const a = southToPixel(-85, 40, 2048)!;
    const b = southToPixel(-85, 40, 4096)!;
    expect(b.x).toBeCloseTo(a.x * 2, 6);
    expect(SOUTH_RADIUS_M).toBe(190000);
  });
});

describe("global equirectangular projection", () => {
  it("maps lon -180..180 and lat +90 at the top", () => {
    expect(globalToPixel(90, -180, 2048, 1024)).toEqual({ x: 0, y: 0 });
    expect(globalToPixel(0, 0, 2048, 1024)).toEqual({ x: 1024, y: 512 });
    expect(globalToPixel(-90, 180, 2048, 1024)).toEqual({ x: 2048, y: 1024 });
  });
  it("round trips", () => {
    const p = globalToPixel(-85.3, 31.2, 2048, 1024);
    const ll = globalFromPixel(p.x, p.y, 2048, 1024);
    expect(ll.lat).toBeCloseTo(-85.3, 6);
    expect(ll.lon).toBeCloseTo(31.2, 6);
  });
});

describe("scale bar", () => {
  it("picks a round length that fits", () => {
    const bar = scaleBar(190000 / 100, 80);
    expect(bar.lengthM).toBe(100000);
    expect(bar.label).toBe("100 km");
    expect(bar.px).toBeCloseTo(100000 / 1900, 6);
    expect(scaleBar(10, 100).label).toBe("1 km");
    expect(scaleBar(0.5, 100).label).toBe("50 m");
  });
});
