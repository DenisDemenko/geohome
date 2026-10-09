import React, { useState, useMemo } from "react";
import { DomeModel } from "../core/types";
import {
  CurrencyCode,
  CURRENCIES,
  MaterialCostInputs,
  DEFAULT_COST_INPUTS,
  calculateProjectCostEstimate,
  exportCostEstimateCSV,
  CostCategoryGroup,
  TIMBER_SPECIES,
  TimberSpeciesId
} from "../core/costEstimation";
import {
  Coins,
  Calculator,
  Download,
  Printer,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  PieChart,
  Layers,
  Ruler,
  Disc,
  Hammer,
  ShieldCheck,
  TrendingUp,
  FileSpreadsheet,
  Info,
  CheckCircle2,
  DollarSign
} from "lucide-react";

interface CostEstimatePanelProps {
  model: DomeModel;
}

export const CostEstimatePanel: React.FC<CostEstimatePanelProps> = ({ model }) => {
  // Cost inputs state
  const [inputs, setInputs] = useState<MaterialCostInputs>(DEFAULT_COST_INPUTS);
  const [copied, setCopied] = useState<boolean>(false);

  // Active view tab: "breakdown" | "settings" | "proposal"
  const [activeTab, setActiveTab] = useState<"breakdown" | "proposal">("breakdown");

  // Calculate full estimate
  const estimate = useMemo(() => {
    return calculateProjectCostEstimate(model, inputs);
  }, [model, inputs]);

  const sym = estimate.currency.symbol;

  // Currency change handler with auto-scaling prices
  const handleCurrencyChange = (newCurr: CurrencyCode) => {
    if (newCurr === inputs.currency) return;
    const oldRate = CURRENCIES[inputs.currency].rateToUAH;
    const newRate = CURRENCIES[newCurr].rateToUAH;
    const ratio = oldRate / newRate;

    setInputs(prev => ({
      ...prev,
      currency: newCurr,
      timberPricePerMeter: Math.round(prev.timberPricePerMeter * ratio * 10) / 10,
      plywoodPricePerSheet: Math.round(prev.plywoodPricePerSheet * ratio * 10) / 10,
      connectorPricePerUnit: Math.round(prev.connectorPricePerUnit * ratio * 10) / 10,
      connectorPricePerKg: Math.round(prev.connectorPricePerKg * ratio * 10) / 10,
      fastenerSetPrice: Math.round(prev.fastenerSetPrice * ratio * 10) / 10,
      anchorPricePerUnit: Math.round(prev.anchorPricePerUnit * ratio * 10) / 10,
      antisepticPricePerLiter: Math.round(prev.antisepticPricePerLiter * ratio * 10) / 10,
      sealingTapePricePerMeter: Math.round(prev.sealingTapePricePerMeter * ratio * 10) / 10,
      laborRatePerDay: Math.round(prev.laborRatePerDay * ratio)
    }));
  };

  // Handler for timber species selection (ялинка, бук, дуб, ясен, сосна)
  const handleSelectSpecies = (speciesId: TimberSpeciesId) => {
    const sp = TIMBER_SPECIES[speciesId];
    if (!sp) return;
    const rate = CURRENCIES[inputs.currency].rateToUAH;
    const priceInCurrency = Math.round((sp.defaultPricePerMeterUAH / rate) * 10) / 10;
    setInputs(prev => ({
      ...prev,
      timberSpecies: speciesId,
      timberPricePerMeter: priceInCurrency
    }));
  };

  // Quick Presets
  const applyPreset = (preset: "economy" | "standard" | "premium") => {
    const isUAH = inputs.currency === "UAH";
    const scale = isUAH ? 1.0 : inputs.currency === "USD" ? 1 / 41.5 : 1 / 45.2;

    if (preset === "economy") {
      setInputs(prev => ({
        ...prev,
        timberSpecies: "spruce", // Ялинка (найекономічніша)
        timberPricePerMeter: Math.round(145 * scale),
        plywoodPricePerSheet: Math.round(620 * scale), // OSB-3
        connectorPricingMode: "per_piece",
        connectorPricePerUnit: Math.round(220 * scale),
        fastenerSetPrice: Math.round(14 * scale),
        timberWastePct: 5,
        contingencyPct: 5,
        includeLabor: false
      }));
    } else if (preset === "standard") {
      setInputs(prev => ({
        ...prev,
        timberSpecies: "pine", // Сосна
        timberPricePerMeter: Math.round(180 * scale), // Planed pine
        plywoodPricePerSheet: Math.round(880 * scale), // FSF Birch
        connectorPricingMode: "per_piece",
        connectorPricePerUnit: Math.round(290 * scale),
        fastenerSetPrice: Math.round(18 * scale),
        timberWastePct: 5,
        contingencyPct: 5,
        includeWoodAntiseptic: true,
        includeSealingTape: true
      }));
    } else if (preset === "premium") {
      setInputs(prev => ({
        ...prev,
        timberSpecies: "oak", // Дуб
        timberPricePerMeter: Math.round(520 * scale), // Oak
        plywoodPricePerSheet: Math.round(1350 * scale), // Film faced plywood
        connectorPricingMode: "per_piece",
        connectorPricePerUnit: Math.round(420 * scale), // Stainless or powder coated
        fastenerSetPrice: Math.round(26 * scale),
        timberWastePct: 8,
        contingencyPct: 10,
        includeLabor: true
      }));
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const csv = exportCostEstimateCSV(estimate, model);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `Cost-Estimate-${model.parameters.frequency}V-${model.parameters.diameter / 1000}m.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copy Summary to Clipboard
  const handleCopySummary = () => {
    const speciesName = estimate.metrics.selectedSpecies?.name || "Дерев'яний брус";
    const text = `📊 Кошторис геодезичного купола ${model.parameters.frequency}V (D=${model.parameters.diameter / 1000}м, H=${model.parameters.height / 1000}м)
----------------------------------------
• Загальний бюджет: ${estimate.totalProjectCost.toLocaleString()} ${sym}
• Вартість 1 м² підлоги: ${estimate.costPerFloorAreaM2.toLocaleString()} ${sym}/м² (Площа: ${estimate.metrics.floorAreaM2} м²)
• Вартість 1 м² купола: ${estimate.costPerDomeSurfaceM2.toLocaleString()} ${sym}/м² (Площа: ${estimate.metrics.domeSurfaceAreaM2} м²)
----------------------------------------
Склад витрат:
1. Каркас (${speciesName}, ${estimate.metrics.timberWithWasteMeters} пог. м / ${estimate.metrics.totalWoodVolumeM3} м³): ${estimate.groups[0]?.totalCost.toLocaleString()} ${sym}
2. Конектори Thunder Domes (${estimate.metrics.totalConnectorsCount} шт): ${estimate.groups[1]?.totalCost.toLocaleString()} ${sym}
3. Обшивка фанера/OSB (${estimate.metrics.totalPlywoodSheets} листів): ${estimate.groups[2]?.totalCost.toLocaleString()} ${sym}
4. Болти та анкери (${estimate.metrics.totalFastenersCount} шт): ${estimate.groups[3]?.totalCost.toLocaleString()} ${sym}
${estimate.contingencyCost > 0 ? `5. Непередбачуваний резерв (${inputs.contingencyPct}%): ${estimate.contingencyCost.toLocaleString()} ${sym}` : ""}
----------------------------------------
Згенеровано в системі КуполГео CAD`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Print view
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 1. TOP STATS OVERVIEW CARDS */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Total Cost */}
        <div className="p-4 rounded-3xl tactile-card-mint flex flex-col justify-between col-span-2 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-[#1A3E26]">Загальний кошторис</span>
            <Coins className="w-4 h-4 text-[#2E7D32]" />
          </div>
          <span className="text-2xl font-mono font-black text-[#1A3E26]">
            {estimate.totalProjectCost.toLocaleString()} {sym}
          </span>
          <span className="text-[11px] text-[#2E7D32] font-semibold mt-1">
            Матеріали: {estimate.subtotalMaterialsCost.toLocaleString()} {sym}
          </span>
        </div>

        {/* Cost per Floor m2 */}
        <div className="p-3.5 rounded-2xl tactile-card flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-[#5A6778]">Ціна за 1 м² підлоги</span>
            <TrendingUp className="w-3.5 h-3.5 text-[#5B9279]" />
          </div>
          <span className="text-lg font-mono font-black text-[#1A2E3B]">
            {estimate.costPerFloorAreaM2.toLocaleString()} {sym}/м²
          </span>
          <span className="text-[10px] text-[#8C9BAE]">
            Площа підлоги: {estimate.metrics.floorAreaM2} м²
          </span>
        </div>

        {/* Cost per Dome Shell m2 */}
        <div className="p-3.5 rounded-2xl tactile-card flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-[#5A6778]">Ціна за 1 м² купола</span>
            <Layers className="w-3.5 h-3.5 text-[#DDA843]" />
          </div>
          <span className="text-lg font-mono font-black text-[#1A2E3B]">
            {estimate.costPerDomeSurfaceM2.toLocaleString()} {sym}/м²
          </span>
          <span className="text-[10px] text-[#8C9BAE]">
            Площа поверхні: {estimate.metrics.domeSurfaceAreaM2} м²
          </span>
        </div>

        {/* Struts Linear Meters */}
        <div className="p-3.5 rounded-2xl tactile-card flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-[#5A6778]">Брус каркаса</span>
            <Ruler className="w-3.5 h-3.5 text-[#2E7D32]" />
          </div>
          <span className="text-lg font-mono font-black text-[#2E7D32]">
            {estimate.metrics.timberWithWasteMeters} пог. м
          </span>
          <span className="text-[10px] text-[#8C9BAE]">
            Об'єм: {estimate.metrics.totalWoodVolumeM3} м³ деревини
          </span>
        </div>

        {/* Connectors & Fasteners */}
        <div className="p-3.5 rounded-2xl tactile-card flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-[#5A6778]">Конектори / Болти</span>
            <Disc className="w-3.5 h-3.5 text-[#4A7C9B]" />
          </div>
          <span className="text-lg font-mono font-black text-[#1A2E3B]">
            {estimate.metrics.totalConnectorsCount} / {estimate.metrics.totalFastenersCount} шт
          </span>
          <span className="text-[10px] text-[#8C9BAE]">
            {model.connectorParams.materialCategory === "plastic"
              ? "Пластик"
              : model.connectorParams.materialCategory === "aluminum"
              ? "Алюміній"
              : "Метал"}
            : {estimate.metrics.totalMetalWeightKg} кг
          </span>
        </div>
      </section>

      {/* 2. SUB-NAVIGATION TABS & ACTION BUTTONS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2 rounded-2xl tactile-inset">
        {/* Mode tabs */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab("breakdown")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
              activeTab === "breakdown"
                ? "bg-[#FAF7F2] text-[#1A2E3B] shadow-xs"
                : "text-[#5A6778] hover:text-[#1A2E3B]"
            }`}
          >
            <Calculator className="w-3.5 h-3.5 text-[#2E7D32]" />
            <span>Калькулятор та кошторис</span>
          </button>

          <button
            onClick={() => setActiveTab("proposal")}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
              activeTab === "proposal"
                ? "bg-[#FAF7F2] text-[#1A2E3B] shadow-xs"
                : "text-[#5A6778] hover:text-[#1A2E3B]"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#4A7C9B]" />
            <span>Комерційна пропозиція</span>
          </button>
        </div>

        {/* Currency Switcher & Actions */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {/* Currency buttons */}
          <div className="flex items-center p-1 rounded-xl bg-[#E8E2D8] gap-1">
            {(["UAH", "USD", "EUR"] as CurrencyCode[]).map(c => (
              <button
                key={c}
                onClick={() => handleCurrencyChange(c)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  inputs.currency === c
                    ? "bg-[#FAF7F2] text-[#1A2E3B] shadow-2xs"
                    : "text-[#5A6778] hover:text-[#1A2E3B]"
                }`}
              >
                {CURRENCIES[c].symbol} {c}
              </button>
            ))}
          </div>

          <button
            onClick={handleCopySummary}
            className="px-3 py-1.5 text-xs font-bold rounded-xl tactile-btn flex items-center gap-1.5 text-[#1A2E3B] hover:text-[#2E7D32]"
            title="Скопіювати короткий підсумок кошторису"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#2E7D32]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Скопійовано!" : "Копіювати"}</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 text-xs font-bold rounded-xl tactile-btn flex items-center gap-1.5 text-[#1A2E3B] hover:text-[#2E7D32]"
            title="Експорт кошторису у CSV (Excel)"
          >
            <Download className="w-3.5 h-3.5 text-[#2E7D32]" />
            <span className="hidden sm:inline">Експорт</span>
            <span>CSV</span>
          </button>

          <button
            onClick={handlePrint}
            className="px-3 py-1.5 text-xs font-bold rounded-xl tactile-btn flex items-center gap-1.5 text-[#1A2E3B] hover:text-[#4A7C9B]"
            title="Друк кошторису або збереження у PDF"
          >
            <Printer className="w-3.5 h-3.5 text-[#4A7C9B]" />
            <span>Друк</span>
          </button>
        </div>
      </div>

      {/* 3. MAIN WORKSPACE */}
      {activeTab === "breakdown" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Interactive Input Controls (5 cols) */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            {/* Presets Bar */}
            <div className="p-4 rounded-3xl tactile-card flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#E8E2D8]">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#DDA843]" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1A2E3B]">
                    Готові пакети комплектації
                  </h3>
                </div>
                <button
                  onClick={() => setInputs(DEFAULT_COST_INPUTS)}
                  className="text-[11px] text-[#5A6778] hover:text-[#1A2E3B] flex items-center gap-1"
                  title="Скинути до стандартних значень"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Скинути</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => applyPreset("economy")}
                  className="p-2.5 rounded-2xl border border-[#E8E2D8] bg-[#FAF7F2] hover:bg-[#F3EFE7] text-left transition-all"
                >
                  <span className="text-xs font-bold text-[#1A2E3B] block">Економ</span>
                  <span className="text-[10px] text-[#5A6778] block">Сосна + OSB-3</span>
                </button>

                <button
                  onClick={() => applyPreset("standard")}
                  className="p-2.5 rounded-2xl border-2 border-[#2E7D32] bg-[#E1EDE3]/40 text-left transition-all shadow-xs"
                >
                  <span className="text-xs font-bold text-[#1A3E26] block">Стандарт</span>
                  <span className="text-[10px] text-[#2E7D32] font-semibold block">Струганий + ФСФ</span>
                </button>

                <button
                  onClick={() => applyPreset("premium")}
                  className="p-2.5 rounded-2xl border border-[#E8E2D8] bg-[#FAF7F2] hover:bg-[#F3EFE7] text-left transition-all"
                >
                  <span className="text-xs font-bold text-[#1A2E3B] block">Преміум</span>
                  <span className="text-[10px] text-[#5A6778] block">Модрина + Монтаж</span>
                </button>
              </div>
            </div>

            {/* Core User Price Inputs (as requested by user) */}
            <div className="p-5 rounded-3xl tactile-card flex flex-col gap-4">
              <div className="flex items-center gap-2 pb-2.5 border-b border-[#E8E2D8]">
                <Calculator className="w-4 h-4 text-[#2E7D32]" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1A2E3B]">
                  Вхідні ціни матеріалів
                </h3>
              </div>

              {/* 1. TIMBER SPECIES & PRICE PER METER */}
              <div className="flex flex-col gap-2.5 p-3.5 rounded-2xl bg-[#F3EFE7]/80 border border-[#E8E2D8]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1.5">
                    <Ruler className="w-3.5 h-3.5 text-[#2E7D32]" />
                    <span>Порода деревини та ціна бруса:</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-[#2E7D32]">
                    {inputs.timberPricePerMeter} {sym}/пог. м
                  </span>
                </div>

                {/* Species Selector Chips */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-[#5A6778] uppercase tracking-wider">
                    Оберіть матеріал бруса:
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(["spruce", "beech", "oak", "ash"] as TimberSpeciesId[]).map(sId => {
                      const sp = TIMBER_SPECIES[sId];
                      const isSelected = inputs.timberSpecies === sId;
                      const spPrice = Math.round(
                        (sp.defaultPricePerMeterUAH / CURRENCIES[inputs.currency].rateToUAH) * 10
                      ) / 10;

                      return (
                        <button
                          key={sId}
                          type="button"
                          onClick={() => handleSelectSpecies(sId)}
                          className={`p-2 rounded-xl text-left transition-all border flex flex-col justify-between cursor-pointer ${
                            isSelected
                              ? "bg-white border-[#2E7D32] shadow-xs ring-1 ring-[#2E7D32]"
                              : "bg-[#FAF7F2] border-[#E8E2D8] hover:border-[#A6C7AE]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{sp.icon}</span>
                            <span className="text-[10px] font-mono font-bold text-[#2E7D32]">
                              ~{spPrice} {sym}/м
                            </span>
                          </div>
                          <div className="mt-1">
                            <span className="text-xs font-bold text-[#1A2E3B] block">
                              {sp.shortName}
                            </span>
                            <span className="text-[9px] text-[#5A6778] block truncate">
                              {sp.hardness}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Species Details Badge */}
                  {estimate.metrics.selectedSpecies && (
                    <div className="p-2.5 rounded-xl bg-white border border-[#E8E2D8] text-[10px] text-[#5A6778] flex flex-col gap-1">
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-[#1A2E3B]">
                          {estimate.metrics.selectedSpecies.icon} {estimate.metrics.selectedSpecies.name} ({estimate.metrics.selectedSpecies.scientificName})
                        </span>
                        <span className="text-[#2E7D32] font-bold">
                          Вага каркаса: ~{estimate.metrics.totalTimberWeightKg} кг
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#8C9BAE]">
                        <span>Густина: {estimate.metrics.selectedSpecies.density} кг/м³</span>
                        <span>·</span>
                        <span>Міцність на згин: {estimate.metrics.selectedSpecies.bendingStrength} МПа</span>
                        <span>·</span>
                        <span>Модуль пружності: {estimate.metrics.selectedSpecies.elasticModulus} МПа</span>
                      </div>
                      <span className="text-[10px] text-[#5A6778] italic mt-0.5">
                        {estimate.metrics.selectedSpecies.description}
                      </span>
                    </div>
                  )}
                </div>

                {/* Direct Price Input */}
                <div className="flex items-center gap-2 mt-1">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={inputs.timberPricePerMeter}
                      onChange={e => setInputs(prev => ({ ...prev, timberPricePerMeter: Math.max(0, Number(e.target.value)) }))}
                      className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl bg-white border border-[#DCD6CA] text-[#1A2E3B] focus:outline-none focus:border-[#2E7D32]"
                      placeholder="Ціна за 1 метр"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8C9BAE]">
                      {sym}/пог. м
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#5A6778] pt-1">
                  <span>Потрібно: {estimate.metrics.timberWithWasteMeters} м (+{inputs.timberWastePct}% запас)</span>
                  <span className="font-mono font-bold text-[#1A2E3B]">
                    {estimate.groups[0]?.totalCost.toLocaleString()} {sym}
                  </span>
                </div>

                {/* Waste Slider */}
                <div className="flex items-center gap-2 pt-1 border-t border-[#E8E2D8]/60">
                  <span className="text-[10px] text-[#5A6778]">Запас на торцювання:</span>
                  <input
                    type="range"
                    min="0"
                    max="15"
                    step="1"
                    value={inputs.timberWastePct}
                    onChange={e => setInputs(prev => ({ ...prev, timberWastePct: Number(e.target.value) }))}
                    className="flex-1 h-1 bg-[#E8E2D8] rounded-lg appearance-none cursor-pointer accent-[#2E7D32]"
                  />
                  <span className="text-[10px] font-mono font-bold text-[#2E7D32] min-w-[32px] text-right">
                    +{inputs.timberWastePct}%
                  </span>
                </div>
              </div>

              {/* 2. PLYWOOD PRICE PER SHEET */}
              <div className="flex flex-col gap-1.5 p-3 rounded-2xl bg-[#F3EFE7]/80 border border-[#E8E2D8]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#DDA843]" />
                    <span>Ціна за 1 лист фанери / OSB:</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-[#DDA843]">
                    {inputs.plywoodPricePerSheet} {sym}/лист
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="1"
                      step="5"
                      value={inputs.plywoodPricePerSheet}
                      onChange={e => setInputs(prev => ({ ...prev, plywoodPricePerSheet: Math.max(0, Number(e.target.value)) }))}
                      className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl bg-white border border-[#DCD6CA] text-[#1A2E3B] focus:outline-none focus:border-[#2E7D32]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8C9BAE]">
                      {sym}/лист
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#5A6778] pt-1">
                  <span>Необхідно листів: {estimate.metrics.totalPlywoodSheets} шт (1250×2500 мм)</span>
                  <span className="font-mono font-bold text-[#1A2E3B]">
                    {estimate.groups[2]?.totalCost.toLocaleString()} {sym}
                  </span>
                </div>
              </div>

              {/* 3. CONNECTOR METAL PRICE (PER UNIT OR PER KG) */}
              <div className="flex flex-col gap-1.5 p-3 rounded-2xl bg-[#F3EFE7]/80 border border-[#E8E2D8]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1.5">
                    <Disc className="w-3.5 h-3.5 text-[#4A7C9B]" />
                    <span>Ціна за одиницю металу конектора:</span>
                  </label>
                  <span className="text-xs font-mono font-bold text-[#4A7C9B]">
                    {inputs.connectorPricingMode === "per_piece"
                      ? `${inputs.connectorPricePerUnit} ${sym}/шт`
                      : `${inputs.connectorPricePerKg} ${sym}/кг`}
                  </span>
                </div>

                {/* Mode toggle: per piece vs per kg */}
                <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[#E8E2D8]">
                  <button
                    onClick={() => setInputs(prev => ({ ...prev, connectorPricingMode: "per_piece" }))}
                    className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${
                      inputs.connectorPricingMode === "per_piece"
                        ? "bg-white text-[#1A2E3B] shadow-2xs"
                        : "text-[#5A6778]"
                    }`}
                  >
                    За 1 штуку (пластину)
                  </button>
                  <button
                    onClick={() => setInputs(prev => ({ ...prev, connectorPricingMode: "per_kg" }))}
                    className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${
                      inputs.connectorPricingMode === "per_kg"
                        ? "bg-white text-[#1A2E3B] shadow-2xs"
                        : "text-[#5A6778]"
                    }`}
                  >
                    За 1 кг ({model.connectorParams.materialCategory === "aluminum" ? "алюмінію" : model.connectorParams.materialCategory === "plastic" ? "пластику" : "сталі"})
                  </button>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={
                        inputs.connectorPricingMode === "per_piece"
                          ? inputs.connectorPricePerUnit
                          : inputs.connectorPricePerKg
                      }
                      onChange={e => {
                        const val = Math.max(0, Number(e.target.value));
                        setInputs(prev => ({
                          ...prev,
                          ...(prev.connectorPricingMode === "per_piece"
                            ? { connectorPricePerUnit: val }
                            : { connectorPricePerKg: val })
                        }));
                      }}
                      className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl bg-white border border-[#DCD6CA] text-[#1A2E3B] focus:outline-none focus:border-[#2E7D32]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8C9BAE]">
                      {sym}/{inputs.connectorPricingMode === "per_piece" ? "шт" : "кг"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[#5A6778] pt-1">
                  <span>
                    {inputs.connectorPricingMode === "per_piece"
                      ? `Всього: ${estimate.metrics.totalConnectorsCount} пластин`
                      : `Загальна вага: ${estimate.metrics.totalMetalWeightKg} кг`}
                  </span>
                  <span className="font-mono font-bold text-[#1A2E3B]">
                    {estimate.groups[1]?.totalCost.toLocaleString()} {sym}
                  </span>
                </div>
              </div>

              {/* 4. FASTENERS & ANCHORS */}
              <div className="flex flex-col gap-2 pt-2 border-t border-[#E8E2D8]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#1A2E3B] flex items-center gap-1.5">
                    <Hammer className="w-3.5 h-3.5 text-[#DE7C5A]" />
                    <span>Болтокомплект (болт+гайка+шайби):</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={inputs.fastenerSetPrice}
                      onChange={e => setInputs(prev => ({ ...prev, fastenerSetPrice: Math.max(0, Number(e.target.value)) }))}
                      className="w-20 px-2 py-1 text-xs font-mono font-bold rounded-lg bg-[#FAF7F2] border border-[#DCD6CA] text-right"
                    />
                    <span className="text-xs font-bold text-[#8C9BAE]">{sym}/к-т</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="anchors_toggle"
                      checked={inputs.includeFoundationAnchors}
                      onChange={e => setInputs(prev => ({ ...prev, includeFoundationAnchors: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded text-[#2E7D32] accent-[#2E7D32]"
                    />
                    <label htmlFor="anchors_toggle" className="text-xs text-[#5A6778] cursor-pointer">
                      Фундаментні анкери ({estimate.metrics.totalAnchorsCount} шт):
                    </label>
                  </div>
                  {inputs.includeFoundationAnchors && (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        step="5"
                        value={inputs.anchorPricePerUnit}
                        onChange={e => setInputs(prev => ({ ...prev, anchorPricePerUnit: Math.max(0, Number(e.target.value)) }))}
                        className="w-20 px-2 py-1 text-xs font-mono font-bold rounded-lg bg-[#FAF7F2] border border-[#DCD6CA] text-right"
                      />
                      <span className="text-xs font-bold text-[#8C9BAE]">{sym}/шт</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 5. ADDITIONAL OPTIONS (Antiseptic, Labor, Reserve) */}
              <div className="flex flex-col gap-2 pt-2 border-t border-[#E8E2D8]">
                {/* Antiseptic */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="antiseptic_toggle"
                      checked={inputs.includeWoodAntiseptic}
                      onChange={e => setInputs(prev => ({ ...prev, includeWoodAntiseptic: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded text-[#2E7D32] accent-[#2E7D32]"
                    />
                    <label htmlFor="antiseptic_toggle" className="text-[#5A6778] cursor-pointer">
                      Антисептик та вогнебіозахист
                    </label>
                  </div>
                  {inputs.includeWoodAntiseptic && (
                    <span className="font-mono font-semibold text-[#1A2E3B]">
                      {inputs.antisepticPricePerLiter} {sym}/л
                    </span>
                  )}
                </div>

                {/* Labor */}
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="labor_toggle"
                      checked={inputs.includeLabor}
                      onChange={e => setInputs(prev => ({ ...prev, includeLabor: e.target.checked }))}
                      className="w-3.5 h-3.5 rounded text-[#2E7D32] accent-[#2E7D32]"
                    />
                    <label htmlFor="labor_toggle" className="text-[#5A6778] cursor-pointer">
                      Монтажні роботи бригади ({inputs.estimatedLaborDays} дні)
                    </label>
                  </div>
                  {inputs.includeLabor && (
                    <span className="font-mono font-semibold text-[#1A2E3B]">
                      {inputs.laborRatePerDay} {sym}/день
                    </span>
                  )}
                </div>

                {/* Contingency Reserve */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-[#5A6778]">Непередбачувані витрати (Резерв):</span>
                  <div className="flex items-center gap-1.5">
                    {[0, 5, 10].map(pct => (
                      <button
                        key={pct}
                        onClick={() => setInputs(prev => ({ ...prev, contingencyPct: pct }))}
                        className={`px-2 py-0.5 text-[11px] font-bold rounded-lg transition-all ${
                          inputs.contingencyPct === pct
                            ? "bg-[#2E7D32] text-white"
                            : "bg-[#E8E2D8] text-[#5A6778]"
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Detailed Cost Breakdown & Visual Chart (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            {/* Visual Progress Bar Breakdown */}
            <div className="p-5 rounded-3xl tactile-card flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-[#5B9279]" />
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1A2E3B]">
                    Структура витрат проекту
                  </h3>
                </div>
                <span className="text-xs font-mono font-bold text-[#1A2E3B]">
                  100% = {estimate.totalProjectCost.toLocaleString()} {sym}
                </span>
              </div>

              {/* Stacked Progress Bar */}
              <div className="w-full h-4 rounded-xl bg-[#EEE9E1] overflow-hidden flex shadow-inner">
                {estimate.groups.map(g => (
                  <div
                    key={g.id}
                    title={`${g.title}: ${g.totalCost.toLocaleString()} ${sym} (${g.percentageOfTotal}%)`}
                    className="h-full transition-all duration-300 relative group cursor-pointer"
                    style={{ width: `${g.percentageOfTotal}%`, backgroundColor: g.color }}
                  />
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {estimate.groups.map(g => (
                  <div key={g.id} className="flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                    <span className="font-semibold text-[#1A2E3B]">{g.title.split("(")[0]}</span>
                    <span className="font-mono text-[#5A6778]">({g.percentageOfTotal}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Comprehensive Estimate Table */}
            <div className="p-5 rounded-3xl tactile-card flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#1A2E3B]">
                  Повна калькуляція кошторису за позиціями
                </h3>
                <span className="text-xs font-bold text-[#2E7D32] bg-[#E1EDE3] px-2.5 py-1 rounded-xl">
                  {estimate.groups.reduce((s, g) => s + g.items.length, 0)} позицій
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#1A2E3B]">
                  <thead className="bg-[#EEE9E1]/80 text-[#5A6778] uppercase text-[10px] font-bold border-b border-[#E8E2D8]">
                    <tr>
                      <th className="py-2.5 px-3">Матеріал / Позиція</th>
                      <th className="py-2.5 px-3 text-right">К-сть</th>
                      <th className="py-2.5 px-3 text-right">Ціна ({sym})</th>
                      <th className="py-2.5 px-3 text-right font-bold">Разом ({sym})</th>
                      <th className="py-2.5 px-3 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E2D8]/60">
                    {estimate.groups.map(g => (
                      <React.Fragment key={g.id}>
                        {/* Group Header */}
                        <tr className="bg-[#FAF7F2] font-bold text-[11px]">
                          <td colSpan={3} className="py-2 px-3 text-[#1A2E3B] flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                            <span>{g.title}</span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: g.color }}>
                            {g.totalCost.toLocaleString()} {sym}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-[10px] text-[#5A6778]">
                            {g.percentageOfTotal}%
                          </td>
                        </tr>

                        {/* Items */}
                        {g.items.map(it => (
                          <tr key={it.id} className="hover:bg-[#FAF7F2]/50 transition-colors">
                            <td className="py-2 px-3 pl-6">
                              <span className="font-bold block text-[#1A2E3B]">{it.name}</span>
                              <span className="text-[10px] text-[#5A6778] block">{it.specification}</span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-[#5A6778] whitespace-nowrap">
                              {it.quantity} {it.unit}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-[#5A6778] whitespace-nowrap">
                              {it.unitPrice.toLocaleString()} {sym}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-[#1A2E3B] whitespace-nowrap">
                              {it.totalCost.toLocaleString()} {sym}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-[10px] text-[#8C9BAE]">
                              {it.percentageOfTotal}%
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}

                    {/* Contingency row */}
                    {estimate.contingencyCost > 0 && (
                      <tr className="bg-[#FAF7F2] font-semibold">
                        <td className="py-2 px-3 pl-6">
                          <span className="font-bold text-[#1A2E3B]">Непередбачуваний резерв ({inputs.contingencyPct}%)</span>
                          <span className="text-[10px] text-[#5A6778] block">Коливання ринкових цін, доставка, розхідники</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-[#5A6778]">1 посл</td>
                        <td className="py-2 px-3 text-right font-mono text-[#5A6778]">{estimate.contingencyCost.toLocaleString()} {sym}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-[#1A2E3B]">{estimate.contingencyCost.toLocaleString()} {sym}</td>
                        <td className="py-2 px-3 text-right font-mono text-[10px] text-[#8C9BAE]">
                          {Math.round((estimate.contingencyCost / estimate.totalProjectCost) * 100)}%
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {/* Table Footer with Final Total */}
                  <tfoot className="bg-[#E1EDE3]/70 font-mono font-black text-sm border-t-2 border-[#2E7D32]">
                    <tr>
                      <td colSpan={3} className="py-3 px-3 text-[#1A3E26] uppercase">
                        Загальна вартість проекту
                      </td>
                      <td className="py-3 px-3 text-right text-[#1A3E26] text-base whitespace-nowrap">
                        {estimate.totalProjectCost.toLocaleString()} {sym}
                      </td>
                      <td className="py-3 px-3 text-right text-[#1A3E26]">
                        100%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* 4. COMMERCIAL PROPOSAL / PRINT-READY SHEET */
        <div className="bg-white p-8 rounded-3xl border border-[#DCD6CA] shadow-sm max-w-4xl mx-auto flex flex-col gap-6 text-[#1A2E3B] font-sans">
          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-[#1A2E3B] pb-4">
            <div>
              <span className="text-xs font-mono font-bold tracking-widest uppercase text-[#5B9279]">
                КуполГео CAD · Кошторисний відділ
              </span>
              <h2 className="text-xl font-extrabold text-[#1A2E3B] mt-0.5">
                Кошторис матеріалів на геодезичний купол {model.parameters.frequency}V
              </h2>
              <span className="text-xs text-[#5A6778]">
                Дата складання: {new Date().toLocaleDateString("uk-UA")} · Валюта: {estimate.currency.name}
              </span>
            </div>

            <div className="text-right">
              <span className="text-2xl font-black font-mono text-[#2E7D32] block">
                {estimate.totalProjectCost.toLocaleString()} {sym}
              </span>
              <span className="text-xs text-[#5A6778] font-semibold">
                {estimate.costPerFloorAreaM2.toLocaleString()} {sym} за 1 м² підлоги
              </span>
            </div>
          </div>

          {/* Key Dome Technical Specifications */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] text-xs">
            <div>
              <span className="text-[10px] text-[#5A6778] block">Діаметр / Висота</span>
              <span className="font-mono font-bold">{model.parameters.diameter / 1000} м × {model.parameters.height / 1000} м</span>
            </div>
            <div>
              <span className="text-[10px] text-[#5A6778] block">Площа підлоги</span>
              <span className="font-mono font-bold">{estimate.metrics.floorAreaM2} м²</span>
            </div>
            <div>
              <span className="text-[10px] text-[#5A6778] block">Площа оболонки</span>
              <span className="font-mono font-bold">{estimate.metrics.domeSurfaceAreaM2} м²</span>
            </div>
            <div>
              <span className="text-[10px] text-[#5A6778] block">Матеріал бруса</span>
              <span className="font-mono font-bold text-[#2E7D32]">{estimate.metrics.selectedSpecies?.name || "Деревина"}</span>
            </div>
            <div>
              <span className="text-[10px] text-[#5A6778] block">Частота розбивки</span>
              <span className="font-mono font-bold">{model.parameters.frequency}V ({model.parameters.cutType})</span>
            </div>
          </div>

          {/* Printable Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF7F2] text-[#1A2E3B] border-b border-[#DCD6CA]">
                  <th className="py-2 px-2.5">№</th>
                  <th className="py-2 px-2.5">Категорія та Найменування</th>
                  <th className="py-2 px-2.5 text-right">К-сть</th>
                  <th className="py-2 px-2.5 text-right">Ціна за од.</th>
                  <th className="py-2 px-2.5 text-right">Сума ({sym})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E2D8]">
                {estimate.groups.flatMap(g => g.items).map((item, idx) => (
                  <tr key={item.id}>
                    <td className="py-2 px-2.5 font-mono text-[11px] text-[#8C9BAE]">{idx + 1}</td>
                    <td className="py-2 px-2.5">
                      <span className="font-bold block">{item.name}</span>
                      <span className="text-[10px] text-[#5A6778]">{item.specification}</span>
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono whitespace-nowrap">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono whitespace-nowrap">
                      {item.unitPrice.toLocaleString()} {sym}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono font-bold whitespace-nowrap">
                      {item.totalCost.toLocaleString()} {sym}
                    </td>
                  </tr>
                ))}

                {estimate.contingencyCost > 0 && (
                  <tr>
                    <td className="py-2 px-2.5 font-mono text-[11px] text-[#8C9BAE]">—</td>
                    <td className="py-2 px-2.5">
                      <span className="font-bold block">Непередбачуваний резервний фонд ({inputs.contingencyPct}%)</span>
                      <span className="text-[10px] text-[#5A6778]">Резерв на коливання ринкових цін на матеріали</span>
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono">1 посл</td>
                    <td className="py-2 px-2.5 text-right font-mono">{estimate.contingencyCost.toLocaleString()} {sym}</td>
                    <td className="py-2 px-2.5 text-right font-mono font-bold">{estimate.contingencyCost.toLocaleString()} {sym}</td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t-2 border-[#1A2E3B] font-bold">
                <tr>
                  <td colSpan={4} className="py-3 px-2.5 text-right text-sm">
                    РАЗОМ ДО СПЛАТИ ЗА МАТЕРІАЛИ:
                  </td>
                  <td className="py-3 px-2.5 text-right text-base font-mono text-[#2E7D32]">
                    {estimate.totalProjectCost.toLocaleString()} {sym}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Proposal Signatures */}
          <div className="flex justify-between items-end pt-8 border-t border-[#DCD6CA] text-xs text-[#5A6778]">
            <div className="flex flex-col gap-1">
              <span>Склав інженер-кошторисник: ____________________ / М.П.</span>
              <span className="text-[10px]">Розрахунок дійсний протягом 30 календарних днів</span>
            </div>
            <div>
              <span>Замовник: ____________________</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
