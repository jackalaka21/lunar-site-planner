import { beforeAll, describe, expect, it } from "vitest";
import { Ephemeris } from "../../../lib/data/ephemeris";
import { HorizonStore, resolveSiteContext } from "../../../lib/data/horizons";
import { nodeFetchers } from "../../../lib/data/nodeFetchers";
import { loadSites } from "../../../lib/data/sites";
import { sample, type SiteContext, type TimeSeries } from "../../../lib/engine";
import { DEFAULT_SETTINGS } from "../../../lib/engine/settings";
import { tipOverResilience } from "../../../lib/engine/tipover";

const T0 = Date.UTC(2027, 0, 10);
let series: TimeSeries;

beforeAll(async () => {
  const eph = await Ephemeris.open(nodeFetchers);
  await eph.ensure(T0 - 3_600_000, T0 + 16 * 86_400_000);
  const cat = await loadSites(nodeFetchers);
  const store = await HorizonStore.open(nodeFetchers);
  const ctx: SiteContext = await resolveSiteContext(
    { kind: "catalog", id: "connecting-ridge" },
    cat,
    store,
    2,
  );
  series = sample(ctx, eph, T0, DEFAULT_SETTINGS.durationDays * 24, 10, DEFAULT_SETTINGS);
});

describe("tipOverResilience", () => {
  it("tilt 0 equals nominal", () => {
    const res = tipOverResilience(series, DEFAULT_SETTINGS, 0);
    expect(res.tiltDeg).toBe(0);
    expect(res.worstPower).toBeCloseTo(res.nominalPower, 10);
    expect(res.worstBothH).toBeCloseTo(res.nominalBothH, 10);
    expect(res.worstPowerAzDeg).toBe(0);
    expect(res.worstBothAzDeg).toBe(0);
  });

  it("worst case <= nominal for positive tilt angles", () => {
    for (const tilt of [5, 10, 15, 25]) {
      const res = tipOverResilience(series, DEFAULT_SETTINGS, tilt);
      expect(res.tiltDeg).toBe(tilt);
      expect(res.worstPower).toBeLessThanOrEqual(res.nominalPower);
      expect(res.worstBothH).toBeLessThanOrEqual(res.nominalBothH);
      expect(res.worstPower).toBeLessThan(res.nominalPower);
      expect(res.worstPowerAzDeg).toBeGreaterThanOrEqual(0);
      expect(res.worstPowerAzDeg).toBeLessThan(360);
    }
  });
});
