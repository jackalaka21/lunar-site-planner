import { describe, expect, it } from "vitest";
import { sceneDir } from "../../../components/terrain3d/glScene";
import { blockStatus, slopeBaselineM, terrainNotes } from "../../../components/terrain3d/hud";
import { ellipseRingKm } from "../../../components/terrain3d/terrainModel";

describe("sceneDir", () => {
  it("maps azimuth 90 to +X (East) and azimuth 0 to -Z (North)", () => {
    const e = sceneDir(90, 0, 1);
    expect(e.x).toBeCloseTo(1, 6);
    expect(e.z).toBeCloseTo(0, 6);
    const n = sceneDir(0, 0, 1);
    expect(n.z).toBeCloseTo(-1, 6);
    expect(n.x).toBeCloseTo(0, 6);
  });

  it("scales the Y component by the relief factor before normalising", () => {
    const a = sceneDir(0, 10, 1);
    const b = sceneDir(0, 10, 3);
    expect(b.y / Math.hypot(b.y, b.z)).toBeGreaterThan(a.y / Math.hypot(a.y, a.z));
    const el = (10 * Math.PI) / 180;
    expect(b.y / -b.z).toBeCloseTo((3 * Math.sin(el)) / Math.cos(el), 6);
  });
});

describe("blockStatus", () => {
  it("names the 0 degree horizon plane when the body is below 0", () => {
    expect(blockStatus("Sun", -1, 1, false, null)).toBe("Sun is below the 0° horizon plane");
  });
  it("reports a clear line over the ridge", () => {
    expect(blockStatus("Earth", 5, 1.2, true, null)).toBe("Earth clear of the 1.2° ridge");
  });
  it("names the blocker distance when one is found", () => {
    expect(
      blockStatus("Sun", 1, 2, false, { distKm: 3.46, heightM: 0, eastKm: 0, northKm: 0 }),
    ).toBe("Sun blocked by terrain 3.5 km away");
  });
  it("says the shadow is not drawn when the blocker is outside the tile or finer than the grid", () => {
    expect(blockStatus("Sun", 1, 2, false, null, 200)).toBe(
      "Sun blocked by terrain outside this 20 × 20 km tile or finer than its 200 m grid; that shadow is not drawn",
    );
  });
});

describe("terrain notes", () => {
  const patch = { spacingM: 200, resM: 2000, radiusKm: 10 } as never;
  it("uses twice the spacing, or the native resolution when coarser, as slope baseline", () => {
    expect(slopeBaselineM({ spacingM: 200, resM: 40 } as never)).toBe(400);
    expect(slopeBaselineM(patch)).toBe(2000);
  });
  it("words the PSR status without overclaiming and flags a clipped ring", () => {
    const base = { patch, caption: "cap", surface: "slope" as const, ellipseKm: 20, ringKm: ellipseRingKm(20, 10), ringClipped: true };
    const none = terrainNotes({ ...base, psr: "none" }).join("\n");
    expect(none).toContain("No mapped PSR (≥ 1 km²) inside this tile");
    expect(none).toContain("clipped to the tile");
    expect(none).toContain("2000 m baseline");
    expect(none).toContain("Ctrl+scroll or click then scroll to zoom");
    expect(none).toContain("Lander symbol enlarged, not to scale");
  });
});
