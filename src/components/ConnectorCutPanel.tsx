import React, { useState, useMemo } from "react";
import { DomeModel, NodeId, ConnectorParams, ConnectorTypeSummary } from "../core/types";
import {
  calculateConnector,
  classifyConnectorTypes,
  DEFAULT_CONNECTOR_PARAMS
} from "../core/connectors";
import {
  CONNECTOR_MATERIALS,
  CONNECTOR_COATINGS,
  calculateConnectorsWeightSummary,
  calculateConnectorPieceWeight,
  getCoatingsForCategory,
  getWeightComparisonToSteel,
  ConnectorMaterialCategory,
  ConnectorMaterialId,
  ConnectorCoatingId
} from "../core/connectorMaterials";
import { generateConnectorSVG, downloadFile } from "../export/svgExport";
import {
  generateConnectorDXF,
  generateAllConnectorsDXF,
  downloadDXF
} from "../export/dxfExport";
import {
  exportConnectorTypeSTL,
  exportConnectorTypeOBJ,
  generateAllConnectorsZip,
  generateStandardRoundPipeConnectorsZip,
  ConnectorRayStyle
} from "../export/connector3dExport";
import { Connector3DViewer } from "./Connector3DViewer";
import {
  Disc,
  Download,
  Sliders,
  Sparkles,
  Zap,
  Ruler,
  Layers,
  Compass,
  CheckCircle2,
  Settings2,
  Grid,
  Maximize2,
  Cpu,
  Box,
  Circle,
  Shield,
  RotateCw,
  Anchor,
  Scale,
  Paintbrush
} from "lucide-react";

interface ConnectorCutPanelProps {
  model: DomeModel;
  selectedNodeId: NodeId | null;
  onSelectNode: (id: NodeId) => void;
  connectorParams: ConnectorParams;
  onChangeConnectorParams: (params: ConnectorParams) => void;
  onResetToProportional?: () => void;
}

export const ConnectorCutPanel: React.FC<ConnectorCutPanelProps> = ({
  model,
  selectedNodeId,
  onSelectNode,
  connectorParams,
  onChangeConnectorParams,
  onResetToProportional
}) => {
  // Classify all unique connector bracket types in this dome
  const connectorTypes = useMemo(() => {
    return classifyConnectorTypes(model, connectorParams);
  }, [model, connectorParams]);

  // Total count of connector brackets in the whole dome
  const totalConnectorsCount = useMemo(() => {
    return connectorTypes.reduce((sum, t) => sum + t.countInDome, 0);
  }, [connectorTypes]);

  // View mode: "all" (gallery of all types in dome), "single" (detailed inspector), or "3d" (interactive 3D viewer)
  const [viewMode, setViewMode] = useState<"all" | "single" | "3d">("all");

  // Ray count filter for quick tab access (All, 4-way Base, 5-way Apex, 6-way Hexagons)
  const [rayFilter, setRayFilter] = useState<"all" | 4 | 5 | 6>("all");

  const filteredTypes = useMemo(() => {
    if (rayFilter === "all") return connectorTypes;
    return connectorTypes.filter(t => t.rayCount === rayFilter);
  }, [connectorTypes, rayFilter]);

  const count4R = useMemo(() => connectorTypes.filter(t => t.rayCount === 4).length, [connectorTypes]);
  const count5R = useMemo(() => connectorTypes.filter(t => t.rayCount === 5).length, [connectorTypes]);
  const count6R = useMemo(() => connectorTypes.filter(t => t.rayCount === 6).length, [connectorTypes]);

  // Selected connector type id for single view
  const [selectedTypeId, setSelectedTypeId] = useState<string>(
    connectorTypes[0]?.typeId || ""
  );

  // Active type summary for single view
  const activeType = useMemo(() => {
    return (
      connectorTypes.find(t => t.typeId === selectedTypeId) ||
      connectorTypes[0] ||
      null
    );
  }, [connectorTypes, selectedTypeId]);

  // Automated connector weight and coating summary
  const weightSummary = useMemo(() => {
    return calculateConnectorsWeightSummary(model, connectorTypes);
  }, [model, connectorTypes]);

  // Active connector piece weight
  const activeUnitWeightKg = useMemo(() => {
    if (!activeType) return 0;
    return calculateConnectorPieceWeight(activeType.rayCount, activeType.isBoundary, connectorParams, model.beamProfile);
  }, [activeType, connectorParams, model.beamProfile]);

  const activeTotalWeightKg = useMemo(() => {
    if (!activeType) return 0;
    return Math.round(activeUnitWeightKg * activeType.countInDome * 100) / 100;
  }, [activeType, activeUnitWeightKg]);

  // Material & Coating state values
  const currentMatId = (connectorParams.material as ConnectorMaterialId) || "steel_st3";
  const currentMatInfo = CONNECTOR_MATERIALS[currentMatId] || CONNECTOR_MATERIALS.steel_st3;
  const currentCategory: ConnectorMaterialCategory = connectorParams.materialCategory || currentMatInfo.category || "steel";
  const currentCoatingId = (connectorParams.coating as ConnectorCoatingId) || currentMatInfo.defaultCoating;
  const currentCoatingInfo = CONNECTOR_COATINGS[currentCoatingId] || CONNECTOR_COATINGS[currentMatInfo.defaultCoating];

  const categoryMaterials = useMemo(
    () => Object.values(CONNECTOR_MATERIALS).filter(m => m.category === currentCategory),
    [currentCategory]
  );
  const categoryCoatings = useMemo(
    () => getCoatingsForCategory(currentCategory),
    [currentCategory]
  );

  const weightComparison = useMemo(() => {
    return getWeightComparisonToSteel(
      weightSummary.totalWeightKg,
      currentMatId,
      connectorParams.plasticInfillPercent
    );
  }, [weightSummary.totalWeightKg, currentMatId, connectorParams.plasticInfillPercent]);

  // Pre-generate SVG drawings for all connector types with stamped piece count and node markings
  const typeSvgs = useMemo(() => {
    const map = new Map<string, string>();
    connectorTypes.forEach(t => {
      const conn = calculateConnector(model, t.sampleNodeId);
      const sampleLabel = model.nodes[t.sampleNodeId]?.label || `AA${t.sampleNodeId + 1}`;
      const nodeLabels = t.nodeIds.map(nid => model.nodes[nid]?.label || `AA${nid + 1}`);
      const svg = generateConnectorSVG(
        conn,
        { ...model, connectorParams },
        {
          countInDome: t.countInDome,
          typeName: t.name,
          sampleNodeLabel: sampleLabel,
          nodeLabels: nodeLabels
        }
      );
      map.set(t.typeId, svg);
    });
    return map;
  }, [connectorTypes, model, connectorParams]);

  // Download active connector SVG
  const handleDownloadTypeSvg = (t: ConnectorTypeSummary) => {
    const svg = typeSvgs.get(t.typeId);
    if (!svg) return;
    const sampleLabel = model.nodes[t.sampleNodeId]?.label || `AA${t.sampleNodeId + 1}`;
    const nameClean = t.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadFile(
      `connector_${sampleLabel}_${nameClean}_${t.countInDome}pcs.svg`,
      svg
    );
  };

  // Download single connector in AutoCAD R12 DXF for CNC
  const handleDownloadSingleConnectorDXF = (t: ConnectorTypeSummary) => {
    const conn = calculateConnector(model, t.sampleNodeId);
    const sampleLabel = model.nodes[t.sampleNodeId]?.label || `AA${t.sampleNodeId + 1}`;
    const nodeLabels = t.nodeIds.map(nid => model.nodes[nid]?.label || `AA${nid + 1}`);
    const dxf = generateConnectorDXF(conn, connectorParams, {
      countInDome: t.countInDome,
      typeName: t.name,
      sampleNodeLabel: sampleLabel,
      nodeLabels: nodeLabels
    });
    const nameClean = t.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadDXF(`connector_${sampleLabel}_${nameClean}_${t.countInDome}pcs.dxf`, dxf);
  };

  // Download all connector types arranged in master DXF
  const handleDownloadAllConnectorsDXF = () => {
    const dxf = generateAllConnectorsDXF({ ...model, connectorParams });
    downloadDXF(`connectors_all_types_${model.parameters.frequency}V_laser_cnc.dxf`, dxf);
  };

  // Download all connector types package SVG
  const handleDownloadAllTypes = () => {
    connectorTypes.forEach(t => {
      const svg = typeSvgs.get(t.typeId);
      if (svg) {
        const sampleLabel = model.nodes[t.sampleNodeId]?.label || `AA${t.sampleNodeId + 1}`;
        const nameClean = t.name.replace(/[^a-zA-Z0-9_-]/g, "_");
        downloadFile(`connector_${sampleLabel}_${nameClean}_${t.countInDome}pcs.svg`, svg);
      }
    });
  };

  const [isExportingZip, setIsExportingZip] = useState(false);

  // Download single connector 3D STL
  const handleDownloadSingleConnectorSTL = (t: ConnectorTypeSummary) => {
    const isRound = connectorParams.rayType === "round_tube" || (connectorParams.rayType !== "plate" && (model.beamProfile.type === "circular" || model.beamProfile.type === "pipe"));
    const style: ConnectorRayStyle = isRound ? "round_tube" : "plate";
    const sampleLabel = model.nodes[t.sampleNodeId]?.label || `AA${t.sampleNodeId + 1}`;
    const stl = exportConnectorTypeSTL(model, t, style, connectorParams);
    const nameClean = t.name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
    downloadFile(`connector_${sampleLabel}_${t.rayCount}way_${style}_${nameClean}.stl`, stl, "application/octet-stream");
  };

  // Download single connector 3D OBJ
  const handleDownloadSingleConnectorOBJ = (t: ConnectorTypeSummary) => {
    const isRound = connectorParams.rayType === "round_tube" || (connectorParams.rayType !== "plate" && (model.beamProfile.type === "circular" || model.beamProfile.type === "pipe"));
    const style: ConnectorRayStyle = isRound ? "round_tube" : "plate";
    const sampleLabel = model.nodes[t.sampleNodeId]?.label || `AA${t.sampleNodeId + 1}`;
    const obj = exportConnectorTypeOBJ(model, t, style, connectorParams);
    const nameClean = t.name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
    downloadFile(`connector_${sampleLabel}_${t.rayCount}way_${style}_${nameClean}.obj`, obj, "application/octet-stream");
  };

  // Download all connector types in ZIP (STL + OBJ for both round & plate)
  const handleDownloadAllConnectorsZIP = async () => {
    try {
      setIsExportingZip(true);
      const blob = await generateAllConnectorsZip(model, connectorTypes, {
        rayStyle: "both",
        format: "both",
        params: connectorParams
      });
      downloadFile(
        `kupolgeo_connectors_${model.parameters.frequency}V_all_types_STL_OBJ.zip`,
        blob,
        "application/zip"
      );
    } finally {
      setIsExportingZip(false);
    }
  };

  const [isExportingPipeZip, setIsExportingPipeZip] = useState(false);
  const handleDownloadPipeConnectorsZIP = async () => {
    try {
      setIsExportingPipeZip(true);
      const pipeDiam = model.beamProfile.diameter || model.beamProfile.width || 25;
      const blob = await generateStandardRoundPipeConnectorsZip({
        pipeDiameter: pipeDiam,
        wallThickness: connectorParams.wallThickness || 2.5,
        socketLength: connectorParams.tabLength || 90,
        hubDiameter: connectorParams.hubDiameter || 120
      });
      downloadFile(
        `round_pipe_connectors_3_4_5_way_D${pipeDiam}mm_STL_OBJ.zip`,
        blob,
        "application/zip"
      );
    } finally {
      setIsExportingPipeZip(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 rounded-3xl tactile-card">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-[#E8E2D8] gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26] shadow-xs">
            <Zap className="w-5 h-5 text-[#2E7D32]" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-[#1A2E3B]">
                Креслення конекторів по всіх видах у куполі
              </h2>
              <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE]">
                Всього: {totalConnectorsCount} шт. ({connectorTypes.length} види)
              </span>
              <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#F6F2EC] text-[#DE7C5A] border border-[#E4DED3] flex items-center gap-1" title={`${weightSummary.materialName} · ${weightSummary.coatingName}`}>
                <Scale className="w-3 h-3 text-[#DE7C5A]" />
                Вага: {weightSummary.totalWeightKg} кг ({weightSummary.materialName.split(" ")[0]})
              </span>
            </div>
            <p className="text-xs text-[#5A6778] mt-0.5">
              Векторні креслення 2D для лазерної порізки ЧПК із зазначенням тиражу на кожному кресленні, кутів розгортки та згину на листогибі
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* View mode toggle: All types vs Single vs 3D */}
          <div className="flex items-center p-1 rounded-xl tactile-inset bg-white/60">
            <button
              onClick={() => setViewMode("all")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === "all"
                  ? "bg-[#FAF7F2] text-[#1A2E3B] shadow-xs border border-white"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Всі види ({connectorTypes.length})</span>
            </button>
            <button
              onClick={() => setViewMode("single")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === "single"
                  ? "bg-[#FAF7F2] text-[#1A2E3B] shadow-xs border border-white"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Окремий вид</span>
            </button>
            <button
              onClick={() => setViewMode("3d")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === "3d"
                  ? "bg-[#1A2E3B] text-white shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
              title="Інтерактивний 3D перегляд конектора, регулювання згину пелюсток, балок та болтів"
            >
              <Box className="w-3.5 h-3.5 text-[#DE7C5A]" />
              <span>3D Вузол</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadPipeConnectorsZIP}
              disabled={isExportingPipeZip}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#2E7D32] text-white hover:bg-[#256829] shadow-2xs whitespace-nowrap cursor-pointer transition-all disabled:opacity-50"
              title="Завантажити 3, 4 та 5-лепісткові конектори для круглих труб у форматах STL та OBJ"
            >
              <Circle className="w-3.5 h-3.5" />
              <span>{isExportingPipeZip ? "ZIP труб..." : "Труби 3,4,5 (STL/OBJ)"}</span>
            </button>

            <button
              onClick={handleDownloadAllConnectorsZIP}
              disabled={isExportingZip}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#DE7C5A] text-white hover:bg-[#C9603D] shadow-2xs whitespace-nowrap cursor-pointer transition-all disabled:opacity-50"
              title="Завантажити повний ZIP-архів усіх видів конекторів у форматах STL та OBJ для 3D друку та CAD"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExportingZip ? "Генерація ZIP..." : "ZIP (STL + OBJ всі види)"}</span>
            </button>

            <button
              onClick={handleDownloadAllConnectorsDXF}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1A2E3B] text-white hover:bg-[#2D3748] shadow-2xs whitespace-nowrap cursor-pointer"
              title="Завантажити всі типи конекторів для верстатів лазерного розкрою у форматі AutoCAD DXF (R12)"
            >
              <Cpu className="w-3.5 h-3.5 text-[#DE7C5A]" />
              <span>DXF для ЧПУ</span>
            </button>

            <button
              onClick={handleDownloadAllTypes}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold tactile-btn-mint whitespace-nowrap"
              title="Завантажити векторні креслення SVG для всіх унікальних типів пластин"
            >
              <Download className="w-3.5 h-3.5" />
              <span>SVG ({totalConnectorsCount} шт)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Sizing Sliders [20 mm - 300 mm] */}
      <div className="p-4 rounded-3xl tactile-inset-subtle border border-white/80 bg-white/40">
        {/* Connector System Quick Selector */}
        <div className="mb-4 pb-3 border-b border-[#E8E2D8]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-[#1A2E3B] uppercase tracking-wider flex items-center gap-1.5">
              <Box className="w-4 h-4 text-[#DE7C5A]" />
              Конструктивна система конекторів
            </span>
            <span className="text-[11px] font-mono text-[#5A6778]">
              {connectorParams.type === "star_plate" && "Thunder Domes · Лазерний розкрій + листогиб"}
              {connectorParams.type === "pipe_hub" && "Pipe Hub · Товстостінна труба Ø108-150мм + лопаті"}
              {connectorParams.type === "spider" && "Spider · Зовнішні U-подібні чаші (цілісний брус)"}
              {connectorParams.type === "good_karma" && "Good Karma · Дерев'яний самозаклинюючий замок"}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: "star_plate", name: "Зірка (Thunder)", desc: "Пелюсткова пластина в паз", icon: Disc, color: "text-[#DE7C5A]" },
              { id: "pipe_hub", name: "Труба-Хаб (Pipe)", desc: "Сталева труба з ребрами", icon: Circle, color: "text-[#5B9279]" },
              { id: "spider", name: "Спайдер (U-чаші)", desc: "Охоплення бруса без паза", icon: Shield, color: "text-[#DDA843]" },
              { id: "good_karma", name: "Good Karma", desc: "Дерев'яне перекриття", icon: RotateCw, color: "text-[#2E7D32]" }
            ].map(sys => {
              const Icon = sys.icon;
              const isSel = (connectorParams.type || "star_plate") === sys.id;
              return (
                <button
                  key={sys.id}
                  type="button"
                  onClick={() => onChangeConnectorParams({ ...connectorParams, type: sys.id as any })}
                  className={`p-2.5 rounded-2xl text-left transition-all flex flex-col gap-1 cursor-pointer border ${
                    isSel
                      ? "bg-[#1A2E3B] text-white border-[#1A2E3B] shadow-xs"
                      : "bg-white hover:bg-[#FAF7F2] text-[#5A6778] border-[#E4DED3]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Icon className={`w-3.5 h-3.5 ${isSel ? "text-[#DE7C5A]" : sys.color}`} />
                    <span className={isSel ? "text-white" : "text-[#1A2E3B]"}>{sys.name}</span>
                  </div>
                  <span className={`text-[10px] ${isSel ? "text-[#A0AEC0]" : "text-[#8C9BAE]"}`}>
                    {sys.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Material, Anti-Corrosion Coating & Weight Calculation Engine */}
        <div className="mb-4 pb-4 border-b border-[#E8E2D8]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#DE7C5A]" />
              <h3 className="text-xs font-bold text-[#1A2E3B] uppercase tracking-wider">
                Матеріал конекторів, антикорозійне покриття та розрахунок ваги
              </h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE]">
                Загалом: {weightSummary.totalWeightKg} кг ({weightSummary.totalPieceCount} шт)
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-lg bg-white text-[#5A6778] border border-[#DCD6CA]">
                Сер. деталь: {weightSummary.averagePieceWeightKg < 1 ? `${Math.round(weightSummary.averagePieceWeightKg * 1000)} г` : `${weightSummary.averagePieceWeightKg.toFixed(2)} кг`}
              </span>
            </div>
          </div>

          {/* 1. Category Switcher: Steel | Aluminum | Plastic */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <button
              type="button"
              onClick={() => {
                const defaultMat = "steel_st3";
                onChangeConnectorParams({
                  ...connectorParams,
                  materialCategory: "steel",
                  material: defaultMat,
                  coating: CONNECTOR_MATERIALS[defaultMat].defaultCoating
                });
              }}
              className={`p-3 rounded-2xl text-left transition-all flex flex-col gap-1 cursor-pointer border ${
                currentCategory === "steel"
                  ? "bg-[#1A2E3B] text-white border-[#1A2E3B] shadow-xs"
                  : "bg-white hover:bg-[#FAF7F2] text-[#5A6778] border-[#E4DED3]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs flex items-center gap-1.5">
                  <span>🔩</span>
                  <span className={currentCategory === "steel" ? "text-white" : "text-[#1A2E3B]"}>
                    Конструкційна сталь
                  </span>
                </span>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  currentCategory === "steel" ? "bg-white/20 text-white" : "bg-[#F0EDE6] text-[#5A6778]"
                }`}>
                  7.85 г/см³
                </span>
              </div>
              <span className={`text-[10px] leading-tight ${currentCategory === "steel" ? "text-[#CBD5E1]" : "text-[#8C9BAE]"}`}>
                Максимальна жорсткість, доступна вартість розкрою та гнуття
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const defaultMat = "aluminum_d16t";
                onChangeConnectorParams({
                  ...connectorParams,
                  materialCategory: "aluminum",
                  material: defaultMat,
                  coating: CONNECTOR_MATERIALS[defaultMat].defaultCoating
                });
              }}
              className={`p-3 rounded-2xl text-left transition-all flex flex-col gap-1 cursor-pointer border ${
                currentCategory === "aluminum"
                  ? "bg-[#1A2E3B] text-white border-[#1A2E3B] shadow-xs"
                  : "bg-white hover:bg-[#FAF7F2] text-[#5A6778] border-[#E4DED3]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs flex items-center gap-1.5">
                  <span>🪶</span>
                  <span className={currentCategory === "aluminum" ? "text-white" : "text-[#1A2E3B]"}>
                    Авіаційний алюміній
                  </span>
                </span>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  currentCategory === "aluminum" ? "bg-white/20 text-white" : "bg-[#F0EDE6] text-[#5A6778]"
                }`}>
                  2.78 г/см³ (-64%)
                </span>
              </div>
              <span className={`text-[10px] leading-tight ${currentCategory === "aluminum" ? "text-[#CBD5E1]" : "text-[#8C9BAE]"}`}>
                У 2.8 разів легший за сталь, стійке анодування та легка збірка
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                const defaultMat = "plastic_petg";
                onChangeConnectorParams({
                  ...connectorParams,
                  materialCategory: "plastic",
                  material: defaultMat,
                  coating: CONNECTOR_MATERIALS[defaultMat].defaultCoating,
                  plasticInfillPercent: connectorParams.plasticInfillPercent || 100
                });
              }}
              className={`p-3 rounded-2xl text-left transition-all flex flex-col gap-1 cursor-pointer border ${
                currentCategory === "plastic"
                  ? "bg-[#1A2E3B] text-white border-[#1A2E3B] shadow-xs"
                  : "bg-white hover:bg-[#FAF7F2] text-[#5A6778] border-[#E4DED3]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs flex items-center gap-1.5">
                  <span>🧊</span>
                  <span className={currentCategory === "plastic" ? "text-white" : "text-[#1A2E3B]"}>
                    Інженерний пластик (3D-друк)
                  </span>
                </span>
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  currentCategory === "plastic" ? "bg-white/20 text-white" : "bg-[#F0EDE6] text-[#5A6778]"
                }`}>
                  1.27 г/см³ (-84%)
                </span>
              </div>
              <span className={`text-[10px] leading-tight ${currentCategory === "plastic" ? "text-[#CBD5E1]" : "text-[#8C9BAE]"}`}>
                Прямий 3D-друк .STL або серійне лиття, не ржавіє, легкий
              </span>
            </button>
          </div>

          {/* 2. Specific Grade + Coating Selection Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Column A: Material Grade Selection */}
            <div className="p-3 rounded-2xl bg-white border border-[#E8E2D8] flex flex-col justify-between gap-2">
              <div>
                <div className="flex justify-between items-center text-xs font-bold text-[#1A2E3B] mb-1.5">
                  <span className="flex items-center gap-1">
                    <span>Марка матеріалу</span>
                  </span>
                  <span className="text-[10px] font-mono text-[#5B9279] bg-[#E1EDE3] px-1.5 py-0.5 rounded">
                    σт = {currentMatInfo.yieldStrengthMpa} МПа
                  </span>
                </div>
                <select
                  value={currentMatId}
                  onChange={e => {
                    const newMatId = e.target.value as ConnectorMaterialId;
                    const newMat = CONNECTOR_MATERIALS[newMatId] || CONNECTOR_MATERIALS.steel_st3;
                    onChangeConnectorParams({
                      ...connectorParams,
                      material: newMatId,
                      materialCategory: newMat.category,
                      coating: newMat.defaultCoating
                    });
                  }}
                  className="w-full py-1.5 px-2.5 text-xs font-bold rounded-xl bg-[#FAF7F2] border border-[#E4DED3] text-[#1A2E3B] outline-none cursor-pointer"
                >
                  {categoryMaterials.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} (густина {m.densityKgM3} кг/м³)
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#5A6778] mt-1.5 leading-relaxed">
                  {currentMatInfo.description}
                </p>
              </div>

              {/* If Plastic: 3D Infill percentage toggle */}
              {currentCategory === "plastic" && (
                <div className="pt-2 border-t border-[#EFEBE4] space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#5A6778] font-medium flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#DE7C5A]" />
                      <span>Заповнення 3D-друку (Infill)</span>
                    </span>
                    <span className="font-mono font-bold text-[#DE7C5A]">
                      {connectorParams.plasticInfillPercent || 100}%
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[60, 80, 100].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() =>
                          onChangeConnectorParams({
                            ...connectorParams,
                            plasticInfillPercent: pct
                          })
                        }
                        className={`flex-1 py-1 text-[10px] font-mono font-bold rounded-lg transition-all ${
                          (connectorParams.plasticInfillPercent || 100) === pct
                            ? "bg-[#DE7C5A] text-white shadow-2xs"
                            : "bg-[#FAF7F2] text-[#5A6778] border border-[#E8E2D8] hover:bg-white"
                        }`}
                      >
                        {pct}% {pct === 100 ? "(Литий)" : ""}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Column B: Anti-Corrosion Coating & Finishing */}
            <div className="p-3 rounded-2xl bg-white border border-[#E8E2D8] flex flex-col justify-between gap-2">
              <div>
                <div className="flex justify-between items-center text-xs font-bold text-[#1A2E3B] mb-1.5">
                  <span className="flex items-center gap-1">
                    <Paintbrush className="w-3.5 h-3.5 text-[#DE7C5A]" />
                    <span>Спосіб покриття / антикор</span>
                  </span>
                  <span className="text-[10px] font-mono text-[#2E7D32] bg-[#E1EDE3] px-1.5 py-0.5 rounded font-bold">
                    {currentCoatingInfo.durabilityYears}
                  </span>
                </div>
                <select
                  value={currentCoatingId}
                  onChange={e =>
                    onChangeConnectorParams({
                      ...connectorParams,
                      coating: e.target.value as ConnectorCoatingId
                    })
                  }
                  className="w-full py-1.5 px-2.5 text-xs font-bold rounded-xl bg-[#FAF7F2] border border-[#E4DED3] text-[#1A2E3B] outline-none cursor-pointer"
                >
                  {categoryCoatings.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.standard})
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#FAF7F2] border border-[#E8E2D8] text-[#5A6778]">
                    Стандарт: {currentCoatingInfo.standard}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#FAF7F2] border border-[#E8E2D8] text-[#5A6778]">
                    Шар: {currentCoatingInfo.thicknessMicrons}
                  </span>
                </div>
                <p className="text-[11px] text-[#5A6778] mt-1.5 leading-relaxed">
                  {currentCoatingInfo.description}
                </p>
              </div>
            </div>

            {/* Column C: Live Automated Weight & Comparison */}
            <div className="p-3 rounded-2xl bg-white border border-[#E8E2D8] flex flex-col justify-between gap-2">
              <div>
                <div className="flex justify-between items-center text-xs font-bold text-[#1A2E3B] mb-1.5">
                  <span className="flex items-center gap-1">
                    <Scale className="w-3.5 h-3.5 text-[#5B9279]" />
                    <span>Розрахунок ваги вузлів</span>
                  </span>
                  <span className="text-[10px] font-mono text-[#5A6778]">
                    {weightSummary.totalPieceCount} шт.
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center my-1.5">
                  <div className="p-2 rounded-xl bg-[#FAF7F2] border border-[#EFEBE4]">
                    <span className="text-[9px] text-[#8C9BAE] block uppercase font-bold">1 деталь (сер.)</span>
                    <span className="text-sm font-mono font-black text-[#1A2E3B]">
                      {weightSummary.averagePieceWeightKg < 1
                        ? `${Math.round(weightSummary.averagePieceWeightKg * 1000)} г`
                        : `${weightSummary.averagePieceWeightKg.toFixed(2)} кг`}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-[#FAF7F2] border border-[#EFEBE4]">
                    <span className="text-[9px] text-[#8C9BAE] block uppercase font-bold">Всі конектори</span>
                    <span className="text-sm font-mono font-black text-[#DE7C5A]">
                      {weightSummary.totalWeightKg} кг
                    </span>
                  </div>
                </div>

                {/* Weight Comparison / Savings badge */}
                {weightComparison.weightSavedKg > 0 ? (
                  <div className="p-2 rounded-xl bg-[#E1EDE3]/70 border border-[#A6C7AE]/60 text-xs text-[#1A3E26] mt-2">
                    <div className="flex items-center gap-1 font-bold text-[11px]">
                      <span>⚡️</span>
                      <span>Економія ваги: -{weightComparison.weightSavedKg} кг (-{weightComparison.weightSavedPercent}%)</span>
                    </div>
                    <p className="text-[10px] text-[#3D6B5D] mt-0.5">
                      Вага сталевого аналога: {weightComparison.steelEquivalentWeightKg} кг. Зниження навантаження на фундамент та спрощення монтажу.
                    </p>
                  </div>
                ) : (
                  <div className="p-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] text-[11px] text-[#5A6778] mt-2">
                    <span className="font-semibold text-[#1A2E3B]">Сталевий еталон:</span> максимальна стійкість до снігових та вітрових деформацій.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#5B9279]" />
            <h3 className="text-xs font-bold text-[#1A2E3B] uppercase tracking-wider">
              Геометричні розміри ({model.parameters.diameter < 1000 ? "2 мм - 80 мм" : "20 мм - 300 мм"})
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {onResetToProportional && (
              <button
                type="button"
                onClick={onResetToProportional}
                className="text-xs font-bold text-[#2E7D32] bg-[#E1EDE3] hover:bg-[#d0e5d3] px-2.5 py-1 rounded-lg border border-[#A6C7AE] transition-all"
                title="Скинути розміри конектора до ідеальної пропорції під розмір купола"
              >
                ⚡ Пропорційно куполу
              </button>
            )}
            <span className="text-[11px] font-mono font-bold text-[#5B9279] bg-white px-2 py-0.5 rounded-md border border-[#DCD6CA]">
              Сердцевина: {connectorParams.hubDiameter} мм · Луч: {connectorParams.tabLength} мм
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Core Diameter [2 - 300 mm] */}
          <div className="p-3 rounded-2xl bg-white/70 border border-[#E8E2D8]">
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="font-semibold text-[#5A6778]">Сердцевина (діаметр)</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={2}
                  max={model.parameters.diameter < 1000 ? 80 : 300}
                  step={connectorParams.hubDiameter < 20 ? 0.5 : 5}
                  value={connectorParams.hubDiameter}
                  onChange={e =>
                    onChangeConnectorParams({
                      ...connectorParams,
                      hubDiameter: Number(e.target.value)
                    })
                  }
                  className="w-14 px-1 py-0.5 text-xs font-mono font-bold text-right text-[#1A2E3B] bg-transparent outline-none border-b border-[#5B9279]"
                />
                <span className="text-[10px] text-[#8C9BAE]">мм</span>
              </div>
            </div>
            <input
              type="range"
              min={2}
              max={model.parameters.diameter < 1000 ? 80 : 300}
              step={connectorParams.hubDiameter < 20 ? 0.5 : 5}
              value={connectorParams.hubDiameter}
              onChange={e =>
                onChangeConnectorParams({
                  ...connectorParams,
                  hubDiameter: Number(e.target.value)
                })
              }
              className="w-full accent-[#5B9279] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#8C9BAE] font-mono mt-1">
              <span>{model.parameters.diameter < 1000 ? "2 мм" : "20 мм"}</span>
              <span>{connectorParams.hubDiameter} мм</span>
              <span>{model.parameters.diameter < 1000 ? "80 мм" : "300 мм"}</span>
            </div>
          </div>

          {/* Ray Length [2 - 300 mm] */}
          <div className="p-3 rounded-2xl bg-white/70 border border-[#E8E2D8]">
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="font-semibold text-[#5A6778]">Довжина луча</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={2}
                  max={model.parameters.diameter < 1000 ? 80 : 300}
                  step={connectorParams.tabLength < 20 ? 0.5 : 5}
                  value={connectorParams.tabLength}
                  onChange={e =>
                    onChangeConnectorParams({
                      ...connectorParams,
                      tabLength: Number(e.target.value)
                    })
                  }
                  className="w-14 px-1 py-0.5 text-xs font-mono font-bold text-right text-[#1A2E3B] bg-transparent outline-none border-b border-[#5B9279]"
                />
                <span className="text-[10px] text-[#8C9BAE]">мм</span>
              </div>
            </div>
            <input
              type="range"
              min={2}
              max={model.parameters.diameter < 1000 ? 80 : 300}
              step={connectorParams.tabLength < 20 ? 0.5 : 5}
              value={connectorParams.tabLength}
              onChange={e =>
                onChangeConnectorParams({
                  ...connectorParams,
                  tabLength: Number(e.target.value)
                })
              }
              className="w-full accent-[#5B9279] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#8C9BAE] font-mono mt-1">
              <span>{model.parameters.diameter < 1000 ? "2 мм" : "20 мм"}</span>
              <span>{connectorParams.tabLength} мм</span>
              <span>{model.parameters.diameter < 1000 ? "80 мм" : "300 мм"}</span>
            </div>
          </div>

          {/* Ray Width [1.5 - 150 mm] */}
          <div className="p-3 rounded-2xl bg-white/70 border border-[#E8E2D8]">
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="font-semibold text-[#5A6778]">Ширина луча</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1.5}
                  max={model.parameters.diameter < 1000 ? 40 : 150}
                  step={connectorParams.tabWidth < 20 ? 0.5 : 5}
                  value={connectorParams.tabWidth}
                  onChange={e =>
                    onChangeConnectorParams({
                      ...connectorParams,
                      tabWidth: Number(e.target.value)
                    })
                  }
                  className="w-12 px-1 py-0.5 text-xs font-mono font-bold text-right text-[#1A2E3B] bg-transparent outline-none border-b border-[#5B9279]"
                />
                <span className="text-[10px] text-[#8C9BAE]">мм</span>
              </div>
            </div>
            <input
              type="range"
              min={1.5}
              max={model.parameters.diameter < 1000 ? 40 : 150}
              step={connectorParams.tabWidth < 20 ? 0.5 : 5}
              value={connectorParams.tabWidth}
              onChange={e =>
                onChangeConnectorParams({
                  ...connectorParams,
                  tabWidth: Number(e.target.value)
                })
              }
              className="w-full accent-[#5B9279] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#8C9BAE] font-mono mt-1">
              <span>{model.parameters.diameter < 1000 ? "1.5 мм" : "20 мм"}</span>
              <span>{connectorParams.tabWidth} мм</span>
              <span>{model.parameters.diameter < 1000 ? "40 мм" : "150 мм"}</span>
            </div>
          </div>

          {/* Thickness, Hollowness & Fasteners */}
          <div className="p-3 rounded-2xl bg-white/70 border border-[#E8E2D8] flex flex-col justify-between">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-[10px] text-[#5A6778] block mb-1">Товщина сталі</span>
                <select
                  value={connectorParams.thickness}
                  onChange={e =>
                    onChangeConnectorParams({
                      ...connectorParams,
                      thickness: Number(e.target.value)
                    })
                  }
                  className="w-full py-1 px-1.5 text-xs font-mono font-bold rounded-lg bg-white border border-[#DCD6CA] text-[#1A2E3B]"
                >
                  <option value={0.5}>0.5 мм</option>
                  <option value={0.8}>0.8 мм</option>
                  <option value={1.0}>1.0 мм</option>
                  <option value={1.5}>1.5 мм</option>
                  <option value={2.0}>2.0 мм</option>
                  <option value={3.0}>3.0 мм</option>
                  <option value={4.0}>4.0 мм</option>
                  <option value={5.0}>5.0 мм</option>
                  <option value={6.0}>6.0 мм</option>
                  <option value={8.0}>8.0 мм</option>
                </select>
              </div>

              <div>
                <span className="text-[10px] text-[#5A6778] block mb-1" title="Товщина стінок пустотілого конектора (0.5 – 20 мм)">Стінка 3D</span>
                <div className="flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded-lg border border-[#DCD6CA]">
                  <input
                    type="number"
                    min={0.5}
                    max={20.0}
                    step={0.1}
                    value={connectorParams.wallThickness || 2.5}
                    onChange={e => {
                      const val = Number(e.target.value);
                      if (!isNaN(val)) {
                        onChangeConnectorParams({
                          ...connectorParams,
                          wallThickness: Math.max(0.5, Math.min(20, val))
                        });
                      }
                    }}
                    className="w-full text-center font-mono font-bold text-xs text-[#DE7C5A] outline-none"
                  />
                  <span className="text-[9px] text-[#8C9BAE]">мм</span>
                </div>
              </div>

              <div>
                <span className="text-[10px] text-[#5A6778] block mb-1">Болти</span>
                <select
                  value={connectorParams.boltDiameter}
                  onChange={e =>
                    onChangeConnectorParams({
                      ...connectorParams,
                      boltDiameter: Number(e.target.value)
                    })
                  }
                  className="w-full py-1 px-1.5 text-xs font-mono font-bold rounded-lg bg-white border border-[#DCD6CA] text-[#1A2E3B]"
                >
                  <option value={1.2}>M1.2</option>
                  <option value={1.6}>M1.6</option>
                  <option value={2}>M2</option>
                  <option value={2.5}>M2.5</option>
                  <option value={3}>M3</option>
                  <option value={4}>M4</option>
                  <option value={5}>M5</option>
                  <option value={6}>M6</option>
                  <option value={8}>M8</option>
                  <option value={10}>M10</option>
                  <option value={12}>M12</option>
                  <option value={14}>M14</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-[#5A6778] pt-2 border-t border-[#E8E2D8] mt-2">
              <span>Отворів на луч:</span>
              <div className="flex gap-1">
                {[1, 2, 3].map(cnt => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() =>
                      onChangeConnectorParams({
                        ...connectorParams,
                        boltHoleCount: cnt
                      })
                    }
                    className={`px-2 py-0.5 text-xs font-mono font-bold rounded-md transition-all ${
                      (connectorParams.boltHoleCount || 2) === cnt
                        ? "bg-[#5B9279] text-white shadow-xs"
                        : "bg-white text-[#5A6778] border border-[#DCD6CA]"
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: ALL CONNECTOR TYPES DRAWINGS (Галерея всіх видів з тиражем) */}
      {viewMode === "all" && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-[#5A6778] uppercase tracking-wider">
                Креслення видів пластин:
              </span>
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#E8E2D8] flex-wrap">
                <button
                  onClick={() => setRayFilter("all")}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    rayFilter === "all"
                      ? "bg-[#1A2E3B] text-white shadow-2xs"
                      : "text-[#5A6778] hover:text-[#1A2E3B]"
                  }`}
                >
                  Всі ({connectorTypes.length})
                </button>
                {count4R > 0 && (
                  <button
                    onClick={() => setRayFilter(4)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                      rayFilter === 4
                        ? "bg-[#DE7C5A] text-white shadow-2xs"
                        : "text-[#DE7C5A] hover:bg-[#FDF0E6]"
                    }`}
                    title="Показати тільки 4-променеві опорні конектори основи купола"
                  >
                    <Anchor className="w-3 h-3" />
                    <span>4-променеві ({count4R})</span>
                  </button>
                )}
                {count5R > 0 && (
                  <button
                    onClick={() => setRayFilter(5)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      rayFilter === 5
                        ? "bg-[#5B9279] text-white shadow-2xs"
                        : "text-[#5B9279] hover:bg-[#E1EDE3]"
                    }`}
                  >
                    5-променеві ({count5R})
                  </button>
                )}
                {count6R > 0 && (
                  <button
                    onClick={() => setRayFilter(6)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      rayFilter === 6
                        ? "bg-[#4A7C9B] text-white shadow-2xs"
                        : "text-[#4A7C9B] hover:bg-[#EBF3F8]"
                    }`}
                  >
                    6-променеві ({count6R})
                  </button>
                )}
              </div>
            </div>
            <span className="text-xs text-[#5A6778]">
              На кожному кресленні вказано точну кількість штук на весь купол
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {filteredTypes.map(t => {
              const svgContent = typeSvgs.get(t.typeId) || "";

              return (
                <div
                  key={t.typeId}
                  className="flex flex-col rounded-3xl tactile-card border border-white/80 overflow-hidden shadow-xs"
                >
                  {/* Card Title & Quantity Header */}
                  <div className="p-4 bg-white/70 border-b border-[#E8E2D8] flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-[#1A2E3B]">{t.name}</h3>
                        {t.isPlinthGround ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                            Опора цоколя (Z=0)
                          </span>
                        ) : t.isPlinthTop ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE]">
                            Пояс цоколя та купола
                          </span>
                        ) : t.isBoundary ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#E1EDE3] text-[#1A3E26]">
                            Основа Z=0
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-[#5A6778] mt-0.5">
                        Променів: <b>{t.rayCount}</b> · Склад балок:{" "}
                        <span className="font-mono text-[#2E7D32] font-semibold">
                          {t.beamSignature}
                        </span>
                      </p>

                      {/* Node Markings for this connector type */}
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        <span className="text-[10px] font-bold text-[#5A6778] uppercase">
                          Вузли ({t.nodeIds.length}):
                        </span>
                        <div className="flex items-center gap-1 flex-wrap max-h-[46px] overflow-y-auto">
                          {t.nodeIds.map(nid => {
                            const nLabel = model.nodes[nid]?.label || `AA${nid + 1}`;
                            const isSelected = selectedNodeId === nid;
                            return (
                              <button
                                key={nid}
                                type="button"
                                onClick={() => onSelectNode(nid)}
                                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                                  isSelected
                                    ? "bg-[#DE7C5A] text-white shadow-xs"
                                    : "bg-white text-[#1A2E3B] border border-[#DCD6CA] hover:border-[#DE7C5A] hover:bg-[#FAF7F2]"
                                }`}
                                title={`Виділити вузол ${nLabel} у 3D`}
                              >
                                {nLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Prominent Quantity Badge */}
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-end">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#1B4D2E]">
                          Тираж на купол:
                        </span>
                        <span className="text-base font-mono font-black text-[#2E7D32] bg-[#E1EDE3] px-3 py-0.5 rounded-xl border border-[#A6C7AE]">
                          {t.countInDome} ШТ.
                        </span>
                        {(() => {
                          const pWt = calculateConnectorPieceWeight(t.rayCount, t.isBoundary, connectorParams, model.beamProfile);
                          const totWt = Math.round(pWt * t.countInDome * 100) / 100;
                          return (
                            <span className="text-[10px] font-mono text-[#5A6778] mt-0.5">
                              {pWt < 1 ? `${Math.round(pWt * 1000)} г` : `${pWt.toFixed(2)} кг`}/шт · {totWt} кг
                            </span>
                          );
                        })()}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDownloadSingleConnectorSTL(t)}
                          className="px-2 py-1.5 rounded-xl bg-[#DE7C5A] text-white hover:bg-[#C9603D] font-bold text-[11px] flex items-center gap-1 shadow-2xs cursor-pointer"
                          title={`Завантажити 3D модель ${t.rayCount}-променевого конектора у форматі STL для 3D друку`}
                        >
                          <Download className="w-3 h-3" />
                          <span>STL</span>
                        </button>
                        <button
                          onClick={() => handleDownloadSingleConnectorOBJ(t)}
                          className="px-2 py-1.5 rounded-xl bg-[#1A2E3B] text-white hover:bg-[#2D3748] font-bold text-[11px] flex items-center gap-1 shadow-2xs cursor-pointer"
                          title={`Завантажити 3D модель ${t.rayCount}-променевого конектора у форматі OBJ для CAD`}
                        >
                          <Download className="w-3 h-3 text-[#5B9279]" />
                          <span>OBJ</span>
                        </button>
                        <button
                          onClick={() => handleDownloadSingleConnectorDXF(t)}
                          className="p-1.5 rounded-xl bg-white border border-[#DCD6CA] text-[#1A2E3B] hover:bg-slate-50 cursor-pointer"
                          title={`Завантажити креслення DXF для ЧПУ`}
                        >
                          <Cpu className="w-3.5 h-3.5 text-[#DE7C5A]" />
                        </button>
                        <button
                          onClick={() => handleDownloadTypeSvg(t)}
                          className="p-1.5 rounded-xl tactile-btn text-[#5A6778] hover:text-[#1A2E3B]"
                          title={`Завантажити креслення SVG (${t.countInDome} шт)`}
                        >
                          <Download className="w-3.5 h-3.5 text-[#5B9279]" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* SVG Drawing Canvas */}
                  <div className="p-4 flex items-center justify-center bg-[#FAF7F2] min-h-[380px] relative border-b border-[#E8E2D8]">
                    <div
                      className="w-full max-w-[420px] max-h-[380px] flex items-center justify-center"
                      dangerouslySetInnerHTML={{ __html: svgContent }}
                    />
                  </div>

                  {/* Angular Specs Table */}
                  <div className="p-4 bg-white/40 flex flex-col gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A6778]">
                      Кути розгортки на площині (Δα) та кути згину на листогибі (δ):
                    </span>

                    <div className="rounded-xl overflow-hidden border border-[#E8E2D8]">
                      <table className="w-full text-[11px] text-left">
                        <thead className="bg-[#EAE4D9]/80 text-[#5A6778] font-bold border-b border-[#DCD6CA]">
                          <tr>
                            <th className="py-1.5 px-2">Луч</th>
                            <th className="py-1.5 px-2">Балка</th>
                            <th className="py-1.5 px-2 font-mono text-center">Кут розгортки (Δα)</th>
                            <th className="py-1.5 px-2 font-mono text-center">3D кут (φ)</th>
                            <th className="py-1.5 px-2 font-mono text-center text-[#DE7C5A]">
                              Згин на пресі (δ)
                            </th>
                            <th className="py-1.5 px-2 font-mono text-center text-[#2E7D32]">
                              Нахил
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E4DED3] bg-white/70">
                          {t.rayDetails.map((ray, idx) => (
                            <tr key={idx} className="hover:bg-white transition-colors">
                              <td className="py-1 px-2 font-bold text-[#1A2E3B]">#{ray.rayIndex}</td>
                              <td className="py-1 px-2">
                                <span className="px-1.5 py-0.5 rounded bg-white border border-[#DCD6CA] font-bold text-[#1A2E3B]">
                                  {ray.beamType}
                                </span>
                              </td>
                              <td className="py-1 px-2 font-mono font-bold text-center text-[#1A2E3B]">
                                {ray.planarDeltaToNextDeg}°
                              </td>
                              <td className="py-1 px-2 font-mono text-center text-[#5A6778]">
                                {ray.spatialAngleToNextDeg}°
                              </td>
                              <td className="py-1 px-2 font-mono font-bold text-center text-[#DE7C5A] bg-[#FDF0E6]/60">
                                {ray.bendAngleDeg}°
                              </td>
                              <td className="py-1 px-2 font-mono text-center text-[#2E7D32]">
                                {ray.pitchToHorizonDeg}°
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => handleDownloadSingleConnectorSTL(t)}
                          className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-[#DE7C5A] text-white hover:bg-[#C9603D] flex items-center gap-1 shadow-2xs cursor-pointer transition-all"
                          title="Завантажити STL для 3D друку на принтері (окремий конектор)"
                        >
                          <Download className="w-2.5 h-2.5" />
                          <span>STL</span>
                        </button>
                        <button
                          onClick={() => handleDownloadSingleConnectorDXF(t)}
                          className="px-2 py-0.5 text-[10px] font-bold rounded-lg bg-[#1A2E3B] text-white hover:bg-[#2D3748] flex items-center gap-1 shadow-2xs cursor-pointer"
                          title="Завантажити DXF для ЧПУ лазера"
                        >
                          <Cpu className="w-2.5 h-2.5 text-[#DE7C5A]" />
                          <span>DXF</span>
                        </button>
                        <span className="text-[11px] font-mono font-black text-white bg-[#0F172A] border border-[#38BDF8] px-2 py-0.5 rounded-md shadow-2xs" title={`Зразок вузла: ${model.nodes[t.sampleNodeId]?.label || t.sampleNodeId}`}>
                          {model.nodes[t.sampleNodeId]?.label || `#${t.sampleNodeId}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedTypeId(t.typeId);
                            onSelectNode(t.sampleNodeId);
                            setViewMode("3d");
                          }}
                          className="text-xs font-bold text-[#DE7C5A] hover:text-[#c45f3c] flex items-center gap-1 cursor-pointer"
                          title="Переглянути цей конектор в інтерактивному 3D"
                        >
                          <Box className="w-3.5 h-3.5" />
                          <span>3D</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedTypeId(t.typeId);
                            onSelectNode(t.sampleNodeId);
                            setViewMode("single");
                          }}
                          className="text-xs font-semibold text-[#5B9279] hover:underline cursor-pointer"
                        >
                          Детально 2D →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW MODE 2: SINGLE CONNECTOR TYPE DETAILED INSPECTOR */}
      {viewMode === "single" && activeType && (
        <div className="flex flex-col gap-5">
          {/* Sub-selector chips with quick ray filters */}
          <div className="flex flex-col gap-2 p-3 rounded-2xl bg-white/70 border border-[#E8E2D8]">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-[#5A6778] uppercase tracking-wider px-1">
                Оберіть вид конектора:
              </span>
              <div className="flex items-center gap-1 bg-[#F5F0E8] p-1 rounded-xl text-xs flex-wrap">
                <button
                  type="button"
                  onClick={() => setRayFilter("all")}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                    rayFilter === "all" ? "bg-white text-[#1A2E3B] shadow-2xs" : "text-[#5A6778] hover:text-[#1A2E3B]"
                  }`}
                >
                  Всі ({connectorTypes.length})
                </button>
                {count4R > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setRayFilter(4);
                      const first4 = connectorTypes.find(t => t.rayCount === 4);
                      if (first4) {
                        setSelectedTypeId(first4.typeId);
                        onSelectNode(first4.sampleNodeId);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs flex items-center gap-1 cursor-pointer transition-all ${
                      rayFilter === 4 ? "bg-[#DE7C5A] text-white shadow-2xs" : "text-[#DE7C5A] hover:bg-[#FDF0E6]"
                    }`}
                    title="Швидкий перехід до 4-променевих опорних конекторів основи"
                  >
                    <Anchor className="w-3 h-3" />
                    <span>4-променеві ({count4R})</span>
                  </button>
                )}
                {count5R > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setRayFilter(5);
                      const first5 = connectorTypes.find(t => t.rayCount === 5);
                      if (first5) {
                        setSelectedTypeId(first5.typeId);
                        onSelectNode(first5.sampleNodeId);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                      rayFilter === 5 ? "bg-[#5B9279] text-white shadow-2xs" : "text-[#5B9279] hover:bg-[#E1EDE3]"
                    }`}
                  >
                    5-променеві ({count5R})
                  </button>
                )}
                {count6R > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setRayFilter(6);
                      const first6 = connectorTypes.find(t => t.rayCount === 6);
                      if (first6) {
                        setSelectedTypeId(first6.typeId);
                        onSelectNode(first6.sampleNodeId);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                      rayFilter === 6 ? "bg-[#4A7C9B] text-white shadow-2xs" : "text-[#4A7C9B] hover:bg-[#EBF3F8]"
                    }`}
                  >
                    6-променеві ({count6R})
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 max-w-full">
              {filteredTypes.map(t => (
                <button
                  key={t.typeId}
                  onClick={() => {
                    setSelectedTypeId(t.typeId);
                    onSelectNode(t.sampleNodeId);
                  }}
                  className={`px-2.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border max-w-full ${
                    selectedTypeId === t.typeId
                      ? "bg-[#1A2E3B] text-white border-[#1A2E3B] shadow-xs"
                      : "bg-white hover:bg-[#FAF7F2] text-[#1A2E3B] border-[#DCD6CA] hover:border-[#B8AF9E]"
                  }`}
                  title={`${t.name} (${t.countInDome} шт.)`}
                >
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                      selectedTypeId === t.typeId
                        ? "bg-[#DE7C5A] text-white"
                        : t.isBoundary
                        ? "bg-[#FDEAE2] text-[#DE7C5A] border border-[#DE7C5A]/30"
                        : t.rayCount === 5
                        ? "bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE]"
                        : "bg-[#E4EEF5] text-[#1A2E3B] border border-[#BDD3E3]"
                    }`}
                  >
                    {t.rayCount}R
                  </span>
                  {t.isBoundary && <Anchor className="w-3 h-3 text-[#DE7C5A] shrink-0" />}
                  <span className="truncate max-w-[130px] sm:max-w-[200px]">
                    {t.isBoundary
                      ? `4R Опора основи`
                      : t.rayCount === 5
                      ? `5R Apex (Пентагон)`
                      : `6R Гексагон`}
                  </span>
                  <span className="font-mono text-[10px] text-[#2E7D32] bg-[#E1EDE3] px-1.5 py-0.5 rounded-md shrink-0">
                    {t.countInDome} шт
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Large SVG Canvas Card */}
            <div className="lg:col-span-7 flex flex-col gap-3 rounded-3xl tactile-inset p-4 sm:p-5 border border-white/60 bg-[#FAF7F2]">
              {/* Header Bar above drawing */}
              <div className="flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#1A2E3B]">Розкрій пластини (CAD 1:1):</span>
                  <span className="font-mono text-xs font-black text-white bg-[#0F172A] px-2.5 py-0.5 rounded-lg border border-[#38BDF8] shadow-2xs">
                    {model.nodes[activeType.sampleNodeId]?.label || `AA${activeType.sampleNodeId + 1}`}
                  </span>
                </div>
                <span className="text-xs font-mono font-black px-3 py-1 rounded-xl bg-[#E1EDE3] text-[#1A3E26] shadow-2xs border border-[#A6C7AE]">
                  ТИРАЖ: {activeType.countInDome} ШТ.
                </span>
              </div>

              {/* Dedicated SVG Canvas - 100% clean without overlapping UI elements */}
              <div className="w-full flex items-center justify-center p-2 sm:p-4 rounded-2xl bg-white border border-[#E8E2D8] shadow-xs overflow-hidden">
                <div
                  className="w-full max-w-[560px] max-h-[460px] flex items-center justify-center [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[460px]"
                  dangerouslySetInnerHTML={{ __html: typeSvgs.get(activeType.typeId) || "" }}
                />
              </div>

              {/* Specs Bar below drawing */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#5A6778] font-mono px-3 py-1.5 bg-white/80 rounded-xl border border-white/80">
                <span>
                  Сердцевина: <b className="text-[#1A2E3B]">{connectorParams.hubDiameter} мм</b> · Луч: <b className="text-[#1A2E3B]">{connectorParams.tabLength} мм</b>
                </span>
                <span className="text-[#2E7D32] font-semibold">Масштаб 1:1 · Вектор для лазерного розкрою</span>
              </div>
            </div>

            {/* Right: Angular Table & Fabrication Instructions */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="p-5 rounded-3xl tactile-card border border-white/80">
                <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8] mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[#1A2E3B]">{activeType.name}</h3>
                      <span className="font-mono text-xs font-black text-white bg-[#0F172A] px-2 py-0.5 rounded-lg border border-[#38BDF8]">
                        {model.nodes[activeType.sampleNodeId]?.label || `AA${activeType.sampleNodeId + 1}`}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#5A6778] mt-0.5">
                      Кількість: <b className="text-[#2E7D32]">{activeType.countInDome} шт</b> · Вага 1 шт:{" "}
                      <b className="text-[#DE7C5A]">
                        {activeUnitWeightKg < 1 ? `${Math.round(activeUnitWeightKg * 1000)} г` : `${activeUnitWeightKg.toFixed(2)} кг`}
                      </b>{" "}
                      (разом {activeTotalWeightKg} кг)
                    </p>

                    {/* Active Type Node Markings */}
                    <div className="flex items-center gap-1.5 flex-wrap mt-2 pt-2 border-t border-[#E8E2D8]">
                      <span className="text-[10px] font-bold text-[#5A6778] uppercase">
                        Вузли купола ({activeType.nodeIds.length}):
                      </span>
                      <div className="flex items-center gap-1 flex-wrap max-h-[60px] overflow-y-auto">
                        {activeType.nodeIds.map(nid => {
                          const nLabel = model.nodes[nid]?.label || `AA${nid + 1}`;
                          const isSelected = selectedNodeId === nid;
                          return (
                            <button
                              key={nid}
                              type="button"
                              onClick={() => onSelectNode(nid)}
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                                isSelected
                                  ? "bg-[#DE7C5A] text-white shadow-xs"
                                  : "bg-white text-[#1A2E3B] border border-[#DCD6CA] hover:border-[#DE7C5A] hover:bg-[#FAF7F2]"
                              }`}
                              title={`Виділити вузол ${nLabel} у 3D`}
                            >
                              {nLabel}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => handleDownloadSingleConnectorSTL(activeType)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#DE7C5A] text-white hover:bg-[#C9603D] shadow-2xs cursor-pointer transition-all"
                      title="Завантажити 3D модель цього окремого конектора у форматі .STL для 3D-принтера (Cura, PrusaSlicer, Bambu Studio)"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>STL (3D-друк)</span>
                    </button>
                    <button
                      onClick={() => setViewMode("3d")}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#1A2E3B] text-white hover:bg-[#2D3748] shadow-2xs cursor-pointer"
                      title="Відкрити цей вузол в інтерактивному 3D"
                    >
                      <Box className="w-3.5 h-3.5 text-[#DE7C5A]" />
                      <span>3D</span>
                    </button>
                    <button
                      onClick={() => handleDownloadSingleConnectorDXF(activeType)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold tactile-btn text-[#1A2E3B] hover:text-[#DE7C5A] cursor-pointer"
                      title="Завантажити креслення для верстатів лазерної порізки у DXF (AutoCAD R12)"
                    >
                      <Cpu className="w-3.5 h-3.5 text-[#DE7C5A]" />
                      <span>DXF</span>
                    </button>
                    <button
                      onClick={() => handleDownloadTypeSvg(activeType)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold tactile-btn-mint cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>SVG</span>
                    </button>
                  </div>
                </div>

                {/* Detailed Table */}
                <div className="rounded-2xl overflow-hidden border border-[#E8E2D8]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#EAE4D9]/80 text-[#5A6778] font-bold border-b border-[#DCD6CA]">
                      <tr>
                        <th className="py-2 px-2.5">Луч</th>
                        <th className="py-2 px-2">Балка</th>
                        <th className="py-2 px-2 font-mono text-center">Кут (Δα)</th>
                        <th className="py-2 px-2 font-mono text-center">3D (φ)</th>
                        <th className="py-2 px-2 font-mono text-center text-[#DE7C5A]">Згин (δ)</th>
                        <th className="py-2 px-2 font-mono text-center text-[#2E7D32]">Нахил</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E4DED3]">
                      {activeType.rayDetails.map((ray, idx) => (
                        <tr key={idx} className="hover:bg-white/60 transition-colors">
                          <td className="py-2 px-2.5 font-bold text-[#1A2E3B]">#{ray.rayIndex}</td>
                          <td className="py-2 px-2 font-bold">
                            <span className="px-1.5 py-0.5 rounded bg-white border border-[#DCD6CA]">
                              {ray.beamType}
                            </span>
                          </td>
                          <td className="py-2 px-2 font-mono font-bold text-center text-[#1A2E3B]">
                            {ray.planarDeltaToNextDeg}°
                          </td>
                          <td className="py-2 px-2 font-mono text-center text-[#5A6778]">
                            {ray.spatialAngleToNextDeg}°
                          </td>
                          <td className="py-2 px-2 font-mono font-bold text-center text-[#DE7C5A] bg-[#FDF0E6]/50">
                            {ray.bendAngleDeg}°
                          </td>
                          <td className="py-2 px-2 font-mono text-center text-[#2E7D32]">
                            {ray.pitchToHorizonDeg}°
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 3D Printing Information Card */}
                <div className="mt-3 p-3 rounded-2xl bg-[#FFF6F0] border border-[#FCD9C9] text-xs text-[#9A3412] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-bold flex items-center gap-1.5 text-xs text-[#9A3412]">
                      <Download className="w-3.5 h-3.5" />
                      3D-друк окремого конектора (.STL)
                    </span>
                    <p className="text-[11px] text-[#C2410C] mt-0.5">
                      Готова твердотільна 3D модель з прорахованими просторовими кутами згину δ. Сумісна зі слайсерами Cura, PrusaSlicer, Bambu Studio. Рекомендовано пластик PETG / ABS / ASA або Nylon PA-CF (заповнення 60–100%, 4–6 стінок).
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownloadSingleConnectorSTL(activeType)}
                    className="px-3.5 py-1.5 rounded-xl bg-[#DE7C5A] text-white hover:bg-[#C9603D] font-bold text-xs shadow-2xs whitespace-nowrap cursor-pointer transition-all flex items-center gap-1.5 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Завантажити .STL</span>
                  </button>
                </div>

                <div className="mt-3 p-3 rounded-2xl bg-[#E1EDE3]/50 border border-[#A6C7AE]/60 text-xs text-[#1A3E26]">
                  <div className="flex items-center justify-between mb-1">
                    <b>Вказівка для виробництва:</b>
                    <span className="font-mono text-[10px] text-[#2E7D32]">
                      {weightSummary.materialName} · {weightSummary.coatingName}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#3D6B5D] mt-1 leading-relaxed">
                    Партія: <b>{activeType.countInDome} штук</b> ({weightSummary.materialName}, товщина {connectorParams.thickness} мм). Розрахункова маса партії: <b>{activeTotalWeightKg} кг</b>. Отвори під болти Ø{connectorParams.boltDiameter} мм. Покриття: <b>{weightSummary.coatingName}</b> ({weightSummary.coatingStandard}, гарантія {weightSummary.durabilityYears}). Відігнути кожен луч на вказаний кут згину δ.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 3: INTERACTIVE 3D CONNECTOR VIEWER */}
      {viewMode === "3d" && (
        <Connector3DViewer
          model={model}
          connectorParams={connectorParams}
          onChangeConnectorParams={onChangeConnectorParams}
          connectorTypes={connectorTypes}
          selectedTypeId={selectedTypeId}
          onSelectType={id => {
            setSelectedTypeId(id);
            const found = connectorTypes.find(t => t.typeId === id);
            if (found) onSelectNode(found.sampleNodeId);
          }}
          onSelectNode={id => onSelectNode(id)}
        />
      )}
    </div>
  );
};
