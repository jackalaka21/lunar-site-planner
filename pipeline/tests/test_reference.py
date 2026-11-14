import numpy as np
import pytest

from lsp.reference import (
    DEFAULT_SETTINGS,
    find_event,
    merge_flicker,
    metrics,
    parse_iso,
    sample,
    sample_at,
)


def _runs(*pairs):
    out = []
    for v, k in pairs:
        out += [bool(v)] * k
    return out


def _series(lit, earth, step_min=10, landing_lit=None, landing_earth=None):
    s = {
        "stepMin": step_min,
        "lit": np.array(lit, dtype=bool),
        "earthIn": np.array(earth, dtype=bool),
        "power": np.array(lit, dtype=float),
    }
    if landing_lit is not None:
        s["landingLit"] = np.array(landing_lit, dtype=bool)
        s["landingEarthIn"] = np.array(landing_earth, dtype=bool)
    return s


def test_merge_flicker():
    a = np.array(_runs((1, 3), (0, 2), (1, 3), (0, 3), (1, 2), (0, 1)))
    m, n = merge_flicker(a, step_min=10, merge_min=30)
    # 2-sample (20 min) gap merged; 3-sample (30 min) gap kept; trailing gap is unbounded so kept
    assert n == 1
    assert list(m) == _runs((1, 8), (0, 3), (1, 2), (0, 1))
    m0, n0 = merge_flicker(a, 10, 0)
    assert n0 == 0 and (m0 == a).all()


def test_metrics_counts():
    # 100 samples at 10 min. lit: 40 on, 15 off, 5 on, 2 off (flicker), 30 on, 8 off
    lit = _runs((1, 40), (0, 15), (1, 5), (0, 2), (1, 30), (0, 8))
    earth = _runs((1, 60), (0, 10), (1, 30))
    s = _series(lit, earth)
    st = dict(DEFAULT_SETTINGS, batteryH=24, flickerMergeMin=30)
    m = metrics(s, st)
    # merged lit: 40 on, 15 off, 37 on, 8 off -> 77 lit samples
    assert m["flickersMergedLit"] == 1
    assert m["litHours"] == pytest.approx(77 * 10 / 60)
    assert m["litPct"] == pytest.approx(77.0)
    assert m["earthHours"] == pytest.approx(90 * 10 / 60)
    assert m["longestDarkH"] == pytest.approx(15 * 10 / 60)
    assert m["longestDarkStartH"] == pytest.approx(40 * 10 / 60)
    assert m["longestCommsGapH"] == pytest.approx(10 * 10 / 60)
    assert m["firstSunsetH"] == pytest.approx(40 * 10 / 60)
    both = np.array(_runs((1, 40), (0, 15), (1, 37), (0, 8))) & np.array(earth)
    assert m["bothHours"] == pytest.approx(both.sum() * 10 / 60)
    assert m["bothPct"] == pytest.approx(float(both.sum()))
    assert m["verdict"] == "Good" and m["landingOk"] is True
    m0 = metrics(s, dict(st, flickerMergeMin=0))
    assert m0["flickersMergedLit"] == 0 and m0["litHours"] == pytest.approx(75 * 10 / 60)


def test_verdict_rules():
    st = dict(DEFAULT_SETTINGS, batteryH=24)
    n = 1000
    assert metrics(_series([1] * n, [1] * n), st)["verdict"] == "Good"
    lit = _runs((1, 400), (0, 180), (1, 420))  # 30 h dark: above battery, below 2x
    mid = metrics(_series(lit, [1] * n), st)
    assert mid["verdict"] == "Marginal" and mid["longestDarkH"] == pytest.approx(30.0)
    lit = _runs((1, 400), (0, 360), (1, 240))  # 60 h dark > 2 x 24
    poor = metrics(_series(lit, [1] * n), st)
    assert poor["verdict"] == "Poor" and "darkness" in poor["reason"] and "T+" in poor["reason"]
    p2 = metrics(_series([1] * n, _runs((1, 100), (0, 900))), st)
    assert p2["verdict"] == "Poor" and p2["bothPct"] == pytest.approx(10.0)
    p3 = metrics(_series([1] * n, [0] * n), st)
    assert p3["verdict"] == "Poor" and "never" in p3["reason"].lower()
    lit = _runs((1, 500), (0, 144))  # 24 h dark == battery, both = 500/644 >= 50%
    g = metrics(_series(lit, [1] * 644), st)
    assert g["longestDarkH"] == pytest.approx(24.0)
    assert g["verdict"] == "Good"


def test_landing_check():
    st = dict(DEFAULT_SETTINGS)
    n = 500
    ok = metrics(_series([1] * n, [1] * n, landing_lit=[1] * 7, landing_earth=[1] * 7), st)
    assert ok["landingOk"] and ok["verdict"] == "Good"
    dark = metrics(_series([1] * n, [1] * n, landing_lit=[1, 1, 0, 1, 1, 1, 1], landing_earth=[1] * 7), st)
    assert dark["verdict"] == "Poor" and dark["reason"] == "Landing in darkness" and not dark["landingOk"]
    ne = metrics(_series([1] * n, [1] * n, landing_lit=[1] * 7, landing_earth=[1] * 6 + [0]), st)
    assert ne["verdict"] == "Poor" and ne["reason"] == "No DTE during descent"


def _case(lat=-90.0, lon=0.0, t0="2027-03-01T00:00:00Z", **over):
    return {
        "lat": lat,
        "lon": lon,
        "hDemM": 0.0,
        "horizon": {"stepDeg": 0.5, "values": np.full(720, -0.0869)},
        "t0Ms": parse_iso(t0),
        "settings": dict(DEFAULT_SETTINGS, **over),
    }


def test_sample_shapes_and_range():
    s = sample(_case(durationDays=2))
    assert len(s["sunEl"]) == 2 * 144 + 1
    assert s["tMs"][1] - s["tMs"][0] == 600_000
    assert len(s["landingLit"]) == 7
    assert np.all((s["sunFrac"] >= 0) & (s["sunFrac"] <= 1))
    assert np.abs(s["sunEl"]).max() < 2.5  # pole: Sun stays in the libration band


def test_cross_year_sampling_continuous():
    s = sample(_case(lat=-85.3, lon=31.2, t0="2027-12-28T00:00:00Z", durationDays=8))
    assert np.abs(np.diff(s["sunEl"])).max() < 1.0  # no jump at the year boundary


def test_find_event_bisects_to_minute():
    c = _case(lat=0.0, lon=0.0, durationDays=30)
    t0 = c["t0Ms"]
    ev = find_event(c, t0, "sunset")
    assert ev is not None and (ev - t0) % 60000 == 0
    before = bool(sample_at(c, np.array([ev - 60000]))["lit"][0])
    at = bool(sample_at(c, np.array([ev]))["lit"][0])
    assert before is True and at is False


def test_fixture_file_shape():
    import json

    from lsp.fixtures import OUT

    doc = json.loads(OUT.read_text())
    assert doc["version"] == 1 and len(doc["cases"]) >= 10
    for c in doc["cases"]:
        assert {"name", "lat", "lon", "hDemM", "horizon", "t0Utc", "settings", "expect"} <= set(c)
        assert [s["i"] for s in c["expect"]["samplesAt"]][0] == 0
        assert len(c["horizon"]["values"]) == 720
