import React from "react";
import {
  DomeParameters,
  Frequency,
  DomeCutType,
  BeamProfile,
  ConnectorParams
} from "../core/types";
import { DEFAULT_BEAM_PROFILES } from "../core/beams";
import {
  Sliders,
  ShieldCheck,
  CheckCircle2,
  Lock,
  Unlock,
  Settings2,
  CheckSquare,
  Square,
  Landmark
} from "lucide-react";

interface ParamControlsProps {
  params: DomeParameters;
  onChangeParams: (newParams: DomeParameters) => void;
  beamProfile: BeamProfile;
  onChangeProfile: (profile: BeamProfile) => void;
  connectorParams: ConnectorParams;
  onChangeConnectorParams: (params: ConnectorParams) => void;
  approved: boolean;
  geometryVersion?: string;
  onApprove: () => void;
  onRevoke: () => void;
  autoScaleConnectors?: boolean;
  onToggleAutoScaleConnectors?: (active: boolean) => void;
  onResetToProportional?: () => void;
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
  autoScaleConnectors = true,
  onToggleAutoScaleConnectors,
  onResetToProportional
}) => {
  const frequencies: Frequency[] = [1, 2, 3, 4, 5, 6];
  const cutOptions: { id: DomeCutType; label: string; desc: string }[] = [
    { id: "1/2", label: "1/2", desc: "Півсфера (класика)" },
    { id: "3/8", label: "3/8", desc: "Низький купол" },
    { id: "5/8", label: "5/8", desc: "Високий купол" },
    { id: "7/12", label: "7/12", desc: "Оптимальна стіна" }
  ];

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

      {/* Beam Cross-Section / Profile */}
      <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60">
        <label className="text-xs font-bold tracking-wide text-[#5A6778] mb-2 block uppercase">
          Переріз та матеріал балок
        </label>
        <select
          value={beamProfile.name}
          onChange={e => {
            const found = DEFAULT_BEAM_PROFILES.find(p => p.name === e.target.value);
            if (found) onChangeProfile(found);
          }}
          className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-[#FAF7F2] border border-[#DCD6CA] text-[#2D3748] focus:outline-none focus:ring-2 focus:ring-[#5B9279]/30"
        >
          {DEFAULT_BEAM_PROFILES.map(p => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Custom Width and Depth Quick Inputs */}
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <span className="text-[11px] text-[#5A6778] block mb-1">Ширина балки b</span>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-[#E4DED3]">
              <input
                type="number"
                min={30}
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
                min={40}
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

      {/* Connector Sizing - Thunder Domes Star Bracket */}
      <div className="p-4 rounded-2xl tactile-inset-subtle border border-white/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold tracking-wide text-[#5A6778] uppercase">
              Конектори (Пластини-зірки)
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
    </div>
  );
};
