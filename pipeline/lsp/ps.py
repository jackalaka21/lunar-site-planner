"""South-polar stereographic projection on the lunar sphere (R = 1737.4 km).

Locked formulas (shared with the TypeScript engine):
    rho = 2R tan(pi/4 + phi/2),  x = rho sin(lon),  y = rho cos(lon)
    phi = 2 atan(rho / 2R) - pi/2,  lon = atan2(x, y)
Angles in degrees at the API boundary, metres for x and y.
"""

import numpy as np

R_M = 1737400.0

# Equivalent PROJ definition (lon 0 is +y; k = 1 at the pole).
PROJ_STRING = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"


def to_xy(lat, lon):
    """(lat, lon) degrees -> (x, y) metres. Accepts scalars or arrays."""
    phi = np.radians(np.asarray(lat, dtype=np.float64))
    lam = np.radians(np.asarray(lon, dtype=np.float64))
    rho = 2.0 * R_M * np.tan(np.pi / 4.0 + phi / 2.0)
    x = rho * np.sin(lam)
    y = rho * np.cos(lam)
    if np.ndim(x) == 0:
        return float(x), float(y)
    return x, y


def to_latlon(x, y):
    """(x, y) metres -> (lat, lon) degrees; lon in (-180, 180]. Pole gives lon 0."""
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    rho = np.hypot(x, y)
    phi = 2.0 * np.arctan(rho / (2.0 * R_M)) - np.pi / 2.0
    lam = np.arctan2(x, y)
    lat, lon = np.degrees(phi), np.degrees(lam)
    if np.ndim(lat) == 0:
        return float(lat), float(lon)
    return lat, lon
