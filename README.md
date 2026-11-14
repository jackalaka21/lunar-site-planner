# Ridgeline

Ridgeline is a public lunar landing site and date planner. For a site and a landing date it shows where the Sun and Earth sit against the real terrain horizon, then turns that into the two things a lander needs: sunlight for power and Earth in view for direct-to-Earth (DTE) communication.

Built solo for NASA Space Apps Challenge Singapore 2026, challenge "Lunar Landing Site Navigator".

- Live app: https://lunar-site-planner.vercel.app
- Repository: https://github.com/jackalaka21/lunar-site-planner
- Demo GIF: TBD: GIF

## The problem

At the lunar south pole the Sun never rises more than a few degrees above the horizon, so terrain decides whether a site gets light and a line of sight to Earth. A two-week slip in landing date, or a site a few kilometres away, can flip a site from workable to dead. LROC Quickmap, Moon Trek and JPL Horizons are strong specialist tools, but they mostly show long-term averages or single queries. Ridgeline answers the question a mission planner asks when a schedule moves: is the new date or site better or worse than the old one, by how much, and why.

## What it does

Built and deployed:

- A sleek Moon landing experience with interactive 3D illuminated lunar globe, 3-step onboarding, and 1-click mission showcase presets.
- A catalogue of 29 sites (Apollo, recent landers, Chandrayaan-3, SLIM, Chang'e, Luna, and south-pole candidates) plus custom coordinates, with maps and a coordinate picker.
- A 2D horizon panorama and an interactive 3D terrain view of LOLA elevation patches around each site (orbit and lander POV camera modes), with the Sun and Earth drawn against terrain ridges and plain-language status readouts computed from the engine.
- A timeline of Sun, Earth and both, with a verdict (Good, Marginal, Poor) and plain-language reasons, plus countdowns to sunset and Earthset.
- Eclipse, Sun-near-Earth interference, and Deep Space Network (Goldstone, Madrid, Canberra) ground-station visibility tracks.
- A 365-day landing calendar view and "Find next good date" search.
- Mast-height selector (2 m / 10 m / 50 m), live draggable map pin, 20 km nearby-alternatives heatmap, and Permanently Shadowed Regions (PSR) overlay.
- A robustness range for terrain uncertainty and landing dispersion, tip-over resilience (10° tilt sweep), and descent approach glare checks.
- Up to four scenarios side by side, with deltas against scenario A, playback, CSV time-series export, and PNG comparison export.
- Shareable links, historical mission replays, an About page with the validation results, and an offline-capable PWA for mobile.

Candidate regions are labelled "Artemis crewed landing candidates". NASA has moved the first crewed landing to Artemis IV; Artemis III is now a 2027 low Earth orbit test. Region coordinates are representative points, because NASA publishes none; each site lists its own source link.

### Default scenario

The first view is the Artemis III Mons Mouton site (`artemis3-mons-mouton`), landing 2027-01-14 06:00 UTC: verdict Good, 317 h with both Sun and Earth, 94% lit. The plain `mons-mouton` point is never Good at default settings. The date was picked with `npx tsx scripts/pick-default-date.ts`. Press Add scenario +14 d to compare the next window; the second card shows its deltas against A.

Timing hook: `window.__lspTiming.evaluate` (ms per engine evaluate) exists in dev builds, and in production only with `?timing=1`.

## NASA data used

The event requires at least one NASA dataset; Ridgeline uses all of these. Versions and SHA-256 checksums are in [DATA_SOURCES.md](DATA_SOURCES.md), and the same table is on the About page.

| Dataset | Source | How it supports the solution |
|---|---|---|
| LOLA polar 40 m DEM (LDEM_80S_40MPP_ADJ), NASA GSFC | https://pgda.gsfc.nasa.gov/products/90 | Terrain horizons at the south pole: the horizon line each site sees, for Sun and Earth visibility, and the polar basemap. |
| LOLA global 64 ppd DEM (LDEM_64), NASA GSFC | https://imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/ | Terrain horizons away from the pole, and the global basemap. |
| NAIF SPICE kernels (JPL): de440s, moon_pa_de440_200625, moon_de440_250416.tf, naif0012, pck00011 | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ | Sun and Earth positions in the lunar frame (DE440 ephemeris and lunar orientation), hourly from 1969 to 2035. |
| JPL Horizons | https://ssd.jpl.nasa.gov/horizons/ | Independent validation of Sun and Earth azimuth and elevation, run at build time. Ridgeline does not call Horizons at runtime. |
| PGDA Lunar Polar Illumination maps, as shown in LROC Quickmap | https://pgda.gsfc.nasa.gov/products/69 | Illumination cross-check: average Sun and Earth visibility from the same LOLA data shown in Quickmap. |
| LROC and Quickmap (NASA LRO, Arizona State University) | https://quickmap.lroc.asu.edu/ | Landing-site coordinates and context. |
| Moon Trek (NASA JPL) | https://trek.nasa.gov/moon/ | Linked from each scenario card for 3D context. No Moon Trek data is bundled. |
| DSN station locations, DSN Telecommunications Link Design Handbook 810-005, module 301 | https://deepspace.jpl.nasa.gov/dsndocs/810-005/301/301K.pdf | Station coordinates for the DSN visibility data in the repository. |
| NASA Five Millennium Catalog of Lunar Eclipses | https://eclipse.gsfc.nasa.gov/LEcat5/LE2001-2100.html | Reference contact times for the eclipse validation. |

Partner-agency references: ISRO (Chandrayaan-3), JAXA (SLIM), CNSA (Chang'e), CSA (Moon exploration portal).

## How it works

1. An offline Python pipeline reads the SPICE kernels and writes hourly Sun and Earth direction vectors in the lunar body-fixed frame (MOON_ME, light time and stellar aberration corrected) for 1969 to 2035.
2. The same pipeline resamples the two LOLA DEMs into a 40 m grid near each observer and a 120 m grid beyond.
3. In the browser, a ray-cast gives the horizon elevation around each site for a 2 m observer. The engine compares the Sun and Earth directions against that horizon hour by hour.
4. Everything is a static export: no server, no runtime calls to third-party hosts, no cookies, no analytics.

Limitations (also on the About page): terrain features smaller than the grid spacing are not resolved; the horizon is sampled along the body's centre and treated as flat across the disc; power is a sunlight proxy with no thermal model; times are UTC; no slope or traverse model.

## Run it

Web (Node 20 or later):

```bash
npm ci
npm run dev        # http://localhost:3000
npm run build      # static export in out/, plus out/sw.js
npm test           # unit tests
npm run typecheck
npm run lint
npm run e2e        # Playwright
```

Data pipeline (Python 3.12). Raw and work data live outside the repo at `LSP_DATA_DIR` (default `C:/Users/User/lsp-data`); the committed outputs under `public/data/v1/` are enough to run the app.

```bash
python -m venv .venv && .venv/Scripts/activate
pip install -r pipeline/requirements.txt
cd pipeline
python -m lsp.ephemeris           # hourly Sun/Earth vectors from SPICE kernels
python -m lsp.dem build           # fine, coarse and global DEM grids from LOLA
python -m lsp.horizons sites      # Horizons reference data for validation sites
python -m lsp.horizons grid       # Horizons grid
python -m lsp.catalog             # public/data/v1/sites.json
python -m lsp.basemaps build      # hillshade basemaps
python -m lsp.dsn                 # DSN station elevations
python -m lsp.validate            # public/data/v1/validation.json
pytest tests
```

## Validation

Ridgeline publishes its checks in `public/data/v1/validation.json` and on the About page. Summary:

- JPL Horizons: our Sun direction agrees to about 1e-5 degrees and Earth to about 1e-4 degrees at the south pole, Apollo 11 and Chang'e 4 over 20 times in 2026 and 2027, against a 0.05 degree tolerance.
- Interpolation of the hourly grid: largest error 0.000122 degrees against direct SPICE calls, tolerance 0.001.
- Lunar eclipses 2025-03-14, 2025-09-07 and 2026-03-03: totality (umbra contacts U2 to U3) is within about 3 minutes of NASA's catalogue, and Moon-centre umbra entry and exit within about 5 minutes.
- Chandrayaan-3: predicted first sunset 2023-09-04 06:39 UTC, inside the 1 to 6 September window we check against ISRO's sleep dates (ISRO put the rover and lander to sleep 2 to 4 September).
- SLIM: the Sun stays in the western sky (azimuth 268.5 to 279.3 degrees) for 28 January to 1 February 2024, consistent with the lander's west-facing panels.
- PGDA illumination (NASA/GSFC, the layer shown in Quickmap), our 2025 to 2032 averages against the long-term maps: Sun at Mons Mouton 24.7% vs 26.0%, connecting ridge 42.3% vs 46.2%, Malapert 38.2% vs 42.9%, Shackleton rim 62.8% vs 65.9%. Earth in view (any part of disc): Mons Mouton 72.8% vs 72.4%, Malapert 41.5% vs 41.2%, connecting ridge 57.2% vs 57.8%.
- Shackleton rim Sun against Glaeser et al. 2018 (about 85.5% sunlit): ours 79.6%, within the 10-point tolerance.

One known discrepancy: Earth visibility at the Shackleton rim. We compute 35.9% against 51.9% in the PGDA map, which fails our 10-point tolerance. We have not resolved the cause; the rim is a narrow ridge, so the result is likely sensitive to the exact point within the 120 m pixel. Treat Earth visibility on narrow rims with caution.

Also reported: a literal comparison of totality at a single surface point differs from NASA's U2/U3 by 30 to 42 minutes, because a surface point sees the Earth cover the Sun for longer than the Moon as a whole does. We show that result for information and report the Moon-centre match above.

Lighthouse 13, 14 Nov 2026, on the static export served locally (`node scripts/serve-out.mjs`) and on the production URL (desktop 86, mobile 51):

| Run | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Desktop preset | 83 to 86 | 98 | 96 to 100 | 100 |
| Mobile (simulated slow 4G, 4x CPU) | 48 to 51 | 98 | 96 to 100 | 100 |

Installable PWA: manifest, icons (including maskable), service worker with offline shell. First-view JavaScript is 298 KB gzipped against the 250 KB target; React and Next account for about 130 KB of it and Astryx for most of the rest. Mobile performance is the weak spot: under Lighthouse's 4x CPU throttle, hydrating the shell takes about 1.6 s of scripting and the first card waits for it.

## Judging criteria map

| Criterion | How Ridgeline answers it |
|---|---|
| Impact | The schedule-slip workflow: compare a new date or nearby site against the old one in seconds, with deltas and a reason. Useful to planners and to anyone learning why the pole is hard. |
| Creativity | Horizon-first design with true-size Sun and Earth, eclipse and solar-interference flags, and side-by-side scenarios with playback. |
| Validity | NASA/JPL ephemeris and LOLA terrain, validation against Horizons, NASA eclipse contacts and PGDA maps, historical replays, and a stated discrepancy. |
| Relevance | Addresses the Lunar Landing Site Navigator brief: sites, dates, sunlight and Earth visibility at the south pole, using the resources it lists (Quickmap, Moon Trek, Horizons, CSA). |
| Presentation | One default scenario that opens ready, a verdict with reasons, shareable links, and a mobile-friendly layout. |

## Credits

- NASA GSFC LOLA team, NASA JPL NAIF and Horizons, NASA PGDA, and LROC (NASA LRO, Arizona State University). See [DATA_SOURCES.md](DATA_SOURCES.md).
- unslop by Damir Sokolovsky (@heydamir), CC BY 4.0
- Astryx by Meta
- ISRO, JAXA, CNSA and CSA for the mission and site references on the About page.

## AI-use disclosure

Built with AI assistance: Anthropic Claude wrote most of the engine, data pipeline, validation and app, and Google Gemini wrote the landing page, the 3D terrain view and several further features (PSR overlay, tip-over, glare check, CSV and PNG export). Jack directed and reviewed the work. Correctness is checked by automated tests (TypeScript and Python) and by the published validation against NASA and JPL data above, not by trusting the models.

## Licence

MIT. See [LICENSE](LICENSE).
