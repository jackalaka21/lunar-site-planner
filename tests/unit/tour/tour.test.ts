import { describe, expect, it } from "vitest";
import { padBox, placeCard, spotlightPanes } from "../../../components/tour/position";
import { TOUR_STEPS } from "../../../components/tour/tourSteps";

describe("tour steps", () => {
  it("has ten steps with unique ids and unique targets", () => {
    expect(TOUR_STEPS).toHaveLength(10);
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(10);
    const targets = TOUR_STEPS.map((s) => s.targetId).filter(Boolean);
    expect(new Set(targets).size).toBe(targets.length);
    expect(TOUR_STEPS[0].targetId).toBeNull();
  });
  it("keeps each section short and free of banned words", () => {
    for (const s of TOUR_STEPS) {
      for (const text of [s.what, s.means, s.tryIt]) {
        expect(text.split(/\s+/).length).toBeLessThanOrEqual(45);
        expect(text).not.toMatch(/telemetry|!/i);
      }
    }
  });
});

const vp = { width: 1000, height: 800 };
const card = { width: 400, height: 300 };

describe("placeCard", () => {
  it("prefers below the target", () => {
    const p = placeCard({ left: 100, top: 50, width: 200, height: 40 }, card, vp, 16, 16);
    expect(p.placement).toBe("below");
    expect(p.top).toBe(106);
    expect(p.left).toBe(100);
  });
  it("flips to the right when there is no room below", () => {
    const p = placeCard({ left: 100, top: 400, width: 200, height: 380 }, card, vp, 16, 16);
    expect(p.placement).toBe("right");
    expect(p.left).toBe(316);
  });
  it("flips above when neither below nor right fits", () => {
    const p = placeCard({ left: 100, top: 500, width: 880, height: 280 }, card, vp, 16, 16);
    expect(p.placement).toBe("above");
    expect(p.top).toBe(184);
  });
  it("flips left, then falls back inside the viewport", () => {
    const left = placeCard({ left: 700, top: 20, width: 280, height: 760 }, card, vp, 16, 16);
    expect(left.placement).toBe("left");
    const inside = placeCard({ left: 0, top: 0, width: 1000, height: 800 }, card, vp, 16, 16);
    expect(inside.placement).toBe("inside");
  });
  it("never clips and centres with no target", () => {
    const p = placeCard({ left: 900, top: 10, width: 90, height: 40 }, card, vp, 16, 16);
    expect(p.left + card.width).toBeLessThanOrEqual(vp.width - 16);
    expect(p.left).toBeGreaterThanOrEqual(16);
    const c = placeCard(null, card, vp, 16, 16);
    expect(c).toEqual({ left: 300, top: 250, placement: "center" });
  });
});

describe("spotlight geometry", () => {
  it("pads a box on every side", () => {
    expect(padBox({ left: 10, top: 10, width: 20, height: 20 }, 8)).toEqual({
      left: 2,
      top: 2,
      width: 36,
      height: 36,
    });
  });
  it("panes surround the hole without overlapping it", () => {
    const hole = { left: 100, top: 100, width: 200, height: 100 };
    const p = spotlightPanes(hole, vp);
    expect(p.top.height).toBe(100);
    expect(p.bottom.top).toBe(200);
    expect(p.left.width).toBe(100);
    expect(p.right.left).toBe(300);
    expect(p.left.top).toBe(100);
    expect(p.left.height).toBe(100);
  });
  it("clamps a hole that leaves the viewport", () => {
    const p = spotlightPanes({ left: -50, top: -20, width: 2000, height: 100 }, vp);
    expect(p.top.height).toBe(0);
    expect(p.left.width).toBe(0);
    expect(p.right.width).toBe(0);
  });
});
