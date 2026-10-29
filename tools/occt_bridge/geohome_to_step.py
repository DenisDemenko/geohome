#!/usr/bin/env python3
"""Experimental GeoHome CAD JSON -> OpenCASCADE STEP strut solids.

Uses CadQuery (an OCCT/OpenCASCADE wrapper), not KumCAD's GUI.
For visualization and CAD interchange only; NOT verified structural geometry.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


def load_geometry(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if (data.get("schema"), data.get("version"), data.get("units")) != (
        "geohome.kumcad.interchange", 1, "mm"
    ):
        raise ValueError("Unsupported GeoHome CAD interchange schema/version/units")

    vertices = data.get("vertices")
    struts = data.get("struts")
    if not isinstance(vertices, list) or not isinstance(struts, list):
        raise ValueError("Missing vertices or struts arrays")
    if len(vertices) > 100_000 or len(struts) > 200_000:
        raise ValueError("Model exceeds prototype geometry limits")

    node_map = {}
    for vertex in vertices:
        key = vertex["id"]
        p = vertex["position"]
        coords = tuple(p[axis] for axis in ("x", "y", "z"))
        if key in node_map or any(not isinstance(n, (int, float)) or not math.isfinite(n) for n in coords):
            raise ValueError("Duplicate vertex or invalid coordinates")
        node_map[key] = coords

    for edge in struts:
        if edge["startVertexId"] not in node_map or edge["endVertexId"] not in node_map:
            raise ValueError(f"Strut {edge.get('id')} references missing vertex")
    return data


def build_step(data: dict, output: Path, diameter_mm: float) -> int:
    if not 0 < diameter_mm <= 1000 or not math.isfinite(diameter_mm):
        raise ValueError("Strut diameter must be within (0, 1000] mm")
    try:
        import cadquery as cq
    except ImportError as exc:
        raise RuntimeError("CadQuery is required: install the OpenCASCADE adapter dependencies") from exc

    nodes = {v["id"]: v["position"] for v in data["vertices"]}
    solids = []
    for edge in data["struts"]:
        a, b = nodes[edge["startVertexId"]], nodes[edge["endVertexId"]]
        start = cq.Vector(a["x"], a["y"], a["z"])
        delta = cq.Vector(b["x"] - a["x"], b["y"] - a["y"], b["z"] - a["z"])
        actual_length = delta.Length
        if not math.isfinite(actual_length) or actual_length <= 0.001:
            raise ValueError(f"Strut {edge.get('id')} has zero or invalid length")
        # The first prototype creates circular solids; beam profile and joints
        # are intentionally NOT assumed manufacturable.
        solids.append(cq.Solid.makeCylinder(diameter_mm / 2, actual_length, start, delta.normalized()))
    if not solids:
        raise ValueError("No struts to export")
    model = cq.Compound.makeCompound(solids)
    cq.exporters.export(model, str(output), exportType="STEP")
    return len(solids)


def main() -> None:
    parser = argparse.ArgumentParser(description="GeoHome CAD JSON to OCCT STEP")
    parser.add_argument("input", type=Path, help="CAD JSON exported by GeoHome")
    parser.add_argument("output", type=Path, help="Output STEP file (.step/.stp)")
    parser.add_argument("--strut-diameter-mm", type=float, default=20.0)
    args = parser.parse_args()

    if args.output.suffix.lower() not in (".step", ".stp"):
        parser.error("Output filename must end with .step or .stp")
    if args.input.resolve() == args.output.resolve():
        parser.error("Input and output must differ")
    data = load_geometry(args.input)
    count = build_step(data, args.output, args.strut_diameter_mm)
    print(f"Exported {count} strut solids to {args.output}")


if __name__ == "__main__":
    main()
