import {
  Node,
  Edge,
  Face,
  BeamTypeGroup,
  FaceTypeGroup,
  Vec3
} from "./types";
import {
  distance,
  sub,
  normalize,
  triangleNormal,
  triangleArea,
  triangleInteriorAngles,
  dot,
  clamp
} from "./math";

export interface Topology {
  nodes: Node[];
  edges: Edge[];
  faces: Face[];
  beamGroups: BeamTypeGroup[];
  faceGroups: FaceTypeGroup[];
}

const BEAM_PALETTE = [
  "#5B9279", // Mint / Sage
  "#4A7C9B", // Ocean Sky
  "#DE7C5A", // Warm Peach / Terracotta
  "#DDA843", // Warm Ochre
  "#7B6D8D", // Heather Purple
  "#3D6B5D", // Deep Forest
  "#B56576", // Dusty Rose
  "#6D8B74", // Olive
  "#2A9D8F", // Teal
  "#E76F51", // Burnt Coral
  "#F4A261", // Sandy Gold
  "#457B9D", // Steel Blue
  "#8338EC", // Iris Violet
  "#3A86FF", // Azure Blue
  "#FB5607", // Tangerine
  "#06D6A0"  // Emerald
];

const FACE_PALETTE = [
  "#E8F1EC", // Mint soft
  "#E4EEF5", // Sky soft
  "#FCECE5", // Peach soft
  "#FAF2DE", // Warm sand
  "#EDE8F2", // Lavender soft
  "#E3ECE7"  // Sage soft
];

function getTypeName(idx: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (idx < 26) return letters[idx];
  const first = letters[Math.floor(idx / 26) - 1];
  const second = letters[idx % 26];
  return `${first}${second}`;
}

export function buildTopology(
  vertices: Vec3[],
  rawFaces: { a: number; b: number; c: number }[],
  cutPlaneZ: number,
  outerOffset = 0,
  sphereCenterZ = 0,
  sphereRadius = 0,
  shapeType: "sphere" | "ellipsoid" = "sphere",
  radX = 0,
  radY = 0,
  radZ = 0
): Topology {
  const nodes: Node[] = vertices.map((position, id) => ({
    id,
    position,
    edges: [],
    neighbours: [],
    boundary: false
  }));

  const edgeMap = new Map<string, number>();
  const edges: Edge[] = [];

  function addEdge(a: number, b: number): number {
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    const key = `${start}-${end}`;

    const existing = edgeMap.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const p1 = vertices[start];
    const p2 = vertices[end];
    const len = distance(p1, p2);
    const direction = normalize(sub(p2, p1));

    const edge: Edge = {
      id: edges.length,
      start,
      end,
      length: Math.round(len * 10) / 10, // round to 0.1 mm
      direction,
      type: "A",
      color: BEAM_PALETTE[0]
    };

    edges.push(edge);
    edgeMap.set(key, edge.id);

    nodes[start].edges.push(edge.id);
    nodes[end].edges.push(edge.id);
    nodes[start].neighbours.push(end);
    nodes[end].neighbours.push(start);

    return edge.id;
  }

  const faces: Face[] = [];
  let faceCounter = 0;

  for (const rf of rawFaces) {
    const e1 = addEdge(rf.a, rf.b);
    const e2 = addEdge(rf.b, rf.c);
    const e3 = addEdge(rf.c, rf.a);

    const vA = vertices[rf.a];
    const vB = vertices[rf.b];
    const vC = vertices[rf.c];

    const normal = triangleNormal(vA, vB, vC);
    const area = triangleArea(vA, vB, vC);

    faces.push({
      id: faceCounter++,
      a: rf.a,
      b: rf.b,
      c: rf.c,
      type: "",
      normal,
      area
    });
  }

  // Detect boundary nodes (nodes close to base plane or with unclosed face ring)
  const edgeFaceCounts = new Map<number, number>();
  for (const f of faces) {
    const sortedEdges = [
      edgeMap.get(`${Math.min(f.a, f.b)}-${Math.max(f.a, f.b)}`)!,
      edgeMap.get(`${Math.min(f.b, f.c)}-${Math.max(f.b, f.c)}`)!,
      edgeMap.get(`${Math.min(f.c, f.a)}-${Math.max(f.c, f.a)}`)!
    ];
    for (const eid of sortedEdges) {
      edgeFaceCounts.set(eid, (edgeFaceCounts.get(eid) || 0) + 1);
    }
  }

  for (const [eid, count] of edgeFaceCounts.entries()) {
    if (count === 1) {
      // Boundary edge
      const edge = edges[eid];
      nodes[edge.start].boundary = true;
      nodes[edge.end].boundary = true;

      const p1 = vertices[edge.start];
      const p2 = vertices[edge.end];
      if (Math.abs(p1.z) < 2.0 && Math.abs(p2.z) < 2.0) {
        edge.isBaseBeam = true;
      }
    }
  }

  // Classify beams by length into Types A, B, C, D...
  // Cluster lengths with 1.5mm tolerance
  const lengthClusters: { length: number; count: number; edgeIds: number[] }[] = [];
  const sortedEdges = [...edges].sort((a, b) => a.length - b.length);

  for (const edge of sortedEdges) {
    let matched = false;
    for (const cluster of lengthClusters) {
      if (Math.abs(cluster.length - edge.length) < 2.5) {
        cluster.edgeIds.push(edge.id);
        cluster.count++;
        // update running average
        cluster.length =
          cluster.edgeIds.reduce((sum, id) => sum + edges[id].length, 0) /
          cluster.edgeIds.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      lengthClusters.push({
        length: edge.length,
        count: 1,
        edgeIds: [edge.id]
      });
    }
  }

  // Sort clusters by length (A = shortest, B, C...)
  lengthClusters.sort((a, b) => a.length - b.length);

  const beamGroups: BeamTypeGroup[] = [];

  lengthClusters.forEach((cluster, idx) => {
    const typeName = getTypeName(idx);
    const color = BEAM_PALETTE[idx % BEAM_PALETTE.length];
    const avgLen = Math.round(cluster.length * 10) / 10;
    const isBase = cluster.edgeIds.some(eid => edges[eid].isBaseBeam);

    for (const eid of cluster.edgeIds) {
      edges[eid].type = typeName;
      edges[eid].color = color;
    }

    beamGroups.push({
      type: typeName,
      color,
      length: avgLen,
      count: cluster.count,
      endAngleStart: 0,
      endAngleEnd: 0,
      isBaseBeam: isBase
    });
  });

  const rx = radX > 0 ? radX : (sphereRadius || 4000);
  const ry = radY > 0 ? radY : (sphereRadius || 4000);
  const rz = radZ > 0 ? radZ : (sphereRadius || 4000);

  // Helper to compute surface normal at a node (spherical or ellipsoid)
  function getNodeNormal(pos: Vec3): Vec3 {
    if (shapeType === "ellipsoid") {
      const nx = pos.x / (rx * rx);
      const ny = pos.y / (ry * ry);
      const nz = pos.z / (rz * rz);
      const len = Math.hypot(nx, ny, nz);
      return len > 0.00001 ? { x: nx / len, y: ny / len, z: nz / len } : { x: 0, y: 0, z: 1 };
    }
    const len = Math.hypot(pos.x, pos.y, pos.z - sphereCenterZ);
    return len > 0.00001
      ? { x: pos.x / len, y: pos.y / len, z: (pos.z - sphereCenterZ) / len }
      : { x: 0, y: 0, z: 1 };
  }

  // Populate individual beam attributes: beamLabel, quadrant, miter & bevel angles
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    edge.beamLabel = `E-${String(edge.id + 1).padStart(3, "0")}`;

    const pA = vertices[edge.start];
    const pB = vertices[edge.end];
    const midX = (pA.x + pB.x) / 2;
    const midY = (pA.y + pB.y) / 2;

    if (midX >= 0 && midY >= 0) {
      edge.quadrant = "Q1";
    } else if (midX < 0 && midY >= 0) {
      edge.quadrant = "Q2";
    } else if (midX < 0 && midY < 0) {
      edge.quadrant = "Q3";
    } else {
      edge.quadrant = "Q4";
    }

    // Strut direction vector A -> B
    const dAB = { x: pB.x - pA.x, y: pB.y - pA.y, z: pB.z - pA.z };
    const lenAB = Math.hypot(dAB.x, dAB.y, dAB.z) || 1;
    const dirAB = { x: dAB.x / lenAB, y: dAB.y / lenAB, z: dAB.z / lenAB };

    const normA = getNodeNormal(pA);
    const normB = getNodeNormal(pB);

    // Miter angle at A: angle from perpendicular to hub normal
    const dotA = Math.max(-1, Math.min(1, dirAB.x * normA.x + dirAB.y * normA.y + dirAB.z * normA.z));
    const angleRadA = Math.acos(dotA);
    const miterA = Math.round(Math.abs(90 - (angleRadA * 180) / Math.PI) * 10) / 10;

    // Miter angle at B: direction is B -> A (-dirAB)
    const dotB = Math.max(-1, Math.min(1, -dirAB.x * normB.x - dirAB.y * normB.y - dirAB.z * normB.z));
    const angleRadB = Math.acos(dotB);
    const miterB = Math.round(Math.abs(90 - (angleRadB * 180) / Math.PI) * 10) / 10;

    edge.startMiterDeg = miterA;
    edge.endMiterDeg = miterB;
    edge.bevelDeg = Math.round(Math.max(miterA, miterB) * 0.72 * 10) / 10;
  }

  // Update beamGroups sample angles
  for (const group of beamGroups) {
    const sample = edges.find(e => e.type === group.type);
    if (sample) {
      group.endAngleStart = sample.startMiterDeg || 0;
      group.endAngleEnd = sample.endMiterDeg || 0;
    }
  }

  // Assign unique engineering node markings: [BeamTypeLetters][UniqueOrderNumber]
  // e.g. "AA1", "AA2", "AB3", where letters denote the breakdown strut types meeting at the node,
  // and the number is strictly unique relative to the entire dome (1, 2, ... N, never repeating).
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const connectedTypes = Array.from(
      new Set(node.edges.map(eid => edges[eid]?.type).filter(Boolean))
    ).sort();

    let prefix = "AA";
    if (connectedTypes.length === 1) {
      // Uniform node (e.g. apex or 5-way pentagon hubs: only A-struts) -> e.g. "AA"
      prefix = `${connectedTypes[0]}${connectedTypes[0]}`;
    } else if (connectedTypes.length >= 2) {
      // Mixed node (e.g. connecting A & B, or B & C) -> e.g. "AB", "BC"
      prefix = `${connectedTypes[0]}${connectedTypes[1]}`;
    }
    node.nodeType = prefix;
    node.label = `${prefix}${i + 1}`;
  }

  // Calculate face types (e.g. "AAB", "ABC")
  const faceGroupMap = new Map<string, { count: number; faceIds: number[]; sampleFace: Face }>();

  for (const face of faces) {
    const e1 = edges[edgeMap.get(`${Math.min(face.a, face.b)}-${Math.max(face.a, face.b)}`)!];
    const e2 = edges[edgeMap.get(`${Math.min(face.b, face.c)}-${Math.max(face.b, face.c)}`)!];
    const e3 = edges[edgeMap.get(`${Math.min(face.c, face.a)}-${Math.max(face.c, face.a)}`)!];

    const sortedTypes = [e1.type, e2.type, e3.type].sort().join("-");
    face.type = sortedTypes;

    if (!faceGroupMap.has(sortedTypes)) {
      faceGroupMap.set(sortedTypes, { count: 0, faceIds: [], sampleFace: face });
    }
    const entry = faceGroupMap.get(sortedTypes)!;
    entry.count++;
    entry.faceIds.push(face.id);
  }

  const faceGroups: FaceTypeGroup[] = [];
  let faceColorIdx = 0;

  const getOuterVertex = (p: Vec3): Vec3 => {
    if (outerOffset <= 0) return p;
    const rx = p.x;
    const ry = p.y;
    const rz = p.z - sphereCenterZ;
    const rLen = Math.hypot(rx, ry, rz) || sphereRadius || 1;
    return {
      x: p.x + (rx / rLen) * outerOffset,
      y: p.y + (ry / rLen) * outerOffset,
      z: p.z + (rz / rLen) * outerOffset
    };
  };

  for (const [key, val] of faceGroupMap.entries()) {
    const sample = val.sampleFace;
    const pA = getOuterVertex(vertices[sample.a]);
    const pB = getOuterVertex(vertices[sample.b]);
    const pC = getOuterVertex(vertices[sample.c]);

    const lenA = distance(pB, pC); // side opposite to A (on outer face of struts)
    const lenB = distance(pC, pA); // side opposite to B (on outer face of struts)
    const lenC = distance(pA, pB); // side opposite to C (on outer face of struts)

    const angles = triangleInteriorAngles(lenA, lenB, lenC);
    const areaM2 = (triangleArea(pA, pB, pC)) / 1_000_000;
    const edgeTypes = key.split("-") as [string, string, string];

    faceGroups.push({
      type: key,
      count: val.count,
      color: FACE_PALETTE[faceColorIdx % FACE_PALETTE.length],
      edges: edgeTypes,
      lengths: [Math.round(lenA), Math.round(lenB), Math.round(lenC)],
      angles: [
        Math.round(angles[0] * 10) / 10,
        Math.round(angles[1] * 10) / 10,
        Math.round(angles[2] * 10) / 10
      ],
      area: Math.round(areaM2 * 1000) / 1000,
      dihedralBevels: [5.2, 5.2, 5.2] // nominal default bevel
    });
    faceColorIdx++;
  }

  return {
    nodes,
    edges,
    faces,
    beamGroups,
    faceGroups
  };
}
