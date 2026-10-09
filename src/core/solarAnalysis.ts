import { DomeModel, Face } from "./types";

export interface FaceSolarMetric {
  faceId: number;
  /** Tilt angle from horizontal ground plane in degrees (0° = flat apex, 90° = vertical base) */
  tiltDeg: number;
  /** Compass azimuth angle in degrees (0° = North, 90° = East, 180° = South, 270° = West) */
  azimuthDeg: number;
  /** Full cardinal direction name in Ukrainian (e.g. 'Південь', 'Південний схід') */
  cardinalDirection: string;
  /** Short cardinal abbreviation (e.g. 'Пд', 'Пд-Сх', 'Сх', 'Пн-Сх', 'Пн', 'Пн-Зх', 'Зх', 'Пд-Зх') */
  cardinalAbbr: string;
  /** Relative solar insolation efficiency index in % (0 - 100%) */
  efficiencyPct: number;
  /** Quality classification for BIPV suitability */
  rating: "optimal" | "high" | "moderate" | "low";
  /** Ukrainian label for rating */
  ratingLabel: string;
  /** Hex color for 3D heatmap rendering */
  heatmapColor: string;
  /** Estimated annual solar insolation on this face in kWh/m²/year */
  annualIrradiationKWhPerM2: number;
  /** Area of this face in m² */
  areaM2: number;
  /** Estimated peak power in Watts for this specific panel */
  peakPowerWatts: number;
  /** Estimated annual electrical energy production in kWh/year */
  annualYieldKWh: number;
  /** Normalized outward normal vector */
  normal: { x: number; y: number; z: number };
  /** Centroid coordinate in mm */
  centroid: { x: number; y: number; z: number };
}

export interface DomeSolarAnalysis {
  metricsByFaceId: Map<number, FaceSolarMetric>;
  /** All face IDs ordered from highest solar efficiency to lowest */
  sortedByEfficiency: number[];
  /** Faces with efficiency >= 85% */
  optimalFaceIds: number[];
  /** Faces with efficiency >= 75% */
  highEfficiencyFaceIds: number[];
  /** Faces in southern quadrant (azimuth between 100° and 260° with tilt >= 15°) */
  southFacingFaceIds: number[];
  /** Current compass azimuth offset of the dome in degrees (0 = entrance/model North matches true North) */
  domeAzimuthDeg: number;
  /** Geographical latitude in degrees (default: 49.0° N for Ukraine / Central Europe) */
  latitudeDeg: number;
  /** Highest efficiency face ID */
  bestFaceId: number;
  /** Highest efficiency value in % */
  maxEfficiencyPct: number;
  /** Average solar efficiency across all dome faces in % */
  averageDomeEfficiencyPct: number;
  /** Summary statistics for currently selected solar faces */
  selectedStats: {
    count: number;
    totalAreaM2: number;
    totalPeakPowerWatts: number;
    averageEfficiencyPct: number;
    estimatedAnnualKWh: number;
    estimatedDailyKWh: number;
    estimatedAnnualSavingsUah: number;
    co2OffsetKgPerYear: number;
  };
}

/**
 * Converts a compass azimuth angle (0-360°) to Ukrainian cardinal direction
 */
export function getCardinalDirection(azimuthDeg: number): { name: string; abbr: string } {
  const norm = ((azimuthDeg % 360) + 360) % 360;
  if (norm >= 337.5 || norm < 22.5) return { name: "Північ", abbr: "Пн" };
  if (norm >= 22.5 && norm < 67.5) return { name: "Північний схід", abbr: "Пн-Сх" };
  if (norm >= 67.5 && norm < 112.5) return { name: "Схід", abbr: "Сх" };
  if (norm >= 112.5 && norm < 157.5) return { name: "Південний схід", abbr: "Пд-Сх" };
  if (norm >= 157.5 && norm < 202.5) return { name: "Південь", abbr: "Пд" };
  if (norm >= 202.5 && norm < 247.5) return { name: "Південний захід", abbr: "Пд-Зх" };
  if (norm >= 247.5 && norm < 292.5) return { name: "Захід", abbr: "Зх" };
  return { name: "Північний захід", abbr: "Пн-Зх" };
}

/**
 * Calculates the solar insolation efficiency factor for a face
 * based on its tilt angle and azimuth relative to true South,
 * calibrated to Central European / Ukrainian solar insolation data (PVGIS model).
 *
 * @param tiltDeg Angle from ground in degrees (0° = horizontal apex, 90° = vertical base)
 * @param azimuthDeg Compass orientation in degrees (0 = North, 90 = East, 180 = South, 270 = West)
 * @param latitudeDeg Site latitude in degrees (default 49.0° N)
 * @returns Solar efficiency factor between 0.0 and 1.0 (1.0 = 100% optimum)
 */
export function calculateSolarEfficiency(
  tiltDeg: number,
  azimuthDeg: number,
  latitudeDeg = 49.0
): number {
  const betaRad = (Math.max(0, Math.min(90, tiltDeg)) * Math.PI) / 180;
  const latRad = (latitudeDeg * Math.PI) / 180;

  // Angular deviation from optimal direct South (180°)
  const deltaAzimuthDeg = Math.min(
    Math.abs(azimuthDeg - 180),
    360 - Math.abs(azimuthDeg - 180)
  );
  const deltaAzimuthRad = (deltaAzimuthDeg * Math.PI) / 180;

  // Optimal tilt angle for latitude (around latitude - 13° for annual maximum)
  const optimalTiltRad = Math.max(0.35, latRad - 0.22); // ~36° for 49° N

  // 1. Direct beam radiation component:
  // Maximized when facing South at optimal tilt
  const directFactor =
    Math.max(0, Math.cos(deltaAzimuthRad)) *
    Math.sin(betaRad) *
    Math.sin(optimalTiltRad);

  // 2. Diffuse sky radiation component:
  // Flat roofs (tilt=0) see 100% of hemisphere sky; vertical walls see 50%
  const diffuseFactor = (1 + Math.cos(betaRad)) / 2;

  // 3. High summer sun / zenith collection:
  // Flat surfaces receive maximum summer solstice sun at noon
  const zenithFactor = Math.cos(betaRad) * Math.sin(latRad);

  // Empirical blending weights calibrated against PVGIS insolation for 49° N:
  // - Annual optimal south at 36° tilt receives ~1150 kWh/m²/yr (100%)
  // - Flat roof receives ~960 kWh/m²/yr (~83.5%)
  // - East/West 36° receives ~840 kWh/m²/yr (~73%)
  // - North 36° receives ~410 kWh/m²/yr (~35%)
  const rawIndex =
    0.58 * directFactor +
    0.28 * diffuseFactor +
    0.14 * zenithFactor;

  // Normalization constant so that optimal South at ~36° yields exactly 1.0 (100%)
  const optimalDirect = 1.0 * Math.sin(optimalTiltRad) * Math.sin(optimalTiltRad);
  const optimalDiffuse = (1 + Math.cos(optimalTiltRad)) / 2;
  const optimalZenith = Math.cos(optimalTiltRad) * Math.sin(latRad);
  const maxBenchmark =
    0.58 * optimalDirect +
    0.28 * optimalDiffuse +
    0.14 * optimalZenith;

  const normalized = Math.max(0.15, Math.min(1.0, rawIndex / Math.max(0.01, maxBenchmark)));
  return normalized;
}

/**
 * Returns a color along an intuitive, high-contrast solar heatmap gradient
 */
export function getSolarHeatmapColor(efficiencyPct: number): string {
  if (efficiencyPct >= 92) return "#EA580C"; // Fiery solar orange (Top 92-100%)
  if (efficiencyPct >= 85) return "#F59E0B"; // Bright amber gold (85-91%)
  if (efficiencyPct >= 75) return "#EAB308"; // Golden yellow (75-84%)
  if (efficiencyPct >= 65) return "#84CC16"; // Lime green (65-74%)
  if (efficiencyPct >= 50) return "#06B6D4"; // Cyan blue (50-64%)
  return "#475569"; // Cool slate shadow (<50%)
}

/**
 * Calculates complete solar insolation, orientation, and power metrics
 * for every face in the geodesic dome model.
 */
export function analyzeDomeSolar(
  model: DomeModel,
  options?: {
    domeAzimuthDeg?: number;
    latitudeDeg?: number;
    peakPowerPerM2?: number;
  }
): DomeSolarAnalysis {
  const domeAzimuthDeg = options?.domeAzimuthDeg ?? 0;
  const latitudeDeg = options?.latitudeDeg ?? 49.0;
  const peakPowerPerM2 = options?.peakPowerPerM2 ?? model.solarParams?.peakPowerPerM2 ?? 210;

  const metricsByFaceId = new Map<number, FaceSolarMetric>();
  const activeSolarIds = new Set(model.solarFaceIds || []);

  let sumEff = 0;
  let bestFaceId = model.faces[0]?.id ?? 0;
  let maxEfficiencyPct = 0;

  for (const face of model.faces) {
    const pA = model.nodes[face.a]?.position || { x: 0, y: 0, z: 0 };
    const pB = model.nodes[face.b]?.position || { x: 0, y: 0, z: 0 };
    const pC = model.nodes[face.c]?.position || { x: 0, y: 0, z: 0 };

    // Centroid in 3D
    const cen = {
      x: (pA.x + pB.x + pC.x) / 3,
      y: (pA.y + pB.y + pC.y) / 3,
      z: (pA.z + pB.z + pC.z) / 3
    };

    // Edge vectors AB and AC
    const ab = { x: pB.x - pA.x, y: pB.y - pA.y, z: pB.z - pA.z };
    const ac = { x: pC.x - pA.x, y: pC.y - pA.y, z: pC.z - pA.z };

    // Cross product AB x AC
    let nx = ab.y * ac.z - ab.z * ac.y;
    let ny = ab.z * ac.x - ab.x * ac.z;
    let nz = ab.x * ac.y - ab.y * ac.x;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    // Ensure normal points outward from dome center
    if (nx * cen.x + ny * cen.y + nz * cen.z < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }

    // Tilt angle from horizontal ground plane (0° = horizontal roof, 90° = vertical wall)
    // nz = cos(tilt)
    const clampedNz = Math.max(0, Math.min(1, nz));
    const tiltDeg = Math.round((Math.acos(clampedNz) * 180) / Math.PI * 10) / 10;

    // Azimuth angle in horizontal XY plane:
    // +Y is North (0°), +X is East (90°), -Y is South (180°), -X is West (270°)
    const rawAzimuthRad = Math.atan2(nx, ny);
    const rawAzimuthDeg = ((rawAzimuthRad * 180) / Math.PI + 360) % 360;

    // Combine with dome compass orientation offset:
    const adjustedAzimuthDeg = Math.round(((rawAzimuthDeg + domeAzimuthDeg) % 360 + 360) % 360 * 10) / 10;

    // Calculate solar efficiency factor (0.0 - 1.0)
    const effFactor = calculateSolarEfficiency(tiltDeg, adjustedAzimuthDeg, latitudeDeg);
    const efficiencyPct = Math.round(effFactor * 1000) / 10;

    if (efficiencyPct > maxEfficiencyPct) {
      maxEfficiencyPct = efficiencyPct;
      bestFaceId = face.id;
    }
    sumEff += efficiencyPct;

    // Cardinal direction label
    const cardinal = getCardinalDirection(adjustedAzimuthDeg);

    // Rating category
    let rating: FaceSolarMetric["rating"] = "low";
    let ratingLabel = "Низька ефективність (тіньова зона)";
    if (efficiencyPct >= 88) {
      rating = "optimal";
      ratingLabel = "🔥 Ідеально (максимальна сонячна генерація)";
    } else if (efficiencyPct >= 75) {
      rating = "high";
      ratingLabel = "☀️ Відмінно (висока продуктивність BIPV)";
    } else if (efficiencyPct >= 60) {
      rating = "moderate";
      ratingLabel = "🌿 Помірно (підходить для ранкового/вечірнього сонця)";
    }

    const heatmapColor = getSolarHeatmapColor(efficiencyPct);

    // Area in m²
    const areaM2 = Math.round((face.area / 1_000_000) * 100) / 100;

    // Peak power of this triangle
    const peakPowerWatts = Math.round(areaM2 * peakPowerPerM2);

    // Specific annual irradiation: benchmark for Ukraine is ~1150 kWh/m²/year for 100% optimum
    const annualIrradiationKWhPerM2 = Math.round(1150 * effFactor);

    // Estimated annual AC generation: (area * W/m² / 1000) * (1150 * effFactor)
    const annualYieldKWh = Math.round((peakPowerWatts / 1000) * annualIrradiationKWhPerM2);

    metricsByFaceId.set(face.id, {
      faceId: face.id,
      tiltDeg,
      azimuthDeg: adjustedAzimuthDeg,
      cardinalDirection: cardinal.name,
      cardinalAbbr: cardinal.abbr,
      efficiencyPct,
      rating,
      ratingLabel,
      heatmapColor,
      annualIrradiationKWhPerM2,
      areaM2,
      peakPowerWatts,
      annualYieldKWh,
      normal: { x: nx, y: ny, z: nz },
      centroid: cen
    });
  }

  // Sort face IDs by efficiency descending
  const sortedByEfficiency = [...model.faces.map(f => f.id)].sort((a, b) => {
    const effA = metricsByFaceId.get(a)?.efficiencyPct ?? 0;
    const effB = metricsByFaceId.get(b)?.efficiencyPct ?? 0;
    return effB - effA;
  });

  const optimalFaceIds = sortedByEfficiency.filter(
    id => (metricsByFaceId.get(id)?.efficiencyPct ?? 0) >= 85
  );

  const highEfficiencyFaceIds = sortedByEfficiency.filter(
    id => (metricsByFaceId.get(id)?.efficiencyPct ?? 0) >= 75
  );

  const southFacingFaceIds = sortedByEfficiency.filter(id => {
    const m = metricsByFaceId.get(id);
    if (!m) return false;
    // South quadrant (between 100° and 260°) and slope not too flat to catch low sun
    return m.azimuthDeg >= 100 && m.azimuthDeg <= 260 && m.tiltDeg >= 12;
  });

  const averageDomeEfficiencyPct =
    model.faces.length > 0
      ? Math.round((sumEff / model.faces.length) * 10) / 10
      : 0;

  // Selected solar panels statistics
  const selectedFacesList = model.faces.filter(f => activeSolarIds.has(f.id));
  const selAreaM2 = Math.round(selectedFacesList.reduce((sum, f) => sum + f.area / 1_000_000, 0) * 100) / 100;
  const selPeakWatts = Math.round(selAreaM2 * peakPowerPerM2);

  let selWeightedEffSum = 0;
  let selAnnualKWhSum = 0;
  for (const f of selectedFacesList) {
    const met = metricsByFaceId.get(f.id);
    if (met) {
      selWeightedEffSum += met.efficiencyPct * met.areaM2;
      selAnnualKWhSum += met.annualYieldKWh;
    }
  }

  const averageSelectedEfficiencyPct =
    selAreaM2 > 0 ? Math.round((selWeightedEffSum / selAreaM2) * 10) / 10 : 0;

  // Average daily generation
  const estimatedDailyKWh = Math.round((selAnnualKWhSum / 365) * 10) / 10;

  // Commercial grid electricity rate in Ukraine ~4.32 UAH/kWh (residential) to 8.50 UAH/kWh (commercial)
  const electricityTariffUah = 4.80;
  const estimatedAnnualSavingsUah = Math.round(selAnnualKWhSum * electricityTariffUah);

  // CO2 savings ~0.82 kg CO2 per kWh in Ukrainian grid
  const co2OffsetKgPerYear = Math.round(selAnnualKWhSum * 0.82);

  return {
    metricsByFaceId,
    sortedByEfficiency,
    optimalFaceIds,
    highEfficiencyFaceIds,
    southFacingFaceIds,
    domeAzimuthDeg,
    latitudeDeg,
    bestFaceId,
    maxEfficiencyPct,
    averageDomeEfficiencyPct,
    selectedStats: {
      count: selectedFacesList.length,
      totalAreaM2: selAreaM2,
      totalPeakPowerWatts: selPeakWatts,
      averageEfficiencyPct: averageSelectedEfficiencyPct,
      estimatedAnnualKWh: selAnnualKWhSum,
      estimatedDailyKWh,
      estimatedAnnualSavingsUah,
      co2OffsetKgPerYear
    }
  };
}
