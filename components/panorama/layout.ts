import type { HorizonProfile } from "../../lib/engine/types";
import type { TimeSeries } from "../../lib/engine/sample";

export interface AzEl {
  az: number;
  el: number;
}

const MIN_SPAN_DEG = 3;
const PAD_DEG = 0.5;
/** Samples this far below the lowest terrain are off-screen and do not stretch the shared domain. */
const OFFSCREEN_MARGIN_DEG = 1;

const mod = (v: number, m: number) => ((v % m) + m) % m;

/** Azimuth to canvas x (px). centerAz sits mid-canvas; the seam is at centerAz +/- 180. Wraps. */
export function azToX(az: number, width: number, centerAz = 180): number {
  return (mod(az - centerAz + 180, 360) / 360) * width;
}

/** Elevation to canvas y (px): domain top at 0, bottom at height. */
export function elScale(domain: [number, number], height: number): (el: number) => number {
  const [lo, hi] = domain;
  const span = hi - lo || 1;
  return (el) => height * (1 - (el - lo) / span);
}

/**
 * Elevation domain shared by every compared site: [min - 0.5, max + 0.5] deg over terrain and the visible
 * part of the Sun and Earth tracks, widened symmetrically to a span of at least 3 deg.
 */
export function sharedElDomain(
  items: Array<{ horizon: HorizonProfile; series: TimeSeries }>,
): [number, number] {
  let hMin = Infinity;
  for (const { horizon } of items) for (const v of horizon.elevDeg) if (v < hMin) hMin = v;
  if (!Number.isFinite(hMin)) hMin = 0;
  let lo = hMin;
  let hi = -Infinity;
  for (const { horizon } of items) for (const v of horizon.elevDeg) if (v > hi) hi = v;
  if (!Number.isFinite(hi)) hi = 0;
  const floor = hMin - OFFSCREEN_MARGIN_DEG;
  for (const { series } of items) {
    for (const arr of [series.sunEl, series.earthEl]) {
      for (let i = 0; i < series.n; i++) {
        const v = arr[i];
        if (!(v >= floor)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
  }
  lo -= PAD_DEG;
  hi += PAD_DEG;
  const span = hi - lo;
  if (span < MIN_SPAN_DEG) {
    const extra = (MIN_SPAN_DEG - span) / 2;
    lo -= extra;
    hi += extra;
  }
  return [lo, hi];
}

/** Vertical exaggeration: (px per deg vertically) / (px per deg horizontally), integer >= 1. */
export function exaggeration(width: number, height: number, domain: [number, number]): number {
  const span = domain[1] - domain[0];
  if (!(span > 0) || !(width > 0)) return 1;
  return Math.max(1, Math.round(height / span / (width / 360)));
}

/** Splits a path where it crosses the canvas seam so no segment is drawn across the whole panorama. */
export function splitAtWrap(points: AzEl[], centerAz = 180): AzEl[][] {
  const out: AzEl[][] = [];
  let cur: AzEl[] = [];
  let prev = 0;
  for (const p of points) {
    const rel = mod(p.az - centerAz + 180, 360);
    if (cur.length > 0 && Math.abs(rel - prev) > 180) {
      out.push(cur);
      cur = [];
    }
    cur.push(p);
    prev = rel;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

/** Same colour with the given alpha. Handles hex (3, 6, 8 digits) and rgb()/rgba(); anything else is returned as is. */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  if (c.startsWith("#")) {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((ch) => ch + ch).join("");
    if (h.length === 6 || h.length === 8) {
      const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
      return `rgba(${n(0)}, ${n(2)}, ${n(4)}, ${alpha})`;
    }
    return c;
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(c);
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})` : c;
}
