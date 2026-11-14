import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Ephemeris } from "../../../lib/data/ephemeris";
import { nodeFetchers } from "../../../lib/data/nodeFetchers";
import {
  findEvent,
  landingCheck,
  metrics,
  sample,
  type EventKind,
  type SiteContext,
} from "../../../lib/engine";
import type { Settings } from "../../../lib/engine/settings";

interface Case {
  name: string;
  lat: number;
  lon: number;
  hDemM: number;
  horizon: { stepDeg: number; values: number[] };
  t0Utc: string;
  settings: Settings;
  expect: {
    metrics: Record<string, number | string | boolean | null>;
    events: Record<EventKind, string | null>;
  };
}

const cases = (
  JSON.parse(
    readFileSync(path.resolve(__dirname, "../../fixtures/engine_cases.json"), "utf8"),
  ) as { cases: Case[] }
).cases;

const HOUR = 3_600_000;
const max: Record<string, number> = {};
const track = (k: string, d: number): void => {
  max[k] = Math.max(max[k] ?? 0, d);
};

describe("metrics fixture parity (Python reference)", () => {
  for (const c of cases) {
    it(c.name, async () => {
      const eph = await Ephemeris.open(nodeFetchers);
      const t0 = Date.parse(c.t0Utc);
      const s = c.settings;
      await eph.ensure(t0 - HOUR, t0 + (s.durationDays + 61) * 24 * HOUR);
      const ctx: SiteContext = {
        lat: c.lat,
        lon: c.lon,
        hDemM: c.hDemM,
        obsHeightM: s.mastM,
        horizon: { stepDeg: c.horizon.stepDeg, elevDeg: Float64Array.from(c.horizon.values) },
        source: { kind: "sphere" },
      };
      const ts = sample(ctx, eph, t0, s.durationDays * 24, 10, s);
      const m = metrics(ts, landingCheck(ctx, eph, t0, s), s);
      const e = c.expect.metrics as Record<string, number>;

      expect(ts.n).toBe(e.samples);
      const pairs: [string, number, number][] = [
        ["sunlitH", m.sunlitH, e.litHours],
        ["sunlitPct", m.sunlitPct, e.litPct],
        ["earthH", m.earthH, e.earthHours],
        ["earthPct", m.earthPct, e.earthPct],
        ["bothH", m.bothH, e.bothHours],
        ["bothPct", m.bothPct, e.bothPct],
        ["longestDarkH", m.longestDarkH, e.longestDarkH],
        ["longestCommsGapH", m.longestCommsGapH, e.longestCommsGapH],
        ["meanPower", m.meanPower, e.meanPower],
      ];
      for (const [k, got, want] of pairs) {
        track(k, Math.abs(got - want));
        // power comes from Float32 storage, so allow single-precision error there
        expect(Math.abs(got - want)).toBeLessThan(k === "meanPower" ? 1e-6 : 1e-9);
      }
      const hoursOrNull = (ms: number | null): number | null => (ms === null ? null : (ms - t0) / HOUR);
      for (const [got, want] of [
        [hoursOrNull(m.longestDarkStartMs), e.longestDarkStartH],
        [hoursOrNull(m.firstSunsetMs), e.firstSunsetH],
      ] as [number | null, number | null][]) {
        if (want === null) expect(got).toBeNull();
        else expect(Math.abs((got as number) - want)).toBeLessThan(1e-9);
      }
      expect(m.flickersMerged).toBe(e.flickersMergedLit + e.flickersMergedEarth);
      expect(m.landing.ok).toBe(e.landingOk);
      expect(m.verdict).toBe(String(c.expect.metrics.verdict).toLowerCase());
      expect(m.reason).toBe(c.expect.metrics.reason);

      for (const kind of Object.keys(c.expect.events) as EventKind[]) {
        const want = c.expect.events[kind];
        const got = findEvent(ctx, eph, t0, kind, s);
        if (want === null) {
          expect(got).toBeNull();
        } else {
          expect(got).not.toBeNull();
          const d = Math.abs((got as number) - Date.parse(want)) / 1000;
          track("eventSec", d);
          expect(d).toBeLessThanOrEqual(60);
        }
      }
    }, 60_000);
  }

  it("reports max deltas", () => {
    console.log("MAX_DELTAS", JSON.stringify(max));
  });
});
