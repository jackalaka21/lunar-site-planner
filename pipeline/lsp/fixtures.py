"""Generate pipeline/fixtures/engine_cases.json: cross-language cases for the TS engine.

Run: python -m lsp.fixtures   (from pipeline/)
The TS engine must reproduce every expected number within 1e-6 deg (angles) / 1e-9 (fractions).
Horizon values are written out in full for every case, so the TS tests do not need to rebuild them.
"""

import json
import math
from pathlib import Path

import numpy as np

from .constants import OBS_HEIGHT_M, R_MOON_KM
from .paths import REPO_ROOT
from .reference import DEFAULT_SETTINGS, find_event, metrics, parse_iso, sample, to_iso

OUT = REPO_ROOT / "pipeline/fixtures/engine_cases.json"
STEP_DEG = 0.5


def dip_deg(h_obs_m: float = OBS_HEIGHT_M) -> float:
    """Geometric horizon dip of an observer h metres above a smooth sphere of radius R_moon."""
    h = h_obs_m / 1000.0
    return math.degrees(math.atan(math.sqrt(h * (2 * R_MOON_KM + h)) / R_MOON_KM))


def horizon(kind: str) -> dict:
    az = np.arange(720) * STEP_DEG
    if kind == "flat":
        vals = np.full(720, -dip_deg())
    elif kind == "ridge":
        vals = 2.0 * np.maximum(0.0, np.cos(np.radians(az - 120.0)))
    elif kind == "teeth":
        # alternating low/high samples: a 1 deg-period triangle wave (about 2 h at the pole) whose crests
        # just clear the Sun, so the Sun blinks in and out for 10-30 minute gaps (flicker test)
        vals = np.where(np.arange(720) % 2 == 0, -0.4, 1.4)
    else:
        raise ValueError(kind)
    return {"stepDeg": STEP_DEG, "kind": "values" if kind == "teeth" else kind, "values": [float(v) for v in vals]}


def make_case(name, lat, lon, h_dem, hz, t0, **settings):
    return {
        "name": name,
        "lat": lat,
        "lon": lon,
        "hDemM": h_dem,
        "horizon": horizon(hz),
        "t0Utc": t0,
        "settings": {**DEFAULT_SETTINGS, **settings},
    }


CASES = [
    make_case("south-pole-flat", -90.0, 0.0, 0.0, "flat", "2027-12-01T00:00:00Z"),
    make_case("south-pole-ridge", -90.0, 0.0, 0.0, "ridge", "2027-12-01T00:00:00Z"),
    make_case("south-pole-ridge-winter", -90.0, 0.0, 0.0, "ridge", "2027-03-01T00:00:00Z"),
    make_case("mons-mouton-area-synthetic", -84.65, 31.2, 1500.0, "ridge", "2027-12-01T00:00:00Z"),
    make_case("apollo11-flat", 0.67409, 23.47298, 0.0, "flat", "1969-07-20T20:18:00Z"),
    make_case("change4-farside-flat", -45.4446, 177.5991, 0.0, "flat", "2019-01-03T02:26:00Z"),
    make_case("cross-year-2027-2028", -85.3, 31.2, 1500.0, "ridge", "2027-12-25T00:00:00Z"),
    make_case("eclipse-2025-09-07", 0.0, 0.0, 0.0, "flat", "2025-09-07T10:00:00Z", durationDays=4),
    make_case("eclipse-2025-03-14", 0.0, 0.0, 0.0, "flat", "2025-03-14T04:00:00Z", durationDays=4),
    make_case("lit-any-mons-mouton", -84.65, 31.2, 1500.0, "ridge", "2027-12-01T00:00:00Z", litThreshold="any"),
    make_case("lit-full-mons-mouton", -84.65, 31.2, 1500.0, "ridge", "2027-12-01T00:00:00Z", litThreshold="full"),
    make_case("flicker-0-pole-teeth", -90.0, 0.0, 0.0, "teeth", "2027-12-01T00:00:00Z", flickerMergeMin=0),
    make_case("flicker-30-pole-teeth", -90.0, 0.0, 0.0, "teeth", "2027-12-01T00:00:00Z", flickerMergeMin=30),
    make_case(
        "fixed-panel-margin-battery",
        -80.0, 10.0, 800.0, "ridge", "2028-01-10T00:00:00Z",
        panel={"mode": "fixed", "azDeg": 90}, earthMarginDeg=2, batteryH=48, durationDays=10,
    ),
    make_case("landing-in-darkness-equator", 0.0, 0.0, 0.0, "flat", "2027-03-12T00:00:00Z", durationDays=5),
]


def _tolist(a):
    return [x.item() for x in a]


def build_case(case: dict) -> dict:
    c = {
        "lat": case["lat"],
        "lon": case["lon"],
        "hDemM": case["hDemM"],
        "horizon": {"stepDeg": STEP_DEG, "values": case["horizon"]["values"]},
        "t0Ms": parse_iso(case["t0Utc"]),
        "settings": case["settings"],
    }
    s = sample(c)
    n = len(s["sunEl"])
    idx = sorted({i for i in (0, 1, 500, n - 1) if i < n})
    if s["eclipseFrac"].max() > 0:
        idx = sorted(set(idx) | {int(np.argmax(s["eclipseFrac"]))})
    samples = []
    for i in idx:
        samples.append(
            {
                "i": i,
                "tUtc": to_iso(int(s["tMs"][i])),
                "sunAz": float(s["sunAz"][i]),
                "sunEl": float(s["sunEl"][i]),
                "sunFrac": float(s["sunFrac"][i]),
                "terrainFrac": float(s["terrainFrac"][i]),
                "earthAz": float(s["earthAz"][i]),
                "earthEl": float(s["earthEl"][i]),
                "eclipseFrac": float(s["eclipseFrac"][i]),
                "earthIn": bool(s["earthIn"][i]),
                "lit": bool(s["lit"][i]),
                "power": float(s["power"][i]),
                "sunEarthSepDeg": float(s["sepDeg"][i]),
            }
        )
    m = metrics(s, c["settings"])
    ev = {k: to_iso(find_event(c, c["t0Ms"], k)) for k in ("sunset", "sunrise", "earthset", "earthrise")}
    out = {k: v for k, v in case.items()}
    out["expect"] = {"nSamples": n, "samplesAt": samples, "metrics": m, "events": ev}
    return out


def main() -> None:
    doc = {"version": 1, "cases": [build_case(c) for c in CASES]}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KiB, {len(doc['cases'])} cases)")
    for c in doc["cases"]:
        m = c["expect"]["metrics"]
        print(
            f"{c['name']:34s} lit {m['litPct']:5.1f} earth {m['earthPct']:5.1f} both {m['bothPct']:5.1f}"
            f" dark {m['longestDarkH']:6.1f} fl {m['flickersMergedLit']}/{m['flickersMergedEarth']}"
            f" land {m['landingOk']} {m['verdict']}: {m['reason']}"
        )


if __name__ == "__main__":
    main()
