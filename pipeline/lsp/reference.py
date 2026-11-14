"""Python reference engine (the oracle for the TypeScript engine). Spec 7.2 to 7.8.

Conventions fixed here (the TS engine and fixtures must match):
- Time is UTC milliseconds since the Unix epoch. The ephemeris hour grid starts 1969-01-01T00:00Z;
  hour index = floor((t - epoch)/3600 s), fraction = remainder/3600 s, linear interpolation.
- Sample step 10 min. Mission window [T0, T0 + D] inclusive: n = D*144 + 1 samples.
- Lit: sunFrac >= 0.5 ('half'), > 0 ('any'), >= 0.99 ('full'). sunFrac = terrain fraction x (1 - eclipse fraction).
- Earth in view: Earth centre elevation >= H(earthAz) + earthMarginDeg.
- Flicker merge: a False run strictly bounded by True on both sides with length*step < flickerMergeMin
  minutes is set True. Applied to lit and earthIn separately, before both / longest runs / countdowns.
- Hours = samples * step / 60; percentages = samples / n * 100 (n includes the inclusive end sample).
- Verdict precedence (ruling R8), first match wins:
  1. Earth never in view in the window -> Poor "Earth never in view (relay needed)".
  2. Landing check fails -> Poor "Landing in darkness" (any unlit landing sample, checked first) or
     "No DTE during descent" (lit throughout, Earth out of view at some sample).
  3. longestDarkH > 2*batteryH -> Poor "<N> h darkness starting T+<d> d".
  4. bothPct < 20 -> Poor "Only <P>% sun + Earth".
  5. bothPct >= 50 and longestDarkH <= batteryH -> Good; otherwise Marginal.
- Landing check: samples at T0 - 60 min .. T0 every 10 min (7 samples), raw (unmerged) lit and earthIn.
"""

import json
import math
from datetime import datetime, timedelta, timezone

import numpy as np

from .constants import OBS_HEIGHT_M, R_EARTH_KM, R_SUN_KM
from .geometry import (
    angular_separation_deg,
    disc_fraction,
    eclipse_fraction,
    horizon_at,
    site_frame,
    topocentric,
)
from .paths import REPO_ROOT

EPHEMERIS_DIR = REPO_ROOT / "public/data/v1/ephemeris"
EPOCH_MS = -31_536_000_000  # 1969-01-01T00:00:00Z
STEP_MIN = 10
STEP_MS = STEP_MIN * 60_000
LIT_FULL_FRACTION = 0.99
LOOKAHEAD_DAYS = 60

DEFAULT_SETTINGS = {
    "litThreshold": "half",
    "earthMarginDeg": 0,
    "durationDays": 14,
    "batteryH": 24,
    "flickerMergeMin": 30,
    "interferenceDeg": 2,
    "dsnEnabled": False,
    "dsnMaskDeg": 10,
    "horizonUncertDeg": 0.3,
    "ellipseKm": 2,
    "mastM": 2,
    "panel": {"mode": "tracking"},
    "axis": "met",
    "displayTz": "UTC",
}

# Verdict thresholds (spec 7.6)
GOOD_BOTH_PCT = 50.0
POOR_BOTH_PCT = 20.0


def utc_ms(dt: datetime) -> int:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int((dt - datetime(1970, 1, 1, tzinfo=timezone.utc)) // timedelta(milliseconds=1))


def parse_iso(s: str) -> int:
    return utc_ms(datetime.fromisoformat(s.replace("Z", "+00:00")))


def to_iso(ms: int | None) -> str | None:
    if ms is None:
        return None
    return (datetime(1970, 1, 1, tzinfo=timezone.utc) + timedelta(milliseconds=int(ms))).strftime("%Y-%m-%dT%H:%M:%SZ")


_EPH: np.ndarray | None = None


def _load_ephemeris() -> np.ndarray:
    global _EPH
    if _EPH is None:
        idx = json.loads((EPHEMERIS_DIR / "index.json").read_text())
        parts = [
            np.fromfile(EPHEMERIS_DIR / f"{y}.bin", dtype="<f4").reshape(-1, 6)
            for y in range(idx["firstYear"], idx["lastYear"] + 1)
        ]
        _EPH = np.concatenate(parts).astype(np.float64)
    return _EPH


def ephemeris_at(t_ms) -> np.ndarray:
    """(N, 6) float64 km [sun xyz, earth xyz], MOON_ME, linearly interpolated per the hourly grid."""
    eph = _load_ephemeris()
    t = np.asarray(t_ms, dtype=np.int64)
    off = t - EPOCH_MS
    h = np.floor_divide(off, 3_600_000)
    frac = (off - h * 3_600_000) / 3_600_000.0
    if h.min() < 0 or h.max() > len(eph) - 1:
        raise ValueError("time outside ephemeris range")
    h1 = np.minimum(h + 1, len(eph) - 1)
    return eph[h] * (1.0 - frac)[:, None] + eph[h1] * frac[:, None]


def _is_lit(frac: float, threshold: str) -> bool:
    if threshold == "any":
        return frac > 0.0
    if threshold == "full":
        return frac >= LIT_FULL_FRACTION
    return frac >= 0.5


def sample_at(case: dict, t_ms) -> dict:
    """Evaluate states at arbitrary UTC ms times. Returns a dict of numpy arrays."""
    st = case["settings"]
    prof = case["horizon"]["values"]
    step = case["horizon"]["stepDeg"]
    frame = site_frame(case["lat"], case["lon"], case["hDemM"], float(st.get("mastM", OBS_HEIGHT_M)))
    p = frame[0]
    t_ms = np.asarray(t_ms, dtype=np.int64)
    eph = ephemeris_at(t_ms)
    n = len(t_ms)
    keys = ["sunAz", "sunEl", "sunR", "terrainFrac", "eclipseFrac", "sunFrac", "earthAz", "earthEl",
            "earthH", "power", "sepDeg"]
    out = {k: np.empty(n) for k in keys}
    out["lit"] = np.empty(n, dtype=bool)
    out["earthIn"] = np.empty(n, dtype=bool)
    panel = st["panel"]
    margin = float(st["earthMarginDeg"])
    for i in range(n):
        sun, earth = eph[i, 0:3], eph[i, 3:6]
        saz, sel, sr, _ = topocentric(sun, frame, R_SUN_KM)
        eaz, eel, er, _ = topocentric(earth, frame, R_EARTH_KM)
        vs, ve = sun - p, earth - p
        sep = angular_separation_deg(vs, ve)
        tfrac = disc_fraction(sel, horizon_at(prof, step, saz), sr)
        ecl = eclipse_fraction(sep, sr, er)
        frac = tfrac * (1.0 - ecl)
        eh = horizon_at(prof, step, eaz)
        if panel["mode"] == "fixed":
            factor = max(0.0, math.cos(math.radians(sel)) * math.cos(math.radians(saz - panel["azDeg"])))
        else:
            factor = max(0.0, math.cos(math.radians(sel)))
        out["sunAz"][i], out["sunEl"][i], out["sunR"][i] = saz, sel, sr
        out["terrainFrac"][i], out["eclipseFrac"][i], out["sunFrac"][i] = tfrac, ecl, frac
        out["earthAz"][i], out["earthEl"][i], out["earthH"][i] = eaz, eel, eh
        out["power"][i] = frac * factor
        out["sepDeg"][i] = sep
        out["lit"][i] = _is_lit(frac, st["litThreshold"])
        out["earthIn"][i] = eel >= eh + margin
    out["tMs"] = t_ms
    return out


def window_times(case: dict) -> np.ndarray:
    n = int(round(case["settings"]["durationDays"] * 24 * 6)) + 1
    return case["t0Ms"] + np.arange(n, dtype=np.int64) * STEP_MS


def sample(case: dict) -> dict:
    """Mission window samples plus the 7 landing-check samples ([T0-1h, T0] every 10 min)."""
    out = sample_at(case, window_times(case))
    land = sample_at(case, case["t0Ms"] + np.arange(-6, 1, dtype=np.int64) * STEP_MS)
    out["landingLit"] = land["lit"]
    out["landingEarthIn"] = land["earthIn"]
    out["stepMin"] = STEP_MIN
    return out


def merge_flicker(a, step_min: float, merge_min: float):
    """Fill False runs bounded on both sides by True whose length*step < merge_min. Returns (merged, count)."""
    a = np.asarray(a, dtype=bool)
    m = a.copy()
    n = len(a)
    count = 0
    i = 0
    while i < n:
        if a[i]:
            i += 1
            continue
        j = i
        while j < n and not a[j]:
            j += 1
        if i > 0 and j < n and (j - i) * step_min < merge_min:
            m[i:j] = True
            count += 1
        i = j
    return m, count


def _longest_run(mask) -> tuple[int, int]:
    """(length, start index) of the longest True run; (0, 0) if none. First run wins ties."""
    best, best_i, i, n = 0, 0, 0, len(mask)
    while i < n:
        if not mask[i]:
            i += 1
            continue
        j = i
        while j < n and mask[j]:
            j += 1
        if j - i > best:
            best, best_i = j - i, i
        i = j
    return best, best_i


def metrics(series: dict, settings: dict) -> dict:
    """Window metrics, verdict and reason. series needs lit, earthIn, power, stepMin
    (landingLit / landingEarthIn optional)."""
    step = float(series.get("stepMin", STEP_MIN))
    n = len(series["lit"])
    lit, f_lit = merge_flicker(series["lit"], step, settings["flickerMergeMin"])
    earth, f_earth = merge_flicker(series["earthIn"], step, settings["flickerMergeMin"])
    both = lit & earth
    hrs = step / 60.0
    dark_len, dark_i = _longest_run(~lit)
    gap_len, gap_i = _longest_run(~earth)
    first_sunset = None
    seen_lit = False
    for i in range(n):
        if lit[i]:
            seen_lit = True
        elif seen_lit:
            first_sunset = i * hrs
            break

    landing_ok, landing_reason = True, None
    if "landingLit" in series:
        if not np.all(series["landingLit"]):
            landing_ok, landing_reason = False, "Landing in darkness"
        elif not np.all(series["landingEarthIn"]):
            landing_ok, landing_reason = False, "No DTE during descent"

    pct = lambda k: 100.0 * k / n  # noqa: E731
    both_pct = pct(int(both.sum()))
    dark_h = dark_len * hrs
    battery = float(settings["batteryH"])
    dark_txt = f"{round(dark_h)} h darkness starting T+{int(dark_i * hrs // 24)} d"

    if int(earth.sum()) == 0:
        verdict, reason = "Poor", "Earth never in view (relay needed)"
    elif not landing_ok:
        verdict, reason = "Poor", landing_reason
    elif dark_h > 2 * battery:
        verdict, reason = "Poor", dark_txt
    elif both_pct < POOR_BOTH_PCT:
        verdict, reason = "Poor", f"Only {both_pct:.0f}% sun + Earth"
    elif both_pct >= GOOD_BOTH_PCT and dark_h <= battery:
        verdict, reason = "Good", f"{both_pct:.0f}% lit with Earth in view, longest darkness {round(dark_h)} h"
    elif dark_h > battery:
        verdict, reason = "Marginal", f"{dark_txt}, over the {battery:g} h battery reserve"
    else:
        verdict, reason = "Marginal", f"Lit with Earth in view {both_pct:.0f}% of the window"

    return {
        "samples": n,
        "stepMin": step,
        "litHours": int(lit.sum()) * hrs,
        "litPct": pct(int(lit.sum())),
        "earthHours": int(earth.sum()) * hrs,
        "earthPct": pct(int(earth.sum())),
        "bothHours": int(both.sum()) * hrs,
        "bothPct": both_pct,
        "longestDarkH": dark_h,
        "longestDarkStartH": dark_i * hrs if dark_len else None,
        "longestCommsGapH": gap_len * hrs,
        "longestCommsGapStartH": gap_i * hrs if gap_len else None,
        "firstSunsetH": first_sunset,
        "meanPower": float(np.mean(series["power"])),
        "flickersMergedLit": f_lit,
        "flickersMergedEarth": f_earth,
        "landingOk": landing_ok,
        "verdict": verdict,
        "reason": reason,
    }


def find_event(case: dict, from_ms: int, kind: str) -> int | None:
    """First 'sunset' | 'sunrise' | 'earthset' | 'earthrise' at or after from_ms, UTC ms on a whole
    minute offset from from_ms (first minute in the new state), or None within 60 days.
    Detected on flicker-merged 10-min states, then bisected to 1 min on raw states."""
    if kind not in ("sunset", "sunrise", "earthset", "earthrise"):
        raise ValueError(kind)
    key = "lit" if kind.startswith("sun") else "earthIn"
    new_state = not kind.endswith("set")  # set: True -> False, rise: False -> True
    n = LOOKAHEAD_DAYS * 144 + 1
    times = from_ms + np.arange(n, dtype=np.int64) * STEP_MS
    raw = sample_at(case, times)[key]
    merged, _ = merge_flicker(raw, STEP_MIN, case["settings"]["flickerMergeMin"])
    for i in range(n - 1):
        if merged[i] != new_state and merged[i + 1] == new_state:
            break
    else:
        return None
    lo, hi = 0, STEP_MIN  # minutes from times[i]; state(lo) is old, state(hi) is new
    base = int(times[i])
    while hi - lo > 1:
        mid = (lo + hi) // 2
        s = bool(sample_at(case, np.array([base + mid * 60_000]))[key][0])
        if s == new_state:
            hi = mid
        else:
            lo = mid
    return base + hi * 60_000
