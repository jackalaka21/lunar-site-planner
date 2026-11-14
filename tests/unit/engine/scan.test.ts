import { beforeAll, describe, expect, it } from "vitest";
import { Ephemeris } from "../../../lib/data/ephemeris";
import { HorizonStore, resolveSiteContext } from "../../../lib/data/horizons";
import { nodeFetchers } from "../../../lib/data/nodeFetchers";
import { loadSites } from "../../../lib/data/sites";
import { landingCheck, metrics, nextGoodDates, sample, scanDates, type DaySummary, type SiteContext } from "../../../lib/engine";
import { DEFAULT_SETTINGS } from "../../../lib/engine/settings";

const DAY = 86_400_000;
const FROM = Date.UTC(2027, 0, 1);
let eph: Ephemeris;
let ctx: SiteContext;
let scanCtx: SiteContext;
// Shackleton rim, 2 d windows from 16 Jan 2027: good, marginal and poor all occur at a 6 h stride.
const SCAN_FROM = Date.UTC(2027, 0, 16);

beforeAll(async () => {
  eph = await Ephemeris.open(nodeFetchers);
  await eph.ensure(FROM, FROM + 400 * DAY);
  const [cat, store] = await Promise.all([loadSites(nodeFetchers), HorizonStore.open(nodeFetchers)]);
  ctx = await resolveSiteContext({ kind: "catalog", id: "connecting-ridge" }, cat, store, 2);
  scanCtx = await resolveSiteContext({ kind: "catalog", id: "shackleton-rim" }, cat, store, 2);
});

describe("scanDates", () => {
  it("returns days entries with step", () => {
    const r = scanDates(ctx, eph, FROM, 10, 24, DEFAULT_SETTINGS);
    expect(r).toHaveLength(10);
    r.forEach((d, i) => {
      expect(d.t0Ms).toBe(FROM + i * DAY);
      expect(d.bothH).toBeGreaterThanOrEqual(0);
      expect(d.bothH).toBeLessThanOrEqual(DEFAULT_SETTINGS.durationDays * 24);
    });
    const half = scanDates(ctx, eph, FROM, 2, 12, DEFAULT_SETTINGS);
    expect(half.map((d) => d.t0Ms)).toEqual([0, 1, 2, 3].map((k) => FROM + k * 12 * 3_600_000));
  });

  it("clips candidates beyond ephemeris coverage", async () => {
    const end = eph.coverage()[1];
    await eph.ensure(end - 3 * DAY, end);
    const r = scanDates(ctx, eph, end - 2 * DAY, 5, 24, { ...DEFAULT_SETTINGS, durationDays: 1 });
    // Candidates at end-2d, end-1d and end are in coverage; the other two are dropped.
    expect(r.map((d) => d.t0Ms)).toEqual([end - 2 * DAY, end - DAY, end]);
    expect(r.every((d) => d.t0Ms <= end)).toBe(true);
  });

  it("scans 365 days at 24 h (timing)", () => {
    const t = performance.now();
    const r = scanDates(ctx, eph, FROM, 365, 24, DEFAULT_SETTINGS);
    const ms = performance.now() - t;
    console.log(`scan365 ${r.length} days in ${ms.toFixed(0)} ms`);
    expect(r).toHaveLength(365);
  });
});

describe("nextGoodDates", () => {
  it("only returns good, ascending, <= count", () => {
    const r = nextGoodDates(ctx, eph, FROM, DEFAULT_SETTINGS, 3);
    expect(r.length).toBeGreaterThan(0);
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r.every((d) => d.verdict === "good")).toBe(true);
    for (let i = 1; i < r.length; i++) expect(r[i].t0Ms).toBeGreaterThan(r[i - 1].t0Ms);
    expect(r[0].t0Ms).toBeGreaterThanOrEqual(FROM);
  });
  it("returns fewer when none are good", () => {
    const strict = { ...DEFAULT_SETTINGS, batteryH: 0 };
    const r = nextGoodDates(ctx, eph, FROM, strict, 3, 24, 5);
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r.every((d) => d.verdict === "good")).toBe(true);
  });
});


/** Independent per-date evaluation: its own sample() over each window, no slicing. */
function perDate(c: SiteContext, t0Ms: number, s: typeof DEFAULT_SETTINGS) {
  const m = metrics(sample(c, eph, t0Ms, s.durationDays * 24, 10, s), landingCheck(c, eph, t0Ms, s), s);
  return { t0Ms, bothH: m.bothH, verdict: m.verdict, sunlitPct: m.sunlitPct, earthPct: m.earthPct };
}

function expectSame(got: DaySummary[], want: DaySummary[]): void {
  expect(got).toHaveLength(want.length);
  got.forEach((g, i) => {
    expect(g.t0Ms).toBe(want[i].t0Ms);
    expect(g.verdict).toBe(want[i].verdict);
    expect(g.bothH).toBeCloseTo(want[i].bothH, 9);
    expect(g.sunlitPct).toBeCloseTo(want[i].sunlitPct, 9);
    expect(g.earthPct).toBeCloseTo(want[i].earthPct, 9);
  });
}

describe("window scan parity", () => {
  const S = { ...DEFAULT_SETTINGS, durationDays: 2 };

  it("6 h stride over 32 dates matches per-date evaluation, with a verdict transition", async () => {
    const from = SCAN_FROM;
    const r = scanDates(scanCtx, eph, from, 8, 6, S);
    expect(r).toHaveLength(32);
    expectSame(r, r.map((d) => perDate(scanCtx, d.t0Ms, S)));
    expect(new Set(r.map((d) => d.verdict)).size).toBeGreaterThanOrEqual(2);
  });

  it("clipped tail near the coverage end matches per-date evaluation", async () => {
    const end = eph.coverage()[1];
    const from = end - 10 * DAY;
    await eph.ensure(from, end);
    const s = { ...DEFAULT_SETTINGS, durationDays: 14 };
    const r = scanDates(ctx, eph, from, 14, 12, s);
    // Candidates at from + k*12 h up to and including coverage end (10 d => k = 0..20), the rest dropped.
    expect(r).toHaveLength(21);
    expect(r[r.length - 1].t0Ms).toBe(end);
    expectSame(r, r.map((d) => perDate(ctx, d.t0Ms, s)));
  });

  it("nextGoodDates equals the first N good entries of the per-date scan", () => {
    const from = SCAN_FROM;
    const days = 60;
    const all = scanDates(scanCtx, eph, from, days, 6, S).filter((d) => d.verdict === "good");
    expect(all.length).toBeGreaterThanOrEqual(3);
    for (const n of [1, 3]) {
      const ng = nextGoodDates(scanCtx, eph, from, S, n, 6, days);
      expectSame(ng, all.slice(0, n).map((d) => perDate(scanCtx, d.t0Ms, S)));
    }
  });
});
