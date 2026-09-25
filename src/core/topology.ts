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
  "#6D8B74"  // Olive
];

const FACE_PALETTE = [
  "#E8F1EC", // Mint soft
  "#E4EEF5", // Sky soft
  "#FCECE5", // Peach soft
  "#FAF2DE", // Warm sand
  "#EDE8F2", // Lavender soft
  "#E3ECE7"  // Sage soft
];

export function buildTopology(
  vertices: Vec3[],
  rawFaces: { a: number; b: number; c: number }[],
  cutPlaneZ: number
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
  const typeLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  lengthClusters.forEach((cluster, idx) => {
    const typeName = typeLetters[idx % typeLetters.length];
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

  for (const [key, val] of faceGroupMap.entries()) {
    const sample = val.sampleFace;
    const pA = vertices[sample.a];
    const pB = vertices[sample.b];
    const pC = vertices[sample.c];

    const lenA = distance(pB, pC); // side opposite to A
    const lenB = distance(pC, pA); // side opposite to B
    const lenC = distance(pA, pB); // side opposite to C

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
