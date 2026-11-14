import { psToLatLon, psToXY } from "../../lib/data/ps";

/** Half-width of the south polar basemap in polar stereographic metres (basemaps/index.json). */
export const SOUTH_RADIUS_M = 190000;

export interface Point {
  x: number;
  y: number;
}

/**
 * South view: square image of `size` pixels, the pole at the centre, 0 E at the top (+y up), 90 E to the right.
 * Returns null for points outside the image.
 */
export function southToPixel(lat: number, lon: number, size: number): Point | null {
  const { x, y } = psToXY(lat, lon);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > SOUTH_RADIUS_M || Math.abs(y) > SOUTH_RADIUS_M) return null;
  return { x: ((x / SOUTH_RADIUS_M + 1) / 2) * size, y: ((1 - y / SOUTH_RADIUS_M) / 2) * size };
}

export function southFromPixel(px: number, py: number, size: number): { lat: number; lon: number } {
  const x = (px / size) * 2 * SOUTH_RADIUS_M - SOUTH_RADIUS_M;
  const y = SOUTH_RADIUS_M - (py / size) * 2 * SOUTH_RADIUS_M;
  return psToLatLon(x, y);
}

/** Global view: equirectangular, lon -180..180 left to right, lat +90 at the top. */
export function globalToPixel(lat: number, lon: number, w: number, h: number): Point {
  return { x: ((lon + 180) / 360) * w, y: ((90 - lat) / 180) * h };
}

export function globalFromPixel(px: number, py: number, w: number, h: number): { lat: number; lon: number } {
  return { lat: 90 - (py / h) * 180, lon: (px / w) * 360 - 180 };
}

/** Longest 1, 2 or 5 times a power of ten that fits in maxPx. */
export function scaleBar(metresPerPx: number, maxPx: number): { lengthM: number; px: number; label: string } {
  const maxM = metresPerPx * maxPx;
  const pow = 10 ** Math.floor(Math.log10(maxM));
  const lengthM = [5, 2, 1].map((m) => m * pow).find((m) => m <= maxM) ?? pow;
  const label = lengthM >= 1000 ? `${lengthM / 1000} km` : `${lengthM} m`;
  return { lengthM, px: lengthM / metresPerPx, label };
}
