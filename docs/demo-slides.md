# 7-Slide Backup Presentation Outline — Ridgeline

**Challenge:** NASA Space Apps Challenge Singapore 2026 — *Lunar Landing Site Navigator*
**Live App:** https://lunar-site-planner.vercel.app
**Source Code:** https://github.com/jackalaka21/lunar-site-planner

---

## Slide 1 — The Lunar South Pole Problem
- **Headline:** At the Moon's South Pole,Sunrise Is Not a Time—It's a Ridge
- **Key Points:**
  - The Sun never rises more than ~1.5°–7° above the south-polar horizon, and shadows are pitch-black with no atmosphere to scatter light.
  - A lander needs two things simultaneously: **sunlight for solar power** and **Earth above the terrain ridge for Direct-to-Earth (DTE) radio communication**.
  - **Real mission lessons:** Intuitive Machines' *IM-2 Athena* tipped into a shadowed crater near Mons Mouton and depleted its batteries in a day; *Chandrayaan-3* operated for one lunar day before nightfall; JAXA's *SLIM* survived only after the Sun moved west onto its tilted solar panels.
  - Specialist GIS tools (LROC Quickmap, Moon Trek, JPL Horizons) show long-term averages or single-point queries—none answers *"Our launch slipped two weeks; is the new date or backup site viable?"* in seconds.

---

## Slide 2 — Our Solution: Ridgeline
- **Headline:** Compare Lunar Landing Sites and Dates Side-by-Side in Seconds
- **Key Points:**
  - **Instant Verdict & Operational Metrics:** Scores any 1–30 day mission window (`Good`, `Marginal`, `Poor`) with plain-English reasons, usable "Sun + Earth" overlap hours, longest dark spell vs battery reserve, and minute-precision sunset/Earthset countdowns.
  - **Interactive 3D Terrain & Sky View + 360° Horizon Panorama:** Renders the real LOLA mountain skyline and 3D local topography with live DE440 Sun/Earth sightline beams, lunar eclipses, solar RF interference flags, and true Earth phase.
  - **Zero Backend, Offline-Ready PWA:** 100% static client-side Web Worker engine covering **1969–2035** (`< 100 ms` scenario evaluation).

---

## Slide 3 — Live Workflow: Recovering From a 2-Week Launch Slip
- **Visual:** Side-by-side screenshot of Scenario A (`14 Jan 2027`, **Good**, `317 h`) vs Scenario B (`28 Jan 2027`, **Poor**, `0 h`, `−317 h vs A`) + the 365-day Landing Calendar heatmap.
- **Walkthrough:**
  1. **Scenario A (Planned Date):** Artemis III Mons Mouton candidate on `14 Jan 2027 06:00 UTC` yields `317 h` (94%) of simultaneous sunlight and Earth contact.
  2. **Scenario B (+14 Day Slip):** Shifting to `28 Jan 2027` drops usable hours to `0 h`—the lander touches down in darkness and Earth sets behind a ridge.
  3. **One-Click Recovery:** Clicking **Find next good date** or opening the **365-Day Landing Calendar** reveals the 346.6-day beat cycle between Earth's 27.2-day draconic month and the Sun's 29.5-day synodic month, recovering the next `Good` window (`10 Feb 2027`).

---

## Slide 4 — Built for Real Operational Hazards
- **Headline:** From Landing Dispersion to Tip-Over Resilience
- **Key Points:**
  - **Robustness Band & 20 km Heatmap:** Evaluates `±0.3°` terrain horizon uncertainty and all LOLA grid points within a `2 km` landing ellipse (`317 h (208–327)` across 7 points), plus a 20 km spatial heatmap and live pin dragging.
  - **Mast Height & Fixed Solar Panels:** Compare `2 m`, `10 m`, and `50 m` tall lander masts and tracking vs fixed panel azimuths.
  - **Tip-Over Resilience & Approach Glare Check:** Sweeps lander tilt (`10°` across all azimuths) to report worst-case power/comms survival, and checks descent camera heading against low-Sun glare at touchdown (`T0`).
  - **Deep Space Network (DSN) Layer:** Intersects lunar surface Earth visibility with Goldstone, Madrid, and Canberra ground-station elevation masks (`10°`).

---

## Slide 5 — NASA & Partner Datasets Used
- **Headline:** Grounded in Official NASA Planetary & Ephemeris Data
- **Dataset Table:**
  - **NASA GSFC LOLA South-Pole 40 m DEM (`LDEM_80S_40MPP_ADJ`) & Global DEM (`LDEM_64`):** Ray-cast with exact lunar spherical curvature (`R = 1737.4 km`) into 33 site profiles (`0.1°` step) and 36,481 south-polar grid profiles (`2 km` spacing).
  - **NASA JPL NAIF SPICE Kernels (`de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`):** Hourly apparent (`LT+S`) Sun and Earth vectors in the `MOON_ME` frame from 1969 to 2035.
  - **NASA/GSFC PGDA Lunar Polar Illumination Maps & permanently shadowed craters (Mazarico et al.):** Used for validation cross-checks and PSR map overlays.
  - **LROC Quickmap, NASA Moon Trek & JPL Horizons:** Cited coordinates for 33 curated sites (Apollo, CLPS and ispace commercial, ISRO Chandrayaan-3, JAXA SLIM, CNSA Chang'e, Artemis candidates) and linked directly from every scenario card.

---

## Slide 6 — Rigorous Scientific Validation
- **Headline:** Verified Against JPL Horizons, NASA Eclipse Catalogs & Real Landings
- **Published Results (`/about` & `validation.json`):**
  - **JPL Horizons Agreement:** Topocentric Sun direction agrees within `0.00001°` (`1e-5°`) and Earth within `0.0001°` (`1e-4°`) across polar and non-polar sites (tolerance `0.05°`).
  - **Lunar Eclipses (2025–2026):** Detects total lunar eclipses of `2025-03-14`, `2025-09-07`, and `2026-03-03` within 3 minutes of NASA's Five Millennium Catalog.
  - **Historical Mission Replays:**
    - *Chandrayaan-3 (2023):* Predicts first sunset at `2023-09-04 06:39 UTC`, matching ISRO's actual lander/rover sleep window (2–4 Sept 2023).
    - *JAXA SLIM (2024):* Confirms the Sun entered the western sky (`268.5°–279.3°` azimuth) during the exact days SLIM revived on its west-facing panels.

---

## Slide 7 — Impact & Live Links
- **Headline:** Try Ridgeline Live Today
- **Impact:**
  - Gives mission planners, students, and the public an immediate, scientifically validated way to explore lunar landing windows, terrain shadows, and Earth communication links on desktop or mobile.
  - Every comparison is encoded in a deterministic shareable URL, with one-click CSV data export and PNG summary export.
- **Links:**
  - **Web App:** https://lunar-site-planner.vercel.app
  - **Validation & Methodology:** https://lunar-site-planner.vercel.app/about/
  - **GitHub Repository (MIT License):** https://github.com/jackalaka21/lunar-site-planner
