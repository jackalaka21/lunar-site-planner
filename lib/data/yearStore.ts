import type { Fetcher } from "./fetchers";

export const HOUR_MS = 3_600_000;

/** Loaded per-year hourly arrays, with in-flight de-duplication. */
export class YearStore<T extends ArrayLike<number>> {
  private readonly loaded = new Map<number, T>();
  private readonly inflight = new Map<number, Promise<void>>();

  constructor(
    private readonly f: Fetcher,
    private readonly pathOf: (year: number) => string,
    private readonly decode: (b: ArrayBuffer) => T,
    readonly firstYear: number,
    readonly lastYear: number,
  ) {}

  get(year: number): T | undefined {
    return this.loaded.get(year);
  }

  /** Load every year spanning [fromMs - 1 h, toMs + 1 h], clamped to the available years. */
  async ensure(fromMs: number, toMs: number): Promise<void> {
    const lo = Math.max(this.firstYear, new Date(Math.min(fromMs, toMs) - HOUR_MS).getUTCFullYear());
    const hi = Math.min(this.lastYear, new Date(Math.max(fromMs, toMs) + HOUR_MS).getUTCFullYear());
    const jobs: Promise<void>[] = [];
    for (let y = lo; y <= hi; y++) jobs.push(this.load(y));
    await Promise.all(jobs);
  }

  private load(year: number): Promise<void> {
    if (this.loaded.has(year)) return Promise.resolve();
    let p = this.inflight.get(year);
    if (!p) {
      p = this.f(this.pathOf(year))
        .then((b) => {
          this.loaded.set(year, this.decode(b));
        })
        .finally(() => this.inflight.delete(year));
      this.inflight.set(year, p);
    }
    return p;
  }
}
