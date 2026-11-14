"""Pure geometry for the reference engine (spec 7.2 to 7.4, 7.8). Angles in degrees at the API."""

import math

import numpy as np

from .constants import OBS_HEIGHT_M, R_EARTH_KM, R_MOON_KM, R_SUN_KM

_POLE_TOL_DEG = 1e-12


def site_frame(lat: float, lon: float, h_dem_m: float, h_obs_m: float = OBS_HEIGHT_M):
    """Return (p, u, e, n): site vector (km) and up/east/north unit vectors in MOON_ME.

    At exactly +-90 deg latitude the frame is the limit along lon = 0: e = +y, and
    n = +x at the south pole (-x at the north pole).
    """
    phi, lam = math.radians(lat), math.radians(lon)
    radius = R_MOON_KM + (h_dem_m + h_obs_m) / 1000.0
    cphi = math.cos(phi)
    p = radius * np.array([cphi * math.cos(lam), cphi * math.sin(lam), math.sin(phi)])
    u = p / np.linalg.norm(p)
    if abs(abs(lat) - 90.0) <= _POLE_TOL_DEG:
        u = np.array([0.0, 0.0, math.copysign(1.0, lat)])
        p = radius * u
        e = np.array([0.0, 1.0, 0.0])
        n = np.cross(u, e)
        return p, u, e, n
    e = np.cross([0.0, 0.0, 1.0], u)
    e = e / np.linalg.norm(e)
    n = np.cross(u, e)
    return p, u, e, n


def topocentric(body_vec, frame, radius_km: float = R_SUN_KM):
    """Return (az_deg in [0,360), el_deg, angular_radius_deg, distance_km) of a Moon-centred body vector."""
    p, u, e, n = frame
    v = np.asarray(body_vec, dtype=np.float64) - p
    dist = float(np.linalg.norm(v))
    el = math.degrees(math.asin(max(-1.0, min(1.0, float(v @ u) / dist))))
    az = math.degrees(math.atan2(float(v @ e), float(v @ n))) % 360.0
    if az >= 360.0:  # tiny negative angles round up to exactly 360.0
        az = 0.0
    r = math.degrees(math.asin(radius_km / dist))
    return az, el, r, dist


def disc_fraction(el: float, H: float, r: float) -> float:
    """Visible fraction of a disc (centre elevation el, radius r) over a flat horizon H. All degrees."""
    d = (el - H) / r
    if d >= 1.0:
        return 1.0
    if d <= -1.0:
        return 0.0
    return 1.0 - (math.acos(d) - d * math.sqrt(1.0 - d * d)) / math.pi


def horizon_at(profile, step_deg: float, az: float) -> float:
    """Linear interpolation of a horizon profile (value k at az = k*step) with wrap-around."""
    n = len(profile)
    x = (az % 360.0) / step_deg
    i = int(math.floor(x))
    f = x - i
    i0 = i % n
    i1 = (i + 1) % n
    return float(profile[i0]) * (1.0 - f) + float(profile[i1]) * f


def eclipse_fraction(d: float, r_s: float, r_e: float) -> float:
    """Fraction of the Sun's disc covered by Earth's disc (spec 7.8). d, r_s, r_e in the same angular unit."""
    if d >= r_s + r_e:
        return 0.0
    if d <= abs(r_e - r_s):
        return 1.0 if r_e >= r_s else (r_e * r_e) / (r_s * r_s)
    a = (d * d + r_s * r_s - r_e * r_e) / (2.0 * d * r_s)
    b = (d * d + r_e * r_e - r_s * r_s) / (2.0 * d * r_e)
    tri = math.sqrt(
        max(0.0, (-d + r_s + r_e) * (d + r_s - r_e) * (d - r_s + r_e) * (d + r_s + r_e))
    )
    lens = (
        r_s * r_s * math.acos(max(-1.0, min(1.0, a)))
        + r_e * r_e * math.acos(max(-1.0, min(1.0, b)))
        - 0.5 * tri
    )
    return min(1.0, max(0.0, lens / (math.pi * r_s * r_s)))


def angular_separation_deg(v1, v2) -> float:
    c = float(v1 @ v2) / (float(np.linalg.norm(v1)) * float(np.linalg.norm(v2)))
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def sun_blocked_by_earth(sun_vec, earth_vec, p) -> float:
    """Blocked fraction of the Sun's disc by Earth's disc as seen from site vector p (Moon-centred vectors, km)."""
    p = np.asarray(p, dtype=np.float64)
    vs = np.asarray(sun_vec, dtype=np.float64) - p
    ve = np.asarray(earth_vec, dtype=np.float64) - p
    r_s = math.degrees(math.asin(R_SUN_KM / float(np.linalg.norm(vs))))
    r_e = math.degrees(math.asin(R_EARTH_KM / float(np.linalg.norm(ve))))
    return eclipse_fraction(angular_separation_deg(vs, ve), r_s, r_e)
