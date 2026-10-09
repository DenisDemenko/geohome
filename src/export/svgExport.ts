import { DomeModel, ConnectorGeometry, SheathingSheetLayout, FabricRollNestingLayout, FabricStrip } from "../core/types";
import { generateConnectorCutPattern } from "../core/connectors";
import { calculateBeamMiterAngles } from "../core/beams";
import {
  CONNECTOR_MATERIALS,
  CONNECTOR_COATINGS,
  calculateConnectorPieceWeight,
  ConnectorMaterialId,
  ConnectorCoatingId
} from "../core/connectorMaterials";

/**
 * Transliterates Cyrillic to clean Latin ASCII and sanitizes filenames for cross-browser safety.
 * Prevents OS/browsers (Chrome, Edge, Safari, iOS, Android) from mangling names or appending '.txt'.
 */
export function sanitizeDownloadFileName(name: string): string {
  const cyrillicMap: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye", ж: "zh",
    з: "z", и: "y", і: "i", ї: "yi", й: "y", к: "k", л: "l", м: "m", н: "n",
    о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
    ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "yu", я: "ya",
    А: "A", Б: "B", В: "V", Г: "H", Ґ: "G", Д: "D", Е: "E", Є: "Ye", Ж: "Zh",
    З: "Z", И: "Y", І: "I", Й: "Y", К: "K", Л: "L", М: "M", Н: "N",
    О: "O", П: "P", Р: "R", С: "S", Т: "T", У: "U", Ф: "F", Х: "Kh", Ц: "Ts",
    Ч: "Ch", Ш: "Sh", Щ: "Shch", Ь: "", Ю: "Yu", Я: "Ya"
  };

  let transliterated = "";
  for (const ch of name) {
    transliterated += cyrillicMap[ch] !== undefined ? cyrillicMap[ch] : ch;
  }

  // Preserve the last extension
  const lastDot = transliterated.lastIndexOf(".");
  let base = transliterated;
  let ext = "";
  if (lastDot > 0) {
    base = transliterated.substring(0, lastDot);
    ext = transliterated.substring(lastDot).toLowerCase();
  }

  // Clean base name: replace any non-alphanumeric chars with underscore, collapse multiples
  const cleanBase = base.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return `${cleanBase || "connector_export"}${ext}`;
}

/**
 * Downloads a file to the user's browser.
 * For CAD/3D files (.obj, .stl, .stp, .step, .dxf) automatically forces 'application/octet-stream'
 * so Windows, macOS, Chrome, Safari and Android do NOT append '.txt' to the filename.
 */
export function downloadFile(
  filename: string,
  content: string | Blob,
  mimeType?: string
) {
  const cleanFilename = sanitizeDownloadFileName(filename);
  const lower = cleanFilename.toLowerCase();
  const isCadBinaryOrModel =
    lower.endsWith(".obj") ||
    lower.endsWith(".stl") ||
    lower.endsWith(".stp") ||
    lower.endsWith(".step") ||
    lower.endsWith(".dxf");

  let effectiveMime = mimeType;
  if (isCadBinaryOrModel) {
    // Strictly binary stream prevents ANY browser from appending '.txt'
    effectiveMime = "application/octet-stream";
  } else if (!effectiveMime) {
    if (lower.endsWith(".svg")) {
      effectiveMime = "image/svg+xml;charset=utf-8";
    } else if (lower.endsWith(".csv")) {
      effectiveMime = "text/csv;charset=utf-8";
    } else if (lower.endsWith(".zip")) {
      effectiveMime = "application/zip";
    } else {
      effectiveMime = "application/octet-stream";
    }
  }

  // Ensure Blob has the binary type
  const blob =
    content instanceof Blob
      ? (isCadBinaryOrModel && content.type !== "application/octet-stream"
          ? new Blob([content], { type: "application/octet-stream" })
          : content)
      : new Blob([content], { type: effectiveMime });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = cleanFilename;
  a.setAttribute("download", cleanFilename);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) {
      document.body.removeChild(a);
    }
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Generates 2D laser-cut SVG for a connector (star plate with tabs, bolt holes, bend lines).
 */
export function generateConnectorSVG(
  connector: ConnectorGeometry,
  model: DomeModel,
  options?: {
    countInDome?: number;
    typeName?: string;
    sampleNodeLabel?: string;
    nodeLabels?: string[];
  }
): string {
  const cut = generateConnectorCutPattern(connector, model.connectorParams);
  const minWidth = 720;
  const geomSpan = cut.outerRadius * 2;
  const width = Math.max(minWidth, Math.ceil(geomSpan + 160));
  const headerH = 115;
  const footerH = 35;
  const height = Math.ceil(headerH + geomSpan + footerH + 60);

  const centerX = width / 2;
  const centerY = headerH + 30 + cut.outerRadius;
  const count = options?.countInDome ?? 1;
  const sampleNode = model.nodes.find(n => n.id === connector.nodeId);
  const sampleLabel = options?.sampleNodeLabel || sampleNode?.label || `AA${connector.nodeId + 1}`;
  const nodeLabelsList = options?.nodeLabels || (sampleNode?.label ? [sampleNode.label] : [`AA${connector.nodeId + 1}`]);
  const titleName = options?.typeName || `КОНЕКТОР ТИПУ THUNDER DOMES #${connector.nodeId}`;

  const boltHolesSvg = cut.boltHoles
    .map(
      h =>
        `<circle cx="${(centerX + h.x).toFixed(2)}" cy="${(centerY + h.y).toFixed(2)}" r="${(h.diameter / 2).toFixed(2)}" fill="#FFFFFF" stroke="#DE7C5A" stroke-width="${Math.max(0.2, Math.min(1.6, (h.diameter || 2) * 0.15)).toFixed(2)}" />`
    )
    .join("\n    ");

  const bendLinesSvg = cut.bendLines
    .map(
      l =>
        `<line x1="${(centerX + l.x1).toFixed(2)}" y1="${(centerY + l.y1).toFixed(2)}" x2="${(centerX + l.x2).toFixed(2)}" y2="${(centerY + l.y2).toFixed(2)}" stroke="#5B82A6" stroke-width="${Math.max(0.2, Math.min(1.8, cut.outerRadius * 0.015)).toFixed(2)}" stroke-dasharray="5,3" />`
    )
    .join("\n    ");

  const labelFontSize = Math.max(3.5, Math.min(11, cut.outerRadius * 0.08 + 2)).toFixed(1);
  const labelsSvg = cut.rayLabels
    .map(
      lbl =>
        `<text x="${(centerX + lbl.x).toFixed(2)}" y="${(centerY + lbl.y).toFixed(2)}" font-family="sans-serif" font-size="${labelFontSize}" font-weight="700" fill="#1A2E3B" text-anchor="middle" dominant-baseline="middle">${lbl.text}</text>`
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
        `<line x1="${(centerX + ax.x1).toFixed(2)}" y1="${(centerY + ax.y1).toFixed(2)}" x2="${(centerX + ax.x2).toFixed(2)}" y2="${(centerY + ax.y2).toFixed(2)}" stroke="#2B6CB0" stroke-width="1.3" stroke-dasharray="6,3.5" opacity="0.9" />`
    )
    .join("\n    ");

  // Angular dimension arcs and degree labels between adjacent rays
  const angleDimensionsSvg = cut.interRayAngles
    .map(ang => {
      return `
    <!-- Dimension arc between ray #${ang.fromRayIndex} and #${ang.toRayIndex} -->
    <path d="${ang.arcPath}" transform="translate(${centerX}, ${centerY})" fill="none" stroke="#E53E3E" stroke-width="1.4" stroke-dasharray="3,2" />
    <g transform="translate(${(centerX + ang.textX).toFixed(2)}, ${(centerY + ang.textY).toFixed(2)})">
      <rect x="-19" y="-9" width="38" height="18" rx="4" fill="#FFFFFF" stroke="#CBD5E0" stroke-width="1" filter="drop-shadow(0px 1px 2px rgba(0,0,0,0.08))" />
      <text x="0" y="0" font-family="monospace, sans-serif" font-size="10" font-weight="700" fill="#C53030" text-anchor="middle" dominant-baseline="central">${ang.deltaAngleDeg}°</text>
    </g>`;
    })
    .join("\n    ");

  // Material and weight metrics for technical SVG drawing
  const matKey = (model.connectorParams.material as ConnectorMaterialId) || "steel_st3";
  const matInfo = CONNECTOR_MATERIALS[matKey] || CONNECTOR_MATERIALS.steel_st3;
  const coatKey = (model.connectorParams.coating as ConnectorCoatingId) || matInfo.defaultCoating;
  const coatInfo = CONNECTOR_COATINGS[coatKey] || CONNECTOR_COATINGS[matInfo.defaultCoating];
  const unitWeightKg = calculateConnectorPieceWeight(
    connector.beams.length,
    connector.isBoundary,
    model.connectorParams,
    model.beamProfile
  );
  const unitWeightText = unitWeightKg < 1 ? `${Math.round(unitWeightKg * 1000)} г` : `${unitWeightKg.toFixed(2)} кг`;
  const totalBatchWeightKg = Math.round(unitWeightKg * count * 10) / 10;
  const matThicknessText =
    model.connectorParams.rayType === "round_tube"
      ? `стінка ${model.connectorParams.wallThickness || 2.5} мм`
      : `товщина ${model.connectorParams.thickness} мм`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm">
  <style>
    .cut-line { fill: #FAF7F2; stroke: #1A2E3B; stroke-width: ${Math.max(0.3, Math.min(2.0, cut.outerRadius * 0.018)).toFixed(2)}; stroke-linejoin: round; stroke-linecap: round; }
    .center-mark { stroke: #E2E8F0; stroke-width: 0.8; stroke-dasharray: 6,4; }
  </style>
  <rect width="100%" height="100%" fill="#FFFFFF" />

  <!-- Background orthogonal reference lines -->
  <line x1="${centerX}" y1="20" x2="${centerX}" y2="${height - 20}" class="center-mark" />
  <line x1="20" y1="${centerY}" x2="${width - 20}" y2="${centerY}" class="center-mark" />

  <!-- Outer Star Contour (CNC Closed Cut Path) -->
  <g id="cnc-cut-layer" transform="translate(${centerX}, ${centerY})">
    <path id="outer-bracket-contour" d="${cut.contourPath}" class="cut-line" />
    ${centerCutoutSvg}
  </g>

  <!-- Engraved Node Marking directly on the Connector Body (CNC Laser Engraving / Marking Layer) -->
  <g id="node-marking-engrave" transform="translate(${centerX}, ${centerY})">
    <rect x="-26" y="-13" width="52" height="26" rx="6" fill="#FFFFFF" stroke="#2563EB" stroke-width="1.4" stroke-dasharray="3,2" />
    <text x="0" y="1" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="13" font-weight="900" fill="#1E293B" text-anchor="middle" dominant-baseline="central">${sampleLabel}</text>
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
  <g id="production-quantity-stamp" transform="translate(${width - 240}, 20)">
    <rect width="215" height="62" rx="10" fill="#F0FFF4" stroke="#2E7D32" stroke-width="2.2" filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.06))" />
    <text x="14" y="20" font-family="sans-serif" font-size="10" font-weight="bold" fill="#1B4D2E" letter-spacing="0.5">ТИРАЖ НА КУПОЛ (${sampleLabel}):</text>
    <text x="14" y="40" font-family="sans-serif" font-size="17" font-weight="900" fill="#2E7D32">${count} ШТ. (${totalBatchWeightKg} КГ)</text>
    <text x="14" y="54" font-family="sans-serif" font-size="9" fill="#2E7D32">Маса 1 шт: ${unitWeightText}</text>
  </g>

  <!-- Technical Header -->
  <text x="25" y="28" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1A2E3B">${titleName.toUpperCase()} · МАРКУВАННЯ: ${sampleLabel}</text>
  <g transform="translate(25, 38)">
    <rect x="0" y="0" width="${Math.min(width - 280, 450)}" height="28" rx="6" fill="#EFF6FF" stroke="#3B82F6" stroke-width="1.2" />
    <text x="12" y="18" font-family="'JetBrains Mono', monospace" font-size="11" font-weight="bold" fill="#1E40AF">ВУЗЛИ КУПОЛА (${nodeLabelsList.length} ШТ): ${nodeLabelsList.length <= 11 ? nodeLabelsList.join(", ") : nodeLabelsList.slice(0, 10).join(", ") + "..."}</text>
  </g>
  <text x="25" y="82" font-family="sans-serif" font-size="9.5" fill="#334155">Матеріал: ${matInfo.name} (${matThicknessText}) | Покриття: ${coatInfo.name} (${coatInfo.standard})</text>
  <text x="25" y="98" font-family="sans-serif" font-size="9" fill="#64748B">Болти: M${model.connectorParams.boltDiameter} (${model.connectorParams.boltHoleCount || 2} шт/луч) | Сердцевина: Ø${model.connectorParams.hubDiameter} мм | Луч: ${model.connectorParams.tabLength}×${model.connectorParams.tabWidth} мм | Маса: ${unitWeightText}/шт</text>
  <text x="25" y="${height - 15}" font-family="sans-serif" font-size="10" fill="#8C9BAE">Масштаб 1:1 · Замкнутий контур для ЧПК розкрою (КуполГео CAD)</text>
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
    sheetTitle?: string;
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
      const cX = p.polygon.reduce((sum, pt) => sum + pt[0], 0) / p.polygon.length;
      const cY = p.polygon.reduce((sum, pt) => sum + pt[1], 0) / p.polygon.length;

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
      <polygon points="${pointsStr}" fill="${
        layout.isSolarGlazing ? '#101726' : (layout.isWindowGlazing ? '#E0F2FE' : (layout.isInnerSheathing ? '#FAFBFD' : '#F4EFEB'))
      }" stroke="${
        layout.isSolarGlazing ? '#F59E0B' : (layout.isWindowGlazing ? '#0284C7' : (layout.isInnerSheathing ? '#475569' : '#2D3748'))
      }" stroke-width="2" stroke-linejoin="round" />

      <!-- Centerline Toolpath -->
      ${
        showToolpath
          ? `<polygon points="${pointsStr}" fill="none" stroke="${
              layout.isSolarGlazing ? '#FBBF24' : (layout.isWindowGlazing ? '#0369A1' : (layout.isInnerSheathing ? '#64748B' : '#2B6CB0'))
            }" stroke-width="1.2" stroke-dasharray="6,4" opacity="0.8" />`
          : ""
      }

      <!-- Plunge / Lead-in Point -->
      <circle cx="${plungePt[0]}" cy="${plungePt[1]}" r="3.5" fill="#38A169" stroke="#FFFFFF" stroke-width="1" />

      <!-- Holding Tabs -->
      ${tabsSvg}

      <!-- Part Label & Type Tag -->
      <circle cx="${cX.toFixed(1)}" cy="${(cY - 12).toFixed(1)}" r="14" fill="#FFFFFF" stroke="${
        layout.isSolarGlazing ? '#F59E0B' : (layout.isWindowGlazing ? '#0284C7' : (layout.isInnerSheathing ? '#475569' : '#2D3748'))
      }" stroke-width="1.5" />
      <text x="${cX.toFixed(1)}" y="${(cY - 7).toFixed(1)}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1A2E3B" text-anchor="middle">${p.panelType}</text>
      <text x="${cX.toFixed(1)}" y="${(cY + 12).toFixed(1)}" font-family="sans-serif" font-size="11" font-weight="bold" fill="${
        layout.isSolarGlazing ? '#D97706' : (layout.isWindowGlazing ? '#0369A1' : (layout.isInnerSheathing ? '#475569' : '#718096'))
      }" text-anchor="middle">${layout.isSolarGlazing ? '⚡ #' : (layout.isWindowGlazing ? '🪟 #' : (layout.isInnerSheathing ? '🏠 #' : '#'))}${p.panelId}</text>
    </g>`;
    })
    .join("\n");

  const maxPtY = Math.max(
    h,
    ...sheetPanels.flatMap(p => p.polygon.map(pt => pt[1]))
  );
  const maxPtX = Math.max(
    w,
    ...sheetPanels.flatMap(p => p.polygon.map(pt => pt[0]))
  );
  const totalSvgW = Math.max(w + 140, maxPtX + 100);
  const totalSvgH = Math.max(h + 160, maxPtY + 120);
  const isSheetExceeded = maxPtY > h || maxPtX > w;

  const defaultTitle = layout.isSolarGlazing
    ? `ЧПУ КАРТА РОЗКРОЮ: СОНЯЧНІ BIPV ПАНЕЛІ — ЛИСТ ${sheetIdx + 1} З ${layout.totalSheetsRequired} (ФОРМАТ ${w} × ${h} мм)`
    : layout.isWindowGlazing
    ? `ЧПУ КАРТА РОЗКРОЮ: ПЛАСТИК / СКЛО (ВІКНА) — ЛИСТ ${sheetIdx + 1} З ${layout.totalSheetsRequired} (ФОРМАТ ${w} × ${h} мм)`
    : layout.isInnerSheathing
    ? `ЧПУ КАРТА РОЗКРОЮ: ВНУТРІШНЯ ОБШИВКА (${layout.materialName || 'Гіпсокартон/ДСП'}) — ЛИСТ ${sheetIdx + 1} З ${layout.totalSheetsRequired} (${w} × ${h} мм)`
    : `ЧПУ КАРТА РОЗКРОЮ ФАНЕРИ — ЛИСТ ${sheetIdx + 1} З ${layout.totalSheetsRequired} (ФОРМАТ ${w} × ${h} мм)`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSvgW} ${totalSvgH}" width="100%" height="100%">
  <rect width="100%" height="100%" fill="#FBF9F5" />
  
  <!-- CNC Header Information -->
  <g transform="translate(60, 42)">
    <text x="0" y="0" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1A2E3B">
      ${options?.sheetTitle || defaultTitle}
    </text>
    <text x="0" y="22" font-family="sans-serif" font-size="12" fill="#5A6778">
      ${layout.materialName ? `Матеріал: ${layout.materialName} · ` : ''}Фреза: Ø${toolDiam} мм · Відступ краю: ${margin} мм · Панелей на листі: ${sheetPanels.length} шт · Довжина різу: ${sheetCutLengthM} пог. м · Відходи: ~${layout.wastePercentage}%
    </text>
    ${
      isSheetExceeded
        ? `<text x="0" y="40" font-family="sans-serif" font-size="12" font-weight="bold" fill="#C53030">
             ⚠️ УВАГА: Висота деталі (${maxPtY} мм) перевищує висоту листа (${h} мм). Рекомендовано обрати лист 3050 × 1525 мм!
           </text>`
        : ""
    }
  </g>

  <!-- Sheet Work Area -->
  <g transform="translate(60, ${isSheetExceeded ? 105 : 90})">
    <!-- Sheet Outer Raw Edge -->
    <rect x="0" y="0" width="${w}" height="${h}" fill="#FFFFFF" stroke="${isSheetExceeded ? '#E53E3E' : '#718096'}" stroke-width="${isSheetExceeded ? 3 : 2}" stroke-dasharray="${isSheetExceeded ? '8,4' : 'none'}" rx="4" />

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
      // Invert Y for CAD/CAM coordinate system (origin at bottom-left, +Y pointing UP)
      const cadY = Math.round(h - pt[1]);
      lines.push(
        "0", "VERTEX",
        "8", "PARTS_CUT",
        "10", `${pt[0]}.0`,
        "20", `${cadY}.0`,
        "30", "0.0"
      );
    }
    lines.push("0", "SEQEND");

    // Text tag inside triangle on layer "PARTS_LABELS"
    const cX = p.polygon.reduce((sum, pt) => sum + pt[0], 0) / p.polygon.length;
    const cY = p.polygon.reduce((sum, pt) => sum + pt[1], 0) / p.polygon.length;
    const cadCY = Math.round(h - cY);
    lines.push(
      "0", "TEXT",
      "8", "PARTS_LABELS",
      "10", `${Math.round(cX)}.0`,
      "20", `${cadCY}.0`,
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
      <text x="960" y="24" font-family="sans-serif" font-size="13" font-weight="bold" fill="#2D3748">Переріз: ${model.beamProfile.type === "circular" || model.beamProfile.type === "pipe" ? `Ø ${model.beamProfile.diameter || model.beamProfile.width} мм` : `${model.beamProfile.width} × ${model.beamProfile.depth} мм`}</text>
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
  const isRound = model.beamProfile.type === "circular" || model.beamProfile.type === "pipe";
  const dVal = model.beamProfile.diameter || model.beamProfile.width;
  const crossAreaM2 = isRound
    ? (Math.PI / 4) * Math.pow(dVal / 1000, 2)
    : (model.beamProfile.width / 1000) * (model.beamProfile.depth / 1000);
  const volM3 = Math.round(linearM * crossAreaM2 * 100) / 100;
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
      Геодезичний купол ${model.parameters.frequency}V · Діаметр ${(model.parameters.diameter / 1000).toFixed(1)} м · Кількість у куполі: ${group.count} шт · Переріз: ${isRound ? `Ø ${dVal} мм` : `${model.beamProfile.width}×${model.beamProfile.depth} мм`}
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
      ${isRound ? `
        <circle cx="30" cy="38" r="32" fill="#FAF3EC" stroke="#2D3748" stroke-width="1.8" />
        <text x="30" y="42" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2D3748" text-anchor="middle">
          Ø ${dVal}
        </text>
      ` : `
        <rect x="0" y="0" width="60" height="75" rx="3" fill="#FAF3EC" stroke="#2D3748" stroke-width="1.8" />
        <text x="30" y="38" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2D3748" text-anchor="middle">
          ${model.beamProfile.width}×${model.beamProfile.depth}
        </text>
      `}
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

  const svgW = 1000;
  const svgH = 750;

  // Dedicated rectangular blueprint for plinth panel (цоколь у формі прямокутника)
  if (group.type === "PL" || faceTypeName === "PL") {
    const bayW = group.lengths[0];
    const bayH = group.lengths[1] || (model.statistics?.plinthHeightMm || model.parameters.plinth?.height || 800);
    const diag = Math.round(Math.hypot(bayW, bayH));
    const perimeterMm = 2 * (bayW + bayH);
    const totalAreaM2 = Math.round(group.area * group.count * 100) / 100;

    const drawAreaW = 540;
    const drawAreaH = 260;
    const scale = Math.min(drawAreaW / Math.max(1, bayW), drawAreaH / Math.max(1, bayH));
    const drawnW = bayW * scale;
    const drawnH = bayH * scale;

    const originX = 500 - drawnW / 2;
    const originY = 400 - drawnH;

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
    <text x="80" y="8" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1A2E3B" text-anchor="middle">ЦОКОЛЬ ТИП ${group.type}</text>

    <text x="180" y="-2" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1A2E3B">ТЕХНІЧНЕ КРЕСЛЕННЯ ПАНЕЛІ ЦОКОЛЯ (ПРЯМОКУТНИК)</text>
    <text x="180" y="20" font-family="sans-serif" font-size="12" fill="#5A6778">
      Геодезичний купол ${model.parameters.frequency}V · Діаметр ${(model.parameters.diameter / 1000).toFixed(1)} м · Кількість прямокутників: ${group.count} шт · Площа однієї панелі: ${group.area} м²
    </text>
  </g>

  <line x1="40" y1="100" x2="${svgW - 40}" y2="100" stroke="#CBD5E0" stroke-width="1.5" />

  <!-- Subtitle -->
  <text x="45" y="130" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2D3748">
    ГЕОМЕТРИЧНИЙ РОЗКРІЙ ПРЯМОКУТНОЇ ПАНЕЛІ СТІНОВОГО ПОЯСУ ЦОКОЛЯ (РОЗМІРИ, КУТИ 90° ТА ДІАГОНАЛЬ)
  </text>

  <!-- ================= MAIN RECTANGLE DRAWING ================= -->
  <!-- Rectangle Fill & Contour -->
  <rect x="${originX}" y="${originY}" width="${drawnW}" height="${drawnH}" 
        fill="#FAF2DE" opacity="0.85" stroke="#2D3748" stroke-width="2.5" />

  <!-- Diagonal Frame Reinforcement Beam Indicator -->
  <line x1="${originX}" y1="${originY + drawnH}" x2="${originX + drawnW}" y2="${originY}" 
        stroke="#2563EB" stroke-width="2" stroke-dasharray="6,4" />
  <text x="${originX + drawnW / 2 + 10}" y="${originY + drawnH / 2 - 10}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#1D4ED8" transform="rotate(${-Math.atan2(drawnH, drawnW) * 180 / Math.PI}, ${originX + drawnW / 2}, ${originY + drawnH / 2})">
    Діагональний брус підсилення каркаса (D = ${diag} мм)
  </text>

  <!-- Centroid Marker -->
  <circle cx="${originX + drawnW / 2}" cy="${originY + drawnH / 2}" r="4" fill="#5B9279" />
  <text x="${originX + drawnW / 2}" y="${originY + drawnH / 2 + 20}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1A3E26" text-anchor="middle">
    ${group.type} (${bayW} × ${bayH} мм)
  </text>

  <!-- Corner Vertices & 90° Right Angle Markers -->
  <circle cx="${originX}" cy="${originY + drawnH}" r="4" fill="#2D3748" />
  <text x="${originX - 14}" y="${originY + drawnH + 16}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1A2E3B">A</text>

  <circle cx="${originX + drawnW}" cy="${originY + drawnH}" r="4" fill="#2D3748" />
  <text x="${originX + drawnW + 14}" y="${originY + drawnH + 16}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1A2E3B">B</text>

  <circle cx="${originX + drawnW}" cy="${originY}" r="4" fill="#2D3748" />
  <text x="${originX + drawnW + 14}" y="${originY - 10}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1A2E3B">C</text>

  <circle cx="${originX}" cy="${originY}" r="4" fill="#2D3748" />
  <text x="${originX - 14}" y="${originY - 10}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1A2E3B">D</text>

  <!-- Corner Angles 90° Callouts -->
  <text x="${originX + 22}" y="${originY + drawnH - 12}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#C05621">90°</text>
  <text x="${originX + drawnW - 42}" y="${originY + drawnH - 12}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#C05621">90°</text>
  <text x="${originX + drawnW - 42}" y="${originY + 22}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#C05621">90°</text>
  <text x="${originX + 22}" y="${originY + 22}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#C05621">90°</text>

  <!-- Edge Dimensions: Width -->
  <line x1="${originX}" y1="${originY + drawnH + 25}" x2="${originX + drawnW}" y2="${originY + drawnH + 25}" stroke="#2B6CB0" stroke-width="2" />
  <line x1="${originX}" y1="${originY + drawnH + 15}" x2="${originX}" y2="${originY + drawnH + 35}" stroke="#2B6CB0" stroke-width="2" />
  <line x1="${originX + drawnW}" y1="${originY + drawnH + 15}" x2="${originX + drawnW}" y2="${originY + drawnH + 35}" stroke="#2B6CB0" stroke-width="2" />
  <text x="${originX + drawnW / 2}" y="${originY + drawnH + 45}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2B6CB0" text-anchor="middle">
    Ширина секції: W = ${bayW} мм
  </text>

  <!-- Edge Dimensions: Height -->
  <line x1="${originX - 25}" y1="${originY}" x2="${originX - 25}" y2="${originY + drawnH}" stroke="#2B6CB0" stroke-width="2" />
  <line x1="${originX - 35}" y1="${originY}" x2="${originX - 15}" y2="${originY}" stroke="#2B6CB0" stroke-width="2" />
  <line x1="${originX - 35}" y1="${originY + drawnH}" x2="${originX - 15}" y2="${originY + drawnH}" stroke="#2B6CB0" stroke-width="2" />
  <text x="${originX - 35}" y="${originY + drawnH / 2 + 5}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2B6CB0" text-anchor="end">
    Висота: H = ${bayH} мм
  </text>

  <!-- Technical Table -->
  <g transform="translate(45, 520)">
    <rect x="0" y="0" width="${svgW - 90}" height="175" rx="8" fill="#FFFFFF" stroke="#CBD5E0" stroke-width="1.5" />
    <rect x="0" y="0" width="${svgW - 90}" height="28" rx="8" fill="#EDF2F7" />

    <text x="15" y="19" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2D3748">ПАРАМЕТР ПАНЕЛІ ЦОКОЛЯ</text>
    <text x="300" y="19" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2D3748">ТОЧНЕ ЗНАЧЕННЯ</text>
    <text x="560" y="19" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2D3748">ТЕХНІЧНІ ВИМОГИ ТА ВКАЗІВКИ ДЛЯ РОЗКРОЮ / ЧПК</text>

    <!-- Row 1: Dimensions -->
    <line x1="0" y1="28" x2="${svgW - 90}" y2="28" stroke="#E2E8F0" />
    <text x="15" y="47" font-family="sans-serif" font-size="11" fill="#4A5568">Форма та розміри (Ширина × Висота)</text>
    <text x="300" y="47" font-family="sans-serif" font-size="12" font-weight="bold" fill="#2B6CB0">${bayW} × ${bayH} мм (Прямокутник)</text>
    <text x="560" y="47" font-family="sans-serif" font-size="11" fill="#718096">Суцільний прямокутник без діагонального різу. Допуск ±1.0 мм</text>

    <!-- Row 2: Angles & Diagonal -->
    <line x1="0" y1="58" x2="${svgW - 90}" y2="58" stroke="#E2E8F0" />
    <text x="15" y="77" font-family="sans-serif" font-size="11" fill="#4A5568">Кути та діагональ секції</text>
    <text x="300" y="77" font-family="sans-serif" font-size="12" font-weight="bold" fill="#C05621">4 × 90.0° (Діагональ: ${diag} мм)</text>
    <text x="560" y="77" font-family="sans-serif" font-size="11" fill="#718096">Каркас підсилений внутрішнім діагональним брусом ${diag} мм</text>

    <!-- Row 3: Perimeter & Area -->
    <line x1="0" y1="88" x2="${svgW - 90}" y2="88" stroke="#E2E8F0" />
    <text x="15" y="107" font-family="sans-serif" font-size="11" fill="#4A5568">Периметр та площа однієї панелі</text>
    <text x="300" y="107" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1A2E3B">P = ${perimeterMm} мм · S = ${group.area} м²</text>
    <text x="560" y="107" font-family="sans-serif" font-size="11" fill="#718096">Розрахункова площа обшивки однієї стінової секції цоколя</text>

    <!-- Row 4: Quantity -->
    <line x1="0" y1="118" x2="${svgW - 90}" y2="118" stroke="#E2E8F0" />
    <text x="15" y="137" font-family="sans-serif" font-size="11" fill="#4A5568">Загальний тираж у проекті</text>
    <text x="300" y="137" font-family="sans-serif" font-size="12" font-weight="bold" fill="#2E7D32">${group.count} шт (Сумарна площа: ${totalAreaM2} м²)</text>
    <text x="560" y="137" font-family="sans-serif" font-size="11" fill="#718096">Повний стіновий пояс по периметру купола</text>
  </g>
</svg>`;
  }

  const [L1, L2, L3] = group.lengths; // L1=base AB, L2=side BC, L3=side CA
  const [angA, angB, angC] = group.angles;
  const [edge1, edge2, edge3] = group.edges;
  const bevels = group.dihedralBevels;

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

      const isPlinth = g.type === "PL";

      if (isPlinth) {
        const bayW = g.lengths[0];
        const bayH = g.lengths[1] || (model.statistics?.plinthHeightMm || model.parameters.plinth?.height || 800);
        const diag = Math.round(Math.hypot(bayW, bayH));
        const scale = Math.min(280 / Math.max(1, bayW), 160 / Math.max(1, bayH));
        const drawnW = bayW * scale;
        const drawnH = bayH * scale;
        const originX = posX + (cardW - drawnW) / 2;
        const originY = posY + 230 - drawnH / 2;

        return `
    <g>
      <!-- Card Box -->
      <rect x="${posX}" y="${posY}" width="${cardW}" height="${cardH}" rx="12" fill="#FFFFFF" stroke="#CBD5E0" stroke-width="1.5" />
      <rect x="${posX}" y="${posY}" width="${cardW}" height="42" rx="12" fill="#FAF7F2" />
      <line x1="${posX}" y1="${posY + 42}" x2="${posX + cardW}" y2="${posY + 42}" stroke="#E2E8F0" />

      <!-- Card Title -->
      <rect x="${posX + 15}" y="${posY + 8}" width="26" height="26" rx="6" fill="${g.color}" />
      <text x="${posX + 50}" y="${posY + 26}" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1A2E3B">ЦОКОЛЬ ТИП ${g.type} (ПРЯМОКУТНИК)</text>
      <text x="${posX + cardW - 20}" y="${posY + 26}" font-family="sans-serif" font-size="14" font-weight="bold" fill="#2E7D32" text-anchor="end">${g.count} шт · ${g.area} м²</text>

      <!-- Rectangle Shape -->
      <rect x="${originX}" y="${originY}" width="${drawnW}" height="${drawnH}" fill="#FAF2DE" stroke="#2D3748" stroke-width="2.2" />

      <!-- Diagonal Frame Strut Indicator -->
      <line x1="${originX}" y1="${originY + drawnH}" x2="${originX + drawnW}" y2="${originY}" stroke="#2563EB" stroke-width="1.8" stroke-dasharray="4,3" />

      <!-- Dimensions -->
      <text x="${originX + drawnW / 2}" y="${originY + drawnH + 18}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#2B6CB0" text-anchor="middle">Ширина: W = ${bayW} мм</text>
      <text x="${originX - 10}" y="${originY + drawnH / 2 + 4}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2B6CB0" text-anchor="end">H = ${bayH} мм</text>
      <text x="${originX + drawnW / 2}" y="${originY - 8}" font-family="sans-serif" font-size="10" font-weight="bold" fill="#C05621" text-anchor="middle">Кути 4 × 90° · Діагональ підсилення D = ${diag} мм</text>

      <!-- Bottom Card Specs -->
      <g transform="translate(${posX + 20}, ${posY + 320})">
        <rect x="0" y="0" width="${cardW - 40}" height="90" rx="8" fill="#F8FAFC" stroke="#E2E8F0" />
        <text x="12" y="24" font-family="sans-serif" font-size="11" fill="#4A5568">Форма: <tspan font-weight="bold" fill="#1A2E3B">Суцільний прямокутник без діагонального розрізу</tspan></text>
        <text x="12" y="44" font-family="sans-serif" font-size="11" fill="#4A5568">Периметр деталі: <tspan font-weight="bold" fill="#1A2E3B">${2 * (bayW + bayH)} мм</tspan></text>
        <text x="12" y="64" font-family="sans-serif" font-size="11" fill="#4A5568">Сумарна площа тиражу: <tspan font-weight="bold" fill="#1B4D2E">${(g.area * g.count).toFixed(2)} м²</tspan></text>
      </g>
    </g>`;
      }

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

/**
 * Generates an engineering vector SVG diagram for Fabric Roll Sheathing Nesting / Patterns (Тент / Мембрана з рулону).
 * Visualizes continuous fabric strips spanning from foundation edge to opposite foundation edge across the dome,
 * with selectable roll width (500-2000 mm), thread sewing seam allowances (зазор на прошив ниткою),
 * foundation hem allowances, apex centerline, and workshop dimension callouts.
 * 
 * If activeStripIndex >= 0: displays detailed technical blueprint of that specific strip.
 * If activeStripIndex === -1: displays the full roll nesting overview with all strips laid out on the continuous roll.
 */
export function generateFabricRollNestingSVG(
  layout: FabricRollNestingLayout,
  activeStripIndex = 0,
  options: {
    showSeamLines?: boolean;
    showHems?: boolean;
    showCenterline?: boolean;
    showTriangles?: boolean;
    showNodes?: boolean;
    showDimensions?: boolean;
    showNodeLabels?: boolean;
    highlightedTriangleId?: number | null;
    highlightedNodeId?: number | null;
  } = {}
): string {
  const showSeamLines = options.showSeamLines !== false;
  const showHems = options.showHems !== false;
  const showCenterline = options.showCenterline !== false;
  const showTriangles = options.showTriangles !== false;
  const showNodes = options.showNodes !== false;
  const showDimensions = options.showDimensions !== false;
  const showNodeLabels = options.showNodeLabels !== false;
  const highlightedTriangleId = options.highlightedTriangleId ?? null;
  const highlightedNodeId = options.highlightedNodeId ?? null;

  const strips = layout.strips || [];
  if (strips.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300" width="100%" height="100%"><rect width="100%" height="100%" fill="#FBF9F5"/><text x="400" y="150" font-family="sans-serif" font-size="16" fill="#718096" text-anchor="middle">Немає смуг для відображення</text></svg>`;
  }

  // MODE A: Full Continuous Roll Overview (all strips sequenced along the roll)
  if (activeStripIndex < 0 || activeStripIndex >= strips.length) {
    const svgW = 1600;
    const headerH = 150;
    const footerH = 100;
    const rollTopY = headerH + 60;
    const rollDisplayH = 260; // display height representing the roll width
    const marginX = 80;
    const usableW = svgW - 2 * marginX;

    // Total length in mm
    const totalRollMm = Math.max(1000, strips.reduce((s, p) => s + p.cutLengthMm, 0));
    const pxPerMm = usableW / totalRollMm;

    let currentX = marginX;
    const stripsSvg = strips.map((s, idx) => {
      const stripW = s.cutLengthMm * pxPerMm;
      const x0 = currentX;
      currentX += stripW;

      const hemW = (s.hemAllowanceMm || 150) * pxPerMm;
      const seamH = Math.max(4, ((s.seamAllowanceMm || 25) / s.widthMm) * rollDisplayH);
      const isEven = idx % 2 === 0;
      const bodyColor = isEven ? "#EFF6FF" : "#F8FAFC";

      // Mini triangles on the strip in overview mode
      const miniTriangles = (showTriangles && s.triangles && s.triangles.length > 0)
        ? s.triangles.map(tri => {
            const tAx = x0 + tri.points2D[0].x * pxPerMm;
            const tAy = rollTopY + (tri.points2D[0].y / s.widthMm) * rollDisplayH;
            const tBx = x0 + tri.points2D[1].x * pxPerMm;
            const tBy = rollTopY + (tri.points2D[1].y / s.widthMm) * rollDisplayH;
            const tCx = x0 + tri.points2D[2].x * pxPerMm;
            const tCy = rollTopY + (tri.points2D[2].y / s.widthMm) * rollDisplayH;
            return `<polygon points="${tAx.toFixed(1)},${tAy.toFixed(1)} ${tBx.toFixed(1)},${tBy.toFixed(1)} ${tCx.toFixed(1)},${tCy.toFixed(1)}" fill="${tri.color}" fill-opacity="0.25" stroke="#475569" stroke-width="0.7" />`;
          }).join('\n')
        : '';

      return `
      <g>
        <!-- Strip Rectangle -->
        <rect x="${x0}" y="${rollTopY}" width="${stripW}" height="${rollDisplayH}" fill="${bodyColor}" stroke="#1E293B" stroke-width="1.6" />
        
        <!-- Left Foundation Hem Zone -->
        ${showHems ? `<rect x="${x0}" y="${rollTopY}" width="${hemW}" height="${rollDisplayH}" fill="#FEF3C7" opacity="0.8" />
        <line x1="${x0 + hemW}" y1="${rollTopY}" x2="${x0 + hemW}" y2="${rollTopY + rollDisplayH}" stroke="#D97706" stroke-width="1.2" stroke-dasharray="4,3" />` : ''}

        <!-- Right Foundation Hem Zone -->
        ${showHems ? `<rect x="${x0 + stripW - hemW}" y="${rollTopY}" width="${hemW}" height="${rollDisplayH}" fill="#FEF3C7" opacity="0.8" />
        <line x1="${x0 + stripW - hemW}" y1="${rollTopY}" x2="${x0 + stripW - hemW}" y2="${rollTopY + rollDisplayH}" stroke="#D97706" stroke-width="1.2" stroke-dasharray="4,3" />` : ''}

        <!-- Printed Geodesic Triangles -->
        ${miniTriangles}

        <!-- Thread Sewing Seam Lines (Top & Bottom) -->
        ${showSeamLines ? `
        <line x1="${x0}" y1="${rollTopY + seamH}" x2="${x0 + stripW}" y2="${rollTopY + seamH}" stroke="#DC2626" stroke-width="1.4" stroke-dasharray="5,4" />
        <line x1="${x0}" y1="${rollTopY + rollDisplayH - seamH}" x2="${x0 + stripW}" y2="${rollTopY + rollDisplayH - seamH}" stroke="#DC2626" stroke-width="1.4" stroke-dasharray="5,4" />
        ` : ''}

        <!-- Centerline Apex Marker -->
        ${showCenterline ? `
        <line x1="${x0 + stripW / 2}" y1="${rollTopY}" x2="${x0 + stripW / 2}" y2="${rollTopY + rollDisplayH}" stroke="#EA580C" stroke-width="1" stroke-dasharray="3,3" />
        <circle cx="${x0 + stripW / 2}" cy="${rollTopY + rollDisplayH / 2}" r="3" fill="#EA580C" />
        ` : ''}

        <!-- Cut Line between Strips -->
        <line x1="${x0 + stripW}" y1="${rollTopY - 15}" x2="${x0 + stripW}" y2="${rollTopY + rollDisplayH + 15}" stroke="#DC2626" stroke-width="2" />
        <text x="${x0 + stripW}" y="${rollTopY - 20}" font-family="sans-serif" font-size="10" font-weight="bold" fill="#DC2626" text-anchor="middle">✂ РІЗ #${idx + 1}</text>

        <!-- Strip Label inside -->
        <text x="${x0 + stripW / 2}" y="${rollTopY + 30}" font-family="sans-serif" font-size="${stripW > 80 ? '13' : '10'}" font-weight="bold" fill="#1E293B" text-anchor="middle">
          Полоса #${s.id}
        </text>
        <text x="${x0 + stripW / 2}" y="${rollTopY + 48}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#2563EB" text-anchor="middle">
          L = ${(s.cutLengthMm / 1000).toFixed(2)} м
        </text>
        ${stripW > 90 ? `
        <text x="${x0 + stripW / 2}" y="${rollTopY + 65}" font-family="sans-serif" font-size="9" fill="#64748B" text-anchor="middle">
          (дуга ${(s.domeArcLengthMm / 1000).toFixed(2)} м)
        </text>
        <text x="${x0 + stripW / 2}" y="${rollTopY + rollDisplayH - 25}" font-family="sans-serif" font-size="10" font-weight="bold" fill="#059669" text-anchor="middle">
          ${s.cutAreaM2} м² · ${s.triangles?.length || 0} трик.
        </text>
        ` : ''}
      </g>`;
    }).join('\n');

    const totalSvgH = rollTopY + rollDisplayH + 180;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${totalSvgH}" width="100%" height="100%">
  <rect width="100%" height="100%" fill="#FBF9F5" />

  <!-- Technical Header -->
  <g transform="translate(${marginX}, 40)">
    <text x="0" y="22" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1A2E3B">КАРТА РОЗКРОЮ ТЕНТУ / ТКАНИНИ З РУЛОНУ — ВСІ ПОЛОСИ</text>
    <text x="0" y="46" font-family="sans-serif" font-size="12" fill="#5A6778">
      Ширина рулону: ${layout.rollWidthMm} мм | Зазор на прошив ниткою: ${layout.seamAllowanceMm} мм | Припуск фундаменту: ${layout.hemAllowanceMm} мм | Полос: ${layout.totalStrips} шт
    </text>
    <text x="0" y="68" font-family="sans-serif" font-size="12" font-weight="bold" fill="#2E7D32">
      Загальний метраж рулону: ${layout.totalLinearMeters} пог. м | Площа полотна: ${layout.totalFabricAreaM2} м² | Довжина нитяних швів: ${layout.totalSewingSeamMeters} м | Вага: ~${layout.totalFabricWeightKg} кг
    </text>
  </g>

  <!-- Roll Dimension Guides -->
  <!-- Roll Width bracket on left -->
  <g transform="translate(${marginX - 35}, ${rollTopY})">
    <line x1="0" y1="0" x2="0" y2="${rollDisplayH}" stroke="#2B6CB0" stroke-width="1.8" />
    <line x1="-6" y1="0" x2="6" y2="0" stroke="#2B6CB0" stroke-width="1.8" />
    <line x1="-6" y1="${rollDisplayH}" x2="6" y2="${rollDisplayH}" stroke="#2B6CB0" stroke-width="1.8" />
    <text x="-12" y="${rollDisplayH / 2}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#2B6CB0" text-anchor="middle" transform="rotate(-90, -12, ${rollDisplayH / 2})">
      ШИРИНА РУЛОНУ ${layout.rollWidthMm} мм
    </text>
  </g>

  <!-- Strips along roll -->
  ${stripsSvg}

  <!-- Total Length dimension line below -->
  <g transform="translate(${marginX}, ${rollTopY + rollDisplayH + 35})">
    <line x1="0" y1="0" x2="${usableW}" y2="0" stroke="#1E293B" stroke-width="1.8" />
    <line x1="0" y1="-8" x2="0" y2="8" stroke="#1E293B" stroke-width="1.8" />
    <line x1="${usableW}" y1="-8" x2="${usableW}" y2="8" stroke="#1E293B" stroke-width="1.8" />
    <text x="${usableW / 2}" y="22" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1A2E3B" text-anchor="middle">
      ЗАГАЛЬНА ДОВЖИНА ПОЛОТНА В РУЛОНІ: ${layout.totalLinearMeters} МЕТРІВ (${Math.round(totalRollMm)} мм)
    </text>
  </g>

  <!-- Legend & Specification Box -->
  <g transform="translate(${marginX}, ${rollTopY + rollDisplayH + 75})">
    <rect x="0" y="0" width="${usableW}" height="55" rx="10" fill="#FFFFFF" stroke="#CBD5E0" />
    
    <!-- Legend items -->
    <g transform="translate(15, 20)">
      <!-- Cut border -->
      <line x1="0" y1="8" x2="25" y2="8" stroke="#1E293B" stroke-width="2" />
      <text x="32" y="12" font-family="sans-serif" font-size="11" fill="#1E293B">Лінія відрізу смуги</text>

      <!-- Seam allowance -->
      <line x1="170" y1="8" x2="200" y2="8" stroke="#DC2626" stroke-width="1.5" stroke-dasharray="5,4" />
      <text x="208" y="12" font-family="sans-serif" font-size="11" font-weight="bold" fill="#DC2626">Зазор на прошив ниткою (${layout.seamAllowanceMm} мм)</text>

      <!-- Hem allowance -->
      <rect x="470" y="1" width="16" height="14" fill="#FEF3C7" stroke="#D97706" />
      <text x="495" y="12" font-family="sans-serif" font-size="11" fill="#92400E">Припуск фундаменту (${layout.hemAllowanceMm} мм)</text>

      <!-- Triangles -->
      <polygon points="760,15 770,2 780,15" fill="#4A90E2" fill-opacity="0.4" stroke="#1E293B" stroke-width="1" />
      <text x="788" y="12" font-family="sans-serif" font-size="11" fill="#1E293B">Трикутники каркасу</text>

      <!-- Centerline -->
      <line x1="940" y1="8" x2="970" y2="8" stroke="#EA580C" stroke-width="1.5" stroke-dasharray="3,3" />
      <circle cx="955" cy="8" r="3" fill="#EA580C" />
      <text x="978" y="12" font-family="sans-serif" font-size="11" fill="#EA580C">Вершина (Apex)</text>
    </g>
  </g>
</svg>`;
  }

  // MODE B: Single Detailed Strip Blueprint
  const strip = strips[activeStripIndex];
  const svgW = 1200;
  const svgH = 760;
  const padX = 70;
  const drawW = svgW - 2 * padX;
  const drawH = 240;
  const drawY = 220;

  const cutLen = strip.cutLengthMm;
  const rollW = strip.widthMm;
  const seamMm = strip.seamAllowanceMm;
  const hemMm = strip.hemAllowanceMm;

  // Scale to fit canvas
  const scaleX = drawW / Math.max(1000, cutLen);
  const hemW_px = hemMm * scaleX;
  const apexX_px = padX + (cutLen / 2) * scaleX;

  // Y dimension proportions
  const seamTop_px = drawY + (seamMm / rollW) * drawH;
  const seamBot_px = drawY + drawH - (seamMm / rollW) * drawH;

  // Render Framework Triangles (Друк трикутників поточної смуги)
  const trianglesSvg = (showTriangles && strip.triangles && strip.triangles.length > 0)
    ? strip.triangles.map(tri => {
        const pAx = padX + tri.points2D[0].x * scaleX;
        const pAy = drawY + (tri.points2D[0].y / rollW) * drawH;
        const pBx = padX + tri.points2D[1].x * scaleX;
        const pBy = drawY + (tri.points2D[1].y / rollW) * drawH;
        const pCx = padX + tri.points2D[2].x * scaleX;
        const pCy = drawY + (tri.points2D[2].y / rollW) * drawH;
        const cX = (pAx + pBx + pCx) / 3;
        const cY = (pAy + pBy + pCy) / 3;

        const isHighlighted = highlightedTriangleId === tri.faceId;
        const strokeColor = isHighlighted ? "#D97706" : "#1E293B";
        const strokeWidth = isHighlighted ? 2.6 : 1.8;
        const fillColor = isHighlighted ? "#FEF3C7" : tri.color;
        const fillOpacity = isHighlighted ? 0.65 : 0.28;

        // Side dimensions
        const midABx = (pAx + pBx) / 2;
        const midABy = (pAy + pBy) / 2;
        const midBCx = (pBx + pCx) / 2;
        const midBCy = (pBy + pCy) / 2;
        const midCAx = (pCx + pAx) / 2;
        const midCAy = (pCy + pAy) / 2;

        const dimAB = (showDimensions && tri.lengths?.[0]) ? `
          <rect x="${(midABx - 14).toFixed(1)}" y="${(midABy - 6).toFixed(1)}" width="28" height="12" rx="2" fill="#FFFFFF" fill-opacity="0.9" stroke="#CBD5E0" stroke-width="0.5" />
          <text x="${midABx.toFixed(1)}" y="${(midABy + 3).toFixed(1)}" font-family="monospace" font-size="7" font-weight="bold" fill="#334155" text-anchor="middle">${tri.lengths[0]}</text>
        ` : '';
        const dimBC = (showDimensions && tri.lengths?.[1]) ? `
          <rect x="${(midBCx - 14).toFixed(1)}" y="${(midBCy - 6).toFixed(1)}" width="28" height="12" rx="2" fill="#FFFFFF" fill-opacity="0.9" stroke="#CBD5E0" stroke-width="0.5" />
          <text x="${midBCx.toFixed(1)}" y="${(midBCy + 3).toFixed(1)}" font-family="monospace" font-size="7" font-weight="bold" fill="#334155" text-anchor="middle">${tri.lengths[1]}</text>
        ` : '';
        const dimCA = (showDimensions && tri.lengths?.[2]) ? `
          <rect x="${(midCAx - 14).toFixed(1)}" y="${(midCAy - 6).toFixed(1)}" width="28" height="12" rx="2" fill="#FFFFFF" fill-opacity="0.9" stroke="#CBD5E0" stroke-width="0.5" />
          <text x="${midCAx.toFixed(1)}" y="${(midCAy + 3).toFixed(1)}" font-family="monospace" font-size="7" font-weight="bold" fill="#334155" text-anchor="middle">${tri.lengths[2]}</text>
        ` : '';

        return `
        <g class="strip-triangle" id="tri-${tri.faceId}">
          <!-- Triangle polygon with facet coloring -->
          <polygon
            points="${pAx.toFixed(1)},${pAy.toFixed(1)} ${pBx.toFixed(1)},${pBy.toFixed(1)} ${pCx.toFixed(1)},${pCy.toFixed(1)}"
            fill="${fillColor}"
            fill-opacity="${fillOpacity}"
            stroke="${strokeColor}"
            stroke-width="${strokeWidth}"
            stroke-linejoin="round"
          />
          <!-- Strut Edge Lines Highlight -->
          <line x1="${pAx.toFixed(1)}" y1="${pAy.toFixed(1)}" x2="${pBx.toFixed(1)}" y2="${pBy.toFixed(1)}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
          <line x1="${pBx.toFixed(1)}" y1="${pBy.toFixed(1)}" x2="${pCx.toFixed(1)}" y2="${pCy.toFixed(1)}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />
          <line x1="${pCx.toFixed(1)}" y1="${pCy.toFixed(1)}" x2="${pAx.toFixed(1)}" y2="${pAy.toFixed(1)}" stroke="${strokeColor}" stroke-width="${strokeWidth}" />

          <!-- Side Dimensions on Edges -->
          ${dimAB}
          ${dimBC}
          ${dimCA}

          <!-- Centroid badge with Face Type and ID -->
          <g transform="translate(${cX.toFixed(1)}, ${cY.toFixed(1)})">
            <rect x="-26" y="-9" width="52" height="18" rx="4" fill="${isHighlighted ? '#D97706' : '#FFFFFF'}" fill-opacity="0.95" stroke="${strokeColor}" stroke-width="${isHighlighted ? 1.5 : 0.8}" />
            <text x="0" y="3.5" font-family="sans-serif" font-size="9" font-weight="bold" fill="${isHighlighted ? '#FFFFFF' : '#1E293B'}" text-anchor="middle">▲ ${tri.faceType} #${tri.faceId + 1}</text>
          </g>
        </g>`;
      }).join('\n')
    : '';

  // Render Framework Nodes (Відмітка вузлів каркасу купола)
  const nodesSvg = (showNodes && strip.nodes && strip.nodes.length > 0)
    ? strip.nodes.map(n => {
        const nX = padX + n.x2D * scaleX;
        const nY = drawY + (n.y2D / rollW) * drawH;
        const isHighlighted = highlightedNodeId === n.nodeId;
        const color = isHighlighted ? "#D97706" : n.isApex ? "#EA580C" : n.isBoundary ? "#D97706" : "#2563EB";
        const r = isHighlighted ? 9.5 : n.isApex ? 7.5 : n.isBoundary ? 6.5 : 5.5;
        const labelY = nY < drawY + drawH / 2 ? nY - 14 : nY + 16;

        return `
        <g class="framework-node" id="node-${n.nodeId}">
          ${isHighlighted ? `<circle cx="${nX.toFixed(1)}" cy="${nY.toFixed(1)}" r="14" fill="none" stroke="#D97706" stroke-width="2" stroke-dasharray="3,2" />` : ''}
          <!-- Hub connector ring -->
          <circle cx="${nX.toFixed(1)}" cy="${nY.toFixed(1)}" r="${r}" fill="${color}" stroke="#FFFFFF" stroke-width="2" />
          <circle cx="${nX.toFixed(1)}" cy="${nY.toFixed(1)}" r="1.8" fill="#FFFFFF" />

          <!-- Target crosshairs -->
          <line x1="${(nX - r - 2).toFixed(1)}" y1="${nY.toFixed(1)}" x2="${(nX + r + 2).toFixed(1)}" y2="${nY.toFixed(1)}" stroke="${color}" stroke-width="0.8" opacity="0.6" />
          <line x1="${nX.toFixed(1)}" y1="${(nY - r - 2).toFixed(1)}" x2="${nX.toFixed(1)}" y2="${(nY + r + 2).toFixed(1)}" stroke="${color}" stroke-width="0.8" opacity="0.6" />

          <!-- Node ID tag -->
          ${showNodeLabels ? `
          <g transform="translate(${nX.toFixed(1)}, ${labelY.toFixed(1)})">
            <rect x="-26" y="-8.5" width="52" height="16" rx="3.5" fill="${isHighlighted ? '#D97706' : '#FFFFFF'}" fill-opacity="0.95" stroke="${color}" stroke-width="${isHighlighted ? 1.5 : 1}" />
            <text x="0" y="3" font-family="monospace" font-size="8.5" font-weight="bold" fill="${isHighlighted ? '#FFFFFF' : color}" text-anchor="middle">
              ${n.label}${n.isBoundary ? ' [Осн]' : n.isApex ? ' [Зен]' : ''}
            </text>
          </g>
          ` : ''}
        </g>`;
      }).join('\n')
    : '';

  const isPlinth = Boolean(strip.isPlinthStrip);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="100%">
  <!-- Background -->
  <rect width="100%" height="100%" fill="#FBF9F5" />

  <!-- Sheet Header / Technical Stamp -->
  <g transform="translate(${padX}, 35)">
    <text x="0" y="24" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1A2E3B">
      ${isPlinth ? `РОБОЧЕ КРЕСЛЕННЯ: СМУГА ЦОКОЛЯ — СТІНОВИЙ ПОЯС ПРЯМОКУТНИКАМИ` : `РОБОЧЕ КРЕСЛЕННЯ: ПОЛОСА ТЕНТУ #${strip.id} — ${strip.name.toUpperCase()}`}
    </text>
    <text x="0" y="48" font-family="sans-serif" font-size="13" fill="#5A6778">
      ${isPlinth
        ? `Суцільний горизонтальний пояс цоколя з проекцією прямокутних секцій (H=${strip.netWidthMm} мм) та діагональних балок жорсткості | Рулон ${rollW} мм`
        : `Суцільна арочна полоса від краю фундаменту до другого краю | Рулон ${rollW} мм | Включає друк ${strip.triangles?.length || 0} трикутників та ${strip.nodes?.length || 0} вузлів каркасу`
      }
    </text>
    <line x1="0" y1="62" x2="${drawW}" y2="62" stroke="#E2E8F0" stroke-width="1.5" />
  </g>

  <!-- Quick Info Badges -->
  <g transform="translate(${padX}, 115)">
    <rect x="0" y="0" width="190" height="48" rx="10" fill="#EFF6FF" stroke="#BFDBFE" />
    <text x="14" y="20" font-family="sans-serif" font-size="11" fill="#1E40AF">ПОВНА ДОВЖИНА РОЗКРОЮ</text>
    <text x="14" y="38" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1E3A8A">${strip.cutLengthMm} мм (${(strip.cutLengthMm / 1000).toFixed(2)} м)</text>

    <rect x="205" y="0" width="195" height="48" rx="10" fill="#F0FDF4" stroke="#BBF7D0" />
    <text x="219" y="20" font-family="sans-serif" font-size="11" fill="#166534">${isPlinth ? "ПЕРИМЕТР ЦОКОЛЯ" : "ДУГА ВІД КРАЮ ДО КРАЮ"}</text>
    <text x="219" y="38" font-family="sans-serif" font-size="14" font-weight="bold" fill="#14532D">${strip.domeArcLengthMm} мм (${(strip.domeArcLengthMm / 1000).toFixed(2)} м)</text>

    <rect x="415" y="0" width="190" height="48" rx="10" fill="#FEF2F2" stroke="#FECACA" />
    <text x="429" y="20" font-family="sans-serif" font-size="11" fill="#991B1B">ЗАЗОР НА ПРОШИВ НИТКОЮ</text>
    <text x="429" y="38" font-family="sans-serif" font-size="14" font-weight="bold" fill="#B91C1C">±${seamMm} мм (шов)</text>

    <rect x="620" y="0" width="190" height="48" rx="10" fill="#FEF3C7" stroke="#FDE68A" />
    <text x="634" y="20" font-family="sans-serif" font-size="11" fill="#92400E">${isPlinth ? "СЕКЦІЇ ЦОКОЛЯ" : "ТРИКУТНИКИ КАРКАСУ"}</text>
    <text x="634" y="38" font-family="sans-serif" font-size="14" font-weight="bold" fill="#B45309">
      ${isPlinth ? `${Math.round((strip.triangles?.length || 0) / 2)} прямокутників (${strip.triangles?.length || 0} трик.)` : `${strip.triangles?.length || 0} шт · ${strip.nodes?.length || 0} вузлів`}
    </text>

    <rect x="825" y="0" width="125" height="48" rx="10" fill="#F8FAFC" stroke="#CBD5E0" />
    <text x="837" y="20" font-family="sans-serif" font-size="11" fill="#475569">${isPlinth ? "ВИСОТА ЦОКОЛЯ" : "ПРИПУСК"}</text>
    <text x="837" y="38" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0F172A">${isPlinth ? `${strip.netWidthMm} мм` : `${hemMm}×2 мм`}</text>

    <rect x="965" y="0" width="95" height="48" rx="10" fill="#F8FAFC" stroke="#CBD5E0" />
    <text x="977" y="20" font-family="sans-serif" font-size="11" fill="#475569">ПЛОЩА</text>
    <text x="977" y="38" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0F172A">${strip.cutAreaM2} м²</text>
  </g>

  <!-- ================= MAIN STRIP DRAWING ================= -->
  <!-- Strip Base Fabric Fill -->
  <rect x="${padX}" y="${drawY}" width="${drawW}" height="${drawH}" rx="4" fill="#F8FAFC" stroke="#1E293B" stroke-width="2.2" />

  <!-- Left Foundation Hem Zone (or Start Seam for Plinth) -->
  ${showHems && !isPlinth ? `
  <rect x="${padX}" y="${drawY}" width="${hemW_px}" height="${drawH}" fill="#FEF3C7" />
  <line x1="${padX + hemW_px}" y1="${drawY}" x2="${padX + hemW_px}" y2="${drawY + drawH}" stroke="#D97706" stroke-width="1.8" stroke-dasharray="4,4" />
  <text x="${padX + hemW_px / 2}" y="${drawY + drawH / 2}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#92400E" text-anchor="middle" transform="rotate(-90, ${padX + hemW_px / 2}, ${drawY + drawH / 2})">
    ПРИПУСК ФУНДАМЕНТУ (${hemMm} мм)
  </text>
  ` : ''}

  <!-- Right Foundation Hem Zone (or End Seam for Plinth) -->
  ${showHems && !isPlinth ? `
  <rect x="${padX + drawW - hemW_px}" y="${drawY}" width="${hemW_px}" height="${drawH}" fill="#FEF3C7" />
  <line x1="${padX + drawW - hemW_px}" y1="${drawY}" x2="${padX + drawW - hemW_px}" y2="${drawY + drawH}" stroke="#D97706" stroke-width="1.8" stroke-dasharray="4,4" />
  <text x="${padX + drawW - hemW_px / 2}" y="${drawY + drawH / 2}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#92400E" text-anchor="middle" transform="rotate(-90, ${padX + drawW - hemW_px / 2}, ${drawY + drawH / 2})">
    ПРИПУСК ФУНДАМЕНТУ (${hemMm} мм)
  </text>
  ` : ''}

  <!-- Printed Geodesic Framework Triangles / Plinth Rectangles (Розкрій трикутників та прямокутників) -->
  ${trianglesSvg}

  <!-- Printed Geodesic Framework Nodes (Вузли каркасу) -->
  ${nodesSvg}

  <!-- Upper Thread Sewing Seam Line -->
  ${showSeamLines ? `
  <line x1="${padX}" y1="${seamTop_px}" x2="${padX + drawW}" y2="${seamTop_px}" stroke="#DC2626" stroke-width="1.8" stroke-dasharray="6,4" />
  <text x="${padX + drawW / 2}" y="${seamTop_px - 8}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#DC2626" text-anchor="middle">
    ${isPlinth ? `--- ЛІНІЯ ПРИШИВАННЯ ДО ТЕНТУ КУПОЛА (L = ${strip.domeArcLengthMm} мм, шов ±${seamMm} мм) ---` : `--- ЛІНІЯ ПРОШИВУ НИТКОЮ (відступ від верхнього краю = ${seamMm} мм) ---`}
  </text>
  ` : ''}

  <!-- Lower Thread Sewing Seam Line -->
  ${showSeamLines ? `
  <line x1="${padX}" y1="${seamBot_px}" x2="${padX + drawW}" y2="${seamBot_px}" stroke="#DC2626" stroke-width="1.8" stroke-dasharray="6,4" />
  <text x="${padX + drawW / 2}" y="${seamBot_px + 16}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#DC2626" text-anchor="middle">
    ${isPlinth ? `--- НИЖНІЙ ПІДГИН ТА ЛЮВЕРСИ ДО ФУНДАМЕНТУ (${hemMm} мм) ---` : `--- ЛІНІЯ ПРОШИВУ НИТКОЮ (відступ від нижнього краю = ${seamMm} мм) ---`}
  </text>
  ` : ''}

  <!-- Centerline / Apex Marker (Dome) or Plinth Band Center Marker -->
  ${showCenterline && !isPlinth ? `
  <line x1="${apexX_px}" y1="${drawY - 20}" x2="${apexX_px}" y2="${drawY + drawH + 20}" stroke="#EA580C" stroke-width="1.8" stroke-dasharray="5,4" />
  <circle cx="${apexX_px}" cy="${drawY + drawH / 2}" r="6" fill="#EA580C" />
  <circle cx="${apexX_px}" cy="${drawY + drawH / 2}" r="2" fill="#FFFFFF" />
  <text x="${apexX_px}" y="${drawY - 26}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#EA580C" text-anchor="middle">
    ВЕРШИНА КУПОЛА (APEX)
  </text>
  ` : ''}

  <!-- Middle Usable Width Callout -->
  <g transform="translate(${apexX_px}, ${drawY + drawH / 2})">
    <rect x="-110" y="-14" width="220" height="28" rx="6" fill="#FFFFFF" stroke="#CBD5E0" opacity="0.95" />
    <text x="0" y="4" font-family="sans-serif" font-size="11" font-weight="bold" fill="#1E293B" text-anchor="middle">
      ${isPlinth ? `Висота цоколя: ${strip.netWidthMm} мм` : `Робоча ширина: ${strip.netWidthMm} мм`}
    </text>
  </g>

  <!-- ================= DIMENSION LINES ================= -->
  <!-- 1. Left Vertical Roll Width Dimension -->
  <g transform="translate(${padX - 25}, ${drawY})">
    <line x1="0" y1="0" x2="0" y2="${drawH}" stroke="#2B6CB0" stroke-width="1.8" />
    <line x1="-8" y1="0" x2="8" y2="0" stroke="#2B6CB0" stroke-width="1.8" />
    <line x1="-8" y1="${drawH}" x2="8" y2="${drawH}" stroke="#2B6CB0" stroke-width="1.8" />
    <text x="-12" y="${drawH / 2}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#2B6CB0" text-anchor="middle" transform="rotate(-90, -12, ${drawH / 2})">
      ${isPlinth ? `ШИРИНА ПОЛОТНА: ${rollW} мм` : `ШИРИНА РУЛОНУ: ${rollW} мм`}
    </text>
  </g>

  <!-- 2. Bottom Horizontal Total Cut Length Dimension -->
  <g transform="translate(${padX}, ${drawY + drawH + 45})">
    <line x1="0" y1="0" x2="${drawW}" y2="0" stroke="#1E293B" stroke-width="1.8" />
    <line x1="0" y1="-8" x2="0" y2="8" stroke="#1E293B" stroke-width="1.8" />
    <line x1="${drawW}" y1="-8" x2="${drawW}" y2="8" stroke="#1E293B" stroke-width="1.8" />
    <text x="${drawW / 2}" y="22" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1A2E3B" text-anchor="middle">
      ${isPlinth ? `ПОВНА ДОВЖИНА ПОЯСУ: ${strip.cutLengthMm} мм (${(strip.cutLengthMm / 1000).toFixed(3)} м)` : `ПОВНА ДОВЖИНА РОЗКРОЮ: ${strip.cutLengthMm} мм (${(strip.cutLengthMm / 1000).toFixed(3)} м)`}
    </text>
  </g>

  <!-- 3. Perimeter / Arc Length Dimension -->
  <g transform="translate(${padX + hemW_px}, ${drawY + drawH + 85})">
    <line x1="0" y1="0" x2="${drawW - 2 * hemW_px}" y2="0" stroke="#15803D" stroke-width="1.8" />
    <line x1="0" y1="-6" x2="0" y2="6" stroke="#15803D" stroke-width="1.8" />
    <line x1="${drawW - 2 * hemW_px}" y1="-6" x2="${drawW - 2 * hemW_px}" y2="6" stroke="#15803D" stroke-width="1.8" />
    <text x="${(drawW - 2 * hemW_px) / 2}" y="20" font-family="sans-serif" font-size="12" font-weight="bold" fill="#15803D" text-anchor="middle">
      ${isPlinth ? `ПЕРИМЕТР ОСНОВИ ЦОКОЛЯ: ${strip.domeArcLengthMm} мм (${(strip.domeArcLengthMm / 1000).toFixed(3)} м)` : `ДУГА КУПОЛА ВІД КРАЮ ДО КРАЮ ФУНДАМЕНТУ: ${strip.domeArcLengthMm} мм (${(strip.domeArcLengthMm / 1000).toFixed(3)} м)`}
    </text>
  </g>

  <!-- Legend Box -->
  <g transform="translate(${padX}, ${svgH - 120})">
    <rect x="0" y="0" width="${drawW}" height="42" rx="8" fill="#FFFFFF" stroke="#CBD5E0" />
    <g transform="translate(15, 15)">
      <!-- Triangles -->
      <polygon points="0,12 10,0 20,12" fill="#4A90E2" fill-opacity="0.5" stroke="#1E293B" stroke-width="1.2" />
      <text x="26" y="9" font-family="sans-serif" font-size="10" font-weight="bold" fill="#1E293B">Друк трикутників (${strip.triangles?.length || 0} шт)</text>

      <!-- Standard Hub -->
      <circle cx="180" cy="6" r="5" fill="#2563EB" stroke="#FFFFFF" stroke-width="1.5" />
      <text x="192" y="9" font-family="sans-serif" font-size="10" fill="#1E293B">Вузол каркасу</text>

      <!-- Apex Hub -->
      <circle cx="300" cy="6" r="6" fill="#EA580C" stroke="#FFFFFF" stroke-width="1.5" />
      <text x="312" y="9" font-family="sans-serif" font-size="10" font-weight="bold" fill="#EA580C">Вершина (Apex)</text>

      <!-- Base Hub -->
      <circle cx="430" cy="6" r="5.5" fill="#D97706" stroke="#FFFFFF" stroke-width="1.5" />
      <text x="442" y="9" font-family="sans-serif" font-size="10" font-weight="bold" fill="#D97706">Опора фундаменту</text>

      <!-- Seam -->
      <line x1="580" y1="6" x2="605" y2="6" stroke="#DC2626" stroke-width="1.8" stroke-dasharray="5,3" />
      <text x="613" y="9" font-family="sans-serif" font-size="10" font-weight="bold" fill="#DC2626">Шов ниткою (${seamMm} мм)</text>

      <!-- Hem -->
      <rect x="750" y="0" width="16" height="12" fill="#FEF3C7" stroke="#D97706" stroke-width="1" />
      <text x="772" y="9" font-family="sans-serif" font-size="10" fill="#92400E">Підгин фундаменту (${hemMm} мм)</text>
    </g>
  </g>

  <!-- Workshop Instructions Footnote -->
  <g transform="translate(${padX}, ${svgH - 68})">
    <rect x="0" y="0" width="${drawW}" height="48" rx="8" fill="#F1F5F9" stroke="#E2E8F0" />
    <text x="15" y="18" font-family="sans-serif" font-size="11" font-weight="bold" fill="#1E293B">ТЕХНОЛОГІЧНІ ВКАЗІВКИ ДЛЯ ШВЕЙНОГО ТА РОЗКРІЙНОГО ЦЕХУ:</text>
    <text x="15" y="34" font-family="sans-serif" font-size="10" fill="#475569">
      1. Розкрій виконувати за суцільною контурною лінією. 2. Нанести розмітку ${strip.triangles?.length || 0} трикутників з довжинами сторін та відмітити ${strip.nodes?.length || 0} вузлів каркасу для позиціонування на куполі. 3. Прострочку ниткою виконувати по червоних лініях шва (${seamMm} мм від краю).
    </text>
  </g>
</svg>`;
}

