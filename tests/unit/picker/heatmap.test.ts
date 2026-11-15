import { describe, expect, it } from "vitest";
import {
  DEFAULT_HEATMAP_RADIUS_KM,
  filterWithinRadius,
  heatmapLegend,
  heatmapStepFill,
  projectHeatmapCells,
  psDistanceKm,
  rampStep,
} from "../../../components/picker/heatmapModel";
import { nodeFetchers } from "../../../lib/data/nodeFetchers";
import { psToLatLon } from "../../../lib/data/ps";
import { loadSites } from "../../../lib/data/sites";
import { DEFAULT_SETTINGS } from "../../../lib/engine/settings";
import { createEngineHandlers } from "../../../workers/engineHandlers";

const T0 = Date.UTC(2027, 0, 14, 6);

describe("nearby heatmap (S4)", () => {
  it("heatmap returns only points within radius", async () => {
    const api = createEngineHandlers(nodeFetchers);
    await api.init();
    const catalog = await loadSites(nodeFetchers);
    const site = catalog.byId.get("connecting-ridge")!;
    const radiusKm = DEFAULT_HEATMAP_RADIUS_KM;

    const pts = await api.heatmap({
      ref: { kind: "catalog", id: "connecting-ridge" },
      t0Ms: T0,
      radiusKm,
      settings: { ...DEFAULT_SETTINGS, durationDays: 3 },
    });

    expect(pts.length).toBeGreaterThan(0);
    for (const p of pts) {
      expect(psDistanceKm(site.lat, site.lon, p.lat, p.lon)).toBeLessThanOrEqual(radiusKm + 1e-6);
      expect(p.bothH).toBeGreaterThanOrEqual(0);
    }

    // Pure filter helper also drops synthetic points outside radiusKm.
    const inside = psToLatLon(5_000, 0);
    const edge = psToLatLon(20_000, 0);
    const outside = psToLatLon(25_000, 0);
    const pole = psToLatLon(0, 0);
    const filtered = filterWithinRadius(
      [
        { ...inside, bothH: 100 },
        { ...edge, bothH: 200 },
        { ...outside, bothH: 300 },
      ],
      pole.lat,
      pole.lon,
      20,
    );
    expect(filtered).toHaveLength(2);
    expect(filtered.map((x) => x.bothH)).toEqual([100, 200]);
  });

  it("maps bothH to the 5-step red to green ramp without hex literals", () => {
    const windowH = 336;
    expect(rampStep(0, windowH)).toBe(0);
    expect(rampStep(70, windowH)).toBe(1);
    expect(rampStep(120, windowH)).toBe(2);
    expect(rampStep(200, windowH)).toBe(3);
    expect(rampStep(300, windowH)).toBe(4);

    for (let s = 0; s < 5; s++) {
      const fill = heatmapStepFill(s);
      expect(fill).toBe(`var(--color-heat-${s})`);
      expect(fill).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }

    expect(heatmapStepFill(-3)).toBe("var(--color-heat-0)");
    expect(heatmapStepFill(9)).toBe("var(--color-heat-4)");

    const pole = psToLatLon(0, 0);
    const cells = projectHeatmapCells([{ lat: pole.lat, lon: pole.lon, bothH: 300 }], pole.lat, pole.lon, windowH, 400);
    expect(cells).toHaveLength(1);
    expect(cells[0].step).toBe(4);
    expect(cells[0].fill).toBe("var(--color-heat-4)");
    expect(cells[0].x).toBeCloseTo(200, 3);
    expect(cells[0].y).toBeCloseTo(200, 3);
  });

  it("builds a legend from the real step thresholds", () => {
    const lg = heatmapLegend(336);
    expect(lg.low).toBe("0 h, no overlap");
    expect(lg.high).toBe("252+ h Sun + Earth");
    expect(lg.steps).toHaveLength(5);
    expect(lg.steps[0].fill).toBe("var(--color-heat-0)");
    expect(lg.steps[4].fill).toBe("var(--color-heat-4)");
    expect(lg.steps[4].label).toBe("252+ h");
    expect(lg.steps.map((st) => st.label)).toEqual(["under 68 h", "68 to 117 h", "118 to 167 h", "168 to 251 h", "252+ h"]);
  });

  it("puts legend edges at 68/118/168/252 for 336 h and 34/59/84/126 for 168 h", () => {
    const edges = (w: number) => heatmapLegend(w).steps.slice(1).map((st) => Number.parseInt(st.label, 10));
    expect(edges(336)).toEqual([68, 118, 168, 252]);
    expect(edges(168)).toEqual([34, 59, 84, 126]);
    const pole = psToLatLon(0, 0);
    const step = (h: number) => projectHeatmapCells([{ lat: pole.lat, lon: pole.lon, bothH: h }], pole.lat, pole.lon, 336, 400)[0].step;
    expect(step(67.6)).toBe(1);
    expect(step(67.4)).toBe(0);
  });
});
