"""Per-site 20 x 20 km LOLA terrain patches for the 3D view.

For every site in public/data/v1/sites.json this writes
  public/data/v1/terrain/sites/{id}.bin   101 x 101 Int16 little-endian, metres relative to the 1737.4 km sphere
  public/data/v1/terrain/sites/index.json {gridSize, radiusKm, spacingM, sites: {id: {source, resM}}}

Layout: row-major heights[iy * 101 + ix]; ix runs West to East (-10..+10 km), iy runs South to North
(-10..+10 km), both in local metres around the site, 200 m apart. Heights are bilinear samples of the
reviewed DEM grids in dem.py with no smoothing and no synthetic terms:
  load_fine()   40 m LOLA polar DEM, when the whole patch lies inside its extent
  load_coarse() 120 m polar DEM, when the whole patch lies inside +-303 km (beyond that the coarse grid is
                filled from the global map, so it is not labelled polar)
  load_global() LOLA LDEM_64 (64 px/deg, ~470 m at the equator), otherwise

Each sample position is found with the great-circle destination formula (raycast._destination) from the
site, at distance hypot(east, north) along bearing atan2(east, north); polar grids then convert the
destination to stereographic metres with ps.to_xy, so the sphere's scale distortion is included.

Run: python -m lsp.terrain_patches
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

from . import ps
from .dem import POLAR_USE_HALF
from .paths import REPO_ROOT

GRID_SIZE = 101
RADIUS_KM = 10.0
SPACING_M = 200.0
SITES_JSON = REPO_ROOT / "public" / "data" / "v1" / "sites.json"
OUT_DIR = REPO_ROOT / "public" / "data" / "v1" / "terrain" / "sites"
SOURCE_FINE = "LOLA polar 40 m"
SOURCE_GLOBAL = "LOLA global 64 ppd"
SOURCE_COARSE = "LOLA polar 120 m"  # not expected for the catalogue; kept distinct so labels stay honest


def offsets_m(grid_size=GRID_SIZE, spacing_m=SPACING_M):
    """(east, north) metre offset meshes, shape (grid_size, grid_size), indexed [iy, ix]."""
    half = (grid_size - 1) / 2.0
    ax = (np.arange(grid_size) - half) * spacing_m
    east, north = np.meshgrid(ax, ax)
    return east, north


def destination_latlon(lat, lon, east, north):
    """Great-circle destinations (deg) for local east/north offsets (m) from (lat, lon), via raycast."""
    from .raycast import _destination

    phi = math.radians(lat)
    lam = math.radians(lon)
    sphi, cphi = math.sin(phi), math.cos(phi)
    dist = np.hypot(east, north)
    brg = np.arctan2(east, north)
    lat2 = np.empty(dist.shape, dtype=np.float64)
    lon2 = np.empty(dist.shape, dtype=np.float64)
    flat_d, flat_b = dist.ravel(), brg.ravel()
    fl_lat, fl_lon = lat2.ravel(), lon2.ravel()
    for i in range(flat_d.size):
        a, b = _destination(sphi, cphi, lam, flat_d[i] / ps.R_M, flat_b[i])
        fl_lat[i], fl_lon[i] = a, b
    return np.degrees(lat2), np.degrees(lon2)


def _inside(grid, x, y):
    x0, x1, y0, y1 = grid.extent
    return bool(x.min() >= x0 and x.max() <= x1 and y.min() >= y0 and y.max() <= y1)


def patch_heights(lat, lon, fine=None, coarse=None, glob=None, grid_size=GRID_SIZE, spacing_m=SPACING_M):
    """Heights (metres, float64, shape (n, n) [iy, ix]) and (source, resM) for one site.

    Grids are tried in order fine, coarse, global; a grid is used only if it covers the whole patch.
    Raises if the chosen grid returns NaN anywhere (nodata is never filled in).
    """
    east, north = offsets_m(grid_size, spacing_m)
    lat2, lon2 = destination_latlon(lat, lon, east, north)
    x, y = ps.to_xy(lat2, lon2)
    h, source, res = None, None, None
    for grid, src in ((fine, SOURCE_FINE), (coarse, SOURCE_COARSE)):
        if grid is not None and _inside(grid, x, y) and (
            src != SOURCE_COARSE or max(abs(x).max(), abs(y).max()) <= POLAR_USE_HALF
        ):
            h, source, res = grid.sample(x, y), src, grid.res_m
            break
    if h is None:
        if glob is None:
            raise RuntimeError(f"no DEM covers the patch at ({lat}, {lon})")
        h = glob.sample(lat2, lon2)
        source, res = SOURCE_GLOBAL, math.radians(1.0 / glob.ppd) * ps.R_M
    h = np.asarray(h, dtype=np.float64)
    if not np.all(np.isfinite(h)):
        raise RuntimeError(f"nodata inside the patch at ({lat}, {lon}) from {source}")
    return h, source, float(round(res))


def encode(h):
    """float metres -> Int16 little-endian bytes, rounded to the nearest metre."""
    a = np.rint(h)
    if a.min() < -32767 or a.max() > 32767:
        raise ValueError("height outside Int16 range")
    return a.astype("<i2").tobytes()


def decode(buf, grid_size=GRID_SIZE):
    a = np.frombuffer(buf, dtype="<i2")
    if a.size != grid_size * grid_size:
        raise ValueError(f"expected {grid_size * grid_size} samples, got {a.size}")
    return a.reshape(grid_size, grid_size).astype(np.float64)


def build(sites_json=SITES_JSON, out_dir=OUT_DIR):
    from . import dem

    fine, coarse, glob = dem.load_fine(), dem.load_coarse(), dem.load_global()
    sites = json.loads(Path(sites_json).read_text())["sites"]
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    index = {}
    total = 0
    for s in sites:
        h, source, res = patch_heights(s["lat"], s["lon"], fine, coarse, glob)
        data = encode(h)
        (out_dir / f"{s['id']}.bin").write_bytes(data)
        total += len(data)
        index[s["id"]] = {"source": source, "resM": res}
        c = GRID_SIZE // 2
        print(f"{s['id']:34s} {source:20s} res {res:5.0f} m  centre {h[c, c]:8.1f} m  hDemM {s['hDemM']:8.1f} m")
    meta = {"gridSize": GRID_SIZE, "radiusKm": RADIUS_KM, "spacingM": SPACING_M, "sites": index}
    (out_dir / "index.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"{len(sites)} patches, {total} bytes")
    return meta


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--sites", type=Path, default=SITES_JSON)
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    a = ap.parse_args(argv)
    build(a.sites, a.out)


if __name__ == "__main__":
    main()
