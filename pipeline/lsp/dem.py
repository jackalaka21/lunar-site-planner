"""LOLA DEM composites resampled onto our sphere polar-stereographic grid.

Outputs (WORK_DIR, not committed), all int16 with a JSON sidecar:
  fine_40m.npy      40 m,  |x|,|y| <= 200 km, metres relative to the 1737.4 km sphere
  coarse_120m.npy   120 m, |x|,|y| <= 400 km, polar DEM where available, else global DEM
  global_64ppd.npy  LOLA LDEM_64 digital numbers (height = DN * 0.5 m), lat 90 -> -90, lon 0 -> 360E

Grid array layout: array[iy, ix] with x = x0 + ix*res, y = y0 + iy*res (row index increases
with +y, i.e. towards lon 0 on the +y axis). origin_xy = (x0, y0) is the centre of array[0, 0].
rasterio is imported lazily so CI (no rasterio) can import this module.
"""

from __future__ import annotations

import json
import sys
import time

import numpy as np

from . import ps
from .paths import RAW_DIR, WORK_DIR

NODATA = -32768  # int16 sentinel
POLAR_TIF = RAW_DIR / "dem" / "LDEM_80S_40MPP_ADJ.TIF"
GLOBAL_IMG = RAW_DIR / "dem" / "LDEM_64.IMG"
GLOBAL_SHAPE = (11520, 23040)
GLOBAL_PPD = 64
GLOBAL_SCALE = 0.5  # metres per DN, relative to R = 1737.4 km
HEIGHT_REF = "metres above the 1737400 m reference sphere (LOLA, MOON_ME / DE421 frame)"

FINE_RES, FINE_N = 40.0, 10000          # nodes at +-20 + 40k, max |x| = 199,980
COARSE_RES, COARSE_N = 120.0, 6667      # nodes at 120k, pole on a node, max |x| = 399,960
POLAR_USE_HALF = 303_000.0              # polar DEM trusted inside +-303 km (native +-304 km)


class Grid:
    """Regular grid in PS metres. sample() is bilinear and returns NaN outside or near nodata."""

    def __init__(self, origin_xy, res_m, array):
        self.origin_xy = (float(origin_xy[0]), float(origin_xy[1]))
        self.res_m = float(res_m)
        self.array = array

    @property
    def extent(self):
        ny, nx = self.array.shape
        x0, y0 = self.origin_xy
        return (x0, x0 + (nx - 1) * self.res_m, y0, y0 + (ny - 1) * self.res_m)

    def _vals(self, iy, ix):
        v = np.asarray(self.array[iy, ix])
        if v.dtype == np.int16:
            f = v.astype(np.float64)
            f[v == NODATA] = np.nan
            return f
        return v.astype(np.float64)

    def sample(self, x, y):
        xa = np.asarray(x, dtype=np.float64)
        ya = np.asarray(y, dtype=np.float64)
        ny, nx = self.array.shape
        fx = (xa - self.origin_xy[0]) / self.res_m
        fy = (ya - self.origin_xy[1]) / self.res_m
        ok = (fx >= 0) & (fx <= nx - 1) & (fy >= 0) & (fy <= ny - 1)
        fxc = np.where(ok, fx, 0.0)
        fyc = np.where(ok, fy, 0.0)
        ix = np.minimum(np.floor(fxc).astype(np.int64), nx - 2)
        iy = np.minimum(np.floor(fyc).astype(np.int64), ny - 2)
        tx, ty = fxc - ix, fyc - iy
        v00 = self._vals(iy, ix)
        v10 = self._vals(iy, ix + 1)
        v01 = self._vals(iy + 1, ix)
        v11 = self._vals(iy + 1, ix + 1)
        out = (v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty)
               + v01 * (1 - tx) * ty + v11 * tx * ty)
        out = np.where(ok, out, np.nan)
        return float(out) if out.ndim == 0 else out


class GlobalGrid:
    """Pixel-registered global cylindrical grid: row 0 at lat +90, col 0 at lon 0E (east positive)."""

    def __init__(self, array, ppd=GLOBAL_PPD, scale=GLOBAL_SCALE):
        self.array = array
        self.ppd = float(ppd)
        self.scale = float(scale)

    def sample(self, lat, lon):
        ny, nx = self.array.shape
        la = np.asarray(lat, dtype=np.float64)
        lo = np.asarray(lon, dtype=np.float64)
        fr = np.clip((90.0 - la) * self.ppd - 0.5, 0.0, ny - 1.0)
        fc = (np.mod(lo, 360.0) * self.ppd - 0.5) % nx
        r0 = np.minimum(np.floor(fr).astype(np.int64), ny - 2)
        c0 = np.floor(fc).astype(np.int64)
        tr, tc = fr - r0, fc - c0
        c1 = (c0 + 1) % nx
        a = self.array

        def g(r, c):
            return np.asarray(a[r, c], dtype=np.float64)

        out = (g(r0, c0) * (1 - tr) * (1 - tc) + g(r0, c1) * (1 - tr) * tc
               + g(r0 + 1, c0) * tr * (1 - tc) + g(r0 + 1, c1) * tr * tc) * self.scale
        return float(out) if out.ndim == 0 else out


# ---------------------------------------------------------------- loading

def _load(name):
    meta = json.loads((WORK_DIR / f"{name}.json").read_text())
    return np.load(WORK_DIR / f"{name}.npy", mmap_mode="r"), meta


def load_fine() -> Grid:
    arr, m = _load("fine_40m")
    return Grid(m["origin_xy"], m["res_m"], arr)


def load_coarse() -> Grid:
    arr, m = _load("coarse_120m")
    return Grid(m["origin_xy"], m["res_m"], arr)


def load_global() -> GlobalGrid:
    arr, m = _load("global_64ppd")
    return GlobalGrid(arr, m["ppd"], m["scale"])


# ---------------------------------------------------------------- building

def _write_meta(name, meta):
    (WORK_DIR / f"{name}.json").write_text(json.dumps(meta, indent=2) + "\n")


def _to_i16(a):
    out = np.full(a.shape, NODATA, dtype=np.int16)
    ok = np.isfinite(a)
    out[ok] = np.clip(np.rint(a[ok]), -32767, 32767).astype(np.int16)
    return out


def build_fine(ds):
    """Native grid is already sphere PS at 40 m with pixel centres at +-20 + 40k: exact crop, flipped to y-up."""
    from rasterio.windows import Window
    t = ds.transform
    if not (t.a == 40.0 and t.e == -40.0 and t.b == 0 and t.d == 0):
        raise RuntimeError(f"unexpected native transform {t}")
    half_m = FINE_N * FINE_RES / 2
    col0 = int(round((-half_m - t.c) / FINE_RES))
    row0 = int(round((t.f - half_m) / FINE_RES))
    out = np.lib.format.open_memmap(WORK_DIR / "fine_40m.npy", mode="w+", dtype=np.int16,
                                    shape=(FINE_N, FINE_N))
    strip = 1000
    for r in range(0, FINE_N, strip):  # r indexes native (top-down) rows within the crop
        h = min(strip, FINE_N - r)
        blk = ds.read(1, window=Window(col0, row0 + r, FINE_N, h)).astype(np.float32)
        out[FINE_N - r - h: FINE_N - r, :] = _to_i16(blk)[::-1]
    out.flush()
    x0 = -(FINE_N / 2 - 0.5) * FINE_RES
    _write_meta("fine_40m", dict(
        origin_xy=[x0, x0], res_m=FINE_RES, shape=[FINE_N, FINE_N], dtype="int16", nodata=NODATA,
        height_reference=HEIGHT_REF, layout="array[iy, ix]; x=x0+ix*res; y=y0+iy*res",
        crs=ps.PROJ_STRING, source="LDEM_80S_40MPP_ADJ.TIF exact crop (same CRS and grid)"))


def build_global():
    src = np.memmap(GLOBAL_IMG, dtype="<i2", mode="r", shape=GLOBAL_SHAPE)
    out = np.lib.format.open_memmap(WORK_DIR / "global_64ppd.npy", mode="w+", dtype=np.int16,
                                    shape=GLOBAL_SHAPE)
    for r in range(0, GLOBAL_SHAPE[0], 1024):
        out[r:r + 1024] = src[r:r + 1024]
    out.flush()
    _write_meta("global_64ppd", dict(
        shape=list(GLOBAL_SHAPE), dtype="int16", ppd=GLOBAL_PPD, scale=GLOBAL_SCALE,
        height_reference="height_m = DN * 0.5, relative to the 1737400 m reference sphere (LOLA LDEM_64 V3.1)",
        layout="array[row, col]; row 0 centre lat +90-0.5/ppd (north first); col 0 centre lon 0.5/ppd E; pixel registered",
        source="LDEM_64.IMG (PDS3 LSB 16-bit)"))
    return out


def build_coarse(ds, glob):
    import rasterio
    from rasterio.crs import CRS
    from rasterio.transform import Affine
    from rasterio.warp import Resampling, reproject

    dst_crs = CRS.from_proj4(ps.PROJ_STRING)
    x0 = -(COARSE_N - 1) / 2 * COARSE_RES  # -399,960
    gg = GlobalGrid(glob)
    out = np.lib.format.open_memmap(WORK_DIR / "coarse_120m.npy", mode="w+", dtype=np.int16,
                                    shape=(COARSE_N, COARSE_N))
    xs = x0 + COARSE_RES * np.arange(COARSE_N)
    strip = 400
    src_band = rasterio.band(ds, 1)
    for r in range(0, COARSE_N, strip):  # r indexes our y-up rows
        h = min(strip, COARSE_N - r)
        ys = x0 + COARSE_RES * np.arange(r, r + h)
        # warp destination is north-up: its top row is the largest y of this strip
        tf = Affine(COARSE_RES, 0, x0 - COARSE_RES / 2, 0, -COARSE_RES, ys[-1] + COARSE_RES / 2)
        blk = np.full((h, COARSE_N), np.nan, dtype=np.float32)
        reproject(source=src_band, destination=blk, dst_transform=tf, dst_crs=dst_crs,
                  resampling=Resampling.average, src_nodata=np.nan, dst_nodata=np.nan)
        blk = blk[::-1]  # -> y-up
        inside = (np.abs(xs)[None, :] <= POLAR_USE_HALF) & (np.abs(ys)[:, None] <= POLAR_USE_HALF)
        use_polar = inside & np.isfinite(blk)
        res = np.where(use_polar, blk, np.nan).astype(np.float64)
        need = ~use_polar
        if need.any():
            X, Y = np.meshgrid(xs, ys)
            lat, lon = ps.to_latlon(X[need], Y[need])
            res[need] = gg.sample(lat, lon)
        out[r:r + h] = _to_i16(res)
    out.flush()
    _write_meta("coarse_120m", dict(
        origin_xy=[x0, x0], res_m=COARSE_RES, shape=[COARSE_N, COARSE_N], dtype="int16", nodata=NODATA,
        height_reference=HEIGHT_REF, layout="array[iy, ix]; x=x0+ix*res; y=y0+iy*res",
        crs=ps.PROJ_STRING, polar_use_half_m=POLAR_USE_HALF,
        source="LDEM_80S_40MPP_ADJ.TIF (area-averaged to 120 m) inside +-303 km, else LDEM_64 bilinear"))


def verify():
    fine, coarse, glob = load_fine(), load_coarse(), load_global()
    ok = True
    for name, g in (("fine", fine), ("coarse", coarse)):
        a = np.asarray(g.array)
        nn = int((a == NODATA).sum())
        valid = a[a != NODATA]
        print(f"{name}: shape={a.shape} nodata={nn} min={valid.min()} max={valid.max()}")
        ok &= nn == 0 and -10000 <= valid.min() and valid.max() <= 10000
    # seam: coarse (polar) vs global just inside the polar edge
    t = np.linspace(-300_000, 300_000, 2001)
    d = []
    for ex, ey in ((t, np.full_like(t, 300_000.0)), (t, np.full_like(t, -300_000.0)),
                   (np.full_like(t, 300_000.0), t), (np.full_like(t, -300_000.0), t)):
        lat, lon = ps.to_latlon(ex, ey)
        d.append(coarse.sample(ex, ey) - glob.sample(lat, lon))
    d = np.concatenate(d)
    print(f"seam (coarse polar vs LDEM_64 on 300 km box): mean={np.nanmean(d):.1f} m "
          f"rms={np.sqrt(np.nanmean(d ** 2)):.1f} m max|d|={np.nanmax(np.abs(d)):.1f} m")
    gx, gy = np.meshgrid(np.arange(-30000, 30001, 100.0), np.arange(-30000, 30001, 100.0))
    rr = np.hypot(gx, gy)
    sx, sy = ps.to_xy(-89.9, 129.8)
    v = fine.sample(sx + gx, sy + gy)
    floor = np.nanmin(v[rr < 6000])
    rim = np.nanmax(v[(rr > 3000) & (rr < 12000)])
    print(f"Shackleton (-89.9, 129.8E): floor min={floor:.0f} m, rim max={rim:.0f} m, depth={rim - floor:.0f} m")
    ok &= (rim - floor) > 3000
    mx, my = ps.to_xy(-86.0, 2.9)
    v = fine.sample(mx + gx, my + gy)
    peak = np.nanmax(v[rr < 15000])
    ring = np.nanmean(v[(rr > 25000) & (rr < 30000)])
    print(f"Malapert (-86.0, 2.9E): max within 15 km={peak:.0f} m (25-30 km ring mean {ring:.0f} m)")
    ok &= peak > ring + 1000
    print("VERIFY", "PASS" if ok else "FAIL")
    return bool(ok)


def build():
    import rasterio
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    with rasterio.open(POLAR_TIF) as ds:
        build_fine(ds)
        print(f"fine done {time.time() - t0:.0f}s", flush=True)
        glob = build_global()
        print(f"global done {time.time() - t0:.0f}s", flush=True)
        build_coarse(ds, glob)
        print(f"coarse done {time.time() - t0:.0f}s", flush=True)
    return verify()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "build":
        sys.exit(0 if build() else 1)
    if cmd == "verify":
        sys.exit(0 if verify() else 1)
    print("usage: python -m lsp.dem build|verify")
    sys.exit(2)
