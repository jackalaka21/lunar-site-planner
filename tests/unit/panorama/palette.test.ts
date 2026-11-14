import { describe, expect, it } from "vitest";
import { luminance, panoramaPalette } from "../../../components/panorama/palette";

describe.each(["light", "dark"] as const)("panorama palette, %s mode", (mode) => {
  const p = panoramaPalette(mode);
  it("resolves concrete colours", () => {
    for (const v of Object.values(p)) expect(v).toMatch(/^(#|rgb)/);
  });
  it("keeps sky, far terrain, near terrain and unlit Earth pairwise distinct", () => {
    const four = [p.sky, p.far, p.near, p.deepest].map((c) => c.toLowerCase());
    expect(new Set(four).size).toBe(4);
  });
  it("makes the near ridge lighter than the far ridge", () => {
    expect(luminance(p.near)).toBeGreaterThan(luminance(p.far));
  });
});
