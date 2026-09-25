import {
  DomeModel,
  Node,
  Edge,
  Vec3,
  ConnectorGeometry,
  ConnectorBeam,
  ConnectorParams,
  ConnectorTypeSummary,
  ConnectorRayAngleDetail
} from "./types";
import { angleBetween, dot, normalize, sub, cross, length } from "./math";

export const DEFAULT_CONNECTOR_PARAMS: ConnectorParams = {
  type: "star_plate",
  hubDiameter: 140, // mm center core (20 - 300 mm)
  tabLength: 95, // mm ray/tab length (20 - 300 mm)
  tabWidth: 45, // mm ray/tab width (20 - 150 mm)
  thickness: 4.0, // mm steel plate
  boltDiameter: 10, // M10
  boltDistance: 35, // mm
  boltHoleCount: 2,
  centerCutout: "lightning", // Thunder Domes style lightning bolt cutout
  material: "steel_st3"
};

export function calculateConnector(
  model: DomeModel,
  nodeId: number
): ConnectorGeometry {
  const node = model.nodes.find(n => n.id === nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} not found`);
  }

  // 1. Calculate true outward surface normal from adjacent face normals
  let avgNx = 0, avgNy = 0, avgNz = 0;
  let faceCount = 0;
  for (const f of model.faces) {
    if (f.a === nodeId || f.b === nodeId || f.c === nodeId) {
      avgNx += f.normal.x;
      avgNy += f.normal.y;
      avgNz += f.normal.z;
      faceCount++;
    }
  }

  let normal: Vec3;
  if (faceCount > 0 && Math.hypot(avgNx, avgNy, avgNz) > 0.01) {
    normal = normalize({ x: avgNx, y: avgNy, z: avgNz });
  } else {
    // Fallback outward from apex or node position
    normal = normalize({ x: node.position.x, y: node.position.y, z: Math.max(10, node.position.z) });
  }

  // 2. Reference tangent vectors (refU, refV)
  let refU: Vec3;
  let refV: Vec3;

  if (node.boundary) {
    // For base boundary nodes, align refU with the horizontal base ring tangent
    const psi = Math.atan2(node.position.y, node.position.x);
    refU = normalize({ x: -Math.sin(psi), y: Math.cos(psi), z: 0 });
    refV = normalize(cross(normal, refU));
    if (refV.z < 0) {
      refV = { x: -refV.x, y: -refV.y, z: -refV.z };
      refU = { x: -refU.x, y: -refU.y, z: -refU.z };
    }
  } else {
    // For internal nodes
    refU = normalize(cross(normal, { x: 0, y: 0, z: 1 }));
    if (length(refU) < 0.1) {
      refU = normalize(cross(normal, { x: 0, y: 1, z: 0 }));
    }
    refV = normalize(cross(normal, refU));
  }

  // 3. Connected beams with 3D orientation, horizon pitch, and press-brake bend angle
  const beams: ConnectorBeam[] = node.edges.map(edgeId => {
    const edge = model.edges[edgeId];
    const otherNodeId = edge.start === node.id ? edge.end : edge.start;
    const otherNode = model.nodes[otherNodeId];

    const dir = normalize(sub(otherNode.position, node.position));

    // Angle to horizon (Z plane)
    const angleToHorizon =
      Math.round(
        (Math.asin(Math.max(-1, Math.min(1, dir.z))) * 180 / Math.PI) * 10
      ) / 10;

    // Azimuth angle in XY plane
    let azimuth = (Math.atan2(dir.y, dir.x) * 180) / Math.PI;
    if (azimuth < 0) azimuth += 360;

    // Press brake bend angle (angle between beam axis and hub plane)
    const dotNorm = Math.max(-1, Math.min(1, dot(dir, normal)));
    const bendAngle = Math.round(Math.abs(Math.asin(dotNorm) * 180 / Math.PI) * 10) / 10;

    // Project onto local tangent plate (u, v)
    const u = dot(dir, refU);
    const v = dot(dir, refV);
    let ang = (Math.atan2(v, u) * 180) / Math.PI;
    if (!node.boundary && ang < 0) ang += 360;

    return {
      edgeId,
      direction: dir,
      length: edge.length,
      beamType: edge.type,
      angleToHorizon,
      azimuthAngle: Math.round(azimuth * 10) / 10,
      bendAngle: bendAngle || 8.0,
      planarAngle: ang
    } as any;
  });

  // Sort beams by planar angle
  beams.sort((a: any, b: any) => a.planarAngle - b.planarAngle);

  // If node is boundary, normalize planar angles to range [0, 180] from right to left
  if (node.boundary && beams.length > 0) {
    const minAng = Math.min(...beams.map((b: any) => b.planarAngle));
    beams.forEach((b: any) => {
      b.planarAngle = b.planarAngle - minAng;
    });
  }

  // 4. Compute angular separations between adjacent beams
  const angles: ConnectorGeometry["angles"] = [];
  const count = node.boundary ? beams.length - 1 : beams.length;

  for (let i = 0; i < count; i++) {
    const nextIdx = (i + 1) % beams.length;
    const a = beams[i];
    const b = beams[nextIdx];

    const angle = Math.round(angleBetween(a.direction, b.direction) * 10) / 10;
    angles.push({
      edgeA: a.edgeId,
      edgeB: b.edgeId,
      angle
    });
  }

  return {
    nodeId,
    position: node.position,
    beams,
    angles,
    beamCount: beams.length,
    isBoundary: !!node.boundary
  };
}

/**
 * Groups all nodes in the dome into unique manufacturing connector bracket types
 * with complete angular calculations for CNC laser cutting and press-brake bending.
 */
export function classifyConnectorTypes(
  model: DomeModel,
  params: ConnectorParams = DEFAULT_CONNECTOR_PARAMS
): ConnectorTypeSummary[] {
  const groupsMap = new Map<string, { nodeIds: number[]; sampleNodeId: number }>();

  for (const node of model.nodes) {
    const conn = calculateConnector(model, node.id);
    const rayCount = conn.beams.length;
    const types = conn.beams.map(b => b.beamType).sort().join("-");
    const isBoundary = !!node.boundary;
    const key = `${rayCount}R_${isBoundary ? "BASE" : "DOME"}_${types}`;

    if (!groupsMap.has(key)) {
      groupsMap.set(key, { nodeIds: [], sampleNodeId: node.id });
    }
    groupsMap.get(key)!.nodeIds.push(node.id);
  }

  const summaries: ConnectorTypeSummary[] = [];
  let hexCounter = 1;
  let baseCounter = 1;

  for (const [key, data] of groupsMap.entries()) {
    const sampleConn = calculateConnector(model, data.sampleNodeId);
    const rayCount = sampleConn.beams.length;
    const isBase = sampleConn.isBoundary;

    let typeName = "";
    if (isBase) {
      typeName = `${rayCount}-променевий Опорний основи (Base Bracket #${baseCounter++})`;
    } else if (rayCount === 5) {
      typeName = "5-променевий Apex / Пентагон (5-Way Star)";
    } else if (rayCount === 6) {
      typeName = `6-променевий Гексагон (6-Way Star #${hexCounter++})`;
    } else {
      typeName = `${rayCount}-променевий Вузол купола`;
    }

    const rayDetails: ConnectorRayAngleDetail[] = [];
    const beams = sampleConn.beams;

    for (let i = 0; i < beams.length; i++) {
      const bCur = beams[i];
      const pCur = (bCur as any).planarAngle || 0;

      let planarDelta = 0;
      let spatialAng = 0;

      if (i < beams.length - 1 || !isBase) {
        const nextIdx = (i + 1) % beams.length;
        const bNext = beams[nextIdx];
        let pNext = (bNext as any).planarAngle || 0;
        if (pNext < pCur && !isBase) pNext += 360;
        planarDelta = Math.round(Math.abs(pNext - pCur) * 10) / 10;

        spatialAng =
          sampleConn.angles.find(
            a =>
              (a.edgeA === bCur.edgeId && a.edgeB === bNext.edgeId) ||
              (a.edgeA === bNext.edgeId && a.edgeB === bCur.edgeId)
          )?.angle || planarDelta;
      }

      rayDetails.push({
        rayIndex: i + 1,
        edgeId: bCur.edgeId,
        beamType: bCur.beamType,
        planarAngleDeg: Math.round(pCur * 10) / 10,
        planarDeltaToNextDeg: planarDelta,
        spatialAngleToNextDeg: spatialAng,
        bendAngleDeg: (bCur as any).bendAngle || 8.5,
        pitchToHorizonDeg: bCur.angleToHorizon
      });
    }

    summaries.push({
      typeId: key,
      name: typeName,
      rayCount,
      isBoundary: isBase,
      countInDome: data.nodeIds.length,
      nodeIds: data.nodeIds,
      beamSignature: beams.map(b => b.beamType).join(" - "),
      sampleNodeId: data.sampleNodeId,
      sampleConnector: sampleConn,
      rayDetails
    });
  }

  // Sort summaries: Apex 5-way first, then 6-way Hexagons, then Base Footings
  summaries.sort((a, b) => {
    if (a.isBoundary !== b.isBoundary) return a.isBoundary ? 1 : -1;
    if (a.rayCount !== b.rayCount) return b.rayCount - a.rayCount;
    return b.countInDome - a.countInDome;
  });

  return summaries;
}

export interface ConnectorCutGeometry {
  nodeId: number;
  beamCount: number;
  outerRadius: number; // mm
  hubRadius: number; // mm
  tabLength: number; // mm
  tabWidth: number; // mm
  contourPath: string; // SVG path d attribute
  boltHoles: { x: number; y: number; diameter: number; edgeId: number; type: string }[];
  centerHole?: { x: number; y: number; diameter: number };
  centerCutoutPath?: string; // Lightning bolt cutout
  bendLines: { x1: number; y1: number; x2: number; y2: number }[];
  centerAxes: { x1: number; y1: number; x2: number; y2: number; angleDeg: number; rayIndex: number }[];
  interRayAngles: {
    fromAngleDeg: number;
    toAngleDeg: number;
    deltaAngleDeg: number;
    arcPath: string;
    textX: number;
    textY: number;
    fromRayIndex: number;
    toRayIndex: number;
  }[];
  rayLabels: { x: number; y: number; text: string; angleDeg: number; bendDeg: number }[];
  isBoundary: boolean;
}

/**
 * Computes 2D laser-cut flat pattern matching Thunder Domes star hub brackets:
 * - Full 360° closed contour for dome hubs (Apex & Hexagons)
 * - Flat bottom sill flange with anchor holes for Base Brackets
 * - Centerlines and inter-ray dimension arcs (no floor gap arcs!)
 */
export function generateConnectorCutPattern(
  connector: ConnectorGeometry,
  params: ConnectorParams = DEFAULT_CONNECTOR_PARAMS
): ConnectorCutGeometry {
  const hubDiam = Math.max(20, Math.min(300, params.hubDiameter || 140));
  const tabLen = Math.max(20, Math.min(300, params.tabLength || 90));
  const tabW = Math.max(20, Math.min(150, params.tabWidth || 45));

  const hubRadius = hubDiam / 2;
  const rayCount = connector.beams.length;
  const totalRadius = hubRadius + tabLen;
  const tabHalfW = tabW / 2;
  const isBase = !!connector.isBoundary;

  const boltHoles: ConnectorCutGeometry["boltHoles"] = [];
  const bendLines: ConnectorCutGeometry["bendLines"] = [];
  const rayLabels: ConnectorCutGeometry["rayLabels"] = [];
  const centerAxes: ConnectorCutGeometry["centerAxes"] = [];
  const interRayAngles: ConnectorCutGeometry["interRayAngles"] = [];

  // Center lightning cutout
  const lightningScale = Math.max(0.6, Math.min(2.5, hubRadius / 35));
  const centerCutoutPath = `M ${3 * lightningScale} ${-16 * lightningScale} L ${-9 * lightningScale} ${2 * lightningScale} L ${0 * lightningScale} ${2 * lightningScale} L ${-4 * lightningScale} ${16 * lightningScale} L ${10 * lightningScale} ${-2 * lightningScale} L ${1 * lightningScale} ${-2 * lightningScale} Z`;

  const sortedBeams = connector.beams;

  // Process each ray tab
  for (let i = 0; i < rayCount; i++) {
    const beam = sortedBeams[i];
    const rad = (((beam as any).planarAngle || (i * 360) / rayCount) * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const perpX = -sinA;
    const perpY = cosA;

    // Bolt holes along ray
    const holeCount = tabLen < 45 ? 1 : (params.boltHoleCount || 2);
    if (holeCount === 1) {
      const hDist = hubRadius + tabLen * 0.55;
      boltHoles.push({
        x: cosA * hDist,
        y: sinA * hDist,
        diameter: params.boltDiameter || 10,
        edgeId: beam.edgeId,
        type: beam.beamType
      });
    } else if (holeCount === 2) {
      const h1Dist = hubRadius + tabLen * 0.35;
      const h2Dist = hubRadius + tabLen * 0.75;
      boltHoles.push({
        x: cosA * h1Dist,
        y: sinA * h1Dist,
        diameter: params.boltDiameter || 10,
        edgeId: beam.edgeId,
        type: beam.beamType
      });
      boltHoles.push({
        x: cosA * h2Dist,
        y: sinA * h2Dist,
        diameter: params.boltDiameter || 10,
        edgeId: beam.edgeId,
        type: beam.beamType
      });
    } else {
      const h1Dist = hubRadius + tabLen * 0.25;
      const h2Dist = hubRadius + tabLen * 0.55;
      const h3Dist = hubRadius + tabLen * 0.85;
      for (const d of [h1Dist, h2Dist, h3Dist]) {
        boltHoles.push({
          x: cosA * d,
          y: sinA * d,
          diameter: params.boltDiameter || 10,
          edgeId: beam.edgeId,
          type: beam.beamType
        });
      }
    }

    // Bend line at tab root
    bendLines.push({
      x1: cosA * hubRadius - perpX * tabHalfW,
      y1: sinA * hubRadius - perpY * tabHalfW,
      x2: cosA * hubRadius + perpX * tabHalfW,
      y2: sinA * hubRadius + perpY * tabHalfW
    });

    // Label for ray
    const bendDeg = (beam as any).bendAngle || 8.0;
    rayLabels.push({
      x: cosA * (totalRadius + 18),
      y: sinA * (totalRadius + 18),
      text: `${beam.beamType} (${bendDeg}°)`,
      angleDeg: Math.round((beam as any).planarAngle || (i * 360) / rayCount),
      bendDeg
    });

    // Centerline from center past outer tip
    centerAxes.push({
      x1: 0,
      y1: 0,
      x2: cosA * (totalRadius + 16),
      y2: sinA * (totalRadius + 16),
      angleDeg: Math.round(((beam as any).planarAngle || (i * 360) / rayCount) * 10) / 10,
      rayIndex: i + 1
    });

    // Dimension arc to next ray (DO NOT loop across ground floor for base brackets!)
    if (!isBase || i < rayCount - 1) {
      const nextBeam = sortedBeams[(i + 1) % rayCount];
      const ang1 = (beam as any).planarAngle || (i * 360) / rayCount;
      let ang2 = (nextBeam as any).planarAngle || (((i + 1) % rayCount) * 360) / rayCount;
      if (!isBase && ang2 <= ang1) ang2 += 360;

      const deltaAngle = Math.round(Math.abs(ang2 - ang1) * 10) / 10;

      // Only draw dimension arc if separation is reasonable
      if (deltaAngle > 5 && deltaAngle < 170) {
        const rArc = hubRadius + Math.max(12, Math.min(42, tabLen * 0.45));
        const rad1 = (ang1 * Math.PI) / 180;
        const rad2 = (ang2 * Math.PI) / 180;

        const sx = Math.cos(rad1) * rArc;
        const sy = Math.sin(rad1) * rArc;
        const ex = Math.cos(rad2) * rArc;
        const ey = Math.sin(rad2) * rArc;

        const arcPath = `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${rArc.toFixed(2)} ${rArc.toFixed(2)} 0 0 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;

        const midAngleRad = ((ang1 + ang2) / 2) * (Math.PI / 180);
        const rText = rArc + 13;
        const textX = Math.cos(midAngleRad) * rText;
        const textY = Math.sin(midAngleRad) * rText;

        interRayAngles.push({
          fromAngleDeg: ang1,
          toAngleDeg: ang2,
          deltaAngleDeg: deltaAngle,
          arcPath,
          textX,
          textY,
          fromRayIndex: i + 1,
          toRayIndex: ((i + 1) % rayCount) + 1
        });
      }
    }
  }

  // Precompute corner points for outer contour
  interface RayPoints {
    rxL: { x: number; y: number };
    txL: { x: number; y: number };
    txR: { x: number; y: number };
    rxR: { x: number; y: number };
    vX: number;
    vY: number;
  }

  const rayPoints: RayPoints[] = [];

  for (let i = 0; i < rayCount; i++) {
    const beam = sortedBeams[i];
    const nextBeam = sortedBeams[(i + 1) % rayCount];
    const rad = (((beam as any).planarAngle || (i * 360) / rayCount) * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const perpX = -sinA;
    const perpY = cosA;

    const rxL = { x: cosA * hubRadius - perpX * tabHalfW, y: sinA * hubRadius - perpY * tabHalfW };
    const rxR = { x: cosA * hubRadius + perpX * tabHalfW, y: sinA * hubRadius + perpY * tabHalfW };
    const txL = { x: cosA * totalRadius - perpX * tabHalfW, y: sinA * totalRadius - perpY * tabHalfW };
    const txR = { x: cosA * totalRadius + perpX * tabHalfW, y: sinA * totalRadius + perpY * tabHalfW };

    const angCur = (beam as any).planarAngle || (i * 360) / rayCount;
    let angNext = (nextBeam as any).planarAngle || (((i + 1) % rayCount) * 360) / rayCount;
    if (!isBase && angNext <= angCur) angNext += 360;
    const midAngleRad = ((angCur + angNext) / 2) * (Math.PI / 180);

    const valleyR = Math.max(15, hubRadius * 0.72);
    const vX = Math.cos(midAngleRad) * valleyR;
    const vY = Math.sin(midAngleRad) * valleyR;

    rayPoints.push({ rxL, txL, txR, rxR, vX, vY });
  }

  // Construct closed CNC laser-cutting outer curve
  let d = "";

  if (isBase) {
    // BASE BRACKET: Flat bottom horizontal sill flange resting on foundation
    const first = rayPoints[0];
    const last = rayPoints[rayCount - 1];
    const sillY = -hubRadius * 0.45;

    // Foundation anchor bolt holes on bottom sill
    boltHoles.push({
      x: -hubRadius * 0.5,
      y: sillY * 0.4,
      diameter: params.boltDiameter || 10,
      edgeId: -1,
      type: "Anchor"
    });
    boltHoles.push({
      x: hubRadius * 0.5,
      y: sillY * 0.4,
      diameter: params.boltDiameter || 10,
      edgeId: -2,
      type: "Anchor"
    });

    // Start at bottom sill left
    d += `M ${(-hubRadius * 0.85).toFixed(2)} ${sillY.toFixed(2)} `;
    // Up to first ray tab left root
    d += `L ${first.rxL.x.toFixed(2)} ${first.rxL.y.toFixed(2)} `;

    for (let i = 0; i < rayCount; i++) {
      const cur = rayPoints[i];
      d += `L ${cur.txL.x.toFixed(2)} ${cur.txL.y.toFixed(2)} `;
      d += `L ${cur.txR.x.toFixed(2)} ${cur.txR.y.toFixed(2)} `;
      d += `L ${cur.rxR.x.toFixed(2)} ${cur.rxR.y.toFixed(2)} `;

      if (i < rayCount - 1) {
        const next = rayPoints[i + 1];
        d += `Q ${cur.vX.toFixed(2)} ${cur.vY.toFixed(2)}, ${next.rxL.x.toFixed(2)} ${next.rxL.y.toFixed(2)} `;
      }
    }

    // Down from last ray right root to bottom sill right
    d += `L ${(hubRadius * 0.85).toFixed(2)} ${sillY.toFixed(2)} `;
    // Straight horizontal line along foundation sill back to start
    d += `Z`;
  } else {
    // DOME INTERNAL HUB (Apex & Hexagons): Full 360° closed star
    for (let i = 0; i < rayCount; i++) {
      const cur = rayPoints[i];
      const next = rayPoints[(i + 1) % rayCount];

      if (i === 0) {
        d += `M ${cur.rxL.x.toFixed(2)} ${cur.rxL.y.toFixed(2)} `;
      }

      d += `L ${cur.txL.x.toFixed(2)} ${cur.txL.y.toFixed(2)} `;
      d += `L ${cur.txR.x.toFixed(2)} ${cur.txR.y.toFixed(2)} `;
      d += `L ${cur.rxR.x.toFixed(2)} ${cur.rxR.y.toFixed(2)} `;
      d += `Q ${cur.vX.toFixed(2)} ${cur.vY.toFixed(2)}, ${next.rxL.x.toFixed(2)} ${next.rxL.y.toFixed(2)} `;
    }
    d += "Z";
  }

  return {
    nodeId: connector.nodeId,
    beamCount: rayCount,
    outerRadius: totalRadius + 28,
    hubRadius,
    tabLength: tabLen,
    tabWidth: tabW,
    contourPath: d,
    boltHoles,
    centerCutoutPath,
    bendLines,
    centerAxes,
    interRayAngles,
    rayLabels,
    isBoundary: isBase
  };
}
