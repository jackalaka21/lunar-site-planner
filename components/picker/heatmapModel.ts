import { psToXY } from "../../lib/data/ps";
import { rampLegend, rampStep, RAMP_EDGES_PCT, RAMP_STEPS } from "../calendar/calendarModel";
import { southToPixel } from "./projection";

export { rampLegend, rampStep, RAMP_EDGES_PCT, RAMP_STEPS };

/** Spacing of the LOLA horizon grid the heatmap samples, in metres (horizons/grid/index.json spacingM). */
export const HEATMAP_GRID_SPACING_M = 2000;

/** Fill opacity of a heatmap cell, so the basemap stays readable beneath it. */
export const HEATMAP_FILL_OPACITY = 0.82;

export const DEFAULT_HEATMAP_RADIUS_KM = 20;

export interface HeatmapPoint {
  lat: number;
  lon: number;
  bothH: number;
}

export interface ProjectedHeatmapCell extends HeatmapPoint {
  x: number;
  y: number;
  step: number;
  fill: string;
  distKm: number;
}

/** GeoJSON Polygon feature for one permanent-shadow region (rings are [lon, lat]). */
export interface PsrFeature {
  type: "Feature";
  properties: { areaKm2: number };
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
}

/** GeoJSON FeatureCollection written by pipeline/lsp/psr.py. */
export interface PsrOverlayData {
  type: "FeatureCollection";
  metadata: { source_url: string; citation: string; threshold: string; [key: string]: unknown };
  features: PsrFeature[];
}

/** Polar stereographic Euclidean distance in kilometres between two south-polar points. */
export function psDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = psToXY(lat1, lon1);
  const b = psToXY(lat2, lon2);
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
    return Infinity;
  }
  return Math.hypot(a.x - b.x, a.y - b.y) / 1000;
}

/** Filter candidate points to those within `radiusKm` (default 20 km) of `(refLat, refLon)` in PS coordinates. */
export function filterWithinRadius<T extends { lat: number; lon: number }>(
  points: readonly T[],
  refLat: number,
  refLon: number,
  radiusKm = DEFAULT_HEATMAP_RADIUS_KM,
): T[] {
  if (!Number.isFinite(refLat) || !Number.isFinite(refLon) || refLat >= 0) return [];
  const center = psToXY(refLat, refLon);
  if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) return [];
  const maxM = radiusKm * 1000 + 1e-6;
  return points.filter((p) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || p.lat >= 0) return false;
    const pt = psToXY(p.lat, p.lon);
    return Number.isFinite(pt.x) && Number.isFinite(pt.y) && Math.hypot(pt.x - center.x, pt.y - center.y) <= maxM;
  });
}

/** Theme ramp colour for a step: --color-heat-0 (red, no Sun and Earth overlap) to --color-heat-4 (green, most overlap). */
export function heatmapStepFill(step: number): string {
  const clamped = Math.max(0, Math.min(RAMP_STEPS - 1, Math.round(step)));
  return `var(--color-heat-${clamped})`;
}

/** Legend for the ramp: end captions and one hour range per step, from the same thresholds as rampStep. */
export function heatmapLegend(windowH: number): { low: string; high: string; steps: { fill: string; label: string }[] } {
  const labels = rampLegend(windowH);
  const topEdgeH = Math.round((windowH * RAMP_EDGES_PCT[RAMP_EDGES_PCT.length - 1]) / 100);
  return {
    low: "0 h, no overlap",
    high: `${topEdgeH}+ h Sun + Earth`,
    steps: labels.map((label, i) => ({ fill: heatmapStepFill(i), label: `${label} h` })),
  };
}

/** Project heatmap points within `radiusKm` onto the south-polar map SVG (`size` x `size`) with the 5-step red to green ramp. */
export function projectHeatmapCells(
  points: readonly HeatmapPoint[],
  refLat: number,
  refLon: number,
  windowH: number,
  size: number,
  radiusKm = DEFAULT_HEATMAP_RADIUS_KM,
): ProjectedHeatmapCell[] {
  const within = filterWithinRadius(points, refLat, refLon, radiusKm);
  const out: ProjectedHeatmapCell[] = [];
  for (const p of within) {
    const px = southToPixel(p.lat, p.lon, size);
    if (!px) continue;
    const step = rampStep(p.bothH, windowH);
    out.push({
      lat: p.lat,
      lon: p.lon,
      bothH: p.bothH,
      x: px.x,
      y: px.y,
      step,
      fill: heatmapStepFill(step),
      distKm: psDistanceKm(refLat, refLon, p.lat, p.lon),
    });
  }
  return out;
}

/** Convert PSR GeoJSON features into SVG path data (even-odd, holes preserved) in south-polar map coordinates. */
export function projectPsrPolygons(
  features: readonly PsrFeature[],
  size: number,
): Array<{ id: string; name: string; d: string }> {
  const out: Array<{ id: string; name: string; d: string }> = [];
  features.forEach((feature, i) => {
    const parts: string[] = [];
    for (const ring of feature.geometry.coordinates) {
      const pts = ring
        .map(([lon, lat]) => southToPixel(lat, lon, size))
        .filter((p): p is { x: number; y: number } => p !== null);
      if (pts.length < 3) continue;
      parts.push(`M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("L")}Z`);
    }
    if (parts.length === 0) return;
    out.push({
      id: `psr-${i}`,
      name: `Permanent shadow, ${feature.properties.areaKm2.toFixed(1)} km²`,
      d: parts.join(""),
    });
  });
  return out;
}
