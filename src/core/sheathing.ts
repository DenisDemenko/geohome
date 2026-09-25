import {
  DomeModel,
  Face,
  FaceTypeGroup,
  SheathingSheetLayout
} from "./types";
import { unfoldTriangleTo2D } from "./math";

export interface SheathingPanelData {
  id: number;
  type: string;
  lengths: [number, number, number]; // mm
  angles: [number, number, number]; // deg
  areaM2: number;
  bevelDeg: number;
  vertices2D: { x: number; y: number }[];
}

/**
 * Calculates optimal 2D triangle orientation that minimizes height
 * by testing each of the 3 sides as the base on the X-axis.
 */
export function getOptimalTriangle2D(lengths: [number, number, number]): {
  w: number;
  h: number;
  base: number;
  pts: [number, number][];
} {
  const [L1, L2, L3] = lengths;
  const perms: [number, number, number][] = [
    [L2, L3, L1], // base is L1
    [L3, L1, L2], // base is L2
    [L1, L2, L3]  // base is L3
  ];

  let best: { w: number; h: number; base: number; pts: [number, number][] } | null = null;
  for (const [a, b, c] of perms) {
    const coords = unfoldTriangleTo2D(a, b, c);
    const minX = Math.min(coords.pA.x, coords.pB.x, coords.pC.x);
    const maxX = Math.max(coords.pA.x, coords.pB.x, coords.pC.x);
    const minY = Math.min(coords.pA.y, coords.pB.y, coords.pC.y);
    const maxY = Math.max(coords.pA.y, coords.pB.y, coords.pC.y);
    const w = maxX - minX;
    const h = maxY - minY;

    if (!best || h < best.h) {
      best = {
        w: Math.round(w),
        h: Math.round(h),
        base: c,
        pts: [
          [Math.round(coords.pA.x - minX), Math.round(coords.pA.y - minY)],
          [Math.round(coords.pB.x - minX), Math.round(coords.pB.y - minY)],
          [Math.round(coords.pC.x - minX), Math.round(coords.pC.y - minY)]
        ]
      };
    }
  }
  return best!;
}

export function extractSheathingPanels(model: DomeModel): SheathingPanelData[] {
  return model.faces.map(face => {
    const pA = model.nodes[face.a].position;
    const pB = model.nodes[face.b].position;
    const pC = model.nodes[face.c].position;

    // Distances
    const dAB = Math.hypot(pB.x - pA.x, pB.y - pA.y, pB.z - pA.z);
    const dBC = Math.hypot(pC.x - pB.x, pC.y - pB.y, pC.z - pB.z);
    const dCA = Math.hypot(pA.x - pC.x, pA.y - pC.y, pA.z - pC.z);

    const lengths: [number, number, number] = [
      Math.round(dBC),
      Math.round(dCA),
      Math.round(dAB)
    ];

    const group = model.faceGroups.find(g => g.type === face.type);
    const angles: [number, number, number] = group ? group.angles : [60, 60, 60];
    const bevelDeg = group ? group.dihedralBevels[0] : 5.0;

    const opt = getOptimalTriangle2D(lengths);

    return {
      id: face.id,
      type: face.type,
      lengths,
      angles,
      areaM2: Math.round((face.area / 1_000_000) * 1000) / 1000,
      bevelDeg,
      vertices2D: opt.pts.map(([x, y]) => ({ x, y }))
    };
  });
}

/**
 * Nests triangular cladding panels onto rectangular plywood sheets (e.g. 2800x1250 mm or 2500x1250 mm).
 * Optimized for CNC routers with variable cutter / router bit diameters: 4, 6, 8, 10, 12 mm.
 * Features interlocking triangle pairing, edge margin clearance, tool kerf separation,
 * holding tabs placement, and CNC machining time/cut length estimation.
 */
export function calculateSheetNesting(
  model: DomeModel,
  sheetWidth = 2800,
  sheetHeight = 1250,
  toolDiameter = 6,
  margin = 15,
  safetyGap = 2,
  feedRateMmMin = 3500,
  passes = 2
): SheathingSheetLayout {
  const panels = extractSheathingPanels(model);
  const totalPanels = panels.length;
  const domeSurfaceAreaM2 = model.statistics.domeSurfaceAreaM2;

  // Actual spacing between cuts = tool diameter + optional safety gap
  const effectiveGap = Math.max(toolDiameter, toolDiameter + safetyGap);

  // Group by face type to nest identical panels in pairs
  const panelsByType = new Map<string, SheathingPanelData[]>();
  for (const p of panels) {
    if (!panelsByType.has(p.type)) panelsByType.set(p.type, []);
    panelsByType.get(p.type)!.push(p);
  }

  const placedPanels: SheathingSheetLayout["placedPanels"] = [];
  let currentSheet = 0;
  let curX = margin;
  let curY = margin;
  let rowHeight = 0;

  for (const [type, typePanels] of panelsByType.entries()) {
    if (typePanels.length === 0) continue;
    const sample = typePanels[0];
    const opt = getOptimalTriangle2D(sample.lengths);

    let triW = opt.w;
    let triH = opt.h;
    let pts = opt.pts;

    // Check if triangle should be rotated 90 degrees to fit better within sheet height
    if (
      triH > sheetHeight - 2 * margin &&
      triW <= sheetHeight - 2 * margin &&
      triH <= sheetWidth - 2 * margin
    ) {
      pts = pts.map(([x, y]) => [y, triW - x]);
      const temp = triW;
      triW = triH;
      triH = temp;
    }

    // Allocation height clamped so large panels in big domes still anchor cleanly
    const allocH = Math.min(triH, sheetHeight - 2 * margin);

    // Complementary interlocking advance: each complementary triangle advances by roughly half base + gap
    const stepAdvance = Math.round(triW * 0.5 + effectiveGap);

    for (let i = 0; i < typePanels.length; i++) {
      const p = typePanels[i];
      const isOdd = i % 2 === 1;

      // Check if current triangle fits on current row (only wrap if row already has items)
      if (curX > margin && curX + triW > sheetWidth - margin) {
        curX = margin;
        curY += rowHeight + effectiveGap;
        rowHeight = 0;
      }

      // Check if current row fits on current sheet (only wrap if sheet already has items)
      if (curY > margin && curY + allocH > sheetHeight - margin) {
        currentSheet++;
        curX = margin;
        curY = margin;
        rowHeight = 0;
      }

      rowHeight = Math.max(rowHeight, allocH);

      const rotationDeg = isOdd ? 180 : 0;
      let poly: [number, number][];

      if (!isOdd) {
        // Upright triangle
        poly = pts.map(([px, py]) => [
          Math.round(curX + px),
          Math.round(curY + py)
        ]);
        curX += stepAdvance;
      } else {
        // Inverted complementary triangle (rotated 180 degrees)
        poly = pts.map(([px, py]) => [
          Math.round(curX + (triW - px)),
          Math.round(curY + (allocH - py))
        ]);
        curX += stepAdvance;
      }

      // Calculate holding tabs (at midpoints of edges)
      const tabs: [number, number][] = [
        [Math.round((poly[0][0] + poly[1][0]) / 2), Math.round((poly[0][1] + poly[1][1]) / 2)],
        [Math.round((poly[1][0] + poly[2][0]) / 2), Math.round((poly[1][1] + poly[2][1]) / 2)],
        [Math.round((poly[2][0] + poly[0][0]) / 2), Math.round((poly[2][0] + poly[0][1]) / 2)]
      ];

      const perimeterMm = p.lengths[0] + p.lengths[1] + p.lengths[2];

      placedPanels.push({
        panelId: p.id,
        panelType: p.type,
        sheetIndex: currentSheet,
        x: Math.round(curX - stepAdvance),
        y: Math.round(curY),
        rotationDeg,
        polygon: poly,
        holdingTabs: tabs,
        perimeterMm
      });
    }

    // After finishing a type group, advance to next row cleanly
    curX = margin;
    curY += rowHeight + effectiveGap;
    rowHeight = 0;
  }

  const totalSheetsRequired = currentSheet + 1;
  const singleSheetAreaM2 = (sheetWidth * sheetHeight) / 1_000_000;
  const totalSheetAreaM2 =
    Math.round(totalSheetsRequired * singleSheetAreaM2 * 100) / 100;
  const panelsPerSheet =
    Math.round((totalPanels / Math.max(1, totalSheetsRequired)) * 10) / 10;
  const usedAreaM2 = panels.reduce((sum, p) => sum + p.areaM2, 0);
  const wastePercentage = Math.max(
    0,
    Math.round(((totalSheetAreaM2 - usedAreaM2) / totalSheetAreaM2) * 100)
  );

  // Total toolpath cutting length (sum of perimeters in meters)
  const totalLinearCutMeters =
    Math.round(
      panels.reduce(
        (sum, p) => sum + (p.lengths[0] + p.lengths[1] + p.lengths[2]) / 1000,
        0
      ) * 10
    ) / 10;

  // Estimated CNC machining time in minutes
  // Time = (meters * 1000 * passes) / feedRate + sheet setups + rapid moves
  const cutTimeMin =
    ((totalLinearCutMeters * 1000 * passes) / feedRateMmMin);
  const rapidAndPlungeMin = totalPanels * 0.15 * passes;
  const sheetSetupMin = totalSheetsRequired * 1.5; // sheet loading & zeroing
  const estimatedMachiningMinutes =
    Math.round((cutTimeMin + rapidAndPlungeMin + sheetSetupMin) * 10) / 10;

  // Per-sheet breakdown summary
  const sheetsSummary: SheathingSheetLayout["sheetsSummary"] = [];
  for (let s = 0; s < totalSheetsRequired; s++) {
    const sPanels = placedPanels.filter(p => p.sheetIndex === s);
    const count = sPanels.length;
    const typeCounts: Record<string, number> = {};
    for (const sp of sPanels) {
      typeCounts[sp.panelType] = (typeCounts[sp.panelType] || 0) + 1;
    }
    const typesStr = Object.entries(typeCounts)
      .map(([t, c]) => `${t}: ${c} шт`)
      .join(", ");
    const cutLenM =
      Math.round(
        sPanels.reduce((sum, p) => sum + (p.perimeterMm || 0) / 1000, 0) * 10
      ) / 10;
    const sUsedArea = sPanels.reduce((sum, p) => {
      const g = model.faceGroups.find(x => x.type === p.panelType);
      return sum + (g ? g.area : 0.5);
    }, 0);
    const sWastePct = Math.max(
      0,
      Math.round(((singleSheetAreaM2 - sUsedArea) / singleSheetAreaM2) * 100)
    );

    sheetsSummary.push({
      sheetIndex: s,
      panelCount: count,
      typesSummary: typesStr,
      cutLengthM: cutLenM,
      usedAreaM2: Math.round(sUsedArea * 100) / 100,
      wastePct: sWastePct
    });
  }

  return {
    sheetWidth,
    sheetHeight,
    toolDiameter,
    margin,
    safetyGap,
    feedRateMmMin,
    passes,
    totalPanels,
    panelsPerSheet,
    totalSheetsRequired,
    totalSheetAreaM2,
    domeSurfaceAreaM2,
    wastePercentage,
    totalLinearCutMeters,
    estimatedMachiningMinutes,
    sheetsSummary,
    placedPanels
  };
}
