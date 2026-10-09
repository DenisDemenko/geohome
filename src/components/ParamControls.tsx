import React, { useMemo } from "react";
import {
  DomeParameters,
  Frequency,
  DomeCutType,
  BeamProfile,
  ConnectorParams,
  DomeModel,
  SheathingParams,
  SolarGlazingParams
} from "../core/types";
import { DEFAULT_BEAM_PROFILES } from "../core/beams";
import {
  CONNECTOR_MATERIALS,
  CONNECTOR_COATINGS,
  getCoatingsForCategory,
  ConnectorMaterialCategory,
  ConnectorMaterialId,
  ConnectorCoatingId,
  calculateConnectorPieceWeight,
  calculateConnectorsWeightSummary
} from "../core/connectorMaterials";
import { classifyConnectorTypes } from "../core/connectors";
import { PLYWOOD_MATERIALS } from "../core/sheathing";
import { analyzeDomeSolar, getCardinalDirection, DomeSolarAnalysis } from "../core/solarAnalysis";
import { DEFAULT_SOLAR_PARAMS } from "../core/conversions";
import {
  Sliders,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Unlock,
  Settings2,
  CheckSquare,
  Square,
  Circle,
  Disc,
  Landmark,
  Scale,
  Paintbrush,
  Sparkles,
  Info,
  Triangle,
  Layers,
  Box,
  Eye,
  Home,
  Sun,
  Zap,
  Compass,
  Flame,
  TrendingUp,
  Leaf,
  MapPin
} from "lucide-react";

interface ParamControlsProps {
  params: DomeParameters;
  onChangeParams: (newParams: DomeParameters) => void;
  beamProfile: BeamProfile;
  onChangeProfile: (profile: BeamProfile) => void;
  connectorParams: ConnectorParams;
  onChangeConnectorParams: (params: ConnectorParams) => void;
  model?: DomeModel;
  approved: boolean;
  geometryVersion?: string;
  onApprove: () => void;
  onRevoke: () => void;
  autoScaleConnectors?: boolean;
  onToggleAutoScaleConnectors?: (active: boolean) => void;
  onResetToProportional?: () => void;
  sheathingParams?: SheathingParams;
  onChangeSheathingParams?: (params: SheathingParams) => void;
  solarFaceIds?: number[];
  solarParams?: SolarGlazingParams;
  onToggleSolarFace?: (faceId: number) => void;
  onSetSolarFaceIds?: (ids: number[]) => void;
  onChangeSolarParams?: (params: Partial<SolarGlazingParams>) => void;
  displayLayers?: {
    showBeams: boolean;
    showConnectors: boolean;
    showOuterSheathing: boolean;
    showInnerSheathing: boolean;
    sheathingOpacity?: number;
  };
  onChangeDisplayLayers?: (updater: {
    showBeams: boolean;
    showConnectors: boolean;
    showOuterSheathing: boolean;
    showInnerSheathing: boolean;
    sheathingOpacity?: number;
  } | ((prev: {
    showBeams: boolean;
    showConnectors: boolean;
    showOuterSheathing: boolean;
    showInnerSheathing: boolean;
    sheathingOpacity?: number;
  }) => {
    showBeams: boolean;
    showConnectors: boolean;
    showOuterSheathing: boolean;
    showInnerSheathing: boolean;
    sheathingOpacity?: number;
  })) => void;
  solarAnalysis?: DomeSolarAnalysis | null;
  selectedNodeId?: number | null;
  onSelectNode?: (id: number | null) => void;
}

export const ParamControls: React.FC<ParamControlsProps> = ({
  params,
  onChangeParams,
  beamProfile,
  onChangeProfile,
  connectorParams,
  onChangeConnectorParams,
  approved,
  geometryVersion,
  onApprove,
  onRevoke,
  model,
  autoScaleConnectors = true,
  onToggleAutoScaleConnectors,
  onResetToProportional,
  sheathingParams,
  onChangeSheathingParams,
  solarFaceIds = [],
  solarParams = DEFAULT_SOLAR_PARAMS,
  onToggleSolarFace,
  onSetSolarFaceIds,
  onChangeSolarParams,
  displayLayers,
  onChangeDisplayLayers,
  solarAnalysis: propSolarAnalysis,
  selectedNodeId,
  onSelectNode
}) => {
  const [activeTierTab, setActiveTierTab] = React.useState<number>(3);
  const frequencies: Frequency[] = [1, 2, 3, 4, 5, 6];
  const cutOptions: { id: DomeCutType; label: string; desc: string }[] = [
    { id: "1/2", label: "1/2", desc: "Півсфера (класика)" },
    { id: "3/8", label: "3/8", desc: "Низький купол" },
    { id: "5/8", label: "5/8", desc: "Високий купол" },
    { id: "7/12", label: "7/12", desc: "Оптимальна стіна" }
  ];

  // Material & Coating logic
  const currentMatId = (connectorParams.material as ConnectorMaterialId) || "steel_st3";
  const currentMatInfo = CONNECTOR_MATERIALS[currentMatId] || CONNECTOR_MATERIALS.steel_st3;
  const currentCategory: ConnectorMaterialCategory = connectorParams.materialCategory || currentMatInfo.category || "steel";
  const currentCoatingId = (connectorParams.coating as ConnectorCoatingId) || currentMatInfo.defaultCoating;
  const currentCoatingInfo = CONNECTOR_COATINGS[currentCoatingId] || CONNECTOR_COATINGS[currentMatInfo.defaultCoating];

  const categoryMaterials = Object.values(CONNECTOR_MATERIALS).filter(m => m.category === currentCategory);
  const categoryCoatings = getCoatingsForCategory(currentCategory);

  const connectorSummaries = React.useMemo(() => {
    if (model) return classifyConnectorTypes(model, connectorParams);
    return [];
  }, [model, connectorParams]);

  const weightSummary = React.useMemo(() => {
    if (model && connectorSummaries.length > 0) {
      return calculateConnectorsWeightSummary(model, connectorSummaries);
    }
    const estCount = params.frequency === 2 ? 26 : params.frequency === 3 ? 46 : 92;
    const unitWt = calculateConnectorPieceWeight(6, false, connectorParams, beamProfile);
    return {
      totalWeightKg: Math.round(unitWt * estCount * 10) / 10,
      averagePieceWeightKg: unitWt,
      totalPieceCount: estCount
    };
  }, [model, connectorSummaries, connectorParams, beamProfile, params.frequency]);

  const steelTotalWeightKg = React.useMemo(() => {
    if (currentCategory === "steel") return weightSummary.totalWeightKg;
    const steelRatio = 7850 / currentMatInfo.densityKgM3;
    const infillFactor = currentCategory === "plastic" ? ((connectorParams.plasticInfillPercent || 100) / 100) : 1.0;
    return Math.round(weightSummary.totalWeightKg * (steelRatio / infillFactor) * 10) / 10;
  }, [weightSummary.totalWeightKg, currentCategory, currentMatInfo.densityKgM3, connectorParams.plasticInfillPercent]);

  const weightSavedKg = Math.max(0, Math.round((steelTotalWeightKg - weightSummary.totalWeightKg) * 10) / 10);

  // Solar insolation and face orientation analysis
  const solarAnalysis = useMemo(() => {
    if (propSolarAnalysis) return propSolarAnalysis;
    if (!model) return null;
    return analyzeDomeSolar(model, {
      domeAzimuthDeg: solarParams?.domeOrientationDeg ?? 0,
      latitudeDeg: solarParams?.latitudeDeg ?? 49.0,
      peakPowerPerM2: solarParams?.peakPowerPerM2 ?? 210
    });
  }, [propSolarAnalysis, model, solarParams?.domeOrientationDeg, solarParams?.latitudeDeg, solarParams?.peakPowerPerM2]);

  return (
    <div className="flex flex-col gap-5 p-6 rounded-3xl tactile-card">
      {/* Header with Approval Status */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26]">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#1A2E3B]">Параметри купола</h2>
            <p className="text-xs text-[#5A6778]">Геометрія, брус та вузли</p>
          </div>
        </div>

        {/* Approval Lock Badge */}
        {approved ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-xl bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE]">
              {geometryVersion}
            </span>
            <button
              onClick={onRevoke}
              className="p-1.5 rounded-xl tactile-btn text-[#DE7C5A] hover:text-[#C55A38]"
              title="Зняти фіксацію геометрії"
            >
              <Unlock className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onApprove}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold tactile-btn-mint"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Затвердити</span>
          </button>
        )}
      </div>

      {/* 3D Display Layers Card (Каркас, Конектори, Зовнішня обшивка, Внутрішня обшивка) */}
      <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60">
        <div className="flex items-center justify-between mb-2.5">
          <label className="text-xs font-bold tracking-wide text-[#5A6778] flex items-center gap-1.5 uppercase">
            <Eye className="w-3.5 h-3.5 text-[#5B9279]" />
            <span>Відображення у 3D (Шари)</span>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (onChangeDisplayLayers) {
                  onChangeDisplayLayers({
                    showBeams: true,
                    showConnectors: true,
                    showOuterSheathing: true,
                    showInnerSheathing: true,
                    sheathingOpacity: 0.85
                  });
                }
              }}
              className="text-[10px] font-bold text-[#DE7C5A] hover:underline px-2 py-0.5 rounded-lg bg-white border border-[#E8E2D8] shadow-2xs cursor-pointer"
              title="Показати всі елементи купола разом у 3D: каркас, конектори, зовнішню та внутрішню обшивку"
            >
              ✨ Все разом
            </button>
          </div>
        </div>

        {/* 4 Independent Layer Toggles */}
        <div className="grid grid-cols-2 gap-2 mb-2.5">
          {/* Layer 1: Frame / Beams */}
          <button
            type="button"
            onClick={() => {
              if (onChangeDisplayLayers && displayLayers) {
                onChangeDisplayLayers({ ...displayLayers, showBeams: !displayLayers.showBeams });
              }
            }}
            className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold transition-all text-left cursor-pointer border ${
              displayLayers?.showBeams
                ? "bg-[#E1EDE3] text-[#1A3E26] border-[#A6C7AE] shadow-2xs"
                : "bg-white/80 text-[#8C9BAE] border-[#E8E2D8] hover:bg-white"
            }`}
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 font-black ${
              displayLayers?.showBeams ? "bg-[#2E7D32] text-white" : "border border-[#CBD5E1]"
            }`}>
              {displayLayers?.showBeams && "✓"}
            </div>
            <Box className="w-3.5 h-3.5 text-[#5B9279] shrink-0" />
            <div className="leading-tight">
              <span className="block text-[11px]">Каркас (балки)</span>
              <span className="text-[9px] font-normal text-[#5A6778]">
                {displayLayers?.showBeams ? "Показується" : "Приховано"}
              </span>
            </div>
          </button>

          {/* Layer 2: Connectors */}
          <button
            type="button"
            onClick={() => {
              if (onChangeDisplayLayers && displayLayers) {
                onChangeDisplayLayers({ ...displayLayers, showConnectors: !displayLayers.showConnectors });
              }
            }}
            className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold transition-all text-left cursor-pointer border ${
              displayLayers?.showConnectors
                ? "bg-[#E0F2FE] text-[#0369A1] border-[#7DD3FC] shadow-2xs"
                : "bg-white/80 text-[#8C9BAE] border-[#E8E2D8] hover:bg-white"
            }`}
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 font-black ${
              displayLayers?.showConnectors ? "bg-[#0284C7] text-white" : "border border-[#CBD5E1]"
            }`}>
              {displayLayers?.showConnectors && "✓"}
            </div>
            <Disc className="w-3.5 h-3.5 text-[#0284C7] shrink-0" />
            <div className="leading-tight">
              <span className="block text-[11px]">Конектори</span>
              <span className="text-[9px] font-normal text-[#5A6778]">
                {displayLayers?.showConnectors ? "Показуються" : "Приховано"}
              </span>
            </div>
          </button>

          {/* Layer 3: Outer Sheathing */}
          <button
            type="button"
            onClick={() => {
              if (onChangeDisplayLayers && displayLayers) {
                onChangeDisplayLayers({ ...displayLayers, showOuterSheathing: !displayLayers.showOuterSheathing });
              }
            }}
            className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold transition-all text-left cursor-pointer border ${
              displayLayers?.showOuterSheathing
                ? "bg-[#FDEFE7] text-[#8B5E34] border-[#FDBA74] shadow-2xs"
                : "bg-white/80 text-[#8C9BAE] border-[#E8E2D8] hover:bg-white"
            }`}
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 font-black ${
              displayLayers?.showOuterSheathing ? "bg-[#DE7C5A] text-white" : "border border-[#CBD5E1]"
            }`}>
              {displayLayers?.showOuterSheathing && "✓"}
            </div>
            <Triangle className="w-3.5 h-3.5 text-[#DE7C5A] shrink-0" />
            <div className="leading-tight">
              <span className="block text-[11px]">Зовнішня обшивка</span>
              <span className="text-[9px] font-normal text-[#5A6778]">
                {displayLayers?.showOuterSheathing ? "Показується" : "Приховано"}
              </span>
            </div>
          </button>

          {/* Layer 4: Inner Sheathing */}
          <button
            type="button"
            onClick={() => {
              if (onChangeDisplayLayers && displayLayers) {
                const next = !displayLayers.showInnerSheathing;
                onChangeDisplayLayers({ ...displayLayers, showInnerSheathing: next });
              }
            }}
            className={`flex items-center gap-2 p-2 rounded-xl text-xs font-bold transition-all text-left cursor-pointer border ${
              displayLayers?.showInnerSheathing
                ? "bg-[#EDE9FE] text-[#6D28D9] border-[#C4B5FD] shadow-2xs"
                : "bg-white/80 text-[#8C9BAE] border-[#E8E2D8] hover:bg-white"
            }`}
          >
            <div className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 font-black ${
              displayLayers?.showInnerSheathing ? "bg-[#7C3AED] text-white" : "border border-[#CBD5E1]"
            }`}>
              {displayLayers?.showInnerSheathing && "✓"}
            </div>
            <Home className="w-3.5 h-3.5 text-[#7C3AED] shrink-0" />
            <div className="leading-tight">
              <span className="block text-[11px]">Внутрішня обшивка</span>
              <span className="text-[9px] font-normal text-[#5A6778]">
                {displayLayers?.showInnerSheathing ? "Показується" : "Приховано"}
              </span>
            </div>
          </button>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center justify-between gap-1 pt-2 border-t border-[#F0EBE1] text-[10px]">
          <span className="text-[#8C9BAE] font-medium">Швидкі пресети:</span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (onChangeDisplayLayers) {
                  onChangeDisplayLayers({
                    showBeams: true,
                    showConnectors: true,
                    showOuterSheathing: false,
                    showInnerSheathing: false,
                    sheathingOpacity: 0.85
                  });
                }
              }}
              className="px-2 py-0.5 rounded-md bg-white hover:bg-[#F5F1E9] border border-[#E8E2D8] text-[#5A6778] cursor-pointer"
            >
              Каркас+Вузли
            </button>
            <button
              type="button"
              onClick={() => {
                if (onChangeDisplayLayers) {
                  onChangeDisplayLayers({
                    showBeams: false,
                    showConnectors: false,
                    showOuterSheathing: true,
                    showInnerSheathing: false,
                    sheathingOpacity: 1.0
                  });
                }
              }}
              className="px-2 py-0.5 rounded-md bg-white hover:bg-[#F5F1E9] border border-[#E8E2D8] text-[#5A6778] cursor-pointer"
            >
              Тільки обшивка
            </button>
            <button
              type="button"
              onClick={() => {
                if (onChangeDisplayLayers) {
                  onChangeDisplayLayers({
                    showBeams: true,
                    showConnectors: true,
                    showOuterSheathing: true,
                    showInnerSheathing: true,
                    sheathingOpacity: 0.85
                  });
                }
              }}
              className="px-2 py-0.5 rounded-md bg-[#FAF7F2] hover:bg-[#F5EFE6] border border-[#DE7C5A]/40 text-[#DE7C5A] font-bold cursor-pointer"
            >
              Повний пиріг
            </button>
          </div>
        </div>
      </div>

      {/* Frequency 1V - 6V Tabs */}
      <div>
        <label className="text-xs font-bold tracking-wide text-[#5A6778] mb-2 block uppercase">
          Частота розбивки (V)
        </label>
        <div className="grid grid-cols-6 gap-1.5 p-1.5 rounded-2xl tactile-inset">
          {frequencies.map(f => (
            <button
              key={f}
              onClick={() => onChangeParams({ ...params, frequency: f })}
              className={`py-2 text-xs font-bold rounded-xl transition-all ${
                params.frequency === f
                  ? "tactile-pill-active text-[#1A3E26] bg-[#FAF7F2] shadow-sm"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              {f}V
            </button>
          ))}
        </div>
      </div>

      {/* Diameter & Height Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Diameter */}
        <div className="p-3.5 rounded-2xl tactile-inset-subtle border border-white/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-[#5A6778]">Діаметр основи</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0.15}
                max={24.0}
                step={0.01}
                value={Number((params.diameter / 1000).toFixed(2))}
                onChange={e => {
                  const valMeters = parseFloat(e.target.value);
                  if (!isNaN(valMeters) && valMeters >= 0.15 && valMeters <= 24) {
                    onChangeParams({ ...params, diameter: Math.round(valMeters * 1000) });
                  }
                }}
                className="w-16 px-1.5 py-0.5 text-xs font-mono font-bold text-right text-[#1A2E3B] bg-white rounded-lg border border-[#DCD6CA] outline-none shadow-2xs"
              />
              <span className="text-xs font-mono font-bold text-[#1A2E3B]">
                м {params.diameter < 1000 ? `(${(params.diameter / 10).toFixed(params.diameter % 10 === 0 ? 0 : 1)} см)` : ""}
              </span>
            </div>
          </div>
          <input
            type="range"
            min={150}
            max={24000}
            step={10}
            value={params.diameter}
            onChange={e => onChangeParams({ ...params, diameter: Number(e.target.value) })}
            className="w-full accent-[#5B9279] cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-[#8C9BAE] mt-1 font-mono">
            <span className="text-[#2E7D32] font-semibold">15 см (0.15 м)</span>
            <span>4.0 м</span>
            <span>12.0 м</span>
            <span>24.0 м</span>
          </div>

          {/* Quick preset chips */}
          <div className="flex flex-wrap items-center gap-1 mt-2.5 pt-2 border-t border-[#E8E2D8]/80">
            <span className="text-[10px] text-[#8C9BAE] mr-0.5">Швидкий вибір:</span>
            {[
              { label: "15 см (макет)", d: 150 },
              { label: "50 см", d: 500 },
              { label: "1.5 м", d: 1500 },
              { label: "4 м", d: 4000 },
              { label: "8 м", d: 8000 },
              { label: "12 м", d: 12000 }
            ].map(preset => (
              <button
                key={preset.d}
                type="button"
                onClick={() => onChangeParams({ ...params, diameter: preset.d })}
                className={`px-2 py-0.5 text-[10px] font-mono rounded-lg transition-all ${
                  Math.abs(params.diameter - preset.d) < 50
                    ? "bg-[#5B9279] text-white font-bold shadow-2xs"
                    : "bg-white/80 hover:bg-white text-[#5A6778] border border-[#E4DED3]"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Height Cut Ratio */}
        <div className="p-3.5 rounded-2xl tactile-inset-subtle border border-white/60">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-[#5A6778]">Висота купола</span>
            <span className="text-xs font-mono font-bold text-[#1A2E3B]">
              {(params.height / 1000).toFixed(2)} м
              {params.height < 1000 ? ` (${(params.height / 10).toFixed(params.height % 10 === 0 ? 0 : 1)} см)` : ""}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl tactile-inset">
            {cutOptions.map(c => (
              <button
                key={c.id}
                onClick={() => onChangeParams({ ...params, cutType: c.id })}
                className={`py-1 text-xs font-semibold rounded-lg transition-all ${
                  params.cutType === c.id
                    ? "bg-[#FAF7F2] text-[#1A2E3B] shadow-xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
                title={c.desc}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Leveling Base Horizon Checkbox Option */}
      <div className="p-4 rounded-2xl tactile-card-mint border border-white/80 transition-all">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!params.levelBaseHorizon}
            onChange={e =>
              onChangeParams({
                ...params,
                levelBaseHorizon: e.target.checked,
                levelingMode: params.levelingMode || "flat_ring"
              })
            }
            className="sr-only"
          />
          <div
            className={`w-5 h-5 rounded-lg flex items-center justify-center mt-0.5 transition-all ${
              params.levelBaseHorizon
                ? "bg-[#5B9279] text-white shadow-xs"
                : "bg-white border border-[#DCD6CA] text-transparent"
            }`}
          >
            {params.levelBaseHorizon && <CheckSquare className="w-4 h-4" />}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[#1A3E26]">
                Вирівняти основу брусами по горизонту фундаменту
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/70 text-[#1A3E26] font-semibold">
                Z = 0.0 мм
              </span>
            </div>
            <p className="text-[11px] text-[#3D6B5D] mt-0.5 leading-snug">
              Усуває хвилясті зазори сферичного зрізу та формує рівний горизонтальний опорний пояс
              брусів для встановлення на плоский фундамент або плиту.
            </p>
          </div>
        </label>

        {/* Sub-modes when leveling is enabled */}
        {params.levelBaseHorizon && (
          <div className="mt-3 pt-3 border-t border-[#A6C7AE]/40 flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#3D6B5D]">
              Спосіб вирівнювання горизонту:
            </span>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl tactile-inset">
              <button
                type="button"
                onClick={() => onChangeParams({ ...params, levelingMode: "flat_ring" })}
                className={`py-1.5 px-2 text-xs font-bold rounded-lg transition-all text-center ${
                  (params.levelingMode || "flat_ring") === "flat_ring"
                    ? "bg-[#FAF7F2] text-[#1A2E3B] shadow-xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
              >
                Плоска обв'язка (Z = 0)
              </button>
              <button
                type="button"
                onClick={() => onChangeParams({ ...params, levelingMode: "risers" })}
                className={`py-1.5 px-2 text-xs font-bold rounded-lg transition-all text-center ${
                  params.levelingMode === "risers"
                    ? "bg-[#FAF7F2] text-[#1A2E3B] shadow-xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
              >
                Стійки вирівнювання
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Plinth / Vertical Riser Wall (Цоколь прямокутниками від 200 мм до 2000 мм) */}
      <div className={`p-4 rounded-2xl transition-all border ${
        params.plinth?.enabled
          ? "bg-[#FFFBEB] border-[#FDE68A] shadow-xs"
          : "tactile-card-mint border-white/80"
      }`}>
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!params.plinth?.enabled}
            onChange={e => {
              const enabled = e.target.checked;
              onChangeParams({
                ...params,
                plinth: {
                  enabled,
                  height: params.plinth?.height || 800
                }
              });
            }}
            className="sr-only"
          />
          <div
            className={`w-5 h-5 rounded-lg flex items-center justify-center mt-0.5 transition-all ${
              params.plinth?.enabled
                ? "bg-[#D97706] text-white shadow-xs font-bold"
                : "bg-white border border-[#DCD6CA] text-transparent"
            }`}
          >
            {params.plinth?.enabled && <CheckSquare className="w-4 h-4" />}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-bold ${params.plinth?.enabled ? "text-[#92400E]" : "text-[#1A3E26]"}`}>
                Побудова цоколя прямокутниками
              </span>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                params.plinth?.enabled ? "bg-[#D97706] text-white" : "bg-white/70 text-[#1A3E26]"
              }`}>
                {params.plinth?.enabled ? `+${(params.plinth.height || 800)} мм` : "Вимкнено"}
              </span>
            </div>
            <p className={`text-[11px] mt-0.5 leading-snug ${params.plinth?.enabled ? "text-[#B45309]" : "text-[#3D6B5D]"}`}>
              Піднімає купол над основою на регульовану висоту (200–2000 мм). Формує вертикальні прямокутні секції з діагональною балкою жорсткості, обшивкою, конекторами та стіновим поясом тенту.
            </p>
          </div>
        </label>

        {/* Sub-controls when plinth is enabled */}
        {params.plinth?.enabled && (
          <div className="mt-3 pt-3 border-t border-[#FDE68A] flex flex-col gap-3">
            {/* Height Slider & Number Input */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#92400E]">Висота цоколя (стіни):</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={200}
                    max={2000}
                    step={50}
                    value={params.plinth.height || 800}
                    onChange={e => {
                      const val = Math.max(200, Math.min(2000, Number(e.target.value) || 800));
                      onChangeParams({
                        ...params,
                        plinth: {
                          ...params.plinth!,
                          height: val
                        }
                      });
                    }}
                    className="w-20 px-2 py-0.5 font-mono font-bold text-xs text-right bg-white rounded-lg border border-[#FDE68A] text-[#92400E] outline-none"
                  />
                  <span className="font-mono text-xs text-[#B45309]">мм</span>
                </div>
              </div>

              <input
                type="range"
                min={200}
                max={2000}
                step={50}
                value={params.plinth.height || 800}
                onChange={e => {
                  onChangeParams({
                    ...params,
                    plinth: {
                      ...params.plinth!,
                      height: Number(e.target.value)
                    }
                  });
                }}
                className="w-full accent-[#D97706] cursor-pointer"
              />

              {/* Quick Height Presets */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                {[
                  { label: "400 мм (низький)", h: 400 },
                  { label: "600 мм", h: 600 },
                  { label: "800 мм (стандарт)", h: 800 },
                  { label: "1000 мм (1.0 м)", h: 1000 },
                  { label: "1200 мм", h: 1200 },
                  { label: "1800 мм (стіна)", h: 1800 },
                  { label: "2000 мм (2.0 м)", h: 2000 }
                ].map(preset => (
                  <button
                    key={preset.h}
                    type="button"
                    onClick={() => {
                      onChangeParams({
                        ...params,
                        plinth: {
                          ...params.plinth!,
                          height: preset.h
                        }
                      });
                    }}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded-lg transition-all ${
                      params.plinth?.height === preset.h
                        ? "bg-[#D97706] text-white font-bold shadow-2xs"
                        : "bg-white hover:bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Plinth Engineering Breakdown Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-2 rounded-xl bg-white/80 border border-[#FDE68A] text-center">
              <div>
                <span className="text-[10px] text-[#B45309] block">Секцій (прямок.):</span>
                <span className="font-mono font-bold text-xs text-[#92400E]">
                  {model?.statistics?.plinthBayCount || 10} шт.
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#B45309] block">Площа стін:</span>
                <span className="font-mono font-bold text-xs text-[#92400E]">
                  {model?.statistics?.plinthWallAreaM2 || 0} м²
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#B45309] block">Стійки/лежні:</span>
                <span className="font-mono font-bold text-xs text-[#92400E]">
                  {(model?.statistics?.plinthBayCount || 10) * 3} балок
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[#B45309] block">Загальна висота:</span>
                <span className="font-mono font-bold text-xs text-[#92400E]">
                  {(params.height / 1000).toFixed(2)} м
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2nd Floor Tier Leveling / Вирівнювання вузлів 2-го, 3-го, 4-го, 5-го рівнів від землі */}
      <div className="p-4 rounded-2xl tactile-card-mint border border-white/80 transition-all flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#5B9279]/15 text-[#1A3E26] flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-[#3D6B5D]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#1A3E26]">
                  Вирівнювання вузлів від землі
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#5B9279]/20 text-[#1A3E26] font-bold">
                  2-й поверх
                </span>
              </div>
              <p className="text-[11px] text-[#3D6B5D] leading-snug mt-0.5">
                Вирівнює вузли 2, 3, 4 або 5 рівня паралельно землі для монтажу балок перекриття 2-го поверху.
              </p>
            </div>
          </div>
        </div>

        {/* Level Selector Tabs (Рівні 2, 3, 4, 5) */}
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl tactile-inset">
          {[2, 3, 4, 5].map(lvl => {
            const tierData = model?.tiers?.find(t => t.level === lvl);
            const isConfigured = Boolean(
              params.tierLeveling?.[lvl]?.enabled ||
              model?.parameters?.tierLeveling?.[lvl]?.enabled ||
              tierData?.isLeveled
            );
            const isTabActive = activeTierTab === lvl;
            const hasNodes = tierData && tierData.nodeCount > 0;

            return (
              <button
                key={lvl}
                type="button"
                onClick={() => setActiveTierTab(lvl)}
                disabled={!hasNodes && (!model?.tiers || model.tiers.length === 0)}
                className={`py-1.5 px-1 rounded-lg text-xs font-bold flex flex-col items-center justify-center transition-all relative ${
                  isTabActive
                    ? "bg-[#FAF7F2] text-[#1A3E26] shadow-xs"
                    : isConfigured
                    ? "bg-[#5B9279]/20 text-[#1A3E26]"
                    : "text-[#5A6778] hover:text-[#1A2E3B] opacity-80"
                } ${!hasNodes ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center gap-1">
                  <span>{lvl}-й рівень</span>
                  {isConfigured && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
                  )}
                </div>
                <span className="text-[9px] font-mono font-normal">
                  {tierData ? `${tierData.nodeCount} вуз.` : "-"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Tier Configuration Card */}
        {(() => {
          const currentTier = model?.tiers?.find(t => t.level === activeTierTab);
          const currentCfg = params.tierLeveling?.[activeTierTab];
          const isEnabled = Boolean(
            currentCfg?.enabled ||
            model?.parameters?.tierLeveling?.[activeTierTab]?.enabled ||
            currentTier?.isLeveled
          );
          const nodesInTier = currentTier
            ? currentTier.nodeIds.map(id => model!.nodes[id]).filter(Boolean)
            : [];

          return (
            <div className={`p-3.5 rounded-xl border transition-all flex flex-col gap-3 ${
              isEnabled
                ? "bg-[#F0FDF4] border-[#86EFAC] shadow-2xs"
                : "bg-white/70 border-[#DCD6CA]"
            }`}>
              {/* Checkbox toggle */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={e => {
                    const checked = e.target.checked;
                    const prevTierLeveling = params.tierLeveling || {};
                    let refId = currentCfg?.referenceNodeId;
                    let targetZ = currentCfg?.targetZ;
                    if (checked && refId === undefined && nodesInTier.length > 0) {
                      const highestNode = [...nodesInTier].sort((a, b) => b.position.z - a.position.z)[0];
                      refId = highestNode.id;
                      targetZ = Math.round(highestNode.position.z * 10) / 10;
                    }

                    onChangeParams({
                      ...params,
                      tierLeveling: {
                        ...prevTierLeveling,
                        [activeTierTab]: {
                          level: activeTierTab,
                          enabled: checked,
                          referenceNodeId: refId,
                          targetZ: targetZ ?? currentTier?.maxZ,
                          radialMode: currentCfg?.radialMode || "vertical"
                        }
                      }
                    });
                  }}
                  className="sr-only"
                />
                <div
                  className={`w-5 h-5 rounded-lg flex items-center justify-center mt-0.5 transition-all ${
                    isEnabled
                      ? "bg-[#10B981] text-white shadow-xs"
                      : "bg-white border border-[#DCD6CA] text-transparent"
                  }`}
                >
                  {isEnabled && <CheckSquare className="w-4 h-4" />}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-[#1A3E26]">
                      Вирівняти {activeTierTab}-й рівень паралельно землі
                    </span>
                    {isEnabled ? (
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#10B981] text-white">
                        Z = {Math.round(currentTier?.leveledZ ?? currentTier?.maxZ ?? 0)} мм (Рівно)
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                        Перепад: {currentTier?.heightSpreadMm ?? 0} мм
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#3D6B5D] mt-0.5 leading-snug">
                    {isEnabled
                      ? `Всі ${currentTier?.nodeCount ?? 0} вузлів ${activeTierTab}-го рівня зафіксовані в єдиній горизонтальній площині перекриття.`
                      : `У вихідному геокуполі висота вузлів коливається від ${Math.round(currentTier?.minZ ?? 0)} до ${Math.round(currentTier?.maxZ ?? 0)} мм. Увімкніть вирівнювання, щоб зробити горизонтальну основу для другого поверху.`}
                  </p>
                </div>
              </label>

              {/* Node selection and leveling details when enabled */}
              {isEnabled && (
                <div className="pt-3 border-t border-[#86EFAC]/50 flex flex-col gap-3">
                  {/* Reference Node Picker */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-[#1A3E26] flex items-center gap-1.5">
                        <span>Базовий вузол вирівнювання:</span>
                        <span className="text-[10px] text-[#3D6B5D] font-normal">
                          (висота горизонту)
                        </span>
                      </label>
                      {currentCfg?.referenceNodeId !== undefined && (
                        <span className="text-[10px] font-mono font-bold text-[#047857] bg-white px-1.5 py-0.5 rounded border border-[#86EFAC]">
                          Вузол #{currentCfg.referenceNodeId} ({model?.nodes[currentCfg.referenceNodeId]?.label})
                        </span>
                      )}
                    </div>

                    <select
                      value={currentCfg?.referenceNodeId ?? ""}
                      onChange={e => {
                        const nId = Number(e.target.value);
                        const selectedNode = model?.nodes[nId];
                        const targetZ = selectedNode ? Math.round(selectedNode.position.z * 10) / 10 : undefined;
                        onChangeParams({
                          ...params,
                          tierLeveling: {
                            ...params.tierLeveling,
                            [activeTierTab]: {
                              level: activeTierTab,
                              enabled: true,
                              referenceNodeId: nId,
                              referenceNodeLabel: selectedNode?.label,
                              targetZ,
                              radialMode: currentCfg?.radialMode || "vertical"
                            }
                          }
                        });
                        if (onSelectNode) onSelectNode(nId);
                      }}
                      className="w-full text-xs p-2 rounded-xl bg-white border border-[#86EFAC] text-[#1A3E26] font-medium shadow-2xs focus:ring-1 focus:ring-[#10B981] outline-hidden"
                    >
                      {nodesInTier.map(node => {
                        const rXY = Math.round(Math.hypot(node.position.x, node.position.y));
                        const isHighest = Math.abs(node.position.z - (currentTier?.maxZ ?? 0)) < 1;
                        const isLowest = Math.abs(node.position.z - (currentTier?.minZ ?? 0)) < 1;
                        const badge = isHighest ? " (Найвищий)" : isLowest ? " (Найнижчий)" : "";
                        return (
                          <option key={node.id} value={node.id}>
                            Вузол #{node.id} ({node.label}) — Z: {Math.round(node.position.z)} мм · R: {rXY} мм{badge}
                          </option>
                        );
                      })}
                    </select>

                    {/* Quick Presets: Highest node vs Lowest node */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          const highest = [...nodesInTier].sort((a, b) => b.position.z - a.position.z)[0];
                          if (highest) {
                            onChangeParams({
                              ...params,
                              tierLeveling: {
                                ...params.tierLeveling,
                                [activeTierTab]: {
                                  level: activeTierTab,
                                  enabled: true,
                                  referenceNodeId: highest.id,
                                  referenceNodeLabel: highest.label,
                                  targetZ: Math.round(highest.position.z * 10) / 10,
                                  radialMode: currentCfg?.radialMode || "vertical"
                                }
                              }
                            });
                            if (onSelectNode) onSelectNode(highest.id);
                          }
                        }}
                        className="px-2 py-1 text-[10px] font-bold rounded-lg bg-white hover:bg-emerald-50 text-[#047857] border border-[#86EFAC] shadow-2xs transition-all"
                      >
                        ↑ По найвищому ({Math.round(currentTier?.maxZ ?? 0)} мм)
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const lowest = [...nodesInTier].sort((a, b) => a.position.z - b.position.z)[0];
                          if (lowest) {
                            onChangeParams({
                              ...params,
                              tierLeveling: {
                                ...params.tierLeveling,
                                [activeTierTab]: {
                                  level: activeTierTab,
                                  enabled: true,
                                  referenceNodeId: lowest.id,
                                  referenceNodeLabel: lowest.label,
                                  targetZ: Math.round(lowest.position.z * 10) / 10,
                                  radialMode: currentCfg?.radialMode || "vertical"
                                }
                              }
                            });
                            if (onSelectNode) onSelectNode(lowest.id);
                          }
                        }}
                        className="px-2 py-1 text-[10px] font-bold rounded-lg bg-white hover:bg-emerald-50 text-[#047857] border border-[#86EFAC] shadow-2xs transition-all"
                      >
                        ↓ По найнижчому ({Math.round(currentTier?.minZ ?? 0)} мм)
                      </button>

                      {selectedNodeId !== null &&
                        selectedNodeId !== undefined &&
                        nodesInTier.some(n => n.id === selectedNodeId) && (
                          <button
                            type="button"
                            onClick={() => {
                              const sel = model?.nodes[selectedNodeId];
                              if (sel) {
                                onChangeParams({
                                  ...params,
                                  tierLeveling: {
                                    ...params.tierLeveling,
                                    [activeTierTab]: {
                                      level: activeTierTab,
                                      enabled: true,
                                      referenceNodeId: sel.id,
                                      referenceNodeLabel: sel.label,
                                      targetZ: Math.round(sel.position.z * 10) / 10,
                                      radialMode: currentCfg?.radialMode || "vertical"
                                    }
                                  }
                                });
                              }
                            }}
                            className="px-2 py-1 text-[10px] font-bold rounded-lg bg-[#047857] text-white shadow-2xs transition-all"
                          >
                            ★ Встановити обраний #{selectedNodeId} ({model?.nodes[selectedNodeId]?.label})
                          </button>
                        )}
                    </div>
                  </div>

                  {/* Radial Geometry Mode */}
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-[#86EFAC]/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#065F46]">
                      Геометрія зміщення вузлів:
                    </span>
                    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/90 border border-[#86EFAC]">
                      <button
                        type="button"
                        onClick={() =>
                          onChangeParams({
                            ...params,
                            tierLeveling: {
                              ...params.tierLeveling,
                              [activeTierTab]: {
                                ...(currentCfg || { level: activeTierTab, enabled: true }),
                                radialMode: "vertical"
                              }
                            }
                          })
                        }
                        className={`py-1 px-1 text-[10px] font-bold rounded-md transition-all text-center ${
                          (currentCfg?.radialMode || "vertical") === "vertical"
                            ? "bg-[#10B981] text-white shadow-2xs"
                            : "text-[#065F46] hover:bg-emerald-50"
                        }`}
                      >
                        Тільки Z (по висоті)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeParams({
                            ...params,
                            tierLeveling: {
                              ...params.tierLeveling,
                              [activeTierTab]: {
                                ...(currentCfg || { level: activeTierTab, enabled: true }),
                                radialMode: "spherical"
                              }
                            }
                          })
                        }
                        className={`py-1 px-1 text-[10px] font-bold rounded-md transition-all text-center ${
                          currentCfg?.radialMode === "spherical"
                            ? "bg-[#10B981] text-white shadow-2xs"
                            : "text-[#065F46] hover:bg-emerald-50"
                        }`}
                      >
                        На сфері
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onChangeParams({
                            ...params,
                            tierLeveling: {
                              ...params.tierLeveling,
                              [activeTierTab]: {
                                ...(currentCfg || { level: activeTierTab, enabled: true }),
                                radialMode: "uniform_radius"
                              }
                            }
                          })
                        }
                        className={`py-1 px-1 text-[10px] font-bold rounded-md transition-all text-center ${
                          currentCfg?.radialMode === "uniform_radius"
                            ? "bg-[#10B981] text-white shadow-2xs"
                            : "text-[#065F46] hover:bg-emerald-50"
                        }`}
                      >
                        Рівне коло (R const)
                      </button>
                    </div>
                  </div>

                  {/* Summary Metric for Floor joists */}
                  <div className="grid grid-cols-3 gap-1.5 p-2 rounded-xl bg-white border border-[#86EFAC] text-center text-[10px]">
                    <div>
                      <span className="text-[#065F46] block">Вузлів у поясі:</span>
                      <span className="font-mono font-bold text-xs text-[#047857]">
                        {currentTier?.nodeCount ?? 0} шт.
                      </span>
                    </div>
                    <div>
                      <span className="text-[#065F46] block">Висота підлоги:</span>
                      <span className="font-mono font-bold text-xs text-[#047857]">
                        {Math.round(currentTier?.leveledZ ?? currentTier?.maxZ ?? 0)} мм
                      </span>
                    </div>
                    <div>
                      <span className="text-[#065F46] block">Перепад:</span>
                      <span className="font-mono font-bold text-xs text-[#047857]">
                        0.0 мм (Ідеал)
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Beam Cross-Section / Profile */}
      <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold tracking-wide text-[#5A6778] block uppercase">
            Переріз та матеріал балок
          </label>
          <span className="text-[11px] font-mono font-bold text-[#DE7C5A] bg-[#FAF7F2] px-2 py-0.5 rounded-md border border-[#E4DED3]">
            {beamProfile.type === "circular"
              ? `Кругляк Ø ${beamProfile.diameter || beamProfile.width} мм`
              : beamProfile.type === "pipe"
              ? `Трубка Ø ${beamProfile.diameter || beamProfile.width} × ${beamProfile.wallThickness || 1.5} мм`
              : `Брус ${beamProfile.width} × ${beamProfile.depth} мм`}
          </span>
        </div>

        {/* Shape Switcher: Rectangular vs Circular (1 - 50 mm) */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            onClick={() => {
              if (beamProfile.type === "circular" || beamProfile.type === "pipe") {
                const w = Math.max(20, beamProfile.width || 50);
                const h = Math.max(30, beamProfile.depth || 100);
                onChangeProfile({
                  ...beamProfile,
                  type: "rectangular",
                  width: w,
                  depth: h,
                  name: `Дерев'яний брус ${w} × ${h} мм`
                });
                onChangeConnectorParams({
                  ...connectorParams,
                  rayType: "plate"
                });
              }
            }}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              beamProfile.type === "rectangular"
                ? "bg-[#1A2E3B] text-white border-[#1A2E3B] shadow-xs"
                : "bg-white text-[#5A6778] border-[#E4DED3] hover:text-[#1A2E3B]"
            }`}
          >
            <Square className="w-3.5 h-3.5" />
            <span>Прямокутний брус</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (beamProfile.type === "rectangular") {
                const initDiam = Math.min(50, Math.max(1, beamProfile.width <= 50 ? beamProfile.width : 20));
                onChangeProfile({
                  ...beamProfile,
                  type: "circular",
                  diameter: initDiam,
                  width: initDiam,
                  depth: initDiam,
                  name: `Круглий переріз Ø ${initDiam} мм`
                });
                onChangeConnectorParams({
                  ...connectorParams,
                  rayType: "round_tube"
                });
              }
            }}
            className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              beamProfile.type === "circular" || beamProfile.type === "pipe"
                ? "bg-[#1A2E3B] text-white border-[#1A2E3B] shadow-xs"
                : "bg-white text-[#5A6778] border-[#E4DED3] hover:text-[#1A2E3B]"
            }`}
          >
            <Circle className="w-3.5 h-3.5 text-[#DE7C5A]" />
            <span>Круглий (Ø 1–50 мм)</span>
          </button>
        </div>

        {/* CIRCULAR BEAM CONTROLS (Ø 1 mm - 50 mm) */}
        {(beamProfile.type === "circular" || beamProfile.type === "pipe") ? (
          <div className="space-y-3 p-3 rounded-xl bg-white border border-[#E8E2D8]">
            {/* Sub-type: Solid Rod vs Pipe / Tube */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-[#5A6778]">Тип перерізу:</span>
              <div className="flex items-center p-0.5 rounded-lg bg-[#FAF7F2] border border-[#E4DED3]">
                <button
                  type="button"
                  onClick={() => {
                    const d = beamProfile.diameter || beamProfile.width || 20;
                    onChangeProfile({
                      ...beamProfile,
                      type: "circular",
                      diameter: d,
                      width: d,
                      depth: d,
                      name: `Кругляк Ø ${d} мм`
                    });
                  }}
                  className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                    beamProfile.type === "circular"
                      ? "bg-[#1A2E3B] text-white shadow-2xs"
                      : "text-[#5A6778] hover:text-[#1A2E3B]"
                  }`}
                >
                  Суцільний кругляк
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = beamProfile.diameter || beamProfile.width || 20;
                    const wall = Math.min(3, Math.max(0.5, Math.floor((d * 0.1) * 10) / 10));
                    onChangeProfile({
                      ...beamProfile,
                      type: "pipe",
                      diameter: d,
                      width: d,
                      depth: d,
                      wallThickness: wall,
                      name: `Кругла трубка Ø ${d} × ${wall} мм`
                    });
                  }}
                  className={`px-2 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                    beamProfile.type === "pipe"
                      ? "bg-[#1A2E3B] text-white shadow-2xs"
                      : "text-[#5A6778] hover:text-[#1A2E3B]"
                  }`}
                >
                  Кругла трубка
                </button>
              </div>
            </div>

            {/* Diameter Slider & Input (1 mm to 50 mm) */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[11px] font-bold text-[#1A2E3B]">
                  Діаметр балки (d):
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    step={0.5}
                    value={beamProfile.diameter || beamProfile.width || 20}
                    onChange={e => {
                      const val = Math.min(50, Math.max(1, Number(e.target.value) || 1));
                      onChangeProfile({
                        ...beamProfile,
                        diameter: val,
                        width: val,
                        depth: val,
                        name: beamProfile.type === "pipe"
                          ? `Трубка Ø ${val} × ${beamProfile.wallThickness || 1.5} мм`
                          : `Кругляк Ø ${val} мм`
                      });
                    }}
                    className="w-16 px-1.5 py-0.5 text-right font-mono font-bold text-xs bg-[#FAF7F2] rounded border border-[#E4DED3] text-[#1A2E3B] outline-none"
                  />
                  <span className="text-[11px] font-bold text-[#8C9BAE]">мм</span>
                </div>
              </div>

              <input
                type="range"
                min={1}
                max={50}
                step={0.5}
                value={beamProfile.diameter || beamProfile.width || 20}
                onChange={e => {
                  const val = Number(e.target.value);
                  onChangeProfile({
                    ...beamProfile,
                    diameter: val,
                    width: val,
                    depth: val,
                    name: beamProfile.type === "pipe"
                      ? `Трубка Ø ${val} × ${beamProfile.wallThickness || 1.5} мм`
                      : `Кругляк Ø ${val} мм`
                  });
                }}
                className="w-full accent-[#DE7C5A] cursor-pointer"
              />

              {/* Quick Diameter Presets: 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 25, 30, 40, 50 mm */}
              <div className="flex flex-wrap gap-1 mt-2">
                {[1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 25, 30, 40, 50].map(d => {
                  const isCur = (beamProfile.diameter || beamProfile.width) === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        onChangeProfile({
                          ...beamProfile,
                          diameter: d,
                          width: d,
                          depth: d,
                          name: beamProfile.type === "pipe"
                            ? `Трубка Ø ${d} × ${beamProfile.wallThickness || 1.5} мм`
                            : `Кругляк Ø ${d} мм`
                        });
                      }}
                      className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-md transition-all cursor-pointer border ${
                        isCur
                          ? "bg-[#DE7C5A] text-white border-[#DE7C5A]"
                          : "bg-[#FAF7F2] text-[#5A6778] border-[#E8E2D8] hover:text-[#1A2E3B]"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Wall thickness if pipe */}
            {beamProfile.type === "pipe" && (
              <div className="pt-2 border-t border-[#F0EBE1]">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[11px] text-[#5A6778]">Товщина стінки (t):</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0.2}
                      max={Math.min(10, Math.floor(((beamProfile.diameter || 20) / 2) * 10) / 10)}
                      step={0.1}
                      value={beamProfile.wallThickness || 1.5}
                      onChange={e => {
                        const val = Math.max(0.1, Number(e.target.value) || 0.5);
                        onChangeProfile({
                          ...beamProfile,
                          wallThickness: val,
                          name: `Трубка Ø ${beamProfile.diameter || 20} × ${val} мм`
                        });
                      }}
                      className="w-16 px-1.5 py-0.5 text-right font-mono font-bold text-xs bg-[#FAF7F2] rounded border border-[#E4DED3] text-[#1A2E3B] outline-none"
                    />
                    <span className="text-[11px] text-[#8C9BAE]">мм</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={Math.min(10, Math.max(0.5, ((beamProfile.diameter || 20) / 2) - 0.2))}
                  step={0.1}
                  value={beamProfile.wallThickness || 1.5}
                  onChange={e => {
                    const val = Number(e.target.value);
                    onChangeProfile({
                      ...beamProfile,
                      wallThickness: val,
                      name: `Трубка Ø ${beamProfile.diameter || 20} × ${val} мм`
                    });
                  }}
                  className="w-full accent-[#5B9279] cursor-pointer"
                />
              </div>
            )}

            {/* Material selector */}
            <div className="pt-2 border-t border-[#F0EBE1]">
              <span className="text-[11px] font-bold text-[#5A6778] block mb-1">Матеріал кругляка:</span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "pine", name: "Сосна", density: 500, strength: 24, eMod: 11000 },
                  { id: "beech", name: "Бук / Дуб", density: 680, strength: 30, eMod: 13000 },
                  { id: "spruce", name: "Бамбук", density: 550, strength: 28, eMod: 12500 },
                  { id: "steel", name: "Сталь Ст3", density: 7850, strength: 235, eMod: 206000 },
                  { id: "aluminum", name: "Алюміній", density: 2700, strength: 150, eMod: 70000 },
                  { id: "larch", name: "Модрина", density: 650, strength: 28, eMod: 12000 }
                ].map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onChangeProfile({
                        ...beamProfile,
                        material: m.id as any,
                        density: m.density,
                        bendingStrength: m.strength,
                        elasticModulus: m.eMod
                      });
                    }}
                    className={`py-1 px-1.5 text-[10px] font-bold rounded-lg border text-center transition-all cursor-pointer ${
                      beamProfile.material === m.id
                        ? "bg-[#1A2E3B] text-white border-[#1A2E3B]"
                        : "bg-[#FAF7F2] text-[#5A6778] border-[#E8E2D8] hover:text-[#1A2E3B]"
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Visual Cross-Section Diagram */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] text-[11px]">
              <div className="flex items-center gap-2">
                <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0">
                  <circle
                    cx="20"
                    cy="20"
                    r="16"
                    fill={beamProfile.material === "steel" ? "#94A3B8" : beamProfile.material === "aluminum" ? "#CBD5E1" : "#E2BA84"}
                    stroke="#1A2E3B"
                    strokeWidth="1.5"
                  />
                  {beamProfile.type === "pipe" && (
                    <circle
                      cx="20"
                      cy="20"
                      r={Math.max(4, 16 - ((beamProfile.wallThickness || 1.5) / (beamProfile.diameter || 20)) * 32)}
                      fill="#FAF7F2"
                      stroke="#1A2E3B"
                      strokeWidth="1.2"
                      strokeDasharray="2,2"
                    />
                  )}
                  <line x1="4" y1="20" x2="36" y2="20" stroke="#DE7C5A" strokeWidth="1" strokeDasharray="1,1" />
                </svg>
                <div>
                  <span className="font-bold text-[#1A2E3B] block">
                    Ø {beamProfile.diameter || beamProfile.width} мм
                  </span>
                  <span className="text-[10px] text-[#5A6778]">
                    Площа A: {Math.round((Math.PI / 4) * Math.pow(beamProfile.diameter || beamProfile.width, 2))} мм²
                  </span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-[#5A6778] block">Маса 1 метра:</span>
                <span className="font-mono font-bold text-[#2E7D32]">
                  {Math.round(((Math.PI / 4) * Math.pow((beamProfile.diameter || beamProfile.width) / 1000, 2) * beamProfile.density) * 1000)} г/м
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* RECTANGULAR BEAM CONTROLS */
          <div className="space-y-3">
            {/* Custom Width and Depth Quick Inputs */}
            <div className="grid grid-cols-2 gap-3 mt-1">
              <div>
                <span className="text-[11px] text-[#5A6778] block mb-1">Ширина балки b</span>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-[#E4DED3]">
                  <input
                    type="number"
                    min={10}
                    max={300}
                    step={5}
                    value={beamProfile.width}
                    onChange={e => onChangeProfile({ ...beamProfile, width: Number(e.target.value) })}
                    className="w-full text-xs font-mono font-bold text-[#1A2E3B] outline-none"
                  />
                  <span className="text-[11px] text-[#8C9BAE]">мм</span>
                </div>
              </div>
              <div>
                <span className="text-[11px] text-[#5A6778] block mb-1">Висота/товщина h</span>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-[#E4DED3]">
                  <input
                    type="number"
                    min={15}
                    max={400}
                    step={5}
                    value={beamProfile.depth}
                    onChange={e => onChangeProfile({ ...beamProfile, depth: Number(e.target.value) })}
                    className="w-full text-xs font-mono font-bold text-[#1A2E3B] outline-none"
                  />
                  <span className="text-[11px] text-[#8C9BAE]">мм</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Catalog Preset Dropdown */}
        <div className="mt-3 pt-2 border-t border-[#F0EBE1]">
          <span className="text-[10px] font-bold text-[#8C9BAE] uppercase tracking-wider block mb-1">
            Готові заводські профілі:
          </span>
          <select
            value={beamProfile.name}
            onChange={e => {
              const found = DEFAULT_BEAM_PROFILES.find(p => p.name === e.target.value);
              if (found) onChangeProfile(found);
            }}
            className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[#FAF7F2] border border-[#DCD6CA] text-[#2D3748] focus:outline-none focus:ring-2 focus:ring-[#5B9279]/30 cursor-pointer"
          >
            {DEFAULT_BEAM_PROFILES.map(p => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Connector Sizing */}
      <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold tracking-wide text-[#5A6778] uppercase">
              Конектори
            </label>
            {params.diameter < 1000 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#E1EDE3] text-[#2E7D32]">
                Міні-масштаб
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onResetToProportional && (
              <button
                type="button"
                onClick={onResetToProportional}
                className="text-[10px] font-bold text-[#5B9279] hover:underline"
                title="Скинути параметри конектора до ідеальної пропорції відносно діаметра купола"
              >
                ⚡ Пропорційно
              </button>
            )}
            <span className="text-[10px] font-mono text-[#5B9279] font-bold">
              {params.diameter < 1000 ? "2 - 80 мм" : "20 - 300 мм"}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {/* Connector System Type Select */}
          {/* Connector Ray Style: Round Tube Sleeve vs Rectangular Plate */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#5A6778]">Форма променів (лучей)</span>
              <span className="font-mono font-bold text-[#1A2E3B]">
                {(connectorParams.rayType === "round_tube" || (connectorParams.rayType !== "plate" && (beamProfile.type === "circular" || beamProfile.type === "pipe")))
                  ? "⭕️ Круглі гільзи"
                  : "⭐️ Сталеві пластини"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#F0EDE6]">
              <button
                type="button"
                onClick={() =>
                  onChangeConnectorParams({
                    ...connectorParams,
                    rayType: "round_tube"
                  })
                }
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  (connectorParams.rayType === "round_tube" || (connectorParams.rayType !== "plate" && (beamProfile.type === "circular" || beamProfile.type === "pipe")))
                    ? "bg-[#1A2E3B] text-white shadow-xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
              >
                <Circle className="w-3 h-3 text-[#DE7C5A]" />
                <span>Круглий луч</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeConnectorParams({
                    ...connectorParams,
                    rayType: "plate"
                  })
                }
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  (connectorParams.rayType === "plate" || (connectorParams.rayType !== "round_tube" && beamProfile.type === "rectangular"))
                    ? "bg-[#1A2E3B] text-white shadow-xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
              >
                <Square className="w-3 h-3" />
                <span>Пластина</span>
              </button>
            </div>
          </div>

          {/* Wall Thickness of Sleeves & Central Hub Body (0.5 mm - 20.0 mm) */}
          <div className="p-3 rounded-2xl bg-[#F4EFE6] border border-[#E4DED3]">
            <div className="flex justify-between items-center text-xs mb-1.5">
              <span className="font-bold text-[#1A2E3B] flex items-center gap-1.5">
                <span className="text-[#DE7C5A]">⭕️</span>
                <span>Пустотність (товщина стінок)</span>
              </span>
              <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-lg border border-[#E4DED3]">
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
                  className="w-12 text-center font-mono font-bold text-[#DE7C5A] outline-none text-xs"
                />
                <span className="text-[10px] text-[#8C9BAE] font-mono">мм</span>
              </div>
            </div>
            <input
              type="range"
              min={0.5}
              max={20.0}
              step={0.1}
              value={connectorParams.wallThickness || 2.5}
              onChange={e =>
                onChangeConnectorParams({
                  ...connectorParams,
                  wallThickness: Number(e.target.value)
                })
              }
              className="w-full accent-[#DE7C5A] cursor-pointer mb-2"
            />
            {/* Quick preset buttons: 0.5, 2.5, 5.0, 10.0, 20.0 mm */}
            <div className="flex items-center justify-between gap-1 mb-2">
              {[0.5, 1.5, 2.5, 5.0, 10.0, 20.0].map(thk => (
                <button
                  key={thk}
                  type="button"
                  onClick={() =>
                    onChangeConnectorParams({
                      ...connectorParams,
                      wallThickness: thk
                    })
                  }
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-semibold transition-all ${
                    Math.abs((connectorParams.wallThickness || 2.5) - thk) < 0.05
                      ? "bg-[#DE7C5A] text-white shadow-2xs"
                      : "bg-white/80 hover:bg-white text-[#5A6778] border border-[#E8E2D8]"
                  }`}
                >
                  {thk} мм
                </button>
              ))}
            </div>

            {/* Calculated specs badge for connectors */}
            <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono bg-white p-2 rounded-lg border border-[#E8E2D8]">
              <div>
                <span className="text-[#8C9BAE] block text-[9px]">Внутр. Ø</span>
                <span className="font-bold text-[#1A2E3B]">
                  Ø {beamProfile.diameter || beamProfile.width || 20} мм
                </span>
              </div>
              <div>
                <span className="text-[#8C9BAE] block text-[9px]">Зовнішній Ø</span>
                <span className="font-bold text-[#2E7D32]">
                  Ø {((beamProfile.diameter || beamProfile.width || 20) + (connectorParams.wallThickness || 2.5) * 2).toFixed(1)} мм
                </span>
              </div>
              <div>
                <span className="text-[#8C9BAE] block text-[9px]">Стінка вузла</span>
                <span className="font-bold text-[#DE7C5A]">
                  {(connectorParams.wallThickness || 2.5).toFixed(1)} мм
                </span>
              </div>
            </div>
          </div>

          {/* Material Category & Coating System */}
          <div className="p-3.5 rounded-2xl bg-[#F6F2EC] border border-[#E4DED3] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-[#DE7C5A]" />
                <span>Матеріал та вага конекторів</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#E1EDE3] text-[#1A3E26] font-bold border border-[#A6C7AE]">
                Загалом: {weightSummary.totalWeightKg} кг
              </span>
            </div>

            {/* 1. Category Switcher: Steel | Aluminum | Plastic */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-white border border-[#E4DED3]">
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
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  currentCategory === "steel"
                    ? "bg-[#1A2E3B] text-white shadow-xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
              >
                <span>🔩 Сталь</span>
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
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  currentCategory === "aluminum"
                    ? "bg-[#1A2E3B] text-white shadow-xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
              >
                <span>🪶 Алюміній</span>
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
                className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  currentCategory === "plastic"
                    ? "bg-[#1A2E3B] text-white shadow-xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
              >
                <span>🧊 Пластик</span>
              </button>
            </div>

            {/* 2. Specific Material Grade Select */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#5A6778]">Марка матеріалу</span>
                <span className="font-mono text-[10px] text-[#8C9BAE]">
                  ρ = {(currentMatInfo.densityKgM3 / 1000).toFixed(2)} г/см³
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
                className="w-full py-1.5 px-2 text-xs font-bold rounded-xl bg-white border border-[#E4DED3] text-[#1A2E3B] outline-none cursor-pointer"
              >
                {categoryMaterials.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} (σт={m.yieldStrengthMpa} МПа)
                  </option>
                ))}
              </select>
            </div>

            {/* If Plastic: 3D Infill percentage */}
            {currentCategory === "plastic" && (
              <div className="p-2.5 rounded-xl bg-white border border-[#E4DED3] space-y-1.5">
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

            {/* 3. Anti-Corrosion Coating / Finishing Select */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#5A6778] flex items-center gap-1">
                  <Paintbrush className="w-3 h-3 text-[#DE7C5A]" />
                  <span>Покриття / Антикор</span>
                </span>
                <span className="font-mono text-[10px] text-[#2E7D32] font-semibold">
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
                className="w-full py-1.5 px-2 text-xs font-bold rounded-xl bg-white border border-[#E4DED3] text-[#1A2E3B] outline-none cursor-pointer"
              >
                {categoryCoatings.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.standard})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-[#718096] mt-1 leading-relaxed">
                {currentCoatingInfo.description}
              </p>
            </div>

            {/* 4. Automated Weight & Comparison Metric Card */}
            <div className="p-2.5 rounded-xl bg-white border border-[#E8E2D8] space-y-1.5">
              <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-mono">
                <div className="bg-[#FAF7F2] p-1.5 rounded-lg border border-[#EFEBE4]">
                  <span className="text-[#8C9BAE] block text-[9px]">1 деталь (сер.)</span>
                  <span className="font-bold text-[#1A2E3B] text-xs">
                    {weightSummary.averagePieceWeightKg < 1
                      ? `${Math.round(weightSummary.averagePieceWeightKg * 1000)} г`
                      : `${weightSummary.averagePieceWeightKg.toFixed(2)} кг`}
                  </span>
                </div>
                <div className="bg-[#FAF7F2] p-1.5 rounded-lg border border-[#EFEBE4]">
                  <span className="text-[#8C9BAE] block text-[9px]">Кількість</span>
                  <span className="font-bold text-[#2E7D32] text-xs">
                    {weightSummary.totalPieceCount} шт
                  </span>
                </div>
                <div className="bg-[#FAF7F2] p-1.5 rounded-lg border border-[#EFEBE4]">
                  <span className="text-[#8C9BAE] block text-[9px]">Всі конектори</span>
                  <span className="font-bold text-[#DE7C5A] text-xs">
                    {weightSummary.totalWeightKg} кг
                  </span>
                </div>
              </div>

              {/* Weight savings badge if Aluminum or Plastic */}
              {weightSavedKg > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#E1EDE3]/70 border border-[#A6C7AE]/60 text-[10px] text-[#1A3E26]">
                  <span className="text-xs">⚡️</span>
                  <span>
                    <b>-{weightSavedKg} кг</b> економії ваги каркаса купола порівняно зі сталлю!
                  </span>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#5A6778]">Система вузла</span>
              <span className="font-mono font-bold text-[#DE7C5A]">
                {connectorParams.type === "star_plate" && "Зірка (Thunder)"}
                {connectorParams.type === "pipe_hub" && "Труба-Хаб"}
                {connectorParams.type === "spider" && "Спайдер (U-чаші)"}
                {connectorParams.type === "good_karma" && "Good Karma"}
              </span>
            </div>
            <select
              value={connectorParams.type || "star_plate"}
              onChange={e =>
                onChangeConnectorParams({
                  ...connectorParams,
                  type: e.target.value as any
                })
              }
              className="w-full py-1.5 px-2.5 text-xs font-bold rounded-xl bg-white border border-[#E4DED3] text-[#1A2E3B] outline-none cursor-pointer"
            >
              <option value="star_plate">⭐️ Пластина-зірка (Thunder Domes / Лазер)</option>
              <option value="pipe_hub">⭕️ Трубний вузол (Pipe Hub / Зварна труба)</option>
              <option value="spider">🕷️ Спайдер (U-подібні чаші / Цілісний брус)</option>
              <option value="good_karma">🌀 Good Karma (Безконекторний дерев'яний замок)</option>
            </select>
          </div>

          {/* Hub Core Diameter [2 - 300 mm] */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#5A6778]">Сердцевина (діаметр)</span>
              <span className="font-mono font-bold text-[#1A2E3B]">
                {connectorParams.hubDiameter} мм
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={params.diameter < 1000 ? 80 : 300}
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
            <div className="flex justify-between text-[10px] text-[#8C9BAE] font-mono">
              <span>{params.diameter < 1000 ? "2 мм" : "20 мм"}</span>
              <span>{params.diameter < 1000 ? `${(connectorParams.hubDiameter).toFixed(1)} мм` : "140 мм"}</span>
              <span>{params.diameter < 1000 ? "80 мм" : "300 мм"}</span>
            </div>
          </div>

          {/* Ray / Tab Length [2 - 300 mm] */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[#5A6778]">Довжина луча</span>
              <span className="font-mono font-bold text-[#1A2E3B]">
                {connectorParams.tabLength} мм
              </span>
            </div>
            <input
              type="range"
              min={2}
              max={params.diameter < 1000 ? 80 : 300}
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
            <div className="flex justify-between text-[10px] text-[#8C9BAE] font-mono">
              <span>{params.diameter < 1000 ? "2 мм" : "20 мм"}</span>
              <span>{params.diameter < 1000 ? `${(connectorParams.tabLength).toFixed(1)} мм` : "95 мм"}</span>
              <span>{params.diameter < 1000 ? "80 мм" : "300 мм"}</span>
            </div>
          </div>

          {/* Ray Width & Bolts */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-[#E8E2D8]">
            <div>
              <span className="text-[10px] text-[#5A6778] block mb-1">Ширина луча</span>
              <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white border border-[#E4DED3]">
                <input
                  type="number"
                  min={1.5}
                  max={150}
                  step={connectorParams.tabWidth < 20 ? 0.5 : 5}
                  value={connectorParams.tabWidth}
                  onChange={e =>
                    onChangeConnectorParams({
                      ...connectorParams,
                      tabWidth: Number(e.target.value)
                    })
                  }
                  className="w-full text-xs font-mono font-bold text-[#1A2E3B] outline-none"
                />
                <span className="text-[10px] text-[#8C9BAE]">мм</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] text-[#5A6778] block mb-1">Товщина</span>
              <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white border border-[#E4DED3]">
                <input
                  type="number"
                  min={0.4}
                  max={12.0}
                  step={0.1}
                  value={connectorParams.thickness}
                  onChange={e =>
                    onChangeConnectorParams({
                      ...connectorParams,
                      thickness: Number(e.target.value)
                    })
                  }
                  className="w-full text-xs font-mono font-bold text-[#1A2E3B] outline-none"
                />
                <span className="text-[10px] text-[#8C9BAE]">мм</span>
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
                className="w-full py-1.5 px-2 text-xs font-mono font-bold rounded-xl bg-white border border-[#E4DED3] text-[#1A2E3B] outline-none"
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
        </div>
      </div>

      {/* Sheathing & Seam Gap Controls (Обшивка купола, товщина та зазор між трикутниками 0-10 мм) */}
      <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold tracking-wide text-[#5A6778] flex items-center gap-1.5 uppercase">
            <Triangle className="w-3.5 h-3.5 text-[#DE7C5A]" />
            <span>Обшивка купола та зазор</span>
          </label>
          <span className="text-[11px] font-mono font-bold text-[#8B5E34] bg-[#FAF7F2] px-2 py-0.5 rounded-md border border-[#E4DED3]">
            {sheathingParams?.thickness ?? 12} мм · шов {sheathingParams?.seamGapMm ?? 0} мм
          </span>
        </div>

        {/* 1. Gap between triangle panels: Slider 0 to 10 mm (default 0) */}
        <div className="p-3 rounded-xl bg-white border border-[#E4DED3] flex flex-col gap-2 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1.5">
              <span>Зазор між трикутниками:</span>
            </span>
            <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-lg bg-[#FAF7F2] border border-[#E8E2D8] text-[#DE7C5A]">
              {(sheathingParams?.seamGapMm ?? 0) === 0 ? "0 мм (встик без зазору)" : `${sheathingParams?.seamGapMm} мм`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={10}
              step={0.5}
              value={sheathingParams?.seamGapMm ?? 0}
              onChange={e => {
                const val = parseFloat(e.target.value) || 0;
                if (onChangeSheathingParams && sheathingParams) {
                  onChangeSheathingParams({ ...sheathingParams, seamGapMm: val });
                }
              }}
              className="w-full h-2 rounded-lg bg-[#E8E2D8] accent-[#DE7C5A] cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-[#1A2E3B] w-12 text-right shrink-0">
              {sheathingParams?.seamGapMm ?? 0} мм
            </span>
          </div>

          {/* Quick preset buttons */}
          <div className="flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-[#F5F1E9]">
            <span className="text-[10px] text-[#8C9BAE]">Швидкі пресети:</span>
            <div className="flex flex-wrap items-center gap-1">
              {[0, 2, 3, 5, 8, 10].map(gap => (
                <button
                  key={gap}
                  type="button"
                  onClick={() => {
                    if (onChangeSheathingParams && sheathingParams) {
                      onChangeSheathingParams({ ...sheathingParams, seamGapMm: gap });
                    }
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-all cursor-pointer ${
                    (sheathingParams?.seamGapMm ?? 0) === gap
                      ? "bg-[#DE7C5A] text-white font-bold shadow-2xs"
                      : "bg-[#FAF7F2] text-[#5A6778] hover:bg-[#EFE8DD] border border-[#E8E2D8]"
                  }`}
                >
                  {gap === 0 ? "0 мм (встик)" : `${gap} мм`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Thickness & Material */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] text-[#5A6778] block mb-1">Товщина панелей</span>
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-white border border-[#E4DED3]">
              <input
                type="number"
                min={0.5}
                max={40}
                step={0.5}
                value={sheathingParams?.thickness ?? 12}
                onChange={e => {
                  const val = parseFloat(e.target.value) || 1;
                  if (onChangeSheathingParams && sheathingParams) {
                    onChangeSheathingParams({ ...sheathingParams, thickness: val });
                  }
                }}
                className="w-full text-xs font-mono font-bold text-[#1A2E3B] outline-none"
              />
              <span className="text-[10px] text-[#8C9BAE]">мм</span>
            </div>
          </div>

          <div>
            <span className="text-[10px] text-[#5A6778] block mb-1">Матеріал обшивки</span>
            <select
              value={sheathingParams?.material ?? "plywood_birch"}
              onChange={e => {
                const mat = e.target.value as any;
                const found = PLYWOOD_MATERIALS.find(m => m.id === mat);
                if (onChangeSheathingParams && sheathingParams) {
                  onChangeSheathingParams({
                    ...sheathingParams,
                    material: mat,
                    density: found ? found.density : sheathingParams.density,
                    finish: mat === "fabric_roll" ? "fabric" : sheathingParams.finish
                  });
                }
              }}
              className="w-full py-1.5 px-2 text-xs font-semibold rounded-xl bg-white border border-[#E4DED3] text-[#1A2E3B] outline-none cursor-pointer"
            >
              {PLYWOOD_MATERIALS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sub-controls when Fabric Roll is selected */}
          {sheathingParams?.material === "fabric_roll" && (
            <div className="p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] flex flex-col gap-2.5 col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#92400E] flex items-center gap-1.5">
                  🎪 <span>Параметри рулону тканини (Тент):</span>
                </span>
                <span className="text-[10px] font-mono font-bold text-[#B45309]">
                  500–2000 мм
                </span>
              </div>

              {/* 1. Roll Width: 500 - 2000 mm */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#92400E] font-medium">Ширина рулону:</span>
                  <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-[#FDE68A]">
                    <input
                      type="number"
                      min={500}
                      max={2000}
                      step={50}
                      value={sheathingParams.fabricRollWidthMm || 1500}
                      onChange={e => {
                        const val = Math.max(500, Math.min(2000, Number(e.target.value)));
                        if (onChangeSheathingParams) {
                          onChangeSheathingParams({ ...sheathingParams, fabricRollWidthMm: val });
                        }
                      }}
                      className="w-12 text-xs font-mono font-bold text-center text-[#92400E] outline-none"
                    />
                    <span className="text-[10px] font-mono text-[#B45309]">мм</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={500}
                  max={2000}
                  step={50}
                  value={sheathingParams.fabricRollWidthMm || 1500}
                  onChange={e => {
                    if (onChangeSheathingParams) {
                      onChangeSheathingParams({ ...sheathingParams, fabricRollWidthMm: Number(e.target.value) });
                    }
                  }}
                  className="w-full accent-[#D97706] cursor-pointer"
                />
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  {[500, 800, 1000, 1200, 1500, 1800, 2000].map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => {
                        if (onChangeSheathingParams) {
                          onChangeSheathingParams({ ...sheathingParams, fabricRollWidthMm: w });
                        }
                      }}
                      className={`px-1.5 py-0.2 text-[9px] font-mono rounded cursor-pointer ${
                        (sheathingParams.fabricRollWidthMm || 1500) === w
                          ? "bg-[#D97706] text-white font-bold"
                          : "bg-white text-[#92400E] border border-[#FDE68A] hover:bg-[#FEF3C7]"
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Seam Allowance: 10 - 60 mm */}
              <div className="flex flex-col gap-1 pt-1.5 border-t border-[#FDE68A]">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#991B1B] font-medium">Зазор на прошив ниткою (шов):</span>
                  <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-[#FECACA]">
                    <input
                      type="number"
                      min={10}
                      max={60}
                      step={5}
                      value={sheathingParams.seamAllowanceMm || 25}
                      onChange={e => {
                        const val = Math.max(10, Math.min(60, Number(e.target.value)));
                        if (onChangeSheathingParams) {
                          onChangeSheathingParams({ ...sheathingParams, seamAllowanceMm: val });
                        }
                      }}
                      className="w-10 text-xs font-mono font-bold text-center text-[#991B1B] outline-none"
                    />
                    <span className="text-[10px] font-mono text-[#991B1B]">мм</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={10}
                  max={60}
                  step={5}
                  value={sheathingParams.seamAllowanceMm || 25}
                  onChange={e => {
                    if (onChangeSheathingParams) {
                      onChangeSheathingParams({ ...sheathingParams, seamAllowanceMm: Number(e.target.value) });
                    }
                  }}
                  className="w-full accent-[#DC2626] cursor-pointer"
                />
              </div>

              {/* 3. Base Hem Allowance */}
              <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[#FDE68A]">
                <span className="text-[#92400E] font-medium">Підгин краю фундаменту:</span>
                <div className="flex items-center gap-1">
                  {[100, 150, 200, 250].map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        if (onChangeSheathingParams) {
                          onChangeSheathingParams({ ...sheathingParams, hemBaseAllowanceMm: h });
                        }
                      }}
                      className={`px-1.5 py-0.5 text-[9px] font-mono rounded cursor-pointer ${
                        (sheathingParams.hemBaseAllowanceMm || 150) === h
                          ? "bg-[#D97706] text-white font-bold"
                          : "bg-white text-[#92400E] border border-[#FDE68A] hover:bg-[#FEF3C7]"
                      }`}
                    >
                      {h} мм
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Solar Orientation Analysis & BIPV Highlighting (Розрахунок орієнтації граней відносно сонця та сонячні панелі BIPV) */}
      <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold tracking-wide text-[#5A6778] flex items-center gap-1.5 uppercase">
            <Sun className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>Орієнтація сонця та BIPV</span>
          </label>
          {solarAnalysis && (
            <span className="text-[11px] font-mono font-bold text-[#EA580C] bg-[#FFF7ED] px-2 py-0.5 rounded-md border border-[#FDBA74]">
              Макс. ККД: {solarAnalysis.maxEfficiencyPct}%
            </span>
          )}
        </div>

        {/* 1. Heatmap Mode Switch & Summary */}
        <div className="p-3 rounded-xl bg-white border border-[#E4DED3] flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#7C3AED]" />
              <div>
                <span className="text-xs font-bold text-[#1A2E3B] block">3D Heatmap сонячної інсоляції</span>
                <span className="text-[10px] text-[#5A6778]">Підсвічування граней за рівнем річної генерації</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (onChangeSolarParams) {
                  onChangeSolarParams({ heatmapEnabled: !solarParams.heatmapEnabled });
                }
              }}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer border ${
                solarParams.heatmapEnabled
                  ? "bg-[#EA580C] text-white border-[#C2410C] shadow-2xs"
                  : "bg-[#FAF7F2] text-[#5A6778] border-[#E8E2D8] hover:bg-[#F0EBE1]"
              }`}
            >
              {solarParams.heatmapEnabled ? "УВІМКНЕНО" : "ВИМКНЕНО"}
            </button>
          </div>

          {/* Color Scale Legend */}
          <div className="grid grid-cols-5 gap-1 pt-1 border-t border-[#F5F1E9] text-[9px] text-center font-bold">
            <div className="py-1 px-0.5 rounded bg-[#EA580C] text-white">🔥 ≥92%</div>
            <div className="py-1 px-0.5 rounded bg-[#F59E0B] text-white">☀️ 85-91%</div>
            <div className="py-1 px-0.5 rounded bg-[#EAB308] text-white">⚡ 75-84%</div>
            <div className="py-1 px-0.5 rounded bg-[#84CC16] text-white">🌿 65-74%</div>
            <div className="py-1 px-0.5 rounded bg-[#475569] text-white">❄️ &lt;65%</div>
          </div>
        </div>

        {/* 2. Compass Azimuth Orientation (Орієнтація купола за компасом) */}
        <div className="p-3 rounded-xl bg-white border border-[#E4DED3] flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>Азимут орієнтації купола:</span>
            </span>
            <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-lg bg-[#FAF7F2] border border-[#E8E2D8] text-[#0284C7]">
              {solarParams.domeOrientationDeg ?? 0}° ({getCardinalDirection(solarParams.domeOrientationDeg ?? 0).name})
            </span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={360}
              step={5}
              value={solarParams.domeOrientationDeg ?? 0}
              onChange={e => {
                const val = parseFloat(e.target.value) || 0;
                if (onChangeSolarParams) {
                  onChangeSolarParams({ domeOrientationDeg: val });
                }
              }}
              className="w-full h-2 rounded-lg bg-[#E8E2D8] accent-[#0284C7] cursor-pointer"
            />
            <span className="text-xs font-mono font-bold text-[#1A2E3B] w-12 text-right shrink-0">
              {solarParams.domeOrientationDeg ?? 0}°
            </span>
          </div>

          {/* Compass Presets */}
          <div className="flex flex-wrap items-center justify-between gap-1 pt-1 border-t border-[#F5F1E9] text-[10px]">
            <span className="text-[#8C9BAE]">Поворот купола:</span>
            <div className="flex flex-wrap items-center gap-1">
              {[
                { deg: 0, label: "0° (Пн)" },
                { deg: 90, label: "90° (Сх)" },
                { deg: 180, label: "180° (Пд)" },
                { deg: 270, label: "270° (Зх)" }
              ].map(item => (
                <button
                  key={item.deg}
                  type="button"
                  onClick={() => onChangeSolarParams && onChangeSolarParams({ domeOrientationDeg: item.deg })}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-all cursor-pointer ${
                    (solarParams.domeOrientationDeg ?? 0) === item.deg
                      ? "bg-[#0284C7] text-white font-bold shadow-2xs"
                      : "bg-[#FAF7F2] text-[#5A6778] hover:bg-[#EFE8DD] border border-[#E8E2D8]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Site Latitude Preset (Широта місця встановлення) */}
        <div className="p-3 rounded-xl bg-white border border-[#E4DED3] flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#5B9279]" />
              <span>Широта встановлення (Україна):</span>
            </span>
            <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-lg bg-[#FAF7F2] border border-[#E8E2D8] text-[#5B9279]">
              {(solarParams.latitudeDeg ?? 49.0).toFixed(1)}° N
            </span>
          </div>

          {/* City Presets */}
          <div className="grid grid-cols-5 gap-1 text-[10px] text-center font-semibold">
            {[
              { name: "Київ", lat: 50.5 },
              { name: "Львів", lat: 49.8 },
              { name: "Одеса", lat: 46.5 },
              { name: "Харків", lat: 50.0 },
              { name: "Дніпро", lat: 48.5 }
            ].map(city => (
              <button
                key={city.name}
                type="button"
                onClick={() => onChangeSolarParams && onChangeSolarParams({ latitudeDeg: city.lat })}
                className={`py-1 px-0.5 rounded transition-all cursor-pointer border ${
                  Math.abs((solarParams.latitudeDeg ?? 49.0) - city.lat) < 0.2
                    ? "bg-[#E1EDE3] text-[#1A3E26] border-[#A6C7AE] font-bold shadow-2xs"
                    : "bg-[#FAF7F2] text-[#5A6778] border-[#E8E2D8] hover:bg-[#EFE8DD]"
                }`}
              >
                {city.name}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Automated 1-Click BIPV Triangle Selection Buttons */}
        {solarAnalysis && (
          <div className="p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#92400E] flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-[#D97706]" />
                <span>Авто-вибір ефективних трикутників:</span>
              </span>
              <span className="text-[10px] font-mono font-bold text-[#B45309]">
                {solarFaceIds.length} обрано
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onSetSolarFaceIds && onSetSolarFaceIds(solarAnalysis.optimalFaceIds)}
                className="w-full py-1.5 px-2 rounded-xl text-left bg-white hover:bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-xs font-bold transition-all cursor-pointer flex items-center justify-between shadow-2xs"
                title="Автоматично обрати всі трикутники з ефективністю 85% і більше"
              >
                <span className="flex items-center gap-1.5">
                  <span>🔥 Оптимальні (≥85%)</span>
                </span>
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#B45309]">
                  {solarAnalysis.optimalFaceIds.length} шт
                </span>
              </button>

              <button
                type="button"
                onClick={() => onSetSolarFaceIds && onSetSolarFaceIds(solarAnalysis.highEfficiencyFaceIds)}
                className="w-full py-1.5 px-2 rounded-xl text-left bg-white hover:bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-xs font-bold transition-all cursor-pointer flex items-center justify-between shadow-2xs"
                title="Автоматично обрати всі трикутники з ефективністю 75% і більше"
              >
                <span className="flex items-center gap-1.5">
                  <span>☀️ Високі (≥75%)</span>
                </span>
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#B45309]">
                  {solarAnalysis.highEfficiencyFaceIds.length} шт
                </span>
              </button>

              <button
                type="button"
                onClick={() => onSetSolarFaceIds && onSetSolarFaceIds(solarAnalysis.southFacingFaceIds)}
                className="w-full py-1.5 px-2 rounded-xl text-left bg-white hover:bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-xs font-bold transition-all cursor-pointer flex items-center justify-between shadow-2xs"
                title="Обрати весь південний схил купола"
              >
                <span className="flex items-center gap-1.5">
                  <span>🧭 Південний сектор</span>
                </span>
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#B45309]">
                  {solarAnalysis.southFacingFaceIds.length} шт
                </span>
              </button>

              <button
                type="button"
                onClick={() => onSetSolarFaceIds && onSetSolarFaceIds(solarAnalysis.sortedByEfficiency.slice(0, 12))}
                className="w-full py-1.5 px-2 rounded-xl text-left bg-white hover:bg-[#FEF3C7] border border-[#FDE68A] text-[#92400E] text-xs font-bold transition-all cursor-pointer flex items-center justify-between shadow-2xs"
                title="Обрати топ-12 найбільш освітлених трикутників"
              >
                <span className="flex items-center gap-1.5">
                  <span>⭐ Топ-12 панелей</span>
                </span>
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#FEF3C7] text-[#B45309]">
                  12 шт
                </span>
              </button>
            </div>

            {/* Quick Count Selector & Clear */}
            <div className="flex flex-wrap items-center justify-between gap-1 pt-1.5 border-t border-[#FDE68A]/60 text-[10px]">
              <div className="flex items-center gap-1">
                <span className="text-[#92400E] font-medium">Топ:</span>
                {[6, 12, 18, 24].map(count => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => onSetSolarFaceIds && onSetSolarFaceIds(solarAnalysis.sortedByEfficiency.slice(0, count))}
                    className="px-1.5 py-0.5 rounded bg-white hover:bg-[#FDF6B2] border border-[#FDE68A] text-[#92400E] font-mono cursor-pointer"
                  >
                    {count}
                  </button>
                ))}
              </div>

              {solarFaceIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onSetSolarFaceIds && onSetSolarFaceIds([])}
                  className="px-2 py-0.5 text-[10px] font-bold text-red-600 bg-white hover:bg-red-50 border border-red-200 rounded-md cursor-pointer"
                >
                  Очистити вибір
                </button>
              )}
            </div>
          </div>
        )}

        {/* 5. Production & Economic Generation Statistics Card */}
        {solarAnalysis && (
          <div className="p-3 rounded-xl bg-[#EDE9FE]/70 border border-[#DDD6FE] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#5B21B6] flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-[#7C3AED]" />
                <span>Генерація обраних BIPV панелей:</span>
              </span>
              <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded-md text-[#6D28D9] border border-[#DDD6FE]">
                ККД {solarAnalysis.selectedStats.averageEfficiencyPct}%
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded-xl bg-white border border-[#DDD6FE]">
                <span className="text-[10px] text-[#6D28D9] block">Пікова потужність</span>
                <span className="font-mono font-bold text-xs text-[#5B21B6]">
                  {(solarAnalysis.selectedStats.totalPeakPowerWatts / 1000).toFixed(2)} кВт
                </span>
                <span className="text-[9px] text-[#8C9BAE] block">
                  {solarAnalysis.selectedStats.totalPeakPowerWatts} Вт
                </span>
              </div>

              <div className="p-2 rounded-xl bg-white border border-[#DDD6FE]">
                <span className="text-[10px] text-[#6D28D9] block">Річний виробіток</span>
                <span className="font-mono font-bold text-xs text-[#7C3AED]">
                  ~{solarAnalysis.selectedStats.estimatedAnnualKWh.toLocaleString()}
                </span>
                <span className="text-[9px] text-[#8C9BAE] block">кВт·год / рік</span>
              </div>

              <div className="p-2 rounded-xl bg-white border border-[#DDD6FE]">
                <span className="text-[10px] text-[#6D28D9] block">Економія на рік</span>
                <span className="font-mono font-bold text-xs text-[#059669]">
                  ~{solarAnalysis.selectedStats.estimatedAnnualSavingsUah.toLocaleString()}
                </span>
                <span className="text-[9px] text-[#8C9BAE] block">грн / рік</span>
              </div>

              <div className="p-2 rounded-xl bg-white border border-[#DDD6FE]">
                <span className="text-[10px] text-[#6D28D9] block">Зменшення CO₂</span>
                <span className="font-mono font-bold text-xs text-[#047857]">
                  ~{solarAnalysis.selectedStats.co2OffsetKgPerYear}
                </span>
                <span className="text-[9px] text-[#8C9BAE] block">кг CO₂ / рік</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
