import React, { useState, useMemo } from "react";
import { DomeModel, DomeParameters } from "../core/types";
import {
  calculateInsulationMetrics,
  INSULATION_MATERIALS,
  InsulationMaterial,
  InsulationMaterialId,
  InsulationParams,
  DEFAULT_INSULATION_PARAMS
} from "../core/insulation";
import { INNER_SHEATHING_MATERIALS } from "../core/conversions";
import {
  ShieldAlert,
  ShieldCheck,
  Thermometer,
  Layers,
  Flame,
  Volume2,
  Leaf,
  Clock,
  Sparkles,
  Info,
  Check,
  AlertTriangle,
  Download,
  Printer,
  Copy,
  ChevronRight,
  Sliders,
  DollarSign,
  Maximize2,
  CheckCircle2,
  Package,
  Scale,
  Zap,
  TrendingDown,
  Building
} from "lucide-react";

interface InsulationCalculatorPanelProps {
  model: DomeModel;
  params?: DomeParameters;
  onChangeParams?: (newParams: DomeParameters) => void;
  innerSheathingMaterialId?: string;
  onNavigateTo3D?: () => void;
}

export const InsulationCalculatorPanel: React.FC<InsulationCalculatorPanelProps> = ({
  model,
  params,
  onChangeParams,
  innerSheathingMaterialId = "drywall",
  onNavigateTo3D
}) => {
  const currentParams = params || model.parameters;
  const beamDepth = model.beamProfile?.depth || 150;

  // Local or persisted insulation parameters
  const [insulationParams, setInsulationParams] = useState<InsulationParams>(() => {
    return (
      currentParams.insulation || {
        ...DEFAULT_INSULATION_PARAMS,
        thicknessMm: beamDepth
      }
    );
  });

  const [selectedInnerMatId, setSelectedInnerMatId] = useState<string>(innerSheathingMaterialId);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"overview" | "comparison" | "cutting" | "sandwich">("overview");

  // Calculate full metrics based on current parameters
  const metrics = useMemo(() => {
    return calculateInsulationMetrics(model, insulationParams, selectedInnerMatId);
  }, [model, insulationParams, selectedInnerMatId]);

  const updateInsulation = (partial: Partial<InsulationParams>) => {
    const updated = { ...insulationParams, ...partial };
    setInsulationParams(updated);
    if (onChangeParams) {
      onChangeParams({
        ...currentParams,
        insulation: updated
      });
    }
  };

  const handleSelectMaterial = (matId: InsulationMaterialId) => {
    updateInsulation({ materialId: matId });
  };

  const handleCopyReport = () => {
    const text = `=== РОЗРАХУНОК УТЕПЛЕННЯ ТА ТЕПЛОЄМНОСТІ ГЕОДЕЗИЧНОГО КУПОЛА ===
Купол: ${model.parameters.frequency}V · Ø ${(model.parameters.diameter / 1000).toFixed(1)} м · Висота ${(model.parameters.height / 1000).toFixed(1)} м
Утеплювач: ${metrics.material.name} (${metrics.material.shortName})
Товщина шару: ${metrics.cavityThicknessMm} мм
Площа утеплення: ${metrics.totalInsulatedAreaM2} м² (чиста площа між балками: ${metrics.netCavityAreaM2} м²)
Об'єм утеплювача (чистий): ${metrics.netInsulationVolumeM3} м³
Об'єм із запасом (+${insulationParams.wastePercentage}%): ${metrics.orderVolumeM3} м³ (${metrics.standardPacksNeeded} упаковок)
Розрахункова маса: ${metrics.insulationMassKg} кг

--- ТЕПЛОТЕХНІЧНІ ПОКАЗНИКИ ---
Теплопровідність λ: ${metrics.material.thermalConductivityLambda} Вт/(м·К)
Тепловий опір утеплювача R_ins: ${metrics.rValueInsulation} м²·К/Вт
Повний опір конструкції R_total: ${metrics.rValueTotalEnvelope} м²·К/Вт
Норматив ДБН В.2.6-31:2021: ${metrics.dbnRequiredR} м²·К/Вт (${metrics.dbnCompliant ? "ВІДПОВІДАЄ" : "НЕ ВІДПОВІДАЄ, потрібно мін. " + metrics.reqThicknessForDbnMm + " мм"})
Коефіцієнт теплопередачі U: ${metrics.uValueEnvelope} Вт/(м²·К)

--- ТЕПЛОЄМНІСТЬ ТА ТЕПЛОВА ІНЕРЦІЯ ---
Питома теплоємність: ${metrics.material.specificHeatCapacity} Дж/(кг·К)
Об'ємна теплоємність: ${metrics.material.volumetricHeatCapacityKJ} кДж/(м³·К)
Теплоємність утеплювача: ${metrics.heatCapacityInsulationMJ} МДж/°C
Повна теплоємність оболонки: ${metrics.totalEnvelopeHeatCapacityMJ} МДж/°C (${metrics.totalEnvelopeHeatCapacityKWh} кВт·год/°C)
Фазовий зсув температури (інерція): ${metrics.thermalPhaseShiftHours} годин
Постійна часу остигання (tau): ${metrics.coolingTimeConstantHours} годин
Розрахункові тепловтрати в мороз (-22°C): ${metrics.designHeatingLossWatts} Вт (${metrics.designHeatingLossPerM2Watts} Вт/м²)

--- ОРІЄНТОВНИЙ КОШТОРИС ---
Вартість утеплювача: ${metrics.estimatedMaterialCostUAH.toLocaleString()} грн
Вартість паро/вітрозахисних мембран: ${metrics.estimatedMembranesCostUAH.toLocaleString()} грн
Загальна вартість системи: ${metrics.totalSystemCostUAH.toLocaleString()} грн`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner & Title Card */}
      <div className="p-6 rounded-3xl tactile-card border border-[#E8E2D8] bg-white flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-[#E8E2D8]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[#FEF3C7] text-[#D97706] shadow-xs">
              <Thermometer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-[#1A2E3B]">
                  Розрахунок утеплювача та теплоємності купола
                </h2>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#E0F2FE] text-[#0284C7] border border-[#BAE6FD]">
                  Між зовнішньою та внутрішньою обшивкою
                </span>
                {metrics.dbnCompliant ? (
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    ДБН В.2.6-31 (R = {metrics.rValueTotalEnvelope} ≥ 4.0)
                  </span>
                ) : (
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#FEF2F2] text-[#DC2626] border border-[#FECACA] flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    R = {metrics.rValueTotalEnvelope} &lt; 4.0 (Реком. товщина {metrics.reqThicknessForDbnMm} мм)
                  </span>
                )}
              </div>
              <p className="text-xs text-[#5A6778] mt-0.5">
                Розрахунок об'єму, маси, теплопровідності та теплоємності при наповненні пінопластом (EPS), мінеральною ватою, XPS, деревним волокном та ековатою
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#16A34A]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Скопійовано!" : "Копіювати звіт"}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F8FAFC] transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Друк</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs within Insulation Panel */}
        <div className="flex items-center gap-1.5 p-1 bg-[#FAF7F2] rounded-2xl border border-[#E8E2D8] overflow-x-auto scrollbar-thin">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "overview"
                ? "bg-[#1A2E3B] text-white shadow-xs"
                : "text-[#5A6778] hover:text-[#1A2E3B]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Огляд та підсумок</span>
          </button>

          <button
            onClick={() => setActiveTab("sandwich")}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "sandwich"
                ? "bg-[#1A2E3B] text-white shadow-xs"
                : "text-[#5A6778] hover:text-[#1A2E3B]"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Пиріг стіни у розрізі (Шар за шаром)</span>
          </button>

          <button
            onClick={() => setActiveTab("comparison")}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "comparison"
                ? "bg-[#1A2E3B] text-white shadow-xs"
                : "text-[#5A6778] hover:text-[#1A2E3B]"
            }`}
          >
            <Thermometer className="w-3.5 h-3.5" />
            <span>Порівняння наповнювачів (Теплоємність & R)</span>
          </button>

          <button
            onClick={() => setActiveTab("cutting")}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "cutting"
                ? "bg-[#1A2E3B] text-white shadow-xs"
                : "text-[#5A6778] hover:text-[#1A2E3B]"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Розкрій трикутників та цоколя ({metrics.trianglesSpec.length + (metrics.plinthSpec ? 1 : 0)} типів)</span>
          </button>
        </div>
      </div>

      {/* QUICK MATERIAL SELECTOR CARDS */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-[#5A6778] flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#D97706]" />
            Вибір матеріалу наповнювача утеплювача
          </span>
          <span className="text-xs text-[#5A6778]">
            Активний: <strong className="text-[#1A2E3B]">{metrics.material.name}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {INSULATION_MATERIALS.map(m => {
            const isSelected = m.id === insulationParams.materialId;
            return (
              <div
                key={m.id}
                onClick={() => handleSelectMaterial(m.id)}
                className={`p-3.5 rounded-2xl cursor-pointer transition-all border flex flex-col justify-between gap-2.5 relative ${
                  isSelected
                    ? "bg-white border-[#D97706] ring-2 ring-[#D97706]/30 shadow-md"
                    : "bg-white/80 hover:bg-white border-[#E2E8F0] shadow-xs hover:border-[#CBD5E1]"
                }`}
              >
                {isSelected && (
                  <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#D97706] text-white flex items-center justify-center shadow-xs">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{m.icon}</span>
                    <span className="text-xs font-bold text-[#1A2E3B] leading-tight line-clamp-1">
                      {m.shortName}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#64748B] line-clamp-1">
                    {m.category === "mineral" ? "Мінеральна вата" : m.category === "foam" ? "Полістирол" : m.category === "organic" ? "Органіка / Еко" : "Поліізоціанурат"}
                  </span>
                </div>

                <div className="flex flex-col gap-1 pt-2 border-t border-[#F1F5F9] text-[11px]">
                  <div className="flex justify-between items-center text-[#475569]">
                    <span>λ теплопровідність:</span>
                    <strong className="text-[#0F172A]">{m.thermalConductivityLambda} Вт/м·К</strong>
                  </div>
                  <div className="flex justify-between items-center text-[#475569]">
                    <span>Питома теплоємність:</span>
                    <strong className="text-[#B45309]">{m.specificHeatCapacity} Дж/кг·К</strong>
                  </div>
                  <div className="flex justify-between items-center text-[#475569]">
                    <span>Густина:</span>
                    <strong className="text-[#334155]">{m.densityKgM3} кг/м³</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* PARAMETERS CONTROL BAR */}
      <div className="p-5 rounded-2xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#D97706]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#1A2E3B]">
              Параметри порожнини між обшивками та монтажу
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#5A6778]">Швидкі пресети товщини:</span>
            {[100, 150, 200, 250].map(th => (
              <button
                key={th}
                onClick={() => updateInsulation({ thicknessMm: th })}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  insulationParams.thicknessMm === th
                    ? "bg-[#D97706] text-white shadow-xs"
                    : "bg-white text-[#475569] hover:bg-[#F1F5F9] border border-[#CBD5E1]"
                }`}
              >
                {th} мм {th === beamDepth ? "(каркас)" : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-[#E8E2D8]">
          {/* 1. Cavity thickness */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[#334155]">Товщина утеплювача:</span>
              <strong className="text-[#D97706] font-mono">{insulationParams.thicknessMm} мм</strong>
            </div>
            <input
              type="range"
              min={50}
              max={300}
              step={10}
              value={insulationParams.thicknessMm}
              onChange={e => updateInsulation({ thicknessMm: Number(e.target.value) })}
              className="accent-[#D97706] cursor-pointer"
            />
            <span className="text-[10px] text-[#64748B]">
              Глибина бруса каркаса: {beamDepth} мм
            </span>
          </div>

          {/* 2. Cutting waste % */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[#334155]">Запас на прирізку трикутників:</span>
              <strong className="text-[#D97706] font-mono">+{insulationParams.wastePercentage}%</strong>
            </div>
            <input
              type="range"
              min={3}
              max={20}
              step={1}
              value={insulationParams.wastePercentage}
              onChange={e => updateInsulation({ wastePercentage: Number(e.target.value) })}
              className="accent-[#D97706] cursor-pointer"
            />
            <span className="text-[10px] text-[#64748B]">
              Для пінопласту рекомендовано 5-8%, мінвати 8-12%
            </span>
          </div>

          {/* 3. Inner sheathing material selector */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-[#334155]">Внутрішня обшивка:</span>
              <strong className="text-[#1A2E3B] font-mono">{(INNER_SHEATHING_MATERIALS as Record<string, any>)[selectedInnerMatId]?.shortName || "Гіпсокартон"}</strong>
            </div>
            <select
              value={selectedInnerMatId}
              onChange={e => setSelectedInnerMatId(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg border border-[#CBD5E1] bg-white text-[#1E293B] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#D97706]"
            >
              {Object.values(INNER_SHEATHING_MATERIALS).map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.defaultThickness} мм)
                </option>
              ))}
            </select>
            <span className="text-[10px] text-[#64748B]">
              Впливає на внутрішнє накопичення теплоємності
            </span>
          </div>

          {/* 4. Membrane Toggles */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-[#334155]">Захисні плівки та вентзазор:</span>
            <div className="flex flex-col gap-1 text-[11px]">
              <label className="flex items-center gap-2 cursor-pointer text-[#334155]">
                <input
                  type="checkbox"
                  checked={insulationParams.hasVaporBarrier}
                  onChange={e => updateInsulation({ hasVaporBarrier: e.target.checked })}
                  className="rounded text-[#D97706] focus:ring-[#D97706]"
                />
                <span>Внутрішній паробар'єр (плівка)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-[#334155]">
                <input
                  type="checkbox"
                  checked={insulationParams.hasWindBarrier}
                  onChange={e => updateInsulation({ hasWindBarrier: e.target.checked })}
                  className="rounded text-[#D97706] focus:ring-[#D97706]"
                />
                <span>Зовнішня супердифузійна мембрана</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-[#334155]">
                <input
                  type="checkbox"
                  checked={insulationParams.hasCounterBatten}
                  onChange={e => updateInsulation({ hasCounterBatten: e.target.checked })}
                  className="rounded text-[#D97706] focus:ring-[#D97706]"
                />
                <span>Вентзазор (контррейка {insulationParams.counterBattenThicknessMm} мм)</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW MODE 1: OVERVIEW & KPI DASHBOARD */}
      {activeTab === "overview" && (
        <div className="flex flex-col gap-6">
          {/* Top 4 Primary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Insulation Volume */}
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
                  Об'єм утеплювача
                </span>
                <div className="w-8 h-8 rounded-xl bg-[#FEF3C7] text-[#D97706] flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-[#1A2E3B]">{metrics.orderVolumeM3}</span>
                  <span className="text-sm font-semibold text-[#64748B]">м³ під замовлення</span>
                </div>
                <p className="text-xs text-[#64748B] mt-1">
                  Чистий об'єм: <strong>{metrics.netInsulationVolumeM3} м³</strong> · {metrics.standardPacksNeeded} станд. пачок
                </p>
              </div>
              <div className="text-[11px] text-[#64748B] pt-2 border-t border-[#F1F5F9] flex justify-between">
                <span>Площа покриття:</span>
                <strong>{metrics.totalInsulatedAreaM2} м²</strong>
              </div>
            </div>

            {/* 2. Insulation Weight & Load */}
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
                  Маса утеплювача
                </span>
                <div className="w-8 h-8 rounded-xl bg-[#E0F2FE] text-[#0284C7] flex items-center justify-center">
                  <Scale className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-[#1A2E3B]">{metrics.insulationMassKg}</span>
                  <span className="text-sm font-semibold text-[#64748B]">кг на купол</span>
                </div>
                <p className="text-xs text-[#64748B] mt-1">
                  Густина: <strong>{metrics.material.densityKgM3} кг/м³</strong> (навантаження {(metrics.insulationMassKg / Math.max(1, metrics.totalInsulatedAreaM2)).toFixed(1)} кг/м²)
                </p>
              </div>
              <div className="text-[11px] text-[#64748B] pt-2 border-t border-[#F1F5F9] flex justify-between">
                <span>Матеріал:</span>
                <strong className="text-[#0284C7]">{metrics.material.shortName}</strong>
              </div>
            </div>

            {/* 3. Thermal Resistance R */}
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
                  Тепловий опір R
                </span>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${metrics.dbnCompliant ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#FEF2F2] text-[#DC2626]'}`}>
                  <ShieldCheck className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-[#1A2E3B]">{metrics.rValueTotalEnvelope}</span>
                  <span className="text-sm font-semibold text-[#64748B]">м²·К/Вт</span>
                </div>
                <p className="text-xs text-[#64748B] mt-1">
                  Норма ДБН: <strong>{metrics.dbnRequiredR} м²·К/Вт</strong> ({metrics.dbnRatioPct}% норми)
                </p>
              </div>
              <div className="text-[11px] text-[#64748B] pt-2 border-t border-[#F1F5F9] flex justify-between">
                <span>Теплопередача U:</span>
                <strong>{metrics.uValueEnvelope} Вт/(м²·К)</strong>
              </div>
            </div>

            {/* 4. Heat Capacity & Phase Shift */}
            <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#64748B] uppercase tracking-wider">
                  Теплоємність купола
                </span>
                <div className="w-8 h-8 rounded-xl bg-[#F3E8FF] text-[#9333EA] flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-[#1A2E3B]">{metrics.totalEnvelopeHeatCapacityMJ}</span>
                  <span className="text-sm font-semibold text-[#64748B]">МДж/°C</span>
                </div>
                <p className="text-xs text-[#64748B] mt-1">
                  Енергоємність: <strong>{metrics.totalEnvelopeHeatCapacityKWh} кВт·год/°C</strong>
                </p>
              </div>
              <div className="text-[11px] text-[#64748B] pt-2 border-t border-[#F1F5F9] flex justify-between">
                <span>Фазовий зсув (інерція):</span>
                <strong className="text-[#9333EA]">{metrics.thermalPhaseShiftHours} годин</strong>
              </div>
            </div>
          </div>

          {/* Deep Thermal Capacity & Energy Efficiency Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Heat Capacity Box */}
            <div className="p-6 rounded-3xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#FAF5FF] text-[#9333EA] flex items-center justify-center">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#1E293B]">
                      Детальна теплоємність конструкції (Q = m · c · ΔT)
                    </h4>
                    <p className="text-[11px] text-[#64748B]">
                      Здатність купола накопичувати тепло та захищати від різких коливань спеки влітку і холоду взимку
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {/* 1. Insulation layer */}
                <div className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-[#1A2E3B] flex items-center gap-1.5">
                      <span>{metrics.material.icon}</span>
                      <span>Шар утеплювача ({metrics.material.shortName}):</span>
                    </span>
                    <strong className="text-[#D97706] font-mono">{metrics.heatCapacityInsulationMJ} МДж/°C</strong>
                  </div>
                  <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#D97706] h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (metrics.heatCapacityInsulationMJ / metrics.totalEnvelopeHeatCapacityMJ) * 100)}%`
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[#64748B]">
                    <span>Питома теплоємність c: {metrics.material.specificHeatCapacity} Дж/(кг·К)</span>
                    <span>Маса: {metrics.insulationMassKg} кг</span>
                  </div>
                </div>

                {/* 2. Inner Sheathing */}
                <div className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-[#1A2E3B] flex items-center gap-1.5">
                      <span>🏠</span>
                      <span>Внутрішня обшивка ({(INNER_SHEATHING_MATERIALS as Record<string, any>)[selectedInnerMatId]?.name || "Гіпсокартон"}):</span>
                    </span>
                    <strong className="text-[#475569] font-mono">{metrics.heatCapacityInnerSheathingMJ} МДж/°C</strong>
                  </div>
                  <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#475569] h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (metrics.heatCapacityInnerSheathingMJ / metrics.totalEnvelopeHeatCapacityMJ) * 100)}%`
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[#64748B]">
                    <span>Товщина: 12.5 мм</span>
                    <span>Акумуляція тепла всередині приміщення</span>
                  </div>
                </div>

                {/* 3. Timber Frame */}
                <div className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-[#1A2E3B] flex items-center gap-1.5">
                      <span>🌲</span>
                      <span>Дерев'яний каркас бруса:</span>
                    </span>
                    <strong className="text-[#15803D] font-mono">{metrics.heatCapacityTimberFrameMJ} МДж/°C</strong>
                  </div>
                  <div className="w-full bg-[#E2E8F0] h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#15803D] h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (metrics.heatCapacityTimberFrameMJ / metrics.totalEnvelopeHeatCapacityMJ) * 100)}%`
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[#64748B]">
                    <span>Деревина: сосна / смерека (густина ~500 кг/м³)</span>
                    <span>Природна теплова інерція</span>
                  </div>
                </div>

                {/* Total Summary */}
                <div className="p-4 rounded-xl bg-[#FEF3C7]/40 border border-[#FDE68A] flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-[#92400E]">
                      Сумарна теплоємність стінового пирога:
                    </span>
                    <span className="text-[11px] text-[#B45309]">
                      {metrics.totalEnvelopeHeatCapacityKWh} кВт·год накопиченої теплової енергії на кожен 1°C різниці
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-[#92400E] font-mono">
                      {metrics.totalEnvelopeHeatCapacityMJ} МДж/°C
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Thermal Comfort & Winter/Summer Inertia Box */}
            <div className="p-6 rounded-3xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#ECFDF5] text-[#059669] flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#1E293B]">
                      Теплова інерція та мікроклімат (Літо / Зима)
                    </h4>
                    <p className="text-[11px] text-[#64748B]">
                      Поведінка купола при добових перепадах температури та вимкненні опалення
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A]">
                    <span className="text-base">⏳</span>
                    <span>Фазовий зсув (Phase Lag)</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-[#0284C7] font-mono">{metrics.thermalPhaseShiftHours}</span>
                    <span className="text-xs text-[#64748B]">годин</span>
                  </div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Час, за який денна спека ззовні долає товщу стіни всередину купола. При {metrics.thermalPhaseShiftHours} год пік спеки досягає приміщення лише вночі, коли повітря вже прохолодне.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A]">
                    <span className="text-base">❄️</span>
                    <span>Час остигання купола (τ)</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-[#059669] font-mono">{metrics.coolingTimeConstantHours}</span>
                    <span className="text-xs text-[#64748B]">годин</span>
                  </div>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    Постійна часу охолодження при раптовому знеструмленні або вимкненні опалення. Купол тримає комфортне тепло без додаткового підігріву протягом {metrics.coolingTimeConstantHours} год.
                  </p>
                </div>
              </div>

              {/* Heating Cost & Winter Power Estimate */}
              <div className="p-4 rounded-2xl bg-[#FAF5FF] border border-[#E9D5FF] flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs font-bold text-[#6B21A8]">
                  <span>Пікові тепловтрати в мороз (-22°C на вулиці / +20°C всередині):</span>
                  <span className="font-mono">{metrics.designHeatingLossWatts} Вт ({metrics.designHeatingLossPerM2Watts} Вт/м²)</span>
                </div>
                <div className="flex justify-between items-center text-xs text-[#7E22CE]">
                  <span>Середнє місячне споживання тепла взимку (0°C):</span>
                  <span className="font-mono font-bold">~{metrics.monthlyHeatingKWh} кВт·год/місяць</span>
                </div>
                <div className="text-[10px] text-[#9333EA] pt-1 border-t border-[#E9D5FF]/60 flex justify-between">
                  <span>Орієнтовна вартість комплекту утеплювача:</span>
                  <strong className="font-mono">{metrics.totalSystemCostUAH.toLocaleString()} грн</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: SANDWICH CROSS-SECTION */}
      {activeTab === "sandwich" && (
        <div className="p-6 rounded-3xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col gap-6">
          <div className="flex flex-col gap-1 pb-4 border-b border-[#F1F5F9]">
            <h3 className="text-base font-bold text-[#1E293B] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#D97706]" />
              Конструктивний пиріг купольної стіни у розрізі
            </h3>
            <p className="text-xs text-[#64748B]">
              Схема розташування захисних шарів від зовнішнього середовища до внутрішнього оздоблення купола
            </p>
          </div>

          {/* Interactive Layered Diagram */}
          <div className="flex flex-col gap-3">
            {/* Layer 1: Exterior Sheathing */}
            <div className="p-4 rounded-2xl border border-[#D97706]/40 bg-[#FFFBEB] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#D97706] text-white flex items-center justify-center font-bold text-xs">
                  1
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#92400E]">
                    Зовнішня обшивка купола (Фанера ФСФ або OSB-3)
                  </h4>
                  <p className="text-[11px] text-[#B45309]">
                    Товщина {model.sheathingParams?.thickness || 12} мм · Несуча просторова основа під покрівельний матеріал (гонту, тент або фальц)
                  </p>
                </div>
              </div>
              <div className="text-right text-xs font-mono text-[#92400E]">
                R = {metrics.rValueOuterSheathing} м²·К/Вт
              </div>
            </div>

            {/* Layer 2: Ventilation Counter-batten */}
            {insulationParams.hasCounterBatten && (
              <div className="p-3.5 rounded-2xl border border-[#94A3B8]/30 bg-[#F8FAFC] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#64748B] text-white flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#334155]">
                      Вентиляційний зазор (Контррейка {insulationParams.counterBattenThicknessMm} мм)
                    </h4>
                    <p className="text-[11px] text-[#64748B]">
                      Вільна циркуляція повітря для виведення конденсату та охолодження покрівлі влітку
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs font-mono text-[#64748B]">
                  R = {metrics.rValueAirGap} м²·К/Вт
                </div>
              </div>
            )}

            {/* Layer 3: Wind barrier */}
            {insulationParams.hasWindBarrier && (
              <div className="p-3.5 rounded-2xl border border-[#0284C7]/30 bg-[#F0F9FF] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#0284C7] text-white flex items-center justify-center font-bold text-xs">
                    3
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#0369A1]">
                      Супердифузійна вітрозахисна мембрана (Eurovent / Tyvek)
                    </h4>
                    <p className="text-[11px] text-[#0284C7]">
                      Захист утеплювача від вивітрювання та продування вітром, вільний вихід пари назовні
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs font-mono text-[#0369A1]">
                  Паропроникність &gt; 1400 г/м²·добу
                </div>
              </div>
            )}

            {/* Layer 4: CORE INSULATION CAVITY */}
            <div className="p-5 rounded-2xl border-2 border-[#D97706] bg-[#FEF3C7]/60 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-[#D97706] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  4
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-black text-[#92400E]">
                      ОСНОВНИЙ ШАР УТЕПЛЮВАЧА: {metrics.material.name}
                    </h4>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#D97706] text-white">
                      Товщина {metrics.cavityThicknessMm} мм
                    </span>
                  </div>
                  <p className="text-xs text-[#B45309] mt-0.5">
                    Вкладається в порожнину між дерев'яними балками каркаса ({beamDepth} мм). Об'єм: {metrics.orderVolumeM3} м³ · Маса: {metrics.insulationMassKg} кг
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-black text-[#92400E] font-mono">
                  R = {metrics.rValueInsulation} м²·К/Вт
                </div>
                <div className="text-[10px] text-[#B45309]">
                  λ = {metrics.material.thermalConductivityLambda} Вт/(м·К)
                </div>
              </div>
            </div>

            {/* Layer 5: Vapor barrier */}
            {insulationParams.hasVaporBarrier && (
              <div className="p-3.5 rounded-2xl border border-[#7C3AED]/30 bg-[#FAF5FF] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#7C3AED] text-white flex items-center justify-center font-bold text-xs">
                    5
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#6D28D9]">
                      Герметичний паробар'єр (Плівка з проклейкою швів стрічкою Delta/Alfacryl)
                    </h4>
                    <p className="text-[11px] text-[#7C3AED]">
                      100% захист утеплювача від потрапляння внутрішньої вологи та пари з приміщення купола
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs font-mono text-[#6D28D9]">
                  Sd &gt; 100 м (Герметично)
                </div>
              </div>
            )}

            {/* Layer 6: Inner Sheathing */}
            <div className="p-4 rounded-2xl border border-[#475569]/30 bg-[#F1F5F9] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#475569] text-white flex items-center justify-center font-bold text-xs">
                  6
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#1E293B]">
                    Внутрішня обшивка ({(INNER_SHEATHING_MATERIALS as Record<string, any>)[selectedInnerMatId]?.name || "Гіпсокартон 12.5 мм"})
                  </h4>
                  <p className="text-[11px] text-[#64748B]">
                    Внутрішній інтер'єр, акумуляція тепла кімнати, звукопоглинання
                  </p>
                </div>
              </div>
              <div className="text-right text-xs font-mono text-[#1E293B]">
                R = {metrics.rValueInnerSheathing} м²·К/Вт
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 3: SIDE-BY-SIDE COMPARISON TABLE OF ALL FILLERS */}
      {activeTab === "comparison" && (
        <div className="p-6 rounded-3xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#F1F5F9]">
            <div>
              <h3 className="text-base font-bold text-[#1E293B] flex items-center gap-2">
                <Thermometer className="w-5 h-5 text-[#D97706]" />
                Порівняльна матриця наповнювачів при товщині {insulationParams.thicknessMm} мм
              </h3>
              <p className="text-xs text-[#64748B]">
                Порівняння пінопласту, мінеральної вати, XPS, деревного волокна, ековати та PIR за теплоємністю, опором R, масою та вартістю
              </p>
            </div>
          </div>

          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-[#E8E2D8] text-[#475569] uppercase font-bold text-[10px]">
                  <th className="p-3">Матеріал наповнювача</th>
                  <th className="p-3">Густина</th>
                  <th className="p-3">λ (Вт/м·К)</th>
                  <th className="p-3">R опір</th>
                  <th className="p-3">ДБН (≥4.0)</th>
                  <th className="p-3">Теплоємність (МДж/°C)</th>
                  <th className="p-3">Теплоємність (кВт·год)</th>
                  <th className="p-3">Фазовий зсув</th>
                  <th className="p-3">Час остигання</th>
                  <th className="p-3">Маса</th>
                  <th className="p-3">Орієнт. вартість</th>
                  <th className="p-3 text-center">Дія</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {metrics.materialsComparison.map(row => {
                  const isCurrent = row.material.id === insulationParams.materialId;
                  return (
                    <tr
                      key={row.material.id}
                      className={`hover:bg-[#FFFBEB]/40 transition-colors ${
                        isCurrent ? "bg-[#FEF3C7]/40 font-semibold" : ""
                      }`}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{row.material.icon}</span>
                          <div>
                            <div className="font-bold text-[#1E293B]">{row.material.shortName}</div>
                            <div className="text-[10px] text-[#64748B]">{row.material.fireClass.split(" ")[0]}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-[#475569]">{row.material.densityKgM3} кг/м³</td>
                      <td className="p-3 font-mono text-[#0F172A]">{row.material.thermalConductivityLambda}</td>
                      <td className="p-3 font-mono font-bold text-[#1A2E3B]">{row.rValueTotal}</td>
                      <td className="p-3">
                        {row.dbnCompliant ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#DCFCE7] text-[#16A34A] font-bold">
                            Норма
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#DC2626] font-bold">
                            &lt;4.0 ({row.reqThicknessForDbnMm} мм)
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-[#B45309] font-bold">
                        {row.heatCapacityInsulationMJ} МДж
                      </td>
                      <td className="p-3 font-mono text-[#7C3AED]">
                        {row.totalEnvelopeHeatCapacityKWh} кВт·год
                      </td>
                      <td className="p-3 font-mono font-bold text-[#0284C7]">
                        {row.thermalPhaseShiftHours} год
                      </td>
                      <td className="p-3 font-mono text-[#059669]">
                        {row.coolingTimeConstantHours} год
                      </td>
                      <td className="p-3 font-mono text-[#475569]">{row.insulationMassKg} кг</td>
                      <td className="p-3 font-mono font-bold text-[#1E293B]">
                        {row.estimatedCostUAH.toLocaleString()} грн
                      </td>
                      <td className="p-3 text-center">
                        {isCurrent ? (
                          <span className="text-[11px] font-bold text-[#D97706] px-2.5 py-1 rounded-lg bg-[#FEF3C7]">
                            Вибрано
                          </span>
                        ) : (
                          <button
                            onClick={() => handleSelectMaterial(row.material.id)}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-[#CBD5E1] bg-white text-[#475569] hover:bg-[#F8FAFC] cursor-pointer"
                          >
                            Обрати
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE 4: CUTTING & GEOMETRY BREAKDOWN (TRIANGLES + RECTANGULAR PLINTH) */}
      {activeTab === "cutting" && (
        <div className="p-6 rounded-3xl bg-white border border-[#E2E8F0] shadow-xs flex flex-col gap-6">
          <div className="flex flex-col gap-1 pb-4 border-b border-[#F1F5F9]">
            <h3 className="text-base font-bold text-[#1E293B] flex items-center gap-2">
              <Package className="w-5 h-5 text-[#D97706]" />
              Специфікація розкрою утеплювача по секціях каркаса
            </h3>
            <p className="text-xs text-[#64748B]">
              Геометричні розміри, площа, кількість та об'єм секцій утеплювача для купольних трикутників та цокольних прямокутників
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Plinth rectangular section card (if enabled) */}
            {metrics.plinthSpec && (
              <div className="p-4 rounded-2xl border-2 border-[#2563EB] bg-[#EFF6FF] flex flex-col justify-between gap-3 shadow-xs">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-[#1D4ED8] tracking-wider">
                      ЦОКОЛЬ ТИП PL (ПРЯМОКУТНИК)
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#DBEAFE] text-[#1E40AF]">
                      {metrics.plinthSpec.count} шт
                    </span>
                  </div>
                  <div className="text-xs text-[#1E40AF] mt-1 font-semibold">
                    Розміри прямокутної панелі: {metrics.plinthSpec.widthMm} × {metrics.plinthSpec.heightMm} мм
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-[11px] text-[#334155] pt-2 border-t border-[#BFDBFE]">
                  <div className="flex justify-between">
                    <span>Площа 1 прямокутника:</span>
                    <strong>{metrics.plinthSpec.areaM2} м²</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Загальна площа цоколя:</span>
                    <strong>{metrics.plinthSpec.totalAreaM2} м²</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Об'єм утеплювача:</span>
                    <strong className="text-[#1D4ED8]">{metrics.plinthSpec.volumeM3} м³</strong>
                  </div>
                </div>

                <div className="text-[10px] text-[#1E40AF] bg-white/80 p-2 rounded-xl">
                  💡 Цоколь розкроюється цільними прямокутними блоками без діагональних зрізів.
                </div>
              </div>
            )}

            {/* Dome triangle cards */}
            {metrics.trianglesSpec.map(tri => (
              <div
                key={tri.type}
                className="p-4 rounded-2xl border border-[#E2E8F0] bg-white flex flex-col justify-between gap-3 shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ backgroundColor: tri.color }}
                      />
                      <span className="text-xs font-bold text-[#1E293B]">
                        Трикутник Тип {tri.type}
                      </span>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#475569]">
                      {tri.count} шт
                    </span>
                  </div>
                  <div className="text-xs text-[#64748B] mt-1">
                    Основа {tri.widthMm} мм · Висота {tri.heightMm} мм
                  </div>
                </div>

                <div className="flex flex-col gap-1 text-[11px] text-[#475569] pt-2 border-t border-[#F1F5F9]">
                  <div className="flex justify-between">
                    <span>Площа 1 шт:</span>
                    <strong>{tri.areaM2} м²</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Сумарна площа:</span>
                    <strong>{tri.totalAreaM2} м²</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Об'єм наповнювача:</span>
                    <strong className="text-[#D97706]">{tri.volumeM3} м³</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Cutting Instructions & Best Practices */}
          <div className="p-5 rounded-2xl bg-[#FAF7F2] border border-[#E8E2D8] flex flex-col gap-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#1A2E3B] flex items-center gap-1.5">
              <Info className="w-4 h-4 text-[#D97706]" />
              Технологічні рекомендації розкрою та монтажу наповнювачів
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-[#475569]">
              <div className="p-3.5 rounded-xl bg-white border border-[#E2E8F0] flex flex-col gap-1.5">
                <strong className="text-[#0284C7] flex items-center gap-1">
                  <span>🧱</span> Для пінопласту (EPS / XPS):
                </strong>
                <p className="text-[11px] leading-relaxed">
                  1. Виготовте фанерний шаблон (лекало) під кожен тип трикутника та прямокутник цоколя.<br />
                  2. Нарізку найкраще виконувати ніхромовою гарячою струною — дає ідеальний зріз без кульок і крихт.<br />
                  3. Зазори 5-10 мм між пінопластом і дерев'яними балками обов'язково запінюються клей-піною з низьким вторинним розширенням.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-[#E2E8F0] flex flex-col gap-1.5">
                <strong className="text-[#D97706] flex items-center gap-1">
                  <span>🪨</span> Для базальтової мінеральної вати:
                </strong>
                <p className="text-[11px] leading-relaxed">
                  1. Розкрій виконується спеціальним довгим хвилястим ножем для мінвати.<br />
                  2. Робіть припуск +15..20 мм по ширині, щоб пружні плити ставали в розпір між балками каркаса без зазорів.<br />
                  3. Обов'язково використовуйте герметичний паробар'єр з проклейкою стиків зсередини приміщення.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
