import json

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from lsp import ps, psr

PX = 120.0


def _write_raster(path, raw, origin=(-12000.0, 12000.0)):
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=raw.shape[0],
        width=raw.shape[1],
        count=1,
        dtype="int16",
        crs=ps.PROJ_STRING,
        transform=from_origin(origin[0], origin[1], PX, PX),
        nodata=-32768,
    ) as dst:
        dst.write(raw, 1)
        dst.scales = (4e-5,)


def _synthetic(tmp_path):
    raw = np.full((200, 200), 10000, dtype=np.int16)  # sunlit (0.4)
    raw[20:70, 30:60] = 0  # 50 x 30 px zero-visibility block
    raw[100:140, 100:140] = -32768  # nodata block: must not count as shadow
    raw[150:152, 150:152] = 0  # 4 px speck: below min area
    raw[5:15, 120:130] = 20  # visible 8e-4: not shadow
    tif = tmp_path / "avg.tif"
    _write_raster(tif, raw)
    return tif


def test_synthetic_zero_region_area_and_schema(tmp_path):
    tif = _synthetic(tmp_path)
    out = tmp_path / "psr.json"
    doc = psr.build(tif, out, min_area_km2=0.5, simplify_m=PX)
    assert doc["type"] == "FeatureCollection"
    assert len(doc["features"]) == 1
    expected = 50 * 30 * (PX / 1000) ** 2  # 21.6 km2
    assert doc["features"][0]["properties"]["areaKm2"] == pytest.approx(expected, rel=0.01)
    geom = doc["features"][0]["geometry"]
    assert geom["type"] == "Polygon"
    ring = geom["coordinates"][0]
    assert ring[0] == ring[-1]
    assert len(ring) <= 8  # rectangle simplifies to ~4 corners
    for lon, lat in ring:
        assert -90.0 <= lat <= -79.99  # vertices sit on pixel edges (<= half a pixel)
        assert -180.0 <= lon <= 180.0
    assert json.loads(out.read_text(encoding="utf-8")) == doc


def test_synthetic_vertices_match_ps_projection(tmp_path):
    doc = psr.build(_synthetic(tmp_path), tmp_path / "psr.json", min_area_km2=0.5)
    ring = np.array(doc["features"][0]["geometry"]["coordinates"][0])
    xs, ys = ps.to_xy(ring[:, 1], ring[:, 0])
    assert xs.min() == pytest.approx(-12000.0 + 30 * PX, abs=5.0)
    assert xs.max() == pytest.approx(-12000.0 + 60 * PX, abs=5.0)
    assert ys.max() == pytest.approx(12000.0 - 20 * PX, abs=5.0)
    assert ys.min() == pytest.approx(12000.0 - 70 * PX, abs=5.0)


def test_metadata_present(tmp_path):
    doc = psr.build(_synthetic(tmp_path), tmp_path / "psr.json")
    meta = doc["metadata"]
    for key in ("source_url", "citation", "threshold", "minAreaKm2", "simplifyM", "generatedUtc"):
        assert key in meta
    assert meta["source_url"] == "https://pgda.gsfc.nasa.gov/products/69"


def test_latitude_cut_excludes_pixels_north_of_80s(tmp_path):
    raw = np.zeros((200, 200), dtype=np.int16)
    # 200 px * 120 m = 24 km half-width only; place the grid ~ 80 deg S ring (rho ~ 600 km) instead.
    tif = tmp_path / "far.tif"
    _write_raster(tif, raw, origin=(300000.0, 700000.0))
    doc = psr.build(tif, tmp_path / "psr.json", min_area_km2=0.5)
    # rho from 300-324 km east and 676-700 km north: ~ 740-760 km, i.e. north of 80 S -> all excluded
    assert doc["features"] == []


def test_douglas_peucker_keeps_corners():
    ring = np.array([[0, 0], [5, 0.01], [10, 0], [10, 10], [0, 10], [0, 0]], dtype=float)
    out = psr.simplify_ring(ring, 5.0)
    assert len(out) == 5
    assert np.array_equal(out[0], out[-1])


@pytest.mark.needs_data
def test_real_raster_largest_psrs(tmp_path):
    if not psr.RASTER_PATH.exists():
        pytest.skip("PGDA raster not downloaded")
    doc = psr.build(psr.RASTER_PATH, tmp_path / "psr.json")
    feats = doc["features"]
    assert len(feats) > 100
    centroids = []
    for f in feats[:12]:
        c = np.array(f["geometry"]["coordinates"][0])
        centroids.append(ps.to_xy(c[:, 1], c[:, 0]))

    def contains(lat, lon):
        x, y = ps.to_xy(lat, lon)
        for f in feats:
            ring = np.array(f["geometry"]["coordinates"][0])
            rx, ry = ps.to_xy(ring[:, 1], ring[:, 0])
            if rx.min() <= x <= rx.max() and ry.min() <= y <= ry.max():
                return True
        return False

    for lat, lon in ((-89.9, 129.8), (-87.45, -4.0), (-88.1, 44.9), (-87.3, 77.0), (-84.9, -35.5)):
        assert contains(lat, lon)


def test_committed_psr_file():
    assert psr.OUT_PATH.exists()
    size = psr.OUT_PATH.stat().st_size
    assert 10_000 < size <= 1_000_000
    doc = json.loads(psr.OUT_PATH.read_text(encoding="utf-8"))
    assert doc["type"] == "FeatureCollection"
    assert doc["metadata"]["source_url"] == psr.SOURCE_URL
    assert len(doc["features"]) >= 100
    for f in doc["features"]:
        assert f["properties"]["areaKm2"] >= doc["metadata"]["minAreaKm2"]
        for ring in f["geometry"]["coordinates"]:
            assert ring[0] == ring[-1]
            for lon, lat in ring:
                assert -90.0 <= lat <= -79.99  # vertices sit on pixel edges (<= half a pixel)
