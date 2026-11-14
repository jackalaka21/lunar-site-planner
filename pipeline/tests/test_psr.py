import json
import unittest
from pathlib import Path

from lsp import psr


class TestPsrOverlay(unittest.TestCase):
    def test_psr_file_exists_and_under_1mb(self):
        self.assertTrue(psr.OUT_PATH.exists(), "psr.json must exist")
        size_bytes = psr.OUT_PATH.stat().st_size
        self.assertGreater(size_bytes, 500)
        self.assertLessEqual(size_bytes, 1_000_000, "psr.json must be <= 1 MB")

    def test_psr_polygons_simplified_and_lat_south_of_80s(self):
        doc = json.loads(psr.OUT_PATH.read_text(encoding="utf-8"))
        self.assertIn("https://pgda.gsfc.nasa.gov/products/69", doc.get("sourceUrl", ""))
        polygons = doc.get("polygons", [])
        self.assertGreaterEqual(len(polygons), 10)
        ids = {p["id"] for p in polygons}
        for required in ("shackleton", "shoemaker", "faustini", "haworth", "de-gerlache", "cabeus"):
            self.assertIn(required, ids)

        for poly in polygons:
            ring = poly["ring"]
            self.assertGreaterEqual(len(ring), 8, f"{poly['id']} ring too small")
            self.assertLessEqual(len(ring), 64, f"{poly['id']} ring must be simplified")
            self.assertEqual(ring[0], ring[-1], f"{poly['id']} ring must be closed")
            for lat, lon in ring:
                self.assertLessEqual(lat, -80.0, f"{poly['id']} vertex lat={lat} must be <= -80")
                self.assertGreaterEqual(lat, -90.0)
                self.assertGreaterEqual(lon, -180.0)
                self.assertLessEqual(lon, 180.0)

    def test_build_reproducible(self):
        built = psr.build(psr.OUT_PATH)
        on_disk = json.loads(psr.OUT_PATH.read_text(encoding="utf-8"))
        self.assertEqual(built, on_disk)


def test_psr_file_exists_and_under_1mb():
    TestPsrOverlay().test_psr_file_exists_and_under_1mb()


def test_psr_polygons_simplified_and_lat_south_of_80s():
    TestPsrOverlay().test_psr_polygons_simplified_and_lat_south_of_80s()


def test_build_reproducible():
    TestPsrOverlay().test_build_reproducible()


if __name__ == "__main__":
    unittest.main()
