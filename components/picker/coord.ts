import { normaliseLon } from "../../lib/state/url";

export type CoordParse =
  | { ok: true; lat: number; lon: number }
  | { ok: false; error: string; field: "lat" | "lon" };

/** Plain decimal degrees: optional sign, digits, optional fraction. No exponents, no words. */
const DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
/** The share link keeps three decimals, so the picker does too. */
const round3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

function read(text: string): number | null {
  const t = text.replace(/°/g, "").trim();
  return DECIMAL.test(t) ? Number(t) : null;
}

/**
 * Decimal degrees, south and west negative. Longitude may be given as -180 to 360 and is wrapped into
 * [-180, 180): 360 is 0, and both 180 and -180 are -180. At either pole longitude has no meaning, so it is 0.
 */
export function parseCoord(latText: string, lonText: string): CoordParse {
  const lat = read(latText);
  if (lat === null) return { ok: false, field: "lat", error: "Latitude must be a number, for example -85.3" };
  if (lat < -90 || lat > 90) return { ok: false, field: "lat", error: "Latitude must be -90 to 90°" };
  const lon = read(lonText);
  if (lon === null) return { ok: false, field: "lon", error: "Longitude must be a number, for example 31.2" };
  if (lon < -180 || lon > 360) return { ok: false, field: "lon", error: "Longitude must be -180 to 360°" };
  const rLat = round3(lat);
  const rLon = Math.abs(rLat) === 90 ? 0 : round3(normaliseLon(lon));
  return { ok: true, lat: rLat, lon: rLon };
}
