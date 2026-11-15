import { describe, expect, it } from "vitest";
import { clampView, homeView, MAX_ZOOM, viewBoxOf, zoomAbout, zoomForSpan } from "../../../components/picker/projectionView";

describe("map view maths", () => {
  it("fits the whole image at zoom 1 and matches the container aspect", () => {
    const b = viewBoxOf(homeView(400, 400), 400, 400, 2);
    expect(b.w / b.h).toBeCloseTo(2, 6);
    expect(b.h).toBeCloseTo(400, 6);
    expect(b.x + b.w / 2).toBeCloseTo(200, 6);
  });
  it("keeps the point under the pointer fixed and clamps zoom", () => {
    const v0 = homeView(400, 400);
    const before = viewBoxOf(v0, 400, 400, 1);
    const ux = before.x + 0.25 * before.w;
    const v1 = zoomAbout(v0, 4, 0.25, 0.5, 400, 400, 1);
    const after = viewBoxOf(v1, 400, 400, 1);
    expect(after.x + 0.25 * after.w).toBeCloseTo(ux, 6);
    expect(zoomAbout(v1, 1000, 0.5, 0.5, 400, 400, 1).zoom).toBe(MAX_ZOOM);
  });
  it("zooms to a span", () => {
    expect(zoomForSpan(100, 400, 400, 1)).toBeCloseTo(4, 6);
  });
  it("cannot pan at zoom 1, and keeps the box on the image when zoomed", () => {
    expect(clampView({ zoom: 1, cx: 10, cy: 390 }, 400, 400, 1)).toEqual({ zoom: 1, cx: 200, cy: 200 });
    expect(clampView({ zoom: 1, cx: 10, cy: 390 }, 400, 400, 2).cx).toBe(200);
    const z = clampView({ zoom: 4, cx: 0, cy: 400 }, 400, 400, 1);
    expect(z.cx).toBeCloseTo(50, 6);
    expect(z.cy).toBeCloseTo(350, 6);
  });
});
