import { Dsn } from "../lib/data/dsn";
import { Ephemeris } from "../lib/data/ephemeris";
import type { Fetcher } from "../lib/data/fetchers";
import { HorizonStore, resolveSiteContext } from "../lib/data/horizons";
import { loadSites, type SiteCatalog } from "../lib/data/sites";
import {
  findEvent,
  heatmapValues,
  landingCheck,
  metrics,
  nextGoodDates,
  robustness,
  sample,
  scanDates,
  type DaySummary,
  type EventKind,
  type HorizonSource,
  type Metrics,
  type SiteContext,
  type TimeSeries,
} from "../lib/engine";
import type { Settings } from "../lib/engine/settings";
import type { SiteRef } from "../lib/state/url";

export interface EvaluateResult {
  ctx: {
    lat: number;
    lon: number;
    hDemM: number;
    obsHeightM: number;
    source: HorizonSource;
    horizonStepDeg: number;
    horizonDeg: Float32Array;
  };
  series: TimeSeries;
  metrics: Metrics;
}

export interface EngineApi {
  init(): Promise<void>;
  evaluate(req: { ref: SiteRef; t0Ms: number; settings: Settings }): Promise<EvaluateResult>;
  countdowns(req: { ref: SiteRef; fromMs: number; settings: Settings }): Promise<Record<EventKind, number | null>>;
  calendar(req: { ref: SiteRef; fromMs: number; days: number; settings: Settings }): Promise<DaySummary[]>;
  nextGood(req: { ref: SiteRef; fromMs: number; settings: Settings }): Promise<DaySummary[]>;
  robustness(req: { ref: SiteRef; t0Ms: number; settings: Settings }): Promise<ReturnType<typeof robustness>>;
  heatmap(req: {
    ref: SiteRef;
    t0Ms: number;
    radiusKm: number;
    settings: Settings;
  }): Promise<Array<{ lat: number; lon: number; bothH: number }>>;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const EVENT_KINDS: EventKind[] = ["sunset", "sunrise", "earthset", "earthrise"];
const CALENDAR_STEP_H = 24;
const NEXT_GOOD_DAYS = 365;
const EVAL_STEP_MIN = 10;

function gridContext(
  n: { lat: number; lon: number; hDemM: number; profile: SiteContext["horizon"] },
  mastM: number,
): SiteContext {
  return {
    lat: n.lat,
    lon: n.lon,
    hDemM: n.hDemM,
    obsHeightM: mastM,
    horizon: n.profile,
    source: { kind: "grid", distKm: 0, spacingKm: 0 },
  };
}

/** Engine request handlers over a data Fetcher. Plain async functions so tests run without a Worker. */
export function createEngineHandlers(f: Fetcher): EngineApi {
  let eph: Ephemeris | null = null;
  let store: HorizonStore | null = null;
  let catalog: SiteCatalog | null = null;
  let dsn: Dsn | null = null;
  let booting: Promise<void> | null = null;

  const init = (): Promise<void> => {
    if (!booting) {
      booting = (async () => {
        [eph, store, catalog] = await Promise.all([Ephemeris.open(f), HorizonStore.open(f), loadSites(f)]);
        dsn = Dsn.open(f);
      })().catch((e: unknown) => {
        booting = null; // allow a retry after a transient failure
        throw e;
      });
    }
    return booting;
  };

  async function deps(): Promise<{ eph: Ephemeris; store: HorizonStore; catalog: SiteCatalog; dsn: Dsn }> {
    await init();
    if (!eph || !store || !catalog || !dsn) throw new Error("Engine not initialised");
    return { eph, store, catalog, dsn };
  }

  async function context(ref: SiteRef, s: Settings): Promise<SiteContext> {
    const d = await deps();
    return resolveSiteContext(ref, d.catalog, d.store, s.mastM);
  }

  /** Load ephemeris years for [fromMs, toMs], clamped to coverage. */
  async function load(fromMs: number, toMs: number): Promise<Ephemeris> {
    const { eph: e } = await deps();
    const [lo, hi] = e.coverage();
    await e.ensure(Math.max(lo, fromMs), Math.min(hi, toMs));
    return e;
  }

  return {
    init,

    async evaluate({ ref, t0Ms, settings: s }) {
      const ctx = await context(ref, s);
      const e = await load(t0Ms - HOUR_MS, t0Ms + s.durationDays * DAY_MS);
      const { dsn: d } = await deps();
      if (s.dsnEnabled) await d.ensure(t0Ms, t0Ms + s.durationDays * DAY_MS);
      const series = sample(ctx, e, t0Ms, s.durationDays * 24, EVAL_STEP_MIN, s, s.dsnEnabled ? d : undefined);
      const m = metrics(series, landingCheck(ctx, e, t0Ms, s), s);
      return {
        ctx: {
          lat: ctx.lat,
          lon: ctx.lon,
          hDemM: ctx.hDemM,
          obsHeightM: ctx.obsHeightM,
          source: ctx.source,
          horizonStepDeg: ctx.horizon.stepDeg,
          horizonDeg: Float32Array.from(ctx.horizon.elevDeg),
        },
        series,
        metrics: m,
      };
    },

    async countdowns({ ref, fromMs, settings: s }) {
      const ctx = await context(ref, s);
      const e = await load(fromMs - HOUR_MS, fromMs + 61 * DAY_MS);
      const out = {} as Record<EventKind, number | null>;
      for (const k of EVENT_KINDS) out[k] = findEvent(ctx, e, fromMs, k, s);
      return out;
    },

    async calendar({ ref, fromMs, days, settings: s }) {
      const ctx = await context(ref, s);
      const e = await load(fromMs - HOUR_MS, fromMs + (days + s.durationDays) * DAY_MS);
      return scanDates(ctx, e, fromMs, days, CALENDAR_STEP_H, s);
    },

    async nextGood({ ref, fromMs, settings: s }) {
      const ctx = await context(ref, s);
      const e = await load(fromMs - HOUR_MS, fromMs + (NEXT_GOOD_DAYS + s.durationDays) * DAY_MS);
      return nextGoodDates(ctx, e, fromMs, s);
    },

    async robustness({ ref, t0Ms, settings: s }) {
      const ctx = await context(ref, s);
      const { store: st } = await deps();
      const e = await load(t0Ms - HOUR_MS, t0Ms + s.durationDays * DAY_MS);
      // Catalog sites sit off the grid, so neighbours are the grid nodes within ellipseKm (possibly none).
      const nodes = await st.neighbours(ctx.lat, ctx.lon, s.ellipseKm);
      return robustness(
        ctx,
        nodes.map((n) => gridContext(n, s.mastM)),
        e,
        t0Ms,
        s,
      );
    },

    async heatmap({ ref, t0Ms, radiusKm, settings: s }) {
      const ctx = await context(ref, s);
      const { store: st } = await deps();
      const e = await load(t0Ms - HOUR_MS, t0Ms + s.durationDays * DAY_MS);
      const nodes = await st.neighbours(ctx.lat, ctx.lon, radiusKm);
      return heatmapValues(
        nodes.map((n) => gridContext(n, s.mastM)),
        e,
        t0Ms,
        s,
      );
    },
  };
}

/** Buffers of an EvaluateResult, for Comlink.transfer. */
export function evaluateTransferables(r: EvaluateResult): ArrayBuffer[] {
  const t = r.series;
  const arrays = [
    t.sunAz,
    t.sunEl,
    t.sunFrac,
    t.eclipseFrac,
    t.earthAz,
    t.earthEl,
    t.earthIn,
    t.interference,
    t.power,
    t.lit,
    t.both,
    t.dsnBits,
    r.ctx.horizonDeg,
  ];
  return arrays.map((a) => a.buffer as ArrayBuffer);
}
