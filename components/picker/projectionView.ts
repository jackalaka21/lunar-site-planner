/** Pan and zoom maths for the scenario map. Pure, so it is unit tested without a DOM. */

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 12;

/** Zoom 1 shows the whole basemap. cx, cy is the centre of the visible box in map user units. */
export interface MapView {
  zoom: number;
  cx: number;
  cy: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const clampZoom = (z: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

/** Size of the visible box at zoom 1: the whole base image, widened to the container aspect (width / height). */
export function fitSize(baseW: number, baseH: number, aspect: number): { w: number; h: number } {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : baseW / baseH;
  const w = Math.max(baseW, baseH * a);
  return { w, h: w / a };
}

/** The SVG viewBox for a view. Its aspect equals the container aspect, so nothing is letterboxed. */
export function viewBoxOf(view: MapView, baseW: number, baseH: number, aspect: number): Box {
  const fit = fitSize(baseW, baseH, aspect);
  const w = fit.w / view.zoom;
  const h = fit.h / view.zoom;
  return { x: view.cx - w / 2, y: view.cy - h / 2, w, h };
}

/** Keep the centre on the image. */
export function clampView(view: MapView, baseW: number, baseH: number): MapView {
  return {
    zoom: clampZoom(view.zoom),
    cx: Math.max(0, Math.min(baseW, view.cx)),
    cy: Math.max(0, Math.min(baseH, view.cy)),
  };
}

export function homeView(baseW: number, baseH: number): MapView {
  return { zoom: MIN_ZOOM, cx: baseW / 2, cy: baseH / 2 };
}

/** Multiply the zoom by `factor` keeping the map point under (fx, fy) fixed. fx, fy are 0..1 across the container. */
export function zoomAbout(
  view: MapView,
  factor: number,
  fx: number,
  fy: number,
  baseW: number,
  baseH: number,
  aspect: number,
): MapView {
  const before = viewBoxOf(view, baseW, baseH, aspect);
  const ux = before.x + fx * before.w;
  const uy = before.y + fy * before.h;
  const zoom = clampZoom(view.zoom * factor);
  const fit = fitSize(baseW, baseH, aspect);
  const w = fit.w / zoom;
  const h = fit.h / zoom;
  return clampView({ zoom, cx: ux - fx * w + w / 2, cy: uy - fy * h + h / 2 }, baseW, baseH);
}

/** Zoom at which the shorter side of the visible box spans `spanUnits` map units. */
export function zoomForSpan(spanUnits: number, baseW: number, baseH: number, aspect: number): number {
  const fit = fitSize(baseW, baseH, aspect);
  return clampZoom(Math.min(fit.w, fit.h) / Math.max(spanUnits, 1e-6));
}

/** Ease-in-out for the viewBox animation. */
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Interpolate between views; zoom moves geometrically so the animation feels even. */
export function lerpView(a: MapView, b: MapView, t: number): MapView {
  return {
    zoom: a.zoom * (b.zoom / a.zoom) ** t,
    cx: a.cx + (b.cx - a.cx) * t,
    cy: a.cy + (b.cy - a.cy) * t,
  };
}
