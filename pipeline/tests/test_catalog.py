import json
import re
from pathlib import Path

import pytest

from lsp import catalog

REQUIRED = [
    "apollo-11", "apollo-12", "apollo-14", "apollo-15", "apollo-16", "apollo-17",
    "im-1", "im-2", "blue-ghost-1", "chandrayaan-3", "change-3", "change-4", "change-5",
    "change-6", "slim", "shackleton-rim", "connecting-ridge", "malapert-massif", "mons-mouton",
]
GROUPS = {"apollo", "clps", "international", "artemis3", "polar"}
SRC = json.loads(catalog.SOURCE_PATH.read_text(encoding="utf-8"))


def test_every_site_has_source():
    for s in SRC:
        assert re.match(r"^https://", s.get("source_url", "")), s["id"]
        assert s["notes"].strip(), s["id"]


def test_ids_unique_kebab():
    ids = [s["id"] for s in SRC]
    assert len(ids) == len(set(ids))
    for i in ids:
        assert re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", i), i


def test_lat_lon_ranges():
    for s in SRC:
        assert -90 <= s["lat"] <= 90, s["id"]
        assert -180 <= s["lon"] <= 180, s["id"]


def test_required_ids_present():
    ids = {s["id"] for s in SRC}
    assert set(REQUIRED) <= ids
    assert any(i.startswith("artemis3-") for i in ids)


def test_count_at_least_25():
    assert len(SRC) >= 25


def test_groups_valid():
    for s in SRC:
        assert s["group"] in GROUPS, s["id"]


def test_copy_rules():
    for s in SRC:
        for f in ("name", "notes", "outcome"):
            t = s.get(f, "")
            assert "!" not in t, (s["id"], f)
            assert not re.search(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]", t), (s["id"], f)
        if "actual_landing_utc" in s:
            assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\dZ", s["actual_landing_utc"]), s["id"]


@pytest.mark.needs_data
def test_build_adds_hdem_and_schema(tmp_path):
    out = tmp_path / "sites.json"
    doc = catalog.build(out)
    assert json.loads(out.read_text(encoding="utf-8")) == doc
    assert doc["checkedUtc"].endswith("Z")
    assert len(doc["sites"]) == len(SRC)
    for s in doc["sites"]:
        assert s["horizon"] == "site"
        assert isinstance(s["hDemM"], (int, float)) and -10000 < s["hDemM"] < 12000, s["id"]
    by = {s["id"]: s for s in doc["sites"]}
    # Apollo 11 sits in Mare Tranquillitatis: low elevation vs reference sphere.
    assert -3000 < by["apollo-11"]["hDemM"] < 0
    # Mons Mouton is a high plateau.
    assert by["mons-mouton"]["hDemM"] > 1000
