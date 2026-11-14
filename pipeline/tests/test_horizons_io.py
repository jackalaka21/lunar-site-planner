import numpy as np

from lsp import horizons


def test_tile_roundtrip(tmp_path):
    rng = np.random.default_rng(1)
    slots = np.full((400, 721), -32768, dtype=np.int16)
    slots[7] = rng.integers(-3000, 9000, 721)
    slots[399] = rng.integers(-3000, 9000, 721)
    p = horizons.write_tile(3, 4, slots, out_dir=tmp_path)
    assert p.name == "3_4.bin" and p.stat().st_size == 400 * 721 * 2
    back = horizons.read_tile(p)
    assert back.dtype == np.int16 and back.shape == (400, 721)
    assert np.array_equal(back, slots)
    assert np.all(back[0] == -32768)


def test_slot_index_formula():
    assert horizons.tile_of(-95, -95) == (0, 0, 0)
    assert horizons.tile_of(95, 95)[:2] == (9, 9)
    i, j, slot = horizons.tile_of(-75, -94)
    assert (i, j, slot) == (1, 0, 1 * 20 + 0)


def test_build_sites_layout(tmp_path):
    import json
    import pytest
    pytest.importorskip("numba")
    from lsp import dem
    src = tmp_path / "s.json"
    src.write_text(json.dumps({"sites": [{"id": "a", "lat": -89.0, "lon": 10.0},
                                          {"id": "b", "lat": 0.0, "lon": 20.0}]}))
    fine = dem.Grid((-40000.0, -40000.0), 40.0, np.zeros((2001, 2001), dtype=np.int16))
    # site a is ~30 km from the pole, outside this tiny fine grid's ring only if >40 km; keep inside
    coarse = dem.Grid((-120000.0, -120000.0), 120.0, np.zeros((2001, 2001), dtype=np.int16))
    glob = dem.GlobalGrid(np.zeros((16 * 180, 16 * 360), dtype=np.int16), ppd=16)
    out = horizons.build_sites(src, tmp_path / "o", fine=fine, coarse=coarse, glob=glob, log=lambda m: None)
    assert [p.name for p in out] == ["a.bin", "b.bin"]
    for p in out:
        a = np.fromfile(p, dtype="<i2")
        assert a.size == 3 * 3600
        assert np.all(a < 0) and np.all(a > -50)
