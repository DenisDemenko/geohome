import { DomeModel } from "./types";
import { classifyConnectorTypes } from "./connectors";
import { calculateSheetNesting, getRecommendedSheetFormat } from "./sheathing";
import { calculateWindowMetrics } from "./windows";
import {
  calculateConnectorsWeightSummary,
  CONNECTOR_MATERIALS,
  CONNECTOR_COATINGS,
  ConnectorMaterialId,
  ConnectorCoatingId
} from "./connectorMaterials";

export type CurrencyCode = "UAH" | "USD" | "EUR";

export type TimberSpeciesId = "spruce" | "beech" | "oak" | "ash" | "pine";

export interface TimberSpeciesInfo {
  id: TimberSpeciesId;
  name: string;
  shortName: string;
  scientificName: string;
  density: number; // kg/m3
  bendingStrength: number; // MPa
  elasticModulus: number; // MPa
  defaultPricePerMeterUAH: number;
  hardness: string;
  description: string;
  icon: string;
  accentColor: string;
}

export const TIMBER_SPECIES: Record<TimberSpeciesId, TimberSpeciesInfo> = {
  spruce: {
    id: "spruce",
    name: "Ялинка (Смерека)",
    shortName: "Ялинка",
    scientificName: "Picea abies",
    density: 460,
    bendingStrength: 21,
    elasticModulus: 10000,
    defaultPricePerMeterUAH: 145,
    hardness: "М'яка хвойна",
    description: "Легка, світла деревина з дрібними сучками, висока пружність, найдоступніша ціна",
    icon: "🌲",
    accentColor: "#5B9279"
  },
  beech: {
    id: "beech",
    name: "Бук лісовий",
    shortName: "Бук",
    scientificName: "Fagus sylvatica",
    density: 700,
    bendingStrength: 30,
    elasticModulus: 13000,
    defaultPricePerMeterUAH: 290,
    hardness: "Твердолистяна",
    description: "Однорідна висока щільність, відмінна міцність на стиск, вимагає захисту від опадів",
    icon: "🪵",
    accentColor: "#DE7C5A"
  },
  oak: {
    id: "oak",
    name: "Дуб звичайний",
    shortName: "Дуб",
    scientificName: "Quercus robur",
    density: 740,
    bendingStrength: 32,
    elasticModulus: 12500,
    defaultPricePerMeterUAH: 520,
    hardness: "Тверда елітна",
    description: "Преміальна довговічність, виняткова стійкість до гниття та вологи, благородна текстура",
    icon: "🌳",
    accentColor: "#8C6239"
  },
  ash: {
    id: "ash",
    name: "Ясен білий",
    shortName: "Ясен",
    scientificName: "Fraxinus excelsior",
    density: 690,
    bendingStrength: 35,
    elasticModulus: 13500,
    defaultPricePerMeterUAH: 430,
    hardness: "Високопружна тверда",
    description: "Найвища міцність на згин, виразна текстура волокон, надійно утримує болтові кріплення",
    icon: "🌿",
    accentColor: "#4A7C9B"
  },
  pine: {
    id: "pine",
    name: "Сосна звичайна (С24)",
    shortName: "Сосна",
    scientificName: "Pinus sylvestris",
    density: 500,
    bendingStrength: 24,
    elasticModulus: 11000,
    defaultPricePerMeterUAH: 180,
    hardness: "Хвойна конструкційна",
    description: "Класичний будівельний сухий струганий брус, висока смолистість, оптимальний баланс ціна/якість",
    icon: "🌲",
    accentColor: "#2E7D32"
  }
};

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  rateToUAH: number; // For preset conversion
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  UAH: { code: "UAH", symbol: "₴", name: "Гривня (UAH)", rateToUAH: 1.0 },
  USD: { code: "USD", symbol: "$", name: "Долар США (USD)", rateToUAH: 41.5 },
  EUR: { code: "EUR", symbol: "€", name: "Євро (EUR)", rateToUAH: 45.2 }
};

export interface MaterialCostInputs {
  currency: CurrencyCode;
  /** Selected timber species */
  timberSpecies: TimberSpeciesId;
  /** Price per linear meter of timber beam */
  timberPricePerMeter: number;
  /** Wastage allowance for timber cutting (e.g. 5%) */
  timberWastePct: number;
  /** Price per sheet of plywood / sheathing */
  plywoodPricePerSheet: number;
  /** Connector metal pricing mode */
  connectorPricingMode: "per_piece" | "per_kg";
  /** Price per connector unit (if per_piece) */
  connectorPricePerUnit: number;
  /** Price per kg of laser cut & bent metal (if per_kg) */
  connectorPricePerKg: number;
  /** Bolt set price (bolt + lock nut + 2 washers) */
  fastenerSetPrice: number;
  /** Include foundation anchor bolts */
  includeFoundationAnchors: boolean;
  anchorPricePerUnit: number;
  /** Include wood protective antiseptic */
  includeWoodAntiseptic: boolean;
  antisepticPricePerLiter: number;
  /** Include sealing tape */
  includeSealingTape: boolean;
  sealingTapePricePerMeter: number;
  /** Include assembly / manufacturing labor */
  includeLabor: boolean;
  laborRatePerDay: number;
  estimatedLaborDays: number;
  /** Contingency / unforeseen reserve percentage (e.g. 5%) */
  contingencyPct: number;
}

export const DEFAULT_COST_INPUTS: MaterialCostInputs = {
  currency: "UAH",
  timberSpecies: "spruce",
  timberPricePerMeter: 145, // ~145 UAH / m for spruce (ялинка / смерека)
  timberWastePct: 5,
  plywoodPricePerSheet: 880, // ~880 UAH per sheet of 1250x2500 FSF 12mm
  connectorPricingMode: "per_piece",
  connectorPricePerUnit: 290, // ~290 UAH per finished star connector plate
  connectorPricePerKg: 110, // ~110 UAH/kg for CNC cut steel
  fastenerSetPrice: 18, // ~18 UAH per high tensile M10 bolt + nut + 2 washers
  includeFoundationAnchors: true,
  anchorPricePerUnit: 75,
  includeWoodAntiseptic: true,
  antisepticPricePerLiter: 95,
  includeSealingTape: true,
  sealingTapePricePerMeter: 35,
  includeLabor: false,
  laborRatePerDay: 2200,
  estimatedLaborDays: 4,
  contingencyPct: 5
};

export interface CostCategoryItem {
  id: string;
  name: string;
  specification: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalCost: number;
  percentageOfTotal: number;
  color: string;
}

export interface CostCategoryGroup {
  id: "timber" | "connectors" | "sheathing" | "windows" | "fasteners" | "auxiliary" | "labor";
  title: string;
  iconName: string;
  totalCost: number;
  percentageOfTotal: number;
  color: string;
  items: CostCategoryItem[];
}

export interface ProjectCostEstimate {
  inputs: MaterialCostInputs;
  currency: CurrencyConfig;
  groups: CostCategoryGroup[];
  subtotalMaterialsCost: number;
  contingencyCost: number;
  laborCost: number;
  totalProjectCost: number;
  costPerFloorAreaM2: number;
  costPerDomeSurfaceM2: number;
  metrics: {
    selectedSpecies: TimberSpeciesInfo;
    totalLinearMetersTimber: number;
    timberWithWasteMeters: number;
    totalWoodVolumeM3: number;
    totalTimberWeightKg: number;
    totalPlywoodSheets: number;
    totalConnectorsCount: number;
    totalMetalWeightKg: number;
    totalFastenersCount: number;
    totalAnchorsCount: number;
    floorAreaM2: number;
    domeSurfaceAreaM2: number;
  };
}

/**
 * Calculates complete project budget and material estimates
 */
export function calculateProjectCostEstimate(
  model: DomeModel,
  inputs: MaterialCostInputs = DEFAULT_COST_INPUTS
): ProjectCostEstimate {
  const currency = CURRENCIES[inputs.currency] || CURRENCIES.UAH;
  const { parameters, beamProfile, connectorParams, statistics } = model;
  const selectedSpecies = TIMBER_SPECIES[inputs.timberSpecies] || TIMBER_SPECIES.spruce;

  // 1. Timber Beams Calculation
  const totalLinearMetersTimber = Math.round(
    model.beamGroups.reduce((sum, g) => sum + (g.length * g.count) / 1000, 0) * 10
  ) / 10;
  const timberWasteFactor = 1 + Math.max(0, inputs.timberWastePct) / 100;
  const timberWithWasteMeters = Math.round(totalLinearMetersTimber * timberWasteFactor * 10) / 10;
  const isRound = beamProfile.type === "circular" || beamProfile.type === "pipe";
  const dVal = beamProfile.diameter || beamProfile.width;
  const beamCrossSectionM2 = isRound
    ? (beamProfile.type === "pipe"
        ? (Math.PI / 4) * (Math.pow(dVal / 1000, 2) - Math.pow(Math.max(0, dVal - 2 * (beamProfile.wallThickness || 3)) / 1000, 2))
        : (Math.PI / 4) * Math.pow(dVal / 1000, 2))
    : (beamProfile.width / 1000) * (beamProfile.depth / 1000);
  const totalWoodVolumeM3 = Math.round(timberWithWasteMeters * beamCrossSectionM2 * 100) / 100;
  const totalTimberWeightKg = Math.round(totalWoodVolumeM3 * selectedSpecies.density);
  const timberTotalCost = Math.round(timberWithWasteMeters * inputs.timberPricePerMeter);

  const profileDimText = isRound
    ? (beamProfile.type === "pipe" ? `Ø ${dVal}×${beamProfile.wallThickness || 3} мм` : `Ø ${dVal} мм`)
    : `${beamProfile.width}×${beamProfile.depth} мм`;

  const timberItems: CostCategoryItem[] = [
    {
      id: "timber_struts",
      name: `${isRound ? "Круглий переріз" : "Брус"}: ${selectedSpecies.name} (${profileDimText})`,
      specification: `Порода: ${selectedSpecies.shortName} (${selectedSpecies.scientificName}, густина ${selectedSpecies.density} кг/м³, міцність ${selectedSpecies.bendingStrength} МПа). Балки: ${model.edges.length} шт (${totalLinearMetersTimber} м + ${inputs.timberWastePct}% запас = ${timberWithWasteMeters} м)`,
      quantity: timberWithWasteMeters,
      unit: "пог. м",
      unitPrice: inputs.timberPricePerMeter,
      totalCost: timberTotalCost,
      percentageOfTotal: 0,
      color: selectedSpecies.accentColor || "#2E7D32"
    }
  ];

  // 2. Connectors Calculation
  const connectorTypes = classifyConnectorTypes(model, connectorParams);
  const totalConnectorsCount = connectorTypes.reduce((sum, t) => sum + t.countInDome, 0);

  // Precise connector weight and material calculation based on chosen material and coating
  const weightSummary = calculateConnectorsWeightSummary(model, connectorTypes);
  const totalMetalWeightKg = weightSummary.totalWeightKg;

  const matKey = (connectorParams.material as ConnectorMaterialId) || "steel_st3";
  const matInfo = CONNECTOR_MATERIALS[matKey] || CONNECTOR_MATERIALS.steel_st3;
  const coatKey = (connectorParams.coating as ConnectorCoatingId) || matInfo.defaultCoating;
  const coatInfo = CONNECTOR_COATINGS[coatKey] || CONNECTOR_COATINGS[matInfo.defaultCoating];

  let connectorsTotalCost = 0;
  if (inputs.connectorPricingMode === "per_piece") {
    connectorsTotalCost = Math.round(totalConnectorsCount * inputs.connectorPricePerUnit);
  } else {
    connectorsTotalCost = Math.round(totalMetalWeightKg * inputs.connectorPricePerKg);
  }

  const connectorThicknessText =
    connectorParams.rayType === "round_tube"
      ? `трубна гільза стінка ${connectorParams.wallThickness || 2.5} мм`
      : `товщина ${connectorParams.thickness} мм`;

  const connectorItems: CostCategoryItem[] = [
    {
      id: "connectors_plates",
      name: `Вузлові конектори (${matInfo.shortName}, ${connectorThicknessText})`,
      specification:
        inputs.connectorPricingMode === "per_piece"
          ? `Виготовлення: ${totalConnectorsCount} шт. (${connectorTypes.length} типорозмірів) · Покриття: ${coatInfo.name}`
          : `Розрахункова маса: ${totalMetalWeightKg} кг (${matInfo.name}) · Покриття: ${coatInfo.name} (${coatInfo.standard})`,
      quantity: inputs.connectorPricingMode === "per_piece" ? totalConnectorsCount : totalMetalWeightKg,
      unit: inputs.connectorPricingMode === "per_piece" ? "шт" : "кг",
      unitPrice: inputs.connectorPricingMode === "per_piece" ? inputs.connectorPricePerUnit : inputs.connectorPricePerKg,
      totalCost: connectorsTotalCost,
      percentageOfTotal: 0,
      color: "#4A7C9B"
    }
  ];

  // 3. Sheathing / Plywood Calculation
  const recSheet = getRecommendedSheetFormat(model);
  const nesting = calculateSheetNesting(model, recSheet.w, recSheet.h, 6);
  const totalPlywoodSheets = nesting.totalSheetsRequired;
  const plywoodThickness = model.sheathingParams?.thickness || 12;
  const sheathingTotalCost = Math.round(totalPlywoodSheets * inputs.plywoodPricePerSheet);

  const sheathingItems: CostCategoryItem[] = [
    {
      id: "sheathing_sheets",
      name: `Вологостійка фанера / OSB (${plywoodThickness} мм, формат ${recSheet.w}×${recSheet.h} мм)`,
      specification: `Для розкрою ${model.faces.length} трикутних панелей обшивки (площа купола ${statistics.domeSurfaceAreaM2} м²)`,
      quantity: totalPlywoodSheets,
      unit: "листів",
      unitPrice: inputs.plywoodPricePerSheet,
      totalCost: sheathingTotalCost,
      percentageOfTotal: 0,
      color: "#DDA843"
    }
  ];

  // 3b. Converted Windows & Glazing Calculation (if any faces converted to windows)
  const windowFaceIds = model.windowFaceIds || [];
  let windowsTotalCost = 0;
  const windowItems: CostCategoryItem[] = [];

  if (windowFaceIds.length > 0) {
    const windowMetrics = calculateWindowMetrics(model, windowFaceIds, model.windowParams);
    windowsTotalCost = windowMetrics.totalCostUAH;

    windowItems.push(
      {
        id: "windows_glass",
        name: `Скління купола: ${windowMetrics.glazing.name} (${windowMetrics.validWindowCount} шт)`,
        specification: `Склопакети на гранях каркасу, площа ${windowMetrics.totalAreaM2} м², товщина ${windowMetrics.glazing.thicknessMm} мм, розрахункова вага скла ${windowMetrics.glassWeightKg} кг`,
        quantity: windowMetrics.totalAreaM2,
        unit: "м²",
        unitPrice: windowMetrics.glazing.pricePerM2UAH,
        totalCost: windowMetrics.glassCostUAH,
        percentageOfTotal: 0,
        color: "#0284C7"
      },
      {
        id: "windows_frame",
        name: `Притискний оклад: ${windowMetrics.frame.name}`,
        specification: `Алюмінієвий профіль з EPDM-ущільнювачем по контуру граней (${windowMetrics.totalPerimeterM} пог. м), вага ${windowMetrics.frameWeightKg} кг`,
        quantity: windowMetrics.totalPerimeterM,
        unit: "пог. м",
        unitPrice: windowMetrics.frame.pricePerMeterUAH,
        totalCost: windowMetrics.frameCostUAH,
        percentageOfTotal: 0,
        color: "#38BDF8"
      }
    );
  }

  // 4. Fasteners & Anchors Calculation
  const boltHoleCount = connectorParams.boltHoleCount || 2;
  const totalFastenersCount = model.edges.length * 2 * boltHoleCount;
  const fastenersTotalCost = Math.round(totalFastenersCount * inputs.fastenerSetPrice);

  const baseNodesCount = model.nodes.filter(n => n.boundary).length;
  const totalAnchorsCount = baseNodesCount * 2;
  const anchorsTotalCost = inputs.includeFoundationAnchors
    ? Math.round(totalAnchorsCount * inputs.anchorPricePerUnit)
    : 0;

  const fastenerItems: CostCategoryItem[] = [
    {
      id: "fasteners_bolts",
      name: `Комплекти високоміцних болтів M${connectorParams.boltDiameter} (DIN 933 + DIN 985 + шайби)`,
      specification: `Болт 8.8 цинк + самоконтра гайка + 2 посилені кузовні шайби`,
      quantity: totalFastenersCount,
      unit: "компл",
      unitPrice: inputs.fastenerSetPrice,
      totalCost: fastenersTotalCost,
      percentageOfTotal: 0,
      color: "#DE7C5A"
    },
    ...(inputs.includeFoundationAnchors
      ? [
          {
            id: "fasteners_anchors",
            name: "Анкери фундаментні розпірні M12×150 мм",
            specification: `Кріплення ${baseNodesCount} опорних вузлів основи купола до фундаменту`,
            quantity: totalAnchorsCount,
            unit: "шт",
            unitPrice: inputs.anchorPricePerUnit,
            totalCost: anchorsTotalCost,
            percentageOfTotal: 0,
            color: "#C25E3E"
          }
        ]
      : [])
  ];

  // 5. Auxiliary Consumables Calculation
  const auxiliaryItems: CostCategoryItem[] = [];

  // Antiseptic: ~0.25 L per m2 of timber surface
  const timberSurfaceAreaM2 = Math.round(
    timberWithWasteMeters * 2 * ((beamProfile.width + beamProfile.depth) / 1000) * 10
  ) / 10;
  const antisepticLiters = Math.ceil(timberSurfaceAreaM2 * 0.25);
  const antisepticCost = inputs.includeWoodAntiseptic
    ? Math.round(antisepticLiters * inputs.antisepticPricePerLiter)
    : 0;

  if (inputs.includeWoodAntiseptic) {
    auxiliaryItems.push({
      id: "aux_antiseptic",
      name: "Вогнебіозахист та антисептик глибокого проникнення (ГОСТ 1-2 група)",
      specification: `Обробка ${timberSurfaceAreaM2} м² поверхні бруса каркаса (норма ~250 мл/м²)`,
      quantity: antisepticLiters,
      unit: "л",
      unitPrice: inputs.antisepticPricePerLiter,
      totalCost: antisepticCost,
      percentageOfTotal: 0,
      color: "#5B9279"
    });
  }

  // Sealing Tape: ~2 meters per connector ray
  const sealingTapeMeters = Math.ceil(totalConnectorsCount * 5 * 0.2);
  const sealingTapeCost = inputs.includeSealingTape
    ? Math.round(sealingTapeMeters * inputs.sealingTapePricePerMeter)
    : 0;

  if (inputs.includeSealingTape) {
    auxiliaryItems.push({
      id: "aux_sealing_tape",
      name: "Стрічка ущільнювальна бутилкаучукова / EPDM",
      specification: `Гідроізоляція та вібророзв'язка між металом конекторів і деревиною`,
      quantity: sealingTapeMeters,
      unit: "пог. м",
      unitPrice: inputs.sealingTapePricePerMeter,
      totalCost: sealingTapeCost,
      percentageOfTotal: 0,
      color: "#3F8A6B"
    });
  }

  // 6. Labor (Optional)
  const laborItems: CostCategoryItem[] = [];
  const laborCost = inputs.includeLabor
    ? Math.round(inputs.laborRatePerDay * inputs.estimatedLaborDays)
    : 0;

  if (inputs.includeLabor) {
    laborItems.push({
      id: "labor_assembly",
      name: "Виробничі та монтажні роботи бригади",
      specification: `Торцювання, свердління отворів та повний монтаж купола на об'єкті`,
      quantity: inputs.estimatedLaborDays,
      unit: "змін",
      unitPrice: inputs.laborRatePerDay,
      totalCost: laborCost,
      percentageOfTotal: 0,
      color: "#8C52FF"
    });
  }

  // Sum categories
  const subtotalMaterialsCost =
    timberTotalCost +
    connectorsTotalCost +
    sheathingTotalCost +
    windowsTotalCost +
    fastenersTotalCost +
    anchorsTotalCost +
    antisepticCost +
    sealingTapeCost;

  const contingencyCost = Math.round(
    (subtotalMaterialsCost + laborCost) * (Math.max(0, inputs.contingencyPct) / 100)
  );

  const totalProjectCost = subtotalMaterialsCost + laborCost + contingencyCost;

  // Build groups
  const groups: CostCategoryGroup[] = [
    {
      id: "timber",
      title: "Пиломатеріали (Брус каркаса)",
      iconName: "Ruler",
      totalCost: timberTotalCost,
      percentageOfTotal: Math.round((timberTotalCost / Math.max(1, totalProjectCost)) * 100),
      color: "#2E7D32",
      items: timberItems
    },
    {
      id: "connectors",
      title: "Металеві конектори (Thunder Domes)",
      iconName: "Disc",
      totalCost: connectorsTotalCost,
      percentageOfTotal: Math.round((connectorsTotalCost / Math.max(1, totalProjectCost)) * 100),
      color: "#4A7C9B",
      items: connectorItems
    },
    {
      id: "sheathing",
      title: "Плитні матеріали обшивки (Фанера / OSB)",
      iconName: "Layers",
      totalCost: sheathingTotalCost,
      percentageOfTotal: Math.round((sheathingTotalCost / Math.max(1, totalProjectCost)) * 100),
      color: "#DDA843",
      items: sheathingItems
    },
    ...(windowsTotalCost > 0
      ? [
          {
            id: "windows" as const,
            title: `Скління та вікна купола (${windowFaceIds.length} шт)`,
            iconName: "Sun",
            totalCost: windowsTotalCost,
            percentageOfTotal: Math.round((windowsTotalCost / Math.max(1, totalProjectCost)) * 100),
            color: "#0284C7",
            items: windowItems
          }
        ]
      : []),
    {
      id: "fasteners" as const,
      title: "Кріплення та метизи (Болти, гайки, анкери)",
      iconName: "Hammer",
      totalCost: fastenersTotalCost + anchorsTotalCost,
      percentageOfTotal: Math.round(((fastenersTotalCost + anchorsTotalCost) / Math.max(1, totalProjectCost)) * 100),
      color: "#DE7C5A",
      items: fastenerItems
    },
    ...(auxiliaryItems.length > 0
      ? [
          {
            id: "auxiliary" as const,
            title: "Супутні матеріали (Захист, ущільнення)",
            iconName: "ShieldCheck",
            totalCost: antisepticCost + sealingTapeCost,
            percentageOfTotal: Math.round(((antisepticCost + sealingTapeCost) / Math.max(1, totalProjectCost)) * 100),
            color: "#5B9279",
            items: auxiliaryItems
          }
        ]
      : []),
    ...(laborItems.length > 0
      ? [
          {
            id: "labor" as const,
            title: "Роботи та монтаж",
            iconName: "Users",
            totalCost: laborCost,
            percentageOfTotal: Math.round((laborCost / Math.max(1, totalProjectCost)) * 100),
            color: "#8C52FF",
            items: laborItems
          }
        ]
      : [])
  ];

  // Update item percentages
  groups.forEach(g => {
    g.items.forEach(it => {
      it.percentageOfTotal = Math.round((it.totalCost / Math.max(1, totalProjectCost)) * 1000) / 10;
    });
  });

  const floorArea = Math.max(0.1, statistics.floorAreaM2);
  const domeSurfaceArea = Math.max(0.1, statistics.domeSurfaceAreaM2);
  const costPerFloorAreaM2 = Math.round((totalProjectCost / floorArea) * 10) / 10;
  const costPerDomeSurfaceM2 = Math.round((totalProjectCost / domeSurfaceArea) * 10) / 10;

  return {
    inputs,
    currency,
    groups,
    subtotalMaterialsCost,
    contingencyCost,
    laborCost,
    totalProjectCost,
    costPerFloorAreaM2,
    costPerDomeSurfaceM2,
    metrics: {
      selectedSpecies,
      totalLinearMetersTimber,
      timberWithWasteMeters,
      totalWoodVolumeM3,
      totalTimberWeightKg,
      totalPlywoodSheets,
      totalConnectorsCount,
      totalMetalWeightKg,
      totalFastenersCount,
      totalAnchorsCount,
      floorAreaM2: statistics.floorAreaM2,
      domeSurfaceAreaM2: statistics.domeSurfaceAreaM2
    }
  };
}

/**
 * Exports Cost Estimate to clean CSV format for Excel
 */
export function exportCostEstimateCSV(estimate: ProjectCostEstimate, model: DomeModel): string {
  const sym = estimate.currency.symbol;
  const lines: string[] = [];

  lines.push(`Кошторис матеріалів та бюджет проекту геодезичного купола`);
  lines.push(`Проект: Купол ${model.parameters.frequency}V (D=${model.parameters.diameter / 1000}м, H=${model.parameters.height / 1000}м)`);
  lines.push(`Площа підлоги: ${estimate.metrics.floorAreaM2} м²; Площа оболонки: ${estimate.metrics.domeSurfaceAreaM2} м²`);
  lines.push(`Дата складання: ${new Date().toLocaleDateString("uk-UA")}`);
  lines.push(`Валюта кошторису: ${estimate.currency.name}`);
  lines.push("");
  lines.push(`Категорія;Найменування матеріалу;Специфікація;Кількість;Одиниця;Ціна за од. (${sym});Разом (${sym});% від бюджету`);

  estimate.groups.forEach(g => {
    g.items.forEach(it => {
      lines.push(
        [
          `"${g.title}"`,
          `"${it.name.replace(/"/g, '""')}"`,
          `"${it.specification.replace(/"/g, '""')}"`,
          it.quantity,
          `"${it.unit}"`,
          it.unitPrice.toFixed(2),
          it.totalCost.toFixed(2),
          `${it.percentageOfTotal}%`
        ].join(";")
      );
    });
  });

  if (estimate.contingencyCost > 0) {
    lines.push(
      [
        `"Резерв"`,
        `"Непередбачувані витрати (${estimate.inputs.contingencyPct}%)"`,
        `"Резервний фонд на коливання цін та додаткові витрати"`,
        1,
        `"послуга"`,
        estimate.contingencyCost.toFixed(2),
        estimate.contingencyCost.toFixed(2),
        `${Math.round((estimate.contingencyCost / estimate.totalProjectCost) * 100)}%`
      ].join(";")
    );
  }

  lines.push("");
  lines.push(`Підсумок матеріалів:;;;;;;"${estimate.subtotalMaterialsCost.toFixed(2)} ${sym}";`);
  lines.push(`ЗАГАЛЬНИЙ КОШТОРИС ПРОЕКТУ:;;;;;;"${estimate.totalProjectCost.toFixed(2)} ${sym}";100%`);
  lines.push(`Вартість 1 м² площі підлоги:;;;;;;"${estimate.costPerFloorAreaM2.toFixed(2)} ${sym}/м²";`);
  lines.push(`Вартість 1 м² купола:;;;;;;"${estimate.costPerDomeSurfaceM2.toFixed(2)} ${sym}/м²";`);

  return "\uFEFF" + lines.join("\r\n");
}
