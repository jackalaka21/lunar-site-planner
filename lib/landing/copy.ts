/**
 * Hard numbers quoted on the landing page. Every value is the engine's output (rounded) for the
 * scenario the showcase buttons open: artemis3-mons-mouton at 2027-01-14T06:00Z, default settings.
 * tests/unit/landing/facts.test.ts recomputes them and fails if they drift. Regenerate with
 * `npx tsx scripts/landing-facts.ts`.
 */
export const SHOWCASE_FACTS = {
  bothH: 317,
  sunlitPct: 100,
  earthPct: 94,
  /** Earth sets at T+317.2 h = 13 d 5 h. */
  earthsetDays: 13,
  earthsetHours: 5,
  sunElMinDeg: -0.4,
  sunElMaxDeg: 5.8,
  earthElMaxDeg: 11,
  earthAzMinDeg: 323,
  earthAzMaxDeg: 338,
  /** hDemM 5312.4 m above the 1737.4 km reference sphere, not above local terrain. */
  refHeightKm: 5.3,
  shackletonBothH: 202,
  /** First Sun loss at the Shackleton rim: T+143.5 h. */
  shackletonFirstSunsetH: 143.5,
  slipBothH: 0,
  /** At the +14 d start the Sun sets within this many hours (engine: 0.67 h). */
  slipSunsetWithinH: 1,
} as const;

const F = SHOWCASE_FACTS;

export const MONS_MOUTON_COPY = {
  badge: `${F.bothH} h Sun + Earth`,
  title: `Mons Mouton: Sun lit all window, Earth in view for ${F.earthsetDays} d ${F.earthsetHours} h`,
  summary: `At 84.8° S on 14 Jan 2027 the Sun is lit for ${F.sunlitPct}% of the 14-day window (at least half the disc above the surrounding terrain), with no sunset within the window. The Sun's centre ranges from ${F.sunElMinDeg}° to ${F.sunElMaxDeg}° relative to local level, so the light is always grazing. The site is about ${F.refHeightKm} km above the Moon's reference radius.`,
  detail: `Earth is in view for ${F.earthPct}% of the window, roughly northwest to north-northwest (${F.earthAzMinDeg}° to ${F.earthAzMaxDeg}° azimuth) and up to about ${F.earthElMaxDeg}° above the horizon. It sets at T+${F.earthsetDays} d ${F.earthsetHours} h, so Sun and Earth are both up for ${F.bothH} h.`,
} as const;

export const RIDGE_COPY = {
  badge: `${F.shackletonBothH} h, ${F.bothH - F.shackletonBothH} h less than Mons Mouton`,
  title: "Shackleton rim vs Mons Mouton: same date, very different window",
  summary: `At 89.7° S on the same landing date, the Shackleton rim has Sun and Earth up together for ${F.shackletonBothH} h, against ${F.bothH} h at Mons Mouton. Terrain first blocks the Sun at the rim ${F.shackletonFirstSunsetH} h in (about 6 days).`,
  detail:
    "Open the terrain and sky view in the planner to see where the horizon cuts the Sun. Earth visibility on narrow rims is a known discrepancy in our validation; see the About page.",
} as const;

export const SLIP_COPY = {
  badge: `+14 d: ${F.bothH} h → ${F.slipBothH} h`,
  title: "What happens when a launch slips by 14 days?",
  summary: `Fourteen days is about half a lunar day, so the Sun is on the other side of the sky. At the same site, Sun-plus-Earth time falls from ${F.bothH} h to ${F.slipBothH} h: the Sun sets within the first hour and does not return in the window.`,
  detail:
    "The side-by-side comparison shows the change in hours of sunlight and Earth visibility, so a new date can be judged against the old one.",
} as const;

export const REPLAY_COPY = {
  badge: "IM-2 / CH-3 / SLIM",
  title: "Replay real landings with NASA/JPL ephemerides",
  summary:
    "Replay Intuitive Machines IM-2 Athena at Mons Mouton, ISRO Chandrayaan-3 at 69.4° S, or JAXA SLIM near Shioli crater using JPL ephemerides and LOLA terrain horizons.",
  detail:
    "Sun and Earth directions agree with JPL Horizons to better than 0.001° in the published validation on the About page.",
} as const;

/** Latitudes as printed in the copy above; the facts test checks them against public/data/v1/sites.json. */
export const SITE_LAT_TEXT = { monsMouton: "84.8° S", shackleton: "89.7° S" } as const;

export const LANDING_HEADLINE = "Beyond the lunar horizon";
export const LANDING_HOOK =
  "For any landing site and date, Ridgeline answers one question: will the lander have sunlight for power and Earth in view for communications? Then it shows what changes if the date slips.";

/** README.md, Validation section: "about 1e-5 degrees" (Sun) and "about 1e-4 degrees" (Earth). */
export const JPL_AGREEMENT = "≈0.00001° Sun, ≈0.0001° Earth vs JPL Horizons";

export const CALLOUTS = {
  monsMouton: { title: `Mons Mouton · ${SITE_LAT_TEXT.monsMouton}`, fact: `${F.bothH} h Sun + Earth` },
  shackleton: {
    title: `Shackleton rim · ${SITE_LAT_TEXT.shackleton}`,
    fact: `${F.shackletonBothH} h Sun + Earth`,
  },
  jpl: { title: "JPL DE440 ephemeris", fact: JPL_AGREEMENT },
  replays: { title: "Historical replays", fact: "IM-2 · Chandrayaan-3 · SLIM" },
} as const;

/** Catalogue ids and actual landing times (sites.json `actual_landing_utc`); the facts test compares them. */
export const REPLAYS = [
  { id: "im-2", label: "IM-2 Athena", iso: "2025-03-06T17:30Z" },
  { id: "chandrayaan-3", label: "Chandrayaan-3", iso: "2023-08-23T00:00Z" },
  { id: "slim", label: "JAXA SLIM", iso: "2024-01-19T15:20Z" },
] as const;

export const CAPABILITIES = [
  {
    title: "3D LOLA terrain & sky",
    text: "Terrain patches built from NASA LOLA elevation, viewed from orbit or from the lander, with Sun and Earth sightlines and the ridges that block them.",
  },
  {
    title: "Direct-to-Earth & DSN handovers",
    text: "When Earth is above the local horizon, and which Deep Space Network station (Goldstone, Madrid or Canberra) has the Moon in view.",
  },
  {
    title: "4-site & slip compare",
    text: "Put up to four sites or launch dates side by side and read the change in hours of Sun plus Earth.",
  },
  {
    title: "Landing robustness",
    text: "Shift the horizon and nearby landing points within the landing ellipse to see how far the headline hours move.",
  },
] as const;
