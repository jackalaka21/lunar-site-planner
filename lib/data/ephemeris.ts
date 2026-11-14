import type { BodyId, EphemerisSource, Vec3 } from "../engine/types";
import { fetchJson, type Fetcher } from "./fetchers";
import { HOUR_MS, YearStore } from "./yearStore";

interface EphemerisIndex {
  epochUtc: string;
  firstYear: number;
  lastYear: number;
}

/** Hourly Sun/Earth positions (km, Moon-centred MOON_ME, apparent), linearly interpolated. */
export class Ephemeris implements EphemerisSource {
  private constructor(
    private readonly years: YearStore<Float32Array>,
    private readonly epochMs: number,
    private readonly startMs: number,
    private readonly endMs: number,
  ) {}

  static async open(f: Fetcher): Promise<Ephemeris> {
    const idx = await fetchJson<EphemerisIndex>(f, "ephemeris/index.json");
    const epochMs = Date.parse(idx.epochUtc);
    const years = new YearStore<Float32Array>(
      f,
      (y) => `ephemeris/${y}.bin`,
      (b) => new Float32Array(b),
      idx.firstYear,
      idx.lastYear,
    );
    return new Ephemeris(years, epochMs, Date.UTC(idx.firstYear, 0, 1), Date.UTC(idx.lastYear, 11, 31, 23));
  }

  coverage(): [number, number] {
    return [this.startMs, this.endMs];
  }

  ensure(fromMs: number, toMs: number): Promise<void> {
    return this.years.ensure(fromMs, toMs);
  }

  private record(hour: number): Float32Array {
    const hourMs = this.epochMs + hour * HOUR_MS;
    const year = new Date(hourMs).getUTCFullYear();
    const data = this.years.get(year);
    if (!data) throw new RangeError(`Ephemeris year ${year} is not loaded`);
    const i = (hourMs - Date.UTC(year, 0, 1)) / HOUR_MS;
    if (6 * i + 6 > data.length) throw new RangeError(`Ephemeris record ${i} missing in ${year}`);
    return data.subarray(6 * i, 6 * i + 6);
  }

  bodyAt(body: BodyId, tMs: number): Vec3 {
    if (!(tMs >= this.startMs && tMs <= this.endMs)) {
      throw new RangeError(`Time ${tMs} is outside ephemeris coverage`);
    }
    const hour = Math.floor((tMs - this.epochMs) / HOUR_MS);
    const frac = (tMs - this.epochMs - hour * HOUR_MS) / HOUR_MS;
    const o = body === "sun" ? 0 : 3;
    const a = this.record(hour);
    if (frac === 0) return [a[o], a[o + 1], a[o + 2]];
    const b = this.record(hour + 1);
    return [
      a[o] + (b[o] - a[o]) * frac,
      a[o + 1] + (b[o + 1] - a[o + 1]) * frac,
      a[o + 2] + (b[o + 2] - a[o + 2]) * frac,
    ];
  }
}
