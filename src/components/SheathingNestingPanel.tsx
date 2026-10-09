import React, { useState, useMemo, useEffect } from "react";
import {
  DomeModel,
  FaceTypeGroup,
  DomeParameters,
  Frequency,
  DomeCutType,
  InnerSheathingParams,
  SheathingParams,
  FabricRollNestingLayout,
  FabricStrip
} from "../core/types";
import {
  calculateSheetNesting,
  calculateWindowNesting,
  calculateInnerSheathingNesting,
  calculateSolarNesting,
  calculateFabricRollNesting,
  PLYWOOD_MATERIALS,
  STANDARD_SHEET_SIZES,
  STANDARD_GLAZING_SHEET_SIZES,
  getRecommendedSheetFormat
} from "../core/sheathing";
import {
  INNER_SHEATHING_MATERIALS,
  DEFAULT_INNER_SHEATHING_PARAMS
} from "../core/conversions";
import {
  generateSheathingNestingSVG,
  generateSheathingCNC_DXF,
  generateSingleTriangleBlueprintSVG,
  generateAllTrianglesBlueprintSVG,
  generateFabricRollNestingSVG,
  downloadFile
} from "../export/svgExport";
import {
  generateSheathingSheetDXF,
  generateAllSheathingSheetsDXF,
  generateSheathingTrianglesDXF,
  generateFabricRollDXF,
  downloadDXF
} from "../export/dxfExport";
import { exportSheathingNestingPDF } from "../export/pdfExport";
import { InsulationCalculatorPanel } from "./InsulationCalculatorPanel";
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
  BookOpen,
  AlertTriangle,
  Plus,
  Minus,
  Home,
  Sun,
  DoorOpen,
  Trash2,
  Thermometer
} from "lucide-react";

interface SheathingNestingPanelProps {
  model: DomeModel;
  params?: DomeParameters;
  onChangeParams?: (newParams: DomeParameters) => void;
  innerSheathingParams?: InnerSheathingParams;
  onChangeInnerSheathingParams?: (params: Partial<InnerSheathingParams>) => void;
  sheathingParams?: SheathingParams;
  onChangeSheathingParams?: (params: SheathingParams) => void;
  fabricStripFaceIds?: number[];
  onToggleFabricStripFace?: (faceId: number) => void;
  onSetFabricStripFaceIds?: (faceIds: number[]) => void;
  onCopyWindowsToFabricStrip?: () => void;
  onClearFabricStrip?: () => void;
  onNavigateTo3D?: () => void;
}

export const SheathingNestingPanel: React.FC<SheathingNestingPanelProps> = ({
  model,
  params,
  onChangeParams,
  innerSheathingParams,
  onChangeInnerSheathingParams,
  sheathingParams,
  onChangeSheathingParams,
  fabricStripFaceIds,
  onToggleFabricStripFace,
  onSetFabricStripFaceIds,
  onCopyWindowsToFabricStrip,
  onClearFabricStrip,
  onNavigateTo3D
}) => {
  const currentParams = params || model.parameters;

  const frequencies: Frequency[] = [1, 2, 3, 4, 5, 6];
  const cutOptions: { id: DomeCutType; label: string; short: string; desc: string }[] = [
    { id: "1/2", label: "1/2", short: "Півсфера", desc: "Півсфера (H = 50% Ø)" },
    { id: "3/8", label: "3/8", short: "Низький", desc: "Низький купол (H = 38% Ø)" },
    { id: "5/8", label: "5/8", short: "Високий", desc: "Високий купол (H = 62% Ø)" },
    { id: "7/12", label: "7/12", short: "Стіна", desc: "Оптимальна вертикальна стіна (H = 58% Ø)" }
  ];

  const handleUpdateParams = (partial: Partial<DomeParameters>) => {
    const updated: DomeParameters = {
      ...currentParams,
      ...partial
    };
    if (partial.cutType && !partial.height) {
      const radius = updated.diameter / 2;
      if (partial.cutType === "1/2") updated.height = radius;
      else if (partial.cutType === "3/8") updated.height = Math.round(updated.diameter * 0.38);
      else if (partial.cutType === "5/8") updated.height = Math.round(updated.diameter * 0.62);
      else if (partial.cutType === "7/12") updated.height = Math.round(updated.diameter * 0.583);
    }
    if (partial.diameter && !partial.height) {
      const ratio = currentParams.height / currentParams.diameter;
      updated.height = Math.round(partial.diameter * (ratio || 0.5));
    }
    if (onChangeParams) {
      onChangeParams(updated);
    }
  };
  // Mode: "nesting" (ЧПУ нестінг на листах) | "blueprints" (Креслення трикутників) | "insulation" (Утеплювач & Теплоємність)
  const [viewMode, setViewMode] = useState<"blueprints" | "nesting" | "insulation">("nesting");

  // Selected triangle type for blueprints: "all" or specific (e.g. "A-A-B")
  const [selectedTriangleType, setSelectedTriangleType] = useState<string>("all");
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // CNC Milling process parameters
  const [margin, setMargin] = useState<number>(15); // mm from edge for clamps/vacuum
  const [safetyGap, setSafetyGap] = useState<number>(2); // extra mm
  const [feedRateMmMin, setFeedRateMmMin] = useState<number>(3500); // cutting speed mm/min
  const [passes, setPasses] = useState<number>(2); // depth passes for 12-15mm plywood

  // Recommended sheet size based on dome triangle dimensions
  const recommendedFormat = useMemo(() => {
    return getRecommendedSheetFormat(model, margin);
  }, [model, margin]);

  // CNC Sheet dimensions: automatically defaults to recommended format (e.g. 3050x1525 for domes >= 7m)
  const [sheetSize, setSheetSize] = useState<{ w: number; h: number; name: string }>(() => {
    const rec = getRecommendedSheetFormat(model, 15);
    return { w: rec.w, h: rec.h, name: rec.name };
  });

  // Track if user manually overrode format
  const [userSelectedFormat, setUserSelectedFormat] = useState(false);

  // Auto-adapt if model changes
  useEffect(() => {
    if (!userSelectedFormat && recommendedFormat.requiresJumbo && sheetSize.h < 1525) {
      setSheetSize({ w: recommendedFormat.w, h: recommendedFormat.h, name: recommendedFormat.name });
    }
  }, [recommendedFormat, userSelectedFormat, sheetSize.h]);

  // Router bit / end mill diameter: 4, 6, 8, 10, 12 mm
  const [toolDiameter, setToolDiameter] = useState<number>(6);

  // CNC View Toggles
  const [showKerf, setShowKerf] = useState<boolean>(true);
  const [showToolpath, setShowToolpath] = useState<boolean>(true);
  const [showTabs, setShowTabs] = useState<boolean>(true);

  // Active Sheet pagers for each material layer
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [activeWindowSheetIndex, setActiveWindowSheetIndex] = useState(0);
  const [activeInnerSheetIndex, setActiveInnerSheetIndex] = useState(0);
  const [activeSolarSheetIndex, setActiveSolarSheetIndex] = useState(0);

  // Material tab for nesting: "sheathing" | "fabric_roll" | "inner_sheathing" | "windows" | "solar"
  const [nestingMaterialTab, setNestingMaterialTab] = useState<"sheathing" | "fabric_roll" | "inner_sheathing" | "windows" | "solar">(() => {
    return sheathingParams?.material === "fabric_roll" ? "fabric_roll" : "sheathing";
  });

  // Fabric Roll Parameters: roll width (500 to 2000 mm), seam allowance for thread sewing (10 to 60 mm), hem allowance
  const [fabricRollWidthMm, setFabricRollWidthMm] = useState<number>(() => {
    return Math.max(500, Math.min(2000, sheathingParams?.fabricRollWidthMm || 1500));
  });
  const [fabricSeamAllowanceMm, setFabricSeamAllowanceMm] = useState<number>(() => {
    return Math.max(10, Math.min(60, sheathingParams?.seamAllowanceMm || 25));
  });
  const [fabricHemAllowanceMm, setFabricHemAllowanceMm] = useState<number>(() => {
    return Math.max(30, Math.min(400, sheathingParams?.hemBaseAllowanceMm || 150));
  });
  const [fabricGrammageGsm, setFabricGrammageGsm] = useState<number>(() => {
    return sheathingParams?.fabricGrammageGsm || 650;
  });
  const [activeFabricStripIndex, setActiveFabricStripIndex] = useState<number>(0);
  const [showAllStripsRollView, setShowAllStripsRollView] = useState<boolean>(false);
  const [showTrianglesOnFabric, setShowTrianglesOnFabric] = useState<boolean>(true);
  const [showNodesOnFabric, setShowNodesOnFabric] = useState<boolean>(true);
  const [showDimensionsOnFabric, setShowDimensionsOnFabric] = useState<boolean>(true);
  const [showNodeLabelsOnFabric, setShowNodeLabelsOnFabric] = useState<boolean>(true);
  const [selectedStripTriangleId, setSelectedStripTriangleId] = useState<number | null>(null);
  const [selectedStripNodeId, setSelectedStripNodeId] = useState<number | null>(null);
  const [fabricDetailTab, setFabricDetailTab] = useState<"triangles" | "nodes">("triangles");

  // Reset selected triangle/node when changing active strip
  useEffect(() => {
    setSelectedStripTriangleId(null);
    setSelectedStripNodeId(null);
  }, [activeFabricStripIndex]);

  // Sync if sheathingParams changed to fabric_roll externally
  useEffect(() => {
    if (sheathingParams?.material === "fabric_roll" && nestingMaterialTab !== "fabric_roll") {
      setNestingMaterialTab("fabric_roll");
    }
  }, [sheathingParams?.material]);

  // Update fabric parameters
  const updateFabricParams = (updates: {
    widthMm?: number;
    seamMm?: number;
    hemMm?: number;
    gsm?: number;
  }) => {
    const newWidth = updates.widthMm !== undefined ? Math.max(500, Math.min(2000, updates.widthMm)) : fabricRollWidthMm;
    const newSeam = updates.seamMm !== undefined ? Math.max(10, Math.min(60, updates.seamMm)) : fabricSeamAllowanceMm;
    const newHem = updates.hemMm !== undefined ? Math.max(30, Math.min(400, updates.hemMm)) : fabricHemAllowanceMm;
    const newGsm = updates.gsm !== undefined ? updates.gsm : fabricGrammageGsm;

    if (updates.widthMm !== undefined) setFabricRollWidthMm(newWidth);
    if (updates.seamMm !== undefined) setFabricSeamAllowanceMm(newSeam);
    if (updates.hemMm !== undefined) setFabricHemAllowanceMm(newHem);
    if (updates.gsm !== undefined) setFabricGrammageGsm(newGsm);

    if (onChangeSheathingParams && sheathingParams) {
      onChangeSheathingParams({
        ...sheathingParams,
        material: "fabric_roll",
        fabricRollWidthMm: newWidth,
        seamAllowanceMm: newSeam,
        hemBaseAllowanceMm: newHem,
        fabricGrammageGsm: newGsm
      });
    }
  };

  // Continuous Fabric Roll Nesting Layout
  const fabricRollLayout = useMemo(() => {
    return calculateFabricRollNesting(
      model,
      fabricRollWidthMm,
      fabricSeamAllowanceMm,
      fabricHemAllowanceMm,
      fabricGrammageGsm,
      fabricStripFaceIds
    );
  }, [
    model,
    fabricRollWidthMm,
    fabricSeamAllowanceMm,
    fabricHemAllowanceMm,
    fabricGrammageGsm,
    fabricStripFaceIds
  ]);


  const groups = model.faceGroups;

  // Active group for single triangle view
  const activeGroup: FaceTypeGroup = useMemo(() => {
    return groups.find(g => g.type === selectedTriangleType) || groups[0];
  }, [groups, selectedTriangleType]);

  // Nesting layout calculation optimized for selected tool diameter & sheet size (Solid Plywood/OSB)
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

  // Window conversion nesting layout (Dedicated sheets for acrylic/polycarbonate/glass)
  const windowNesting = useMemo(() => {
    return calculateWindowNesting(model);
  }, [model]);

  // Selected inner sheathing material
  const currentInnerMaterial = innerSheathingParams?.material || "drywall";
  const innerMatConfig = INNER_SHEATHING_MATERIALS.find(m => m.id === currentInnerMaterial) || INNER_SHEATHING_MATERIALS[0];

  // Inner sheathing nesting layout (Gypsum drywall, Chipboard, OSB, Plywood FK)
  const innerNesting = useMemo(() => {
    return calculateInnerSheathingNesting(
      model,
      innerMatConfig.standardSheet.w,
      innerMatConfig.standardSheet.h,
      toolDiameter,
      margin,
      safetyGap,
      feedRateMmMin,
      1,
      innerMatConfig.name
    );
  }, [model, innerMatConfig, toolDiameter, margin, safetyGap, feedRateMmMin]);

  // Solar BIPV nesting layout
  const solarNesting = useMemo(() => {
    return calculateSolarNesting(model);
  }, [model]);

  const hasWindows = (model.windowFaceIds?.length || 0) > 0 && windowNesting.totalPanels > 0;
  const hasSolar = (model.solarFaceIds?.length || 0) > 0 && solarNesting.totalPanels > 0;
  const hasDoor = (model.doorFaceIds?.length || 0) > 0;

  // Active layout for view and exports
  const activeLayout = useMemo(() => {
    if (nestingMaterialTab === "inner_sheathing") return innerNesting;
    if (nestingMaterialTab === "windows" && hasWindows) return windowNesting;
    if (nestingMaterialTab === "solar" && hasSolar) return solarNesting;
    return nesting;
  }, [nestingMaterialTab, innerNesting, windowNesting, solarNesting, nesting, hasWindows, hasSolar]);

  const isViewingWindows = nestingMaterialTab === "windows" && hasWindows;
  const isViewingInner = nestingMaterialTab === "inner_sheathing";
  const isViewingSolar = nestingMaterialTab === "solar" && hasSolar;

  // Keep activeSheetIndex in valid range when frequency / dome size changes
  useEffect(() => {
    if (activeSheetIndex >= nesting.totalSheetsRequired) {
      setActiveSheetIndex(Math.max(0, nesting.totalSheetsRequired - 1));
    }
    if (activeWindowSheetIndex >= windowNesting.totalSheetsRequired) {
      setActiveWindowSheetIndex(Math.max(0, windowNesting.totalSheetsRequired - 1));
    }
    if (activeInnerSheetIndex >= innerNesting.totalSheetsRequired) {
      setActiveInnerSheetIndex(Math.max(0, innerNesting.totalSheetsRequired - 1));
    }
    if (activeSolarSheetIndex >= solarNesting.totalSheetsRequired) {
      setActiveSolarSheetIndex(Math.max(0, solarNesting.totalSheetsRequired - 1));
    }
  }, [
    nesting.totalSheetsRequired,
    windowNesting.totalSheetsRequired,
    innerNesting.totalSheetsRequired,
    solarNesting.totalSheetsRequired,
    activeSheetIndex,
    activeWindowSheetIndex,
    activeInnerSheetIndex,
    activeSolarSheetIndex
  ]);

  // Ensure active sheet index is valid for active layout
  const currentSheetIndex =
    nestingMaterialTab === "inner_sheathing"
      ? activeInnerSheetIndex
      : nestingMaterialTab === "windows"
      ? activeWindowSheetIndex
      : nestingMaterialTab === "solar"
      ? activeSolarSheetIndex
      : activeSheetIndex;

  const safeSheetIndex = Math.min(
    currentSheetIndex,
    Math.max(0, activeLayout.totalSheetsRequired - 1)
  );

  const setCurrentSheetIndex = (updater: (prev: number) => number) => {
    if (nestingMaterialTab === "inner_sheathing") {
      setActiveInnerSheetIndex(updater);
    } else if (nestingMaterialTab === "windows") {
      setActiveWindowSheetIndex(updater);
    } else if (nestingMaterialTab === "solar") {
      setActiveSolarSheetIndex(updater);
    } else {
      setActiveSheetIndex(updater);
    }
  };

  const setSpecificSheetIndex = (idx: number) => {
    if (nestingMaterialTab === "inner_sheathing") {
      setActiveInnerSheetIndex(idx);
    } else if (nestingMaterialTab === "windows") {
      setActiveWindowSheetIndex(idx);
    } else if (nestingMaterialTab === "solar") {
      setActiveSolarSheetIndex(idx);
    } else {
      setActiveSheetIndex(idx);
    }
  };

  // Current SVG depending on mode & selected type
  const currentBlueprintSvg = useMemo(() => {
    if (selectedTriangleType === "all") {
      return generateAllTrianglesBlueprintSVG(model);
    } else {
      return generateSingleTriangleBlueprintSVG(model, selectedTriangleType);
    }
  }, [model, selectedTriangleType]);

  const currentNestingSvg = useMemo(() => {
    return generateSheathingNestingSVG(activeLayout, safeSheetIndex, {
      showToolpath,
      showKerf,
      showTabs
    });
  }, [activeLayout, safeSheetIndex, showToolpath, showKerf, showTabs]);

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
    const prefix = isViewingWindows ? "window_sheet" : "sheathing_sheet";
    const matName = isViewingWindows ? "plastic_glass" : "plywood";
    downloadFile(
      `${prefix}_${safeSheetIndex + 1}_of_${activeLayout.totalSheetsRequired}_${activeLayout.sheetWidth}x${activeLayout.sheetHeight}_${matName}.svg`,
      currentNestingSvg,
      "image/svg+xml;charset=utf-8"
    );
  };

  // Download all sheets as individual SVGs
  const handleDownloadAllSheetsSvg = () => {
    for (let i = 0; i < activeLayout.totalSheetsRequired; i++) {
      const svg = generateSheathingNestingSVG(activeLayout, i, {
        showToolpath,
        showKerf,
        showTabs
      });
      const prefix = isViewingWindows ? "window_sheet" : "sheathing_sheet";
      setTimeout(() => {
        downloadFile(
          `${prefix}_${i + 1}_of_${activeLayout.totalSheetsRequired}_${activeLayout.sheetWidth}x${activeLayout.sheetHeight}.svg`,
          svg,
          "image/svg+xml;charset=utf-8"
        );
      }, i * 150);
    }
  };

  // Export single sheet to PDF
  const handleExportSheetPDF = () => {
    exportSheathingNestingPDF(model, activeLayout, {
      singleSheetIndex: safeSheetIndex,
      showKerf,
      showToolpath,
      showTabs
    });
  };

  // Export all sheets as complete CNC album to PDF (outer sheathing, inner sheathing, or windows/solar)
  const handleExportAllSheetsPDF = () => {
    exportSheathingNestingPDF(model, activeLayout, {
      showKerf,
      showToolpath,
      showTabs
    });
  };

  // Download DXF of active sheet for CNC Routers (ArtCAM, Vectric, SheetCAM, Mach3)
  const handleDownloadDXF = () => {
    const dxfContent = generateSheathingSheetDXF(activeLayout, safeSheetIndex);
    const prefix = isViewingWindows ? "window_sheet" : "sheathing_sheet";
    downloadDXF(
      `${prefix}_${safeSheetIndex + 1}_of_${activeLayout.totalSheetsRequired}_${activeLayout.sheetWidth}x${activeLayout.sheetHeight}.dxf`,
      dxfContent
    );
  };

  // Download master DXF containing ALL nesting sheets
  const handleDownloadAllSheetsDXF = () => {
    const dxfContent = generateAllSheathingSheetsDXF(nesting);
    downloadDXF(
      `sheathing_all_sheets_${nesting.totalSheetsRequired}_${sheetSize.w}x${sheetSize.h}_D${toolDiameter}mm.dxf`,
      dxfContent
    );
  };

  // Download unique triangles blueprints in DXF
  const handleDownloadTrianglesDXF = () => {
    const dxfContent = generateSheathingTrianglesDXF(model);
    downloadDXF(
      `sheathing_triangles_blueprints_${model.parameters.frequency}V.dxf`,
      dxfContent
    );
  };

  const isViewingFabric = nestingMaterialTab === "fabric_roll";

  // Current Fabric SVG (single strip or full roll)
  const currentFabricSvg = useMemo(() => {
    return generateFabricRollNestingSVG(
      fabricRollLayout,
      showAllStripsRollView ? -1 : activeFabricStripIndex,
      {
        showSeamLines: true,
        showHems: true,
        showCenterline: true,
        showTriangles: showTrianglesOnFabric,
        showNodes: showNodesOnFabric,
        showDimensions: showDimensionsOnFabric,
        showNodeLabels: showNodeLabelsOnFabric,
        highlightedTriangleId: selectedStripTriangleId,
        highlightedNodeId: selectedStripNodeId
      }
    );
  }, [
    fabricRollLayout,
    showAllStripsRollView,
    activeFabricStripIndex,
    showTrianglesOnFabric,
    showNodesOnFabric,
    showDimensionsOnFabric,
    showNodeLabelsOnFabric,
    selectedStripTriangleId,
    selectedStripNodeId
  ]);

  // Download Fabric SVG
  const handleDownloadFabricSvg = () => {
    if (showAllStripsRollView) {
      downloadFile(
        `fabric_roll_all_${fabricRollLayout.totalStrips}_strips_${fabricRollLayout.rollWidthMm}mm.svg`,
        currentFabricSvg,
        "image/svg+xml;charset=utf-8"
      );
    } else {
      const cur = fabricRollLayout.strips[activeFabricStripIndex] || fabricRollLayout.strips[0];
      downloadFile(
        `fabric_strip_${cur?.id || 1}_${cur?.cutLengthMm || 0}mm_W${fabricRollLayout.rollWidthMm}mm.svg`,
        currentFabricSvg,
        "image/svg+xml;charset=utf-8"
      );
    }
  };

  // Download Fabric DXF (AutoCAD 2000 / Fusion 360 / Cutting Plotters)
  const handleDownloadFabricDXF = () => {
    if (showAllStripsRollView) {
      const dxfContent = generateFabricRollDXF(fabricRollLayout, -1);
      downloadDXF(
        `fabric_roll_all_${fabricRollLayout.totalStrips}_strips_${fabricRollLayout.rollWidthMm}mm.dxf`,
        dxfContent
      );
    } else {
      const cur = fabricRollLayout.strips[activeFabricStripIndex] || fabricRollLayout.strips[0];
      const dxfContent = generateFabricRollDXF(fabricRollLayout, activeFabricStripIndex);
      downloadDXF(
        `fabric_strip_${cur?.id || 1}_${cur?.cutLengthMm || 0}mm_W${fabricRollLayout.rollWidthMm}mm.dxf`,
        dxfContent
      );
    }
  };

  // Print sheet or blueprint A4
  const handlePrint = () => {
    const svgToPrint =
      nestingMaterialTab === "fabric_roll"
        ? currentFabricSvg
        : viewMode === "blueprints"
        ? currentBlueprintSvg
        : currentNestingSvg;
    const title =
      nestingMaterialTab === "fabric_roll"
        ? `Розкрій тенту — Рулон ${fabricRollLayout.rollWidthMm} мм (${fabricRollLayout.totalLinearMeters} м.п.)`
        : `Розкрій обшивки — Лист ${safeSheetIndex + 1} (${sheetSize.w}×${sheetSize.h} мм)`;

    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    document.body.appendChild(printFrame);

    const doc = printFrame.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${title}</title>
            <style>
              @page { size: A4 landscape; margin: 8mm; }
              body { margin: 0; padding: 0; background: #fff; display: flex; justify-content: center; align-items: center; }
              svg { width: 100%; height: auto; max-height: 95vh; }
            </style>
          </head>
          <body>
            ${svgToPrint}
          </body>
        </html>
      `);
      doc.close();
      setTimeout(() => {
        try {
          printFrame.contentWindow?.focus();
          printFrame.contentWindow?.print();
        } catch (e) {
          // ignore
        }
        setTimeout(() => {
          try {
            document.body.removeChild(printFrame);
          } catch (e) {
            // ignore
          }
        }, 1500);
      }, 300);
    }
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

  const currentSheetSummary = activeLayout.sheetsSummary?.[safeSheetIndex];

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
                ЧПУ нестінг та розкрій обшивки купола ({activeLayout.materialName || "Фанера"} {activeLayout.sheetWidth} × {activeLayout.sheetHeight} мм)
              </h2>
              <p className="text-xs text-[#5A6778]">
                Автоматична розкладка зовнішньої та внутрішньої обшивки (гіпсокартон, OSB, ДСП, фанера), розкрій вікон та сонячних панелей
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center p-1 rounded-2xl bg-[#FAF7F2] border border-[#E4DED3] flex-wrap gap-1">
            <button
              onClick={() => setViewMode("nesting")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
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
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                viewMode === "blueprints"
                  ? "bg-[#1A2E3B] text-white shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              <Ruler className="w-3.5 h-3.5" />
              <span>Креслення трикутників</span>
            </button>

            <button
              onClick={() => setViewMode("insulation")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                viewMode === "insulation"
                  ? "bg-[#D97706] text-white shadow-xs"
                  : "text-[#B45309] hover:bg-[#FEF3C7]"
              }`}
            >
              <Thermometer className="w-3.5 h-3.5" />
              <span>Утеплювач & Теплоємність</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${viewMode === "insulation" ? "bg-white/25 text-white" : "bg-[#FEF3C7] text-[#92400E]"}`}>
                Мінвата / Пінопласт
              </span>
            </button>
          </div>
        </div>

        {/* Action Header bar for active mode */}
        {viewMode === "nesting" ? (
          <div className="flex flex-col gap-4">
            {/* Multi-Material Layer Tabs: Outer Sheathing vs Inner Sheathing vs Windows vs Solar */}
            <div className="flex items-center gap-2 bg-[#FAF7F2] p-1.5 rounded-2xl border border-[#DCD6CA] flex-wrap">
              {/* 1. Outer Sheathing */}
              <button
                onClick={() => {
                  setNestingMaterialTab("sheathing");
                  if (onChangeSheathingParams && sheathingParams && sheathingParams.material === "fabric_roll") {
                    onChangeSheathingParams({ ...sheathingParams, material: "plywood_birch" });
                  }
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  nestingMaterialTab === "sheathing"
                    ? "bg-[#1A2E3B] text-white shadow-xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
              >
                <span>🪵 Зовнішня обшивка (Фанера / OSB)</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${nestingMaterialTab === "sheathing" ? 'bg-white/20 text-white' : 'bg-black/5 text-[#5A6778]'}`}>
                  {nesting.totalPanels} шт · {nesting.totalSheetsRequired} л.
                </span>
              </button>

              {/* 2. Fabric Roll / Tent (Тент / Рулон тканини) */}
              <button
                onClick={() => {
                  setNestingMaterialTab("fabric_roll");
                  if (onChangeSheathingParams && sheathingParams && sheathingParams.material !== "fabric_roll") {
                    onChangeSheathingParams({ ...sheathingParams, material: "fabric_roll" });
                  }
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  nestingMaterialTab === "fabric_roll"
                    ? "bg-[#D97706] text-white shadow-xs"
                    : "text-[#B45309] hover:bg-[#FEF3C7]"
                }`}
              >
                <span>🎪 Тент / Рулон тканини (ПВХ / Oxford)</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${nestingMaterialTab === "fabric_roll" ? 'bg-white/20 text-white' : 'bg-[#FEF3C7] text-[#92400E]'}`}>
                  {fabricRollLayout.totalStrips} смуг · {fabricRollLayout.totalLinearMeters} м.п.
                </span>
              </button>

              {/* 2. Inner Sheathing */}
              <button
                onClick={() => setNestingMaterialTab("inner_sheathing")}
                className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  nestingMaterialTab === "inner_sheathing"
                    ? "bg-[#475569] text-white shadow-xs"
                    : "text-[#475569] hover:bg-[#F1F5F9]"
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                <span>🏠 Внутрішня обшивка ({innerMatConfig.name.split(" ")[0]})</span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${nestingMaterialTab === "inner_sheathing" ? 'bg-white/20 text-white' : 'bg-black/5 text-[#475569]'}`}>
                  {innerNesting.totalPanels} шт · {innerNesting.totalSheetsRequired} л.
                </span>
              </button>

              {/* 3. Windows */}
              {hasWindows && (
                <button
                  onClick={() => setNestingMaterialTab("windows")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    nestingMaterialTab === "windows"
                      ? "bg-[#0284C7] text-white shadow-xs"
                      : "text-[#0284C7] hover:bg-[#E0F2FE]"
                  }`}
                >
                  <span>🪟 Вікна: Пластик / Скло</span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${nestingMaterialTab === "windows" ? 'bg-white/20 text-white' : 'bg-[#E0F2FE] text-[#0284C7]'}`}>
                    {windowNesting.totalPanels} шт · {windowNesting.totalSheetsRequired} л.
                  </span>
                </button>
              )}

              {/* 4. Solar */}
              {hasSolar && (
                <button
                  onClick={() => setNestingMaterialTab("solar")}
                  className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    nestingMaterialTab === "solar"
                      ? "bg-[#7C3AED] text-white shadow-xs"
                      : "text-[#7C3AED] hover:bg-[#EDE9FE]"
                  }`}
                >
                  <span>⚡ Сонячні BIPV модулі</span>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${nestingMaterialTab === "solar" ? 'bg-white/20 text-white' : 'bg-[#EDE9FE] text-[#7C3AED]'}`}>
                    {solarNesting.totalPanels} шт · {solarNesting.totalSheetsRequired} л.
                  </span>
                </button>
              )}

              {/* 5. Insulation Quick Mode */}
              <button
                onClick={() => setViewMode("insulation")}
                className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer text-[#B45309] hover:bg-[#FEF3C7] border border-[#FDE68A]"
              >
                <span>🧊 Утеплювач (Мінвата / Пінопласт)</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">
                  Теплоємність & R
                </span>
              </button>
              {hasDoor && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                  <DoorOpen className="w-3.5 h-3.5 text-[#D97706] shrink-0" />
                  <span className="font-bold">
                    Дверний пройм ({model.doorParams?.widthMm || 900}×{model.doorParams?.heightMm || 2050} мм
                    {model.doorParams?.elevationFromBaseMm ? `, +${model.doorParams.elevationFromBaseMm} мм від основи` : ""}
                    {model.doorParams?.bayClusterType === "pentagon" ? ", ⬟ п'ятигранник" : model.doorParams?.bayClusterType === "hexagon" ? ", ⬡ шестигранник" : ""}):
                  </span>
                  <span className="text-[11px] opacity-90 hidden sm:inline">
                    трикутники з'єднання (зліва ДВ-Л, справа ДВ-П, зверху ДВ-В) та укоси включені в розкрій
                  </span>
                </div>
              )}
            </div>

            {isViewingFabric ? (
              /* Fabric Roll Controls & Settings (Ширина від 500 до 2000 мм, зазор на прошив ниткою, припуск фундаменту) */
              <div className="flex flex-col gap-4">
                <div className="p-4 rounded-2xl bg-white/95 border border-[#E8E2D8] shadow-2xs flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#F0ECE1]">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center font-bold text-sm shadow-2xs">
                        🎪
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-[#1A2E3B] uppercase tracking-wide">
                          Параметри розкрою тенту / тканини в рулоні
                        </h4>
                        <p className="text-[11px] text-[#5A6778]">
                          Суцільні арочні полоси від одного краю фундаменту до другого краю фундаменту з припуском на шов
                        </p>
                      </div>
                    </div>

                    {/* View mode toggle: Single Strip vs All Strips on Roll */}
                    <div className="flex items-center gap-1.5 bg-[#FAF7F2] p-1 rounded-xl border border-[#DCD6CA]">
                      <button
                        type="button"
                        onClick={() => setShowAllStripsRollView(false)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          !showAllStripsRollView
                            ? "bg-[#1A2E3B] text-white shadow-2xs"
                            : "text-[#5A6778] hover:text-[#1A2E3B]"
                        }`}
                      >
                        Смуга окремо ({activeFabricStripIndex + 1}/{fabricRollLayout.totalStrips})
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAllStripsRollView(true)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          showAllStripsRollView
                            ? "bg-[#D97706] text-white shadow-2xs"
                            : "text-[#5A6778] hover:text-[#1A2E3B]"
                        }`}
                      >
                        Всі {fabricRollLayout.totalStrips} смуг на рулоні ({fabricRollLayout.totalLinearMeters} м.п.)
                      </button>
                    </div>

                    {/* Export buttons for Fabric */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={handleDownloadFabricSvg}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E8E2D8] text-xs font-bold text-[#DE7C5A] hover:bg-[#FDF0E6] shadow-2xs transition-all cursor-pointer"
                        title="Завантажити векторне креслення розкрою смуги або всього рулону у форматі SVG"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Викрійка (SVG)</span>
                      </button>
                      <button
                        onClick={handleDownloadFabricDXF}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1A2E3B] text-white text-xs font-bold hover:bg-[#2D3748] shadow-2xs transition-all cursor-pointer"
                        title="Завантажити креслення в AutoCAD 2000 / Fusion 360 DXF для ЧПК розкрійного плоттера або лазера"
                      >
                        <Cpu className="w-3.5 h-3.5 text-[#DE7C5A]" />
                        <span>DXF для плоттера</span>
                      </button>
                      <button
                        onClick={handlePrint}
                        className="p-1.5 rounded-xl tactile-btn text-[#4A5568]"
                        title="Друк креслення тенту A4"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* 3 Parameter Cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* 1. Ширина рулону (500 мм - 2000 мм) */}
                    <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#CBD5E0] flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#1E293B] flex items-center gap-1.5">
                          <Ruler className="w-3.5 h-3.5 text-[#2563EB]" />
                          <span>Ширина рулону тканини (W):</span>
                        </label>
                        <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-lg border border-[#CBD5E0]">
                          <input
                            type="number"
                            min={500}
                            max={2000}
                            step={50}
                            value={fabricRollWidthMm}
                            onChange={e => {
                              const val = Number(e.target.value);
                              if (val >= 500 && val <= 2000) updateFabricParams({ widthMm: val });
                            }}
                            className="w-14 text-xs font-mono font-bold text-center text-[#1E293B] outline-none"
                          />
                          <span className="text-[11px] font-mono font-bold text-[#64748B]">мм</span>
                        </div>
                      </div>

                      <input
                        type="range"
                        min={500}
                        max={2000}
                        step={50}
                        value={fabricRollWidthMm}
                        onChange={e => updateFabricParams({ widthMm: Number(e.target.value) })}
                        className="w-full accent-[#2563EB] cursor-pointer"
                      />

                      {/* Presets */}
                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        <span className="text-[10px] text-[#64748B] mr-1">Швидкий вибір:</span>
                        {[500, 800, 1000, 1200, 1400, 1500, 1600, 1800, 2000].map(w => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => updateFabricParams({ widthMm: w })}
                            className={`px-1.5 py-0.5 text-[10px] font-mono rounded-md transition-all cursor-pointer ${
                              fabricRollWidthMm === w
                                ? "bg-[#2563EB] text-white font-bold"
                                : "bg-white text-[#475569] border border-[#CBD5E0] hover:bg-[#F1F5F9]"
                            }`}
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                      <div className="text-[10px] text-[#64748B] italic">
                        Діапазон від 500 до 2000 мм · Робоча ширина: {fabricRollWidthMm - 2 * fabricSeamAllowanceMm} мм
                      </div>
                    </div>

                    {/* 2. Зазор на прошив ниткою (10 мм - 60 мм) */}
                    <div className="p-3.5 rounded-xl bg-[#FEF2F2]/70 border border-[#FECACA] flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#991B1B] flex items-center gap-1.5">
                          <Scissors className="w-3.5 h-3.5 text-[#DC2626]" />
                          <span>Зазор на прошив ниткою (шов):</span>
                        </label>
                        <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-lg border border-[#FCA5A5]">
                          <input
                            type="number"
                            min={10}
                            max={60}
                            step={5}
                            value={fabricSeamAllowanceMm}
                            onChange={e => {
                              const val = Number(e.target.value);
                              if (val >= 10 && val <= 60) updateFabricParams({ seamMm: val });
                            }}
                            className="w-12 text-xs font-mono font-bold text-center text-[#991B1B] outline-none"
                          />
                          <span className="text-[11px] font-mono font-bold text-[#991B1B]">мм</span>
                        </div>
                      </div>

                      <input
                        type="range"
                        min={10}
                        max={60}
                        step={5}
                        value={fabricSeamAllowanceMm}
                        onChange={e => updateFabricParams({ seamMm: Number(e.target.value) })}
                        className="w-full accent-[#DC2626] cursor-pointer"
                      />

                      {/* Presets */}
                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        <span className="text-[10px] text-[#7F1D1D] mr-1">Припуск:</span>
                        {[15, 20, 25, 30, 40, 50].map(s => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => updateFabricParams({ seamMm: s })}
                            className={`px-1.5 py-0.5 text-[10px] font-mono rounded-md transition-all cursor-pointer ${
                              fabricSeamAllowanceMm === s
                                ? "bg-[#DC2626] text-white font-bold"
                                : "bg-white text-[#991B1B] border border-[#FECACA] hover:bg-[#FEE2E2]"
                            }`}
                          >
                            {s} мм
                          </button>
                        ))}
                      </div>
                      <div className="text-[10px] text-[#991B1B] italic">
                        Відступ лінії шва від краю смуги для зшивання ниткою
                      </div>
                    </div>

                    {/* 3. Припуск фундаменту & Щільність тканини */}
                    <div className="p-3.5 rounded-xl bg-[#FFFBEB]/80 border border-[#FDE68A] flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[#92400E] flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-[#D97706]" />
                          <span>Припуск фундаменту & Щільність:</span>
                        </label>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[#92400E] font-medium">Торці фундаменту:</span>
                        <div className="flex items-center gap-1">
                          {[100, 150, 200, 250].map(h => (
                            <button
                              key={h}
                              type="button"
                              onClick={() => updateFabricParams({ hemMm: h })}
                              className={`px-1.5 py-0.5 text-[10px] font-mono rounded-md transition-all cursor-pointer ${
                                fabricHemAllowanceMm === h
                                  ? "bg-[#D97706] text-white font-bold"
                                  : "bg-white text-[#92400E] border border-[#FDE68A] hover:bg-[#FEF3C7]"
                              }`}
                            >
                              {h} мм
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-[#FDE68A]">
                        <span className="text-[11px] text-[#92400E] font-medium">Тканина / Тент:</span>
                        <select
                          value={fabricGrammageGsm}
                          onChange={e => updateFabricParams({ gsm: Number(e.target.value) })}
                          className="px-2 py-0.5 text-xs font-semibold rounded-lg bg-white border border-[#FDE68A] text-[#92400E] outline-none cursor-pointer"
                        >
                          <option value={450}>Oxford 600D PU (450 г/м²)</option>
                          <option value={650}>ПВХ Тент стандарт (650 г/м²)</option>
                          <option value={900}>ПВХ Армований важкий (900 г/м²)</option>
                        </select>
                      </div>
                      <div className="text-[10px] text-[#92400E] italic">
                        Припуск на підгин люверсів: {fabricHemAllowanceMm} мм на кожному торці
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
            {/* Row 1: Sheet Format & Tool Diameter Selector */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-2xl bg-white/70 border border-[#E8E2D8]">
              {/* Sheet Format */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1.5">
                  <Box className={`w-3.5 h-3.5 ${
                    nestingMaterialTab === "inner_sheathing"
                      ? "text-[#475569]"
                      : nestingMaterialTab === "windows"
                      ? "text-[#0284C7]"
                      : nestingMaterialTab === "solar"
                      ? "text-[#7C3AED]"
                      : "text-[#DE7C5A]"
                  }`} />
                  <span>
                    {nestingMaterialTab === "inner_sheathing"
                      ? "Матеріал та формат листа (внутрішня обшивка):"
                      : nestingMaterialTab === "windows"
                      ? "Формат листа (пластик / скло):"
                      : nestingMaterialTab === "solar"
                      ? "Формат сонячного скла BIPV:"
                      : "Лист фанери:"}
                  </span>
                </span>

                {nestingMaterialTab === "inner_sheathing" ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={innerMatConfig.id}
                      onChange={e => {
                        if (onChangeInnerSheathingParams) {
                          onChangeInnerSheathingParams({ material: e.target.value as any });
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white border border-[#CBD5E0] text-[#1A2E3B] shadow-2xs outline-none cursor-pointer"
                    >
                      {INNER_SHEATHING_MATERIALS.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} — {m.standardSheet.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] text-[#64748B] italic">
                      ({innerMatConfig.description})
                    </span>
                  </div>
                ) : nestingMaterialTab === "windows" ? (
                  <span className="px-3 py-1.5 text-xs font-bold font-mono rounded-xl bg-[#F0F9FF] border border-[#BAE6FD] text-[#0369A1]">
                    {windowNesting.sheetWidth} × {windowNesting.sheetHeight} мм (Стандартний лист монолітного полікарбонату / акрилу)
                  </span>
                ) : nestingMaterialTab === "solar" ? (
                  <span className="px-3 py-1.5 text-xs font-bold font-mono rounded-xl bg-[#EDE9FE] border border-[#DDD6FE] text-[#5B21B6]">
                    {solarNesting.sheetWidth} × {solarNesting.sheetHeight} мм (Загартоване сонячне скло під BIPV фотоелементи)
                  </span>
                ) : (
                  <select
                    value={`${sheetSize.w}x${sheetSize.h}`}
                    onChange={e => {
                      const val = e.target.value;
                      const found = STANDARD_SHEET_SIZES.find(s => `${s.w}x${s.h}` === val);
                      if (found) {
                        setSheetSize(found);
                      }
                      setUserSelectedFormat(true);
                      setActiveSheetIndex(0);
                    }}
                    className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white border border-[#CBD5E0] text-[#1A2E3B] shadow-2xs outline-none cursor-pointer"
                  >
                    {STANDARD_SHEET_SIZES.map(s => (
                      <option key={`${s.w}x${s.h}`} value={`${s.w}x${s.h}`}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
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

                {/* DXF Export Group */}
                <div className="inline-flex items-center rounded-xl bg-[#1A2E3B] p-0.5 shadow-2xs">
                  <button
                    onClick={handleDownloadDXF}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white hover:bg-[#2D3748] transition-all whitespace-nowrap cursor-pointer"
                    title={`Завантажити креслення листа #${safeSheetIndex + 1} у форматі AutoCAD DXF (Fusion 360 / CAM) для Fusion 360, ArtCAM, Aspire, SheetCAM`}
                  >
                    <Cpu className="w-3.5 h-3.5 text-[#DE7C5A]" />
                    <span>DXF для ЧПУ</span>
                  </button>
                  <button
                    onClick={handleDownloadAllSheetsDXF}
                    className="px-2 py-1.5 rounded-lg text-[10px] font-bold text-[#A0AEC0] hover:text-white hover:bg-[#2D3748] transition-all whitespace-nowrap border-l border-[#2D3748] cursor-pointer"
                    title={`Завантажити всі ${nesting.totalSheetsRequired} листів нестингу в єдиному файлі DXF`}
                  >
                    Всі {nesting.totalSheetsRequired} л.
                  </button>
                </div>

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

            {/* Converted Windows Notice & Quick Toggle Banner */}
            {hasWindows && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-2xl bg-[#F0F9FF] border border-[#BAE6FD] text-[#0369A1] text-xs shadow-2xs gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🪟</span>
                  <div>
                    <div className="font-bold text-[#0369A1]">
                      Об'єкт конвертації «Вікно»: {windowNesting.totalPanels} трикутників вилучено з розкрою фанери
                    </div>
                    <div className="text-[11px] text-[#0284C7] mt-0.5">
                      {isViewingWindows
                        ? `Відображається окремий аркуш розкрою під монолітний полікарбонат / скло (${windowNesting.sheetWidth} × ${windowNesting.sheetHeight} мм, всього ${windowNesting.totalSheetsRequired} листів).`
                        : `Глуха обшивка містить ${nesting.totalPanels} деталей (${nesting.totalSheetsRequired} листів). Віконні грані формуються в окремий аркуш під пластик або скло.`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    onClick={() => {
                      setNestingMaterialTab(prev => (prev === "windows" ? "sheathing" : "windows"));
                    }}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      isViewingWindows
                        ? "bg-[#0284C7] text-white hover:bg-[#0369A1]"
                        : "bg-white text-[#0369A1] hover:bg-[#E0F2FE] border border-[#BAE6FD]"
                    }`}
                  >
                    <span>{isViewingWindows ? "← До розкрою фанери" : `Переглянути розкрій пластику / скла (${windowNesting.totalPanels} шт) →`}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Notice Banner if Triangles Exceed Sheet Dimensions */}
            {nesting.hasOversizedPanels && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-[#92400E]">
                      ⚠️ Увага: Для купола Ø {(model.parameters.diameter / 1000).toFixed(1)} м трикутники {nesting.oversizedPanelTypes?.join(", ")} мають висоту {nesting.maxPanelHeight} мм.
                    </div>
                    <div className="text-[11px] text-[#B45309] mt-0.5">
                      У листі {sheetSize.w} × {sheetSize.h} мм деталь не вміщується за висотою ({sheetSize.h} мм). Для цілісного розкрою суцільних трикутників без виходу за край оберіть великоформатний лист 3050 × 1525 мм.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setSheetSize({ w: 3050, h: 1525, name: "3050 × 1525 мм (Великоформатний лист ФСФ — для куполів ≥ 7м)" });
                      setUserSelectedFormat(true);
                      setActiveSheetIndex(0);
                    }}
                    className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-[#D97706] text-white hover:bg-[#B45309] transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    title="Застосувати рекомендований лист 3050 × 1525 мм, на якому всі трикутники поміщаються цільними"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Застосувати лист 3050 × 1525 мм</span>
                  </button>
                </div>
              </div>
            )}
            </>
            )}
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
                const isPlinth = g.type === "PL";
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
                    <span>{isPlinth ? `Цоколь ${g.type}` : `Трикутник ${g.type}`}</span>
                    <span className="font-mono text-[11px] text-[#2B6CB0]">
                      {isPlinth ? `${g.lengths[0]}×${g.lengths[1]}` : g.lengths.join("×")} мм
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
                onClick={handleDownloadTrianglesDXF}
                className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-[#1A2E3B] text-white hover:bg-[#2D3748] flex items-center gap-1.5 shadow-2xs whitespace-nowrap cursor-pointer"
                title="Завантажити креслення трикутників у форматі AutoCAD DXF (AutoCAD 2000 / Fusion 360) для верстатів ЧПУ"
              >
                <Cpu className="w-3.5 h-3.5 text-[#DE7C5A]" />
                <span>DXF трикутників</span>
              </button>
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

      {/* Primary KPI Grid (CNC & Material Statistics OR Fabric Roll Statistics) */}
      {isViewingFabric ? (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-1">Потрібно рулону</span>
            <span className="text-base font-mono font-bold text-[#1A2E3B]">
              {fabricRollLayout.totalLinearMeters} пог. м
            </span>
            <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
              Ширина {fabricRollLayout.rollWidthMm} мм ({fabricRollLayout.totalFabricAreaM2} м²)
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-1">Ширина рулону</span>
            <span className="text-base font-mono font-bold text-[#2B6CB0]">
              {fabricRollLayout.rollWidthMm} мм
            </span>
            <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
              робоча {fabricRollLayout.rollWidthMm - 2 * fabricRollLayout.seamAllowanceMm} мм між швами
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-1">Зазор на прошив ниткою</span>
            <span className="text-base font-mono font-bold text-[#DC2626]">
              ±{fabricRollLayout.seamAllowanceMm} мм
            </span>
            <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
              припуск на шов з кожного боку
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-1">Кількість арочних полос</span>
            <span className="text-base font-mono font-bold text-[#1A2E3B]">
              {fabricRollLayout.totalStrips} шт
            </span>
            <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
              від краю до краю фундаменту
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card-mint border border-white/80">
            <span className="text-[11px] text-[#1A3E26] font-bold block mb-1">Шов & Вага тенту</span>
            <span className="text-base font-mono font-black text-[#1B4D2E]">
              {fabricRollLayout.totalSewingSeamMeters} м · ~{fabricRollLayout.totalFabricWeightKg} кг
            </span>
            <span className="text-[10px] text-[#2E7D32] block mt-0.5">
              макс. смуга {(fabricRollLayout.maxStripLengthMm / 1000).toFixed(2)} м
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-1">Потрібно листів</span>
            <span className="text-base font-mono font-bold text-[#1A2E3B]">
              {activeLayout.totalSheetsRequired} шт
            </span>
            <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
              {activeLayout.sheetWidth} × {activeLayout.sheetHeight} мм ({activeLayout.totalSheetAreaM2} м²)
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-1">Фреза & Пропил</span>
            <span className="text-base font-mono font-bold text-[#2B6CB0]">
              Ø{activeLayout.toolDiameter || toolDiameter} мм
            </span>
            <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
              зазор між деталями {(activeLayout.toolDiameter || toolDiameter) + safetyGap} мм
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-1">Коефіцієнт відходів</span>
            <span className="text-base font-mono font-bold text-[#2E7D32]">
              ~{activeLayout.wastePercentage}%
            </span>
            <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
              зустрічне гніздування
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-1">Довжина різу ЧПУ</span>
            <span className="text-base font-mono font-bold text-[#1A2E3B]">
              {activeLayout.totalLinearCutMeters} м
            </span>
            <span className="text-[10px] text-[#8C9BAE] block mt-0.5">
              {isViewingWindows ? "контур різу скла/пластику" : "сумарний периметр контурів"}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card-mint border border-white/80">
            <span className="text-[11px] text-[#1A3E26] font-bold block mb-1">Час розкрою</span>
            <span className="text-base font-mono font-black text-[#1B4D2E]">
              ~{activeLayout.estimatedMachiningMinutes} хв
            </span>
            <span className="text-[10px] text-[#2E7D32] block mt-0.5">
              {activeLayout.passes || passes} проходи при {activeLayout.feedRateMmMin || feedRateMmMin} мм/хв
            </span>
          </div>
        </div>
      )}

      {/* Main View Area */}
      {viewMode === "insulation" ? (
        <InsulationCalculatorPanel
          model={model}
          params={currentParams}
          onChangeParams={handleUpdateParams}
          innerSheathingMaterialId={innerSheathingParams?.material || "drywall"}
          onNavigateTo3D={onNavigateTo3D}
        />
      ) : viewMode === "nesting" ? (
        isViewingFabric ? (
          /* ================= MODE 1B: FABRIC ROLL CONTINUOUS STRIPS NESTING ================= */
          <div className="flex flex-col gap-5">
            {/* Dedicated Strip Selection & Windows Source Management Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-[#FFFBEB] via-[#FEF3C7]/40 to-[#FFFBEB] border border-[#FDE68A] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#D97706] text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <Scissors className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[#92400E]">
                      Вибір смуги тканини (одна полоса трикутників)
                    </span>
                    {fabricRollLayout.strips[activeFabricStripIndex]?.isCustom ? (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#D97706] text-white">
                        ✓ Смуга користувача ({fabricRollLayout.strips[activeFabricStripIndex]?.triangles?.length || 0} шт)
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                        Меридіанний сектор купола
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#B45309] mt-0.5">
                    Розкрій формується суцільною полосою суміжних геодезичних трикутників від фундаменту до вершини з точним нанесенням вузлів каркасу.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap self-stretch md:self-auto justify-end">
                {/* 1. Use Windows Button (User's primary request!) */}
                {model.windowFaceIds && model.windowFaceIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onCopyWindowsToFabricStrip) onCopyWindowsToFabricStrip();
                      setActiveFabricStripIndex(0);
                      setShowAllStripsRollView(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#0284C7] hover:bg-[#0369A1] text-white shadow-2xs transition-all cursor-pointer"
                    title="Завантажити поточну збережену смугу вікон як смугу для розкрою тканини"
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-300" />
                    <span>Взяти з вікон ({model.windowFaceIds.length} шт)</span>
                  </button>
                )}

                {/* 2. Select in 3D Button */}
                {onNavigateTo3D && (
                  <button
                    type="button"
                    onClick={() => onNavigateTo3D()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] shadow-2xs transition-all cursor-pointer"
                    title="Перейти у 3D-модель для інтерактивного вибору граней смуги"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#D97706]" />
                    <span>Вибрати на 3D куполі</span>
                  </button>
                )}

                {/* 3. Clear Strip Button */}
                {fabricStripFaceIds && fabricStripFaceIds.length > 0 && onClearFabricStrip && (
                  <button
                    type="button"
                    onClick={() => onClearFabricStrip()}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-red-50 text-red-600 border border-red-200 transition-all cursor-pointer"
                    title="Очистити вибір користувача та повернутись до авто-секторів"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Скинути</span>
                  </button>
                )}
              </div>
            </div>

            {/* Warning if strip width exceeds selected roll width */}
            {fabricRollLayout.strips[activeFabricStripIndex] &&
              fabricRollLayout.strips[activeFabricStripIndex].widthMm > fabricRollWidthMm && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#991B1B]">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
                    <span>
                      <b>Увага:</b> Ширина розкрою цієї смуги ({fabricRollLayout.strips[activeFabricStripIndex].widthMm} мм) перевищує обрану ширину рулону ({fabricRollWidthMm} мм).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      updateFabricParams({
                        widthMm: fabricRollLayout.strips[activeFabricStripIndex].minRecommendedRollWidthMm || 2050
                      })
                    }
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-[#DC2626] hover:bg-[#B91C1C] text-white shrink-0 cursor-pointer shadow-2xs"
                  >
                    Встановити рекомендовану ширину {fabricRollLayout.strips[activeFabricStripIndex].minRecommendedRollWidthMm || 2050} мм
                  </button>
                </div>
            )}

            {/* Active Fabric Strip Navigation Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl tactile-card gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveFabricStripIndex(prev => Math.max(0, prev - 1))}
                  disabled={activeFabricStripIndex === 0}
                  className="p-2 rounded-xl tactile-btn disabled:opacity-40 cursor-pointer"
                  title="Попередня смуга"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-3 py-1 rounded-xl bg-white border border-[#CBD5E0]">
                  <span className="text-xs font-mono font-bold text-[#1A2E3B]">
                    Смуга {activeFabricStripIndex + 1} з {fabricRollLayout.totalStrips}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setActiveFabricStripIndex(prev => Math.min(fabricRollLayout.totalStrips - 1, prev + 1))
                  }
                  disabled={activeFabricStripIndex >= fabricRollLayout.totalStrips - 1}
                  className="p-2 rounded-xl tactile-btn disabled:opacity-40 cursor-pointer"
                  title="Наступна смуга"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                {/* Strip Quick Jump Chips */}
                <div className="hidden md:flex items-center gap-1.5 ml-2 overflow-x-auto max-w-md">
                  {fabricRollLayout.strips.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setActiveFabricStripIndex(idx);
                        setShowAllStripsRollView(false);
                      }}
                      className={`px-2.5 h-7 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                        idx === activeFabricStripIndex && !showAllStripsRollView
                          ? "bg-[#D97706] text-white shadow-2xs"
                          : "bg-white/80 hover:bg-white text-[#5A6778] border border-[#E8E2D8]"
                      }`}
                    >
                      #{s.id}
                    </button>
                  ))}
                </div>
              </div>

              {/* Current Strip Info Summary */}
              {fabricRollLayout.strips[activeFabricStripIndex] && (
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <span className="text-[#1A2E3B] font-bold">
                    {fabricRollLayout.strips[activeFabricStripIndex].name}:
                  </span>
                  <span className="text-[#2563EB] font-mono">
                    Різ: <b>{(fabricRollLayout.strips[activeFabricStripIndex].cutLengthMm / 1000).toFixed(2)} м</b> ({fabricRollLayout.strips[activeFabricStripIndex].cutLengthMm} мм)
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="text-[#475569] font-mono">
                    Дуга купола: <b>{(fabricRollLayout.strips[activeFabricStripIndex].domeArcLengthMm / 1000).toFixed(2)} м</b>
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="text-[#DC2626] font-mono">
                    Шов: <b>±{fabricRollLayout.strips[activeFabricStripIndex].seamAllowanceMm} мм</b>
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="text-[#2E7D32] font-mono">
                    Площа: <b>{fabricRollLayout.strips[activeFabricStripIndex].cutAreaM2} м²</b>
                  </span>
                </div>
              )}
            </div>

            {/* Fabric Canvas Container */}
            <div className="flex flex-col gap-4 p-6 rounded-3xl tactile-card">
              {/* Canvas Toolbar */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#1A2E3B]">
                    {showAllStripsRollView
                      ? `Повна карта розкрою: Всі ${fabricRollLayout.totalStrips} смуг на рулоні (потреба ${fabricRollLayout.totalLinearMeters} пог. м)`
                      : `Робоче креслення розкрою: Смуга #${activeFabricStripIndex + 1} (${fabricRollLayout.strips[activeFabricStripIndex]?.name || ''}) — довжина ${(fabricRollLayout.strips[activeFabricStripIndex]?.cutLengthMm / 1000).toFixed(2)} м`}
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">
                    Ширина {fabricRollLayout.rollWidthMm} мм · Шов ±{fabricRollLayout.seamAllowanceMm} мм · Підгин {fabricRollLayout.hemAllowanceMm} мм
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* View Mode Toggle: Single Strip vs Full Roll */}
                  <button
                    type="button"
                    onClick={() => setShowAllStripsRollView(prev => !prev)}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      showAllStripsRollView
                        ? "bg-[#D97706] text-white shadow-2xs"
                        : "tactile-btn text-[#5A6778] hover:text-[#1A2E3B]"
                    }`}
                    title="Перемкнути між виглядом однієї смуги та всім рулоном"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{showAllStripsRollView ? "Увесь рулон (всі полоси)" : "Окрема смуга"}</span>
                  </button>

                  <div className="h-4 w-px bg-[#CBD5E0] mx-0.5" />

                  <button
                    type="button"
                    onClick={handleDownloadFabricSvg}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg tactile-btn text-[#DE7C5A] hover:bg-[#FDF0E6] cursor-pointer"
                    title="Завантажити векторне креслення розкрою (SVG)"
                  >
                    <Download className="w-3 h-3" />
                    <span>{showAllStripsRollView ? "SVG рулону" : "SVG смуги"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadFabricDXF}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-[#1A2E3B] text-white hover:bg-[#2D3748] cursor-pointer"
                    title="Завантажити креслення в AutoCAD 2000 / Fusion 360 DXF для ЧПК плоттера або лазера"
                  >
                    <Cpu className="w-3 h-3 text-[#DE7C5A]" />
                    <span>{showAllStripsRollView ? "DXF всіх полос" : "DXF смуги"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrint}
                    className="p-1.5 rounded-xl tactile-btn text-[#5A6778] cursor-pointer"
                    title="Друк креслення A4"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>

                  <div className="h-4 w-px bg-[#CBD5E0] mx-0.5" />

                  <button
                    type="button"
                    onClick={() => setZoomScale(s => Math.max(0.6, s - 0.15))}
                    className="p-1.5 rounded-xl tactile-btn text-[#5A6778] cursor-pointer"
                    title="Зменшити"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-mono font-bold text-[#5A6778] px-1">
                    {Math.round(zoomScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomScale(s => Math.min(2.0, s + 0.15))}
                    className="p-1.5 rounded-xl tactile-btn text-[#5A6778] cursor-pointer"
                    title="Збільшити"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomScale(1.0)}
                    className="p-1.5 rounded-xl tactile-btn text-[#5A6778] cursor-pointer"
                    title="Масштаб 1:1"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Sub-toolbar: Triangles & Framework Nodes Printing Toggles */}
              {!showAllStripsRollView && (
                <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-[#F0ECE1] text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-[#5A6778] mr-1">Друк на смузі:</span>
                    
                    {/* Toggle Triangles */}
                    <button
                      type="button"
                      onClick={() => setShowTrianglesOnFabric(v => !v)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        showTrianglesOnFabric
                          ? "bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] shadow-2xs"
                          : "bg-white text-[#94A3B8] border border-[#E2E8F0]"
                      }`}
                      title="Увімкнути/вимкнути друк трикутників на тканині"
                    >
                      <Triangle className="w-3 h-3" />
                      <span>Трикутники ({fabricRollLayout.strips[activeFabricStripIndex]?.triangles?.length || 0} шт)</span>
                      {showTrianglesOnFabric && <Check className="w-3 h-3" />}
                    </button>

                    {/* Toggle Framework Nodes */}
                    <button
                      type="button"
                      onClick={() => setShowNodesOnFabric(v => !v)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        showNodesOnFabric
                          ? "bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] shadow-2xs"
                          : "bg-white text-[#94A3B8] border border-[#E2E8F0]"
                      }`}
                      title="Увімкнути/вимкнути відмітку вузлів каркасу"
                    >
                      <Box className="w-3 h-3" />
                      <span>Вузли каркасу ({fabricRollLayout.strips[activeFabricStripIndex]?.nodes?.length || 0} шт)</span>
                      {showNodesOnFabric && <Check className="w-3 h-3" />}
                    </button>

                    {/* Toggle Side Dimensions */}
                    <button
                      type="button"
                      onClick={() => setShowDimensionsOnFabric(v => !v)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                        showDimensionsOnFabric
                          ? "bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0]"
                          : "bg-white text-[#94A3B8] border border-[#E2E8F0]"
                      }`}
                      title="Показувати довжини сторін трикутників"
                    >
                      <Ruler className="w-3 h-3" />
                      <span>Розміри ребер</span>
                      {showDimensionsOnFabric && <Check className="w-3 h-3" />}
                    </button>

                    {/* Toggle Node Labels */}
                    <button
                      type="button"
                      onClick={() => setShowNodeLabelsOnFabric(v => !v)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                        showNodeLabelsOnFabric
                          ? "bg-[#FAF5FF] text-[#6B21A8] border border-[#E9D5FF]"
                          : "bg-white text-[#94A3B8] border border-[#E2E8F0]"
                      }`}
                      title="Показувати назви/номери вузлів каркасу"
                    >
                      <span>🏷️ Номери вузлів</span>
                      {showNodeLabelsOnFabric && <Check className="w-3 h-3" />}
                    </button>
                  </div>

                  {/* Reset Selected Element button if highlighted */}
                  {(selectedStripTriangleId !== null || selectedStripNodeId !== null) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStripTriangleId(null);
                        setSelectedStripNodeId(null);
                      }}
                      className="px-2.5 py-1 rounded-xl text-xs font-bold bg-[#FEF2F2] text-[#991B1B] hover:bg-[#FEE2E2] border border-[#FECACA] cursor-pointer"
                    >
                      ✕ Скинути підсвічування ({selectedStripTriangleId !== null ? `Грань #${selectedStripTriangleId + 1}` : `Вузол #${selectedStripNodeId}`})
                    </button>
                  )}
                </div>
              )}

              {/* SVG Visualizer Box */}
              <div className="w-full rounded-2xl bg-[#FBF9F5] border border-[#DCD6CA] p-4 overflow-auto min-h-[460px] max-h-[780px] flex items-center justify-center shadow-inner">
                <div
                  style={{
                    transform: `scale(${zoomScale})`,
                    transformOrigin: "top center",
                    transition: "transform 0.15s ease-out",
                    width: "100%",
                    maxWidth: "1150px"
                  }}
                  dangerouslySetInnerHTML={{ __html: currentFabricSvg }}
                />
              </div>
            </div>

            {/* Interactive Inspection Card: Triangles and Framework Nodes for the Selected Fabric Strip */}
            {fabricRollLayout.strips[activeFabricStripIndex] && (
              <div className="p-6 rounded-3xl tactile-card border border-[#E8E2D8] bg-white flex flex-col gap-4">
                {/* Header & Sub-tabs */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E8E2D8] gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#EFF6FF] text-[#2563EB] shadow-2xs font-bold text-sm">
                      📐
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#1A2E3B] flex items-center gap-2 flex-wrap">
                        <span>{fabricRollLayout.strips[activeFabricStripIndex].isPlinthStrip ? "Проекція розкрою прямокутників цоколя:" : "Друк трикутників та вузли каркасу:"} {fabricRollLayout.strips[activeFabricStripIndex].name}</span>
                        {fabricRollLayout.strips[activeFabricStripIndex].isPlinthStrip && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]">
                            🧱 Стіновий пояс цоколя (прямокутники)
                          </span>
                        )}
                        {fabricRollLayout.strips[activeFabricStripIndex].nodes?.some(n => n.isApex) && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFEDD5] text-[#C2410C]">
                            ⭐ Містить вершину купола (Apex)
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-[#5A6778]">
                        {fabricRollLayout.strips[activeFabricStripIndex].isPlinthStrip
                          ? `Загальна стрічка проходу для тенту цоколя: ${Math.round((fabricRollLayout.strips[activeFabricStripIndex].triangles?.length || 0) / 2)} прямокутних секцій із поділом діагональною балкою, припуском фундаменту та швом з'єднання з куполом`
                          : `Точна розмітка лекал: ${fabricRollLayout.strips[activeFabricStripIndex].triangles?.length || 0} трикутників каркасу та ${fabricRollLayout.strips[activeFabricStripIndex].nodes?.length || 0} вузлів для монтажу тенту`
                        }
                      </p>
                    </div>
                  </div>

                  {/* Tab Selector */}
                  <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#FAF7F2] border border-[#E8E2D8]">
                    <button
                      type="button"
                      onClick={() => setFabricDetailTab("triangles")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        fabricDetailTab === "triangles"
                          ? "bg-white text-[#1E40AF] shadow-2xs border border-[#CBD5E0]"
                          : "text-[#5A6778] hover:text-[#1A2E3B]"
                      }`}
                    >
                      <Triangle className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>Трикутники ({fabricRollLayout.strips[activeFabricStripIndex].triangles?.length || 0})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFabricDetailTab("nodes")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        fabricDetailTab === "nodes"
                          ? "bg-white text-[#92400E] shadow-2xs border border-[#CBD5E0]"
                          : "text-[#5A6778] hover:text-[#1A2E3B]"
                      }`}
                    >
                      <Box className="w-3.5 h-3.5 text-[#D97706]" />
                      <span>Вузли каркасу ({fabricRollLayout.strips[activeFabricStripIndex].nodes?.length || 0})</span>
                    </button>
                  </div>
                </div>

                {/* TAB 1: TRIANGLES */}
                {fabricDetailTab === "triangles" && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[#5A6778] font-medium">Типи граней на цій смузі:</span>
                        {Array.from(new Set(fabricRollLayout.strips[activeFabricStripIndex].triangles?.map(t => t.faceType) || [])).map(type => {
                          const count = fabricRollLayout.strips[activeFabricStripIndex].triangles?.filter(t => t.faceType === type).length || 0;
                          const tri = fabricRollLayout.strips[activeFabricStripIndex].triangles?.find(t => t.faceType === type);
                          return (
                            <span
                              key={type}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-[#F8FAFC] border border-[#CBD5E0]"
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: tri?.color || "#4A90E2" }}
                              />
                              <span>Тип {type}: {count} шт</span>
                            </span>
                          );
                        })}
                      </div>
                      <span className="text-[11px] text-[#5A6778]">
                        Клікніть по рядку для підсвічування трикутника на викрійці тканини
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-[#E8E2D8] max-h-96">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 bg-[#FAF7F2] border-b border-[#E8E2D8] text-[#5A6778] font-bold z-10">
                          <tr>
                            <th className="py-2 px-3">№</th>
                            <th className="py-2 px-3">Тип грані</th>
                            <th className="py-2 px-3">ID грані</th>
                            <th className="py-2 px-3 text-right">Сторона A (L₁)</th>
                            <th className="py-2 px-3 text-right">Сторона B (L₂)</th>
                            <th className="py-2 px-3 text-right">Сторона C (L₃)</th>
                            <th className="py-2 px-3 text-right">Площа</th>
                            <th className="py-2 px-3">Вузли каркасу (Вершини)</th>
                            <th className="py-2 px-3 text-right">Позиція X на смузі</th>
                            <th className="py-2 px-3 text-center">Дія</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0ECE1]">
                          {(fabricRollLayout.strips[activeFabricStripIndex].triangles || []).map((tri, tIdx) => {
                            const isSelected = selectedStripTriangleId === tri.faceId;
                            return (
                              <tr
                                key={tri.faceId}
                                onClick={() => setSelectedStripTriangleId(prev => prev === tri.faceId ? null : tri.faceId)}
                                className={`transition-colors cursor-pointer hover:bg-[#EFF6FF]/60 ${
                                  isSelected ? "bg-[#FEF3C7] font-semibold" : ""
                                }`}
                              >
                                <td className="py-2 px-3 font-mono font-bold text-[#5A6778]">
                                  {tIdx + 1}
                                </td>
                                <td className="py-2 px-3">
                                  <span
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-bold text-white shadow-2xs"
                                    style={{ backgroundColor: tri.color || "#4A90E2" }}
                                  >
                                    ▲ Тип {tri.faceType}
                                  </span>
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-[#1A2E3B]">
                                  #{tri.faceId + 1}
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-[#2563EB]">
                                  {tri.lengths[0]} мм
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-[#2563EB]">
                                  {tri.lengths[1]} мм
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-[#2563EB]">
                                  {tri.lengths[2]} мм
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-[#1A2E3B]">
                                  {tri.areaM2} м²
                                </td>
                                <td className="py-2 px-3 font-mono text-[#475569]">
                                  <span className="font-bold text-[#D97706]">{tri.nodeLabels[0]}</span>
                                  {" — "}
                                  <span className="font-bold text-[#D97706]">{tri.nodeLabels[1]}</span>
                                  {" — "}
                                  <span className="font-bold text-[#D97706]">{tri.nodeLabels[2]}</span>
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-[#5A6778]">
                                  {Math.round(tri.center2D.x)} мм
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <span
                                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                                      isSelected
                                        ? "bg-[#D97706] text-white"
                                        : "bg-[#F1F5F9] text-[#5A6778] hover:bg-[#E2E8F0]"
                                    }`}
                                  >
                                    {isSelected ? "✓ Підсвічено" : "Вибрати"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB 2: FRAMEWORK NODES */}
                {fabricDetailTab === "nodes" && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[#5A6778] font-medium">Категорії вузлів:</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-[#FFEDD5] text-[#C2410C]">
                          ⭐ Зенітний (Apex): {fabricRollLayout.strips[activeFabricStripIndex].nodes?.filter(n => n.isApex).length || 0} шт
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-[#FEF3C7] text-[#92400E]">
                          🏛️ Опорний фундаменту: {fabricRollLayout.strips[activeFabricStripIndex].nodes?.filter(n => n.isBoundary).length || 0} шт
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold bg-[#EFF6FF] text-[#1E40AF]">
                          ● Проміжний конектор: {fabricRollLayout.strips[activeFabricStripIndex].nodes?.filter(n => !n.isApex && !n.isBoundary).length || 0} шт
                        </span>
                      </div>
                      <span className="text-[11px] text-[#5A6778]">
                        Клікніть по рядку для підсвічування вузла каркасу на смузі тканини
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-[#E8E2D8] max-h-96">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 bg-[#FAF7F2] border-b border-[#E8E2D8] text-[#5A6778] font-bold z-10">
                          <tr>
                            <th className="py-2 px-3">№</th>
                            <th className="py-2 px-3">Позначка вузла</th>
                            <th className="py-2 px-3">Тип вузла</th>
                            <th className="py-2 px-3 text-right">Позиція X (від початку)</th>
                            <th className="py-2 px-3 text-right">Позиція Y (по ширині)</th>
                            <th className="py-2 px-3 text-right">3D висота Z (каркас)</th>
                            <th className="py-2 px-3">3D координати (X, Y, Z)</th>
                            <th className="py-2 px-3">Збіжні трикутники на смузі</th>
                            <th className="py-2 px-3 text-center">Дія</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F0ECE1]">
                          {(fabricRollLayout.strips[activeFabricStripIndex].nodes || []).map((node, nIdx) => {
                            const isSelected = selectedStripNodeId === node.nodeId;
                            return (
                              <tr
                                key={node.nodeId}
                                onClick={() => setSelectedStripNodeId(prev => prev === node.nodeId ? null : node.nodeId)}
                                className={`transition-colors cursor-pointer hover:bg-[#FEF3C7]/40 ${
                                  isSelected ? "bg-[#FEF3C7] font-semibold" : ""
                                }`}
                              >
                                <td className="py-2 px-3 font-mono font-bold text-[#5A6778]">
                                  {nIdx + 1}
                                </td>
                                <td className="py-2 px-3">
                                  <span className="font-mono font-bold text-[#1A2E3B] px-2 py-0.5 rounded bg-[#F1F5F9]">
                                    {node.label}
                                  </span>
                                </td>
                                <td className="py-2 px-3">
                                  {node.isApex ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FFEDD5] text-[#C2410C]">
                                      ⭐ Вершина (Apex)
                                    </span>
                                  ) : node.isBoundary ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#92400E]">
                                      🏛️ Опора фундаменту
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EFF6FF] text-[#1E40AF]">
                                      ● Конектор каркасу
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-[#2563EB]">
                                  {Math.round(node.x2D)} мм
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-[#D97706]">
                                  {Math.round(node.y2D)} мм
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-[#059669]">
                                  Z = {Math.round(node.originalPos.z)} мм
                                </td>
                                <td className="py-2 px-3 font-mono text-[11px] text-[#5A6778]">
                                  [{Math.round(node.originalPos.x)}, {Math.round(node.originalPos.y)}, {Math.round(node.originalPos.z)}]
                                </td>
                                <td className="py-2 px-3 font-mono text-[#1E40AF]">
                                  {node.connectedFaceIds.map(fId => `#${fId + 1}`).join(", ")}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <span
                                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                                      isSelected
                                        ? "bg-[#D97706] text-white"
                                        : "bg-[#F1F5F9] text-[#5A6778] hover:bg-[#E2E8F0]"
                                    }`}
                                  >
                                    {isSelected ? "✓ Підсвічено" : "Вибрати"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Specification Table: Continuous Arched Fabric Strips from Foundation to Foundation */}
            <div className="p-6 rounded-3xl tactile-card border border-[#E8E2D8] bg-white flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E8E2D8] gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#FEF3C7] text-[#D97706] shadow-2xs font-bold text-sm">
                    🎪
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#1A2E3B] flex items-center gap-2">
                      <span>Відомість розкрою арочних полос тенту / тканини</span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E]">
                        від краю фундаменту до другого краю
                      </span>
                    </h3>
                    <p className="text-xs text-[#5A6778]">
                      Суцільні полоси з рулону шириною {fabricRollLayout.rollWidthMm} мм із зазором {fabricRollLayout.seamAllowanceMm} мм на прошив ниткою та підгином {fabricRollLayout.hemAllowanceMm} мм
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-[#FAF7F2] text-[#1A2E3B] border border-[#E8E2D8]">
                    Разом: {fabricRollLayout.totalLinearMeters} пог. м · {fabricRollLayout.totalFabricAreaM2} м² · ~{fabricRollLayout.totalFabricWeightKg} кг
                  </span>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto rounded-2xl border border-[#E8E2D8]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#FAF7F2] border-b border-[#E8E2D8] text-[#5A6778] font-bold">
                      <th className="py-2.5 px-3">№</th>
                      <th className="py-2.5 px-3">Позиція на куполі</th>
                      <th className="py-2.5 px-3 text-right">Довжина різу, L_cut</th>
                      <th className="py-2.5 px-3 text-right">Дуга купола</th>
                      <th className="py-2.5 px-3 text-right">Ширина рулону</th>
                      <th className="py-2.5 px-3 text-right">Робоча ширина</th>
                      <th className="py-2.5 px-3 text-right">Зазор на шов</th>
                      <th className="py-2.5 px-3 text-right">Підгин фундаменту</th>
                      <th className="py-2.5 px-3 text-right">Площа</th>
                      <th className="py-2.5 px-3 text-right">Шов ниткою</th>
                      <th className="py-2.5 px-3 text-center">Дії</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0ECE1]">
                    {fabricRollLayout.strips.map((s, idx) => {
                      const isSelected = activeFabricStripIndex === idx && !showAllStripsRollView;
                      return (
                        <tr
                          key={s.id}
                          className={`transition-colors hover:bg-[#FDFBF7] ${
                            isSelected ? "bg-[#FEF3C7]/40 font-semibold" : ""
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-[#1A2E3B]">
                            #{s.id}
                          </td>
                          <td className="py-2.5 px-3 text-[#1A2E3B]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`w-2 h-2 rounded-full ${s.isPlinthStrip ? 'bg-[#2563EB]' : s.offsetY === 0 ? 'bg-[#DC2626]' : 'bg-[#D97706]'}`} />
                              <span>{s.name}</span>
                              {s.isPlinthStrip && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-md bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]">
                                  ЦОКОЛЬ
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2563EB]">
                            {(s.cutLengthMm / 1000).toFixed(2)} м
                            <span className="text-[10px] text-[#8C9BAE] block font-normal">{s.cutLengthMm} мм</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#475569]">
                            {(s.domeArcLengthMm / 1000).toFixed(2)} м
                            <span className="text-[10px] text-[#8C9BAE] block font-normal">{s.domeArcLengthMm} мм</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#1A2E3B]">
                            {s.widthMm} мм
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#2E7D32]">
                            {s.netWidthMm} мм
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#DC2626]">
                            ±{s.seamAllowanceMm} мм
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#D97706]">
                            {s.hemAllowanceMm}×2 мм
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[#1A2E3B]">
                            {s.cutAreaM2} м²
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[#475569]">
                            {(s.sewingLengthMm / 1000).toFixed(2)} м
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveFabricStripIndex(idx);
                                  setShowAllStripsRollView(false);
                                }}
                                className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-[#D97706] text-white"
                                    : "bg-[#FAF7F2] text-[#5A6778] hover:text-[#1A2E3B] hover:bg-[#F0ECE1]"
                                }`}
                              >
                                Креслення
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const stripSvg = generateFabricRollNestingSVG(fabricRollLayout, idx, {
                                    showSeamLines: true,
                                    showHems: true,
                                    showCenterline: true
                                  });
                                  downloadFile(
                                    `fabric_strip_${s.id}_${s.cutLengthMm}mm_W${fabricRollLayout.rollWidthMm}mm.svg`,
                                    stripSvg,
                                    "image/svg+xml;charset=utf-8"
                                  );
                                }}
                                className="p-1 rounded-lg hover:bg-[#F0ECE1] text-[#DE7C5A] cursor-pointer"
                                title="Завантажити SVG цієї смуги"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const stripDxf = generateFabricRollDXF(fabricRollLayout, idx);
                                  downloadFile(
                                    `fabric_strip_${s.id}_${s.cutLengthMm}mm_W${fabricRollLayout.rollWidthMm}mm.dxf`,
                                    stripDxf,
                                    "application/dxf"
                                  );
                                }}
                                className="p-1 rounded-lg hover:bg-[#F0ECE1] text-[#1A2E3B] cursor-pointer"
                                title="Завантажити DXF цієї смуги"
                              >
                                <Cpu className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#FAF7F2] font-bold text-[#1A2E3B] border-t-2 border-[#E8E2D8]">
                      <td className="py-3 px-3" colSpan={2}>
                        РАЗОМ ПО РУЛОНУ:
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[#2563EB]">
                        {fabricRollLayout.totalLinearMeters} пог. м
                      </td>
                      <td className="py-3 px-3 text-right font-mono" colSpan={5}>
                        {fabricRollLayout.totalStrips} суцільних полос
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[#2E7D32]">
                        {fabricRollLayout.totalFabricAreaM2} м²
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[#DC2626]">
                        {fabricRollLayout.totalSewingSeamMeters} м шва
                      </td>
                      <td className="py-3 px-3 text-center text-[10px] text-[#5A6778]">
                        ~{fabricRollLayout.totalFabricWeightKg} кг
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Workshop Tech Card for Tent Sewing & Cutting */}
            <div className="p-5 rounded-3xl tactile-card">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#5A6778] mb-3 flex items-center gap-2">
                <Scissors className="w-4 h-4 text-[#D97706]" />
                <span>Технологічна карта для швейного цеху та монтажу тенту (рулон W={fabricRollLayout.rollWidthMm} мм)</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-3.5 rounded-2xl bg-white border border-[#E8E2D8] space-y-1.5">
                  <span className="font-bold text-[#1A2E3B] block">1. Розкрій смуг тканини з рулону</span>
                  <p className="text-[#5A6778]">
                    Розмотування рулону шириною <b>{fabricRollLayout.rollWidthMm} мм</b> на розкрійному столі або лазерному ЧПК плоттері. Відрізання <b>{fabricRollLayout.totalStrips} суцільних смуг</b> розрахункової довжини L_cut від фундаменту до фундаменту.
                  </p>
                  <span className="text-[11px] font-mono text-[#2B6CB0] block pt-1 border-t border-[#F0ECE1]">
                    Макс. довжина смуги: {(fabricRollLayout.maxStripLengthMm / 1000).toFixed(2)} м · Разом: {fabricRollLayout.totalLinearMeters} пог. м
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white border border-[#E8E2D8] space-y-1.5">
                  <span className="font-bold text-[#1A2E3B] block">2. Зшивання ниткою та герметизація</span>
                  <p className="text-[#5A6778]">
                    Зазор на шов становить <b>±{fabricRollLayout.seamAllowanceMm} мм</b> по кожній стороні. Зшивання виконується армованою вологостійкою ниткою (Synton / Titan #20-30) подвійним замковим швом. Для ПВХ матеріалів застосовується зварювання гарячим повітрям.
                  </p>
                  <span className="text-[11px] font-mono text-[#DC2626] block pt-1 border-t border-[#F0ECE1]">
                    Сумарна довжина ліній швів: {fabricRollLayout.totalSewingSeamMeters} м.п.
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-white border border-[#E8E2D8] space-y-1.5">
                  <span className="font-bold text-[#1A2E3B] block">3. Кріплення до фундаменту та натяг</span>
                  <p className="text-[#5A6778]">
                    На обох кінцях смуг закладено підгин <b>{fabricRollLayout.hemAllowanceMm} мм</b>. По периметру встановлюються нержавіючі люверси Ø12–16 мм або формується кишеня під натяжний трос/еспандер для кріплення до анкерів фундаменту.
                  </p>
                  <span className="text-[11px] font-mono text-[#2E7D32] block pt-1 border-t border-[#F0ECE1]">
                    Розрахункова вага тенту: ~{fabricRollLayout.totalFabricWeightKg} кг ({fabricRollLayout.fabricGrammageGsm} г/м²)
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ================= MODE 1A: CNC SHEET NESTING ================= */
          <div className="flex flex-col gap-5">
            {/* Active Sheet Navigation Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl tactile-card gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentSheetIndex(prev => Math.max(0, prev - 1))}
                disabled={safeSheetIndex === 0}
                className="p-2 rounded-xl tactile-btn disabled:opacity-40"
                title="Попередній лист"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-3 py-1 rounded-xl bg-white border border-[#CBD5E0]">
                <span className="text-xs font-mono font-bold text-[#1A2E3B]">
                  Лист {safeSheetIndex + 1} з {activeLayout.totalSheetsRequired}
                </span>
              </div>
              <button
                onClick={() =>
                  setCurrentSheetIndex(prev => Math.min(activeLayout.totalSheetsRequired - 1, prev + 1))
                }
                disabled={safeSheetIndex >= activeLayout.totalSheetsRequired - 1}
                className="p-2 rounded-xl tactile-btn disabled:opacity-40"
                title="Наступний лист"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              {/* Sheet Quick Jump Chips */}
              <div className="hidden lg:flex items-center gap-1.5 ml-2 overflow-x-auto max-w-md">
                {Array.from({ length: activeLayout.totalSheetsRequired }).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSpecificSheetIndex(idx)}
                    className={`w-7 h-7 text-xs font-mono font-bold rounded-lg transition-all ${
                      idx === safeSheetIndex
                        ? (isViewingWindows ? "bg-[#0284C7] text-white shadow-2xs" : "bg-[#DE7C5A] text-white shadow-2xs")
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
                  Карта розкрою: Лист #{safeSheetIndex + 1} ({activeLayout.sheetWidth} × {activeLayout.sheetHeight} мм)
                  {isViewingWindows && <span className="ml-2 px-2 py-0.5 rounded-md bg-[#E0F2FE] text-[#0284C7] text-[10px]">Пластик / Скло</span>}
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FAF2DE] text-[#B7791F]">
                  Фреза Ø{activeLayout.toolDiameter || toolDiameter} мм · Kerf={activeLayout.toolDiameter || toolDiameter} мм
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

          {/* DOME GEOMETRY QUICK SELECTOR FOR NESTING OPTIMIZATION (Repeated under cutting map) */}
          <div className="p-5 sm:p-6 rounded-3xl tactile-card border border-[#E8E2D8] bg-white/95 shadow-xs flex flex-col gap-4">
            {/* Header with live summary */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E8E2D8] gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26] shadow-2xs">
                  <Sliders className="w-4 h-4 text-[#2E7D32]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#1A2E3B] flex items-center gap-2">
                    <span>Параметри розбиття та діаметра купола для оптимального розкрою</span>
                  </h3>
                  <p className="text-xs text-[#5A6778]">
                    Змінюйте частоту розбивки, відсікання або діаметр для підбору цілісних деталей та мінімізації відходів фанери
                  </p>
                </div>
              </div>

              {/* Status pill with current dimensions & nesting waste */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-xl text-xs font-mono font-bold bg-[#FAF7F2] text-[#1A2E3B] border border-[#E8E2D8]">
                  {currentParams.frequency}V · {currentParams.cutType} · Ø {(currentParams.diameter / 1000).toFixed(1)} м
                </span>
                <span
                  className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold border ${
                    nesting.hasOversizedPanels
                      ? "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]"
                      : "bg-[#E1EDE3] text-[#1A3E26] border-[#A6C7AE]"
                  }`}
                >
                  {nesting.hasOversizedPanels
                    ? "⚠️ Деталі більші за лист"
                    : `~${nesting.wastePercentage}% відходів · ${nesting.totalSheetsRequired} листів`}
                </span>
              </div>
            </div>

            {/* Grid of parameters: Frequency & Dome Cut */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 1. Частота розбивки купола (1V - 6V) */}
              <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/70 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#5A6778] uppercase tracking-wide flex items-center gap-1.5">
                    <Triangle className="w-3.5 h-3.5 text-[#DE7C5A]" />
                    <span>Частота розбиття купола (V)</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-[#DE7C5A]">
                    {currentParams.frequency}V ({model.faces.length} граней)
                  </span>
                </div>

                <div className="grid grid-cols-6 gap-1.5 p-1 rounded-xl tactile-inset bg-[#F5F0E8]/70">
                  {frequencies.map(f => {
                    const isSelected = currentParams.frequency === f;
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => handleUpdateParams({ frequency: f })}
                        className={`py-2 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center cursor-pointer ${
                          isSelected
                            ? "bg-[#1A2E3B] text-white shadow-xs scale-102"
                            : "text-[#5A6778] hover:text-[#1A2E3B] hover:bg-white/60"
                        }`}
                        title={`Розбиття ${f}V: ${
                          f === 1
                            ? "20 трикутників"
                            : f === 2
                            ? "40 трикутників, 2 типи деталей (v2)"
                            : f === 3
                            ? "120 трикутників, популярний вибір"
                            : f === 4
                            ? "160 трикутників, менші панелі"
                            : f === 5
                            ? "250 трикутників"
                            : "360 трикутників"
                        }`}
                      >
                        <span className="text-xs">{f}V</span>
                        <span
                          className={`text-[9px] font-normal leading-none mt-0.5 ${
                            isSelected ? "text-white/80" : "text-[#8C9BAE]"
                          }`}
                        >
                          {f === 2 ? "v2" : f === 3 ? "v3" : f === 4 ? "v4" : `${f}V`}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[10px] text-[#8C9BAE] px-1 font-medium">
                  <span>← Менше деталей, більші трикутники</span>
                  <span>Більше деталей, менший розмір →</span>
                </div>
              </div>

              {/* 2. Відсікання частини купола (1/2, 3/8, 5/8, 7/12) */}
              <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/70 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#5A6778] uppercase tracking-wide flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-[#4A7C9B]" />
                    <span>Відсікання частини купола</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-[#4A7C9B]">
                    H = {(currentParams.height / 1000).toFixed(2)} м
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl tactile-inset bg-[#F5F0E8]/70">
                  {cutOptions.map(c => {
                    const isSelected = currentParams.cutType === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleUpdateParams({ cutType: c.id })}
                        className={`py-2 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center cursor-pointer ${
                          isSelected
                            ? "bg-[#4A7C9B] text-white shadow-xs scale-102"
                            : "text-[#5A6778] hover:text-[#1A2E3B] hover:bg-white/60"
                        }`}
                        title={c.desc}
                      >
                        <span className="text-xs">{c.label}</span>
                        <span
                          className={`text-[9px] font-normal leading-none mt-0.5 truncate max-w-full ${
                            isSelected ? "text-white/80" : "text-[#8C9BAE]"
                          }`}
                        >
                          {c.short}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[10px] text-[#8C9BAE] px-1 font-medium">
                  <span>1/2 — півсфера</span>
                  <span>3/8 — низький</span>
                  <span>5/8 — високий</span>
                  <span>7/12 — стіна</span>
                </div>
              </div>
            </div>

            {/* 3. Діаметр купола для підбору розкрою */}
            <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/70 flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5 text-[#2E7D32]" />
                  <label className="text-xs font-bold text-[#5A6778] uppercase tracking-wide">
                    Діаметр купола для оптимізації розкрою
                  </label>
                </div>

                {/* Direct Number Input + Step Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateParams({
                        diameter: Math.max(1000, currentParams.diameter - 500)
                      })
                    }
                    className="p-1 rounded-lg tactile-btn text-[#5A6778] hover:text-[#1A2E3B]"
                    title="Зменшити діаметр на 0.5 м"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-[#DCD6CA] shadow-2xs">
                    <input
                      type="number"
                      min={0.5}
                      max={24.0}
                      step={0.1}
                      value={Number((currentParams.diameter / 1000).toFixed(2))}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= 0.5 && val <= 24) {
                          handleUpdateParams({ diameter: Math.round(val * 1000) });
                        }
                      }}
                      className="w-14 text-xs font-mono font-bold text-right text-[#1A2E3B] outline-none"
                    />
                    <span className="text-xs font-mono font-bold text-[#1A2E3B]">м</span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateParams({
                        diameter: Math.min(24000, currentParams.diameter + 500)
                      })
                    }
                    className="p-1 rounded-lg tactile-btn text-[#5A6778] hover:text-[#1A2E3B]"
                    title="Збільшити діаметр на 0.5 м"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>

                  <span className="text-[11px] font-mono text-[#5A6778] ml-2 hidden sm:inline">
                    (Площа підлоги: {model.statistics.floorAreaM2} м²)
                  </span>
                </div>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={1000}
                max={16000}
                step={100}
                value={currentParams.diameter}
                onChange={e => handleUpdateParams({ diameter: Number(e.target.value) })}
                className="w-full accent-[#2E7D32] cursor-pointer"
              />

              {/* Presets Chips */}
              <div className="flex items-center justify-between flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] text-[#8C9BAE]">Швидкі типові розміри:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { label: "3.0 м", d: 3000 },
                    { label: "4.5 м", d: 4500 },
                    { label: "6.0 м", d: 6000 },
                    { label: "7.0 м", d: 7000 },
                    { label: "8.0 м", d: 8000 },
                    { label: "10.0 м", d: 10000 },
                    { label: "12.0 м", d: 12000 }
                  ].map(preset => {
                    const isClose = Math.abs(currentParams.diameter - preset.d) < 50;
                    return (
                      <button
                        key={preset.d}
                        type="button"
                        onClick={() => handleUpdateParams({ diameter: preset.d })}
                        className={`px-2.5 py-1 text-xs font-mono rounded-lg transition-all cursor-pointer ${
                          isClose
                            ? "bg-[#2E7D32] text-white font-bold shadow-2xs"
                            : "bg-white/80 hover:bg-white text-[#5A6778] border border-[#E4DED3]"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Smart Nesting Advice Banner */}
            <div
              className={`p-3 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
                nesting.hasOversizedPanels
                  ? "bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]"
                  : "bg-[#E1EDE3]/60 border-[#A6C7AE]/70 text-[#1A3E26]"
              }`}
            >
              <div className="flex items-center gap-2">
                {nesting.hasOversizedPanels ? (
                  <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-[#2E7D32] shrink-0" />
                )}
                <div>
                  {nesting.hasOversizedPanels ? (
                    <span>
                      <b>Увага:</b> При розбитті <b>{currentParams.frequency}V</b> та Ø <b>{(currentParams.diameter / 1000).toFixed(1)} м</b> висота трикутника становить <b>{nesting.maxPanelHeight} мм</b>, що більше за висоту листа {sheetSize.h} мм.
                    </span>
                  ) : (
                    <span>
                      <b>Ідеальна геометрія для розкрою:</b> Всі трикутники (макс. висота {nesting.maxPanelHeight} мм) вільно поміщаються в лист {sheetSize.w} × {sheetSize.h} мм. Сумарно потрібно <b>{nesting.totalSheetsRequired} листів</b>, відходи ~<b>{nesting.wastePercentage}%</b>.
                    </span>
                  )}
                </div>
              </div>

              {nesting.hasOversizedPanels && currentParams.frequency < 6 && (
                <button
                  type="button"
                  onClick={() =>
                    handleUpdateParams({
                      frequency: (currentParams.frequency + 1) as Frequency
                    })
                  }
                  className="px-3 py-1 rounded-xl text-xs font-bold bg-[#D97706] text-white hover:bg-[#B45309] transition-all shadow-2xs whitespace-nowrap cursor-pointer shrink-0"
                >
                  Перейти на {currentParams.frequency + 1}V →
                </button>
              )}
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
        )
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
                const isPlinth = fg.type === "PL";
                const perimeter = isPlinth
                  ? 2 * (fg.lengths[0] + fg.lengths[1])
                  : fg.lengths.reduce((a, b) => a + b, 0);
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
                          {isPlinth ? `Цоколь ${fg.type} (Прямокутник)` : `Трикутник ${fg.type}`}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-[#E1EDE3] text-[#1A3E26]">
                        {fg.count} шт
                      </span>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[#5A6778]">{isPlinth ? "Розміри (Ш × В):" : "Сторони (L₁ × L₂ × L₃):"}</span>
                        <span className="font-mono font-bold text-[#2B6CB0]">
                          {isPlinth ? `${fg.lengths[0]} × ${fg.lengths[1]} мм` : `${fg.lengths.join(" × ")} мм`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5A6778]">{isPlinth ? "Призначення:" : "Ребра купола:"}</span>
                        <span className="font-mono font-bold text-[#1A2E3B]">
                          {isPlinth ? "Стіновий пояс цоколя" : `Балки [${fg.edges.join(", ")}]`}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#5A6778]">{isPlinth ? "Кути панелі:" : "Кути вершин (∠A, ∠B, ∠C):"}</span>
                        <span className="font-mono font-bold text-[#C05621]">
                          {isPlinth ? "4 × 90.0°" : `${fg.angles.join("° / ")}°`}
                        </span>
                      </div>
                      {!isPlinth && (
                        <div className="flex justify-between">
                          <span className="text-[#5A6778]">Фаски прилягання:</span>
                          <span className="font-mono font-bold text-[#9A3412]">
                            {fg.dihedralBevels.join("° / ")}°
                          </span>
                        </div>
                      )}
                      {isPlinth && (
                        <div className="flex justify-between">
                          <span className="text-[#5A6778]">Діагональ підсилення:</span>
                          <span className="font-mono font-bold text-[#2563EB]">
                            {Math.round(Math.hypot(fg.lengths[0], fg.lengths[1]))} мм (брус каркаса)
                          </span>
                        </div>
                      )}
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
