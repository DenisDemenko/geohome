import { DomeModel, SheathingSheetLayout } from "../core/types";
import { classifyConnectorTypes } from "../core/connectors";
import { calculateSheetNesting } from "../core/sheathing";
import { generateSheathingNestingSVG } from "./svgExport";

/**
 * Generates comprehensive printable HTML for the dome engineering specification.
 * Formatted strictly for A4 sheets with page breaks, technical tables, and stamps.
 */
export function generateSpecificationHTML(model: DomeModel): string {
  const { parameters, beamProfile, connectorParams, statistics } = model;
  const connectorTypes = classifyConnectorTypes(model, connectorParams);
  const totalConnectors = connectorTypes.reduce((sum, t) => sum + t.countInDome, 0);
  const totalBeamsCount = model.beamGroups.reduce((sum, g) => sum + g.count, 0);
  const totalLinearMeters = Math.round(
    model.beamGroups.reduce((sum, g) => sum + (g.length * g.count) / 1000, 0) * 10
  ) / 10;
  const totalBeamVolumeM3 = Math.round(
    (totalLinearMeters * (beamProfile.width / 1000) * (beamProfile.depth / 1000)) * 100
  ) / 100;
  const totalBeamWeightKg = Math.round(totalBeamVolumeM3 * beamProfile.density);

  // Fasteners count
  const boltsCount = totalBeamsCount * 2 * (connectorParams.boltHoleCount || 2);
  const nutsCount = boltsCount;
  const washersCount = boltsCount * 2;

  // Sheathing
  const nesting = calculateSheetNesting(model);
  const sheathingAreaM2 = Math.round(
    model.faceGroups.reduce((sum, f) => sum + f.area * f.count, 0) * 10
  ) / 10;

  const dateStr = new Date().toLocaleDateString("uk-UA", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Інженерна специфікація — Купол ${parameters.frequency}V (${parameters.diameter / 1000} м)</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 15mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.45;
      color: #1A2E3B;
      background: #FFFFFF;
      margin: 0;
      padding: 0;
    }
    .page {
      page-break-after: always;
      position: relative;
      min-height: 100%;
    }
    .page:last-child {
      page-break-after: auto;
    }
    /* Technical Header */
    .header {
      border-bottom: 2px solid #1A2E3B;
      padding-bottom: 8px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .header-title h1 {
      font-size: 18px;
      font-weight: 800;
      margin: 0 0 4px 0;
      letter-spacing: -0.3px;
      text-transform: uppercase;
      color: #1A2E3B;
    }
    .header-title p {
      margin: 0;
      font-size: 11px;
      color: #5A6778;
    }
    .header-meta {
      text-align: right;
      font-size: 10px;
      font-family: monospace;
      color: #5A6778;
    }
    .header-meta b {
      color: #1A2E3B;
    }
    /* Grid blocks */
    .section-title {
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #1A2E3B;
      border-left: 4px solid #5B9279;
      padding-left: 8px;
      margin: 14px 0 8px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 14px;
    }
    .metric-card {
      background: #FAF7F2;
      border: 1px solid #E4DED3;
      border-radius: 8px;
      padding: 8px 10px;
    }
    .metric-card .label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      color: #718096;
      margin-bottom: 2px;
    }
    .metric-card .value {
      font-size: 14px;
      font-weight: 800;
      font-family: monospace;
      color: #1A2E3B;
    }
    .metric-card .sub {
      font-size: 9px;
      color: #8C9BAE;
      margin-top: 2px;
    }
    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 10px;
    }
    th {
      background: #F0ECE1;
      color: #2D3748;
      font-weight: 700;
      text-align: left;
      padding: 6px 8px;
      border: 1px solid #DCD6CA;
      font-size: 9.5px;
      text-transform: uppercase;
    }
    td {
      padding: 5px 8px;
      border: 1px solid #E2E8F0;
      vertical-align: middle;
    }
    tr:nth-child(even) td {
      background: #FAFAFA;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-mono { font-family: monospace; }
    .font-bold { font-weight: 700; }
    .badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 700;
      font-family: monospace;
      font-size: 9.5px;
      border: 1px solid rgba(0,0,0,0.12);
    }
    .stamp-box {
      border: 2px solid #2E7D32;
      border-radius: 8px;
      padding: 8px 12px;
      background: #F0FFF4;
      display: inline-block;
      text-align: right;
    }
    .stamp-title {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      color: #1B4D2E;
    }
    .stamp-value {
      font-size: 16px;
      font-weight: 900;
      font-family: monospace;
      color: #2E7D32;
    }
    .footer {
      border-top: 1px solid #CBD5E0;
      padding-top: 6px;
      margin-top: 20px;
      font-size: 9px;
      color: #718096;
      display: flex;
      justify-content: space-between;
    }
    .highlight-row {
      background: #F7FAFC !important;
      font-weight: 700;
      border-top: 2px solid #CBD5E0;
    }
    .print-btn-bar {
      background: #1A2E3B;
      color: white;
      padding: 10px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 1000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    }
    .print-btn {
      background: #5B9279;
      color: white;
      border: none;
      padding: 7px 16px;
      border-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      font-size: 12px;
    }
    .print-btn:hover {
      background: #4A7A64;
    }
    @media print {
      .print-btn-bar { display: none !important; }
    }
  </style>
</head>
<body>

  <!-- Floating Print Bar (hidden in PDF output) -->
  <div class="print-btn-bar">
    <div>
      <b>КуполГео CAD — Генератор технічної специфікації</b>
      <span style="opacity: 0.8; font-size: 11px; margin-left: 10px;">Натисніть кнопку або комбінацію Ctrl+P (Cmd+P) для збереження у PDF</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button class="print-btn" onclick="window.print()">Зберегти як PDF / Друкувати</button>
      <button class="print-btn" style="background: #4A5568;" onclick="window.close()">Закрити</button>
    </div>
  </div>

  <div style="padding: 15mm 15mm 0 15mm;">
    <!-- PAGE 1: DOMAIN METRICS & BEAM CUTTING SCHEDULE -->
    <div class="page">
      <div class="header">
        <div class="header-title">
          <h1>Інженерна специфікація купола ${parameters.frequency}V</h1>
          <p>Розрахунково-конструкторська відомість пиломатеріалів, пластин Thunder Domes та кріплення</p>
        </div>
        <div class="header-meta">
          Дата: <b>${dateStr}</b><br>
          Проект: <b>KUPOL-${parameters.frequency}V-${parameters.diameter / 1000}M</b><br>
          Геометрія: <b>${model.approved ? "Затверджено" : "Робоча версія"}</b>
        </div>
      </div>

      <!-- Core Metrics Grid -->
      <div class="metrics-grid">
        <div class="metric-card">
          <div class="label">Діаметр купола</div>
          <div class="value">${(parameters.diameter / 1000).toFixed(2)} м</div>
          <div class="sub">Радіус R = ${(parameters.diameter / 2000).toFixed(2)} м</div>
        </div>
        <div class="metric-card">
          <div class="label">Висота у коньку</div>
          <div class="value">${(parameters.height / 1000).toFixed(2)} м</div>
          <div class="sub">Тип зрізу: ${parameters.cutType} сфери</div>
        </div>
        <div class="metric-card">
          <div class="label">Площа підлоги (Z=0)</div>
          <div class="value">${statistics?.floorAreaM2 || 0} м²</div>
          <div class="sub">Периметр: ${statistics?.baseCircumferenceM || 0} м</div>
        </div>
        <div class="metric-card">
          <div class="label">Площа поверхні покрівлі</div>
          <div class="value">${statistics?.domeSurfaceAreaM2 || 0} м²</div>
          <div class="sub">Об'єм: ${statistics?.domeVolumeM3 || 0} м³</div>
        </div>
      </div>

      <!-- Section 1: Beam Cutting Schedule -->
      <div class="section-title">
        <span>1. Відомість розкрою балок каркаса (брус ${beamProfile.width} × ${beamProfile.depth} мм)</span>
        <span style="font-size: 10px; color: #5B9279;">Всього балок: ${totalBeamsCount} шт (${totalLinearMeters} пог. м)</span>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 6%;">Тип</th>
            <th style="width: 13%;">Марка</th>
            <th class="text-center" style="width: 9%;">Кількість</th>
            <th class="text-right" style="width: 14%;">1. До вузла сходження (Lвуз)</th>
            <th class="text-center" style="width: 12%;">Відступ кільця (Ø${connectorParams.hubDiameter})</th>
            <th class="text-right" style="width: 15%;">2. Обрізаний під конектор (Lобр)</th>
            <th class="text-center" style="width: 9%;">Кут запилу</th>
            <th class="text-right" style="width: 10%;">Метраж</th>
            <th class="text-right" style="width: 12%;">Об'єм / Вага</th>
          </tr>
        </thead>
        <tbody>
          ${model.beamGroups
            .map(g => {
              const netCut = g.cutLength || Math.max(10, Math.round(g.length - connectorParams.hubDiameter));
              const linearM = Math.round(((netCut * g.count) / 1000) * 10) / 10;
              const volM3 = Math.round((linearM * (beamProfile.width / 1000) * (beamProfile.depth / 1000)) * 100) / 100;
              const weightKg = Math.round(volM3 * beamProfile.density);

              return `<tr>
                <td><span class="badge" style="background: ${g.color}25; color: ${g.color}; border-color: ${g.color};">${g.type}</span></td>
                <td><b>Балка ${g.type}</b>${g.isBaseBeam ? " (Основа)" : ""}</td>
                <td class="text-center font-mono font-bold">${g.count} шт</td>
                <td class="text-right font-mono" style="color: #4A5568; font-weight: 600;">${g.length} мм</td>
                <td class="text-center font-mono" style="color: #C53030;">-2 × ${(connectorParams.hubDiameter / 2).toFixed(0)} мм</td>
                <td class="text-right font-mono font-black" style="color: #1B4D2E; background: #F0FFF4;">${netCut} мм</td>
                <td class="text-center font-mono">${(g.endAngleStart || 5.2).toFixed(1)}°</td>
                <td class="text-right font-mono">${linearM} м</td>
                <td class="text-right font-mono">${volM3} м³ (${weightKg} кг)</td>
              </tr>`;
            })
            .join("")}
          <tr class="highlight-row">
            <td colspan="2"><b>РАЗОМ ПО КАРКАСУ</b></td>
            <td class="text-center font-mono">${totalBeamsCount} шт</td>
            <td class="text-right font-mono">—</td>
            <td class="text-center font-mono">—</td>
            <td class="text-right font-mono font-bold" style="color: #2E7D32;">Чистий розкрій</td>
            <td class="text-center font-mono">—</td>
            <td class="text-right font-mono">${totalLinearMeters} м</td>
            <td class="text-right font-mono">${totalBeamVolumeM3} м³ (${totalBeamWeightKg} кг)</td>
          </tr>
        </tbody>
      </table>

      <!-- Section 2: Thunder Domes Star Connectors -->
      <div class="section-title">
        <span>2. Специфікація конекторних пластин Thunder Domes (сталь ${connectorParams.thickness} мм)</span>
        <span style="font-size: 10px; color: #2E7D32;">Всього пластин: ${totalConnectors} шт</span>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 30%;">Вид конектора</th>
            <th class="text-center" style="width: 12%;">Променів</th>
            <th class="text-center" style="width: 14%;">Тираж</th>
            <th style="width: 24%;">Склад балок у вузлі</th>
            <th class="text-center" style="width: 20%;">Кути згину пелюсток (δ)</th>
          </tr>
        </thead>
        <tbody>
          ${connectorTypes
            .map(t => {
              const bendAnglesStr = t.rayDetails.map(r => `${r.bendAngleDeg}°`).join(", ");
              return `<tr>
                <td>
                  <b>${t.name}</b>
                  ${t.isBoundary ? '<span class="badge" style="background:#E1EDE3;color:#1A3E26;margin-left:4px;">Основа Z=0</span>' : ''}
                </td>
                <td class="text-center font-mono">${t.rayCount}</td>
                <td class="text-center font-mono font-bold" style="color: #2E7D32; font-size: 11px;">${t.countInDome} шт</td>
                <td class="font-mono text-center" style="font-size: 9.5px;">${t.beamSignature}</td>
                <td class="text-center font-mono" style="color: #DE7C5A;">${bendAnglesStr}</td>
              </tr>`;
            })
            .join("")}
          <tr class="highlight-row">
            <td colspan="2"><b>РАЗОМ КОНЕКТОРІВ НА КУПОЛ</b></td>
            <td class="text-center font-mono" style="color: #2E7D32; font-size: 12px;">${totalConnectors} шт</td>
            <td colspan="2" class="text-right">Параметри: Сердцевина Ø${connectorParams.hubDiameter} мм, луч ${connectorParams.tabLength}×${connectorParams.tabWidth} мм, товщина ${connectorParams.thickness} мм</td>
          </tr>
        </tbody>
      </table>

      <!-- Section 3: Hardware & Fasteners Bill -->
      <div class="section-title">
        <span>3. Відомість металовиробів та кріплення (DIN 933 / DIN 985)</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Найменування кріплення</th>
            <th>Стандарт / Матеріал</th>
            <th class="text-center">Кількість на 1 вузол</th>
            <th class="text-center">Загальна кількість</th>
            <th>Призначення</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>Болт шестигранний М${connectorParams.boltDiameter} × 70 мм</b></td>
            <td>DIN 933, клас міцності 8.8, оцинкований</td>
            <td class="text-center font-mono">${(connectorParams.boltHoleCount || 2) * 5} шт</td>
            <td class="text-center font-mono font-bold">${boltsCount} шт</td>
            <td>Кріплення бруса до лучей пластин</td>
          </tr>
          <tr>
            <td><b>Гайка самоконтра М${connectorParams.boltDiameter} (з нейлоном)</b></td>
            <td>DIN 985, оцинкована</td>
            <td class="text-center font-mono">${(connectorParams.boltHoleCount || 2) * 5} шт</td>
            <td class="text-center font-mono font-bold">${nutsCount} шт</td>
            <td>Фіксація болтових з'єднань від послаблення</td>
          </tr>
          <tr>
            <td><b>Шайба збільшена кузовна М${connectorParams.boltDiameter}</b></td>
            <td>DIN 9021, оцинкована</td>
            <td class="text-center font-mono">${(connectorParams.boltHoleCount || 2) * 10} шт</td>
            <td class="text-center font-mono font-bold">${washersCount} шт</td>
            <td>Розподіл навантаження на деревину</td>
          </tr>
          <tr>
            <td><b>Анкерний болт фундаментний М12 × 150 мм</b></td>
            <td>Сталь гарячого цинкування</td>
            <td class="text-center font-mono">2 шт / опорний вузол</td>
            <td class="text-center font-mono font-bold">${(connectorTypes.find(t => t.isBoundary)?.countInDome || 15) * 2} шт</td>
            <td>Кріплення опорних конекторів основи до фундаменту</td>
          </tr>
        </tbody>
      </table>

      <!-- Section 4: Sheathing Panels Estimation -->
      <div class="section-title">
        <span>4. Специфікація плитного матеріалу обшивки покрівлі (OSB-3 / ФСФ 12 мм)</span>
        <span style="font-size: 10px; color: #4A7C9B;">Площа: ${sheathingAreaM2} м² (${nesting.totalSheetsRequired} листів 1250×2500 мм)</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Тип трикутника</th>
            <th class="text-center">Кількість</th>
            <th class="text-center">Розміри сторін a × b × c (мм)</th>
            <th class="text-center">Внутрішні кути (°)</th>
            <th class="text-right">Площа 1 шт (м²)</th>
            <th class="text-right">Загальна площа (м²)</th>
          </tr>
        </thead>
        <tbody>
          ${model.faceGroups
            .map(f => {
              const totalArea = Math.round(f.area * f.count * 100) / 100;
              return `<tr>
                <td><span class="badge" style="background: ${f.color}; color: #1A2E3B;">Грань ${f.type}</span></td>
                <td class="text-center font-mono font-bold">${f.count} шт</td>
                <td class="text-center font-mono">${f.lengths.join(" × ")} мм</td>
                <td class="text-center font-mono">${f.angles.join("° / ")}°</td>
                <td class="text-right font-mono">${f.area} м²</td>
                <td class="text-right font-mono font-bold">${totalArea} м²</td>
              </tr>`;
            })
            .join("")}
          <tr class="highlight-row">
            <td colspan="1"><b>РАЗОМ ОБШИВКА</b></td>
            <td class="text-center font-mono">${model.faces.length} шт</td>
            <td colspan="3" class="text-right">Рекомендовано листів 1250×2500 мм (з запасом на розкрій):</td>
            <td class="text-right font-mono font-bold" style="color: #4A7C9B; font-size: 11px;">${nesting.totalSheetsRequired} листів</td>
          </tr>
        </tbody>
      </table>

      <!-- Footer & Signature Block -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; padding-top: 14px; border-top: 1px solid #CBD5E0;">
        <div style="font-size: 9.5px; color: #5A6778;">
          Специфікація згенерована автоматично в системі КуполГео CAD.<br>
          Всі розрахунки виконано з точністю до 0.1 мм для верстатів лазерного розкрою з ЧПК та прес-листогибів.
        </div>

        <div style="display: flex; gap: 24px; font-size: 10px;">
          <div>
            Конструктор: ____________________ / М.П.
          </div>
          <div>
            Затвердив: ____________________
          </div>
        </div>
      </div>

    </div>
  </div>

</body>
</html>`;
}

/**
 * Opens a dedicated printable PDF window with the complete engineering specification.
 * Triggers native browser Print / Save-as-PDF dialog with complete Cyrillic support and formatting.
 */
export function exportDomeSpecificationPDF(model: DomeModel): void {
  const html = generateSpecificationHTML(model);
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // If popups are blocked, create a hidden blob download
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `specifikatsiya_kupol_${model.parameters.frequency}V.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  // Trigger print after resources load
  printWindow.onload = () => {
    printWindow.focus();
  };
}

/**
 * Generates comprehensive printable HTML album for CNC Sheathing Nesting.
 * Formatted for A4 Landscape with Title Passport and dedicated high-res vector sheets.
 */
export function generateSheathingNestingPDFHTML(
  model: DomeModel,
  layout: SheathingSheetLayout,
  options?: {
    singleSheetIndex?: number;
    showKerf?: boolean;
    showToolpath?: boolean;
    showTabs?: boolean;
  }
): string {
  const { parameters } = model;
  const toolDiam = layout.toolDiameter || 6;
  const sheetW = layout.sheetWidth;
  const sheetH = layout.sheetHeight;
  const totalSheets = layout.totalSheetsRequired;
  const singleIdx = options?.singleSheetIndex;

  const dateStr = new Date().toLocaleDateString("uk-UA", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const sheetIndices =
    singleIdx !== undefined && singleIdx >= 0 && singleIdx < totalSheets
      ? [singleIdx]
      : Array.from({ length: totalSheets }, (_, i) => i);

  // Generate HTML for each sheet drawing page
  const sheetPagesHtml = sheetIndices
    .map(idx => {
      const sheetSvg = generateSheathingNestingSVG(layout, idx, {
        showKerf: options?.showKerf !== false,
        showToolpath: options?.showToolpath !== false,
        showTabs: options?.showTabs !== false
      });

      const sPanels = layout.placedPanels.filter(p => p.sheetIndex === idx);
      const sheetSummary = layout.sheetsSummary?.[idx];

      return `
    <div class="sheet-page">
      <div class="page-header">
        <div class="page-title-block">
          <div class="stamp-badge">АРКУШ ${idx + 1} З ${totalSheets}</div>
          <div>
            <div class="main-title">КАРТА РОЗКРОЮ НА ЧПУ — ЛИСТ ${idx + 1} (ФАНЕРА ${sheetW} × ${sheetH} мм)</div>
            <div class="sub-title">Купол ${parameters.frequency}V · Ø ${(parameters.diameter / 1000).toFixed(1)} м · Інструмент: Фреза Ø${toolDiam} мм · Відступ краю: ${layout.margin} мм</div>
          </div>
        </div>
        <div class="header-metrics">
          <div class="h-metric">
            <span class="lbl">Деталей</span>
            <span class="val">${sPanels.length} шт</span>
          </div>
          <div class="h-metric">
            <span class="lbl">Довжина різу</span>
            <span class="val">${sheetSummary?.cutLengthM || 0} м</span>
          </div>
          <div class="h-metric">
            <span class="lbl">Відходи листа</span>
            <span class="val">~${sheetSummary?.wastePct || layout.wastePercentage}%</span>
          </div>
        </div>
      </div>

      <div class="svg-stage">
        <div class="svg-wrapper">
          ${sheetSvg}
        </div>
      </div>

      <div class="page-footer">
        <div class="parts-chips">
          <span class="chip-label">Деталі на цьому листі:</span>
          ${
            sheetSummary?.typesSummary ||
            sPanels.map(p => `#${p.panelId} (${p.panelType})`).join(", ")
          }
        </div>
        <div class="sign-block">
          <span>Оператор ЧПУ: __________________</span>
          <span>Контроль ВТК: __________________</span>
        </div>
      </div>
    </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Карта ЧПУ розкрою обшивки — Купол ${parameters.frequency}V (${sheetW}×${sheetH} мм)</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 8mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.4;
      color: #1A2E3B;
      background: #FFFFFF;
      margin: 0;
      padding: 0;
    }
    .sheet-page {
      page-break-after: always;
      width: 100%;
      height: 98vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .sheet-page:last-child {
      page-break-after: avoid;
    }
    
    /* Cover / Passport Page */
    .passport-page {
      page-break-after: always;
      width: 100%;
      height: 98vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .passport-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 2px solid #1A2E3B;
    }
    .project-name {
      font-size: 20px;
      font-weight: 800;
      color: #1A2E3B;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .project-sub {
      font-size: 12px;
      color: #5A6778;
      margin-top: 3px;
    }
    .date-badge {
      font-size: 11px;
      font-weight: 700;
      color: #2D3748;
      background: #F1F5F9;
      padding: 6px 12px;
      border-radius: 6px;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
      margin: 16px 0;
    }
    .kpi-card {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .kpi-label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748B;
      display: block;
      margin-bottom: 4px;
    }
    .kpi-val {
      font-size: 16px;
      font-weight: 800;
      color: #0F172A;
      font-family: monospace;
    }
    .kpi-sub {
      font-size: 9px;
      color: #94A3B8;
      display: block;
      margin-top: 2px;
    }

    /* Table */
    table.cnc-table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
      font-size: 10.5px;
    }
    table.cnc-table th {
      background: #0F172A;
      color: #FFFFFF;
      text-align: left;
      padding: 7px 10px;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 9.5px;
    }
    table.cnc-table td {
      padding: 6px 10px;
      border-bottom: 1px solid #E2E8F0;
    }
    table.cnc-table tr:nth-child(even) {
      background: #F8FAFC;
    }

    /* Tech Instructions Box */
    .tech-box {
      background: #FFFBEB;
      border: 1px solid #FDE68A;
      border-radius: 8px;
      padding: 10px 14px;
      margin-top: 8px;
    }
    .tech-title {
      font-weight: 800;
      color: #92400E;
      font-size: 11px;
      margin-bottom: 4px;
    }
    .tech-desc {
      font-size: 10px;
      color: #78350F;
      line-height: 1.45;
    }

    /* Page Header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1.5px solid #CBD5E1;
      margin-bottom: 6px;
    }
    .page-title-block {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .stamp-badge {
      background: #DE7C5A;
      color: white;
      font-weight: 800;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 6px;
      white-space: nowrap;
    }
    .main-title {
      font-size: 13px;
      font-weight: 800;
      color: #0F172A;
    }
    .sub-title {
      font-size: 10px;
      color: #64748B;
    }
    .header-metrics {
      display: flex;
      gap: 12px;
    }
    .h-metric {
      background: #F1F5F9;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 10px;
    }
    .h-metric .lbl {
      color: #64748B;
      margin-right: 4px;
    }
    .h-metric .val {
      font-weight: 800;
      color: #0F172A;
      font-family: monospace;
    }

    /* SVG Area */
    .svg-stage {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      overflow: hidden;
    }
    .svg-wrapper {
      width: 100%;
      height: 100%;
      max-height: 540px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .svg-wrapper svg {
      width: 100%;
      height: auto;
      max-height: 535px;
      display: block;
    }

    /* Page Footer */
    .page-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 6px;
      border-top: 1px solid #E2E8F0;
      font-size: 9.5px;
      color: #64748B;
    }
    .parts-chips {
      font-weight: 600;
      color: #334155;
    }
    .chip-label {
      color: #64748B;
      font-weight: normal;
      margin-right: 4px;
    }
    .sign-block {
      display: flex;
      gap: 20px;
      font-weight: 600;
    }

    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .sheet-page, .passport-page {
        height: 100vh;
      }
    }
  </style>
</head>
<body>

  <!-- PAGE 1: PASSPORT & SPECIFICATION OF CNC SHEATHING NESTING -->
  <div class="passport-page">
    <div>
      <div class="passport-header">
        <div>
          <div class="project-name">ТЕХНОЛОГІЧНИЙ ПАСПОРТ ЧПУ РОЗКРОЮ ОБШИВКИ КУПОЛА</div>
          <div class="project-sub">
            Геодезичний купол ${parameters.frequency}V · Діаметр ${(parameters.diameter / 1000).toFixed(1)} м · Формат плити: ${sheetW} × ${sheetH} мм (фанера ФСФ)
          </div>
        </div>
        <div class="date-badge">Дата видачі: ${dateStr}</div>
      </div>

      <!-- KPI METRICS -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-label">Тираж плит</span>
          <span class="kpi-val">${totalSheets} шт</span>
          <span class="kpi-sub">${layout.totalSheetAreaM2} м² закупівлі</span>
        </div>

        <div class="kpi-card">
          <span class="kpi-label">Фреза ЧПУ</span>
          <span class="kpi-val" style="color: #2563EB;">Ø${toolDiam} мм</span>
          <span class="kpi-sub">зазор різу ${toolDiam + (layout.safetyGap || 2)} мм</span>
        </div>

        <div class="kpi-card">
          <span class="kpi-label">Коеф. відходів</span>
          <span class="kpi-val" style="color: #16A34A;">~${layout.wastePercentage}%</span>
          <span class="kpi-sub">зустрічне гніздування</span>
        </div>

        <div class="kpi-card">
          <span class="kpi-label">Довжина різу</span>
          <span class="kpi-val">${layout.totalLinearCutMeters} м</span>
          <span class="kpi-sub">сумарний периметр</span>
        </div>

        <div class="kpi-card">
          <span class="kpi-label">Час різання</span>
          <span class="kpi-val" style="color: #D97706;">~${layout.estimatedMachiningMinutes} хв</span>
          <span class="kpi-sub">${layout.passes || 2} проходи / ${layout.feedRateMmMin || 3500} мм/хв</span>
        </div>
      </div>

      <!-- SHEETS SUMMARY TABLE -->
      <table class="cnc-table">
        <thead>
          <tr>
            <th style="width: 70px;">Лист №</th>
            <th style="width: 140px;">Формат фанери</th>
            <th style="width: 100px;">Кількість деталей</th>
            <th>Склад деталей за типами</th>
            <th style="width: 110px;">Довжина різу (м)</th>
            <th style="width: 110px;">Відходи (%)</th>
            <th style="width: 100px;">Статус ЧПУ</th>
          </tr>
        </thead>
        <tbody>
          ${(layout.sheetsSummary || [])
            .map(
              s => `
          <tr>
            <td><b>Лист ${s.sheetIndex + 1}</b></td>
            <td>${sheetW} × ${sheetH} мм</td>
            <td><b>${s.panelCount} шт</b></td>
            <td>${s.typesSummary}</td>
            <td>${s.cutLengthM} пог. м</td>
            <td>~${s.wastePct}%</td>
            <td style="color: #64748B;">[ ] Вирізано</td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>

      <!-- TECHNICAL INSTRUCTIONS FOR OPERATOR -->
      <div class="tech-box">
        <div class="tech-title">ТЕХНОЛОГІЧНІ ВКАЗІВКИ ДЛЯ ОПЕРАТОРА ЧПУ ВЕРСТАТА:</div>
        <div class="tech-desc">
          1. <b>Ріжучий інструмент:</b> Спіральна компресійна твердосплавна фреза <b>Ø${toolDiam} мм</b> (запобігає сколам шпону на лицьовій та тильній сторонах фанери).<br>
          2. <b>Режими:</b> Робоча подача <b>${layout.feedRateMmMin || 3500} мм/хв</b>, частота обертання шпинделя <b>18 000–21 000 об/хв</b>, кількість проходів по глибині: <b>${layout.passes || 2} проходи</b>.<br>
          3. <b>Базування листа:</b> Лівий нижній кут столу (X0, Y0). Безпечна зона затискачів / вакуумного ущільнення — не менше <b>${layout.margin} мм</b> від зовнішнього краю листа.<br>
          4. <b>Утримуючі перемички (Holding Tabs):</b> На кожній панелі залишати по 2–3 мостики шириною 6–8 мм і товщиною 2–3 мм для утримання деталі від підриву під дією фрези.
        </div>
      </div>
    </div>

    <!-- SIGNATURE BLOCK -->
    <div style="border-top: 1.5px solid #0F172A; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10.5px; font-weight: 700;">
      <div>Розробив технолог: ____________________</div>
      <div>Начальник ЧПУ дільниці: ____________________</div>
      <div>Дата запуску в роботу: ____________________</div>
    </div>
  </div>

  <!-- SUBSEQUENT PAGES: VECTOR CNC SHEETS -->
  ${sheetPagesHtml}

  <script>
    window.addEventListener("load", function() {
      setTimeout(function() {
        window.print();
      }, 400);
    });
  </script>
</body>
</html>`;
}

/**
 * Opens a dedicated printable PDF window with the complete CNC Sheathing Nesting album.
 * Can export all sheets or a single chosen sheet with full Cyrillic support, A4 Landscape format,
 * vector sheet drawings, kerf widths, holding tabs, and shop traveler tables.
 */
export function exportSheathingNestingPDF(
  model: DomeModel,
  layout: SheathingSheetLayout,
  options?: {
    singleSheetIndex?: number;
    showKerf?: boolean;
    showToolpath?: boolean;
    showTabs?: boolean;
  }
): void {
  const html = generateSheathingNestingPDFHTML(model, layout, options);
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `karta_rozkroyu_chpu_kupol_${model.parameters.frequency}V.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
