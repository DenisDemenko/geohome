import { DomeModel, Node } from "./types";

export type FoundationType = "strip" | "pile" | "slab";

export interface StripFoundationParams {
  /** Offset from anchor node center towards dome interior in mm (100 - 500 mm) */
  innerOffsetMm: number;
  /** Offset from anchor node center towards dome exterior in mm (100 - 500 mm) */
  outerOffsetMm: number;
  /** Underground foundation strip depth in mm */
  depthMm: number;
  /** Above-ground plinth height in mm */
  plinthHeightMm: number;
  /** Concrete strength class */
  concreteClass: "B15" | "B20" | "B25" | "B30";
  /** Longitudinal reinforcement bar diameter in mm */
  rebarDiameter: 10 | 12 | 14 | 16;
  /** Number of longitudinal bars (4 or 6) */
  rebarBarsCount: 4 | 6;
}

export interface PileFoundationParams {
  pileType: "screw" | "bored";
  diameterMm: number;
  depthMm: number;
  capPlateSizeMm: number;
  capPlateThicknessMm: number;
  hasCenterPile: boolean;
  sillBeamWidthMm: number;
  sillBeamHeightMm: number;
}

export interface SlabFoundationParams {
  shape: "polygon" | "circle";
  overhangMm: number;
  thicknessMm: number;
  gravelBedDepthMm: number;
  insulationThicknessMm: number;
  meshStepMm: number;
  rebarDiameter: 10 | 12 | 14;
}

export interface AnchorBoltParams {
  diameter: "M12" | "M16" | "M20" | "M24";
  studCount: 1 | 2 | 4;
  embedmentDepthMm: number;
  projectionHeightMm: number;
  steelGrade: "5.8" | "8.8";
  plateSizeMm: number;
}

export interface FoundationBaseNode {
  index: number;
  nodeId: number;
  x: number;
  y: number;
  radius: number;
  azimuthDeg: number;
  deltaAngleDeg: number;
  chordToNextMm: number;
  chordToPrevMm: number;
  diagonalCheckMm: number;
  oppositeNodeIndex: number;
}

export interface FormworkSegment {
  index: number;
  fromNode: number;
  toNode: number;
  innerStart: { x: number; y: number };
  innerEnd: { x: number; y: number };
  outerStart: { x: number; y: number };
  outerEnd: { x: number; y: number };
  innerLengthMm: number;
  outerLengthMm: number;
  chordLengthMm: number;
  miterAngleDeg: number;
}

export interface FoundationLayoutCalculation {
  center: { x: number; y: number };
  baseRadiusMm: number;
  baseDiameterMm: number;
  nodesCount: number;
  nodes: FoundationBaseNode[];
  baseCircumferenceMm: number;
  foundationType: FoundationType;
  stripParams: StripFoundationParams;
  pileParams: PileFoundationParams;
  slabParams: SlabFoundationParams;
  anchorParams: AnchorBoltParams;

  stripGeometry?: {
    innerPolygon: { x: number; y: number }[];
    outerPolygon: { x: number; y: number }[];
    segments: FormworkSegment[];
    totalWidthMm: number;
    areaM2: number;
    concreteVolumeM3: number;
    formworkAreaM2: number;
    rebarTotalLengthM: number;
    rebarWeightKg: number;
    stirrupsCount: number;
    stirrupsWeightKg: number;
  };

  pileGeometry?: {
    piles: {
      index: number;
      x: number;
      y: number;
      radius: number;
      azimuthDeg: number;
      isCenter?: boolean;
    }[];
    totalPilesCount: number;
    drillingDepthTotalM: number;
    concreteVolumeM3: number;
    timberSillVolumeM3: number;
    timberTotalLengthM: number;
  };

  slabGeometry?: {
    polygon: { x: number; y: number }[];
    radiusMm: number;
    areaM2: number;
    concreteVolumeM3: number;
    perimeterM: number;
    formworkAreaM2: number;
    rebarTotalLengthM: number;
    rebarWeightKg: number;
    gravelVolumeM3: number;
    insulationVolumeM3: number;
  };

  anchorSchedule: {
    totalAnchorsCount: number;
    boltType: string;
    studsTotal: number;
    tensileCapacityKn: number;
    shearCapacityKn: number;
    nodes: {
      nodeIndex: number;
      x: number;
      y: number;
      azimuth: number;
    }[];
  };
}

export const DEFAULT_STRIP_PARAMS: StripFoundationParams = {
  innerOffsetMm: 200,
  outerOffsetMm: 200,
  depthMm: 800,
  plinthHeightMm: 300,
  concreteClass: "B20",
  rebarDiameter: 12,
  rebarBarsCount: 4
};

export const DEFAULT_PILE_PARAMS: PileFoundationParams = {
  pileType: "screw",
  diameterMm: 108,
  depthMm: 2500,
  capPlateSizeMm: 200,
  capPlateThicknessMm: 8,
  hasCenterPile: false,
  sillBeamWidthMm: 150,
  sillBeamHeightMm: 150
};

export const DEFAULT_SLAB_PARAMS: SlabFoundationParams = {
  shape: "polygon",
  overhangMm: 200,
  thicknessMm: 200,
  gravelBedDepthMm: 200,
  insulationThicknessMm: 100,
  meshStepMm: 200,
  rebarDiameter: 12
};

export const DEFAULT_ANCHOR_PARAMS: AnchorBoltParams = {
  diameter: "M16",
  studCount: 2,
  embedmentDepthMm: 250,
  projectionHeightMm: 80,
  steelGrade: "8.8",
  plateSizeMm: 160
};

/**
 * Line intersection helper for 2D line segments / infinite lines
 */
function lineIntersection(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number }
): { x: number; y: number } {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-6) {
    return { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  }
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
  return {
    x: p1.x + t * (p2.x - p1.x),
    y: p1.y + t * (p2.y - p1.y)
  };
}

/**
 * 2D Polygon area via shoelace formula
 */
function polygonArea(points: { x: number; y: number }[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Extract and order the base perimeter nodes from the dome model.
 * Calculates polar coordinates (azimuth angles from apex projection, radii, chord lengths, and diagonal checks).
 */
export function calculateFoundationLayout(
  model: DomeModel,
  foundationType: FoundationType = "strip",
  stripParams: StripFoundationParams = DEFAULT_STRIP_PARAMS,
  pileParams: PileFoundationParams = DEFAULT_PILE_PARAMS,
  slabParams: SlabFoundationParams = DEFAULT_SLAB_PARAMS,
  anchorParams: AnchorBoltParams = DEFAULT_ANCHOR_PARAMS
): FoundationLayoutCalculation {
  // Find min Z in dome (foundation base horizon plane)
  let minZ = Infinity;
  for (const n of model.nodes) {
    if (n.position.z < minZ) minZ = n.position.z;
  }

  // Filter base ground nodes (within 8mm of base horizon, or boundary nodes)
  const groundNodes = model.nodes.filter(
    n => n.boundary || Math.abs(n.position.z - minZ) < 8
  );

  // Fallback to all nodes if dome is single plane or test fixture
  const candidateNodes = groundNodes.length >= 3 ? groundNodes : model.nodes;

  // Center apex projection: (0, 0)
  const center = { x: 0, y: 0 };

  // Sort nodes in counter-clockwise order by polar azimuth angle
  const sorted = [...candidateNodes].map(node => {
    const angleRad = Math.atan2(node.position.y, node.position.x);
    const angleDeg = (angleRad * 180) / Math.PI;
    const azimuth = (angleDeg + 360) % 360;
    const radius = Math.hypot(node.position.x, node.position.y);
    return {
      node,
      azimuth,
      radius
    };
  });

  sorted.sort((a, b) => a.azimuth - b.azimuth);

  const N = sorted.length;
  const baseNodes: FoundationBaseNode[] = [];
  let baseCircumferenceMm = 0;

  for (let i = 0; i < N; i++) {
    const curr = sorted[i];
    const next = sorted[(i + 1) % N];
    const prev = sorted[(i - 1 + N) % N];

    const chordNext = Math.hypot(
      next.node.position.x - curr.node.position.x,
      next.node.position.y - curr.node.position.y
    );
    const chordPrev = Math.hypot(
      curr.node.position.x - prev.node.position.x,
      curr.node.position.y - prev.node.position.y
    );

    baseCircumferenceMm += chordNext;

    let deltaAngle = next.azimuth - curr.azimuth;
    if (deltaAngle < 0) deltaAngle += 360;

    // Opposite node index for cross-diagonal verification measurement
    const oppIdx = (i + Math.floor(N / 2)) % N;
    const oppNode = sorted[oppIdx];
    const diagCheck = Math.hypot(
      oppNode.node.position.x - curr.node.position.x,
      oppNode.node.position.y - curr.node.position.y
    );

    baseNodes.push({
      index: i + 1,
      nodeId: curr.node.id,
      x: Math.round(curr.node.position.x),
      y: Math.round(curr.node.position.y),
      radius: Math.round(curr.radius),
      azimuthDeg: Math.round(curr.azimuth * 100) / 100,
      deltaAngleDeg: Math.round(deltaAngle * 100) / 100,
      chordToNextMm: Math.round(chordNext),
      chordToPrevMm: Math.round(chordPrev),
      diagonalCheckMm: Math.round(diagCheck),
      oppositeNodeIndex: oppIdx + 1
    });
  }

  const avgRadius =
    baseNodes.reduce((sum, n) => sum + n.radius, 0) / Math.max(1, baseNodes.length);

  // 1. STRIP FOUNDATION GEOMETRY CALCULATION (Стрічковий фундамент з опалубкою)
  const segments: FormworkSegment[] = [];
  const innerPoly: { x: number; y: number }[] = [];
  const outerPoly: { x: number; y: number }[] = [];

  const innerLines: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];
  const outerLines: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];

  for (let i = 0; i < N; i++) {
    const p1 = baseNodes[i];
    const p2 = baseNodes[(i + 1) % N];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);

    // Tangent vector
    const tx = dx / len;
    const ty = dy / len;

    // Normal vector pointing inward towards center (0, 0)
    // For counter-clockwise polygon, inward normal is (-ty, tx)
    let inNx = -ty;
    let inNy = tx;
    // Verify it points towards center
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    if (inNx * -midX + inNy * -midY < 0) {
      inNx = -inNx;
      inNy = -inNy;
    }
    const outNx = -inNx;
    const outNy = -inNy;

    // Offset parallel lines for inner and outer formwork
    innerLines.push({
      p1: { x: p1.x + inNx * stripParams.innerOffsetMm, y: p1.y + inNy * stripParams.innerOffsetMm },
      p2: { x: p2.x + inNx * stripParams.innerOffsetMm, y: p2.y + inNy * stripParams.innerOffsetMm }
    });

    outerLines.push({
      p1: { x: p1.x + outNx * stripParams.outerOffsetMm, y: p1.y + outNy * stripParams.outerOffsetMm },
      p2: { x: p2.x + outNx * stripParams.outerOffsetMm, y: p2.y + outNy * stripParams.outerOffsetMm }
    });
  }

  // Intersect adjacent offset lines to obtain precise mitered corners
  for (let i = 0; i < N; i++) {
    const prev = (i - 1 + N) % N;
    const innerCorner = lineIntersection(
      innerLines[prev].p1,
      innerLines[prev].p2,
      innerLines[i].p1,
      innerLines[i].p2
    );
    const outerCorner = lineIntersection(
      outerLines[prev].p1,
      outerLines[prev].p2,
      outerLines[i].p1,
      outerLines[i].p2
    );
    innerPoly.push({ x: Math.round(innerCorner.x), y: Math.round(innerCorner.y) });
    outerPoly.push({ x: Math.round(outerCorner.x), y: Math.round(outerCorner.y) });
  }

  // Calculate formwork segment board lengths
  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    const inStart = innerPoly[i];
    const inEnd = innerPoly[next];
    const outStart = outerPoly[i];
    const outEnd = outerPoly[next];

    const inLen = Math.hypot(inEnd.x - inStart.x, inEnd.y - inStart.y);
    const outLen = Math.hypot(outEnd.x - outStart.x, outEnd.y - outStart.y);
    const chordLen = baseNodes[i].chordToNextMm;

    // Corner miter cut angle
    const miterAngle = 90 - (180 / N);

    segments.push({
      index: i + 1,
      fromNode: baseNodes[i].index,
      toNode: baseNodes[next].index,
      innerStart: inStart,
      innerEnd: inEnd,
      outerStart: outStart,
      outerEnd: outEnd,
      innerLengthMm: Math.round(inLen),
      outerLengthMm: Math.round(outLen),
      chordLengthMm: chordLen,
      miterAngleDeg: Math.round(miterAngle * 10) / 10
    });
  }

  const outerAreaM2 = polygonArea(outerPoly) / 1_000_000;
  const innerAreaM2 = polygonArea(innerPoly) / 1_000_000;
  const stripAreaM2 = Math.max(0, outerAreaM2 - innerAreaM2);
  const totalStripHeightM = (stripParams.depthMm + stripParams.plinthHeightMm) / 1000;
  const stripConcreteVolumeM3 = Math.round(stripAreaM2 * totalStripHeightM * 100) / 100;

  const innerPerimeterM = segments.reduce((sum, s) => sum + s.innerLengthMm, 0) / 1000;
  const outerPerimeterM = segments.reduce((sum, s) => sum + s.outerLengthMm, 0) / 1000;
  const formworkAreaM2 =
    Math.round((innerPerimeterM + outerPerimeterM) * totalStripHeightM * 10) / 10;

  const rebarTotalLengthM =
    Math.round(outerPerimeterM * stripParams.rebarBarsCount * 1.1); // 10% overlap factor
  const rebarWeightKg =
    Math.round(
      rebarTotalLengthM * (0.00617 * stripParams.rebarDiameter * stripParams.rebarDiameter)
    );
  const stirrupsCount = Math.round((outerPerimeterM / 0.3) * 1.05); // every 300 mm
  const singleStirrupLenM =
    ((stripParams.innerOffsetMm + stripParams.outerOffsetMm) * 2 +
      (stripParams.depthMm + stripParams.plinthHeightMm) * 2) /
    1000;
  const stirrupsWeightKg = Math.round(stirrupsCount * singleStirrupLenM * 0.395); // 8mm rebar

  // 2. PILE FOUNDATION GEOMETRY (Пальовий фундамент)
  const piles = baseNodes.map(n => ({
    index: n.index,
    x: n.x,
    y: n.y,
    radius: n.radius,
    azimuthDeg: n.azimuthDeg,
    isCenter: false
  }));

  if (pileParams.hasCenterPile) {
    piles.push({
      index: piles.length + 1,
      x: 0,
      y: 0,
      radius: 0,
      azimuthDeg: 0,
      isCenter: true
    });
  }

  const totalPilesCount = piles.length;
  const drillingDepthTotalM = Math.round((totalPilesCount * pileParams.depthMm) / 1000);
  const singlePileVolumeM3 =
    Math.PI * Math.pow(pileParams.diameterMm / 2000, 2) * (pileParams.depthMm / 1000);
  const pileConcreteVolumeM3 =
    pileParams.pileType === "bored"
      ? Math.round(totalPilesCount * singlePileVolumeM3 * 100) / 100
      : 0;

  const timberTotalLengthM = Math.round(baseCircumferenceMm / 1000 * 1.05); // 5% for joint laps
  const timberSillVolumeM3 =
    Math.round(
      timberTotalLengthM *
        (pileParams.sillBeamWidthMm / 1000) *
        (pileParams.sillBeamHeightMm / 1000) *
        100
    ) / 100;

  // 3. SLAB FOUNDATION GEOMETRY (Суцільна монолітна плита)
  let slabPoly: { x: number; y: number }[] = [];
  let slabAreaM2 = 0;
  let slabRadiusMm = Math.round(avgRadius + slabParams.overhangMm);

  if (slabParams.shape === "circle") {
    slabAreaM2 = Math.round(Math.PI * Math.pow(slabRadiusMm / 1000, 2) * 100) / 100;
    // Sample circle for rendering
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * 2 * Math.PI;
      slabPoly.push({
        x: Math.round(Math.cos(a) * slabRadiusMm),
        y: Math.round(Math.sin(a) * slabRadiusMm)
      });
    }
  } else {
    // Polygon contour matching dome perimeter offset outwards by overhangMm
    slabPoly = outerPoly;
    slabAreaM2 = outerAreaM2;
  }

  const slabThicknessM = slabParams.thicknessMm / 1000;
  const slabConcreteVolumeM3 = Math.round(slabAreaM2 * slabThicknessM * 100) / 100;
  const slabPerimeterM = Math.round(2 * Math.PI * (slabRadiusMm / 1000) * 10) / 10;
  const slabFormworkAreaM2 = Math.round(slabPerimeterM * slabThicknessM * 10) / 10;

  const meshLayerBars = Math.round((slabRadiusMm * 2) / slabParams.meshStepMm) * 2;
  const meshLayerLenM = meshLayerBars * (slabRadiusMm * 2 / 1000);
  const slabRebarTotalLengthM = Math.round(meshLayerLenM * 2 * 1.15); // Top + bottom mesh + ties
  const slabRebarWeightKg =
    Math.round(
      slabRebarTotalLengthM * (0.00617 * slabParams.rebarDiameter * slabParams.rebarDiameter)
    );
  const gravelVolumeM3 =
    Math.round(slabAreaM2 * (slabParams.gravelBedDepthMm / 1000) * 100) / 100;
  const insulationVolumeM3 =
    Math.round(slabAreaM2 * (slabParams.insulationThicknessMm / 1000) * 100) / 100;

  // 4. ANCHOR EMBEDDED SYSTEM SCHEDULE (Янкерні закладні вузли)
  const totalAnchorsCount = baseNodes.length;
  const studsTotal = totalAnchorsCount * anchorParams.studCount;

  // Engineering calculation of tensile and shear capacity per anchor stud according to Eurocode
  const dMm = parseInt(anchorParams.diameter.replace("M", ""), 10);
  const asMm2 = Math.PI * Math.pow(dMm * 0.9 / 2, 2);
  const fuk = anchorParams.steelGrade === "8.8" ? 800 : 500;
  const tensileCapacityKn = Math.round(((asMm2 * fuk) / 1.4 / 1000) * 10) / 10;
  const shearCapacityKn = Math.round(((asMm2 * fuk * 0.6) / 1.25 / 1000) * 10) / 10;

  return {
    center,
    baseRadiusMm: Math.round(avgRadius),
    baseDiameterMm: Math.round(avgRadius * 2),
    nodesCount: N,
    nodes: baseNodes,
    baseCircumferenceMm: Math.round(baseCircumferenceMm),
    foundationType,
    stripParams,
    pileParams,
    slabParams,
    anchorParams,

    stripGeometry: {
      innerPolygon: innerPoly,
      outerPolygon: outerPoly,
      segments,
      totalWidthMm: stripParams.innerOffsetMm + stripParams.outerOffsetMm,
      areaM2: Math.round(stripAreaM2 * 100) / 100,
      concreteVolumeM3: stripConcreteVolumeM3,
      formworkAreaM2,
      rebarTotalLengthM,
      rebarWeightKg,
      stirrupsCount,
      stirrupsWeightKg
    },

    pileGeometry: {
      piles,
      totalPilesCount,
      drillingDepthTotalM,
      concreteVolumeM3: pileConcreteVolumeM3,
      timberSillVolumeM3,
      timberTotalLengthM
    },

    slabGeometry: {
      polygon: slabPoly,
      radiusMm: slabRadiusMm,
      areaM2: slabAreaM2,
      concreteVolumeM3: slabConcreteVolumeM3,
      perimeterM: slabPerimeterM,
      formworkAreaM2: slabFormworkAreaM2,
      rebarTotalLengthM: slabRebarTotalLengthM,
      rebarWeightKg: slabRebarWeightKg,
      gravelVolumeM3,
      insulationVolumeM3
    },

    anchorSchedule: {
      totalAnchorsCount,
      boltType: `${anchorParams.diameter} (Клас ${anchorParams.steelGrade}, L=${anchorParams.embedmentDepthMm + anchorParams.projectionHeightMm} мм)`,
      studsTotal,
      tensileCapacityKn: Math.round(tensileCapacityKn * anchorParams.studCount * 10) / 10,
      shearCapacityKn: Math.round(shearCapacityKn * anchorParams.studCount * 10) / 10,
      nodes: baseNodes.map(n => ({
        nodeIndex: n.index,
        x: n.x,
        y: n.y,
        azimuth: n.azimuthDeg
      }))
    }
  };
}

/**
 * Generate standard surveying and layout CSV export for GNSS / Total station devices (Leica, Trimble, Topcon)
 */
export function generateFoundationLayoutCSV(layout: FoundationLayoutCalculation): string {
  const lines: string[] = [];
  lines.push("PointID,X_East_mm,Y_North_mm,Radius_mm,Azimuth_deg,ChordToNext_mm,DiagonalCheck_mm,Description");
  lines.push(`0,0,0,0,0.0,0,0,"Apex Projection Center (Точка Нуль)"`);

  for (const n of layout.nodes) {
    lines.push(
      `${n.index},${n.x},${n.y},${n.radius},${n.azimuthDeg},${n.chordToNextMm},${n.diagonalCheckMm},"Базовий янкерний вузол №${n.index} (Opposite: №${n.oppositeNodeIndex})"`
    );
  }

  return lines.join("\n");
}

/**
 * Generate AutoCAD DXF R12 blueprint for Foundation layout and formwork
 */
export function generateFoundationDXF(layout: FoundationLayoutCalculation): string {
  const lines: string[] = [
    "0", "SECTION",
    "2", "HEADER",
    "9", "$ACADVER", "1", "AC1009",
    "0", "ENDSEC",
    "0", "SECTION",
    "2", "TABLES",
    "0", "TABLE",
    "2", "LAYER",
    "70", "6",
    // Layers: AXES, PERIMETER, FORMWORK_INNER, FORMWORK_OUTER, PILES, ANCHORS, TEXT
    "0", "LAYER", "2", "AXES", "70", "0", "62", "1", "6", "CONTINUOUS",
    "0", "LAYER", "2", "PERIMETER", "70", "0", "62", "3", "6", "CONTINUOUS",
    "0", "LAYER", "2", "FORMWORK_INNER", "70", "0", "62", "4", "6", "CONTINUOUS",
    "0", "LAYER", "2", "FORMWORK_OUTER", "70", "0", "62", "5", "6", "CONTINUOUS",
    "0", "LAYER", "2", "PILES", "70", "0", "62", "6", "6", "CONTINUOUS",
    "0", "LAYER", "2", "ANCHORS", "70", "0", "62", "2", "6", "CONTINUOUS",
    "0", "LAYER", "2", "TEXT", "70", "0", "62", "7", "6", "CONTINUOUS",
    "0", "ENDTAB",
    "0", "ENDSEC",
    "0", "SECTION",
    "2", "ENTITIES"
  ];

  // Center point
  lines.push(
    "0", "POINT", "8", "AXES",
    "10", "0.0", "20", "0.0", "30", "0.0"
  );
  lines.push(
    "0", "TEXT", "8", "TEXT",
    "10", "30.0", "20", "30.0", "30", "0.0",
    "40", "120.0",
    "1", "CENTER APEX (0,0)"
  );

  // Radial axes lines from center to each node
  for (const n of layout.nodes) {
    lines.push(
      "0", "LINE", "8", "AXES",
      "10", "0.0", "20", "0.0", "30", "0.0",
      "11", n.x.toString(), "21", n.y.toString(), "31", "0.0"
    );

    // Anchor circle and node number
    lines.push(
      "0", "CIRCLE", "8", "ANCHORS",
      "10", n.x.toString(), "20", n.y.toString(), "30", "0.0",
      "40", "40.0"
    );

    lines.push(
      "0", "TEXT", "8", "TEXT",
      "10", (n.x + 50).toString(), "20", (n.y + 50).toString(), "30", "0.0",
      "40", "90.0",
      "1", `N${n.index} R=${n.radius} Az=${n.azimuthDeg}`
    );
  }

  // Base dome perimeter polygon
  for (let i = 0; i < layout.nodes.length; i++) {
    const p1 = layout.nodes[i];
    const p2 = layout.nodes[(i + 1) % layout.nodes.length];
    lines.push(
      "0", "LINE", "8", "PERIMETER",
      "10", p1.x.toString(), "20", p1.y.toString(), "30", "0.0",
      "11", p2.x.toString(), "21", p2.y.toString(), "31", "0.0"
    );
  }

  // Strip Formwork layers
  if (layout.stripGeometry) {
    const inP = layout.stripGeometry.innerPolygon;
    const outP = layout.stripGeometry.outerPolygon;
    for (let i = 0; i < inP.length; i++) {
      const next = (i + 1) % inP.length;
      lines.push(
        "0", "LINE", "8", "FORMWORK_INNER",
        "10", inP[i].x.toString(), "20", inP[i].y.toString(), "30", "0.0",
        "11", inP[next].x.toString(), "21", inP[next].y.toString(), "31", "0.0"
      );
      lines.push(
        "0", "LINE", "8", "FORMWORK_OUTER",
        "10", outP[i].x.toString(), "20", outP[i].y.toString(), "30", "0.0",
        "11", outP[next].x.toString(), "21", outP[next].y.toString(), "31", "0.0"
      );
    }
  }

  // Pile foundation circles
  if (layout.pileGeometry && layout.foundationType === "pile") {
    for (const p of layout.pileGeometry.piles) {
      lines.push(
        "0", "CIRCLE", "8", "PILES",
        "10", p.x.toString(), "20", p.y.toString(), "30", "0.0",
        "40", (layout.pileParams.diameterMm / 2).toString()
      );
    }
  }

  lines.push("0", "ENDSEC", "0", "EOF");
  return lines.join("\n");
}
