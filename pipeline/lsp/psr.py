"""South-polar Permanently Shadowed Regions (PSR) overlay -> public/data/v1/overlays/psr.json.

Derived directly from the NASA/GSFC PGDA LOLA south-polar *average illumination* map
(https://pgda.gsfc.nasa.gov/products/69, Mazarico et al. 2011; product AVGVISIB_75S_120M_201608.TIF:
int16, scale 4e-5, polar stereographic on the 1737.4 km sphere, 120 m/pixel). A PSR is a connected
region whose stored average solar visibility is 0 (below 2e-5 after the product's 4e-5 quantisation),
i.e. it receives no direct sunlight in the PGDA illumination model, which is averaged over hourly
steps spanning ~18.6 years (the full lunar nutation cycle). Zero-visibility pixels south of 80 deg S are polygonised
(rasterio.features.shapes, 8-connectivity), small regions dropped, rings simplified with
Douglas-Peucker in polar-stereographic metres, and vertices reprojected to lat/lon with pyproj
using the raster's own CRS. No DEM, crater list or other hand-entered data is used.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import rasterio
import rasterio.transform
from pyproj import CRS, Transformer
from rasterio.features import shapes

from .paths import DATA_DIR, REPO_ROOT

RASTER_PATH = DATA_DIR / "raw" / "illum" / "AVGVISIB_75S_120M_201608.TIF"
OUT_PATH = REPO_ROOT / "public" / "data" / "v1" / "overlays" / "psr.json"
SOURCE_URL = "https://pgda.gsfc.nasa.gov/products/69"
SOURCE_CITATION = (
    "NASA/GSFC Planetary Geodesy Data Archive (PGDA) LOLA South Pole average illumination map, "
    "AVGVISIB_75S_120M_201608 (Mazarico et al., 2011, Icarus 211, 1066-1081)"
)
MAX_LAT_DEG = -80.0  # keep pixels south of this latitude
ZERO_VISIBILITY_MAX = 1e-6  # visible fraction after scaling; the product's zero is exactly 0
# Trade-off: ~10% of the zero-sunlight area is in ~28,000 small patches < 1 km2; they are omitted
# (reported as unfilteredAreaKm2 vs filteredAreaKm2) to keep psr.json under 1 MB.
MIN_AREA_KM2 = 1.0
SIMPLIFY_M = 120.0  # Douglas-Peucker tolerance in PS metres (one pixel)
COORD_DECIMALS = 4
THRESHOLD_TEXT = (
    f"stored average visible-sun value 0 (below 2e-5 after 4e-5 quantisation; test <= {ZERO_VISIBILITY_MAX:g}) "
    f"south of {abs(MAX_LAT_DEG):g} deg S"
)
R_M = 1737400.0


def _dp_open(pts: np.ndarray, tol: float) -> np.ndarray:
    """Iterative Douglas-Peucker on an open polyline (N,2); returns kept indices."""
    n = len(pts)
    keep = np.zeros(n, dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        seg = pts[b] - pts[a]
        d = pts[a + 1 : b] - pts[a]
        length = float(np.hypot(*seg))
        if length == 0.0:
            dist = np.hypot(d[:, 0], d[:, 1])
        else:
            dist = np.abs(seg[0] * d[:, 1] - seg[1] * d[:, 0]) / length
        i = int(np.argmax(dist))
        if dist[i] > tol:
            k = a + 1 + i
            keep[k] = True
            stack.append((a, k))
            stack.append((k, b))
    return np.flatnonzero(keep)


def simplify_ring(ring: np.ndarray, tol: float) -> np.ndarray:
    """Douglas-Peucker for a closed ring (first == last). Returns a closed ring (possibly < 4 pts)."""
    pts = ring[:-1]
    if len(pts) <= 3:
        return ring
    far = int(np.argmax(np.hypot(*(pts - pts[0]).T)))
    first = pts[: far + 1]
    second = np.vstack([pts[far:], pts[:1]])
    idx1 = _dp_open(first, tol)
    idx2 = _dp_open(second, tol)
    out = np.vstack([first[idx1], second[idx2][1:-1]])
    return np.vstack([out, out[:1]])


def _shoelace(ring: np.ndarray) -> float:
    x, y = ring[:, 0], ring[:, 1]
    return 0.5 * float(np.dot(x[:-1], y[1:]) - np.dot(x[1:], y[:-1]))


def _k_scale(x: float, y: float) -> float:
    """Polar-stereographic (k=1 at pole) linear scale factor at (x, y)."""
    rho = float(np.hypot(x, y))
    return 1.0 + (rho / (2.0 * R_M)) ** 2


def true_area_km2(ring_xy: np.ndarray) -> float:
    """Ground area of a PS-metre ring (shoelace, corrected by the local scale factor squared)."""
    a = abs(_shoelace(ring_xy))
    cx, cy = ring_xy[:-1].mean(axis=0)
    return a / _k_scale(cx, cy) ** 2 / 1e6


def zero_mask(raw: np.ndarray, scale: float, nodata, transform, transformer: Transformer) -> np.ndarray:
    """Boolean mask: valid pixels south of MAX_LAT_DEG whose visible fraction is zero."""
    valid = raw != nodata if nodata is not None else np.ones(raw.shape, dtype=bool)
    mask = valid & (raw.astype(np.float64) * scale <= ZERO_VISIBILITY_MAX)
    rows, cols = np.nonzero(mask)
    if rows.size == 0:
        return mask
    xs, ys = rasterio.transform.xy(transform, rows, cols, offset="center")
    _, lat = transformer.transform(np.asarray(xs), np.asarray(ys))
    keep = np.asarray(lat) <= MAX_LAT_DEG
    mask[rows[~keep], cols[~keep]] = False
    return mask


def mask_area_km2(mask: np.ndarray, transform) -> float:
    """True ground area of all True pixels (per-pixel PS scale-factor correction)."""
    rows, cols = np.nonzero(mask)
    xs, ys = rasterio.transform.xy(transform, rows, cols, offset="center")
    rho = np.hypot(np.asarray(xs), np.asarray(ys))
    k = 1.0 + (rho / (2.0 * R_M)) ** 2
    return float(np.sum(abs(transform.a * transform.e) / k**2) / 1e6)


def polygonise(
    mask: np.ndarray,
    transform,
    transformer: Transformer,
    min_area_km2: float = MIN_AREA_KM2,
    simplify_m: float = SIMPLIFY_M,
) -> list[dict]:
    """Polygonise a boolean mask into GeoJSON Polygon features (lon/lat), largest first."""
    feats: list[dict] = []
    src = mask.astype(np.uint8)
    for geom, val in shapes(src, mask=mask, transform=transform, connectivity=8):
        if val != 1:
            continue
        rings_xy = [np.asarray(r, dtype=np.float64) for r in geom["coordinates"]]
        area = true_area_km2(rings_xy[0]) - sum(true_area_km2(h) for h in rings_xy[1:])
        if area < min_area_km2:
            continue
        out_rings = []
        for i, r in enumerate(rings_xy):
            if i > 0 and true_area_km2(r) < min_area_km2:
                continue  # drop tiny holes (sunlit specks inside a PSR)
            s = simplify_ring(r, simplify_m)
            if len(s) < 4:
                if i == 0:
                    break
                continue
            lon, lat = transformer.transform(s[:, 0], s[:, 1])
            ll = [[round(float(a), COORD_DECIMALS), round(float(b), COORD_DECIMALS)] for a, b in zip(lon, lat)]
            ll[-1] = ll[0]
            out_rings.append(ll)
        if not out_rings:
            continue
        feats.append(
            {
                "type": "Feature",
                "properties": {"areaKm2": round(area, 3)},
                "geometry": {"type": "Polygon", "coordinates": out_rings},
            }
        )
    feats.sort(key=lambda f: -f["properties"]["areaKm2"])
    return feats


def make_transformer(crs) -> Transformer:
    """Raster CRS -> its own geographic CRS (lon, lat degrees)."""
    c = CRS.from_wkt(crs.to_wkt())
    return Transformer.from_crs(c, c.geodetic_crs, always_xy=True)


def build(
    raster_path: Path = RASTER_PATH,
    out_path: Path = OUT_PATH,
    min_area_km2: float = MIN_AREA_KM2,
    simplify_m: float = SIMPLIFY_M,
) -> dict:
    with rasterio.open(raster_path) as d:
        scale = d.scales[0] if d.scales and d.scales[0] else 1.0
        raw = d.read(1)
        transformer = make_transformer(d.crs)
        mask = zero_mask(raw, scale, d.nodata, d.transform, transformer)
        feats = polygonise(mask, d.transform, transformer, min_area_km2, simplify_m)
        unfiltered = mask_area_km2(mask, d.transform)
        pixel_km2 = abs(d.transform.a * d.transform.e) / 1e6
    doc = {
        "type": "FeatureCollection",
        "metadata": {
            "source_url": SOURCE_URL,
            "citation": SOURCE_CITATION,
            "method": "polygonised zero-average-sunlight regions of the PGDA average-illumination map",
            "sourceRaster": Path(raster_path).name,
            "threshold": THRESHOLD_TEXT,
            "averagingPeriod": "hourly over ~18.6 yr (PGDA)",
            "minAreaKm2": min_area_km2,
            "simplifyM": simplify_m,
            "featureCount": len(feats),
            "filteredAreaKm2": round(sum(f["properties"]["areaKm2"] for f in feats), 1),
            "unfilteredAreaKm2": round(unfiltered, 1),
            "pixelAreaKm2": round(pixel_km2, 6),
            "generatedUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "features": feats,
    }
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(doc, separators=(",", ":")) + "\n", encoding="utf-8")
    return doc


if __name__ == "__main__":
    result = build()
    m = result["metadata"]
    print(f"wrote {OUT_PATH}: {m['featureCount']} PSR polygons, {m['filteredAreaKm2']} km2 (unfiltered {m['unfilteredAreaKm2']}), {OUT_PATH.stat().st_size} bytes")
