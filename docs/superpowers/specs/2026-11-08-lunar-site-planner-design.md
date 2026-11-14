# Ridgeline — Lunar Landing Site & Date Planner: Design

*Status: draft for approval · 2026-11-08 · Working name "Ridgeline" is a placeholder (from PeakVisor's line "sunrise is not a time, it's a ridge").*

---

## 1. Summary

A public, mobile-friendly web app for comparing lunar landing **sites** and **dates** in a few seconds. It shows where the **Sun** and **Earth** are against the **real terrain horizon** at a site, and turns that into the two things a lander needs to survive: **sunlight for power** and **Earth in view for direct-to-Earth (DTE) comms**. It is built for a virtual NASA Space Apps–style hackathon next week, by one person (Jack) with Claude writing most of the code. It is deployed from the GitHub account `jackalaka21` to Vercel.

The headline question it answers: *"Our landing date slipped two weeks (or we're considering a site 5 km away). Is the new option better or worse, by how much, and why?"*

## 2. Why this exists

From the challenge brief (NASA Space Apps, lunar south pole lighting and communication):

- South pole missions face extreme lighting and comms constraints. The Sun reaches only about ±1.5° elevation at the pole and never more than about 7° anywhere in the Artemis candidate regions, so **terrain decides everything** and small changes in location or date flip a site between viable and dead.
- Existing tools (LROC QuickMap, Moon Trek, JPL Horizons) are built for specialists and mostly show **long-term averages**. None of them answers "date A vs date B" or "site X vs site Y" quickly.
- Real missions show what's at stake. Intuitive Machines' IM-2 *Athena* tipped over in a crater, couldn't charge because of panel layout, Sun direction and cold, and died within about a day. Chandrayaan-3 timed its landing to lunar dawn, got one lunar day (about 14 Earth days), and did not survive the night. JAXA's SLIM landed with its panels facing west and revived only when the Sun moved round to that side.
- The best studied south pole sites get about 85–92% sunlight but only about 50% DTE availability. **Sun and Earth cycles don't line up**, so no site is good year-round.

**Success for Jack:** something extremely usable, nicely designed and highly functional. It must make its point in a 30-second demo, and its science must survive a judge's questions.

## 3. Users and the core moment

| User | What they need | How the app serves them |
|---|---|---|
| **Mission planner** (primary) | Fast, credible comparison of site/date options when schedules shift | Side-by-side scenarios, headline metrics, "find next good date", shareable links, CSV export |
| **Educator / public** (secondary) | See why the pole is hard | The same screens, tooltips on every technical term, a one-line Moon-vs-Earth stat strip. *No dedicated education mode (cut by Jack).* |

**Core moment (the first minute):**
1. Open the link. A default scenario is already showing (a south pole site with a sensible date).
2. Pick a site (from the list, the map, or typed coordinates) and a landing date/time.
3. Add a second scenario: same site on a new date, or a nearby site on the same date.
4. See them side by side. Each card shows a **verdict**, **three numbers** (usable "sun + Earth" hours, time to sunset, time to Earthset), a **horizon panorama** with the Sun and Earth paths, and a **timeline** of sun / Earth / both.
5. Press play to watch it unfold. Share the link.

**Demo story (30 seconds, the backbone of the hackathon video):**
1. A Mons Mouton–area site on its planned date shows a **Good** verdict with many hours of "sun + Earth".
2. "The launch slipped two weeks." Add the same site at +14 days. It now shows **Poor**: sunset on day 3, and Earth sinks behind a ridge.
3. Press **Find next good date**, which recovers a viable window.
4. Drag the pin about 3 km onto a ridge. Hours jump, showing why small moves matter.
5. Press **Share**. The link reopens exactly this comparison.

## 4. Goals, non-goals, anti-goals

**Goals**
- Rapid side-by-side comparison of 2–4 site/date scenarios.
- Physically honest Sun/Earth positions against real LOLA terrain horizons, with no atmosphere, lunar curvature, Sun and Earth as discs, and libration included.
- Metrics that matter operationally: Sun elevation, time to sunset and Earthset, sunlit hours, Earth-visible hours, overlap hours, and the longest darkness.
- Works well on a phone, installable as a PWA, public URL.
- Every number traceable to a stated source and precision.

**Non-goals**
- Replacing QuickMap, Moon Trek or Horizons.
- Rover traverse planning, landing hazard and slope analysis, thermal modelling.
- Relay satellite coverage (DTE only).
- A native iOS/Android app (the PWA covers "mobile app").
- A dedicated education mode or guided tour (cut by Jack).
- User accounts, saved server-side data, or a backend database.

**Anti-goals (failure even if it technically works)**
- Space-themed decoration: starfields, glows, neon.
- A 3D globe before the 2D views are excellent.
- Colour used for style rather than meaning.
- Jargon without a tooltip.
- A generic dashboard look that could be about anything.
- Numbers presented with more precision or certainty than the data supports.

## 5. Scope tiers and acceptance criteria

Build strictly in tier order. A tier is done only when its acceptance criteria pass.

### Tier 1 — Must-have (the demo works with nothing else)

| # | Feature | Acceptance criteria |
|---|---|---|
| M1 | **Curated site catalog** | ≥ 25 sites in groups (see §8.5), searchable by name. Each has a cited source URL. Historical sites have a "use actual landing date" action. |
| M2 | **Custom coordinates** | Type lat/lon (decimal degrees, validated) or click the map. Inside the polar grid the app uses the nearest grid horizon and shows the distance to it. Outside the grid it uses a smooth-sphere horizon with a "terrain not modelled here" badge. |
| M3 | **2D map picker** | South-polar view (default) and a global view. Hillshade basemap, site pins, click to place a custom pin. |
| M4 | **Horizon panorama** | 360° terrain silhouette (wrapping), Sun path and Earth path for the mission window, current Sun/Earth discs at the cursor time, labelled vertical exaggeration, compass labels. |
| M5 | **Headline metrics** | Verdict chip, plus usable (both) hours, time to sunset/sunrise, time to Earthset/Earthrise, current Sun elevation. Secondary row: sunlit %, Earth-visible %, longest darkness, longest comms gap. |
| M6 | **Timeline** | Three bands (Sun, Earth, Both) over the mission window, darkness and comms gaps visible, a cursor synced with the panorama. |
| M7 | **Compare 2–4 scenarios** | Any mix of site and date. Identical card layout and shared scales (small multiples). Shared cursor in mission-elapsed time (T+), with a toggle to calendar time. |
| M8 | **Animation** | Play/pause, speed choices (1 h/s, 6 h/s, 1 day/s), scrubber. All cards move together. |
| M9 | **Shareable URL** | The full state (scenarios, settings, cursor) lives in the URL. Opening it reproduces the view exactly. A copy-link button is provided. |
| M10 | **Correct physics** | Passes the validation in §11.2 (Horizons agreement, sanity checks). |
| M11 | **Mobile-first + PWA + deployed** | Usable at 375 px wide, installable, app shell and viewed data work offline, live on a public Vercel URL from the `jackalaka21` GitHub repo. |
| M12 | **Tooltips + Moon-vs-Earth strip** | Every technical term has a tooltip. One line of stats contrasting Moon and Earth (for example Sun peak elevation, day length, shadow darkness). |
| M13 | **Sun–Earth geometry: eclipses and solar interference** (§7.8) | Lunar eclipses (Earth blocking the Sun) reduce the Sun's visible fraction and show as eclipse markers on the timeline and the panorama. Periods when the Sun is within the interference angle of Earth are flagged "possible solar interference" on the Earth band. Validated against at least two known lunar eclipse dates in 2025–2026. |
| M14 | **Landing-moment check** (§7.6) | Each card states whether the Sun is lit and Earth is in view **at T0 and through the preceding hour** (descent needs DTE telemetry). A failure forces the verdict to Poor, with the reason given. |
| M16 | **Challenge-tool links** | Each card links to the challenge's recommended tools (Quickmap, Moon Trek, JPL Horizons) for the scenario's coordinates, deep-linked where the tool supports it. |
| M15 | **Historical replay** | Ephemeris covers 1969–2035, so Apollo, Chandrayaan-3, SLIM, IM-1 and IM-2 can be loaded at their actual landing times (the "use actual landing date" action, M1). |

### Tier 2 — Should-have

| # | Feature | Acceptance criteria |
|---|---|---|
| S1 | **Landing-date calendar** (year view) | A calendar heatmap: each day coloured by "both" hours for a mission starting that day. Click a day to set the landing date. Computed in a worker in ≤ 1.5 s. |
| S2 | **Find next good date** | Scans forward from the scenario's date and returns the first 3 dates with a Good verdict, each one click to add as a scenario. |
| S3 | **Live pin drag** | Dragging the pin on the map updates that scenario continuously (throttled to animation frames). |
| S4 | **Nearby-alternatives heatmap** | For grid points within 20 km, a map overlay of "both" hours for the scenario's dates. Click a point to add it as a scenario. |
| S5 | **Permanently shadowed regions overlay** | Toggleable map layer from a published PSR dataset, with a cited source. |
| S6 | **CSV export** | Per-scenario time series (time, Sun az/el/visible %, Earth az/el/in-view, power proxy, states) plus a summary row. |
| S7 | **Ground-station check** (§7.9) | Optional "Earth side" layer: DTE counts only when Earth is in view from the site **and** at least one Deep Space Network complex (Goldstone, Madrid, Canberra) sees the Moon above a 10° mask. Toggle on/off. Timeline shows which station covers each period. |
| S8 | **Robustness band** (§7.10) | Each headline number shows a range under (a) horizon uncertainty (horizon raised/lowered by a set margin, default ±0.3°) and (b) landing dispersion (all grid points within the landing-ellipse radius, default 2 km). Example display: "Both: 212 h (176–230)". |
| S9 | **Mast-height options** | For curated sites, horizons are precomputed at 2 m, 10 m and 50 m observer height (50 m ≈ the height of a tall crewed lander's solar arrays). A selector shows how height changes sunlight and Earth visibility. |
| S10 | **Season and drift annotations** (§7.11) | The calendar (S1) overlays the Sun's sub-solar latitude curve and marks lunar "summer/winter" at the site, plus a note on why good windows drift earlier each month and repeat about every 346.6 days. |

### Tier 3 — Stretch

| # | Feature |
|---|---|
| X1 | 3D terrain view of the local area with Sun/Earth direction rays (three.js / react-three-fiber). |
| X2 | PNG/PDF one-page summary export of a comparison. |
| X3 | Fixed solar-panel azimuth setting (the SLIM/Athena lesson): power proxy uses the panel facing. |
| X4 | **Tip-over resilience:** worst-case power and comms if the lander ends up tilted by a set angle (default 10°) in any direction, sweeping tilt azimuth in 15° steps. This is the IM-1/IM-2/SLIM lesson turned into a number. |
| X5 | **Approach glare check:** given a descent approach heading, warn when the Sun at landing lies within a set angle (default 20°) of the camera's look direction, or when shadows exceed a set fraction of the hazard-detection field. |

### Cut
- Explain layer and guided tour (Jack's decision). Tooltips and the stat strip remain.

## 6. Design philosophy

**"A precise instrument, not a sci-fi set."** Each principle below is a concrete rule the build must follow.

1. **Answer first, details on demand** (Shneiderman: overview → zoom/filter → details). The card leads with verdict + 3 numbers. Raw az/el tables and settings sit one tap deeper.
2. **The horizon is the hero** (PeakFinder/PeakVisor draw Sun paths over a real skyline). The panorama gets the largest area on every card. The vertical axis is stretched and **labelled** ("vertical ×N").
3. **Compare like with like** (Tufte's small multiples). Identical card structure, shared y-scales across cards, shared time cursor. Differences must come from data, never layout.
4. **Time is the main control** (PhotoPills' time bar). One global time bar drives everything. Scrubbing the panorama horizontally also moves time.
5. **Colour means status or body, nothing else** (NASA display guidance, Astro UXDS). Fixed meanings (see §10). Red only for "no power and no comms". Every colour is redundant with an icon or label. Colourblind-safe palettes. WCAG AA text and 3:1 non-text contrast.
6. **Calm and restrained** (NASA KSC display practices, Tufte's data-ink). Muted surfaces, no ornamental chrome, plain readable type, tabular numerals.
7. **Honest about its limits.** A provenance line on every card (for example "Horizon: LOLA 60 m, nearest grid point 1.2 km · Ephemeris: DE440"). An "About the data" page with method, sources and validation results.
8. **The phone is a real target** (NASA Open MCT was built responsive so on-call operators can follow a mission from a phone). On mobile: one card per screen, swipe between cards, numbers before visuals.
9. **The link is the scenario** (Open MCT: "view your data your way"). Everything is reproducible from the URL.

### 6.1 Unslop direction (adapted from *unslop* by Damir Sokolovsky, @heydamir, CC BY 4.0)

Unslop's core idea: **keep the chrome quiet and put the richness into one or two moments of content.** Ridgeline's direction, written the way unslop asks:

- **Product:** compares lunar landing sites and dates for mission planners, showing whether a lander gets sunlight and Earth contact against the real horizon.
- **Character:** exact, calm, nocturnal.
- **World:** a night-shift mission console and a surveyor's instrument: graphite surfaces, hairlines, figures set in mono, low light raking across a ridge.
- **Moments:**
  1. **The horizon panorama on each card.** The terrain silhouette is drawn with care in graphite steps. The Sun is a warm disc with a soft limb. **Earth is drawn with its true phase**, lit on the side facing the Sun.
  2. **The landing calendar** (S1) as a quiet luminance heatmap.
- **Signature:** the **mission clock**. Every time in the app is written as mission-elapsed time in mono, for example `T+3 d 04 h`. Calendar time appears only on request. This one detail is used everywhere a time appears and nowhere else.

**Rules this adds** (they refine §10; where they conflict with an earlier line, these win):
- **Colour budget:**
  - The surfaces are a graphite neutral ramp.
  - The only hues are the bodies: Sun amber, Earth blue. **"Both" is drawn in the primary ink (off-white on dark)**, the brightest mark on the screen, because it is the number that matters.
  - Status uses toned semantic green/red only for the verdict, alongside a grey dot for Marginal (amber would collide with the Sun).
  - No other accent in the chrome. The primary button is off-white from the ramp with dark text.
- **No gradients, glows, coloured shadows, blobs, emoji, sparkles, uppercase tracked labels, "New" badges, exclamation marks, hype words, or looping animation** (except playback, which explains something).
- **4 px spacing grid.** Equal things are equal sizes, and spacing shows grouping: tighter inside a group, looser between groups.
- **Type:** IBM Plex Sans (interface) + IBM Plex Mono (figures, meta, the mission clock). Weights 400/500 (600 rare). Sentence case. Tabular numerals in one format. No italic for emphasis.
- **Charts:** the panorama is the one main chart on a card. The timeline is smaller and different in kind (bands). Metric cells are numbers only: label, figure, and change, with no sparklines.
  - **Changes always say what they compare to:** the second to fourth cards show deltas against the first, for example `Both 212 h · −96 h vs A`.
- **Depth on dark comes from surface steps and hairlines** (primary text at 8%), not shadows. Nested radii: inner = outer − padding, minimum 4.
- **Motion:** one easing curve, `cubic-bezier(0.22, 1, 0.36, 1)`. Durations: 120–180 ms for feedback, 160–220 ms for menus, 300–500 ms for entrances. Transition only colour, opacity and transform. At most one short fade-and-rise on load.
- **Template check before calling the UI done:** if you swapped the product name for another product's, would the screen still fit? If yes, push the copy, the moments and the signature harder.

### 6.2 Astryx design-system principles (Meta's Astryx, installed by Jack)

Ridgeline is built on **Astryx** (`@astryxdesign/core` with a custom theme extended from `@astryxdesign/theme-neutral`). Its principles, applied:
1. **Components over primitives.** Use Astryx components for every pattern they cover: buttons, inputs, menus, sheets, tooltips, tables, lists, layout. Raw elements remain only for the domain visualisations (canvas/SVG panorama, timeline, map, calendar), where Astryx has no equivalent.
2. **Semantic tokens over hard-coded values.** App code never contains a hex colour or a pixel spacing literal. Colours, spacing, radii, motion and type come from tokens defined once in the Ridgeline theme (`defineTheme`, extending neutral). The Sun and Earth colours live in the theme's data-visualisation tokens. Canvas code reads token values through `useTheme()` / `resolveThemeTokens()`.
3. **Theme-agnostic code.** Dark and light modes work by switching the theme, never by editing components.
4. **Frame-first layout.** Pick the shell and budget its regions before any content exists:
   - header 56 px
   - left panel 280 px
   - fluid content capped at 1600 px
   - pinned time-bar footer
   - Content-first layouts drift into a padded column of cards.
5. **Dense data renders as rows.** The scenario list, site list, secondary metrics and validation table are `List`/`MetadataList`/`Table` rows with dividers. `Card` is only for the scenario widgets.
6. **Status uses `StatusDot` or `Token`, never decorative `Badge`.** Badge is for counts and enumerated states only.
7. **Controlled inputs, and links through `useLinkComponent()`** with `LinkProvider` bound to `next/link`.
8. **Read the component docs before using a component** (`npx @astryxdesign/cli component <Name> --dense`). Never invent props.

**Review standard:** before any UI task is called done, it passes Astryx's "is my code good" rubric (app fit, Astryx components, icons, styling, layout, assets, code health; each rated good / needs work / not inspected, with evidence) **and** the unslop checklist plus template check.

## 7. Domain model and physics

All of this runs in a pure TypeScript engine module (§9.3), mirrored by a Python reference implementation in the pipeline that produces test fixtures.

### 7.1 Frames and constants
- **Frame:** Moon mean-Earth/polar-axis body-fixed frame (`MOON_ME` in SPICE).
- **Moon reference radius** R = 1737.4 km (the LOLA reference sphere). Site radius = R + DEM height + observer height.
- **Observer height** h_obs = 2.0 m above the terrain (a representative lander mast/panel height). *Claude's call, shown in "About the data".*
- **Body radii:** Sun 696,000 km, Earth 6,371 km.

### 7.2 Site position and local axes
- Site vector **p** = (R + h_dem + h_obs) · [cos φ cos λ, cos φ sin λ, sin φ] (φ latitude, λ east longitude).
- **Up** u = p/|p|. **East** e = normalise(ẑ × u). **North** n = u × e.
- **At exactly ±90° latitude**, e is undefined. Compute the frame as the limit along λ = 0. At the south pole this gives e = +ŷ (toward 90°E) and n = +x̂ (toward 0°E). Document that at the pole "north" means "toward 0° longitude".

### 7.3 Topocentric Sun/Earth position
- Body position **B** (km, MOON_ME, apparent: light-time + stellar aberration) comes from the ephemeris table, linearly interpolated in time.
- **v** = B − p (full topocentric vector; Earth parallax reaches about 0.26°, so this matters).
- Elevation el = asin(v·u / |v|). Azimuth az = atan2(v·e, v·n), in degrees in [0, 360), measured clockwise from north.
- Angular radius r = asin(R_body / |v|) (Sun about 0.27°, Earth about 0.95°).

### 7.4 Terrain horizon and disc visibility
- **Horizon profile** H(az): terrain horizon elevation angle at azimuth az, from the precomputed table (0.5° steps for the grid, 0.1° for curated sites), linearly interpolated with wrap-around.
- **Visible fraction** of a disc whose centre is at elevation el, radius r, against horizon H: let d = (el − H)/r.
  - d ≥ 1 → 1; d ≤ −1 → 0; otherwise f = 1 − (acos(d) − d·√(1−d²))/π.
  - This treats the horizon as flat across the disc width (fine at these disc sizes; noted in About).
- No atmospheric refraction (the Moon has no atmosphere).

### 7.5 States and settings (defaults are Claude's calls; all user-adjustable in Settings and stored in the URL)
| Concept | Definition | Default |
|---|---|---|
| **Sun lit** | Sun visible fraction ≥ threshold | 50% (options: any part / 50% / full disc) |
| **Earth in view** | Earth centre elevation ≥ H(az) + margin | margin 0° (range 0–5°) |
| **Both** | Sun lit AND Earth in view | n/a |
| **Power proxy** | Visible fraction × panel factor. Default: vertical panel that faces the Sun's azimuth, factor cos(el), so about f. X3 adds a fixed panel azimuth: factor max(0, cos(el)·cos(az − panel_az)) | vertical, Sun-facing |
| **Mission duration** | Window [T0, T0 + D] | 14 days (range 1–30) |
| **Battery reserve** | Darkness the lander can ride through | 24 h (range 0–200 h) |

### 7.6 Metrics
- **At cursor time t:** Sun az/el/visible %, Earth az/el/in-view, power proxy.
- **Countdowns from t:** time to sunset (or to sunrise if dark) and time to Earthset (or to Earthrise). Search forward up to 60 days; events refined to 1 minute by bisection. If none is found in 60 days, show "> 60 d".
- **Over the mission window:** sunlit hours and %, Earth-in-view hours and %, **both** hours and %, longest continuous darkness, longest continuous comms gap, first sunset after T0, mean power proxy.
- **Verdict** (thresholds in a single config module, shown in Settings):
  - **Good:** both ≥ 50% of the mission AND longest darkness ≤ battery reserve.
  - **Poor:** both < 20% OR longest darkness > 2 × battery reserve.
  - **Marginal:** everything else.
  - The verdict always shows its reason (for example "Poor: 62 h darkness starting T+9 d").

**Additional metric rules**
- **Landing-moment check (M14):** Sun lit AND Earth in view at every sample in [T0 − 1 h, T0]. If this fails, the verdict is Poor with the reason "No DTE during descent" or "Landing in darkness".
- **Flicker handling:** at the pole the Sun can graze a ridge and blink in and out. Gaps shorter than 30 minutes inside a lit or in-view period are merged for the window and countdown logic (configurable 0–120 min). The number of merged flickers is reported in the secondary metrics, so nothing is hidden.

### 7.7 Time sampling
- Mission windows are sampled every 10 minutes (14 days = 2,016 samples). Events are bisected to 1 minute.
- All times are UTC in ISO 8601. The UI shows UTC, with an optional display time zone (for example mission-ops local time).
- The supported date range is set by the ephemeris table: **1969-01-01 to 2035-12-31 UTC** (covers Apollo through the Artemis era). Dates outside it are disabled with an explanation.
- About-page note: UTC is used because Coordinated Lunar Time (LTC), which NASA was directed to develop in 2024, is not yet an operational standard.

### 7.8 Eclipses and solar interference (M13)
- **Lunar eclipse** = Earth's disc covering the Sun's disc as seen from the site. Let r_s and r_e be the angular radii and d the angular separation of the centres (computed from the topocentric vectors, so correct per site).
  - d ≥ r_s + r_e: no blocking.
  - d ≤ r_e − r_s: Sun fully blocked (Earth's disc, about 1.9°, is much larger than the Sun's, about 0.53°).
  - Otherwise the blocked fraction = lens area / (π r_s²), where
    lens = r_s²·acos((d² + r_s² − r_e²)/(2 d r_s)) + r_e²·acos((d² + r_e² − r_s²)/(2 d r_e)) − ½√((−d + r_s + r_e)(d + r_s − r_e)(d − r_s + r_e)(d + r_s + r_e)).
- Sun visible fraction = terrain fraction × (1 − blocked fraction). Light refracted through Earth's atmosphere is ignored (negligible for power; noted on the About page).
- **Why this matters:** a total lunar eclipse can cut a lander's power for hours with no terrain involved. A terrain-only tool misses this completely.
- **Solar interference:** when the Sun–Earth centre separation is below the interference angle (default 2°, range 0–10°, antenna-dependent), the Sun sits in or near a DTE antenna's beam. The Earth band shows a hatched "possible solar interference" flag. It is a warning only and does not change the in-view state.

### 7.9 Ground-station visibility (S7)
- A DTE link needs both ends: Earth above the site's horizon **and** the Moon above an Earth ground station's horizon.
- **Stations:** NASA Deep Space Network complexes at Goldstone (California), Madrid (Spain) and Canberra (Australia). The pipeline uses published station coordinates (cited) and an elevation mask of 10° (configurable).
- **Pipeline output:** hourly Moon elevation at each station (int8, degrees), computed with SPICE using an Earth body-fixed frame (IAU_EARTH is accurate enough for a 10° mask).
- When the Moon is far south in Earth's sky, the northern stations get short passes and Canberra carries most of the coverage. The layer makes those gaps visible.

### 7.10 Robustness band (S8)
- **Horizon uncertainty:** recompute the metrics with H(az) + m and H(az) − m (default m = 0.3°, chosen to cover DEM resolution limits and near-field boulders and small craters that LOLA cannot resolve). Report the min–max range.
- **Landing dispersion:** recompute the metrics for every grid horizon within the landing-ellipse radius (default 2 km; IM-2 landed about 400 m from target). Report the min–max range. On a 2 km grid this is coarse, so the UI states the number of points used.
- Ranges are computed in the worker. Headline numbers show the nominal value with the range in smaller type.

### 7.11 Lunar seasons and window drift (S10)
- The Moon's equator is tilted only about 1.54° to the ecliptic. The Sun's sub-solar latitude swings between about ±1.54° over an **eclipse year (about 346.6 days), not a calendar year**, so lunar seasons slip about 19 days earlier each calendar year.
- Earth's latitude libration, which controls Earth's height above the south-polar horizon, cycles with the draconic month (about 27.21 days). The Sun circles the polar sky with the synodic month (about 29.53 days).
- The two cycles beat: 1 / (1/27.21 − 1/29.53) ≈ 346.6 days. **This is why good sun-plus-Earth overlap drifts about 2.3 days earlier each month and the pattern repeats about once every 346.6 days.**
- The calendar annotates this, which gives planners a rule of thumb: "if this month's window is gone, the next one comes about 27 days later, slightly worse or better depending on the season."

## 8. Data pipeline (offline, Python)

Lives in `pipeline/`. It is reproducible from a clean checkout plus the downloaded source data. Outputs land in `public/data/` and are committed. Runtime target: **≤ 2 hours on Jack's laptop**, so it can run at hackathon kickoff if pre-building is not allowed (§13).

### 8.1 Environment
- Python 3.12 venv at `C:/Users/User/.venvs/lunar_site_planner`.
- Dependencies: `spiceypy`, `numpy`, `numba`, `rasterio` (or GDAL), `pyproj`, `pillow`, `requests`, `pytest`.
- Known machine quirk: pip/curl SSL fails in the Bash tool, so use PowerShell for installs and downloads (curl needs `--ssl-no-revoke`).

### 8.2 Ephemeris (`ephemeris/YYYY.bin`)
- **Source:** NASA NAIF SPICE generic kernels: leapseconds (LSK), planetary ephemeris (DE440 or DE440s SPK), lunar orientation binary PCK plus lunar frames kernel providing `MOON_ME`, and the generic text PCK. The builder picks the current file versions from NAIF's generic kernels site and records them in `DATA_SOURCES.md`.
- **Output:** for each year 1969–2035, an hourly table of Sun and Earth position vectors (km) relative to the Moon's centre in `MOON_ME`, aberration `LT+S`, stored as Float32 [x, y, z] × 2 bodies. About 210 KB per year (about 14 MB total, loaded lazily per year). Plus `ephemeris/index.json` (start epoch, step, count, kernel versions).
  - Check that the chosen lunar orientation kernel covers 1969–2035. If it doesn't, narrow the range to its coverage and state that in the UI.
- **Ground stations (S7):** `ephemeris/dsn/YYYY.bin`, hourly Moon elevation at the three DSN complexes (int8), about 26 KB per year.
- **Subsolar latitude (S10):** derived in the engine from the Sun vector; no extra file.
- **Interpolation:** linear between hourly samples. The angular error is < 0.001°, which the pipeline verifies by comparing against direct SPICE calls at off-grid times.

### 8.3 Terrain horizons
- **Sources:**
  - South pole: a NASA PGDA LOLA polar stereographic DEM covering 80°S–90°S. Use the finest product practical to download and process (about 20–60 m/px). The builder chooses the exact product from PGDA's LOLA polar DEM page and records it.
  - Non-polar curated sites: the global LOLA DEM (about 118 m/px class product).
- **Algorithm:** for each observer point, cast rays at fixed azimuth steps out to a maximum distance (200 km polar, 100 km non-polar). Sample the DEM bilinearly along the great-circle path. The step grows with distance: step = max(DEM res, 0.002 · s). The elevation angle of each sample, with exact spherical curvature, is
  `el = atan2((R+h_t)·cos(s/R) − (R+h_o), (R+h_t)·sin(s/R))`
  and the horizon is the maximum along the ray. Implemented in numba and parallelised over points.
- **Polar grid:** a 2 km spaced grid in polar stereographic x/y covering a 190 km radius from the pole (about 84.0°S and poleward, roughly 28k points). 720 azimuths (0.5°), stored as int16 centi-degrees.
  - Stored as **tiles** of 40 × 40 km: `horizons/grid/{i}_{j}.bin`, each under 600 KB raw, about 40 MB total.
  - `horizons/grid/index.json` holds the projection parameters, tile layout and grid spacing.
- **Curated sites:** an individual horizon at 0.1° azimuth (3,600 values) computed from the best available DEM at the exact coordinates, at observer heights 2 m, 10 m and 50 m (S9). Stored as `horizons/sites/{id}.bin` (3 profiles per file).
- **Fallback if compute is too slow:** 4 km grid and/or 1° azimuths (decide after timing a 500-point sample). Curated sites are always computed first.

### 8.4 Basemaps and overlays
- `basemaps/south-pole.webp`: hillshade rendered from the polar DEM, polar stereographic, about 4096 px across a 190 km radius (plus a 2048 px mobile variant).
- `basemaps/global.webp`: global hillshade or mosaic in equirectangular projection, 2048 × 1024, from LOLA or the LROC WAC global mosaic.
- `overlays/psr.json` (S5): simplified permanently shadowed region polygons from a published dataset (PGDA or LROC), with a cited source.
- All imagery is NASA-sourced and credited on the About page.

### 8.5 Site catalog (`sites.json`)
Fields: `id`, `name`, `group`, `lat`, `lon`, `source_url`, `notes`, optional `actual_landing_utc`, optional `outcome`.

Groups (≥ 25 sites total):
- **Apollo:** 11, 12, 14, 15, 16, 17.
- **CLPS & commercial:** IM-1 *Odysseus* (Malapert A area), IM-2 *Athena* (Mons Mouton area), Firefly *Blue Ghost* M1 (Mare Crisium), plus other publicly announced CLPS/commercial targets with published coordinates.
- **Other nations:** Chandrayaan-3 (Shiv Shakti point), Chang'e-3/4/5/6, SLIM (near Shioli crater), and any other landed or targeted sites with published coordinates.
- **Artemis III candidate regions:** NASA's current published list. The builder checks whether NASA has updated the 2024 list. Use one representative point per region, and say so in the notes.
- **Notable polar features:** Shackleton rim, Shackleton–de Gerlache connecting ridge, Malapert massif, and other frequently studied high-illumination points.

**Rule:** no coordinate enters `sites.json` without a `source_url` (NASA, LROC, agency or peer-reviewed). Where sources disagree, prefer LROC-measured landing positions and note it.

### 8.6 Fixtures and validation outputs
- `pipeline/fixtures/*.json`: Python-computed engine outputs (az/el, fractions, events, metrics) for about 10 scenarios. TypeScript tests must match them.
- `public/data/validation.json`: results of §11.2, shown on the About page.

## 9. App architecture

### 9.1 Stack (Claude's calls)
- **Next.js** (current stable) App Router + **TypeScript (strict)**, built as a **static export** (`output: 'export'`). No server is needed, so it is portable to any static host.
- **Astryx** (`@astryxdesign/core` 0.7.15, `@astryxdesign/theme-neutral` 0.7.15, `@stylexjs/stylex` ^0.19, `@astryxdesign/cli` 0.7.15 as a dev dependency; React ≥ 19) as the component and token system.
  - A custom **Ridgeline theme** built with `defineTheme({ extends: neutralTheme, … })` and `astryx theme build` (pre-built CSS, so styles exist on first paint in the static export).
- **Tailwind CSS** via Astryx's Tailwind bridge (`@astryxdesign/core/tailwind-theme.css`) for layout utilities only, so utilities resolve to Astryx tokens.
- **D3** (scales, shapes, d3-geo projections) with custom **SVG/Canvas** components. No heavy chart or map library. The panorama and map render on Canvas for performance, with SVG overlays for labels and interaction.
- **Zustand** for state, with two-way sync to the URL.
- **Web Worker** (via Comlink) for the engine's heavy work: calendar, next-good-date, heatmap, countdown searches.
- **PWA:** web manifest plus a service worker that caches the app shell, ephemeris and visited tiles (library at the builder's discretion, for example Serwist or Workbox).
- **Testing:** Vitest (unit), Playwright (a few end-to-end smoke flows), ESLint + Prettier.
- **Stretch 3D:** three.js via react-three-fiber.
- **Fonts:** IBM Plex Sans + IBM Plex Mono (tabular numerals for metrics), self-hosted.

### 9.2 Repo layout
```
lunar-site-planner/
  app/                 # Next.js routes: / (main), /about
  components/          # ScenarioCard, HorizonPanorama, Timeline, MetricsBar, MapPicker, TimeBar, SitePicker, Settings, ...
  lib/engine/          # pure TS physics + metrics (no DOM)
  lib/data/            # loaders for ephemeris, tiles, sites; caching
  lib/state/           # zustand store + URL codec
  workers/             # engine worker entry
  public/data/         # pipeline outputs (committed)
  pipeline/            # Python: ephemeris, horizons, basemaps, catalog, fixtures, validation
  tests/               # vitest + playwright
  docs/superpowers/    # specs + plans
  DATA_SOURCES.md      # every dataset, version, URL, licence/credit
  README.md
```

### 9.3 Engine API (`lib/engine`)
- `siteFrame(lat, lon, hDem) → {p, u, e, n}`
- `bodyAt(body, tUtc) → Vec3` (interpolated)
- `topocentric(body, site, t) → {az, el, r, dist}`
- `horizonAt(profile, az) → H`
- `discFraction(el, H, r) → f`
- `sample(site, t0, durationH, stepMin) → TimeSeries`
- `findEvent(site, t, kind) → Date | null` (kind ∈ sunset, sunrise, earthset, earthrise)
- `metrics(series, settings) → Metrics` (includes the verdict and its reason)
- `scanDates(site, from, days, settings) → DaySummary[]` (S1, S2)
- `sunBlockedByEarth(sunVec, earthVec) → fraction` and `sunEarthSeparation(...) → deg` (M13)
- `landingCheck(series, t0) → {ok, reason}` (M14)
- `stationCoverage(t) → {goldstone, madrid, canberra}` (S7)
- `robustness(site, scenario, settings) → {min, max}` per metric (S8)
- `subsolarLatitude(t) → deg` (S10)

The engine has no DOM access and is deterministic: the same inputs always give the same outputs.

### 9.4 Data loading
- Ephemeris years are loaded lazily, for the years the scenarios touch.
- Horizon tiles are loaded on demand for the selected point (plus neighbouring tiles for S4) and cached in memory and by the service worker.
- Site horizons are loaded per site.
- Target payload for a first view: ≤ 1.5 MB data + ≤ 250 KB gzipped JS.

### 9.5 URL state (versioned)
`/?v=1&sc=<scenario>;<scenario>&dur=14&lit=50&em=0&bat=24&axis=met&t=<cursor hours>`
- `<scenario>` = `<siteRef>@<ISO UTC>`, where `siteRef` is a catalog `id` or `c:<lat>,<lon>` (3 decimals).
- Unknown or invalid params fall back to defaults with a non-blocking notice. Never a blank screen.

## 10. Screens and visual system

### 10.1 Layout
- **Desktop (≥ 1024 px):**
  - Top bar: name, Share, Settings, theme toggle, About.
  - Left panel (280 px, Astryx `LayoutPanel`): scenario list as `List` rows (add/remove up to 4; each row = site + date/time) and a site picker with Search / Map tabs.
  - Main area: scenario cards in a grid (1 → 1 column, 2 → 2 columns, 3–4 → 2 × 2).
  - Bottom: sticky global time bar (play/pause, speed, scrubber in T+ days or calendar time).
  - The Moon-vs-Earth stat strip sits under the top bar, dismissible.
- **Tablet (768–1023 px):** cards in one column, picker in a drawer.
- **Mobile (< 768 px):** one card per screen with horizontal swipe and dot indicators. Scenario editing in a bottom sheet. Time bar sticky at the bottom. Within a card the order is verdict + numbers, then panorama (horizontally pannable, wraps 360°), then timeline.

### 10.2 Scenario card (identical in every instance)
1. Header: site name, group tag, landing date/time, verdict chip with reason on hover/tap.
2. Metrics row: **Both hours** (largest), Sunset in, Earthset in, Sun elevation now.
3. Horizon panorama: terrain silhouette (filled), Sun path (amber) with daily tick marks, Earth path (blue, showing its libration loop), current discs, compass labels N/E/S/W, "vertical ×N" label. The y-range is shared across cards (auto-fit to all scenarios' content).
4. Timeline: Sun / Earth / Both bands, darkness and comms-gap markers, T0 marker, cursor.
5. Provenance line (small).
6. Secondary metrics (collapsed by default): sunlit %, Earth %, longest darkness, longest comms gap, first sunset, mean power proxy, plus a raw az/el table at the cursor.

### 10.3 Colour and type tokens
All values are tokens in the Ridgeline Astryx theme (§6.2). Starting values come from unslop's token tables and the builder tunes them to the contrast targets.

- **Surfaces: graphite ramp.**
  - Dark: deepest #0f0f10, page #141415, card #19191b, raised #232325.
  - Light: page #fafafa, card #ffffff, raised #f4f4f5.
  - Hairline = primary text at 8%.
- **Text roles:**
  - Dark: primary #ededed, secondary #a1a1a6, muted #85858b.
  - Light: primary #171717, secondary #525252, muted #737373.
- **Bodies** (data-visualisation tokens):
  - Sun = amber (`#E69F00` family).
  - Earth = blue (`#56B4E9` on dark, `#0072B2` on light).
  - **Both = primary ink** (off-white on dark, near-black on light).
  - Eclipse and solar-interference marks are neutral hatching.
- **Status (verdict only, always with icon and text, via `StatusDot`):**
  - Good = toned green (#4cc38a dark / #16a34a light) with ✓.
  - Marginal = muted grey dot with !.
  - Poor = toned red (#e5484d dark / #dc2626 light) with ✕. Red is reserved for the Poor verdict and "no power and no comms".
- **Heatmaps:** a 5-step luminance ramp from the deepest surface to primary ink (meaning more "both" hours = brighter). It is colourblind-safe and keeps "Both = ink" consistent.
- **Chrome accent:** none beyond ink. Primary button = off-white fill with dark text (dark theme), or primary-text fill with white text (light theme). Selection = raised surface step plus hairline.
- **Type:** IBM Plex Sans (interface) and IBM Plex Mono (figures, meta, mission clock), self-hosted, set as the theme's font tokens (replacing neutral's Figtree). Use the Astryx type-scale tokens. Card figures are about 28–32 px at weight 500 with tabular numerals. No size below 11 px on mobile. Units are always shown (h, d, °).
- **Icons:** Lucide through Astryx `Icon` / `IconButton`, 16 px, stroke 1.5, in the text-role colour. A Sun glyph and an Earth glyph are used redundantly with colour everywhere.
- **Radius:** keycaps/tags 4–6, rows/inputs/buttons 8–10, cards 12–16, panels 14–20, set through the theme's radius tokens.

### 10.4 Accessibility
- Full keyboard operation (time bar: arrow keys step 1 h, Shift+arrow 1 day, Space to play/pause).
- Visible focus rings.
- `prefers-reduced-motion` disables auto-play easing.
- Charts have text equivalents (metrics plus an aria-described summary per card).
- Touch targets ≥ 44 px.

## 11. Quality

### 11.1 Tests
- **Engine unit tests:**
  - Disc-fraction endpoints and symmetry.
  - Azimuth conventions, including pole handling.
  - Interpolation.
  - Event bisection.
  - Metric aggregation and verdict rules.
  - URL codec round-trip.
- **Cross-language fixtures:** TypeScript engine output must match the Python reference within 1e-6 (angles in degrees) for the fixture scenarios.
- **E2E smoke tests (Playwright):**
  - Load the default view.
  - Add a scenario.
  - Change a date.
  - Copy link, open it, and confirm the state is identical.
  - Mobile viewport swipe.
- **Pipeline tests (pytest):** curvature formula, ray-cast against a synthetic DEM (a cone and a plane with known horizons), tile packing round-trip.

### 11.2 Scientific validation (results published on the About page)
1. **Ephemeris vs JPL Horizons:** for 3 sites (one polar, two non-polar) × 20 times, Sun and Earth az/el from the engine vs Horizons observer tables for a lunar surface site (geometric, no terrain). **Tolerance: ≤ 0.05°.**
2. **Polar Sun range sanity:** at the pole on a smooth sphere, Sun elevation stays within about ±1.6° over 2025–2032.
3. **Illumination sanity:** average sunlit fraction over 2025–2032 at the Shackleton rim and connecting-ridge points, compared with published values (Gläser et al. 2018, about 85.5% for the Shackleton rim; Mazarico et al. 2011 / PGDA maps). Expect agreement within about 10 percentage points; differences are explained by period, observer height and resolution.
4. **Interpolation error:** < 0.001° vs direct SPICE (§8.2).
5. **Eclipse check:** the engine detects the total lunar eclipses of 2025-03-14 and 2025-09-07 (and 2026-03-03) at a near-side site, with totality timing within 10 minutes of NASA's published eclipse times.
6. **Mission replays** (a strong story for judges):
   - **Chandrayaan-3** (landed 2023-08-23): the predicted sunset at the Shiv Shakti point should fall close to when ISRO put Vikram and Pragyan to sleep (2–4 Sept 2023).
   - **SLIM** (landed 2024-01-19): the Sun's azimuth should move into the west during the days the lander revived, consistent with its west-facing panels.
   - **IM-2 Athena** (landed 2025-03-06, Mons Mouton area): show the low Sun direction and the horizon at the landing site.
   - Each replay is a one-click link from the About page. Text claims stay limited to what the sources say.

### 11.3 Performance budgets
- First view interactive ≤ 2.5 s on fast 4G.
- Scenario recompute ≤ 150 ms.
- Animation at 60 fps on a mid-range phone for 2 cards.
- Calendar (S1) ≤ 1.5 s.
- Lighthouse: Performance ≥ 85, Accessibility ≥ 95, PWA installable.

## 12. GitHub and deployment

- **GitHub repo:** `jackalaka21/lunar-site-planner` (renamed if the project name changes). **Public** (hackathon judging needs public access, and the code is under the MIT licence). Data credits go in `DATA_SOURCES.md`.
- **Account rules (from Jack's previous projects):**
  - Push with `GH_TOKEN="$(gh auth token --user jackalaka21)"`.
  - **Never use the default work gh account (`Intern01Biobot`).**
  - Repo-local git identity: Jack / loweejinjack23@gmail.com.
  - Commits end with the current Claude co-author line.
- **Branching:** `main` = production. Feature branches open PRs, and Vercel builds a preview URL for each.
- **CI (GitHub Actions):** on every PR and push, run lint, typecheck, Vitest, `next build`, and pytest (pipeline tests on synthetic fixtures only; no large downloads in CI).
- **Hosting: Vercel Hobby**, connected to the GitHub repo through Vercel's Git integration (auto-deploy on push to `main`, preview per PR).
  - Why Vercel: native Next.js support, free, previews per branch. A non-commercial hackathon demo fits the Hobby plan's non-commercial-use rule.
  - **Already set up (verified read-only on 2026-11-08):** Vercel account `jackalaka21` on the Hobby plan, personal scope (no teams), with the GitHub namespace `jackalaka21` linked and unrestricted repo access. The Vercel connector is available in Claude's session.
  - Once the GitHub repo exists, Claude creates the Vercel project linked to it through the connector (one approval at that point): framework Next.js, output = static export, production branch `main`. No sign-in step is needed from Jack. Claude never handles credentials.
- **Portability fallback:** because the app is a static export, the same `out/` folder deploys unchanged to **Cloudflare Pages** (preferred fallback: generous free bandwidth) or **GitHub Pages** if Vercel limits or plan rules ever become a problem.
- **Data size:** keep every committed file < 50 MB (tiles are < 1 MB each) and the total `public/data` ≤ about 60 MB. No Git LFS.

## 13. Gates and pre-event checklist

These need Jack's explicit OK at the time; the build plan must stop and ask.

| Gate | Why |
|---|---|
| **Check event rules** on pre-building | Decides whether the pipeline and code can start before kickoff, or only these docs. If pre-building is not allowed, run the pipeline at kickoff in the background while the UI is built against a synthetic horizon fixture. |
| **Data downloads** (DEMs, SPICE kernels, basemap sources) | Large files: state each file name, source and size, then get approval. |
| **Create GitHub repo, push, create Vercel project, deploy** | **Pre-approved for the event (14–15 Nov 2026), see §18a.** Outside the event window, the standing "ask before every push" rule applies. |
| **Submitting to the hackathon** | Jack submits. |

**Pre-event checklist for Jack:** read the rules (pre-building, submission format, video length), confirm the event dates and length, and free up about 5 GB of disk for the DEMs.

## 14. Hackathon deliverables
- Live public URL (Vercel).
- Public GitHub repo with README (problem, what it does, screenshots/GIF, how to run, data and method, validation results, credits).
- **Demo video** following the §3 demo story. Claude writes the shot list and narration; Jack records.
- Project description text for the submission form (Claude drafts, Jack edits and submits).
- The About page doubles as the "how we know it's right" slide.

**Event requirements (from the organisers' briefing, 2026-11-14)**
- **Event:** NASA Space Apps Challenge Singapore 2026, virtual, 14 Nov 09:00 SGT to 15 Nov 23:59 SGT. Internal submission target 15 Nov 21:00 SGT.
- **Challenge:** "Lunar Landing Site Navigator". Its Resources tab lists Quickmap, Moon Trek, JPL Horizons and the CSA Moon Exploration portal. Ridgeline uses Horizons for validation, cross-checks against the PGDA illumination maps that Quickmap displays, deep-links to Quickmap / Moon Trek / Horizons (M16), and credits CSA.
- **At least one NASA dataset is mandatory.** Name each one, link its source, and explain how it supports the solution, in the submission, README and About page.
- **Submission fields:**
  1. Project Summary
  2. Project Demo (a 30-second video **or** a 7-slide presentation; the video is primary and a slide outline is the backup)
  3. Final Project Link (public)
  4. Project Details (approach, tools, technologies, NASA datasets)
- **Judging:** Impact, Creativity, Validity, Relevance, Presentation, each scored 1–5.
- **Optional Zoom Q&As:** 14 Nov 20:00 SGT, 15 Nov 17:00 SGT.

**Judging and submission considerations**
- **Map features to the judging criteria.** Space Apps has historically judged on impact, creativity, validity, relevance and presentation; confirm against this event's page. The README and video each name which feature answers which criterion:
  - Validity → §11.2 validation and mission replays.
  - Impact → the schedule-slip workflow.
  - Creativity → horizon-first design, eclipses, season drift.
  - Relevance → the brief's objectives, every one mapped in §5.
  - Presentation → the 30-second demo story.
- **Use partner-agency data and say so:** NASA (LOLA, LROC, NAIF/JPL), ISRO (Chandrayaan-3 site), JAXA (SLIM site). Credits on the About page and in the README.
- **AI-use disclosure:** check the event's rules on AI-assisted work, and include a short, honest disclosure in the README (Claude drafts, Jack approves).
- **Protect the demo:**
  - Record the demo video as soon as Tier 1 is live on day 2, before attempting Tier 2.
  - Tag that commit `submission-candidate`.
  - Vercel keeps every deployment, so instant rollback is possible.
  - Keep a local `out/` build that runs offline as a last-resort backup.
- **Shared-link previews:** a static Open Graph image and title/description so links look right when shared in Discord, Slack or judging forms.
- **Basic hardening:** a `vercel.json` with security headers (CSP restricted to self, no third-party scripts), no analytics, no cookies, no secrets in the repo, raw DEMs and kernels in `.gitignore`, and SHA-256 checksums of every downloaded source file recorded in `DATA_SOURCES.md`.
- **Browser support:** current Chrome, Edge, Firefox, Safari, and iOS Safari 16+. Graceful message if Web Workers or WebGL (stretch only) are missing.
- **Error states:** failed tile or ephemeris fetch → inline retry; offline → banner plus cached data; invalid URL → defaults plus notice.

## 15. Build order (for the implementation plan)

1. **Scaffold:** repo, Next.js static export, tokens, CI, Vercel hookup (gates).
2. **Pipeline A:** ephemeris tables, plus the Horizons validation.
3. **Engine:** TypeScript physics and metrics, plus Python reference fixtures and tests. Use a synthetic horizon until real tiles exist.
4. **Single card:** panorama, timeline, metrics, time bar, animation.
5. **Pipeline B:** curated-site horizons, then the polar grid (time a sample first and pick the grid density), plus basemaps.
6. **Compare + URL state + share.**
7. **Map picker + custom coordinates + site catalog.**
8. **Mobile layout + PWA + accessibility pass + deploy.** *This completes Tier 1.*
9. **Tier 2** in order: S2, S1, S10, S8, S7, S9, S3, S4, S5, S6 (cheapest, highest-insight items first).
10. **Tier 3** if time remains.
11. **Polish:** About page with validation, README, demo script, video support.

### 15a. How the plan is executed (Jack's instruction)
- Execute the implementation plan with **Sonnet subagents** (Agent tool, `model: "sonnet"`), following superpowers:subagent-driven-development. Each plan task is dispatched to a Sonnet subagent, and the main session reviews each result before moving on.
- Independent tasks may run in parallel (for example pipeline B running while UI tasks proceed). Tasks that touch the same files run one at a time.
- The main session owns the gates in §13, integration, merges to `main`, and the final verification.

## 16. Risks and fallbacks

| Risk | Fallback |
|---|---|
| DEM download is large or slow | Fetch first. Use a coarser PGDA product if needed. Curated sites first. |
| Horizon grid compute is too slow | Time a 500-point sample, then fall back to a 4 km grid and/or 1° azimuths. |
| Rules forbid pre-building | Run the pipeline at kickoff in the background. Build the UI on the synthetic fixture meanwhile. |
| A physics error undermines credibility | Horizons validation gate (§11.2) before any UI polish. Provenance line on every card. |
| Scope creep in a solo week | Strict tier order. The demo path is polished before any Should-have. |
| Hosting limits or plan rules | Static export, so switch to Cloudflare Pages unchanged. |
| Pole azimuth convention confuses users | Tooltip: "At the pole, north = toward 0° longitude". Compass labels on the panorama. |
| Out-of-date site lists (Artemis III, CLPS) | Builder re-checks sources at build time. "Last checked" date shown in the site picker. |

## 17. Calls Claude made (check these while reading)
- Working name "Ridgeline"; repo `lunar-site-planner`.
- Project folder: `Coding Projects/lunar-site-planner`.
- PWA instead of a native app.
- Static-export Next.js on Vercel Hobby; Cloudflare Pages as fallback.
- Public repo with MIT licence.
- Dark theme default; IBM Plex fonts; Sun amber and Earth blue; status uses toned semantic green/red plus a grey Marginal.
- **Astryx adopted as the actual component library** (not just its philosophy), with a Ridgeline theme. **Confirmed by Jack on 2026-11-14.**
- From unslop: "Both" drawn in primary ink instead of green; Earth drawn with its true phase; the mission-clock signature; deltas vs scenario A on cards; graphite ramp. These replace the earlier Okabe-Ito green for Both and amber for Marginal.
- Defaults: 2 m observer height; "lit" = ≥ 50% of the Sun's disc; Earth margin 0°; 14-day mission; 24 h battery reserve; verdict thresholds in §7.6.
- Ephemeris range 1969–2035, hourly (for historical replays).
- Eclipse modelling and the landing-moment check are must-haves. The ground-station check, robustness band, mast heights and season annotations are should-haves. Tip-over resilience and approach glare are stretch goals.
- Defaults: solar-interference angle 2°, DSN mask 10°, horizon uncertainty ±0.3°, landing ellipse 2 km, flicker merge 30 min.
- Polar grid 2 km × 0.5° azimuth within 190 km of the pole; nearest-point lookup (no interpolation between horizons); smooth sphere outside the grid.
- Comparison aligned on mission-elapsed time by default.
- Up to 4 scenarios at once.
- **Default view on first open:** the demo story's first scenario (a Mons Mouton–area site on a date the engine rates Good, chosen by the builder once real data exists). The cursor starts at T0.
- **Coordinate input:** decimal degrees, south and west negative. Longitude accepts −180…180 or 0…360 and is normalised to −180…180. The latitude for the polar grid lookup must be ≤ −84°.
- **Calendar (S1) range:** 365 days starting from the first of the scenario's landing month, clipped to the ephemeris range.
- **"Find next good date" (S2) step:** 6-hour landing-time steps, searching up to 365 days ahead.

## 18. Left to the builder
- Exact versions of libraries and SPICE kernels, and the exact DEM products.
- Exact colour values within the token rules and contrast targets.
- Component decomposition, file naming, microcopy, icon choices.
- The service-worker library.
- Basemap styling.

## 18a. Jack's decisions (2026-11-08)
1. **Event window: 14–15 November 2026** (two days). Pacing:
   - **Day 1 (14 Nov):** build-order steps 1–6 (scaffold, pipeline A, engine, single card, pipeline B, compare + share). The pipeline runs in the background while the UI is built.
   - **Day 2 (15 Nov):** steps 7–8 (map, catalog, mobile, PWA, deploy) to complete Tier 1 by mid-day, then Tier 2 in order (S2, S1, then others as time allows), then polish and submission materials.
   - Tier 3 is unlikely in this window. A finished, polished Tier 1 beats a half-done Tier 2.
2. **Push and deploy autonomy granted for the event:** during the hackathon, Claude may create the `jackalaka21/lunar-site-planner` repo, push to it, create the linked Vercel project, and deploy without asking each time. Still always: use the `jackalaka21` token (never the work account), never force-push `main`, and keep CI green before merging to `main`.
3. **Public repo from day 1:** confirmed by Jack.

## 19. Sources
- Challenge: NASA Space Apps, lunar south pole lighting and communication brief (pasted by Jack).
- Site selection:
  - [Artemis III multi-criteria site study](https://arxiv.org/html/2406.19863v2)
  - [SpaceNews on Artemis III sites](https://spacenews.com/?p=507932)
  - [Universe Today: 13 candidate regions](https://universetoday.com/157270/here-is-where-astronauts-might-land-on-the-moon)
- Polar illumination:
  - [NASA PGDA Lunar Polar Illumination](https://pgda.gsfc.nasa.gov/products/69)
  - [JPL GSSR illumination and comms statistics](https://ipnpr.jpl.nasa.gov/progress_report/42-176/176C.html)
  - [the-moon.us South Pole](https://the-moon.us/wiki/South_Pole)
  - [NASA lunar surface ops paper](https://ntrs.nasa.gov/api/citations/20230006313/downloads/IAASS%202023%20Paper_Final_24apr23.pdf)
- Missions:
  - [Gizmodo on IM-2](https://gizmodo.com/intuitive-machines-reveals-why-its-moon-lander-faceplanted-into-a-crater-2000602752)
  - [Aerospace America on IM-2](https://aerospaceamerica.aiaa.org/intuitive-machines-lunar-south-pole-landing-attempt-highlights-challenges-for-artemis/)
  - [SpacePolicyOnline on Chandrayaan-3](https://spacepolicyonline.com/news/india-says-good-night-to-chandrayaan-3/)
  - [ScienceAlert on SLIM](https://www.sciencealert.com/breaking-japans-wonky-lander-surprisingly-survives-the-lunar-night)
- Existing tools:
  - [LROC QuickMap 2020 update](https://www.lroc.asu.edu/posts/1153)
  - [QuickMap July 2024 release](https://www.actgate.com/post/july-2024-quickmap-release)
  - [NASA SVS south pole Sun/Earth](https://svs.gsfc.nasa.gov/5228)
- Design:
  - [Shneiderman 1996](https://www.cs.umd.edu/users/ben/papers/Shneiderman1997next.pdf)
  - [Tufte notes](https://www.cc.gatech.edu/~stasko/7450/16/Notes/tufte.pdf)
  - [Astro UXDS status system](https://www.astrouxds.com/patterns/status-system/)
  - [NASA display colour memo](https://ntrs.nasa.gov/api/citations/19940019415/downloads/19940019415.pdf)
  - [NASA KSC display report](https://ntrs.nasa.gov/citations/20140011443)
  - [Open MCT design thinking](https://ntrs.nasa.gov/api/citations/20180003354/downloads/20180003354.pdf)
  - [Open MCT](https://Www.github.com/nasa/openmct)
  - [PeakVisor](https://peakvisor.com/en/news/sunrise-is-not-a-time-its-a-ridge.html)
  - [PeakFinder](https://www.peakfinder.org/mobile)
  - [PhotoPills](https://photopills.com/user-guide)
  - [SunCalc](https://suncalc.org)
  - [Datawrapper on colourblindness](https://www.datawrapper.de/blog/colorblindness-part2)
- Design systems:
  - *unslop* by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0 (rules adapted in §6.1; credit kept in README)
  - Astryx by Meta ([github.com/meta/astryx](https://github.com/meta/astryx))
- Hosting:
  - [Vercel Hobby plan](https://vercel.com/docs/plans/hobby-plan)
  - [Vercel fair use](https://vercel.com/docs/limits/fair-use-guidelines)
