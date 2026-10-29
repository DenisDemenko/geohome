import React, { useState, useMemo } from "react";
import { DomeModel, NodeId, InnerSheathingParams } from "../core/types";
import { calculateConnector } from "../core/connectors";
import {
  calculateSheetNesting,
  calculateInnerSheathingNesting,
  getRecommendedSheetFormat
} from "../core/sheathing";
import { INNER_SHEATHING_MATERIALS } from "../core/conversions";
import {
  generateConnectorSVG,
  generateSheathingNestingSVG,
  generateSheathingCNC_DXF,
  generateBeamBlueprintsSVG,
  generateDome2DProjectionSVG,
  downloadFile
} from "../export/svgExport";
import { exportDomeOBJ } from "../export/objExport";
import { exportDomeSTEP } from "../export/stepExport";
import { exportDomeSTL } from "../export/stlExport";
import { serializeKumCadInterchange } from "../integrations/kumcad/interchange";
import { downloadUSDZ } from "../export/usdzExport";
import { ARModal } from "./ARModal";
import {
  exportDomeSpecificationPDF,
  exportSheathingNestingPDF
} from "../export/pdfExport";
import { buildPackagingPlan, exportPackingManifestCSV } from "../core/packaging";
import { calculateProjectCostEstimate, exportCostEstimateCSV } from "../core/costEstimation";
import {
  generateConnectorDXF,
  generateAllConnectorsDXF,
  generateSheathingSheetDXF,
  generateAllSheathingSheetsDXF,
  generateSheathingTrianglesDXF,
  downloadDXF,
  DxfVersion
} from "../export/dxfExport";
import { classifyConnectorTypes } from "../core/connectors";
import {
  exportConnectorTypeSTL,
  exportConnectorTypeOBJ,
  generateAllConnectorsZip,
  ConnectorRayStyle,
  STANDARD_PIPE_CONNECTORS,
  exportStandardRoundPipeConnectorSTL,
  exportStandardRoundPipeConnectorOBJ,
  generateStandardRoundPipeConnectorsZip,
  StandardPipeModelSpec
} from "../export/connector3dExport";
import {
  Download,
  FileCode,
  Box,
  Layers,
  FileSpreadsheet,
  CheckCircle,
  FileText,
  Printer,
  Sparkles,
  Cpu,
  BookOpen,
  Smartphone,
  QrCode,
  Boxes,
  Coins,
  Circle,
  Film,
  Camera,
  Play,
  Home
} from "lucide-react";

interface ExportPanelProps {
  model: DomeModel;
  selectedNodeId: NodeId | null;
  onNavigateTo3D?: () => void;
  innerSheathingParams?: InnerSheathingParams;
  onChangeInnerSheathingParams?: (params: Partial<InnerSheathingParams>) => void;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  model,
  selectedNodeId,
  onNavigateTo3D,
  innerSheathingParams,
  onChangeInnerSheathingParams
}) => {
  const [isARModalOpen, setIsARModalOpen] = useState(false);
  const activeNodeId = selectedNodeId !== null ? selectedNodeId : model.nodes[0]?.id || 0;
  const activeNode = model.nodes.find(n => n.id === activeNodeId) || model.nodes[0];

  const handleExportKumCadJSON = () => {
    try {
      const json = serializeKumCadInterchange(model);
      downloadFile(`geohome_${model.parameters.frequency}V_kumcad_v1.json`, json, "application/json");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Не вдалося експортувати CAD-дані");
    }
  };

  // Connector 3D Export State & Handlers
  const connectorTypes = classifyConnectorTypes(model, model.connectorParams);
  const isRoundBeam = model.beamProfile.type === "circular" || model.beamProfile.type === "pipe";
  const [selectedConnectorExportType, setSelectedConnectorExportType] = useState<string>("all");
  const [connectorExportRayStyle, setConnectorExportRayStyle] = useState<ConnectorRayStyle>(
    model.connectorParams.rayType === "round_tube" || (model.connectorParams.rayType !== "plate" && isRoundBeam)
      ? "round_tube"
      : "plate"
  );
  const [connectorExportWallThickness, setConnectorExportWallThickness] = useState<number>(
    model.connectorParams.wallThickness || 2.5
  );
  const [isExportingConnectorZip, setIsExportingConnectorZip] = useState(false);

  // Standard 3, 4, 5-Petal Round Pipe Connectors State & Handlers
  const [stdPipeDiam, setStdPipeDiam] = useState<number>(
    model.beamProfile.diameter || model.beamProfile.width || 25
  );
  const [stdPipeWallThk, setStdPipeWallThk] = useState<number>(
    model.connectorParams.wallThickness || 2.5
  );
  const [stdPipeSocketLen, setStdPipeSocketLen] = useState<number>(
    model.connectorParams.tabLength || 90
  );
  const [stdPipeHubDiam, setStdPipeHubDiam] = useState<number>(
    model.connectorParams.hubDiameter || 120
  );
  const [stdPipeBendAngle, setStdPipeBendAngle] = useState<number>(8.0);
  const [isExportingStdPipeZip, setIsExportingStdPipeZip] = useState(false);
  const [pipeRayFilter, setPipeRayFilter] = useState<"all" | 3 | 4 | 5 | 6>("all");
  const [dxfVersion, setDxfVersion] = useState<DxfVersion>("AC1015");

  const filteredPipeConnectors = useMemo(() => {
    if (pipeRayFilter === "all") return STANDARD_PIPE_CONNECTORS;
    return STANDARD_PIPE_CONNECTORS.filter(s => s.rayCount === pipeRayFilter);
  }, [pipeRayFilter]);

  const handleExportStdPipeSTL = (spec: StandardPipeModelSpec) => {
    const stl = exportStandardRoundPipeConnectorSTL(spec.rayCount, {
      pipeDiameter: stdPipeDiam,
      wallThickness: stdPipeWallThk,
      socketLength: stdPipeSocketLen,
      hubDiameter: stdPipeHubDiam,
      bendAngleDeg: stdPipeBendAngle,
      layout: spec.layout
    });
    const fileName = `pipe_connector_${spec.rayCount}way_${spec.layout}_D${stdPipeDiam}mm_thk${stdPipeWallThk}mm.stl`;
    downloadFile(fileName, stl, "application/octet-stream");
  };

  const handleExportStdPipeOBJ = (spec: StandardPipeModelSpec) => {
    const obj = exportStandardRoundPipeConnectorOBJ(spec.rayCount, {
      pipeDiameter: stdPipeDiam,
      wallThickness: stdPipeWallThk,
      socketLength: stdPipeSocketLen,
      hubDiameter: stdPipeHubDiam,
      bendAngleDeg: stdPipeBendAngle,
      layout: spec.layout
    });
    const fileName = `pipe_connector_${spec.rayCount}way_${spec.layout}_D${stdPipeDiam}mm_thk${stdPipeWallThk}mm.obj`;
    downloadFile(fileName, obj, "application/octet-stream");
  };

  const handleExportStdPipeZip = async () => {
    try {
      setIsExportingStdPipeZip(true);
      const blob = await generateStandardRoundPipeConnectorsZip({
        pipeDiameter: stdPipeDiam,
        wallThickness: stdPipeWallThk,
        socketLength: stdPipeSocketLen,
        hubDiameter: stdPipeHubDiam,
        bendAngleDeg: stdPipeBendAngle
      });
      downloadFile(
        `round_pipe_connectors_3_4_5_way_D${stdPipeDiam}mm_STL_OBJ.zip`,
        blob,
        "application/zip"
      );
    } finally {
      setIsExportingStdPipeZip(false);
    }
  };

  const handleExportConnectorSingleSTL = (typeId?: string) => {
    const targetType = connectorTypes.find(t => t.typeId === (typeId || selectedConnectorExportType)) || connectorTypes[0];
    if (!targetType) return;
    const params = {
      ...model.connectorParams,
      wallThickness: connectorExportWallThickness
    };
    const stl = exportConnectorTypeSTL(model, targetType, connectorExportRayStyle, params);
    const nameClean = targetType.name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
    downloadFile(`connector_${targetType.rayCount}way_${connectorExportRayStyle}_${nameClean}.stl`, stl, "application/octet-stream");
  };

  const handleExportConnectorSingleOBJ = (typeId?: string) => {
    const targetType = connectorTypes.find(t => t.typeId === (typeId || selectedConnectorExportType)) || connectorTypes[0];
    if (!targetType) return;
    const params = {
      ...model.connectorParams,
      wallThickness: connectorExportWallThickness
    };
    const obj = exportConnectorTypeOBJ(model, targetType, connectorExportRayStyle, params);
    const nameClean = targetType.name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
    downloadFile(`connector_${targetType.rayCount}way_${connectorExportRayStyle}_${nameClean}.obj`, obj, "application/octet-stream");
  };

  const handleExportAllConnectorsZIP = async () => {
    try {
      setIsExportingConnectorZip(true);
      const params = {
        ...model.connectorParams,
        wallThickness: connectorExportWallThickness
      };
      const blob = await generateAllConnectorsZip(model, connectorTypes, {
        rayStyle: connectorExportRayStyle,
        format: "both",
        params
      });
      downloadFile(
        `connectors_${model.parameters.frequency}V_all_types_${connectorExportRayStyle}_STL_OBJ.zip`,
        blob,
        "application/zip"
      );
    } finally {
      setIsExportingConnectorZip(false);
    }
  };

  // 1. Export Connector SVG
  const handleExportConnectorSVG = () => {
    if (!activeNode) return;
    const connector = calculateConnector(model, activeNode.id);
    const nodeLabel = activeNode.label || `AA${activeNode.id + 1}`;
    const svg = generateConnectorSVG(connector, model, {
      sampleNodeLabel: nodeLabel,
      nodeLabels: [nodeLabel],
      typeName: `КОНЕКТОР ВУЗЛА ${nodeLabel}`
    });
    downloadFile(`connector_node_${nodeLabel}_#${activeNode.id}.svg`, svg);
  };

  // 1b. Export USDZ for Apple AR
  const handleExportUSDZ = () => {
    downloadUSDZ(model, {
      scale: "1:1",
      style: "hybrid",
      plywoodThickness: model.sheathingParams?.thickness || 12
    });
  };

  // 2. Export Sheathing CNC SVG
  const handleExportSheathingSVG = () => {
    const rec = getRecommendedSheetFormat(model);
    const nesting = calculateSheetNesting(model, rec.w, rec.h, 6);
    const svg = generateSheathingNestingSVG(nesting, 0);
    downloadFile(`sheathing_cnc_sheet_1_${rec.w}x${rec.h}_D6mm.svg`, svg);
  };

  // 2b. Export Sheathing CNC PDF Album
  const handleExportSheathingPDF = () => {
    const rec = getRecommendedSheetFormat(model);
    const nesting = calculateSheetNesting(model, rec.w, rec.h, 6);
    exportSheathingNestingPDF(model, nesting);
  };

  // 2c. Export Sheathing CNC DXF
  const handleExportSheathingDXF = () => {
    const rec = getRecommendedSheetFormat(model);
    const nesting = calculateSheetNesting(model, rec.w, rec.h, 6);
    const dxf = generateSheathingSheetDXF(nesting, 0, { version: dxfVersion });
    downloadDXF(`sheathing_sheet_1_${rec.w}x${rec.h}_D6mm_${dxfVersion}.dxf`, dxf);
  };

  // 2d. Export All Sheathing Nesting Sheets in Master DXF
  const handleExportAllSheathingDXF = () => {
    const rec = getRecommendedSheetFormat(model);
    const nesting = calculateSheetNesting(model, rec.w, rec.h, 6);
    const dxf = generateAllSheathingSheetsDXF(nesting, { version: dxfVersion });
    downloadDXF(`sheathing_all_sheets_${model.parameters.frequency}V_${rec.w}x${rec.h}_${dxfVersion}.dxf`, dxf);
  };

  // 2e. Export Sheathing Unique Triangles in DXF
  const handleExportSheathingTrianglesDXF = () => {
    const dxf = generateSheathingTrianglesDXF(model, { version: dxfVersion });
    downloadDXF(`sheathing_triangles_blueprints_${model.parameters.frequency}V_${dxfVersion}.dxf`, dxf);
  };

  // 2e-ii. Inner Sheathing CNC Nesting State & Handlers
  const [innerSheathingMat, setInnerSheathingMat] = useState<string>(
    innerSheathingParams?.material || "drywall"
  );

  const selectedInnerMatConfig = useMemo(() => {
    return INNER_SHEATHING_MATERIALS.find(m => m.id === innerSheathingMat) || INNER_SHEATHING_MATERIALS[0];
  }, [innerSheathingMat]);

  const innerNestingLayout = useMemo(() => {
    return calculateInnerSheathingNesting(
      model,
      selectedInnerMatConfig.standardSheet.w,
      selectedInnerMatConfig.standardSheet.h,
      6,
      15,
      12,
      3000,
      1,
      selectedInnerMatConfig.name
    );
  }, [model, selectedInnerMatConfig]);

  // Export Inner Sheathing CNC SVG
  const handleExportInnerSheathingSVG = () => {
    const svg = generateSheathingNestingSVG(innerNestingLayout, 0);
    downloadFile(
      `inner_sheathing_${selectedInnerMatConfig.id}_sheet_1_of_${innerNestingLayout.totalSheetsRequired}_${selectedInnerMatConfig.standardSheet.w}x${selectedInnerMatConfig.standardSheet.h}_D6mm.svg`,
      svg
    );
  };

  // Export Inner Sheathing CNC PDF Album
  const handleExportInnerSheathingPDF = () => {
    exportSheathingNestingPDF(model, innerNestingLayout);
  };

  // Export Inner Sheathing CNC DXF (Sheet 1)
  const handleExportInnerSheathingDXF = () => {
    const dxf = generateSheathingSheetDXF(innerNestingLayout, 0, { version: dxfVersion });
    downloadDXF(
      `inner_sheathing_${selectedInnerMatConfig.id}_sheet_1_of_${innerNestingLayout.totalSheetsRequired}_${selectedInnerMatConfig.standardSheet.w}x${selectedInnerMatConfig.standardSheet.h}_${dxfVersion}.dxf`,
      dxf
    );
  };

  // Export All Inner Sheathing Sheets in Master DXF
  const handleExportAllInnerSheathingDXF = () => {
    const dxf = generateAllSheathingSheetsDXF(innerNestingLayout, { version: dxfVersion });
    downloadDXF(
      `inner_sheathing_${selectedInnerMatConfig.id}_all_sheets_${innerNestingLayout.totalSheetsRequired}_${selectedInnerMatConfig.standardSheet.w}x${selectedInnerMatConfig.standardSheet.h}_${dxfVersion}.dxf`,
      dxf
    );
  };

  // 2f. Export All Connectors in Master DXF for Laser Cutting
  const handleExportAllConnectorsDXF = () => {
    const dxf = generateAllConnectorsDXF(model, { version: dxfVersion });
    downloadDXF(`connectors_all_types_${model.parameters.frequency}V_${dxfVersion}_laser_cnc.dxf`, dxf);
  };

  // 2g. Export Active Connector in DXF
  const handleExportSingleConnectorDXF = () => {
    if (!activeNode) return;
    const connector = calculateConnector(model, activeNode.id);
    const nodeLabel = activeNode.label || `AA${activeNode.id + 1}`;
    const dxf = generateConnectorDXF(connector, model.connectorParams, {
      version: dxfVersion,
      typeName: `CONNECTOR_NODE_${nodeLabel}`,
      sampleNodeLabel: nodeLabel,
      nodeLabels: [nodeLabel]
    });
    downloadDXF(`connector_node_${nodeLabel}_#${activeNode.id}_${dxfVersion}.dxf`, dxf);
  };

  // 3. Export Beam Blueprints SVG
  const handleExportBeamBlueprintsSVG = () => {
    const svg = generateBeamBlueprintsSVG(model);
    downloadFile(`beam_blueprints_${model.parameters.frequency}V.svg`, svg);
  };

  // 4. Export Plan Projection SVG
  const handleExportPlanSVG = () => {
    const svg = generateDome2DProjectionSVG(model);
    downloadFile(`dome_plan_projection_${model.parameters.frequency}V.svg`, svg);
  };

  // 5. Export 3D OBJ
  const handleExportOBJ = () => {
    const objContent = exportDomeOBJ(model);
    downloadFile(`geodesic_dome_${model.parameters.frequency}V.obj`, objContent, "application/octet-stream");
  };

  // 6. Export 3D STEP
  const handleExportSTEP = () => {
    const stepContent = exportDomeSTEP(model);
    downloadFile(`geodesic_dome_${model.parameters.frequency}V.stp`, stepContent, "application/octet-stream");
  };

  // 7. Export 3D STL
  const handleExportSTL = () => {
    const stlContent = exportDomeSTL(model);
    downloadFile(`geodesic_dome_${model.parameters.frequency}V.stl`, stlContent, "application/octet-stream");
  };

  // 8. Export CSV BOM
  const handleExportBOM = () => {
    const hubDiam = model.connectorParams.hubDiameter || 140;
    const hubRad = Math.round((hubDiam / 2) * 10) / 10;
    const boltLenMm = Math.max(6, Math.min(140, Math.round((model.beamProfile.width + model.connectorParams.thickness * 2 + 10) / 5) * 5));
    const lines = [
      "Тип елемента;Марка;Кількість (шт);До вузла сходження (мм);Обрізаний під конектор (мм);Відступ кільця конектора (мм);Матеріал;Примітка",
      ...model.beamGroups.map(g => {
        const netCut = g.cutLength || Math.max(0.5, Math.round(g.length - hubDiam));
        return `Балка каркаса;Тип ${g.type};${g.count};${g.length};${netCut};-${hubRad} мм з торця (Ø${hubDiam});${model.beamProfile.name};${g.isBaseBeam ? "Основа Z=0" : "Сфера"}`;
      }),
      ...model.faceGroups.map(
        f => `Панель обшивки;Грань ${f.type};${f.count};${f.lengths.join("x")};${f.lengths.join("x")};—;Фанера / OSB;${f.area} м2/шт`
      ),
      `Конектори;Сталеві зірочки Thunder Domes;${model.nodes.length};Ø${hubDiam};Ø${hubDiam};Маточина Ø${hubDiam}мм;Сталь ${model.connectorParams.thickness}мм;Лазерний розкрій`,
      `Кріплення;Болти / гвинти М${model.connectorParams.boltDiameter};${model.edges.length * 4};${boltLenMm};${boltLenMm};—;Оцинкована сталь DIN 933 / 7991;З шайбами та гайками DIN 985`
    ];

    const csvContent = "\uFEFF" + lines.join("\n");
    downloadFile(`kupolgeo_bom_${model.parameters.frequency}V.csv`, csvContent, "text/csv;charset=utf-8");
  };

  // 8b. Export Packaging & Shipping Manifest CSV
  const handleExportPackagingManifest = () => {
    const plan = buildPackagingPlan(model);
    const csvContent = exportPackingManifestCSV(plan, model);
    downloadFile(`packaging_manifest_${model.parameters.frequency}V.csv`, csvContent, "text/csv;charset=utf-8");
  };

  // 8c. Export Cost Estimate CSV
  const handleExportCostCSV = () => {
    const estimate = calculateProjectCostEstimate(model);
    const csvContent = exportCostEstimateCSV(estimate, model);
    downloadFile(`cost_estimate_${model.parameters.frequency}V.csv`, csvContent, "text/csv;charset=utf-8");
  };

  return (
    <div className="flex flex-col gap-5 p-6 rounded-3xl tactile-card">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26]">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#1A2E3B]">Експорт креслень та CAD моделей</h2>
            <p className="text-xs text-[#5A6778]">
              2D векторний розкрій у SVG, 3D моделі в OBJ та STEP для CAD
            </p>
          </div>
        </div>

        {model.approved && (
          <span className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-xl bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE]">
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Геометрія затверджена ({model.geometryVersion})</span>
          </span>
        )}
      </div>

      {/* Featured Primary Export: PDF Engineering Specification */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-[#FAF7F2] via-white to-[#F0FFF4] border border-[#A6C7AE] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26] shadow-xs shrink-0">
            <Printer className="w-6 h-6 text-[#2E7D32]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[#1A2E3B]">
                Інженерна специфікація та кошторис у PDF
              </h3>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#E1EDE3] text-[#1A3E26]">
                A4 Формат для друку
              </span>
            </div>
            <p className="text-xs text-[#5A6778] mt-1 max-w-xl">
              Повна розрахункова відомість: параметри купола, зведена таблиця розкрою балок (пог. м, об'єм м³, вага), тираж та кути конекторів Thunder Domes, специфікація болтів DIN 933/985 та розкладка листів обшивки.
            </p>
          </div>
        </div>

        <button
          onClick={() => exportDomeSpecificationPDF(model)}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold tactile-btn-mint flex items-center justify-center gap-2 whitespace-nowrap shadow-xs"
        >
          <Printer className="w-4 h-4" />
          <span>Сформувати та відкрити PDF</span>
        </button>
      </div>

      {/* 3D Video & Motion Animation Presentation Card */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-[#FAF7F2] via-white to-[#FFF7ED] border border-[#FDBA74] shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#FFEDD5] text-[#EA580C] shadow-xs shrink-0">
            <Film className="w-6 h-6 text-[#EA580C]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[#1A2E3B]">
                3D-відеопрезентація, кінематографічний тур та анімація для клієнтів
              </h3>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FFEDD5] text-[#9A3412] border border-[#FED7AA]">
                WebM / MP4 / 4K Photo
              </span>
            </div>
            <p className="text-xs text-[#5A6778] mt-1 max-w-xl">
              Створення вражаючих презентаційних відеороликів: плавний 360° обліт камери, покроковий таймлапс збирання каркасу (етапи 1–8), динамічна вибух-схема розльоту обшивки та добовий хід сонця з титрами проекту.
            </p>
          </div>
        </div>

        {onNavigateTo3D && (
          <button
            type="button"
            onClick={onNavigateTo3D}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-[#EA580C] hover:bg-[#C2410C] text-white flex items-center justify-center gap-2 whitespace-nowrap shadow-xs cursor-pointer transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Запустити 3D Відеостудію →</span>
          </button>
        )}
      </div>

      {/* 2D DXF EXPORTS FOR CNC CUTTING & MILLING (AutoCAD 2000 / Fusion 360 & R12) */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#DE7C5A]" />
            <h3 className="text-xs font-bold tracking-wide text-[#1A2E3B] uppercase">
              Креслення для верстатів ЧПК (AutoCAD DXF: Fusion 360 / CAM)
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* DXF Version Selector */}
            <div className="flex items-center p-0.5 rounded-xl bg-[#EFECE6] border border-[#DCD6CA] text-[10px]">
              <button
                type="button"
                onClick={() => setDxfVersion("AC1015")}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all cursor-pointer ${
                  dxfVersion === "AC1015"
                    ? "bg-[#1A2E3B] text-white shadow-2xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
                title="Формат AutoCAD 2000 (AC1015) з LWPOLYLINE - 100% сумісність з Autodesk Fusion 360, SolidWorks, Inventor"
              >
                Fusion 360 / 2000 (AC1015)
              </button>
              <button
                type="button"
                onClick={() => setDxfVersion("AC1009")}
                className={`px-2 py-0.5 rounded-lg font-bold transition-all cursor-pointer ${
                  dxfVersion === "AC1009"
                    ? "bg-[#1A2E3B] text-white shadow-2xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
                title="Класичний формат AutoCAD R12 (AC1009) для старіших контролерів ЧПК"
              >
                R12 (AC1009)
              </button>
            </div>

            <span className="text-[10px] font-mono text-[#1A3E26] bg-[#E1EDE3] px-2.5 py-0.5 rounded-full font-bold border border-[#A6C7AE]">
              Шари: OUTER_CUT · HOLES · BEND_LINES · TEXT
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Connector Cut DXF (Laser/Plasma) */}
          <div className="p-4 rounded-2xl tactile-card-mint border border-[#A6C7AE]/60 flex flex-col justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#1A2E3B] text-white shrink-0 shadow-xs">
                <Cpu className="w-5 h-5 text-[#DE7C5A]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-[#1A2E3B]">Конектори для лазерного розкрою (DXF)</h4>
                  <span className="text-[9px] font-mono font-bold bg-white text-[#2E7D32] px-1.5 py-0.5 rounded border border-[#A6C7AE]">
                    Лазер / Плазма
                  </span>
                </div>
                <p className="text-[11px] text-[#5A6778] mt-1">
                  Пластини Thunder Domes для верстатів ЧПК (CypCut, SheetCAM). Замкнені контури різу, отвори під болти M{model.connectorParams.boltDiameter} та лінії згину для прес-листогиба.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-[#A6C7AE]/40">
              <button
                onClick={handleExportAllConnectorsDXF}
                className="flex-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-[#1A2E3B] text-white hover:bg-[#2D3748] flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                title="Завантажити всі унікальні типи конекторів на одній карті DXF"
              >
                <Download className="w-3.5 h-3.5 text-[#DE7C5A]" />
                <span>Всі типи в один DXF</span>
              </button>
              <button
                onClick={handleExportSingleConnectorDXF}
                className="px-3 py-1.5 text-xs font-bold rounded-xl tactile-btn text-[#1A2E3B] hover:text-[#2E7D32] whitespace-nowrap cursor-pointer"
                title={`Завантажити окремий DXF файл для вузла ${activeNode?.label || `AA${activeNodeId + 1}`}`}
              >
                Вузол {activeNode?.label || `AA${activeNodeId + 1}`}
              </button>
            </div>
          </div>

          {/* Sheathing Nesting DXF (CNC Router) */}
          <div className="p-4 rounded-2xl tactile-card-peach border border-[#DE7C5A]/40 flex flex-col justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#1A2E3B] text-white shrink-0 shadow-xs">
                <Layers className="w-5 h-5 text-[#DDA843]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-[#1A2E3B]">Розкрій обшивки для ЧПК (DXF)</h4>
                  <span className="text-[9px] font-mono font-bold bg-white text-[#DE7C5A] px-1.5 py-0.5 rounded border border-[#DE7C5A]/40">
                    Фрезер / Router
                  </span>
                </div>
                <p className="text-[11px] text-[#5A6778] mt-1">
                  AutoCAD R12 контури деталей трикутників на листах для CAM (Vectric Aspire, ArtCAM, Mach3, Fusion 360). Враховано діаметр фрези, габарити листа та маркування.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-[#DE7C5A]/30">
              <button
                onClick={handleExportAllSheathingDXF}
                className="flex-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-[#1A2E3B] text-white hover:bg-[#2D3748] flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                title="Завантажити всі листи розкладки обшивки в один майстер-файл DXF"
              >
                <Download className="w-3.5 h-3.5 text-[#DDA843]" />
                <span>Всі листи нестингу (DXF)</span>
              </button>
              <button
                onClick={handleExportSheathingTrianglesDXF}
                className="px-3 py-1.5 text-xs font-bold rounded-xl tactile-btn text-[#1A2E3B] hover:text-[#DE7C5A] whitespace-nowrap cursor-pointer"
                title="Завантажити еталонні креслення трикутників Type A, B, C у DXF"
              >
                Трикутники
              </button>
            </div>
          </div>

          {/* Inner Sheathing Nesting DXF (CNC Router) */}
          <div className="p-4 rounded-2xl tactile-card border border-[#7C3AED]/40 bg-gradient-to-br from-white to-[#EDE9FE]/20 flex flex-col justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#7C3AED] text-white shrink-0 shadow-xs">
                <Home className="w-5 h-5 text-amber-200" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 flex-wrap">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-[#1A2E3B]">Розкрій внутрішньої обшивки (DXF)</h4>
                    <span className="text-[9px] font-mono font-bold bg-[#EDE9FE] text-[#6D28D9] px-1.5 py-0.5 rounded border border-[#DDD6FE]">
                      ЧПК Фрезер
                    </span>
                  </div>

                  {/* Material selector */}
                  <select
                    value={innerSheathingMat}
                    onChange={e => {
                      const val = e.target.value;
                      setInnerSheathingMat(val);
                      if (onChangeInnerSheathingParams) {
                        onChangeInnerSheathingParams({ material: val as any });
                      }
                    }}
                    className="text-[11px] font-bold bg-white border border-[#CBD5E1] rounded-lg px-2 py-0.5 outline-none cursor-pointer text-[#1E293B]"
                  >
                    {INNER_SHEATHING_MATERIALS.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.standardSheet.w}×{m.standardSheet.h})
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-[#5A6778] mt-1">
                  AutoCAD DXF розкладка внутрішніх трикутників на листах ({selectedInnerMatConfig.standardSheet.w} × {selectedInnerMatConfig.standardSheet.h} мм). Всього {innerNestingLayout.totalPanels} деталей на {innerNestingLayout.totalSheetsRequired} листах (фреза Ø6мм).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-[#7C3AED]/20">
              <button
                onClick={handleExportAllInnerSheathingDXF}
                className="flex-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-[#7C3AED] text-white hover:bg-[#6D28D9] flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                title={`Завантажити всі ${innerNestingLayout.totalSheetsRequired} листів внутрішньої обшивки в один файл DXF`}
              >
                <Download className="w-3.5 h-3.5 text-amber-200" />
                <span>Всі листи нестингу ({innerNestingLayout.totalSheetsRequired} л. DXF)</span>
              </button>
              <button
                onClick={handleExportInnerSheathingDXF}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white border border-[#CBD5E1] text-[#1E293B] hover:bg-[#F3EFE6] whitespace-nowrap cursor-pointer shadow-2xs"
                title="Завантажити креслення першого листа внутрішньої обшивки у DXF"
              >
                Лист 1 (DXF)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2D Exports Grid (SVG & PDF) */}
      <div>
        <h3 className="text-xs font-bold tracking-wide text-[#5A6778] mb-3 uppercase">
          2D Векторні креслення та альбоми (SVG / PDF)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Connector Cut */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26]">
                <FileCode className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">Розкрій конектора (SVG)</h4>
                <p className="text-[11px] text-[#5A6778]">
                  Вузол {activeNode?.label || `AA${activeNodeId + 1}`} з отворами під болти та лініями згину
                </p>
              </div>
            </div>
            <button
              onClick={handleExportConnectorSVG}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn-mint whitespace-nowrap"
            >
              Завантажити SVG
            </button>
          </div>

          {/* Sheathing Nesting SVG */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#FDF0E6] text-[#DE7C5A]">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">Карта розкрою обшивки (SVG)</h4>
                <p className="text-[11px] text-[#5A6778]">
                  ЧПУ розкладка трикутників на лист 2800×1250 мм (фреза Ø6мм)
                </p>
              </div>
            </div>
            <button
              onClick={handleExportSheathingSVG}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn-peach whitespace-nowrap shadow-2xs"
            >
              Завантажити SVG
            </button>
          </div>

          {/* Inner Sheathing Nesting SVG */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-[#7C3AED]/30 bg-gradient-to-r from-white to-[#EDE9FE]/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#EDE9FE] text-[#7C3AED]">
                <Home className="w-5 h-5 text-[#7C3AED]" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">Карта розкрою внутрішньої обшивки (SVG)</h4>
                <p className="text-[11px] text-[#5A6778]">
                  ЧПК розкладка на листи {selectedInnerMatConfig.name} {selectedInnerMatConfig.standardSheet.w}×{selectedInnerMatConfig.standardSheet.h} мм (Лист 1 з {innerNestingLayout.totalSheetsRequired})
                </p>
              </div>
            </div>
            <button
              onClick={handleExportInnerSheathingSVG}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-white border border-[#CBD5E1] text-[#7C3AED] hover:bg-[#EDE9FE] whitespace-nowrap shadow-2xs cursor-pointer"
            >
              Завантажити SVG
            </button>
          </div>

          {/* Sheathing Nesting PDF Album */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26]">
                <BookOpen className="w-5 h-5 text-[#2E7D32]" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">Карта розкрою обшивки (PDF Альбом)</h4>
                <p className="text-[11px] text-[#5A6778]">
                  Повний технологічний паспорт та всі листи розкрою для цеху
                </p>
              </div>
            </div>
            <button
              onClick={handleExportSheathingPDF}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn-mint whitespace-nowrap shadow-2xs"
            >
              Сформувати PDF
            </button>
          </div>

          {/* Inner Sheathing Nesting PDF Album */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-[#7C3AED]/30 bg-gradient-to-r from-white to-[#EDE9FE]/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#EDE9FE] text-[#7C3AED]">
                <BookOpen className="w-5 h-5 text-[#7C3AED]" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">Розкрій внутрішньої обшивки (PDF Альбом)</h4>
                <p className="text-[11px] text-[#5A6778]">
                  Повний технологічний паспорт ({innerNestingLayout.totalPanels} деталей) та всі {innerNestingLayout.totalSheetsRequired} листів А4
                </p>
              </div>
            </div>
            <button
              onClick={handleExportInnerSheathingPDF}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-[#7C3AED] text-white hover:bg-[#6D28D9] whitespace-nowrap shadow-2xs cursor-pointer"
            >
              Сформувати PDF
            </button>
          </div>

          {/* Beam Blueprints */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#EBF3F8] text-[#4A7C9B]">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">Креслення балок (SVG)</h4>
                <p className="text-[11px] text-[#5A6778]">
                  Довжини, торцеві зпили, кути фасок та отвори
                </p>
              </div>
            </div>
            <button
              onClick={handleExportBeamBlueprintsSVG}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn whitespace-nowrap text-[#1A2E3B]"
            >
              Завантажити SVG
            </button>
          </div>

          {/* Dome Plan */}
          <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#FAF2DE] text-[#DDA843]">
                <Box className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">План купола 2D (SVG)</h4>
                <p className="text-[11px] text-[#5A6778]">
                  Ортогональна проекція зверху з маркуванням балок
                </p>
              </div>
            </div>
            <button
              onClick={handleExportPlanSVG}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn whitespace-nowrap text-[#1A2E3B]"
            >
              Завантажити SVG
            </button>
          </div>
        </div>
      </div>

      {/* 3D Exports Grid (OBJ & STEP & STL) */}
      <div>
        <h3 className="text-xs font-bold tracking-wide text-[#5A6778] mb-3 uppercase">
          3D Об'єкти для CAD, AR та 3D Друк (STEP / OBJ / STL / USDZ)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* STEP */}
          <div className="p-4 rounded-2xl tactile-card-mint border border-white/80 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-bold text-[#1A3E26]">ISO 10303-21</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 text-[#1A3E26]">
                  CAD B-Rep
                </span>
              </div>
              <h4 className="text-sm font-bold text-[#1A2E3B]">3D Модель STEP (.stp)</h4>
              <p className="text-[11px] text-[#3D6B5D] mt-1">
                Для Autodesk Fusion 360, FreeCAD, SolidWorks, Rhino. Повна твердотільна структура.
              </p>
            </div>
            <button
              onClick={handleExportSTEP}
              className="w-full py-2 text-xs font-bold rounded-xl tactile-btn-mint text-center"
            >
              Експорт STEP (.stp)
            </button>
          </div>

          {/* OBJ */}
          <div className="p-4 rounded-2xl tactile-card-sky border border-white/80 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-bold text-[#1A2E3B]">Wavefront</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 text-[#1A2E3B]">
                  Полігональний
                </span>
              </div>
              <h4 className="text-sm font-bold text-[#1A2E3B]">3D Модель OBJ (.obj)</h4>
              <p className="text-[11px] text-[#4A5568] mt-1">
                Повна геометрія вершин, нормалей та граней для Blender, 3ds Max, Unity, WebGL.
              </p>
            </div>
            <button
              onClick={handleExportOBJ}
              className="w-full py-2 text-xs font-bold rounded-xl tactile-btn text-center text-[#1A2E3B]"
            >
              Експорт OBJ (.obj)
            </button>
          </div>

          {/* STL */}
          <div className="p-4 rounded-2xl tactile-card-peach border border-white/80 flex flex-col justify-between gap-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-bold text-[#9A3412]">3D Друк</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/70 text-[#9A3412]">
                  Фасети STL
                </span>
              </div>
              <h4 className="text-sm font-bold text-[#1A2E3B]">3D Модель STL (.stl)</h4>
              <p className="text-[11px] text-[#7C2D12] mt-1">
                Готовий файл для слайсерів 3D принтерів (Cura, PrusaSlicer, Bambu Studio).
              </p>
            </div>
            <button
              onClick={handleExportSTL}
              className="w-full py-2 text-xs font-bold rounded-xl tactile-btn-peach text-center"
            >
              Експорт STL (.stl)
            </button>
          </div>

          {/* Apple AR Quick Look (USDZ) */}
          <div className="p-4 rounded-2xl tactile-card border border-white/80 bg-gradient-to-b from-white to-[#FDEFE7]/50 flex flex-col justify-between gap-3 shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-bold text-[#DE7C5A]">Apple USDZ</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FDEFE7] text-[#DE7C5A]">
                  AR / Камера
                </span>
              </div>
              <h4 className="text-sm font-bold text-[#1A2E3B] flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-[#DE7C5A]" />
                <span>Перегляд в AR (.usdz)</span>
              </h4>
              <p className="text-[11px] text-[#5A6778] mt-1">
                Для iPhone, iPad та Android. Швидкий перегляд купола через камеру у просторі 1:1.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => setIsARModalOpen(true)}
                className="w-full py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-[#DE7C5A] to-[#C9603D] text-white hover:opacity-95 shadow-2xs text-center flex items-center justify-center gap-1.5 transition-all"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>QR-код для смартфона</span>
              </button>
              <button
                onClick={handleExportUSDZ}
                className="w-full py-1.5 text-[11px] font-semibold rounded-xl bg-white border border-[#DCD6CA] hover:bg-slate-50 text-[#5A6778] text-center flex items-center justify-center gap-1.5"
              >
                <Download className="w-3 h-3" />
                <span>Завантажити USDZ</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DEDICATED 3D CONNECTOR EXPORTS (STL & OBJ BY RAY COUNT & STYLE) */}
      <div className="p-5 rounded-3xl bg-gradient-to-br from-white via-[#FAF7F2] to-[#F4EFE6] border border-[#E4DED3] shadow-xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E8E2D8] gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-8 h-8 rounded-xl bg-[#DE7C5A]/15 text-[#DE7C5A] flex items-center justify-center font-bold">
                <Box className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-[#1A2E3B]">
                3D Моделі конекторів для 3D друку (STL) та CAD (OBJ)
              </h3>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE]">
                {connectorTypes.length} унікальних видів
              </span>
            </div>
            <p className="text-xs text-[#5A6778] mt-1">
              Експорт твердотільних 3D моделей по кожному типу променів (4, 5, 6-променеві) з можливістю вибору круглих гільз (з налаштуванням товщини стінки) або сталевих пластин під брус.
            </p>
          </div>

          {/* Master Batch ZIP Download */}
          <button
            onClick={handleExportAllConnectorsZIP}
            disabled={isExportingConnectorZip}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#DE7C5A] to-[#C9603D] text-white hover:opacity-95 font-bold text-xs shadow-xs transition-all disabled:opacity-50 whitespace-nowrap cursor-pointer"
            title="Завантажити повний ZIP-архів усіх видів конекторів купола у форматах STL та OBJ"
          >
            <Download className="w-4 h-4" />
            <span>{isExportingConnectorZip ? "Формування ZIP..." : "Завантажити всі типи (ZIP)"}</span>
          </button>
        </div>

        {/* Configuration Controls: Ray Style & Wall Thickness */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-2xl bg-white/70 border border-[#E8E2D8]">
          {/* Ray Style Selector */}
          <div>
            <label className="text-[11px] font-bold text-[#5A6778] uppercase tracking-wider block mb-1.5">
              Тип променя конектора
            </label>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#F0EDE6]">
              <button
                type="button"
                onClick={() => setConnectorExportRayStyle("round_tube")}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  connectorExportRayStyle === "round_tube"
                    ? "bg-[#1A2E3B] text-white shadow-xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
              >
                <span>⭕️ Круглий луч</span>
              </button>
              <button
                type="button"
                onClick={() => setConnectorExportRayStyle("plate")}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  connectorExportRayStyle === "plate"
                    ? "bg-[#1A2E3B] text-white shadow-xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
              >
                <span>⭐️ Пластина</span>
              </button>
            </div>
          </div>

          {/* Wall Thickness Slider & Input (for round rays or hollow hubs) */}
          <div className="flex flex-col justify-between">
            <div className="flex justify-between items-center text-[11px] mb-1 font-bold">
              <span className="text-[#5A6778] flex items-center gap-1">
                <span className="text-[#DE7C5A]">⭕️</span>
                <span>Пустотність (стінка 0.5–20 мм)</span>
              </span>
              <span className="font-mono text-[#DE7C5A]">
                {connectorExportWallThickness.toFixed(1)} мм
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <input
                type="range"
                min={0.5}
                max={20.0}
                step={0.1}
                value={connectorExportWallThickness}
                onChange={e => setConnectorExportWallThickness(Number(e.target.value))}
                className="w-full accent-[#DE7C5A] cursor-pointer"
              />
              <div className="flex items-center gap-0.5 bg-white px-2 py-0.5 rounded-lg border border-[#DCD6CA]">
                <input
                  type="number"
                  min={0.5}
                  max={20.0}
                  step={0.1}
                  value={connectorExportWallThickness}
                  onChange={e => {
                    const val = Number(e.target.value);
                    if (!isNaN(val)) {
                      setConnectorExportWallThickness(Math.max(0.5, Math.min(20, val)));
                    }
                  }}
                  className="w-12 text-center font-mono font-bold text-xs text-[#1A2E3B] outline-none"
                />
                <span className="text-[10px] text-[#8C9BAE]">мм</span>
              </div>
            </div>
            {/* Quick Presets */}
            <div className="flex items-center justify-between gap-1">
              {[0.5, 1.5, 2.5, 5.0, 10.0, 20.0].map(thk => (
                <button
                  key={thk}
                  type="button"
                  onClick={() => setConnectorExportWallThickness(thk)}
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold transition-all ${
                    Math.abs(connectorExportWallThickness - thk) < 0.05
                      ? "bg-[#DE7C5A] text-white shadow-2xs"
                      : "bg-[#F0EDE6] hover:bg-white text-[#5A6778] border border-[#E8E2D8]"
                  }`}
                >
                  {thk} мм
                </button>
              ))}
            </div>
          </div>

          {/* Quick Specifications Info */}
          <div className="flex flex-col justify-center text-[11px] font-mono bg-[#FAF7F2] p-2.5 rounded-xl border border-[#E8E2D8]">
            {connectorExportRayStyle === "round_tube" ? (
              <>
                <div className="flex justify-between">
                  <span className="text-[#5A6778]">Посадковий Ø балки:</span>
                  <span className="font-bold text-[#1A2E3B]">
                    Ø {model.beamProfile.diameter || model.beamProfile.width || 20} мм
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5A6778]">Зовнішній Ø гільзи:</span>
                  <span className="font-bold text-[#2E7D32]">
                    Ø {((model.beamProfile.diameter || model.beamProfile.width || 20) + connectorExportWallThickness * 2).toFixed(1)} мм
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5A6778]">Стінка маточини:</span>
                  <span className="font-bold text-[#DE7C5A]">{connectorExportWallThickness.toFixed(1)} мм</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between">
                  <span className="text-[#5A6778]">Товщина пластини:</span>
                  <span className="font-bold text-[#1A2E3B]">{model.connectorParams.thickness} мм</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5A6778]">Ширина пелюстки:</span>
                  <span className="font-bold text-[#2E7D32]">{model.connectorParams.tabWidth} мм</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5A6778]">Довжина пелюстки:</span>
                  <span className="font-bold text-[#DE7C5A]">{model.connectorParams.tabLength} мм</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Gallery Grid of All Connector Types by Ray Count */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {connectorTypes.map(t => (
            <div
              key={t.typeId}
              className="p-3.5 rounded-2xl bg-white border border-[#E4DED3] flex flex-col justify-between gap-3 shadow-2xs hover:shadow-xs transition-shadow"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-[#FAF7F2] border border-[#DCD6CA] text-[#1A2E3B]">
                    {t.rayCount}-променевий ({t.isBoundary ? "Основа" : "Купол"})
                  </span>
                  <span className="text-[11px] font-mono font-black text-[#2E7D32] bg-[#E1EDE3] px-2 py-0.5 rounded-md">
                    {t.countInDome} шт
                  </span>
                </div>
                <h4 className="text-xs font-bold text-[#1A2E3B] line-clamp-1 mt-1">
                  {t.name}
                </h4>
                <p className="text-[10px] text-[#5A6778] mt-0.5 font-mono">
                  Склад балок: {t.beamSignature}
                </p>
              </div>

              <div className="flex items-center gap-1.5 pt-2 border-t border-[#F0EDE6]">
                <button
                  onClick={() => handleExportConnectorSingleSTL(t.typeId)}
                  className="flex-1 py-1.5 px-2 rounded-xl bg-[#DE7C5A] text-white hover:bg-[#C9603D] font-bold text-xs flex items-center justify-center gap-1 shadow-2xs cursor-pointer"
                  title="Завантажити STL для 3D принтера"
                >
                  <Download className="w-3 h-3" />
                  <span>STL</span>
                </button>
                <button
                  onClick={() => handleExportConnectorSingleOBJ(t.typeId)}
                  className="flex-1 py-1.5 px-2 rounded-xl bg-[#1A2E3B] text-white hover:bg-[#2D3748] font-bold text-xs flex items-center justify-center gap-1 shadow-2xs cursor-pointer"
                  title="Завантажити OBJ для CAD / Blender"
                >
                  <Download className="w-3 h-3 text-[#5B9279]" />
                  <span>OBJ</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* DEDICATED 3, 4, 5-PETAL ROUND PIPE CONNECTORS EXPORT (КРУГЛІ ТРУБИ) */}
      <div className="p-5 rounded-3xl bg-gradient-to-br from-white via-[#F2F7F4] to-[#E9F3ED] border-2 border-[#A6C7AE] shadow-xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#C8DFCD] gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-8 h-8 rounded-xl bg-[#2E7D32]/15 text-[#2E7D32] flex items-center justify-center font-bold">
                <Circle className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-[#1A2E3B]">
                Конектори на круглі труби (3, 4 та 5-лепісткові) — STL & OBJ
              </h3>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#2E7D32] text-white">
                3D Друк / CAD
              </span>
            </div>
            <p className="text-xs text-[#3D6B5D] mt-1">
              Спеціалізовані пустотілі конектори з круглими гільзами (розтрубами) під круглі сталеві, алюмінієві або пластикові труби. Кожна гільза має внутрішній упор і отвір під стопорний болт.
            </p>
          </div>

          {/* Master Batch ZIP Download for 3, 4, 5-petal round pipe connectors */}
          <button
            onClick={handleExportStdPipeZip}
            disabled={isExportingStdPipeZip}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2E7D32] text-white hover:bg-[#256829] font-bold text-xs shadow-xs transition-all disabled:opacity-50 whitespace-nowrap cursor-pointer"
            title="Завантажити повний ZIP-архів усіх 3, 4, 5-лепісткових конекторів на круглі труби у форматах STL та OBJ"
          >
            <Download className="w-4 h-4" />
            <span>{isExportingStdPipeZip ? "Генерація ZIP..." : "ZIP (3, 4, 5-лепісткові)"}</span>
          </button>
        </div>

        {/* Dimension & Geometry Settings for Round Pipe Connectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3.5 rounded-2xl bg-white/80 border border-[#C8DFCD]">
          {/* 1. Pipe Outer Diameter (Socket Inner Ø) */}
          <div className="flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase text-[#5A6778] mb-1">
              Ø Круглої труби
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={10}
                max={150}
                step={1}
                value={stdPipeDiam}
                onChange={e => setStdPipeDiam(Math.max(10, Math.min(150, Number(e.target.value) || 25)))}
                className="w-full px-2 py-1 text-xs font-mono font-bold text-[#1A2E3B] bg-white rounded-lg border border-[#A6C7AE] text-center"
              />
              <span className="text-xs font-semibold text-[#5A6778]">мм</span>
            </div>
            <span className="text-[9px] text-[#8C9BAE] mt-1 font-mono">
              Посадковий діаметр гільзи
            </span>
          </div>

          {/* 2. Wall Thickness */}
          <div className="flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-[#5A6778] mb-1">
              <span>Стінка гільзи</span>
              <span className="text-[#2E7D32] font-mono">{stdPipeWallThk.toFixed(1)} мм</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={20.0}
              step={0.1}
              value={stdPipeWallThk}
              onChange={e => setStdPipeWallThk(Number(e.target.value))}
              className="w-full accent-[#2E7D32] cursor-pointer"
            />
            <span className="text-[9px] text-[#8C9BAE] mt-1 font-mono">
              Зовнішній Ø: {(stdPipeDiam + stdPipeWallThk * 2).toFixed(1)} мм
            </span>
          </div>

          {/* 3. Socket Insertion Depth (tabLength) */}
          <div className="flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase text-[#5A6778] mb-1">
              Глибина гільзи
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={20}
                max={250}
                step={5}
                value={stdPipeSocketLen}
                onChange={e => setStdPipeSocketLen(Math.max(20, Math.min(250, Number(e.target.value) || 90)))}
                className="w-full px-2 py-1 text-xs font-mono font-bold text-[#1A2E3B] bg-white rounded-lg border border-[#A6C7AE] text-center"
              />
              <span className="text-xs font-semibold text-[#5A6778]">мм</span>
            </div>
            <span className="text-[9px] text-[#8C9BAE] mt-1 font-mono">
              Довжина захвату труби
            </span>
          </div>

          {/* 4. Central Hub Diameter */}
          <div className="flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase text-[#5A6778] mb-1">
              Хаб (серцевина)
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={40}
                max={300}
                step={5}
                value={stdPipeHubDiam}
                onChange={e => setStdPipeHubDiam(Math.max(40, Math.min(300, Number(e.target.value) || 120)))}
                className="w-full px-2 py-1 text-xs font-mono font-bold text-[#1A2E3B] bg-white rounded-lg border border-[#A6C7AE] text-center"
              />
              <span className="text-xs font-semibold text-[#5A6778]">мм</span>
            </div>
            <span className="text-[9px] text-[#8C9BAE] mt-1 font-mono">
              Діаметр центру
            </span>
          </div>

          {/* 5. Tilt Angle / Bend */}
          <div className="flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-[#5A6778] mb-1">
              <span>Купол-нахил</span>
              <span className="text-[#DE7C5A] font-mono">{stdPipeBendAngle.toFixed(1)}°</span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={0.5}
              value={stdPipeBendAngle}
              onChange={e => setStdPipeBendAngle(Number(e.target.value))}
              className="w-full accent-[#DE7C5A] cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-[#8C9BAE] font-mono mt-1">
              <span>0° (плоский)</span>
              <span>10°</span>
              <span>20°</span>
            </div>
          </div>
        </div>

        {/* Gallery Header & Quick Ray Filters */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
          <span className="text-xs font-bold text-[#2E7D32] uppercase tracking-wider">
            Оберіть тип конектора для круглої труби:
          </span>
          <div className="flex items-center gap-1 bg-[#E9F3ED] p-1 rounded-xl text-xs flex-wrap">
            <button
              type="button"
              onClick={() => setPipeRayFilter("all")}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                pipeRayFilter === "all" ? "bg-white text-[#1A2E3B] shadow-2xs" : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              Всі ({STANDARD_PIPE_CONNECTORS.length})
            </button>
            <button
              type="button"
              onClick={() => setPipeRayFilter(3)}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                pipeRayFilter === 3 ? "bg-[#2E7D32] text-white shadow-2xs" : "text-[#2E7D32] hover:bg-white"
              }`}
            >
              3-лепісткові
            </button>
            <button
              type="button"
              onClick={() => setPipeRayFilter(4)}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                pipeRayFilter === 4 ? "bg-[#DE7C5A] text-white shadow-2xs" : "text-[#DE7C5A] hover:bg-white"
              }`}
              title="Показати 4-променеві конектори (90° хрестовина та основа)"
            >
              4-лепісткові (Хрест/Основа)
            </button>
            <button
              type="button"
              onClick={() => setPipeRayFilter(5)}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                pipeRayFilter === 5 ? "bg-[#2E7D32] text-white shadow-2xs" : "text-[#2E7D32] hover:bg-white"
              }`}
            >
              5-лепісткові (Apex)
            </button>
            <button
              type="button"
              onClick={() => setPipeRayFilter(6)}
              className={`px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                pipeRayFilter === 6 ? "bg-[#4A7C9B] text-white shadow-2xs" : "text-[#4A7C9B] hover:bg-white"
              }`}
            >
              6-лепісткові (Гексагон)
            </button>
          </div>
        </div>

        {/* Gallery Grid of 3, 4, and 5-Petal Round Pipe Models */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredPipeConnectors.map((modelSpec: StandardPipeModelSpec, idx: number) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-white border border-[#C8DFCD] flex flex-col justify-between gap-3 shadow-2xs hover:shadow-xs transition-shadow"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE]">
                    {modelSpec.rayCount}-лепістковий ({modelSpec.layout === "base" ? "Основа" : "Сферичний"})
                  </span>
                  <span className="text-[10px] font-mono text-[#5A6778]">
                    Ø{stdPipeDiam}мм труба
                  </span>
                </div>
                <h4 className="text-xs font-bold text-[#1A2E3B]">
                  {modelSpec.ukrainianName}
                </h4>
                <p className="text-[11px] text-[#5A6778] mt-1 leading-snug">
                  {modelSpec.description}
                </p>

                <div className="mt-2.5 p-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] text-[10px] font-mono grid grid-cols-2 gap-1 text-[#5A6778]">
                  <div>Гільза: <b className="text-[#1A2E3B]">Ø{stdPipeDiam} мм</b></div>
                  <div>Стінка: <b className="text-[#2E7D32]">{stdPipeWallThk.toFixed(1)} мм</b></div>
                  <div>Зовнішній: <b className="text-[#1A2E3B]">Ø{(stdPipeDiam + stdPipeWallThk * 2).toFixed(1)} мм</b></div>
                  <div>Глибина: <b className="text-[#DE7C5A]">{stdPipeSocketLen} мм</b></div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-[#E8E2D8]">
                <button
                  onClick={() => handleExportStdPipeSTL(modelSpec)}
                  className="w-full sm:flex-1 py-2 px-2.5 rounded-xl bg-[#2E7D32] text-white hover:bg-[#256829] font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                  title={`Завантажити 3D модель ${modelSpec.rayCount}-лепісткового конектора для 3D друку (STL)`}
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Завантажити STL</span>
                </button>
                <button
                  onClick={() => handleExportStdPipeOBJ(modelSpec)}
                  className="w-full sm:flex-1 py-2 px-2.5 rounded-xl bg-[#1A2E3B] text-white hover:bg-[#2D3748] font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-all"
                  title={`Завантажити 3D модель ${modelSpec.rayCount}-лепісткового конектора для CAD (OBJ)`}
                >
                  <Download className="w-3.5 h-3.5 text-[#5B9279] shrink-0" />
                  <span className="truncate">Завантажити OBJ</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* KumCAD interchange (native OpenCASCADE import is an optional local tool) */}
      <div className="p-4 rounded-2xl tactile-card-mint border border-[#A6C7AE]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26]">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1A2E3B]">KumCAD / OpenCASCADE — CAD JSON</h4>
            <p className="text-[11px] text-[#5A6778]">
              Геометрія купола, балки та вузли у міліметрах для локального CAD-конвертера (не власний формат KumCAD)
            </p>
          </div>
        </div>
        <button type="button" onClick={handleExportKumCadJSON}
          className="px-4 py-2 text-xs font-bold rounded-xl tactile-btn text-[#2E7D32] whitespace-nowrap">
          Завантажити CAD JSON
        </button>
      </div>

      {/* BOM Specification */}
      <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#EAE4D9] text-[#1A2E3B]">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1A2E3B]">
              Специфікація матеріалів (BOM Excel / CSV)
            </h4>
            <p className="text-[11px] text-[#5A6778]">
              Повний перелік балок, конекторів, обшивки та болтів для закупівлі й кошторису
            </p>
          </div>
        </div>
        <button
          onClick={handleExportBOM}
          className="px-4 py-2 text-xs font-bold rounded-xl tactile-btn text-[#1A2E3B]"
        >
          Завантажити CSV
        </button>
      </div>

      {/* Packaging & Shipping Manifest */}
      <div className="p-4 rounded-2xl tactile-card-mint border border-[#A6C7AE]/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26]">
            <Boxes className="w-5 h-5 text-[#2E7D32]" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1A2E3B]">
              Пакувальний лист та маніфест відвантаження (CSV)
            </h4>
            <p className="text-[11px] text-[#5A6778]">
              Оптимізований розподіл деталей по коробках та палетах із вагою брутто та штрихкодами
            </p>
          </div>
        </div>
        <button
          onClick={handleExportPackagingManifest}
          className="px-4 py-2 text-xs font-bold rounded-xl tactile-btn text-[#2E7D32] hover:bg-[#E1EDE3]"
        >
          Завантажити маніфест
        </button>
      </div>

      {/* Project Cost & Budget Estimate */}
      <div className="p-4 rounded-2xl tactile-card-peach border border-[#DE7C5A]/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#FDF0E6] text-[#DE7C5A]">
            <Coins className="w-5 h-5 text-[#DE7C5A]" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-[#1A2E3B]">
              Повний кошторис матеріалів та бюджет проекту (CSV)
            </h4>
            <p className="text-[11px] text-[#5A6778]">
              Деталізований фінансовий кошторис бруса, фанери, конекторів та кріплення за одиницю
            </p>
          </div>
        </div>
        <button
          onClick={handleExportCostCSV}
          className="px-4 py-2 text-xs font-bold rounded-xl tactile-btn text-[#DE7C5A] hover:bg-[#FDF0E6]"
        >
          Завантажити кошторис
        </button>
      </div>

      {/* AR Modal */}
      <ARModal
        model={model}
        plywoodThickness={model.sheathingParams?.thickness || 12}
        isOpen={isARModalOpen}
        onClose={() => setIsARModalOpen(false)}
      />
    </div>
  );
};
