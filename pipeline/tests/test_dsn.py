import numpy as np
import pytest

from lsp import dsn, ephemeris
from lsp.paths import RAW_DIR

pytestmark = pytest.mark.needs_data


@pytest.fixture(scope="module", autouse=True)
def kernels():
    ephemeris.load_kernels(RAW_DIR / "spice")
    yield


def test_stations_constants():
    assert dsn.STATIONS == {
        "goldstone": (35.426, -116.890),
        "madrid": (40.431, -4.248),
        "canberra": (-35.402, 148.981),
    }


def test_shape_and_dtype():
    el = dsn.moon_elevations(ephemeris.year_hours(2028))
    assert el.shape == (8784, 3)
    assert el.dtype == np.int8
    assert el.min() >= -90 and el.max() <= 90


def test_at_least_one_station_most_hours():
    el = dsn.moon_elevations(ephemeris.year_hours(2027))
    assert el.shape == (8760, 3)
    assert np.mean(el.max(axis=1) >= 10) > 0.9


def test_canberra_dominates_south():
    import spiceypy as sp

    hours = ephemeris.year_hours(2027)[: 31 * 24]
    ets = np.array([sp.str2et(s) for s in ephemeris._utc_strings(hours)])
    pos, _ = sp.spkpos("MOON", ets, "J2000", "LT+S", "EARTH")
    dec = np.arcsin(pos[:, 2] / np.linalg.norm(pos, axis=1))
    i = int(np.argmin(dec))
    el = dsn.moon_elevations(hours[i : i + 1])[0]
    assert el[2] > el[0]
