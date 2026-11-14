# Ridgeline (Lunar Site Planner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution method chosen by Jack:** subagent-driven development with **Sonnet subagents** (Agent tool, `model: "sonnet"`). The main session dispatches one task per subagent, reviews each result before the next task that depends on it, owns all GATE steps, merges, and final verification.

**Goal:** A public, mobile-first, static web app that compares lunar landing site/date scenarios by showing Sun and Earth positions against real LOLA terrain horizons, and turns that into power, communication and verdict metrics.

**Architecture:** An offline Python pipeline (SPICE + LOLA) precomputes compact binary data (hourly Sun/Earth vectors, horizon profiles, basemaps) into `public/data/v1/`. A pure TypeScript engine (mirrored by a Python reference implementation that produces test fixtures) computes everything in the browser, mostly in a Web Worker. A Next.js static export renders small-multiple scenario cards, and full app state lives in the URL. Deployment is Vercel via Git integration from the public repo `jackalaka21/lunar-site-planner`.

**Tech Stack:**
- Next.js (current stable, App Router, `output: 'export'`), React, TypeScript strict
- **Astryx** design system 0.7.15 (`@astryxdesign/core`, a custom Ridgeline theme extended from `theme-neutral`, `@stylexjs/stylex`, `@astryxdesign/cli`), Tailwind CSS via the Astryx token bridge, D3 (scale/shape/geo/array), Zustand, Comlink, Lucide icons, IBM Plex fonts (@fontsource), Workbox CLI (service worker)
- Vitest + Testing Library + jsdom, Playwright, tsx
- Python 3.12: spiceypy, numpy, numba, rasterio, pyproj, pillow, requests, pytest

**Spec:** `docs/superpowers/specs/2026-11-08-lunar-site-planner-design.md`. Read it before any task. Section references (§) below point there.

## Global Constraints

- Event window **Sat 14 Nov 2026 09:00 SGT → Sun 15 Nov 2026 23:59 SGT** (NASA Space Apps Challenge Singapore, virtual). The hard deadline is submission on the official Space Apps site. **Internal target: submission complete by 15 Nov 21:00 SGT** (3 h buffer).
- Challenge: **"Lunar Landing Site Navigator"** (https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/). Its Resources tab lists **Quickmap, Moon Trek, JPL Horizons** (NASA) and the **CSA Moon Exploration** portal. All four must be visibly used or credited (see Tasks 9, 17, 22, 33).
- **Event rule: at least one NASA dataset is mandatory.** The submission, README and About page must each name every NASA dataset used, link its source, and explain how it supports the solution.
- Tier 1 (M1–M16) must be complete, deployed and demo-recorded before any Tier 2 work. Tier 3 only if Tier 2 S1/S2/S10/S8 are done.
- Node ≥ 20 LTS. Python 3.12 venv at `C:/Users/User/.venvs/lunar_site_planner`. On this machine pip/curl SSL fails in the Bash tool: run pip and downloads in **PowerShell**, and use `curl --ssl-no-revoke`.
- TypeScript `strict: true`. No `any` in `lib/engine`. `lib/engine` must not import React, DOM, `fetch`, or anything from `lib/data` / `lib/state`.
- Static export only: no API routes, no server actions, no runtime calls to third-party hosts. All data comes from `/data/v1/...` on our own origin.
- **npm dependencies are installed only in Task 1.** Later tasks must not add dependencies, except Task 31 (three.js family) and Task 32 (`html-to-image`). This prevents parallel `package.json` conflicts.
- Internal time = UTC milliseconds since the Unix epoch (`number`). The ephemeris grid is hourly UTC starting 1969-01-01T00:00:00Z. Supported range: **1969-01-01T00:00Z to 2035-12-31T23:00Z** (narrowed only if kernel coverage requires it; Task 2 records the final range in `index.json`).
- Angles in **degrees** at every public API boundary. Azimuth is clockwise from local north in [0, 360). At |lat| = 90° the local frame is the limit along λ = 0: at the south pole north = +x̂ (toward 0°E) and east = +ŷ (toward 90°E).
- Constants: R_moon = 1737.4 km, R_sun = 696,000 km, R_earth = 6,371 km, default observer height 2.0 m.
- **Settings defaults** (spec §7.5, §17), exact:

  | Setting | Default | Range |
  |---|---|---|
  | litThreshold | `'half'` (≥ 50% of disc) | `'any'` \| `'half'` \| `'full'` |
  | earthMarginDeg | 0 | 0–5 |
  | durationDays | 14 | 1–30 |
  | batteryH | 24 | 0–200 |
  | flickerMergeMin | 30 | 0–120 |
  | interferenceDeg | 2 | 0–10 |
  | dsnEnabled | false | — |
  | dsnMaskDeg | 10 | — |
  | horizonUncertDeg | 0.3 | — |
  | ellipseKm | 2 | — |
  | mastM | 2 | 2 \| 10 \| 50 |
  | panel | tracking | — |
  | axis | `'met'` | — |
  | displayTz | `'UTC'` | — |

- **Verdict** (§7.6): Poor if landing check fails OR Earth never in view OR bothPct < 20 OR longestDarkH > 2×batteryH. Good if bothPct ≥ 50 AND longestDarkH ≤ batteryH. Otherwise Marginal. Always paired with a reason string.
- Binary files are little-endian. All data lives under `public/data/v1/` (the version segment lets us invalidate caches).
- **Design system: Astryx** (spec §6.2) with the custom Ridgeline theme. UI code uses Astryx components for every pattern they cover and imports each from the path `astryx component <Name>` prints. **Before using any Astryx component, run `npx astryx component <Name> --dense` and use only documented props.** Raw elements are allowed only inside the canvas/SVG visualisations (panorama, timeline, map, calendar).
- **Astryx workflow (from the AGENTS.md written by `astryx init`):**
  - Start pages from a template: `npx astryx build "<idea>"`, then `npx astryx template <name> <path>`. Keep the template's frame, gap and padding, and replace the content.
  - No raw `<div>`/`<span>` outside the canvas/SVG visualisation modules; layout uses Astryx components.
  - `npx astryx doctor --built out` must pass before any deploy to `main`.
  - The project's own `lunar-site-planner/AGENTS.md` (generated in Task 1 after Tailwind is installed) overrides the parent `Coding Projects/AGENTS.md`, whose "no Tailwind compiler here" line describes the parent folder only.
- **No hex colours or pixel spacing literals in app code** (`app/`, `components/`). Colours come from Astryx semantic tokens (`var(--color-*)`, the Tailwind bridge classes, or `useTheme()` / `resolveThemeTokens()` in canvas code). Spacing comes from Astryx spacing tokens on the 4 px grid. The only place hex values live is `theme/ridgeline.theme.ts`.
- **Unslop rules** (spec §6.1), enforced in every UI task:
  - Colour: graphite ramp; hues only for Sun (amber) and Earth (blue); **Both = primary ink**; verdict green/red toned plus a grey Marginal dot; no other chrome accent.
  - Never: gradients, glows, coloured shadows, blobs, emoji, sparkles, uppercase tracked labels, decorative badges, exclamation marks, hype words, looping animation (except playback).
  - Type: IBM Plex Sans + Mono; weights 400/500 (600 rare); sentence case; tabular numerals; no italic.
  - Signature: all times are shown as the mission clock `T+3 d 04 h` in mono, unless the user picks calendar time.
  - One easing curve `cubic-bezier(0.22, 1, 0.36, 1)`; transition only colour, opacity and transform.
- WCAG AA text, 3:1 non-text, touch targets ≥ 44 px.
- Performance budgets (§11.3): first view ≤ 2.5 s on fast 4G, ≤ 250 KB gzipped JS, first-view data ≤ 1.5 MB, recompute ≤ 150 ms, calendar ≤ 1.5 s.
- **Git:**
  - Repo-local identity `Jack` / `loweejinjack23@gmail.com`.
  - Push with `GH_TOKEN="$(gh auth token --user jackalaka21)"`. **Never use the work account `Intern01Biobot`. Never force-push `main`.**
  - Commit trailer: the attribution line given by the session's system reminder at execution time.
  - During 14–15 Nov, the repo, pushes, Vercel project and deploys are pre-approved.
- **Copy rules:**
  - Every technical term in the UI has a tooltip (Astryx `InfoTip`/`Tooltip`) from `lib/glossary.ts`.
  - Units are always shown (h, d, °, km, m).
  - No decorative space imagery.
  - Labels and buttons have no trailing period and no exclamation marks.
  - Short labels (`Search`, not `Search sites…`).
  - Comparisons name their reference (`−96 h vs A`).
- **Credits:** README and the About page credit *unslop by Damir Sokolovsky (@heydamir), CC BY 4.0* and *Astryx by Meta*.
- **Data honesty:** no site coordinate without `source_url`. Every dataset is listed in `DATA_SOURCES.md` with version, URL, credit and SHA-256.

## Review Focus

Five failure modes the spec implies that are most likely to bite users. Each has a pinned test in the task named.

1. **Missions crossing a year boundary or the ephemeris edge.** A landing on 2027-12-25 with a 14-day mission must interpolate seamlessly into 2028. Dates past the coverage end must be disabled with a message, never NaN. Tests in Task 11 (`interpolates across year boundary`) and Task 12 (`clips mission at coverage end`).
2. **Azimuth wrap at 0°/360°.** Horizon interpolation between 359.5° and 0°, Sun paths crossing north on the panorama, and robustness shifts must show no seams or jumps. Tests in Task 10 (`horizonAt wraps`) and Task 16 (`splits path at wrap`).
3. **Exact pole and longitude aliases.** Lat −90 with any longitude, lon 180 vs −180, and 0–360 input must give identical finite results. Tests in Task 10 (`pole frame is lon-independent`) and Task 14 (`normalises longitude`).
4. **Events that never happen.** A far-side site (Chang'e-4) never sees Earth. A ridge may stay lit for 60+ days. Results must be "Earth never in view (relay needed)" / "> 60 d" with Poor or valid metrics, never a hang or NaN. Tests in Task 12 (`far side never sees Earth`, `no event within 60 days returns null`).
5. **Hand-edited or stale share URLs.** Unknown site ids, bad dates, more than 4 scenarios, out-of-range settings, or a missing `v` must fall back to defaults with a notice, never a blank screen. Tests in Task 14 (`decodeState tolerates garbage`) and Task 19 (e2e `bad link shows notice`).

---

## File Structure

```
lunar-site-planner/
  app/
    layout.tsx                 # fonts, theme class, metadata, OG tags
    page.tsx                   # main screen (client component shell)
    about/page.tsx             # method, sources, validation, replays, disclosures
    globals.css                # tokens (CSS variables) for dark/light
  components/
    shell/TopBar.tsx  shell/LeftPanel.tsx  shell/StatStrip.tsx  shell/Notice.tsx
    card/ScenarioCard.tsx  card/MetricsBar.tsx  card/VerdictChip.tsx  card/Provenance.tsx  card/SecondaryMetrics.tsx
    panorama/HorizonPanorama.tsx  panorama/layout.ts        # pure layout math, unit-tested
    timeline/Timeline.tsx  timeline/bands.ts                 # pure band/run math, unit-tested
    time/TimeBar.tsx  time/usePlayback.ts
    picker/SitePicker.tsx  picker/CoordInput.tsx  picker/MapPicker.tsx  picker/projection.ts
    calendar/LandingCalendar.tsx                              # S1/S10
    settings/SettingsPanel.tsx
    ui/Term.tsx  ui/MissionClock.tsx  ui/SwipeDeck.tsx   # thin wrappers over Astryx (InfoTip, Text/mono, Carousel or BottomSheet)
  theme/
    ridgeline.theme.ts          # defineTheme({ extends: neutralTheme, ... }): the ONLY file with hex values
    (generated by `astryx theme build`: ridgeline theme CSS/JS + astryx-themes module)
  app/providers.tsx             # <Theme theme={ridgeline}> + <LinkProvider component={Link}>
  lib/
    engine/                     # pure, deterministic
      types.ts  vec.ts  frame.ts  topo.ts  disc.ts  horizon.ts  sample.ts  events.ts  metrics.ts
      scan.ts  robustness.ts  constants.ts  index.ts
    data/
      ephemeris.ts  horizons.ts  ps.ts  sites.ts  dsn.ts  fetchers.ts  nodeFetchers.ts (tests only)
    state/
      store.ts  url.ts  defaults.ts
    glossary.ts  format.ts
  workers/engine.worker.ts      # Comlink-exposed API
  public/
    data/v1/ephemeris/{index.json,YYYY.bin}  data/v1/dsn/YYYY.bin
    data/v1/horizons/grid/{index.json,i_j.bin}  data/v1/horizons/sites/{id}.bin
    data/v1/sites.json  data/v1/basemaps/*.webp  data/v1/overlays/psr.json  data/v1/validation.json
    manifest.webmanifest  icons/*  og.png
  pipeline/
    pyproject.toml  requirements.txt  requirements-ci.txt  README.md
    lsp/__init__.py  lsp/constants.py  lsp/geometry.py  lsp/ps.py  lsp/ephemeris.py  lsp/dsn.py
    lsp/dem.py  lsp/raycast.py  lsp/horizons.py  lsp/catalog.py  lsp/basemaps.py  lsp/psr.py
    lsp/reference.py  lsp/fixtures.py  lsp/validate.py  lsp/io.py
    catalog/sites_source.json   # hand-curated, every entry with source_url
    tests/ (pytest)
    data/raw/  data/work/       # gitignored
  scripts/pick-default-date.ts  scripts/copy-fixtures.mjs
  tests/unit/**  tests/e2e/**  tests/fixtures/** (copied from pipeline/fixtures)
  .github/workflows/ci.yml  vercel.json  workbox-config.cjs  next.config.ts  tsconfig.json
  vitest.config.ts  playwright.config.ts  LICENSE (MIT)  README.md  DATA_SOURCES.md
```

## Data Formats (locked; pipeline writes, `lib/data` reads)

| File | Layout |
|---|---|
| `ephemeris/index.json` | `{ "frame":"MOON_ME", "abcorr":"LT+S", "stepHours":1, "epochUtc":"1969-01-01T00:00:00Z", "firstYear":1969, "lastYear":2035, "coverageEndUtc":"…", "kernels":[{"name","sha256"}] }` |
| `ephemeris/YYYY.bin` | Float32 LE. One record per UTC hour from YYYY-01-01T00:00Z to YYYY-12-31T23:00Z, 6 floats per record `[sx,sy,sz,ex,ey,ez]` in km, Moon-centred `MOON_ME`, apparent (`LT+S`). |
| `dsn/YYYY.bin` | Int8. Per hour, 3 values `[goldstone, madrid, canberra]` = Moon elevation in whole degrees (clamped to [−90, 90]). |
| `horizons/grid/index.json` | `{ "projection":"ps-south-sphere", "R":1737400, "spacingM":2000, "halfCount":95, "tilePoints":20, "nAz":720, "stepDeg":0.5, "tiles":["i_j",…], "demFine":"…", "demCoarse":"…" }` |
| `horizons/grid/i_j.bin` | Int16 LE. 400 slots (20 × 20, row-major by y then x). Each slot holds 721 values: `[hDemM, h0…h719]`, horizon in centi-degrees. Empty slot = all values −32768. Point indices: ix, iy ∈ [−95, 95]; x = ix·2000 m, y = iy·2000 m; tile i = ⌊(ix+95)/20⌋, j = ⌊(iy+95)/20⌋; slot = (iy+95−20j)·20 + (ix+95−20i). |
| `horizons/sites/{id}.bin` | Int16 LE. 3 profiles × 3600 values (0.1° steps), centi-degrees, in mast order 2 m, 10 m, 50 m. |
| `sites.json` | `{ "checkedUtc":"…", "sites":[{ "id","name","group","lat","lon","hDemM","source_url","notes","actual_landing_utc"?, "outcome"?, "horizon":"site" }] }`. Groups: `apollo`, `clps`, `international`, `artemis3`, `polar`. |
| `validation.json` | `{ "generatedUtc", "horizons":[…], "interp":{…}, "illumination":[…], "eclipses":[…], "replays":[…] }` (each entry carries `pass: boolean`). |

**Polar stereographic (both languages, exact):**
- ρ = 2R·tan(π/4 + φ/2) with φ in radians (south hemisphere; ρ = 0 at the pole); x = ρ·sin λ, y = ρ·cos λ.
- Inverse: φ = 2·atan(ρ/(2R)) − π/2, λ = atan2(x, y).

**Great-circle step from the observer** (pipeline raycast): use the standard destination formula. At the exact south pole, the ray at azimuth θ follows meridian λ = θ (lat = −90° + δ).

---

## Execution Waves (for the main session)

| Wave | When | Tasks (parallel within a wave unless noted) |
|---|---|---|
| 0 | 14 Nov 09:00 SGT | Task 0 (main session) |
| 1 | 14 Nov 09:30–11:00 | Task 1 (alone, everything depends on it) |
| 2 | 14 Nov 11:00–15:00 | Task 2 → Task 4 (sequential) ‖ Task 5 → Task 6 (sequential, long-running) ‖ Task 7 (research) ‖ Task 14 ‖ Task 15 |
| 3 | 14 Nov 15:00–19:00 | Task 10 → Task 11 → Task 12 → Task 13 ‖ Task 3 ‖ Task 8 |
| 4 | 14 Nov 19:00–24:00 | Task 16 ‖ Task 17 ‖ Task 18 (each depends on 12–15). **20:00 SGT: optional organiser Zoom Q&A.** Jack can show the preview URL to the design mentor and the main session folds the feedback in. **Also tonight: Task 33 Step 0 (submission draft started on the Space Apps site).** |
| 5 | 15 Nov 08:00–13:00 | Task 19 → Task 20 → Task 21 → Task 22 ‖ Task 9. **Tier 1 complete by ~13:00 → CHECKPOINT: record the ≤ 30 s demo, tag `submission-candidate`.** |
| 6 | 15 Nov 13:00–18:00 | Task 23 → Task 24 → Task 25 → Task 26 → Task 27 → Task 28 (Tier 2, in order). **17:00 SGT: optional Zoom Q&A** (submission questions). |
| 7 | If time, before 19:00 | Tasks 29–32 (Tier 3) |
| 8 | 15 Nov 19:00–21:00 SGT | Task 33 (always). **Feature freeze at 19:00. Submit by 21:00.** |

Cross-task data dependencies inside wave 2:
- Task 7 Step 1 (research) runs immediately. Task 7 Step 3 needs Task 5's DEM composites (for `hDemM`).
- Task 6 Step 6 needs Task 7's `sites_source.json`. Task 6 Steps 1–5 and 7 do not.
- Task 2 Step 7 needs Task 4's reference engine.

Tasks that touch the same files never run in parallel: `pipeline/*` is separate from the app, `lib/engine` belongs to Tasks 10–13 only, and `components/card/*` belongs to Task 17 only.

---

## Phase 0 — Gates

### Task 0: Pre-flight and gates (main session, not a subagent)

- [ ] **Step 1: Confirm with Jack** whether the event rules allow pre-building and whether they require AI-use disclosure. Record both answers at the top of `README.md` notes in Task 1.
- [ ] **Step 2: Check tools.** Run in PowerShell: `node -v` (expect ≥ v20), `py -3.12 --version`, `git --version`, `gh auth status`. The `jackalaka21` account must be listed. Check free disk space with `Get-PSDrive C` (expect ≥ 15 GB free).
- [ ] **Step 3: Downloads: PRE-APPROVED by Jack on 2026-11-14 for the files in the manifest below.** Task 2/5/9/28 GATE steps pass automatically for these exact files. Still print each file's name, source and actual size as it starts. Stop and ask only for files not in the manifest, or a file more than 25% larger than listed.

  **Download manifest** (checked 2026-11-14; ≈ 1.3–1.7 GB in total). Pre-approval covers exactly these files. Anything else, or a file more than 25% larger than listed, goes back to Jack.

  | # | File | Source | Size | Used by |
  |---|---|---|---|---|
  | 1 | `naif0012.tls` | naif.jpl.nasa.gov/pub/naif/generic_kernels/lsk/ | 5 KB | Task 2 |
  | 2 | `de440s.bsp` | …/generic_kernels/spk/planets/ | 31 MB | Task 2 |
  | 3 | `moon_pa_de440_200625.bpc` | …/generic_kernels/pck/ | 12 MB | Task 2 |
  | 4 | `moon_de440_250416.tf` | …/generic_kernels/fk/satellites/ | 19 KB | Task 2 |
  | 5 | `pck00011.tpc` | …/generic_kernels/pck/ | 128 KB | Tasks 2, 3 |
  | 6 | `LDEM_80S_40MPP_ADJ.TIF` (LOLA south pole DEM, 40 m) | pgda.gsfc.nasa.gov/products/90 | 685 MB | Task 5 |
  | 7 | `LDEM_64.IMG` + `LDEM_64.LBL` (LOLA global DEM, 64 px/deg) | imbrium.mit.edu/DATA/LOLA_GDR/CYLINDRICAL/IMG/ | 531 MB | Task 5 |
  | 8 | `AVGVISIB_75S_120M_201608.TIF` (average Sun visibility) | pgda.gsfc.nasa.gov/data/MoonIllumination/ | size listed at download (expected < 250 MB) | Task 9 |
  | 9 | `AVGVISIB_75S_120M_201608_EARTH.TIF` (average Earth visibility) | same | size listed at download (expected < 250 MB) | Task 9 |
  | 10 | A published south-pole PSR dataset (Tier 2 only) | PGDA or LROC, chosen in Task 28 | expected < 50 MB | Task 28 |

  - Rows 8–9 use the 75°S product because Mons Mouton (~84.8°S) lies outside the 85°S file.
  - Not downloaded: the 20 m DEM (2.6 GB), whose finer detail is lost when resampled to our 40 m grid anyway.
  - All files go into `pipeline/data/raw/` (gitignored), with SHA-256 recorded in `DATA_SOURCES.md`.
- [ ] **Step 4:** Initialise git in `Coding Projects/lunar-site-planner` (the folder already contains `docs/`). Set the repo-local identity `Jack` / `loweejinjack23@gmail.com`.

---

## Phase A — Scaffold

### Task 1: Repo scaffold, CI, GitHub and Vercel

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Create: `vitest.config.ts`, `playwright.config.ts`, `.eslintrc.*` (Next default), `.prettierrc`, `.gitignore`
- Create: `LICENSE` (MIT, "Jack"), `README.md` (stub), `DATA_SOURCES.md` (stub), `workbox-config.cjs`, `vercel.json`
- Create: `.github/workflows/ci.yml`, `pipeline/requirements.txt`, `pipeline/requirements-ci.txt`, `pipeline/pyproject.toml`, `pipeline/lsp/__init__.py`
- Test: `tests/unit/smoke.test.ts`, `pipeline/tests/test_smoke.py`, `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Produces npm scripts (all later tasks use these exact names): `dev`, `build` (= `next build && workbox generateSW workbox-config.cjs`), `typecheck` (`tsc --noEmit`), `lint`, `test` (`vitest run`), `e2e` (`playwright test`), `fixtures` (`node scripts/copy-fixtures.mjs`).

- [ ] **Step 1: Scaffold** Next.js + TypeScript in the existing folder (keep `docs/`). Set `output: 'export'`, `images.unoptimized: true`, `trailingSlash: true` in `next.config.ts`.
- [ ] **Step 2: Install all dependencies now** (Global Constraints forbid later installs):
  - Runtime: `next react react-dom zustand comlink d3-scale d3-shape d3-geo d3-array lucide-react @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono @astryxdesign/core@0.7.15 @astryxdesign/theme-neutral@0.7.15 @stylexjs/stylex@^0.19` (React must resolve to ≥ 19)
  - Dev (Astryx): `@astryxdesign/cli@0.7.15`
  - Note: Jack's parent folder `Coding Projects/` also has an Astryx install in `node_modules` and an `astryx-themes.js`. The project must install its own copy so resolution never climbs to the parent folder. Verify with `npm ls @astryxdesign/core`, which should show one copy under `lunar-site-planner/node_modules`.
  - Dev: `typescript @types/react @types/node @types/d3-scale @types/d3-shape @types/d3-geo @types/d3-array tailwindcss @tailwindcss/postcss postcss vitest jsdom @testing-library/react @testing-library/jest-dom @playwright/test tsx prettier eslint eslint-config-next workbox-cli`
- [ ] **Step 3: Write the smoke tests.**
  - `smoke.test.ts`: `expect(1 + 1).toBe(2)`.
  - `test_smoke.py`: `import lsp`.
  - `smoke.spec.ts`: page `/` has a heading containing "Ridgeline".
- [ ] **Step 3b: Shared settings type** (created here so Tasks 14 and 15 can run in parallel with the engine). Create `lib/engine/settings.ts` exporting `interface Settings` (exact shape in Task 12's Interfaces block) and `DEFAULT_SETTINGS` with the exact Global Constraints values, plus `SETTINGS_RANGES` (min/max for numeric fields). Add the test `tests/unit/engine/settings.test.ts`: `DEFAULT_SETTINGS` deep-equals the table values, and every default lies within `SETTINGS_RANGES`.
- [ ] **Step 3c: Astryx setup.**
  1. Run `npx astryx init`. It writes the Astryx component index into the project's `CLAUDE.md`/`AGENTS.md`, so every subagent discovers components instead of guessing. Commit those files.
  2. Create `theme/ridgeline.theme.ts` with `defineTheme({ extends: neutralTheme, ... })`, following `npx astryx docs author-a-theme definetheme` and `creating-a-custom-theme`:
     - **Fonts:** body and heading = IBM Plex Sans, code = IBM Plex Mono, both self-hosted via @fontsource.
     - **Colour:** the graphite ramp, text roles and hairline from spec §10.3, for light and dark. Read `astryx docs author-a-theme palette` to choose between seed-generated and explicit tokens; explicit tokens must match §10.3 values.
     - **Data-visualisation tokens:** `--color-data-categorical-orange` = Sun amber, `--color-data-categorical-blue` = Earth blue, `--color-data-neutral` = muted text.
     - **Status:** success/error toned to #4cc38a/#e5484d (dark) and #16a34a/#dc2626 (light).
     - **Radius:** per §10.3.
     - **Motion:** `character: 'crisp'`, with ease tokens set to `cubic-bezier(0.22, 1, 0.36, 1)`.
  3. Run `npx astryx theme build`, and add it as the `prebuild` npm script.
  4. Create `app/providers.tsx` with `<Theme theme={ridgeline}>` and `<LinkProvider component={Link}>`, plus a dark/light switch per `npx astryx docs use-a-theme`.
- [ ] **Step 4: Minimal page.** `app/page.tsx` renders the Astryx `Heading` "Ridgeline". `globals.css` uses the exact Astryx + Tailwind layer order from the `@astryxdesign/core` README ("Next.js + Tailwind"):
  ```css
  @layer reset, theme, base, astryx-base, astryx-theme, components, utilities;
  ```
  followed by the tailwind theme/preflight, Astryx reset, `astryx.css`, the **built Ridgeline theme CSS** (instead of neutral's), `tailwind-theme.css`, and the tailwind utilities. `body` sets `font-family: var(--font-family-body)` and the page background token. Add the e2e assertion: `body` computed font-family starts with "IBM Plex Sans".
- [ ] **Step 5: Config files.**
  - `.gitignore`: `node_modules`, `.next`, `out`, `pipeline/data/raw`, `pipeline/data/work`, `*.bsp`, `*.bpc`, `*.tls`, `*.tpc`, `*.tf`, `.venv`, `playwright-report`, `test-results`.
  - `vercel.json`: headers for `/(.*)`: `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
  - `workbox-config.cjs`: `globDirectory: 'out'`, precache the app shell (`**/*.{html,js,css,woff2,webmanifest,png,svg}`, excluding `data/**`), runtime `CacheFirst` for `/data/v1/` with a 300-entry limit, `swDest: 'out/sw.js'`.
- [ ] **Step 6: CI.** `.github/workflows/ci.yml` on push and pull_request:
  - Job `web` (ubuntu, Node 20): `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
  - Job `pipeline` (Python 3.12): `pip install -r pipeline/requirements-ci.txt` (numpy, numba, pyproj, pytest), then `pytest pipeline/tests -m "not needs_data"`.
- [ ] **Step 7: Verify locally.** Run `npm test`, `npm run typecheck`, `npm run build`. Expect all to pass and `out/index.html` plus `out/sw.js` to exist. Then run `npx playwright install chromium` and `npm run e2e`; expect PASS.
- [ ] **Step 8: Commit** `chore: scaffold Next.js static app, CI, pipeline package`.
- [ ] **Step 9: GitHub.** Using the `jackalaka21` token, create the public repo `jackalaka21/lunar-site-planner` with `gh repo create ... --public --source . --push`. Confirm the CI run is green with `gh run list`.
- [ ] **Step 10: Vercel.** Use the Vercel connector to create a Git-linked project for `jackalaka21/lunar-site-planner`: framework Next.js, build command `npm run build`, output directory `out`, production branch `main`, personal scope (`team_7JMFuQc6f1mEd6STwOqxkPT1` is the default team id from `get_auth_user`; omit the team for personal). Wait for the deployment with `list_deployments`, then fetch the production URL. Expect the "Ridgeline" heading. Record the URL in `README.md` and commit `docs: add live URL`.

---

## Phase B — Pipeline (Python)

### Task 2: SPICE kernels and the hourly ephemeris

**Files:**
- Create: `pipeline/lsp/constants.py`, `pipeline/lsp/io.py`, `pipeline/lsp/ephemeris.py`
- Test: `pipeline/tests/test_ephemeris.py`
- Output: `public/data/v1/ephemeris/index.json`, `public/data/v1/ephemeris/{1969..2035}.bin`
- Modify: `DATA_SOURCES.md`

**Interfaces:**
- Produces:
  - `lsp.constants`: `R_MOON_KM = 1737.4`, `R_SUN_KM = 696000.0`, `R_EARTH_KM = 6371.0`, `OBS_HEIGHT_M = 2.0`, `EPOCH_UTC = "1969-01-01T00:00:00Z"`
  - `lsp.ephemeris.load_kernels(kernel_dir: Path) -> None`
  - `lsp.ephemeris.body_vectors(utc_hours: np.ndarray[datetime64]) -> np.ndarray` with shape (N, 6), float64 km
  - `lsp.ephemeris.write_year(year: int, out_dir: Path) -> Path`
  - `lsp.ephemeris.read_year(path: Path) -> np.ndarray` with shape (N, 6), float32
  - `lsp.io.sha256(path) -> str`
  - CLI: `python -m lsp.ephemeris --kernels pipeline/data/raw/spice --out public/data/v1/ephemeris`

- [ ] **Step 1: Compile the download list.** From NAIF generic kernels pick:
  - the latest leapseconds `.tls`
  - `de440s.bsp` (covers 1849–2150)
  - the latest Moon PA binary PCK for DE440 plus the matching Moon frames kernel (`MOON_ME`)
  - `pck00011.tpc`

  Record names, URLs and sizes. **GATE** (Task 0 Step 3).
- [ ] **Step 2: Download** into `pipeline/data/raw/spice/` (PowerShell, `curl --ssl-no-revoke`). Record SHA-256 values in `DATA_SOURCES.md`.
- [ ] **Step 3: Write failing tests** (marked `@pytest.mark.needs_data`):
  - `test_vectors_magnitudes`: at 2027-01-01T00:00Z, |earth| ∈ [356000, 407000] km and |sun| ∈ [1.47e8, 1.53e8] km.
  - `test_year_record_count`: `read_year(2028)` has 8784 rows and `read_year(2027)` has 8760.
  - `test_interp_error_small`: for 200 random off-grid times in 2027, the angle between the linear interpolation of hourly vectors and direct `body_vectors` is < 0.001° for both bodies.
  - `test_coverage_covers_range`: the PCK coverage includes 1969-01-01 and 2035-12-31. If not, the test fails with the actual coverage printed; then narrow `firstYear`/`lastYear` to the coverage and record it.
- [ ] **Step 4: Run** `pytest pipeline/tests/test_ephemeris.py -v`. Expect FAIL (module missing).
- [ ] **Step 5: Implement** with `spiceypy`: `str2et` on UTC strings, `spkpos(target, et, "MOON_ME", "LT+S", "MOON")` for `SUN` and `EARTH`. Write float32 LE. `index.json` per Data Formats, with kernel names and sha256 values.
- [ ] **Step 6: Run the tests.** Expect PASS. Generate all years, then confirm the total size is ≈ 14 MB.
- [ ] **Step 7: JPL Horizons cross-check** (feeds `validation.json`). Implement `lsp.validate.horizons_check() -> list[dict]`: for 3 sites (`(-89.9, 0)`, `(0.674, 23.473)`, `(-45.44, 177.60)`) × 20 times in 2026–2027, query the Horizons API observer ephemeris (`CENTER='coord@301'`, `SITE_COORD`, quantity 4 = apparent az/el) for Sun (10) and Earth (399). Compare against `lsp.reference` az/el (Task 4; run this step after Task 4 if needed). Pass if max |Δ| ≤ 0.05°. Write results to `pipeline/data/work/horizons_check.json`.
- [ ] **Step 8: Commit** `feat(pipeline): hourly MOON_ME Sun/Earth ephemeris 1969–2035`.

### Task 3: DSN ground-station Moon elevation (data for S7)

**Files:**
- Create: `pipeline/lsp/dsn.py`
- Test: `pipeline/tests/test_dsn.py`
- Output: `public/data/v1/dsn/{year}.bin`

**Interfaces:**
- Consumes: `load_kernels` (Task 2).
- Produces: `lsp.dsn.STATIONS = {"goldstone": (35.426, -116.890), "madrid": (40.431, -4.248), "canberra": (-35.402, 148.981)}` (lat, lon in degrees; cite NASA DSN in `DATA_SOURCES.md`), and `lsp.dsn.moon_elevations(utc_hours) -> np.ndarray` with shape (N, 3), int8.

- [ ] **Step 1: Failing tests** (`needs_data`):
  - `test_at_least_one_station_most_hours`: in 2027, the fraction of hours with max elevation ≥ 10° is > 0.9.
  - `test_canberra_dominates_south`: on the hour of the Moon's most negative declination in Jan 2027, Canberra's elevation > Goldstone's.
- [ ] **Step 2: Implement.** Moon position from EARTH in `IAU_EARTH` (`spkpos("MOON", et, "IAU_EARTH", "LT+S", "EARTH")`), station position via `georec` on a sphere of radius 6371 km, elevation = asin(v·up/|v|).
- [ ] **Step 3: Run the tests.** Expect PASS. Write the years.
- [ ] **Step 4: Commit** `feat(pipeline): DSN station Moon elevations`.

### Task 4: Python reference engine and cross-language fixtures

**Files:**
- Create: `pipeline/lsp/geometry.py`, `pipeline/lsp/reference.py`, `pipeline/lsp/fixtures.py`, `scripts/copy-fixtures.mjs`
- Test: `pipeline/tests/test_geometry.py`, `pipeline/tests/test_reference.py`
- Output: `pipeline/fixtures/engine_cases.json` (committed), then copied to `tests/fixtures/engine_cases.json`

**Interfaces:**
- Produces (Python mirror of TS names, snake_case):
  - `site_frame(lat, lon, h_dem_m) -> (p, u, e, n)`
  - `topocentric(body_vec, frame) -> (az, el, r_deg, dist_km)`
  - `disc_fraction(el, H, r) -> float`
  - `sun_blocked_by_earth(sun_vec, earth_vec, p) -> float`
  - `horizon_at(profile: np.ndarray, step_deg, az) -> float`
  - `sample(case) -> dict of arrays`
  - `metrics(series, settings) -> dict`
  - `find_event(case, from_ms, kind) -> int | None`
- Fixture JSON shape (TS tests in Tasks 10 and 12 read it):
  ```json
  { "version": 1, "cases": [ { "name": "...", "lat": -85.3, "lon": 31.2, "hDemM": 1500,
      "horizon": { "stepDeg": 0.5, "kind": "flat|ridge|values", "values": [] },
      "t0Utc": "2027-03-01T00:00:00Z", "settings": { ... full Settings ... },
      "expect": { "samplesAt": [ { "i": 0, "sunAz": 0, "sunEl": 0, "sunFrac": 0, "earthAz": 0, "earthEl": 0,
                                    "eclipseFrac": 0, "earthIn": true, "lit": true } ],
                  "metrics": { ... Metrics ... }, "events": { "sunset": "ISO|null", "earthset": "ISO|null" } } } ] }
  ```
  Synthetic horizons: `flat` = −dip everywhere; `ridge` = 2.0·max(0, cos(az − 120°)) degrees (a single ridge to the ESE).

- [ ] **Step 1: Failing tests.**
  - `test_disc_fraction_endpoints`: f(el = H + r) = 1, f(el = H − r) = 0, f(el = H) = 0.5, and f(H + d) + f(H − d) = 1 for d = 0.3r.
  - `test_pole_frame_equals_lon0_limit`: `site_frame(-90, 123)` gives n = (1, 0, 0) and e = (0, 1, 0) within 1e-12, and equals the frame at (-90, 0).
  - `test_frame_orthonormal` at 5 random sites.
  - `test_eclipse_fraction_cases`: separation ≥ r_s + r_e → 0, separation 0 → 1, and the partial overlap matches a 200k-point Monte Carlo estimate within 0.01.
  - `test_eclipse_2025_03_14_detected`: at (0, 0) at 2025-03-14T06:58Z, `sun_blocked_by_earth` = 1.0.
  - `test_metrics_counts`: a synthetic series with known lit and dark runs gives the expected hours, longest dark, flicker merge count, and verdict per Global Constraints.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement** to spec §7.2–§7.8 and the Global Constraints verdict and settings. Read the ephemeris from `public/data/v1/ephemeris` with the same linear interpolation as Task 11: hour index = ⌊(t − epoch)/3600 s⌋ and fraction = remainder/3600 s.
- [ ] **Step 4: Run.** Expect PASS.
- [ ] **Step 5: Generate fixtures** with `python -m lsp.fixtures` (≥ 10 cases):
  - flat and ridge horizons at the south pole
  - a Mons Mouton–area point with the ridge horizon
  - Apollo 11 flat
  - a Chang'e-4 far-side point (Earth never in view)
  - a mission crossing 2027→2028
  - a case inside a total-eclipse window (2025-09-07)
  - lit threshold `any` vs `full`
  - flicker merge 0 vs 30

  Each case has samples at i ∈ {0, 1, 500, last}. Write `scripts/copy-fixtures.mjs` to copy the file to `tests/fixtures/`.
- [ ] **Step 6: Commit** `feat(pipeline): reference engine and cross-language fixtures`.

### Task 5: DEM download and composite resampling

**Files:**
- Create: `pipeline/lsp/ps.py`, `pipeline/lsp/dem.py`
- Test: `pipeline/tests/test_ps.py`, `pipeline/tests/test_dem.py`
- Output (gitignored): `pipeline/data/work/fine_40m.npy` (int16 m, radius 200 km), `pipeline/data/work/coarse_120m.npy` (int16 m, radius 400 km), `pipeline/data/work/global_64ppd.npy`

**Interfaces:**
- Produces:
  - `lsp.ps.to_xy(lat, lon) -> (x, y)` and `lsp.ps.to_latlon(x, y) -> (lat, lon)` (formulas in Data Formats)
  - `lsp.dem.Grid(origin_xy, res_m, array)` with `sample(x, y) -> float`, bilinear, NaN outside
  - `lsp.dem.load_fine()`, `lsp.dem.load_coarse()`, `lsp.dem.load_global() -> Grid | GlobalGrid`
  - `lsp.dem.GlobalGrid.sample(lat, lon)`

- [ ] **Step 1: Compile the download list.**
  - NASA PGDA LOLA south-pole polar stereographic DEM covering 80°S–90°S at ≤ 40 m/px (if only 20 m exists, take it and downsample).
  - A global LOLA DEM at about 64 pixels per degree (≈ 474 m).

  Record exact product names, URLs, sizes and native CRS. **GATE** (Task 0 Step 3).
- [ ] **Step 2: Download** into `pipeline/data/raw/dem/`. Record SHA-256 values and credits in `DATA_SOURCES.md`.
- [ ] **Step 3: Failing tests.**
  - `test_ps_roundtrip`: 1000 random points with lat ∈ [−90, −75] round-trip within 1e-9°.
  - `test_ps_pole_is_origin`: `to_xy(-90, any)` = (0, 0).
  - `test_ps_lon0_is_plus_y`: `to_xy(-80, 0)` has x ≈ 0 and y > 0.
  - `test_bilinear_on_plane` (synthetic plane z = 2x + 3y): exact at off-grid points.
- [ ] **Step 4: Implement.** `dem.py` reprojects the native DEM into our sphere PS grid with `rasterio.warp.reproject` (bilinear, windowed to bound memory), stored as int16 metres relative to 1737.4 km.
  - Fine grid: 40 m, covering |x|, |y| ≤ 200 km.
  - Coarse grid: 120 m, covering |x|, |y| ≤ 400 km. Use the polar DEM where available and fill from the global DEM elsewhere.
  - Import `rasterio` lazily inside functions so CI (which has no rasterio) can import `lsp.dem`.
  - Write `tests/fixtures/ps.json` with 5 `(lat, lon, x, y)` tuples for Task 11's parity test.
- [ ] **Step 5: Run the tests.** Expect PASS. Then run `python -m lsp.dem build`. Expect both `.npy` files, no NaN within the radii, and a min/max height printout in [−10000, 10000] m.
- [ ] **Step 6: Commit** `feat(pipeline): PS projection and DEM composites` (code only, no data).

### Task 6: Horizon ray-caster, curated-site horizons and the polar grid

**Files:**
- Create: `pipeline/lsp/raycast.py`, `pipeline/lsp/horizons.py`
- Test: `pipeline/tests/test_raycast.py`, `pipeline/tests/test_horizons_io.py`
- Output: `public/data/v1/horizons/grid/*`, `public/data/v1/horizons/sites/*.bin`

**Interfaces:**
- Consumes: `lsp.ps`, `lsp.dem` (Task 5); `sites_source.json` (Task 7) for site horizons.
- Produces:
  - `raycast.horizon_profile(lat, lon, obs_h_m, n_az, fine, coarse, max_km=200.0) -> np.ndarray[n_az]` (degrees)
  - `raycast.horizon_profile_global(lat, lon, obs_h_m, n_az, glob, max_km=100.0)`
  - `horizons.write_tile(i, j, slots) / read_tile(path) -> np.ndarray(400, 721)`
  - `horizons.build_grid(...)`, `horizons.build_sites(...)`

- [ ] **Step 1: Failing tests** (synthetic DEMs, no data needed):
  - `test_flat_sphere_dip`: a zero-height DEM with obs 2 m gives a horizon ≈ −acos(R/(R + 2 m)) = −0.0870° ± 0.002 at all azimuths.
  - `test_cone_peak`: a 1000 m cone 20 km to the north gives a horizon at az 0 within 0.05° of atan2(1000 − drop − 2, 20000), where drop = 20000²/(2R).
  - `test_azimuth_convention`: the cone placed to the east shows its peak at az 90.
  - `test_pole_observer_rays_follow_meridians`: at the pole, a cone on the 90°E meridian peaks at az 90.
  - `test_tile_roundtrip`: write then read gives identical int16 values, and empty slots are −32768.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement** in numba (`@njit(parallel=True)` over points).
  - Elevation formula: el = atan2((R + h_t)·cos(s/R) − (R + h_o), (R + h_t)·sin(s/R)).
  - Step = max(res, 0.002·s). Sample the fine grid for s < 5 km and the coarse grid beyond.
  - Destination via great-circle formula, with the pole special case in Data Formats.
  - Output: max el per ray.
- [ ] **Step 4: Run the tests.** Expect PASS.
- [ ] **Step 5: Time a sample.** Compute 500 random grid points at 720 azimuths and print the seconds. If the projected full grid exceeds 90 minutes, switch to 4 km spacing (`halfCount` 47, `tilePoints` 10) and/or 360 azimuths (`stepDeg` 1). Record the choice in `index.json` and tell the main session.
- [ ] **Step 6: Curated sites first.** Run `python -m lsp.horizons sites`: 3600 azimuths at 2, 10 and 50 m, polar sites via fine/coarse, non-polar via global.
- [ ] **Step 7: Full grid.** Run `python -m lsp.horizons grid` in the background. Expect about 100 tile files, `index.json`, and a total ≤ 60 MB.
- [ ] **Step 8: Commit** `feat(pipeline): horizon ray-caster, site horizons, polar grid tiles` (include `public/data/v1/horizons`).

### Task 7: Curated site catalog

**Files:**
- Create: `pipeline/catalog/sites_source.json`, `pipeline/lsp/catalog.py`
- Test: `pipeline/tests/test_catalog.py`
- Output: `public/data/v1/sites.json`

**Interfaces:**
- Produces `sites.json` per Data Formats. Ids are kebab-case and stable; Task 20, Task 19 defaults and the URLs use them.
- Required ids: `apollo-11`, `apollo-12`, `apollo-14`, `apollo-15`, `apollo-16`, `apollo-17`, `im-1`, `im-2`, `blue-ghost-1`, `chandrayaan-3`, `change-3`, `change-4`, `change-5`, `change-6`, `slim`, `shackleton-rim`, `connecting-ridge`, `malapert-massif`, `mons-mouton`, plus every current Artemis III candidate region (`artemis3-<slug>`) and any other landed or targeted sites with published coordinates, for ≥ 25 total.

- [ ] **Step 1: Research** each coordinate from NASA, LROC, agency or peer-reviewed sources (WebSearch/WebFetch).
  - Prefer LROC-measured landing positions.
  - Check whether NASA updated the Artemis III region list after 2024, and whether the crewed landing has moved to a later Artemis mission. Label the group "Artemis crewed landing candidates" and state the mission and date checked in `notes`.
  - Fill `actual_landing_utc` for landed missions (Apollo LM landings, IM-1 2024-02-22, IM-2 2025-03-06, Chandrayaan-3 2023-08-23, SLIM 2024-01-19, Blue Ghost 2025-03-02, Chang'e missions), each with a source.
  - Include no entry without `source_url`.
- [ ] **Step 2: Failing tests.**
  - `test_every_site_has_source`
  - `test_ids_unique_kebab`
  - `test_lat_lon_ranges`
  - `test_required_ids_present`
  - `test_count_at_least_25`
  - `test_groups_valid`
- [ ] **Step 3: Implement** `catalog.build()`. Copy the source fields, add `hDemM` (sampled from the fine/coarse/global DEM) and `checkedUtc`. It runs before Task 6 Step 6 can use the list.
- [ ] **Step 4: Run.** Expect PASS. Commit `feat(pipeline): curated site catalog with sources`.

### Task 8: Basemaps

**Files:**
- Create: `pipeline/lsp/basemaps.py`
- Test: `pipeline/tests/test_basemaps.py`
- Output: `public/data/v1/basemaps/south-pole-4096.webp`, `south-pole-2048.webp`, `global-2048.webp`, plus `basemaps/index.json` `{ "southPole": { "radiusM": 190000, "sizes": [4096, 2048] }, "global": { "w": 2048, "h": 1024, "proj": "equirect" } }`

- [ ] **Step 1: Failing test.** `test_hillshade_dimensions_and_range`: synthetic DEM in, 8-bit image of the requested size out, with nonzero variance.
- [ ] **Step 2: Implement** a hillshade (sun azimuth 315°, altitude 30°, a cosmetic choice for readability) with a muted grey ramp suitable for the dark theme. South-pole image: PS grid covering ±190 km, north up = +y (0°E) at the top of the image. Global: equirectangular, lon −180…180 left to right.
- [ ] **Step 3: Run, generate, visually check, commit** `feat(pipeline): hillshade basemaps`. Credit NASA/GSFC LOLA in `DATA_SOURCES.md`.

### Task 9: Scientific validation outputs

**Files:**
- Create: `pipeline/lsp/validate.py` (extend from Task 2 Step 7)
- Test: `pipeline/tests/test_validate.py`
- Output: `public/data/v1/validation.json`

- [ ] **Step 1: Failing tests** on the shape of each validation entry (`name`, `value`, `reference`, `tolerance`, `pass`, `source_url`).
- [ ] **Step 2: Implement checks** (spec §11.2):
  1. Horizons check (Task 2 Step 7 results).
  2. Interpolation error.
  3. Smooth-sphere pole Sun range within ±1.6° over 2025–2032.
  4. Average sunlit % (litThreshold `any`, 2 m) over 2025–2032 at `shackleton-rim` and `connecting-ridge`, compared with Gläser et al. 2018 (85.5% for the Shackleton rim); pass if within 10 points.
  5. Eclipses 2025-03-14, 2025-09-07, 2026-03-03: totality onset/offset at a near-side site within 10 min of NASA's published times.
  6. Replays:
     - Chandrayaan-3: predicted sunset date at the site vs ISRO's sleep dates of 2–4 Sept 2023 (pass if the sunset falls 1–6 Sept).
     - SLIM: Sun azimuth relative to local north during 2024-01-28 to 02-01 is in the western half.
     - IM-2: report the Sun elevation and azimuth at landing (informational, `pass: null`).
  7. **Cross-check against the data behind Quickmap's Sun/Earth Visibility layers.** Use NASA PGDA Lunar Polar Illumination average Sun and Earth visibility rasters (product 69, the LOLA-based maps Quickmap displays): download list → GATE → download. Sample them at `shackleton-rim`, `connecting-ridge`, `malapert-massif` and `mons-mouton`. Compare with our average sunlit % and Earth-in-view % over the same period definition (as close as the product allows). Pass if within 10 percentage points; report the differences and explain them (period, observer height, resolution). Credit it as "same LOLA visibility data shown in LROC Quickmap".
- [ ] **Step 3: Run** `python -m lsp.validate`. Expect every non-informational check to pass. **If any fails, stop and report to the main session; do not loosen tolerances.**
- [ ] **Step 4: Commit** `feat(pipeline): validation report`.

---

## Phase C — Engine (TypeScript)

### Task 10: Engine geometry core

**Files:**
- Create: `lib/engine/types.ts`, `vec.ts`, `constants.ts`, `frame.ts`, `topo.ts`, `disc.ts`, `horizon.ts`, `index.ts`
- Test: `tests/unit/engine/geometry.test.ts`, `tests/unit/engine/fixtures-geometry.test.ts`

**Interfaces:**
- Produces (`lib/engine/types.ts`):
  ```ts
  export type Vec3 = readonly [number, number, number];
  export type BodyId = 'sun' | 'earth';
  export interface SiteFrame { p: Vec3; u: Vec3; e: Vec3; n: Vec3 }           // km
  export interface Topo { az: number; el: number; r: number; distKm: number } // deg
  export interface HorizonProfile { stepDeg: number; elevDeg: Float32Array }
  export type HorizonSource =
    | { kind: 'site'; id: string; mastM: 2 | 10 | 50 }
    | { kind: 'grid'; distKm: number; spacingKm: number }
    | { kind: 'sphere' };
  export interface SiteContext { lat: number; lon: number; hDemM: number; obsHeightM: number;
                                 horizon: HorizonProfile; source: HorizonSource }
  export interface EphemerisSource { bodyAt(body: BodyId, tMs: number): Vec3; coverage(): [number, number] }
  export interface StationSource { moonElDeg(tMs: number): [number, number, number] }
  ```
- Functions:
  - `siteFrame(lat: number, lon: number, hDemM: number, obsHeightM?: number): SiteFrame`
  - `topocentric(body: Vec3, f: SiteFrame, bodyRadiusKm: number): Topo`
  - `discFraction(el: number, H: number, r: number): number`
  - `sunBlockedByEarth(sun: Topo, earth: Topo): number`
  - `sunEarthSeparation(sun: Topo, earth: Topo): number`
  - `horizonAt(h: HorizonProfile, az: number): number`
  - `sphereHorizon(obsHeightM: number): HorizonProfile` (constant −acos(R/(R + h)) at stepDeg 1)
  - `subsolarLatitude(sun: Vec3): number`
  - `earthPhase(sun: Topo, earth: Topo): { illuminatedFraction: number; brightLimbDeg: number }`
    - Illuminated fraction k = (1 − cos e)/2, where e = Sun–Earth separation seen from the site (full Earth when the Sun is opposite).
    - `brightLimbDeg` = direction in the local (az, el) plane from Earth's centre toward the Sun, in degrees clockwise from "up". It is used by the panorama to draw Earth's true phase (unslop moment).
    - Tests: e = 180 → k = 1; e = 0 → 0; e = 90 → 0.5; Sun due east of Earth at equal elevation → brightLimbDeg = 90.

- [ ] **Step 1: Failing tests** (`geometry.test.ts`), mirroring Task 4 Step 1 plus:
  - `pole frame is lon-independent`: `siteFrame(-90, 0)` deep-equals `siteFrame(-90, 137)` and `siteFrame(-90, -180)`.
  - `horizonAt wraps`: a profile with value 1 at 359.5° and 3 at 0° gives `horizonAt(h, 359.75)` = 2, and az = 360 equals az = 0.
  - `azimuth is in [0,360)` for 1000 random vectors.
  - `subsolarLatitude within ±1.6` for 2025–2027 hourly samples (via `nodeFetchers`, Task 11; skip until Task 11 lands, then enable).
- [ ] **Step 2: Fixture test** (`fixtures-geometry.test.ts`): for every case and sample in `tests/fixtures/engine_cases.json`, sunAz/sunEl/earthAz/earthEl within 1e-6°, and sunFrac/eclipseFrac within 1e-9. It uses an ephemeris read from disk; until Task 11 lands, implement a minimal local reader inside the test file.
- [ ] **Step 3: Run** `npm test -- engine`. Expect FAIL.
- [ ] **Step 4: Implement** to spec §7.2–§7.4 and §7.8 (lens formula). Use small-angle planar geometry for the eclipse lens, with the separation from `acos` of the unit vectors.
- [ ] **Step 5: Run.** Expect PASS. Commit `feat(engine): geometry core with fixture parity`.

### Task 11: Data loaders (ephemeris, horizons, PS grid lookup, sites, DSN)

**Files:**
- Create: `lib/data/fetchers.ts`, `lib/data/nodeFetchers.ts`, `lib/data/ephemeris.ts`, `lib/data/ps.ts`, `lib/data/horizons.ts`, `lib/data/sites.ts`, `lib/data/dsn.ts`
- Test: `tests/unit/data/*.test.ts`

**Interfaces:**
- Consumes: Task 10 types.
- Produces:
  - `type Fetcher = (path: string) => Promise<ArrayBuffer>` (browser: `fetch('/data/v1/' + path)`; tests: read `public/data/v1/` from disk)
  - `class Ephemeris implements EphemerisSource { static async open(f: Fetcher): Promise<Ephemeris>; ensure(fromMs: number, toMs: number): Promise<void>; bodyAt(...); coverage() }` — `bodyAt` throws `RangeError` if the hour isn't loaded or is outside coverage.
  - `psToXY(lat, lon): {x, y}`, `psToLatLon(x, y): {lat, lon}` (identical to Python)
  - `class HorizonStore { static async open(f): Promise<HorizonStore>; forSite(id: string, mastM: 2|10|50): Promise<{profile: HorizonProfile; hDemM: number}>; forPoint(lat, lon): Promise<{profile: HorizonProfile; hDemM: number; source: HorizonSource} | null>; neighbours(lat, lon, radiusKm): Promise<Array<{lat, lon, hDemM, profile}>> }` — `forPoint` returns null outside the grid.
  - `loadSites(f): Promise<SiteCatalog>` with `SiteCatalog = { checkedUtc: string; sites: Site[]; byId: Map<string, Site> }`
  - `class Dsn implements StationSource { static open(f); ensure(fromMs, toMs); moonElDeg(tMs) }`
  - `resolveSiteContext(ref: SiteRef, catalog, store, mastM): Promise<SiteContext>` (`SiteRef` from Task 14)

- [ ] **Step 1: Failing tests.**
  - `interpolates across year boundary`: `ensure(2027-12-31T22:00Z, 2028-01-01T02:00Z)`, then `bodyAt` at 23:30 equals the midpoint of the two records (one from each file) within 1e-6 km.
  - `throws outside coverage`
  - `psToXY matches python` (5 fixture values written by Task 5 into `tests/fixtures/ps.json`)
  - `forPoint nearest grid point`: a point 0.6 km from grid node (2, 3) returns that node with distKm ≈ 0.6
  - `forPoint outside grid returns null`
  - `site horizon has 3600 values`
  - `dsn values decode as signed`
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** Cache loaded years, tiles and sites in Maps, and de-duplicate in-flight promises. **Step 4: Run.** Expect PASS. Re-enable the skipped Task 10 subsolar test.
- [ ] **Step 5: Commit** `feat(data): binary loaders and grid lookup`.

### Task 12: Sampling, events, metrics, verdict

**Files:**
- Create: `lib/engine/sample.ts`, `lib/engine/events.ts`, `lib/engine/metrics.ts`
- Test: `tests/unit/engine/metrics.test.ts`, `tests/unit/engine/fixtures-metrics.test.ts`

**Interfaces:**
- Consumes: Tasks 10–11. `Settings`, `DEFAULT_SETTINGS` and `SETTINGS_RANGES` from `lib/engine/settings.ts` (Task 1 Step 3b; the shape is repeated below for reference only, do not redefine).
- Produces:
  ```ts
  export interface Settings {   // lives in lib/engine/settings.ts litThreshold: 'any'|'half'|'full'; earthMarginDeg: number; durationDays: number;
    batteryH: number; flickerMergeMin: number; interferenceDeg: number; dsnEnabled: boolean; dsnMaskDeg: number;
    horizonUncertDeg: number; ellipseKm: number; mastM: 2|10|50;
    panel: { mode: 'tracking' } | { mode: 'fixed'; azDeg: number }; axis: 'met'|'cal'; displayTz: string }
  export interface TimeSeries { t0Ms: number; stepMs: number; n: number;
    sunAz: Float32Array; sunEl: Float32Array; sunFrac: Float32Array; eclipseFrac: Float32Array;
    earthAz: Float32Array; earthEl: Float32Array; earthIn: Uint8Array; interference: Uint8Array;
    power: Float32Array; lit: Uint8Array; both: Uint8Array; dsnBits: Uint8Array; clippedAtMs: number | null }
  export type Verdict = 'good' | 'marginal' | 'poor';
  export interface Metrics { verdict: Verdict; reason: string; bothH: number; bothPct: number; sunlitH: number;
    sunlitPct: number; earthH: number; earthPct: number; longestDarkH: number; longestDarkStartMs: number | null;
    longestCommsGapH: number; firstSunsetMs: number | null; meanPower: number; flickersMerged: number;
    landing: { ok: boolean; reason: string | null } }
  export type EventKind = 'sunset' | 'sunrise' | 'earthset' | 'earthrise';
  ```
- Functions:
  - `sample(ctx: SiteContext, eph: EphemerisSource, t0Ms: number, durationH: number, stepMin: number, s: Settings, dsn?: StationSource, horizonOffsetDeg?: number): TimeSeries`
  - `findEvent(ctx, eph, fromMs: number, kind: EventKind, s: Settings, maxDays = 60): number | null`
  - `landingCheck(ctx, eph, t0Ms, s): { ok: boolean; reason: string | null }`
  - `metrics(series: TimeSeries, landing, s): Metrics`
  - `mergeFlickers(state: Uint8Array, stepMs: number, mergeMin: number): { merged: Uint8Array; count: number }`

- [ ] **Step 1: Failing tests** (`metrics.test.ts`):
  - `lit threshold`: sunFrac 0.4 is lit for `any`, not lit for `half`, not lit for `full`. sunFrac 0.995 is lit for `full`.
  - `earth margin`: earthEl = H + 0.5 is in view at margin 0 and not in view at margin 1.
  - `power tracking = sunFrac*cos(el)`; `power fixed panel facing away = 0`.
  - `mergeFlickers fills gaps < 30 min and counts them`: pattern 1,1,0,0,1 at 10-min steps → merged all 1, count 1. A 40-min gap is not merged.
  - `verdict precedence`: landing fail → poor "No DTE during descent". Earth never → poor "Earth never in view (relay needed)". longestDark 50 h with battery 24 → poor with reason matching `/^50 h darkness starting T\+\d+(\.\d)? d$/`. bothPct 55 and dark 10 → good. bothPct 30 → marginal.
  - `far side never sees Earth`: Chang'e-4 coordinates (from `sites.json`, or hard-coded −45.44, 177.60 if Task 7 isn't merged yet) with `sphereHorizon(2)` and the real ephemeris → earthH = 0, verdict poor, reason "Earth never in view (relay needed)".
  - `no event within 60 days returns null`: synthetic horizon −90° everywhere (always lit, no eclipse windows in range) → `findEvent(...'sunset')` is null within 60 days.
  - `clips mission at coverage end`: t0 = 2035-12-25 with 14 days → series ends at coverage end and `clippedAtMs` is set (no throw).
  - `events bisected to 1 minute`: |event − brute-force 1-min scan| ≤ 60 s.
- [ ] **Step 2: Fixture parity** (`fixtures-metrics.test.ts`): metrics equal the Python values (hours within 1e-9, events within 60 s).
- [ ] **Step 3: Run.** Expect FAIL. **Step 4: Implement** per spec §7.5–§7.8 and the Global Constraints verdict. Number formatting of the reason uses `lib/format.ts` (`fmtHours`, `fmtDays`, create here). **Step 5: Run.** Expect PASS.
- [ ] **Step 6: Commit** `feat(engine): sampling, events, metrics, verdict`.

### Task 13: Worker API and date scanning

**Files:**
- Create: `workers/engine.worker.ts`, `lib/engine/scan.ts`, `lib/engine/robustness.ts`, `lib/engineClient.ts`
- Test: `tests/unit/engine/scan.test.ts`, `tests/unit/engine/robustness.test.ts`

**Interfaces:**
- Consumes: Tasks 10–12.
- Produces:
  - `scanDates(ctx, eph, fromMs, days, stepH, s): DaySummary[]` with `DaySummary = { t0Ms: number; bothH: number; verdict: Verdict; sunlitPct: number; earthPct: number }`
  - `nextGoodDates(ctx, eph, fromMs, s, count = 3, stepH = 6, maxDays = 365): DaySummary[]`
  - `robustness(ctx, neighbours: SiteContext[], eph, t0Ms, s): Record<'bothH'|'sunlitH'|'earthH'|'longestDarkH', {min: number; max: number}>` (horizon ±horizonUncertDeg plus every neighbour)
  - Worker API exposed via Comlink:
    ```ts
    export interface EvaluateResult {
      ctx: { lat: number; lon: number; hDemM: number; obsHeightM: number; source: HorizonSource;
             horizonStepDeg: number; horizonDeg: Float32Array };
      series: TimeSeries; metrics: Metrics }
    export interface EngineApi {
      init(): Promise<void>;
      evaluate(req: { ref: SiteRef; t0Ms: number; settings: Settings }): Promise<EvaluateResult>;
      countdowns(req: { ref: SiteRef; fromMs: number; settings: Settings }):
        Promise<Record<EventKind, number | null>>;
      calendar(req: { ref: SiteRef; fromMs: number; days: number; settings: Settings }): Promise<DaySummary[]>;
      nextGood(req: { ref: SiteRef; fromMs: number; settings: Settings }): Promise<DaySummary[]>;
      robustness(req: { ref: SiteRef; t0Ms: number; settings: Settings }): Promise<ReturnType<typeof robustness>>;
      heatmap(req: { ref: SiteRef; t0Ms: number; radiusKm: number; settings: Settings }):
        Promise<Array<{ lat: number; lon: number; bothH: number }>>;
    }
    ```
    Transfer typed arrays with `Comlink.transfer` to avoid copies.
  - `lib/engineClient.ts`: `getEngine(): Remote<EngineApi>` (a singleton worker via `new Worker(new URL('../workers/engine.worker.ts', import.meta.url), { type: 'module' })`).

- [ ] **Step 1: Failing tests.**
  - `scanDates returns days entries with step`
  - `nextGoodDates only returns good, ascending, ≤ count`
  - `robustness min ≤ nominal ≤ max`
  - `robustness horizon +0.3 never increases sunlit hours`
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** The worker uses browser fetchers. Calendar: 365 days from the 1st of the landing month at a 24 h step, clipped to coverage (spec §17). nextGood: 6 h step up to 365 days. **Step 4: Run.** Expect PASS, then `npm run build` passes (worker bundles).
- [ ] **Step 5: Commit** `feat(engine): worker API, date scanning, robustness`.

### Task 14: URL state codec and store

**Files:**
- Create: `lib/state/defaults.ts`, `lib/state/url.ts`, `lib/state/store.ts`
- Test: `tests/unit/state/url.test.ts`, `tests/unit/state/store.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SiteRef = { kind: 'catalog'; id: string } | { kind: 'custom'; lat: number; lon: number };
  export interface Scenario { key: string; site: SiteRef; t0Ms: number }
  export interface UrlState { scenarios: Scenario[]; settings: Settings; cursorH: number }
  export function encodeState(s: UrlState): string;                      // query string without '?'
  export function decodeState(qs: string, knownSiteIds: Set<string> | null):
    { state: UrlState; notices: string[] };
  export function normaliseLon(lon: number): number;                     // → [-180, 180)
  export const DEFAULT_SCENARIOS: Scenario[];                            // Task 19 fills the real default date
  export const MAX_SCENARIOS = 4;
  // zustand store
  export interface AppState extends UrlState { playing: boolean; speedHps: 1 | 6 | 24; notices: string[];
    addScenario(s?: Partial<Scenario>): void; updateScenario(key: string, patch: Partial<Scenario>): void;
    removeScenario(key: string): void; setSettings(p: Partial<Settings>): void; setCursorH(h: number): void;
    setPlaying(p: boolean): void; setSpeed(v: 1|6|24): void; dismissNotice(i: number): void }
  export const useAppStore: UseBoundStore<StoreApi<AppState>>;
  ```
- URL format (spec §9.5):
  - `v=1&sc=<siteRef>@<ISO>;...&dur=&lit=any|50|100&em=&bat=&fm=&int=&dsn=0|1&dm=&hu=&el=&mast=&pan=t|<az>&axis=met|cal&tz=&t=`
  - `siteRef` = catalog id or `c:<lat>,<lon>` (3 decimals). ISO in `YYYY-MM-DDTHH:mmZ`.
  - Only non-default settings are encoded.
  - Store ↔ URL sync uses `history.replaceState`, debounced 250 ms.

- [ ] **Step 1: Failing tests.**
  - `roundtrip`: random valid states encode then decode to deep-equal state and no notices.
  - `omits defaults`: the default state encodes to `v=1&sc=...&t=0`.
  - `normalises longitude`: 190 → −170, −180 → −180, 180 → −180, 360 → 0.
  - `decodeState tolerates garbage`. Each case returns a valid state plus a notice:
    - `sc=nonexistent@2027-01-01T00:00Z` → default scenario, notice "Unknown site"
    - `sc=apollo-11@notadate` → default date
    - 5 scenarios → first 4 kept, notice
    - `dur=999` → clamped 30
    - `lit=foo` → default
    - missing `v` → treated as v1
    - empty string → defaults, no notice
    - `c:-95,10` → notice "Latitude out of range"
  - `store addScenario respects MAX_SCENARIOS`
  - `removeScenario never leaves zero scenarios`
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run.** Expect PASS. **Step 5: Commit** `feat(state): URL codec and store`.

---

## Phase D — Interface

### Task 15: Design tokens, shell layout, tooltips, stat strip

**Files:**
- Create: `components/shell/TopBar.tsx`, `LeftPanel.tsx`, `StatStrip.tsx`, `Notice.tsx`
- Create: `components/ui/Term.tsx` (wraps Astryx `InfoTip`), `components/ui/MissionClock.tsx`, `components/ui/SwipeDeck.tsx` (wraps Astryx `Carousel` if its docs show swipe with dots and accessible paging; otherwise a minimal scroll-snap container)
- Create: `lib/glossary.ts`, `components/settings/SettingsPanel.tsx`
- Modify: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`
- Test: `tests/unit/ui/term.test.tsx`, `tests/unit/ui/settings.test.tsx`

**Interfaces:**
- Produces:
  - `<Term id={GlossaryId}>label</Term>` renders the label with an accessible tooltip (`aria-describedby`, focusable, opens on hover, focus and tap).
  - `GLOSSARY: Record<GlossaryId, {term: string; text: string}>` covering at least: elevation, azimuth, horizon, terrain horizon, Earthset, Earthrise, sunset, DTE, libration, eclipse, solar interference, visible fraction, power proxy, mission-elapsed time (T+), verdict, battery reserve, flicker, DSN, landing ellipse, PSR, sub-solar latitude, vertical exaggeration.
  - `<SettingsPanel/>` edits every `Settings` field within the Global Constraints ranges.
  - Shell regions with stable test ids: `data-testid="top-bar" | "left-panel" | "cards" | "time-bar-slot"`.
  - `<StatStrip/>`, dismissible (localStorage key `lsp.statstrip.dismissed`, wrapped in try/catch). Exact copy: "On the Moon: the Sun peaks at ~1.5° at the pole (vs ~70° at mid-latitudes on Earth) · a day lasts ~29.5 Earth days · shadows are pitch-black with no air to scatter light."
  - Theme toggle: Astryx colour-mode switch (per `astryx docs use-a-theme`), persisted in localStorage with try/catch, default dark.
  - `<MissionClock ms={number} axis="met"|"cal" tz?: string />` renders `T+3 d 04 h` in mono (`T−0 d 02 h` before landing), or a calendar date when axis is `cal`. `formatMet(ms): string` is exported from `lib/format.ts`. **Every time display in the app goes through this component** (the signature).
- **Frame-first shell** (Astryx `Layout`):
  - `LayoutHeader` 56 px (TopBar)
  - `LayoutPanel` 280 px on the left (scenarios + picker; collapses to a `Drawer` below 1024 px)
  - `LayoutContent` fluid, capped at 1600 px, page padding 24–32
  - `LayoutFooter` pinned (time bar)
  - Budget the regions first, then fill them. Scenario rows in the left panel are `List`/`ListItem` (32–36 px rows), not cards.
  - Notices use `Banner`; the copy-link confirmation uses `Toast`.
  - SettingsPanel = `Drawer` + `FormLayout` with `NumberInput`, `SegmentedControl`, `Switch`, and `Field` labels from the glossary.
- Breakpoints: < 768, 768–1023, ≥ 1024 px.
- Tests for this task also assert: no `#` hex literal and no `px` literal in `components/**` or `app/**` (a grep test in `tests/unit/lint/no-literals.test.ts` that excludes `theme/`, and allows `px` only inside canvas drawing modules under `components/panorama`, `timeline`, `picker/projection`, `calendar`), and no uppercase-tracked or emoji strings in `lib/glossary.ts` / UI copy (a regex test).

- [ ] **Step 1: Failing tests.**
  - `Term shows tooltip on focus and has aria-describedby`
  - `every GlossaryId has non-empty text`
  - `SettingsPanel clamps durationDays input 0 → 1 and 99 → 30`
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run.** Expect PASS. Check `npm run build`.
- [ ] **Step 5: Contrast check.** Add `tests/unit/ui/contrast.test.ts`. It reads resolved token values for the Ridgeline theme in both modes via `resolveThemeTokens()`, then checks: text roles (primary, secondary, muted) vs page and card ≥ 4.5; Sun, Earth, Both ink and status marks vs card ≥ 3; off-white primary button text ≥ 4.5. Expect PASS; adjust values in `theme/ridgeline.theme.ts` until it passes.
- [ ] **Step 6: Commit** `feat(ui): tokens, shell, tooltips, settings, stat strip`.

### Task 16: Horizon panorama

**Files:**
- Create: `components/panorama/layout.ts`, `components/panorama/HorizonPanorama.tsx`
- Test: `tests/unit/panorama/layout.test.ts`

**Interfaces:**
- Consumes: `TimeSeries`, `HorizonProfile` (Tasks 10, 12).
- Produces:
  - `azToX(az: number, width: number, centerAz = 180): number` (wraps)
  - `elScale(domain: [number, number], height: number): (el: number) => number`
  - `sharedElDomain(items: Array<{horizon: HorizonProfile; series: TimeSeries}>): [number, number]` = [min − 0.5, max + 0.5] with span ≥ 3°
  - `exaggeration(width: number, height: number, domain: [number, number]): number` = (height/span)/(width/360), rounded to an integer ≥ 1
  - `splitAtWrap(points: Array<{az: number; el: number}>): Array<Array<{az: number; el: number}>>`
  - `<HorizonPanorama horizon series cursorIndex elDomain centerAz onScrubTime(deltaMs) />`: canvas plus an SVG overlay. Draws the filled terrain silhouette, the Sun path in the Sun token with daily ticks (hairline weight; tick labels in muted mono `T+n d`), the Earth path in the Earth token, discs at the cursor at true angular size (scaled by the same factors). **This is the card's moment (unslop):**
    - The terrain silhouette is filled in two graphite steps (near ridge lighter than far, from the raised and card surface tokens).
    - The Sun disc has a soft limb (radial falloff within the disc only; no glow outside it).
    - **Earth is drawn with its true phase** from `earthPhase()`: lit portion in the Earth token, unlit portion in the deepest surface with a hairline rim.
    - All colours come from `useTheme()`/`resolveThemeTokens()`, never literals.
    - The grid is a muted hairline every 1° of elevation, with mono labels.
    - Everything else on the card stays quiet so the panorama reads first.

    Panorama features:, compass labels N/E/S/W, and the label "vertical ×N". It is pannable horizontally on touch and wraps 360°. Dragging horizontally on empty sky scrubs time (1 px = 1 h at default zoom). It has `role="img"` and an `aria-label` summary (Sun and Earth az/el at the cursor). It honours `prefers-reduced-motion`.
- At the pole, the "N" label tooltip reads "At the pole, north = toward 0° longitude".

- [ ] **Step 1: Failing tests.**
  - `azToX wraps`: x(0) = x(360).
  - `splits path at wrap`: a path from az 350 to 10 splits into 2 segments, with no segment spanning more than 180° in x.
  - `sharedElDomain min span 3`
  - `exaggeration ≥ 1`
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** Use device-pixel-ratio-aware canvas and redraw on resize via ResizeObserver. **Step 4: Run.** Expect PASS.
- [ ] **Step 5: Commit** `feat(ui): horizon panorama`.

### Task 17: Scenario card: timeline, metrics, verdict, provenance

**Files:**
- Create: `components/timeline/bands.ts`, `components/timeline/Timeline.tsx`
- Create: `components/card/MetricsBar.tsx`, `VerdictChip.tsx`, `Provenance.tsx`, `SecondaryMetrics.tsx`, `ScenarioCard.tsx`
- Test: `tests/unit/timeline/bands.test.ts`, `tests/unit/card/card.test.tsx`

**Interfaces:**
- Consumes: Tasks 12–16.
- Produces:
  - `runs(state: Uint8Array): Array<{start: number; end: number; value: 0|1}>`
  - `<Timeline series metrics cursorIndex axis onSeek(index) />`: Sun/Earth/Both bands with icons, eclipse markers, hatched solar-interference spans, darkness and comms-gap brackets, T0 marker. Keyboard seekable.
  - `<ScenarioCard scenario result countdowns robust? onEdit onRemove />`: order per spec §10.2. Countdowns display "Sunset in 3 d 4 h" or "Sunrise in …". When null, "> 60 d", and when Earth is never in view the Earth countdown reads "Earth never in view".
  - `<VerdictChip verdict reason />`: Astryx `StatusDot` + icon + `Text` (✓ Good in toned green, ! Marginal in a muted grey dot, ✕ Poor in toned red). Not a `Badge` (Astryx rule). The reason shows in a `Tooltip`.
  - Card frame: Astryx `Card` (radius 12–16, padding 20–24, hairline, no shadow on dark). Secondary metrics use `MetadataList`. Actions use `IconButton`s with tooltips.
  - **Deltas vs scenario A** (unslop: a change says what it compares to): cards 2–4 show, under the Both / sunlit / longest-dark figures, a muted mono delta such as `−96 h vs A` or `+12 h vs A`. Equal values show `same as A`. The first card shows no delta.
  - **Both = primary ink:** in the timeline, the Both band is filled with the primary-text token (the brightest mark), the Sun band in amber, and the Earth band in blue. The Both-hours figure is the largest number on the card (28–32 px, weight 500, tabular).
  - Metric cells are label + figure + delta only, with no sparklines or icons (unslop).
  - `<ToolLinks lat lon />` (M16, in the card's secondary section): "Open in Quickmap", "Open in Moon Trek", "Check in JPL Horizons". These are the challenge's recommended tools. Each opens in a new tab with `rel="noopener noreferrer"`.
    - Before coding, the subagent opens each tool, finds its current shareable-URL format for centring on a lat/lon (Quickmap and Moon Trek), and records the format in a code comment with the date checked.
    - If no stable deep link exists, link to the tool's home page with the coordinates shown for copy.
    - For Horizons, link to the web app with a note "use Observer, center coord@301, site <lat, lon>".
    - Test: `toolLinks builds three https links containing the coordinates (or the home URL when no deep-link format is set)`.
  - `<Provenance ctx />`: copy patterns
    - "Horizon: LOLA site profile (mast 2 m) · Ephemeris: DE440"
    - "Horizon: LOLA grid, nearest point 1.2 km · …"
    - "Horizon: smooth sphere — terrain not modelled here · …"

- [ ] **Step 1: Failing tests.**
  - `runs merges contiguous`
  - `card renders verdict text and both hours`
  - `card shows 'Earth never in view' when earthH = 0`
  - `provenance shows grid distance with 1 decimal`
  - `chip has icon and text, not colour alone`
  - `card 2 shows "−96 h vs A" when its bothH is 96 lower than card 1`
  - `card 1 shows no delta`
  - `all times on the card render through MissionClock (T+ format)`
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run.** Expect PASS. **Step 5: Commit** `feat(ui): scenario card, timeline, metrics`.

### Task 18: Time bar and animation

**Files:**
- Create: `components/time/TimeBar.tsx`, `components/time/usePlayback.ts`
- Test: `tests/unit/time/playback.test.ts`

**Interfaces:**
- Consumes: store (Task 14).
- Produces:
  - `usePlayback()`: advances `cursorH` by `speedHps × dt` using requestAnimationFrame, stops at the mission end, and pauses when the document is hidden.
  - `<TimeBar/>`: built from Astryx `Toolbar`, play/pause `IconButton`, speed `SegmentedControl` (1 h/s, 6 h/s, 1 d/s), and a `Slider` scrubber labelled with `MissionClock` (axis `met`) or a calendar date in `displayTz` (axis `cal`). The keyboard shortcuts are listed in a `Tooltip` using Astryx `Kbd` keycaps (←, →, Shift, Space).
  - Keyboard (global, ignored when focus is in an input): ← → = ±1 h, Shift+← → = ±1 d, Space = play/pause.

- [ ] **Step 1: Failing tests** (fake timers):
  - `advances 6h per second at speed 6`
  - `stops at duration end`
  - `keyboard shift+right adds 24h`
  - `space toggles play`
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run.** Expect PASS. **Step 5: Commit** `feat(ui): time bar and playback`.

### Task 19: Compare view, share, default scenario, wiring

**Files:**
- Create: `scripts/pick-default-date.ts`, `tests/e2e/compare.spec.ts`
- Modify: `app/page.tsx`, `lib/state/defaults.ts`

**Interfaces:**
- Consumes: Tasks 13–18.
- Produces: the main page wiring. Each scenario → `engine.evaluate` (re-run on change, cancelling stale results by request id) → `ScenarioCard`.
  - Grid: 1 card = 1 column, 2 = 2 columns, 3–4 = 2 × 2.
  - Shared `sharedElDomain` across cards.
  - Shared cursor: with axis `met`, cursor = T+ hours for every card; with axis `cal`, cursor = absolute time and cards outside their window show a "before landing / after mission" overlay.
  - The Share button copies `location.href` and shows the toast "Link copied".
  - Error states (spec §14):
    - A failed data fetch shows an inline "Couldn't load data — Retry" in the affected card.
    - Without Web Worker support, a Notice: "This browser can't run the calculator (Web Workers unavailable)."
    - A date outside coverage disables the date input, with the message "Ephemeris covers 1969–2035".

- [ ] **Step 1: Pick the default.** `npx tsx scripts/pick-default-date.ts` runs `nextGoodDates` for `mons-mouton` from 2027-01-01 and prints the first Good t0. Hard-code it in `DEFAULT_SCENARIOS` as `[{ key: 'a', site: {kind: 'catalog', id: 'mons-mouton'}, t0Ms: <value> }]`. Record the date in a comment and in the README demo script.
- [ ] **Step 2: Failing e2e tests.**
  - `default view shows one card with verdict`
  - `add scenario +14d shows two cards`
  - `copy link → open in new page → identical card headers and metrics text`
  - `bad link shows notice`: `/?sc=nope@x` shows a Notice and one valid card
  - `recompute under 150ms`: measure `performance.now()` around evaluate in the page via an exposed test hook `window.__lspTiming`
- [ ] **Step 3: Run** `npm run e2e`. Expect FAIL. **Step 4: Implement.** **Step 5: Run.** Expect PASS.
- [ ] **Step 6: Commit and push** `feat(ui): compare view, sharing, default scenario`. Confirm the Vercel preview deploys.

### Task 20: Site picker, map, custom coordinates

**Files:**
- Create: `components/picker/SitePicker.tsx`, `CoordInput.tsx`, `MapPicker.tsx`, `projection.ts`
- Test: `tests/unit/picker/coord.test.ts`, `tests/unit/picker/projection.test.ts`, `tests/e2e/picker.spec.ts`

**Interfaces:**
- Consumes: `loadSites`, `psToXY`, store.
- Produces:
  - `parseCoord(latText, lonText): {ok: true; lat; lon} | {ok: false; error: string}` (decimal degrees, south/west negative, lon 0–360 accepted, normalised via `normaliseLon`).
  - `<SitePicker scenarioKey/>`: Astryx `TabList` (Search / Map). The Search tab uses `Typeahead` over the catalog plus a grouped `List` (group headings in sentence case, not uppercase), and shows "Last checked <checkedUtc>" as muted mono text. The landing date and time field is `DateTimeInput` (controlled, UTC). Each historical site has a "Use actual landing date" button that sets t0 = `actual_landing_utc`.
  - `<MapPicker scenarioKey mode="south"|"global"/>`: basemap image with pins for catalog sites and the current scenarios (distinct shapes per scenario index plus a colour). Click to set a custom site. Shows a scale bar. South view uses the `ps` projection matching the basemap orientation; global uses equirect.
  - The badge on custom points comes from `HorizonSource` (grid distance / sphere).

- [ ] **Step 1: Failing tests.**
  - `parseCoord accepts -85.3, 31.2`
  - `rejects lat -91 with message`
  - `accepts lon 350 → -10`
  - `projection south: pixel ↔ lat/lon roundtrip within 0.01°`
  - e2e `search 'apollo 11' sets the card title`
  - e2e `click on south map sets custom coords card with grid badge`
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run.** Expect PASS. **Step 5: Commit** `feat(ui): site picker, map, custom coordinates`.

### Task 21: Mobile layout, PWA, accessibility, OG, production deploy (completes Tier 1)

**Files:**
- Create: `public/manifest.webmanifest`, `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`, `public/og.png`, `components/pwa/RegisterSW.tsx`, `tests/e2e/mobile.spec.ts`
- Modify: `app/layout.tsx`, `app/page.tsx`, shell components (responsive)

**Interfaces:**
- Produces:
  - Mobile (< 768 px): `SwipeDeck` with one card per screen and dots. Scenario editing in a `BottomSheet`. Sticky TimeBar. Card order: metrics, panorama, timeline.
  - Service worker registered only in production; on update, a "New version available — reload" Notice.
  - Offline banner ("Offline — showing cached data") driven by `navigator.onLine` plus online/offline events.
  - OG/Twitter meta: title "Ridgeline — Lunar landing site & date planner", description "Compare lunar landing sites and dates: sunlight for power and Earth for comms, against the real terrain horizon."
  - Icons: a simple horizon-line glyph, no planets or starfield.

- [ ] **Step 1: Failing e2e** (viewport 375 × 812):
  - `swipe moves to second card`
  - `no horizontal page scroll`
  - `touch targets ≥ 44px` (check all buttons' bounding boxes)
  - `manifest linked and sw registered in production build` (`npx serve out` in the Playwright webServer config for this spec)
  - `offline reload shows cached app shell`
- [ ] **Step 2: Run.** Expect FAIL. **Step 3: Implement.** **Step 4: Run.** Expect PASS.
- [ ] **Step 4b: Design QA (main session dispatches a fresh Sonnet reviewer, read-only first).** Check the live preview at 375 px and 1440 px in both themes:
  1. **Astryx review:** run the prompt from `npx astryx docs is-my-code-good` ("Ask an agent") on the main page and About page. Every category must be `good`; fix each `needs work`.
  2. **Unslop audit:** check against the unslop signs list (`~/.claude/skills/unslop/references/signs.md`), then the unslop checklist. Use **polish mode only:** fix what the audit finds and keep the direction in spec §6.1. Do not redesign.
  3. **Template check:** swap "Ridgeline" for another product's name. If the screen would still fit, strengthen the copy, the panorama moment, or the mission-clock signature.
  4. Record the findings and fixes in `docs/design-qa.md`, then re-run the e2e tests.
- [ ] **Step 5a: Bundle budget.** After `npm run build`, sum the gzipped size of the JS loaded by `/` (from `out/_next/static`, per the build output). Expect ≤ 250 KB. If over, lazy-load the map and calendar.
- [ ] **Step 5: Lighthouse.** Run `npx lighthouse <production URL> --preset=desktop` and a mobile run. Expect Performance ≥ 85, Accessibility ≥ 95, PWA installable. Fix and re-run until met. Record the scores in the README.
- [ ] **Step 5b:** Run `npx astryx doctor --built out`. Expect PASS; fix every reported issue.
- [ ] **Step 6: Commit, push to `main`, verify production** via the Vercel connector (`list_deployments`, state READY) and load the URL.
- [ ] **Step 7: CHECKPOINT (main session).** Tier 1 complete. Tag `submission-candidate` with `git tag` + push. Ask Jack to record the demo video now, using the README demo script (Task 33 drafts the script early if needed).

### Task 22: About page

**Files:**
- Create: `app/about/page.tsx`, `components/about/ValidationTable.tsx`
- Test: `tests/unit/about/validation.test.tsx`

**Interfaces:**
- Consumes: `validation.json` (Task 9), `ephemeris/index.json`, `sites.json`.
- Produces sections:
  - What this is
  - Method (frames, horizons, discs, eclipses, thresholds, with the exact default values)
  - **NASA data used** (event requirement). A table with columns *Dataset · Source link · What it does in Ridgeline*:
    - LOLA polar and global DEMs (NASA GSFC PGDA): terrain horizons and basemaps
    - NAIF SPICE kernels (JPL; DE440, lunar orientation): Sun and Earth positions
    - JPL Horizons: independent validation of positions
    - PGDA Lunar Polar Illumination maps, as shown in LROC Quickmap: illumination cross-check
    - LROC (and Quickmap): landing-site coordinates and context
    - Moon Trek: linked for 3D context
    - DSN station locations: ground-station layer
    - PSR dataset, if Task 28 is done: shadow overlay
  - Partner credits: ISRO (Chandrayaan-3), JAXA (SLIM), CNSA (Chang'e sites), and CSA (link to the CSA Moon Exploration portal, noting Canada's Artemis role), as listed in the challenge resources.
  - Validation table (pass ✓ / fail ✕ / info ⓘ with values and tolerances)
  - Mission replays (links: `/?sc=chandrayaan-3@<actual>`, `slim@…`, `im-2@…`)
  - Limitations (DEM resolution, flat-horizon-across-disc approximation, no thermal model, Earth atmosphere refraction ignored during eclipses, UTC rather than LTC)
  - AI-use disclosure (text per Task 0 answer)

- [ ] **Step 1: Failing test.** `renders a row per validation entry with pass/fail icon`. **Step 2–4:** implement, run, pass. **Step 5: Commit** `feat(ui): about page with validation and replays`.

---

## Phase E — Tier 2 (in order)

### Task 23: Find next good date (S2), landing calendar (S1), season annotations (S10)

**Files:**
- Create: `components/calendar/LandingCalendar.tsx`
- Modify: `components/card/ScenarioCard.tsx` (add "Find next good date" action)
- Test: `tests/unit/calendar/calendar.test.tsx`, `tests/e2e/nextgood.spec.ts`

**Interfaces:**
- Consumes: `EngineApi.calendar`, `EngineApi.nextGood`, `subsolarLatitude`.
- Produces:
  - Calendar heatmap: 365 cells coloured with the 5-step luminance ramp (deepest surface → primary ink) by `bothH`, with a 5-step legend in mono and the verdict in a `Tooltip` on hover/focus. It is the second unslop moment, so draw it with care: 4 px gaps, radius 2–4, muted month labels in sentence case. If nothing in range is Good, show an Astryx `EmptyState` ("No Good landing in the next 365 days at this site"). Click sets t0 to that day 00:00 UTC (the landing hour keeps the current time of day).
  - Overlay line of sub-solar latitude, with "lunar summer/winter" labels for the site's hemisphere.
  - Footnote copy: "Good windows drift ~2.3 days earlier each month and the pattern repeats about every 346.6 days (Earth's 27.2-day wobble vs the Sun's 29.5-day circuit)."
  - "Find next good date" lists up to 3 results, each with "Add as scenario".

- [ ] Steps:
  1. Failing tests: `calendar has 365 cells`, `click sets t0`, e2e `next good adds scenario with Good verdict`.
  2. Run → FAIL.
  3. Implement.
  4. Run → PASS. Calendar compute ≤ 1.5 s (assert via `__lspTiming`).
  5. Commit `feat: landing calendar, next good date, season drift`.

### Task 24: Robustness band (S8)

**Files:**
- Modify: `components/card/MetricsBar.tsx`
- Test: `tests/unit/card/robust.test.tsx`

- [ ] Steps:
  1. Failing test: `renders nominal with range in smaller type "212 h (176–230)"`, and the range shows the number of grid points used.
  2. Run → FAIL.
  3. Implement via `EngineApi.robustness`, computed after the nominal result (no blocking).
  4. Run → PASS.
  5. Commit `feat: robustness band`.

### Task 25: Ground-station layer (S7)

**Files:**
- Modify: `lib/engine/sample.ts` (already accepts `dsn`), `components/timeline/Timeline.tsx`, settings toggle
- Test: `tests/unit/timeline/dsn.test.tsx`

- [ ] Steps:
  1. Failing tests: `dsn disabled leaves earthIn unchanged`, `dsn enabled ANDs station coverage`, `timeline shows station initials G/M/C over covered spans`.
  2. Run → FAIL.
  3. Implement.
  4. Run → PASS.
  5. Commit `feat: DSN ground-station layer`.

### Task 26: Mast-height selector (S9)

**Files:**
- Modify: `components/settings/SettingsPanel.tsx`, `lib/data/horizons.ts` usage in the worker
- Test: `tests/unit/settings/mast.test.tsx`

- [ ] Steps:
  1. Failing tests: `mast selector disabled with tooltip for non-catalog sites`, `changing mast changes provenance text and re-evaluates`.
  2. Run → FAIL.
  3. Implement.
  4. Run → PASS.
  5. Commit `feat: mast height options`.

### Task 27: Live pin drag (S3) and nearby heatmap (S4)

**Files:**
- Modify: `components/picker/MapPicker.tsx`
- Test: `tests/e2e/drag.spec.ts`, `tests/unit/picker/heatmap.test.ts`

- [ ] Steps:
  1. Failing tests: e2e `dragging pin updates card metrics within one frame-throttled cycle`, unit `heatmap returns only points within radius`.
  2. Run → FAIL.
  3. Implement. Drag throttled to rAF; heatmap via `EngineApi.heatmap`, radius 20 km, the same luminance ramp as the calendar; click a point → `addScenario`.
  4. Run → PASS.
  5. Commit `feat: live pin drag and nearby heatmap`.

### Task 28: PSR overlay (S5) and CSV export (S6)

**Files:**
- Create: `pipeline/lsp/psr.py`, `public/data/v1/overlays/psr.json`, `lib/csv.ts`
- Modify: `MapPicker.tsx`, `ScenarioCard.tsx`
- Test: `pipeline/tests/test_psr.py`, `tests/unit/csv.test.ts`

- [ ] Steps:
  1. Download list for a published PSR dataset (PGDA or LROC) → GATE → download.
  2. Failing tests: `psr polygons simplified, ≤ 1 MB, lat ≤ -80`, `csv header and row count = series.n + summary`.
  3. Implement. CSV columns: `utc,sun_az,sun_el,sun_visible_pct,eclipse_pct,earth_az,earth_el,earth_in_view,solar_interference,power_proxy,lit,both`, plus a final `# summary,...` row with the metrics.
  4. Run → PASS.
  5. Commit `feat: PSR overlay and CSV export`.

---

## Phase F — Tier 3 (only if time)

### Task 29: Fixed panel azimuth (X3) and tip-over resilience (X4)
- Settings `panel.mode = 'fixed'` uses factor max(0, cos el · cos(az − panelAz)), already in Task 12.
- Tip-over: sweep tilt azimuth 0–345° in 15° steps at the given tilt (default 10°). Tilt the panel normal and antenna boresight; report worst-case power and comms hours.
- Tests: `tilt 0 equals nominal`, `worst case ≤ nominal`.
- Commit `feat: panel azimuth and tip-over resilience`.

### Task 30: Approach glare check (X5)
- Input: approach heading. Warn if the Sun at T0 is within 20° of the heading or shadows dominate.
- Tests: `sun at heading+10 warns`, `sun at heading+90 does not`.
- Commit.

### Task 31: 3D terrain view (X1)
- Allowed deps: `three @react-three/fiber @react-three/drei`.
- Local 20 × 20 km mesh from grid tiles' hDem (coarse) with Sun/Earth direction rays. Lazy-loaded route segment so the main bundle stays ≤ 250 KB.
- Test: `3D chunk not in main bundle` (inspect the build manifest).
- Commit.

### Task 32: PNG summary export (X2)
- Allowed dep: `html-to-image`. Exports the comparison grid plus metrics to PNG.
- Test: `export button produces a blob of type image/png`.
- Commit.

---

## Phase G — Submission (always)

### Task 33: Submission materials and final verification (main session + subagent)

**Files:**
- Modify: `README.md`, `DATA_SOURCES.md`
- Create: `docs/demo-script.md`, `docs/submission-text.md`

- [ ] **Step 0 (14 Nov evening, main session with Jack):** Jack confirms they are registered on the Space Apps site for the Singapore local event, has joined "Lunar Landing Site Navigator", and has a (solo) team. He opens the Project Submission section (available from 14 Nov) and saves a draft with the title and live URL. Claude drafts the text in `docs/submission-text.md`; Jack pastes and submits (Claude never submits).
- [ ] **Step 1: README.** Include:
  - problem, live URL, GIF/screenshots, features by tier
  - how to run (web + pipeline), data and method summary, validation results, Lighthouse scores
  - a **"NASA data used"** table (same as the About page: dataset, link, how it supports the solution)
  - credits, licence, and a "Judging criteria map" table: Impact, Creativity, Validity, Relevance, Presentation (the event's five criteria, each scored 1–5)
  - the AI-use disclosure
- [ ] **Step 2: Demo (event rule: a 30-second video OR a 7-slide presentation).**
  - `docs/demo-script.md`: shot list and narration for a video **no longer than 30 seconds** (spec §3 story), using the real default date and links. Narration must name NASA LOLA and JPL ephemeris data on screen or in voice.
  - **Backup:** `docs/demo-slides.md` with a 7-slide outline (problem · solution · live screenshot · NASA data used · validation · impact · link). Jack can build it quickly if the video fails.
- [ ] **Step 3: Submission text.** `docs/submission-text.md` with four headed sections that map 1:1 to the submission form:
  1. **Project Summary:** solution, problem, impact.
  2. **Project Demo:** video link, or the slides as backup.
  3. **Final Project Link:** the public Vercel URL, plus the GitHub repo.
  4. **Project Details:** approach, tools, technologies, and the NASA datasets used, each with a source link and how it supports the solution.

  Keep each section within the form's limits (check the limits when the form opens).
- [ ] **Step 4: Final verification.**
  - `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`: all pass.
  - `pytest pipeline/tests`: all pass, including `needs_data` locally.
  - Production URL loads, the default scenario shows, a share link round-trips, and mobile swipe works.
  - Every site in `sites.json` has `source_url`.
  - `DATA_SOURCES.md` lists every file with SHA-256.
  - **Public access check:** fetch the production URL and the GitHub repo URL with no auth (`curl -s -o NUL -w "%{http_code}"`), expecting 200 for both, and open the production URL in a logged-out/private window. If Vercel Deployment Protection is on for production, turn it off for the production domain.
- [ ] **Step 5:** Tag `submission` and push. Confirm the production deployment is READY. Tell Jack the four submission sections are ready to paste. **Jack submits by 21:00 SGT.**
