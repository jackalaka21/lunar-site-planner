"""Small file helpers."""

import hashlib
from pathlib import Path


def sha256(path) -> str:
    """Return the upper-case hex SHA-256 of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest().upper()
