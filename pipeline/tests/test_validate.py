import json

import pytest

from lsp import validate

# The only accepted failure (R25/R26): Shackleton rim Earth, any-part-visible (PGDA definition) vs the PGDA pixel misses by about 16
# points (sub-pixel spread of the 3x3 points 0 to 49 %, PGDA surface level vs our 2 m mast, DEM resolution). Published as pass: false.
KNOWN_FAILURES = {
    "Average Earth in view %, Shackleton rim, any part of the disc visible, 3x3 points, vs PGDA",
}

KEYS = {"name", "value", "reference", "tolerance", "pass", "source_url", "note"}


def check_shape(e):
    assert KEYS <= set(e), e
    assert isinstance(e["name"], str) and e["name"]
    assert e["pass"] in (True, False, None)
    assert isinstance(e["note"], str) and e["note"]
    assert e["source_url"].startswith("https://")
    if e["pass"] is not None:
        assert e["tolerance"] is not None


def test_entry_helper_shape():
    check_shape(validate.entry("x", 1, 0, 0.05, True, "https://example.org", note="n"))


@pytest.mark.needs_data
def test_pole_and_eclipse_and_replay_shapes():
    check_shape(validate.pole_sun_check())
    for e in validate.eclipse_checks() + validate.replay_checks():
        check_shape(e)


@pytest.mark.needs_data
def test_committed_report_shape_and_no_failures():
    path = validate.OUT
    if not path.exists():
        pytest.skip("validation.json not generated")
    rep = json.loads(path.read_text())
    assert {"generatedUtc", "horizons", "interp", "illumination", "eclipses", "replays"} <= set(rep)
    for e in validate.all_entries(rep):
        check_shape(e)
        if e["name"] in KNOWN_FAILURES:
            assert e["pass"] is False  # documented; if it starts passing, drop it from the allowlist
            continue
        assert e["pass"] is not False, e["name"]  # fails on any failed check; null (info) entries are allowed
    assert any(e["pass"] is None for e in rep["replays"])  # IM-2 informational
