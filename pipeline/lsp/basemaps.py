"""Hillshade basemaps for the 2D map pickers.

Muted graphite ramp (no colour tint) for the dark theme: deepest shade #0f0f10 up to #a1a1a6.
Sun azimuth 315 deg, altitude 30 deg: a cosmetic choice for readability, not a physical illumination.

Outputs under public/data/v1/basemaps/:
  south-pole-4096.webp, south-pole-2048.webp  sphere PS grid, +-190 km, +y (0E) at the top, +x (90E) right
  global-2048.webp                            equirectangular 2048x1024, lon -180..180 left->right, lat +90 top
  index.json
"""

from __future__ import annotations

import json
import sys

import numpy as np

from . import dem, ps
from .paths import REPO_ROOT

SUN_AZ_DEG = 315.0
SUN_ALT_DEG = 30.0
RAMP_LO = 0x0F   # deepest surface
RAMP_HI = 0xA1   # secondary text
HALF_M = 190_000.0
POLE_SIZES = (4096, 2048)
GLOBAL_W, GLOBAL_H = 2048, 1024
EXAGGERATION = 2.0
GAIN = 1.6
OUT_DIR = REPO_ROOT / "public" / "data" / "v1" / "basemaps"


def hillshade(z, res_m, res_x_m=None, exaggeration=EXAGGERATION, gain=GAIN):
    """z[iy, ix] with +y = increasing row; returns uint8 shade in [RAMP_LO, RAMP_HI], same layout.

    res_x_m may be a per-row array (equirect); NaN heights render as RAMP_LO.
    """
    z = np.asarray(z, dtype=np.float64)
    bad = ~np.isfinite(z)
    if bad.any():
        z = np.where(bad, np.nanmean(z[~bad]) if (~bad).any() else 0.0, z)
    dx = res_m if res_x_m is None else np.asarray(res_x_m, dtype=np.float64)[:, None]
    dzdy = np.gradient(z, res_m, axis=0) * exaggeration
    dzdx = np.gradient(z, axis=1) / dx * exaggeration
    az, alt = np.radians(SUN_AZ_DEG), np.radians(SUN_ALT_DEG)
    sx, sy, sz = np.cos(alt) * np.sin(az), np.cos(alt) * np.cos(az), np.sin(alt)
    shade = (-dzdx * sx - dzdy * sy + sz) / np.sqrt(1.0 + dzdx ** 2 + dzdy ** 2)
    t = np.clip(0.5 + (shade - sz) * gain, 0.0, 1.0)
    out = np.rint(RAMP_LO + (RAMP_HI - RAMP_LO) * t).astype(np.uint8)
    out[bad] = RAMP_LO
    return out


def south_pole_image(grid, half_m=HALF_M, size=4096):
    """North-up (+y at top) hillshade of a PS grid over +-half_m, size x size pixels."""
    step = 2 * half_m / size
    c = -half_m + step * (np.arange(size) + 0.5)
    z = np.empty((size, size), dtype=np.float32)
    for r in range(0, size, 512):
        yy = c[r:r + 512][:, None]
        z[r:r + 512] = grid.sample(c[None, :], yy)
    return hillshade(z, step)[::-1]


def global_image(gg, w=GLOBAL_W, h=GLOBAL_H):
    """Equirectangular hillshade, lon -180..180 left->right, lat +90 at top. 2x supersampled."""
    sw, sh = w * 2, h * 2
    lat = 90.0 - (np.arange(sh) + 0.5) * 180.0 / sh
    lon = -180.0 + (np.arange(sw) + 0.5) * 360.0 / sw
    z = np.empty((sh, sw), dtype=np.float32)
    for r in range(0, sh, 256):
        z[r:r + 256] = gg.sample(lat[r:r + 256, None], lon[None, :])
    z = z.reshape(h, 2, w, 2).mean(axis=(1, 3))
    latc = 90.0 - (np.arange(h) + 0.5) * 180.0 / h
    dx = ps.R_M * np.radians(360.0 / w) * np.maximum(np.cos(np.radians(latc)), 0.05)
    dy = ps.R_M * np.radians(180.0 / h)
    # hillshade() treats row increase as +y; image rows run north->south, so flip in and out
    return hillshade(z[::-1], dy, res_x_m=dx[::-1], exaggeration=10.0)[::-1]


def _save(img, name, quality=60):
    from PIL import Image
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    p = OUT_DIR / name
    Image.fromarray(img, mode="L").save(p, "WEBP", quality=quality, method=6)
    print(name, p.stat().st_size, "B")


def build():
    from PIL import Image
    fine = dem.load_fine()
    big = south_pole_image(fine, size=4096)
    _save(big, "south-pole-4096.webp", 60)
    small = np.asarray(Image.fromarray(big, mode="L").resize((2048, 2048), Image.LANCZOS))
    _save(small, "south-pole-2048.webp", 60)
    _save(global_image(dem.load_global()), "global-2048.webp", 45)
    (OUT_DIR / "index.json").write_text(json.dumps({
        "southPole": {"radiusM": int(HALF_M), "sizes": list(POLE_SIZES)},
        "global": {"w": GLOBAL_W, "h": GLOBAL_H, "proj": "equirect"},
    }, indent=2) + "\n")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "build":
        build()
    else:
        print("usage: python -m lsp.basemaps build")
