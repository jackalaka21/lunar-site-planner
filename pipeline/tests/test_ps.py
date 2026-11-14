import json
from pathlib import Path

import numpy as np
import pytest

from lsp import ps

FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "ps.json"


def test_ps_roundtrip():
    rng = np.random.default_rng(1)
    lat = rng.uniform(-90, -75, 1000)
    lon = rng.uniform(-180, 180, 1000)
    lat2, lon2 = ps.to_latlon(*ps.to_xy(lat, lon))
    assert np.max(np.abs(lat2 - lat)) < 1e-9
    d = (lon2 - lon + 180) % 360 - 180
    assert np.max(np.abs(d)) < 1e-9


def test_ps_pole_is_origin():
    for lon in (0, 33.3, -120, 180):
        x, y = ps.to_xy(-90, lon)
        assert x == pytest.approx(0, abs=1e-9) and y == pytest.approx(0, abs=1e-9)


def test_ps_lon0_is_plus_y():
    x, y = ps.to_xy(-80, 0)
    assert abs(x) < 1e-9 and y > 0
    x, y = ps.to_xy(-80, 90)
    assert x > 0 and abs(y) < 1e-6


def test_ps_matches_proj_within_1e6_m():
    pyproj = pytest.importorskip("pyproj")
    t = pyproj.Transformer.from_crs(
        "+proj=longlat +R=1737400 +no_defs", ps.PROJ_STRING, always_xy=True
    )
    rng = np.random.default_rng(2)
    lat = rng.uniform(-90, -70, 500)
    lon = rng.uniform(-180, 180, 500)
    px, py = t.transform(lon, lat)
    x, y = ps.to_xy(lat, lon)
    assert np.max(np.abs(px - x)) < 1e-6 and np.max(np.abs(py - y)) < 1e-6
    # lon 0 -> +y in PROJ too
    px, py = t.transform(0.0, -80.0)
    assert abs(px) < 1e-6 and py > 0


def test_fixture_matches_formulas():
    rows = json.loads(FIXTURE.read_text())
    assert len(rows) == 5
    for r in rows:
        x, y = ps.to_xy(r["lat"], r["lon"])
        assert x == pytest.approx(r["x"], abs=1e-6) and y == pytest.approx(r["y"], abs=1e-6)
