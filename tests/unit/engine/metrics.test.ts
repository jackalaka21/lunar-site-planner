import { describe, expect, it } from "vitest";
import { Ephemeris } from "../../../lib/data/ephemeris";
import { nodeFetchers } from "../../../lib/data/nodeFetchers";
import {
  R_MOON_KM,
  earthInView,
  findEvent,
  isLit,
  landingCheck,
  litAt,
  mergeFlickers,
  metrics,
  powerFactor,
  sample,
  siteFrame,
  sphereHorizon,
  toRad,
  type EphemerisSource,
  type SiteContext,
  type TimeSeries,
  type Vec3,
} from "../../../lib/engine";
import { DEFAULT_SETTINGS, type Settings } from "../../../lib/engine/settings";

const S: Settings = { ...DEFAULT_SETTINGS };
const STEP = 600_000;

function ctxAt(lat: number, lon: number, horizon = sphereHorizon(2)): SiteContext {
  return { lat, lon, hDemM: 0, obsHeightM: 2, horizon, source: { kind: "sphere" } };
}

function series(n: number, lit: (i: number) => boolean, earth: (i: number) => boolean): TimeSeries {
  const z = () => new Float32Array(n);
  const s: TimeSeries = {
    t0Ms: 0,
    stepMs: STEP,
    n,
    sunAz: z(),
    sunEl: z(),
    sunFrac: z(),
    eclipseFrac: z(),
    earthAz: z(),
    earthEl: z(),
    earthIn: new Uint8Array(n),
    interference: new Uint8Array(n),
    power: z().fill(0.5),
    lit: new Uint8Array(n),
    both: new Uint8Array(n),
    dsnBits: new Uint8Array(n),
    clippedAtMs: null,
  };
  for (let i = 0; i < n; i++) {
    s.lit[i] = lit(i) ? 1 : 0;
    s.earthIn[i] = earth(i) ? 1 : 0;
  }
  return s;
}
const OK = { ok: true, reason: null };

describe("states", () => {
  it("lit threshold", () => {
    expect(isLit(0.4, "any")).toBe(true);
    expect(isLit(0.4, "half")).toBe(false);
    expect(isLit(0.4, "full")).toBe(false);
    expect(isLit(0.995, "full")).toBe(true);
  });
  it("earth margin", () => {
    expect(earthInView(2.5, 2, 0)).toBe(true);
    expect(earthInView(2.5, 2, 1)).toBe(false);
  });
  it("power tracking = sunFrac*cos(el); fixed panel facing away = 0", () => {
    expect(powerFactor(90, 30, { mode: "tracking" })).toBeCloseTo(Math.cos(toRad(30)), 12);
    expect(powerFactor(90, 30, { mode: "fixed", azDeg: 270 })).toBe(0);
    expect(powerFactor(90, 30, { mode: "fixed", azDeg: 90 })).toBeCloseTo(Math.cos(toRad(30)), 12);
  });
  it("sample power uses the panel factor", () => {
    const ctx = ctxAt(0, 0);
    const f = siteFrame(0, 0, 0, 2);
    const dir = (el: number): Vec3 => [
      Math.sin(toRad(el)) * f.u[0] + Math.cos(toRad(el)) * f.e[0],
      Math.sin(toRad(el)) * f.u[1] + Math.cos(toRad(el)) * f.e[1],
      Math.sin(toRad(el)) * f.u[2] + Math.cos(toRad(el)) * f.e[2],
    ];
    const sunDir = dir(30);
    const eph: EphemerisSource = {
      coverage: () => [0, 1e13],
      bodyAt: (b) =>
        b === "sun"
          ? [f.p[0] + 1.496e8 * sunDir[0], f.p[1] + 1.496e8 * sunDir[1], f.p[2] + 1.496e8 * sunDir[2]]
          : [f.p[0] - 384400 * f.u[0], f.p[1] - 384400 * f.u[1], f.p[2] - 384400 * f.u[2]],
    };
    const track = sample(ctx, eph, 0, 1, 10, S);
    expect(track.power[0]).toBeCloseTo(Math.cos(toRad(30)), 5);
    const away = sample(ctx, eph, 0, 1, 10, { ...S, panel: { mode: "fixed", azDeg: 270 } });
    expect(away.power[0]).toBe(0);
    expect(R_MOON_KM).toBeGreaterThan(0);
  });
});

describe("mergeFlickers", () => {
  it("fills gaps < 30 min and counts them", () => {
    const r = mergeFlickers(Uint8Array.from([1, 1, 0, 0, 1]), STEP, 30);
    expect(Array.from(r.merged)).toEqual([1, 1, 1, 1, 1]);
    expect(r.count).toBe(1);
  });
  it("does not merge a 40 min gap, an edge run, or a gap of exactly the threshold", () => {
    expect(mergeFlickers(Uint8Array.from([1, 0, 0, 0, 0, 1]), STEP, 30).count).toBe(0);
    expect(mergeFlickers(Uint8Array.from([0, 0, 1, 0]), STEP, 30).count).toBe(0);
    expect(mergeFlickers(Uint8Array.from([1, 0, 0, 0, 1]), STEP, 30).count).toBe(0);
  });
});

describe("verdict precedence", () => {
  const N = 144 * 14 + 1;
  it("landing fail is poor", () => {
    const m = metrics(series(N, () => true, () => true), { ok: false, reason: "No DTE during descent" }, S);
    expect(m.verdict).toBe("poor");
    expect(m.reason).toBe("No DTE during descent");
  });
  it("earth never in view wins over a failed landing", () => {
    const m = metrics(series(N, () => true, () => false), { ok: false, reason: "Landing in darkness" }, S);
    expect(m.verdict).toBe("poor");
    expect(m.reason).toBe("Earth never in view (relay needed)");
  });
  it("long darkness", () => {
    const m = metrics(series(N, (i) => i < 1296 || i >= 1296 + 300, () => true), OK, S);
    expect(m.verdict).toBe("poor");
    expect(m.reason).toMatch(/^50 h darkness starting T\+\d+(\.\d)? d$/);
    expect(m.reason).toBe("50 h darkness starting T+9 d");
    expect(m.longestDarkStartMs).toBe(1296 * STEP);
  });
  it("both 56 percent and dark 10 h is good", () => {
    const m = metrics(series(1000, (i) => i < 100 || i >= 160, (i) => i < 620), OK, S);
    expect(m.bothPct).toBeCloseTo(56, 9);
    expect(m.verdict).toBe("good");
  });
  it("both 30 percent is marginal", () => {
    const m = metrics(series(1000, (i) => i < 100 || i >= 160, (i) => i < 360), OK, S);
    expect(m.bothPct).toBeCloseTo(30, 9);
    expect(m.verdict).toBe("marginal");
  });
  it("both under 20 percent is poor", () => {
    const m = metrics(series(1000, () => true, (i) => i < 100), OK, S);
    expect(m.verdict).toBe("poor");
    expect(m.reason).toBe("Only 10% sun + Earth");
  });
});

describe("with the real ephemeris", () => {
  it("far side never sees Earth", async () => {
    const eph = await Ephemeris.open(nodeFetchers);
    const t0 = Date.UTC(2027, 11, 1);
    await eph.ensure(t0 - 3_600_000, t0 + 15 * 86_400_000);
    const ctx = ctxAt(-45.44, 177.6);
    const ts = sample(ctx, eph, t0, 14 * 24, 10, S);
    const m = metrics(ts, landingCheck(ctx, eph, t0, S), S);
    expect(m.earthH).toBe(0);
    expect(m.verdict).toBe("poor");
    expect(m.reason).toBe("Earth never in view (relay needed)");
  });

  it("no event within 60 days returns null", async () => {
    const eph = await Ephemeris.open(nodeFetchers);
    const t0 = Date.UTC(2027, 8, 1);
    await eph.ensure(t0, t0 + 61 * 86_400_000);
    const flat: SiteContext = ctxAt(0, 0, { stepDeg: 1, elevDeg: new Float64Array(360).fill(-90) });
    expect(findEvent(flat, eph, t0, "sunset", S)).toBeNull();
  });

  it("clips mission at coverage end", async () => {
    const eph = await Ephemeris.open(nodeFetchers);
    const t0 = Date.UTC(2035, 11, 25);
    await eph.ensure(t0, eph.coverage()[1]);
    const ctx = ctxAt(0, 0);
    const ts = sample(ctx, eph, t0, 14 * 24, 10, S);
    expect(ts.clippedAtMs).toBe(eph.coverage()[1]);
    expect(t0 + (ts.n - 1) * STEP).toBeLessThanOrEqual(eph.coverage()[1]);
    expect(t0 + ts.n * STEP).toBeGreaterThan(eph.coverage()[1]);
    expect(findEvent(ctx, eph, eph.coverage()[1] - 3_600_000, "sunset", S)).toBeNull();
  });

  it("events bisected to 1 minute", async () => {
    const eph = await Ephemeris.open(nodeFetchers);
    const t0 = Date.UTC(2027, 3, 1);
    await eph.ensure(t0, t0 + 61 * 86_400_000);
    const ctx = ctxAt(0, 0);
    const frame = siteFrame(0, 0, 0, S.mastM);
    const ev = findEvent(ctx, eph, t0, "sunset", S);
    expect(ev).not.toBeNull();
    let brute: number | null = null;
    let prev = litAt(ctx, frame, eph, t0, S);
    for (let t = t0 + 60_000; t < t0 + 60 * 86_400_000; t += 60_000) {
      const cur = litAt(ctx, frame, eph, t, S);
      if (prev && !cur) {
        brute = t;
        break;
      }
      prev = cur;
    }
    expect(brute).not.toBeNull();
    expect(Math.abs((ev as number) - (brute as number))).toBeLessThanOrEqual(60_000);
  });
});
