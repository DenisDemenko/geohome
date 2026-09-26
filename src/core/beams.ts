import {
  BeamProfile,
  StructuralAnalysis,
  Edge,
  Node,
  Vec3,
  BeamTypeGroup
} from "./types";
import { normalize, sub, dot, length, clamp } from "./math";

export const DEFAULT_BEAM_PROFILES: BeamProfile[] = [
  {
    name: "Дерев'яний брус 50 × 150 мм (Сосна С24)",
    width: 50,
    depth: 150,
    type: "rectangular",
    material: "pine",
    density: 500, // kg/m3
    elasticModulus: 11000, // MPa
    bendingStrength: 24 // MPa
  },
  {
    name: "Дерев'яний брус 50 × 100 мм (Сосна С24)",
    width: 50,
    depth: 100,
    type: "rectangular",
    material: "pine",
    density: 500,
    elasticModulus: 11000,
    bendingStrength: 24
  },
  {
    name: "Дерев'яний брус 45 × 145 мм (Калібрований)",
    width: 45,
    depth: 145,
    type: "rectangular",
    material: "pine",
    density: 480,
    elasticModulus: 10500,
    bendingStrength: 22
  },
  {
    name: "Дерев'яний брус 50 × 200 мм (Посилений)",
    width: 50,
    depth: 200,
    type: "rectangular",
    material: "larch",
    density: 650,
    elasticModulus: 12000,
    bendingStrength: 28
  },
  {
    name: "Сталева кругла труба Ø 48 × 3.0 мм (Ст3)",
    width: 48,
    depth: 48,
    wallThickness: 3.0,
    type: "pipe",
    material: "steel",
    density: 7850,
    elasticModulus: 206000,
    bendingStrength: 235
  },
  {
    name: "Алюмінієвий профіль 60 × 40 × 3 мм (АД31Т1)",
    width: 40,
    depth: 60,
    wallThickness: 3.0,
    type: "rectangular",
    material: "aluminum",
    density: 2700,
    elasticModulus: 70000,
    bendingStrength: 150
  },
  {
    name: "Рейка 10 × 20 мм (Міні-купол / Теплиця / Модель)",
    width: 10,
    depth: 20,
    type: "rectangular",
    material: "pine",
    density: 480,
    elasticModulus: 10000,
    bendingStrength: 20
  },
  {
    name: "Рейка 4 × 8 мм (Настільний макет / Фанера)",
    width: 4,
    depth: 8,
    type: "rectangular",
    material: "pine",
    density: 450,
    elasticModulus: 9500,
    bendingStrength: 18
  },
  {
    name: "Мікро-рейка 2 × 4 мм (Дерев'яний макет / Бальза)",
    width: 2,
    depth: 4,
    type: "rectangular",
    material: "pine",
    density: 300,
    elasticModulus: 6000,
    bendingStrength: 15
  },
  {
    name: "Трубка Ø 3 × 0.5 мм (Латунь / Алюміній / Моделі)",
    width: 3,
    depth: 3,
    wallThickness: 0.5,
    type: "pipe",
    material: "aluminum",
    density: 2700,
    elasticModulus: 70000,
    bendingStrength: 150
  }
];

export interface BeamMiterAngles {
  edgeId: number;
  type: string;
  nominalLength: number; // mm
  startMiterDeg: number; // miter cut at node A
  endMiterDeg: number; // miter cut at node B
  bevelDeg: number; // side bevel for flush panel seat
  boltHole1Mm: number; // offset from end
  boltHole2Mm: number;
}

export function calculateBeamMiterAngles(
  edge: Edge,
  nodes: Node[],
  connectorParams?: { tabLength?: number; boltDistance?: number }
): BeamMiterAngles {
  const pA = nodes[edge.start].position;
  const pB = nodes[edge.end].position;

  // Vector from dome center (0,0,0) to midpoint of beam
  const mid = {
    x: (pA.x + pB.x) / 2,
    y: (pA.y + pB.y) / 2,
    z: (pA.z + pB.z) / 2
  };
  const rMid = length(mid);
  const rA = length(pA);

  // Angular half-span of the strut
  const halfAngleRad = Math.acos(clamp(rMid / rA, -1, 1));
  const miterDeg = Math.round((halfAngleRad * 180 / Math.PI) * 10) / 10;

  // Approximate bevel angle (half dihedral angle between adjacent triangular facets)
  const bevelDeg = Math.round((miterDeg * 0.72) * 10) / 10;

  const tabL = connectorParams?.tabLength || 95;
  const boltHole1 = Math.max(1.0, Math.round(tabL * 0.35 * 10) / 10);
  const boltHole2 = Math.max(2.0, Math.round(tabL * 0.75 * 10) / 10);

  return {
    edgeId: edge.id,
    type: edge.type,
    nominalLength: edge.length,
    startMiterDeg: miterDeg,
    endMiterDeg: miterDeg,
    bevelDeg,
    boltHole1Mm: boltHole1,
    boltHole2Mm: boltHole2
  };
}

/**
 * Calculates structural loading and required beam thickness/depth.
 * Uses Eurocode 5 (timber structures) & DBN V.1.2-2:2006 (snow/wind in Ukraine).
 */
export function analyzeBeamStructure(
  edges: Edge[],
  profile: BeamProfile,
  domeRadiusMm: number,
  domeSurfaceAreaM2: number,
  faceCount: number
): StructuralAnalysis {
  const strutCount = edges.length;
  const totalLinearMm = edges.reduce((sum, e) => sum + e.length, 0);
  const totalLinearMeters = Math.round((totalLinearMm / 1000) * 10) / 10;
  const maxSpanMm = Math.max(...edges.map(e => e.length));

  // Section properties
  const b = profile.width; // mm
  const h = profile.depth; // mm

  let crossSectionAreaMm2 = 0;
  let sectionModulusWzMm3 = 0; // W = b * h^2 / 6
  let momentOfInertiaIzMm4 = 0; // I = b * h^3 / 12

  if (profile.type === "rectangular") {
    crossSectionAreaMm2 = b * h;
    sectionModulusWzMm3 = (b * Math.pow(h, 2)) / 6;
    momentOfInertiaIzMm4 = (b * Math.pow(h, 3)) / 12;
  } else {
    // Pipe
    const t = profile.wallThickness || 3;
    const dOuter = profile.width;
    const dInner = dOuter - 2 * t;
    crossSectionAreaMm2 = (Math.PI / 4) * (dOuter * dOuter - dInner * dInner);
    momentOfInertiaIzMm4 = (Math.PI / 64) * (Math.pow(dOuter, 4) - Math.pow(dInner, 4));
    sectionModulusWzMm3 = momentOfInertiaIzMm4 / (dOuter / 2);
  }

  const totalWoodVolumeM3 = (crossSectionAreaMm2 * totalLinearMm) / 1_000_000_000;
  const structuralFrameWeightKg = totalWoodVolumeM3 * profile.density;

  // Dead load of sheathing (e.g. 15mm plywood + shingle roof = ~22 kg/m2)
  const sheathingUnitWeightKgM2 = 22;
  const sheathingTotalWeightKg = domeSurfaceAreaM2 * sheathingUnitWeightKgM2;
  const totalDomeWeightKg = Math.round(structuralFrameWeightKg + sheathingTotalWeightKg);

  // Environmental loads (DBN Ukraine values)
  const designSnowLoadKPa = 1.4; // 140 kg/m2 (Zone 3 Ukraine - Kyiv, Lviv, Dnipro)
  const designWindLoadKPa = 0.45; // 45 kg/m2 (Speed ~27 m/s)
  const deadLoadKPa = (totalDomeWeightKg / Math.max(1, domeSurfaceAreaM2) * 9.81) / 1000;

  // Total design surface pressure q_d in kPa (with load safety factors 1.35*G + 1.5*S)
  const totalDesignPressureKPa = 1.35 * deadLoadKPa + 1.5 * designSnowLoadKPa + 0.6 * designWindLoadKPa;

  // Average tributary area per beam
  const tributaryAreaPerBeamM2 = Math.max(0.2, (domeSurfaceAreaM2 * 2) / Math.max(1, strutCount));

  // Distributed load along the beam strut in N/mm
  const qStrutNPerMm = (totalDesignPressureKPa * (tributaryAreaPerBeamM2 / (maxSpanMm / 1000))) * 1.0; // N/mm

  // Max bending moment M = q * L^2 / 8 (in N*mm)
  const L = maxSpanMm;
  const maxBendingMomentNmm = (qStrutNPerMm * L * L) / 8;
  const maxBendingMomentNm = Math.round(maxBendingMomentNmm / 1000);

  // Approximate axial arch thrust N in kN
  const maxAxialForceKn = Math.round(((totalDomeWeightKg * 9.81) / (faceCount * 0.75)) / 100) / 10;

  // Actual bending stress sigma = M / W (in MPa = N/mm2)
  const actualBendingStressMpa = Math.round((maxBendingMomentNmm / sectionModulusWzMm3) * 10) / 10;
  const allowableBendingStressMpa = profile.bendingStrength * 0.65; // k_mod & safety factor

  const bendingUtilization = Math.round((actualBendingStressMpa / allowableBendingStressMpa) * 100) / 100;

  // Deflection check: f = 5 * q * L^4 / (384 * E * I)
  const E = profile.elasticModulus; // MPa = N/mm2
  const actualDeflectionMm =
    Math.round(((5 * qStrutNPerMm * Math.pow(L, 4)) / (384 * E * momentOfInertiaIzMm4)) * 10) / 10;
  const allowableDeflectionMm = Math.round((L / 250) * 10) / 10;
  const deflectionUtilization = Math.round((actualDeflectionMm / allowableDeflectionMm) * 100) / 100;

  const isStructurallySafe = bendingUtilization <= 1.0 && deflectionUtilization <= 1.0;

  // Recommended minimal depth for timber
  const recommendedMinDepthMm = Math.ceil(Math.sqrt((6 * maxBendingMomentNmm) / (b * allowableBendingStressMpa)) / 10) * 10;

  return {
    totalDomeWeightKg,
    strutCount,
    totalLinearMeters,
    totalWoodVolumeM3: Math.round(totalWoodVolumeM3 * 100) / 100,
    maxSpanMm: Math.round(maxSpanMm),
    designSnowLoadKPa,
    designWindLoadKPa,
    tributaryAreaPerBeamM2: Math.round(tributaryAreaPerBeamM2 * 100) / 100,
    maxBendingMomentNm,
    maxAxialForceKn,
    actualBendingStressMpa,
    allowableBendingStressMpa: Math.round(allowableBendingStressMpa * 10) / 10,
    bendingUtilization,
    actualDeflectionMm,
    allowableDeflectionMm,
    deflectionUtilization,
    isStructurallySafe,
    recommendedMinDepthMm: Math.max(70, recommendedMinDepthMm)
  };
}
