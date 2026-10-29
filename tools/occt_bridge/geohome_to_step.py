#!/usr/bin/env python3
"""Experimental GeoHome CAD JSON -> OpenCASCADE STEP strut solids.

Uses CadQuery (an OCCT/OpenCASCADE wrapper), not KumCAD's GUI.
Supports circular solid, hollow pipe and rectangular/square extruded solids.\nFor visualization and CAD interchange only; mitres and structural joints are NOT modeled.
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


def _positive(value: float, label: str) -> float:
    if not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
        raise ValueError(f"{label} must be a positive finite number")
    return float(value)


def _beam_profile(data: dict, override: str | None, diameter_mm: float,
                  width_mm: float | None, depth_mm: float | None,
                  wall_mm: float | None) -> dict:
    """Use GeoHome beam dimensions unless explicitly overridden at the CLI."""
    original = data.get("beamProfile", {})
    kind = override or original.get("type", "circular")
    if kind not in ("circular", "pipe", "rectangular", "square"):
        raise ValueError(f"Unsupported beam profile: {kind}")
    width = _positive(width_mm if width_mm is not None else original.get("widthMm", diameter_mm), "width")
    depth = _positive(depth_mm if depth_mm is not None else original.get("depthMm", width), "depth")
    diameter = _positive(
        diameter_mm if override and kind in ("pipe", "circular") else
        original.get("diameterMm") or original.get("widthMm") or diameter_mm,
        "diameter",
    )
    wall = wall_mm if wall_mm is not None else original.get("wallThicknessMm")
    if kind == "pipe":
        wall = _positive(wall if wall is not None else 2, "wall thickness")
        if 2 * wall >= diameter:
            raise ValueError("Pipe wall thickness must be smaller than its radius")
    elif wall is not None and wall <= 0:
        raise ValueError("Wall thickness must be positive")
    for label, value in (("width", width), ("depth", depth), ("diameter", diameter)):
        if value > 1000:
            raise ValueError(f"{label} exceeds the prototype 1000 mm limit")
    return {"kind": kind, "width": width, "depth": depth, "diameter": diameter, "wall": wall}


def _beam_solid(cq, start, delta, length_mm: float, profile: dict):
    direction = delta.normalized()
    kind = profile["kind"]
    if kind == "circular":
        return cq.Solid.makeCylinder(profile["diameter"] / 2, length_mm, start, direction)
    if kind == "pipe":
        # Annular sketch extruded along the beam axis. Open ends remain hollow.
        plane = cq.Plane(origin=start, normal=direction)
        return (cq.Workplane(plane)
                .circle(profile["diameter"] / 2)
                .circle(profile["diameter"] / 2 - profile["wall"])
                .extrude(length_mm).val())

    # Stable perpendicular local axes even for near-vertical struts.
    z_axis = cq.Vector(0, 0, 1)
    reference = cq.Vector(0, 1, 0) if abs(direction.dot(z_axis)) > 0.95 else z_axis
    x_axis = reference.cross(direction).normalized()
    plane = cq.Plane(origin=start, xDir=x_axis, normal=direction)
    dimension = profile["width"]
    other = dimension if kind == "square" else profile["depth"]
    return cq.Workplane(plane).rect(dimension, other).extrude(length_mm).val()



def _trim_beam_ends(cq, solid, start, delta, length_mm: float, edge: dict,
                    profile: dict):
    """Clip a beam at two defined local cutting planes.

    Convention: local X is the beam miter direction and local Y is the bevel
    direction. Positive miter/bevel tilt the inward cut-plane normal toward
    +X/+Y at both ends. Actual production orientation still requires a
    connector-specific frame and engineering verification.
    """
    miter_a = float(edge.get("startMiterDeg") or 0)
    miter_b = float(edge.get("endMiterDeg") or 0)
    bevel = float(edge.get("bevelDeg") or 0)
    for name, value in (("start miter", miter_a), ("end miter", miter_b), ("bevel", bevel)):
        if not math.isfinite(value) or not 0 <= value < 80:
            raise ValueError(f"{name} must be from 0 to under 80 degrees")

    cut_length = edge.get("cutLengthMm")
    setback = edge.get("hubSetbackMm")
    if cut_length is not None:
        _positive(cut_length, "cut length")
        if cut_length > length_mm + 1e-3:
            raise ValueError("Cut length cannot exceed centerline length")
        inset = (length_mm - cut_length) / 2
    else:
        inset = 0 if setback is None else float(setback)
        if not math.isfinite(inset) or inset < 0:
            raise ValueError("Invalid hub setback")
    if 2 * inset >= length_mm:
        raise ValueError("Hub setbacks leave no usable beam")

    direction = delta.normalized()
    up = cq.Vector(0, 0, 1)
    reference = cq.Vector(0, 1, 0) if abs(direction.dot(up)) > 0.95 else up
    x_axis = reference.cross(direction).normalized()
    y_axis = direction.cross(x_axis).normalized()
    extent = 4 * (length_mm + profile["width"] + profile["depth"] + profile["diameter"] + 10)

    for sign, origin, miter in (
        (1, start + direction.multiply(inset), miter_a),
        (-1, start + direction.multiply(length_mm - inset), miter_b),
    ):
        m = math.radians(miter)
        b = math.radians(bevel)
        inward = (direction.multiply(sign * math.cos(m) * math.cos(b))
                  + x_axis.multiply(math.sin(m) * math.cos(b))
                  + y_axis.multiply(math.sin(b))).normalized()
        plane = cq.Plane(origin=origin, normal=inward)
        halfspace = cq.Workplane(plane).rect(extent, extent).extrude(extent).val()
        solid = solid.intersect(halfspace)
        if solid.Volume() <= 1e-6 or not solid.isValid():
            raise ValueError(f"Cut planes eliminated or invalidated beam {edge.get('id')}")
    return solid


def build_step(data: dict, output: Path, diameter_mm: float = 20.0,
               profile_type: str | None = None, width_mm: float | None = None,
               depth_mm: float | None = None, wall_mm: float | None = None) -> int:
    profile = _beam_profile(data, profile_type, diameter_mm, width_mm, depth_mm, wall_mm)
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
        solid = _beam_solid(cq, start, delta, actual_length, profile)
        solids.append(_trim_beam_ends(cq, solid, start, delta, actual_length, edge, profile))
    if not solids:
        raise ValueError("No struts to export")
    model = cq.Compound.makeCompound(solids)
    cq.exporters.export(model, str(output), exportType="STEP")
    return len(solids)


def main() -> None:
    parser = argparse.ArgumentParser(description="GeoHome CAD JSON to OCCT STEP")
    parser.add_argument("input", type=Path, help="CAD JSON exported by GeoHome")
    parser.add_argument("output", type=Path, help="Output STEP file (.step/.stp)")
    parser.add_argument("--strut-diameter-mm", type=float, default=20.0, help="Fallback diameter for legacy interchange")
    parser.add_argument("--profile", choices=("circular", "pipe", "square", "rectangular"), help="Override GeoHome beam type")
    parser.add_argument("--width-mm", type=float)
    parser.add_argument("--depth-mm", type=float)
    parser.add_argument("--wall-mm", type=float)
    args = parser.parse_args()

    if args.output.suffix.lower() not in (".step", ".stp"):
        parser.error("Output filename must end with .step or .stp")
    if args.input.resolve() == args.output.resolve():
        parser.error("Input and output must differ")
    data = load_geometry(args.input)
    count = build_step(data, args.output, args.strut_diameter_mm, args.profile, args.width_mm, args.depth_mm, args.wall_mm)
    print(f"Exported {count} strut solids to {args.output}")


if __name__ == "__main__":
    main()
