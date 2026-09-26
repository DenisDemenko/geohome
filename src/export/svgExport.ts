import { DomeModel, ConnectorGeometry, SheathingSheetLayout } from "../core/types";
import { generateConnectorCutPattern } from "../core/connectors";
import { calculateBeamMiterAngles } from "../core/beams";

/**
 * Downloads a text/svg file to the user's browser.
 */
export function downloadFile(filename: string, content: string, mimeType = "image/svg+xml;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates 2D laser-cut SVG for a connector (star plate with tabs, bolt holes, bend lines).
 */
export function generateConnectorSVG(
  connector: ConnectorGeometry,
  model: DomeModel,
  options?: { countInDome?: number; typeName?: string }
): string {
  const cut = generateConnectorCutPattern(connector, model.connectorParams);
  const padding = 55;
  const size = Math.ceil((cut.outerRadius + padding) * 2);
  const half = size / 2;
  const count = options?.countInDome ?? 1;
  const titleName = options?.typeName || `КОНЕКТОР ТИПУ THUNDER DOMES #${connector.nodeId}`;

  const boltHolesSvg = cut.boltHoles
    .map(
      h =>
        `<circle cx="${(half + h.x).toFixed(2)}" cy="${(half + h.y).toFixed(2)}" r="${(h.diameter / 2).toFixed(2)}" fill="#FFFFFF" stroke="#DE7C5A" stroke-width="${Math.max(0.2, Math.min(1.6, (h.diameter || 2) * 0.15)).toFixed(2)}" />`
    )
    .join("\n    ");

  const bendLinesSvg = cut.bendLines
    .map(
      l =>
        `<line x1="${(half + l.x1).toFixed(2)}" y1="${(half + l.y1).toFixed(2)}" x2="${(half + l.x2).toFixed(2)}" y2="${(half + l.y2).toFixed(2)}" stroke="#5B82A6" stroke-width="${Math.max(0.2, Math.min(1.8, cut.outerRadius * 0.015)).toFixed(2)}" stroke-dasharray="5,3" />`
    )
    .join("\n    ");

  const labelFontSize = Math.max(3.5, Math.min(11, cut.outerRadius * 0.08 + 2)).toFixed(1);
  const labelsSvg = cut.rayLabels
    .map(
      lbl =>
        `<text x="${(half + lbl.x).toFixed(2)}" y="${(half + lbl.y).toFixed(2)}" font-family="sans-serif" font-size="${labelFontSize}" font-weight="700" fill="#1A2E3B" text-anchor="middle" dominant-baseline="middle">${lbl.text}</text>`
    )
    .join("\n    ");

  // Center cutout: Lightning bolt or assembly hole
  let centerCutoutSvg = "";
  if (cut.centerCutoutPath) {
    centerCutoutSvg = `<path d="${cut.centerCutoutPath}" fill="#FFFFFF" stroke="#1A2E3B" stroke-width="1.5" />`;
  } else if (cut.centerHole) {
    centerCutoutSvg = `<circle cx="0" cy="0" r="${(cut.centerHole.diameter / 2).toFixed(2)}" fill="#FFFFFF" stroke="#1A2E3B" stroke-width="1.5" />`;
  }

  // Ray centerlines (dashed lines from center through each ray)
  const centerlinesSvg = cut.centerAxes
    .map(
      ax =>
        `<line x1="${(half + ax.x1).toFixed(2)}" y1="${(half + ax.y1).toFixed(2)}" x2="${(half + ax.x2).toFixed(2)}" y2="${(half + ax.y2).toFixed(2)}" stroke="#2B6CB0" stroke-width="1.3" stroke-dasharray="6,3.5" opacity="0.9" />`
    )
    .join("\n    ");

  // Angular dimension arcs and degree labels between adjacent rays
  const angleDimensionsSvg = cut.interRayAngles
    .map(ang => {
      return `
    <!-- Dimension arc between ray #${ang.fromRayIndex} and #${ang.toRayIndex} -->
    <path d="${ang.arcPath}" transform="translate(${half}, ${half})" fill="none" stroke="#E53E3E" stroke-width="1.4" stroke-dasharray="3,2" />
    <g transform="translate(${(half + ang.textX).toFixed(2)}, ${(half + ang.textY).toFixed(2)})">
      <rect x="-19" y="-9" width="38" height="18" rx="4" fill="#FFFFFF" stroke="#CBD5E0" stroke-width="1" filter="drop-shadow(0px 1px 2px rgba(0,0,0,0.08))" />
      <text x="0" y="0" font-family="monospace, sans-serif" font-size="10" font-weight="700" fill="#C53030" text-anchor="middle" dominant-baseline="central">${ang.deltaAngleDeg}°</text>
    </g>`;
    })
    .join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}mm" height="${size}mm">
  <style>
    .cut-line { fill: #FAF7F2; stroke: #1A2E3B; stroke-width: ${Math.max(0.3, Math.min(2.0, cut.outerRadius * 0.018)).toFixed(2)}; stroke-linejoin: round; stroke-linecap: round; }
    .center-mark { stroke: #E2E8F0; stroke-width: 0.8; stroke-dasharray: 6,4; }
  </style>
  <rect width="100%" height="100%" fill="#FFFFFF" />

  <!-- Background orthogonal reference lines -->
  <line x1="${half}" y1="20" x2="${half}" y2="${size - 20}" class="center-mark" />
  <line x1="20" y1="${half}" x2="${size - 20}" y2="${half}" class="center-mark" />

  <!-- Outer Star Contour (CNC Closed Cut Path) -->
  <g id="cnc-cut-layer" transform="translate(${half}, ${half})">
    <path id="outer-bracket-contour" d="${cut.contourPath}" class="cut-line" />
    ${centerCutoutSvg}
  </g>

  <!-- Ray Centerlines (Dashed Engineering Axes from Center) -->
  <g id="ray-centerlines">
    ${centerlinesSvg}
  </g>

  <!-- Angular Dimensions and Degree Values Between Rays -->
  <g id="inter-ray-angles">
    ${angleDimensionsSvg}
  </g>

  <!-- Bend Lines (Press Brake Lines) -->
  ${bendLinesSvg}

  <!-- Bolt Holes (Laser Cut Holes) -->
  ${boltHolesSvg}

  <!-- Annotations & Labels -->
  ${labelsSvg}

  <!-- Production Quantity Stamp (for CNC operator / metal shop) -->
  <g id="production-quantity-stamp" transform="translate(${size - 195}, 20)">
    <rect width="175" height="52" rx="10" fill="#F0FFF4" stroke="#2E7D32" stroke-width="2.2" filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.06))" />
    <text x="14" y="21" font-family="sans-serif" font-size="10" font-weight="bold" fill="#1B4D2E" letter-spacing="0.5">ТИРАЖ НА КУПОЛ:</text>
    <text x="14" y="42" font-family="sans-serif" font-size="19" font-weight="900" fill="#2E7D32">${count} ШТУК</text>
  </g>

  <!-- Technical Header -->
  <text x="25" y="32" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1A2E3B">${titleName.toUpperCase()} — ${count} ШТ.</text>
  <text x="25" y="52" font-family="sans-serif" font-size="10" fill="#5A6778">Кількість: ${count} шт. | Сталь: ${model.connectorParams.thickness} мм | Болти: M${model.connectorParams.boltDiameter} | Сердцевина: ${model.connectorParams.hubDiameter} мм | Луч: ${model.connectorParams.tabLength} мм | Ширина: ${model.connectorParams.tabWidth} мм</text>
  <text x="25" y="${size - 20}" font-family="sans-serif" font-size="10" fill="#8C9BAE">Масштаб 1:1 · Замкнутий контур для лазерного ЧПК розкрою (КуполГео CAD)</text>
</svg>`;
}

/**
 * Generates 2D SVG nesting layout on plywood sheet (e.g. 2800x1250 mm) for CNC milling.
 * Displays part geometries, CNC toolpath, router bit kerf width (4, 6, 8, 10, 12 mm),
 * holding tabs, clamping margin, and machine origin (X0, Y0).
 */
export function generateSheathingNestingSVG(
  layout: SheathingSheetLayout,
  sheetIdx = 0,
  options?: {
    showToolpath?: boolean;
    showKerf?: boolean;
    showTabs?: boolean;
  }
): string {
  const w = layout.sheetWidth;
  const h = layout.sheetHeight;
  const toolDiam = layout.toolDiameter || 6;
  const margin = layout.margin || 15;
  const showToolpath = options?.showToolpath !== false;
  const showKerf = options?.showKerf !== false;
  const showTabs = options?.showTabs !== false;

  const sheetPanels = layout.placedPanels.filter(p => p.sheetIndex === sheetIdx);

  // Compute sheet cut length in meters
  const sheetCutLengthM =
    Math.round(
      sheetPanels.reduce((sum, p) => sum + (p.perimeterMm || 3000) / 1000, 0) * 10
    ) / 10;

  const panelsSvg = sheetPanels
    .map(p => {
      const pointsStr = p.polygon.map(([x, y]) => `${x},${y}`).join(" ");
      const cX = p.polygon.reduce((sum, pt) => sum + pt[0], 0) / 3;
      const cY = p.polygon.reduce((sum, pt) => sum + pt[1], 0) / 3;

      // Holding tabs SVG
      let tabsSvg = "";
      if (showTabs && p.holdingTabs) {
        tabsSvg = p.holdingTabs
          .map(
            ([tx, ty]) =>
              `<g transform="translate(${tx}, ${ty})">
                 <circle cx="0" cy="0" r="${Math.max(4, toolDiam / 1.5)}" fill="#DE7C5A" stroke="#FFFFFF" stroke-width="1.5" />
                 <rect x="-4" y="-2" width="8" height="4" rx="1" fill="#FFFFFF" opacity="0.8" />
               </g>`
          )
          .join("");
      }

      // Toolpath lead-in plunge marker
      const plungePt = p.polygon[0];

      return `
    <g class="cnc-part" id="part-${p.panelId}">
      <!-- CNC Kerf Cutting Zone (Tool Diameter Width) -->
      ${
        showKerf
          ? `<polygon points="${pointsStr}" fill="none" stroke="#E2847A" stroke-width="${toolDiam}" stroke-linejoin="round" stroke-linecap="round" opacity="0.35" />`
          : ""
      }

      <!-- Finished Part Geometry -->
      <polygon points="${pointsStr}" fill="#F4EFEB" stroke="#2D3748" stroke-width="2" stroke-linejoin="round" />

      <!-- Centerline Toolpath -->
      ${
        showToolpath
          ? `<polygon points="${pointsStr}" fill="none" stroke="#2B6CB0" stroke-width="1.2" stroke-dasharray="6,4" opacity="0.8" />`
          : ""
      }

      <!-- Plunge / Lead-in Point -->
      <circle cx="${plungePt[0]}" cy="${plungePt[1]}" r="3.5" fill="#38A169" stroke="#FFFFFF" stroke-width="1" />

      <!-- Holding Tabs -->
      ${tabsSvg}

      <!-- Part Label & Type Tag -->
      <circle cx="${cX.toFixed(1)}" cy="${(cY - 12).toFixed(1)}" r="14" fill="#FFFFFF" stroke="#2D3748" stroke-width="1.5" />
      <text x="${cX.toFixed(1)}" y="${(cY - 7).toFixed(1)}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1A2E3B" text-anchor="middle">${p.panelType}</text>
      <text x="${cX.toFixed(1)}" y="${(cY + 12).toFixed(1)}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#718096" text-anchor="middle">#${p.panelId}</text>
    </g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w + 140} ${h + 160}" width="100%" height="100%">
  <rect width="100%" height="100%" fill="#FBF9F5" />
  
  <!-- CNC Header Information -->
  <g transform="translate(60, 42)">
    <text x="0" y="0" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1A2E3B">
      ЧПУ КАРТА РОЗКРОЮ ФАНЕРИ — ЛИСТ ${sheetIdx + 1} З ${layout.totalSheetsRequired} (ФОРМАТ ${w} × ${h} мм)
    </text>
    <text x="0" y="22" font-family="sans-serif" font-size="12" fill="#5A6778">
      Фреза: Ø${toolDiam} мм · Відступ краю: ${margin} мм · Панелей на листі: ${sheetPanels.length} шт · Довжина різу: ${sheetCutLengthM} пог. м · Відходи: ~${layout.wastePercentage}%
    </text>
  </g>

  <!-- Sheet Work Area -->
  <g transform="translate(60, 90)">
    <!-- Sheet Outer Raw Edge -->
    <rect x="0" y="0" width="${w}" height="${h}" fill="#FFFFFF" stroke="#718096" stroke-width="3" rx="4" />

    <!-- Clamping / Vacuum Safe Margin Border -->
    <rect x="${margin}" y="${margin}" width="${w - 2 * margin}" height="${h - 2 * margin}" 
          fill="none" stroke="#ED8936" stroke-width="1.5" stroke-dasharray="6,4" opacity="0.7" />
    <text x="${margin + 8}" y="${margin + 16}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#C05621">
      Зона затискачів / вакууму (відступ ${margin} мм)
    </text>

    <!-- Grid / Quarter Guides -->
    <line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="8,8" />
    <line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="8,8" />

    <!-- Triangular Panels Group -->
    ${panelsSvg}

    <!-- CNC Machine Origin Marker (X0, Y0) at Bottom-Left -->
    <g transform="translate(0, ${h})">
      <circle cx="0" cy="0" r="10" fill="#E53E3E" opacity="0.2" />
      <circle cx="0" cy="0" r="5" fill="#E53E3E" />
      <!-- X-axis arrow -->
      <line x1="0" y1="0" x2="45" y2="0" stroke="#E53E3E" stroke-width="2.5" />
      <polygon points="45,-4 52,0 45,4" fill="#E53E3E" />
      <text x="56" y="4" font-family="sans-serif" font-size="12" font-weight="bold" fill="#E53E3E">+X</text>
      <!-- Y-axis arrow -->
      <line x1="0" y1="0" x2="0" y2="-45" stroke="#38A169" stroke-width="2.5" />
      <polygon points="-4,-45 0,-52 4,-45" fill="#38A169" />
      <text x="-4" y="-56" font-family="sans-serif" font-size="12" font-weight="bold" fill="#38A169">+Y</text>
      <text x="12" y="-12" font-family="sans-serif" font-size="11" font-weight="bold" fill="#1A2E3B">НУЛЬ ДЕТАЛІ (X0, Y0)</text>
    </g>

    <!-- Dimension Annotations Outside Sheet -->
    <!-- Width Dimension Top -->
    <line x1="0" y1="-14" x2="${w}" y2="-14" stroke="#718096" stroke-width="1.5" />
    <line x1="0" y1="-20" x2="0" y2="-8" stroke="#718096" stroke-width="1.5" />
    <line x1="${w}" y1="-20" x2="${w}" y2="-8" stroke="#718096" stroke-width="1.5" />
    <text x="${w / 2}" y="-20" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2D3748" text-anchor="middle">
      ШИРИНА ЛИСТА X = ${w} мм
    </text>

    <!-- Height Dimension Right -->
    <line x1="${w + 18}" y1="0" x2="${w + 18}" y2="${h}" stroke="#718096" stroke-width="1.5" />
    <line x1="${w + 12}" y1="0" x2="${w + 24}" y2="0" stroke="#718096" stroke-width="1.5" />
    <line x1="${w + 12}" y1="${h}" x2="${w + 24}" y2="${h}" stroke="#718096" stroke-width="1.5" />
    <text x="${w + 34}" y="${h / 2}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2D3748" transform="rotate(90, ${w + 34}, ${h / 2})" text-anchor="middle">
      ДОВЖИНА ЛИСТА Y = ${h} мм
    </text>
  </g>
</svg>`;
}

/**
 * Generates an AutoCAD DXF R12 string for CNC nesting on a sheet.
 * Compatible with ArtCAM, Vectric Aspire, SheetCAM, Fusion 360, and Mach3.
 */
export function generateSheathingCNC_DXF(layout: SheathingSheetLayout, sheetIdx = 0): string {
  const w = layout.sheetWidth;
  const h = layout.sheetHeight;
  const sheetPanels = layout.placedPanels.filter(p => p.sheetIndex === sheetIdx);

  const lines: string[] = [
    "0", "SECTION",
    "2", "HEADER",
    "9", "$ACADVER",
    "1", "AC1009", // AutoCAD R12 DXF for 100% universal CAM compatibility
    "0", "ENDSEC",
    "0", "SECTION",
    "2", "ENTITIES"
  ];

  // 1. Sheet Border Polyline on layer "SHEET_BORDER"
  lines.push(
    "0", "POLYLINE",
    "8", "SHEET_BORDER",
    "66", "1",
    "70", "1", // Closed polyline
    "0", "VERTEX", "8", "SHEET_BORDER", "10", "0.0", "20", "0.0", "30", "0.0",
    "0", "VERTEX", "8", "SHEET_BORDER", "10", `${w}.0`, "20", "0.0", "30", "0.0",
    "0", "VERTEX", "8", "SHEET_BORDER", "10", `${w}.0`, "20", `${h}.0`, "30", "0.0",
    "0", "VERTEX", "8", "SHEET_BORDER", "10", "0.0", "20", `${h}.0`, "30", "0.0",
    "0", "SEQEND"
  );

  // 2. Parts Closed Polylines on layer "PARTS_CUT"
  for (const p of sheetPanels) {
    lines.push(
      "0", "POLYLINE",
      "8", "PARTS_CUT",
      "66", "1",
      "70", "1"
    );
    for (const pt of p.polygon) {
      lines.push(
        "0", "VERTEX",
        "8", "PARTS_CUT",
        "10", `${pt[0]}.0`,
        "20", `${pt[1]}.0`,
        "30", "0.0"
      );
    }
    lines.push("0", "SEQEND");

    // Text tag inside triangle on layer "PARTS_LABELS"
    const cX = p.polygon.reduce((sum, pt) => sum + pt[0], 0) / 3;
    const cY = p.polygon.reduce((sum, pt) => sum + pt[1], 0) / 3;
    lines.push(
      "0", "TEXT",
      "8", "PARTS_LABELS",
      "10", `${Math.round(cX)}.0`,
      "20", `${Math.round(cY)}.0`,
      "30", "0.0",
      "40", "25.0", // text height
      "1", `${p.panelType}_${p.panelId}`
    );
  }

  lines.push(
    "0", "ENDSEC",
    "0", "EOF"
  );

  return lines.join("\n");
}

/**
 * Generates 2D Blueprints SVG for all beam types (lengths, miter cut angles, drill marks).
 */
export function generateBeamBlueprintsSVG(model: DomeModel): string {
  const groups = model.beamGroups;
  const sampleEdges = groups.map(g => model.edges.find(e => e.type === g.type)!);
  const miterData = sampleEdges.map(e => calculateBeamMiterAngles(e, model.nodes));

  const beamW = 60; // drawn height of beam
  const spacing = 160;
  const svgH = 140 + groups.length * spacing;
  const svgW = 1200;

  const rowsSvg = groups
    .map((g, i) => {
      const m = miterData[i];
      const y = 110 + i * (spacing + 20);
      const maxLen = Math.max(...groups.map(x => x.length));
      const drawnLen = (g.length / maxLen) * 620;
      const xStart = 240;
      const xEnd = xStart + drawnLen;
      const hubDiam = model.connectorParams.hubDiameter || 140;
      const hubRadius = hubDiam / 2;
      const netCut = g.cutLength || Math.max(0.5, Math.round(g.length - hubDiam));
      const drawnHubOffset = (hubRadius / g.length) * drawnLen;

      // Miter offsets
      const miterOffset = 18;

      return `
    <g transform="translate(0, ${y})">
      <!-- Beam Type Badge -->
      <rect x="30" y="0" width="170" height="68" rx="10" fill="${g.color}" opacity="0.15" />
      <rect x="30" y="0" width="170" height="68" rx="10" fill="none" stroke="${g.color}" stroke-width="2" />
      <text x="115" y="24" font-family="sans-serif" font-size="18" font-weight="bold" fill="#1A2E3B" text-anchor="middle">ТИП ${g.type}${g.isBaseBeam ? " (Основа)" : ""}</text>
      <text x="115" y="44" font-family="sans-serif" font-size="12" font-weight="bold" fill="#2E7D32" text-anchor="middle">L обріз = ${netCut} мм</text>
      <text x="115" y="60" font-family="sans-serif" font-size="11" fill="#718096" text-anchor="middle">L вуз = ${g.length} мм | ${g.count} шт</text>

      <!-- Dimension Line 1: ДО ВУЗЛА СХОДЖЕННЯ БАЛОК (ВЕРХНЯ РОЗМІРНА ЛІНІЯ) -->
      <line x1="${xStart - drawnHubOffset}" y1="-26" x2="${xEnd + drawnHubOffset}" y2="-26" stroke="#4A7C9B" stroke-width="1.8" />
      <line x1="${xStart - drawnHubOffset}" y1="-34" x2="${xStart - drawnHubOffset}" y2="-18" stroke="#4A7C9B" stroke-width="1.8" />
      <line x1="${xEnd + drawnHubOffset}" y1="-34" x2="${xEnd + drawnHubOffset}" y2="-18" stroke="#4A7C9B" stroke-width="1.8" />
      <!-- Extension lines from node centers down to beam ends -->
      <line x1="${xStart - drawnHubOffset}" y1="-18" x2="${xStart - drawnHubOffset}" y2="${beamW / 2}" stroke="#4A7C9B" stroke-width="1" stroke-dasharray="3,3" opacity="0.6" />
      <line x1="${xEnd + drawnHubOffset}" y1="-18" x2="${xEnd + drawnHubOffset}" y2="${beamW / 2}" stroke="#4A7C9B" stroke-width="1" stroke-dasharray="3,3" opacity="0.6" />
      <circle cx="${xStart - drawnHubOffset}" cy="${beamW / 2}" r="3" fill="#4A7C9B" />
      <circle cx="${xEnd + drawnHubOffset}" cy="${beamW / 2}" r="3" fill="#4A7C9B" />
      <text x="${(xStart + xEnd) / 2}" y="-32" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2B6CB0" text-anchor="middle">
        1. До вузла сходження балок (по осях): L вузла = ${g.length} мм
      </text>

      <!-- Beam Profile (Physical Trimmed Strut with Miter Cuts) -->
      <polygon points="${xStart + miterOffset},0 ${xEnd - miterOffset},0 ${xEnd},${beamW} ${xStart},${beamW}" 
               fill="#F4EFEB" stroke="#2D3748" stroke-width="2" />

      <!-- Centerline -->
      <line x1="${xStart - drawnHubOffset - 10}" y1="${beamW / 2}" x2="${xEnd + drawnHubOffset + 10}" y2="${beamW / 2}" stroke="#A0AEC0" stroke-dasharray="6,4" />

      <!-- Bolt Drill Holes -->
      <circle cx="${xStart + 35}" cy="${beamW / 2}" r="5" fill="#FFFFFF" stroke="#E2847A" stroke-width="2" />
      <circle cx="${xStart + 75}" cy="${beamW / 2}" r="5" fill="#FFFFFF" stroke="#E2847A" stroke-width="2" />
      <circle cx="${xEnd - 35}" cy="${beamW / 2}" r="5" fill="#FFFFFF" stroke="#E2847A" stroke-width="2" />
      <circle cx="${xEnd - 75}" cy="${beamW / 2}" r="5" fill="#FFFFFF" stroke="#E2847A" stroke-width="2" />

      <!-- Dimension Line 2: ОБРІЗАНИЙ ПІД КОНЕКТОР (НИЖНЯ РОЗМІРНА ЛІНІЯ ДЛЯ РОЗПИЛУ) -->
      <line x1="${xStart}" y1="${beamW + 24}" x2="${xEnd}" y2="${beamW + 24}" stroke="#2E7D32" stroke-width="2.2" />
      <line x1="${xStart}" y1="${beamW + 14}" x2="${xStart}" y2="${beamW + 34}" stroke="#2E7D32" stroke-width="2.2" />
      <line x1="${xEnd}" y1="${beamW + 14}" x2="${xEnd}" y2="${beamW + 34}" stroke="#2E7D32" stroke-width="2.2" />
      <text x="${(xStart + xEnd) / 2}" y="${beamW + 42}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1B4D2E" text-anchor="middle">
        2. Обрізаний під конектор: L обрізу = ${netCut} мм (-${hubRadius} мм з кожного торця під Ø${hubDiam})
      </text>

      <!-- Angle Annotations -->
      <text x="${xStart - 10}" y="-6" font-family="sans-serif" font-size="12" font-weight="600" fill="#DE7C5A">Торцевий зпил: ${m.startMiterDeg}°</text>
      <text x="${xEnd - 70}" y="-6" font-family="sans-serif" font-size="12" font-weight="600" fill="#DE7C5A">Фаска: ${m.bevelDeg}°</text>

      <!-- Cross Section Spec -->
      <text x="960" y="24" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2D3748">Переріз: ${model.beamProfile.width} × ${model.beamProfile.depth} мм</text>
      <text x="960" y="44" font-family="sans-serif" font-size="12" fill="#5A6778">Матеріал: ${model.beamProfile.name.split('(')[0]}</text>
      <text x="960" y="62" font-family="sans-serif" font-size="11" font-weight="bold" fill="#C53030">Відступ на конектор: 2 × ${hubRadius} = ${hubDiam} мм</text>
    </g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="100%">
  <rect width="100%" height="100%" fill="#FBF9F5" />
  
  <!-- Header -->
  <text x="30" y="45" font-family="sans-serif" font-size="24" font-weight="bold" fill="#1A2E3B">ТЕХНІЧНЕ КРЕСЛЕННЯ РОЗКРОЮ БАЛОК (КАРКАС КУПОЛА ${model.parameters.frequency}V)</text>
  <text x="30" y="70" font-family="sans-serif" font-size="14" fill="#5A6778">Загальна кількість балок: ${model.edges.length} шт | Лінійних метрів: ${model.structuralAnalysis.totalLinearMeters} м | Об'єм: ${model.structuralAnalysis.totalWoodVolumeM3} м³</text>
  <line x1="30" y1="85" x2="${svgW - 30}" y2="85" stroke="#E2DCD5" stroke-width="1.5" />

  ${rowsSvg}
</svg>`;
}

/**
 * Generates an individual high-detail technical shop blueprint SVG for a single beam type.
 * Includes Side View, Top View with drill marks, cross-section, and dual dimensions.
 */
export function generateSingleBeamBlueprintSVG(
  model: DomeModel,
  beamTypeName: string
): string {
  const group =
    model.beamGroups.find(g => g.type === beamTypeName) || model.beamGroups[0];
  const sampleEdge =
    model.edges.find(e => e.type === group.type) || model.edges[0];
  const miter = calculateBeamMiterAngles(sampleEdge, model.nodes);

  const hubDiam = model.connectorParams.hubDiameter || 140;
  const hubRadius = hubDiam / 2;
  const netCut =
    group.cutLength || Math.max(0.5, Math.round(group.length - hubDiam));

  const svgW = 1000;
  const svgH = 680;

  // Drawn scale for main side view and top view
  const xStart = 160;
  const drawnLen = 580;
  const xEnd = xStart + drawnLen;
  const drawnHubOffset = (hubRadius / group.length) * drawnLen;

  const beamH = 50; // Side view height
  const beamTopW = 40; // Top view width
  const miterOffset = 18;

  const linearM = Math.round(((netCut * group.count) / 1000) * 10) / 10;
  const volM3 =
    Math.round(
      linearM *
        (model.beamProfile.width / 1000) *
        (model.beamProfile.depth / 1000) *
        100
    ) / 100;
  const weightKg = Math.round(volM3 * model.beamProfile.density);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="100%">
  <!-- Blueprint Background -->
  <rect width="100%" height="100%" fill="#FBF9F5" />
  <rect x="20" y="20" width="${svgW - 40}" height="${svgH - 40}" rx="12" fill="none" stroke="#2D3748" stroke-width="2" />
  <rect x="24" y="24" width="${svgW - 48}" height="${svgH - 48}" rx="8" fill="none" stroke="#CBD5E0" stroke-width="1" />

  <!-- Technical Header -->
  <g transform="translate(45, 60)">
    <rect x="0" y="-20" width="130" height="42" rx="8" fill="${group.color}" opacity="0.2" />
    <rect x="0" y="-20" width="130" height="42" rx="8" fill="none" stroke="${group.color}" stroke-width="2" />
    <text x="65" y="6" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1A2E3B" text-anchor="middle">ТИП ${group.type}${group.isBaseBeam ? " (Основа)" : ""}</text>

    <text x="150" y="-2" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1A2E3B">ТЕХНІЧНА КАРТА РОЗКРОЮ ТА ПРИСАДКИ БАЛКИ</text>
    <text x="150" y="20" font-family="sans-serif" font-size="12" fill="#5A6778">
      Геодезичний купол ${model.parameters.frequency}V · Діаметр ${(model.parameters.diameter / 1000).toFixed(1)} м · Кількість у куполі: ${group.count} шт · Переріз: ${model.beamProfile.width}×${model.beamProfile.depth} мм
    </text>
  </g>

  <line x1="40" y1="100" x2="${svgW - 40}" y2="100" stroke="#CBD5E0" stroke-width="1.5" />

  <!-- ================= VIEW 1: SIDE VIEW (ВИД ЗБОКУ З ТОРЦЕВИМИ ЗАПИЛАМИ) ================= -->
  <g transform="translate(0, 195)">
    <text x="45" y="-55" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2D3748">ВИД 1: ПРОЕКЦІЯ ЗБОКУ (ТОРЦЕВІ ЗПИЛИ ТА РОЗМІРИ)</text>

    <!-- Dimension Line 1: ДО ВУЗЛА СХОДЖЕННЯ БАЛОК -->
    <line x1="${xStart - drawnHubOffset}" y1="-32" x2="${xEnd + drawnHubOffset}" y2="-32" stroke="#2B6CB0" stroke-width="2" />
    <line x1="${xStart - drawnHubOffset}" y1="-42" x2="${xStart - drawnHubOffset}" y2="-22" stroke="#2B6CB0" stroke-width="2" />
    <line x1="${xEnd + drawnHubOffset}" y1="-42" x2="${xEnd + drawnHubOffset}" y2="-22" stroke="#2B6CB0" stroke-width="2" />
    <!-- Node center markers -->
    <circle cx="${xStart - drawnHubOffset}" cy="-32" r="3.5" fill="#2B6CB0" />
    <circle cx="${xEnd + drawnHubOffset}" cy="-32" r="3.5" fill="#2B6CB0" />
    <line x1="${xStart - drawnHubOffset}" y1="-22" x2="${xStart - drawnHubOffset}" y2="${beamH / 2}" stroke="#2B6CB0" stroke-dasharray="3,3" stroke-width="1.2" opacity="0.7" />
    <line x1="${xEnd + drawnHubOffset}" y1="-22" x2="${xEnd + drawnHubOffset}" y2="${beamH / 2}" stroke="#2B6CB0" stroke-dasharray="3,3" stroke-width="1.2" opacity="0.7" />
    <text x="${(xStart + xEnd) / 2}" y="-40" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2B6CB0" text-anchor="middle">
      1. РОЗМІР ДО ВУЗЛА СХОДЖЕННЯ БАЛОК (ПО ОСЯХ): L вуз = ${group.length} мм
    </text>

    <!-- Connector Hub Circle Shadows at ends -->
    <circle cx="${xStart - drawnHubOffset}" cy="${beamH / 2}" r="${drawnHubOffset}" fill="#CBD5E0" opacity="0.25" stroke="#718096" stroke-dasharray="2,2" />
    <circle cx="${xEnd + drawnHubOffset}" cy="${beamH / 2}" r="${drawnHubOffset}" fill="#CBD5E0" opacity="0.25" stroke="#718096" stroke-dasharray="2,2" />
    <text x="${xStart - drawnHubOffset}" y="${beamH / 2 + 4}" font-family="sans-serif" font-size="10" font-weight="bold" fill="#718096" text-anchor="middle">Вузол A</text>
    <text x="${xEnd + drawnHubOffset}" y="${beamH / 2 + 4}" font-family="sans-serif" font-size="10" font-weight="bold" fill="#718096" text-anchor="middle">Вузол B</text>

    <!-- Beam Strut Contour -->
    <polygon points="${xStart + miterOffset},0 ${xEnd - miterOffset},0 ${xEnd},${beamH} ${xStart},${beamH}" 
             fill="#FAF3EC" stroke="#2D3748" stroke-width="2.2" />

    <!-- Centerline -->
    <line x1="${xStart - drawnHubOffset - 25}" y1="${beamH / 2}" x2="${xEnd + drawnHubOffset + 25}" y2="${beamH / 2}" stroke="#A0AEC0" stroke-dasharray="6,4" stroke-width="1.2" />

    <!-- Dimension Line 2: ОБРІЗАНИЙ ПІД КОНЕКТОР -->
    <line x1="${xStart}" y1="${beamH + 28}" x2="${xEnd}" y2="${beamH + 28}" stroke="#1B4D2E" stroke-width="2.5" />
    <line x1="${xStart}" y1="${beamH + 16}" x2="${xStart}" y2="${beamH + 40}" stroke="#1B4D2E" stroke-width="2.5" />
    <line x1="${xEnd}" y1="${beamH + 16}" x2="${xEnd}" y2="${beamH + 40}" stroke="#1B4D2E" stroke-width="2.5" />
    <text x="${(xStart + xEnd) / 2}" y="${beamH + 48}" font-family="sans-serif" font-size="15" font-weight="bold" fill="#1B4D2E" text-anchor="middle">
      2. ОБРІЗАНИЙ ПІД КОНЕКТОР (ЧИСТИЙ РОЗПИЛ): L обрізу = ${netCut} мм
    </text>

    <!-- Offset Callout at Ends -->
    <text x="${xStart - 12}" y="${beamH + 18}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#C53030" text-anchor="end">відступ -${hubRadius} мм</text>
    <text x="${xEnd + 12}" y="${beamH + 18}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#C53030" text-anchor="start">відступ -${hubRadius} мм</text>

    <!-- Miter Angles Annotations -->
    <g transform="translate(${xStart - 10}, -10)">
      <path d="M 0 0 L 20 18" stroke="#DE7C5A" stroke-width="1.5" />
      <text x="-5" y="-4" font-family="sans-serif" font-size="12" font-weight="bold" fill="#C05621">Зпил: ${miter.startMiterDeg}°</text>
    </g>
    <g transform="translate(${xEnd - 10}, -10)">
      <text x="25" y="-4" font-family="sans-serif" font-size="12" font-weight="bold" fill="#C05621">Зпил: ${miter.endMiterDeg}°</text>
    </g>

    <text x="${xEnd - 50}" y="${beamH - 8}" font-family="sans-serif" font-size="11" font-weight="600" fill="#718096">Фаска: ${miter.bevelDeg}°</text>
  </g>

  <!-- ================= VIEW 2: TOP VIEW (ВИД ЗВЕРХУ З ОТВОРАМИ ПІД БОЛТИ) ================= -->
  <g transform="translate(0, 365)">
    <text x="45" y="-28" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2D3748">ВИД 2: ПРОЕКЦІЯ ЗВЕРХУ (РОЗМІТКА ОТВОРІВ ПІД БОЛТИ КОНЕКТОРА)</text>

    <!-- Top View Strut Body -->
    <rect x="${xStart}" y="0" width="${drawnLen}" height="${beamTopW}" fill="#F4EFEB" stroke="#2D3748" stroke-width="2" />

    <!-- Centerline -->
    <line x1="${xStart - 20}" y1="${beamTopW / 2}" x2="${xEnd + 20}" y2="${beamTopW / 2}" stroke="#A0AEC0" stroke-dasharray="6,4" stroke-width="1.2" />

    <!-- Left End Bolt Holes (35mm and 75mm from cut end) -->
    <g transform="translate(${xStart + 35}, ${beamTopW / 2})">
      <circle cx="0" cy="0" r="6" fill="#FFFFFF" stroke="#E53E3E" stroke-width="2" />
      <line x1="-9" y1="0" x2="9" y2="0" stroke="#E53E3E" stroke-width="1" />
      <line x1="0" y1="-9" x2="0" y2="9" stroke="#E53E3E" stroke-width="1" />
    </g>
    <g transform="translate(${xStart + 75}, ${beamTopW / 2})">
      <circle cx="0" cy="0" r="6" fill="#FFFFFF" stroke="#E53E3E" stroke-width="2" />
      <line x1="-9" y1="0" x2="9" y2="0" stroke="#E53E3E" stroke-width="1" />
      <line x1="0" y1="-9" x2="0" y2="9" stroke="#E53E3E" stroke-width="1" />
    </g>

    <!-- Right End Bolt Holes -->
    <g transform="translate(${xEnd - 35}, ${beamTopW / 2})">
      <circle cx="0" cy="0" r="6" fill="#FFFFFF" stroke="#E53E3E" stroke-width="2" />
      <line x1="-9" y1="0" x2="9" y2="0" stroke="#E53E3E" stroke-width="1" />
      <line x1="0" y1="-9" x2="0" y2="9" stroke="#E53E3E" stroke-width="1" />
    </g>
    <g transform="translate(${xEnd - 75}, ${beamTopW / 2})">
      <circle cx="0" cy="0" r="6" fill="#FFFFFF" stroke="#E53E3E" stroke-width="2" />
      <line x1="-9" y1="0" x2="9" y2="0" stroke="#E53E3E" stroke-width="1" />
      <line x1="0" y1="-9" x2="0" y2="9" stroke="#E53E3E" stroke-width="1" />
    </g>

    <!-- Hole Dimensions Lines Left -->
    <line x1="${xStart}" y1="${beamTopW + 15}" x2="${xStart + 35}" y2="${beamTopW + 15}" stroke="#718096" stroke-width="1.2" />
    <text x="${xStart + 17}" y="${beamTopW + 28}" font-family="sans-serif" font-size="10" font-weight="bold" fill="#2D3748" text-anchor="middle">35 мм</text>

    <line x1="${xStart + 35}" y1="${beamTopW + 15}" x2="${xStart + 75}" y2="${beamTopW + 15}" stroke="#718096" stroke-width="1.2" />
    <text x="${xStart + 55}" y="${beamTopW + 28}" font-family="sans-serif" font-size="10" font-weight="bold" fill="#2D3748" text-anchor="middle">40 мм</text>

    <!-- Hole Dimensions Lines Right -->
    <line x1="${xEnd - 75}" y1="${beamTopW + 15}" x2="${xEnd - 35}" y2="${beamTopW + 15}" stroke="#718096" stroke-width="1.2" />
    <text x="${xEnd - 55}" y="${beamTopW + 28}" font-family="sans-serif" font-size="10" font-weight="bold" fill="#2D3748" text-anchor="middle">40 мм</text>

    <line x1="${xEnd - 35}" y1="${beamTopW + 15}" x2="${xEnd}" y2="${beamTopW + 15}" stroke="#718096" stroke-width="1.2" />
    <text x="${xEnd - 17}" y="${beamTopW + 28}" font-family="sans-serif" font-size="10" font-weight="bold" fill="#2D3748" text-anchor="middle">35 мм</text>

    <text x="${(xStart + xEnd) / 2}" y="${beamTopW + 22}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#E53E3E" text-anchor="middle">
      4 отвори Ø10.5 мм під болти М10 DIN 933 (по 2 отвори з кожного боку)
    </text>

    <!-- Cross Section Thumbnail (Right Side) -->
    <g transform="translate(800, -20)">
      <rect x="0" y="0" width="60" height="75" rx="3" fill="#FAF3EC" stroke="#2D3748" stroke-width="1.8" />
      <text x="30" y="38" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2D3748" text-anchor="middle">
        ${model.beamProfile.width}×${model.beamProfile.depth}
      </text>
      <text x="30" y="92" font-family="sans-serif" font-size="10" fill="#718096" text-anchor="middle">Переріз мм</text>
    </g>
  </g>

  <!-- ================= TECHNICAL SPECIFICATION TABLE & TITLE BLOCK ================= -->
  <g transform="translate(45, 480)">
    <!-- Table Header -->
    <rect x="0" y="0" width="${svgW - 90}" height="140" rx="8" fill="#FFFFFF" stroke="#CBD5E0" stroke-width="1.5" />
    <rect x="0" y="0" width="${svgW - 90}" height="28" rx="8" fill="#EDF2F7" />

    <text x="15" y="19" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2D3748">ПАРАМЕТР</text>
    <text x="260" y="19" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2D3748">ЗНАЧЕННЯ</text>
    <text x="510" y="19" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2D3748">ТЕХНІЧНІ ВИМОГИ ТА ВКАЗІВКИ ДЛЯ СТОЛЯРА</text>

    <!-- Row 1: Dual Lengths -->
    <line x1="0" y1="28" x2="${svgW - 90}" y2="28" stroke="#E2E8F0" />
    <text x="15" y="46" font-family="sans-serif" font-size="11" fill="#4A5568">Довжина до вузла сходження (Lвуз)</text>
    <text x="260" y="46" font-family="sans-serif" font-size="12" font-weight="bold" fill="#2B6CB0">${group.length} мм</text>
    <text x="510" y="46" font-family="sans-serif" font-size="11" fill="#718096">Відстань між центрами болтових шайб вузлів сфери</text>

    <!-- Row 2: Net Cut Length -->
    <line x1="0" y1="56" x2="${svgW - 90}" y2="56" stroke="#E2E8F0" />
    <text x="15" y="74" font-family="sans-serif" font-size="11" font-weight="bold" fill="#1B4D2E">Чиста довжина розпилу (Lобріз)</text>
    <text x="260" y="74" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1B4D2E">${netCut} мм</text>
    <text x="510" y="74" font-family="sans-serif" font-size="11" font-weight="bold" fill="#1B4D2E">
      Точний габарит різу бруса (обрізка на ${hubRadius} мм з кожного кінця під кільце Ø${hubDiam})
    </text>

    <!-- Row 3: Angles & Holes -->
    <line x1="0" y1="84" x2="${svgW - 90}" y2="84" stroke="#E2E8F0" />
    <text x="15" y="102" font-family="sans-serif" font-size="11" fill="#4A5568">Кути торцювання та фаски</text>
    <text x="260" y="102" font-family="sans-serif" font-size="11" font-weight="bold" fill="#C05621">Зпил: ${miter.startMiterDeg}° | Фаска: ${miter.bevelDeg}°</text>
    <text x="510" y="102" font-family="sans-serif" font-size="11" fill="#718096">Кут нахилу диска торцювальної пили. Допуск ±0.2°</text>

    <!-- Row 4: Material & Count -->
    <line x1="0" y1="112" x2="${svgW - 90}" y2="112" stroke="#E2E8F0" />
    <text x="15" y="130" font-family="sans-serif" font-size="11" fill="#4A5568">Тираж та витрата матеріалу</text>
    <text x="260" y="130" font-family="sans-serif" font-size="11" font-weight="bold" fill="#1A2E3B">${group.count} шт · ${linearM} пог. м (${volM3} м³ · ${weightKg} кг)</text>
    <text x="510" y="130" font-family="sans-serif" font-size="11" fill="#718096">Матеріал: ${model.beamProfile.name}. Вологість W ≤ 12%</text>
  </g>
</svg>`;
}

/**
 * Generates 2D top projection (Plan) and elevation view SVG of the dome.
 */
export function generateDome2DProjectionSVG(model: DomeModel): string {
  const r = model.parameters.diameter / 2;
  const pad = 80;
  const size = r * 2 + pad * 2;
  const scale = 500 / size;
  const center = 280;

  // Plan view projection (top-down)
  const edgesPlan = model.edges
    .map(e => {
      const p1 = model.nodes[e.start].position;
      const p2 = model.nodes[e.end].position;
      const x1 = center + (p1.x * scale);
      const y1 = center + (p1.y * scale);
      const x2 = center + (p2.x * scale);
      const y2 = center + (p2.y * scale);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${e.color}" stroke-width="1.8" />`;
    })
    .join("\n    ");

  const nodesPlan = model.nodes
    .map(n => {
      const x = center + (n.position.x * scale);
      const y = center + (n.position.y * scale);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${n.boundary ? 3.5 : 2.5}" fill="${n.boundary ? '#DE7C5A' : '#1A2E3B'}" />`;
    })
    .join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 640" width="100%" height="100%">
  <rect width="100%" height="100%" fill="#FBF9F5" />
  
  <text x="30" y="40" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1A2E3B">ПЛАН КУПОЛА (ВИД ЗВЕРХУ 2D)</text>
  <text x="30" y="60" font-family="sans-serif" font-size="12" fill="#5A6778">Частота: ${model.parameters.frequency}V | Діаметр: ${(model.parameters.diameter / 1000).toFixed(1)} м | Площа підлоги: ${model.statistics.floorAreaM2} м²</text>

  <!-- Projection Grid Circle -->
  <circle cx="${center}" cy="${center + 20}" r="${r * scale}" fill="#FFFFFF" stroke="#D1C8BA" stroke-width="1.5" stroke-dasharray="4,4" />

  <g transform="translate(0, 20)">
    ${edgesPlan}
    ${nodesPlan}
  </g>

  <!-- Legend -->
  <g transform="translate(20, 580)">
    <text x="0" y="0" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2D3748">Розміри балок (L вузла / L обріз):</text>
    ${model.beamGroups
      .slice(0, 5)
      .map(
        (g, i) => {
          const cutL = g.cutLength || Math.round(g.length - model.connectorParams.hubDiameter);
          return `<rect x="${190 + i * 80}" y="-10" width="10" height="10" rx="2" fill="${g.color}" />
           <text x="${204 + i * 80}" y="0" font-family="sans-serif" font-size="10" fill="#4A5568"><b>${g.type}</b>: ${g.length}/${cutL}</text>`;
        }
      )
      .join("")}
  </g>
</svg>`;
}

/**
 * Generates an individual technical shop blueprint SVG for a single triangular sheathing panel type.
 * Includes precise geometry, 3 edge dimension lines, 3 corner angles, altitude, dihedral bevels, and title block.
 */
export function generateSingleTriangleBlueprintSVG(
  model: DomeModel,
  faceTypeName: string
): string {
  const group =
    model.faceGroups.find(g => g.type === faceTypeName) || model.faceGroups[0];
  const [L1, L2, L3] = group.lengths; // L1=base AB, L2=side BC, L3=side CA
  const [angA, angB, angC] = group.angles;
  const [edge1, edge2, edge3] = group.edges;
  const bevels = group.dihedralBevels;

  const svgW = 1000;
  const svgH = 750;

  // Unfold triangle to 2D
  const cosA = Math.max(-1, Math.min(1, (L3 * L3 + L1 * L1 - L2 * L2) / (2 * L3 * L1)));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const rawCx = L3 * cosA;
  const rawCy = L3 * sinA; // Altitude height in mm

  const heightMm = Math.round(rawCy);
  const perimeterMm = L1 + L2 + L3;
  const totalAreaM2 = Math.round(group.area * group.count * 100) / 100;

  // Scale and center triangle in viewport
  const minRawX = Math.min(0, rawCx);
  const maxRawX = Math.max(L1, rawCx);
  const spanX = maxRawX - minRawX;
  const spanY = rawCy;

  const drawAreaW = 540;
  const drawAreaH = 260;
  const scale = Math.min(drawAreaW / Math.max(1, spanX), drawAreaH / Math.max(1, spanY));

  const drawOriginX = 500 - (spanX * scale) / 2 - minRawX * scale;
  const drawOriginY = 400; // Base Y position

  const xA = drawOriginX;
  const yA = drawOriginY;
  const xB = drawOriginX + L1 * scale;
  const yB = drawOriginY;
  const xC = drawOriginX + rawCx * scale;
  const yC = drawOriginY - rawCy * scale;

  const cX = (xA + xB + xC) / 3;
  const cY = (yA + yB + yC) / 3;

  // Midpoints of edges
  const midAB_x = (xA + xB) / 2;
  const midAB_y = yA;
  const midBC_x = (xB + xC) / 2;
  const midBC_y = (yB + yC) / 2;
  const midCA_x = (xC + xA) / 2;
  const midCA_y = (yC + yA) / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="100%">
  <!-- Blueprint Sheet Background -->
  <rect width="100%" height="100%" fill="#FBF9F5" />
  <rect x="20" y="20" width="${svgW - 40}" height="${svgH - 40}" rx="12" fill="none" stroke="#2D3748" stroke-width="2" />
  <rect x="24" y="24" width="${svgW - 48}" height="${svgH - 48}" rx="8" fill="none" stroke="#CBD5E0" stroke-width="1" />

  <!-- Technical Header -->
  <g transform="translate(45, 60)">
    <rect x="0" y="-20" width="160" height="44" rx="8" fill="${group.color}" opacity="0.18" />
    <rect x="0" y="-20" width="160" height="44" rx="8" fill="none" stroke="${group.color}" stroke-width="2" />
    <text x="80" y="8" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1A2E3B" text-anchor="middle">ГРАНЬ ${group.type}</text>

    <text x="180" y="-2" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1A2E3B">ТЕХНІЧНЕ КРЕСЛЕННЯ ПАНЕЛІ ОБШИВКИ КУПОЛА</text>
    <text x="180" y="20" font-family="sans-serif" font-size="12" fill="#5A6778">
      Геодезичний купол ${model.parameters.frequency}V · Діаметр ${(model.parameters.diameter / 1000).toFixed(1)} м · Кількість у куполі: ${group.count} шт · Площа: ${group.area} м²
    </text>
  </g>

  <line x1="40" y1="100" x2="${svgW - 40}" y2="100" stroke="#CBD5E0" stroke-width="1.5" />

  <!-- Subtitle -->
  <text x="45" y="130" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2D3748">
    ГЕОМЕТРИЧНИЙ РОЗКРІЙ ТРИКУТНОЇ ПАНЕЛІ (РОЗМІРИ, КУТИ ВЕРШИН ТА ФАСКИ КРОМОК)
  </text>

  <!-- ================= MAIN TRIANGLE DRAWING ================= -->
  <!-- Triangle Fill & Contour -->
  <polygon points="${xA},${yA} ${xB},${yB} ${xC},${yC}" 
           fill="#FAF2DE" opacity="0.85" stroke="#2D3748" stroke-width="2.5" />

  <!-- Centerline / Altitude line (h) -->
  <line x1="${xC}" y1="${yC}" x2="${xC}" y2="${yA}" stroke="#C53030" stroke-width="1.5" stroke-dasharray="4,4" />
  <circle cx="${xC}" cy="${yA}" r="3" fill="#C53030" />
  <text x="${xC + 8}" y="${(yC + yA) / 2}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#C53030">
    h = ${heightMm} мм
  </text>

  <!-- Centroid Marker -->
  <circle cx="${cX}" cy="${cY}" r="4" fill="#5B9279" />
  <text x="${cX}" y="${cY - 8}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#1A3E26" text-anchor="middle">
    ${group.type}
  </text>

  <!-- Vertices Labels A, B, C -->
  <circle cx="${xA}" cy="${yA}" r="4" fill="#2D3748" />
  <text x="${xA - 14}" y="${yA + 16}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1A2E3B">A</text>

  <circle cx="${xB}" cy="${yB}" r="4" fill="#2D3748" />
  <text x="${xB + 14}" y="${yB + 16}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1A2E3B">B</text>

  <circle cx="${xC}" cy="${yC}" r="4" fill="#2D3748" />
  <text x="${xC}" y="${yC - 14}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1A2E3B" text-anchor="middle">C</text>

  <!-- Corner Angle Arcs & Callouts -->
  <!-- Corner A -->
  <text x="${xA + 24}" y="${yA - 12}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#C05621">
    ${angA}°
  </text>

  <!-- Corner B -->
  <text x="${xB - 45}" y="${yA - 12}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#C05621">
    ${angB}°
  </text>

  <!-- Corner C -->
  <text x="${xC}" y="${yC + 28}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#C05621" text-anchor="middle">
    ${angC}°
  </text>

  <!-- ================= EDGE DIMENSIONS ================= -->
  <!-- 1. Bottom Edge AB Dimension Line -->
  <line x1="${xA}" y1="${yA + 30}" x2="${xB}" y2="${yA + 30}" stroke="#2B6CB0" stroke-width="2" />
  <line x1="${xA}" y1="${yA + 18}" x2="${xA}" y2="${yA + 42}" stroke="#2B6CB0" stroke-width="2" />
  <line x1="${xB}" y1="${yA + 18}" x2="${xB}" y2="${yA + 42}" stroke="#2B6CB0" stroke-width="2" />
  <text x="${midAB_x}" y="${yA + 50}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2B6CB0" text-anchor="middle">
    Сторона 1 (AB): L₁ = ${L1} мм (Балка ${edge1})
  </text>
  <text x="${midAB_x}" y="${yA + 66}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#9A3412" text-anchor="middle">
    Фаска прилягання: ${bevels[0]}°
  </text>

  <!-- 2. Right Edge BC Dimension Annotation -->
  <text x="${midBC_x + 35}" y="${midBC_y - 6}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2B6CB0">
    Сторона 2 (BC): L₂ = ${L2} мм (Балка ${edge2})
  </text>
  <text x="${midBC_x + 35}" y="${midBC_y + 12}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#9A3412">
    Фаска прилягання: ${bevels[1]}°
  </text>

  <!-- 3. Left Edge CA Dimension Annotation -->
  <text x="${midCA_x - 35}" y="${midCA_y - 6}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2B6CB0" text-anchor="end">
    Сторона 3 (CA): L₃ = ${L3} мм (Балка ${edge3})
  </text>
  <text x="${midCA_x - 35}" y="${midCA_y + 12}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#9A3412" text-anchor="end">
    Фаска прилягання: ${bevels[2]}°
  </text>

  <!-- ================= TECHNICAL SPECIFICATION TABLE ================= -->
  <g transform="translate(45, 520)">
    <rect x="0" y="0" width="${svgW - 90}" height="175" rx="8" fill="#FFFFFF" stroke="#CBD5E0" stroke-width="1.5" />
    <rect x="0" y="0" width="${svgW - 90}" height="28" rx="8" fill="#EDF2F7" />

    <text x="15" y="19" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2D3748">ПАРАМЕТР ПАНЕЛІ ОБШИВКИ</text>
    <text x="300" y="19" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2D3748">ТОЧНЕ ЗНАЧЕННЯ</text>
    <text x="560" y="19" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2D3748">ТЕХНІЧНІ ВИМОГИ ТА ВКАЗІВКИ ДЛЯ ЧПК / РОЗКРОЮ</text>

    <!-- Row 1: Side Lengths -->
    <line x1="0" y1="28" x2="${svgW - 90}" y2="28" stroke="#E2E8F0" />
    <text x="15" y="47" font-family="sans-serif" font-size="11" fill="#4A5568">Довжини сторін трикутника (L₁ × L₂ × L₃)</text>
    <text x="300" y="47" font-family="sans-serif" font-size="12" font-weight="bold" fill="#2B6CB0">${L1} × ${L2} × ${L3} мм</text>
    <text x="560" y="47" font-family="sans-serif" font-size="11" fill="#718096">Відповідають балкам каркаса [${edge1}, ${edge2}, ${edge3}]. Допуск розкрою ±1.0 мм</text>

    <!-- Row 2: Corner Angles & Altitude -->
    <line x1="0" y1="58" x2="${svgW - 90}" y2="58" stroke="#E2E8F0" />
    <text x="15" y="77" font-family="sans-serif" font-size="11" fill="#4A5568">Кути вершин та висота трикутника</text>
    <text x="300" y="77" font-family="sans-serif" font-size="12" font-weight="bold" fill="#C05621">∠A=${angA}°, ∠B=${angB}°, ∠C=${angC}° (h=${heightMm} мм)</text>
    <text x="560" y="77" font-family="sans-serif" font-size="11" fill="#718096">Сума кутів = 180.0°. Контроль діагоналей при розкрої</text>

    <!-- Row 3: Dihedral Bevels -->
    <line x1="0" y1="88" x2="${svgW - 90}" y2="88" stroke="#E2E8F0" />
    <text x="15" y="107" font-family="sans-serif" font-size="11" fill="#4A5568">Кути фаски кромки (Dihedral bevels)</text>
    <text x="300" y="107" font-family="sans-serif" font-size="12" font-weight="bold" fill="#9A3412">${bevels[0]}° / ${bevels[1]}° / ${bevels[2]}°</text>
    <text x="560" y="107" font-family="sans-serif" font-size="11" fill="#718096">Зріз торця фанери фрезою під кутом для щільного беззазорного стику на ребрах</text>

    <!-- Row 4: Area & Quantities -->
    <line x1="0" y1="118" x2="${svgW - 90}" y2="118" stroke="#E2E8F0" />
    <text x="15" y="137" font-family="sans-serif" font-size="11" fill="#4A5568">Тираж та площа панелей</text>
    <text x="300" y="137" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1B4D2E">${group.count} шт · S₁ = ${group.area} м² (Всього: ${totalAreaM2} м²)</text>
    <text x="560" y="137" font-family="sans-serif" font-size="11" fill="#718096">Периметр однієї панелі P = ${(perimeterMm / 1000).toFixed(2)} м (довжина шва герметизації)</text>

    <!-- Row 5: Material Recommendation -->
    <line x1="0" y1="148" x2="${svgW - 90}" y2="148" stroke="#E2E8F0" />
    <text x="15" y="167" font-family="sans-serif" font-size="11" fill="#4A5568">Рекомендований матеріал обшивки</text>
    <text x="300" y="167" font-family="sans-serif" font-size="11" font-weight="bold" fill="#1A2E3B">Фанера вологостійка ФСФ 12–15 мм / OSB-3</text>
    <text x="560" y="167" font-family="sans-serif" font-size="11" fill="#718096">Або монолітний полікарбонат 4–8 мм / загартований склопакет</text>
  </g>
</svg>`;
}

/**
 * Generates a master technical blueprint SVG displaying ALL sheathing triangle types side by side.
 */
export function generateAllTrianglesBlueprintSVG(model: DomeModel): string {
  const groups = model.faceGroups;
  const count = groups.length;

  const cardW = 460;
  const cardH = 430;
  const cols = Math.min(count, 2);
  const rows = Math.ceil(count / cols);

  const svgW = 60 + cols * (cardW + 30);
  const svgH = 150 + rows * (cardH + 30) + 140;

  const cardsSvg = groups
    .map((g, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const posX = 45 + col * (cardW + 30);
      const posY = 130 + row * (cardH + 30);

      const [L1, L2, L3] = g.lengths;
      const [angA, angB, angC] = g.angles;
      const [edge1, edge2, edge3] = g.edges;
      const bevels = g.dihedralBevels;

      const cosA = Math.max(-1, Math.min(1, (L3 * L3 + L1 * L1 - L2 * L2) / (2 * L3 * L1)));
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const rawCx = L3 * cosA;
      const rawCy = L3 * sinA;

      const scale = Math.min(300 / Math.max(1, L1), 180 / Math.max(1, rawCy));
      const originX = posX + (cardW - L1 * scale) / 2;
      const originY = posY + 260;

      const xA = originX;
      const yA = originY;
      const xB = originX + L1 * scale;
      const yB = originY;
      const xC = originX + rawCx * scale;
      const yC = originY - rawCy * scale;

      return `
    <g>
      <!-- Card Box -->
      <rect x="${posX}" y="${posY}" width="${cardW}" height="${cardH}" rx="12" fill="#FFFFFF" stroke="#CBD5E0" stroke-width="1.5" />
      <rect x="${posX}" y="${posY}" width="${cardW}" height="42" rx="12" fill="#FAF7F2" />
      <line x1="${posX}" y1="${posY + 42}" x2="${posX + cardW}" y2="${posY + 42}" stroke="#E2E8F0" />

      <!-- Card Title -->
      <rect x="${posX + 15}" y="${posY + 8}" width="26" height="26" rx="6" fill="${g.color}" />
      <text x="${posX + 50}" y="${posY + 26}" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1A2E3B">ТРИКУТНИК ТИП ${g.type}</text>
      <text x="${posX + cardW - 20}" y="${posY + 26}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2E7D32" text-anchor="end">${g.count} шт · ${g.area} м²</text>

      <!-- Triangle Shape -->
      <polygon points="${xA},${yA} ${xB},${yB} ${xC},${yC}" fill="#FAF2DE" stroke="#2D3748" stroke-width="2.2" />
      
      <!-- Altitude -->
      <line x1="${xC}" y1="${yC}" x2="${xC}" y2="${yA}" stroke="#C53030" stroke-width="1.2" stroke-dasharray="3,3" />
      <text x="${xC + 6}" y="${(yC + yA) / 2}" font-family="sans-serif" font-size="10" font-weight="bold" fill="#C53030">h=${Math.round(rawCy)}</text>

      <!-- Side Dimensions -->
      <!-- Side AB -->
      <text x="${(xA + xB) / 2}" y="${yA + 20}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#2B6CB0" text-anchor="middle">L₁ = ${L1} мм (Балка ${edge1})</text>
      <!-- Side BC -->
      <text x="${(xB + xC) / 2 + 15}" y="${(yB + yC) / 2}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2B6CB0">L₂ = ${L2} мм (${edge2})</text>
      <!-- Side CA -->
      <text x="${(xC + xA) / 2 - 15}" y="${(yC + yA) / 2}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2B6CB0" text-anchor="end">L₃ = ${L3} мм (${edge3})</text>

      <!-- Corner Angles -->
      <text x="${xA + 18}" y="${yA - 8}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#C05621">${angA}°</text>
      <text x="${xB - 30}" y="${yA - 8}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#C05621">${angB}°</text>
      <text x="${xC}" y="${yC + 20}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#C05621" text-anchor="middle">${angC}°</text>

      <!-- Bottom Card Specs -->
      <g transform="translate(${posX + 20}, ${posY + 320})">
        <rect x="0" y="0" width="${cardW - 40}" height="90" rx="8" fill="#F8FAFC" stroke="#E2E8F0" />
        <text x="12" y="24" font-family="sans-serif" font-size="11" fill="#4A5568">Фаски прилягання: <tspan font-weight="bold" fill="#9A3412">${bevels[0]}° / ${bevels[1]}° / ${bevels[2]}°</tspan></text>
        <text x="12" y="44" font-family="sans-serif" font-size="11" fill="#4A5568">Периметр панелі: <tspan font-weight="bold" fill="#1A2E3B">${L1 + L2 + L3} мм</tspan></text>
        <text x="12" y="64" font-family="sans-serif" font-size="11" fill="#4A5568">Сумарна площа тиражу: <tspan font-weight="bold" fill="#1B4D2E">${(g.area * g.count).toFixed(2)} м²</tspan></text>
      </g>
    </g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="100%">
  <!-- Background -->
  <rect width="100%" height="100%" fill="#FBF9F5" />
  
  <!-- Header -->
  <text x="45" y="50" font-family="sans-serif" font-size="24" font-weight="bold" fill="#1A2E3B">ЗВЕДЕНЕ КРЕСЛЕННЯ ВСІХ ТИПІВ ТРИКУТНИКІВ ОБШИВКИ (${model.parameters.frequency}V)</text>
  <text x="45" y="76" font-family="sans-serif" font-size="13" fill="#5A6778">
    Всього граней купола: ${model.faces.length} шт | Типів трикутників: ${groups.length} | Загальна площа обшивки: ${model.statistics.domeSurfaceAreaM2} м²
  </text>
  <line x1="45" y1="95" x2="${svgW - 45}" y2="95" stroke="#CBD5E0" stroke-width="1.5" />

  <!-- Triangle Cards -->
  ${cardsSvg}

  <!-- Footer Info Block -->
  <g transform="translate(45, ${svgH - 100})">
    <rect x="0" y="0" width="${svgW - 90}" height="70" rx="10" fill="#EDF2F7" stroke="#CBD5E0" />
    <text x="20" y="28" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1A2E3B">ВКАЗІВКИ ДЛЯ СТОЛЯРНОГО ТА ЧПК ЦЕХУ:</text>
    <text x="20" y="48" font-family="sans-serif" font-size="11" fill="#4A5568">
      1. Розкрій виконувати за розмірами сторін L₁, L₂, L₃ з допуском ±1.0 мм. 2. Кромки панелей підрізати на кути фасок (bevel) для герметичного стику. 3. Матеріал: вологостійка фанера ФСФ або OSB-3.
    </text>
  </g>
</svg>`;
}
