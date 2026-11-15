import { describe, expect, it } from "vitest";
import {
  FRAME_COUNT,
  frameLoadOrder,
  frameTarget,
  layersAt,
  moonLayout,
  nearestLoaded,
  pickFrameSet,
  REDUCED_FRAME,
} from "../../../components/landing/choreography";

describe("landing choreography", () => {
  it("loads frame 1, then every 4th, then the rest, each exactly once", () => {
    const order = frameLoadOrder();
    expect(order.slice(0, 4)).toEqual([1, 5, 9, 13]);
    expect(order).toHaveLength(FRAME_COUNT);
    expect(new Set(order).size).toBe(FRAME_COUNT);
    expect(frameLoadOrder(70).every((n) => n <= 70)).toBe(true);
    expect(frameLoadOrder(FRAME_COUNT, 71)[0]).toBe(73);
    expect(frameLoadOrder(FRAME_COUNT, 1, true)).toHaveLength(30);
  });

  it("picks the 640 set only when width x dpr is at most 700", () => {
    expect(pickFrameSet(320, 2)).toBe(640);
    expect(pickFrameSet(390, 1)).toBe(640);
    expect(pickFrameSet(390, 2)).toBe(1280);
    expect(pickFrameSet(1440, 1)).toBe(1280);
    expect(pickFrameSet(390, 3)).toBe(1280);
  });

  it("draws the nearest loaded frame", () => {
    const loaded = new Array<boolean>(FRAME_COUNT + 1).fill(false);
    expect(nearestLoaded(10, loaded)).toBe(0);
    loaded[1] = true;
    loaded[9] = true;
    expect(nearestLoaded(7.2, loaded)).toBe(9);
    expect(nearestLoaded(4, loaded)).toBe(1);
  });

  it("scrubs frames 1 to 70 through Act 2 and holds the stage anchor in Act 3", () => {
    expect(frameTarget(0.05, 78, false)).toBe(1);
    expect(frameTarget(0.18, 78, false)).toBeCloseTo(1, 5);
    expect(frameTarget(0.449, 78, false)).toBeCloseTo(70, 0);
    expect(frameTarget(0.6, 92, false)).toBe(92);
    expect(frameTarget(0.05, 92, true)).toBe(REDUCED_FRAME);
  });

  it("fades the intro out and the horizon in", () => {
    expect(layersAt(0).intro).toBe(1);
    expect(layersAt(0.2).intro).toBe(0);
    expect(layersAt(0.6).showcase).toBe(1);
    expect(layersAt(1).horizon).toBe(1);
    // No two text layers are partly visible together.
    for (let p = 0; p <= 1; p += 0.005) {
      const l = layersAt(p);
      const partial = [l.intro, l.caps, l.showcase, l.horizon].filter((o) => o > 0.02 && o < 0.98).length;
      expect(partial).toBeLessThanOrEqual(1);
    }
  });

  it("offsets the Moon ~10% right at the top on desktop and keeps the whole disc in view on mobile", () => {
    const d0 = moonLayout(1440, 900, true, 0);
    expect(d0.moon.x).toBeCloseTo(1440 * 0.6, 3);
    expect(moonLayout(1440, 900, true, 0.18).moon.x).toBeCloseTo(720, 3);
    const m = moonLayout(390, 844, false, 0);
    expect(m.moon.x - m.moon.r).toBeGreaterThanOrEqual(0);
    expect(m.moon.x + m.moon.r).toBeLessThanOrEqual(390);
    expect(m.moon.y + m.moon.r).toBeLessThanOrEqual(0.43 * 844);
  });
});
