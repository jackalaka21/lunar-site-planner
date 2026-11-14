import json
from datetime import datetime, timezone

import numpy as np
import pytest

from lsp import ephemeris
from lsp.paths import RAW_DIR

KERNELS = RAW_DIR / "spice"
pytestmark = pytest.mark.needs_data


@pytest.fixture(scope="module", autouse=True)
def kernels():
    ephemeris.load_kernels(KERNELS)
    yield


def _angle_deg(a, b):
    c = np.sum(a * b, axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))
    return np.degrees(np.arccos(np.clip(c, -1, 1)))


def test_vectors_magnitudes():
    v = ephemeris.body_vectors(np.array(["2027-01-01T00:00"], dtype="datetime64[m]"))
    assert v.shape == (1, 6)
    assert 356000 <= np.linalg.norm(v[0, 3:6]) <= 407000
    assert 1.47e8 <= np.linalg.norm(v[0, 0:3]) <= 1.53e8


def test_year_record_count(tmp_path):
    assert ephemeris.read_year(ephemeris.write_year(2028, tmp_path)).shape == (8784, 6)
    assert ephemeris.read_year(ephemeris.write_year(2027, tmp_path)).shape == (8760, 6)


def test_interp_error_small(tmp_path):
    arr = ephemeris.read_year(ephemeris.write_year(2027, tmp_path)).astype(np.float64)
    rng = np.random.default_rng(1)
    h = rng.uniform(0, 8758, 200)
    t = np.datetime64("2027-01-01T00:00:00", "ms") + (h * 3600000).astype("int64").astype("timedelta64[ms]")
    direct = ephemeris.body_vectors(t)
    i = np.floor(h).astype(int)
    f = (h - i)[:, None]
    lin = arr[i] * (1 - f) + arr[i + 1] * f
    assert _angle_deg(lin[:, 0:3], direct[:, 0:3]).max() < 0.001
    assert _angle_deg(lin[:, 3:6], direct[:, 3:6]).max() < 0.001


def test_coverage_covers_range():
    start, end = ephemeris.pck_coverage_utc()
    assert start <= datetime(1969, 1, 1, tzinfo=timezone.utc) and end >= datetime(
        2035, 12, 31, 23, tzinfo=timezone.utc
    ), f"PCK coverage is {start} .. {end}"


def test_index_json(tmp_path):
    p = ephemeris.write_index(tmp_path, KERNELS, 1969, 2035)
    d = json.loads(p.read_text())
    assert d["frame"] == "MOON_ME" and d["abcorr"] == "LT+S" and d["stepHours"] == 1
    assert d["epochUtc"] == "1969-01-01T00:00:00Z"
    assert len(d["kernels"]) == 5 and all(len(k["sha256"]) == 64 for k in d["kernels"])
