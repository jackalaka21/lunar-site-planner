"""Terrain horizon ray-caster (numba).

For each observer and azimuth, march a great-circle ray over the DEM and keep the maximum
elevation angle of the terrain as seen from the observer (spherical Moon, R = 1737.4 km):

    el = atan2((R + h_t) cos(s/R) - (R + h_o), (R + h_t) sin(s/R))

Azimuth is clockwise from local north. At the exact south pole the ray at azimuth theta follows
meridian lon = theta (east longitude), matching lsp.geometry.site_frame.
Step = max(grid res, 0.002 s). Polar rays use the fine grid for s < 5 km and the coarse grid beyond.
The jitted bilinear samplers mirror dem.Grid.sample / dem.GlobalGrid.sample exactly.
"""

from __future__ import annotations

import math

import numpy as np
from numba import njit, prange

R_M = 1737400.0
FINE_LIMIT_M = 5000.0
NODATA = -32768
_POLE_COS = 1e-12


@njit(cache=True)
def _bilinear(a, x0, y0, res, x, y):
    ny, nx = a.shape
    fx = (x - x0) / res
    fy = (y - y0) / res
    if not (fx >= 0.0 and fx <= nx - 1 and fy >= 0.0 and fy <= ny - 1):
        return np.nan
    ix = min(int(math.floor(fx)), nx - 2)
    iy = min(int(math.floor(fy)), ny - 2)
    tx = fx - ix
    ty = fy - iy
    a00 = a[iy, ix]
    a10 = a[iy, ix + 1]
    a01 = a[iy + 1, ix]
    a11 = a[iy + 1, ix + 1]
    if a00 == NODATA or a10 == NODATA or a01 == NODATA or a11 == NODATA:
        return np.nan
    return (a00 * (1 - tx) * (1 - ty) + a10 * tx * (1 - ty)
            + a01 * (1 - tx) * ty + a11 * tx * ty)


@njit(cache=True)
def _bilinear_global(a, ppd, scale, lat, lon):
    ny, nx = a.shape
    fr = min(max((90.0 - lat) * ppd - 0.5, 0.0), ny - 1.0)
    fc = ((lon % 360.0) * ppd - 0.5) % nx
    r0 = min(int(math.floor(fr)), ny - 2)
    c0 = int(math.floor(fc))
    tr = fr - r0
    tc = fc - c0
    c1 = (c0 + 1) % nx
    return (a[r0, c0] * (1 - tr) * (1 - tc) + a[r0, c1] * (1 - tr) * tc
            + a[r0 + 1, c0] * tr * (1 - tc) + a[r0 + 1, c1] * tr * tc) * scale


@njit(cache=True)
def _destination(sphi, cphi, lam, delta, theta):
    """Great-circle destination (radians). Exact south pole: lat = -90 deg + delta, lon = theta."""
    if cphi < _POLE_COS and sphi < 0.0:
        return -math.pi / 2.0 + delta, theta
    sd = math.sin(delta)
    cd = math.cos(delta)
    lat2 = math.asin(min(1.0, max(-1.0, sphi * cd + cphi * sd * math.cos(theta))))
    lon2 = lam + math.atan2(math.sin(theta) * sd * cphi, cd - sphi * math.sin(lat2))
    return lat2, lon2


@njit(cache=True)
def _elevation(delta, h_t, h_o):
    r_t = R_M + h_t
    return math.atan2(r_t * math.cos(delta) - (R_M + h_o), r_t * math.sin(delta))


@njit(cache=True, parallel=True)
def _kernel_ps(lat, lon, obs_h, n_az, fine, fx0, fy0, fres, coarse, cx0, cy0, cres, max_m, out, hdem):
    n_pts = lat.shape[0]
    for p in prange(n_pts):
        phi = math.radians(lat[p])
        lam = math.radians(lon[p])
        sphi = math.sin(phi)
        cphi = math.cos(phi)
        rho = 2.0 * R_M * math.tan(math.pi / 4.0 + phi / 2.0)
        ox = rho * math.sin(lam)
        oy = rho * math.cos(lam)
        g = _bilinear(fine, fx0, fy0, fres, ox, oy)
        if math.isnan(g):
            g = _bilinear(coarse, cx0, cy0, cres, ox, oy)
        if math.isnan(g):
            g = 0.0
        hdem[p] = g
        h_o = g + obs_h[p]
        for a in range(n_az):
            theta = 2.0 * math.pi * a / n_az
            best = -math.pi / 2.0
            s = 0.0
            while True:
                if s < FINE_LIMIT_M:
                    s += max(fres, 0.002 * s)
                else:
                    s += max(cres, 0.002 * s)
                if s > max_m:
                    break
                lat2, lon2 = _destination(sphi, cphi, lam, s / R_M, theta)
                r2 = 2.0 * R_M * math.tan(math.pi / 4.0 + lat2 / 2.0)
                x = r2 * math.sin(lon2)
                y = r2 * math.cos(lon2)
                if s < FINE_LIMIT_M:
                    h = _bilinear(fine, fx0, fy0, fres, x, y)
                else:
                    h = _bilinear(coarse, cx0, cy0, cres, x, y)
                if math.isnan(h):
                    continue
                el = _elevation(s / R_M, h, h_o)
                if el > best:
                    best = el
            out[p, a] = math.degrees(best)


@njit(cache=True, parallel=True)
def _kernel_global(lat, lon, obs_h, n_az, glob, ppd, scale, res_m, max_m, out, hdem):
    n_pts = lat.shape[0]
    for p in prange(n_pts):
        phi = math.radians(lat[p])
        lam = math.radians(lon[p])
        sphi = math.sin(phi)
        cphi = math.cos(phi)
        g = _bilinear_global(glob, ppd, scale, lat[p], lon[p])
        hdem[p] = g
        h_o = g + obs_h[p]
        for a in range(n_az):
            theta = 2.0 * math.pi * a / n_az
            best = -math.pi / 2.0
            s = 0.0
            while True:
                s += max(res_m, 0.002 * s)
                if s > max_m:
                    break
                lat2, lon2 = _destination(sphi, cphi, lam, s / R_M, theta)
                h = _bilinear_global(glob, ppd, scale, math.degrees(lat2), math.degrees(lon2))
                el = _elevation(s / R_M, h, h_o)
                if el > best:
                    best = el
            out[p, a] = math.degrees(best)


def _i16(grid):
    a = np.asarray(grid.array)
    if a.dtype != np.int16:
        raise TypeError("raycast needs int16 DEM arrays (nodata -32768)")
    return a


def horizon_profiles(lats, lons, obs_h_m, n_az, fine, coarse, max_km=200.0):
    """Vector form. Returns (profiles[n_pts, n_az] degrees, hdem[n_pts] metres)."""
    lat = np.atleast_1d(np.asarray(lats, dtype=np.float64))
    lon = np.atleast_1d(np.asarray(lons, dtype=np.float64))
    obs = np.broadcast_to(np.asarray(obs_h_m, dtype=np.float64), lat.shape).copy()
    out = np.empty((lat.size, n_az), dtype=np.float64)
    hdem = np.empty(lat.size, dtype=np.float64)
    _kernel_ps(lat, lon, obs, int(n_az), _i16(fine), fine.origin_xy[0], fine.origin_xy[1], fine.res_m,
               _i16(coarse), coarse.origin_xy[0], coarse.origin_xy[1], coarse.res_m,
               float(max_km) * 1000.0, out, hdem)
    return out, hdem


def horizon_profile(lat, lon, obs_h_m, n_az, fine, coarse, max_km=200.0):
    """Horizon elevation (degrees) at n_az azimuths 0, 360/n_az, ... clockwise from north."""
    return horizon_profiles(lat, lon, obs_h_m, n_az, fine, coarse, max_km)[0][0]


def horizon_profile_global(lat, lon, obs_h_m, n_az, glob, max_km=100.0):
    """Same as horizon_profile using the global cylindrical DEM only (non-polar sites)."""
    lat_a = np.atleast_1d(np.asarray(lat, dtype=np.float64))
    lon_a = np.atleast_1d(np.asarray(lon, dtype=np.float64))
    obs = np.broadcast_to(np.asarray(obs_h_m, dtype=np.float64), lat_a.shape).copy()
    out = np.empty((lat_a.size, n_az), dtype=np.float64)
    hdem = np.empty(lat_a.size, dtype=np.float64)
    res_m = 2.0 * math.pi * R_M / (360.0 * glob.ppd)
    _kernel_global(lat_a, lon_a, obs, int(n_az), np.asarray(glob.array), glob.ppd, glob.scale,
                   res_m, float(max_km) * 1000.0, out, hdem)
    return out[0]


# --- test hooks: the jitted samplers, callable on arrays ----------------------------------

@njit(cache=True)
def _sample_grid_arr(a, x0, y0, res, xs, ys):
    out = np.empty(xs.shape[0])
    for k in range(xs.shape[0]):
        out[k] = _bilinear(a, x0, y0, res, xs[k], ys[k])
    return out


@njit(cache=True)
def _sample_global_arr(a, ppd, scale, lats, lons):
    out = np.empty(lats.shape[0])
    for k in range(lats.shape[0]):
        out[k] = _bilinear_global(a, ppd, scale, lats[k], lons[k])
    return out


def sample_grid(grid, x, y):
    return _sample_grid_arr(_i16(grid), grid.origin_xy[0], grid.origin_xy[1], grid.res_m,
                            np.asarray(x, dtype=np.float64), np.asarray(y, dtype=np.float64))


def sample_global(glob, lat, lon):
    return _sample_global_arr(np.asarray(glob.array), glob.ppd, glob.scale,
                              np.asarray(lat, dtype=np.float64), np.asarray(lon, dtype=np.float64))
