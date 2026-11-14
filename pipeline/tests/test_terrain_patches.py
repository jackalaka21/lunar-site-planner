import json

import numpy as np
import pytest

from lsp import dem, ps, terrain_patches as tp
from lsp.paths import REPO_ROOT


def test_offsets_layout():
    e, n = tp.offsets_m()
    assert e.shape == (101, 101)
    assert e[50, 0] == -10000 and e[50, 100] == 10000 and e[0, 50] == 0
    assert n[0, 50] == -10000 and n[100, 50] == 10000  # row 0 = south


def _polar_grid(fn, n=2000, res=200.0):
    x0 = -(n - 1) / 2 * res
    xs = x0 + res * np.arange(n)
    return dem.Grid((x0, x0), res, fn(xs[None, :], xs[:, None])), xs


def test_plane_reproduced_on_polar_grid():
    g, _ = _polar_grid(lambda x, y: 0.01 * x + 0.02 * y)
    lat, lon = -88.0, 40.0
    h, src, r = tp.patch_heights(lat, lon, fine=g)
    assert src == tp.SOURCE_FINE and r == 200
    e, nn = tp.offsets_m()
    la, lo = tp.destination_latlon(lat, lon, e, nn)
    x, y = ps.to_xy(la, lo)
    assert np.allclose(h, 0.01 * x + 0.02 * y, atol=1e-6)


def test_cone_on_polar_grid_is_symmetric_about_centre():
    cx, cy = ps.to_xy(-87.0, 120.0)
    g, _ = _polar_grid(lambda x, y: 1000.0 - 0.1 * np.hypot(x - cx, y - cy))
    h, _, _ = tp.patch_heights(-87.0, 120.0, fine=g)
    assert h[50, 50] == pytest.approx(1000.0, abs=15.0)  # bilinear clips the apex of a 200 m grid
    # ground distance 10 km -> PS distance ~ 10 km * k (k ~ 1.002 here); drop 0.1 m/m
    assert h[50, 100] == pytest.approx(1000.0 - 1000.0 * 1.002, abs=15.0)
    assert h[50, 0] == pytest.approx(h[50, 100], abs=6.0)
    assert h[0, 50] == pytest.approx(h[100, 50], abs=6.0)


def test_global_fallback_and_grid_order():
    ppd = 4.0
    ny, nx = 180 * 4, 360 * 4
    lat_c = 90.0 - (np.arange(ny) + 0.5) / ppd
    a = np.rint((lat_c[:, None] * 100.0 + np.zeros((1, nx))) / 0.5).astype(np.int16)  # 100 m per degree
    g = dem.GlobalGrid(a, ppd=ppd, scale=0.5)
    h, src, _ = tp.patch_heights(10.0, 30.0, fine=None, coarse=None, glob=g)
    assert src == tp.SOURCE_GLOBAL
    assert h[50, 50] == pytest.approx(1000.0, abs=1.0)
    assert h[100, 50] > h[0, 50]  # row 0 = south edge
    tiny = dem.Grid((0.0, 0.0), 40.0, np.zeros((10, 10)))  # does not cover the patch -> skipped
    _, src2, _ = tp.patch_heights(10.0, 30.0, fine=tiny, coarse=tiny, glob=g)
    assert src2 == tp.SOURCE_GLOBAL


def test_nodata_raises():
    z = np.zeros((1000, 1000), dtype=np.int16)
    z[500, 500] = dem.NODATA
    g = dem.Grid((-19980.0, -19980.0), 40.0, z)
    with pytest.raises(RuntimeError):
        tp.patch_heights(-89.9, 0.0, fine=g)


def test_encode_decode_roundtrip():
    h = np.random.default_rng(1).uniform(-5000, 8000, (101, 101))
    buf = tp.encode(h)
    assert len(buf) == 101 * 101 * 2
    assert np.abs(tp.decode(buf) - h).max() <= 0.5 + 1e-9
    with pytest.raises(ValueError):
        tp.decode(buf[:-2])


OUT = REPO_ROOT / "public" / "data" / "v1" / "terrain" / "sites"


def test_committed_layout_matches_sites_json():
    if not (OUT / "index.json").exists():
        pytest.skip("patches not generated")
    idx = json.loads((OUT / "index.json").read_text())
    sites = json.loads((REPO_ROOT / "public/data/v1/sites.json").read_text())["sites"]
    assert (idx["gridSize"], idx["radiusKm"], idx["spacingM"]) == (101, 10, 200)
    assert set(idx["sites"]) == {s["id"] for s in sites}
    total = 0
    for s in sites:
        raw = (OUT / f"{s['id']}.bin").read_bytes()
        total += len(raw)
        assert len(raw) == 101 * 101 * 2
        assert idx["sites"][s["id"]]["source"] in (tp.SOURCE_FINE, tp.SOURCE_GLOBAL, tp.SOURCE_COARSE)
    assert total <= 1_000_000


@pytest.mark.needs_data
def test_centre_height_matches_catalogue():
    sites = json.loads((REPO_ROOT / "public/data/v1/sites.json").read_text())["sites"]
    fine, coarse, glob = dem.load_fine(), dem.load_coarse(), dem.load_global()
    for s in sites:
        h, _, _ = tp.patch_heights(s["lat"], s["lon"], fine, coarse, glob)
        assert abs(h[50, 50] - s["hDemM"]) <= 30.0, s["id"]
