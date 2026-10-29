"""OpenCASCADE connector prototype tests."""
import unittest
from pathlib import Path

import cadquery as cq

from connectors import create_connector_solids
from geohome_to_step import load_geometry


FIXTURE = Path(__file__).parent / "fixtures" / "triangle.json"


class ConnectorTests(unittest.TestCase):
    def test_radial_sockets_exist_for_each_node(self):
        model = load_geometry(FIXTURE)
        results = create_connector_solids(model, 50, 30, 20, 45)
        self.assertEqual(len(results), 3)
        for solid in results:
            self.assertTrue(solid.isValid())
            self.assertGreater(solid.Volume(), 0)

    def test_hollow_sockets_have_less_volume_than_solid_sockets(self):
        model = load_geometry(FIXTURE)
        hollow = create_connector_solids(model, 50, 30, 20, 45)
        small_bores = create_connector_solids(model, 50, 30, 1, 45)
        self.assertLess(sum(s.Volume() for s in hollow),
                        sum(s.Volume() for s in small_bores))

    def test_rejects_impossible_dimensions(self):
        model = load_geometry(FIXTURE)
        with self.assertRaisesRegex(ValueError, "smaller"):
            create_connector_solids(model, 50, 30, 30, 45)
        with self.assertRaisesRegex(ValueError, "Hub diameter"):
            create_connector_solids(model, 20, 30, 15, 45)


if __name__ == "__main__":
    unittest.main()
