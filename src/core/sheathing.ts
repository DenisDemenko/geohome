import {
  DomeModel,
  Face,
  FaceTypeGroup,
  SheathingSheetLayout,
  SheathingParams,
  FabricStrip,
  FabricRollNestingLayout,
  FabricStripTriangle,
  FabricStripNode
} from "./types";
import { unfoldTriangleTo2D } from "./math";
import { calculateDoorwayTriangulationAndPanels } from "./conversions";

export const PLYWOOD_MATERIALS: {
  id: SheathingParams["material"];
  name: string;
  density: number; // kg/m3
  description: string;
}[] = [
  { id: "plywood_birch", name: "Березова фанера ФСФ/ФК", density: 680, description: "Висока міцність, 680 кг/м³" },
  { id: "plywood_pine", name: "Хвойна фанера", density: 550, description: "Вологостійка, легка, 550 кг/м³" },
  { id: "osb3", name: "Плита OSB-3", density: 640, description: "Орієнтовано-стружкова, 640 кг/м³" },
  { id: "fabric_roll", name: "Тент / Тканина в рулоні (ПВХ / Oxford / Мембрана)", density: 650, description: "Суцільні арочні полоси від фундаменту до фундаменту (рулон 500-2000 мм, припуск на шов)" },
  { id: "balsa", name: "Бальза / Авіафанера", density: 140, description: "Для макетів купола 15-50 см, 140 кг/м³" },
  { id: "polycarbonate", name: "Монолітний полікарбонат", density: 1200, description: "Прозоре скління купола, 1200 кг/м³" }
];

export const DEFAULT_SHEATHING_PARAMS: SheathingParams = {
  thickness: 12,
  material: "plywood_birch",
  density: 680,
  offsetMm: 0,
  seamGapMm: 0,
  finish: "colored",
  fabricRollWidthMm: 1500,
  seamAllowanceMm: 25,
  fabricGrammageGsm: 650,
  hemBaseAllowanceMm: 150
};

export function getRecommendedPlywoodThickness(diameterMm: number): number {
  if (diameterMm <= 300) return 1.5;
  if (diameterMm <= 800) return 3;
  if (diameterMm <= 2000) return 6;
  if (diameterMm <= 5000) return 9;
  if (diameterMm <= 9000) return 12;
  return 15;
}

export interface SheathingPanelData {
  id: number;
  type: string;
  lengths: [number, number, number]; // mm
  angles: [number, number, number]; // deg
  areaM2: number;
  bevelDeg: number;
  vertices2D: { x: number; y: number }[];
  isPlinth?: boolean;
  isRectangle?: boolean;
  plinthBayIndex?: number;
  plinthRole?: "upper" | "lower" | string;
  rectWidth?: number;
  rectHeight?: number;
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

export function extractDoorwaySheathingPanels(model: DomeModel): SheathingPanelData[] {
  if (!model.doorFaceIds || model.doorFaceIds.length === 0) return [];

  let anchorFaceId = model.doorParams?.anchorFaceId;
  if (anchorFaceId === undefined || !model.doorFaceIds.includes(anchorFaceId)) {
    let lowestZ = Infinity;
    let bestId = model.doorFaceIds[0];
    for (const fid of model.doorFaceIds) {
      const f = model.faces.find(fa => fa.id === fid);
      if (f) {
        const zAvg = (model.nodes[f.a].position.z + model.nodes[f.b].position.z + model.nodes[f.c].position.z) / 3;
        if (zAvg < lowestZ) {
          lowestZ = zAvg;
          bestId = f.id;
        }
      }
    }
    anchorFaceId = bestId;
  }

  const effBeamDepth = (model.beamProfile.type === "circular" || model.beamProfile.type === "pipe")
    ? (model.beamProfile.diameter || model.beamProfile.width)
    : model.beamProfile.depth;
  const portalDepth = Math.max(160, effBeamDepth + 60);

  const triResult = calculateDoorwayTriangulationAndPanels(
    model,
    anchorFaceId,
    model.doorParams?.widthMm || 900,
    model.doorParams?.heightMm || 2050,
    portalDepth,
    model.doorParams?.elevationFromBaseMm || 0,
    model.doorParams?.offsetFromDomeMm || 0,
    model.doorParams?.bayClusterType || "auto",
    model.doorParams?.clusterHubNodeId
  );

  if (!triResult) return [];

  const allDoorPanels = [
    ...triResult.infillTriangles,
    ...(triResult.vestibulePanels || []),
    ...triResult.revealPanels
  ];
  return allDoorPanels.map((p, idx) => {
    const opt = getOptimalTriangle2D(p.lengths);
    return {
      id: 20000 + idx,
      type: p.type,
      lengths: p.lengths,
      angles: p.angles,
      areaM2: p.areaM2,
      bevelDeg: p.bevelDeg,
      vertices2D: opt.pts.map(([x, y]) => ({ x, y }))
    };
  });
}

/**
 * Computes node coordinates at the outer or inner face of the timber beams.
 * Struts run along chords between nodes; their depth extends outward/inward by depth / 2.
 * The outer sheathing is fastened to the exterior face of the beams (+effBeamDepth / 2 + offsetMm).
 * The inner sheathing is fastened to the interior face of the beams (-effBeamDepth / 2).
 */
export function getBeamFaceVertex(
  pos: { x: number; y: number; z: number },
  model: DomeModel,
  faceType: "outer" | "inner" = "outer"
): { x: number; y: number; z: number } {
  const effBeamDepth =
    (model.beamProfile.type === "circular" || model.beamProfile.type === "pipe")
      ? (model.beamProfile.diameter || model.beamProfile.width || 40)
      : (model.beamProfile.depth || 150);

  const offsetMm =
    faceType === "outer"
      ? (effBeamDepth / 2) + (model.sheathingParams?.offsetMm || 0)
      : -(effBeamDepth / 2);

  const isPlinthActive = Boolean(model.parameters.plinth?.enabled && (model.statistics?.plinthHeightMm ?? model.parameters.plinth.height ?? 0) > 0);
  const plinthH = isPlinthActive ? (model.statistics?.plinthHeightMm || model.parameters.plinth?.height || 800) : 0;

  if (isPlinthActive && plinthH > 0 && pos.z <= plinthH + 1.0) {
    const rXY = Math.hypot(pos.x, pos.y) || 1;
    return {
      x: pos.x + (pos.x / rXY) * offsetMm,
      y: pos.y + (pos.y / rXY) * offsetMm,
      z: pos.z
    };
  }

  const R = model.parameters.diameter / 2;
  const centerZ = model.parameters.height - R;

  const rx = pos.x;
  const ry = pos.y;
  const rz = pos.z - centerZ;
  const rLen = Math.hypot(rx, ry, rz) || R;

  return {
    x: pos.x + (rx / rLen) * offsetMm,
    y: pos.y + (ry / rLen) * offsetMm,
    z: pos.z + (rz / rLen) * offsetMm
  };
}

export function extractSheathingPanels(model: DomeModel, excludeWindowFaces = true): SheathingPanelData[] {
  const excludedIds = new Set<number>();
  if (excludeWindowFaces) {
    (model.windowFaceIds || []).forEach(id => excludedIds.add(id));
    (model.doorFaceIds || []).forEach(id => excludedIds.add(id));
    (model.solarFaceIds || []).forEach(id => excludedIds.add(id));
  }
  const targetFaces = excludedIds.size > 0 ? model.faces.filter(f => !excludedIds.has(f.id)) : model.faces;

  const isPlinthActive = Boolean(model.parameters.plinth?.enabled && (model.statistics?.plinthHeightMm ?? model.parameters.plinth?.height ?? 0) > 0);
  const plinthH = isPlinthActive ? (model.statistics?.plinthHeightMm || model.parameters.plinth?.height || 800) : 0;
  const plinthSills = isPlinthActive ? model.edges.filter(e => e.isPlinthBeam && e.plinthRole === "sill") : [];
  const avgBayW = plinthSills.length > 0 ? plinthSills.reduce((s, e) => s + e.length, 0) / plinthSills.length : 1000;

  // Dome triangles (exclude internal plinth triangulation faces)
  const domeFaces = targetFaces.filter(f => !f.isPlinthFace);

  const basePanels = domeFaces.map(face => {
    // Outer sheathing is fastened to the EXTERIOR faces of the timber frame struts
    const pA = getBeamFaceVertex(model.nodes[face.a].position, model, "outer");
    const pB = getBeamFaceVertex(model.nodes[face.b].position, model, "outer");
    const pC = getBeamFaceVertex(model.nodes[face.c].position, model, "outer");

    // Distances along outer faces of beams
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

    // True area of outer sheathing triangle on the outer faces of the beams
    const s = (dAB + dBC + dCA) / 2;
    const outerAreaMm2 = Math.sqrt(Math.max(0, s * (s - dAB) * (s - dBC) * (s - dCA)));
    const areaM2 = Math.round((outerAreaMm2 / 1_000_000) * 1000) / 1000;

    return {
      id: face.id,
      type: face.type,
      lengths,
      angles,
      areaM2,
      bevelDeg,
      vertices2D: opt.pts.map(([x, y]) => ({ x, y }))
    };
  });

  // Rectangular plinth cladding panels for cutting layout (цоколь в формі прямокутників)
  const plinthPanels: SheathingPanelData[] = [];
  if (isPlinthActive && plinthH > 0) {
    const bayCount = plinthSills.length > 0 ? plinthSills.length : (model.statistics?.plinthBayCount || 0);
    for (let bIdx = 0; bIdx < bayCount; bIdx++) {
      const bayW = plinthSills[bIdx] ? plinthSills[bIdx].length : avgBayW;
      const wRound = Math.round(bayW);
      const hRound = Math.round(plinthH);
      const areaM2 = Math.round(((bayW * plinthH) / 1_000_000) * 1000) / 1000;

      plinthPanels.push({
        id: 90000 + bIdx,
        type: "PL",
        lengths: [wRound, hRound, wRound],
        angles: [90, 90, 90],
        areaM2,
        bevelDeg: 0,
        isPlinth: true,
        isRectangle: true,
        plinthBayIndex: bIdx,
        rectWidth: wRound,
        rectHeight: hRound,
        vertices2D: [
          { x: 0, y: 0 },
          { x: wRound, y: 0 },
          { x: wRound, y: hRound },
          { x: 0, y: hRound }
        ]
      });
    }
  }

  const doorPanels = excludeWindowFaces ? extractDoorwaySheathingPanels(model) : [];
  return [...basePanels, ...plinthPanels, ...doorPanels];
}

/**
 * Extracts 2D cutting triangles for inner sheathing (drywall, chipboard, OSB, plywood).
 * Automatically excludes door openings and windows, and includes door triangulated infill & casing panels.
 * Inner sheathing is calculated from the INTERIOR faces of the timber struts (-effBeamDepth / 2).
 */
export function extractInnerSheathingPanels(model: DomeModel): SheathingPanelData[] {
  const excludedIds = new Set<number>();
  (model.windowFaceIds || []).forEach(id => excludedIds.add(id));
  (model.doorFaceIds || []).forEach(id => excludedIds.add(id));
  (model.solarFaceIds || []).forEach(id => excludedIds.add(id));

  const targetFaces = model.faces.filter(f => !excludedIds.has(f.id));

  const isPlinthActive = Boolean(model.parameters.plinth?.enabled && (model.statistics?.plinthHeightMm ?? model.parameters.plinth?.height ?? 0) > 0);
  const plinthH = isPlinthActive ? (model.statistics?.plinthHeightMm || model.parameters.plinth?.height || 800) : 0;
  const plinthSills = isPlinthActive ? model.edges.filter(e => e.isPlinthBeam && e.plinthRole === "sill") : [];
  const avgBayW = plinthSills.length > 0 ? plinthSills.reduce((s, e) => s + e.length, 0) / plinthSills.length : 1000;

  const domeFaces = targetFaces.filter(f => !f.isPlinthFace);

  const basePanels = domeFaces.map(face => {
    // Inner sheathing on the INTERIOR face of the beams
    const pA = getBeamFaceVertex(model.nodes[face.a].position, model, "inner");
    const pB = getBeamFaceVertex(model.nodes[face.b].position, model, "inner");
    const pC = getBeamFaceVertex(model.nodes[face.c].position, model, "inner");

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

    const s = (dAB + dBC + dCA) / 2;
    const innerAreaMm2 = Math.sqrt(Math.max(0, s * (s - dAB) * (s - dBC) * (s - dCA)));
    const areaM2 = Math.round((innerAreaMm2 / 1_000_000) * 1000) / 1000;

    return {
      id: face.id,
      type: face.type,
      lengths,
      angles,
      areaM2,
      bevelDeg,
      vertices2D: opt.pts.map(([x, y]) => ({ x, y }))
    };
  });

  const plinthPanels: SheathingPanelData[] = [];
  if (isPlinthActive && plinthH > 0) {
    const bayCount = plinthSills.length > 0 ? plinthSills.length : (model.statistics?.plinthBayCount || 0);
    for (let bIdx = 0; bIdx < bayCount; bIdx++) {
      const bayW = plinthSills[bIdx] ? plinthSills[bIdx].length : avgBayW;
      const wRound = Math.round(bayW);
      const hRound = Math.round(plinthH);
      const areaM2 = Math.round(((bayW * plinthH) / 1_000_000) * 1000) / 1000;

      plinthPanels.push({
        id: 95000 + bIdx,
        type: "PL",
        lengths: [wRound, hRound, wRound],
        angles: [90, 90, 90],
        areaM2,
        bevelDeg: 0,
        isPlinth: true,
        isRectangle: true,
        plinthBayIndex: bIdx,
        rectWidth: wRound,
        rectHeight: hRound,
        vertices2D: [
          { x: 0, y: 0 },
          { x: wRound, y: 0 },
          { x: wRound, y: hRound },
          { x: 0, y: hRound }
        ]
      });
    }
  }

  const doorPanels = extractDoorwaySheathingPanels(model);
  return [...basePanels, ...plinthPanels, ...doorPanels];
}

/**
 * Extracts 2D cutting triangles specifically for solar PV electric triangles.
 */
export function extractSolarPanels(model: DomeModel): SheathingPanelData[] {
  const solarIds = new Set(model.solarFaceIds || []);
  if (solarIds.size === 0) return [];

  const targetFaces = model.faces.filter(f => solarIds.has(f.id));
  return targetFaces.map(face => {
    const pA = model.nodes[face.a].position;
    const pB = model.nodes[face.b].position;
    const pC = model.nodes[face.c].position;

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
 * Extracts 2D cutting triangles specifically for converted window faces (skylights & glass panes).
 */
export function extractWindowPanels(model: DomeModel): SheathingPanelData[] {
  const windowIds = new Set(model.windowFaceIds || []);
  if (windowIds.size === 0) return [];

  const targetFaces = model.faces.filter(f => windowIds.has(f.id));
  return targetFaces.map(face => {
    const pA = model.nodes[face.a].position;
    const pB = model.nodes[face.b].position;
    const pC = model.nodes[face.c].position;

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

export const STANDARD_SHEET_SIZES: { w: number; h: number; name: string }[] = [
  { w: 3050, h: 1525, name: "3050 × 1525 мм (Великоформатний лист ФСФ — для куполів ≥ 7м)" },
  { w: 1525, h: 3050, name: "3050 × 1525 мм (Великоформатний вертикал)" },
  { w: 2800, h: 1250, name: "2800 × 1250 мм (ЧПУ формат фанери, горизонт)" },
  { w: 1250, h: 2800, name: "2800 × 1250 мм (ЧПУ формат, вертикал)" },
  { w: 2500, h: 1250, name: "2500 × 1250 мм (Євро-формат горизонт)" },
  { w: 1250, h: 2500, name: "1250 × 2500 мм (Євро-формат вертикал)" },
  { w: 2440, h: 1220, name: "2440 × 1220 мм (Американський 4×8 фт)" },
  { w: 1525, h: 1525, name: "1525 × 1525 мм (Квадратний лист ФК)" }
];

export const STANDARD_GLAZING_SHEET_SIZES: { w: number; h: number; name: string; material: string }[] = [
  { w: 2050, h: 1250, name: "2050 × 1250 мм (Стандартний лист монолітного полікарбонату / акрилу)", material: "Монолітний полікарбонат" },
  { w: 3050, h: 2050, name: "3050 × 2050 мм (Великоформатний лист монолітного полікарбонату)", material: "Монолітний полікарбонат" },
  { w: 2500, h: 1250, name: "2500 × 1250 мм (Формат листового скла / склопакетів)", material: "Склопакет / Скло" },
  { w: 2050, h: 1525, name: "2050 × 1525 мм (Формат оргскла / акрилу)", material: "Оргскло / Акрил" }
];

export function getRecommendedSheetFormat(
  model: DomeModel,
  margin = 15
): { w: number; h: number; name: string; requiresJumbo: boolean; maxPanelDim: number } {
  const panels = extractSheathingPanels(model);
  let maxDim = 0;
  for (const p of panels) {
    if (p.isRectangle) {
      maxDim = Math.max(maxDim, Math.min(p.rectWidth || p.lengths[0], p.rectHeight || p.lengths[1]));
    } else {
      const opt = getOptimalTriangle2D(p.lengths);
      maxDim = Math.max(maxDim, opt.h);
    }
  }
  const requiresJumbo = maxDim > 1250 - 2 * margin;
  if (requiresJumbo) {
    return {
      w: 3050,
      h: 1525,
      name: "3050 × 1525 мм (Великоформатний лист ФСФ — для куполів ≥ 7м)",
      requiresJumbo: true,
      maxPanelDim: maxDim
    };
  }
  return {
    w: 2800,
    h: 1250,
    name: "2800 × 1250 мм (ЧПУ формат фанери, горизонт)",
    requiresJumbo: false,
    maxPanelDim: maxDim
  };
}

function distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
}

function minPolygonDistance(p1: [number, number][], p2: [number, number][]): number {
  let minDist = Infinity;
  for (const pt of p1) {
    for (let i = 0; i < p2.length; i++) {
      const next = (i + 1) % p2.length;
      minDist = Math.min(minDist, distPointToSegment(pt[0], pt[1], p2[i][0], p2[i][1], p2[next][0], p2[next][1]));
    }
  }
  for (const pt of p2) {
    for (let i = 0; i < p1.length; i++) {
      const next = (i + 1) % p1.length;
      minDist = Math.min(minDist, distPointToSegment(pt[0], pt[1], p1[i][0], p1[i][1], p1[next][0], p1[next][1]));
    }
  }
  return minDist;
}

function findSafePlacementX(
  rowPolys: [number, number][][],
  candPolyLocal: [number, number][],
  curY: number,
  effectiveGap: number,
  minXStart: number
): number {
  if (rowPolys.length === 0) return minXStart;

  const testDist = (shiftX: number): number => {
    const p2: [number, number][] = candPolyLocal.map(([x, y]) => [x + shiftX, y + curY]);
    let d = Infinity;
    for (const prev of rowPolys) {
      d = Math.min(d, minPolygonDistance(prev, p2));
    }
    return d;
  };

  const lastPoly = rowPolys[rowPolys.length - 1];
  const lastMaxX = Math.max(...lastPoly.map(p => p[0]));
  const candMinX = Math.min(...candPolyLocal.map(p => p[0]));

  let low = Math.max(minXStart, lastMaxX - Math.max(...candPolyLocal.map(p => p[0])));
  let high = Math.max(minXStart, lastMaxX - candMinX + effectiveGap + 25);

  while (testDist(high) < effectiveGap) {
    high += 50;
  }

  for (let iter = 0; iter < 24; iter++) {
    const mid = (low + high) / 2;
    if (testDist(mid) < effectiveGap) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return Math.ceil(high);
}

export interface NestingOptions {
  excludeWindowFaces?: boolean;
  onlyWindowFaces?: boolean;
  onlyInnerSheathing?: boolean;
  onlySolarFaces?: boolean;
  customPanels?: SheathingPanelData[];
  materialName?: string;
}

/**
 * Nests triangular cladding panels onto rectangular sheets (plywood, OSB, or acrylic/glass).
 * Optimized for CNC routers with variable cutter / router bit diameters: 4, 6, 8, 10, 12 mm.
 * Features interlocking triangle pairing, edge margin clearance, tool kerf separation,
 * holding tabs placement, CNC machining time/cut length estimation, and split panel option for oversized triangles.
 * When dome has converted windows (skylights), they are automatically excluded from the solid plywood cutting
 * and can be nested on separate plastic/glass sheets via onlyWindowFaces or calculateWindowNesting.
 */
export function calculateSheetNesting(
  model: DomeModel,
  sheetWidth?: number,
  sheetHeight?: number,
  toolDiameter = 6,
  margin = 15,
  safetyGap = 2,
  feedRateMmMin = 3500,
  passes = 2,
  options?: NestingOptions
): SheathingSheetLayout {
  const recFormat = getRecommendedSheetFormat(model, margin);
  const actualSheetWidth = sheetWidth || recFormat.w;
  const actualSheetHeight = sheetHeight || recFormat.h;

  let panels: SheathingPanelData[];
  if (options?.onlyWindowFaces) {
    panels = extractWindowPanels(model);
  } else if (options?.onlySolarFaces) {
    panels = extractSolarPanels(model);
  } else if (options?.onlyInnerSheathing) {
    panels = extractInnerSheathingPanels(model);
  } else if (options?.customPanels) {
    panels = options.customPanels;
  } else {
    const shouldExclude = options?.excludeWindowFaces ?? true;
    panels = extractSheathingPanels(model, shouldExclude);
  }

  const totalPanels = panels.length;
  const usedAreaM2 = Math.round(panels.reduce((sum, p) => sum + p.areaM2, 0) * 100) / 100;
  const domeSurfaceAreaM2 = usedAreaM2;

  if (totalPanels === 0) {
    return {
      sheetWidth: actualSheetWidth,
      sheetHeight: actualSheetHeight,
      toolDiameter,
      margin,
      safetyGap,
      feedRateMmMin,
      passes,
      totalPanels: 0,
      panelsPerSheet: 0,
      totalSheetsRequired: 0,
      totalSheetAreaM2: 0,
      domeSurfaceAreaM2: 0,
      wastePercentage: 0,
      totalLinearCutMeters: 0,
      estimatedMachiningMinutes: 0,
      sheetsSummary: [],
      hasOversizedPanels: false,
      oversizedPanelTypes: [],
      maxPanelHeight: 0,
      recommendedSheetFormat: recFormat,
      placedPanels: []
    };
  }

  // Actual spacing between cuts = tool diameter + safety gap
  const effectiveGap = Math.max(toolDiameter, toolDiameter + safetyGap);

  // Group by face type to nest identical panels in pairs
  const panelsByType = new Map<string, SheathingPanelData[]>();
  for (const p of panels) {
    if (!panelsByType.has(p.type)) panelsByType.set(p.type, []);
    panelsByType.get(p.type)!.push(p);
  }

  const placedPanels: SheathingSheetLayout["placedPanels"] = [];
  let currentSheet = 0;
  let curY = margin;
  let rowHeight = 0;
  let rowPolygons: [number, number][][] = [];

  let hasOversizedPanels = false;
  const oversizedPanelTypes = new Set<string>();
  let maxPanelHeight = 0;

  for (const [type, typePanels] of panelsByType.entries()) {
    if (typePanels.length === 0) continue;
    const sample = typePanels[0];
    const isRectangle = Boolean(sample.isRectangle || sample.isPlinth || type === "PL");

    let triW: number;
    let triH: number;
    let pts: [number, number][];

    if (isRectangle) {
      let rW = sample.rectWidth || sample.lengths[0];
      let rH = sample.rectHeight || sample.lengths[1];

      // Auto-orient rectangle to fit sheet dimensions best
      const fitsNormal = rH <= actualSheetHeight - 2 * margin && rW <= actualSheetWidth - 2 * margin;
      const fitsRotated = rW <= actualSheetHeight - 2 * margin && rH <= actualSheetWidth - 2 * margin;

      if (!fitsNormal && fitsRotated) {
        const tmp = rW;
        rW = rH;
        rH = tmp;
      }

      triW = rW;
      triH = rH;
      pts = [
        [0, 0],
        [rW, 0],
        [rW, rH],
        [0, rH]
      ];
    } else {
      const opt = getOptimalTriangle2D(sample.lengths);
      triW = opt.w;
      triH = opt.h;
      pts = opt.pts;

      // Check if triangle should be rotated 90 degrees to fit better within sheet height
      if (
        triH > actualSheetHeight - 2 * margin &&
        triW <= actualSheetHeight - 2 * margin &&
        triH <= actualSheetWidth - 2 * margin
      ) {
        pts = pts.map(([x, y]) => [y, triW - x]);
        const temp = triW;
        triW = triH;
        triH = temp;
      }
    }

    const isOversized = triH > actualSheetHeight - 2 * margin || triW > actualSheetWidth - 2 * margin;
    if (isOversized) {
      hasOversizedPanels = true;
      oversizedPanelTypes.add(type);
      maxPanelHeight = Math.max(maxPanelHeight, triH);
    }

    const ptsRot0: [number, number][] = pts;
    const ptsRot180: [number, number][] = isRectangle
      ? pts
      : pts.map(([px, py]) => [triW - px, triH - py]);

    for (let i = 0; i < typePanels.length; i++) {
      const p = typePanels[i];

      // On a fresh row, always place upright (0°). For triangles, subsequent panels alternate 180° for interlocking
      let rotationDeg = (!isRectangle && rowPolygons.length % 2 === 1) ? 180 : 0;
      let candLocal = rotationDeg === 180 ? ptsRot180 : ptsRot0;

      let candX: number;
      if (isRectangle) {
        if (rowPolygons.length === 0) {
          candX = margin;
        } else {
          const lastPoly = rowPolygons[rowPolygons.length - 1];
          const lastMaxX = Math.max(...lastPoly.map(pt => pt[0]));
          candX = lastMaxX + effectiveGap;
        }
      } else {
        candX = findSafePlacementX(rowPolygons, candLocal, curY, effectiveGap, margin);
      }

      // Check if it fits on this row
      if (rowPolygons.length > 0 && candX + triW > actualSheetWidth - margin) {
        // Move to next row
        curY += rowHeight + effectiveGap;
        rowHeight = 0;
        rowPolygons = [];

        // Check if next row fits on this sheet
        if (curY + triH > actualSheetHeight - margin) {
          currentSheet++;
          curY = margin;
        }

        // On new row, start upright at margin
        rotationDeg = 0;
        candLocal = ptsRot0;
        candX = margin;
      } else if (rowPolygons.length === 0) {
        // First panel on row: check if fits on current sheet
        if (curY > margin && curY + triH > actualSheetHeight - margin) {
          currentSheet++;
          curY = margin;
          rowHeight = 0;
          rowPolygons = [];
        }
        candX = margin;
      }

      const polyPlaced: [number, number][] = candLocal.map(([px, py]) => [
        Math.round(candX + px),
        Math.round(curY + py)
      ]);

      rowPolygons.push(polyPlaced);
      rowHeight = Math.max(rowHeight, triH);

      // Calculate holding tabs
      let tabs: [number, number][];
      if (isRectangle) {
        tabs = [
          [Math.round((polyPlaced[0][0] + polyPlaced[1][0]) / 2), Math.round((polyPlaced[0][1] + polyPlaced[1][1]) / 2)],
          [Math.round((polyPlaced[1][0] + polyPlaced[2][0]) / 2), Math.round((polyPlaced[1][1] + polyPlaced[2][1]) / 2)],
          [Math.round((polyPlaced[2][0] + polyPlaced[3][0]) / 2), Math.round((polyPlaced[2][1] + polyPlaced[3][1]) / 2)],
          [Math.round((polyPlaced[3][0] + polyPlaced[0][0]) / 2), Math.round((polyPlaced[3][0] + polyPlaced[0][1]) / 2)]
        ];
      } else {
        tabs = [
          [Math.round((polyPlaced[0][0] + polyPlaced[1][0]) / 2), Math.round((polyPlaced[0][1] + polyPlaced[1][1]) / 2)],
          [Math.round((polyPlaced[1][0] + polyPlaced[2][0]) / 2), Math.round((polyPlaced[1][1] + polyPlaced[2][1]) / 2)],
          [Math.round((polyPlaced[2][0] + polyPlaced[0][0]) / 2), Math.round((polyPlaced[2][0] + polyPlaced[0][1]) / 2)]
        ];
      }

      const perimeterMm = isRectangle
        ? 2 * (triW + triH)
        : (p.lengths[0] + p.lengths[1] + p.lengths[2]);

      placedPanels.push({
        panelId: p.id,
        panelType: p.type,
        sheetIndex: currentSheet,
        x: Math.round(candX),
        y: Math.round(curY),
        rotationDeg,
        polygon: polyPlaced,
        holdingTabs: tabs,
        perimeterMm
      });
    }

    // After finishing a type group, advance to next row cleanly
    curY += rowHeight + effectiveGap;
    rowHeight = 0;
    rowPolygons = [];
  }

  const totalSheetsRequired = currentSheet + 1;
  const singleSheetAreaM2 = (actualSheetWidth * actualSheetHeight) / 1_000_000;
  const totalSheetAreaM2 =
    Math.round(totalSheetsRequired * singleSheetAreaM2 * 100) / 100;
  const panelsPerSheet =
    Math.round((totalPanels / Math.max(1, totalSheetsRequired)) * 10) / 10;
  const wastePercentage = Math.max(
    0,
    Math.round(((totalSheetAreaM2 - usedAreaM2) / Math.max(0.01, totalSheetAreaM2)) * 100)
  );

  // Total toolpath cutting length (sum of perimeters in meters)
  const totalLinearCutMeters =
    Math.round(
      panels.reduce((sum, p) => {
        const perim = (p.isRectangle || p.isPlinth || p.type === "PL")
          ? 2 * ((p.rectWidth || p.lengths[0]) + (p.rectHeight || p.lengths[1]))
          : (p.lengths[0] + p.lengths[1] + p.lengths[2]);
        return sum + perim / 1000;
      }, 0) * 10
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
      if (p.panelType === "PL") {
        const plinthP = panels.find(x => x.id === p.panelId);
        return sum + (plinthP?.areaM2 || 0.5);
      }
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
    sheetWidth: actualSheetWidth,
    sheetHeight: actualSheetHeight,
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
    materialName: options?.materialName || (options?.onlyWindowFaces ? "Монолітний полікарбонат / Скло" : (options?.onlySolarFaces ? "Сонячні BIPV модулі під склом" : (options?.onlyInnerSheathing ? "Внутрішня обшивка" : "Фанера ФСФ / OSB-3"))),
    isWindowGlazing: !!options?.onlyWindowFaces,
    isInnerSheathing: !!options?.onlyInnerSheathing,
    isSolarGlazing: !!options?.onlySolarFaces,
    sheetsSummary,
    hasOversizedPanels,
    oversizedPanelTypes: Array.from(oversizedPanelTypes),
    maxPanelHeight,
    recommendedSheetFormat: recFormat,
    placedPanels
  };
}

/**
 * Nests converted window faces onto separate plastic or glass sheets (e.g. 2050x1250 mm or 3050x2050 mm).
 * If window triangles > 1 or >= 1, they are grouped and formed into dedicated cut sheets for polycarbonate/acrylic/glass.
 */
export function calculateWindowNesting(
  model: DomeModel,
  sheetWidth = 2050,
  sheetHeight = 1250,
  toolDiameter = 4,
  margin = 15,
  safetyGap = 2,
  feedRateMmMin = 3000,
  passes = 1
): SheathingSheetLayout {
  return calculateSheetNesting(
    model,
    sheetWidth,
    sheetHeight,
    toolDiameter,
    margin,
    safetyGap,
    feedRateMmMin,
    passes,
    { onlyWindowFaces: true, materialName: "Монолітний полікарбонат / Скло" }
  );
}

/**
 * Nests inner sheathing panels (drywall, chipboard, OSB, plywood) onto rectangular sheets.
 */
export function calculateInnerSheathingNesting(
  model: DomeModel,
  sheetWidth = 2500,
  sheetHeight = 1200,
  toolDiameter = 6,
  margin = 15,
  safetyGap = 2,
  feedRateMmMin = 3800,
  passes = 1,
  materialName = "Гіпсокартон ГКЛ 12.5 мм"
): SheathingSheetLayout {
  return calculateSheetNesting(
    model,
    sheetWidth,
    sheetHeight,
    toolDiameter,
    margin,
    safetyGap,
    feedRateMmMin,
    passes,
    { onlyInnerSheathing: true, materialName }
  );
}

/**
 * Nests solar PV electric generation triangles onto glass sheets.
 */
export function calculateSolarNesting(
  model: DomeModel,
  sheetWidth = 2050,
  sheetHeight = 1250,
  toolDiameter = 4,
  margin = 15,
  safetyGap = 2,
  feedRateMmMin = 3000,
  passes = 1
): SheathingSheetLayout {
  return calculateSheetNesting(
    model,
    sheetWidth,
    sheetHeight,
    toolDiameter,
    margin,
    safetyGap,
    feedRateMmMin,
    passes,
    { onlySolarFaces: true, materialName: "Сонячні фотоелектричні модулі BIPV" }
  );
}

/**
 * Calculates continuous fabric roll nesting layout (Тент / Мембрана з рулону).
 * The fabric roll has a selectable width from 500 mm to 2000 mm.
 * Strips run continuous from one edge of the foundation across the dome to the opposite edge of the foundation.
 * Includes thread sewing seam allowances on each edge (зазор на прошив ниткою) and foundation hems.
 */
function dist3D(p1: { x: number; y: number; z: number }, p2: { x: number; y: number; z: number }): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z);
}

/**
 * Orders a set of geodesic dome faces into a continuous chain of adjacent triangles sharing strut edges,
 * starting from the foundation base and progressing towards the apex.
 */
export function orderConnectedFaces(faceIds: number[], model: DomeModel): number[] {
  if (faceIds.length <= 1) return [...faceIds];

  const faceMap = new Map<number, (typeof model.faces)[0]>();
  for (const f of model.faces) {
    faceMap.set(f.id, f);
  }
  const nodeMap = new Map<number, (typeof model.nodes)[0]>();
  for (const n of model.nodes) {
    nodeMap.set(n.id, n);
  }

  const validIds = faceIds.filter(id => faceMap.has(id));
  if (validIds.length <= 1) return validIds;

  const getFaceZ = (fId: number) => {
    const f = faceMap.get(fId)!;
    return (nodeMap.get(f.a)!.position.z + nodeMap.get(f.b)!.position.z + nodeMap.get(f.c)!.position.z) / 3;
  };

  // 1. Check if the input is already a continuous edge-sharing sequence
  let alreadyContinuous = true;
  for (let i = 0; i < validIds.length - 1; i++) {
    const f1 = faceMap.get(validIds[i])!;
    const f2 = faceMap.get(validIds[i + 1])!;
    const s1 = new Set([f1.a, f1.b, f1.c]);
    const common = [f2.a, f2.b, f2.c].filter(id => s1.has(id));
    if (common.length < 2) {
      alreadyContinuous = false;
      break;
    }
  }

  if (alreadyContinuous) {
    // If consecutive faces form a continuous chain, ensure direction is base (foundation) to apex
    if (getFaceZ(validIds[0]) > getFaceZ(validIds[validIds.length - 1])) {
      return [...validIds].reverse();
    }
    return [...validIds];
  }

  // 2. Build adjacency graph between faces that share 2 nodes (an edge)
  const adj = new Map<number, number[]>();
  for (const id of validIds) {
    adj.set(id, []);
  }

  for (let i = 0; i < validIds.length; i++) {
    const f1 = faceMap.get(validIds[i])!;
    const s1 = new Set([f1.a, f1.b, f1.c]);
    for (let j = i + 1; j < validIds.length; j++) {
      const f2 = faceMap.get(validIds[j])!;
      const common = [f2.a, f2.b, f2.c].filter(nId => s1.has(nId));
      if (common.length >= 2) {
        adj.get(f1.id)!.push(f2.id);
        adj.get(f2.id)!.push(f1.id);
      }
    }
  }

  // Find chain endpoints (degree 1 in the subgraph)
  const endpoints = validIds.filter(id => adj.get(id)!.length === 1);
  let startId = validIds[0];
  if (endpoints.length > 0) {
    endpoints.sort((a, b) => getFaceZ(a) - getFaceZ(b));
    startId = endpoints[0]; // Start at foundation (lowest Z)
  } else {
    validIds.sort((a, b) => getFaceZ(a) - getFaceZ(b));
    startId = validIds[0];
  }

  const visited = new Set<number>([startId]);
  const ordered: number[] = [startId];
  let curr = startId;

  while (ordered.length < validIds.length) {
    const neighbors = adj.get(curr) || [];
    const unvisited = neighbors.filter(nId => !visited.has(nId));
    if (unvisited.length > 0) {
      // Prioritize moving upwards in Z towards apex
      unvisited.sort((a, b) => getFaceZ(b) - getFaceZ(a));
      const nextId = unvisited[0];
      visited.add(nextId);
      ordered.push(nextId);
      curr = nextId;
    } else {
      // If gap in user selection, connect to closest remaining unvisited face
      const remaining = validIds.filter(id => !visited.has(id));
      if (remaining.length === 0) break;
      remaining.sort((a, b) => getFaceZ(a) - getFaceZ(b));
      const jumpId = remaining[0];
      visited.add(jumpId);
      ordered.push(jumpId);
      curr = jumpId;
    }
  }

  return ordered;
}

/**
 * Performs exact 2D isometric flat unfolding of a continuous strip of adjacent geodesic triangles.
 * Preserves 100% true edge lengths, angles, and face areas.
 * Generates true 2D triangle geometries, framework node positions, seam allowances, and foundation hems.
 */
export function unfoldConnectedFaces(
  orderedFaceIds: number[],
  model: DomeModel,
  rollWidthMm: number,
  seamAllowanceMm: number,
  hemAllowanceMm: number,
  stripId: number,
  stripName: string,
  isCustom = false
): FabricStrip {
  const nodeMap = new Map<number, (typeof model.nodes)[0]>();
  for (const n of model.nodes) {
    nodeMap.set(n.id, n);
  }
  const faceGroupColorMap = new Map<string, string>();
  for (const fg of model.faceGroups) {
    faceGroupColorMap.set(fg.type, fg.color);
  }
  const faceMap = new Map<number, (typeof model.faces)[0]>();
  for (const f of model.faces) {
    faceMap.set(f.id, f);
  }
  const maxDomeZ = Math.max(...model.nodes.map(n => n.position.z));

  const effRollWidth = Math.max(500, Math.min(3500, rollWidthMm || 1500));
  const effSeam = Math.max(10, Math.min(60, seamAllowanceMm || 25));
  const effHem = Math.max(30, Math.min(400, hemAllowanceMm || 150));

  if (orderedFaceIds.length === 0) {
    return {
      id: stripId,
      name: stripName,
      offsetY: 0,
      domeArcLengthMm: 1000,
      cutLengthMm: 1000 + 2 * effHem,
      widthMm: effRollWidth,
      netWidthMm: effRollWidth - 2 * effSeam,
      seamAllowanceMm: effSeam,
      hemAllowanceMm: effHem,
      cutAreaM2: 0,
      netAreaM2: 0,
      sewingLengthMm: 0,
      contour2D: [[0, 0], [1000, 0], [1000, effRollWidth], [0, effRollWidth]],
      seamLines2D: [],
      triangles: [],
      nodes: [],
      faceIds: [],
      isCustom,
      minRecommendedRollWidthMm: effRollWidth
    };
  }

  const face2DPoints = new Map<number, { a: { x: number; y: number }; b: { x: number; y: number }; c: { x: number; y: number } }>();

  // Place first face F0
  const f0 = faceMap.get(orderedFaceIds[0])!;
  let sharedWithNext: [number, number] | null = null;
  if (orderedFaceIds.length > 1) {
    const f1 = faceMap.get(orderedFaceIds[1])!;
    const f1Nodes = new Set([f1.a, f1.b, f1.c]);
    const common = [f0.a, f0.b, f0.c].filter(id => f1Nodes.has(id));
    if (common.length >= 2) {
      sharedWithNext = [common[0], common[1]];
    }
  }

  let v0 = f0.a, v1 = f0.b, v2 = f0.c;
  if (sharedWithNext) {
    v1 = sharedWithNext[0];
    v2 = sharedWithNext[1];
    v0 = [f0.a, f0.b, f0.c].find(id => id !== v1 && id !== v2) ?? f0.a;
  } else {
    const sortedByZ = [f0.a, f0.b, f0.c].sort((i, j) => nodeMap.get(i)!.position.z - nodeMap.get(j)!.position.z);
    v0 = sortedByZ[0];
    v1 = sortedByZ[1];
    v2 = sortedByZ[2];
  }

  const p0Pos = nodeMap.get(v0)!.position;
  const p1Pos = nodeMap.get(v1)!.position;
  const p2Pos = nodeMap.get(v2)!.position;

  const L01 = dist3D(p0Pos, p1Pos);
  const L02 = dist3D(p0Pos, p2Pos);
  const L12 = dist3D(p1Pos, p2Pos);

  const d_v2 = (L02 * L02 - L12 * L12 + L01 * L01) / (2 * Math.max(1, L01));
  const h_v2 = Math.sqrt(Math.max(0, L02 * L02 - d_v2 * d_v2));

  const pt0 = { x: 0, y: 0 };
  const pt1 = { x: L01, y: 0 };
  const pt2 = { x: d_v2, y: h_v2 };

  const getPtForNode = (nid: number) => (nid === v0 ? pt0 : nid === v1 ? pt1 : pt2);

  face2DPoints.set(f0.id, {
    a: getPtForNode(f0.a),
    b: getPtForNode(f0.b),
    c: getPtForNode(f0.c)
  });

  // Unroll subsequent faces F1, F2, ... hinged along shared strut edges
  for (let i = 1; i < orderedFaceIds.length; i++) {
    const fPrev = faceMap.get(orderedFaceIds[i - 1])!;
    const fCurr = faceMap.get(orderedFaceIds[i])!;
    const fPrevPts = face2DPoints.get(fPrev.id)!;

    const prevNodes = new Set([fPrev.a, fPrev.b, fPrev.c]);
    const commonNodes = [fCurr.a, fCurr.b, fCurr.c].filter(id => prevNodes.has(id));

    if (commonNodes.length < 2) {
      const prevCenter = {
        x: (fPrevPts.a.x + fPrevPts.b.x + fPrevPts.c.x) / 3,
        y: (fPrevPts.a.y + fPrevPts.b.y + fPrevPts.c.y) / 3
      };
      const curL = dist3D(nodeMap.get(fCurr.a)!.position, nodeMap.get(fCurr.b)!.position);
      face2DPoints.set(fCurr.id, {
        a: { x: prevCenter.x + 100, y: prevCenter.y },
        b: { x: prevCenter.x + 100 + curL, y: prevCenter.y },
        c: { x: prevCenter.x + 100 + curL / 2, y: prevCenter.y + curL }
      });
      continue;
    }

    const nA = commonNodes[0];
    const nB = commonNodes[1];
    const nC = [fCurr.a, fCurr.b, fCurr.c].find(id => id !== nA && id !== nB)!;

    const pA = nA === fPrev.a ? fPrevPts.a : nA === fPrev.b ? fPrevPts.b : fPrevPts.c;
    const pB = nB === fPrev.a ? fPrevPts.a : nB === fPrev.b ? fPrevPts.b : fPrevPts.c;

    const unsharedPrevId = [fPrev.a, fPrev.b, fPrev.c].find(id => id !== nA && id !== nB)!;
    const pPrevNode =
      unsharedPrevId === fPrev.a
        ? fPrevPts.a
        : unsharedPrevId === fPrev.b
        ? fPrevPts.b
        : fPrevPts.c;

    const pAPos = nodeMap.get(nA)!.position;
    const pBPos = nodeMap.get(nB)!.position;
    const pCPos = nodeMap.get(nC)!.position;

    const LAC = dist3D(pAPos, pCPos);
    const LBC = dist3D(pBPos, pCPos);
    const DAB = Math.hypot(pB.x - pA.x, pB.y - pA.y);

    if (DAB < 0.001) {
      face2DPoints.set(fCurr.id, {
        a: { x: pPrevNode.x, y: pPrevNode.y },
        b: { x: pPrevNode.x + 100, y: pPrevNode.y },
        c: { x: pPrevNode.x + 50, y: pPrevNode.y + 86 }
      });
      continue;
    }

    const ux = (pB.x - pA.x) / DAB;
    const uy = (pB.y - pA.y) / DAB;
    const nx = -uy;
    const ny = ux;

    const d = (LAC * LAC - LBC * LBC + DAB * DAB) / (2 * DAB);
    const h = Math.sqrt(Math.max(0, LAC * LAC - d * d));

    const cand1 = { x: pA.x + d * ux + h * nx, y: pA.y + d * uy + h * ny };
    const cand2 = { x: pA.x + d * ux - h * nx, y: pA.y + d * uy - h * ny };

    const sidePrev = (pPrevNode.x - pA.x) * nx + (pPrevNode.y - pA.y) * ny;
    const chosenCand = sidePrev >= 0 ? cand2 : cand1;

    const curPts: { a: { x: number; y: number }; b: { x: number; y: number }; c: { x: number; y: number } } = {
      a: { x: 0, y: 0 },
      b: { x: 0, y: 0 },
      c: { x: 0, y: 0 }
    };
    curPts[nA === fCurr.a ? "a" : nA === fCurr.b ? "b" : "c"] = pA;
    curPts[nB === fCurr.a ? "a" : nB === fCurr.b ? "b" : "c"] = pB;
    curPts[nC === fCurr.a ? "a" : nC === fCurr.b ? "c" : "c"] = chosenCand;

    face2DPoints.set(fCurr.id, curPts);
  }

  // Compute horizontal alignment along the length of the roll
  const allRawPts: { x: number; y: number }[] = [];
  face2DPoints.forEach(pts => {
    allRawPts.push(pts.a, pts.b, pts.c);
  });

  const firstFacePts = face2DPoints.get(orderedFaceIds[0])!;
  const lastFacePts = face2DPoints.get(orderedFaceIds[orderedFaceIds.length - 1])!;
  const c0x = (firstFacePts.a.x + firstFacePts.b.x + firstFacePts.c.x) / 3;
  const c0y = (firstFacePts.a.y + firstFacePts.b.y + firstFacePts.c.y) / 3;
  const cEndx = (lastFacePts.a.x + lastFacePts.b.x + lastFacePts.c.x) / 3;
  const cEndy = (lastFacePts.a.y + lastFacePts.b.y + lastFacePts.c.y) / 3;

  let angle = Math.atan2(cEndy - c0y, cEndx - c0x);
  let cosA = Math.cos(angle);
  let sinA = Math.sin(angle);

  // Ensure start face is to the left (X=0) and end face to the right
  const rxStart = 0;
  const rxEnd = (cEndx - c0x) * cosA + (cEndy - c0y) * sinA;
  if (rxEnd < rxStart) {
    angle += Math.PI;
    cosA = Math.cos(angle);
    sinA = Math.sin(angle);
  }

  const rotatedPts = allRawPts.map(p => {
    const dx = p.x - c0x;
    const dy = p.y - c0y;
    return {
      x: dx * cosA + dy * sinA,
      y: -dx * sinA + dy * cosA
    };
  });

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of rotatedPts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const stripLengthMm = Math.max(100, Math.round(maxX - minX));
  const stripWidthMm = Math.max(100, Math.round(maxY - minY));

  // Determine working roll width (expand contour if strip is wider than selected roll width)
  const canvasWidthMm = Math.max(effRollWidth, Math.round(stripWidthMm + 2 * effSeam));
  const minRecommendedRollWidthMm = Math.ceil((stripWidthMm + 2 * effSeam) / 100) * 100;

  const shiftX = effHem - minX;
  const shiftY = (canvasWidthMm - stripWidthMm) / 2 - minY;

  const transformPoint = (p: { x: number; y: number }) => {
    const dx = p.x - c0x;
    const dy = p.y - c0y;
    const rx = dx * cosA + dy * sinA;
    const ry = -dx * sinA + dy * cosA;
    return {
      x: Math.round((rx + shiftX) * 10) / 10,
      y: Math.round((ry + shiftY) * 10) / 10
    };
  };

  const finalNodeMap = new Map<number, FabricStripNode>();
  const stripTriangles: FabricStripTriangle[] = [];
  let totalAreaMm2 = 0;

  for (const fId of orderedFaceIds) {
    const f = faceMap.get(fId)!;
    const pts = face2DPoints.get(fId) || { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, c: { x: 50, y: 86 } };
    const nA = nodeMap.get(f.a)!;
    const nB = nodeMap.get(f.b)!;
    const nC = nodeMap.get(f.c)!;

    const pA = transformPoint(pts.a);
    const pB = transformPoint(pts.b);
    const pC = transformPoint(pts.c);

    const l1 = Math.round(dist3D(nA.position, nB.position));
    const l2 = Math.round(dist3D(nB.position, nC.position));
    const l3 = Math.round(dist3D(nC.position, nA.position));

    const center2D = {
      x: Math.round(((pA.x + pB.x + pC.x) / 3) * 10) / 10,
      y: Math.round(((pA.y + pB.y + pC.y) / 3) * 10) / 10
    };

    const lblA = nA.label || `B${nA.id + 1}`;
    const lblB = nB.label || `B${nB.id + 1}`;
    const lblC = nC.label || `B${nC.id + 1}`;

    const areaM2 = Math.round((f.area / 1_000_000) * 1000) / 1000;
    totalAreaMm2 += f.area;

    stripTriangles.push({
      faceId: f.id,
      faceType: f.type,
      color: faceGroupColorMap.get(f.type) || "#4A90E2",
      nodeIds: [f.a, f.b, f.c],
      nodeLabels: [lblA, lblB, lblC],
      points2D: [pA, pB, pC],
      center2D,
      lengths: [l1, l2, l3],
      areaM2,
      isWindow: model.windowFaceIds?.includes(f.id),
      isDoorway: model.doorFaceIds?.includes(f.id)
    });

    const addFinalNode = (node: typeof nA, pt: { x: number; y: number }, lbl: string) => {
      const isApex =
        node.position.z >= maxDomeZ - 20 &&
        Math.hypot(node.position.x, node.position.y) < model.parameters.diameter * 0.18;
      const isBoundary = Boolean(node.boundary) || node.position.z <= 15;
      if (!finalNodeMap.has(node.id)) {
        finalNodeMap.set(node.id, {
          nodeId: node.id,
          label: lbl,
          x2D: pt.x,
          y2D: pt.y,
          isBoundary,
          isApex,
          originalPos: node.position,
          connectedFaceIds: [f.id]
        });
      } else {
        const exist = finalNodeMap.get(node.id)!;
        if (!exist.connectedFaceIds.includes(f.id)) {
          exist.connectedFaceIds.push(f.id);
        }
      }
    };

    addFinalNode(nA, pA, lblA);
    addFinalNode(nB, pB, lblB);
    addFinalNode(nC, pC, lblC);
  }

  const cutLengthMm = Math.round(stripLengthMm + 2 * effHem);
  const domeArcLengthMm = stripLengthMm;
  const cutAreaM2 = Math.round(((cutLengthMm * canvasWidthMm) / 1_000_000) * 1000) / 1000;
  const netAreaM2 = Math.round((totalAreaMm2 / 1_000_000) * 1000) / 1000;
  const sewingLengthMm = Math.round(2 * stripLengthMm);

  const contour2D: [number, number][] = [
    [0, 0],
    [cutLengthMm, 0],
    [cutLengthMm, canvasWidthMm],
    [0, canvasWidthMm]
  ];

  const seamLines2D: [number, number][][] = [
    [[0, effSeam], [cutLengthMm, effSeam]],
    [[0, canvasWidthMm - effSeam], [cutLengthMm, canvasWidthMm - effSeam]]
  ];

  const stripNodes = Array.from(finalNodeMap.values()).sort((a, b) => a.x2D - b.x2D);

  return {
    id: stripId,
    name: stripName,
    offsetY: 0,
    domeArcLengthMm,
    cutLengthMm,
    widthMm: canvasWidthMm,
    netWidthMm: Math.min(canvasWidthMm - 2 * effSeam, stripWidthMm),
    seamAllowanceMm: effSeam,
    hemAllowanceMm: effHem,
    cutAreaM2,
    netAreaM2,
    sewingLengthMm,
    contour2D,
    seamLines2D,
    triangles: stripTriangles,
    nodes: stripNodes,
    faceIds: orderedFaceIds,
    isCustom,
    minRecommendedRollWidthMm
  };
}

/**
 * Automatically decomposes the geodesic dome triangles into full-length continuous meridian strips
 * from the foundation base all the way to the apex, ensuring every triangle shares a physical strut edge.
 */
export function generateDomeTriangleStrips(model: DomeModel): number[][] {
  const nodeMap = new Map<number, (typeof model.nodes)[0]>();
  for (const n of model.nodes) {
    nodeMap.set(n.id, n);
  }
  const faceMap = new Map<number, (typeof model.faces)[0]>();
  for (const f of model.faces) {
    faceMap.set(f.id, f);
  }

  // Filter out plinth faces so dome meridian strips are strictly for the dome itself
  const domeFaces = model.faces.filter(f => !f.isPlinthFace);
  if (domeFaces.length === 0) return [];

  // Build full dual graph of adjacent faces among dome faces
  const adj = new Map<number, number[]>();
  domeFaces.forEach(f => adj.set(f.id, []));
  for (let i = 0; i < domeFaces.length; i++) {
    const f1 = domeFaces[i];
    const s1 = new Set([f1.a, f1.b, f1.c]);
    for (let j = i + 1; j < domeFaces.length; j++) {
      const f2 = domeFaces[j];
      const comm = [f2.a, f2.b, f2.c].filter(n => s1.has(n));
      if (comm.length >= 2) {
        adj.get(f1.id)!.push(f2.id);
        adj.get(f2.id)!.push(f1.id);
      }
    }
  }

  // Lowest Z among dome faces (the base rim of the dome)
  const minDomeZ = Math.min(
    ...domeFaces.map(f => {
      const nA = nodeMap.get(f.a);
      const nB = nodeMap.get(f.b);
      const nC = nodeMap.get(f.c);
      return ((nA?.position.z ?? 0) + (nB?.position.z ?? 0) + (nC?.position.z ?? 0)) / 3;
    })
  );

  // Base boundary faces (lowest Z of dome)
  const baseFaces = domeFaces
    .filter(f => {
      const nA = nodeMap.get(f.a)!;
      const nB = nodeMap.get(f.b)!;
      const nC = nodeMap.get(f.c)!;
      const fZ = (nA.position.z + nB.position.z + nC.position.z) / 3;
      return nA.boundary || nB.boundary || nC.boundary || fZ <= minDomeZ + 60;
    })
    .map(f => f.id);

  // Apex faces (highest Z / apex node)
  const maxZ = Math.max(...model.nodes.map(n => n.position.z));
  const apexNodes = new Set(model.nodes.filter(n => n.position.z >= maxZ - 20).map(n => n.id));
  const apexFaces = new Set(
    model.faces.filter(f => apexNodes.has(f.a) || apexNodes.has(f.b) || apexNodes.has(f.c)).map(f => f.id)
  );

  const getFaceAngle = (fId: number) => {
    const f = faceMap.get(fId)!;
    const cx = (nodeMap.get(f.a)!.position.x + nodeMap.get(f.b)!.position.x + nodeMap.get(f.c)!.position.x) / 3;
    const cy = (nodeMap.get(f.a)!.position.y + nodeMap.get(f.b)!.position.y + nodeMap.get(f.c)!.position.y) / 3;
    let ang = Math.atan2(cy, cx);
    if (ang < 0) ang += 2 * Math.PI;
    return ang;
  };

  const getFaceZ = (fId: number) => {
    const f = faceMap.get(fId)!;
    return (nodeMap.get(f.a)!.position.z + nodeMap.get(f.b)!.position.z + nodeMap.get(f.c)!.position.z) / 3;
  };

  const sortedBase = [...baseFaces].sort((a, b) => getFaceAngle(a) - getFaceAngle(b));
  const strips: number[][] = [];
  const used = new Set<number>();

  for (const bId of sortedBase) {
    if (used.has(bId)) continue;
    const path: number[] = [bId];
    let curr = bId;
    used.add(bId);

    while (!apexFaces.has(curr)) {
      const neighbors = adj.get(curr) || [];
      const higher = neighbors.filter(nId => !path.includes(nId) && getFaceZ(nId) >= getFaceZ(curr) - 50);
      if (higher.length === 0) break;

      higher.sort((a, b) => {
        const aUn = used.has(a) ? 1 : 0;
        const bUn = used.has(b) ? 1 : 0;
        if (aUn !== bUn) return aUn - bUn;
        return getFaceZ(b) - getFaceZ(a);
      });

      const next = higher[0];
      path.push(next);
      used.add(next);
      curr = next;
    }

    if (path.length >= 3) {
      strips.push(path);
    }
  }

  // Pick up any remaining faces by attaching to adjacent strips
  for (const f of domeFaces) {
    if (!used.has(f.id)) {
      const neighbors = adj.get(f.id) || [];
      for (const s of strips) {
        const idx = s.findIndex(id => neighbors.includes(id));
        if (idx !== -1) {
          s.splice(idx + 1, 0, f.id);
          used.add(f.id);
          break;
        }
      }
    }
  }

  return strips;
}

/**
 * Calculates continuous fabric roll nesting layout (Тент / Мембрана з рулону).
 * The fabric roll has a selectable width from 500 mm to 3500 mm.
 * Strips run as continuous unrolled chains of connected geodesic triangles from foundation to apex,
 * with exact 2D planar unrolling, strut fold lines, framework node markings, seam and hem allowances.
 */
export function calculateFabricRollNesting(
  model: DomeModel,
  rollWidthMm = 1500,
  seamAllowanceMm = 25,
  hemAllowanceMm = 150,
  grammageGsm = 650,
  customStripFaceIds?: number[]
): FabricRollNestingLayout {
  const effectiveRollWidth = Math.max(500, Math.min(3500, rollWidthMm || 1500));
  const effectiveSeamAllowance = Math.max(10, Math.min(60, seamAllowanceMm || 25));
  const effectiveHemAllowance = Math.max(30, Math.min(400, hemAllowanceMm || 150));
  const effectiveGsm = Math.max(200, Math.min(1500, grammageGsm || 650));

  const strips: FabricStrip[] = [];
  let nextStripId = 1;

  // 1. Check for User-Selected Strip, or Strip from Model fabricStripFaceIds, or Strip from Windows (приклад з конфігурації користувача)
  const userCandidateFaceIds =
    customStripFaceIds && customStripFaceIds.length > 0
      ? customStripFaceIds
      : model.fabricStripFaceIds && model.fabricStripFaceIds.length > 0
      ? model.fabricStripFaceIds
      : model.windowFaceIds && model.windowFaceIds.length > 0
      ? model.windowFaceIds
      : null;

  if (userCandidateFaceIds && userCandidateFaceIds.length > 0) {
    const orderedUserFaces = orderConnectedFaces(userCandidateFaceIds, model);
    const isFromCustom =
      Boolean((customStripFaceIds && customStripFaceIds.length > 0) || (model.fabricStripFaceIds && model.fabricStripFaceIds.length > 0));
    const stripLabel = isFromCustom
      ? `Полоса #${nextStripId}: Вибрана смуга користувача (${orderedUserFaces.length} трикутників)`
      : `Полоса #${nextStripId}: Смуга з вікон купола (${orderedUserFaces.length} трикутників)`;

    const userStrip = unfoldConnectedFaces(
      orderedUserFaces,
      model,
      effectiveRollWidth,
      effectiveSeamAllowance,
      effectiveHemAllowance,
      nextStripId++,
      stripLabel,
      true
    );
    strips.push(userStrip);
  }

  // 2. Generate Full Auto-Segmented Meridian Triangle Strips covering the Dome
  const autoStrips = generateDomeTriangleStrips(model);
  autoStrips.forEach((stripFaces, idx) => {
    const orderedStripFaces = orderConnectedFaces(stripFaces, model);
    const label = `Полоса #${nextStripId}: Меридіанний сектор ${idx + 1} (${orderedStripFaces.length} трикутників)`;
    const s = unfoldConnectedFaces(
      orderedStripFaces,
      model,
      effectiveRollWidth,
      effectiveSeamAllowance,
      effectiveHemAllowance,
      nextStripId++,
      label,
      false
    );
    strips.push(s);
  });

  // 3. Generate Dedicated Plinth Fabric Band if Plinth is Active (Цоколь утворює загальну лєнту проходу для тенту окремо від купола)
  const isPlinthActive = Boolean(model.parameters.plinth?.enabled && (model.statistics?.plinthHeightMm ?? 0) > 0);
  const plinthH = isPlinthActive ? (model.statistics.plinthHeightMm || model.parameters.plinth?.height || 800) : 0;
  const plinthFaces = model.faces.filter(f => f.isPlinthFace);

  let plinthStrip: FabricStrip | undefined;
  if (isPlinthActive && plinthH > 0 && plinthFaces.length > 0) {
    const plinthSills = model.edges.filter(e => e.isPlinthBeam && e.plinthRole === "sill");
    const bayCount = plinthSills.length > 0 ? plinthSills.length : Math.floor(plinthFaces.length / 2);
    const avgBayW = plinthSills.length > 0
      ? plinthSills.reduce((s, e) => s + e.length, 0) / plinthSills.length
      : (model.statistics.baseCircumferenceM * 1000) / bayCount;
    const totalPerimeter = Math.round(avgBayW * bayCount);

    const cutLengthMm = totalPerimeter + 2 * effectiveSeamAllowance;
    const cutWidthMm = plinthH + effectiveSeamAllowance + effectiveHemAllowance;

    const contour2D: [number, number][] = [
      [0, 0],
      [cutLengthMm, 0],
      [cutLengthMm, cutWidthMm],
      [0, cutWidthMm],
      [0, 0]
    ];

    const seamLines2D: [number, number][][] = [];
    // Horizontal hem line at bottom
    seamLines2D.push([[0, effectiveHemAllowance], [cutLengthMm, effectiveHemAllowance]]);
    // Horizontal sewing line at top (connects to dome tent)
    seamLines2D.push([[0, effectiveHemAllowance + plinthH], [cutLengthMm, effectiveHemAllowance + plinthH]]);

    let curX = effectiveSeamAllowance;
    const plinthTriangles: FabricStripTriangle[] = [];

    for (let i = 0; i < bayCount; i++) {
      const bayW = plinthSills[i] ? plinthSills[i].length : avgBayW;
      const nextX = curX + bayW;
      // Vertical seam/fold line between rectangular bays
      seamLines2D.push([[nextX, 0], [nextX, cutWidthMm]]);

      const fLower = plinthFaces.find(f => f.plinthBayIndex === i && f.id % 2 === 1) || plinthFaces[i * 2 + 1] || plinthFaces[0];
      const fUpper = plinthFaces.find(f => f.plinthBayIndex === i && f.id % 2 === 0) || plinthFaces[i * 2] || plinthFaces[0];

      if (fLower) {
        plinthTriangles.push({
          faceId: fLower.id,
          faceType: "Цоколь-Н",
          color: "#D97706",
          nodeIds: [fLower.a, fLower.b, fLower.c],
          nodeLabels: [`G${i + 1}`, `G${((i + 1) % bayCount) + 1}`, `V${((i + 1) % bayCount) + 1}`],
          points2D: [
            { x: curX, y: effectiveHemAllowance },
            { x: nextX, y: effectiveHemAllowance },
            { x: nextX, y: effectiveHemAllowance + plinthH }
          ],
          center2D: { x: curX + bayW * 0.66, y: effectiveHemAllowance + plinthH * 0.33 },
          lengths: [bayW, plinthH, Math.round(Math.hypot(bayW, plinthH))],
          areaM2: Math.round(((0.5 * bayW * plinthH) / 1_000_000) * 1000) / 1000
        });
      }

      if (fUpper) {
        plinthTriangles.push({
          faceId: fUpper.id,
          faceType: "Цоколь-В",
          color: "#D97706",
          nodeIds: [fUpper.a, fUpper.b, fUpper.c],
          nodeLabels: [`G${i + 1}`, `V${((i + 1) % bayCount) + 1}`, `V${i + 1}`],
          points2D: [
            { x: curX, y: effectiveHemAllowance },
            { x: nextX, y: effectiveHemAllowance + plinthH },
            { x: curX, y: effectiveHemAllowance + plinthH }
          ],
          center2D: { x: curX + bayW * 0.33, y: effectiveHemAllowance + plinthH * 0.66 },
          lengths: [plinthH, bayW, Math.round(Math.hypot(bayW, plinthH))],
          areaM2: Math.round(((0.5 * bayW * plinthH) / 1_000_000) * 1000) / 1000
        });
      }

      curX = nextX;
    }

    const cutAreaM2 = Math.round(((cutLengthMm * cutWidthMm) / 1_000_000) * 10) / 10;
    const netAreaM2 = Math.round(((totalPerimeter * plinthH) / 1_000_000) * 10) / 10;

    plinthStrip = {
      id: nextStripId++,
      name: `Смуга цоколя: стіновий пояс прямокутниками (${bayCount} секцій ${Math.round(avgBayW)}×${plinthH} мм)`,
      offsetY: 0,
      domeArcLengthMm: totalPerimeter,
      cutLengthMm,
      widthMm: effectiveRollWidth,
      netWidthMm: plinthH,
      seamAllowanceMm: effectiveSeamAllowance,
      hemAllowanceMm: effectiveHemAllowance,
      cutAreaM2,
      netAreaM2,
      sewingLengthMm: totalPerimeter,
      contour2D,
      seamLines2D,
      triangles: plinthTriangles,
      faceIds: plinthFaces.map(f => f.id),
      isPlinthStrip: true,
      minRecommendedRollWidthMm: Math.round(cutWidthMm)
    };

    strips.push(plinthStrip);
  }

  // Calculate totals across strips
  const totalLinearMeters = Math.round((strips.reduce((s, p) => s + p.cutLengthMm, 0) / 1000) * 10) / 10;
  const totalFabricAreaM2 = Math.round(totalLinearMeters * (effectiveRollWidth / 1000) * 10) / 10;
  const domeCoverAreaM2 = Math.round(strips.reduce((s, p) => s + p.netAreaM2, 0) * 10) / 10;

  let totalSewingMm = 0;
  for (let i = 0; i < strips.length - 1; i++) {
    totalSewingMm += Math.min(strips[i].domeArcLengthMm, strips[i + 1].domeArcLengthMm);
  }
  const totalSewingSeamMeters = Math.round((totalSewingMm / 1000) * 10) / 10;
  const totalFabricWeightKg = Math.round((totalFabricAreaM2 * (effectiveGsm / 1000)) * 10) / 10;

  const cutLengths = strips.map(s => s.cutLengthMm);
  const maxStripLengthMm = Math.max(...cutLengths, 1000);
  const minStripLengthMm = Math.min(...cutLengths, 1000);

  return {
    materialType: "fabric_roll",
    materialName: `Тент ПВХ / Мембрана (Рулон ${effectiveRollWidth} мм, шов ${effectiveSeamAllowance} мм)`,
    rollWidthMm: effectiveRollWidth,
    seamAllowanceMm: effectiveSeamAllowance,
    hemAllowanceMm: effectiveHemAllowance,
    fabricGrammageGsm: effectiveGsm,
    totalStrips: strips.length,
    strips,
    plinthStrip,
    totalLinearMeters,
    totalFabricAreaM2,
    domeCoverAreaM2,
    totalSewingSeamMeters,
    totalFabricWeightKg,
    maxStripLengthMm,
    minStripLengthMm,
    centralStripArcLengthMm: strips[0] ? strips[0].domeArcLengthMm : maxStripLengthMm,
    customStripFaceIds: userCandidateFaceIds ? [...userCandidateFaceIds] : undefined
  };
}
