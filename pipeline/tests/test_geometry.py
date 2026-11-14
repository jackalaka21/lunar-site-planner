from datetime import datetime, timezone

import numpy as np
import pytest

from lsp.geometry import (
    disc_fraction,
    eclipse_fraction,
    horizon_at,
    site_frame,
    sun_blocked_by_earth,
    topocentric,
)
from lsp.reference import ephemeris_at, utc_ms


def test_disc_fraction_endpoints():
    H, r = 1.0, 0.27
    assert disc_fraction(H + r, H, r) == 1.0
    assert disc_fraction(H - r, H, r) == 0.0
    assert disc_fraction(H, H, r) == pytest.approx(0.5, abs=1e-12)
    d = 0.3 * r
    assert disc_fraction(H + d, H, r) + disc_fraction(H - d, H, r) == pytest.approx(1.0, abs=1e-12)


def test_pole_frame_equals_lon0_limit():
    p, u, e, n = site_frame(-90.0, 123.0, 0.0)
    assert np.allclose(n, [1, 0, 0], atol=1e-12)
    assert np.allclose(e, [0, 1, 0], atol=1e-12)
    p0, u0, e0, n0 = site_frame(-90.0, 0.0, 0.0)
    for a, b in ((p, p0), (u, u0), (e, e0), (n, n0)):
        assert np.allclose(a, b, atol=1e-12)
    # near-pole limit agrees with the exact pole frame
    _, _, e1, n1 = site_frame(-89.999999, 0.0, 0.0)
    assert np.allclose(e1, e, atol=1e-6) and np.allclose(n1, n, atol=1e-6)


def test_frame_orthonormal():
    rng = np.random.default_rng(7)
    for _ in range(5):
        lat, lon = rng.uniform(-89, 89), rng.uniform(-180, 180)
        p, u, e, n = site_frame(lat, lon, 1200.0)
        assert np.linalg.norm(p) == pytest.approx(1737.4 + 1.2 + 0.002, abs=1e-9)
        for v in (u, e, n):
            assert np.linalg.norm(v) == pytest.approx(1.0, abs=1e-12)
        assert abs(u @ e) < 1e-12 and abs(u @ n) < 1e-12 and abs(e @ n) < 1e-12
        assert np.allclose(np.cross(e, n), u, atol=1e-12)  # (east, north, up) is right-handed


def test_topocentric_known_directions():
    frame = site_frame(0.0, 0.0, 0.0)
    p, u, e, n = frame
    az, el, r, dist = topocentric(p + 1000 * e, frame, 1.0)
    assert az == pytest.approx(90.0) and el == pytest.approx(0.0, abs=1e-9)
    az, el, _, _ = topocentric(p + 1000 * n + 1000 * u, frame, 1.0)
    assert az == pytest.approx(0.0, abs=1e-9) and el == pytest.approx(45.0)
    az, _, r, dist = topocentric(p - 1000 * e, frame, 100.0)
    assert az == pytest.approx(270.0)
    assert dist == pytest.approx(1000.0) and r == pytest.approx(np.degrees(np.arcsin(0.1)))


def test_horizon_wraparound():
    prof = np.zeros(720)
    prof[0], prof[719] = 2.0, 4.0
    assert horizon_at(prof, 0.5, 0.0) == pytest.approx(2.0)
    assert horizon_at(prof, 0.5, 359.5) == pytest.approx(4.0)
    assert horizon_at(prof, 0.5, 359.75) == pytest.approx(3.0)  # halfway to wrapped index 0
    assert horizon_at(prof, 0.5, -0.25) == pytest.approx(3.0)
    assert horizon_at(prof, 0.5, 0.25) == pytest.approx(1.0)


def test_eclipse_fraction_cases():
    rs, re_ = 0.27, 0.95
    assert eclipse_fraction(rs + re_, rs, re_) == 0.0
    assert eclipse_fraction(5.0, rs, re_) == 0.0
    assert eclipse_fraction(0.0, rs, re_) == 1.0
    assert eclipse_fraction(re_ - rs, rs, re_) == 1.0
    rng = np.random.default_rng(1)
    for d in (0.8, 1.0, 1.1):  # partial overlaps
        k = 200_000
        rad = rs * np.sqrt(rng.uniform(size=k))
        th = rng.uniform(0, 2 * np.pi, size=k)
        x, y = rad * np.cos(th), rad * np.sin(th)
        mc = np.mean((x - d) ** 2 + y**2 <= re_**2)
        assert eclipse_fraction(d, rs, re_) == pytest.approx(mc, abs=0.01)


def test_eclipse_vectors_far_and_aligned():
    p = np.array([1737.4, 0.0, 0.0])
    sun = np.array([1.5e8, 0, 0])
    earth = np.array([384400.0, 0, 0])
    assert sun_blocked_by_earth(sun, earth, p) == 1.0
    assert sun_blocked_by_earth(-sun, earth, p) == 0.0


def test_eclipse_2025_03_14_detected():
    t = utc_ms(datetime(2025, 3, 14, 6, 58, tzinfo=timezone.utc))
    b = ephemeris_at(np.array([t]))[0]
    p, *_ = site_frame(0.0, 0.0, 0.0)
    assert sun_blocked_by_earth(b[0:3], b[3:6], p) == pytest.approx(1.0)
