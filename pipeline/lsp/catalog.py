"""Curated site catalogue: sources plus DEM heights -> public/data/v1/sites.json.

pipeline/catalog/sites_source.json holds hand-researched entries (every one with a source_url).
build() copies them, adds hDemM (metres above the 1737.4 km reference sphere, sampled from the
fine, coarse or global DEM) and checkedUtc, and writes sites.json.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import dem, ps
from .paths import REPO_ROOT

SOURCE_PATH = Path(__file__).resolve().parents[1] / "catalog" / "sites_source.json"
OUT_PATH = REPO_ROOT / "public" / "data" / "v1" / "sites.json"

FIELDS = ("id", "name", "group", "lat", "lon")
OPTIONAL = ("actual_landing_utc", "outcome")


def sample_height(lat, lon, fine=None, coarse=None, glob=None):
    """Height in metres at (lat, lon): fine DEM, else coarse, else global (whichever has data first)."""
    fine = fine or dem.load_fine()
    coarse = coarse or dem.load_coarse()
    glob = glob or dem.load_global()
    h = float("nan")
    if lat <= -80.0:
        x, y = ps.to_xy(lat, lon)
        h = fine.sample(x, y)
        if not np.isfinite(h) and np.hypot(x, y) <= dem.POLAR_USE_HALF:
            h = coarse.sample(x, y)
    if not np.isfinite(h):
        h = glob.sample(lat, lon)
    if not np.isfinite(h):
        raise ValueError(f"no DEM height at lat={lat}, lon={lon}")
    return round(float(h), 1)


def build(out_path=OUT_PATH, checked_utc=None):
    src = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    fine, coarse, glob = dem.load_fine(), dem.load_coarse(), dem.load_global()
    sites = []
    for s in src:
        if not s.get("source_url"):
            raise ValueError(f"{s['id']}: missing source_url")
        site = {k: s[k] for k in FIELDS}
        site["hDemM"] = sample_height(s["lat"], s["lon"], fine, coarse, glob)
        site["source_url"] = s["source_url"]
        site["notes"] = s["notes"]
        for k in OPTIONAL:
            if k in s:
                site[k] = s[k]
        site["horizon"] = "site"
        sites.append(site)
    if checked_utc is None:
        checked_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    doc = {"checkedUtc": checked_utc, "sites": sites}
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return doc


if __name__ == "__main__":
    d = build()
    print(f"wrote {OUT_PATH} ({len(d['sites'])} sites)")
