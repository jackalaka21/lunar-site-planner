"""Scientific validation report (spec 11.2). Writes public/data/v1/validation.json.

Run: python -m lsp.validate   (from pipeline/; use PowerShell if Horizons SSL fails in Git Bash)

Every entry: name, value, reference, tolerance, pass (True/False, or None for informational), source_url,
plus free-text `detail`. Tolerances are fixed by the spec and are never adjusted to make a check pass.
"""

import hashlib
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from . import ps
from .constants import OBS_HEIGHT_M, R_EARTH_KM, R_SUN_KM
from .geometry import site_frame, topocentric
from .paths import RAW_DIR, REPO_ROOT, WORK_DIR
from .reference import (
    DEFAULT_SETTINGS,
    EPOCH_MS,
    ephemeris_at,
    find_event,
    parse_iso,
    sample_at,
    to_iso,
)

OUT = REPO_ROOT / "public/data/v1/validation.json"
SITES_JSON = REPO_ROOT / "public/data/v1/sites.json"
SITE_HZ_DIR = REPO_ROOT / "public/data/v1/horizons/sites"
CACHE_DIR = WORK_DIR / "horizons_cache"
ILLUM_DIR = RAW_DIR / "illum"

HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api"
HORIZONS_URL = "https://ssd.jpl.nasa.gov/horizons/"
HORIZONS_TOL_DEG = 0.05
INTERP_TOL_DEG = 0.001
POLE_SUN_TOL_DEG = 1.6
ILLUM_TOL_PCT = 10.0
ECLIPSE_TOL_MIN = 10.0
HOUR_MS = 3_600_000
DAY_MS = 86_400_000

GLASER_URL = "https://doi.org/10.1016/j.pss.2017.07.006"
GLASER_REF = "Glaeser et al. 2018, Planet. Space Sci. 162, 170-178"
GLASER_SHACKLETON_PCT = 85.5
PGDA_URL = "https://pgda.gsfc.nasa.gov/products/69"
ECLIPSE_CAT_URL = "https://eclipse.gsfc.nasa.gov/LEcat5/LE2001-2100.html"

HORIZONS_SITES = [  # (label, lat, lon_east)
    ("south pole (-89.9, 0)", -89.9, 0.0),
    ("Apollo 11 (0.674, 23.473)", 0.674, 23.473),
    ("Chang'e 4 (-45.44, 177.60)", -45.44, 177.60),
]


def entry(name, value, reference, tolerance, passed, source_url, detail="", unit=None) -> dict:
    return {
        "name": name,
        "value": value,
        "reference": reference,
        "tolerance": tolerance,
        "pass": passed,
        "source_url": source_url,
        "unit": unit,
        "detail": detail,
    }


def _utc_ms_to_jd(ms: int) -> float:
    return ms / DAY_MS + 2440587.5


# ---------------------------------------------------------------- 1. Horizons

def horizons_times() -> np.ndarray:
    """20 deterministic off-grid UTC times between 2026-01-10 and late 2027."""
    t0 = parse_iso("2026-01-10T03:17:00Z")
    step = 36 * DAY_MS + 5 * HOUR_MS + 11 * 60_000 + 23_000
    return t0 + np.arange(20, dtype=np.int64) * step


def _horizons_query(body: str, lat: float, lon: float, t_ms: np.ndarray) -> list[tuple[float, float]]:
    """Return [(az, el)] from the Horizons API (cached on disk)."""
    jds = " ".join(f"{_utc_ms_to_jd(int(t)):.9f}" for t in t_ms)
    params = {
        "format": "json",
        "COMMAND": f"'{body}'",
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},{OBS_HEIGHT_M / 1000.0}'",
        "TLIST_TYPE": "'JD'",
        "TIME_TYPE": "'UT'",
        "TLIST": f"'{jds}'",
        "QUANTITIES": "'4'",
        "ANG_FORMAT": "'DEG'",
        "CSV_FORMAT": "'YES'",
        "APPARENT": "'AIRLESS'",
    }
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:16]
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{key}.json"
    if path.exists():
        text = json.loads(path.read_text())["result"]
    else:
        import requests

        r = requests.get(HORIZONS_API, params=params, headers={"User-Agent": "ridgeline-validation"}, timeout=120)
        r.raise_for_status()
        doc = r.json()
        if "result" not in doc:
            raise RuntimeError(f"Horizons error: {doc}")
        path.write_text(json.dumps({"params": params, "result": doc["result"]}))
        text = doc["result"]
    rows = []
    inside = False
    for line in text.splitlines():
        if line.startswith("$$SOE"):
            inside = True
        elif line.startswith("$$EOE"):
            break
        elif inside and line.strip():
            f = [x.strip() for x in line.split(",")]
            rows.append((float(f[3]), float(f[4])))
    if len(rows) != len(t_ms):
        raise RuntimeError(f"Horizons returned {len(rows)} rows for {len(t_ms)} times:\n{text[:1500]}")
    return rows


def _engine_azel(lat: float, lon: float, t_ms: np.ndarray):
    frame = site_frame(lat, lon, 0.0, OBS_HEIGHT_M)
    eph = ephemeris_at(t_ms)
    out = {"sun": [], "earth": []}
    for i in range(len(t_ms)):
        out["sun"].append(topocentric(eph[i, 0:3], frame, R_SUN_KM)[:2])
        out["earth"].append(topocentric(eph[i, 3:6], frame, R_EARTH_KM)[:2])
    return out


def _sky_sep_deg(az1, el1, az2, el2) -> float:
    a1, e1, a2, e2 = map(math.radians, (az1, el1, az2, el2))
    c = math.sin(e1) * math.sin(e2) + math.cos(e1) * math.cos(e2) * math.cos(a1 - a2)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def horizons_check() -> list[dict]:
    t = horizons_times()
    entries, raw = [], []
    for label, lat, lon in HORIZONS_SITES:
        mine = _engine_azel(lat, lon, t)
        for body, code in (("sun", "10"), ("earth", "399")):
            theirs = _horizons_query(code, lat, lon, t)
            daz, delv, sep = [], [], []
            for (a1, e1), (a2, e2) in zip(mine[body], theirs):
                daz.append(abs((a1 - a2 + 180.0) % 360.0 - 180.0))
                delv.append(abs(e1 - e2))
                sep.append(_sky_sep_deg(a1, e1, a2, e2))
            # az difference measured on the sky (x cos el) so near-zenith azimuth swings do not dominate
            daz_sky = [d * math.cos(math.radians(e1)) for d, (_, e1) in zip(daz, mine[body])]
            worst = max(max(delv), max(daz_sky))
            ok = worst <= HORIZONS_TOL_DEG
            entries.append(
                entry(
                    f"Horizons {body} az/el, {label}",
                    round(worst, 5),
                    0.0,
                    HORIZONS_TOL_DEG,
                    ok,
                    HORIZONS_URL,
                    f"20 times 2026-2027, max |d el| {max(delv):.5f} deg, max |d az| x cos(el) {max(daz_sky):.5f} deg,"
                    f" max raw |d az| {max(daz):.5f} deg, max sky separation {max(sep):.5f} deg."
                    " Horizons: CENTER coord@301, MEAN_ME frame, apparent az/el, airless, observer 2 m above the 1737.4 km sphere.",
                    "deg",
                )
            )
            raw.append({"site": label, "body": body, "times": [to_iso(int(x)) for x in t],
                        "dAz": daz, "dEl": delv, "sep": sep})
    (WORK_DIR).mkdir(parents=True, exist_ok=True)
    (WORK_DIR / "horizons_check.json").write_text(json.dumps(raw))
    return entries


# ---------------------------------------------------------------- 2. interpolation vs SPICE

def interp_check(n: int = 300) -> dict:
    from . import ephemeris as eph_mod

    eph_mod.load_kernels(RAW_DIR / "spice")
    rng = np.random.default_rng(20260514)
    lo, hi = parse_iso("2025-01-01T00:00:00Z"), parse_iso("2032-12-31T00:00:00Z")
    t_ms = np.sort(rng.integers(lo // 1000, hi // 1000, n) * 1000)
    off_grid = [t for t in t_ms if t % HOUR_MS]
    t_ms = np.array(off_grid, dtype=np.int64)
    direct = eph_mod.body_vectors(t_ms.astype("datetime64[ms]"))
    interp = ephemeris_at(t_ms)
    worst = 0.0
    for k in (0, 3):
        a, b = direct[:, k : k + 3], interp[:, k : k + 3]
        cosang = np.sum(a * b, axis=1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))
        ang = np.degrees(np.arccos(np.clip(cosang, -1, 1)))
        worst = max(worst, float(ang.max()))
    return entry(
        "Interpolation error vs direct SPICE",
        float(f"{worst:.3g}"),
        0.0,
        INTERP_TOL_DEG,
        worst < INTERP_TOL_DEG,
        "https://naif.jpl.nasa.gov/naif/toolkit.html",
        f"{len(t_ms)} random off-grid times 2025-2032; max angle between the hourly-linear Sun/Earth direction"
        " and a direct SPICE spkpos call (MOON_ME, LT+S), either body.",
        "deg",
    )


# ---------------------------------------------------------------- 3. smooth-sphere pole Sun range

def pole_sun_check() -> dict:
    t = np.arange(parse_iso("2025-01-01T00:00:00Z"), parse_iso("2033-01-01T00:00:00Z"), HOUR_MS, dtype=np.int64)
    frame = site_frame(-90.0, 0.0, 0.0, OBS_HEIGHT_M)
    eph = ephemeris_at(t)
    els = np.array([topocentric(eph[i, 0:3], frame, R_SUN_KM)[1] for i in range(len(t))])
    worst = float(np.abs(els).max())
    return entry(
        "South pole Sun elevation range, smooth sphere, 2025-2032",
        round(worst, 4),
        0.0,
        POLE_SUN_TOL_DEG,
        worst <= POLE_SUN_TOL_DEG,
        "https://doi.org/10.1016/j.icarus.2010.12.011",
        f"max |Sun centre elevation| over hourly samples; min {els.min():.3f}, max {els.max():.3f} deg."
        " The lunar spin axis is tilted about 1.54 deg to the ecliptic.",
        "deg",
    )


# ---------------------------------------------------------------- 4/7. illumination

def _sites() -> dict:
    return {s["id"]: s for s in json.loads(SITES_JSON.read_text())["sites"]}


def site_case(site: dict, settings: dict | None = None, mast_index: int = 0) -> dict:
    raw = np.fromfile(SITE_HZ_DIR / f"{site['id']}.bin", dtype="<i2").reshape(3, 3600)
    prof = raw[mast_index].astype(np.float64) / 100.0
    st = dict(DEFAULT_SETTINGS)
    st["mastM"] = [2, 10, 50][mast_index]
    st.update(settings or {})
    return {
        "lat": site["lat"],
        "lon": site["lon"],
        "hDemM": site["hDemM"],
        "horizon": {"stepDeg": 0.1, "values": prof},
        "settings": st,
    }


def _avg_percentages(site: dict, step_h: int = 6) -> tuple[float, float]:
    t = np.arange(parse_iso("2025-01-01T00:00:00Z"), parse_iso("2033-01-01T00:00:00Z"), step_h * HOUR_MS, dtype=np.int64)
    s = sample_at(site_case(site, {"litThreshold": "any", "earthMarginDeg": 0}), t)
    return 100.0 * float(s["lit"].mean()), 100.0 * float(s["earthIn"].mean())


def _read_pgda(path: Path, x: float, y: float) -> float | None:
    import rasterio

    with rasterio.open(path) as d:
        row, col = d.index(x, y)
        v = d.read(1, window=((row, row + 1), (col, col + 1)))[0, 0]
        if v == d.nodata:
            return None
        return float(v) * d.scales[0]


def illumination_checks() -> list[dict]:
    sites = _sites()
    out = []
    avg = {sid: _avg_percentages(sites[sid]) for sid in ("shackleton-rim", "connecting-ridge", "malapert-massif", "mons-mouton")}
    sun_r = ILLUM_DIR / "AVGVISIB_75S_120M_201608.TIF"
    earth_r = ILLUM_DIR / "AVGVISIB_75S_120M_201608_EARTH.TIF"

    v = avg["shackleton-rim"][0]
    out.append(entry(
        "Average sunlit %, Shackleton rim, 2025-2032 (any, 2 m) vs Glaeser et al. 2018",
        round(v, 1), GLASER_SHACKLETON_PCT, ILLUM_TOL_PCT, abs(v - GLASER_SHACKLETON_PCT) <= ILLUM_TOL_PCT, GLASER_URL,
        f"{GLASER_REF}. Ours: any part of the Sun disc above the site horizon (2 m mast, 0.1 deg horizon),"
        " 6 h sampling 2025-01-01 to 2032-12-31. Differences: averaging period (paper: full 18.6 yr cycle),"
        " observer height, DEM resolution, and the exact rim point.", "%"))
    v = avg["connecting-ridge"][0]
    out.append(entry(
        "Average sunlit %, connecting ridge, 2025-2032 (any, 2 m)",
        round(v, 1), None, None, None, GLASER_URL,
        "Informational: Glaeser et al. 2018 give a Shackleton rim figure only (compared above); the connecting ridge"
        " is checked against the PGDA raster below.", "%"))

    for sid, label in (("shackleton-rim", "Shackleton rim"), ("connecting-ridge", "connecting ridge"),
                       ("malapert-massif", "Malapert massif"), ("mons-mouton", "Mons Mouton")):
        s = sites[sid]
        x, y = ps.to_xy(s["lat"], s["lon"])
        for kind, path, idx, what in (("Sun", sun_r, 0, "sunlit"), ("Earth", earth_r, 1, "Earth in view")):
            ref = _read_pgda(path, x, y)
            mine = avg[sid][idx]
            if ref is None:
                out.append(entry(f"PGDA average {kind} visibility, {label}", round(mine, 1), None, ILLUM_TOL_PCT, None,
                                 PGDA_URL, "Raster has no data at this point.", "%"))
                continue
            ref_pct = 100.0 * ref
            out.append(entry(
                f"Average {what} %, {label}, ours (2025-2032) vs PGDA/LOLA (Quickmap layer)",
                round(mine, 1), round(ref_pct, 1), ILLUM_TOL_PCT, abs(mine - ref_pct) <= ILLUM_TOL_PCT, PGDA_URL,
                "Reference: NASA/GSFC PGDA (Mazarico et al.) AVGVISIB_75S_120M_201608, the same LOLA visibility data"
                " shown in LROC Quickmap; 120 m pixels, long-term average (LOLA 2009-2013 DEM). Ours: 6 h sampling"
                " 2025-2032, 2 m mast, 0.1 deg horizon; "
                + ("'any' = any part of the Sun disc." if kind == "Sun" else "Earth centre above the horizon, margin 0.")
                + " Differences come from the averaging period, observer height, pixel size vs point, and horizon resolution.",
                "%"))
    return out


# ---------------------------------------------------------------- 5. eclipses

# NASA catalog (TD of greatest eclipse, delta-T 75 s, total duration in minutes)
ECLIPSES = [
    ("2025-03-14", "2025-03-14T06:59:56Z", 75, 65.4),
    ("2025-09-07", "2025-09-07T18:12:58Z", 75, 82.1),
    ("2026-03-03", "2026-03-03T11:34:52Z", 75, 58.3),
]


def eclipse_checks() -> list[dict]:
    out = []
    lat, lon = 0.0, 0.0
    for name, td, dt_s, tot_min in ECLIPSES:
        g = parse_iso(td) - dt_s * 1000  # UT of greatest eclipse
        pub_on = g - int(round(tot_min / 2 * 60_000))
        pub_off = g + int(round(tot_min / 2 * 60_000))
        t = g + np.arange(-180, 181, dtype=np.int64) * 60_000
        case = {"lat": lat, "lon": lon, "hDemM": 0.0,
                "horizon": {"stepDeg": 1.0, "values": np.full(360, -1.0)},
                "settings": dict(DEFAULT_SETTINGS, litThreshold="any")}
        ecl = sample_at(case, t)["eclipseFrac"]
        total = np.where(ecl >= 1.0 - 1e-9)[0]
        if len(total) == 0:
            out.append(entry(f"Lunar eclipse {name} totality at (0, 0)", None, None, ECLIPSE_TOL_MIN, False,
                             ECLIPSE_CAT_URL, f"no totality found; max eclipse fraction {ecl.max():.4f}", "min"))
            continue
        on, off = int(t[total[0]]), int(t[total[-1]])
        d_on, d_off = (on - pub_on) / 60_000.0, (off - pub_off) / 60_000.0
        ok = abs(d_on) <= ECLIPSE_TOL_MIN and abs(d_off) <= ECLIPSE_TOL_MIN
        out.append(entry(
            f"Lunar eclipse {name}: Sun fully covered at the site (0, 0) vs NASA U2/U3",
            {"onsetUtc": to_iso(on), "offsetUtc": to_iso(off), "onsetDiffMin": round(d_on, 1),
             "offsetDiffMin": round(d_off, 1)},
            {"onsetUtc": to_iso(pub_on), "offsetUtc": to_iso(pub_off)},
            ECLIPSE_TOL_MIN, ok, ECLIPSE_CAT_URL,
            "Ours: first/last minute the Earth disc fully covers the Sun disc (spherical Earth, R 6371 km, no"
            " atmosphere enlargement) seen from the near-side point (0, 0). NASA: greatest eclipse"
            f" {td[11:19]} TD minus delta-T {dt_s} s, and total duration {tot_min} min split symmetrically"
            " (NASA lunar eclipse catalogue, Espenak/Meeus).", "min"))
    return out


def _limb_totality_minutes(t: np.ndarray) -> np.ndarray:
    """True where every point on the Moon's limb as seen from the Sun (circle perpendicular to the Sun
    direction, radius R_moon) is in the umbra, i.e. the whole lunar disc is inside Earth's umbra (NASA U2 to U3)."""
    from .constants import R_MOON_KM
    from .geometry import angular_separation_deg

    eph = ephemeris_at(t)
    th = np.radians(np.arange(0, 360, 10.0))
    res = np.zeros(len(t), dtype=bool)
    for i in range(len(t)):
        s, e = eph[i, 0:3], eph[i, 3:6]
        u = s / np.linalg.norm(s)
        a = np.cross(u, [0.0, 0.0, 1.0])
        a /= np.linalg.norm(a)
        b = np.cross(u, a)
        ok = True
        for ang in th:
            p = R_MOON_KM * (math.cos(ang) * a + math.sin(ang) * b)
            vs, ve = s - p, e - p
            rs = math.degrees(math.asin(R_SUN_KM / np.linalg.norm(vs)))
            re = math.degrees(math.asin(R_EARTH_KM / np.linalg.norm(ve)))
            if angular_separation_deg(vs, ve) > re - rs:
                ok = False
                break
        res[i] = ok
    return res


def eclipse_disc_checks() -> list[dict]:
    out = []
    for name, td, dt_s, tot_min in ECLIPSES:
        g = parse_iso(td) - dt_s * 1000
        pub_on = g - int(round(tot_min / 2 * 60_000))
        pub_off = g + int(round(tot_min / 2 * 60_000))
        t = g + np.arange(-120, 121, dtype=np.int64) * 60_000
        idx = np.where(_limb_totality_minutes(t))[0]
        if len(idx) == 0:
            out.append(entry(f"Lunar eclipse {name}: whole Moon disc in umbra", None, None, ECLIPSE_TOL_MIN, False,
                             ECLIPSE_CAT_URL, "never fully inside the modelled umbra", "min"))
            continue
        on, off = int(t[idx[0]]), int(t[idx[-1]])
        d_on, d_off = (on - pub_on) / 60_000.0, (off - pub_off) / 60_000.0
        out.append(entry(
            f"Lunar eclipse {name}: totality (whole Moon disc in umbra, U2 to U3) vs NASA",
            {"onsetUtc": to_iso(on), "offsetUtc": to_iso(off), "onsetDiffMin": round(d_on, 1),
             "offsetDiffMin": round(d_off, 1)},
            {"onsetUtc": to_iso(pub_on), "offsetUtc": to_iso(pub_off)}, ECLIPSE_TOL_MIN,
            abs(d_on) <= ECLIPSE_TOL_MIN and abs(d_off) <= ECLIPSE_TOL_MIN, ECLIPSE_CAT_URL,
            "Same Earth model (sphere R 6371 km, no atmosphere enlargement), but totality is defined as NASA defines"
            " U2/U3: every point on the lunar limb (as seen from the Sun) has the Sun fully covered by Earth.", "min"))
    return out


# ---------------------------------------------------------------- 6. replays

def replay_checks() -> list[dict]:
    sites = _sites()
    out = []

    ch3 = sites["chandrayaan-3"]
    case = site_case(ch3)
    case["t0Ms"] = parse_iso(ch3["actual_landing_utc"].replace("Z", ":00Z") if len(ch3["actual_landing_utc"]) == 17 else ch3["actual_landing_utc"])
    t_set = find_event(case, case["t0Ms"], "sunset")
    ok = t_set is not None and parse_iso("2023-09-01T00:00:00Z") <= t_set < parse_iso("2023-09-07T00:00:00Z")
    out.append(entry(
        "Chandrayaan-3 predicted sunset vs ISRO sleep dates",
        to_iso(t_set), "2023-09-02 to 2023-09-04 (ISRO put Vikram and Pragyan to sleep)",
        "sunset within 2023-09-01 to 2023-09-06", ok, "https://www.isro.gov.in/Chandrayaan3.html",
        "First sunset (flicker-merged lit state, 'half' threshold, 2 m mast, site horizon) after landing"
        " date 2023-08-23 00:00 UTC at the Statio Shiv Shakti point. Sleep dates are as stated in the project brief."))

    sl = sites["slim"]
    case = site_case(sl)
    t = np.arange(parse_iso("2024-01-28T00:00:00Z"), parse_iso("2024-02-02T00:00:00Z"), 600_000, dtype=np.int64)
    s = sample_at(case, t)
    up = s["sunEl"] > 0
    azs = s["sunAz"][up]
    west = bool(len(azs) > 0 and np.all((azs > 180.0) & (azs < 360.0)))
    out.append(entry(
        "SLIM Sun azimuth 2024-01-28 to 2024-02-01 in the western half",
        {"minAzDeg": round(float(azs.min()), 1), "maxAzDeg": round(float(azs.max()), 1),
         "samplesSunUp": int(up.sum()), "firstSunUpEnd": None}, "azimuth in (180, 360) deg whenever the Sun is up",
        "all Sun-up samples", west, "https://www.nasa.gov/missions/lro/nasas-lro-spots-japans-moon-lander",
        "10-minute samples, 2024-01-28 00:00 to 2024-02-02 00:00 UTC; western half defined as azimuth in (180, 360)"
        " deg clockwise from north; only samples with the Sun centre above the geometric horizon (elevation > 0).", "deg"))

    im = sites["im-2"]
    case = site_case(im)
    t_land = parse_iso(im["actual_landing_utc"])
    s = sample_at(case, np.array([t_land]))
    from .geometry import horizon_at

    hz = horizon_at(case["horizon"]["values"], 0.1, float(s["sunAz"][0]))
    out.append(entry(
        "IM-2 Athena Sun direction at landing (informational)",
        {"sunAzDeg": round(float(s["sunAz"][0]), 1), "sunElDeg": round(float(s["sunEl"][0]), 2),
         "horizonAtSunAzDeg": round(hz, 2), "sunFrac": round(float(s["sunFrac"][0]), 3)},
        None, None, None, im["actual_landing_source_url"],
        "Landing time 2025-03-06 17:30 UTC is approximate (NASA: about 11:30 a.m. CST). Site horizon at 2 m mast.", "deg"))
    return out


# ---------------------------------------------------------------- driver

def build_report() -> dict:
    return {
        "generatedUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "horizons": horizons_check(),
        "interp": [interp_check()],
        "sanity": [pole_sun_check()],
        "illumination": illumination_checks(),
        "eclipses": eclipse_checks() + eclipse_disc_checks(),
        "replays": replay_checks(),
    }


def all_entries(report: dict) -> list[dict]:
    return [e for k, v in report.items() if isinstance(v, list) for e in v]


def main() -> int:
    report = build_report()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(report, indent=1) + "\n")
    fails = 0
    for e in all_entries(report):
        tag = "INFO" if e["pass"] is None else ("PASS" if e["pass"] else "FAIL")
        fails += e["pass"] is False
        print(f"[{tag}] {e['name']}: {e['value']} (ref {e['reference']}, tol {e['tolerance']})")
    print(f"wrote {OUT}; failures: {fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
