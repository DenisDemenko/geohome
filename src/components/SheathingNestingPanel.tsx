import React, { useState, useMemo } from "react";
import { DomeModel, FaceTypeGroup } from "../core/types";
import { calculateSheetNesting } from "../core/sheathing";
import {
  generateSheathingNestingSVG,
  generateSheathingCNC_DXF,
  generateSingleTriangleBlueprintSVG,
  generateAllTrianglesBlueprintSVG,
  downloadFile
} from "../export/svgExport";
import { exportSheathingNestingPDF } from "../export/pdfExport";
import {
  Layers,
  Download,
  ChevronLeft,
  ChevronRight,
  Triangle,
  Ruler,
  Printer,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileCode,
  CheckCircle,
  FileSpreadsheet,
  Info,
  Clock,
  Scissors,
  Cpu,
  Settings2,
  Sliders,
  Eye,
  Check,
  Zap,
  Box,
  FileText,
  BookOpen
} from "lucide-react";

interface SheathingNestingPanelProps {
  model: DomeModel;
}

export const SheathingNestingPanel: React.FC<SheathingNestingPanelProps> = ({ model }) => {
  // Mode: "blueprints" (Креслення трикутників по типу) or "nesting" (ЧПУ нестінг на листах 2800x1250)
  const [viewMode, setViewMode] = useState<"blueprints" | "nesting">("nesting");

  // Selected triangle type for blueprints: "all" or specific (e.g. "A-A-B")
  const [selectedTriangleType, setSelectedTriangleType] = useState<string>("all");
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // CNC Sheet dimensions (Default: 2800 × 1250 mm plywood as requested)
  const [sheetSize, setSheetSize] = useState<{ w: number; h: number; name: string }>({
    w: 2800,
    h: 1250,
    name: "2800 × 1250 мм (ЧПУ формат, горизонт)"
  });

  // Router bit / end mill diameter: 4, 6, 8, 10, 12 mm
  const [toolDiameter, setToolDiameter] = useState<number>(6);

  // CNC Milling process parameters
  const [margin, setMargin] = useState<number>(15); // mm from edge for clamps/vacuum
  const [safetyGap, setSafetyGap] = useState<number>(2); // extra mm
  const [feedRateMmMin, setFeedRateMmMin] = useState<number>(3500); // cutting speed mm/min
  const [passes, setPasses] = useState<number>(2); // depth passes for 12-15mm plywood

  // CNC View Toggles
  const [showKerf, setShowKerf] = useState<boolean>(true);
  const [showToolpath, setShowToolpath] = useState<boolean>(true);
  const [showTabs, setShowTabs] = useState<boolean>(true);

  // Active Sheet pager
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  const groups = model.faceGroups;

  // Active group for single triangle view
  const activeGroup: FaceTypeGroup = useMemo(() => {
    return groups.find(g => g.type === selectedTriangleType) || groups[0];
  }, [groups, selectedTriangleType]);

  // Nesting layout calculation optimized for selected tool diameter & sheet size
  const nesting = useMemo(() => {
    return calculateSheetNesting(
      model,
      sheetSize.w,
      sheetSize.h,
      toolDiameter,
      margin,
      safetyGap,
      feedRateMmMin,
      passes
    );
  }, [
    model,
    sheetSize.w,
    sheetSize.h,
    toolDiameter,
    margin,
    safetyGap,
    feedRateMmMin,
    passes
  ]);

  // Ensure active sheet index is valid
  const safeSheetIndex = Math.min(
    activeSheetIndex,
    Math.max(0, nesting.totalSheetsRequired - 1)
  );

  // Current SVG depending on mode & selected type
  const currentBlueprintSvg = useMemo(() => {
    if (selectedTriangleType === "all") {
      return generateAllTrianglesBlueprintSVG(model);
    } else {
      return generateSingleTriangleBlueprintSVG(model, selectedTriangleType);
    }
  }, [model, selectedTriangleType]);

  const currentNestingSvg = useMemo(() => {
    return generateSheathingNestingSVG(nesting, safeSheetIndex, {
      showToolpath,
      showKerf,
      showTabs
    });
  }, [nesting, safeSheetIndex, showToolpath, showKerf, showTabs]);

  // Download Blueprint SVG
  const handleDownloadBlueprintSvg = () => {
    const filename =
      selectedTriangleType === "all"
        ? `sheathing_all_triangles_${model.parameters.frequency}V.svg`
        : `sheathing_triangle_type_${selectedTriangleType}_${model.parameters.frequency}V.svg`;
    downloadFile(filename, currentBlueprintSvg, "image/svg+xml;charset=utf-8");
  };

  // Download Sheet SVG for CNC
  const handleDownloadSheetSvg = () => {
    downloadFile(
      `sheathing_sheet_${safeSheetIndex + 1}_of_${nesting.totalSheetsRequired}_${sheetSize.w}x${sheetSize.h}_D${toolDiameter}mm.svg`,
      currentNestingSvg,
      "image/svg+xml;charset=utf-8"
    );
  };

  // Download all sheets as individual SVGs
  const handleDownloadAllSheetsSvg = () => {
    for (let i = 0; i < nesting.totalSheetsRequired; i++) {
      const svg = generateSheathingNestingSVG(nesting, i, {
        showToolpath,
        showKerf,
        showTabs
      });
      setTimeout(() => {
        downloadFile(
          `sheathing_sheet_${i + 1}_of_${nesting.totalSheetsRequired}_${sheetSize.w}x${sheetSize.h}_D${toolDiameter}mm.svg`,
          svg,
          "image/svg+xml;charset=utf-8"
        );
      }, i * 150);
    }
  };

  // Export single sheet to PDF
  const handleExportSheetPDF = () => {
    exportSheathingNestingPDF(model, nesting, {
      singleSheetIndex: safeSheetIndex,
      showKerf,
      showToolpath,
      showTabs
    });
  };

  // Export all sheets as complete CNC album to PDF
  const handleExportAllSheetsPDF = () => {
    exportSheathingNestingPDF(model, nesting, {
      showKerf,
      showToolpath,
      showTabs
    });
  };

  // Download DXF for CNC Routers (ArtCAM, Vectric, SheetCAM, Mach3)
  const handleDownloadDXF = () => {
    const dxfContent = generateSheathingCNC_DXF(nesting, safeSheetIndex);
    downloadFile(
      `sheathing_cnc_sheet_${safeSheetIndex + 1}_${sheetSize.w}x${sheetSize.h}_D${toolDiameter}mm.dxf`,
      dxfContent,
      "application/dxf"
    );
  };

  // Print sheet or blueprint A4
  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const svgToPrint = viewMode === "blueprints" ? currentBlueprintSvg : currentNestingSvg;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Розкрій обшивки — Лист ${safeSheetIndex + 1} (${sheetSize.w}×${sheetSize.h} мм)</title>
          <style>
            @page { size: A4 landscape; margin: 8mm; }
            body { margin: 0; padding: 0; background: #fff; display: flex; justify-content: center; align-items: center; }
            svg { width: 100%; height: auto; max-height: 95vh; }
          </style>
        </head>
        <body>
          ${svgToPrint}
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Available standard plywood cutter diameters
  const toolDiameters = [
    {
      diam: 4,
      desc: "Тонкий пропил, мінімум відходів, делікатна чистова обробка",
      rec: false
    },
    {
      diam: 6,
      desc: "Стандарт ЧПУ для фанери 12–15 мм, оптимальний баланс",
      rec: true
    },
    {
      diam: 8,
      desc: "Висока жорсткість фрези, швидка порізка на високій подачі",
      rec: false
    },
    {
      diam: 10,
      desc: "Промисловий розкрій товстих плит без вібрацій",
      rec: false
    },
    {
      diam: 12,
      desc: "Швидкісний пакетний розкрій великоформатних листів",
      rec: false
    }
  ];

  const currentSheetSummary = nesting.sheetsSummary?.[safeSheetIndex];

  return (
    <div className="flex flex-col gap-6">
      {/* Header Card */}
      <div className="flex flex-col gap-5 p-6 rounded-3xl tactile-card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-[#E8E2D8] gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[#FAF2DE] text-[#DDA843] shadow-xs">
              <Cpu className="w-5 h-5 text-[#B7791F]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A2E3B]">
                ЧПУ нестінг та креслення обшивки купола (фанера {sheetSize.w} × {sheetSize.h} мм)
              </h2>
              <p className="text-xs text-[#5A6778]">
                Автоматична розкладка трикутників з оптимізацією під фрези Ø4, 6, 8, 10, 12 мм, урахуванням пропилу та перемичок
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center p-1 rounded-2xl bg-[#FAF7F2] border border-[#E4DED3]">
            <button
              onClick={() => setViewMode("nesting")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                viewMode === "nesting"
                  ? "bg-[#DE7C5A] text-white shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>ЧПУ нестінг на листах</span>
            </button>

            <button
              onClick={() => setViewMode("blueprints")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                viewMode === "blueprints"
                  ? "bg-[#1A2E3B] text-white shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              <Ruler className="w-3.5 h-3.5" />
              <span>Креслення трикутників</span>
            </button>
          </div>
        </div>

        {/* Action Header bar for active mode */}
        {viewMode === "nesting" ? (
          <div className="flex flex-col gap-4">
            {/* Row 1: Sheet Format & Tool Diameter Selector */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-2xl bg-white/70 border border-[#E8E2D8]">
              {/* Sheet Format */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1.5">
                  <Box className="w-3.5 h-3.5 text-[#DE7C5A]" />
                  <span>Лист фанери:</span>
                </span>
                <select
                  value={`${sheetSize.w}x${sheetSize.h}`}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === "2800x1250") {
                      setSheetSize({ w: 2800, h: 1250, name: "2800 × 1250 мм (ЧПУ формат, горизонт)" });
                    } else if (val === "1250x2800") {
                      setSheetSize({ w: 1250, h: 2800, name: "1250 × 2800 мм (ЧПУ формат, вертикал)" });
                    } else if (val === "2500x1250") {
                      setSheetSize({ w: 2500, h: 1250, name: "2500 × 1250 мм (Євро-формат)" });
                    } else if (val === "1250x2500") {
                      setSheetSize({ w: 1250, h: 2500, name: "1250 × 2500 мм (Євро вертикал)" });
                    } else if (val === "2440x1220") {
                      setSheetSize({ w: 2440, h: 1220, name: "2440 × 1220 мм (4×8 фт)" });
                    } else {
                      setSheetSize({ w: 1525, h: 1525, name: "1525 × 1525 мм (Квадрат ФК)" });
                    }
                    setActiveSheetIndex(0);
                  }}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white border border-[#CBD5E0] text-[#1A2E3B] shadow-2xs outline-none cursor-pointer"
                >
                  <option value="2800x1250">⭐ 2800 × 1250 мм (ЧПУ формат фанери, горизонт)</option>
                  <option value="1250x2800">2800 × 1250 мм (ЧПУ формат, вертикал)</option>
                  <option value="2500x1250">2500 × 1250 мм (Євро-формат горизонт)</option>
                  <option value="1250x2500">1250 × 2500 мм (Євро-формат вертикал)</option>
                  <option value="2440x1220">2440 × 1220 мм (Американський 4×8 фт)</option>
                  <option value="1525x1525">1525 × 1525 мм (Квадратний лист ФК)</option>
                </select>
              </div>

              {/* Tool Diameter Selector (4, 6, 8, 10, 12 mm) */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1">
                  <Scissors className="w-3.5 h-3.5 text-[#2B6CB0]" />
                  <span>Діаметр фрези:</span>
                </span>
                <div className="flex items-center gap-1 bg-[#FAF7F2] p-1 rounded-xl border border-[#DCD6CA]">
                  {toolDiameters.map(t => {
                    const isSelected = toolDiameter === t.diam;
                    return (
                      <button
                        key={t.diam}
                        onClick={() => setToolDiameter(t.diam)}
                        title={t.desc}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                          isSelected
                            ? "bg-[#2B6CB0] text-white shadow-xs"
                            : "text-[#4A5568] hover:bg-white"
                        }`}
                      >
                        <span>Ø{t.diam}</span>
                        {t.rec && <span className="text-[9px] opacity-80">★</span>}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[11px] font-mono text-[#718096]">
                  (зазор різу {toolDiameter + safetyGap} мм)
                </span>
              </div>

              {/* Dedicated Export Buttons for CNC Map */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* SVG Export Group */}
                <div className="inline-flex items-center rounded-xl bg-white border border-[#E8E2D8] p-0.5 shadow-2xs">
                  <button
                    onClick={handleDownloadSheetSvg}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#DE7C5A] hover:bg-[#FDF0E6] transition-all whitespace-nowrap"
                    title={`Завантажити векторну карту розкрою листа #${safeSheetIndex + 1} у форматі SVG`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Карта розкрою (SVG)</span>
                  </button>
                  <button
                    onClick={handleDownloadAllSheetsSvg}
                    className="px-2 py-1.5 rounded-lg text-[10px] font-bold text-[#718096] hover:bg-[#FAF7F2] transition-all whitespace-nowrap border-l border-[#E8E2D8]"
                    title={`Завантажити всі ${nesting.totalSheetsRequired} листів у SVG`}
                  >
                    Всі {nesting.totalSheetsRequired} л.
                  </button>
                </div>

                {/* PDF Export Group */}
                <div className="inline-flex items-center rounded-xl bg-white border border-[#A6C7AE] p-0.5 shadow-2xs">
                  <button
                    onClick={handleExportAllSheetsPDF}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#1B4D2E] hover:bg-[#E1EDE3] transition-all whitespace-nowrap"
                    title="Сформувати повний інженерний PDF альбом ЧПУ розкрою (Паспорт + всі листи А4)"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#2E7D32]" />
                    <span>Карта розкрою (PDF)</span>
                  </button>
                  <button
                    onClick={handleExportSheetPDF}
                    className="px-2 py-1.5 rounded-lg text-[10px] font-bold text-[#3D6B5D] hover:bg-[#E1EDE3] transition-all whitespace-nowrap border-l border-[#A6C7AE]"
                    title={`Експортувати тільки поточний лист #${safeSheetIndex + 1} в PDF`}
                  >
                    Лист {safeSheetIndex + 1}
                  </button>
                </div>

                {/* DXF Export Button */}
                <button
                  onClick={handleDownloadDXF}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1A2E3B] text-white shadow-2xs hover:bg-[#2D3748] whitespace-nowrap"
                  title="Завантажити креслення листа у форматі AutoCAD DXF (R12) для ArtCAM, Aspire, SheetCAM"
                >
                  <Cpu className="w-3.5 h-3.5 text-[#DE7C5A]" />
                  <span>DXF для ЧПУ</span>
                </button>

                <button
                  onClick={handlePrint}
                  className="p-1.5 rounded-xl tactile-btn text-[#4A5568]"
                  title="Швидкий друк карти розкрою"
                >
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Row 2: Secondary CNC parameters and View Layer Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              {/* CNC Milling Inputs */}
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-1.5 text-[#5A6778]">
                  <span>Відступ краю:</span>
                  <input
                    type="number"
                    min={5}
                    max={50}
                    value={margin}
                    onChange={e => setMargin(Number(e.target.value))}
                    className="w-12 px-1.5 py-0.5 font-mono font-bold text-center bg-white border border-[#CBD5E0] rounded-md"
                  />
                  <span className="text-[10px]">мм</span>
                </label>

                <label className="flex items-center gap-1.5 text-[#5A6778]">
                  <span>Подача:</span>
                  <input
                    type="number"
                    step={250}
                    min={1000}
                    max={12000}
                    value={feedRateMmMin}
                    onChange={e => setFeedRateMmMin(Number(e.target.value))}
                    className="w-16 px-1.5 py-0.5 font-mono font-bold text-center bg-white border border-[#CBD5E0] rounded-md"
                  />
                  <span className="text-[10px]">мм/хв</span>
                </label>

                <label className="flex items-center gap-1.5 text-[#5A6778]">
                  <span>Кількість проходів:</span>
                  <select
                    value={passes}
                    onChange={e => setPasses(Number(e.target.value))}
                    className="px-2 py-0.5 font-mono font-bold bg-white border border-[#CBD5E0] rounded-md"
                  >
                    <option value={1}>1 прохід (чистовий)</option>
                    <option value={2}>2 проходи (рекомендовано 12–15 мм)</option>
                    <option value={3}>3 проходи (товста фанера 18 мм)</option>
                  </select>
                </label>
              </div>

              {/* Visualization Toggles */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-bold text-[#8C9BAE] uppercase">Шари:</span>
                <label className="flex items-center gap-1.5 cursor-pointer text-[#4A5568]">
                  <input
                    type="checkbox"
                    checked={showKerf}
                    onChange={e => setShowKerf(e.target.checked)}
                    className="rounded text-[#DE7C5A]"
                  />
                  <span>Пропил фрези (Kerf)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[#4A5568]">
                  <input
                    type="checkbox"
                    checked={showToolpath}
                    onChange={e => setShowToolpath(e.target.checked)}
                    className="rounded text-[#2B6CB0]"
                  />
                  <span>Траєкторія</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[#4A5568]">
                  <input
                    type="checkbox"
                    checked={showTabs}
                    onChange={e => setShowTabs(e.target.checked)}
                    className="rounded text-[#DE7C5A]"
                  />
                  <span>Перемички (Tabs)</span>
                </label>
              </div>
            </div>
          </div>
        ) : (
          /* Blueprint Mode Header */
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Triangle Types Selector */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
              <button
                onClick={() => setSelectedTriangleType("all")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                  selectedTriangleType === "all"
                    ? "bg-[#1A2E3B] text-white shadow-xs"
                    : "bg-white text-[#5A6778] hover:bg-white/90 border border-[#E8E2D8]"
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Всі типи трикутників на аркуші</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20">
                  {groups.length}
                </span>
              </button>

              {groups.map(g => {
                const isSelected = selectedTriangleType === g.type;
                return (
                  <button
                    key={g.type}
                    onClick={() => setSelectedTriangleType(g.type)}
                    className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap border ${
                      isSelected
                        ? "bg-white text-[#1A2E3B] border-[#B7791F] ring-2 ring-[#B7791F]/20 shadow-xs"
                        : "bg-white/80 hover:bg-white text-[#5A6778] border-[#E8E2D8]"
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: g.color }}
                    />
                    <span>Трикутник {g.type}</span>
                    <span className="font-mono text-[11px] text-[#2B6CB0]">
                      {g.lengths.join("×")} мм
                    </span>
                    <span className="text-[10px] font-bold text-[#2E7D32] bg-[#E1EDE3] px-1.5 py-0.2 rounded">
                      {g.count} шт
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="px-3 py-1.5 text-xs font-bold rounded-xl tactile-btn flex items-center gap-1.5 text-[#1A2E3B]"
                title="Друкувати креслення трикутників"
              >
                <Printer className="w-3.5 h-3.5 text-[#4A7C9B]" />
                <span>Друк A4</span>
              </button>
              <button
                onClick={handleDownloadBlueprintSvg}
                className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn-peach flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Завантажити SVG креслення</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Primary KPI Grid (CNC & Material Statistics) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 rounded-2xl tactile-card">
          <span className="text-[11px] text-[#5A6778] block mb-1">Потрібно листів</span>
          <span className="text-base font-mono font-bold text-[#1A2E3B]">
            {nesting.totalSheetsRequired} шт
          </span>
          <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
            {sheetSize.w} × {sheetSize.h} мм ({nesting.totalSheetAreaM2} м²)
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card">
          <span className="text-[11px] text-[#5A6778] block mb-1">Фреза & Пропил</span>
          <span className="text-base font-mono font-bold text-[#2B6CB0]">
            Ø{toolDiameter} мм
          </span>
          <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
            зазор між деталями {toolDiameter + safetyGap} мм
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card">
          <span className="text-[11px] text-[#5A6778] block mb-1">Коефіцієнт відходів</span>
          <span className="text-base font-mono font-bold text-[#2E7D32]">
            ~{nesting.wastePercentage}%
          </span>
          <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
            зустрічне гніздування
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card">
          <span className="text-[11px] text-[#5A6778] block mb-1">Довжина різу ЧПУ</span>
          <span className="text-base font-mono font-bold text-[#1A2E3B]">
            {nesting.totalLinearCutMeters} м
          </span>
          <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
            сумарний периметр контурів
          </span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-card-mint border border-white/80">
          <span className="text-[11px] text-[#1A3E26] font-bold block mb-1">Час розкрою</span>
          <span className="text-base font-mono font-black text-[#1B4D2E]">
            ~{nesting.estimatedMachiningMinutes} хв
          </span>
          <span className="text-[10px] text-[#2E7D32] block mt-0.5">
            {passes} проходи при {feedRateMmMin} мм/хв
          </span>
        </div>
      </div>

      {/* Main View Area */}
      {viewMode === "nesting" ? (
        /* ================= MODE 1: CNC SHEET NESTING ================= */
        <div className="flex flex-col gap-5">
          {/* Active Sheet Navigation Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl tactile-card gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveSheetIndex(prev => Math.max(0, prev - 1))}
                disabled={safeSheetIndex === 0}
                className="p-2 rounded-xl tactile-btn disabled:opacity-40"
                title="Попередній лист"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-3 py-1 rounded-xl bg-white border border-[#CBD5E0]">
                <span className="text-xs font-mono font-bold text-[#1A2E3B]">
                  Лист {safeSheetIndex + 1} з {nesting.totalSheetsRequired}
                </span>
              </div>
              <button
                onClick={() =>
                  setActiveSheetIndex(prev => Math.min(nesting.totalSheetsRequired - 1, prev + 1))
                }
                disabled={safeSheetIndex >= nesting.totalSheetsRequired - 1}
                className="p-2 rounded-xl tactile-btn disabled:opacity-40"
                title="Наступний лист"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Sheet Quick Jump Chips */}
              <div className="hidden lg:flex items-center gap-1.5 ml-2 overflow-x-auto max-w-md">
                {Array.from({ length: nesting.totalSheetsRequired }).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveSheetIndex(idx)}
                    className={`w-7 h-7 text-xs font-mono font-bold rounded-lg transition-all ${
                      idx === safeSheetIndex
                        ? "bg-[#DE7C5A] text-white shadow-2xs"
                        : "bg-white/80 hover:bg-white text-[#5A6778] border border-[#E8E2D8]"
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Current Sheet Quick Info */}
            {currentSheetSummary && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[#5A6778]">
                  Деталей на листі: <b>{currentSheetSummary.panelCount} шт</b> ({currentSheetSummary.typesSummary})
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-[#2B6CB0] font-mono">
                  Різ: <b>{currentSheetSummary.cutLengthM} м</b>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-[#2E7D32] font-mono">
                  Відходи: <b>~{currentSheetSummary.wastePct}%</b>
                </span>
              </div>
            )}
          </div>

          {/* CNC Sheet SVG Canvas Container */}
          <div className="flex flex-col gap-4 p-6 rounded-3xl tactile-card">
            {/* Canvas Toolbar */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#1A2E3B]">
                  Карта розкрою: Лист #{safeSheetIndex + 1} ({sheetSize.w} × {sheetSize.h} мм)
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FAF2DE] text-[#B7791F]">
                  Фреза Ø{toolDiameter} мм · Kerf={toolDiameter} мм
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Direct quick action export buttons */}
                <button
                  onClick={handleDownloadSheetSvg}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg tactile-btn text-[#DE7C5A] hover:bg-[#FDF0E6]"
                  title="Завантажити цей лист як векторний SVG"
                >
                  <Download className="w-3 h-3" />
                  <span>SVG лист</span>
                </button>
                <button
                  onClick={handleExportSheetPDF}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg tactile-btn text-[#2E7D32] hover:bg-[#E1EDE3]"
                  title="Експорт цього листа в PDF A4"
                >
                  <FileText className="w-3 h-3" />
                  <span>PDF лист</span>
                </button>
                <button
                  onClick={handleExportAllSheetsPDF}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg tactile-btn-mint text-[#1A3E26]"
                  title="Експорт повного альбому всіх листів в PDF"
                >
                  <BookOpen className="w-3 h-3" />
                  <span>PDF Альбом ({nesting.totalSheetsRequired} л.)</span>
                </button>
                <button
                  onClick={handleDownloadDXF}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-[#1A2E3B] text-white hover:bg-[#2D3748]"
                  title="Завантажити DXF для ЧПУ верстата"
                >
                  <Cpu className="w-3 h-3 text-[#DE7C5A]" />
                  <span>DXF</span>
                </button>

                <div className="h-4 w-px bg-[#CBD5E0] mx-1" />

                <button
                  onClick={() => setZoomScale(s => Math.max(0.6, s - 0.15))}
                  className="p-1.5 rounded-xl tactile-btn text-[#5A6778]"
                  title="Зменшити"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono font-bold text-[#5A6778] px-1">
                  {Math.round(zoomScale * 100)}%
                </span>
                <button
                  onClick={() => setZoomScale(s => Math.min(2.0, s + 0.15))}
                  className="p-1.5 rounded-xl tactile-btn text-[#5A6778]"
                  title="Збільшити"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomScale(1.0)}
                  className="p-1.5 rounded-xl tactile-btn text-[#5A6778]"
                  title="Масштаб 1:1"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* SVG Visualizer Box */}
            <div className="w-full rounded-2xl bg-[#FBF9F5] border border-[#DCD6CA] p-4 overflow-auto min-h-[460px] max-h-[780px] flex items-center justify-center shadow-inner">
              <div
                style={{
                  transform: `scale(${zoomScale})`,
                  transformOrigin: "top center",
                  transition: "transform 0.15s ease-out",
                  width: "100%",
                  maxWidth: "1050px"
                }}
                dangerouslySetInnerHTML={{ __html: currentNestingSvg }}
              />
            </div>
          </div>

          {/* CNC Cutting Table & Operations Specs */}
          <div className="p-5 rounded-3xl tactile-card">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#5A6778] mb-3 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-[#DE7C5A]" />
              <span>Технологічна карта для оператора ЧПУ верстата (фанера 2800 × 1250 мм)</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 rounded-2xl bg-white border border-[#E8E2D8] space-y-1.5">
                <span className="font-bold text-[#1A2E3B] block">1. Ріжучий інструмент</span>
                <p className="text-[#5A6778]">
                  Рекомендовано компресійну (двухзахідну спіральну) фрезу <b>Ø{toolDiameter} мм</b> для чистового різу без сколів верхнього та нижнього шпону фанери.
                </p>
                <span className="text-[11px] font-mono text-[#2B6CB0] block pt-1 border-t border-[#F0ECE1]">
                  Діаметр: {toolDiameter} мм | Зазор різу: {toolDiameter + safetyGap} мм
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-white border border-[#E8E2D8] space-y-1.5">
                <span className="font-bold text-[#1A2E3B] block">2. Режими різання</span>
                <p className="text-[#5A6778]">
                  Подача: <b>{feedRateMmMin} мм/хв</b>. Частота обертання шпинделя: <b>18 000 – 21 000 об/хв</b>. Заглиблення: <b>{passes} проходи</b> по 6–7.5 мм за прохід.
                </p>
                <span className="text-[11px] font-mono text-[#DE7C5A] block pt-1 border-t border-[#F0ECE1]">
                  Час листа: ~{Math.round(((nesting.estimatedMachiningMinutes || 45) / nesting.totalSheetsRequired) * 10) / 10} хв
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-white border border-[#E8E2D8] space-y-1.5">
                <span className="font-bold text-[#1A2E3B] block">3. Фіксація та перемички</span>
                <p className="text-[#5A6778]">
                  Лист затискається вакуумним столом або притисками в межах відступу <b>{margin} мм</b>. На кожній деталі передбачені утримуючі мостики <b>2 шт × 8 мм</b>.
                </p>
                <span className="text-[11px] font-mono text-[#2E7D32] block pt-1 border-t border-[#F0ECE1]">
                  Базування: Кут X0 Y0 (нижній лівий кут столу)
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= MODE 2: TRIANGLE BLUEPRINTS ================= */
        <div className="flex flex-col gap-5">
          {/* Blueprint Canvas Container */}
          <div className="flex flex-col gap-4 p-6 rounded-3xl tactile-card">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#1A2E3B]">
                  {selectedTriangleType === "all"
                    ? "Зведене технічне креслення всіх типів трикутників обшивки"
                    : `Робоче креслення: Трикутна панель типу ${activeGroup.type} (${activeGroup.lengths.join("×")} мм)`}
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FAF2DE] text-[#B7791F]">
                  Векторне креслення CAD / ЧПК
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setZoomScale(s => Math.max(0.6, s - 0.15))}
                  className="p-1.5 rounded-xl tactile-btn text-[#5A6778]"
                  title="Зменшити"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono font-bold text-[#5A6778] px-1.5">
                  {Math.round(zoomScale * 100)}%
                </span>
                <button
                  onClick={() => setZoomScale(s => Math.min(2.0, s + 0.15))}
                  className="p-1.5 rounded-xl tactile-btn text-[#5A6778]"
                  title="Збільшити"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomScale(1.0)}
                  className="p-1.5 rounded-xl tactile-btn text-[#5A6778]"
                  title="Масштаб 1:1"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* SVG Viewer */}
            <div className="w-full rounded-2xl bg-[#FBF9F5] border border-[#DCD6CA] p-4 overflow-auto min-h-[440px] max-h-[750px] flex items-center justify-center shadow-inner">
              <div
                style={{
                  transform: `scale(${zoomScale})`,
                  transformOrigin: "top center",
                  transition: "transform 0.15s ease-out",
                  width: "100%",
                  maxWidth: selectedTriangleType === "all" ? "1050px" : "900px"
                }}
                dangerouslySetInnerHTML={{ __html: currentBlueprintSvg }}
              />
            </div>
          </div>

          {/* Cards for each triangle type */}
          <div>
            <h3 className="text-xs font-bold tracking-wide text-[#5A6778] mb-3 uppercase">
              Специфікація та параметри трикутників обшивки ({groups.length} типів):
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {groups.map(fg => {
                const isSelected = selectedTriangleType === fg.type;
                const perimeter = fg.lengths.reduce((a, b) => a + b, 0);
                const totalTypeArea = Math.round(fg.area * fg.count * 100) / 100;

                return (
                  <div
                    key={fg.type}
                    onClick={() => setSelectedTriangleType(fg.type)}
                    className={`p-4 rounded-2xl cursor-pointer transition-all border ${
                      isSelected
                        ? "bg-white border-[#B7791F] ring-2 ring-[#B7791F]/20 shadow-md"
                        : "bg-white/80 hover:bg-white border-[#E4DED3] shadow-xs"
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E8E2D8]">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-md shadow-2xs"
                          style={{ backgroundColor: fg.color }}
                        />
                        <span className="font-bold text-sm text-[#1A2E3B]">
                          Трикутник {fg.type}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-[#E1EDE3] text-[#1A3E26]">
                        {fg.count} шт
                      </span>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#5A6778]">Сторони (L₁ × L₂ × L₃):</span>
                        <span className="font-mono font-bold text-[#2B6CB0]">
                          {fg.lengths.join(" × ")} мм
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5A6778]">Ребра купола:</span>
                        <span className="font-mono font-bold text-[#1A2E3B]">
                          Балки [{fg.edges.join(", ")}]
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5A6778]">Кути вершин (∠A, ∠B, ∠C):</span>
                        <span className="font-mono font-bold text-[#C05621]">
                          {fg.angles.join("° / ")}°
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5A6778]">Фаски прилягання:</span>
                        <span className="font-mono font-bold text-[#9A3412]">
                          {fg.dihedralBevels.join("° / ")}°
                        </span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-[#F0ECE1]">
                        <span className="text-[#5A6778]">Площа однієї панелі:</span>
                        <span className="font-mono font-bold text-[#2E7D32]">
                          {fg.area} м² (Всього: {totalTypeArea} м²)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5A6778]">Периметр (шов):</span>
                        <span className="font-mono text-[#5A6778]">
                          {(perimeter / 1000).toFixed(2)} м
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        const svg = generateSingleTriangleBlueprintSVG(model, fg.type);
                        downloadFile(
                          `sheathing_triangle_${fg.type}_${model.parameters.frequency}V.svg`,
                          svg,
                          "image/svg+xml;charset=utf-8"
                        );
                      }}
                      className="w-full mt-3 py-1.5 px-3 text-xs font-bold rounded-xl tactile-btn flex items-center justify-center gap-1.5 text-[#1A2E3B]"
                    >
                      <Download className="w-3.5 h-3.5 text-[#B7791F]" />
                      <span>Завантажити креслення типу {fg.type}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
