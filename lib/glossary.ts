/**
 * Plain-language definitions for every technical term shown in the UI (Global Constraints, copy rules).
 * Sentences end with a period; short labels elsewhere do not. No emoji, no exclamation marks.
 */
export interface GlossaryEntry {
  term: string;
  text: string;
}

export const GLOSSARY = {
  elevation: {
    term: "Elevation",
    text: "Angle of a body above the local horizontal plane, in degrees. 0° is on the horizon, 90° is straight up.",
  },
  azimuth: {
    term: "Azimuth",
    text: "Compass direction of a body, in degrees clockwise from local north.",
  },
  horizon: {
    term: "Horizon",
    text: "The lowest line of sky visible from the site, given as an elevation in degrees at each azimuth.",
  },
  terrainHorizon: {
    term: "Terrain horizon",
    text: "Horizon traced from lunar elevation data, so nearby ridges and craters can hide the Sun or Earth. A smooth sphere would put it at 0°.",
  },
  earthset: {
    term: "Earthset",
    text: "Earth sinks below the terrain horizon, ending a period of Earth contact.",
  },
  earthrise: {
    term: "Earthrise",
    text: "Earth climbs above the terrain horizon, starting a period of Earth contact.",
  },
  sunrise: {
    term: "Sunrise",
    text: "The Sun climbs above the terrain horizon. Sunlight returns until the next sunset.",
  },
  sunset: {
    term: "Sunset",
    text: "The Sun drops below the terrain horizon. Sunlight stops until the next sunrise.",
  },
  dte: {
    term: "DTE",
    text: "Direct to Earth: a radio link from the lander straight to Earth, with no relay satellite. It needs Earth above the horizon.",
  },
  libration: {
    term: "Libration",
    text: "Slow wobble of the Moon as seen from Earth, about 7° to 8°. It lets sites near the edge of the near side see Earth rise and set.",
  },
  eclipse: {
    term: "Eclipse",
    text: "Earth passes in front of the Sun as seen from the site, dimming or blocking sunlight for hours.",
  },
  solarInterference: {
    term: "Solar interference",
    text: "Radio noise when the Sun is close to Earth in the sky, within the angle set here. It can disrupt the direct-to-Earth link.",
  },
  visibleFraction: {
    term: "Visible fraction",
    text: "Share of the Sun or Earth disc above the horizon, from 0 (hidden) to 1 (fully visible).",
  },
  powerProxy: {
    term: "Power proxy",
    text: "Relative solar power from Sun elevation and visible fraction, for tracking or fixed panels. It is an indicator, not an energy budget.",
  },
  met: {
    term: "Mission-elapsed time (T+)",
    text: "Days and hours since landing, written T+3 d 04 h. Before landing it counts down, as T−0 d 02 h.",
  },
  verdict: {
    term: "Verdict",
    text: "Good, Marginal or Poor, from Sun and Earth coverage, the longest dark spell and the battery reserve. A reason always comes with it.",
  },
  batteryReserve: {
    term: "Battery reserve",
    text: "Hours the lander can run on battery with no sunlight. A longer dark spell puts the site at risk.",
  },
  flicker: {
    term: "Flicker",
    text: "Brief on and off swings in Sun or Earth visibility near the horizon. Gaps shorter than the merge window are joined into one period.",
  },
  dsn: {
    term: "DSN",
    text: "Deep Space Network: NASA's ground antennas. When on, Earth contact counts only while a station sees Earth above its mask angle.",
  },
  landingEllipse: {
    term: "Landing ellipse",
    text: "Area where the lander may touch down, with its radius in km. The horizon is sampled across it to show the spread.",
  },
  psr: {
    term: "PSR",
    text: "Permanently shadowed region: ground that never sees the Sun and stays extremely cold.",
  },
  subSolarLatitude: {
    term: "Sub-solar latitude",
    text: "Latitude on the Moon where the Sun is straight overhead. It stays within about 1.5° of the equator.",
  },
  verticalExaggeration: {
    term: "Vertical exaggeration",
    text: "Stretching of heights in the panorama so small ridges are easier to see. 1× is true scale.",
  },
  litThreshold: {
    term: "Lit threshold",
    text: "How much of the Sun disc must be above the horizon to count as lit: any part, at least half, or all of it.",
  },
  earthMargin: {
    term: "Earth margin",
    text: "Extra elevation, in degrees, that Earth must clear above the horizon before it counts as in view.",
  },
  duration: {
    term: "Mission length",
    text: "Length of the window after landing that is analysed, in days.",
  },
  mastHeight: {
    term: "Mast height",
    text: "Height of the antenna and camera mast above the ground, in m. A taller mast sees farther over the horizon.",
  },
  horizonUncertainty: {
    term: "Horizon uncertainty",
    text: "Allowed error in the horizon line, in degrees, because the elevation data limits how well ridges are known.",
  },
  dsnMask: {
    term: "DSN mask angle",
    text: "Minimum elevation, in degrees, at which a DSN station can track Earth.",
  },
  panelMode: {
    term: "Panel mode",
    text: "Tracking panels follow the Sun. Fixed panels point at one azimuth, in degrees clockwise from north.",
  },
  timeAxis: {
    term: "Time axis",
    text: "Show times as mission-elapsed time from landing, or as calendar dates.",
  },
  displayTz: {
    term: "Time zone",
    text: "Time zone used for calendar dates. Mission-elapsed time does not depend on it.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryId = keyof typeof GLOSSARY;
