"""Horizon products: polar grid tiles and curated-site profiles.

Usage: python -m lsp.horizons sites|grid [--half N] [--spacing M] [--naz N] [--tile N]
Grid tiles are int16 LE, tile*tile slots x (1 + nAz) values [hDemM, h0..h(nAz-1)] in centi-degrees;
site files hold 3 profiles x 3600 values (masts 2, 10, 50 m), centi-degrees.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np

from . import ps
from .paths import REPO_ROOT

EMPTY = -32768
HORIZONS_DIR = REPO_ROOT / "public" / "data" / "v1" / "horizons"
GRID_DIR = HORIZONS_DIR / "grid"
SITES_DIR = HORIZONS_DIR / "sites"
SITES_SOURCE = REPO_ROOT / "pipeline" / "catalog" / "sites_source.json"
MASTS_M = (2.0, 10.0, 50.0)
SITE_N_AZ = 3600
POLAR_HALF_M = 199_000.0  # observers inside the fine DEM use fine/coarse; others use the global DEM


def tile_of(ix, iy, half=95, tile=20):
    """(i, j, slot) for point indices (ix, iy)."""
    i, j = (ix + half) // tile, (iy + half) // tile
    return i, j, (iy + half - tile * j) * tile + (ix + half - tile * i)


def write_tile(i, j, slots, out_dir=None):
    slots = np.asarray(slots)
    if slots.ndim != 2 or slots.dtype != np.int16:
        raise ValueError("slots must be a 2-D int16 array")
    d = Path(out_dir) if out_dir is not None else GRID_DIR
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"{i}_{j}.bin"
    slots.astype("<i2").tofile(p)
    return p


def read_tile(path, n_az=720):
    return np.fromfile(path, dtype="<i2").reshape(-1, n_az + 1)


def _centi(deg):
    return np.clip(np.rint(np.asarray(deg) * 100.0), -32767, 32767).astype(np.int16)


def build_grid(half=95, spacing=2000.0, n_az=720, tile=20, out_dir=None, log=print, max_tiles=None):
    from . import dem, raycast
    out_dir = Path(out_dir) if out_dir is not None else GRID_DIR
    fine, coarse = dem.load_fine(), dem.load_coarse()
    n_tiles = (2 * half + 1 + tile - 1) // tile
    names = [f"{i}_{j}" for i in range(n_tiles) for j in range(n_tiles)]
    t0 = time.time()
    done = 0
    for i in range(n_tiles):
        for j in range(n_tiles):
            path = out_dir / f"{i}_{j}.bin"
            if path.exists() and path.stat().st_size == tile * tile * (n_az + 1) * 2:
                done += 1
                continue
            slots = np.full((tile * tile, n_az + 1), EMPTY, dtype=np.int16)
            ixs, iys, sl = [], [], []
            for sy in range(tile):
                for sx in range(tile):
                    ix, iy = tile * i + sx - half, tile * j + sy - half
                    if abs(ix) <= half and abs(iy) <= half:
                        ixs.append(ix)
                        iys.append(iy)
                        sl.append(sy * tile + sx)
            lat, lon = ps.to_latlon(np.array(ixs) * spacing, np.array(iys) * spacing)
            prof, hd = raycast.horizon_profiles(lat, lon, 2.0, n_az, fine, coarse)
            slots[sl, 0] = np.clip(np.rint(hd), -32767, 32767).astype(np.int16)
            slots[sl, 1:] = _centi(prof)
            write_tile(i, j, slots, out_dir)
            done += 1
            log(f"tile {i}_{j} done {done}/{len(names)} elapsed {time.time() - t0:.0f}s")
            if max_tiles and done >= max_tiles:
                return names
    index = dict(projection="ps-south-sphere", R=1737400, spacingM=int(spacing), halfCount=half,
                 tilePoints=tile, nAz=n_az, stepDeg=360.0 / n_az, tiles=names,
                 demFine="LOLA LDEM_80S_40MPP_ADJ 40 m, resampled to sphere PS (|x|,|y|<=200 km)",
                 demCoarse="LOLA polar 120 m inside 303 km, LDEM_64 beyond (|x|,|y|<=400 km)")
    (out_dir / "index.json").write_text(json.dumps(index, indent=2) + "\n")
    return names


def _load_sites(source):
    data = json.loads(Path(source).read_text())
    return data["sites"] if isinstance(data, dict) else data


def build_sites(source=None, out_dir=None, only=None, fine=None, coarse=None, glob=None, log=print):
    """One file per site: 3 profiles x 3600 az, int16 LE centi-degrees, masts 2/10/50 m."""
    from . import dem, raycast
    sites = _load_sites(source or SITES_SOURCE)
    out_dir = Path(out_dir) if out_dir is not None else SITES_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    fine = fine or dem.load_fine()
    coarse = coarse or dem.load_coarse()
    written = []
    for s in sites:
        if only and s["id"] not in only:
            continue
        lat, lon = float(s["lat"]), float(s["lon"])
        x, y = ps.to_xy(lat, lon)
        polar = lat < 0 and max(abs(x), abs(y)) <= POLAR_HALF_M
        if not polar and glob is None:
            glob = dem.load_global()
        profs = []
        for h in MASTS_M:
            if polar:
                p = raycast.horizon_profile(lat, lon, h, SITE_N_AZ, fine, coarse)
            else:
                p = raycast.horizon_profile_global(lat, lon, h, SITE_N_AZ, glob)
            profs.append(_centi(p))
        arr = np.concatenate(profs).astype("<i2")
        path = out_dir / f"{s['id']}.bin"
        arr.tofile(path)
        written.append(path)
        log(f"site {s['id']} ({'polar' if polar else 'global'}) "
            f"min={arr.min() / 100:.2f} max={arr.max() / 100:.2f} deg")
    return written


def main(argv):
    cmd = argv[0] if argv else ""
    opts = dict(zip(argv[1::2], argv[2::2]))
    if cmd == "sites":
        build_sites(source=opts.get("--source"))
        return 0
    if cmd == "grid":
        build_grid(half=int(opts.get("--half", 95)), spacing=float(opts.get("--spacing", 2000)),
                   n_az=int(opts.get("--naz", 720)), tile=int(opts.get("--tile", 20)),
                   log=lambda m: print(m, flush=True))
        return 0
    print("usage: python -m lsp.horizons sites|grid [--half N --spacing M --naz N --tile N]")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
