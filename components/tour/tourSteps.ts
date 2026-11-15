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
  /** Used when `targetId` is not on screen (for example inside a closed drawer). */
  fallbackTargetId?: string;
  /** Shown as supporting text when the fallback target is the one being spotlit. */
  fallbackNote?: string;
}

const DRAWER_NOTE = "On this screen, open the list with the menu button at the top left.";

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "welcome",
    targetId: null,
    category: "Overview",
    title: "Welcome to Ridgeline",
    what: "Ridgeline shows how much Sun and Earth a lander would see at a landing site, especially near the south pole. Near the pole the Sun stays low: about 1.5° at the pole, up to about 7° at Mons Mouton.",
    means:
      "Crater rims and ridges block that low Sun and the view of Earth. They decide when a lander gets power and when it can use direct-to-Earth (DTE) radio.",
    tryIt: "Press Next for a short tour of the planner. You can skip it at any time.",
  },
  {
    id: "topbar",
    targetId: "tour-topbar",
    category: "Top bar",
    title: "The top bar",
    what: "On wide screens it holds Landing page, Copy link, Export PNG, Tutorial, Settings and the theme switch. Narrow screens hide Landing page and Export PNG, and a menu button at the left opens the scenario list.",
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
      "Add scenario +14 d adds a copy of the last scenario's site, 14 days after it, which shows what a two-week launch slip would cost.",
    tryIt: "Select a scenario, change its landing date, then add +14 d and compare the cards.",
    fallbackTargetId: "tour-open-nav",
    fallbackNote: DRAWER_NOTE,
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
    fallbackTargetId: "tour-open-nav",
    fallbackNote: DRAWER_NOTE,
  },
  {
    id: "metrics",
    targetId: "tour-metrics",
    category: "Verdict",
    title: "Verdict and metrics",
    what: "Each card shows a verdict and Both hours: the hours when the Sun and Earth are above the horizon together. Show details adds more figures.",
    means:
      "A lander needs sunlight for power and Earth in view for radio. More Both hours means more time to do both. Hover or tap the verdict to read its reason.",
    tryIt: "Compare the Both hours of two scenarios, then press Show details.",
  },
  {
    id: "terrain-3d",
    targetId: "tour-3d-terrain",
    category: "3D terrain",
    title: "3D terrain",
    what: "A tile of real NASA LOLA terrain around the site: 20 by 20 km for catalogue sites, the coarser 2 km grid for custom points. Shadows fall away from the Sun, and the Sun and Earth directions are marked.",
    means: "You can see which ridges would block the Sun or Earth from the lander as the time moves.",
    tryIt: "Drag to orbit, Ctrl+scroll to zoom, or press Lander POV to look from the lander.",
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
    what: "The large map shows where each scenario sits. Zoom and pan it, or drag a scenario pin to try a custom point. Permanent shadow (PSR) outlines ground south of 80° S that never gets direct sunlight.",
    means:
      "On the south polar map, Nearby heatmap (20 km) colours 2 km LOLA grid points within 20 km of the pin. Red means little or no Sun and Earth overlap. Green means the most.",
    tryIt: "Turn on Nearby heatmap; the map zooms to the pin. Hover or tap a cell to read it.",
  },
  {
    id: "timeline",
    targetId: "tour-timeline",
    category: "Timeline",
    title: "Timeline and calendar",
    what: "The timeline covers the mission window, 14 days by default. The time bar has play and pause. Below it, Find next good date and Landing calendar help you pick a day.",
    means: "Sun and Earth come and go as the Moon turns. The timeline shows when each is up and how long gaps last.",
    tryIt: "Press Play, then open Landing calendar to see which days score best.",
  },
  {
    id: "validation",
    targetId: "tour-validation",
    category: "Validation",
    title: "Comparing and trusting results",
    what: "This line names the data behind the card: the LOLA terrain used for the horizon and the DE440 ephemeris. From scenario B on, a line such as −96 h vs A shows the change from scenario A.",
    means: "Ridgeline's Sun direction matches JPL Horizons to about 0.00001° and its Earth direction to about 0.0001°.",
    tryIt: "Open About & validation from the Landing page to see every check. Press Finish when you are ready.",
  },
];
