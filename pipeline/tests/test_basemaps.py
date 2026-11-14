import numpy as np
import pytest

from lsp import basemaps


def _synthetic(n=64):
    xs = np.linspace(-1, 1, n)
    X, Y = np.meshgrid(xs, xs)
    return 800.0 * np.exp(-((X - 0.2) ** 2 + (Y + 0.1) ** 2) / 0.1) + 100 * np.sin(6 * X)


def test_hillshade_dimensions_and_range():
    img = basemaps.hillshade(_synthetic(64), res_m=100.0)
    assert img.shape == (64, 64) and img.dtype == np.uint8
    assert img.std() > 2
    assert img.min() >= basemaps.RAMP_LO and img.max() <= basemaps.RAMP_HI


def test_flat_is_mid_and_nan_is_floor():
    z = np.zeros((16, 16))
    z[3, 3] = np.nan
    img = basemaps.hillshade(z, res_m=100.0)
    mid = round((basemaps.RAMP_LO + basemaps.RAMP_HI) / 2)
    assert abs(int(img[8, 8]) - mid) <= 2
    assert img[3, 3] == basemaps.RAMP_LO


def test_light_from_northwest_in_image_frame():
    # a ramp rising to the east (+x): slope faces west, away from... NW sun lights west faces
    xs = np.arange(32, dtype=float)
    east_rising = np.tile(xs * 50.0, (32, 1))      # array[iy, ix], +y up
    west_rising = east_rising[:, ::-1].copy()
    a = basemaps.hillshade(east_rising, res_m=100.0)[16, 16]
    b = basemaps.hillshade(west_rising, res_m=100.0)[16, 16]
    assert a > b   # east-rising slope faces west -> toward NW sun -> brighter


def test_polar_image_shape_and_orientation():
    # DEM bump at +y (0E) must appear in the top half of the north-up image
    n = 40
    res = 10000.0
    x0 = -(n - 1) / 2 * res
    z = np.zeros((n, n))
    iy_hi = n - 6
    z[iy_hi - 2: iy_hi + 3, n // 2 - 2: n // 2 + 3] = 3000.0
    g = basemaps.dem.Grid((x0, x0), res, z)
    img = basemaps.south_pole_image(g, half_m=150000.0, size=64)
    assert img.shape == (64, 64)
    top, bottom = img[:32].std(), img[32:].std()
    assert top > bottom * 5
