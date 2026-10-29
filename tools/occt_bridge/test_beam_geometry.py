"""Geometry smoke tests executed with CadQuery/OpenCASCADE installed."""
import json
import math
import tempfile
import unittest
from pathlib import Path

import cadquery as cq

from geohome_to_step import build_step, load_geometry, _beam_profile, _beam_solid


FIXTURE = Path(__file__).parent / "fixtures" / "triangle.json"


class BeamSolidTests(unittest.TestCase):
    def test_cross_section_volumes_and_step_files(self):
        fixture = load_geometry(FIXTURE)
        start = cq.Vector(0, 0, 0)
        delta = cq.Vector(0, 0, 100)

        cases = [
            ("circular", 20, None, None, None, math.pi * 10 ** 2 * 100),
            ("pipe", 20, None, None, 2, math.pi * (10 ** 2 - 8 ** 2) * 100),
            ("square", 20, 20, 20, None, 20 * 20 * 100),
            ("rectangular", 20, 30, 60, None, 30 * 60 * 100),
        ]
        for kind, diameter, width, depth, wall, expected_volume in cases:
            with self.subTest(kind=kind):
                profile = _beam_profile(fixture, kind, diameter, width, depth, wall)
                solid = _beam_solid(cq, start, delta, 100, profile)
                self.assertTrue(solid.isValid())
                self.assertAlmostEqual(solid.Volume(), expected_volume, delta=0.1)
                with tempfile.TemporaryDirectory() as temp:
                    result = Path(temp) / "beam.step"
                    self.assertEqual(
                        build_step(fixture, result, diameter, kind, width, depth, wall),
                        len(fixture["struts"]),
                    )
                    self.assertGreater(result.stat().st_size, 100)
                    imported = cq.importers.importStep(str(result))
                    self.assertEqual(len(imported.solids().vals()), len(fixture["struts"]))

    def test_pipe_wall_validation(self):
        fixture = load_geometry(FIXTURE)
        with self.assertRaisesRegex(ValueError, "Pipe wall thickness"):
            _beam_profile(fixture, "pipe", 20, None, None, 10)


if __name__ == "__main__":
    unittest.main()
