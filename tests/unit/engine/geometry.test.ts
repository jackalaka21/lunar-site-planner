import { describe, expect, it } from "vitest";
import {
  R_EARTH_KM,
  R_MOON_KM,
  R_SUN_KM,
  discFraction,
  earthPhase,
  horizonAt,
  siteFrame,
  sphereHorizon,
  subsolarLatitude,
  sunBlockedByEarth,
  sunEarthSeparation,
  topocentric,
  type HorizonProfile,
  type Topo,
  type Vec3,
} from "../../../lib/engine";

const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe("siteFrame", () => {
  it("has orthonormal u/e/n and p of the right length", () => {
    const f = siteFrame(-43.2, 77.5, 1500, 2);
    expect(norm(f.p)).toBeCloseTo(R_MOON_KM + 1.502, 9);
    for (const v of [f.u, f.e, f.n]) expect(norm(v)).toBeCloseTo(1, 12);
    expect(dot(f.u, f.e)).toBeCloseTo(0, 12);
    expect(dot(f.u, f.n)).toBeCloseTo(0, 12);
    expect(dot(f.e, f.n)).toBeCloseTo(0, 12);
  });

  it("pole frame is lon-independent", () => {
    const a = siteFrame(-90, 0, 0);
    expect(siteFrame(-90, 137, 0)).toEqual(a);
    expect(siteFrame(-90, -180, 0)).toEqual(a);
    expect(a.n.map((x) => x + 0)).toEqual([1, 0, 0]);
    expect(a.e).toEqual([0, 1, 0]);
  });

  it("equator at lon 0: up +x, east +y, north +z", () => {
    const f = siteFrame(0, 0, 0, 0);
    expect(f.u[0]).toBeCloseTo(1, 12);
    expect(f.e[1]).toBeCloseTo(1, 12);
    expect(f.n[2]).toBeCloseTo(1, 12);
  });
});

describe("topocentric", () => {
  it("places a body straight above at el 90 and a body to the north at az 0", () => {
    const f = siteFrame(0, 0, 0, 0);
    const up = topocentric([R_MOON_KM + 1000, 0, 0], f, 1);
    expect(up.el).toBeCloseTo(90, 9);
    expect(up.distKm).toBeCloseTo(1000, 9);
    const north = topocentric([R_MOON_KM, 0, 1000], f, 1);
    expect(north.az).toBeCloseTo(0, 9);
    expect(north.el).toBeCloseTo(0, 9);
    const east = topocentric([R_MOON_KM, 1000, 0], f, 1);
    expect(east.az).toBeCloseTo(90, 9);
  });

  it("reports angular radius of the Sun near 0.27 deg at 1 AU", () => {
    const f = siteFrame(0, 0, 0, 0);
    const t = topocentric([149_597_870.7, 0, 0], f, R_SUN_KM);
    expect(t.r).toBeGreaterThan(0.26);
    expect(t.r).toBeLessThan(0.28);
  });

  it("azimuth is in [0,360) for 1000 random vectors", () => {
    const f = siteFrame(-85, 20, 100);
    let s = 12345;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296 - 0.5;
    };
    for (let i = 0; i < 1000; i++) {
      const v: Vec3 = [rnd() * 8e5, rnd() * 8e5, rnd() * 8e5];
      const t = topocentric(v, f, R_EARTH_KM);
      expect(t.az).toBeGreaterThanOrEqual(0);
      expect(t.az).toBeLessThan(360);
    }
  });
});

describe("discFraction", () => {
  it("is 1 above, 0 below, 0.5 when centred on the horizon", () => {
    expect(discFraction(1, 0, 0.27)).toBe(1);
    expect(discFraction(-1, 0, 0.27)).toBe(0);
    expect(discFraction(0, 0, 0.27)).toBeCloseTo(0.5, 12);
  });

  it("is monotonic in elevation", () => {
    let prev = -1;
    for (let el = -0.3; el <= 0.3; el += 0.01) {
      const v = discFraction(el, 0, 0.27);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("eclipse", () => {
  const mk = (az: number, el: number, r: number): Topo => ({ az, el, r, distKm: 1 });
  it("is 0 when apart, 1 when Earth covers the Sun, ratio of areas when Sun is bigger", () => {
    expect(sunBlockedByEarth(mk(0, 10, 0.27), mk(90, 10, 0.9))).toBe(0);
    expect(sunBlockedByEarth(mk(0, 10, 0.27), mk(0, 10, 0.9))).toBe(1);
    expect(sunBlockedByEarth(mk(0, 10, 0.9), mk(0, 10, 0.27))).toBeCloseTo(0.09, 12);
  });
  it("is partial at limb contact offsets", () => {
    const f = sunBlockedByEarth(mk(0, 10, 0.27), mk(0, 10.9, 0.9));
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(1);
  });
  it("separation of opposite directions is 180", () => {
    expect(sunEarthSeparation(mk(0, 0, 0.1), mk(180, 0, 0.1))).toBeCloseTo(180, 9);
  });
});

describe("horizonAt", () => {
  const elevDeg = new Float32Array(720);
  elevDeg[719] = 1;
  elevDeg[0] = 3;
  const h: HorizonProfile = { stepDeg: 0.5, elevDeg };
  it("wraps", () => {
    expect(horizonAt(h, 359.75)).toBeCloseTo(2, 12);
    expect(horizonAt(h, 360)).toBe(horizonAt(h, 0));
    expect(horizonAt(h, -0.25)).toBeCloseTo(2, 12);
  });
});

describe("sphereHorizon", () => {
  it("is a constant dip of -acos(R/(R+h))", () => {
    const h = sphereHorizon(2);
    expect(h.stepDeg).toBe(1);
    expect(h.elevDeg.length).toBe(360);
    const expected = (-Math.acos(R_MOON_KM / (R_MOON_KM + 0.002)) * 180) / Math.PI;
    expect(h.elevDeg[100]).toBeCloseTo(expected, 5);
    expect(h.elevDeg[100]).toBeLessThan(0);
  });
});

describe("subsolarLatitude", () => {
  it("is asin(z/|v|) in degrees", () => {
    expect(subsolarLatitude([1, 0, 0])).toBe(0);
    expect(subsolarLatitude([0, 0, 5])).toBeCloseTo(90, 12);
    expect(subsolarLatitude([Math.sqrt(3), 0, 1])).toBeCloseTo(30, 10);
  });

  // TODO(Task 11): enable once nodeFetchers lands; sample 2025-2027 hourly and assert |lat| <= 1.6.
  it.skip("stays within +-1.6 deg for 2025-2027 hourly samples", () => {});
});

describe("earthPhase", () => {
  const mk = (az: number, el: number): Topo => ({ az, el, r: 0.5, distKm: 1 });
  it("k = 1 when Sun is opposite Earth, 0 when aligned, 0.5 at quadrature", () => {
    expect(earthPhase(mk(180, 0), mk(0, 0)).illuminatedFraction).toBeCloseTo(1, 12);
    expect(earthPhase(mk(0, 20), mk(0, 20)).illuminatedFraction).toBeCloseTo(0, 12);
    expect(earthPhase(mk(90, 0), mk(0, 0)).illuminatedFraction).toBeCloseTo(0.5, 12);
  });
  it("bright limb points toward the Sun, clockwise from up", () => {
    expect(earthPhase(mk(100, 30), mk(90, 30)).brightLimbDeg).toBeCloseTo(90, 9);
    expect(earthPhase(mk(90, 40), mk(90, 30)).brightLimbDeg).toBeCloseTo(0, 9);
    expect(earthPhase(mk(90, 20), mk(90, 30)).brightLimbDeg).toBeCloseTo(180, 9);
    expect(earthPhase(mk(80, 30), mk(90, 30)).brightLimbDeg).toBeCloseTo(270, 9);
  });
});
