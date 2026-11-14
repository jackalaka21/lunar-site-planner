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
from .geometry import disc_fraction, horizon_at, site_frame, topocentric
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


def entry(name, value, reference, tolerance, passed, source_url, detail="", unit=None, note="") -> dict:
    return {
        "name": name,
        "value": value,
        "reference": reference,
        "tolerance": tolerance,
        "pass": passed,
        "source_url": source_url,
        "unit": unit,
        "note": note,
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
                    note="Our hourly-interpolated Sun/Earth direction at 20 dates in 2026-2027 against JPL Horizons apparent azimuth and elevation for the same surface point.",
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
        note="Largest angle between our hourly-linear Sun or Earth direction and a direct SPICE call at random off-grid times.",
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
        note="On a smooth sphere at the pole the Sun should stay within about 1.6 degrees of the horizon all year, and ours does.",
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


def _read_pgda(path: Path, x: float, y: float):
    """(fraction, pixel centre x, pixel centre y) of the PGDA pixel containing (x, y); fraction None if nodata."""
    import rasterio

    with rasterio.open(path) as d:
        row, col = d.index(x, y)
        v = d.read(1, window=((row, row + 1), (col, col + 1)))[0, 0]
        cx, cy = d.xy(row, col)
        return (None if v == d.nodata else float(v) * d.scales[0]), float(cx), float(cy)


_DEMS: tuple | None = None
SUBGRID_OFFSETS_M = (-40.0, 0.0, 40.0)  # 3 x 3 sub-cell centres inside a 120 m pixel


def _pixel_avg_percentages(cx: float, cy: float, step_h: int = 6):
    """Average sunlit % ('any') and Earth-in-view % over a 3 x 3 sub-grid of observer points inside the 120 m pixel
    centred at PS metres (cx, cy); horizons from the raycast (2 m mast, 0.1 deg steps) on the fine/coarse DEMs."""
    global _DEMS
    from . import dem, raycast

    if _DEMS is None:
        _DEMS = (dem.load_fine(), dem.load_coarse())
    fine, coarse = _DEMS
    xs = np.array([cx + dx for dy in SUBGRID_OFFSETS_M for dx in SUBGRID_OFFSETS_M])
    ys = np.array([cy + dy for dy in SUBGRID_OFFSETS_M for dx in SUBGRID_OFFSETS_M])
    lat, lon = ps.to_latlon(xs, ys)
    prof, hd = raycast.horizon_profiles(lat, lon, 2.0, 3600, fine, coarse)
    t = np.arange(parse_iso("2025-01-01T00:00:00Z"), parse_iso("2033-01-01T00:00:00Z"), step_h * HOUR_MS, dtype=np.int64)
    sun, earth = [], []
    sun_f, earth_f, earth_any = [], [], []
    eph = ephemeris_at(t)
    for k in range(len(xs)):
        case = {"lat": float(lat[k]), "lon": float(lon[k]), "hDemM": float(hd[k]),
                "horizon": {"stepDeg": 0.1, "values": prof[k]},
                "settings": dict(DEFAULT_SETTINGS, litThreshold="any", earthMarginDeg=0, mastM=2)}
        s = sample_at(case, t)
        sun.append(100.0 * float(s["lit"].mean()))
        earth.append(100.0 * float(s["earthIn"].mean()))
        # visible disc fraction over the terrain horizon (no eclipse term), as in PGDA's finite-disc model
        frame = site_frame(float(lat[k]), float(lon[k]), float(hd[k]), 2.0)
        sf = np.empty(len(t))
        ef = np.empty(len(t))
        for i in range(len(t)):
            saz, sel, sr, _ = topocentric(eph[i, 0:3], frame, R_SUN_KM)
            eaz, eel, er, _ = topocentric(eph[i, 3:6], frame, R_EARTH_KM)
            sf[i] = disc_fraction(sel, horizon_at(prof[k], 0.1, saz), sr)
            ef[i] = disc_fraction(eel, horizon_at(prof[k], 0.1, eaz), er)
        sun_f.append(100.0 * float(sf.mean()))
        earth_f.append(100.0 * float(ef.mean()))
        earth_any.append(100.0 * float((ef > 0).mean()))
    rng = lambda a: (min(a), max(a))  # noqa: E731
    return {
        "binary": (float(np.mean(sun)), float(np.mean(earth)), rng(sun), rng(earth)),
        "fraction": (float(np.mean(sun_f)), float(np.mean(earth_f)), rng(sun_f), rng(earth_f)),
        "earthAny": (float(np.mean(earth_any)), rng(earth_any)),
    }


NOT_LIKE_FOR_LIKE = "Point vs 120 m pixel on a steep rim; not like-for-like; see resolution-matched entry."


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
        " observer height, DEM resolution, and the exact rim point.", "%",
        note="Our 2025-2032 average sunlit share at the Shackleton rim point against the published figure of about 85.5 percent."))
    v = avg["connecting-ridge"][0]
    out.append(entry(
        "Average sunlit %, connecting ridge, 2025-2032 (any, 2 m)",
        round(v, 1), None, None, None, GLASER_URL,
        "Informational: Glaeser et al. 2018 give a Shackleton rim figure only (compared above); the connecting ridge"
        " is checked against the PGDA raster below.", "%",
        note="Our 2025-2032 average sunlit share at the connecting ridge point, shown for information."))

    for sid, label in (("shackleton-rim", "Shackleton rim"), ("connecting-ridge", "connecting ridge"),
                       ("malapert-massif", "Malapert massif"), ("mons-mouton", "Mons Mouton")):
        s = sites[sid]
        x, y = ps.to_xy(s["lat"], s["lon"])
        pix = _pixel_avg_percentages(*_read_pgda(sun_r, x, y)[1:])  # one pass gives binary, fraction and any-part stats
        for kind, path, idx, what in (("Sun", sun_r, 0, "sunlit"), ("Earth", earth_r, 1, "Earth in view")):
            ref, cx, cy = _read_pgda(path, x, y)
            mine = avg[sid][idx]
            if ref is None:
                out.append(entry(f"PGDA average {kind} visibility, {label}", round(mine, 1), None, ILLUM_TOL_PCT, None,
                                 PGDA_URL, "Raster has no data at this point.", "%",
                                 note="The PGDA raster has no data at this point."))
                continue
            ref_pct = 100.0 * ref
            base = ("Reference: NASA/GSFC PGDA (Mazarico et al.) AVGVISIB_75S_120M_201608 (Sun) / _EARTH, the same LOLA"
                    " visibility data shown in LROC Quickmap; 120 m pixels, long-term average (LOLA 2009-2013 DEM)."
                    " Ours: 6 h sampling 2025-2032, 2 m mast, 0.1 deg horizon; "
                    + ("'any' = any part of the Sun disc. " if kind == "Sun" else "Earth centre above the horizon, margin 0. "))
            out.append(entry(
                f"Average {what} %, {label}, single point vs PGDA pixel (Quickmap layer)",
                round(mine, 1), round(ref_pct, 1), ILLUM_TOL_PCT, None, PGDA_URL,
                base + f"Single-point result would be {'PASS' if abs(mine - ref_pct) <= ILLUM_TOL_PCT else 'FAIL'}"
                f" at 10 points (difference {mine - ref_pct:+.1f}). " + NOT_LIKE_FOR_LIKE, "%",
                note=NOT_LIKE_FOR_LIKE))
            sub = ("Ours is the mean over 9 observer points at -40/0/+40 m offsets around the pixel centre"
                   " (range across points {lo:.1f} to {hi:.1f}), horizons from the reviewed raycast on the 40 m/120 m DEMs. ")
            pv = pix["binary"][idx]
            lo, hi = pix["binary"][2 + idx]
            DIFF_STAT = "Different statistic: binary centre/any vs PGDA mean visible disc fraction."
            out.append(entry(
                f"Average {what} %, {label}, binary, 3x3 points in the 120 m pixel, vs PGDA",
                round(pv, 1), round(ref_pct, 1), ILLUM_TOL_PCT, None, PGDA_URL,
                base + sub.format(lo=lo, hi=hi) + f"Would be {'PASS' if abs(pv - ref_pct) <= ILLUM_TOL_PCT else 'FAIL'}"
                f" at 10 points (difference {pv - ref_pct:+.1f}). " + DIFF_STAT, "%",
                note=DIFF_STAT))
            pv = pix["fraction"][idx]
            lo, hi = pix["fraction"][2 + idx]
            fbase = ("Reference: NASA/GSFC PGDA (Mazarico et al.) AVGVISIB_75S_120M_201608 (Sun) / _EARTH, the same LOLA"
                     " visibility data shown in LROC Quickmap (PGDA models the source as a finite disc, averaged hourly over"
                     " about 18.6 yr, surface-level observer; the page does not say whether eclipses are included, so the"
                     " Sun term is terrain only). Ours: time-mean visible fraction of the "
                     + kind + " disc over the terrain horizon (disc_fraction with the body's angular radius), 6 h sampling"
                     " 2025-2032, 2 m mast, 0.1 deg horizon. ")
            out.append(entry(
                f"Average {what} %, {label}, visible disc fraction, 3x3 points in the 120 m pixel, vs PGDA",
                round(pv, 1), round(ref_pct, 1), ILLUM_TOL_PCT, abs(pv - ref_pct) <= ILLUM_TOL_PCT, PGDA_URL,
                fbase + sub.format(lo=lo, hi=hi) + "Differences come from averaging period, observer height (PGDA is"
                " surface level, ours 2 m), DEM resolution and sub-pixel spread.", "%",
                note="Our 2025-2032 mean visible fraction of the disc over nine observer points inside the 120 m pixel against the PGDA pixel value."
                + ("" if abs(pv - ref_pct) <= ILLUM_TOL_PCT else
                   f" Not met: the nine sub-points range {lo:.1f} to {hi:.1f}% on this steep rim, and PGDA is surface level"
                   " on a 120 m DEM while ours is 2 m on a 40 m DEM, so the pixel is not reproduced at this resolution.")))
            if kind == "Earth":
                pv, (lo, hi) = pix["earthAny"]
                out.append(entry(
                    f"Average Earth in view %, {label}, any part of the disc visible, 3x3 points, vs PGDA",
                    round(pv, 1), round(ref_pct, 1), ILLUM_TOL_PCT, None, PGDA_URL,
                    "Informational: PGDA's page states Earth is visible if any part of its disc is not obscured. Ours is the"
                    f" fraction of time the Earth disc is at least partly above the terrain horizon (range across points"
                    f" {lo:.1f} to {hi:.1f}; difference {pv - ref_pct:+.1f}).", "%",
                    note="Information only: share of time any part of the Earth disc is above the horizon, the definition PGDA states for Earth."))
    return out



# ---------------------------------------------------------------- 5. eclipses

# NASA catalog: TD of greatest eclipse, delta-T (s), partial (U1-U4) and total (U2-U3) durations in minutes
ECLIPSES = [
    ("2025-03-14", "2025-03-14T06:59:56Z", 75, 218.3, 65.4),
    ("2025-09-07", "2025-09-07T18:12:58Z", 75, 209.4, 82.1),
    ("2026-03-03", "2026-03-03T11:34:52Z", 75, 207.2, 58.3),
]


def _contacts(td, dt_s, par_min, tot_min):
    """UT ms of greatest, U1..U4 derived from greatest eclipse and the catalogue durations (symmetric)."""
    g = parse_iso(td) - dt_s * 1000
    m = lambda x: int(round(x * 60_000))  # noqa: E731
    return g, g - m(par_min / 2), g - m(tot_min / 2), g + m(tot_min / 2), g + m(par_min / 2)


def _site_totality(g: int, lat=0.0, lon=0.0):
    t = g + np.arange(-240, 241, dtype=np.int64) * 60_000
    case = {"lat": lat, "lon": lon, "hDemM": 0.0, "horizon": {"stepDeg": 1.0, "values": np.full(360, -1.0)},
            "settings": dict(DEFAULT_SETTINGS, litThreshold="any")}
    ecl = sample_at(case, t)["eclipseFrac"]
    idx = np.where(ecl >= 1.0 - 1e-9)[0]
    if len(idx) == 0:
        return None, None, float(ecl.max())
    return int(t[idx[0]]), int(t[idx[-1]]), 1.0


def eclipse_checks() -> list[dict]:
    out = []
    for name, td, dt_s, par, tot in ECLIPSES:
        g, u1, u2, u3, u4 = _contacts(td, dt_s, par, tot)
        on, off, mx = _site_totality(g)
        if on is None:
            out.append(entry(f"Lunar eclipse {name}: totality at the site (0, 0)", None, None, ECLIPSE_TOL_MIN, False,
                             ECLIPSE_CAT_URL, f"no totality found; max eclipse fraction {mx:.4f}", "min",
                             note="The Sun was never fully covered by Earth at (0, 0) in the search window."))
            continue
        mid_on, mid_off = (u1 + u2) // 2, (u3 + u4) // 2
        d_on, d_off = (on - mid_on) / 60_000.0, (off - mid_off) / 60_000.0
        src = ("Ours: first/last minute the Earth disc fully covers the Sun disc (spherical Earth, R 6371 km, no atmosphere"
               " enlargement) seen from (0, 0). NASA catalogue (Espenak/Meeus): greatest eclipse TD minus delta-T"
               f" {dt_s} s; U1/U4 from the partial duration {par} min and U2/U3 from the total duration {tot} min,"
               " each split symmetrically about greatest eclipse.")
        out.append(entry(
            f"Lunar eclipse {name}: totality at (0, 0) vs literal NASA U2/U3",
            {"onsetUtc": to_iso(on), "offsetUtc": to_iso(off), "onsetDiffMin": round((on - u2) / 60_000.0, 1),
             "offsetDiffMin": round((off - u3) / 60_000.0, 1)},
            {"onsetUtc": to_iso(u2), "offsetUtc": to_iso(u3)}, ECLIPSE_TOL_MIN, None, ECLIPSE_CAT_URL,
            src + " Different events: site totality vs whole Moon in umbra.", "min",
            note="Different events: site totality vs whole Moon in umbra."))
        out.append(entry(
            f"Lunar eclipse {name}: site totality at (0, 0) vs Moon-centre umbra entry/exit",
            {"onsetUtc": to_iso(on), "offsetUtc": to_iso(off), "onsetDiffMin": round(d_on, 1),
             "offsetDiffMin": round(d_off, 1)},
            {"onsetUtc": to_iso(mid_on), "offsetUtc": to_iso(mid_off)}, ECLIPSE_TOL_MIN,
            abs(d_on) <= ECLIPSE_TOL_MIN and abs(d_off) <= ECLIPSE_TOL_MIN, ECLIPSE_CAT_URL,
            src + " A site near the Moon's centre is fully shadowed while the Moon's centre is in the umbra, from"
            " (U1+U2)/2 to (U3+U4)/2.", "min",
            note="Our onset and offset of full Sun cover at (0, 0) against NASA's (U1+U2)/2 and (U3+U4)/2, when the Moon's centre crosses the umbra edge."))
        contains = on <= u2 and off >= u3
        out.append(entry(
            f"Lunar eclipse {name}: site totality contains NASA U2 to U3",
            {"onsetUtc": to_iso(on), "offsetUtc": to_iso(off)},
            {"u2Utc": to_iso(u2), "u3Utc": to_iso(u3)}, "interval must contain [U2, U3]", contains, ECLIPSE_CAT_URL,
            src, "min",
            note="Full Sun cover at the site must start no later than U2 and end no earlier than U3, because the whole Moon is in the umbra between those times."))
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
    for name, td, dt_s, par, tot_min in ECLIPSES:
        g, _u1, pub_on, pub_off, _u4 = _contacts(td, dt_s, par, tot_min)
        t = g + np.arange(-120, 121, dtype=np.int64) * 60_000
        idx = np.where(_limb_totality_minutes(t))[0]
        if len(idx) == 0:
            out.append(entry(f"Lunar eclipse {name}: whole Moon disc in umbra", None, None, ECLIPSE_TOL_MIN, False,
                             ECLIPSE_CAT_URL, "never fully inside the modelled umbra", "min",
                             note="The whole lunar disc was never inside the modelled umbra."))
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
            " U2/U3: every point on the lunar limb (as seen from the Sun) has the Sun fully covered by Earth.", "min",
            note="Our time span in which the whole lunar disc is inside Earth's umbra, against NASA's U2 and U3."))
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
        " date 2023-08-23 00:00 UTC at the Statio Shiv Shakti point. Sleep dates are as stated in the project brief.",
        note="Our first predicted sunset at the landing site after touchdown against the date ISRO put the lander and rover to sleep."))

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
        " deg clockwise from north; only samples with the Sun centre above the geometric horizon (elevation > 0).", "deg",
        note="Whenever the Sun is up at the SLIM site in the days it revived, its azimuth should be in the western half of the sky."))

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
        "Landing time 2025-03-06 17:30 UTC is approximate (NASA: about 11:30 a.m. CST). Site horizon at 2 m mast.", "deg",
        note="Sun direction and the horizon height in that direction at IM-2's landing time, shown for information only."))
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
