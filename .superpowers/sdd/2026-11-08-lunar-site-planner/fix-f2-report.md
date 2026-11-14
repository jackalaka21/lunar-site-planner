# fix-f2: PSR overlay from PGDA zero-sunlight regions

Method: pipeline/lsp/psr.py reads AVGVISIB_75S_120M_201608.TIF (PGDA product 69, Mazarico 2011) with rasterio, scales int16 by 4e-5, masks valid pixels with visible fraction <= 1e-6 (exactly 0) south of 80 S (lat from pyproj on the raster's own CRS), polygonises with rasterio.features.shapes (connectivity 8), drops regions < 1.0 km2 (and holes < 1 km2), Douglas-Peucker at 120 m in PS metres, reprojects to lon/lat (4 decimals). No DEM, no hand-typed craters. Areas use shoelace corrected by the PS scale factor.
Output: 1311 polygons, 17,849 km2 total, 624 KB (min area 0.1 km2 gave 5778 polygons / 19,195 km2 / 1.7 MB, over budget).
Checks: Shackleton, Haworth, Shoemaker, Faustini, Cabeus points all have raw value 0; largest PSR ~1084 km2 near Shoemaker, then Haworth (~1025), Faustini (~667), Sverdrup (~555).
Caveat: total is above commonly cited ~13,000 km2 south of 80 S (different threshold/resolution/zero definition); reported as measured.
Tests: pytest 81 passed; vitest 296 passed; lint clean; typecheck clean.
