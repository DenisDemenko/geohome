import {
  DomeModel,
  DoorOpeningParams,
  SolarGlazingParams,
  InnerSheathingParams,
  Face
} from "./types";

export const DEFAULT_DOOR_PARAMS: DoorOpeningParams = {
  doorFaceIds: [],
  widthMm: 900,
  heightMm: 2050,
  frameDepthMm: 120,
  doorType: "single",
  frameColor: "#D97706",
  elevationFromBaseMm: 0,
  offsetFromDomeMm: 0,
  bayClusterType: "auto"
};

export const DEFAULT_SOLAR_PARAMS: SolarGlazingParams = {
  solarFaceIds: [],
  peakPowerPerM2: 210, // 210 W/m2 high efficiency monocrystalline BIPV
  efficiencyPct: 21.5,
  cellType: "monocrystalline",
  domeOrientationDeg: 0,
  latitudeDeg: 49.0,
  heatmapEnabled: false
};

export const DEFAULT_INNER_SHEATHING_PARAMS: InnerSheathingParams = {
  enabled: false,
  material: "drywall",
  thickness: 12.5,
  density: 800,
  seamGapMm: 0,
  finish: "white",
  colorByTriangleType: true
};

export const INNER_SHEATHING_MATERIALS: {
  id: InnerSheathingParams["material"];
  name: string;
  defaultThickness: number;
  density: number; // kg/m3
  description: string;
  standardSheet: { w: number; h: number; name: string };
}[] = [
  {
    id: "drywall",
    name: "Гіпсокартон (ГКЛ / ГКЛВ)",
    defaultThickness: 12.5,
    density: 800,
    description: "Ідеально рівна поверхня під фарбування або шпалери, 800 кг/м³",
    standardSheet: { w: 2500, h: 1200, name: "2500 × 1200 мм (Євро ГКЛ 12.5 мм)" }
  },
  {
    id: "chipboard",
    name: "ДСП плита / ЛДСП",
    defaultThickness: 16,
    density: 680,
    description: "Меблева деревостружкова плита з ламінацією або шліфована, 680 кг/м³",
    standardSheet: { w: 2750, h: 1830, name: "2750 × 1830 мм (Стандартний меблевий формат ДСП)" }
  },
  {
    id: "osb3",
    name: "Плита OSB-3 інтер'єрна",
    defaultThickness: 9,
    density: 640,
    description: "Екологічна вологостійка плита класу E0/E1, 640 кг/м³",
    standardSheet: { w: 2500, h: 1250, name: "2500 × 1250 мм (Євро-формат OSB)" }
  },
  {
    id: "plywood_fk",
    name: "Фанера березова ФК інтер'єрна",
    defaultThickness: 9,
    density: 680,
    description: "Натуральний теплий малюнок березового шпону без шкідливих фенолів, 680 кг/м³",
    standardSheet: { w: 1525, h: 1525, name: "1525 × 1525 мм (Квадратний лист ФК)" }
  }
];

/**
 * Returns the conversion type of a face:
 * "solid" (regular cladding), "window", "door", or "solar"
 */
export function getFaceConversionType(
  model: DomeModel,
  faceId: number
): "solid" | "window" | "door" | "solar" {
  if (model.doorFaceIds && model.doorFaceIds.includes(faceId)) {
    return "door";
  }
  if (model.windowFaceIds && model.windowFaceIds.includes(faceId)) {
    return "window";
  }
  if (model.solarFaceIds && model.solarFaceIds.includes(faceId)) {
    return "solar";
  }
  return "solid";
}

export interface RectangularDoorPortalGeometry {
  centerGround: { x: number; y: number; z: number };
  tangentDir: { x: number; y: number; z: number };
  normalInward: { x: number; y: number; z: number };
  normalOutward: { x: number; y: number; z: number };
  widthMm: number;
  heightMm: number;
  depthMm: number;
  elevationFromBaseMm: number;
  offsetFromDomeMm: number;
  postThicknessMm: number;
  rotationZ: number;
  capturedFaceIds: number[];
  clusterType: "auto" | "pentagon" | "hexagon" | "custom";
  clusterHubNodeId?: number;
}

export function getHubPerimeterCycle(model: DomeModel, hubId: number, faceIds: number[]): number[] {
  const edges: [number, number][] = [];
  faceIds.forEach(fid => {
    const f = model.faces.find(fa => fa.id === fid);
    if (!f) return;
    const others = [f.a, f.b, f.c].filter(n => n !== hubId);
    if (others.length === 2) edges.push([others[0], others[1]]);
  });

  if (edges.length === 0) return [];

  const adj = new Map<number, number[]>();
  edges.forEach(([u, v]) => {
    adj.set(u, (adj.get(u) || []).concat(v));
    adj.set(v, (adj.get(v) || []).concat(u));
  });

  const start = edges[0][0];
  const cycle = [start];
  let curr = start;
  let prev = -1;

  while (cycle.length < edges.length) {
    const nbs = adj.get(curr) || [];
    const next = nbs.find(n => n !== prev && !cycle.includes(n));
    if (next === undefined) break;
    cycle.push(next);
    prev = curr;
    curr = next;
  }
  return cycle;
}

export function orientCycle(model: DomeModel, cycle: number[]): number[] {
  const n = cycle.length;
  if (n < 3) return cycle;

  let bestIdx = 0;
  let minAvgZ = Infinity;
  for (let i = 0; i < n; i++) {
    const u = cycle[i];
    const v = cycle[(i + 1) % n];
    const nU = model.nodes[u];
    const nV = model.nodes[v];
    if (nU && nV) {
      const avgZ = (nU.position.z + nV.position.z) / 2;
      if (avgZ < minAvgZ) {
        minAvgZ = avgZ;
        bestIdx = i;
      }
    }
  }

  let oriented: number[] = [];
  for (let i = 0; i < n; i++) {
    oriented.push(cycle[(bestIdx + i) % n]);
  }

  const p0 = model.nodes[oriented[0]]?.position;
  const p1 = model.nodes[oriented[1]]?.position;
  if (p0 && p1) {
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    const dist = Math.hypot(midX, midY) || 1;
    const tx = -midY / dist;
    const ty = midX / dist;
    const dot = (p1.x - p0.x) * tx + (p1.y - p0.y) * ty;
    if (dot < 0) {
      const rev = [oriented[1], oriented[0]];
      for (let i = n - 1; i >= 2; i--) {
        rev.push(oriented[i]);
      }
      oriented = rev;
    }
  }
  return oriented;
}

/**
 * Automatically captures cluster of triangles forming the door bay:
 * Supports:
 * - "auto": smart height & width neighbor capture (2-3 triangles)
 * - "pentagon": captures all 5 triangles of a 5-way vertex (п'ятигранник)
 * - "hexagon": captures all 6 triangles of a 6-way vertex (шестигранник)
 * - "custom" / clusterHubNodeId: captures all triangles meeting at that hub
 */
export function findDoorClusterFaces(
  model: DomeModel,
  anchorFaceId: number,
  targetWidthMm: number,
  targetHeightMm: number,
  bayClusterType: "auto" | "pentagon" | "hexagon" | "custom" = "auto",
  clusterHubNodeId?: number
): { faceIds: number[]; hubNodeId?: number; clusterType: "auto" | "pentagon" | "hexagon" | "custom" } {
  // If specific hub node is explicitly specified
  if (clusterHubNodeId !== undefined && model.nodes[clusterHubNodeId]) {
    const hubFaces = model.faces.filter(f => f.a === clusterHubNodeId || f.b === clusterHubNodeId || f.c === clusterHubNodeId);
    if (hubFaces.length > 0) {
      const type = hubFaces.length === 5 ? "pentagon" : (hubFaces.length === 6 ? "hexagon" : "custom");
      return { faceIds: hubFaces.map(f => f.id), hubNodeId: clusterHubNodeId, clusterType: type };
    }
  }

  const anchorFace = model.faces.find(f => f.id === anchorFaceId) || model.faces[0];
  if (!anchorFace) return { faceIds: [anchorFaceId], clusterType: "auto" };

  // Calculate node degree (count of faces sharing each node)
  const nodeFaceCount = new Map<number, number[]>();
  for (const f of model.faces) {
    for (const nid of [f.a, f.b, f.c]) {
      const list = nodeFaceCount.get(nid) || [];
      list.push(f.id);
      nodeFaceCount.set(nid, list);
    }
  }

  const aNodes = [anchorFace.a, anchorFace.b, anchorFace.c];

  if (bayClusterType === "pentagon") {
    let bestHub: number | undefined;
    for (const nid of aNodes) {
      if ((nodeFaceCount.get(nid)?.length || 0) === 5) {
        bestHub = nid;
        break;
      }
    }
    if (bestHub === undefined) {
      const aC = {
        x: (model.nodes[anchorFace.a].position.x + model.nodes[anchorFace.b].position.x + model.nodes[anchorFace.c].position.x) / 3,
        y: (model.nodes[anchorFace.a].position.y + model.nodes[anchorFace.b].position.y + model.nodes[anchorFace.c].position.y) / 3,
        z: (model.nodes[anchorFace.a].position.z + model.nodes[anchorFace.b].position.z + model.nodes[anchorFace.c].position.z) / 3
      };
      let minDist = Infinity;
      for (const [nid, fids] of nodeFaceCount.entries()) {
        if (fids.length === 5) {
          const np = model.nodes[nid]?.position;
          if (np) {
            const dist = Math.hypot(np.x - aC.x, np.y - aC.y, np.z - aC.z);
            if (dist < minDist) {
              minDist = dist;
              bestHub = nid;
            }
          }
        }
      }
    }
    if (bestHub !== undefined) {
      const pFaces = nodeFaceCount.get(bestHub) || [];
      return { faceIds: pFaces, hubNodeId: bestHub, clusterType: "pentagon" };
    }
  }

  if (bayClusterType === "hexagon") {
    let bestHub: number | undefined;
    for (const nid of aNodes) {
      if ((nodeFaceCount.get(nid)?.length || 0) === 6) {
        bestHub = nid;
        break;
      }
    }
    if (bestHub === undefined) {
      const aC = {
        x: (model.nodes[anchorFace.a].position.x + model.nodes[anchorFace.b].position.x + model.nodes[anchorFace.c].position.x) / 3,
        y: (model.nodes[anchorFace.a].position.y + model.nodes[anchorFace.b].position.y + model.nodes[anchorFace.c].position.y) / 3,
        z: (model.nodes[anchorFace.a].position.z + model.nodes[anchorFace.b].position.z + model.nodes[anchorFace.c].position.z) / 3
      };
      let minDist = Infinity;
      for (const [nid, fids] of nodeFaceCount.entries()) {
        if (fids.length === 6) {
          const np = model.nodes[nid]?.position;
          if (np) {
            const dist = Math.hypot(np.x - aC.x, np.y - aC.y, np.z - aC.z);
            if (dist < minDist) {
              minDist = dist;
              bestHub = nid;
            }
          }
        }
      }
    }
    if (bestHub !== undefined) {
      const hFaces = nodeFaceCount.get(bestHub) || [];
      return { faceIds: hFaces, hubNodeId: bestHub, clusterType: "hexagon" };
    }
  }

  const autoFaceIds = findDoorNeighborFaces(model, anchorFaceId, targetWidthMm, targetHeightMm);
  return { faceIds: autoFaceIds, clusterType: "auto" };
}

/**
 * Calculates door opening height and automatically captures neighbor triangle(s)
 * based on target door height and width.
 */
export function findDoorNeighborFaces(
  model: DomeModel,
  anchorFaceId: number,
  targetWidthMm: number,
  targetHeightMm: number,
  bayClusterType: "auto" | "pentagon" | "hexagon" | "custom" = "auto",
  clusterHubNodeId?: number
): number[] {
  if (bayClusterType === "pentagon" || bayClusterType === "hexagon" || clusterHubNodeId !== undefined) {
    const cluster = findDoorClusterFaces(model, anchorFaceId, targetWidthMm, targetHeightMm, bayClusterType, clusterHubNodeId);
    return cluster.faceIds;
  }

  const anchorFace = model.faces.find(f => f.id === anchorFaceId);
  if (!anchorFace) return [anchorFaceId];

  const resultFaceIds = new Set<number>([anchorFaceId]);

  // Determine lowest foundation / base ground elevation in the dome
  const allNodeZs = model.nodes.map(n => n.position.z);
  const lowestGroundZ = allNodeZs.length > 0 ? Math.min(...allNodeZs) : 0;

  // 1. DOWNWARD TRACE: Ensure doorway ALWAYS connects down to the bottom beam (цоколя або купола)
  // Repeat adding faces directly below until reaching the ground base beam (z <= lowestGroundZ + 25)
  let maxDownwardSteps = 8;
  while (maxDownwardSteps-- > 0) {
    let currentLowestFaceId: number | null = null;
    let currentMinZ = Infinity;

    for (const fid of resultFaceIds) {
      const f = model.faces.find(fa => fa.id === fid);
      if (!f) continue;
      const fMinZ = Math.min(
        model.nodes[f.a]?.position.z ?? 0,
        model.nodes[f.b]?.position.z ?? 0,
        model.nodes[f.c]?.position.z ?? 0
      );
      if (fMinZ < currentMinZ) {
        currentMinZ = fMinZ;
        currentLowestFaceId = fid;
      }
    }

    if (currentMinZ <= lowestGroundZ + 25 || currentLowestFaceId === null) {
      break;
    }

    const curF = model.faces.find(fa => fa.id === currentLowestFaceId);
    if (!curF) break;
    const curNodes = [model.nodes[curF.a], model.nodes[curF.b], model.nodes[curF.c]].filter(Boolean);
    const curAvgZ = curNodes.reduce((s, n) => s + n.position.z, 0) / curNodes.length;

    // Find neighbor face sharing at least 2 vertices with curF that is BELOW curF (lower avg Z)
    const belowNeighbors = model.faces.filter(f => {
      if (resultFaceIds.has(f.id)) return false;
      const shared = [f.a, f.b, f.c].filter(n => n === curF.a || n === curF.b || n === curF.c);
      if (shared.length < 2) return false;
      const nbNodes = [model.nodes[f.a], model.nodes[f.b], model.nodes[f.c]].filter(Boolean);
      const nbAvgZ = nbNodes.reduce((s, n) => s + n.position.z, 0) / nbNodes.length;
      return nbAvgZ < curAvgZ;
    });

    if (belowNeighbors.length > 0) {
      belowNeighbors.sort((a, b) => {
        const aAvg = (model.nodes[a.a].position.z + model.nodes[a.b].position.z + model.nodes[a.c].position.z) / 3;
        const bAvg = (model.nodes[b.a].position.z + model.nodes[b.b].position.z + model.nodes[b.c].position.z) / 3;
        return aAvg - bAvg;
      });
      resultFaceIds.add(belowNeighbors[0].id);
    } else {
      break;
    }
  }

  // 2. UPWARD TRACE: Ensure doorway reaches up to the 2nd floor leveled tier (tier 2, 3, or 4)
  let maxUpwardSteps = 6;
  while (maxUpwardSteps-- > 0) {
    let currentHighestFaceId: number | null = null;
    let currentMaxZ = -Infinity;

    for (const fid of resultFaceIds) {
      const f = model.faces.find(fa => fa.id === fid);
      if (!f) continue;
      const fMaxZ = Math.max(
        model.nodes[f.a]?.position.z ?? 0,
        model.nodes[f.b]?.position.z ?? 0,
        model.nodes[f.c]?.position.z ?? 0
      );
      if (fMaxZ > currentMaxZ) {
        currentMaxZ = fMaxZ;
        currentHighestFaceId = fid;
      }
    }

    if (currentHighestFaceId === null) break;

    const clusterNodes = new Set<number>();
    for (const fid of resultFaceIds) {
      const f = model.faces.find(fa => fa.id === fid);
      if (f) {
        clusterNodes.add(f.a);
        clusterNodes.add(f.b);
        clusterNodes.add(f.c);
      }
    }
    const clusterMinZ = Math.min(...Array.from(clusterNodes).map(id => model.nodes[id]?.position.z ?? 0));
    const clusterSpanH = currentMaxZ - clusterMinZ;
    const highestTierInCluster = Math.max(
      ...Array.from(clusterNodes).map(id => model.nodes[id]?.tierLevel ?? 1)
    );

    if (clusterSpanH >= targetHeightMm && highestTierInCluster >= 2) {
      break;
    }

    const curF = model.faces.find(fa => fa.id === currentHighestFaceId);
    if (!curF) break;
    const curNodes = [model.nodes[curF.a], model.nodes[curF.b], model.nodes[curF.c]].filter(Boolean);
    const curAvgZ = curNodes.reduce((s, n) => s + n.position.z, 0) / curNodes.length;

    const aboveNeighbors = model.faces.filter(f => {
      if (resultFaceIds.has(f.id)) return false;
      const shared = [f.a, f.b, f.c].filter(n => n === curF.a || n === curF.b || n === curF.c);
      if (shared.length < 2) return false;
      const nbNodes = [model.nodes[f.a], model.nodes[f.b], model.nodes[f.c]].filter(Boolean);
      const nbAvgZ = nbNodes.reduce((s, n) => s + n.position.z, 0) / nbNodes.length;
      return nbAvgZ > curAvgZ;
    });

    if (aboveNeighbors.length > 0) {
      aboveNeighbors.sort((a, b) => {
        const aAvg = (model.nodes[a.a].position.z + model.nodes[a.b].position.z + model.nodes[a.c].position.z) / 3;
        const bAvg = (model.nodes[b.a].position.z + model.nodes[b.b].position.z + model.nodes[b.c].position.z) / 3;
        return bAvg - aAvg;
      });
      resultFaceIds.add(aboveNeighbors[0].id);
    } else {
      break;
    }
  }

  // 3. HORIZONTAL NEIGHBORS: If door is wide (>= 1050 mm), capture horizontal neighbor
  if (targetWidthMm >= 1050) {
    const neighbors = model.faces.filter(f => {
      if (resultFaceIds.has(f.id)) return false;
      const fNodes = [f.a, f.b, f.c];
      const shared = fNodes.filter(n => n === anchorFace.a || n === anchorFace.b || n === anchorFace.c);
      return shared.length >= 2;
    });

    for (const nb of neighbors) {
      const nbNodes = [model.nodes[nb.a], model.nodes[nb.b], model.nodes[nb.c]].filter(Boolean);
      const nbMinZ = Math.min(...nbNodes.map(n => n.position.z));
      const aNodes = [model.nodes[anchorFace.a], model.nodes[anchorFace.b], model.nodes[anchorFace.c]].filter(Boolean);
      const aMinZ = Math.min(...aNodes.map(n => n.position.z));
      if (Math.abs(nbMinZ - aMinZ) < 350) {
        resultFaceIds.add(nb.id);
        break;
      }
    }
  }

  return Array.from(resultFaceIds);
}

/**
 * Calculates rectangular doorway portal coordinates, orientation vectors,
 * and automatically captures the triangles intersected by the rectangular walk-through door.
 */
export function calculateRectangularDoorPortal(
  model: DomeModel,
  anchorFaceId: number,
  targetWidthMm = 900,
  targetHeightMm = 2050,
  frameDepthMm = 160,
  elevationFromBaseMm = 0,
  offsetFromDomeMm = 0,
  bayClusterType: "auto" | "pentagon" | "hexagon" | "custom" = "auto",
  clusterHubNodeId?: number
): RectangularDoorPortalGeometry | null {
  const anchorFace = model.faces.find(f => f.id === anchorFaceId);
  if (!anchorFace) return null;

  const cluster = findDoorClusterFaces(
    model,
    anchorFaceId,
    targetWidthMm,
    targetHeightMm,
    bayClusterType,
    clusterHubNodeId
  );

  const clusterNodeIds = new Set<number>();
  for (const fid of cluster.faceIds) {
    const f = model.faces.find(fa => fa.id === fid);
    if (f) {
      clusterNodeIds.add(f.a);
      clusterNodeIds.add(f.b);
      clusterNodeIds.add(f.c);
    }
  }

  const allNodeZs = model.nodes.map(n => n.position.z);
  const lowestGroundZ = allNodeZs.length > 0 ? Math.min(...allNodeZs) : 0;

  const clusterNodes = Array.from(clusterNodeIds).map(id => model.nodes[id]).filter(Boolean);
  if (clusterNodes.length === 0) return null;

  // Find nodes along the bottom foundation / plinth beam
  const bottomClusterNodes = clusterNodes.filter(n => n.position.z <= lowestGroundZ + 35 || n.boundary || n.isPlinthGroundNode);
  
  let bottom1 = clusterNodes[0].position;
  let bottom2 = clusterNodes[Math.min(1, clusterNodes.length - 1)].position;

  if (bottomClusterNodes.length >= 2) {
    bottomClusterNodes.sort((a, b) => a.position.x - b.position.x);
    bottom1 = bottomClusterNodes[0].position;
    bottom2 = bottomClusterNodes[bottomClusterNodes.length - 1].position;
  } else if (bottomClusterNodes.length === 1) {
    bottom1 = bottomClusterNodes[0].position;
    const sorted = [...clusterNodes].sort((a, b) => a.position.z - b.position.z);
    bottom2 = sorted[1]?.position || bottom1;
  } else {
    const sorted = [...clusterNodes].sort((a, b) => a.position.z - b.position.z);
    bottom1 = sorted[0].position;
    bottom2 = sorted[1]?.position || bottom1;
  }

  const midX = (bottom1.x + bottom2.x) / 2;
  const midY = (bottom1.y + bottom2.y) / 2;
  // Always sits directly on the lowest bottom beam of plinth or dome base
  const baseZ = lowestGroundZ;

  const horizDist = Math.hypot(midX, midY) || 1;
  const normalInward = {
    x: -midX / horizDist,
    y: -midY / horizDist,
    z: 0
  };
  const normalOutward = {
    x: midX / horizDist,
    y: midY / horizDist,
    z: 0
  };
  const tangentDir = {
    x: -normalInward.y,
    y: normalInward.x,
    z: 0
  };

  const centerGround = {
    x: midX + normalOutward.x * (offsetFromDomeMm || 0),
    y: midY + normalOutward.y * (offsetFromDomeMm || 0),
    z: baseZ + (elevationFromBaseMm || 0)
  };

  const rotationZ = Math.atan2(normalOutward.y, normalOutward.x);
  const postThicknessMm = Math.max(60, Math.min(120, targetWidthMm * 0.08));

  return {
    centerGround,
    tangentDir,
    normalInward,
    normalOutward,
    widthMm: targetWidthMm,
    heightMm: targetHeightMm,
    depthMm: frameDepthMm,
    elevationFromBaseMm: elevationFromBaseMm || 0,
    offsetFromDomeMm: offsetFromDomeMm || 0,
    postThicknessMm,
    rotationZ,
    capturedFaceIds: cluster.faceIds,
    clusterType: cluster.clusterType,
    clusterHubNodeId: cluster.hubNodeId
  };
}

export interface DoorConnectingBeam {
  id: string;
  name: string;
  zone: "left" | "right" | "top" | "threshold";
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  lengthMm: number;
  widthMm: number;
  depthMm: number;
  bevelAngleDeg?: number;
}

export interface DoorTriangulatedPanel {
  id: string;
  type: string;
  name: string;
  zone: "left" | "right" | "top" | "casing" | "threshold";
  vertices3D: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }, { x: number; y: number; z: number }];
  lengths: [number, number, number];
  angles: [number, number, number];
  areaM2: number;
  bevelDeg: number;
  isOpeningReveal?: boolean;
}

export interface DoorwayNode {
  id: number;
  label: string;
  prefix: string;
  position: { x: number; y: number; z: number };
  role: "shell_cut" | "vestibule" | "threshold" | "lintel";
  name: string;
}

export interface DoorwayConnector {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  role: "lintel_left" | "lintel_right" | "lintel_mid" | "parallel_beam_hub";
  rayDirections: Array<{ x: number; y: number; z: number }>;
}

export interface DoorwayTriangulationResult {
  portal: RectangularDoorPortalGeometry;
  connectingBeams: DoorConnectingBeam[];
  /** DOME_SHELL_MESH: Fully retriangulated panels of the dome shell around the doorway cut */
  infillTriangles: DoorTriangulatedPanel[];
  /** VESTIBULE_MESH: Distinct panels of the protruding vestibule structure (тамбур) */
  vestibulePanels: DoorTriangulatedPanel[];
  /** Internal walk-through reveal and casing panels */
  revealPanels: DoorTriangulatedPanel[];
  /** Supplemented unique nodes created during doorway and vestibule triangulation */
  doorwayNodes: DoorwayNode[];
  /** Additional engineering connectors on the door lintel and opposing parallel beam */
  doorwayConnectors: DoorwayConnector[];
  /** Leveled tier level index (2 or 3) aligned with the door horizon */
  leveledTierLevel?: number;
  /** Midpoint coordinate of the parallel horizontal beam of the 2nd floor above the door */
  parallelBeamMidpoint?: { x: number; y: number; z: number };
}

/**
 * Robust planar/spatial ear-clipping triangulation for a 3D simple polygon.
 * For any simple polygon of N vertices, it produces exactly N - 2 triangles.
 * Validates convexity and ensures zero-area / degenerate slivers are prevented.
 */
export function triangulatePolygon3D(
  poly: Array<{ x: number; y: number; z: number }>
): Array<[{ x: number; y: number; z: number }, { x: number; y: number; z: number }, { x: number; y: number; z: number }]> {
  const n = poly.length;
  if (n < 3) return [];
  if (n === 3) return [[poly[0], poly[1], poly[2]]];

  // Newell's method for best-fit plane normal
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % n];
    nx += (cur.y - nxt.y) * (cur.z + nxt.z);
    ny += (cur.z - nxt.z) * (cur.x + nxt.x);
    nz += (cur.x - nxt.x) * (cur.y + nxt.y);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  const normal = { x: nx / len, y: ny / len, z: nz / len };

  // Create orthonormal basis (u, v) on the polygon plane
  let u = Math.abs(normal.z) < 0.9 ? { x: -normal.y, y: normal.x, z: 0 } : { x: 1, y: 0, z: 0 };
  const uLen = Math.hypot(u.x, u.y, u.z) || 1;
  u = { x: u.x / uLen, y: u.y / uLen, z: u.z / uLen };
  const v = {
    x: normal.y * u.z - normal.z * u.y,
    y: normal.z * u.x - normal.x * u.z,
    z: normal.x * u.y - normal.y * u.x
  };

  // Project 3D points onto the 2D plane
  const pts2D = poly.map(p => ({
    x: p.x * u.x + p.y * u.y + p.z * u.z,
    y: p.x * v.x + p.y * v.y + p.z * v.z,
    orig: p
  }));

  // Signed area in 2D to ensure counter-clockwise orientation
  let area2D = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area2D += pts2D[i].x * pts2D[j].y - pts2D[j].x * pts2D[i].y;
  }

  let indices = pts2D.map((_, i) => i);
  if (area2D < 0) {
    indices.reverse();
  }

  function isEar(i0: number, i1: number, i2: number, indList: number[]): boolean {
    const p0 = pts2D[i0], p1 = pts2D[i1], p2 = pts2D[i2];
    const cp = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
    if (cp <= 1e-7) return false;

    for (const idx of indList) {
      if (idx === i0 || idx === i1 || idx === i2) continue;
      const p = pts2D[idx];
      const cp1 = (p1.x - p0.x) * (p.y - p0.y) - (p1.y - p0.y) * (p.x - p0.x);
      const cp2 = (p2.x - p1.x) * (p.y - p1.y) - (p2.y - p1.y) * (p.x - p1.x);
      const cp3 = (p0.x - p2.x) * (p.y - p2.y) - (p0.y - p2.y) * (p.x - p2.x);
      if (cp1 >= -1e-7 && cp2 >= -1e-7 && cp3 >= -1e-7) return false;
    }
    return true;
  }

  const triangles: Array<[{ x: number; y: number; z: number }, { x: number; y: number; z: number }, { x: number; y: number; z: number }]> = [];
  let safetyCount = 0;
  while (indices.length > 3 && safetyCount < 300) {
    safetyCount++;
    let earFound = false;
    const m = indices.length;
    for (let i = 0; i < m; i++) {
      const prev = indices[(i + m - 1) % m];
      const curr = indices[i];
      const next = indices[(i + 1) % m];

      if (isEar(prev, curr, next, indices)) {
        triangles.push([pts2D[prev].orig, pts2D[curr].orig, pts2D[next].orig]);
        indices.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) break;
  }
  if (indices.length === 3) {
    triangles.push([pts2D[indices[0]].orig, pts2D[indices[1]].orig, pts2D[indices[2]].orig]);
  }
  return triangles;
}

function createTriPanel(
  id: string,
  type: string,
  name: string,
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number },
  p3: { x: number; y: number; z: number },
  bevelDeg = 5.0,
  isOpeningReveal = false,
  zone: "left" | "right" | "top" | "casing" | "threshold" = "top"
): DoorTriangulatedPanel | null {
  const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
  const d23 = Math.hypot(p3.x - p2.x, p3.y - p2.y, p3.z - p2.z);
  const d31 = Math.hypot(p1.x - p3.x, p1.y - p3.y, p1.z - p3.z);

  const a = Math.max(1, Math.round(d23));
  const b = Math.max(1, Math.round(d31));
  const c = Math.max(1, Math.round(d12));

  // Reject degenerate triangles (where any side < 15 mm)
  if (a < 15 || b < 15 || c < 15) return null;

  const s = (a + b + c) / 2;
  const areaMm2 = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
  // Reject tiny slivers
  if (areaMm2 < 200) return null;

  const safeCos = (val: number) => Math.max(-1, Math.min(1, val));
  const angA = Math.round((Math.acos(safeCos((b * b + c * c - a * a) / (2 * b * c))) * 180) / Math.PI);
  const angB = Math.round((Math.acos(safeCos((a * a + c * c - b * b) / (2 * a * c))) * 180) / Math.PI);
  const angC = Math.max(1, 180 - angA - angB);

  const areaM2 = Math.round((areaMm2 / 1_000_000) * 1000) / 1000;

  return {
    id,
    type,
    name,
    zone,
    vertices3D: [p1, p2, p3],
    lengths: [a, b, c],
    angles: [angA, angB, angC],
    areaM2,
    bevelDeg,
    isOpeningReveal
  };
}

/**
 * Calculates complete retriangulation connecting the doorway cut to the geodesic dome shell,
 * separating geometry cleanly into:
 * 1) DOME_SHELL_MESH:
 *    Retriangulation of the dome shell where the doorway intersects. The clipped polygon of the shell
 *    is mathematically triangulated into exactly (N - 2) non-overlapping triangles without holes or gaps.
 * 2) VESTIBULE_MESH:
 *    Independent protruding vestibule (тамбур): walls, roof canopy, front gable, foundation apron, and casing.
 * 3) STRUCTURAL CONNECTING BEAMS:
 *    Tying doorway portal posts, lintel and vestibule to the dome framework to the left, right, and top.
 */
export function calculateDoorwayTriangulationAndPanels(
  model: DomeModel,
  anchorFaceId: number,
  targetWidthMm = 900,
  targetHeightMm = 2050,
  frameDepthMm = 160,
  elevationFromBaseMm = 0,
  offsetFromDomeMm = 0,
  bayClusterType: "auto" | "pentagon" | "hexagon" | "custom" = "auto",
  clusterHubNodeId?: number
): DoorwayTriangulationResult | null {
  const portal = calculateRectangularDoorPortal(
    model,
    anchorFaceId,
    targetWidthMm,
    targetHeightMm,
    frameDepthMm,
    elevationFromBaseMm,
    offsetFromDomeMm,
    bayClusterType,
    clusterHubNodeId
  );
  if (!portal) return null;

  const { centerGround, tangentDir, normalOutward, widthMm, heightMm, elevationFromBaseMm: elevation, offsetFromDomeMm: offset } = portal;
  const t = tangentDir;
  const nOut = normalOutward;
  const halfW = widthMm / 2;

  // 1. Front plane corners of rectangular door frame (at outward offset)
  const dBL = {
    x: centerGround.x - t.x * halfW,
    y: centerGround.y - t.y * halfW,
    z: centerGround.z
  };
  const dBR = {
    x: centerGround.x + t.x * halfW,
    y: centerGround.y + t.y * halfW,
    z: centerGround.z
  };
  const dTL = {
    x: dBL.x,
    y: dBL.y,
    z: centerGround.z + heightMm
  };
  const dTR = {
    x: dBR.x,
    y: dBR.y,
    z: centerGround.z + heightMm
  };
  const dTMid = {
    x: (dTL.x + dTR.x) / 2,
    y: (dTL.y + dTR.y) / 2,
    z: dTL.z + 100 // 100 mm gable rise for water runoff
  };

  // 2. Dome sphere intersection points (doorway cut contour on the dome sphere)
  const sBL = {
    x: dBL.x - nOut.x * offset,
    y: dBL.y - nOut.y * offset,
    z: dBL.z
  };
  const sBR = {
    x: dBR.x - nOut.x * offset,
    y: dBR.y - nOut.y * offset,
    z: dBR.z
  };
  const sTL = {
    x: dTL.x - nOut.x * offset,
    y: dTL.y - nOut.y * offset,
    z: dTL.z
  };
  const sTR = {
    x: dTR.x - nOut.x * offset,
    y: dTR.y - nOut.y * offset,
    z: dTR.z
  };
  const sTMid = {
    x: dTMid.x - nOut.x * offset,
    y: dTMid.y - nOut.y * offset,
    z: dTMid.z
  };

  // 3. Base ground projections at minZ (dome foundation level)
  const minZ = Math.max(0, sBL.z - elevation);
  const fBL = { x: dBL.x, y: dBL.y, z: minZ };
  const fBR = { x: dBR.x, y: dBR.y, z: minZ };
  const sfBL = { x: sBL.x, y: sBL.y, z: minZ };
  const sfBR = { x: sBR.x, y: sBR.y, z: minZ };

  // =========================================================================
  // DOME_SHELL_MESH: Mathematical Retriangulation of the Dome Shell Polygon
  // =========================================================================
  let shellPolygon: Array<{ x: number; y: number; z: number }> = [];

  if (portal.clusterHubNodeId !== undefined && (portal.clusterType === "pentagon" || portal.clusterType === "hexagon")) {
    const rawCycle = getHubPerimeterCycle(model, portal.clusterHubNodeId, portal.capturedFaceIds);
    const oriented = orientCycle(model, rawCycle);
    const perimeterPts = oriented.map(nid => model.nodes[nid]?.position).filter(Boolean);

    if (perimeterPts.length >= 5) {
      const p0 = perimeterPts[0]; // ground left node
      const p1 = perimeterPts[1]; // ground right node

      // Polygon contour of remaining dome shell around the rectangular doorway cut:
      // Starts at sBR -> p1 -> [remaining perimeter nodes around the hub] -> p0 -> sBL -> sTL -> sTMid -> sTR
      shellPolygon = [
        sBR,
        p1,
        ...perimeterPts.slice(2),
        p0,
        sBL,
        sTL,
        sTMid,
        sTR
      ];
    }
  }

  // Fallback for auto or irregular clusters: collect boundary vertices
  if (shellPolygon.length < 5) {
    const capturedNodeIds = new Set<number>();
    for (const fid of portal.capturedFaceIds) {
      const f = model.faces.find(fa => fa.id === fid);
      if (f) {
        capturedNodeIds.add(f.a);
        capturedNodeIds.add(f.b);
        capturedNodeIds.add(f.c);
      }
    }
    if (portal.clusterHubNodeId !== undefined) {
      capturedNodeIds.delete(portal.clusterHubNodeId);
    }
    const nodes = Array.from(capturedNodeIds).map(id => model.nodes[id]?.position).filter(Boolean);

    // Sort boundary nodes angularly around door center
    const sMid = { x: (sBL.x + sBR.x) / 2, y: (sBL.y + sBR.y) / 2, z: (sBL.z + sTL.z) / 2 };
    nodes.sort((a, b) => {
      const angA = Math.atan2((a.x - sMid.x) * t.x + (a.y - sMid.y) * t.y, a.z - sMid.z);
      const angB = Math.atan2((b.x - sMid.x) * t.x + (b.y - sMid.y) * t.y, b.z - sMid.z);
      return angA - angB;
    });

    const pLeft = nodes[0] || { x: sBL.x - t.x * 400, y: sBL.y - t.y * 400, z: minZ };
    const pRight = nodes[nodes.length - 1] || { x: sBR.x + t.x * 400, y: sBR.y + t.y * 400, z: minZ };
    const midNodes = nodes.slice(1, nodes.length - 1);

    shellPolygon = [
      sBR,
      pRight,
      ...midNodes,
      pLeft,
      sBL,
      sTL,
      sTMid,
      sTR
    ];
  }

  // Perform full mathematical ear-clipping retriangulation on the dome shell polygon
  const rawTriangles = triangulatePolygon3D(shellPolygon);

  // Convert each triangulated triangle to DoorTriangulatedPanel
  const shellPanels: DoorTriangulatedPanel[] = [];
  rawTriangles.forEach((pts, idx) => {
    const cX = (pts[0].x + pts[1].x + pts[2].x) / 3;
    const cY = (pts[0].y + pts[1].y + pts[2].y) / 3;
    const cZ = (pts[0].z + pts[1].z + pts[2].z) / 3;
    const dot = (cX - centerGround.x) * t.x + (cY - centerGround.y) * t.y;

    let zone: "left" | "right" | "top" = "top";
    if (cZ < sTL.z) {
      zone = dot < 0 ? "left" : "right";
    }

    const panel = createTriPanel(
      `ДВ-О-${idx + 1}`,
      "ДВ-О",
      `Оболонка купола (сегмент ${idx + 1})`,
      pts[0],
      pts[1],
      pts[2],
      5.0,
      false,
      zone
    );
    if (panel) {
      shellPanels.push(panel);
    }
  });

  // If threshold is elevated above base (elevation > 0), add dome foundation apron panels
  if (elevation > 0) {
    const ap1 = createTriPanel("ДВ-Ц1", "ДВ-Ц1", "Цокольний фартух порогу (лівий)", sfBL, sBL, sfBR, 5.0, false, "threshold");
    const ap2 = createTriPanel("ДВ-Ц2", "ДВ-Ц2", "Цокольний фартух порогу (правий)", sBL, sBR, sfBR, 5.0, false, "threshold");
    if (ap1) shellPanels.push(ap1);
    if (ap2) shellPanels.push(ap2);
  }

  // =========================================================================
  // VESTIBULE_MESH: Protruding Vestibule (Тамбур) Structure
  // =========================================================================
  const vestibulePanels: DoorTriangulatedPanel[] = [];

  if (offset > 20) {
    // 1. Left cheek wall of vestibule
    const vL1 = createTriPanel("ДВ-Т-Л1", "ДВ-Т-Л1", "Тамбур: ліва стінка (нижня)", dBL, sBL, dTL, 5.0, false, "left");
    const vL2 = createTriPanel("ДВ-Т-Л2", "ДВ-Т-Л2", "Тамбур: ліва стінка (верхня)", sBL, sTL, dTL, 5.0, false, "left");
    if (vL1) vestibulePanels.push(vL1);
    if (vL2) vestibulePanels.push(vL2);

    if (elevation > 0) {
      const vL3 = createTriPanel("ДВ-Т-Л3", "ДВ-Т-Л3", "Тамбур: лівий цокольний клин", fBL, sfBL, dBL, 5.0, false, "threshold");
      const vL4 = createTriPanel("ДВ-Т-Л4", "ДВ-Т-Л4", "Тамбур: лівий перехідний клин", sfBL, sBL, dBL, 5.0, false, "threshold");
      if (vL3) vestibulePanels.push(vL3);
      if (vL4) vestibulePanels.push(vL4);
    }

    // 2. Right cheek wall of vestibule
    const vR1 = createTriPanel("ДВ-Т-П1", "ДВ-Т-П1", "Тамбур: права стінка (нижня)", dBR, dTR, sBR, 5.0, false, "right");
    const vR2 = createTriPanel("ДВ-Т-П2", "ДВ-Т-П2", "Тамбур: права стінка (верхня)", sBR, dTR, sTR, 5.0, false, "right");
    if (vR1) vestibulePanels.push(vR1);
    if (vR2) vestibulePanels.push(vR2);

    if (elevation > 0) {
      const vR3 = createTriPanel("ДВ-Т-П3", "ДВ-Т-П3", "Тамбур: правий цокольний клин", sfBR, fBR, dBR, 5.0, false, "threshold");
      const vR4 = createTriPanel("ДВ-Т-П4", "ДВ-Т-П4", "Тамбур: правий перехідний клин", sfBR, dBR, sBR, 5.0, false, "threshold");
      if (vR3) vestibulePanels.push(vR3);
      if (vR4) vestibulePanels.push(vR4);
    }

    // 3. Vestibule roof canopy
    const vD1 = createTriPanel("ДВ-Т-Д1", "ДВ-Т-Д1", "Тамбур: покрівля (лівий передній скат)", dTL, sTL, dTMid, 5.0, false, "top");
    const vD2 = createTriPanel("ДВ-Т-Д2", "ДВ-Т-Д2", "Тамбур: покрівля (лівий задній скат)", sTL, sTMid, dTMid, 5.0, false, "top");
    const vD3 = createTriPanel("ДВ-Т-Д3", "ДВ-Т-Д3", "Тамбур: покрівля (правий передній скат)", dTR, dTMid, sTR, 5.0, false, "top");
    const vD4 = createTriPanel("ДВ-Т-Д4", "ДВ-Т-Д4", "Тамбур: покрівля (правий задній скат)", dTMid, sTMid, sTR, 5.0, false, "top");
    if (vD1) vestibulePanels.push(vD1);
    if (vD2) vestibulePanels.push(vD2);
    if (vD3) vestibulePanels.push(vD3);
    if (vD4) vestibulePanels.push(vD4);

    // 4. Front gable over door header
    const vG = createTriPanel("ДВ-Т-Ф1", "ДВ-Т-Ф1", "Тамбур: передній фронтон над перемичкою", dTL, dTMid, dTR, 5.0, false, "top");
    if (vG) vestibulePanels.push(vG);

    // 5. Front foundation apron and floor underside if elevated
    if (elevation > 0) {
      const vC1 = createTriPanel("ДВ-Т-Ц1", "ДВ-Т-Ц1", "Тамбур: передній цоколь (ліва частина)", fBL, dBL, fBR, 5.0, false, "threshold");
      const vC2 = createTriPanel("ДВ-Т-Ц2", "ДВ-Т-Ц2", "Тамбур: передній цоколь (права частина)", dBL, dBR, fBR, 5.0, false, "threshold");
      const vC3 = createTriPanel("ДВ-Т-Ц3", "ДВ-Т-Ц3", "Тамбур: підшивка дна порогу (1)", sfBL, fBL, sfBR, 5.0, false, "threshold");
      const vC4 = createTriPanel("ДВ-Т-Ц4", "ДВ-Т-Ц4", "Тамбур: підшивка дна порогу (2)", fBL, fBR, sfBR, 5.0, false, "threshold");
      if (vC1) vestibulePanels.push(vC1);
      if (vC2) vestibulePanels.push(vC2);
      if (vC3) vestibulePanels.push(vC3);
      if (vC4) vestibulePanels.push(vC4);
    }
  }

  // =========================================================================
  // REVEAL CASING PANELS: Internal walk-through lining
  // =========================================================================
  const depthMm = portal.depthMm;
  const rawReveals: Array<DoorTriangulatedPanel | null> = [
    createTriPanel("ДВ-У1", "ДВ-У1", "Лівий укос прорізу (сегмент 1)", { x: 0, y: 0, z: 0 }, { x: heightMm, y: 0, z: 0 }, { x: heightMm, y: depthMm, z: 0 }, 0, true, "casing"),
    createTriPanel("ДВ-У2", "ДВ-У2", "Лівий укос прорізу (сегмент 2)", { x: 0, y: 0, z: 0 }, { x: heightMm, y: depthMm, z: 0 }, { x: 0, y: depthMm, z: 0 }, 0, true, "casing"),
    createTriPanel("ДВ-У3", "ДВ-У3", "Правий укос прорізу (сегмент 1)", { x: 0, y: 0, z: 0 }, { x: heightMm, y: 0, z: 0 }, { x: heightMm, y: depthMm, z: 0 }, 0, true, "casing"),
    createTriPanel("ДВ-У4", "ДВ-У4", "Правий укос прорізу (сегмент 2)", { x: 0, y: 0, z: 0 }, { x: heightMm, y: depthMm, z: 0 }, { x: 0, y: depthMm, z: 0 }, 0, true, "casing"),
    createTriPanel("ДВ-У5", "ДВ-У5", "Верхня стеля прорізу (сегмент 1)", { x: 0, y: 0, z: 0 }, { x: widthMm, y: 0, z: 0 }, { x: widthMm, y: depthMm, z: 0 }, 0, true, "casing"),
    createTriPanel("ДВ-У6", "ДВ-У6", "Верхня стеля прорізу (сегмент 2)", { x: 0, y: 0, z: 0 }, { x: widthMm, y: depthMm, z: 0 }, { x: 0, y: depthMm, z: 0 }, 0, true, "casing")
  ];

  if (elevation > 0) {
    rawReveals.push(
      createTriPanel("ДВ-У7", "ДВ-У7", "Підпорогова сходинка (сегмент 1)", { x: 0, y: 0, z: 0 }, { x: widthMm, y: 0, z: 0 }, { x: widthMm, y: elevation, z: 0 }, 0, true, "casing"),
      createTriPanel("ДВ-У8", "ДВ-У8", "Підпорогова сходинка (сегмент 2)", { x: 0, y: 0, z: 0 }, { x: widthMm, y: elevation, z: 0 }, { x: 0, y: elevation, z: 0 }, 0, true, "casing")
    );
  }

  const revealPanels: DoorTriangulatedPanel[] = rawReveals.filter((p): p is DoorTriangulatedPanel => p !== null);

  // =========================================================================
  // STRUCTURAL CONNECTING BEAMS: Framework tying doorway to dome & vestibule
  // =========================================================================
  const beamW = (model.beamProfile.type === "circular" || model.beamProfile.type === "pipe")
    ? (model.beamProfile.diameter || 50)
    : (model.beamProfile.width || 50);
  const beamD = (model.beamProfile.type === "circular" || model.beamProfile.type === "pipe")
    ? (model.beamProfile.diameter || 100)
    : (model.beamProfile.depth || 100);

  const makeBeam = (
    id: string,
    name: string,
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
    zone: "left" | "right" | "top" | "threshold"
  ): DoorConnectingBeam => {
    const len = Math.round(Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z));
    return {
      id,
      name,
      zone,
      start,
      end,
      lengthMm: Math.max(10, len),
      widthMm: beamW,
      depthMm: beamD
    };
  };

  const connectingBeams: DoorConnectingBeam[] = [];

  // Beams from internal retriangulation edges of the dome shell
  const seenEdges = new Set<string>();
  const addShellBeam = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, name: string, zone: "left" | "right" | "top" | "threshold") => {
    const k1 = `${Math.round(a.x)}_${Math.round(a.y)}_${Math.round(a.z)}--${Math.round(b.x)}_${Math.round(b.y)}_${Math.round(b.z)}`;
    const k2 = `${Math.round(b.x)}_${Math.round(b.y)}_${Math.round(b.z)}--${Math.round(a.x)}_${Math.round(a.y)}_${Math.round(a.z)}`;
    if (seenEdges.has(k1) || seenEdges.has(k2)) return;
    seenEdges.add(k1);
    seenEdges.add(k2);
    connectingBeams.push(makeBeam(`ЗБ-О-${connectingBeams.length + 1}`, name, a, b, zone));
  };

  shellPanels.forEach(p => {
    const [p1, p2, p3] = p.vertices3D;
    const isPortalPt = (pt: { x: number; y: number; z: number }) => {
      return (Math.hypot(pt.x - sBL.x, pt.y - sBL.y, pt.z - sBL.z) < 20) ||
             (Math.hypot(pt.x - sBR.x, pt.y - sBR.y, pt.z - sBR.z) < 20) ||
             (Math.hypot(pt.x - sTL.x, pt.y - sTL.y, pt.z - sTL.z) < 20) ||
             (Math.hypot(pt.x - sTR.x, pt.y - sTR.y, pt.z - sTR.z) < 20) ||
             (Math.hypot(pt.x - sTMid.x, pt.y - sTMid.y, pt.z - sTMid.z) < 20);
    };

    if (isPortalPt(p1) || isPortalPt(p2)) addShellBeam(p1, p2, "З'єднувальна балка каркасу купола", p.zone as any);
    if (isPortalPt(p2) || isPortalPt(p3)) addShellBeam(p2, p3, "З'єднувальна балка каркасу купола", p.zone as any);
    if (isPortalPt(p3) || isPortalPt(p1)) addShellBeam(p3, p1, "З'єднувальна балка каркасу купола", p.zone as any);
  });

  // Vestibule framing beams if protruding
  if (offset > 20) {
    connectingBeams.push(
      makeBeam("ЗБ-Т-Л1", "Тамбур: нижня ліва балка", dBL, sBL, "left"),
      makeBeam("ЗБ-Т-Л2", "Тамбур: верхня ліва балка", dTL, sTL, "left"),
      makeBeam("ЗБ-Т-П1", "Тамбур: нижня права балка", dBR, sBR, "right"),
      makeBeam("ЗБ-Т-П2", "Тамбур: верхня права балка", dTR, sTR, "right"),
      makeBeam("ЗБ-Т-Д1", "Тамбур: центральний коник даху", dTMid, sTMid, "top")
    );

    if (elevation > 0) {
      connectingBeams.push(
        makeBeam("ЗБ-Т-Ц1", "Тамбур: фронтальна обв'язка цоколя", fBL, fBR, "threshold"),
        makeBeam("ЗБ-Т-Ц2", "Тамбур: ліва цокольна балка", fBL, sfBL, "threshold"),
        makeBeam("ЗБ-Т-Ц3", "Тамбур: права цокольна балка", fBR, sfBR, "threshold")
      );
    }
  }

  if (elevation > 0) {
    connectingBeams.push(
      makeBeam("ЗБ-Ц-О1", "Нижня обв'язка порогу купола", sfBL, sfBR, "threshold")
    );
  }

  // Determine leveled tier for 2nd floor where the door opening falls
  const leveledTierLvl = getDoorwayLevelingTier(model, anchorFaceId, heightMm, portal.capturedFaceIds);
  const tierNodes = model.nodes.filter(n => n.tierLevel === leveledTierLvl);

  let nodeTopA = { x: sTL.x, y: sTL.y, z: sTL.z + 400 };
  let nodeTopB = { x: sTR.x, y: sTR.y, z: sTR.z + 400 };

  if (tierNodes.length >= 2) {
    // Project tier nodes along horizontal door tangent to guarantee one node left and one right
    const leftTierNodes = tierNodes.filter(n => {
      const proj = (n.position.x - sTMid.x) * t.x + (n.position.y - sTMid.y) * t.y;
      return proj <= 30; // left side or near centerline
    });
    const rightTierNodes = tierNodes.filter(n => {
      const proj = (n.position.x - sTMid.x) * t.x + (n.position.y - sTMid.y) * t.y;
      return proj >= -30; // right side or near centerline
    });

    const sortLeft = [...(leftTierNodes.length > 0 ? leftTierNodes : tierNodes)].sort((a, b) => {
      const dA = Math.hypot(a.position.x - sTL.x, a.position.y - sTL.y, a.position.z - sTL.z);
      const dB = Math.hypot(b.position.x - sTL.x, b.position.y - sTL.y, b.position.z - sTL.z);
      return dA - dB;
    });

    const sortRight = [...(rightTierNodes.length > 0 ? rightTierNodes : tierNodes)].sort((a, b) => {
      const dA = Math.hypot(a.position.x - sTR.x, a.position.y - sTR.y, a.position.z - sTR.z);
      const dB = Math.hypot(b.position.x - sTR.x, b.position.y - sTR.y, b.position.z - sTR.z);
      return dA - dB;
    });

    const candA = sortLeft[0];
    let candB = sortRight[0];
    if (candA && candB && candA.id === candB.id && sortRight.length > 1) {
      candB = sortRight[1];
    }
    if (candA) nodeTopA = candA.position;
    if (candB) nodeTopB = candB.position;
  }

  const parallelBeamMid = {
    x: (nodeTopA.x + nodeTopB.x) / 2,
    y: (nodeTopA.y + nodeTopB.y) / 2,
    z: (nodeTopA.z + nodeTopB.z) / 2
  };

  // Add structural horizontal lintel beam (strictly parallel to 2nd floor) and tie struts to the parallel beam
  connectingBeams.push(
    makeBeam("ЗБ-П-Л1", "Горизонтальна перемичка над дверима (паралельно 2-му поверху)", sTL, sTR, "top"),
    makeBeam("ЗБ-С-В1", "Вертикальна зв'язка: перемичка дверей ↔ паралельна балка 2-го поверху", sTMid, parallelBeamMid, "top"),
    makeBeam("ЗБ-С-Л1", "Ліва підкісна балка: кут перемички ↔ вузол 2-го поверху", sTL, nodeTopA, "top"),
    makeBeam("ЗБ-С-П1", "Права підкісна балка: кут перемички ↔ вузол 2-го поверху", sTR, nodeTopB, "top"),
    makeBeam("ЗБ-Б-Г1", "Паралельна горизонтальна балка 2-го поверху над дверима", nodeTopA, nodeTopB, "top")
  );

  const normVec = (v: { x: number; y: number; z: number }) => {
    const d = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / d, y: v.y / d, z: v.z / d };
  };

  // Structural engineering connectors on lintel and opposite parallel beam
  const doorwayConnectors: DoorwayConnector[] = [
    {
      id: "ДК-ПБ-1",
      name: "Конектор на паралельній балці 2-го поверху",
      position: parallelBeamMid,
      normal: nOut,
      role: "parallel_beam_hub",
      rayDirections: [
        normVec({ x: nodeTopA.x - parallelBeamMid.x, y: nodeTopA.y - parallelBeamMid.y, z: nodeTopA.z - parallelBeamMid.z }),
        normVec({ x: nodeTopB.x - parallelBeamMid.x, y: nodeTopB.y - parallelBeamMid.y, z: nodeTopB.z - parallelBeamMid.z }),
        normVec({ x: sTMid.x - parallelBeamMid.x, y: sTMid.y - parallelBeamMid.y, z: sTMid.z - parallelBeamMid.z })
      ]
    },
    {
      id: "ДК-ЛП-Л",
      name: "Вузловий конектор лівого кута перемички дверей",
      position: sTL,
      normal: nOut,
      role: "lintel_left",
      rayDirections: [
        normVec({ x: sBL.x - sTL.x, y: sBL.y - sTL.y, z: sBL.z - sTL.z }),
        normVec({ x: sTR.x - sTL.x, y: sTR.y - sTL.y, z: sTR.z - sTL.z }),
        normVec({ x: nodeTopA.x - sTL.x, y: nodeTopA.y - sTL.y, z: nodeTopA.z - sTL.z })
      ]
    },
    {
      id: "ДК-ЛП-П",
      name: "Вузловий конектор правого кута перемички дверей",
      position: sTR,
      normal: nOut,
      role: "lintel_right",
      rayDirections: [
        normVec({ x: sBR.x - sTR.x, y: sBR.y - sTR.y, z: sBR.z - sTR.z }),
        normVec({ x: sTL.x - sTR.x, y: sTL.y - sTR.y, z: sTL.z - sTR.z }),
        normVec({ x: nodeTopB.x - sTR.x, y: nodeTopB.y - sTR.y, z: nodeTopB.z - sTR.z })
      ]
    },
    {
      id: "ДК-ЛП-М",
      name: "Центральний конектор перемички та вертикальної стійки",
      position: sTMid,
      normal: nOut,
      role: "lintel_mid",
      rayDirections: [
        normVec({ x: sTL.x - sTMid.x, y: sTL.y - sTMid.y, z: sTL.z - sTMid.z }),
        normVec({ x: sTR.x - sTMid.x, y: sTR.y - sTMid.y, z: sTR.z - sTMid.z }),
        normVec({ x: parallelBeamMid.x - sTMid.x, y: parallelBeamMid.y - sTMid.y, z: parallelBeamMid.z - sTMid.z })
      ]
    }
  ];

  // Construct supplemented unique engineering nodes for doorway retriangulation
  const doorwayNodes: DoorwayNode[] = [];
  let nextNodeNumber = model.nodes.length + 1;

  const addDoorNode = (
    pos: { x: number; y: number; z: number },
    role: "shell_cut" | "vestibule" | "threshold" | "lintel",
    name: string
  ) => {
    doorwayNodes.push({
      id: nextNodeNumber,
      label: `ДВ${nextNodeNumber}`,
      prefix: "ДВ",
      position: { x: pos.x, y: pos.y, z: pos.z },
      role,
      name
    });
    nextNodeNumber++;
  };

  // 1. Cut contour nodes on dome shell
  addDoorNode(sBL, "threshold", "Низ дверного отвору лівий (купол)");
  addDoorNode(sBR, "threshold", "Низ дверного отвору правий (купол)");
  addDoorNode(sTL, "lintel", "Верх дверного отвору лівий (купол)");
  addDoorNode(sTR, "lintel", "Верх дверного отвору правий (купол)");
  addDoorNode(sTMid, "lintel", "Коник перемички пройому (купол)");
  addDoorNode(parallelBeamMid, "lintel", "Вузол конектора на паралельній горизонтальній балці 2-го поверху");

  if (elevation > 0) {
    addDoorNode(sfBL, "threshold", "Основа фундаменту під лівою стійкою");
    addDoorNode(sfBR, "threshold", "Основа фундаменту під правою стійкою");
  }

  // 2. Vestibule protruding portal nodes
  if (offset > 20) {
    addDoorNode(dBL, "vestibule", "Портал тамбура низ лівий");
    addDoorNode(dBR, "vestibule", "Портал тамбура низ правий");
    addDoorNode(dTL, "vestibule", "Портал тамбура верх лівий");
    addDoorNode(dTR, "vestibule", "Портал тамбура верх правий");
    addDoorNode(dTMid, "vestibule", "Коник фронтону тамбура");

    if (elevation > 0) {
      addDoorNode(fBL, "vestibule", "Цоколь тамбура лівий");
      addDoorNode(fBR, "vestibule", "Цоколь тамбура правий");
    }
  }

  return {
    portal,
    connectingBeams,
    infillTriangles: shellPanels,
    vestibulePanels,
    revealPanels,
    doorwayNodes,
    doorwayConnectors,
    leveledTierLevel: leveledTierLvl,
    parallelBeamMidpoint: parallelBeamMid
  };
}

/**
 * Automatically determines which tier (Tier 2, 3, or 4) where the door opening reaches / falls,
 * relative to the second floor horizon.
 */
export function getDoorwayLevelingTier(
  model: DomeModel,
  anchorFaceId: number,
  doorHeightMm = 2050,
  capturedFaceIds?: number[]
): number {
  const fIds = capturedFaceIds && capturedFaceIds.length > 0 ? capturedFaceIds : [anchorFaceId];
  const nodeIds = new Set<number>();
  for (const fid of fIds) {
    const f = model.faces.find(fa => fa.id === fid);
    if (f) {
      nodeIds.add(f.a);
      nodeIds.add(f.b);
      nodeIds.add(f.c);
    }
  }

  const tiersInCluster = Array.from(nodeIds)
    .map(id => model.nodes[id]?.tierLevel)
    .filter((t): t is number => t !== undefined && t >= 2 && t <= 4);

  // If the doorway cluster reaches Tier 4 (upper triangles of 1st floor in 4V/5V domes)
  if (tiersInCluster.includes(4)) {
    return 4;
  }
  // If the doorway cluster reaches Tier 3
  if (tiersInCluster.includes(3)) {
    return 3;
  }
  // If the doorway cluster reaches Tier 2
  if (tiersInCluster.includes(2)) {
    const t3 = model.tiers?.find(t => t.level === 3);
    const anchorFace = model.faces.find(fa => fa.id === anchorFaceId);
    const anchorNodes = anchorFace ? [model.nodes[anchorFace.a], model.nodes[anchorFace.b], model.nodes[anchorFace.c]].filter(Boolean) : [];
    const minZ = anchorNodes.length ? Math.min(...anchorNodes.map(n => n.position.z)) : 0;
    const doorTopZ = minZ + doorHeightMm;
    if (t3 && doorTopZ >= t3.avgZ * 0.82) {
      return 3;
    }
    return 2;
  }

  const t4 = model.tiers?.find(t => t.level === 4);
  const t3 = model.tiers?.find(t => t.level === 3);
  const t2 = model.tiers?.find(t => t.level === 2);
  if (t4 && doorHeightMm >= t4.avgZ * 0.85) return 4;
  if (t3 && doorHeightMm >= t3.avgZ * 0.82) return 3;
  if (t2) return 2;
  return 2;
}

/**
 * Returns supplemented unique engineering nodes for window openings and glazing
 */
export function getWindowNodes(model: DomeModel, startNumber?: number): Array<{
  id: number;
  label: string;
  prefix: string;
  position: { x: number; y: number; z: number };
  faceId: number;
  name: string;
}> {
  const windowIds = model.windowFaceIds || [];
  if (windowIds.length === 0) return [];
  let currentNum = startNumber !== undefined ? startNumber : model.nodes.length + 1;
  const result: Array<{
    id: number;
    label: string;
    prefix: string;
    position: { x: number; y: number; z: number };
    faceId: number;
    name: string;
  }> = [];

  for (const fid of windowIds) {
    const f = model.faces.find(fa => fa.id === fid);
    if (!f) continue;
    const pA = model.nodes[f.a].position;
    const pB = model.nodes[f.b].position;
    const pC = model.nodes[f.c].position;
    // Window centroid hub node
    const cen = {
      x: (pA.x + pB.x + pC.x) / 3,
      y: (pA.y + pB.y + pC.y) / 3,
      z: (pA.z + pB.z + pC.z) / 3
    };
    result.push({
      id: currentNum,
      label: `ВК${currentNum}`,
      prefix: "ВК",
      position: cen,
      faceId: fid,
      name: `Центральний вузол вікна W${fid}`
    });
    currentNum++;
  }
  return result;
}

/**
 * Calculates peak power generation and annual yield for solar PV electric triangles
 */
export function calculateSolarGeneration(model: DomeModel): {
  totalAreaM2: number;
  peakPowerWatts: number;
  dailyKWh: number;
  annualKWh: number;
  panelCount: number;
} {
  const solarIds = new Set(model.solarFaceIds || []);
  if (solarIds.size === 0) {
    return {
      totalAreaM2: 0,
      peakPowerWatts: 0,
      dailyKWh: 0,
      annualKWh: 0,
      panelCount: 0
    };
  }

  const solarFaces = model.faces.filter(f => solarIds.has(f.id));
  const totalAreaM2 = Math.round(
    solarFaces.reduce((sum, f) => sum + f.area / 1_000_000, 0) * 100
  ) / 100;

  const wPerM2 = model.solarParams?.peakPowerPerM2 || 210;
  const peakPowerWatts = Math.round(totalAreaM2 * wPerM2);

  // In Ukraine / Central Europe, average specific yield is ~3.2-3.8 peak sun hours/day (~1100 kWh/kWp/year)
  const dailyKWh = Math.round(((peakPowerWatts / 1000) * 3.5) * 10) / 10;
  const annualKWh = Math.round((peakPowerWatts / 1000) * 1150);

  return {
    totalAreaM2,
    peakPowerWatts,
    dailyKWh,
    annualKWh,
    panelCount: solarFaces.length
  };
}
