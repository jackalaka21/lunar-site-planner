import { describe, expect, it } from "vitest";
import { nodeFetchers } from "../../../lib/data/nodeFetchers";
import { DEFAULT_SETTINGS } from "../../../lib/engine/settings";
import { createEngineHandlers, evaluateTransferables } from "../../../workers/engineHandlers";

const T0 = Date.UTC(2027, 0, 10);
const ref = { kind: "catalog", id: "connecting-ridge" } as const;

describe("engine handlers", () => {
  const api = createEngineHandlers(nodeFetchers);
  it("evaluate returns ctx, series and metrics", async () => {
    await api.init();
    const r = await api.evaluate({ ref, t0Ms: T0, settings: DEFAULT_SETTINGS });
    expect(r.series.n).toBe(14 * 24 * 6 + 1);
    expect(r.ctx.horizonDeg).toBeInstanceOf(Float32Array);
    expect(r.ctx.horizonDeg.length).toBe(3600);
    expect(r.ctx.horizonStepDeg).toBe(0.1);
    expect(["good", "marginal", "poor"]).toContain(r.metrics.verdict);
    const bufs = evaluateTransferables(r);
    expect(new Set(bufs).size).toBe(bufs.length);
  });
  it("countdowns, calendar, nextGood, robustness, heatmap", async () => {
    const c = await api.countdowns({ ref, fromMs: T0, settings: DEFAULT_SETTINGS });
    expect(Object.keys(c).sort()).toEqual(["earthrise", "earthset", "sunrise", "sunset"]);
    const cal = await api.calendar({ ref, fromMs: T0, days: 5, settings: DEFAULT_SETTINGS });
    expect(cal).toHaveLength(5);
    const ng = await api.nextGood({ ref, fromMs: T0, settings: DEFAULT_SETTINGS });
    expect(ng.length).toBeLessThanOrEqual(3);
    const rb = await api.robustness({ ref, t0Ms: T0, settings: DEFAULT_SETTINGS });
    expect(rb.bothH.min).toBeLessThanOrEqual(rb.bothH.max);
    const hm = await api.heatmap({
      ref,
      t0Ms: T0,
      radiusKm: 4,
      settings: { ...DEFAULT_SETTINGS, durationDays: 3 },
    });
    expect(Array.isArray(hm)).toBe(true);
  });
  it("calendar clips at coverage end", async () => {
    const from = Date.UTC(2035, 11, 20);
    const cal = await api.calendar({
      ref,
      fromMs: from,
      days: 30,
      settings: { ...DEFAULT_SETTINGS, durationDays: 2 },
    });
    expect(cal.length).toBeGreaterThan(0);
    expect(cal.length).toBeLessThanOrEqual(12);
  });
  it("evaluate works for a custom grid point with DSN on", async () => {
    const r = await api.evaluate({
      ref: { kind: "custom", lat: -89.5, lon: 10 },
      t0Ms: T0,
      settings: { ...DEFAULT_SETTINGS, dsnEnabled: true, durationDays: 3 },
    });
    expect(r.ctx.source.kind).toBe("grid");
  });
});
