import { DomeModel, ConnectorGeometry, ConnectorParams, SheathingSheetLayout, FabricRollNestingLayout } from "../core/types";
import { generateConnectorCutPattern, calculateConnector, classifyConnectorTypes } from "../core/connectors";
import { calculateSheetNesting, getRecommendedSheetFormat } from "../core/sheathing";
import { downloadFile } from "./svgExport";

/**
 * Downloads a DXF CAD file safely without browser appending '.txt'.
 */
export function downloadDXF(filename: string, content: string) {
  downloadFile(filename, content, "application/octet-stream");
}

/**
 * Helper to interpolate an SVG path string (M, L, Q, Z) into a list of 2D [x, y] coordinates.
 */
function parseSvgPathToPolyline(d: string): [number, number][] {
  const points: [number, number][] = [];
  // Tokenize
  const tokens = d.trim().split(/[\s,]+/);
  let i = 0;
  let curX = 0;
  let curY = 0;

  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === "M" || cmd === "m") {
      curX = parseFloat(tokens[i + 1]);
      curY = parseFloat(tokens[i + 2]);
      points.push([curX, curY]);
      i += 3;
    } else if (cmd === "L" || cmd === "l") {
      curX = parseFloat(tokens[i + 1]);
      curY = parseFloat(tokens[i + 2]);
      points.push([curX, curY]);
      i += 3;
    } else if (cmd === "Q" || cmd === "q") {
      const cx = parseFloat(tokens[i + 1]);
      const cy = parseFloat(tokens[i + 2]);
      const ex = parseFloat(tokens[i + 3]);
      const ey = parseFloat(tokens[i + 4]);
      // Approximate quadratic Bezier with 5 linear segments
      const p0x = curX;
      const p0y = curY;
      const steps = 5;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const mt = 1 - t;
        const bx = mt * mt * p0x + 2 * mt * t * cx + t * t * ex;
        const by = mt * mt * p0y + 2 * mt * t * cy + t * t * ey;
        points.push([Math.round(bx * 100) / 100, Math.round(by * 100) / 100]);
      }
      curX = ex;
      curY = ey;
      i += 5;
    } else if (cmd === "Z" || cmd === "z") {
      i++;
    } else {
      // Numerical coordinates following previous command
      const px = parseFloat(tokens[i]);
      const py = parseFloat(tokens[i + 1]);
      if (!isNaN(px) && !isNaN(py)) {
        curX = px;
        curY = py;
        points.push([curX, curY]);
        i += 2;
      } else {
        i++;
      }
    }
  }

  return points;
}

/**
 * Builds the standard AutoCAD R12 DXF file header with standard layer definitions and colors.
 * Standard layer colors:
 * - 1: Red (HOLES)
 * - 2: Yellow (TEXT_ANNOTATION)
 * - 3: Green (SHEET_BORDER)
 * - 5: Blue (BEND_LINES)
 * - 7: White (OUTER_CUT)
 */
export type DxfVersion = "AC1015" | "AC1009";

export interface DxfExportOptions {
  version?: DxfVersion;
  countInDome?: number;
  typeName?: string;
  sampleNodeLabel?: string;
  nodeLabels?: string[];
}

/**
 * Builds standard DXF file header with standard layer definitions, line types, and blocks.
 * Supports:
 * - AC1015: AutoCAD 2000 / Autodesk Fusion 360 native (LWPOLYLINE, best for Fusion sketch import)
 * - AC1009: AutoCAD Release 12 DXF (POLYLINE/VERTEX)
 *
 * Standard layer colors:
 * - 1: Red (HOLES)
 * - 2: Yellow (TEXT_ANNOTATION)
 * - 3: Green (SHEET_BORDER)
 * - 4: Cyan (ENGRAVE)
 * - 5: Blue (BEND_LINES)
 * - 7: White / Black (OUTER_CUT)
 */
function createDxfHeader(version: DxfVersion = "AC1015"): string[] {
  return [
    "0", "SECTION",
    "2", "HEADER",
    "9", "$ACADVER",
    "1", version, // AutoCAD 2000 (AC1015) for native Autodesk Fusion 360 support
    "9", "$INSUNITS",
    "70", "4", // 4 = Millimeters
    "9", "$MEASUREMENT",
    "70", "1", // 1 = Metric system
    "0", "ENDSEC",

    "0", "SECTION",
    "2", "TABLES",

    // VPORT Table
    "0", "TABLE",
    "2", "VPORT",
    "70", "1",
    "0", "VPORT",
    "2", "*ACTIVE",
    "70", "0",
    "10", "0.0",
    "20", "0.0",
    "11", "1.0",
    "21", "1.0",
    "12", "0.0",
    "22", "0.0",
    "40", "1000.0",
    "41", "1.5",
    "68", "1",
    "0", "ENDTAB",

    // LTYPE Table (Continuous and Dashed line types)
    "0", "TABLE",
    "2", "LTYPE",
    "70", "2",
    "0", "LTYPE",
    "2", "CONTINUOUS",
    "70", "0",
    "3", "Solid line",
    "72", "65",
    "73", "0",
    "40", "0.0",
    "0", "LTYPE",
    "2", "DASHED",
    "70", "0",
    "3", "Dashed __ __ __",
    "72", "65",
    "73", "2",
    "40", "19.05",
    "49", "12.7",
    "49", "-6.35",
    "0", "ENDTAB",

    // LAYER Table with standard layers
    "0", "TABLE",
    "2", "LAYER",
    "70", "11",
    "0", "LAYER",
    "2", "0",
    "70", "0",
    "62", "7",
    "6", "CONTINUOUS",
    "0", "LAYER",
    "2", "OUTER_CUT",
    "70", "0",
    "62", "7", // White / Continuous contour
    "6", "CONTINUOUS",
    "0", "LAYER",
    "2", "HOLES",
    "70", "0",
    "62", "1", // Red / Bolt holes & cutouts
    "6", "CONTINUOUS",
    "0", "LAYER",
    "2", "BEND_LINES",
    "70", "0",
    "62", "5", // Blue / Press brake bend lines
    "6", "DASHED",
    "0", "LAYER",
    "2", "TEXT_ANNOTATION",
    "70", "0",
    "62", "2", // Yellow / Dimensions & labels
    "6", "CONTINUOUS",
    "0", "LAYER",
    "2", "SHEET_BORDER",
    "70", "0",
    "62", "3", // Green / Stock sheet boundaries
    "6", "CONTINUOUS",
    "0", "LAYER",
    "2", "ENGRAVE",
    "70", "0",
    "62", "4", // Cyan / Laser engraving
    "6", "CONTINUOUS",
    "0", "LAYER",
    "2", "TRIANGLES",
    "70", "0",
    "62", "3", // Green / Framework triangle boundaries
    "6", "CONTINUOUS",
    "0", "LAYER",
    "2", "FRAMEWORK_NODES",
    "70", "0",
    "62", "1", // Red / Framework connector nodes
    "6", "CONTINUOUS",
    "0", "LAYER",
    "2", "NODE_LABELS",
    "70", "0",
    "62", "2", // Yellow / Node ID and location labels
    "6", "CONTINUOUS",
    "0", "LAYER",
    "2", "TRIANGLE_LABELS",
    "70", "0",
    "62", "6", // Magenta / Face type markings
    "6", "CONTINUOUS",
    "0", "ENDTAB",

    // STYLE Table (Text font)
    "0", "TABLE",
    "2", "STYLE",
    "70", "1",
    "0", "STYLE",
    "2", "STANDARD",
    "70", "0",
    "40", "0.0",
    "41", "1.0",
    "50", "0.0",
    "71", "0",
    "42", "2.5",
    "3", "txt",
    "4", "",
    "0", "ENDTAB",

    "0", "ENDSEC",

    // BLOCKS Section: Required by Autodesk Fusion 360 to parse the entities section without error
    "0", "SECTION",
    "2", "BLOCKS",
    "0", "ENDSEC",

    // ENTITIES Section
    "0", "SECTION",
    "2", "ENTITIES"
  ];
}

/**
 * Appends a closed 2D polyline to a DXF entities array.
 * Uses LWPOLYLINE for AutoCAD 2000 (AC1015) which creates native closed sketch profiles in Autodesk Fusion 360.
 * Falls back to POLYLINE/VERTEX/SEQEND for AC1009.
 */
function appendPolylineEntity(
  lines: string[],
  points: [number, number][],
  layer = "OUTER_CUT",
  dx = 0,
  dy = 0,
  closed = true,
  version: DxfVersion = "AC1015"
) {
  if (points.length < 2) return;

  if (version === "AC1015") {
    lines.push(
      "0", "LWPOLYLINE",
      "8", layer,
      "90", points.length.toString(),
      "70", closed ? "1" : "0"
    );
    for (const pt of points) {
      lines.push(
        "10", (pt[0] + dx).toFixed(3),
        "20", (pt[1] + dy).toFixed(3)
      );
    }
  } else {
    lines.push(
      "0", "POLYLINE",
      "8", layer,
      "66", "1",
      "70", closed ? "1" : "0",
      "10", "0.0",
      "20", "0.0",
      "30", "0.0"
    );

    for (const pt of points) {
      lines.push(
        "0", "VERTEX",
        "8", layer,
        "10", (pt[0] + dx).toFixed(3),
        "20", (pt[1] + dy).toFixed(3),
        "30", "0.0"
      );
    }

    lines.push("0", "SEQEND", "8", layer);
  }
}

/**
 * Appends a CIRCLE entity to a DXF entities array.
 */
function appendCircleEntity(
  lines: string[],
  cx: number,
  cy: number,
  radius: number,
  layer = "HOLES"
) {
  lines.push(
    "0", "CIRCLE",
    "8", layer,
    "10", cx.toFixed(3),
    "20", cy.toFixed(3),
    "30", "0.0",
    "40", radius.toFixed(3)
  );
}

/**
 * Appends a LINE entity to a DXF entities array with valid group codes (10, 20, 30 and 11, 21, 31).
 */
function appendLineEntity(
  lines: string[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  layer = "BEND_LINES"
) {
  lines.push(
    "0", "LINE",
    "8", layer,
    "10", x1.toFixed(3),
    "20", y1.toFixed(3),
    "30", "0.0",
    "11", x2.toFixed(3),
    "21", y2.toFixed(3), // Autodesk Fusion 360 / AutoCAD standard end-point group codes
    "31", "0.0"
  );
}

/**
 * Appends a TEXT entity to a DXF entities array.
 */
function appendTextEntity(
  lines: string[],
  x: number,
  y: number,
  text: string,
  height = 10,
  layer = "TEXT_ANNOTATION"
) {
  // Sanitize text for DXF
  const safeText = text.replace(/[\r\n\t]+/g, " ").trim();
  lines.push(
    "0", "TEXT",
    "8", layer,
    "10", x.toFixed(3),
    "20", y.toFixed(3),
    "30", "0.0",
    "40", height.toFixed(2),
    "1", safeText
  );
}

/**
 * Generates an AutoCAD 2000 / Autodesk Fusion 360 compatible DXF for a single connector bracket.
 * Layers:
 * - OUTER_CUT: Outer star contour with tabs
 * - HOLES: Bolt holes and center cutout
 * - BEND_LINES: Tab root bend lines for press brake
 * - TEXT_ANNOTATION: Part name, piece count, ray labels, bend angles
 */
export function generateConnectorDXF(
  connector: ConnectorGeometry,
  params: ConnectorParams,
  options?: DxfExportOptions
): string {
  const version: DxfVersion = options?.version || "AC1015";
  const cut = generateConnectorCutPattern(connector, params);
  const count = options?.countInDome ?? 1;
  const sampleLabel = options?.sampleNodeLabel || `NODE_${connector.nodeId + 1}`;
  const nodeLabelsList = options?.nodeLabels || [sampleLabel];
  const titleName = options?.typeName || `CONNECTOR_${sampleLabel}_#${connector.nodeId}`;

  const lines = createDxfHeader(version);

  // 1. Outer star contour
  const contourPts = parseSvgPathToPolyline(cut.contourPath);
  appendPolylineEntity(lines, contourPts, "OUTER_CUT", 0, 0, true, version);

  // 2. Center cutout (lightning bolt or center circle)
  if (cut.centerCutoutPath) {
    const centerCutoutPts = parseSvgPathToPolyline(cut.centerCutoutPath);
    appendPolylineEntity(lines, centerCutoutPts, "HOLES", 0, 0, true, version);
  } else if (cut.centerHole) {
    appendCircleEntity(lines, cut.centerHole.x, cut.centerHole.y, cut.centerHole.diameter / 2, "HOLES");
  }

  // 3. Bolt holes
  for (const hole of cut.boltHoles) {
    appendCircleEntity(lines, hole.x, hole.y, hole.diameter / 2, "HOLES");
  }

  // 4. Press brake bend lines
  for (const bend of cut.bendLines) {
    appendLineEntity(lines, bend.x1, bend.y1, bend.x2, bend.y2, "BEND_LINES");
  }

  // 5. Engraved Node Marking on Connector Plate (Laser Marking / CNC Engraving)
  appendTextEntity(lines, -15, 0, sampleLabel, 11, "ENGRAVE");

  // 6. Text annotations
  const titleY = cut.outerRadius + 18;
  appendTextEntity(lines, -cut.outerRadius * 0.85, titleY, `${titleName} · MARK: ${sampleLabel} (QTY: ${count} PCS)`, 12, "TEXT_ANNOTATION");
  if (nodeLabelsList.length > 0) {
    appendTextEntity(lines, -cut.outerRadius * 0.85, titleY - 14, `NODES: ${nodeLabelsList.join(", ")}`, 7.5, "TEXT_ANNOTATION");
  }

  // Ray labels and bend angles
  for (const lbl of cut.rayLabels) {
    appendTextEntity(lines, lbl.x, lbl.y, `${lbl.text}`, 8, "TEXT_ANNOTATION");
  }

  // Close DXF
  lines.push("0", "ENDSEC", "0", "EOF");

  return lines.join("\n");
}

/**
 * Generates a unified AutoCAD 2000 / Fusion 360 DXF containing ALL unique connector types
 * arranged in a neat grid for laser cutting.
 */
export function generateAllConnectorsDXF(
  model: DomeModel,
  options?: { version?: DxfVersion }
): string {
  const version: DxfVersion = options?.version || "AC1015";
  const connectorTypes = classifyConnectorTypes(model, model.connectorParams);
  const lines = createDxfHeader(version);

  const cols = Math.min(3, connectorTypes.length);
  const spacing = 350; // mm between connector centers

  connectorTypes.forEach((t, idx) => {
    const conn = calculateConnector(model, t.sampleNodeId);
    const cut = generateConnectorCutPattern(conn, model.connectorParams);
    const sampleLabel = model.nodes[t.sampleNodeId]?.label || `AA${t.sampleNodeId + 1}`;
    const nodeLabelsList = t.nodeIds.map(nid => model.nodes[nid]?.label || `AA${nid + 1}`);

    const col = idx % cols;
    const row = Math.floor(idx / cols);

    const offX = col * spacing + spacing / 2;
    const offY = -row * spacing - spacing / 2; // CAD downwards row layout

    // 1. Outer star contour
    const contourPts = parseSvgPathToPolyline(cut.contourPath);
    appendPolylineEntity(lines, contourPts, "OUTER_CUT", offX, offY, true, version);

    // 2. Center cutout
    if (cut.centerCutoutPath) {
      const centerCutoutPts = parseSvgPathToPolyline(cut.centerCutoutPath);
      appendPolylineEntity(lines, centerCutoutPts, "HOLES", offX, offY, true, version);
    } else if (cut.centerHole) {
      appendCircleEntity(lines, cut.centerHole.x + offX, cut.centerHole.y + offY, cut.centerHole.diameter / 2, "HOLES");
    }

    // 3. Bolt holes
    for (const hole of cut.boltHoles) {
      appendCircleEntity(lines, hole.x + offX, hole.y + offY, hole.diameter / 2, "HOLES");
    }

    // 4. Press brake bend lines
    for (const bend of cut.bendLines) {
      appendLineEntity(lines, bend.x1 + offX, bend.y1 + offY, bend.x2 + offX, bend.y2 + offY, "BEND_LINES");
    }

    // 5. Engraved Node Marking on Connector Plate
    appendTextEntity(lines, offX - 14, offY, sampleLabel, 10, "ENGRAVE");

    // 6. Title & Quantity stamp with node markings
    appendTextEntity(
      lines,
      offX - cut.outerRadius * 0.9,
      offY + cut.outerRadius + 22,
      `${t.name} · MARK: ${sampleLabel} - QTY: ${t.countInDome} PCS`,
      13,
      "TEXT_ANNOTATION"
    );
    appendTextEntity(
      lines,
      offX - cut.outerRadius * 0.9,
      offY + cut.outerRadius + 8,
      `NODES: ${nodeLabelsList.join(", ")}`,
      7,
      "TEXT_ANNOTATION"
    );

    // Ray labels
    for (const lbl of cut.rayLabels) {
      appendTextEntity(lines, lbl.x + offX, lbl.y + offY, `${lbl.text}`, 7, "TEXT_ANNOTATION");
    }

    // Border bounding box around type
    const halfBox = spacing / 2 - 10;
    const boxPts: [number, number][] = [
      [offX - halfBox, offY - halfBox],
      [offX + halfBox, offY - halfBox],
      [offX + halfBox, offY + halfBox],
      [offX - halfBox, offY + halfBox]
    ];
    appendPolylineEntity(lines, boxPts, "SHEET_BORDER", 0, 0, true, version);
  });

  lines.push("0", "ENDSEC", "0", "EOF");

  return lines.join("\n");
}

/**
 * Generates an AutoCAD 2000 / Fusion 360 compatible DXF for a single CNC sheathing nesting sheet.
 * Compatible with Autodesk Fusion 360, ArtCAM, Vectric Aspire, SheetCAM, Mach3.
 */
export function generateSheathingSheetDXF(
  layout: SheathingSheetLayout,
  sheetIdx = 0,
  options?: { version?: DxfVersion }
): string {
  const version: DxfVersion = options?.version || "AC1015";
  const w = layout.sheetWidth;
  const h = layout.sheetHeight;
  const sheetPanels = layout.placedPanels.filter(p => p.sheetIndex === sheetIdx);

  const lines = createDxfHeader(version);

  // 1. Sheet Border
  const sheetPts: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h]
  ];
  appendPolylineEntity(lines, sheetPts, "SHEET_BORDER", 0, 0, true, version);

  // 2. Parts Closed Polylines & Centroid Labels
  for (const p of sheetPanels) {
    // Invert Y for CAD standard coordinate system (origin bottom-left, +Y pointing UP)
    const cadPoints: [number, number][] = p.polygon.map(([x, y]) => [x, Math.round(h - y)]);
    appendPolylineEntity(lines, cadPoints, "OUTER_CUT", 0, 0, true, version);

    // Holding Tabs markers
    if (p.holdingTabs) {
      for (const [tx, ty] of p.holdingTabs) {
        appendCircleEntity(lines, tx, Math.round(h - ty), (layout.toolDiameter || 6) / 2, "BEND_LINES");
      }
    }

    // Text label inside panel
    const cX = p.polygon.reduce((sum, pt) => sum + pt[0], 0) / p.polygon.length;
    const cY = p.polygon.reduce((sum, pt) => sum + pt[1], 0) / p.polygon.length;
    const cadCY = Math.round(h - cY);
    appendTextEntity(lines, cX - 15, cadCY - 5, `${p.panelType}_#${p.panelId}`, 18, "TEXT_ANNOTATION");
  }

  // Sheet Header Info in DXF
  appendTextEntity(
    lines,
    20,
    h + 30,
    `SHEATHING NESTING SHEET ${sheetIdx + 1} OF ${layout.totalSheetsRequired} (${w}x${h}mm) - TOOL: DIA ${layout.toolDiameter || 6}mm`,
    25,
    "TEXT_ANNOTATION"
  );

  lines.push("0", "ENDSEC", "0", "EOF");

  return lines.join("\n");
}

/**
 * Generates an AutoCAD 2000 / Fusion 360 compatible DXF containing ALL nesting sheets
 * placed side-by-side with comfortable spacing in a single master DXF file.
 */
export function generateAllSheathingSheetsDXF(
  layout: SheathingSheetLayout,
  options?: { version?: DxfVersion }
): string {
  const version: DxfVersion = options?.version || "AC1015";
  const w = layout.sheetWidth;
  const h = layout.sheetHeight;
  const sheetGap = 250; // mm between sheets

  const lines = createDxfHeader(version);

  for (let sIdx = 0; sIdx < layout.totalSheetsRequired; sIdx++) {
    const sheetPanels = layout.placedPanels.filter(p => p.sheetIndex === sIdx);
    const offX = sIdx * (w + sheetGap);

    // 1. Sheet Border
    const sheetPts: [number, number][] = [
      [offX, 0],
      [offX + w, 0],
      [offX + w, h],
      [offX, h]
    ];
    appendPolylineEntity(lines, sheetPts, "SHEET_BORDER", 0, 0, true, version);

    // 2. Parts
    for (const p of sheetPanels) {
      const cadPoints: [number, number][] = p.polygon.map(([x, y]) => [
        x + offX,
        Math.round(h - y)
      ]);
      appendPolylineEntity(lines, cadPoints, "OUTER_CUT", 0, 0, true, version);

      // Holding tabs
      if (p.holdingTabs) {
        for (const [tx, ty] of p.holdingTabs) {
          appendCircleEntity(lines, tx + offX, Math.round(h - ty), (layout.toolDiameter || 6) / 2, "BEND_LINES");
        }
      }

      // Label
      const cX = p.polygon.reduce((sum, pt) => sum + pt[0], 0) / p.polygon.length;
      const cY = p.polygon.reduce((sum, pt) => sum + pt[1], 0) / p.polygon.length;
      const cadCY = Math.round(h - cY);
      appendTextEntity(lines, cX + offX - 15, cadCY - 5, `${p.panelType}_#${p.panelId}`, 18, "TEXT_ANNOTATION");
    }

    // Title per sheet
    appendTextEntity(
      lines,
      offX + 20,
      h + 30,
      `SHEET ${sIdx + 1} / ${layout.totalSheetsRequired} (${w}x${h}mm)`,
      25,
      "TEXT_ANNOTATION"
    );
  }

  lines.push("0", "ENDSEC", "0", "EOF");

  return lines.join("\n");
}

/**
 * Generates an AutoCAD 2000 / Fusion 360 compatible DXF with individual clean blueprints for all unique triangle types
 * (Type A, Type B, Type C...) calculated on the outer faces of the timber beams.
 */
export function generateSheathingTrianglesDXF(
  model: DomeModel,
  options?: { version?: DxfVersion }
): string {
  const version: DxfVersion = options?.version || "AC1015";
  const groups = model.faceGroups;
  const lines = createDxfHeader(version);

  const spacing = 1800; // mm spacing between triangle blueprints

  groups.forEach((g, idx) => {
    const offX = idx * spacing;
    const a = g.lengths[0];
    const b = g.lengths[1];
    const c = g.lengths[2];

    if (g.type === "PL") {
      const rectPts: [number, number][] = [
        [offX, 0],
        [offX + a, 0],
        [offX + a, b],
        [offX, b]
      ];
      appendPolylineEntity(lines, rectPts, "OUTER_CUT", 0, 0, true, version);

      appendTextEntity(
        lines,
        offX,
        b + 40,
        `PLINTH RECTANGLE TYPE PL - QTY: ${g.count} PCS (${a}x${b}mm)`,
        30,
        "TEXT_ANNOTATION"
      );
      appendTextEntity(
        lines,
        offX,
        b + 5,
        `Width: ${a}mm, Height: ${b}mm | Area: ${g.area} m2`,
        18,
        "TEXT_ANNOTATION"
      );
      appendTextEntity(lines, offX + a / 2 - 20, -25, `W = ${a} mm`, 16, "TEXT_ANNOTATION");
      appendTextEntity(lines, offX - 35, b / 2, `H = ${b} mm`, 16, "TEXT_ANNOTATION");
      return;
    }

    // Compute 2D triangle vertices at origin: Base along X axis
    const p1: [number, number] = [0, 0];
    const p2: [number, number] = [c, 0];
    const cosA = (b * b + c * c - a * a) / (2 * b * c);
    const p3x = b * cosA;
    const p3y = b * Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const p3: [number, number] = [Math.round(p3x * 10) / 10, Math.round(p3y * 10) / 10];

    const trianglePts: [number, number][] = [
      [p1[0] + offX, p1[1]],
      [p2[0] + offX, p2[1]],
      [p3[0] + offX, p3[1]]
    ];

    appendPolylineEntity(lines, trianglePts, "OUTER_CUT", 0, 0, true, version);

    // Title & Dimensions (Calculated from outer faces of beams)
    appendTextEntity(
      lines,
      offX,
      p3y + 40,
      `TRIANGLE TYPE ${g.type} - QTY: ${g.count} PCS (OUTER FACES)`,
      30,
      "TEXT_ANNOTATION"
    );
    appendTextEntity(
      lines,
      offX,
      p3y + 5,
      `Sides: a=${a}mm, b=${b}mm, c=${c}mm | Area: ${g.area} m2`,
      18,
      "TEXT_ANNOTATION"
    );

    // Dimension labels along sides
    appendTextEntity(lines, offX + c / 2 - 20, -25, `c = ${c} mm`, 16, "TEXT_ANNOTATION");
    appendTextEntity(lines, offX + p3x / 2 - 40, p3y / 2, `b = ${b} mm`, 16, "TEXT_ANNOTATION");
    appendTextEntity(lines, offX + (c + p3x) / 2 + 10, p3y / 2, `a = ${a} mm`, 16, "TEXT_ANNOTATION");
  });

  lines.push("0", "ENDSEC", "0", "EOF");

  return lines.join("\n");
}

/**
 * Generates an AutoCAD 2000 / Fusion 360 compatible DXF file for Fabric Roll patterns (Тент / Мембрана з рулону).
 * Exports continuous arched strips running from foundation edge to opposite foundation edge with:
 * - OUTER_CUT: Outer cut perimeter rectangle of each fabric strip [cutLengthMm x rollWidthMm]
 * - BEND_LINES (linetype DASHED): Thread sewing seam guide lines (зазор на прошив ниткою)
 * - BEND_LINES (linetype DASHED): Foundation hem fold/skirt lines
 * - BEND_LINES (linetype DASHED): Apex centerline
 * - TEXT_ANNOTATION: Strip ID, dimensions, arc length, seam allowance, and cutting instructions.
 *
 * If stripIndex >= 0: exports that single specific strip.
 * If stripIndex === undefined or -1: exports all strips arranged side-by-side or stacked.
 */
export function generateFabricRollDXF(
  layout: FabricRollNestingLayout,
  stripIndex?: number,
  options?: { version?: DxfVersion }
): string {
  const version: DxfVersion = options?.version || "AC1015";
  const lines = createDxfHeader(version);
  const stripsToExport =
    stripIndex !== undefined && stripIndex >= 0 && stripIndex < layout.strips.length
      ? [layout.strips[stripIndex]]
      : layout.strips;

  const rollW = layout.rollWidthMm;
  const stripSpacingY = rollW + 300; // mm vertical spacing between strips

  stripsToExport.forEach((s, idx) => {
    const offY = idx * stripSpacingY;
    const cutL = s.cutLengthMm;
    const hem = s.hemAllowanceMm || 150;
    const seam = s.seamAllowanceMm || 25;

    // 1. Outer Cut Perimeter (Closed Rectangle)
    const pts: [number, number][] = [
      [0, offY],
      [cutL, offY],
      [cutL, offY + rollW],
      [0, offY + rollW]
    ];
    appendPolylineEntity(lines, pts, "OUTER_CUT", 0, 0, true, version);

    // 2. Thread Sewing Seam Lines (Зазор на прошив ниткою)
    appendLineEntity(lines, 0, offY + seam, cutL, offY + seam, "BEND_LINES");
    appendLineEntity(lines, 0, offY + rollW - seam, cutL, offY + rollW - seam, "BEND_LINES");

    // 3. Foundation Hem Lines (at both ends)
    appendLineEntity(lines, hem, offY, hem, offY + rollW, "BEND_LINES");
    appendLineEntity(lines, cutL - hem, offY, cutL - hem, offY + rollW, "BEND_LINES");

    // 4. Apex Centerline
    const midX = cutL / 2;
    appendLineEntity(lines, midX, offY - 20, midX, offY + rollW + 20, "BEND_LINES");

    // 5. Text Annotations
    appendTextEntity(
      lines,
      20,
      offY + rollW + 35,
      `FABRIC STRIP #${s.id}: ${s.name} | CUT LENGTH: ${cutL}mm | DOME ARC: ${s.domeArcLengthMm}mm`,
      28,
      "TEXT_ANNOTATION"
    );
    appendTextEntity(
      lines,
      20,
      offY + rollW + 5,
      `Roll Width: ${rollW}mm | Seam Allowance: ${seam}mm (thread sewing) | Foundation Hem: ${hem}mm | Area: ${s.cutAreaM2} m2`,
      18,
      "TEXT_ANNOTATION"
    );
    appendTextEntity(lines, midX - 40, offY + rollW / 2, `APEX (VERSHYNA)`, 20, "TEXT_ANNOTATION");
    appendTextEntity(lines, 20, offY + seam + 10, `SEAM LINE (+${seam}mm)`, 14, "TEXT_ANNOTATION");
    appendTextEntity(lines, 20, offY + rollW - seam - 20, `SEAM LINE (-${seam}mm)`, 14, "TEXT_ANNOTATION");
    appendTextEntity(lines, 10, offY + rollW / 2, `HEM: ${hem}mm`, 14, "TEXT_ANNOTATION");
    appendTextEntity(lines, cutL - hem + 10, offY + rollW / 2, `HEM: ${hem}mm`, 14, "TEXT_ANNOTATION");

    // 6. Geodesic Framework Triangles (Друк трикутників каркасу на смузі)
    if (s.triangles && s.triangles.length > 0) {
      s.triangles.forEach(tri => {
        const p0: [number, number] = [tri.points2D[0].x, offY + tri.points2D[0].y];
        const p1: [number, number] = [tri.points2D[1].x, offY + tri.points2D[1].y];
        const p2: [number, number] = [tri.points2D[2].x, offY + tri.points2D[2].y];
        appendPolylineEntity(lines, [p0, p1, p2], "TRIANGLES", 0, 0, true, version);

        // Face type annotation and side lengths
        appendTextEntity(
          lines,
          tri.center2D.x - 20,
          offY + tri.center2D.y,
          `FACE ${tri.faceType} [#${tri.faceId + 1}] (${tri.areaM2}m2)`,
          14,
          "TRIANGLE_LABELS"
        );
        appendTextEntity(
          lines,
          tri.center2D.x - 25,
          offY + tri.center2D.y - 18,
          `L1=${tri.lengths[0]} L2=${tri.lengths[1]} L3=${tri.lengths[2]}mm`,
          10,
          "TRIANGLE_LABELS"
        );
      });
    }

    // 7. Geodesic Framework Nodes (Відмітка вузлів каркасу)
    if (s.nodes && s.nodes.length > 0) {
      s.nodes.forEach(node => {
        // Connector hub circle marker
        appendCircleEntity(lines, node.x2D, offY + node.y2D, 18, "FRAMEWORK_NODES");
        appendCircleEntity(lines, node.x2D, offY + node.y2D, 4, "FRAMEWORK_NODES");

        // Crosshairs
        appendLineEntity(lines, node.x2D - 24, offY + node.y2D, node.x2D + 24, offY + node.y2D, "FRAMEWORK_NODES");
        appendLineEntity(lines, node.x2D, offY + node.y2D - 24, node.x2D, offY + node.y2D + 24, "FRAMEWORK_NODES");

        // Node ID label and coordinates
        const tag = node.isApex ? " [APEX]" : node.isBoundary ? " [BASE]" : "";
        appendTextEntity(
          lines,
          node.x2D + 12,
          offY + node.y2D + 14,
          `NODE ${node.label}${tag} (X=${Math.round(node.x2D)}, Y=${Math.round(node.y2D)})`,
          12,
          "NODE_LABELS"
        );
      });
    }
  });

  // Global header annotation
  appendTextEntity(
    lines,
    0,
    stripsToExport.length * stripSpacingY + 60,
    `FABRIC ROLL NESTING LAYOUT (TENT / MEMBRANE) - ROLL WIDTH: ${rollW}mm | TOTAL METERS: ${layout.totalLinearMeters}m | SEAM GAP: ${layout.seamAllowanceMm}mm`,
    35,
    "TEXT_ANNOTATION"
  );

  lines.push("0", "ENDSEC", "0", "EOF");

  return lines.join("\n");
}

