import { R_EARTH_KM, R_SUN_KM } from "./constants";
import { discFraction, sunBlockedByEarth, sunEarthSeparation } from "./disc";
import { siteFrame } from "./frame";
import { horizonAt } from "./horizon";
import type { Settings } from "./settings";
import { topocentric } from "./topo";
import type { EphemerisSource, SiteContext, SiteFrame, StationSource } from "./types";
import { toRad } from "./vec";

export interface TimeSeries {
  t0Ms: number;
  stepMs: number;
  n: number;
  sunAz: Float32Array;
  sunEl: Float32Array;
  sunFrac: Float32Array;
  eclipseFrac: Float32Array;
  earthAz: Float32Array;
  earthEl: Float32Array;
  /** Raw (unmerged) Earth-in-view state. */
  earthIn: Uint8Array;
  interference: Uint8Array;
  power: Float32Array;
  /** Raw (unmerged) lit state. */
  lit: Uint8Array;
  /** Lit AND Earth in view after flicker merging of both inputs (display convenience). */
  both: Uint8Array;
  dsnBits: Uint8Array;
  /** Set to the ephemeris coverage end when the window was cut short. */
  clippedAtMs: number | null;
}

const LIT_FULL_FRACTION = 0.99;

export function isLit(frac: number, threshold: Settings["litThreshold"]): boolean {
  if (threshold === "any") return frac > 0;
  if (threshold === "full") return frac >= LIT_FULL_FRACTION;
  return frac >= 0.5;
}

export function earthInView(earthEl: number, horizonDeg: number, marginDeg: number): boolean {
  return earthEl >= horizonDeg + marginDeg;
}

/** Panel factor: tracking = cos(el); fixed = max(0, cos(el) cos(az - panelAz)). */
export function powerFactor(sunAz: number, sunEl: number, panel: Settings["panel"]): number {
  const c = Math.cos(toRad(sunEl));
  if (panel.mode === "fixed") return Math.max(0, c * Math.cos(toRad(sunAz - panel.azDeg)));
  return Math.max(0, c);
}

export function frameFor(ctx: SiteContext, s: Settings): SiteFrame {
  return siteFrame(ctx.lat, ctx.lon, ctx.hDemM, ctx.obsHeightM ?? s.mastM);
}

/** Raw lit state at one instant. */
export function litAt(
  ctx: SiteContext,
  frame: SiteFrame,
  eph: EphemerisSource,
  tMs: number,
  s: Settings,
): boolean {
  const sun = topocentric(eph.bodyAt("sun", tMs), frame, R_SUN_KM);
  const earth = topocentric(eph.bodyAt("earth", tMs), frame, R_EARTH_KM);
  const frac =
    discFraction(sun.el, horizonAt(ctx.horizon, sun.az), sun.r) * (1 - sunBlockedByEarth(sun, earth));
  return isLit(frac, s.litThreshold);
}

/** Raw Earth-in-view state at one instant. */
export function earthInAt(
  ctx: SiteContext,
  frame: SiteFrame,
  eph: EphemerisSource,
  tMs: number,
  s: Settings,
): boolean {
  const earth = topocentric(eph.bodyAt("earth", tMs), frame, R_EARTH_KM);
  return earthInView(earth.el, horizonAt(ctx.horizon, earth.az), s.earthMarginDeg);
}

/**
 * Sample [t0, t0 + durationH] every stepMin minutes (n = durationH*60/stepMin + 1, end inclusive).
 * A window that runs past ephemeris coverage is clipped there and clippedAtMs is set.
 * horizonOffsetDeg is added to the horizon profile (uncertainty band).
 */
export function sample(
  ctx: SiteContext,
  eph: EphemerisSource,
  t0Ms: number,
  durationH: number,
  stepMin: number,
  s: Settings,
  dsn?: StationSource,
  horizonOffsetDeg = 0,
): TimeSeries {
  const stepMs = stepMin * 60_000;
  let n = Math.round((durationH * 60) / stepMin) + 1;
  let clippedAtMs: number | null = null;
  const covEnd = eph.coverage()[1];
  if (t0Ms + (n - 1) * stepMs > covEnd) {
    n = Math.floor((covEnd - t0Ms) / stepMs) + 1;
    clippedAtMs = covEnd;
  }
  if (n < 1) throw new RangeError("Window starts outside ephemeris coverage");

  const frame = frameFor(ctx, s);
  const out: TimeSeries = {
    t0Ms,
    stepMs,
    n,
    sunAz: new Float32Array(n),
    sunEl: new Float32Array(n),
    sunFrac: new Float32Array(n),
    eclipseFrac: new Float32Array(n),
    earthAz: new Float32Array(n),
    earthEl: new Float32Array(n),
    earthIn: new Uint8Array(n),
    interference: new Uint8Array(n),
    power: new Float32Array(n),
    lit: new Uint8Array(n),
    both: new Uint8Array(n),
    dsnBits: new Uint8Array(n),
    clippedAtMs,
  };
  for (let i = 0; i < n; i++) {
    const t = t0Ms + i * stepMs;
    const sun = topocentric(eph.bodyAt("sun", t), frame, R_SUN_KM);
    const earth = topocentric(eph.bodyAt("earth", t), frame, R_EARTH_KM);
    const ecl = sunBlockedByEarth(sun, earth);
    const frac =
      discFraction(sun.el, horizonAt(ctx.horizon, sun.az) + horizonOffsetDeg, sun.r) * (1 - ecl);
    out.sunAz[i] = sun.az;
    out.sunEl[i] = sun.el;
    out.sunFrac[i] = frac;
    out.eclipseFrac[i] = ecl;
    out.earthAz[i] = earth.az;
    out.earthEl[i] = earth.el;
    out.earthIn[i] = earthInView(
      earth.el,
      horizonAt(ctx.horizon, earth.az) + horizonOffsetDeg,
      s.earthMarginDeg,
    )
      ? 1
      : 0;
    out.interference[i] = sunEarthSeparation(sun, earth) < s.interferenceDeg ? 1 : 0;
    out.power[i] = frac * powerFactor(sun.az, sun.el, s.panel);
    out.lit[i] = isLit(frac, s.litThreshold) ? 1 : 0;
    if (dsn && s.dsnEnabled) {
      const el = dsn.moonElDeg(t);
      let bits = 0;
      for (let k = 0; k < el.length; k++) if (el[k] >= s.dsnMaskDeg) bits |= 1 << k;
      out.dsnBits[i] = bits;
      // A DTE link needs both ends: Earth above the site horizon AND the Moon above a station's mask.
      if (bits === 0) out.earthIn[i] = 0;
    }
  }
  const lit = mergeFlickers(out.lit, stepMs, s.flickerMergeMin).merged;
  const ein = mergeFlickers(out.earthIn, stepMs, s.flickerMergeMin).merged;
  for (let i = 0; i < n; i++) out.both[i] = lit[i] & ein[i];
  return out;
}

/**
 * Fill each False run strictly bounded by True on both sides whose length * step is under mergeMin minutes.
 * Edge runs never merge. Returns the merged copy and the number of runs filled.
 */
export function mergeFlickers(
  state: Uint8Array,
  stepMs: number,
  mergeMin: number,
): { merged: Uint8Array; count: number } {
  const merged = Uint8Array.from(state);
  const n = state.length;
  let count = 0;
  let i = 0;
  while (i < n) {
    if (state[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && !state[j]) j++;
    if (i > 0 && j < n && ((j - i) * stepMs) / 60_000 < mergeMin) {
      merged.fill(1, i, j);
      count++;
    }
    i = j;
  }
  return { merged, count };
}
