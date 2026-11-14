"""South-polar Permanently Shadowed Region (PSR) overlay polygons -> public/data/v1/overlays/psr.json.

Combines real south-polar LOLA elevation data (public/data/v1/terrain/south-pole-dem.bin, 191x191
Int16 grid at 2 km spacing on the 1737.4 km reference sphere) with major south-polar PSR crater
locations from the NASA/GSFC PGDA LOLA South Polar PSR catalogue (Mazarico et al., 2011,
https://pgda.gsfc.nasa.gov/products/69).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from . import ps
from .paths import REPO_ROOT

DEM_PATH = REPO_ROOT / "public" / "data" / "v1" / "terrain" / "south-pole-dem.bin"
DEM_INDEX_PATH = REPO_ROOT / "public" / "data" / "v1" / "terrain" / "index.json"
OUT_PATH = REPO_ROOT / "public" / "data" / "v1" / "overlays" / "psr.json"
SOURCE_URL = "https://pgda.gsfc.nasa.gov/products/69"
SOURCE_CITATION = (
    "NASA/GSFC Planetary Geodesy Data Archive (PGDA) LOLA South Polar Permanently Shadowed "
    "Regions (Mazarico et al., 2011) and LOLA LDEM_80S_40MPP_ADJ elevation contours"
)

# Major south-polar PSR craters (IAU / NASA GSFC PGDA coordinates and effective PSR radii in km).
KNOWN_PSR_CRATERS = (
    {"id": "shackleton", "name": "Shackleton", "lat": -89.9, "lon": 129.8, "radiusKm": 10.5},
    {"id": "shoemaker", "name": "Shoemaker", "lat": -88.1, "lon": 44.9, "radiusKm": 25.5},
    {"id": "faustini", "name": "Faustini", "lat": -87.3, "lon": 77.0, "radiusKm": 19.5},
    {"id": "haworth", "name": "Haworth", "lat": -87.45, "lon": -4.0, "radiusKm": 24.5},
    {"id": "de-gerlache", "name": "de Gerlache", "lat": -88.5, "lon": -87.1, "radiusKm": 16.0},
    {"id": "sverdrup", "name": "Sverdrup", "lat": -88.5, "lon": -152.0, "radiusKm": 16.5},
    {"id": "slater", "name": "Slater", "lat": -88.1, "lon": 111.3, "radiusKm": 12.5},
    {"id": "wiechert-j", "name": "Wiechert J", "lat": -85.6, "lon": -177.0, "radiusKm": 17.0},
    {"id": "nobile", "name": "Nobile", "lat": -85.2, "lon": 53.5, "radiusKm": 32.0},
    {"id": "cabeus", "name": "Cabeus", "lat": -84.9, "lon": -35.5, "radiusKm": 34.0},
    {"id": "amundsen-psr", "name": "Amundsen Floor PSR", "lat": -84.5, "lon": 82.8, "radiusKm": 26.0},
)


def _load_polar_dem(dem_path: Path = DEM_PATH, index_path: Path = DEM_INDEX_PATH):
    meta = json.loads(index_path.read_text(encoding="utf-8"))
    side = int(meta["side"])
    half_count = int(meta["halfCount"])
    spacing_m = float(meta["spacingM"])
    nodata = int(meta.get("nodata", -32768))
    raw = np.frombuffer(dem_path.read_bytes(), dtype="<i2").reshape((side, side))
    x0 = -half_count * spacing_m
    return raw, x0, spacing_m, nodata


def _sample_dem(raw: np.ndarray, x0: float, spacing_m: float, nodata: int, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    side = raw.shape[0]
    fx = np.clip((x - x0) / spacing_m, 0.0, side - 1.001)
    fy = np.clip((y - x0) / spacing_m, 0.0, side - 1.001)
    ix = np.floor(fx).astype(np.int64)
    iy = np.floor(fy).astype(np.int64)
    tx = fx - ix
    ty = fy - iy
    v00 = raw[iy, ix].astype(np.float64)
    v10 = raw[iy, ix + 1].astype(np.float64)
    v01 = raw[iy + 1, ix].astype(np.int64).astype(np.float64)
    v11 = raw[iy + 1, ix + 1].astype(np.float64)
    for v in (v00, v10, v01, v11):
        v[v == nodata] = np.nan
    return (
        v00 * (1.0 - tx) * (1.0 - ty)
        + v10 * tx * (1.0 - ty)
        + v01 * (1.0 - tx) * ty
        + v11 * tx * ty
    )


def _trace_crater_ring(
    raw: np.ndarray,
    x0: float,
    spacing_m: float,
    nodata: int,
    lat: float,
    lon: float,
    radius_km: float,
    n_vertices: int = 24,
) -> tuple[list[list[float]], float, float]:
    """Trace a simplified PSR depression contour around (lat, lon) using the LOLA polar DEM."""
    cx, cy = ps.to_xy(lat, lon)
    r_nom_m = radius_km * 1000.0

    # Sample local basin floor and rim from the DEM to modulate the PSR boundary realistically.
    rad_steps = np.linspace(0.45, 1.25, 17)
    angles = np.linspace(0.0, 2.0 * np.pi, n_vertices, endpoint=False)
    cos_a = np.cos(angles)[:, None]
    sin_a = np.sin(angles)[:, None]
    r_grid = r_nom_m * rad_steps[None, :]
    px = cx + r_grid * cos_a
    py = cy + r_grid * sin_a
    elev = _sample_dem(raw, x0, spacing_m, nodata, px, py)

    center_h = float(_sample_dem(raw, x0, spacing_m, nodata, np.array([cx]), np.array([cy]))[0])
    finite_all = elev[np.isfinite(elev)]
    if finite_all.size > 0:
        floor_m = float(np.nanmin(np.append(finite_all, center_h if np.isfinite(center_h) else [])))
        rim_m = float(np.nanmax(finite_all))
        threshold_m = floor_m + 0.55 * max(200.0, rim_m - floor_m)
    else:
        floor_m = -2500.0
        rim_m = -500.0
        threshold_m = -1400.0

    radii_m = np.full(n_vertices, r_nom_m, dtype=np.float64)
    for k in range(n_vertices):
        profile = elev[k]
        if np.all(np.isfinite(profile)):
            # Find where the radial profile crosses the shadow wall threshold.
            above = np.where(profile >= threshold_m)[0]
            if above.size > 0:
                idx = int(above[0])
                radii_m[k] = r_nom_m * float(rad_steps[idx])
            else:
                radii_m[k] = r_nom_m * 0.95

    # Circular 3-point smoothing so simplified polygon rings look clean on the polar map.
    radii_smooth = (np.roll(radii_m, 1) + 2.0 * radii_m + np.roll(radii_m, -1)) / 4.0

    ring: list[list[float]] = []
    for k in range(n_vertices):
        vx = cx + radii_smooth[k] * np.cos(angles[k])
        vy = cy + radii_smooth[k] * np.sin(angles[k])
        vlat, vlon = ps.to_latlon(vx, vy)
        vlat_clamped = min(-80.0, round(float(vlat), 4))
        vlon_round = round(float(vlon), 4)
        ring.append([vlat_clamped, vlon_round])
    ring.append(list(ring[0]))
    return ring, round(floor_m, 1), round(rim_m, 1)


def build(out_path: Path = OUT_PATH, dem_path: Path = DEM_PATH, index_path: Path = DEM_INDEX_PATH) -> dict:
    raw, x0, spacing_m, nodata = _load_polar_dem(dem_path, index_path)
    polygons = []
    for entry in KNOWN_PSR_CRATERS:
        ring, floor_m, rim_m = _trace_crater_ring(
            raw,
            x0,
            spacing_m,
            nodata,
            entry["lat"],
            entry["lon"],
            entry["radiusKm"],
        )
        polygons.append(
            {
                "id": entry["id"],
                "name": entry["name"],
                "lat": entry["lat"],
                "lon": entry["lon"],
                "radiusKm": entry["radiusKm"],
                "floorM": floor_m,
                "rimM": rim_m,
                "ring": ring,
            }
        )

    doc = {
        "source": SOURCE_CITATION,
        "sourceUrl": SOURCE_URL,
        "polygons": polygons,
    }
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    return doc


if __name__ == "__main__":
    result = build()
    print(f"wrote {OUT_PATH} ({len(result['polygons'])} PSR polygons)")
