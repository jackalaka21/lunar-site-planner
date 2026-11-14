import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { CSV_HEADER, downloadScenarioCsv, scenarioToCsv } from "../../lib/csv";
import { Ephemeris } from "../../lib/data/ephemeris";
import { HorizonStore, resolveSiteContext } from "../../lib/data/horizons";
import { nodeFetchers } from "../../lib/data/nodeFetchers";
import { loadSites } from "../../lib/data/sites";
import { landingCheck, metrics, sample, type SiteContext } from "../../lib/engine";
import { DEFAULT_SETTINGS } from "../../lib/engine/settings";

const T0 = Date.UTC(2027, 0, 10);
let eph: Ephemeris;
let ctx: SiteContext;

beforeAll(async () => {
  eph = await Ephemeris.open(nodeFetchers);
  await eph.ensure(T0 - 3_600_000, T0 + 16 * 86_400_000);
  const cat = await loadSites(nodeFetchers);
  const store = await HorizonStore.open(nodeFetchers);
  ctx = await resolveSiteContext({ kind: "catalog", id: "connecting-ridge" }, cat, store, 2);
});

describe("CSV export and PSR overlay", () => {
  it("produces header, series.n sample rows, and a # summary footer with expected values", () => {
    const s = DEFAULT_SETTINGS;
    const series = sample(ctx, eph, T0, s.durationDays * 24, 10, s);
    const m = metrics(series, landingCheck(ctx, eph, T0, s), s);
    const csv = scenarioToCsv(
      { name: "Connecting Ridge", lat: ctx.lat, lon: ctx.lon, t0Ms: T0 },
      series,
      m,
    );
    const lines = csv.split("\n");
    expect(lines.length).toBe(series.n + 2);
    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines[0]).toBe(
      "utc,sun_az,sun_el,sun_visible_pct,eclipse_pct,earth_az,earth_el,earth_in_view,solar_interference,power_proxy,lit,both",
    );

    const firstRow = lines[1].split(",");
    expect(firstRow.length).toBe(12);
    expect(firstRow[0]).toBe(new Date(T0).toISOString());
    expect(Number(firstRow[1])).toBeCloseTo(series.sunAz[0], 2);
    expect(Number(firstRow[2])).toBeCloseTo(series.sunEl[0], 2);
    expect(Number(firstRow[3])).toBeCloseTo(series.sunFrac[0] * 100, 1);

    const summary = lines[lines.length - 1];
    expect(summary.startsWith("# summary,")).toBe(true);
    expect(summary).toContain(`verdict=${m.verdict}`);
    expect(summary).toContain(`both_h=${m.bothH.toFixed(2)}`);
    expect(summary).toContain(`sunlit_h=${m.sunlitH.toFixed(2)}`);
  });

  it("downloadScenarioCsv triggers download and returns CSV string", () => {
    const s = { ...DEFAULT_SETTINGS, durationDays: 1 };
    const series = sample(ctx, eph, T0, 24, 10, s);
    const m = metrics(series, landingCheck(ctx, eph, T0, s), s);
    const csv = downloadScenarioCsv(
      { name: "Connecting Ridge", lat: ctx.lat, lon: ctx.lon, t0Ms: T0 },
      series,
      m,
    );
    expect(csv.split("\n").length).toBe(series.n + 2);
  });

  it("PSR overlay file is <= 1 MB and all polygon vertices have lat <= -80", () => {
    const psrPath = join(process.cwd(), "public/data/v1/overlays/psr.json");
    const stat = statSync(psrPath);
    expect(stat.size).toBeLessThanOrEqual(1_000_000);
    const doc = JSON.parse(readFileSync(psrPath, "utf8")) as {
      sourceUrl: string;
      polygons: Array<{ id: string; ring: Array<[number, number]> }>;
    };
    expect(doc.sourceUrl).toContain("pgda.gsfc.nasa.gov");
    expect(doc.polygons.length).toBeGreaterThanOrEqual(10);
    for (const poly of doc.polygons) {
      expect(poly.ring.length).toBeGreaterThanOrEqual(8);
      for (const [lat] of poly.ring) {
        expect(lat).toBeLessThanOrEqual(-80);
      }
    }
  });
});
