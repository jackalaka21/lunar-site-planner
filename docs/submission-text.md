# Space Apps Submission Form Text — Ridgeline

Use the four sections below to paste directly into the NASA Space Apps Challenge submission form for **Lunar Landing Site Navigator** (Singapore 2026).

---

## 1. Project Summary
*Briefly describe what your project does, the problem it solves, and its impact.*

**Ridgeline** (https://lunar-site-planner.vercel.app) is an interactive, browser-based lunar landing site and mission-date planner built for the **Lunar Landing Site Navigator** challenge. At the lunar south pole, the Sun skims only ~1.5° above the horizon and shadows are pitch-black, meaning local mountain ridges and crater rims dictate whether a lander has **sunlight for solar power** and **Earth in view for Direct-to-Earth (DTE) communication**. A two-week launch slip—or landing a few hundred metres off target—can flip a mission from viable to dead, as seen in recent lunar missions like IM-2 *Athena*, *Chandrayaan-3*, and JAXA's *SLIM*.

Existing planetary GIS tools show static long-term averages or single-point ephemeris tables. **Ridgeline** answers the operational question mission planners face when schedules move: *"Is the new landing date or backup site better or worse than the old one, by how much, and why?"* Users can compare up to four site-and-date scenarios side by side, inspect real 3D NASA LOLA lunar topography and 360° terrain horizons, scrub through a 14-day mission timeline with live Sun/Earth sightlines, search a 365-day landing calendar for the next viable window, and evaluate landing-ellipse robustness, lander tip-over resilience, descent glare, and Deep Space Network (DSN) ground-station coverage.

---

## 2. Project Demo
*Link to your 30-second video demo or 7-slide presentation.*

- **Demo Video Script:** See [`docs/demo-script.md`](demo-script.md)
- **7-Slide Presentation Outline:** See [`docs/demo-slides.md`](demo-slides.md)
- **Interactive Live Demo Scenarios:**
  - **Default Scenario (Mons Mouton, 14 Jan 2027 — Good, 317 h):** https://lunar-site-planner.vercel.app
  - **2-Week Launch Slip Comparison (14 Jan vs 28 Jan 2027):** `https://lunar-site-planner.vercel.app/?v=1&sc=artemis3-mons-mouton@2027-01-14T06:00Z;artemis3-mons-mouton@2027-01-28T06:00Z`
  - **Historical Replay — ISRO Chandrayaan-3 Touchdown:** `https://lunar-site-planner.vercel.app/?v=1&sc=chandrayaan-3@2023-08-23T00:00Z`
  - **Historical Replay — JAXA SLIM Touchdown:** `https://lunar-site-planner.vercel.app/?v=1&sc=slim@2024-01-19T15:20Z`
  - **Historical Replay — Intuitive Machines IM-2 Athena Touchdown:** `https://lunar-site-planner.vercel.app/?v=1&sc=im-2@2025-03-06T17:30Z`

---

## 3. Final Project Link
*Public URL to the deployed application and source code repository.*

- **Live Web Application (PWA):** https://lunar-site-planner.vercel.app
- **Scientific Validation & Methodology Page:** https://lunar-site-planner.vercel.app/about/
- **Public GitHub Repository (MIT License):** https://github.com/jackalaka21/lunar-site-planner

---

## 4. Project Details
*Describe your approach, tools, technologies, scientific validation, and the NASA datasets used.*

### Approach & Physics Engine
1. **Offline Python Data Pipeline (`pipeline/lsp/`):**
   - Processes NASA JPL NAIF SPICE kernels (`de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`, `pck00011.tpc`) to generate hourly apparent (`LT+S`) Sun and Earth vectors in the lunar body-fixed `MOON_ME` frame from **1969 to 2035**, plus hourly Moon elevations at the three NASA Deep Space Network complexes (Goldstone, Madrid, Canberra).
   - Ray-casts NASA GSFC LOLA Digital Elevation Models (`LDEM_80S_40MPP_ADJ` at 40 m/px for the south pole; `LDEM_64` globally) with exact lunar spherical curvature ($R = 1737.4\text{ km}$) using Numba-accelerated great-circle integration. Produces `0.1°`-resolution horizon profiles at `2 m`, `10 m`, and `50 m` mast heights for 29 curated sites, plus a `2 km`-spaced south-polar stereographic grid (`36,481` nodes within 190 km of the pole).
2. **Client-Side Web Worker Physics Engine (`lib/engine/` & `workers/`):**
   - Evaluates 1–30 day mission windows at 10-minute intervals (`< 80 ms` cold, `< 20 ms` warm) with zero server calls.
   - Models finite angular discs (Sun ~0.27°, Earth ~0.95°), **topocentric lunar eclipses** (Earth occluding the Sun), **solar RF interference** (Sun within 2° of Earth), **descent telemetry checks** (`[T0 - 1 h, T0]`), **flicker merging**, **horizon uncertainty & landing-ellipse dispersion**, **tip-over resilience** (`10°` tilt sweep), and **approach camera glare checks**.
3. **UI & Visual Architecture:**
   - Built with **Next.js 16** (static export), **TypeScript**, **React 19**, **Astryx Design System**, **Three.js** (3D interactive lunar terrain & sightlines), **Zustand** (URL-synced state), and **Workbox** (offline-capable PWA).
   - Independently validated against **JPL Horizons** (`< 0.0001°` angular error), **NASA's Five Millennium Catalog of Lunar Eclipses** (`~3 min` totality agreement), **NASA PGDA Lunar Polar Illumination maps**, and historical mission timelines (*Chandrayaan-3*, *SLIM*, *IM-2*).

### NASA & Partner Datasets Used
- **LOLA South-Pole 40 m DEM (`LDEM_80S_40MPP_ADJ`, NASA GSFC PGDA):** https://pgda.gsfc.nasa.gov/products/90 — Computes south-polar terrain horizon profiles, 3D surface meshes, and polar hillshade basemaps.
- **LOLA Global 64 ppd DEM (`LDEM_64`, NASA GSFC / PDS):** https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/ — Computes non-polar site horizons (Apollo, SLIM, Chang'e, Blue Ghost) and the global lunar basemap.
- **NAIF SPICE Kernels (`de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`, `naif0012.tls`, `pck00011.tpc`, NASA JPL):** https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ — Provides Sun and Earth ephemeris vectors in the `MOON_ME` frame and DSN station geometry from 1969 to 2035.
- **JPL Horizons On-Line Ephemeris System (NASA JPL):** https://ssd.jpl.nasa.gov/horizons/ — Independent reference used at build time to validate topocentric Sun and Earth azimuth/elevation angles.
- **PGDA Lunar Polar Illumination Maps (Mazarico et al., NASA GSFC):** https://pgda.gsfc.nasa.gov/products/69 — Cross-checks multi-year average Sun and Earth visibility at polar sites and is the source of the permanently shadowed region (PSR) overlay, polygonised from its zero-average-illumination pixels.
- **LROC & Quickmap (NASA LRO / ASU):** https://quickmap.lroc.asu.edu/ — Provides measured coordinates for landed missions and Artemis candidate regions, and is linked from every scenario card.
- **NASA Moon Trek (NASA JPL / SSERVI):** https://trek.nasa.gov/moon/ — Linked from every scenario card for external GIS cross-reference.
- **NASA Deep Space Network Handbook (810-005, Module 301):** https://deepspace.jpl.nasa.gov/dsndocs/810-005/301/301K.pdf — Reference station coordinates for Goldstone, Madrid, and Canberra coverage.
- **NASA Five Millennium Catalog of Lunar Eclipses (GSFC):** https://eclipse.gsfc.nasa.gov/LEcat5/LE2001-2100.html — Reference contact times for eclipse validation.
- **Partner Agency Mission Sources:** ISRO (*Chandrayaan-3*), JAXA (*SLIM*), CNSA (*Chang'e 3/4/5/6*), and CSA (Canadian Space Agency Moon exploration portal).

### AI-Use Disclosure
Anthropic's Claude and Google DeepMind's Antigravity assisted in writing code, generating tests, and drafting documentation, directed and reviewed by the solo developer (Jack). All astronomical and terrain calculations are verified by deterministic automated test suites (Vitest and pytest) and cross-checked against independent NASA/JPL reference datasets published on the `/about` page.
