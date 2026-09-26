export type Frequency = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

export type NodeId = number;
export type EdgeId = number;
export type FaceId = number;

export interface Node {
  id: NodeId;
  position: Vec3;
  edges: EdgeId[];
  neighbours: NodeId[];
  boundary: boolean;
}

export interface Edge {
  id: EdgeId;
  start: NodeId;
  end: NodeId;
  /** Theoretical nominal length from node center to node center in millimetres */
  length: number;
  /** Net timber cutting length after trimming by connector ring radius at each end in mm */
  cutLength?: number;
  /** Trim offset deduction from each node center (hubRadius) in mm */
  hubSetback?: number;
  /** Normalized direction vector start -> end */
  direction: Vec3;
  /** Beam classification type (A, B, C...) */
  type: string;
  /** Color code for rendering */
  color: string;
  /** True if this beam lies on the foundation base horizon Z=0 */
  isBaseBeam?: boolean;
  /** True if this beam is a vertical riser leveling post down to foundation */
  isLevelingRiser?: boolean;
}

export interface Face {
  id: FaceId;
  a: NodeId;
  b: NodeId;
  c: NodeId;
  type: string;
  normal: Vec3;
  area: number; // mm^2
}

export type DomeCutType = "1/2" | "3/8" | "5/8" | "7/12" | "exact";

export type BaseLevelingMode = "flat_ring" | "risers";

export interface DomeParameters {
  /** Dome diameter in millimetres */
  diameter: number;
  /** Dome height in millimetres */
  height: number;
  /** Cut type preset or custom */
  cutType: DomeCutType;
  /** Geodesic frequency 1V-8V */
  frequency: Frequency;
  /** Optional model rotation in radians */
  rotation?: Vec3;
  /** Option to level dome with beams along foundation base horizon */
  levelBaseHorizon?: boolean;
  /** Mode: flat base perimeter ring or vertical riser posts */
  levelingMode?: BaseLevelingMode;
}

export interface BeamTypeGroup {
  type: string;
  color: string;
  /** Theoretical nominal length from node center to node center in mm */
  length: number;
  /** Net timber cutting length after trimming by connector ring radius at each end in mm */
  cutLength?: number;
  /** Setback deduction at each end in mm (ring radius) */
  hubSetback?: number;
  count: number;
  endAngleStart: number; // degrees
  endAngleEnd: number; // degrees
  axialTwist?: number;
  /** True if this type represents horizontal foundation base beams */
  isBaseBeam?: boolean;
}

export interface FaceTypeGroup {
  type: string;
  count: number;
  color: string;
  edges: [string, string, string]; // e.g. ["A", "B", "C"]
  lengths: [number, number, number]; // mm
  angles: [number, number, number]; // degrees
  area: number; // m^2
  dihedralBevels: [number, number, number]; // bevel angle at edges in deg
}

export interface BeamProfile {
  name: string;
  width: number; // mm (e.g. 50)
  depth: number; // mm (e.g. 150)
  wallThickness?: number; // mm for pipe
  type: "rectangular" | "pipe";
  material: "pine" | "larch" | "oak" | "steel" | "aluminum";
  density: number; // kg/m3 (pine: 500, steel: 7850, alu: 2700)
  elasticModulus: number; // MPa (E-modulus, pine ~11000)
  bendingStrength: number; // MPa (pine ~24)
}

export interface StructuralAnalysis {
  totalDomeWeightKg: number;
  strutCount: number;
  totalLinearMeters: number;
  totalWoodVolumeM3: number;
  maxSpanMm: number;
  designSnowLoadKPa: number;
  designWindLoadKPa: number;
  tributaryAreaPerBeamM2: number;
  maxBendingMomentNm: number;
  maxAxialForceKn: number;
  actualBendingStressMpa: number;
  allowableBendingStressMpa: number;
  bendingUtilization: number; // stress / allowable
  actualDeflectionMm: number;
  allowableDeflectionMm: number; // L / 250
  deflectionUtilization: number;
  isStructurallySafe: boolean;
  recommendedMinDepthMm: number;
}

export interface SheathingParams {
  /** Plywood / sheathing panel thickness in mm (e.g. 1.5, 3, 6, 9, 12, 15, 18, 21, 24) */
  thickness: number;
  /** Material type */
  material: "plywood_birch" | "plywood_pine" | "osb3" | "mdf" | "polycarbonate" | "balsa";
  /** Material density in kg/m3 */
  density: number;
  /** Outward offset from beams in mm */
  offsetMm?: number;
  /** Expansion seam / gap between adjacent triangle panels in mm */
  seamGapMm?: number;
  /** Visual finish style */
  finish?: "colored" | "plywood";
}

export interface ConnectorParams {
  type: "star_plate" | "pipe_hub" | "good_karma" | "spider";
  /** Central core hub diameter/size in mm (adjustable 2mm - 300mm) */
  hubDiameter: number;
  /** Ray / tab length in mm (adjustable 2mm - 300mm) */
  tabLength: number;
  /** Ray / tab width in mm (adjustable 1.5mm - 150mm) */
  tabWidth: number;
  /** Plate steel thickness in mm */
  thickness: number;
  /** Bolt diameter in mm (e.g. 1.6 for M1.6, 2 for M2, 3 for M3, 8 for M8, 10 for M10, 12 for M12) */
  boltDiameter: number;
  /** Distance from hub boundary to bolt holes */
  boltDistance: number;
  /** Number of bolt holes per ray: 1, 2, or 3 */
  boltHoleCount?: number;
  /** Center cutout style: thunder lightning bolt like Thunder Domes, round hole, or solid */
  centerCutout?: "lightning" | "circle" | "hex" | "solid";
  material: "steel_st3" | "stainless_304" | "aluminum_d16t" | "plywood";
  /** Whether proportional auto-scaling is enabled with dome diameter */
  autoProportional?: boolean;
}

export interface ConnectorRayAngleDetail {
  rayIndex: number;
  edgeId: number;
  beamType: string;
  planarAngleDeg: number; // azimuth in flat layout (0-360°)
  planarDeltaToNextDeg: number; // angle to next ray on flat plate
  spatialAngleToNextDeg: number; // 3D spatial separation angle between beams
  bendAngleDeg: number; // press-brake bend angle relative to hub plate
  pitchToHorizonDeg: number; // angle of beam relative to horizon
}

export interface ConnectorTypeSummary {
  typeId: string;
  name: string;
  rayCount: number;
  isBoundary: boolean;
  countInDome: number;
  nodeIds: number[];
  beamSignature: string; // e.g. "A - A - A - A - A"
  sampleNodeId: number;
  sampleConnector: ConnectorGeometry;
  rayDetails: ConnectorRayAngleDetail[];
}

export interface ConnectorBeam {
  edgeId: number;
  direction: Vec3;
  length: number;
  beamType: string;
  angleToHorizon: number; // deg
  azimuthAngle: number; // deg
}

export interface ConnectorGeometry {
  nodeId: number;
  position: Vec3;
  beams: ConnectorBeam[];
  angles: {
    edgeA: number;
    edgeB: number;
    angle: number;
  }[];
  beamCount: number;
  isBoundary: boolean;
  unfoldedSvgPoints?: { x: number; y: number }[];
}

export interface SheathingSheetLayout {
  sheetWidth: number; // mm (e.g. 2800)
  sheetHeight: number; // mm (e.g. 1250)
  toolDiameter?: number; // mm (4, 6, 8, 10, 12)
  margin?: number; // mm from sheet edge (e.g. 15)
  safetyGap?: number; // extra mm
  feedRateMmMin?: number; // mm/min (e.g. 3500)
  passes?: number; // depth passes
  totalPanels: number;
  panelsPerSheet: number;
  totalSheetsRequired: number;
  totalSheetAreaM2: number;
  domeSurfaceAreaM2: number;
  wastePercentage: number;
  totalLinearCutMeters?: number; // total toolpath cut length in meters
  estimatedMachiningMinutes?: number; // estimated CNC cutting time
  sheetsSummary?: {
    sheetIndex: number;
    panelCount: number;
    typesSummary: string;
    cutLengthM: number;
    usedAreaM2: number;
    wastePct: number;
  }[];
  placedPanels: {
    panelId: number;
    panelType: string;
    sheetIndex: number;
    x: number;
    y: number;
    rotationDeg: number;
    polygon: [number, number][];
    holdingTabs?: [number, number][];
    perimeterMm?: number;
  }[];
}

export interface DomeStatistics {
  nodes: number;
  edges: number;
  faces: number;
  minBeamLength: number;
  maxBeamLength: number;
  averageBeamLength: number;
  minNodeDegree: number;
  maxNodeDegree: number;
  floorAreaM2: number;
  domeSurfaceAreaM2: number;
  domeVolumeM3: number;
  baseCircumferenceM: number;
  baseRadiusMm: number;
}

export interface ValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  nodeId?: NodeId;
  edgeId?: EdgeId;
  faceId?: FaceId;
}

export interface DomeModel {
  parameters: DomeParameters;
  nodes: Node[];
  edges: Edge[];
  faces: Face[];
  beamGroups: BeamTypeGroup[];
  faceGroups: FaceTypeGroup[];
  statistics: DomeStatistics;
  validation: ValidationIssue[];
  approved: boolean;
  geometryVersion?: string;
  beamProfile: BeamProfile;
  structuralAnalysis: StructuralAnalysis;
  connectorParams: ConnectorParams;
  sheathingParams?: SheathingParams;
}
