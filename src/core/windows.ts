import { DomeModel, Face, FaceId, WindowGlazingParams } from "./types";

export interface GlazingOption {
  id: "double_glass" | "triple_glass" | "polycarbonate" | "tinted";
  name: string;
  shortName: string;
  description: string;
  thicknessMm: number;
  weightKgM2: number;
  pricePerM2UAH: number;
  tintColorHex: string;
  transmission: number;
  roughness: number;
}

export interface WindowFrameOption {
  id: "anthracite" | "anodized" | "white" | "wood";
  name: string;
  description: string;
  colorHex: string;
  metalness: number;
  roughness: number;
  pricePerMeterUAH: number;
}

export const GLAZING_OPTIONS: Record<string, GlazingOption> = {
  double_glass: {
    id: "double_glass",
    name: "Склопакет 24 мм (4-16-4)",
    shortName: "Склопакет 24 мм",
    description: "Двокамерний загартований енергозберігаючий склопакет з аргоном",
    thicknessMm: 24,
    weightKgM2: 20,
    pricePerM2UAH: 2850,
    tintColorHex: "#C5E3F6",
    transmission: 0.88,
    roughness: 0.08
  },
  triple_glass: {
    id: "triple_glass",
    name: "Енергозберігаючий склопакет 32 мм (4-10-4-10-4)",
    shortName: "Склопакет 32 мм",
    description: "Тришаровий пакет для цілорічного житлового купольного будинку",
    thicknessMm: 32,
    weightKgM2: 30,
    pricePerM2UAH: 3950,
    tintColorHex: "#B8DFEE",
    transmission: 0.84,
    roughness: 0.06
  },
  polycarbonate: {
    id: "polycarbonate",
    name: "Монолітний полікарбонат 8-10 мм",
    shortName: "Полікарбонат 10 мм",
    description: "Ударостійкий, антивандальний, легкий (для глемпінгів і теплиць)",
    thicknessMm: 10,
    weightKgM2: 12,
    pricePerM2UAH: 1650,
    tintColorHex: "#D0ECFA",
    transmission: 0.90,
    roughness: 0.12
  },
  tinted: {
    id: "tinted",
    name: "Сонцезахисне архітектурне скло (Graphite)",
    shortName: "Тоноване скло",
    description: "Захист від перегріву на сонячній стороні, дзеркальний ефект зовні",
    thicknessMm: 24,
    weightKgM2: 21,
    pricePerM2UAH: 3350,
    tintColorHex: "#7E99A8",
    transmission: 0.65,
    roughness: 0.05
  }
};

export const WINDOW_FRAME_OPTIONS: Record<string, WindowFrameOption> = {
  anthracite: {
    id: "anthracite",
    name: "Графіт анодований (RAL 7016)",
    description: "Сучасний темний преміальний профіль з EPDM-ущільнювачем",
    colorHex: "#2D343B",
    metalness: 0.75,
    roughness: 0.35,
    pricePerMeterUAH: 420
  },
  anodized: {
    id: "anodized",
    name: "Сріблястий алюміній (Anodized Silver)",
    description: "Натуральний захисний анодований шар, висока стійкість до опадів",
    colorHex: "#B4BCC4",
    metalness: 0.85,
    roughness: 0.28,
    pricePerMeterUAH: 380
  },
  white: {
    id: "white",
    name: "Білий порошковий (RAL 9016)",
    description: "Класичне біле фасадне оздоблення, відбиває сонячне тепло",
    colorHex: "#F2F4F7",
    metalness: 0.2,
    roughness: 0.45,
    pricePerMeterUAH: 350
  },
  wood: {
    id: "wood",
    name: "Дерев'яний притискний брус (Термоясен / Модрина)",
    description: "Органічний вигляд у тон до несучих балок каркасу купола",
    colorHex: "#8B5A2B",
    metalness: 0.05,
    roughness: 0.7,
    pricePerMeterUAH: 290
  }
};

export const DEFAULT_WINDOW_PARAMS: WindowGlazingParams = {
  windowFaceIds: [],
  frameColor: "anthracite",
  frameWidthMm: 45,
  glazingType: "double_glass"
};

/**
 * Calculates comprehensive metrics for the selected window faces
 */
export function calculateWindowMetrics(
  model: DomeModel,
  windowFaceIds: number[],
  params?: WindowGlazingParams
) {
  const glazing = GLAZING_OPTIONS[params?.glazingType || "double_glass"] || GLAZING_OPTIONS.double_glass;
  const frame = WINDOW_FRAME_OPTIONS[params?.frameColor || "anthracite"] || WINDOW_FRAME_OPTIONS.anthracite;

  let totalAreaM2 = 0;
  let totalPerimeterM = 0;
  let validWindowCount = 0;

  for (const faceId of windowFaceIds) {
    const face = model.faces[faceId];
    if (!face) continue;
    validWindowCount++;
    totalAreaM2 += face.area / 1_000_000;

    const pA = model.nodes[face.a]?.position;
    const pB = model.nodes[face.b]?.position;
    const pC = model.nodes[face.c]?.position;
    if (pA && pB && pC) {
      const dAB = Math.hypot(pA.x - pB.x, pA.y - pB.y, pA.z - pB.z);
      const dBC = Math.hypot(pB.x - pC.x, pB.y - pC.y, pB.z - pC.z);
      const dCA = Math.hypot(pC.x - pA.x, pC.y - pA.y, pC.z - pA.z);
      totalPerimeterM += (dAB + dBC + dCA) / 1000;
    }
  }

  const glassWeightKg = totalAreaM2 * glazing.weightKgM2;
  // Extruded clamping frame aluminium profile ~ 0.85 kg per linear meter
  const frameWeightKg = totalPerimeterM * (frame.id === "wood" ? 0.65 : 0.95);
  const totalWindowWeightKg = glassWeightKg + frameWeightKg;

  const glassCostUAH = totalAreaM2 * glazing.pricePerM2UAH;
  const frameCostUAH = totalPerimeterM * frame.pricePerMeterUAH;
  const hardwareCostUAH = validWindowCount * 350; // Stainless clamps & seal corners
  const totalCostUAH = glassCostUAH + frameCostUAH + hardwareCostUAH;

  return {
    validWindowCount,
    totalAreaM2: Math.round(totalAreaM2 * 1000) / 1000,
    totalPerimeterM: Math.round(totalPerimeterM * 100) / 100,
    glassWeightKg: Math.round(glassWeightKg * 10) / 10,
    frameWeightKg: Math.round(frameWeightKg * 10) / 10,
    totalWindowWeightKg: Math.round(totalWindowWeightKg * 10) / 10,
    glassCostUAH: Math.round(glassCostUAH),
    frameCostUAH: Math.round(frameCostUAH),
    hardwareCostUAH: Math.round(hardwareCostUAH),
    totalCostUAH: Math.round(totalCostUAH),
    glazing,
    frame
  };
}

/**
 * Finds faces corresponding to the top zenith / oculus skylight (highest Y)
 */
export function getTopZenithOculusFaceIds(model: DomeModel): number[] {
  if (!model.faces || model.faces.length === 0) return [];

  // Calculate face centroids and their Y position (or Z depending on orientation)
  // In the model coordinates, Y is UP (or Z is UP). Let's check max coordinate.
  const faceStats = model.faces.map(face => {
    const pA = model.nodes[face.a]?.position;
    const pB = model.nodes[face.b]?.position;
    const pC = model.nodes[face.c]?.position;
    if (!pA || !pB || !pC) return { id: face.id, y: -Infinity };
    const cenY = (pA.y + pB.y + pC.y) / 3;
    return { id: face.id, y: cenY };
  });

  const maxY = Math.max(...faceStats.map(f => f.y));
  const domeHeight = model.parameters.height || 3000;
  // Zenith faces are within top 15% of dome apex
  const zenithThreshold = maxY - Math.max(150, domeHeight * 0.18);

  return faceStats
    .filter(f => f.y >= zenithThreshold)
    .map(f => f.id);
}

/**
 * Finds faces in a panoramic tier (e.g. facing south or mid-elevation)
 */
export function getPanoramicTierFaceIds(model: DomeModel): number[] {
  if (!model.faces || model.faces.length === 0) return [];

  const domeHeight = model.parameters.height || 3000;
  const faceStats = model.faces.map(face => {
    const pA = model.nodes[face.a]?.position;
    const pB = model.nodes[face.b]?.position;
    const pC = model.nodes[face.c]?.position;
    if (!pA || !pB || !pC) return { id: face.id, y: 0, z: 0 };
    const cenY = (pA.y + pB.y + pC.y) / 3;
    const cenZ = (pA.z + pB.z + pC.z) / 3;
    return { id: face.id, y: cenY, z: cenZ };
  });

  // Mid-tier facade (30% to 70% of height) facing front/south (z > 0)
  return faceStats
    .filter(f => f.y >= domeHeight * 0.15 && f.y <= domeHeight * 0.65 && f.z > 0)
    .map(f => f.id);
}
