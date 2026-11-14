import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  EPOCH_MS,
  HOUR_MS,
  R_EARTH_KM,
  R_SUN_KM,
  STEP_MS,
  discFraction,
  horizonAt,
  siteFrame,
  sunBlockedByEarth,
  topocentric,
  type HorizonProfile,
  type Vec3,
} from "../../../lib/engine";

interface Sample {
  i: number;
  sunAz: number;
  sunEl: number;
  sunFrac: number;
  earthAz: number;
  earthEl: number;
  eclipseFrac: number;
  earthIn: boolean;
  lit: boolean;
}
interface Case {
  name: string;
  lat: number;
  lon: number;
  hDemM: number;
  horizon: { stepDeg: number; values: number[] };
  t0Utc: string;
  settings: { mastM: number; earthMarginDeg: number; litThreshold: "any" | "half" | "full" };
  expect: { samplesAt: Sample[] };
}

const root = path.resolve(__dirname, "../../..");
const ephDir = path.join(root, "public/data/v1/ephemeris");

// Minimal local reader (Task 11 builds the real loader): all years concatenated as float64.
function loadEphemeris(): Float64Array {
  const idx = JSON.parse(readFileSync(path.join(ephDir, "index.json"), "utf8")) as {
    firstYear: number;
    lastYear: number;
  };
  const parts: Float64Array[] = [];
  let total = 0;
  for (let y = idx.firstYear; y <= idx.lastYear; y++) {
    const buf = readFileSync(path.join(ephDir, `${y}.bin`));
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const a = new Float64Array(buf.byteLength / 4);
    for (let k = 0; k < a.length; k++) a[k] = dv.getFloat32(k * 4, true);
    parts.push(a);
    total += a.length;
  }
  const all = new Float64Array(total);
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return all;
}

function bodiesAt(eph: Float64Array, tMs: number): { sun: Vec3; earth: Vec3 } {
  const off = tMs - EPOCH_MS;
  const h = Math.floor(off / HOUR_MS);
  const frac = (off - h * HOUR_MS) / HOUR_MS;
  const a = h * 6;
  const b = Math.min(h + 1, eph.length / 6 - 1) * 6;
  const at = (j: number): number => eph[a + j] * (1 - frac) + eph[b + j] * frac;
  return { sun: [at(0), at(1), at(2)], earth: [at(3), at(4), at(5)] };
}

const cases = (
  JSON.parse(readFileSync(path.join(root, "tests/fixtures/engine_cases.json"), "utf8")) as {
    cases: Case[];
  }
).cases;

describe("engine fixture parity (Python reference)", () => {
  const eph = loadEphemeris();
  const max = { sunAz: 0, sunEl: 0, earthAz: 0, earthEl: 0, sunFrac: 0, eclipseFrac: 0 };

  for (const c of cases) {
    it(c.name, () => {
      const frame = siteFrame(c.lat, c.lon, c.hDemM, c.settings.mastM);
      const horizon: HorizonProfile = {
        stepDeg: c.horizon.stepDeg,
        elevDeg: Float64Array.from(c.horizon.values),
      };
      const t0 = Date.parse(c.t0Utc);
      for (const s of c.expect.samplesAt) {
        const { sun, earth } = bodiesAt(eph, t0 + s.i * STEP_MS);
        const ts = topocentric(sun, frame, R_SUN_KM);
        const te = topocentric(earth, frame, R_EARTH_KM);
        const ecl = sunBlockedByEarth(ts, te);
        const frac = discFraction(ts.el, horizonAt(horizon, ts.az), ts.r) * (1 - ecl);
        const dAz = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
        const d = {
          sunAz: dAz(ts.az, s.sunAz),
          sunEl: Math.abs(ts.el - s.sunEl),
          earthAz: dAz(te.az, s.earthAz),
          earthEl: Math.abs(te.el - s.earthEl),
          sunFrac: Math.abs(frac - s.sunFrac),
          eclipseFrac: Math.abs(ecl - s.eclipseFrac),
        };
        for (const k of Object.keys(d) as (keyof typeof d)[]) max[k] = Math.max(max[k], d[k]);
        expect(d.sunAz).toBeLessThan(1e-6);
        expect(d.sunEl).toBeLessThan(1e-6);
        expect(d.earthAz).toBeLessThan(1e-6);
        expect(d.earthEl).toBeLessThan(1e-6);
        expect(d.sunFrac).toBeLessThan(1e-9);
        expect(d.eclipseFrac).toBeLessThan(1e-9);
      }
    });
  }

  it("reports max deltas", () => {
    console.log("MAX_DELTAS", JSON.stringify(max));
  });
});
