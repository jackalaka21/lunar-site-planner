/**
 * About-page content. NASA datasets mirror DATA_SOURCES.md (rendered here; the .md is not fetched).
 * Sizes and checksums stay in DATA_SOURCES.md; kernel names and SHA-256 are read at runtime from ephemeris/index.json.
 */
export interface Dataset {
  name: string;
  source: string;
  href: string;
  role: string;
}

export const NASA_DATASETS: Dataset[] = [
  {
    name: "LOLA polar 40 m DEM (LDEM_80S_40MPP_ADJ), NASA GSFC PGDA",
    source: "PGDA product 90",
    href: "https://pgda.gsfc.nasa.gov/products/90",
    role: "Terrain horizons at the south pole: the horizon line each site sees, for Sun and Earth visibility, and the polar basemap.",
  },
  {
    name: "LOLA global 64 ppd DEM (LDEM_64), NASA GSFC",
    source: "imbrium.mit.edu LOLA GDR",
    href: "https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/",
    role: "Terrain horizons away from the pole, and the global basemap.",
  },
  {
    name: "NAIF SPICE kernels (JPL): de440s, moon_pa_de440_200625, moon_de440_250416.tf, naif0012, pck00011",
    source: "NAIF generic kernels",
    href: "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/",
    role: "Sun and Earth positions in the lunar frame (DE440 ephemeris and lunar orientation), hourly from 1969 to 2035.",
  },
  {
    name: "JPL Horizons",
    source: "JPL Solar System Dynamics",
    href: "https://ssd.jpl.nasa.gov/horizons/",
    role: "Independent validation of Sun and Earth azimuth and elevation, run at build time. Ridgeline does not call Horizons at runtime.",
  },
  {
    name: "PGDA Lunar Polar Illumination maps, as shown in LROC Quickmap",
    source: "PGDA product 69",
    href: "https://pgda.gsfc.nasa.gov/products/69",
    role: "Illumination cross-check: average Sun and Earth visibility from the same LOLA data shown in LROC Quickmap.",
  },
  {
    name: "LROC and Quickmap (NASA LRO, Arizona State University)",
    source: "LROC Quickmap",
    href: "https://quickmap.lroc.asu.edu/",
    role: "Landing-site coordinates and context. Every site lists its own source link.",
  },
  {
    name: "Moon Trek (NASA JPL)",
    source: "Moon Trek",
    href: "https://trek.nasa.gov/moon/",
    role: "Linked from each scenario card for 3D context. No Moon Trek data is bundled.",
  },
  {
    name: "DSN station locations (Goldstone, Madrid, Canberra)",
    source: "DSN Telecommunications Link Design Handbook 810-005, module 301",
    href: "https://deepspace.jpl.nasa.gov/dsndocs/810-005/301/301K.pdf",
    role: "Ground-station layer: when each Deep Space Network site can see the Moon.",
  },
];

export interface Partner {
  name: string;
  detail: string;
  href: string;
}

export const PARTNERS: Partner[] = [
  { name: "ISRO", detail: "Chandrayaan-3 landing and sleep dates", href: "https://www.isro.gov.in/Chandrayaan3.html" },
  { name: "JAXA", detail: "SLIM, the Moon Sniper", href: "https://global.jaxa.jp/projects/sas/slim/" },
  { name: "CNSA", detail: "Chang'e 3, 4, 5 and 6 landing sites", href: "https://www.cnsa.gov.cn/english/" },
  {
    name: "CSA",
    detail: "Moon exploration. Canada contributes to Artemis, including the Canadarm3 robotics for Gateway.",
    href: "https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/",
  },
];

/** Limitations text; the landing-ellipse radius comes from the caller (DEFAULT_SETTINGS.ellipseKm). */
export function limitations(ellipseKm: number): string[] {
  return [
    "Terrain resolution: horizons use a 40 m grid within 5 km of each observer and a 120 m grid beyond, both built from the LOLA 40 m south-polar map; beyond about 80° S the 120 m grid is filled from the global LOLA map (64 pixels per degree, about 470 m). Non-polar sites use the global map directly, so features smaller than the grid spacing, such as boulders and small craters, are not resolved.",
    "Horizon across the disc: the horizon is sampled along the azimuth of the body's centre and treated as flat across the Sun or Earth disc, so the lit fraction near a ridge is approximate.",
    "No thermal model: power is a sunlight proxy. Battery, heat and dust effects are not simulated.",
    "Eclipses: Earth's atmosphere refraction is ignored during a lunar eclipse, so the umbral dimming is a geometric estimate.",
    "Time: all times are UTC, not lunar local time.",
    `Surface only: no regolith, slope or traverse model. The ${ellipseKm} km landing ellipse samples the DEM, not a descent simulation.`,
  ];
}

export const AI_DISCLOSURE =
  "Built with AI assistance (Anthropic Claude) for code and drafting. Data processing, physics and validation were reviewed by automated tests, and their results are published on this page.";
