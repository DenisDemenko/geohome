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
  /** Unique engineering node marking (e.g. "AA1", "AA2", "AB3") based on breakdown beam types & dome order */
  label?: string;
  /** Beam classification pair meeting at this hub (e.g. "AA", "AB", "BB", "BC") */
  nodeType?: string;
  /** True if this node is a plinth foundation ground anchor at Z=0 */
  isPlinthGroundNode?: boolean;
  /** True if this node is at the top of the plinth wall connecting to the dome */
  isPlinthTopNode?: boolean;
  /** Tier level / ring index from the ground (1 = base ring, 2 = 2nd level, 3 = 3rd level, etc.) */
  tierLevel?: number;
  /** True if this node was leveled to a horizontal plane parallel to the ground */
  isTierLeveled?: boolean;
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
  /** True if this beam belongs to the plinth riser wall */
  isPlinthBeam?: boolean;
  /** Role in plinth: vertical post, ground sill, or diagonal brace */
  plinthRole?: "post" | "sill" | "diagonal";
  /** Unique individual beam marking index, e.g. "E-001", "E-002" */
  beamLabel?: string;
  /** Symmetry quadrant in ellipsoid: "Q1" (+X,+Y), "Q2" (-X,+Y), "Q3" (-X,-Y), "Q4" (+X,-Y) */
  quadrant?: "Q1" | "Q2" | "Q3" | "Q4";
  /** Start node miter cut angle in degrees */
  startMiterDeg?: number;
  /** End node miter cut angle in degrees */
  endMiterDeg?: number;
  /** Side bevel angle in degrees */
  bevelDeg?: number;
}

export interface Face {
  id: FaceId;
  a: NodeId;
  b: NodeId;
  c: NodeId;
  type: string;
  normal: Vec3;
  area: number; // mm^2
  /** True if this face belongs to the plinth wall */
  isPlinthFace?: boolean;
  /** Index of the rectangular plinth bay (0 to k-1) */
  plinthBayIndex?: number;
}

export type DomeCutType =
  | "1/1"
  | "5/6"
  | "3/4"
  | "5/8"
  | "7/12"
  | "1/2"
  | "5/12"
  | "3/8"
  | "1/4"
  | "1/6"
  | "exact";

export type BaseLevelingMode = "flat_ring" | "risers";

export type TierLevelingRadialMode = "vertical" | "spherical" | "uniform_radius";

export interface TierLevelingConfig {
  /** Tier level index from ground: 2, 3, 4, 5 */
  level: number;
  /** Whether leveling is enabled for this tier */
  enabled: boolean;
  /** Reference node ID selected by user */
  referenceNodeId?: number;
  /** Reference node label (e.g. "CC4", "AB8") */
  referenceNodeLabel?: string;
  /** Target Z elevation in mm */
  targetZ?: number;
  /** Radial handling: pure vertical Z, project to sphere surface, or uniform radius ring */
  radialMode?: TierLevelingRadialMode;
}

export interface TierInfo {
  level: number;
  nodeIds: number[];
  nodeCount: number;
  minZ: number;
  maxZ: number;
  avgZ: number;
  isLeveled: boolean;
  leveledZ?: number;
  referenceNodeId?: number;
  referenceNodeLabel?: string;
  heightSpreadMm: number;
}

export interface PlinthParameters {
  /** Whether the plinth riser wall is enabled */
  enabled: boolean;
  /** Plinth height in millimetres (200 - 2000 mm, default 800 mm) */
  height: number;
}

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
  /** Optional rectangular riser wall / plinth elevating the dome (цоколь прямокутниками) */
  plinth?: PlinthParameters;
  /** Leveling configuration for node tiers 2, 3, 4, 5 parallel to ground for second floor construction */
  tierLeveling?: Record<number, TierLevelingConfig>;
  /** Optional insulation configuration between outer and inner sheathing */
  insulation?: InsulationParams;
  /** Optional door face IDs for opening retriangulation & automatic tier leveling */
  doorFaceIds?: number[];
  /** Optional door opening parameters */
  doorParams?: DoorOpeningParams;
  /** Shape type: "sphere" (standard geodesic) or "ellipsoid" (parametric oval dome) */
  shapeType?: "sphere" | "ellipsoid";
  /** Ellipsoid length along X axis in millimetres (default equals diameter) */
  ellipsoidLengthX?: number;
  /** Ellipsoid width along Y axis in millimetres (default equals diameter) */
  ellipsoidWidthY?: number;
  /** Ellipsoid height along Z axis in millimetres (default equals height) */
  ellipsoidHeightZ?: number;
}

export type InsulationMaterialId =
  | "eps_foam"
  | "mineral_wool"
  | "xps_foam"
  | "glass_wool"
  | "ecowool"
  | "wood_fiber"
  | "pir_polyiso";

export interface InsulationParams {
  enabled: boolean;
  materialId: InsulationMaterialId;
  thicknessMm: number; // 50 - 300 mm
  hasVaporBarrier: boolean; // Внутрішній паробар'єр
  hasWindBarrier: boolean; // Зовнішня супердифузійна вітрозахисна мембрана
  hasCounterBatten: boolean; // Вентиляційний зазор / контррейка
  counterBattenThicknessMm: number; // 25 - 50 mm
  wastePercentage: number; // 5 - 15% запас на обрізки трикутників
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
  width: number; // mm (e.g. 50 or diameter for circular)
  depth: number; // mm (e.g. 150 or diameter for circular)
  diameter?: number; // mm for circular cross-section [1..50 mm]
  wallThickness?: number; // mm for pipe
  type: "rectangular" | "pipe" | "circular";
  material: "pine" | "larch" | "oak" | "spruce" | "beech" | "ash" | "steel" | "aluminum";
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
  /** Plywood / sheathing panel thickness in mm (e.g. 1.5, 3, 6, 9, 12, 15, 18, 21, 24) or fabric thickness (0.5 - 1.2 mm) */
  thickness: number;
  /** Material type: timber plywoods, OSB, acrylic, balsa, or continuous fabric roll / tent cover */
  material: "plywood_birch" | "plywood_pine" | "osb3" | "mdf" | "polycarbonate" | "balsa" | "fabric_roll";
  /** Material density in kg/m3 */
  density: number;
  /** Outward offset from beams in mm */
  offsetMm?: number;
  /** Expansion seam / gap between adjacent panels in mm */
  seamGapMm?: number;
  /** Visual finish style */
  finish?: "colored" | "plywood" | "fabric";
  /** Fabric roll width in mm (500 to 2000 mm, default 1500 mm) */
  fabricRollWidthMm?: number;
  /** Seam allowance on each side for thread sewing in mm (10 to 60 mm, default 25 mm) */
  seamAllowanceMm?: number;
  /** Fabric weight / grammage in g/m2 (default 650 g/m2 for PVC / Oxford) */
  fabricGrammageGsm?: number;
  /** Foundation base skirt / hem allowance in mm (50 to 300 mm, default 150 mm) */
  hemBaseAllowanceMm?: number;
}

export interface FabricStripNode {
  nodeId: number;
  label: string; // e.g. "AA1", "V1"
  x2D: number; // mm along strip length from start of cut (including hem)
  y2D: number; // mm across strip width (0 to widthMm)
  isBoundary: boolean; // foundation base perimeter node
  isApex: boolean; // top zenith node
  originalPos: Vec3; // 3D coordinates on the dome
  connectedFaceIds: number[];
}

export interface FabricStripTriangle {
  faceId: number;
  faceType: string;
  color: string;
  nodeIds: [number, number, number];
  nodeLabels: [string, string, string];
  points2D: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number }
  ];
  center2D: { x: number; y: number };
  lengths: [number, number, number]; // mm nominal side lengths
  areaM2: number;
  isWindow?: boolean;
  isDoorway?: boolean;
}

export interface FabricStrip {
  id: number;
  name: string;
  offsetY: number; // mm from dome centerline
  domeArcLengthMm: number; // arc length over the dome from foundation edge to opposite foundation edge
  cutLengthMm: number; // total cut length with foundation hems
  widthMm: number; // raw roll width
  netWidthMm: number; // effective width without seam allowance
  seamAllowanceMm: number; // thread sewing seam allowance on each edge
  hemAllowanceMm: number; // foundation hem allowance at each end
  cutAreaM2: number;
  netAreaM2: number;
  sewingLengthMm: number;
  contour2D: [number, number][]; // 2D flat roll cut coordinates
  seamLines2D: [number, number][][]; // sewing seam guide lines
  triangles?: FabricStripTriangle[];
  nodes?: FabricStripNode[];
  faceIds?: number[]; // list of face IDs forming this strip
  isCustom?: boolean; // true if selected by user or loaded from window configuration
  minRecommendedRollWidthMm?: number; // minimum roll width needed to fit strip + seam allowances
  /** True if this strip represents the rectangular perimeter plinth band */
  isPlinthStrip?: boolean;
}

export interface FabricRollNestingLayout {
  materialType: "fabric_roll";
  materialName: string;
  rollWidthMm: number;
  seamAllowanceMm: number;
  hemAllowanceMm: number;
  fabricGrammageGsm: number;
  totalStrips: number;
  strips: FabricStrip[];
  plinthStrip?: FabricStrip;
  totalLinearMeters: number;
  totalFabricAreaM2: number;
  domeCoverAreaM2: number;
  totalSewingSeamMeters: number;
  totalFabricWeightKg: number;
  maxStripLengthMm: number;
  minStripLengthMm: number;
  centralStripArcLengthMm: number;
  customStripFaceIds?: number[];
}

export interface WindowGlazingParams {
  /** Array of face IDs that have been converted to windows / skylight glazing */
  windowFaceIds: number[];
  /** Window frame style / color */
  frameColor?: "anthracite" | "white" | "wood" | "anodized";
  /** Width of the extruded clamping frame in mm */
  frameWidthMm?: number;
  /** Glazing material / specification */
  glazingType?: "double_glass" | "polycarbonate" | "tinted";
}

export interface DoorOpeningParams {
  /** Array of face IDs that form the door opening portal */
  doorFaceIds: number[];
  /** Door opening clear width in mm (700 - 1500 mm, default 900 mm) */
  widthMm: number;
  /** Door opening clear height in mm (1800 - 2400 mm, default 2050 mm) */
  heightMm: number;
  /** Primary / entry base face ID that anchors the door */
  anchorFaceId?: number;
  /** Door frame casing color */
  frameColor?: string;
  /** Door jamb frame depth in mm */
  frameDepthMm?: number;
  /** Type of door opening */
  doorType?: "single" | "double" | "portal";
  /** Distance / outward extension of the doorway from the dome base ring in mm (0 - 1000 mm) */
  offsetFromDomeMm?: number;
  /** Distance / elevation of doorway threshold from dome base in mm (0 - 800 mm, slider controlled) */
  elevationFromBaseMm?: number;
  /** Doorway opening cluster type on the dome: auto, pentagon (5-gon) or hexagon (6-gon) */
  bayClusterType?: "auto" | "pentagon" | "hexagon" | "custom";
  /** Central hub node ID when door is inscribed inside a pentagon (5-way) or hexagon (6-way) vertex */
  clusterHubNodeId?: number;
}

export interface SolarGlazingParams {
  /** Array of face IDs converted to solar electric generation triangles (BIPV under glass) */
  solarFaceIds: number[];
  /** Peak power rating per m2 in Watts (e.g. 210 W/m2 for monocrystalline cells) */
  peakPowerPerM2: number;
  /** Cell efficiency percentage (e.g. 21.5%) */
  efficiencyPct: number;
  /** Cell type / visual style */
  cellType?: "monocrystalline" | "polycrystalline" | "bifacial";
  /** Dome compass orientation offset in degrees (0 = North, 90 = East, 180 = South, 270 = West) */
  domeOrientationDeg?: number;
  /** Geographical site latitude in degrees (default: 49.0° N) */
  latitudeDeg?: number;
  /** Whether the solar insolation heatmap coloring is active in 3D */
  heatmapEnabled?: boolean;
}

export interface InnerSheathingParams {
  enabled: boolean;
  /** Material type: plywood, drywall / plasterboard, OSB-3, chipboard / particle board */
  material: "plywood_fk" | "drywall" | "osb3" | "chipboard";
  /** Thickness in mm (e.g. 9.5 or 12.5 for drywall, 9-12 for plywood/OSB, 16 for chipboard) */
  thickness: number;
  /** Material density in kg/m3 (drywall ~800, plywood ~680, osb ~640, chipboard ~680) */
  density: number;
  /** Expansion seam / gap between adjacent triangle panels in mm */
  seamGapMm?: number;
  /** Inward offset from beams in mm */
  offsetMm?: number;
  /** Visual finish */
  finish?: "natural" | "white" | "wood_grain";
}

export interface ConnectorParams {
  type: "star_plate" | "pipe_hub" | "good_karma" | "spider";
  /** Central core hub diameter/size in mm (adjustable 2mm - 300mm) */
  hubDiameter: number;
  /** Ray / tab length in mm (adjustable 2mm - 300mm) */
  tabLength: number;
  /** Ray / tab width in mm (adjustable 1.5mm - 150mm) */
  tabWidth: number;
  /** Type of connector rays: round tubular sleeve or flat rectangular plate */
  rayType?: "auto" | "round_tube" | "plate";
  /** Wall thickness in mm for hollow round connector sleeves & central hub body (0.5 - 20.0 mm, default 2.5 mm) */
  wallThickness?: number;
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
  material: "steel_st3" | "steel_st20" | "stainless_304" | "aluminum_d16t" | "aluminum_6061" | "plastic_petg" | "plastic_abs" | "plastic_nylon" | "plywood" | string;
  /** High-level material category: steel, aluminum, or plastic */
  materialCategory?: "steel" | "aluminum" | "plastic";
  /** Anti-corrosion protective finish or powder coating */
  coating?: string;
  /** Infill percentage for 3D printed plastic connectors (50 - 100%) */
  plasticInfillPercent?: number;
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
  isPlinth?: boolean;
  isPlinthGround?: boolean;
  isPlinthTop?: boolean;
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
  materialName?: string;
  isWindowGlazing?: boolean;
  isInnerSheathing?: boolean;
  isSolarGlazing?: boolean;
  isSolarPV?: boolean;
  sheetsSummary?: {
    sheetIndex: number;
    panelCount: number;
    typesSummary: string;
    cutLengthM: number;
    usedAreaM2: number;
    wastePct: number;
  }[];
  hasOversizedPanels?: boolean;
  oversizedPanelTypes?: string[];
  maxPanelHeight?: number;
  recommendedSheetFormat?: { w: number; h: number; name: string };
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
  plinthBayCount?: number;
  plinthHeightMm?: number;
  plinthWallAreaM2?: number;
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
  windowFaceIds?: number[];
  windowParams?: WindowGlazingParams;
  doorFaceIds?: number[];
  doorParams?: DoorOpeningParams;
  solarFaceIds?: number[];
  solarParams?: SolarGlazingParams;
  innerSheathingParams?: InnerSheathingParams;
  fabricStripFaceIds?: number[];
  tiers?: TierInfo[];
}
