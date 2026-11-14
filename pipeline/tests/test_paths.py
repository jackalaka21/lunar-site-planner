from lsp.paths import DATA_DIR, RAW_DIR, REPO_ROOT, WORK_DIR


def test_data_dirs_nest_under_data_dir():
    assert RAW_DIR == DATA_DIR / "raw"
    assert WORK_DIR == DATA_DIR / "work"


def test_repo_root_is_the_repo():
    assert (REPO_ROOT / "package.json").is_file()
    assert (REPO_ROOT / "pipeline" / "lsp").is_dir()
