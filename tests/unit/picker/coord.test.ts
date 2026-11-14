import { describe, expect, it } from "vitest";
import { parseCoord } from "../../../components/picker/coord";

describe("parseCoord", () => {
  it("accepts -85.3, 31.2", () => {
    expect(parseCoord("-85.3", "31.2")).toEqual({ ok: true, lat: -85.3, lon: 31.2 });
  });
  it("rejects lat -91 with message", () => {
    const r = parseCoord("-91", "10");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/latitude/i);
  });
  it("accepts lon 350 as -10", () => {
    expect(parseCoord("-85", "350")).toEqual({ ok: true, lat: -85, lon: -10 });
  });
  it("maps the longitude aliases exactly", () => {
    const lon = (t: string) => {
      const r = parseCoord("-85", t);
      return r.ok ? r.lon : null;
    };
    expect(lon("360")).toBe(0);
    expect(lon("0")).toBe(0);
    expect(lon("-0")).toBe(0);
    expect(Object.is(lon("-0"), 0)).toBe(true);
    expect(lon("180")).toBe(-180);
    expect(lon("-180")).toBe(-180);
    expect(lon("-181")).toBeNull();
    expect(lon("360.5")).toBeNull();
  });
  it("accepts the poles and fixes the longitude there", () => {
    expect(parseCoord("-90", "123")).toEqual({ ok: true, lat: -90, lon: 0 });
    expect(parseCoord("90", "-45")).toEqual({ ok: true, lat: 90, lon: 0 });
    expect(parseCoord("-90.0001", "0").ok).toBe(false);
  });
  it("rounds to the 0.001 degree the link keeps", () => {
    expect(parseCoord("-85.12349", "31.2004")).toEqual({ ok: true, lat: -85.123, lon: 31.2 });
  });
  it("rejects empty, non-numeric and exponent input with the field named", () => {
    for (const [a, b, field] of [
      ["", "1", "lat"],
      ["1", "", "lon"],
      ["abc", "1", "lat"],
      ["1", "1e2", "lon"],
      ["1", "NaN", "lon"],
      ["Infinity", "1", "lat"],
    ] as const) {
      const r = parseCoord(a, b);
      expect(r.ok, `${a},${b}`).toBe(false);
      if (!r.ok) expect(r.field).toBe(field);
    }
  });
  it("tolerates spaces and a degree sign", () => {
    expect(parseCoord(" -85.3° ", " 31.2 °")).toEqual({ ok: true, lat: -85.3, lon: 31.2 });
  });
});
