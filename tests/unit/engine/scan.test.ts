import { beforeAll, describe, expect, it } from "vitest";
import { Ephemeris } from "../../../lib/data/ephemeris";
import { HorizonStore, resolveSiteContext } from "../../../lib/data/horizons";
import { nodeFetchers } from "../../../lib/data/nodeFetchers";
import { loadSites } from "../../../lib/data/sites";
import { nextGoodDates, scanDates, type SiteContext } from "../../../lib/engine";
import { DEFAULT_SETTINGS } from "../../../lib/engine/settings";

const DAY = 86_400_000;
const FROM = Date.UTC(2027, 0, 1);
let eph: Ephemeris;
let ctx: SiteContext;

beforeAll(async () => {
  eph = await Ephemeris.open(nodeFetchers);
  await eph.ensure(FROM, FROM + 400 * DAY);
  const [cat, store] = await Promise.all([loadSites(nodeFetchers), HorizonStore.open(nodeFetchers)]);
  ctx = await resolveSiteContext({ kind: "catalog", id: "connecting-ridge" }, cat, store, 2);
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
    expect(r.length).toBeLessThanOrEqual(3);
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

describe("window scan parity", () => {
  it("matches an independent per-date evaluation", async () => {
    const { sample, metrics, landingCheck } = await import("../../../lib/engine");
    const s = DEFAULT_SETTINGS;
    const r = scanDates(ctx, eph, FROM, 4, 24, s);
    for (const d of r) {
      const m = metrics(sample(ctx, eph, d.t0Ms, s.durationDays * 24, 10, s), landingCheck(ctx, eph, d.t0Ms, s), s);
      expect(d.verdict).toBe(m.verdict);
      expect(d.bothH).toBeCloseTo(m.bothH, 9);
      expect(d.sunlitPct).toBeCloseTo(m.sunlitPct, 9);
    }
  });
});
