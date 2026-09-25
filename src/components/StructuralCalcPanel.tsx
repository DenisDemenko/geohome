import React from "react";
import { DomeModel, ConnectorParams } from "../core/types";
import { calculateBeamMiterAngles } from "../core/beams";
import {
  Weight,
  Hammer,
  Wind,
  CloudSnow,
  CheckCircle,
  AlertTriangle,
  Ruler,
  TrendingDown,
  Disc
} from "lucide-react";

interface StructuralCalcPanelProps {
  model: DomeModel;
  connectorParams?: ConnectorParams;
  onChangeConnectorParams?: (params: ConnectorParams) => void;
}

export const StructuralCalcPanel: React.FC<StructuralCalcPanelProps> = ({
  model,
  connectorParams,
  onChangeConnectorParams
}) => {
  const sa = model.structuralAnalysis;
  const groups = model.beamGroups;
  const activeParams = connectorParams || model.connectorParams;
  const hubDiam = activeParams.hubDiameter || 140;
  const hubRadius = hubDiam / 2;

  return (
    <div className="flex flex-col gap-5 p-6 rounded-3xl tactile-card">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#FDF0E6] text-[#DE7C5A]">
            <Hammer className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#1A2E3B]">Розрахунок міцності та товщини балок</h2>
            <p className="text-xs text-[#5A6778]">
              Єврокод 5 / ДБН В.1.2-2:2006 (Сніг + Вітер + Власна вага)
            </p>
          </div>
        </div>

        {/* Safety Indicator Badge */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${
            sa.isStructurallySafe
              ? "bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE]"
              : "bg-[#FCE8DC] text-[#9A3412] border border-[#F8C8AF]"
          }`}
        >
          {sa.isStructurallySafe ? (
            <>
              <CheckCircle className="w-4 h-4 text-[#2E7D32]" />
              <span>Переріз надійний</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-[#C2410C]" />
              <span>Потрібне потовщення</span>
            </>
          )}
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl tactile-inset-subtle border border-white/60">
          <span className="text-[11px] text-[#5A6778] block mb-1">Загальна вага купола</span>
          <span className="text-base font-mono font-bold text-[#1A2E3B]">{sa.totalDomeWeightKg} кг</span>
          <span className="text-[10px] text-[#8C9BAE] block mt-0.5">каркас + обшивка</span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-inset-subtle border border-white/60">
          <span className="text-[11px] text-[#5A6778] block mb-1">Погонних метрів</span>
          <span className="text-base font-mono font-bold text-[#1A2E3B]">{sa.totalLinearMeters} м</span>
          <span className="text-[10px] text-[#8C9BAE] block mt-0.5">{sa.strutCount} балок всього</span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-inset-subtle border border-white/60">
          <span className="text-[11px] text-[#5A6778] block mb-1">Об'єм пиломатеріалу</span>
          <span className="text-base font-mono font-bold text-[#1A2E3B]">{sa.totalWoodVolumeM3} м³</span>
          <span className="text-[10px] text-[#8C9BAE] block mt-0.5">чистий об'єм</span>
        </div>

        <div className="p-3.5 rounded-2xl tactile-inset-subtle border border-white/60">
          <span className="text-[11px] text-[#5A6778] block mb-1">Макс. довжина прольоту</span>
          <span className="text-base font-mono font-bold text-[#1A2E3B]">{sa.maxSpanMm} мм</span>
          <span className="text-[10px] text-[#8C9BAE] block mt-0.5">найдовша балка</span>
        </div>
      </div>

      {/* Stress & Deflection Bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Bending Stress */}
        <div className="p-4 rounded-2xl tactile-card-mint border border-white/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#1A3E26]">Напруга вигину σ_m</span>
            <span className="text-xs font-mono font-bold text-[#1A3E26]">
              {sa.actualBendingStressMpa} / {sa.allowableBendingStressMpa} МПа
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-white/70 overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                sa.bendingUtilization <= 1.0 ? "bg-[#5B9279]" : "bg-[#DE7C5A]"
              }`}
              style={{ width: `${Math.min(100, Math.round(sa.bendingUtilization * 100))}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-2 text-[11px] text-[#3D6B5D]">
            <span>Запас міцності:</span>
            <span className="font-mono font-bold">
              {sa.bendingUtilization <= 1.0
                ? `${Math.round((1 - sa.bendingUtilization) * 100)}% запасу`
                : `Перевантаження на ${Math.round((sa.bendingUtilization - 1) * 100)}%`}
            </span>
          </div>
        </div>

        {/* Deflection */}
        <div className="p-4 rounded-2xl tactile-card-sky border border-white/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#1A2E3B]">Прогин під навантаженням f</span>
            <span className="text-xs font-mono font-bold text-[#1A2E3B]">
              {sa.actualDeflectionMm} / {sa.allowableDeflectionMm} мм (L/250)
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-white/70 overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                sa.deflectionUtilization <= 1.0 ? "bg-[#4A7C9B]" : "bg-[#DE7C5A]"
              }`}
              style={{ width: `${Math.min(100, Math.round(sa.deflectionUtilization * 100))}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-2 text-[11px] text-[#4A5568]">
            <span>Рекомендована висота бруса:</span>
            <span className="font-mono font-bold text-[#1A2E3B]">
              h ≥ {sa.recommendedMinDepthMm} мм
            </span>
          </div>
        </div>
      </div>

      {/* Beam Types Specification Table */}
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 gap-3">
          <div>
            <h3 className="text-xs font-bold tracking-wide text-[#1A2E3B] uppercase">
              Специфікація розкрою балок ({groups.length} типів)
            </h3>
            <p className="text-[11px] text-[#5A6778] mt-0.5">
              Теоретична довжина по осях та чиста довжина для торцювання з урахуванням кільця конектора
            </p>
          </div>

          {/* User Input: Connector Ring Size / Strut Trim Offset */}
          {onChangeConnectorParams && (
            <div className="flex items-center gap-2 p-1.5 px-3 rounded-2xl bg-white/80 border border-[#A6C7AE] shadow-2xs">
              <Disc className="w-4 h-4 text-[#2E7D32]" />
              <span className="text-xs font-semibold text-[#1A2E3B] whitespace-nowrap">
                Кільце конектора Ø:
              </span>
              <div className="flex items-center gap-1 bg-[#FAF7F2] px-2 py-0.5 rounded-lg border border-[#DCD6CA]">
                <input
                  type="number"
                  min={20}
                  max={300}
                  step={5}
                  value={hubDiam}
                  onChange={e =>
                    onChangeConnectorParams({
                      ...activeParams,
                      hubDiameter: Number(e.target.value)
                    })
                  }
                  className="w-12 text-xs font-mono font-bold text-center text-[#1A2E3B] bg-transparent outline-none"
                  title="Змініть розмір кільця для автоматичного перерахунку обрізки всіх балок"
                />
                <span className="text-[10px] text-[#8C9BAE]">мм</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-[#2E7D32] bg-[#E1EDE3] px-2 py-0.5 rounded-md whitespace-nowrap">
                відступ -{hubRadius.toFixed(0)} мм/торец
              </span>
            </div>
          )}
        </div>

        <div className="rounded-2xl overflow-hidden tactile-inset-subtle border border-white/60">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#EAE4D9]/80 text-[#5A6778] font-bold border-b border-[#DCD6CA]">
              <tr>
                <th className="py-2.5 px-3">Тип</th>
                <th className="py-2.5 px-3">Колір</th>
                <th className="py-2.5 px-3 font-mono">L теор. (по осях)</th>
                <th className="py-2.5 px-3 font-mono text-center text-[#DE7C5A]">Обрізка під кільце</th>
                <th className="py-2.5 px-3 font-mono text-right text-[#2E7D32]">L пил. (чистий брус)</th>
                <th className="py-2.5 px-3 text-center">Кількість</th>
                <th className="py-2.5 px-3 font-mono text-center">Торцевий зпил</th>
                <th className="py-2.5 px-3 font-mono text-right">Сумарно (м)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4DED3]">
              {groups.map(g => {
                const sampleEdge = model.edges.find(e => e.type === g.type);
                const miter = sampleEdge ? calculateBeamMiterAngles(sampleEdge, model.nodes) : null;
                const netCutLen = Math.max(10, Math.round(g.length - hubDiam));
                const totalM = Math.round(((netCutLen * g.count) / 1000) * 10) / 10;

                return (
                  <tr key={g.type} className="hover:bg-white/50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-[#1A2E3B]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>Балка {g.type}</span>
                        {g.isBaseBeam && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE]">
                            Основа Z=0
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-3.5 h-3.5 rounded-md shadow-xs"
                          style={{ backgroundColor: g.color }}
                        />
                        <span className="font-mono text-[11px] text-[#5A6778]">{g.color}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#5A6778]">
                      {g.length} мм
                    </td>
                    <td className="py-2.5 px-3 font-mono text-center text-[#DE7C5A]">
                      -2 × {hubRadius.toFixed(0)} мм
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-right text-[#2E7D32] bg-[#E1EDE3]/40">
                      {netCutLen} мм
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-[#1A2E3B]">
                      {g.count} шт
                    </td>
                    <td className="py-2.5 px-3 font-mono text-center text-[#5A6778]">
                      {miter ? `${miter.startMiterDeg}°` : "15.0°"}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-bold text-[#1A2E3B]">
                      {totalM} м
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
