# fix-f1: real LOLA terrain patches only; 2D skyline default

Changes
- ScenarioCard: viewMode always starts "2d" (toggle kept). Added optional scenario.siteId (passed from ScenarioSlot) so the 3D view can load a catalogue patch.
- pipeline/lsp/terrain_patches.py (+ python -m lsp.terrain_patches): 29 patches 101x101 Int16 LE, 200 m, +-10 km, to public/data/v1/terrain/sites/{id}.bin + index.json. Sample positions via raycast._destination then ps.to_xy (includes PS scale distortion; slightly more exact than the TS rotation). Bilinear, no smoothing; NaN raises.
- lib/data/terrain.ts rewritten: loadSitePatch / loadSitePatchIndex / buildCoarsePolarPatch (2 km grid, null outside grid/nodata). Horizon blending and microCrater deleted.
- LunarTerrain3D: loads real patch; caption states source/resolution; muted line about local-only terrain vs 200 km horizon; EmptyState for custom points outside the polar grid.
- about/content.ts (2 role lines) and DATA_SOURCES.md terrain Derived line updated.
- south-pole-dem.bin kept (psr.py and custom polar points use it).

Sizes: 29 x 20,402 B = 591,658 B patches (+ index.json); dir 594 KB.
Sources: 11 polar sites LOLA polar 40 m; 18 LOLA global 64 ppd (474 m), incl. im-1 (-80.13): its patch reaches beyond the +-303 km polar-trusted box of the 120 m grid, so it uses global rather than being mislabelled polar. Patch centre equals hDemM for every site (<= 10 m, mostly exact).

Tests: pytest test_terrain_patches 8 passed (incl. needs_data centre test); full pytest not-needs_data: 61 passed, 4 failed (test_psr.py, another agent's rasterio/psr work). vitest: terrain3d 13 passed; full run 295/296, the one failure (time/playback slider label) is intermittent and passes alone. typecheck, lint clean; clean build OK.
