"""Filesystem locations for the pipeline.

Raw and work data live outside the repo (and outside OneDrive) at LSP_DATA_DIR.
"""

import os
from pathlib import Path

DATA_DIR = Path(os.environ.get("LSP_DATA_DIR", "C:/Users/User/lsp-data"))
RAW_DIR = DATA_DIR / "raw"
WORK_DIR = DATA_DIR / "work"
REPO_ROOT = Path(__file__).resolve().parents[2]
