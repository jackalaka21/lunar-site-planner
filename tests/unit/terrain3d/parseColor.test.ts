import { describe, expect, it } from "vitest";
import { parseColor } from "../../../components/terrain3d/palette";

describe("parseColor", () => {
  it("parses #rgb, #rgba, #rrggbb and #rrggbbaa", () => {
    expect(parseColor("#141415")).toEqual({ r: 20, g: 20, b: 21, a: 1 });
    expect(parseColor("#f80")).toEqual({ r: 255, g: 136, b: 0, a: 1 });
    expect(parseColor("#f808")).toMatchObject({ r: 255, g: 136, b: 0 });
    const c = parseColor("#3b5b8c80");
    expect(c).toMatchObject({ r: 59, g: 91, b: 140 });
    expect(c.a).toBeCloseTo(128 / 255, 5);
  });
  it("parses rgb()/rgba() with commas or spaces", () => {
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor("rgb(10 20 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor("rgba(10,20,30,0.4)")).toEqual({ r: 10, g: 20, b: 30, a: 0.4 });
    expect(parseColor("rgb(10 20 30 / 0.5)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
  });
  it("parses the bare 'r g b' form", () => {
    expect(parseColor("10 20 30")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor("10, 20, 30")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
  });
  it("falls back to grey only for unparseable input", () => {
    expect(parseColor("nonsense")).toEqual({ r: 128, g: 128, b: 128, a: 1 });
    expect(parseColor("#12")).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  });
});
