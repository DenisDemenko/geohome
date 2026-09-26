import {
  DomeParameters,
  DomeModel,
  Node,
  Face,
  BeamProfile,
  ConnectorParams,
  SheathingParams
} from "./types";
import { ICOSAHEDRON_VERTICES, ICOSAHEDRON_FACES } from "./icosahedron";
import { subdivideIcosahedron } from "./subdivision";
import { buildTopology } from "./topology";
import { validateDome } from "./validation";
import { DEFAULT_BEAM_PROFILES, analyzeBeamStructure } from "./beams";
import { DEFAULT_CONNECTOR_PARAMS } from "./connectors";
import { DEFAULT_SHEATHING_PARAMS, getRecommendedPlywoodThickness } from "./sheathing";

export function generateDome(
  parameters: DomeParameters,
  customProfile?: BeamProfile,
  customConnector?: ConnectorParams,
  customSheathing?: SheathingParams
): DomeModel {
  const { diameter, frequency, cutType, height } = parameters;

  if (diameter <= 0) {
    throw new Error("Діаметр купола має бути більшим за нуль");
  }

  const radius = diameter / 2;

  // 1. Subdivide icosahedron
  const subdivision = subdivideIcosahedron(
    ICOSAHEDRON_VERTICES,
    ICOSAHEDRON_FACES,
    frequency
  );

  // 2. Scale to millimeter radius
  const scaledVertices = subdivision.vertices.map(v => ({
    x: v.x * radius,
    y: v.y * radius,
    z: v.z * radius
  }));

  // 3. Determine cut plane Z
  // In our coordinate system, top of dome is at +radius.
  // Full sphere Z is in [-radius, +radius].
  // Standard fractions:
  // 1/2 hemisphere: cut at z = 0 (height = radius)
  // 3/8 dome: height = diameter * 3/8 = radius * 0.75 -> cut at z = radius - height = 0.25 * radius
  // 5/8 dome: height = diameter * 5/8 = radius * 1.25 -> cut at z = -0.25 * radius
  // 7/12 dome: height = diameter * 7/12
  let cutZ = 0;
  let effectiveHeight = height;

  if (cutType === "1/2") {
    cutZ = 0;
    effectiveHeight = radius;
  } else if (cutType === "3/8") {
    effectiveHeight = (diameter * 3) / 8;
    cutZ = radius - effectiveHeight;
  } else if (cutType === "5/8") {
    effectiveHeight = (diameter * 5) / 8;
    cutZ = radius - effectiveHeight;
  } else if (cutType === "7/12") {
    effectiveHeight = (diameter * 7) / 12;
    cutZ = radius - effectiveHeight;
  } else {
    // Exact height
    effectiveHeight = Math.min(diameter, Math.max(radius * 0.2, height));
    cutZ = radius - effectiveHeight;
  }

  // Filter faces whose centroid or all vertices are above the cutting plane
  // Keep complete triangles above cut plane (with slight tolerance to catch the base ring)
  const tolerance = radius * 0.04;
  const keptFaces = subdivision.faces.filter(face => {
    const a = scaledVertices[face.a];
    const b = scaledVertices[face.b];
    const c = scaledVertices[face.c];

    // Count how many vertices are above cut plane
    const aboveCount =
      (a.z >= cutZ - tolerance ? 1 : 0) +
      (b.z >= cutZ - tolerance ? 1 : 0) +
      (c.z >= cutZ - tolerance ? 1 : 0);

    return aboveCount >= 3;
  });

  // Collect unique used vertices
  const usedVertexIds = new Set<number>();
  for (const face of keptFaces) {
    usedVertexIds.add(face.a);
    usedVertexIds.add(face.b);
    usedVertexIds.add(face.c);
  }

  const remap = new Map<number, number>();
  // Re-orient dome so base is on Z=0 and dome apex is at Z = effectiveHeight
  // Find minimum Z among kept vertices
  let minZ = Infinity;
  for (const id of usedVertexIds) {
    if (scaledVertices[id].z < minZ) {
      minZ = scaledVertices[id].z;
    }
  }

  let domeVertices = [...usedVertexIds].map((oldId, newId) => {
    remap.set(oldId, newId);
    const v = scaledVertices[oldId];
    return {
      x: v.x,
      y: v.y,
      z: v.z - minZ // Level ground so base rests on Z = 0
    };
  });

  let domeFaces = keptFaces.map(face => ({
    a: remap.get(face.a)!,
    b: remap.get(face.b)!,
    c: remap.get(face.c)!
  }));

  // Detect boundary edges & nodes
  const edgeCountMap = new Map<string, number>();
  for (const f of domeFaces) {
    const keys = [
      `${Math.min(f.a, f.b)}-${Math.max(f.a, f.b)}`,
      `${Math.min(f.b, f.c)}-${Math.max(f.b, f.c)}`,
      `${Math.min(f.c, f.a)}-${Math.max(f.c, f.a)}`
    ];
    for (const k of keys) {
      edgeCountMap.set(k, (edgeCountMap.get(k) || 0) + 1);
    }
  }

  const boundaryVertexIds = new Set<number>();
  const boundaryEdges: [number, number][] = [];
  for (const [key, count] of edgeCountMap.entries()) {
    if (count === 1) {
      const [u, v] = key.split("-").map(Number);
      boundaryVertexIds.add(u);
      boundaryVertexIds.add(v);
      boundaryEdges.push([u, v]);
    }
  }

  // Leveling along foundation base horizon with beams if option enabled
  if (parameters.levelBaseHorizon) {
    const mode = parameters.levelingMode || "flat_ring";

    if (mode === "flat_ring") {
      let sumR = 0;
      boundaryVertexIds.forEach(vid => {
        sumR += Math.hypot(domeVertices[vid].x, domeVertices[vid].y);
      });
      const avgBaseRadius =
        boundaryVertexIds.size > 0 ? sumR / boundaryVertexIds.size : radius;

      for (const vid of boundaryVertexIds) {
        const v = domeVertices[vid];
        const angle = Math.atan2(v.y, v.x);
        domeVertices[vid] = {
          x: Math.round(avgBaseRadius * Math.cos(angle) * 10) / 10,
          y: Math.round(avgBaseRadius * Math.sin(angle) * 10) / 10,
          z: 0 // Leveled exactly to horizontal foundation plane
        };
      }
    } else if (mode === "risers") {
      const groundNodeMap = new Map<number, number>();
      const extraFaces: { a: number; b: number; c: number }[] = [];

      for (const vid of boundaryVertexIds) {
        const v = domeVertices[vid];
        if (v.z <= 20) {
          domeVertices[vid] = { x: v.x, y: v.y, z: 0 };
          groundNodeMap.set(vid, vid);
        } else {
          const gId = domeVertices.length;
          domeVertices.push({ x: v.x, y: v.y, z: 0 });
          groundNodeMap.set(vid, gId);
        }
      }

      for (const [u, v] of boundaryEdges) {
        const gU = groundNodeMap.get(u)!;
        const gV = groundNodeMap.get(v)!;
        if (gU !== u || gV !== v) {
          extraFaces.push({ a: u, b: v, c: gV });
          extraFaces.push({ a: u, b: gV, c: gU });
        }
      }

      domeFaces = [...domeFaces, ...extraFaces];
    }
  }

  // Build full topology
  const topology = buildTopology(domeVertices, domeFaces, 0);

  // Compute dome geometric statistics
  const lengths = topology.edges.map(e => e.length);
  const minBeamLength = Math.min(...lengths);
  const maxBeamLength = Math.max(...lengths);
  const averageBeamLength =
    Math.round((lengths.reduce((sum, v) => sum + v, 0) / lengths.length) * 10) / 10;

  const degrees = topology.nodes.map(n => n.edges.length);

  // Calculate base radius & circumference from boundary nodes
  const boundaryNodes = topology.nodes.filter(n => n.boundary);
  const baseRadiusMm =
    boundaryNodes.length > 0
      ? boundaryNodes.reduce((sum, n) => sum + Math.hypot(n.position.x, n.position.y), 0) /
        boundaryNodes.length
      : radius;

  const floorAreaM2 = Math.round((Math.PI * Math.pow(baseRadiusMm / 1000, 2)) * 10) / 10;
  const baseCircumferenceM = Math.round((2 * Math.PI * (baseRadiusMm / 1000)) * 10) / 10;

  // Surface area sum of all faces
  const domeSurfaceAreaM2 =
    Math.round(
      (topology.faces.reduce((sum, f) => sum + f.area, 0) / 1_000_000) * 10
    ) / 10;

  // Spherical cap volume: V = (pi * h^2 / 3) * (3R - h)
  const hM = effectiveHeight / 1000;
  const rM = radius / 1000;
  const domeVolumeM3 =
    Math.round(((Math.PI * Math.pow(hM, 2) / 3) * (3 * rM - hM)) * 10) / 10;

  const statistics = {
    nodes: topology.nodes.length,
    edges: topology.edges.length,
    faces: topology.faces.length,
    minBeamLength: Math.round(minBeamLength * 10) / 10,
    maxBeamLength: Math.round(maxBeamLength * 10) / 10,
    averageBeamLength,
    minNodeDegree: Math.min(...degrees),
    maxNodeDegree: Math.max(...degrees),
    floorAreaM2,
    domeSurfaceAreaM2,
    domeVolumeM3,
    baseCircumferenceM,
    baseRadiusMm: Math.round(baseRadiusMm)
  };

  const validation = validateDome(
    topology.nodes,
    topology.edges,
    topology.faces
  );

  const beamProfile = customProfile || DEFAULT_BEAM_PROFILES[0];
  const connectorParams = customConnector || DEFAULT_CONNECTOR_PARAMS;

  // Apply timber strut trimming / cut-back based on connector ring diameter
  const hubDiam = connectorParams.hubDiameter || 140;

  for (const edge of topology.edges) {
    const effectiveHub = Math.min(hubDiam, edge.length * 0.5);
    const hubSetback = Math.round((effectiveHub / 2) * 10) / 10;
    edge.hubSetback = hubSetback;
    edge.cutLength = Math.max(0.5, Math.round((edge.length - effectiveHub) * 10) / 10);
  }

  for (const group of topology.beamGroups) {
    const effectiveHub = Math.min(hubDiam, group.length * 0.5);
    const hubSetback = Math.round((effectiveHub / 2) * 10) / 10;
    group.hubSetback = hubSetback;
    group.cutLength = Math.max(0.5, Math.round((group.length - effectiveHub) * 10) / 10);
  }

  const structuralAnalysis = analyzeBeamStructure(
    topology.edges,
    beamProfile,
    radius,
    domeSurfaceAreaM2,
    topology.faces.length
  );

  return {
    parameters: {
      ...parameters,
      height: Math.round(effectiveHeight)
    },
    nodes: topology.nodes,
    edges: topology.edges,
    faces: topology.faces,
    beamGroups: topology.beamGroups,
    faceGroups: topology.faceGroups,
    statistics,
    validation,
    approved: false,
    beamProfile,
    structuralAnalysis,
    connectorParams,
    sheathingParams: customSheathing || {
      ...DEFAULT_SHEATHING_PARAMS,
      thickness: getRecommendedPlywoodThickness(diameter)
    }
  };
}
