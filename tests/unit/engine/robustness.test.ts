import { beforeAll, describe, expect, it } from "vitest";
import { Ephemeris } from "../../../lib/data/ephemeris";
import { HorizonStore, resolveSiteContext } from "../../../lib/data/horizons";
import { nodeFetchers } from "../../../lib/data/nodeFetchers";
import { loadSites } from "../../../lib/data/sites";
import { landingCheck, metrics, robustness, sample, type SiteContext } from "../../../lib/engine";
import { DEFAULT_SETTINGS } from "../../../lib/engine/settings";

const T0 = Date.UTC(2027, 0, 10);
let eph: Ephemeris;
let ctx: SiteContext;
let store: HorizonStore;

beforeAll(async () => {
  eph = await Ephemeris.open(nodeFetchers);
  await eph.ensure(T0 - 3_600_000, T0 + 20 * 86_400_000);
  const cat = await loadSites(nodeFetchers);
  store = await HorizonStore.open(nodeFetchers);
  ctx = await resolveSiteContext({ kind: "catalog", id: "connecting-ridge" }, cat, store, 2);
});

function nominal() {
  const s = DEFAULT_SETTINGS;
  return metrics(sample(ctx, eph, T0, s.durationDays * 24, 10, s), landingCheck(ctx, eph, T0, s), s);
}

describe("robustness", () => {
  it("min <= nominal <= max", () => {
    const r = robustness(ctx, [], eph, T0, DEFAULT_SETTINGS);
    const m = nominal();
    for (const k of ["bothH", "sunlitH", "earthH", "longestDarkH"] as const) {
      expect(r[k].min).toBeLessThanOrEqual(m[k] + 1e-9);
      expect(r[k].max).toBeGreaterThanOrEqual(m[k] - 1e-9);
    }
    expect(r.points).toBe(3);
  });

  it("horizon +0.3 never increases sunlit hours", () => {
    const s = DEFAULT_SETTINGS;
    const base = metrics(sample(ctx, eph, T0, 336, 10, s), { ok: true, reason: null }, s);
    const up = metrics(sample(ctx, eph, T0, 336, 10, s, undefined, 0.3), { ok: true, reason: null }, s);
    expect(up.sunlitH).toBeLessThanOrEqual(base.sunlitH);
    const r = robustness(ctx, [], eph, T0, s);
    expect(r.sunlitH.min).toBeLessThanOrEqual(up.sunlitH + 1e-9);
    expect(r.sunlitH.max).toBeGreaterThanOrEqual(base.sunlitH - 1e-9);
  });

  it("includes neighbours and counts points", async () => {
    const nodes = await store.neighbours(ctx.lat, ctx.lon, 2);
    const nbs: SiteContext[] = nodes.map((n) => ({
      lat: n.lat,
      lon: n.lon,
      hDemM: n.hDemM,
      obsHeightM: 2,
      horizon: n.profile,
      source: { kind: "grid", distKm: 0, spacingKm: 2 },
    }));
    const r = robustness(ctx, nbs, eph, T0, DEFAULT_SETTINGS);
    expect(r.points).toBe(3 + nbs.length);
    expect(r.bothH.min).toBeLessThanOrEqual(r.bothH.max);
  });
});
