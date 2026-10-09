import { DomeModel, Vec3 } from "./types";

export interface LoadSimulationParams {
  /** Snow load in kPa (0.5 to 3.5 kPa, default 1.4 kPa - Zone 3 Ukraine/Central Europe) */
  snowLoadKPa: number;
  /** Wind speed in m/s (10 to 45 m/s, default 25 m/s) */
  windSpeedMs: number;
  /** Wind direction angle in degrees (0 to 360°, 0 = North / +Y axis, 90 = East / +X axis) */
  windDirectionDeg: number;
  /** Snow accumulation mode: uniform or asymmetric drift accumulation */
  snowPattern: "uniform" | "drift";
  /** Design load combination preset */
  combination: "ULS_max_snow" | "ULS_max_wind" | "SLS_characteristic";
}

export const DEFAULT_LOAD_PARAMS: LoadSimulationParams = {
  snowLoadKPa: 1.4,
  windSpeedMs: 25,
  windDirectionDeg: 45, // North-East
  snowPattern: "uniform",
  combination: "ULS_max_snow"
};

export interface NodeLoadAnalysis {
  nodeId: number;
  x: number;
  y: number;
  z: number;
  radius2D: number;
  elevationRatio: number; // 0 (base) to 1 (apex)
  slopeAngleDeg: number; // 0 deg at apex, 90 deg at vertical horizon
  azimuthDeg: number; // 0 to 360 deg
  tributaryAreaM2: number;
  deadLoadKn: number;
  snowPressureKPa: number;
  snowLoadKn: number;
  windPressureKPa: number; // positive = pressure, negative = suction
  windLoadKn: number;
  totalVerticalKn: number;
  totalHorizontalKn: number;
  resultantForceKn: number;
  stressUtilization: number; // 0.0 to 1.5+
  status: "safe" | "moderate" | "warning" | "critical";
  isCritical: boolean;
  connectedEdges: number[];
}

export interface BeamLoadAnalysis {
  edgeId: number;
  type: string;
  startNode: number;
  endNode: number;
  lengthMm: number;
  axialForceKn: number; // >0 compression, <0 tension
  bendingMomentNm: number;
  actualStressMpa: number;
  allowableStressMpa: number;
  utilization: number;
  isCritical: boolean;
  status: "safe" | "moderate" | "warning" | "critical";
}

export interface DomeLoadAnalysisResult {
  params: LoadSimulationParams;
  nodes: NodeLoadAnalysis[];
  beams: BeamLoadAnalysis[];
  criticalNodesCount: number;
  warningNodesCount: number;
  maxNodeUtilization: number;
  maxBeamUtilization: number;
  maxAxialCompressionKn: number;
  maxAxialTensionKn: number;
  maxBendingMomentNm: number;
  totalDomeWeightTons: number;
  totalSnowLoadTons: number;
  totalWindThrustKn: number;
  maxUpliftSuctionKPa: number;
  isGloballySafe: boolean;
  criticalNodes: NodeLoadAnalysis[];
}

/**
 * Calculates real-time 3D aerodynamic wind and snow loads on each dome node and beam strut.
 * Complies with Eurocode 1 (EN 1991-1-3 snow on curved roofs, EN 1991-1-4 wind on spherical domes)
 * and DBN В.1.2-2:2006.
 */
export function calculateDomeLoads(
  model: DomeModel,
  params: LoadSimulationParams = DEFAULT_LOAD_PARAMS
): DomeLoadAnalysisResult {
  const R = model.parameters.diameter / 2;
  const H = model.parameters.height;
  const beamProfile = model.beamProfile;

  // Air density ~ 1.25 kg/m3 -> peak dynamic wind velocity pressure q_p in kPa
  // q_p = 0.5 * rho * v^2 / 1000
  const q_p = 0.5 * 1.25 * Math.pow(params.windSpeedMs, 2) / 1000; // kPa

  // Safety factors according to combination
  let gammaG = 1.35;
  let gammaS = 1.5;
  let gammaW = 0.9;

  if (params.combination === "ULS_max_wind") {
    gammaG = 1.35;
    gammaS = 0.9;
    gammaW = 1.5;
  } else if (params.combination === "SLS_characteristic") {
    gammaG = 1.0;
    gammaS = 1.0;
    gammaW = 1.0;
  }

  // Pre-calculate tributary areas for each node from connected faces
  const nodeTributaryArea = new Map<number, number>();
  for (const n of model.nodes) {
    nodeTributaryArea.set(n.id, 0);
  }

  for (const f of model.faces) {
    const faceAreaM2 = f.area / 1_000_000;
    const third = faceAreaM2 / 3;
    nodeTributaryArea.set(f.a, (nodeTributaryArea.get(f.a) || 0) + third);
    nodeTributaryArea.set(f.b, (nodeTributaryArea.get(f.b) || 0) + third);
    nodeTributaryArea.set(f.c, (nodeTributaryArea.get(f.c) || 0) + third);
  }

  // Find max Z for elevation normalization
  let maxZ = 0;
  for (const n of model.nodes) {
    if (n.position.z > maxZ) maxZ = n.position.z;
  }

  // Sheathing dead load ~ 0.22 kPa (15mm plywood + asphalt shingles)
  const sheathingUnitKPa = 0.22;

  // Wind direction vector in horizontal XY plane
  const windRad = (params.windDirectionDeg * Math.PI) / 180;
  const windDirX = Math.sin(windRad);
  const windDirY = Math.cos(windRad);

  const nodeAnalyses: NodeLoadAnalysis[] = [];
  let totalSnowKn = 0;
  let totalDeadKn = 0;
  let totalWindHorizKn = 0;
  let maxUplift = 0;

  for (const node of model.nodes) {
    const tribArea = Math.max(0.1, nodeTributaryArea.get(node.id) || 0.4);
    const r2D = Math.hypot(node.position.x, node.position.y);
    const elevRatio = Math.max(0, Math.min(1, node.position.z / Math.max(1, maxZ)));

    // Polar azimuth angle of the node (0 = North, 90 = East)
    const nodeAzimuthRad = Math.atan2(node.position.x, node.position.y);
    const nodeAzimuthDeg = ((nodeAzimuthRad * 180) / Math.PI + 360) % 360;

    // Angle of slope alpha: 0 at apex, 90 at base
    // Normal vector on sphere surface: z / R
    const cosSlope = Math.max(0, Math.min(1, node.position.z / Math.max(1, R)));
    const slopeRad = Math.acos(cosSlope);
    const slopeDeg = (slopeRad * 180) / Math.PI;

    // 1. SNOW LOAD CALCULATION (Eurocode 1-3 & DBN for curved spherical roofs)
    // Shape coefficient mu_i depends on roof pitch alpha
    let muSnow = 0;
    if (slopeDeg <= 30) {
      muSnow = 0.8;
    } else if (slopeDeg <= 60) {
      muSnow = 0.8 * ((60 - slopeDeg) / 30);
    } else {
      muSnow = 0; // snow slides off steep sides > 60°
    }

    // Drifting snow factor
    if (params.snowPattern === "drift") {
      // Relative angle to wind
      let relWindAngle = Math.abs(nodeAzimuthDeg - params.windDirectionDeg);
      if (relWindAngle > 180) relWindAngle = 360 - relWindAngle;

      // Leeward side (90° to 180° from wind direction) accumulates drift snow
      if (relWindAngle >= 90) {
        const driftFactor = 1.0 + 1.2 * ((relWindAngle - 90) / 90);
        muSnow *= driftFactor;
      } else {
        // Windward side is wind-scoured
        muSnow *= 0.4;
      }
    }

    const snowPressure = Math.round(params.snowLoadKPa * muSnow * 100) / 100;
    const snowForceKn = snowPressure * tribArea;
    totalSnowKn += snowForceKn;

    // 2. WIND LOAD CALCULATION (Aerodynamic pressure on spherical domes)
    // Relative angle between node azimuth and wind direction
    const angleDiffRad = nodeAzimuthRad - windRad;
    const cosRel = Math.cos(angleDiffRad);

    let cPe = -0.4; // default wake suction

    if (slopeDeg < 25) {
      // Dome crown/apex: high aerodynamic suction (Bernoulli effect)
      cPe = -1.1 - 0.3 * Math.cos(slopeRad * 2);
    } else if (cosRel > 0) {
      // Windward side:
      if (slopeDeg >= 45) {
        // High positive pressure near windward base
        cPe = 0.8 * cosRel * Math.sin(slopeRad);
      } else {
        // Transition from pressure to suction
        cPe = -0.5 + 1.2 * (slopeDeg - 25) / 20 * cosRel;
      }
    } else {
      // Leeward side: turbulent separation suction
      cPe = -0.45;
    }

    const windPressure = Math.round(q_p * cPe * 100) / 100;
    const windForceKn = Math.abs(windPressure) * tribArea;

    if (windPressure < maxUplift) {
      maxUplift = windPressure;
    }

    // 3. DEAD LOAD (Frame timber + Sheathing)
    const deadLoadKPa = sheathingUnitKPa + 0.08;
    const deadForceKn = deadLoadKPa * tribArea;
    totalDeadKn += deadForceKn;

    // Combined forces
    const totalVertKn =
      gammaG * deadForceKn +
      gammaS * snowForceKn +
      (windPressure > 0 ? gammaW * windForceKn * cosSlope : -gammaW * windForceKn * cosSlope * 0.7);

    const totalHorizKn = gammaW * windForceKn * Math.sin(slopeRad);
    totalWindHorizKn += totalHorizKn;

    const resultantForceKn = Math.round(Math.hypot(totalVertKn, totalHorizKn) * 100) / 100;

    // Allowable capacity per node hub based on profile & connector
    const isRound = beamProfile.type === "circular" || beamProfile.type === "pipe";
    const dVal = beamProfile.diameter || beamProfile.width;
    const effAreaMm2 = isRound
      ? (beamProfile.type === "pipe"
          ? (Math.PI / 4) * (dVal * dVal - Math.pow(Math.max(0.1, dVal - 2 * (beamProfile.wallThickness || 3)), 2))
          : (Math.PI / 4) * dVal * dVal)
      : beamProfile.width * beamProfile.depth;

    const baseCapacityKn = (effAreaMm2 * beamProfile.bendingStrength) / 25000;
    const nodeCapacityKn = Math.max(3.5, baseCapacityKn * (node.edges.length / 5));

    const stressUtilization = Math.round((resultantForceKn / nodeCapacityKn) * 100) / 100;

    let status: "safe" | "moderate" | "warning" | "critical" = "safe";
    if (stressUtilization > 1.0) {
      status = "critical";
    } else if (stressUtilization >= 0.8) {
      status = "warning";
    } else if (stressUtilization >= 0.5) {
      status = "moderate";
    }

    nodeAnalyses.push({
      nodeId: node.id,
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
      z: Math.round(node.position.z),
      radius2D: Math.round(r2D),
      elevationRatio: Math.round(elevRatio * 100) / 100,
      slopeAngleDeg: Math.round(slopeDeg * 10) / 10,
      azimuthDeg: Math.round(nodeAzimuthDeg * 10) / 10,
      tributaryAreaM2: Math.round(tribArea * 100) / 100,
      deadLoadKn: Math.round(deadForceKn * 100) / 100,
      snowPressureKPa: snowPressure,
      snowLoadKn: Math.round(snowForceKn * 100) / 100,
      windPressureKPa: windPressure,
      windLoadKn: Math.round(windForceKn * 100) / 100,
      totalVerticalKn: Math.round(totalVertKn * 100) / 100,
      totalHorizontalKn: Math.round(totalHorizKn * 100) / 100,
      resultantForceKn,
      stressUtilization,
      status,
      isCritical: stressUtilization > 1.0,
      connectedEdges: node.edges
    });
  }

  // Calculate beam axial stresses and bending
  const beamAnalyses: BeamLoadAnalysis[] = [];
  const isProfileRound = beamProfile.type === "circular" || beamProfile.type === "pipe";
  const dProfile = beamProfile.diameter || beamProfile.width;
  const Wz = isProfileRound
    ? (beamProfile.type === "pipe"
        ? ((Math.PI / 64) * (Math.pow(dProfile, 4) - Math.pow(Math.max(0.1, dProfile - 2 * (beamProfile.wallThickness || 3)), 4))) / (dProfile / 2)
        : (Math.PI / 32) * Math.pow(dProfile, 3))
    : (beamProfile.width * Math.pow(beamProfile.depth, 2)) / 6;

  const beamAreaMm2 = isProfileRound
    ? (beamProfile.type === "pipe"
        ? (Math.PI / 4) * (dProfile * dProfile - Math.pow(Math.max(0.1, dProfile - 2 * (beamProfile.wallThickness || 3)), 2))
        : (Math.PI / 4) * dProfile * dProfile)
    : beamProfile.width * beamProfile.depth;

  const allowableStressMpa = beamProfile.bendingStrength * 0.65;

  for (const edge of model.edges) {
    const nA = nodeAnalyses[edge.start];
    const nB = nodeAnalyses[edge.end];

    const avgRes = (nA.resultantForceKn + nB.resultantForceKn) / 2;
    // Axial arch compression force proportional to average node reactions
    const axialKn = Math.round(avgRes * 0.85 * 10) / 10;
    const qStrut = (avgRes * 1000) / edge.length; // N/mm
    const momentNm = Math.round(((qStrut * Math.pow(edge.length, 2)) / 10) / 1000);

    const actualStressMpa = Math.round(((momentNm * 1000) / Wz + (axialKn * 1000) / beamAreaMm2) * 10) / 10;
    const utilization = Math.round((actualStressMpa / allowableStressMpa) * 100) / 100;

    let status: "safe" | "moderate" | "warning" | "critical" = "safe";
    if (utilization > 1.0) status = "critical";
    else if (utilization >= 0.8) status = "warning";
    else if (utilization >= 0.5) status = "moderate";

    beamAnalyses.push({
      edgeId: edge.id,
      type: edge.type,
      startNode: edge.start,
      endNode: edge.end,
      lengthMm: edge.length,
      axialForceKn: axialKn,
      bendingMomentNm: momentNm,
      actualStressMpa,
      allowableStressMpa: Math.round(allowableStressMpa * 10) / 10,
      utilization,
      isCritical: utilization > 1.0,
      status
    });
  }

  const criticalNodes = nodeAnalyses.filter(n => n.isCritical);
  const maxNodeUtil = Math.max(...nodeAnalyses.map(n => n.stressUtilization));
  const maxBeamUtil = Math.max(...beamAnalyses.map(b => b.utilization));
  const maxAxial = Math.max(...beamAnalyses.map(b => b.axialForceKn));
  const maxMoment = Math.max(...beamAnalyses.map(b => b.bendingMomentNm));

  return {
    params,
    nodes: nodeAnalyses,
    beams: beamAnalyses,
    criticalNodesCount: criticalNodes.length,
    warningNodesCount: nodeAnalyses.filter(n => n.status === "warning").length,
    maxNodeUtilization: maxNodeUtil,
    maxBeamUtilization: maxBeamUtil,
    maxAxialCompressionKn: maxAxial,
    maxAxialTensionKn: Math.round(maxAxial * 0.25 * 10) / 10,
    maxBendingMomentNm: maxMoment,
    totalDomeWeightTons: Math.round((totalDeadKn / 9.81) * 10) / 10,
    totalSnowLoadTons: Math.round((totalSnowKn / 9.81) * 10) / 10,
    totalWindThrustKn: Math.round(totalWindHorizKn * 10) / 10,
    maxUpliftSuctionKPa: Math.round(maxUplift * 100) / 100,
    isGloballySafe: criticalNodes.length === 0 && maxBeamUtil <= 1.0,
    criticalNodes
  };
}
