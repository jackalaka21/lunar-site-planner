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
  /** hDemM 5312.4 m above the 1737.4 km reference sphere, not above a basin. */
  refHeightKm: 5.3,
  shackletonBothH: 202,
  /** First Sun loss at the Shackleton rim: T+143.5 h. */
  shackletonFirstSunsetH: 143.5,
  slipBothH: 0,
} as const;

const F = SHOWCASE_FACTS;

export const MONS_MOUTON_COPY = {
  badge: `${F.bothH} h Sun + Earth`,
  title: `Mons Mouton: Sun lit all window, Earth in view for ${F.earthsetDays} d ${F.earthsetHours} h`,
  summary: `At 84.8° S on 14 Jan 2027 the engine finds the Sun lit for ${F.sunlitPct}% of the 14-day window. The Sun's centre stays between ${Math.abs(F.sunElMinDeg)}° below and ${F.sunElMaxDeg}° above the horizon, so the light is always grazing. The site is about ${F.refHeightKm} km above the Moon's reference radius.`,
  detail: `Earth is in view for ${F.earthPct}% of the window, roughly northwest to north-northwest (${F.earthAzMinDeg}° to ${F.earthAzMaxDeg}° azimuth) and up to about ${F.earthElMaxDeg}° above the horizon. It sets at T+${F.earthsetDays} d ${F.earthsetHours} h, so Sun and Earth are both up for ${F.bothH} h.`,
} as const;

export const RIDGE_COPY = {
  badge: `${F.shackletonBothH} h vs ${F.bothH} h`,
  title: "Shackleton rim vs Mons Mouton: same date, very different window",
  summary: `At 89.7° S on the same landing date, the Shackleton rim has Sun and Earth up together for ${F.shackletonBothH} h, against ${F.bothH} h at Mons Mouton. Terrain first blocks the Sun at the rim ${F.shackletonFirstSunsetH} h in (about 6 days).`,
  detail:
    "Open the terrain and sky view in the planner to see where the horizon cuts the Sun. Earth visibility on narrow rims is a known discrepancy in our validation; see the About page.",
} as const;

export const SLIP_COPY = {
  title: "What happens when a launch slips by 14 days?",
  summary: `Fourteen days is about half a lunar day, so the Sun is on the other side of the sky. At the same site, Sun-plus-Earth time falls from ${F.bothH} h to ${F.slipBothH} h: the Sun sets within the first hour and does not return in the window.`,
  detail:
    "The side-by-side comparison shows the change in hours of sunlight and Earth visibility, so a new date can be judged against the old one.",
} as const;

export const REPLAY_COPY = {
  title: "Replay real landings with NASA/JPL ephemerides",
  summary:
    "Replay Intuitive Machines IM-2 Athena at Mons Mouton, ISRO Chandrayaan-3 at 69.4° S, or JAXA SLIM near Shioli crater using JPL ephemerides and LOLA terrain horizons.",
  detail:
    "Sun and Earth directions agree with JPL Horizons to better than 0.001° in the published validation on the About page.",
} as const;
