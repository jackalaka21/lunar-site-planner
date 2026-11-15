/** One stop on the guided tour. `targetId` matches a `data-tour-id` attribute; null means a centred card. */
export interface TourStep {
  id: string;
  /** Value of the data-tour-id attribute to spotlight, or null for a centred card with no cutout. */
  targetId: string | null;
  /** Short category shown in the pill. */
  category: string;
  title: string;
  what: string;
  means: string;
  tryIt: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    targetId: null,
    category: "Overview",
    title: "Welcome to Ridgeline",
    what: "Ridgeline shows how much Sun and Earth a lander would see at a south pole site. Near the pole the Sun stays low: about 1.5° at the pole itself, up to about 7° at Mons Mouton.",
    means:
      "Crater rims and ridges block that low Sun and the view of Earth. They decide when a lander gets power and when it can use direct-to-Earth (DTE) radio.",
    tryIt: "Press Next for a short tour of the planner. You can skip it at any time.",
  },
  {
    id: "topbar",
    targetId: "tour-topbar",
    category: "Top bar",
    title: "The top bar",
    what: "On wide screens it holds Landing page, Copy link, Export PNG, Settings, the theme switch and Tutorial. Narrow screens hide Landing page and Export PNG.",
    means:
      "Copy link saves your scenarios in the web address, so a colleague opens the same comparison. Export PNG saves the cards as an image.",
    tryIt: "Open Settings to adjust the calculation, or press Tutorial to replay this tour.",
  },
  {
    id: "scenarios",
    targetId: "tour-scenarios",
    category: "Scenarios",
    title: "Scenarios",
    what: "Each scenario is one site with one landing date and time, in UTC. Scenario A is the baseline the others are compared with.",
    means:
      "Add scenario +14 d adds a copy two weeks later, which shows what a two-week launch slip would cost.",
    tryIt: "Select a scenario, change its landing date, then add +14 d and compare the cards.",
  },
  {
    id: "site-picker",
    targetId: "tour-site-picker",
    category: "Site picker",
    title: "Choosing a site",
    what: "Search the catalogue, or type latitude and longitude. Category headings only group sites. Select a site row to use it.",
    means:
      "Test a real candidate site or any custom point. For a historical mission, Use actual landing date sets that mission's real landing time.",
    tryIt: "Search for a site and select it, or enter your own coordinates.",
  },
  {
    id: "metrics",
    targetId: "tour-metrics",
    category: "Verdict",
    title: "Verdict and metrics",
    what: "Each card shows a verdict and Both hours: the hours when the Sun and Earth are above the horizon together. Show details adds more figures.",
    means:
      "A lander needs sunlight for power and Earth in view for radio. More Both hours means more time to do both. Hover the verdict to read its reason.",
    tryIt: "Compare the Both hours of two scenarios, then press Show details.",
  },
  {
    id: "terrain-3d",
    targetId: "tour-3d-terrain",
    category: "3D terrain",
    title: "3D terrain",
    what: "A 20 by 20 km tile of real NASA LOLA terrain around the site. Shadows fall away from the Sun, and the Sun and Earth directions are marked.",
    means: "You can see which ridges would block the Sun or Earth from the lander as the time moves.",
    tryIt: "Drag to orbit, scroll to zoom, or press Lander POV to look from the lander.",
  },
  {
    id: "view-toggle",
    targetId: "tour-view-toggle",
    category: "View",
    title: "3D terrain or 2D skyline",
    what: "This switch changes the view. The 2D skyline is the full 360° horizon profile, with height measured in degrees above flat ground.",
    means: "The Sun or Earth is visible only while it is higher in the sky than the horizon line in that direction.",
    tryIt: "Choose 2D skyline and compare the horizon height with the Sun elevation.",
  },
  {
    id: "map",
    targetId: "tour-map",
    category: "Map",
    title: "The scenario map",
    what: "The large map shows where each scenario sits. Zoom and pan it, or drag a pin to move a site. Permanent shadow (PSR) outlines ground that never sees the Sun.",
    means:
      "Nearby heatmap (20 km) colours points around the pin. Red means little or no Sun and Earth overlap. Green means the most.",
    tryIt: "Switch on the heatmap, then drag a pin toward a greener spot.",
  },
  {
    id: "timeline",
    targetId: "tour-timeline",
    category: "Timeline",
    title: "Timeline and calendar",
    what: "The timeline covers the mission window, 14 days by default. The time bar has play and pause. Find next good date and the landing calendar help you pick a day.",
    means: "Sun and Earth come and go as the Moon turns. The timeline shows when each is up and how long gaps last.",
    tryIt: "Press Play, then open the landing calendar to see which days score best.",
  },
  {
    id: "validation",
    targetId: "tour-validation",
    category: "Validation",
    title: "Comparing and trusting results",
    what: "Delta badges such as −96 h vs A show how a scenario differs from scenario A. The About page checks Ridgeline against JPL Horizons.",
    means:
      "The Sun direction matches Horizons to about 0.00001° and the Earth direction to about 0.0001°. Open About from the Landing page to see every check.",
    tryIt: "Add a second scenario and read its delta badge. Press Finish when you are ready.",
  },
];
