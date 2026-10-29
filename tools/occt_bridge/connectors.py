"""Experimental geodesic connector solids from GeoHome interchange data.

Parametric spherical hub with radially oriented tubular sockets. These are
visual CAD prototypes, NOT certified structural or printable connector designs.
"""
from __future__ import annotations

import math


def _dimension(value: float, name: str) -> float:
    if not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 < value <= 500:
        raise ValueError(f"{name} must be a positive dimension up to 500 mm")
    return float(value)


def create_connector_solids(data: dict, hub_diameter_mm: float = 50,
                            socket_outer_mm: float = 30,
                            socket_inner_mm: float = 20,
                            socket_length_mm: float = 45):
    """Create one hub + hollow sleeve assembly for each connected node."""
    import cadquery as cq

    hub_diameter_mm = _dimension(hub_diameter_mm, "hub diameter")
    socket_outer_mm = _dimension(socket_outer_mm, "socket outer diameter")
    socket_inner_mm = _dimension(socket_inner_mm, "socket inner diameter")
    socket_length_mm = _dimension(socket_length_mm, "socket length")
    if socket_inner_mm >= socket_outer_mm:
        raise ValueError("Socket inner diameter must be smaller than outer diameter")
    if hub_diameter_mm < socket_outer_mm:
        raise ValueError("Hub diameter must be at least the socket outer diameter")

    points = {v["id"]: cq.Vector(**v["position"]) for v in data["vertices"]}
    edges = {e["id"]: e for e in data["struts"]}
    outputs = []
    for node in data["connectors"]:
        center = points[node["vertexId"]]
        if not node["beamIds"]:
            continue

        hub = cq.Solid.makeSphere(hub_diameter_mm / 2, center)
        sleeves = []
        bores = []
        for edge_id in node["beamIds"]:
            edge = edges.get(edge_id)
            if edge is None:
                raise ValueError(f"Unknown beam {edge_id} for connector")
            other_id = (edge["endVertexId"] if edge["startVertexId"] == node["vertexId"]
                        else edge["startVertexId"])
            if other_id not in points:
                raise ValueError(f"Unknown end vertex {other_id}")
            vector = points[other_id] - center
            if vector.Length <= 1e-6:
                raise ValueError("Zero-length connector ray")
            direction = vector.normalized()
            # Cylinder starts inside the hub for connected topology.
            sleeves.append(cq.Solid.makeCylinder(socket_outer_mm / 2, socket_length_mm,
                                                 center, direction))
            # Bores stop before the hub centre to preserve a solid central core.
            bore_start = center + direction.multiply(hub_diameter_mm * 0.35)
            bores.append(cq.Solid.makeCylinder(
                socket_inner_mm / 2, socket_length_mm,
                bore_start, direction
            ))
        for sleeve in sleeves:
            hub = hub.fuse(sleeve)
        for bore in bores:
            hub = hub.cut(bore)
        if hub.Volume() <= 0 or not hub.isValid():
            raise ValueError(f"Invalid connector solid at node {node['vertexId']}")
        outputs.append(hub)
    return outputs
