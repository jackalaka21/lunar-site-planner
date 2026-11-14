import math

import numpy as np
import pytest

pytest.importorskip("numba")

from lsp import dem, ps  # noqa: E402
from lsp import raycast  # noqa: E402

R = 1737400.0


def _grid(res, half, fn):
    n = int(round(2 * half / res)) + 1
    x0 = -half
    xs = x0 + res * np.arange(n)
    X, Y = np.meshgrid(xs, xs)
    z = np.rint(fn(X, Y)).astype(np.int16)
    return dem.Grid((x0, x0), res, z)


def _flat():
    return (_grid(40.0, 40_000.0, lambda X, Y: 0 * X),
            _grid(120.0, 120_000.0, lambda X, Y: 0 * X))


def _dest(lat, lon, az, s):
    d = s / R
    p, l, t = map(math.radians, (lat, lon, az))
    la = math.asin(math.sin(p) * math.cos(d) + math.cos(p) * math.sin(d) * math.cos(t))
    lo = l + math.atan2(math.sin(t) * math.sin(d) * math.cos(p), math.cos(d) - math.sin(p) * math.sin(la))
    return math.degrees(la), math.degrees(lo)


def _cone_dem(cx, cy, height=1000.0, radius=10_000.0):
    fn = lambda X, Y: np.maximum(0.0, height * (1 - np.hypot(X - cx, Y - cy) / radius))  # noqa: E731
    return (_grid(40.0, 40_000.0, fn), _grid(120.0, 120_000.0, fn))


def _expected_cone(s, h=1000.0, obs=2.0):
    drop = s * s / (2 * R)
    return math.degrees(math.atan2(h - drop - obs, s))


def test_flat_sphere_dip():
    fine, coarse = _flat()
    prof = raycast.horizon_profile(-89.0, 10.0, 2.0, 72, fine, coarse, max_km=30.0)
    expect = -math.degrees(math.acos(R / (R + 2.0)))
    assert prof.shape == (72,)
    assert np.all(np.abs(prof - expect) < 0.002)


def test_cone_peak():
    lat0, lon0 = -89.0, 0.0
    x0, y0 = ps.to_xy(lat0, lon0)
    la, lo = _dest(lat0, lon0, 0.0, 20_000.0)
    cx, cy = ps.to_xy(la, lo)
    # shift so the observer sits at the origin region of our synthetic grid: build grid in absolute PS metres
    n = lambda res, half: int(round(2 * half / res)) + 1  # noqa: E731
    def mk(res, half):
        xs = np.arange(n(res, half)) * res - half
        X, Y = np.meshgrid(xs + x0, xs + y0)
        z = np.rint(np.maximum(0.0, 1000.0 * (1 - np.hypot(X - cx, Y - cy) / 10_000.0))).astype(np.int16)
        return dem.Grid((x0 - half, y0 - half), res, z)
    fine, coarse = mk(40.0, 40_000.0), mk(120.0, 120_000.0)
    prof = raycast.horizon_profile(lat0, lon0, 2.0, 360, fine, coarse, max_km=30.0)
    assert abs(prof[0] - _expected_cone(20_000.0)) < 0.05
    assert int(np.argmax(prof)) in (0, 359, 1)
    assert prof[180] < prof[0] - 1.0


def test_azimuth_convention_east():
    lat0, lon0 = -89.0, 0.0
    x0, y0 = ps.to_xy(lat0, lon0)
    la, lo = _dest(lat0, lon0, 90.0, 20_000.0)
    cx, cy = ps.to_xy(la, lo)
    xs = np.arange(int(2 * 40_000 / 40) + 1) * 40.0 - 40_000.0
    X, Y = np.meshgrid(xs + x0, xs + y0)
    z = np.rint(np.maximum(0.0, 1000.0 * (1 - np.hypot(X - cx, Y - cy) / 10_000.0))).astype(np.int16)
    fine = dem.Grid((x0 - 40_000.0, y0 - 40_000.0), 40.0, z)
    xc = np.arange(int(2 * 120_000 / 120) + 1) * 120.0 - 120_000.0
    X, Y = np.meshgrid(xc + x0, xc + y0)
    zc = np.rint(np.maximum(0.0, 1000.0 * (1 - np.hypot(X - cx, Y - cy) / 10_000.0))).astype(np.int16)
    coarse = dem.Grid((x0 - 120_000.0, y0 - 120_000.0), 120.0, zc)
    prof = raycast.horizon_profile(lat0, lon0, 2.0, 360, fine, coarse, max_km=30.0)
    assert abs(int(np.argmax(prof)) - 90) <= 1
    assert abs(prof[90] - _expected_cone(20_000.0)) < 0.06


def test_pole_observer_rays_follow_meridians():
    # cone at 20 km from the pole on the 90 E meridian: PS x = +rho, y = 0
    rho = 2 * R * math.tan(math.pi / 4 + math.radians(-90 + math.degrees(20_000.0 / R)) / 2)
    cx, cy = ps.to_xy(-90 + math.degrees(20_000.0 / R), 90.0)
    assert cx > 0 and abs(cy) < 1e-6 and abs(cx - rho) < 1e-6
    fn = lambda X, Y: np.maximum(0.0, 1000.0 * (1 - np.hypot(X - cx, Y - cy) / 10_000.0))  # noqa: E731
    fine, coarse = _grid(40.0, 40_000.0, fn), _grid(120.0, 120_000.0, fn)
    prof = raycast.horizon_profile(-90.0, 0.0, 2.0, 360, fine, coarse, max_km=30.0)
    assert abs(int(np.argmax(prof)) - 90) <= 1
    assert abs(prof[90] - _expected_cone(20_000.0)) < 0.06


def test_jit_samplers_match_grid_sample():
    rng = np.random.default_rng(5)
    z = rng.integers(-500, 500, (30, 40)).astype(np.int16)
    z[3, 4] = dem.NODATA
    g = dem.Grid((-300.0, -200.0), 25.0, z)
    px = rng.uniform(-320, 720, 500)
    py = rng.uniform(-220, 560, 500)
    got = raycast.sample_grid(g, px, py)
    want = g.sample(px, py)
    assert np.array_equal(np.isnan(got), np.isnan(want))
    ok = ~np.isnan(want)
    assert np.allclose(got[ok], want[ok], atol=1e-9)
    gg = dem.GlobalGrid(rng.integers(-3000, 3000, (64 * 2 * 4, 64 * 4 * 4)).astype(np.int16), ppd=16)
    lat = rng.uniform(-90, 90, 300)
    lon = rng.uniform(-360, 720, 300)
    assert np.allclose(raycast.sample_global(gg, lat, lon), gg.sample(lat, lon), atol=1e-9)


def test_global_profile_flat_and_cone():
    n = 16 * 180
    gg = dem.GlobalGrid(np.zeros((n, 2 * n), dtype=np.int16), ppd=16)
    prof = raycast.horizon_profile_global(0.0, 10.0, 2.0, 36, gg, max_km=50.0)
    assert np.all(np.abs(prof + 0.0870) < 0.01)
