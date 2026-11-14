import type { StationSource } from "../engine/types";
import type { Fetcher } from "./fetchers";
import { HOUR_MS, YearStore } from "./yearStore";

const FIRST_YEAR = 1969;
const LAST_YEAR = 2035;

/** Moon elevation (whole degrees, signed) at Goldstone, Madrid, Canberra, hourly; interpolated linearly. */
export class Dsn implements StationSource {
  private readonly years: YearStore<Int8Array>;

  private constructor(f: Fetcher) {
    this.years = new YearStore<Int8Array>(f, (y) => `dsn/${y}.bin`, (b) => new Int8Array(b), FIRST_YEAR, LAST_YEAR);
  }

  static open(f: Fetcher): Dsn {
    return new Dsn(f);
  }

  ensure(fromMs: number, toMs: number): Promise<void> {
    return this.years.ensure(fromMs, toMs);
  }

  private at(hourMs: number, k: number): number {
    const year = new Date(hourMs).getUTCFullYear();
    const data = this.years.get(year);
    if (!data) throw new RangeError(`DSN year ${year} is not loaded`);
    const i = (hourMs - Date.UTC(year, 0, 1)) / HOUR_MS;
    if (3 * i + 3 > data.length) throw new RangeError(`DSN record ${i} missing in ${year}`);
    return data[3 * i + k];
  }

  moonElDeg(tMs: number): [number, number, number] {
    if (!(tMs >= Date.UTC(FIRST_YEAR, 0, 1) && tMs <= Date.UTC(LAST_YEAR, 11, 31, 23))) {
      throw new RangeError(`Time ${tMs} is outside DSN coverage`);
    }
    const h0 = Math.floor(tMs / HOUR_MS) * HOUR_MS;
    const frac = (tMs - h0) / HOUR_MS;
    const out: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const a = this.at(h0, k);
      out[k] = frac === 0 ? a : a + (this.at(h0 + HOUR_MS, k) - a) * frac;
    }
    return out;
  }
}
