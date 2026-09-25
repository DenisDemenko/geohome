import React, { useState, useMemo } from "react";
import { DomeModel, NodeId, ConnectorParams, ConnectorTypeSummary } from "../core/types";
import {
  calculateConnector,
  classifyConnectorTypes,
  DEFAULT_CONNECTOR_PARAMS
} from "../core/connectors";
import { generateConnectorSVG, downloadFile } from "../export/svgExport";
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
  Maximize2
} from "lucide-react";

interface ConnectorCutPanelProps {
  model: DomeModel;
  selectedNodeId: NodeId | null;
  onSelectNode: (id: NodeId) => void;
  connectorParams: ConnectorParams;
  onChangeConnectorParams: (params: ConnectorParams) => void;
}

export const ConnectorCutPanel: React.FC<ConnectorCutPanelProps> = ({
  model,
  selectedNodeId,
  onSelectNode,
  connectorParams,
  onChangeConnectorParams
}) => {
  // Classify all unique connector bracket types in this dome
  const connectorTypes = useMemo(() => {
    return classifyConnectorTypes(model, connectorParams);
  }, [model, connectorParams]);

  // Total count of connector brackets in the whole dome
  const totalConnectorsCount = useMemo(() => {
    return connectorTypes.reduce((sum, t) => sum + t.countInDome, 0);
  }, [connectorTypes]);

  // View mode: "all" (gallery of all types in dome) or "single" (detailed inspector)
  const [viewMode, setViewMode] = useState<"all" | "single">("all");

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

  // Pre-generate SVG drawings for all connector types with stamped piece count
  const typeSvgs = useMemo(() => {
    const map = new Map<string, string>();
    connectorTypes.forEach(t => {
      const conn = calculateConnector(model, t.sampleNodeId);
      const svg = generateConnectorSVG(
        conn,
        { ...model, connectorParams },
        {
          countInDome: t.countInDome,
          typeName: t.name
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
    const nameClean = t.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadFile(
      `connector_${nameClean}_${t.countInDome}pcs.svg`,
      svg
    );
  };

  // Download all connector types package
  const handleDownloadAllTypes = () => {
    connectorTypes.forEach(t => {
      const svg = typeSvgs.get(t.typeId);
      if (svg) {
        const nameClean = t.name.replace(/[^a-zA-Z0-9_-]/g, "_");
        downloadFile(`connector_${nameClean}_${t.countInDome}pcs.svg`, svg);
      }
    });
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
            </div>
            <p className="text-xs text-[#5A6778] mt-0.5">
              Векторні креслення 2D для лазерної порізки ЧПК із зазначенням тиражу на кожному кресленні, кутів розгортки та згину на листогибі
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* View mode toggle: All types vs Single */}
          <div className="flex items-center p-1 rounded-xl tactile-inset bg-white/60">
            <button
              onClick={() => setViewMode("all")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
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
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                viewMode === "single"
                  ? "bg-[#FAF7F2] text-[#1A2E3B] shadow-xs border border-white"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Окремий вид</span>
            </button>
          </div>

          <button
            onClick={handleDownloadAllTypes}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold tactile-btn-mint whitespace-nowrap"
            title="Завантажити креслення для всіх унікальних типів пластин"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Експорт усіх креслень ({totalConnectorsCount} шт)</span>
          </button>
        </div>
      </div>

      {/* Interactive Sizing Sliders [20 mm - 300 mm] */}
      <div className="p-4 rounded-3xl tactile-inset-subtle border border-white/80 bg-white/40">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#5B9279]" />
            <h3 className="text-xs font-bold text-[#1A2E3B] uppercase tracking-wider">
              Параметри пластини (Регулювання 20 мм - 300 мм)
            </h3>
          </div>
          <span className="text-[11px] font-mono font-bold text-[#5B9279] bg-white px-2 py-0.5 rounded-md border border-[#DCD6CA]">
            Сердцевина: {connectorParams.hubDiameter} мм · Луч: {connectorParams.tabLength} мм
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Core Diameter [20 - 300 mm] */}
          <div className="p-3 rounded-2xl bg-white/70 border border-[#E8E2D8]">
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="font-semibold text-[#5A6778]">Сердцевина (діаметр)</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={20}
                  max={300}
                  step={5}
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
              min={20}
              max={300}
              step={5}
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
              <span>20 мм</span>
              <span>140 мм</span>
              <span>300 мм</span>
            </div>
          </div>

          {/* Ray Length [20 - 300 mm] */}
          <div className="p-3 rounded-2xl bg-white/70 border border-[#E8E2D8]">
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="font-semibold text-[#5A6778]">Довжина луча</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={20}
                  max={300}
                  step={5}
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
              min={20}
              max={300}
              step={5}
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
              <span>20 мм</span>
              <span>95 мм</span>
              <span>300 мм</span>
            </div>
          </div>

          {/* Ray Width [20 - 150 mm] */}
          <div className="p-3 rounded-2xl bg-white/70 border border-[#E8E2D8]">
            <div className="flex items-center justify-between mb-1 text-xs">
              <span className="font-semibold text-[#5A6778]">Ширина луча</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={20}
                  max={150}
                  step={5}
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
              min={20}
              max={150}
              step={5}
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
              <span>20 мм</span>
              <span>45 мм</span>
              <span>150 мм</span>
            </div>
          </div>

          {/* Thickness & Fasteners */}
          <div className="p-3 rounded-2xl bg-white/70 border border-[#E8E2D8] flex flex-col justify-between">
            <div className="grid grid-cols-2 gap-2 text-xs">
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
                  <option value={3.0}>3.0 мм</option>
                  <option value={4.0}>4.0 мм</option>
                  <option value={5.0}>5.0 мм</option>
                  <option value={6.0}>6.0 мм</option>
                  <option value={8.0}>8.0 мм</option>
                </select>
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
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#5A6778] uppercase tracking-wider">
              Креслення для кожного виду пластин ({connectorTypes.length} унікальних видів):
            </span>
            <span className="text-xs text-[#5A6778]">
              На кожному кресленні вказано точну кількість штук на весь купол
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {connectorTypes.map(t => {
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
                        {t.isBoundary && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#E1EDE3] text-[#1A3E26]">
                            Основа Z=0
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#5A6778] mt-0.5">
                        Променів: <b>{t.rayCount}</b> · Склад балок:{" "}
                        <span className="font-mono text-[#2E7D32] font-semibold">
                          {t.beamSignature}
                        </span>
                      </p>
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
                      </div>

                      <button
                        onClick={() => handleDownloadTypeSvg(t)}
                        className="p-2 rounded-xl tactile-btn text-[#5A6778] hover:text-[#1A2E3B]"
                        title={`Завантажити креслення SVG (${t.countInDome} шт)`}
                      >
                        <Download className="w-4 h-4 text-[#5B9279]" />
                      </button>
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
                      <span className="text-[11px] text-[#8C9BAE]">
                        Зразок вузла: #{t.sampleNodeId}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedTypeId(t.typeId);
                          onSelectNode(t.sampleNodeId);
                          setViewMode("single");
                        }}
                        className="text-xs font-semibold text-[#5B9279] hover:underline"
                      >
                        Відкрити детально →
                      </button>
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
          {/* Sub-selector chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs font-semibold text-[#5A6778] shrink-0">Оберіть вид:</span>
            {connectorTypes.map(t => (
              <button
                key={t.typeId}
                onClick={() => {
                  setSelectedTypeId(t.typeId);
                  onSelectNode(t.sampleNodeId);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all shrink-0 flex items-center gap-1.5 ${
                  selectedTypeId === t.typeId
                    ? "bg-[#FAF7F2] text-[#1A2E3B] border border-[#5B9279] shadow-xs"
                    : "tactile-btn text-[#5A6778]"
                }`}
              >
                <span>{t.name}</span>
                <span className="font-mono text-[#2E7D32]">({t.countInDome} шт)</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Large SVG Canvas */}
            <div className="lg:col-span-7 flex flex-col items-center justify-center p-6 rounded-3xl tactile-inset min-h-[480px] relative border border-white/60 bg-[#FAF7F2]">
              <div
                className="w-full max-w-[500px] max-h-[460px] flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: typeSvgs.get(activeType.typeId) || "" }}
              />

              {/* Large floating quantity stamp */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <span className="text-sm font-mono font-black px-3.5 py-1 rounded-xl bg-[#E1EDE3] text-[#1A3E26] shadow-xs border border-[#A6C7AE]">
                  ТИРАЖ: {activeType.countInDome} ШТ.
                </span>
              </div>

              <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[11px] text-[#8C9BAE] font-mono bg-white/80 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-white/80">
                <span>
                  Сердцевина: <b>{connectorParams.hubDiameter} мм</b> · Луч: <b>{connectorParams.tabLength} мм</b>
                </span>
                <span>Масштаб 1:1 ЧПК</span>
              </div>
            </div>

            {/* Right: Angular Table & Fabrication Instructions */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="p-5 rounded-3xl tactile-card border border-white/80">
                <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8] mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#1A2E3B]">{activeType.name}</h3>
                    <p className="text-[11px] text-[#5A6778]">
                      Кількість на купол: <b className="text-[#2E7D32]">{activeType.countInDome} шт</b>
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownloadTypeSvg(activeType)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold tactile-btn-mint"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>SVG ({activeType.countInDome} шт)</span>
                  </button>
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

                <div className="mt-4 p-3 rounded-2xl bg-[#E1EDE3]/50 border border-[#A6C7AE]/60 text-xs text-[#1A3E26]">
                  <b>Вказівка для виробництва:</b>
                  <p className="text-[11px] text-[#3D6B5D] mt-1">
                    Вирізати <b>{activeType.countInDome} штук</b> даної пластини зі сталі товщиною {connectorParams.thickness} мм. Отвори під болти Ø{connectorParams.boltDiameter} мм. Відігнути кожен луч на вказаний кут згину δ.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
