"""Geometry smoke tests executed with CadQuery/OpenCASCADE installed."""
import json
import math
import tempfile
import unittest
from pathlib import Path

import cadquery as cq

from geohome_to_step import build_step, load_geometry, _beam_profile, _beam_solid, _trim_beam_ends


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

    def test_zero_angle_end_setback_gives_exact_length_and_volume(self):
        fixture = load_geometry(FIXTURE)
        profile = _beam_profile(fixture, "rectangular", 20, 20, 30, None)
        start = cq.Vector(0, 0, 0)
        delta = cq.Vector(0, 0, 100)
        body = _beam_solid(cq, start, delta, 100, profile)
        trimmed = _trim_beam_ends(cq, body, start, delta, 100,
                                  {"id": 1, "cutLengthMm": 80}, profile)
        self.assertTrue(trimmed.isValid())
        self.assertAlmostEqual(trimmed.Volume(), 20 * 30 * 80, delta=0.1)
        self.assertAlmostEqual(trimmed.BoundingBox().zmin, 10, delta=0.01)
        self.assertAlmostEqual(trimmed.BoundingBox().zmax, 90, delta=0.01)

    def test_miter_and_bevel_create_valid_non_square_end_faces(self):
        fixture = load_geometry(FIXTURE)
        profile = _beam_profile(fixture, "rectangular", 20, 20, 30, None)
        start = cq.Vector(0, 0, 0)
        delta = cq.Vector(0, 0, 100)
        body = _beam_solid(cq, start, delta, 100, profile)
        trimmed = _trim_beam_ends(
            cq, body, start, delta, 100,
            {"id": 2, "cutLengthMm": 80, "startMiterDeg": 12,
             "endMiterDeg": 7, "bevelDeg": 5}, profile
        )
        self.assertTrue(trimmed.isValid())
        self.assertGreater(trimmed.Volume(), 0)
        self.assertLess(trimmed.Volume(), body.Volume())

    def test_invalid_cut_length_rejected(self):
        fixture = load_geometry(FIXTURE)
        profile = _beam_profile(fixture, "square", 20, 20, 20, None)
        body = _beam_solid(cq, cq.Vector(0, 0, 0), cq.Vector(0, 0, 100), 100, profile)
        with self.assertRaisesRegex(ValueError, "Cut length cannot exceed"):
            _trim_beam_ends(cq, body, cq.Vector(0, 0, 0), cq.Vector(0, 0, 100),
                            100, {"cutLengthMm": 120}, profile)

    def test_pipe_wall_validation(self):
        fixture = load_geometry(FIXTURE)
        with self.assertRaisesRegex(ValueError, "Pipe wall thickness"):
            _beam_profile(fixture, "pipe", 20, None, None, 10)


if __name__ == "__main__":
    unittest.main()
