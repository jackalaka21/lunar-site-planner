import { beforeAll, describe, expect, it } from "vitest";
import { Ephemeris } from "../../../lib/data/ephemeris";
import { HorizonStore, resolveSiteContext } from "../../../lib/data/horizons";
import { nodeFetchers } from "../../../lib/data/nodeFetchers";
import { loadSites } from "../../../lib/data/sites";
import { sample, type SiteContext, type TimeSeries } from "../../../lib/engine";
import { approachGlareCheck } from "../../../lib/engine/glare";
import { DEFAULT_SETTINGS } from "../../../lib/engine/settings";

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

describe("approachGlareCheck", () => {
  it("sun at heading+10 warns", () => {
    const sunAz = series.sunAz[0];
    const heading = (sunAz - 10 + 360) % 360;
    const res = approachGlareCheck(series, heading);
    expect(res.ok).toBe(false);
    expect(res.angularDiffDeg).toBeCloseTo(10, 3);
    expect(res.warning).toContain("Sun within 20° of approach heading");
  });

  it("sun at heading+90 does not warn", () => {
    const sunAz = series.sunAz[0];
    const heading = (sunAz - 90 + 360) % 360;
    const res = approachGlareCheck(series, heading);
    expect(res.ok).toBe(true);
    expect(res.angularDiffDeg).toBeCloseTo(90, 3);
    expect(res.warning).toBeNull();
  });

  it("handles 0/360 degree wraparound accurately", () => {
    const sunAz = series.sunAz[0];
    const heading = (sunAz + 355) % 360;
    const res = approachGlareCheck(series, heading);
    expect(res.ok).toBe(false);
    expect(res.angularDiffDeg).toBeCloseTo(5, 3);
  });
});
