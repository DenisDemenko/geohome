import { DomeModel, Face, InnerSheathingParams, SheathingParams, SheathingSheetLayout } from "./types";
import { unfoldTriangleTo2D } from "./math";

export interface ToolpathConfig {
  toolDiameterMm: number; // e.g. 6mm
  feedRateMmMin: number; // e.g. 3500 mm/min
  plungeFeedRateMmMin: number; // e.g. 1200 mm/min
  spindleRpm: number; // e.g. 18000 RPM
  safeHeightMm: number; // Z clearance above surface, e.g. 15mm
  retractHeightMm: number; // Z retract plane, e.g. 5mm
  sheetThicknessMm: number; // stock thickness, e.g. 12mm
  passes: number; // number of depth passes (1, 2, 3)
  holdingTabs: boolean; // include bridge tabs to prevent parts ejection
  tabWidthMm: number; // tab width along edge, e.g. 12mm
  tabHeightMm: number; // tab thickness from bottom, e.g. 4mm
  postProcessor: "mach3" | "mach2";
  layer: "outer" | "inner";
  enableEngraving: boolean; // Auto-engrave part ID and type label on each triangle
  engravingDepthMm: number; // Depth for part ID engraving, e.g. 0.8 mm
  engravingFeedRateMmMin: number; // Feedrate during engraving, e.g. 1800 mm/min
  engravingTextHeightMm: number; // Text height for part ID, e.g. 22 mm
}

export const DEFAULT_TOOLPATH_CONFIG: ToolpathConfig = {
  toolDiameterMm: 6,
  feedRateMmMin: 3500,
  plungeFeedRateMmMin: 1200,
  spindleRpm: 18000,
  safeHeightMm: 15,
  retractHeightMm: 5,
  sheetThicknessMm: 12,
  passes: 2,
  holdingTabs: true,
  tabWidthMm: 12,
  tabHeightMm: 4,
  postProcessor: "mach3",
  layer: "outer",
  enableEngraving: true,
  engravingDepthMm: 0.8,
  engravingFeedRateMmMin: 1800,
  engravingTextHeightMm: 22
};

export type ToolpathMotionType = "rapid" | "plunge" | "cut" | "tab" | "retract" | "engrave";

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface ToolpathSegment {
  id: number;
  type: ToolpathMotionType;
  from: Point3D; // World coordinates for 3D visualization
  to: Point3D;
  localFrom: Point3D; // Workpiece coordinates (X, Y, Z) for G-code
  localTo: Point3D;
  feedrate: number;
  faceId: number;
  faceType: string;
  passIndex: number;
  gcodeLine: string;
  lengthMm: number;
}

export interface TriangleToolpath {
  faceId: number;
  faceType: string;
  segments: ToolpathSegment[];
  totalLengthMm: number;
  cutLengthMm: number;
  rapidLengthMm: number;
  engraveLengthMm: number;
  estimatedTimeSec: number;
  gcode: string;
}

export interface DomeToolpathResult {
  triangles: TriangleToolpath[];
  allSegments: ToolpathSegment[];
  totalCutLengthM: number;
  totalRapidLengthM: number;
  totalTimeSec: number;
  gcode: string;
  config: ToolpathConfig;
  totalPanelsCount: number;
  metrics: {
    totalDistanceMeters: number;
    estimatedTimeMinutes: number;
    cutLengthMeters: number;
    rapidLengthMeters: number;
    engraveLengthMeters: number;
  };
}

export interface SheetToolpathResult {
  sheetIndex: number;
  sheetWidth: number;
  sheetHeight: number;
  sheetThicknessMm: number;
  materialName: string;
  panelsCount: number;
  triangles: TriangleToolpath[];
  allSegments: ToolpathSegment[];
  totalCutLengthM: number;
  totalRapidLengthM: number;
  totalTimeSec: number;
  gcode: string;
  config: ToolpathConfig;
  totalPanelsCount: number;
  metrics: {
    totalDistanceMeters: number;
    estimatedTimeMinutes: number;
    cutLengthMeters: number;
    rapidLengthMeters: number;
    engraveLengthMeters: number;
  };
}

/**
 * Single-stroke vector stick font (Hershey style) for CNC engraving.
 * Each glyph is represented as an array of polylines normalized in [0, advance] x [0, 1.0].
 */
interface GlyphData {
  advance: number;
  strokes: [number, number][][];
}

const STICK_FONT: Record<string, GlyphData> = {
  // Digits
  "0": { advance: 0.6, strokes: [[[0.1, 0], [0.5, 0], [0.5, 1], [0.1, 1], [0.1, 0]], [[0.1, 0.1], [0.5, 0.9]]] },
  "1": { advance: 0.45, strokes: [[[0.15, 0.75], [0.3, 1], [0.3, 0]], [[0.1, 0], [0.45, 0]]] },
  "2": { advance: 0.6, strokes: [[[0.1, 0.8], [0.2, 1], [0.45, 1], [0.5, 0.8], [0.5, 0.6], [0.1, 0], [0.5, 0]]] },
  "3": { advance: 0.6, strokes: [[[0.1, 0.9], [0.15, 1], [0.45, 1], [0.5, 0.8], [0.45, 0.55], [0.25, 0.55]], [[0.45, 0.55], [0.5, 0.3], [0.45, 0], [0.15, 0], [0.1, 0.1]]] },
  "4": { advance: 0.6, strokes: [[[0.4, 0], [0.4, 1], [0.1, 0.35], [0.5, 0.35]]] },
  "5": { advance: 0.6, strokes: [[[0.5, 1], [0.1, 1], [0.1, 0.55], [0.45, 0.55], [0.5, 0.3], [0.45, 0], [0.1, 0]]] },
  "6": { advance: 0.6, strokes: [[[0.5, 0.9], [0.3, 1], [0.1, 0.7], [0.1, 0.2], [0.3, 0], [0.45, 0], [0.5, 0.2], [0.5, 0.45], [0.3, 0.55], [0.1, 0.55]]] },
  "7": { advance: 0.6, strokes: [[[0.1, 1], [0.5, 1], [0.25, 0]], [[0.2, 0.5], [0.4, 0.5]]] },
  "8": { advance: 0.6, strokes: [[[0.3, 0.55], [0.15, 0.65], [0.15, 0.9], [0.3, 1], [0.45, 1], [0.45, 0.65], [0.3, 0.55], [0.15, 0.45], [0.15, 0.1], [0.3, 0], [0.45, 0], [0.45, 0.45], [0.3, 0.55]]] },
  "9": { advance: 0.6, strokes: [[[0.5, 0.45], [0.3, 0.55], [0.15, 0.55], [0.1, 0.75], [0.15, 1], [0.35, 1], [0.5, 0.8], [0.5, 0.3], [0.3, 0], [0.1, 0.1]]] },

  // Basic Symbols
  "#": { advance: 0.65, strokes: [[[0.22, 0.05], [0.22, 0.95]], [[0.45, 0.05], [0.45, 0.95]], [[0.08, 0.35], [0.58, 0.35]], [[0.08, 0.65], [0.58, 0.65]]] },
  "-": { advance: 0.5, strokes: [[[0.1, 0.5], [0.4, 0.5]]] },
  "_": { advance: 0.5, strokes: [[[0.05, 0], [0.45, 0]]] },
  ".": { advance: 0.3, strokes: [[[0.12, 0], [0.18, 0], [0.18, 0.08], [0.12, 0.08], [0.12, 0]]] },
  ":": { advance: 0.3, strokes: [[[0.12, 0.2], [0.18, 0.2]], [[0.12, 0.7], [0.18, 0.7]]] },
  "/": { advance: 0.5, strokes: [[[0.1, 0], [0.4, 1]]] },
  "+": { advance: 0.55, strokes: [[[0.1, 0.5], [0.45, 0.5]], [[0.275, 0.2], [0.275, 0.8]]] },
  " ": { advance: 0.35, strokes: [] },

  // Latin Alphabet (A-Z)
  "A": { advance: 0.65, strokes: [[[0.1, 0], [0.32, 1], [0.55, 0]], [[0.18, 0.4], [0.47, 0.4]]] },
  "B": { advance: 0.6, strokes: [[[0.1, 0], [0.1, 1], [0.4, 1], [0.48, 0.8], [0.4, 0.55], [0.1, 0.55]], [[0.4, 0.55], [0.5, 0.3], [0.4, 0], [0.1, 0]]] },
  "C": { advance: 0.6, strokes: [[[0.5, 0.85], [0.4, 1], [0.2, 1], [0.1, 0.8], [0.1, 0.2], [0.2, 0], [0.4, 0], [0.5, 0.15]]] },
  "D": { advance: 0.65, strokes: [[[0.1, 0], [0.1, 1], [0.38, 1], [0.52, 0.75], [0.52, 0.25], [0.38, 0], [0.1, 0]]] },
  "E": { advance: 0.55, strokes: [[[0.45, 1], [0.1, 1], [0.1, 0], [0.45, 0]], [[0.1, 0.5], [0.38, 0.5]]] },
  "F": { advance: 0.55, strokes: [[[0.1, 0], [0.1, 1], [0.45, 1]], [[0.1, 0.5], [0.35, 0.5]]] },
  "G": { advance: 0.65, strokes: [[[0.5, 0.85], [0.4, 1], [0.2, 1], [0.1, 0.8], [0.1, 0.2], [0.2, 0], [0.45, 0], [0.52, 0.2], [0.52, 0.5], [0.32, 0.5]]] },
  "H": { advance: 0.65, strokes: [[[0.1, 0], [0.1, 1]], [[0.5, 0], [0.5, 1]], [[0.1, 0.5], [0.5, 0.5]]] },
  "I": { advance: 0.35, strokes: [[[0.08, 1], [0.28, 1]], [[0.18, 1], [0.18, 0]], [[0.08, 0], [0.28, 0]]] },
  "J": { advance: 0.5, strokes: [[[0.1, 0.25], [0.18, 0], [0.35, 0], [0.4, 0.2], [0.4, 1], [0.25, 1]]] },
  "K": { advance: 0.6, strokes: [[[0.1, 0], [0.1, 1]], [[0.5, 1], [0.1, 0.45], [0.5, 0]]] },
  "L": { advance: 0.55, strokes: [[[0.1, 1], [0.1, 0], [0.45, 0]]] },
  "M": { advance: 0.75, strokes: [[[0.1, 0], [0.1, 1], [0.375, 0.4], [0.65, 1], [0.65, 0]]] },
  "N": { advance: 0.65, strokes: [[[0.1, 0], [0.1, 1], [0.5, 0], [0.5, 1]]] },
  "O": { advance: 0.65, strokes: [[[0.1, 0.25], [0.1, 0.75], [0.25, 1], [0.42, 1], [0.52, 0.75], [0.52, 0.25], [0.42, 0], [0.25, 0], [0.1, 0.25]]] },
  "P": { advance: 0.6, strokes: [[[0.1, 0], [0.1, 1], [0.4, 1], [0.48, 0.8], [0.4, 0.55], [0.1, 0.55]]] },
  "Q": { advance: 0.65, strokes: [[[0.1, 0.25], [0.1, 0.75], [0.25, 1], [0.42, 1], [0.52, 0.75], [0.52, 0.25], [0.42, 0], [0.25, 0], [0.1, 0.25]], [[0.35, 0.25], [0.55, -0.05]]] },
  "R": { advance: 0.6, strokes: [[[0.1, 0], [0.1, 1], [0.4, 1], [0.48, 0.8], [0.4, 0.55], [0.1, 0.55]], [[0.32, 0.55], [0.5, 0]]] },
  "S": { advance: 0.6, strokes: [[[0.48, 0.85], [0.38, 1], [0.2, 1], [0.1, 0.8], [0.15, 0.6], [0.45, 0.45], [0.5, 0.2], [0.4, 0], [0.2, 0], [0.1, 0.15]]] },
  "T": { advance: 0.6, strokes: [[[0.05, 1], [0.55, 1]], [[0.3, 1], [0.3, 0]]] },
  "U": { advance: 0.65, strokes: [[[0.1, 1], [0.1, 0.25], [0.22, 0], [0.42, 0], [0.52, 0.25], [0.52, 1]]] },
  "V": { advance: 0.6, strokes: [[[0.1, 1], [0.3, 0], [0.5, 1]]] },
  "W": { advance: 0.8, strokes: [[[0.1, 1], [0.22, 0], [0.4, 0.6], [0.58, 0], [0.7, 1]]] },
  "X": { advance: 0.6, strokes: [[[0.1, 1], [0.5, 0]], [[0.1, 0], [0.5, 1]]] },
  "Y": { advance: 0.6, strokes: [[[0.1, 1], [0.3, 0.5], [0.5, 1]], [[0.3, 0.5], [0.3, 0]]] },
  "Z": { advance: 0.6, strokes: [[[0.1, 1], [0.5, 1], [0.1, 0], [0.5, 0]], [[0.2, 0.5], [0.4, 0.5]]] },

  // Ukrainian / Cyrillic specific glyphs
  "Б": { advance: 0.6, strokes: [[[0.5, 1], [0.1, 1], [0.1, 0], [0.42, 0], [0.5, 0.22], [0.42, 0.5], [0.1, 0.5]]] },
  "Г": { advance: 0.55, strokes: [[[0.1, 0], [0.1, 1], [0.48, 1]]] },
  "Ґ": { advance: 0.55, strokes: [[[0.1, 0], [0.1, 1], [0.48, 1]], [[0.4, 1], [0.5, 1.15]]] },
  "Д": { advance: 0.65, strokes: [[[0.08, 0.15], [0.08, 0], [0.08, 0.15], [0.52, 0.15], [0.52, 0]], [[0.14, 0.15], [0.24, 1], [0.38, 1], [0.46, 0.15]]] },
  "Є": { advance: 0.6, strokes: [[[0.5, 0.85], [0.4, 1], [0.2, 1], [0.1, 0.8], [0.1, 0.2], [0.2, 0], [0.4, 0], [0.5, 0.15]], [[0.1, 0.5], [0.4, 0.5]]] },
  "Ж": { advance: 0.75, strokes: [[[0.375, 1], [0.375, 0]], [[0.1, 1], [0.375, 0.5], [0.1, 0]], [[0.65, 1], [0.375, 0.5], [0.65, 0]], [[0.1, 0.5], [0.65, 0.5]]] },
  "З": { advance: 0.55, strokes: [[[0.1, 0.9], [0.18, 1], [0.42, 1], [0.48, 0.8], [0.42, 0.55], [0.25, 0.55]], [[0.42, 0.55], [0.5, 0.3], [0.42, 0], [0.15, 0], [0.1, 0.1]]] },
  "И": { advance: 0.65, strokes: [[[0.1, 0], [0.1, 1]], [[0.5, 0], [0.5, 1]], [[0.1, 0], [0.5, 1]]] },
  "І": { advance: 0.35, strokes: [[[0.08, 1], [0.28, 1]], [[0.18, 1], [0.18, 0]], [[0.08, 0], [0.28, 0]]] },
  "Ї": { advance: 0.35, strokes: [[[0.08, 1], [0.28, 1]], [[0.18, 1], [0.18, 0]], [[0.08, 0], [0.28, 0]], [[0.12, 1.15], [0.12, 1.2]], [[0.24, 1.15], [0.24, 1.2]]] },
  "Й": { advance: 0.65, strokes: [[[0.1, 0], [0.1, 1]], [[0.5, 0], [0.5, 1]], [[0.1, 0], [0.5, 1]], [[0.2, 1.15], [0.3, 1.08], [0.4, 1.15]]] },
  "Л": { advance: 0.6, strokes: [[[0.1, 0], [0.25, 1], [0.5, 1], [0.5, 0]]] },
  "П": { advance: 0.6, strokes: [[[0.1, 0], [0.1, 1], [0.5, 1], [0.5, 0]]] },
  "У": { advance: 0.6, strokes: [[[0.1, 1], [0.3, 0.45], [0.5, 1]], [[0.3, 0.45], [0.15, -0.15]]] },
  "Ф": { advance: 0.7, strokes: [[[0.35, 1], [0.35, 0]], [[0.35, 0.8], [0.15, 0.8], [0.12, 0.55], [0.15, 0.3], [0.35, 0.3]], [[0.35, 0.8], [0.55, 0.8], [0.58, 0.55], [0.55, 0.3], [0.35, 0.3]]] },
  "Ц": { advance: 0.65, strokes: [[[0.1, 1], [0.1, 0.12], [0.5, 0.12], [0.5, 1]], [[0.5, 0.12], [0.58, 0.12], [0.58, -0.05]]] },
  "Ч": { advance: 0.6, strokes: [[[0.1, 1], [0.1, 0.6], [0.45, 0.6]], [[0.45, 1], [0.45, 0]]] },
  "Ш": { advance: 0.75, strokes: [[[0.1, 1], [0.1, 0], [0.65, 0], [0.65, 1]], [[0.375, 0], [0.375, 1]]] },
  "Щ": { advance: 0.8, strokes: [[[0.1, 1], [0.1, 0.1], [0.65, 0.1], [0.65, 1]], [[0.375, 0.1], [0.375, 1]], [[0.65, 0.1], [0.72, 0.1], [0.72, -0.05]]] },
  "Ь": { advance: 0.55, strokes: [[[0.1, 0], [0.1, 1]], [[0.1, 0.55], [0.38, 0.55], [0.48, 0.35], [0.38, 0], [0.1, 0]]] },
  "Ю": { advance: 0.75, strokes: [[[0.1, 0], [0.1, 1]], [[0.1, 0.5], [0.3, 0.5]], [[0.3, 0.25], [0.3, 0.75], [0.45, 1], [0.62, 0.75], [0.62, 0.25], [0.45, 0], [0.3, 0.25]]] },
  "Я": { advance: 0.6, strokes: [[[0.48, 0], [0.48, 1], [0.2, 1], [0.12, 0.75], [0.2, 0.52], [0.48, 0.52]], [[0.28, 0.52], [0.12, 0]]] }
};

/**
 * Generates single-stroke 2D polylines for engraving part text inside a polygon.
 * Automatically fits inside maxBoundingRadius (e.g. triangle inradius).
 */
export function generateTextEngravingPaths(
  text: string,
  centerX: number,
  centerY: number,
  requestedHeight: number = 22,
  maxBoundingRadius?: number
): Array<Array<{ x: number; y: number }>> {
  const cleanStr = (text || "").toUpperCase().trim();
  if (!cleanStr) return [];

  // Calculate total natural width in normalized font units
  let totalAdvance = 0;
  const glyphs: GlyphData[] = [];
  const charSpacing = 0.12;

  for (let i = 0; i < cleanStr.length; i++) {
    const ch = cleanStr[i];
    const g = STICK_FONT[ch] || STICK_FONT[ch.toUpperCase()] || {
      advance: 0.5,
      strokes: [[[0.1, 0.1], [0.4, 0.1], [0.4, 0.9], [0.1, 0.9], [0.1, 0.1]]]
    };
    glyphs.push(g);
    totalAdvance += g.advance + (i < cleanStr.length - 1 ? charSpacing : 0);
  }

  // Determine effective scale based on bounding constraint
  let effHeight = Math.max(10, requestedHeight);
  if (maxBoundingRadius && maxBoundingRadius > 10) {
    const textDiag = Math.hypot(totalAdvance * effHeight, effHeight);
    const maxAllowedDiag = maxBoundingRadius * 1.5;
    if (textDiag > maxAllowedDiag) {
      effHeight = Math.max(8, (maxAllowedDiag / textDiag) * effHeight);
    }
  }

  const textTotalWidth = totalAdvance * effHeight;
  const startX = centerX - textTotalWidth / 2;
  const startY = centerY - effHeight / 2;

  const result: Array<Array<{ x: number; y: number }>> = [];
  let currX = startX;

  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    for (const stroke of g.strokes) {
      if (stroke.length < 2) continue;
      const polyline: Array<{ x: number; y: number }> = [];
      for (const pt of stroke) {
        polyline.push({
          x: currX + pt[0] * effHeight,
          y: startY + pt[1] * effHeight
        });
      }
      result.push(polyline);
    }
    currX += (g.advance + charSpacing) * effHeight;
  }

  return result;
}

/**
 * Offsets a simple 2D polygon outwards by tool radius (cutter radius compensation).
 * Correctly accounts for corner angle bisectors and polygon winding.
 */
export function offsetPolygon2D(pts: [number, number][], offsetDistance: number): [number, number][] {
  const n = pts.length;
  if (n < 3) return pts;

  // Signed area to verify winding order
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    signedArea += (pts[i][0] * pts[next][1] - pts[next][0] * pts[i][1]);
  }
  const isCCW = signedArea > 0;

  // Calculate outward normal for each edge
  const edgeNormals: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    const dx = pts[next][0] - pts[i][0];
    const dy = pts[next][1] - pts[i][1];
    const len = Math.hypot(dx, dy) || 1;
    // For CCW, outward normal is (dy / len, -dx / len)
    // For CW, outward normal is (-dy / len, dx / len)
    const nx = isCCW ? (dy / len) : (-dy / len);
    const ny = isCCW ? (-dx / len) : (dx / len);
    edgeNormals.push({ x: nx, y: ny });
  }

  // Intersect shifted edge lines at each vertex
  const result: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const prev = (i + n - 1) % n;
    const nPrev = edgeNormals[prev];
    const nCur = edgeNormals[i];

    const sumX = nPrev.x + nCur.x;
    const sumY = nPrev.y + nCur.y;
    const dot = 1 + (nPrev.x * nCur.x + nPrev.y * nCur.y);
    const scale = dot > 0.001 ? (2 * offsetDistance) / dot : offsetDistance;

    result.push([
      pts[i][0] + sumX * scale * 0.5,
      pts[i][1] + sumY * scale * 0.5
    ]);
  }

  return result;
}

/**
 * Offsets a 2D triangle outwards in its plane by tool radius (cutter compensation).
 * Vertices are in counter-clockwise order: pA, pB, pC.
 */
function offsetTriangle2D(
  pA: { x: number; y: number },
  pB: { x: number; y: number },
  pC: { x: number; y: number },
  offsetDistance: number
): [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }] {
  const pts = [pA, pB, pC];

  // Calculate unit outward normal for each edge
  const edgeNormals: { x: number; y: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const next = (i + 1) % 3;
    const dx = pts[next].x - pts[i].x;
    const dy = pts[next].y - pts[i].y;
    const len = Math.hypot(dx, dy) || 1;
    // Rotate 90 deg clockwise for right-hand outward normal
    const nx = dy / len;
    const ny = -dx / len;
    edgeNormals.push({ x: nx, y: ny });
  }

  // Intersect shifted edge lines:
  // Line i: passes through (pts[i] + N_i * dist) along direction D_i
  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const prev = (i + 2) % 3;
    const nPrev = edgeNormals[prev];
    const nCur = edgeNormals[i];

    // Bisector offset vector at vertex i
    const sumX = nPrev.x + nCur.x;
    const sumY = nPrev.y + nCur.y;
    const dot = 1 + (nPrev.x * nCur.x + nPrev.y * nCur.y);
    const scale = dot > 0.001 ? (2 * offsetDistance) / dot : offsetDistance;

    result.push({
      x: pts[i].x + sumX * scale * 0.5,
      y: pts[i].y + sumY * scale * 0.5
    });
  }

  return [result[0], result[1], result[2]];
}

/**
 * Calculates the complete CAM toolpath and Mach3/Mach2 G-code
 * for sheathing triangles of the geodesic dome.
 */
export function calculateDomeToolpath(
  model: DomeModel,
  userConfig?: Partial<ToolpathConfig>,
  selectedFaceId?: number | null,
  triangleTypeFilter?: string | null
): DomeToolpathResult {
  const config: ToolpathConfig = {
    ...DEFAULT_TOOLPATH_CONFIG,
    ...userConfig
  };

  // Determine material thickness & offset based on layer
  const effBeamDepth =
    model.beamProfile.type === "circular" || model.beamProfile.type === "pipe"
      ? model.beamProfile.diameter || model.beamProfile.width
      : model.beamProfile.depth;

  const isInner = config.layer === "inner";
  const outwardOffset = isInner
    ? -((effBeamDepth / 2) + 1.2 + (model.innerSheathingParams?.offsetMm || 0))
    : Math.max(1, (effBeamDepth / 2) + 1.2 + (model.sheathingParams?.offsetMm || 0));

  const excludedFaceIds = new Set<number>();
  (model.doorFaceIds || []).forEach(id => excludedFaceIds.add(id));
  (model.windowFaceIds || []).forEach(id => excludedFaceIds.add(id));
  (model.solarFaceIds || []).forEach(id => excludedFaceIds.add(id));

  // Filter candidate faces
  let candidateFaces = model.faces.filter(f => !excludedFaceIds.has(f.id));

  if (triangleTypeFilter) {
    candidateFaces = candidateFaces.filter(f => f.type === triangleTypeFilter);
  }

  if (selectedFaceId !== undefined && selectedFaceId !== null) {
    const single = candidateFaces.find(f => f.id === selectedFaceId);
    if (single) {
      candidateFaces = [single];
    }
  }

  const toolRadius = config.toolDiameterMm / 2;
  const passDepth = config.sheetThicknessMm / Math.max(1, config.passes);

  let globalSegmentId = 1;
  const triangles: TriangleToolpath[] = [];
  const allSegments: ToolpathSegment[] = [];

  let lastWorldPos: Point3D = { x: 0, y: 0, z: model.parameters.height + 500 };

  candidateFaces.forEach((face) => {
    const pA_orig = model.nodes[face.a].position;
    const pB_orig = model.nodes[face.b].position;
    const pC_orig = model.nodes[face.c].position;

    // 3D vectors
    const vA = { x: pA_orig.x, y: pA_orig.y, z: pA_orig.z };
    const vB = { x: pB_orig.x, y: pB_orig.y, z: pB_orig.z };
    const vC = { x: pC_orig.x, y: pC_orig.y, z: pC_orig.z };

    // Centroid
    const cen = {
      x: (vA.x + vB.x + vC.x) / 3,
      y: (vA.y + vB.y + vC.y) / 3,
      z: (vA.z + vB.z + vC.z) / 3
    };

    // Face normal
    const ab = { x: vB.x - vA.x, y: vB.y - vA.y, z: vB.z - vA.z };
    const ac = { x: vC.x - vA.x, y: vC.y - vA.y, z: vC.z - vA.z };
    let nx = ab.y * ac.z - ab.z * ac.y;
    let ny = ab.z * ac.x - ab.x * ac.z;
    let nz = ab.x * ac.y - ab.y * ac.x;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    nx /= nLen;
    ny /= nLen;
    nz /= nLen;

    // Ensure normal points outward
    if (nx * cen.x + ny * cen.y + nz * cen.z < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }

    // Invert normal for inner sheathing tool entry
    const entryNx = isInner ? -nx : nx;
    const entryNy = isInner ? -ny : ny;
    const entryNz = isInner ? -nz : nz;

    // Apply physical offset from frame
    const baseVA = { x: vA.x + nx * outwardOffset, y: vA.y + ny * outwardOffset, z: vA.z + nz * outwardOffset };
    const baseVB = { x: vB.x + nx * outwardOffset, y: vB.y + ny * outwardOffset, z: vB.z + nz * outwardOffset };
    const baseVC = { x: vC.x + nx * outwardOffset, y: vC.y + ny * outwardOffset, z: vC.z + nz * outwardOffset };

    // 2D unfolded lengths for local G-code coordinates
    const sideAB = Math.hypot(vB.x - vA.x, vB.y - vA.y, vB.z - vA.z);
    const sideBC = Math.hypot(vC.x - vB.x, vC.y - vB.y, vC.z - vB.z);
    const sideCA = Math.hypot(vA.x - vC.x, vA.y - vC.y, vA.z - vC.z);
    const coords2D = unfoldTriangleTo2D(Math.round(sideBC), Math.round(sideCA), Math.round(sideAB));

    // Calculate offset 2D vertices for cutter compensation
    const offset2D = offsetTriangle2D(
      coords2D.pA,
      coords2D.pB,
      coords2D.pC,
      toolRadius
    );

    // Also calculate outward toolpath offset in 3D:
    // Scale triangle slightly outwards from centroid by (1 + toolRadius / avgRadius)
    const baseCen = {
      x: (baseVA.x + baseVB.x + baseVC.x) / 3,
      y: (baseVA.y + baseVB.y + baseVC.y) / 3,
      z: (baseVA.z + baseVB.z + baseVC.z) / 3
    };

    const avgRadius = (
      Math.hypot(baseVA.x - baseCen.x, baseVA.y - baseCen.y, baseVA.z - baseCen.z) +
      Math.hypot(baseVB.x - baseCen.x, baseVB.y - baseCen.y, baseVB.z - baseCen.z) +
      Math.hypot(baseVC.x - baseCen.x, baseVC.y - baseCen.y, baseVC.z - baseCen.z)
    ) / 3;

    const offsetScale = 1 + toolRadius / Math.max(10, avgRadius);

    const t3dA = {
      x: baseCen.x + (baseVA.x - baseCen.x) * offsetScale,
      y: baseCen.y + (baseVA.y - baseCen.y) * offsetScale,
      z: baseCen.z + (baseVA.z - baseCen.z) * offsetScale
    };
    const t3dB = {
      x: baseCen.x + (baseVB.x - baseCen.x) * offsetScale,
      y: baseCen.y + (baseVB.y - baseCen.y) * offsetScale,
      z: baseCen.z + (baseVB.z - baseCen.z) * offsetScale
    };
    const t3dC = {
      x: baseCen.x + (baseVC.x - baseCen.x) * offsetScale,
      y: baseCen.y + (baseVC.y - baseCen.y) * offsetScale,
      z: baseCen.z + (baseVC.z - baseCen.z) * offsetScale
    };

    const poly3D = [t3dA, t3dB, t3dC];
    const poly2D = offset2D;

    const triangleSegments: ToolpathSegment[] = [];

    // 0. Auto-Engraving Part ID and Type on face before cutting perimeter
    let engraveLastWorldPos = lastWorldPos;
    if (config.enableEngraving) {
      const labelText = `#${face.id} ${face.type}`;
      const cen2dX = (coords2D.pA.x + coords2D.pB.x + coords2D.pC.x) / 3;
      const cen2dY = (coords2D.pA.y + coords2D.pB.y + coords2D.pC.y) / 3;
      const faceInradius = Math.min(sideAB, sideBC, sideCA) * 0.288;

      const uNorm = {
        x: (baseVB.x - baseVA.x) / Math.max(0.1, sideAB),
        y: (baseVB.y - baseVA.y) / Math.max(0.1, sideAB),
        z: (baseVB.z - baseVA.z) / Math.max(0.1, sideAB)
      };
      const vNorm = {
        x: entryNy * uNorm.z - entryNz * uNorm.y,
        y: entryNz * uNorm.x - entryNx * uNorm.z,
        z: entryNx * uNorm.y - entryNy * uNorm.x
      };

      const strokes = generateTextEngravingPaths(
        labelText,
        cen2dX,
        cen2dY,
        config.engravingTextHeightMm,
        faceInradius * 0.75
      );

      strokes.forEach(stroke => {
        if (stroke.length < 2) return;
        const p0 = stroke[0];
        const dx0 = p0.x - cen2dX;
        const dy0 = p0.y - cen2dY;

        const p0_3d = {
          x: baseCen.x + uNorm.x * dx0 + vNorm.x * dy0 - entryNx * config.engravingDepthMm,
          y: baseCen.y + uNorm.y * dx0 + vNorm.y * dy0 - entryNy * config.engravingDepthMm,
          z: baseCen.z + uNorm.z * dx0 + vNorm.z * dy0 - entryNz * config.engravingDepthMm
        };
        const p0_safe3d = {
          x: p0_3d.x + entryNx * (config.retractHeightMm + config.engravingDepthMm),
          y: p0_3d.y + entryNy * (config.retractHeightMm + config.engravingDepthMm),
          z: p0_3d.z + entryNz * (config.retractHeightMm + config.engravingDepthMm)
        };
        const localP0 = { x: p0.x, y: p0.y, z: -config.engravingDepthMm };
        const localSafeP0 = { x: p0.x, y: p0.y, z: config.retractHeightMm };

        // Rapid to above stroke start
        const rSeg: ToolpathSegment = {
          id: globalSegmentId++,
          type: "rapid",
          from: { ...engraveLastWorldPos },
          to: p0_safe3d,
          localFrom: { ...localSafeP0 },
          localTo: localSafeP0,
          feedrate: 6000,
          faceId: face.id,
          faceType: face.type,
          passIndex: 0,
          gcodeLine: `G0 X${p0.x.toFixed(3)} Y${p0.y.toFixed(3)} Z${config.retractHeightMm.toFixed(3)}`,
          lengthMm: Math.hypot(p0_safe3d.x - engraveLastWorldPos.x, p0_safe3d.y - engraveLastWorldPos.y, p0_safe3d.z - engraveLastWorldPos.z)
        };
        triangleSegments.push(rSeg);

        // Plunge to engraving depth
        const plSeg: ToolpathSegment = {
          id: globalSegmentId++,
          type: "plunge",
          from: p0_safe3d,
          to: p0_3d,
          localFrom: localSafeP0,
          localTo: localP0,
          feedrate: config.plungeFeedRateMmMin,
          faceId: face.id,
          faceType: face.type,
          passIndex: 1,
          gcodeLine: `G1 Z${(-config.engravingDepthMm).toFixed(3)} F${config.plungeFeedRateMmMin}`,
          lengthMm: config.retractHeightMm + config.engravingDepthMm
        };
        triangleSegments.push(plSeg);

        // Cut stroke segments
        let prev3D = p0_3d;
        let prevLocal = localP0;
        for (let k = 1; k < stroke.length; k++) {
          const pt = stroke[k];
          const dx = pt.x - cen2dX;
          const dy = pt.y - cen2dY;
          const pt_3d = {
            x: baseCen.x + uNorm.x * dx + vNorm.x * dy - entryNx * config.engravingDepthMm,
            y: baseCen.y + uNorm.y * dx + vNorm.y * dy - entryNy * config.engravingDepthMm,
            z: baseCen.z + uNorm.z * dx + vNorm.z * dy - entryNz * config.engravingDepthMm
          };
          const localPt = { x: pt.x, y: pt.y, z: -config.engravingDepthMm };
          const segDist = Math.hypot(pt.x - stroke[k - 1].x, pt.y - stroke[k - 1].y);

          const engSeg: ToolpathSegment = {
            id: globalSegmentId++,
            type: "engrave",
            from: prev3D,
            to: pt_3d,
            localFrom: prevLocal,
            localTo: localPt,
            feedrate: config.engravingFeedRateMmMin,
            faceId: face.id,
            faceType: face.type,
            passIndex: 1,
            gcodeLine: `G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} F${config.engravingFeedRateMmMin}`,
            lengthMm: segDist
          };
          triangleSegments.push(engSeg);
          prev3D = pt_3d;
          prevLocal = localPt;
        }

        // Retract to safe clearance
        const ret3D = {
          x: prev3D.x + entryNx * (config.retractHeightMm + config.engravingDepthMm),
          y: prev3D.y + entryNy * (config.retractHeightMm + config.engravingDepthMm),
          z: prev3D.z + entryNz * (config.retractHeightMm + config.engravingDepthMm)
        };
        const retSeg: ToolpathSegment = {
          id: globalSegmentId++,
          type: "retract",
          from: prev3D,
          to: ret3D,
          localFrom: prevLocal,
          localTo: { x: prevLocal.x, y: prevLocal.y, z: config.retractHeightMm },
          feedrate: 6000,
          faceId: face.id,
          faceType: face.type,
          passIndex: 1,
          gcodeLine: `G0 Z${config.retractHeightMm.toFixed(3)}`,
          lengthMm: config.retractHeightMm + config.engravingDepthMm
        };
        triangleSegments.push(retSeg);
        engraveLastWorldPos = ret3D;
      });
    }

    // 1. Rapid move (G0) from previous position to Safe Height above start point
    const start3D = poly3D[0];
    const safeStart3D = {
      x: start3D.x + entryNx * config.safeHeightMm,
      y: start3D.y + entryNy * config.safeHeightMm,
      z: start3D.z + entryNz * config.safeHeightMm
    };

    const localSafeStart = {
      x: Math.round(poly2D[0].x * 100) / 100,
      y: Math.round(poly2D[0].y * 100) / 100,
      z: config.safeHeightMm
    };

    const rapidDist = Math.hypot(
      safeStart3D.x - engraveLastWorldPos.x,
      safeStart3D.y - engraveLastWorldPos.y,
      safeStart3D.z - engraveLastWorldPos.z
    );

    const g0Seg: ToolpathSegment = {
      id: globalSegmentId++,
      type: "rapid",
      from: { ...engraveLastWorldPos },
      to: safeStart3D,
      localFrom: { ...localSafeStart, z: config.safeHeightMm },
      localTo: localSafeStart,
      feedrate: 6000,
      faceId: face.id,
      faceType: face.type,
      passIndex: 0,
      gcodeLine: `G0 X${localSafeStart.x.toFixed(3)} Y${localSafeStart.y.toFixed(3)} Z${config.safeHeightMm.toFixed(3)}`,
      lengthMm: rapidDist
    };
    triangleSegments.push(g0Seg);

    // 2. Iterate depth passes
    for (let pass = 1; pass <= config.passes; pass++) {
      const currentDepth = pass * passDepth;
      const isLastPass = pass === config.passes;

      // Plunge move (G1) to cutting depth
      const cutStart3D = {
        x: start3D.x - entryNx * currentDepth,
        y: start3D.y - entryNy * currentDepth,
        z: start3D.z - entryNz * currentDepth
      };

      const localCutStart = {
        x: localSafeStart.x,
        y: localSafeStart.y,
        z: -currentDepth
      };

      const plungeDist = pass === 1 ? config.safeHeightMm + currentDepth : passDepth;
      const plungeSeg: ToolpathSegment = {
        id: globalSegmentId++,
        type: "plunge",
        from: pass === 1 ? safeStart3D : {
          x: start3D.x - entryNx * ((pass - 1) * passDepth),
          y: start3D.y - entryNy * ((pass - 1) * passDepth),
          z: start3D.z - entryNz * ((pass - 1) * passDepth)
        },
        to: cutStart3D,
        localFrom: { ...localCutStart, z: pass === 1 ? config.safeHeightMm : -((pass - 1) * passDepth) },
        localTo: localCutStart,
        feedrate: config.plungeFeedRateMmMin,
        faceId: face.id,
        faceType: face.type,
        passIndex: pass,
        gcodeLine: `G1 Z${(-currentDepth).toFixed(3)} F${config.plungeFeedRateMmMin}`,
        lengthMm: plungeDist
      };
      triangleSegments.push(plungeSeg);

      // Cutting contour around edges: 0->1, 1->2, 2->0
      for (let edgeIdx = 0; edgeIdx < 3; edgeIdx++) {
        const nextIdx = (edgeIdx + 1) % 3;
        const p1_3d = poly3D[edgeIdx];
        const p2_3d = poly3D[nextIdx];
        const p1_2d = poly2D[edgeIdx];
        const p2_2d = poly2D[nextIdx];

        const edgeLen = Math.hypot(p2_3d.x - p1_3d.x, p2_3d.y - p1_3d.y, p2_3d.z - p1_3d.z);

        // If holding tabs enabled on the final pass, create a tab at edge center
        if (config.holdingTabs && isLastPass && edgeLen > config.tabWidthMm * 2) {
          const tabHalfRatio = (config.tabWidthMm / 2) / edgeLen;
          const t1 = 0.5 - tabHalfRatio;
          const t2 = 0.5 + tabHalfRatio;

          // Point before tab
          const tabStart3D = {
            x: p1_3d.x + (p2_3d.x - p1_3d.x) * t1 - entryNx * currentDepth,
            y: p1_3d.y + (p2_3d.y - p1_3d.y) * t1 - entryNy * currentDepth,
            z: p1_3d.z + (p2_3d.z - p1_3d.z) * t1 - entryNz * currentDepth
          };
          const tabStart2D = {
            x: p1_2d.x + (p2_2d.x - p1_2d.x) * t1,
            y: p1_2d.y + (p2_2d.y - p1_2d.y) * t1,
            z: -currentDepth
          };

          // Segment to tab start
          const segToTab: ToolpathSegment = {
            id: globalSegmentId++,
            type: "cut",
            from: edgeIdx === 0 && pass === 1 ? cutStart3D : {
              x: p1_3d.x - entryNx * currentDepth,
              y: p1_3d.y - entryNy * currentDepth,
              z: p1_3d.z - entryNz * currentDepth
            },
            to: tabStart3D,
            localFrom: { ...p1_2d, z: -currentDepth },
            localTo: tabStart2D,
            feedrate: config.feedRateMmMin,
            faceId: face.id,
            faceType: face.type,
            passIndex: pass,
            gcodeLine: `G1 X${tabStart2D.x.toFixed(3)} Y${tabStart2D.y.toFixed(3)} F${config.feedRateMmMin}`,
            lengthMm: edgeLen * t1
          };
          triangleSegments.push(segToTab);

          // Tab bridge (tool lifts up by tabHeight)
          const tabDepth = Math.max(0, currentDepth - config.tabHeightMm);
          const tabBridgeEnd3D = {
            x: p1_3d.x + (p2_3d.x - p1_3d.x) * t2 - entryNx * tabDepth,
            y: p1_3d.y + (p2_3d.y - p1_3d.y) * t2 - entryNy * tabDepth,
            z: p1_3d.z + (p2_3d.z - p1_3d.z) * t2 - entryNz * tabDepth
          };
          const tabBridgeEnd2D = {
            x: p1_2d.x + (p2_2d.x - p1_2d.x) * t2,
            y: p1_2d.y + (p2_2d.y - p1_2d.y) * t2,
            z: -tabDepth
          };

          const tabSeg: ToolpathSegment = {
            id: globalSegmentId++,
            type: "tab",
            from: tabStart3D,
            to: tabBridgeEnd3D,
            localFrom: tabStart2D,
            localTo: tabBridgeEnd2D,
            feedrate: Math.round(config.feedRateMmMin * 0.7),
            faceId: face.id,
            faceType: face.type,
            passIndex: pass,
            gcodeLine: `G1 Z${(-tabDepth).toFixed(3)} F${config.plungeFeedRateMmMin}\nG1 X${tabBridgeEnd2D.x.toFixed(3)} Y${tabBridgeEnd2D.y.toFixed(3)} F${Math.round(config.feedRateMmMin * 0.7)}\nG1 Z${(-currentDepth).toFixed(3)} F${config.plungeFeedRateMmMin}`,
            lengthMm: config.tabWidthMm
          };
          triangleSegments.push(tabSeg);

          // Segment from tab end to edge vertex
          const edgeEnd3D = {
            x: p2_3d.x - entryNx * currentDepth,
            y: p2_3d.y - entryNy * currentDepth,
            z: p2_3d.z - entryNz * currentDepth
          };
          const edgeEnd2D = {
            x: p2_2d.x,
            y: p2_2d.y,
            z: -currentDepth
          };

          const segAfterTab: ToolpathSegment = {
            id: globalSegmentId++,
            type: "cut",
            from: tabBridgeEnd3D,
            to: edgeEnd3D,
            localFrom: tabBridgeEnd2D,
            localTo: edgeEnd2D,
            feedrate: config.feedRateMmMin,
            faceId: face.id,
            faceType: face.type,
            passIndex: pass,
            gcodeLine: `G1 X${edgeEnd2D.x.toFixed(3)} Y${edgeEnd2D.y.toFixed(3)} F${config.feedRateMmMin}`,
            lengthMm: edgeLen * (1 - t2)
          };
          triangleSegments.push(segAfterTab);
        } else {
          // Direct uninterrupted edge cut
          const edgeFrom3D = {
            x: p1_3d.x - entryNx * currentDepth,
            y: p1_3d.y - entryNy * currentDepth,
            z: p1_3d.z - entryNz * currentDepth
          };
          const edgeTo3D = {
            x: p2_3d.x - entryNx * currentDepth,
            y: p2_3d.y - entryNy * currentDepth,
            z: p2_3d.z - entryNz * currentDepth
          };
          const edgeTo2D = {
            x: p2_2d.x,
            y: p2_2d.y,
            z: -currentDepth
          };

          const cutSeg: ToolpathSegment = {
            id: globalSegmentId++,
            type: "cut",
            from: edgeFrom3D,
            to: edgeTo3D,
            localFrom: { ...p1_2d, z: -currentDepth },
            localTo: edgeTo2D,
            feedrate: config.feedRateMmMin,
            faceId: face.id,
            faceType: face.type,
            passIndex: pass,
            gcodeLine: `G1 X${edgeTo2D.x.toFixed(3)} Y${edgeTo2D.y.toFixed(3)} F${config.feedRateMmMin}`,
            lengthMm: edgeLen
          };
          triangleSegments.push(cutSeg);
        }
      }
    }

    // 3. Retract move (G0) to Safe Clearance Height at end of triangle
    const lastCutPos3D = {
      x: start3D.x - entryNx * config.sheetThicknessMm,
      y: start3D.y - entryNy * config.sheetThicknessMm,
      z: start3D.z - entryNz * config.sheetThicknessMm
    };
    const retract3D = {
      x: start3D.x + entryNx * config.safeHeightMm,
      y: start3D.y + entryNy * config.safeHeightMm,
      z: start3D.z + entryNz * config.safeHeightMm
    };

    const retractSeg: ToolpathSegment = {
      id: globalSegmentId++,
      type: "retract",
      from: lastCutPos3D,
      to: retract3D,
      localFrom: { ...localSafeStart, z: -config.sheetThicknessMm },
      localTo: localSafeStart,
      feedrate: 6000,
      faceId: face.id,
      faceType: face.type,
      passIndex: config.passes,
      gcodeLine: `G0 Z${config.safeHeightMm.toFixed(3)}`,
      lengthMm: config.sheetThicknessMm + config.safeHeightMm
    };
    triangleSegments.push(retractSeg);

    lastWorldPos = retract3D;

    // Tally lengths and times for this triangle
    let tCutLen = 0;
    let tRapidLen = 0;
    let tEngraveLen = 0;
    let tTime = 0;

    triangleSegments.forEach(s => {
      if (s.type === "cut" || s.type === "tab") {
        tCutLen += s.lengthMm;
        tTime += (s.lengthMm / s.feedrate) * 60;
      } else if (s.type === "engrave") {
        tEngraveLen += s.lengthMm;
        tTime += (s.lengthMm / (s.feedrate || config.engravingFeedRateMmMin)) * 60;
      } else if (s.type === "plunge") {
        tCutLen += s.lengthMm;
        tTime += (s.lengthMm / s.feedrate) * 60;
      } else {
        tRapidLen += s.lengthMm;
        tTime += (s.lengthMm / (s.feedrate || 6000)) * 60;
      }
    });

    const triGCode = triangleSegments.map(s => s.gcodeLine).join("\n");

    triangles.push({
      faceId: face.id,
      faceType: face.type,
      segments: triangleSegments,
      totalLengthMm: tCutLen + tRapidLen + tEngraveLen,
      cutLengthMm: tCutLen,
      rapidLengthMm: tRapidLen,
      engraveLengthMm: tEngraveLen,
      estimatedTimeSec: Math.round(tTime),
      gcode: triGCode
    });

    allSegments.push(...triangleSegments);
  });

  // Calculate totals
  let totalCutLenMm = 0;
  let totalRapidLenMm = 0;
  let totalEngraveLenMm = 0;
  let totalTimeSec = 0;

  triangles.forEach(t => {
    totalCutLenMm += t.cutLengthMm;
    totalRapidLenMm += t.rapidLengthMm;
    totalEngraveLenMm += t.engraveLengthMm;
    totalTimeSec += t.estimatedTimeSec;
  });

  // Generate full Mach3/Mach2 G-code program string
  const masterGCode = generateMach3GCode(triangles, config, model);

  const cutM = Math.round((totalCutLenMm / 1000) * 10) / 10;
  const rapidM = Math.round((totalRapidLenMm / 1000) * 10) / 10;
  const engraveM = Math.round((totalEngraveLenMm / 1000) * 10) / 10;
  const totalM = Math.round((cutM + rapidM + engraveM) * 10) / 10;
  const estMins = Math.round((totalTimeSec / 60) * 10) / 10;

  return {
    triangles,
    allSegments,
    totalCutLengthM: cutM,
    totalRapidLengthM: rapidM,
    totalTimeSec,
    gcode: masterGCode,
    config,
    totalPanelsCount: candidateFaces.length,
    metrics: {
      totalDistanceMeters: totalM,
      estimatedTimeMinutes: estMins,
      cutLengthMeters: cutM,
      rapidLengthMeters: rapidM,
      engraveLengthMeters: engraveM
    }
  };
}

/**
 * Generic G-code downloader supporting .gcode, .tap, and .nc extensions
 */
export function downloadGCodeFile(
  content: string,
  filename: string,
  extension: "gcode" | "tap" | "nc" = "gcode"
): void {
  const cleanName = filename.replace(/\.(gcode|tap|nc|txt)$/i, "");
  const fullName = `${cleanName}.${extension}`;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fullName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Downloads G-code as a Mach3 .TAP file
 */
export function downloadMach3TapFile(content: string, filename: string): void {
  downloadGCodeFile(content, filename, "tap");
}

/**
 * Formats a clean, production-ready G-code program according to the
 * Autodesk Fusion 360 Mach2/Mach3 post-processor standard (mach3mill.cps).
 */
export function generateMach3GCode(
  triangles: TriangleToolpath[],
  config: ToolpathConfig,
  model: DomeModel
): string {
  const dateStr = new Date().toISOString().split("T")[0];
  const postName = config.postProcessor === "mach2" ? "Mach2 / Mach2Mill" : "Mach3 / Mach3Mill";
  const cpsName = config.postProcessor === "mach2" ? "mach2mill.cps" : "mach3mill.cps";

  const totalCutM = (triangles.reduce((s, t) => s + t.cutLengthMm, 0) / 1000).toFixed(1);
  const totalMin = Math.ceil(triangles.reduce((s, t) => s + t.estimatedTimeSec, 0) / 60);

  const lines: string[] = [
    `%`,
    `(================================================================)`,
    `( PROGRAM: GEODOME_SHEATHING_CONTOUR.TAP                         )`,
    `( POST-PROCESSOR: AUTODESK FUSION 360 - ${cpsName.toUpperCase().padEnd(23)} )`,
    `( CNC CONTROLLER: ${postName.toUpperCase().padEnd(46)} )`,
    `( DATE: ${dateStr.padEnd(56)} )`,
    `( DOME: ${model.parameters.frequency}V, D = ${(model.parameters.diameter / 1000).toFixed(2)}m | LAYER: ${config.layer.toUpperCase().padEnd(25)} )`,
    `( TOTAL PANELS: ${String(triangles.length).padEnd(47)} )`,
    `( TOTAL CUTTING LENGTH: ${totalCutM} m | EST. TIME: ~${totalMin} min            )`,
    `( TOOL 1: D=${config.toolDiameterMm.toFixed(3)}mm CR=0.000mm - FLAT END MILL / ROUTER BIT )`,
    `( MATERIAL THICKNESS: ${config.sheetThicknessMm.toFixed(1)}mm | PASSES: ${config.passes}                      )`,
    `( CLEARANCE HEIGHT: ${config.safeHeightMm.toFixed(1)}mm | RETRACT: ${config.retractHeightMm.toFixed(1)}mm            )`,
    `( FEEDRATE: ${config.feedRateMmMin} mm/min | PLUNGE: ${config.plungeFeedRateMmMin} mm/min | RPM: ${config.spindleRpm}  )`,
    `( HOLDING TABS: ${config.holdingTabs ? `ENABLED (W=${config.tabWidthMm}mm, H=${config.tabHeightMm}mm)` : "DISABLED"}`.padEnd(65) + `)`,
    `( AUTO-ENGRAVING IDs: ${config.enableEngraving ? `ENABLED (DEPTH: ${config.engravingDepthMm.toFixed(2)}mm, H=${config.engravingTextHeightMm}mm, F=${config.engravingFeedRateMmMin})` : "DISABLED"}`.padEnd(65) + `)`,
    `(================================================================)`,
    ``,
    `(--- SAFETY BLOCK & INITIALIZATION ---)`,
    `G90 G94 G91.1 G40 G49 G17`,
    `G21 (All units in millimeters)`,
    `G28 G91 Z0. (Home Z axis)`,
    `G90`,
    `T1 M6 (Tool change: Tool #1 - End Mill Dia ${config.toolDiameterMm}mm)`,
    `S${config.spindleRpm} M3 (Start Spindle Clockwise)`,
    `G54 (Work coordinate system)`,
    `G43 H1 Z${config.safeHeightMm.toFixed(3)} (Tool length compensation on)`,
    `M8 (Coolant / Dust vacuum extraction ON)`,
    ``
  ];

  triangles.forEach((tri, idx) => {
    lines.push(`(----------------------------------------------------------------)`);
    lines.push(`( PART ${idx + 1} OF ${triangles.length}: PANEL #${tri.faceId} [TYPE ${tri.faceType}] )`);
    lines.push(`( LENGTH: ${(tri.cutLengthMm / 1000).toFixed(2)}m | TIME: ~${tri.estimatedTimeSec}s )`);
    lines.push(`(----------------------------------------------------------------)`);

    tri.segments.forEach(seg => {
      if (seg.type === "rapid") {
        lines.push(`G0 X${seg.localTo.x.toFixed(3)} Y${seg.localTo.y.toFixed(3)} (Rapid traverse)`);
        lines.push(`G0 Z${config.retractHeightMm.toFixed(3)}`);
      } else if (seg.type === "plunge") {
        lines.push(`G1 Z${seg.localTo.z.toFixed(3)} F${seg.feedrate} (Plunge into stock, Pass ${seg.passIndex})`);
      } else if (seg.type === "cut") {
        lines.push(`G1 X${seg.localTo.x.toFixed(3)} Y${seg.localTo.y.toFixed(3)} F${seg.feedrate}`);
      } else if (seg.type === "engrave") {
        lines.push(`G1 X${seg.localTo.x.toFixed(3)} Y${seg.localTo.y.toFixed(3)} F${seg.feedrate} (Engrave part ID stroke)`);
      } else if (seg.type === "tab") {
        lines.push(`(--- Holding Tab Bridge ---)`);
        lines.push(seg.gcodeLine);
        lines.push(`(--- End Tab ---)`);
      } else if (seg.type === "retract") {
        lines.push(`G0 Z${config.safeHeightMm.toFixed(3)} (Retract to safe clearance)`);
      }
    });

    lines.push(``);
  });

  // Footer
  lines.push(
    `(================================================================)`,
    `(--- PROGRAM FOOTER & MACHINE PARK ---)`,
    `(================================================================)`,
    `M9 (Coolant / Vacuum extraction OFF)`,
    `M5 (Spindle Stop)`,
    `G0 Z${config.safeHeightMm.toFixed(3)} (Retract Z)`,
    `G28 G91 Z0. (Home Z)`,
    `G90`,
    `G28 X0. Y0. (Home X Y)`,
    `M30 (End of Program & Rewind)`,
    `%`
  );

  return lines.join("\n");
}

/**
 * Formats a clean, production-ready G-code program according to the
 * Autodesk Fusion 360 Mach2/Mach3 post-processor standard (mach3mill.cps)
 * specifically for a nested cutting sheet (nesting sheet).
 */
export function generateSheetMach3GCode(
  triangles: TriangleToolpath[],
  config: ToolpathConfig,
  sheetIndex: number,
  totalSheets: number,
  sheetWidth: number,
  sheetHeight: number,
  materialName: string
): string {
  const dateStr = new Date().toISOString().split("T")[0];
  const postName = config.postProcessor === "mach2" ? "Mach2 / Mach2Mill" : "Mach3 / Mach3Mill";
  const cpsName = config.postProcessor === "mach2" ? "mach2mill.cps" : "mach3mill.cps";

  const totalCutM = (triangles.reduce((s, t) => s + t.cutLengthMm, 0) / 1000).toFixed(1);
  const totalMin = Math.ceil(triangles.reduce((s, t) => s + t.estimatedTimeSec, 0) / 60);

  const lines: string[] = [
    `%`,
    `(================================================================)`,
    `( PROGRAM: SHEET_${sheetIndex + 1}_OF_${totalSheets}_NESTING.TAP`.padEnd(65) + `)`,
    `( POST-PROCESSOR: AUTODESK FUSION 360 - ${cpsName.toUpperCase().padEnd(23)} )`,
    `( CNC CONTROLLER: ${postName.toUpperCase().padEnd(46)} )`,
    `( DATE: ${dateStr.padEnd(56)} )`,
    `( SHEET: ${sheetIndex + 1} OF ${totalSheets} | SIZE: ${sheetWidth.toFixed(1)} x ${sheetHeight.toFixed(1)} x ${config.sheetThicknessMm.toFixed(1)} mm`.padEnd(65) + `)`,
    `( MATERIAL: ${materialName.toUpperCase().padEnd(52)} )`,
    `( TOTAL PARTS ON SHEET: ${String(triangles.length).padEnd(40)} )`,
    `( TOTAL CUTTING LENGTH: ${totalCutM} m | EST. TIME: ~${totalMin} min            )`,
    `( TOOL 1: D=${config.toolDiameterMm.toFixed(3)}mm CR=0.000mm - FLAT END MILL / ROUTER BIT )`,
    `( PASSES: ${config.passes} | PASS DEPTH: ${(config.sheetThicknessMm / Math.max(1, config.passes)).toFixed(2)} mm`.padEnd(65) + `)`,
    `( CLEARANCE HEIGHT: ${config.safeHeightMm.toFixed(1)}mm | RETRACT: ${config.retractHeightMm.toFixed(1)}mm            )`,
    `( FEEDRATE: ${config.feedRateMmMin} mm/min | PLUNGE: ${config.plungeFeedRateMmMin} mm/min | RPM: ${config.spindleRpm}  )`,
    `( HOLDING TABS: ${config.holdingTabs ? `ENABLED (W=${config.tabWidthMm}mm, H=${config.tabHeightMm}mm)` : "DISABLED"}`.padEnd(65) + `)`,
    `( AUTO-ENGRAVING IDs: ${config.enableEngraving ? `ENABLED (DEPTH: ${config.engravingDepthMm.toFixed(2)}mm, H=${config.engravingTextHeightMm}mm, F=${config.engravingFeedRateMmMin})` : "DISABLED"}`.padEnd(65) + `)`,
    `( WORK ZERO: X0 Y0 AT BOTTOM-LEFT OF SHEET, Z0 AT TOP SURFACE  )`,
    `(================================================================)`,
    ``,
    `(--- SAFETY BLOCK & INITIALIZATION ---)`,
    `G90 G94 G91.1 G40 G49 G17`,
    `G21 (All units in millimeters)`,
    `G28 G91 Z0. (Home Z axis)`,
    `G90`,
    `T1 M6 (Tool change: Tool #1 - End Mill Dia ${config.toolDiameterMm}mm)`,
    `S${config.spindleRpm} M3 (Start Spindle Clockwise)`,
    `G54 (Work coordinate system: Sheet datum X0 Y0 Z0)`,
    `G43 H1 Z${config.safeHeightMm.toFixed(3)} (Tool length compensation on)`,
    `M8 (Dust extraction / vacuum table ON)`,
    ``
  ];

  triangles.forEach((tri, idx) => {
    lines.push(`(----------------------------------------------------------------)`);
    lines.push(`( PART ${idx + 1} OF ${triangles.length}: PANEL #${tri.faceId} [TYPE ${tri.faceType}] )`);
    lines.push(`( LENGTH: ${(tri.cutLengthMm / 1000).toFixed(2)}m | TIME: ~${tri.estimatedTimeSec}s )`);
    lines.push(`(----------------------------------------------------------------)`);

    tri.segments.forEach(seg => {
      if (seg.type === "rapid") {
        lines.push(`G0 X${seg.localTo.x.toFixed(3)} Y${seg.localTo.y.toFixed(3)} (Rapid traverse)`);
        lines.push(`G0 Z${config.retractHeightMm.toFixed(3)}`);
      } else if (seg.type === "plunge") {
        lines.push(`G1 Z${seg.localTo.z.toFixed(3)} F${seg.feedrate} (Plunge into stock, Pass ${seg.passIndex})`);
      } else if (seg.type === "cut") {
        lines.push(`G1 X${seg.localTo.x.toFixed(3)} Y${seg.localTo.y.toFixed(3)} F${seg.feedrate}`);
      } else if (seg.type === "engrave") {
        lines.push(`G1 X${seg.localTo.x.toFixed(3)} Y${seg.localTo.y.toFixed(3)} F${seg.feedrate} (Engrave part ID stroke)`);
      } else if (seg.type === "tab") {
        lines.push(`(--- Holding Tab Bridge ---)`);
        lines.push(seg.gcodeLine);
        lines.push(`(--- End Tab ---)`);
      } else if (seg.type === "retract") {
        lines.push(`G0 Z${config.safeHeightMm.toFixed(3)} (Retract to clearance)`);
      }
    });

    lines.push(``);
  });

  // Footer
  lines.push(
    `(================================================================)`,
    `(--- PROGRAM FOOTER & MACHINE PARK ---)`,
    `(================================================================)`,
    `M9 (Vacuum extraction OFF)`,
    `M5 (Spindle Stop)`,
    `G0 Z${config.safeHeightMm.toFixed(3)} (Retract Z)`,
    `G28 G91 Z0. (Home Z)`,
    `G90`,
    `G28 X0. Y0. (Home X Y to origin)`,
    `M30 (End of Program & Rewind)`,
    `%`
  );

  return lines.join("\n");
}

/**
 * Calculates the complete CAM toolpath and Mach3/Mach2 G-code
 * for all nested triangles on a specific cutting sheet.
 */
export function calculateSheetToolpath(
  sheetLayout: SheathingSheetLayout,
  sheetIndex: number,
  userConfig?: Partial<ToolpathConfig>
): SheetToolpathResult {
  const config: ToolpathConfig = {
    ...DEFAULT_TOOLPATH_CONFIG,
    toolDiameterMm: sheetLayout.toolDiameter || 6,
    sheetThicknessMm: (sheetLayout as any).thickness || (sheetLayout as any).sheetThicknessMm || 12,
    feedRateMmMin: sheetLayout.feedRateMmMin || 3500,
    passes: sheetLayout.passes || 2,
    ...userConfig
  };

  const sheetW = sheetLayout.sheetWidth || 2500;
  const sheetH = sheetLayout.sheetHeight || 1250;
  const sheetThick = config.sheetThicknessMm;
  const toolRadius = config.toolDiameterMm / 2;
  const passDepth = sheetThick / Math.max(1, config.passes);

  // Filter panels on this sheet
  const panelsOnSheet = (sheetLayout.placedPanels || []).filter(
    p => p.sheetIndex === sheetIndex
  );

  let globalSegmentId = 1;
  const triangles: TriangleToolpath[] = [];
  const allSegments: ToolpathSegment[] = [];

  // Machine starts at origin (0, 0, safeHeight)
  let lastPos: Point3D = {
    x: -sheetW / 2,
    y: -sheetH / 2,
    z: config.safeHeightMm
  };

  // 3D coordinate converter: sheet center at (0, 0, 0)
  const to3D = (pt: { x: number; y: number }, z: number): Point3D => ({
    x: pt.x - sheetW / 2,
    y: pt.y - sheetH / 2,
    z: z
  });

  panelsOnSheet.forEach(panel => {
    if (!panel.polygon || panel.polygon.length < 3) return;

    // Offset polygon vertices outward by cutter radius (cutter compensation)
    const rawPoly = panel.polygon;
    const offsetPoly = offsetPolygon2D(rawPoly, toolRadius);
    const vertCount = offsetPoly.length;

    const panelSegments: ToolpathSegment[] = [];

    // 0. Auto-Engraving Part ID and Type on nested sheet panel before perimeter cutout
    if (config.enableEngraving) {
      const panelLabel = `#${panel.panelId} ${panel.panelType}`;
      let pCenX = 0;
      let pCenY = 0;
      const polyLen = panel.polygon.length;
      for (let i = 0; i < polyLen; i++) {
        pCenX += panel.polygon[i][0];
        pCenY += panel.polygon[i][1];
      }
      pCenX /= polyLen;
      pCenY /= polyLen;

      // Calculate perimeter and area for inradius estimation
      let polyPerim = 0;
      for (let i = 0; i < polyLen; i++) {
        const next = (i + 1) % polyLen;
        polyPerim += Math.hypot(
          panel.polygon[next][0] - panel.polygon[i][0],
          panel.polygon[next][1] - panel.polygon[i][1]
        );
      }
      let area2 = 0;
      for (let i = 0; i < polyLen; i++) {
        const next = (i + 1) % polyLen;
        area2 += panel.polygon[i][0] * panel.polygon[next][1] - panel.polygon[next][0] * panel.polygon[i][1];
      }
      const polyInradius = Math.abs(area2) / Math.max(1, polyPerim);

      const engraveStrokes = generateTextEngravingPaths(
        panelLabel,
        pCenX,
        pCenY,
        config.engravingTextHeightMm,
        polyInradius * 0.75
      );

      engraveStrokes.forEach(stroke => {
        if (stroke.length < 2) return;
        const p0 = stroke[0];
        const p0_3D = to3D(p0, -config.engravingDepthMm);
        const p0_safe3D = to3D(p0, config.retractHeightMm);
        const localP0 = { x: p0.x, y: p0.y, z: -config.engravingDepthMm };
        const localSafeP0 = { x: p0.x, y: p0.y, z: config.retractHeightMm };

        // Rapid to above stroke start
        const rapidSeg: ToolpathSegment = {
          id: globalSegmentId++,
          type: "rapid",
          from: lastPos,
          to: p0_safe3D,
          localFrom: { x: lastPos.x + sheetW / 2, y: lastPos.y + sheetH / 2, z: lastPos.z },
          localTo: localSafeP0,
          feedrate: 6000,
          faceId: panel.panelId,
          faceType: panel.panelType,
          passIndex: 0,
          gcodeLine: `G0 X${p0.x.toFixed(3)} Y${p0.y.toFixed(3)} Z${config.retractHeightMm.toFixed(3)}`,
          lengthMm: Math.hypot(p0_safe3D.x - lastPos.x, p0_safe3D.y - lastPos.y, p0_safe3D.z - lastPos.z)
        };
        panelSegments.push(rapidSeg);

        // Plunge to engraving depth
        const plungeSeg: ToolpathSegment = {
          id: globalSegmentId++,
          type: "plunge",
          from: p0_safe3D,
          to: p0_3D,
          localFrom: localSafeP0,
          localTo: localP0,
          feedrate: config.plungeFeedRateMmMin,
          faceId: panel.panelId,
          faceType: panel.panelType,
          passIndex: 1,
          gcodeLine: `G1 Z${(-config.engravingDepthMm).toFixed(3)} F${config.plungeFeedRateMmMin}`,
          lengthMm: config.retractHeightMm + config.engravingDepthMm
        };
        panelSegments.push(plungeSeg);

        // Engraving line segments
        let prevPt3D = p0_3D;
        let prevLocal = localP0;
        for (let k = 1; k < stroke.length; k++) {
          const pt = stroke[k];
          const pt3D = to3D(pt, -config.engravingDepthMm);
          const localPt = { x: pt.x, y: pt.y, z: -config.engravingDepthMm };
          const dLen = Math.hypot(pt.x - stroke[k - 1].x, pt.y - stroke[k - 1].y);

          const engSeg: ToolpathSegment = {
            id: globalSegmentId++,
            type: "engrave",
            from: prevPt3D,
            to: pt3D,
            localFrom: prevLocal,
            localTo: localPt,
            feedrate: config.engravingFeedRateMmMin,
            faceId: panel.panelId,
            faceType: panel.panelType,
            passIndex: 1,
            gcodeLine: `G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} F${config.engravingFeedRateMmMin}`,
            lengthMm: dLen
          };
          panelSegments.push(engSeg);
          prevPt3D = pt3D;
          prevLocal = localPt;
        }

        // Retract to retract height after stroke
        const retAfter3D = to3D(stroke[stroke.length - 1], config.retractHeightMm);
        const retSeg: ToolpathSegment = {
          id: globalSegmentId++,
          type: "retract",
          from: prevPt3D,
          to: retAfter3D,
          localFrom: prevLocal,
          localTo: { x: prevLocal.x, y: prevLocal.y, z: config.retractHeightMm },
          feedrate: 6000,
          faceId: panel.panelId,
          faceType: panel.panelType,
          passIndex: 1,
          gcodeLine: `G0 Z${config.retractHeightMm.toFixed(3)}`,
          lengthMm: config.retractHeightMm + config.engravingDepthMm
        };
        panelSegments.push(retSeg);
        lastPos = retAfter3D;
      });
    }

    // Local 2D start point (workpiece coordinates, X0 Y0 at bottom-left of sheet)
    const start2D = { x: offsetPoly[0][0], y: offsetPoly[0][1] };

    const start3D = to3D(start2D, 0);
    const safeStart3D = to3D(start2D, config.safeHeightMm);
    const retractStart3D = to3D(start2D, config.retractHeightMm);

    // 1. Rapid move (G0) from last position to safe clearance above start vertex
    const rapidLen = Math.hypot(
      safeStart3D.x - lastPos.x,
      safeStart3D.y - lastPos.y,
      safeStart3D.z - lastPos.z
    );

    const rapidSeg: ToolpathSegment = {
      id: globalSegmentId++,
      type: "rapid",
      from: lastPos,
      to: safeStart3D,
      localFrom: { x: lastPos.x + sheetW / 2, y: lastPos.y + sheetH / 2, z: lastPos.z },
      localTo: { ...start2D, z: config.safeHeightMm },
      feedrate: 6000,
      faceId: panel.panelId,
      faceType: panel.panelType,
      passIndex: 0,
      gcodeLine: `G0 Z${config.safeHeightMm.toFixed(3)}\nG0 X${start2D.x.toFixed(3)} Y${start2D.y.toFixed(3)}`,
      lengthMm: rapidLen
    };
    panelSegments.push(rapidSeg);

    // Rapid down to Retract Height before plunge
    const prePlungeSeg: ToolpathSegment = {
      id: globalSegmentId++,
      type: "rapid",
      from: safeStart3D,
      to: retractStart3D,
      localFrom: { ...start2D, z: config.safeHeightMm },
      localTo: { ...start2D, z: config.retractHeightMm },
      feedrate: 6000,
      faceId: panel.panelId,
      faceType: panel.panelType,
      passIndex: 0,
      gcodeLine: `G0 Z${config.retractHeightMm.toFixed(3)}`,
      lengthMm: Math.abs(config.safeHeightMm - config.retractHeightMm)
    };
    panelSegments.push(prePlungeSeg);

    // 2. Multi-pass cutting
    for (let pass = 1; pass <= config.passes; pass++) {
      const currentDepth = passDepth * pass;
      const plungeFrom3D = pass === 1 ? retractStart3D : to3D(start2D, -(currentDepth - passDepth));
      const plungeTo3D = to3D(start2D, -currentDepth);

      const plungeSeg: ToolpathSegment = {
        id: globalSegmentId++,
        type: "plunge",
        from: plungeFrom3D,
        to: plungeTo3D,
        localFrom: { ...start2D, z: pass === 1 ? config.retractHeightMm : -(currentDepth - passDepth) },
        localTo: { ...start2D, z: -currentDepth },
        feedrate: config.plungeFeedRateMmMin,
        faceId: panel.panelId,
        faceType: panel.panelType,
        passIndex: pass,
        gcodeLine: `G1 Z${(-currentDepth).toFixed(3)} F${config.plungeFeedRateMmMin}`,
        lengthMm: pass === 1 ? (config.retractHeightMm + currentDepth) : passDepth
      };
      panelSegments.push(plungeSeg);

      // Cutting around the closed polygon loop
      for (let i = 0; i < vertCount; i++) {
        const nextIdx = (i + 1) % vertCount;
        const p1_2d = { x: offsetPoly[i][0], y: offsetPoly[i][1] };
        const p2_2d = { x: offsetPoly[nextIdx][0], y: offsetPoly[nextIdx][1] };

        const edgeLen = Math.hypot(p2_2d.x - p1_2d.x, p2_2d.y - p1_2d.y);

        // Check if holding tab should be generated on this edge
        const shouldTab = config.holdingTabs && (pass === config.passes) && edgeLen >= Math.max(120, config.tabWidthMm * 2.5);

        if (shouldTab) {
          const tabMid = 0.5;
          const halfTab = (config.tabWidthMm / 2) / edgeLen;
          const t1 = Math.max(0.1, tabMid - halfTab);
          const t2 = Math.min(0.9, tabMid + halfTab);

          const tabStart2D = {
            x: p1_2d.x + (p2_2d.x - p1_2d.x) * t1,
            y: p1_2d.y + (p2_2d.y - p1_2d.y) * t1,
            z: -currentDepth
          };
          const tabStart3D = to3D(tabStart2D, -currentDepth);
          const p1_3D = to3D(p1_2d, -currentDepth);

          // Edge segment up to tab
          const segToTab: ToolpathSegment = {
            id: globalSegmentId++,
            type: "cut",
            from: p1_3D,
            to: tabStart3D,
            localFrom: { ...p1_2d, z: -currentDepth },
            localTo: tabStart2D,
            feedrate: config.feedRateMmMin,
            faceId: panel.panelId,
            faceType: panel.panelType,
            passIndex: pass,
            gcodeLine: `G1 X${tabStart2D.x.toFixed(3)} Y${tabStart2D.y.toFixed(3)} F${config.feedRateMmMin}`,
            lengthMm: edgeLen * t1
          };
          panelSegments.push(segToTab);

          // Tab bridge (tool lifts up by tabHeight)
          const tabDepth = Math.max(0, currentDepth - config.tabHeightMm);
          const tabEnd2D = {
            x: p1_2d.x + (p2_2d.x - p1_2d.x) * t2,
            y: p1_2d.y + (p2_2d.y - p1_2d.y) * t2,
            z: -tabDepth
          };
          const tabEnd3D = to3D(tabEnd2D, -tabDepth);

          const tabSeg: ToolpathSegment = {
            id: globalSegmentId++,
            type: "tab",
            from: tabStart3D,
            to: tabEnd3D,
            localFrom: tabStart2D,
            localTo: tabEnd2D,
            feedrate: Math.round(config.feedRateMmMin * 0.75),
            faceId: panel.panelId,
            faceType: panel.panelType,
            passIndex: pass,
            gcodeLine: `G1 Z${(-tabDepth).toFixed(3)} F${config.plungeFeedRateMmMin}\nG1 X${tabEnd2D.x.toFixed(3)} Y${tabEnd2D.y.toFixed(3)} F${Math.round(config.feedRateMmMin * 0.75)}\nG1 Z${(-currentDepth).toFixed(3)} F${config.plungeFeedRateMmMin}`,
            lengthMm: config.tabWidthMm
          };
          panelSegments.push(tabSeg);

          // Segment after tab to vertex
          const p2_3D = to3D(p2_2d, -currentDepth);
          const segAfterTab: ToolpathSegment = {
            id: globalSegmentId++,
            type: "cut",
            from: tabEnd3D,
            to: p2_3D,
            localFrom: { ...tabEnd2D, z: -currentDepth },
            localTo: { ...p2_2d, z: -currentDepth },
            feedrate: config.feedRateMmMin,
            faceId: panel.panelId,
            faceType: panel.panelType,
            passIndex: pass,
            gcodeLine: `G1 X${p2_2d.x.toFixed(3)} Y${p2_2d.y.toFixed(3)} F${config.feedRateMmMin}`,
            lengthMm: edgeLen * (1 - t2)
          };
          panelSegments.push(segAfterTab);
        } else {
          // Direct uninterrupted edge cut
          const p1_3D = to3D(p1_2d, -currentDepth);
          const p2_3D = to3D(p2_2d, -currentDepth);

          const cutSeg: ToolpathSegment = {
            id: globalSegmentId++,
            type: "cut",
            from: p1_3D,
            to: p2_3D,
            localFrom: { ...p1_2d, z: -currentDepth },
            localTo: { ...p2_2d, z: -currentDepth },
            feedrate: config.feedRateMmMin,
            faceId: panel.panelId,
            faceType: panel.panelType,
            passIndex: pass,
            gcodeLine: `G1 X${p2_2d.x.toFixed(3)} Y${p2_2d.y.toFixed(3)} F${config.feedRateMmMin}`,
            lengthMm: edgeLen
          };
          panelSegments.push(cutSeg);
        }
      }
    }

    // 3. Retract move (G0) to Safe Clearance Height
    const lastCutPos3D = to3D(start2D, -sheetThick);
    const retract3D = to3D(start2D, config.safeHeightMm);

    const retractSeg: ToolpathSegment = {
      id: globalSegmentId++,
      type: "retract",
      from: lastCutPos3D,
      to: retract3D,
      localFrom: { ...start2D, z: -sheetThick },
      localTo: { ...start2D, z: config.safeHeightMm },
      feedrate: 6000,
      faceId: panel.panelId,
      faceType: panel.panelType,
      passIndex: config.passes,
      gcodeLine: `G0 Z${config.safeHeightMm.toFixed(3)}`,
      lengthMm: sheetThick + config.safeHeightMm
    };
    panelSegments.push(retractSeg);

    lastPos = retract3D;

    // Tally stats
    let tCutLen = 0;
    let tRapidLen = 0;
    let tEngraveLen = 0;
    let tTime = 0;

    panelSegments.forEach(s => {
      if (s.type === "cut" || s.type === "tab" || s.type === "plunge") {
        tCutLen += s.lengthMm;
        tTime += (s.lengthMm / (s.feedrate || config.feedRateMmMin)) * 60;
      } else if (s.type === "engrave") {
        tEngraveLen += s.lengthMm;
        tTime += (s.lengthMm / (s.feedrate || config.engravingFeedRateMmMin)) * 60;
      } else {
        tRapidLen += s.lengthMm;
        tTime += (s.lengthMm / (s.feedrate || 6000)) * 60;
      }
    });

    const triGCode = panelSegments.map(s => s.gcodeLine).join("\n");

    triangles.push({
      faceId: panel.panelId,
      faceType: panel.panelType,
      segments: panelSegments,
      totalLengthMm: tCutLen + tRapidLen + tEngraveLen,
      cutLengthMm: tCutLen,
      rapidLengthMm: tRapidLen,
      engraveLengthMm: tEngraveLen,
      estimatedTimeSec: Math.round(tTime),
      gcode: triGCode
    });

    allSegments.push(...panelSegments);
  });

  // Calculate totals
  let totalCutLenMm = 0;
  let totalRapidLenMm = 0;
  let totalEngraveLenMm = 0;
  let totalTimeSec = 0;

  triangles.forEach(t => {
    totalCutLenMm += t.cutLengthMm;
    totalRapidLenMm += t.rapidLengthMm;
    totalEngraveLenMm += t.engraveLengthMm;
    totalTimeSec += t.estimatedTimeSec;
  });

  const masterGCode = generateSheetMach3GCode(
    triangles,
    config,
    sheetIndex,
    sheetLayout.totalSheetsRequired || 1,
    sheetW,
    sheetH,
    sheetLayout.materialName || "Фанера"
  );

  const cutM = Math.round((totalCutLenMm / 1000) * 10) / 10;
  const rapidM = Math.round((totalRapidLenMm / 1000) * 10) / 10;
  const engraveM = Math.round((totalEngraveLenMm / 1000) * 10) / 10;
  const totalM = Math.round((cutM + rapidM + engraveM) * 10) / 10;
  const estMins = Math.round((totalTimeSec / 60) * 10) / 10;

  return {
    sheetIndex,
    sheetWidth: sheetW,
    sheetHeight: sheetH,
    sheetThicknessMm: sheetThick,
    materialName: sheetLayout.materialName || "Фанера",
    panelsCount: panelsOnSheet.length,
    triangles,
    allSegments,
    totalCutLengthM: cutM,
    totalRapidLengthM: rapidM,
    totalTimeSec,
    gcode: masterGCode,
    config,
    totalPanelsCount: panelsOnSheet.length,
    metrics: {
      totalDistanceMeters: totalM,
      estimatedTimeMinutes: estMins,
      cutLengthMeters: cutM,
      rapidLengthMeters: rapidM,
      engraveLengthMeters: engraveM
    }
  };
}
