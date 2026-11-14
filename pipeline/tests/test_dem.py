import json

import numpy as np
import pytest

from lsp import dem, ps
from lsp.paths import RAW_DIR, WORK_DIR


def test_bilinear_on_plane():
    ny, nx, res = 40, 50, 40.0
    x0, y0 = -800.0, -600.0
    xs = x0 + res * np.arange(nx)
    ys = y0 + res * np.arange(ny)
    z = 2 * xs[None, :] + 3 * ys[:, None]
    g = dem.Grid((x0, y0), res, z)
    rng = np.random.default_rng(3)
    px = rng.uniform(x0, xs[-1], 200)
    py = rng.uniform(y0, ys[-1], 200)
    assert np.allclose(g.sample(px, py), 2 * px + 3 * py, atol=1e-6)
    assert g.sample(float(px[0]), float(py[0])) == pytest.approx(2 * px[0] + 3 * py[0])


def test_outside_is_nan_and_int16_nodata():
    z = np.zeros((4, 4), dtype=np.int16)
    z[1, 1] = dem.NODATA
    g = dem.Grid((0.0, 0.0), 10.0, z)
    assert np.isnan(g.sample(-1.0, 5.0)) and np.isnan(g.sample(5.0, 31.0))
    assert np.isnan(g.sample(5.0, 5.0))  # touches nodata corner
    assert g.sample(25.0, 25.0) == 0.0


def test_global_grid_wraps_and_scales():
    ny, nx = 64, 128  # 0.5 deg... test grid at 64 px per 180 deg? use generic ppd
    ppd = 128 / 360.0
    a = np.zeros((ny, nx), dtype=np.int16)
    a[:, 0] = 20  # DN 20 -> 10 m
    a[:, -1] = 20
    g = dem.GlobalGrid(a, ppd=ppd, scale=0.5)
    assert g.sample(0.0, 0.0) == pytest.approx(10.0)  # wrap between last and first col
    assert g.sample(0.0, 180.0) == pytest.approx(0.0)


needs = pytest.mark.needs_data


@needs
def test_native_crs_matches_our_sphere_ps():
    rasterio = pytest.importorskip("rasterio")
    pyproj = pytest.importorskip("pyproj")
    with rasterio.open(dem.POLAR_TIF) as d:
        t = pyproj.Transformer.from_crs(d.crs, ps.PROJ_STRING, always_xy=True)
        pts = np.array([[1e5, 2e5], [-3e5, 5e4], [0.0, -2.9e5]])
        ox, oy = t.transform(pts[:, 0], pts[:, 1])
    assert np.max(np.abs(ox - pts[:, 0])) < 1e-6 and np.max(np.abs(oy - pts[:, 1])) < 1e-6


@needs
def test_composites_built():
    for name in ("fine_40m", "coarse_120m", "global_64ppd"):
        meta = json.loads((WORK_DIR / f"{name}.json").read_text())
        arr = np.load(WORK_DIR / f"{name}.npy", mmap_mode="r")
        assert list(arr.shape) == meta["shape"]
    fine, coarse = dem.load_fine(), dem.load_coarse()
    assert fine.res_m == 40 and coarse.res_m == 120
    # fine and coarse agree on a smooth-ish location (coarse is an average of fine)
    x, y = ps.to_xy(-86.0, 2.9)
    assert abs(fine.sample(x, y) - coarse.sample(x, y)) < 600
    assert not np.isnan(fine.sample(0.0, 0.0))
