import { psToXY } from "../../lib/data/ps";
import { rampStep, RAMP_STEPS } from "../calendar/calendarModel";
import { southToPixel } from "./projection";

export { rampStep, RAMP_STEPS };

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

export interface PsrPolygon {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
  floorM?: number;
  rimM?: number;
  ring: [number, number][];
}

export interface PsrOverlayData {
  source: string;
  sourceUrl: string;
  polygons: PsrPolygon[];
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

/** 5-step luminance fill: step 0 = deepest surface, step 4 = primary ink. */
export function heatmapStepFill(step: number): string {
  const clamped = Math.max(0, Math.min(RAMP_STEPS - 1, Math.round(step)));
  return `color-mix(in srgb, var(--color-text-primary) ${(clamped * 100) / (RAMP_STEPS - 1)}%, var(--surface-deepest))`;
}

/** Project heatmap points within `radiusKm` onto the south-polar map SVG (`size` x `size`) with 5-step luminance fill. */
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

/** Convert PSR polygons into SVG `<polygon points="...">` strings in south-polar map coordinates. */
export function projectPsrPolygons(
  polygons: readonly PsrPolygon[],
  size: number,
): Array<{ id: string; name: string; points: string }> {
  const out: Array<{ id: string; name: string; points: string }> = [];
  for (const poly of polygons) {
    const pts = poly.ring
      .map(([lat, lon]) => southToPixel(lat, lon, size))
      .filter((p): p is { x: number; y: number } => p !== null);
    if (pts.length < 3) continue;
    out.push({
      id: poly.id,
      name: poly.name,
      points: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),
    });
  }
  return out;
}
