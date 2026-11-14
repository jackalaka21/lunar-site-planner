import { describe, expect, it } from "vitest";
import {
  azToX,
  elScale,
  exaggeration,
  sharedElDomain,
  splitAtWrap,
  withAlpha,
} from "../../../components/panorama/layout";
import type { HorizonProfile } from "../../../lib/engine/types";
import type { TimeSeries } from "../../../lib/engine/sample";

const flat = (el: number): HorizonProfile => ({ stepDeg: 1, elevDeg: new Float32Array(360).fill(el) });
const series = (sunEl: number[], earthEl: number[]): TimeSeries =>
  ({
    n: sunEl.length,
    sunEl: Float32Array.from(sunEl),
    earthEl: Float32Array.from(earthEl),
  }) as unknown as TimeSeries;

describe("azToX", () => {
  it("wraps: x(0) = x(360)", () => {
    expect(azToX(0, 720)).toBeCloseTo(azToX(360, 720), 9);
    expect(azToX(-90, 720, 90)).toBeCloseTo(azToX(270, 720, 90), 9);
  });
  it("puts the centre azimuth mid-canvas", () => {
    expect(azToX(180, 720)).toBeCloseTo(360, 9);
    expect(azToX(90, 720, 90)).toBeCloseTo(360, 9);
  });
});

describe("splitAtWrap", () => {
  it("splits a path from 350 to 10 into 2 segments, none spanning > 180 deg in x", () => {
    const pts = [350, 355, 0, 5, 10].map((az) => ({ az, el: 1 }));
    const segs = splitAtWrap(pts);
    expect(segs).toHaveLength(2);
    for (const s of segs) {
      const xs = s.map((p) => azToX(p.az, 360));
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(180);
    }
  });
  it("splits at the seam of a non-default centre", () => {
    const pts = [80, 85, 95].map((az) => ({ az, el: 0 }));
    expect(splitAtWrap(pts, 270)).toHaveLength(2);
    expect(splitAtWrap(pts, 90)).toHaveLength(1);
  });
  it("keeps an empty or single path", () => {
    expect(splitAtWrap([])).toEqual([]);
    expect(splitAtWrap([{ az: 1, el: 1 }])).toHaveLength(1);
  });
});

describe("sharedElDomain", () => {
  it("is min-0.5 .. max+0.5 across items", () => {
    const d = sharedElDomain([
      { horizon: flat(-1), series: series([0, 2], [1, 6]) },
      { horizon: flat(0), series: series([3], [4]) },
    ]);
    expect(d).toEqual([-1.5, 6.5]);
  });
  it("has span of at least 3 degrees", () => {
    const [lo, hi] = sharedElDomain([{ horizon: flat(0), series: series([0.1], [0.2]) }]);
    expect(hi - lo).toBeGreaterThanOrEqual(3);
  });
  it("ignores samples far below the terrain", () => {
    const [lo] = sharedElDomain([{ horizon: flat(0), series: series([-60, 1], [-80, 2]) }]);
    expect(lo).toBeGreaterThan(-5);
  });
});

describe("exaggeration", () => {
  it("is an integer >= 1", () => {
    expect(exaggeration(1000, 300, [-1, 5])).toBe(Math.round(300 / 6 / (1000 / 360)));
    expect(exaggeration(1000, 10, [-1, 50])).toBe(1);
    expect(Number.isInteger(exaggeration(777, 333, [0, 7]))).toBe(true);
  });
});

describe("elScale", () => {
  it("maps domain top to 0 and bottom to height", () => {
    const y = elScale([-2, 4], 300);
    expect(y(4)).toBe(0);
    expect(y(-2)).toBe(300);
    expect(y(1)).toBe(150);
  });
});

describe("withAlpha", () => {
  it("applies alpha to hex and rgb colours", () => {
    expect(withAlpha("#ff8000", 0.5)).toBe("rgba(255, 128, 0, 0.5)");
    expect(withAlpha("rgb(1, 2, 3)", 0.25)).toBe("rgba(1, 2, 3, 0.25)");
  });
});
