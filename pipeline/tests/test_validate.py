import json

import pytest

from lsp import validate

KEYS = {"name", "value", "reference", "tolerance", "pass", "source_url"}


def check_shape(e):
    assert KEYS <= set(e), e
    assert isinstance(e["name"], str) and e["name"]
    assert e["pass"] in (True, False, None)
    assert e["source_url"].startswith("https://")
    if e["pass"] is not None:
        assert e["tolerance"] is not None


def test_entry_helper_shape():
    check_shape(validate.entry("x", 1, 0, 0.05, True, "https://example.org"))


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
        assert e["pass"] is not False, e["name"]
    assert any(e["pass"] is None for e in rep["replays"])  # IM-2 informational
