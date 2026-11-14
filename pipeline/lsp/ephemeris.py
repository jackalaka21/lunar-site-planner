"""Hourly Sun/Earth vectors in the Moon-centred MOON_ME frame (apparent, LT+S)."""

import argparse
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

try:
    import spiceypy as sp
except ImportError:  # pragma: no cover
    sp = None

from .constants import EPOCH_UTC
from .io import sha256
from .paths import RAW_DIR, REPO_ROOT

FRAME = "MOON_ME"
ABCORR = "LT+S"
MOON_PA_FRAME_ID = 31008  # MOON_PA_DE440, the body-fixed frame the binary PCK covers

# Load order matters: lsk, pck, moon bpc, moon frames kernel, planetary spk.
KERNEL_FILES = [
    "naif0012.tls",
    "pck00011.tpc",
    "moon_pa_de440_200625.bpc",
    "moon_de440_250416.tf",
    "de440s.bsp",
]

_kernel_dir: Path | None = None


def load_kernels(kernel_dir: Path) -> None:
    global _kernel_dir
    kernel_dir = Path(kernel_dir)
    sp.kclear()
    for name in KERNEL_FILES:
        sp.furnsh(str(kernel_dir / name))
    _kernel_dir = kernel_dir


def _utc_strings(utc_hours: np.ndarray) -> list[str]:
    return [str(t) for t in np.asarray(utc_hours).astype("datetime64[ms]")]


def body_vectors(utc_hours: np.ndarray) -> np.ndarray:
    """Return (N, 6) float64 km: [sun xyz, earth xyz], MOON_ME, observer MOON, LT+S."""
    strs = _utc_strings(utc_hours)
    ets = np.array([sp.str2et(s) for s in strs], dtype=np.float64)
    out = np.empty((len(ets), 6), dtype=np.float64)
    for k, body in enumerate(("SUN", "EARTH")):
        pos, _ = sp.spkpos(body, ets, FRAME, ABCORR, "MOON")
        out[:, 3 * k : 3 * k + 3] = pos
    return out


def year_hours(year: int) -> np.ndarray:
    start = np.datetime64(f"{year}-01-01T00:00", "m")
    end = np.datetime64(f"{year + 1}-01-01T00:00", "m")
    return np.arange(start, end, np.timedelta64(1, "h"))


def write_year(year: int, out_dir: Path) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{year}.bin"
    body_vectors(year_hours(year)).astype("<f4").tofile(path)
    return path


def read_year(path: Path) -> np.ndarray:
    return np.fromfile(path, dtype="<f4").reshape(-1, 6)


def pck_coverage_utc() -> tuple[datetime, datetime]:
    """Coverage (start, end) of the Moon binary PCK, as UTC datetimes."""
    if _kernel_dir is None:
        raise RuntimeError("load_kernels first")
    cell = sp.stypes.SPICEDOUBLE_CELL(2000)
    sp.pckcov(str(_kernel_dir / "moon_pa_de440_200625.bpc"), MOON_PA_FRAME_ID, cell)
    n = sp.wncard(cell)
    starts = [sp.wnfetd(cell, i)[0] for i in range(n)]
    ends = [sp.wnfetd(cell, i)[1] for i in range(n)]
    return _et_to_dt(min(starts)), _et_to_dt(max(ends))


def _et_to_dt(et: float) -> datetime:
    s = sp.et2utc(et, "ISOC", 3)
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def write_index(out_dir: Path, kernel_dir: Path, first_year: int, last_year: int) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    _, end = pck_coverage_utc()
    doc = {
        "frame": FRAME,
        "abcorr": ABCORR,
        "stepHours": 1,
        "epochUtc": EPOCH_UTC,
        "firstYear": first_year,
        "lastYear": last_year,
        "coverageEndUtc": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "kernels": [
            {"name": n, "sha256": sha256(Path(kernel_dir) / n)} for n in KERNEL_FILES
        ],
    }
    path = out_dir / "index.json"
    path.write_text(json.dumps(doc, indent=2) + "\n")
    return path


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--kernels", type=Path, default=RAW_DIR / "spice")
    ap.add_argument("--out", type=Path, default=REPO_ROOT / "public/data/v1/ephemeris")
    ap.add_argument("--first-year", type=int, default=1969)
    ap.add_argument("--last-year", type=int, default=2035)
    a = ap.parse_args()
    load_kernels(a.kernels)
    start, end = pck_coverage_utc()
    print(f"Moon PCK coverage: {start} .. {end}")
    first = max(a.first_year, start.year + (1 if start > datetime(start.year, 1, 1, tzinfo=timezone.utc) else 0))
    last = a.last_year
    if end < datetime(last, 12, 31, 23, tzinfo=timezone.utc):
        last = (end - timedelta(hours=23)).year - 1 if end.month < 12 or end.day < 31 else end.year
    t0 = time.time()
    for y in range(first, last + 1):
        p = write_year(y, a.out)
        print(y, p.stat().st_size, flush=True)
    write_index(a.out, a.kernels, first, last)
    print(f"range {first}..{last}, {time.time() - t0:.1f} s")


if __name__ == "__main__":
    main()
