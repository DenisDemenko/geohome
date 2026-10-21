import React, { useMemo } from "react";
import {
  DomeModel,
  NodeId,
  EdgeId,
  FaceId,
  WindowGlazingParams,
  DoorOpeningParams,
  SolarGlazingParams,
  InnerSheathingParams
} from "../core/types";
import { calculateConnector } from "../core/connectors";
import { calculateBeamMiterAngles } from "../core/beams";
import { DEFAULT_SHEATHING_PARAMS, PLYWOOD_MATERIALS } from "../core/sheathing";
import {
  DEFAULT_WINDOW_PARAMS,
  GLAZING_OPTIONS,
  WINDOW_FRAME_OPTIONS
} from "../core/windows";
import {
  DEFAULT_DOOR_PARAMS,
  DEFAULT_SOLAR_PARAMS,
  calculateSolarGeneration
} from "../core/conversions";
import { analyzeDomeSolar, DomeSolarAnalysis } from "../core/solarAnalysis";
import {
  generateConnectorSVG,
  generateSingleBeamBlueprintSVG,
  generateSingleTriangleBlueprintSVG,
  downloadFile
} from "../export/svgExport";
import { exportSingleConnectorNodeSTL } from "../export/connector3dExport";
import {
  Compass,
  Ruler,
  Layers,
  X,
  Download,
  Info,
  ExternalLink,
  ChevronRight,
  Box,
  Sun,
  Maximize2,
  DoorOpen,
  Zap,
  Sliders,
  Sparkles
} from "lucide-react";

interface InspectorPanelProps {
  model: DomeModel;
  selectedNodeId: NodeId | null;
  selectedEdgeId: EdgeId | null;
  selectedFaceId: FaceId | null;
  onClose: () => void;
  onSelectNode: (id: NodeId) => void;
  onSelectEdge: (id: EdgeId) => void;
  windowFaceIds?: number[];
  onToggleWindowFace?: (faceId: number) => void;
  windowParams?: WindowGlazingParams;
  onChangeWindowParams?: (params: WindowGlazingParams) => void;
  doorFaceIds?: number[];
  doorParams?: DoorOpeningParams;
  onToggleDoorway?: (faceId: number) => void;
  onChangeDoorParams?: (params: Partial<DoorOpeningParams>) => void;
  onClearDoorway?: () => void;
  solarFaceIds?: number[];
  solarParams?: SolarGlazingParams;
  onToggleSolarFace?: (faceId: number) => void;
  onSetSolarFaceIds?: (faceIds: number[]) => void;
  onChangeSolarParams?: (params: Partial<SolarGlazingParams>) => void;
  innerSheathingParams?: InnerSheathingParams;
  onChangeInnerSheathingParams?: (params: Partial<InnerSheathingParams>) => void;
  solarAnalysis?: DomeSolarAnalysis | null;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  model,
  selectedNodeId,
  selectedEdgeId,
  selectedFaceId,
  onClose,
  onSelectNode,
  onSelectEdge,
  windowFaceIds = [],
  onToggleWindowFace,
  windowParams = DEFAULT_WINDOW_PARAMS,
  onChangeWindowParams,
  doorFaceIds = [],
  doorParams = DEFAULT_DOOR_PARAMS,
  onToggleDoorway,
  onChangeDoorParams,
  onClearDoorway,
  solarFaceIds = [],
  solarParams = DEFAULT_SOLAR_PARAMS,
  onToggleSolarFace,
  onSetSolarFaceIds,
  onChangeSolarParams,
  innerSheathingParams,
  onChangeInnerSheathingParams,
  solarAnalysis: propSolarAnalysis
}) => {
  const computedSolarAnalysis = useMemo(() => {
    if (propSolarAnalysis) return propSolarAnalysis;
    if (selectedFaceId === null || !model) return null;
    return analyzeDomeSolar(model, {
      domeAzimuthDeg: solarParams.domeOrientationDeg,
      latitudeDeg: solarParams.latitudeDeg,
      peakPowerPerM2: solarParams.peakPowerPerM2
    });
  }, [propSolarAnalysis, selectedFaceId !== null ? model : null, solarParams.domeOrientationDeg, solarParams.latitudeDeg, solarParams.peakPowerPerM2]);

  if (selectedNodeId === null && selectedEdgeId === null && selectedFaceId === null) {
    return null;
  }

  // 1. NODE INSPECTOR
  if (selectedNodeId !== null) {
    const node = model.nodes.find(n => n.id === selectedNodeId);
    if (!node) return null;
    const connector = calculateConnector(model, node.id);

    return (
      <div className="p-5 rounded-3xl tactile-card border border-white/80 animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26]">
              <Compass className="w-3.5 h-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#1A2E3B]">Інспектор вузла {node.label || `#${node.id}`}</h3>
                {node.label && (
                  <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-[#1E293B] text-white shadow-2xs">
                    {node.label}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#5A6778]">
                {node.boundary ? "Крайовий вузол основи (фундаментний)" : "Внутрішній вузол сфери"}
                {node.nodeType ? ` · З'єднання ребер: ${node.nodeType}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl tactile-btn text-[#8C9BAE] hover:text-[#1A2E3B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Spatial Coordinates */}
        <div className="grid grid-cols-3 gap-2 my-3 text-xs">
          <div className="p-2 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">X</span>
            <span className="font-mono font-bold text-[#1A2E3B]">{node.position.x.toFixed(1)} мм</span>
          </div>
          <div className="p-2 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">Y</span>
            <span className="font-mono font-bold text-[#1A2E3B]">{node.position.y.toFixed(1)} мм</span>
          </div>
          <div className="p-2 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">Z (Висота)</span>
            <span className="font-mono font-bold text-[#1A2E3B]">{node.position.z.toFixed(1)} мм</span>
          </div>
        </div>

        {/* Connected Beams List */}
        <div className="mb-3">
          <span className="text-xs font-bold text-[#5A6778] block mb-1.5 uppercase">
            З'єднані балки ({connector.beams.length} шт):
          </span>
          <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
            {connector.beams.map(b => (
              <div
                key={b.edgeId}
                onClick={() => onSelectEdge(b.edgeId)}
                className="flex items-center justify-between p-2 rounded-xl bg-white/70 hover:bg-white cursor-pointer transition-colors text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: model.edges[b.edgeId]?.color }}
                  />
                  <span className="font-bold text-[#1A2E3B]">
                    Балка #{b.edgeId} (Тип {b.beamType})
                  </span>
                </div>
                <span className="font-mono text-[#5A6778]">{b.length} мм</span>
              </div>
            ))}
          </div>
        </div>

        {/* Download Single Node 3D STL & 2D SVG */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          <button
            onClick={() => {
              const nodeLabel = node.label || `AA${node.id + 1}`;
              const stl = exportSingleConnectorNodeSTL(model, node.id);
              downloadFile(
                `connector_node_${nodeLabel}_#${node.id}_${connector.beams.length}way.stl`,
                stl,
                "application/octet-stream"
              );
            }}
            className="w-full py-2 text-xs font-bold rounded-xl bg-[#DE7C5A] text-white hover:bg-[#C9603D] flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            title="Завантажити 3D модель цього окремого вузла у форматі .STL для 3D-друку"
          >
            <Box className="w-3.5 h-3.5" />
            <span>3D-друк ({node.label || `.STL`})</span>
          </button>

          <button
            onClick={() => {
              const nodeLabel = node.label || `AA${node.id + 1}`;
              const svg = generateConnectorSVG(connector, model, {
                sampleNodeLabel: nodeLabel,
                nodeLabels: [nodeLabel],
                typeName: `КОНЕКТОР ВУЗЛА ${nodeLabel}`
              });
              downloadFile(`connector_node_${nodeLabel}_#${node.id}.svg`, svg);
            }}
            className="w-full py-2 text-xs font-bold rounded-xl tactile-btn-mint flex items-center justify-center gap-1.5 cursor-pointer"
            title="Завантажити 2D векторне креслення розкрою пелюсток у форматі SVG"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Розкрій ({node.label || `SVG`})</span>
          </button>
        </div>

        {/* Inscribe Doorway into this Node's Pentagon or Hexagon cluster */}
        <div className="mt-3 p-3 rounded-2xl bg-[#FEF3C7]/90 border border-[#FDE68A] flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#92400E] flex items-center gap-1.5">
              <DoorOpen className="w-4 h-4 text-[#D97706]" />
              <span>
                {connector.beams.length === 5
                  ? "П'ятигранник (5 граней навколо вузла)"
                  : connector.beams.length === 6
                  ? "Шестигранник (6 граней навколо вузла)"
                  : `Кластер вузла (${connector.beams.length} граней)`}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const connectedFaces = model.faces.filter(f => f.a === node.id || f.b === node.id || f.c === node.id);
              if (connectedFaces.length > 0) {
                let lowestFace = connectedFaces[0];
                let lowestZ = Infinity;
                for (const cf of connectedFaces) {
                  const zAvg = (model.nodes[cf.a].position.z + model.nodes[cf.b].position.z + model.nodes[cf.c].position.z) / 3;
                  if (zAvg < lowestZ) {
                    lowestZ = zAvg;
                    lowestFace = cf;
                  }
                }
                if (onToggleDoorway) {
                  onToggleDoorway(lowestFace.id);
                }
                if (onChangeDoorParams) {
                  onChangeDoorParams({
                    bayClusterType: connector.beams.length === 5 ? "pentagon" : "hexagon",
                    clusterHubNodeId: node.id,
                    anchorFaceId: lowestFace.id,
                    doorFaceIds: connectedFaces.map(f => f.id)
                  });
                }
              }
            }}
            className="w-full py-2 px-3 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <DoorOpen className="w-4 h-4" />
            <span>
              Вписати дверний пройм у цей {connector.beams.length === 5 ? "п'ятигранник" : "шестигранник"}
            </span>
          </button>
          <p className="text-[10px] text-[#92400E] leading-relaxed">
            Пройом буде вписано в цей кластер граней із повною треангуляцією з'єднання (зліва, справа та зверху).
          </p>
        </div>
      </div>
    );
  }

  // 2. BEAM INSPECTOR
  if (selectedEdgeId !== null) {
    const edge = model.edges[selectedEdgeId];
    if (!edge) return null;
    const miter = calculateBeamMiterAngles(edge, model.nodes, model.connectorParams);

    return (
      <div className="p-5 rounded-3xl tactile-card border border-white/80 animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center text-white"
              style={{ backgroundColor: edge.color }}
            >
              <Ruler className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1A2E3B] flex items-center gap-2">
                <span>Балка {edge.beamLabel || `#${edge.id}`} (Тип {edge.type})</span>
                {edge.quadrant && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#E8EFF5] text-[#2B6CB0]">
                    {edge.quadrant}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-[#5A6778]">
                Вузол #{edge.start} ↔ Вузол #{edge.end}
                {edge.isBaseBeam && (
                  <span className="ml-1.5 text-[#1A3E26] font-semibold">
                    • Опорний брус горизонту фундаменту (Z = 0)
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl tactile-btn text-[#8C9BAE] hover:text-[#1A2E3B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 my-3 text-xs">
          <div className="p-2.5 rounded-xl tactile-inset-subtle border border-[#CBD5E0]">
            <span className="text-[10px] text-[#4A5568] font-bold block">1. До вузла сходження</span>
            <span className="font-mono font-bold text-sm text-[#1A2E3B]">{edge.length} мм</span>
            <span className="text-[9px] text-[#718096] block">по осях вузлів</span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#E1EDE3]/70 border border-[#A6C7AE]">
            <span className="text-[10px] text-[#1A3E26] font-bold block">2. Обрізаний під конектор</span>
            <span className="font-mono font-black text-sm text-[#2E7D32]">
              {edge.cutLength || Math.round(edge.length - model.connectorParams.hubDiameter)} мм
            </span>
            <span className="text-[9px] text-[#2E7D32] block">чистий розпил бруса</span>
          </div>
          <div className="p-2.5 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#DE7C5A] font-bold block">Кільце конектора</span>
            <span className="font-mono font-bold text-sm text-[#DE7C5A]">
              -{(model.connectorParams.hubDiameter / 2).toFixed(model.connectorParams.hubDiameter < 10 ? 1 : 0)} мм
            </span>
            <span className="text-[9px] text-[#8C9BAE] block">відступ з кожного торця</span>
          </div>
          <div className="p-2.5 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">Торцевий зпил</span>
            <span className="font-mono font-bold text-sm text-[#DE7C5A]">
              {edge.startMiterDeg ?? miter.startMiterDeg}°
              {edge.endMiterDeg && edge.endMiterDeg !== edge.startMiterDeg ? ` / ${edge.endMiterDeg}°` : ""}
            </span>
            <span className="text-[9px] text-[#8C9BAE] block">кут на торцювальній пилі</span>
          </div>
          <div className="p-2.5 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">
              {model.beamProfile.type === "circular" || model.beamProfile.type === "pipe" ? "Діаметр балки" : "Переріз бруса"}
            </span>
            <span className="font-mono font-bold text-sm text-[#1A2E3B]">
              {model.beamProfile.type === "circular" || model.beamProfile.type === "pipe"
                ? `Ø ${model.beamProfile.diameter || model.beamProfile.width} мм`
                : `${model.beamProfile.width}×${model.beamProfile.depth} мм`}
            </span>
            <span className="text-[9px] text-[#8C9BAE] block">
              {model.beamProfile.type === "circular" ? "круглий переріз" : model.beamProfile.type === "pipe" ? "кругла труба" : "ширина × висота"}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onSelectNode(edge.start)}
            className="flex-1 py-1.5 px-3 text-xs font-medium rounded-xl tactile-btn text-[#4A5568]"
          >
            Перейти до Вузла #{edge.start}
          </button>
          <button
            onClick={() => onSelectNode(edge.end)}
            className="flex-1 py-1.5 px-3 text-xs font-medium rounded-xl tactile-btn text-[#4A5568]"
          >
            Перейти до Вузла #{edge.end}
          </button>
        </div>

        <button
          onClick={() => {
            const svg = generateSingleBeamBlueprintSVG(model, edge.type);
            downloadFile(
              `kupolgeo_beam_type_${edge.type}_${model.parameters.frequency}V.svg`,
              svg,
              "image/svg+xml;charset=utf-8"
            );
          }}
          className="w-full mt-2.5 py-2 px-3 text-xs font-bold rounded-xl tactile-btn-mint flex items-center justify-center gap-2 shadow-2xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Завантажити креслення балки типу {edge.type} (SVG)</span>
        </button>
      </div>
    );
  }

  // 3. FACE INSPECTOR
  if (selectedFaceId !== null) {
    const face = model.faces[selectedFaceId];
    if (!face) return null;
    const group = model.faceGroups.find(g => g.type === face.type);
    const sheathing = model.sheathingParams || DEFAULT_SHEATHING_PARAMS;
    const thicknessMm = sheathing.thickness || 12;
    const areaM2 = face.area / 1_000_000;
    const volM3 = areaM2 * (thicknessMm / 1000);
    const weightKg = volM3 * (sheathing.density || 680);
    const matName = PLYWOOD_MATERIALS.find(m => m.id === sheathing.material)?.name || "Фанера";

    const isWindow = windowFaceIds.includes(face.id);
    const isDoor = doorFaceIds.includes(face.id);
    const isSolar = solarFaceIds.includes(face.id);
    const isSolid = !isWindow && !isDoor && !isSolar;
    const perimeterMm = group ? group.lengths.reduce((a, b) => a + b, 0) : 0;

    return (
      <div className="p-5 rounded-3xl tactile-card border border-white/80 animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              isDoor
                ? "bg-[#FEF3C7] text-[#D97706]"
                : isSolar
                ? "bg-[#EDE9FE] text-[#7C3AED]"
                : isWindow
                ? "bg-[#E0F2FE] text-[#0284C7]"
                : "bg-[#FDF0E6] text-[#DE7C5A]"
            }`}>
              {isDoor ? (
                <DoorOpen className="w-4 h-4" />
              ) : isSolar ? (
                <Zap className="w-4 h-4" />
              ) : isWindow ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Layers className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-sm font-bold text-[#1A2E3B]">
                  {isDoor
                    ? `Дверний пройм #${face.id}`
                    : isSolar
                    ? `Сонячний BIPV трикутник #${face.id}`
                    : isWindow
                    ? `Трикутне вікно #${face.id}`
                    : `Панель обшивки #${face.id}`}
                </h3>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                  isDoor
                    ? "bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A]"
                    : isSolar
                    ? "bg-[#EDE9FE] text-[#6D28D9] border border-[#DDD6FE]"
                    : isWindow
                    ? "bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD]"
                    : "bg-[#FAF5EE] text-[#8B6534] border border-[#EFE7DC]"
                }`}>
                  {isDoor
                    ? "🚪 Дверний портал"
                    : isSolar
                    ? "⚡ BIPV генерація струму"
                    : isWindow
                    ? "🪟 Склопакет на каркасі"
                    : `Тип ${face.type}`}
                </span>
              </div>
              <p className="text-[11px] text-[#5A6778]">
                {isDoor
                  ? `Вхідна група (${doorParams.widthMm} × ${doorParams.heightMm} мм), вилучено з обшивки`
                  : isSolar
                  ? "Фотоелектричний модуль під склом для генерації електроенергії"
                  : isWindow
                  ? "Прозоре скління з алюмінієвою притискною планкою"
                  : `Глуха панель обшивки · ${matName}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl tactile-btn text-[#8C9BAE] hover:text-[#1A2E3B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 CONVERSION TYPES ACTION TOOLBAR */}
        <div className="mt-3 p-3 rounded-2xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#5A6778] uppercase flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#D97706]" />
              <span>Конвертація фрагмента купола:</span>
            </span>
            {!isSolid && (
              <button
                type="button"
                onClick={() => {
                  if (isWindow && onToggleWindowFace) onToggleWindowFace(face.id);
                  if (isDoor && onClearDoorway) onClearDoorway();
                  if (isSolar && onToggleSolarFace) onToggleSolarFace(face.id);
                }}
                className="text-[10px] font-bold text-[#DE7C5A] hover:underline cursor-pointer"
              >
                Скинути в обшивку
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* 1. Window */}
            <button
              type="button"
              onClick={() => onToggleWindowFace && onToggleWindowFace(face.id)}
              className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 border ${
                isWindow
                  ? "bg-[#0284C7] text-white border-[#0284C7] shadow-xs"
                  : "bg-white hover:bg-[#F0F9FF] text-[#0369A1] border-[#BAE6FD]"
              }`}
              title="Конвертувати у трикутне вікно з монолітного полікарбонату або скла"
            >
              <div className="flex items-center gap-1">
                <span>🪟</span>
                <span>Вікно</span>
              </div>
              <span className="text-[9px] opacity-80">Скління / Люк</span>
            </button>

            {/* 2. Doorway (Auto-captures neighbor) */}
            <button
              type="button"
              onClick={() => onToggleDoorway && onToggleDoorway(face.id)}
              className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 border ${
                isDoor
                  ? "bg-[#D97706] text-white border-[#D97706] shadow-xs"
                  : "bg-white hover:bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]"
              }`}
              title="Створити дверний пройм із автоматичним захопленням сусіднього трикутника за висотою"
            >
              <div className="flex items-center gap-1">
                <span>🚪</span>
                <span>Пройм</span>
              </div>
              <span className="text-[9px] opacity-80">Авто-захоплення</span>
            </button>

            {/* 3. Solar PV Triangle */}
            <button
              type="button"
              onClick={() => onToggleSolarFace && onToggleSolarFace(face.id)}
              className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex flex-col items-center gap-1 border ${
                isSolar
                  ? "bg-[#7C3AED] text-white border-[#7C3AED] shadow-xs"
                  : "bg-white hover:bg-[#EDE9FE] text-[#5B21B6] border-[#DDD6FE]"
              }`}
              title="Конвертувати в електричний сонячний трикутник BIPV під склом"
            >
              <div className="flex items-center gap-1">
                <span>⚡</span>
                <span>Сонячний</span>
              </div>
              <span className="text-[9px] opacity-80">Генерація 210 Вт/м²</span>
            </button>
          </div>
        </div>

        {/* DOORWAY SPECIFIC CONTROLS & CAPTURED NEIGHBORS */}
        {isDoor && (
          <div className="mt-3 p-3 rounded-2xl bg-[#FEF3C7]/80 border border-[#FDE68A] text-xs flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#92400E] flex items-center gap-1.5">
                <DoorOpen className="w-4 h-4 text-[#D97706]" />
                <span>Параметри дверного пройму:</span>
              </span>
              <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded-md text-[#B45309] border border-[#FDE68A]">
                Захоплено: {doorFaceIds.length} трикутники
              </span>
            </div>

            {/* Cluster Type Selector: Auto, Pentagon, Hexagon */}
            <div>
              <label className="text-[10px] text-[#78350F] block font-semibold mb-1">
                Конфігурація купольного кластера для пройому:
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => onChangeDoorParams && onChangeDoorParams({ bayClusterType: "auto" })}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    (doorParams.bayClusterType || "auto") === "auto"
                      ? "bg-[#D97706] text-white shadow-xs"
                      : "bg-white text-[#92400E] border border-[#FDE68A] hover:bg-[#FFFBEB]"
                  }`}
                >
                  <span>📐</span>
                  <span>Авто (2-3 гр)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeDoorParams && onChangeDoorParams({ bayClusterType: "pentagon" })}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    doorParams.bayClusterType === "pentagon"
                      ? "bg-[#D97706] text-white shadow-xs"
                      : "bg-white text-[#92400E] border border-[#FDE68A] hover:bg-[#FFFBEB]"
                  }`}
                >
                  <span>⬟</span>
                  <span>П'ятигранник</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeDoorParams && onChangeDoorParams({ bayClusterType: "hexagon" })}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    doorParams.bayClusterType === "hexagon"
                      ? "bg-[#D97706] text-white shadow-xs"
                      : "bg-white text-[#92400E] border border-[#FDE68A] hover:bg-[#FFFBEB]"
                  }`}
                >
                  <span>⬡</span>
                  <span>Шестигранник</span>
                </button>
              </div>
            </div>

            {/* Sliders Grid: Width & Height */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-xl bg-white border border-[#FDE68A]">
                <label className="text-[10px] text-[#78350F] block font-semibold mb-1">
                  Ширина пройму (мм):
                </label>
                <input
                  type="range"
                  min={700}
                  max={1500}
                  step={50}
                  value={doorParams.widthMm}
                  onChange={e => onChangeDoorParams && onChangeDoorParams({ widthMm: Number(e.target.value) })}
                  className="w-full accent-[#D97706] mb-1"
                />
                <div className="flex items-center justify-between text-xs font-mono font-bold text-[#92400E]">
                  <span>{doorParams.widthMm} мм</span>
                  <span className="text-[10px] text-[#B45309]">{doorParams.widthMm >= 1300 ? "Двостулкові" : "Одностулкові"}</span>
                </div>
              </div>

              <div className="p-2 rounded-xl bg-white border border-[#FDE68A]">
                <label className="text-[10px] text-[#78350F] block font-semibold mb-1">
                  Висота пройму (мм):
                </label>
                <input
                  type="range"
                  min={1800}
                  max={2400}
                  step={50}
                  value={doorParams.heightMm}
                  onChange={e => onChangeDoorParams && onChangeDoorParams({ heightMm: Number(e.target.value) })}
                  className="w-full accent-[#D97706] mb-1"
                />
                <div className="flex items-center justify-between text-xs font-mono font-bold text-[#92400E]">
                  <span>{doorParams.heightMm} мм</span>
                  <span className="text-[10px] text-[#B45309]">Стандарт 2.05 м</span>
                </div>
              </div>
            </div>

            {/* Distance from Dome Base & Outward Extension Sliders */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-xl bg-white border border-[#FDE68A]">
                <label className="text-[10px] text-[#78350F] block font-semibold mb-1" title="Відстань від основи купола / підйом порогу над фундаментом">
                  Відстань від основи купола (мм):
                </label>
                <input
                  type="range"
                  min={0}
                  max={600}
                  step={25}
                  value={doorParams.elevationFromBaseMm || 0}
                  onChange={e => onChangeDoorParams && onChangeDoorParams({ elevationFromBaseMm: Number(e.target.value) })}
                  className="w-full accent-[#D97706] mb-1"
                />
                <div className="flex items-center justify-between text-xs font-mono font-bold text-[#92400E]">
                  <span>{doorParams.elevationFromBaseMm || 0} мм</span>
                  <span className="text-[10px] text-[#B45309]">
                    {(doorParams.elevationFromBaseMm || 0) === 0 ? "На рівні підлоги" : "Підйом порогу"}
                  </span>
                </div>
              </div>

              <div className="p-2 rounded-xl bg-white border border-[#FDE68A]">
                <label className="text-[10px] text-[#78350F] block font-semibold mb-1" title="Винос тамбура пройому назовні від основи купола">
                  Винос пройому / тамбур (мм):
                </label>
                <input
                  type="range"
                  min={0}
                  max={600}
                  step={25}
                  value={doorParams.offsetFromDomeMm || 0}
                  onChange={e => onChangeDoorParams && onChangeDoorParams({ offsetFromDomeMm: Number(e.target.value) })}
                  className="w-full accent-[#D97706] mb-1"
                />
                <div className="flex items-center justify-between text-xs font-mono font-bold text-[#92400E]">
                  <span>{doorParams.offsetFromDomeMm || 0} мм</span>
                  <span className="text-[10px] text-[#B45309]">
                    {(doorParams.offsetFromDomeMm || 0) === 0 ? "В площині" : "Винос"}
                  </span>
                </div>
              </div>
            </div>

            {/* Triangulation Structural Card */}
            <div className="p-2.5 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] text-[11px] text-[#92400E] flex flex-col gap-1.5 leading-relaxed">
              <span className="font-bold flex items-center gap-1 text-[#78350F]">
                <span>📐</span>
                <span>Треангуляція балок та обшивки пройому:</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[10px]">
                <div className="p-1.5 rounded-lg bg-white/80 border border-[#FDE68A]">
                  <span className="font-bold block text-[#B45309]">З ліва від пройому:</span>
                  <span>Балки ЗБ-Л1..Л3, підпірка, обшивка ДВ-Л1..Л2</span>
                </div>
                <div className="p-1.5 rounded-lg bg-white/80 border border-[#FDE68A]">
                  <span className="font-bold block text-[#B45309]">З права від пройому:</span>
                  <span>Балки ЗБ-П1..П3, підпірка, обшивка ДВ-П1..П2</span>
                </div>
                <div className="p-1.5 rounded-lg bg-white/80 border border-[#FDE68A]">
                  <span className="font-bold block text-[#B45309]">З верху пройому:</span>
                  <span>Крокви ЗБ-В1..В3, фронтонні панелі ДВ-В1..В4</span>
                </div>
              </div>
              <div className="p-2 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] flex flex-col gap-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <span className="text-[#059669]">✓</span>
                  <span>Вирівнювання 2-го поверху активовано автоматично</span>
                </div>
                <p className="text-[10px] text-[#047857]">
                  Пройм завжди має контакт із самим нижнім брусом основи (цоколя чи купола) по низу, а верх з'єднується з вирівняним 2-м, 3-м або 4-м рівнем брусів 2-го поверху. На протилежній паралельній балці встановлено конектор <b>ДК-ПБ-1</b>.
                </p>
              </div>
              <p className="text-[10px] opacity-90">
                ✨ Усі балки та трикутники примикання автоматично розраховані й внесені в специфікації та карти розкрою зовнішньої й внутрішньої обшивки.
              </p>
            </div>

            {onClearDoorway && (
              <button
                type="button"
                onClick={onClearDoorway}
                className="w-full py-1.5 px-3 rounded-xl bg-white hover:bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA] font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Видалити цей дверний пройм</span>
              </button>
            )}
          </div>
        )}

        {/* SOLAR ORIENTATION & BIPV SUITABILITY METRICS */}
        {(() => {
          if (!computedSolarAnalysis) return null;
          const metric = computedSolarAnalysis.metricsByFaceId.get(face.id);
          if (!metric) return null;

          return (
            <div className="mt-3 p-3.5 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] text-xs flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#92400E] flex items-center gap-1.5">
                  <Sun className="w-4 h-4 text-[#EA580C]" />
                  <span>Сонячна орієнтація та BIPV потенціал:</span>
                </span>
                <span className="text-[10px] font-mono font-bold bg-[#FEF3C7] px-2 py-0.5 rounded-md text-[#B45309] border border-[#FDE68A]">
                  ККД {metric.efficiencyPct}%
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-xl bg-white border border-[#FDE68A]/70">
                  <span className="text-[10px] text-[#8C9BAE] block">Орієнтація</span>
                  <span className="font-mono font-bold text-xs text-[#92400E] block truncate">
                    {metric.cardinalDirection}
                  </span>
                  <span className="text-[9px] text-[#B45309]">{metric.azimuthDeg}°</span>
                </div>

                <div className="p-2 rounded-xl bg-white border border-[#FDE68A]/70">
                  <span className="text-[10px] text-[#8C9BAE] block">Кут нахилу</span>
                  <span className="font-mono font-bold text-xs text-[#92400E] block">
                    {metric.tiltDeg}°
                  </span>
                  <span className="text-[9px] text-[#B45309]">від землі</span>
                </div>

                <div className="p-2 rounded-xl bg-white border border-[#FDE68A]/70">
                  <span className="text-[10px] text-[#8C9BAE] block">Потужність</span>
                  <span className="font-mono font-bold text-xs text-[#5B21B6] block">
                    {metric.peakPowerWatts} Вт
                  </span>
                  <span className="text-[9px] text-[#8C9BAE]">BIPV модуль</span>
                </div>

                <div className="p-2 rounded-xl bg-white border border-[#FDE68A]/70">
                  <span className="text-[10px] text-[#8C9BAE] block">Річний виробіток</span>
                  <span className="font-mono font-bold text-xs text-[#059669] block">
                    ~{metric.annualYieldKWh}
                  </span>
                  <span className="text-[9px] text-[#8C9BAE]">кВт·г/рік</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[#FDE68A]/60 flex-wrap gap-2">
                <span className="text-[11px] font-medium text-[#92400E]">
                  {metric.ratingLabel}
                </span>

                {onToggleSolarFace && (
                  <button
                    type="button"
                    onClick={() => onToggleSolarFace(face.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 ${
                      isSolar
                        ? "bg-white hover:bg-red-50 text-red-600 border border-red-200"
                        : "bg-[#EA580C] hover:bg-[#C2410C] text-white"
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>{isSolar ? "Прибрати BIPV панель" : "Встановити сонячну панель"}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* SOLAR ELECTRIC SPECIFIC METRICS */}
        {isSolar && (() => {
          const wPerM2 = solarParams.peakPowerPerM2 || 210;
          const peakWatts = Math.round(areaM2 * wPerM2);
          const dailyKWh = Math.round(((peakWatts / 1000) * 3.5) * 100) / 100;
          const annualKWh = Math.round((peakWatts / 1000) * 1150);

          return (
            <div className="mt-3 p-3 rounded-2xl bg-[#EDE9FE]/70 border border-[#DDD6FE] text-xs flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#5B21B6] flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-[#7C3AED]" />
                  <span>Генерація струму в трикутнику під склом:</span>
                </span>
                <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded-md text-[#6D28D9] border border-[#DDD6FE]">
                  BIPV Сонячна панель
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-xl bg-white border border-[#DDD6FE]">
                  <span className="text-[10px] text-[#6D28D9] block">Пікова потужність</span>
                  <span className="font-mono font-bold text-sm text-[#5B21B6]">{peakWatts} Вт</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-[#DDD6FE]">
                  <span className="text-[10px] text-[#6D28D9] block">Генерація в день</span>
                  <span className="font-mono font-bold text-xs text-[#5B21B6]">~{dailyKWh} кВт·г</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-[#DDD6FE]">
                  <span className="text-[10px] text-[#6D28D9] block">Річний виробіток</span>
                  <span className="font-mono font-bold text-xs text-[#7C3AED]">~{annualKWh} кВт·г/рік</span>
                </div>
              </div>

              {onChangeSolarParams && (
                <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-white border border-[#DDD6FE]">
                  <div>
                    <label className="text-[10px] text-[#6D28D9] block mb-0.5 font-semibold">Тип кристалів:</label>
                    <select
                      value={solarParams.cellType || "monocrystalline"}
                      onChange={e => onChangeSolarParams({ cellType: e.target.value as any })}
                      className="w-full text-xs font-semibold bg-[#F5F3FF] border border-[#DDD6FE] text-[#5B21B6] rounded-lg p-1 outline-none"
                    >
                      <option value="monocrystalline">Монокристалічні (210 Вт/м²)</option>
                      <option value="polycrystalline">Полікристалічні (180 Вт/м²)</option>
                      <option value="bifacial">Двосторонні Bifacial (230 Вт/м²)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#6D28D9] block mb-0.5 font-semibold">ККД модуля:</label>
                    <div className="p-1 text-xs font-mono font-bold text-[#5B21B6]">
                      {solarParams.efficiencyPct || 21.5}% (під загартованим склом)
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        <div className="grid grid-cols-3 gap-2 my-3 text-xs">
          <div className="p-2.5 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">Площа</span>
            <span className="font-mono font-bold text-sm text-[#1A2E3B]">
              {areaM2.toFixed(3)} м²
            </span>
          </div>
          <div className="p-2.5 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">Сторони</span>
            <span className="font-mono font-bold text-xs text-[#1A2E3B]">
              {group ? group.lengths.join(" × ") : "---"} мм
            </span>
          </div>
          <div className="p-2.5 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">Кути панелі</span>
            <span className="font-mono font-bold text-xs text-[#DE7C5A]">
              {group ? group.angles.join("° / ") : "---"}°
            </span>
          </div>
        </div>

        {isWindow ? (() => {
          const currentGlazing = GLAZING_OPTIONS[windowParams?.glazingType || "double_glass"] || GLAZING_OPTIONS.double_glass;
          const currentFrame = WINDOW_FRAME_OPTIONS[windowParams?.frameColor || "anthracite"] || WINDOW_FRAME_OPTIONS.anthracite;
          const windowWeightKg = areaM2 * currentGlazing.weightKgM2 + (perimeterMm / 1000) * 0.9;

          return (
            <div className="flex flex-col gap-2 mb-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-[#F0F9FF] border border-[#BAE6FD]">
                  <span className="text-[10px] text-[#0369A1] font-semibold block">Склопакет</span>
                  <span className="font-mono font-bold text-xs text-[#0284C7] block truncate" title={currentGlazing.name}>
                    {currentGlazing.shortName}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F0F9FF] border border-[#BAE6FD]">
                  <span className="text-[10px] text-[#0369A1] font-semibold block">Притискний оклад</span>
                  <span className="font-mono font-bold text-xs text-[#0284C7] block truncate" title={currentFrame.name}>
                    {currentFrame.name.split(" ")[0]} ({currentFrame.colorHex})
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#F0F9FF] border border-[#BAE6FD]">
                  <span className="text-[10px] text-[#0369A1] font-semibold block">Вага вікна</span>
                  <span className="font-mono font-bold text-xs text-[#0284C7]">
                    ~{windowWeightKg.toFixed(1)} кг
                  </span>
                </div>
              </div>

              {onChangeWindowParams && (
                <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-white border border-[#BAE6FD]">
                  <div>
                    <label className="text-[10px] text-[#5A6778] block mb-0.5">Тип склопакета:</label>
                    <select
                      value={windowParams?.glazingType || "double_glass"}
                      onChange={e =>
                        onChangeWindowParams({
                          ...(windowParams || DEFAULT_WINDOW_PARAMS),
                          glazingType: e.target.value as any
                        })
                      }
                      className="w-full text-xs font-semibold bg-[#F0F9FF] border border-[#BAE6FD] text-[#0369A1] rounded-lg p-1 outline-none"
                    >
                      {Object.values(GLAZING_OPTIONS).map(g => (
                        <option key={g.id} value={g.id}>
                          {g.shortName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#5A6778] block mb-0.5">Матеріал окладу:</label>
                    <select
                      value={windowParams?.frameColor || "anthracite"}
                      onChange={e =>
                        onChangeWindowParams({
                          ...(windowParams || DEFAULT_WINDOW_PARAMS),
                          frameColor: e.target.value as any
                        })
                      }
                      className="w-full text-xs font-semibold bg-[#F0F9FF] border border-[#BAE6FD] text-[#0369A1] rounded-lg p-1 outline-none"
                    >
                      {Object.values(WINDOW_FRAME_OPTIONS).map(f => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })() : (
          <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
            <div className="p-2.5 rounded-xl bg-[#FAF5EE] border border-[#EFE7DC]">
              <span className="text-[10px] text-[#8B6534] font-semibold block">Товщина фанери</span>
              <span className="font-mono font-bold text-sm text-[#8B6534]">
                {thicknessMm} мм
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#FAF5EE] border border-[#EFE7DC]">
              <span className="text-[10px] text-[#5A6778] font-semibold block">Вага плити</span>
              <span className="font-mono font-bold text-xs text-[#1A2E3B]">
                {weightKg < 1 ? `${(weightKg * 1000).toFixed(0)} г` : `${weightKg.toFixed(2)} кг`}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#FAF5EE] border border-[#EFE7DC]">
              <span className="text-[10px] text-[#5A6778] font-semibold block">Об'єм плити</span>
              <span className="font-mono font-bold text-xs text-[#1A2E3B]">
                {(volM3 * 1000).toFixed(2)} л
              </span>
            </div>
          </div>
        )}

        <button
          onClick={() => {
            const svg = generateSingleTriangleBlueprintSVG(model, face.type);
            downloadFile(
              `sheathing_triangle_${face.type}_${model.parameters.frequency}V.svg`,
              svg,
              "image/svg+xml;charset=utf-8"
            );
          }}
          className="w-full mt-2.5 py-2 px-3 text-xs font-bold rounded-xl tactile-btn-peach flex items-center justify-center gap-2 shadow-2xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Завантажити креслення трикутника типу {face.type} (SVG)</span>
        </button>
      </div>
    );
  }

  return null;
};
