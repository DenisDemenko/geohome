import {
  DomeParameters,
  DomeModel,
  Node,
  Face,
  BeamProfile,
  ConnectorParams,
  SheathingParams,
  TierInfo,
  TierLevelingConfig
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
  const isEllipsoid = parameters.shapeType === "ellipsoid";
  const lenX = parameters.ellipsoidLengthX && parameters.ellipsoidLengthX > 0 ? parameters.ellipsoidLengthX : diameter;
  const widY = parameters.ellipsoidWidthY && parameters.ellipsoidWidthY > 0 ? parameters.ellipsoidWidthY : diameter;
  const hgtZ = parameters.ellipsoidHeightZ && parameters.ellipsoidHeightZ > 0 ? parameters.ellipsoidHeightZ : height;

  const radX = isEllipsoid ? lenX / 2 : radius;
  const radY = isEllipsoid ? widY / 2 : radius;
  const radZ = isEllipsoid ? hgtZ : radius;

  // 1. Subdivide icosahedron
  const subdivision = subdivideIcosahedron(
    ICOSAHEDRON_VERTICES,
    ICOSAHEDRON_FACES,
    frequency
  );

  // 2. Scale to millimeter semi-axes (sphere or ellipsoid)
  const scaledVertices = subdivision.vertices.map(v => ({
    x: v.x * radX,
    y: v.y * radY,
    z: v.z * radZ
  }));

  // 3. Determine cut plane Z
  // In our coordinate system, top of dome is at +radZ.
  // Full sphere/ellipsoid Z is in [-radZ, +radZ].
  let cutZ = 0;
  let effectiveHeight = isEllipsoid ? hgtZ : height;

  if (cutType === "1/1") {
    // Full 360° closed geodesic sphere / ellipsoid
    effectiveHeight = radZ * 2;
    cutZ = -radZ * 1.08; // safely keep all vertices of the sphere
  } else if (cutType === "5/6") {
    effectiveHeight = isEllipsoid ? (radZ * 5) / 3 : (diameter * 5) / 6;
    cutZ = radZ - effectiveHeight;
  } else if (cutType === "3/4") {
    effectiveHeight = isEllipsoid ? radZ * 1.5 : (diameter * 3) / 4;
    cutZ = radZ - effectiveHeight;
  } else if (cutType === "5/8") {
    effectiveHeight = isEllipsoid ? radZ * 1.25 : (diameter * 5) / 8;
    cutZ = radZ - effectiveHeight;
  } else if (cutType === "7/12") {
    effectiveHeight = isEllipsoid ? (radZ * 7) / 6 : (diameter * 7) / 12;
    cutZ = radZ - effectiveHeight;
  } else if (cutType === "1/2") {
    effectiveHeight = radZ;
    cutZ = 0;
  } else if (cutType === "5/12") {
    effectiveHeight = isEllipsoid ? (radZ * 5) / 6 : (diameter * 5) / 12;
    cutZ = radZ - effectiveHeight;
  } else if (cutType === "3/8") {
    effectiveHeight = isEllipsoid ? radZ * 0.75 : (diameter * 3) / 8;
    cutZ = radZ - effectiveHeight;
  } else if (cutType === "1/4") {
    effectiveHeight = isEllipsoid ? radZ * 0.5 : (diameter * 1) / 4;
    cutZ = radZ - effectiveHeight;
  } else if (cutType === "1/6") {
    effectiveHeight = isEllipsoid ? (radZ * 1) / 3 : (diameter * 1) / 6;
    cutZ = radZ - effectiveHeight;
  } else {
    // Exact height
    effectiveHeight = Math.min(radZ * 2, Math.max(radZ * 0.1, isEllipsoid ? hgtZ : height));
    cutZ = radZ - effectiveHeight;
  }

  // Filter faces whose centroid or all vertices are above the cutting plane
  // Keep complete triangles above cut plane (with slight tolerance to catch the base ring)
  const tolerance = radZ * 0.04;
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
      if (boundaryVertexIds.size > 0 && cutType !== "1/1") {
        // Calculate theoretical horizontal cross-section semi-axes at base plane
        // Ellipsoid: (x/radX)^2 + (y/radY)^2 + (z/radZ)^2 = 1
        // At cut plane z = cutZ: (x/radX)^2 + (y/radY)^2 = 1 - (cutZ/radZ)^2
        const cutRatio = Math.min(0.99, Math.max(0, Math.abs(cutZ) / radZ));
        const cutScale = Math.sqrt(Math.max(0.01, 1 - cutRatio * cutRatio));

        // When cutType === "1/2" (equator / middle of sphere or ellipsoid):
        // base adapts exactly to the equator: length X (radX), width Y (radY), diameter (radius)
        const targetSemiX = isEllipsoid
          ? radX * (cutType === "1/2" ? 1 : cutScale)
          : radius * (cutType === "1/2" ? 1 : cutScale);
        const targetSemiY = isEllipsoid
          ? radY * (cutType === "1/2" ? 1 : cutScale)
          : radius * (cutType === "1/2" ? 1 : cutScale);

        for (const vid of boundaryVertexIds) {
          const v = domeVertices[vid];
          // Elliptic angle in normalized parameter space
          const angle = Math.atan2(v.y / radY, v.x / radX);
          domeVertices[vid] = {
            x: Math.round(targetSemiX * Math.cos(angle) * 10) / 10,
            y: Math.round(targetSemiY * Math.sin(angle) * 10) / 10,
            z: 0 // Leveled exactly to horizontal foundation plane
          };
        }
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

  // Optional Riser Wall / Plinth (Цоколь прямокутниками від 200 мм до 2000 мм)
  const isPlinthActive = Boolean(parameters.plinth?.enabled && (parameters.plinth.height ?? 0) > 0);
  const plinthH = isPlinthActive
    ? Math.max(200, Math.min(2000, Math.round(parameters.plinth!.height || 800)))
    : 0;

  let plinthBayCount = 0;
  let plinthWallAreaM2 = 0;

  if (isPlinthActive && plinthH > 0) {
    // 1. Shift all dome vertices up by plinth height so dome sits on top of plinth
    domeVertices = domeVertices.map(v => ({
      x: v.x,
      y: v.y,
      z: v.z + plinthH
    }));
    effectiveHeight += plinthH;

    // 2. Order boundary nodes circularly along the perimeter ring
    const bAdj = new Map<number, number[]>();
    for (const [u, v] of boundaryEdges) {
      if (!bAdj.has(u)) bAdj.set(u, []);
      if (!bAdj.has(v)) bAdj.set(v, []);
      bAdj.get(u)!.push(v);
      bAdj.get(v)!.push(u);
    }

    const sortedByAngle = [...boundaryVertexIds].sort((a, b) => {
      const angA = Math.atan2(domeVertices[a].y, domeVertices[a].x);
      const angB = Math.atan2(domeVertices[b].y, domeVertices[b].x);
      return angA - angB;
    });

    const startV = sortedByAngle[0];
    const orderedBoundary: number[] = [startV];
    const visitedB = new Set<number>([startV]);
    let currB = startV;

    // Pick counter-clockwise neighbour
    const nbrs = bAdj.get(currB) || [];
    let nextB = nbrs[0];
    if (nbrs.length > 1) {
      const angCurr = Math.atan2(domeVertices[currB].y, domeVertices[currB].x);
      const diff0 = (Math.atan2(domeVertices[nbrs[0]].y, domeVertices[nbrs[0]].x) - angCurr + 2 * Math.PI) % (2 * Math.PI);
      const diff1 = (Math.atan2(domeVertices[nbrs[1]].y, domeVertices[nbrs[1]].x) - angCurr + 2 * Math.PI) % (2 * Math.PI);
      nextB = diff0 < diff1 ? nbrs[0] : nbrs[1];
    }
    if (nextB !== undefined && !visitedB.has(nextB)) {
      orderedBoundary.push(nextB);
      visitedB.add(nextB);
      currB = nextB;
    }

    while (orderedBoundary.length < boundaryVertexIds.size) {
      const curNbrs = bAdj.get(currB) || [];
      const unvisited = curNbrs.filter(n => !visitedB.has(n));
      if (unvisited.length === 0) break;
      currB = unvisited[0];
      orderedBoundary.push(currB);
      visitedB.add(currB);
    }

    // 3. Create ground vertices at Z = 0 directly below each boundary vertex
    const gIndexMap = new Map<number, number>();
    for (const vid of orderedBoundary) {
      const v = domeVertices[vid];
      const gId = domeVertices.length;
      domeVertices.push({
        x: v.x,
        y: v.y,
        z: 0 // Foundation ground horizon
      });
      gIndexMap.set(vid, gId);
    }

    // 4. Form rectangular wall bays divided diagonally by structural bracing beam
    const plinthFaces: { a: number; b: number; c: number }[] = [];
    plinthBayCount = orderedBoundary.length;

    let totalPlinthPerimeter = 0;
    for (let i = 0; i < orderedBoundary.length; i++) {
      const u = orderedBoundary[i];
      const v = orderedBoundary[(i + 1) % orderedBoundary.length];
      const gU = gIndexMap.get(u)!;
      const gV = gIndexMap.get(v)!;

      const bayW = Math.hypot(domeVertices[u].x - domeVertices[v].x, domeVertices[u].y - domeVertices[v].y);
      totalPlinthPerimeter += bayW;

      // Two triangular faces per rectangular bay, triangulated with diagonal beam gU -> v
      // Upper triangle: (gU, v, u)
      // Lower triangle: (gU, gV, v)
      plinthFaces.push({ a: gU, b: v, c: u });
      plinthFaces.push({ a: gU, b: gV, c: v });
    }

    plinthWallAreaM2 = Math.round(((totalPlinthPerimeter * plinthH) / 1_000_000) * 10) / 10;
    domeFaces = [...domeFaces, ...plinthFaces];
  }

  const sphereCenterZ = effectiveHeight - radius;

  // 5. Tier Level Classification & Leveling (Вирівнювання вузлів 2-го, 3-го, 4-го, 5-го рівнів паралельно землі для 2-го поверху)
  const domeAdj = new Map<number, Set<number>>();
  for (const f of domeFaces) {
    if (!domeAdj.has(f.a)) domeAdj.set(f.a, new Set());
    if (!domeAdj.has(f.b)) domeAdj.set(f.b, new Set());
    if (!domeAdj.has(f.c)) domeAdj.set(f.c, new Set());
    domeAdj.get(f.a)!.add(f.b);
    domeAdj.get(f.a)!.add(f.c);
    domeAdj.get(f.b)!.add(f.a);
    domeAdj.get(f.b)!.add(f.c);
    domeAdj.get(f.c)!.add(f.a);
    domeAdj.get(f.c)!.add(f.b);
  }

  const vertexTierMap = new Map<number, number>();
  const tierQueue: number[] = [];

  // Ground foundation nodes if plinth is active get Tier 0
  if (isPlinthActive && plinthH > 0) {
    for (let vid = 0; vid < domeVertices.length; vid++) {
      if (domeVertices[vid].z <= 2.0) {
        vertexTierMap.set(vid, 0);
      }
    }
  }

  // Dome boundary ring is Tier 1
  for (const bId of boundaryVertexIds) {
    vertexTierMap.set(bId, 1);
    tierQueue.push(bId);
  }

  // If no boundary ring exists (e.g. 1/1 full sphere), seed Tier 1 from the bottom-most pole node
  if (boundaryVertexIds.size === 0 && domeVertices.length > 0) {
    let lowestVid = 0;
    let minZVal = Infinity;
    for (let vid = 0; vid < domeVertices.length; vid++) {
      if (domeVertices[vid].z < minZVal) {
        minZVal = domeVertices[vid].z;
        lowestVid = vid;
      }
    }
    vertexTierMap.set(lowestVid, 1);
    tierQueue.push(lowestVid);
  }

  // BFS upward to classify concentric geodesic rings into tiers 2, 3, 4, 5...
  while (tierQueue.length > 0) {
    const curr = tierQueue.shift()!;
    const currTier = vertexTierMap.get(curr)!;
    const nbrs = domeAdj.get(curr);
    if (!nbrs) continue;
    for (const nbr of nbrs) {
      if (!vertexTierMap.has(nbr)) {
        vertexTierMap.set(nbr, currTier + 1);
        tierQueue.push(nbr);
      }
    }
  }

  // Apply Tier Leveling for tiers (2, 3, 4, 5)
  // Auto-enable Tier Leveling for tier 2 or 3 where the door falls if a door opening is present
  const effectiveTierLeveling: Record<number, TierLevelingConfig> = parameters.tierLeveling ? { ...parameters.tierLeveling } : {};
  const activeDoorFaceIds = parameters.doorFaceIds || parameters.doorParams?.doorFaceIds || [];
  const anchorFaceId = parameters.doorParams?.anchorFaceId ?? activeDoorFaceIds[0];
  const hasDoor = activeDoorFaceIds.length > 0 && anchorFaceId !== undefined;

  if (hasDoor) {
    const isTier2Or3Leveled = Boolean(effectiveTierLeveling[2]?.enabled || effectiveTierLeveling[3]?.enabled);
    if (!isTier2Or3Leveled) {
      const doorVids = new Set<number>();
      for (const fid of activeDoorFaceIds) {
        const f = domeFaces[fid];
        if (f) {
          doorVids.add(f.a);
          doorVids.add(f.b);
          doorVids.add(f.c);
        }
      }
      const tiersInDoor = Array.from(doorVids)
        .map(vid => vertexTierMap.get(vid))
        .filter((t): t is number => t !== undefined && t >= 2);

      let autoLvl = 2;
      if (tiersInDoor.includes(3)) {
        autoLvl = 3;
      } else if (tiersInDoor.includes(2)) {
        const doorH = parameters.doorParams?.heightMm || 2050;
        const tier3Vids = [...vertexTierMap.entries()].filter(([_, t]) => t === 3).map(([vid]) => vid);
        if (tier3Vids.length > 0) {
          const avgZ3 = tier3Vids.reduce((sum, vid) => sum + domeVertices[vid].z, 0) / tier3Vids.length;
          if (doorH >= avgZ3 * 0.82) {
            autoLvl = 3;
          }
        }
      }
      effectiveTierLeveling[autoLvl] = {
        level: autoLvl,
        enabled: true,
        radialMode: "vertical"
      };
    }
  }

  for (const lvlStr of Object.keys(effectiveTierLeveling)) {
    const lvl = Number(lvlStr);
    const cfg = effectiveTierLeveling[lvl];
    if (!cfg || !cfg.enabled) continue;

      const tierVids = [...vertexTierMap.entries()]
        .filter(([vid, t]) => t === lvl)
        .map(([vid]) => vid);

      if (tierVids.length === 0) continue;

      let targetZ: number;
      let targetR: number;

      if (cfg.referenceNodeId !== undefined && tierVids.includes(cfg.referenceNodeId)) {
        targetZ = domeVertices[cfg.referenceNodeId].z;
        targetR = Math.hypot(domeVertices[cfg.referenceNodeId].x, domeVertices[cfg.referenceNodeId].y);
      } else if (cfg.targetZ !== undefined) {
        targetZ = cfg.targetZ;
        targetR = Math.hypot(domeVertices[tierVids[0]].x, domeVertices[tierVids[0]].y);
      } else {
        // Default to maximum height in this tier to maximize second floor headroom
        targetZ = Math.max(...tierVids.map(vid => domeVertices[vid].z));
        targetR = Math.hypot(domeVertices[tierVids[0]].x, domeVertices[tierVids[0]].y);
      }

      const radialMode = cfg.radialMode || "vertical";

      for (const vid of tierVids) {
        const v = domeVertices[vid];
        if (radialMode === "uniform_radius") {
          const angle = Math.atan2(v.y, v.x);
          domeVertices[vid] = {
            x: Math.round(targetR * Math.cos(angle) * 10) / 10,
            y: Math.round(targetR * Math.sin(angle) * 10) / 10,
            z: Math.round(targetZ * 10) / 10
          };
        } else if (radialMode === "spherical") {
          const rZ = targetZ - sphereCenterZ;
          const sphereRXY = Math.sqrt(Math.max(0, radius * radius - rZ * rZ));
          const angle = Math.atan2(v.y, v.x);
          domeVertices[vid] = {
            x: Math.round(sphereRXY * Math.cos(angle) * 10) / 10,
            y: Math.round(sphereRXY * Math.sin(angle) * 10) / 10,
            z: Math.round(targetZ * 10) / 10
          };
        } else {
          // Pure vertical leveling: sets Z parallel to ground, keeps original X and Y
          domeVertices[vid] = {
            x: v.x,
            y: v.y,
            z: Math.round(targetZ * 10) / 10
          };
        }
      }
    }

  // Determine beam depth to position outer sheathing strictly on the exterior faces of struts
  const effBeamDepth = (customProfile?.type === "circular" || customProfile?.type === "pipe")
    ? (customProfile?.diameter || customProfile?.width || 40)
    : (customProfile?.depth || DEFAULT_BEAM_PROFILES[0].depth || 150);
  const outerOffset = (effBeamDepth / 2) + (customSheathing?.offsetMm || 0);

  // Build full topology with sheathing panels measured on outer faces of beams
  const topology = buildTopology(
    domeVertices,
    domeFaces,
    0,
    outerOffset,
    sphereCenterZ,
    radius,
    parameters.shapeType || "sphere",
    radX,
    radY,
    radZ
  );

  // Tag tier levels and tier leveling on topology nodes
  for (const node of topology.nodes) {
    const t = vertexTierMap.get(node.id);
    if (t !== undefined) {
      node.tierLevel = t;
    } else if (node.isPlinthGroundNode) {
      node.tierLevel = 0;
    } else {
      node.tierLevel = 1;
    }

    if (node.tierLevel !== undefined && (effectiveTierLeveling[node.tierLevel]?.enabled || parameters.tierLeveling?.[node.tierLevel]?.enabled)) {
      node.isTierLeveled = true;
    }
  }

  // Tag plinth elements if plinth is active
  if (isPlinthActive && plinthH > 0) {
    for (const node of topology.nodes) {
      if (node.position.z <= 2.0) {
        node.isPlinthGroundNode = true;
        node.boundary = true;
      } else if (Math.abs(node.position.z - plinthH) <= 25.0) {
        node.isPlinthTopNode = true;
      }
    }

    for (const edge of topology.edges) {
      const p1 = topology.nodes[edge.start].position;
      const p2 = topology.nodes[edge.end].position;
      const isZ1Ground = p1.z <= 2.0;
      const isZ2Ground = p2.z <= 2.0;

      if (isZ1Ground && isZ2Ground) {
        edge.isPlinthBeam = true;
        edge.plinthRole = "sill";
        edge.isBaseBeam = true;
      } else if (isZ1Ground !== isZ2Ground) {
        edge.isPlinthBeam = true;
        const distXY = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (distXY <= 25.0) {
          edge.plinthRole = "post";
        } else {
          edge.plinthRole = "diagonal";
        }
      }
    }

    const numPlinthFaces = plinthBayCount * 2;
    const plinthStartFaceIdx = topology.faces.length - numPlinthFaces;
    for (let fIdx = 0; fIdx < topology.faces.length; fIdx++) {
      const face = topology.faces[fIdx];
      const nA = topology.nodes[face.a];
      const nB = topology.nodes[face.b];
      const nC = topology.nodes[face.c];
      if (nA.isPlinthGroundNode || nB.isPlinthGroundNode || nC.isPlinthGroundNode || fIdx >= plinthStartFaceIdx) {
        face.isPlinthFace = true;
        face.type = "PL";
        if (fIdx >= plinthStartFaceIdx) {
          face.plinthBayIndex = Math.floor((fIdx - plinthStartFaceIdx) / 2);
        }
      }
    }

    // Unify plinth sheathing face groups into rectangular "PL" panels for cutting layout (розкрій)
    const plinthSills = topology.edges.filter(e => e.isPlinthBeam && e.plinthRole === "sill");
    const avgBayW = plinthSills.length > 0 ? plinthSills.reduce((s, e) => s + e.length, 0) / plinthSills.length : 1000;
    const plinthBayAreaM2 = Math.round(((avgBayW * plinthH) / 1_000_000) * 1000) / 1000;

    const domeOnlyFaceGroups = topology.faceGroups.filter(g => g.type !== "PL");
    domeOnlyFaceGroups.push({
      type: "PL",
      count: plinthBayCount,
      color: "#2563EB",
      edges: ["Основа", "Стійка", "Основа"],
      lengths: [Math.round(avgBayW), Math.round(plinthH), Math.round(avgBayW)],
      angles: [90, 90, 90],
      area: plinthBayAreaM2,
      dihedralBevels: [0, 0, 0]
    });
    topology.faceGroups = domeOnlyFaceGroups;
  }

  // Compute dome geometric statistics
  const lengths = topology.edges.map(e => e.length);
  const minBeamLength = Math.min(...lengths);
  const maxBeamLength = Math.max(...lengths);
  const averageBeamLength =
    Math.round((lengths.reduce((sum, v) => sum + v, 0) / lengths.length) * 10) / 10;

  const degrees = topology.nodes.map(n => n.edges.length);

  // Calculate base radius & circumference from boundary nodes
  const boundaryNodes = topology.nodes.filter(n => n.boundary);

  // Exact base semi-axes based on cut plane
  const cutRatio = Math.min(0.99, Math.max(0, Math.abs(cutZ) / radZ));
  const cutScale = Math.sqrt(Math.max(0.01, 1 - cutRatio * cutRatio));
  const targetSemiX = isEllipsoid
    ? radX * (cutType === "1/2" ? 1 : cutScale)
    : radius * (cutType === "1/2" ? 1 : cutScale);
  const targetSemiY = isEllipsoid
    ? radY * (cutType === "1/2" ? 1 : cutScale)
    : radius * (cutType === "1/2" ? 1 : cutScale);

  const baseRadiusMm =
    boundaryNodes.length > 0
      ? boundaryNodes.reduce((sum, n) => sum + Math.hypot(n.position.x, n.position.y), 0) /
        boundaryNodes.length
      : (targetSemiX + targetSemiY) / 2;

  // Floor area: for ellipse = PI * a * b, for circle = PI * r^2
  const floorAreaM2 = isEllipsoid
    ? Math.round((Math.PI * (targetSemiX / 1000) * (targetSemiY / 1000)) * 10) / 10
    : Math.round((Math.PI * Math.pow(baseRadiusMm / 1000, 2)) * 10) / 10;

  // Base circumference: for ellipse use Ramanujan's perimeter formula
  const aM = targetSemiX / 1000;
  const bM = targetSemiY / 1000;
  const baseCircumferenceM = isEllipsoid
    ? Math.round(
        (Math.PI * (3 * (aM + bM) - Math.sqrt((3 * aM + bM) * (aM + 3 * bM)))) * 10
      ) / 10
    : Math.round((2 * Math.PI * (baseRadiusMm / 1000)) * 10) / 10;

  // Surface area sum of all faces
  const domeSurfaceAreaM2 =
    Math.round(
      (topology.faces.reduce((sum, f) => sum + f.area, 0) / 1_000_000) * 10
    ) / 10;

  // Volume:
  // For ellipsoid:
  // Half-ellipsoid (1/2): V = (2/3) * PI * radX * radY * radZ
  // Full ellipsoid (1/1): V = (4/3) * PI * radX * radY * radZ
  // Cap: V = PI * rx * ry * (h/rz)^2 * (rz - h/3)
  const domeCapHeightM = (effectiveHeight - (isPlinthActive ? plinthH : 0)) / 1000;
  const rM = radius / 1000;
  const rxM = radX / 1000;
  const ryM = radY / 1000;
  const rzM = radZ / 1000;

  let capVolumeM3 = 0;
  if (isEllipsoid) {
    if (cutType === "1/2") {
      capVolumeM3 = (2 / 3) * Math.PI * rxM * ryM * rzM;
    } else if (cutType === "1/1") {
      capVolumeM3 = (4 / 3) * Math.PI * rxM * ryM * rzM;
    } else {
      const hNorm = Math.min(2 * rzM, Math.max(0.05, domeCapHeightM));
      capVolumeM3 = Math.PI * rxM * ryM * Math.pow(hNorm / rzM, 2) * (rzM - hNorm / 3);
    }
  } else {
    if (cutType === "1/1") {
      capVolumeM3 = (4 / 3) * Math.PI * Math.pow(rM, 3);
    } else {
      capVolumeM3 = (Math.PI * Math.pow(domeCapHeightM, 2) / 3) * (3 * rM - domeCapHeightM);
    }
  }
  const plinthVolM3 = isPlinthActive ? floorAreaM2 * (plinthH / 1000) : 0;
  const domeVolumeM3 = Math.round((Math.max(0, capVolumeM3) + plinthVolM3) * 10) / 10;

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
    baseRadiusMm: Math.round(baseRadiusMm),
    plinthBayCount: isPlinthActive ? plinthBayCount : 0,
    plinthHeightMm: isPlinthActive ? plinthH : 0,
    plinthWallAreaM2: isPlinthActive ? plinthWallAreaM2 : 0
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

  // Compute Tier Leveling and Floor Ring Info
  const tiers: TierInfo[] = [];
  const allTiers = Array.from(
    new Set(topology.nodes.map(n => n.tierLevel).filter((t): t is number => t !== undefined))
  ).sort((a, b) => a - b);

  for (const t of allTiers) {
    const tierNodes = topology.nodes.filter(n => n.tierLevel === t);
    if (tierNodes.length === 0) continue;
    const zs = tierNodes.map(n => n.position.z);
    const minZ = Math.round(Math.min(...zs) * 10) / 10;
    const maxZ = Math.round(Math.max(...zs) * 10) / 10;
    const avgZ = Math.round((zs.reduce((a, b) => a + b, 0) / zs.length) * 10) / 10;
    const isLeveled = Boolean(effectiveTierLeveling[t]?.enabled || parameters.tierLeveling?.[t]?.enabled);
    const cfg = effectiveTierLeveling[t] || parameters.tierLeveling?.[t];
    tiers.push({
      level: t,
      nodeIds: tierNodes.map(n => n.id),
      nodeCount: tierNodes.length,
      minZ,
      maxZ,
      avgZ,
      isLeveled,
      leveledZ: isLeveled ? avgZ : undefined,
      referenceNodeId: cfg?.referenceNodeId,
      referenceNodeLabel:
        cfg?.referenceNodeId !== undefined ? topology.nodes[cfg.referenceNodeId]?.label : undefined,
      heightSpreadMm: Math.round((maxZ - minZ) * 10) / 10
    });
  }

  return {
    parameters: {
      ...parameters,
      tierLeveling: effectiveTierLeveling,
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
    },
    tiers
  };
}
