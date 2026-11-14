import { STEP_MIN, STEP_MS } from "./constants";
import { earthInAt, frameFor, litAt, mergeFlickers } from "./sample";
import type { Settings } from "./settings";
import type { EphemerisSource, SiteContext } from "./types";

export type EventKind = "sunset" | "sunrise" | "earthset" | "earthrise";

/**
 * Next transition of the requested kind at or after fromMs (even if already in the new state), as UTC ms
 * of the first whole minute in the new state, or null within maxDays or when the search reaches the end of
 * ephemeris coverage. Detected on flicker-merged 10-minute states, then bisected to 1 minute on raw states.
 * Eclipse is part of the lit state, so an eclipse counts as sunset/sunrise.
 */
export function findEvent(
  ctx: SiteContext,
  eph: EphemerisSource,
  fromMs: number,
  kind: EventKind,
  s: Settings,
  maxDays = 60,
): number | null {
  const frame = frameFor(ctx, s);
  const sunKind = kind === "sunset" || kind === "sunrise";
  const newState = kind === "sunrise" || kind === "earthrise";
  const state = (t: number): boolean =>
    sunKind ? litAt(ctx, frame, eph, t, s) : earthInAt(ctx, frame, eph, t, s);
  const [covStart, covEnd] = eph.coverage();
  if (fromMs < covStart) return null;

  let n = Math.round(maxDays * 24 * 6) + 1;
  if (fromMs + (n - 1) * STEP_MS > covEnd) n = Math.floor((covEnd - fromMs) / STEP_MS) + 1;
  if (n < 2) return null;
  const raw = new Uint8Array(n);
  for (let i = 0; i < n; i++) raw[i] = state(fromMs + i * STEP_MS) ? 1 : 0;
  const { merged } = mergeFlickers(raw, STEP_MS, s.flickerMergeMin);
  const want = newState ? 1 : 0;
  let hit = -1;
  for (let i = 0; i < n - 1; i++) {
    if (merged[i] !== want && merged[i + 1] === want) {
      hit = i;
      break;
    }
  }
  if (hit < 0) return null;
  let lo = 0;
  let hi = STEP_MIN;
  const base = fromMs + hit * STEP_MS;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (state(base + mid * 60_000) === newState) hi = mid;
    else lo = mid;
  }
  return base + hi * 60_000;
}
