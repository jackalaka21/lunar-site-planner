"""Hourly Moon elevation above the horizon at NASA's three DSN complexes."""

import argparse
from pathlib import Path

import numpy as np

try:
    import spiceypy as sp
except ImportError:  # pragma: no cover
    sp = None

from . import ephemeris
from .paths import RAW_DIR, REPO_ROOT

# (lat, lon) degrees, NASA DSN reference antennas (DSS-14, DSS-63, DSS-43).
STATIONS = {
    "goldstone": (35.426, -116.890),
    "madrid": (40.431, -4.248),
    "canberra": (-35.402, 148.981),
}
R_EARTH_KM = 6371.0


def _station_vectors() -> np.ndarray:
    """(3, 3) km station positions in IAU_EARTH on a sphere of radius R_EARTH_KM."""
    return np.array(
        [
            sp.georec(np.radians(lon), np.radians(lat), 0.0, R_EARTH_KM, 0.0)
            for lat, lon in STATIONS.values()
        ]
    )


def moon_elevations(utc_hours: np.ndarray) -> np.ndarray:
    """Return (N, 3) int8 Moon elevation in whole degrees [goldstone, madrid, canberra]."""
    strs = ephemeris._utc_strings(utc_hours)
    ets = np.array([sp.str2et(s) for s in strs], dtype=np.float64)
    moon, _ = sp.spkpos("MOON", ets, "IAU_EARTH", "LT+S", "EARTH")
    st = _station_vectors()
    up = st / np.linalg.norm(st, axis=1, keepdims=True)
    out = np.empty((len(ets), 3), dtype=np.int8)
    for k in range(3):
        v = moon - st[k]
        s = (v @ up[k]) / np.linalg.norm(v, axis=1)
        el = np.degrees(np.arcsin(np.clip(s, -1, 1)))
        out[:, k] = np.clip(np.rint(el), -90, 90).astype(np.int8)
    return out


def write_year(year: int, out_dir: Path) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{year}.bin"
    moon_elevations(ephemeris.year_hours(year)).astype("i1").tofile(path)
    return path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--kernels", type=Path, default=RAW_DIR / "spice")
    ap.add_argument("--out", type=Path, default=REPO_ROOT / "public/data/v1/dsn")
    ap.add_argument("--first-year", type=int, default=1969)
    ap.add_argument("--last-year", type=int, default=2035)
    a = ap.parse_args()
    ephemeris.load_kernels(a.kernels)
    for y in range(a.first_year, a.last_year + 1):
        print(y, write_year(y, a.out).stat().st_size, flush=True)


if __name__ == "__main__":
    main()
