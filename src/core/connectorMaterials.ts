import { BeamProfile, ConnectorParams, ConnectorTypeSummary, DomeModel } from "./types";

export type ConnectorMaterialCategory = "steel" | "aluminum" | "plastic";

export type ConnectorMaterialId =
  | "steel_st3"
  | "steel_st20"
  | "stainless_304"
  | "aluminum_d16t"
  | "aluminum_6061"
  | "plastic_petg"
  | "plastic_abs"
  | "plastic_nylon";

export type ConnectorCoatingId =
  // Сталеві покриття
  | "hot_dip_galvanized"       // Гаряче цинкування (60-80 мкм, ISO 1461, максимальний 25+ років захист)
  | "electro_galvanized"       // Гальванічне цинкування (білий/райдужний цинк 9-12 мкм)
  | "powder_coated_black"      // Порошкове полімерне фарбування (Чорний оксамит RAL 9005)
  | "powder_coated_anthracite" // Порошкове полімерне фарбування (Антрацит графіт RAL 7016)
  | "primer_enamel"            // Антикорозійний ґрунт ГФ-021 + емаль ПФ-115
  | "raw_metal"                // Без покриття (сирий метал під зварювання)
  // Алюмінієві покриття
  | "anodized_silver"          // Природне сріблясте анодування (15-20 мкм)
  | "anodized_black"           // Глибоке чорне анодування
  | "powder_coated_white"      // Порошкове полімерне фарбування (Білий RAL 9016)
  | "powder_coated_anthracite_al" // Порошкове фарбування алюмінію (Антрацит RAL 7016)
  | "raw_aluminum"             // Без покриття (природна стійка оксидна плівка)
  // Пластикові покриття (3D-друк / лиття)
  | "raw_plastic"              // Без фарбування (колір філаменту / натуральний)
  | "uv_protective_coating"    // УФ-захисний акрилово-поліуретановий лак
  | "hydrophobic_seal";        // Гідрофобне силіконове просочення міжшарових мікропор

export interface MaterialOption {
  id: ConnectorMaterialId;
  category: ConnectorMaterialCategory;
  name: string;
  shortName: string;
  densityKgM3: number; // кг/м³ (напр. 7850 для сталі, 2700 для алюмінію, 1270 для PETG)
  yieldStrengthMpa: number; // границя текучості МПа
  description: string;
  recommendedFor: string;
  defaultCoating: ConnectorCoatingId;
  baseColorHex: number;
  roughness: number;
  metalness: number;
}

export interface CoatingOption {
  id: ConnectorCoatingId;
  category: ConnectorMaterialCategory;
  name: string;
  standard: string;
  thicknessMicrons: string;
  durabilityYears: string;
  description: string;
  colorHex: number;
  roughness: number;
  metalness: number;
}

export const CONNECTOR_MATERIALS: Record<ConnectorMaterialId, MaterialOption> = {
  steel_st3: {
    id: "steel_st3",
    category: "steel",
    name: "Конструкційна сталь Ст3 (Вуглецева)",
    shortName: "Сталь Ст3",
    densityKgM3: 7850,
    yieldStrengthMpa: 245,
    description: "Найпопулярніша сталь для лазерного розкрою та гнуття. Висока жорсткість та доступна ціна.",
    recommendedFor: "Куполи для житла, навісів, великих геокуполів з високими вітровими навантаженнями.",
    defaultCoating: "hot_dip_galvanized",
    baseColorHex: 0x8a99a8,
    roughness: 0.35,
    metalness: 0.85
  },
  steel_st20: {
    id: "steel_st20",
    category: "steel",
    name: "Конструкційна якісна сталь Ст20",
    shortName: "Сталь якісна 20",
    densityKgM3: 7850,
    yieldStrengthMpa: 250,
    description: "Підвищена в'язкість і стійкість до циклічних вигинів. Відмінна зварюваність для трубних хабів.",
    recommendedFor: "Зварні трубні вузли Pipe Hub та відповідальні силові каркаси.",
    defaultCoating: "powder_coated_anthracite",
    baseColorHex: 0x768595,
    roughness: 0.4,
    metalness: 0.82
  },
  stainless_304: {
    id: "stainless_304",
    category: "steel",
    name: "Нержавіюча сталь AISI 304 (08Х18Н10)",
    shortName: "Нержавійка 304",
    densityKgM3: 7930,
    yieldStrengthMpa: 290,
    description: "Абсолютна стійкість до атмосферної корозії та вологості без додаткового фарбування.",
    recommendedFor: "Елітні скляні глемпінги, оранжереї, басейни та прибережні солоні зони.",
    defaultCoating: "raw_metal",
    baseColorHex: 0xd8dde3,
    roughness: 0.18,
    metalness: 0.95
  },
  aluminum_d16t: {
    id: "aluminum_d16t",
    category: "aluminum",
    name: "Авіаційний алюміній Д16Т (2024-T4)",
    shortName: "Алюміній Д16Т",
    densityKgM3: 2780,
    yieldStrengthMpa: 325,
    description: "У 2.8 разів легший за сталь за збереження високої міцності. Знижує вагу вузлів на понад 64%.",
    recommendedFor: "Швидкомонтовані мобільні куполи, виставкові павільйони, легкі геодезичні намети.",
    defaultCoating: "anodized_silver",
    baseColorHex: 0xd2d9df,
    roughness: 0.28,
    metalness: 0.88
  },
  aluminum_6061: {
    id: "aluminum_6061",
    category: "aluminum",
    name: "Конструкційний алюміній 6061-T6 (АД31Т)",
    shortName: "Алюміній 6061-T6",
    densityKgM3: 2700,
    yieldStrengthMpa: 276,
    description: "Ідеально підходить для анодування в будь-які кольори, стійкий до морського клімату.",
    recommendedFor: "Теплиці, архітектурні геокуполи з алюмінієвими трубчастими ребрами.",
    defaultCoating: "anodized_black",
    baseColorHex: 0xc4cbd2,
    roughness: 0.25,
    metalness: 0.85
  },
  plastic_petg: {
    id: "plastic_petg",
    category: "plastic",
    name: "Ударостійкий інженерний PETG (3D-друк)",
    shortName: "Пластик PETG",
    densityKgM3: 1270,
    yieldStrengthMpa: 50,
    description: "У 6.2 разів легший за сталь! Чудова адгезія шарів, стійкість до сонця та вологи.",
    recommendedFor: "Куполи-теплиці, геодезичні куполи діаметром до 5 метрів, навчальні та макетні конструкції.",
    defaultCoating: "raw_plastic",
    baseColorHex: 0x3b82f6,
    roughness: 0.55,
    metalness: 0.08
  },
  plastic_abs: {
    id: "plastic_abs",
    category: "plastic",
    name: "Термостійкий інженерний ABS (3D / лиття)",
    shortName: "Пластик ABS",
    densityKgM3: 1050,
    yieldStrengthMpa: 45,
    description: "У 7.5 разів легший за сталь! Стійкий до високих температур (+85°C), пластичний.",
    recommendedFor: "Вироби методом 3D-друку або серійного лиття під тиском у прес-форми.",
    defaultCoating: "uv_protective_coating",
    baseColorHex: 0x22262b,
    roughness: 0.6,
    metalness: 0.05
  },
  plastic_nylon: {
    id: "plastic_nylon",
    category: "plastic",
    name: "Композитний Nylon PA-CF (Вуглеволокно)",
    shortName: "Нейлон PA-CF",
    densityKgM3: 1180,
    yieldStrengthMpa: 95,
    description: "Надміцний поліамід, армований 20% рубаним карбоновим волокном. Витримує колосальні розривні зусилля.",
    recommendedFor: "Професійні легкі експедиційні геокуполи та міцні 3D-друковані хаби.",
    defaultCoating: "raw_plastic",
    baseColorHex: 0x181a1c,
    roughness: 0.7,
    metalness: 0.12
  }
};

export const CONNECTOR_COATINGS: Record<ConnectorCoatingId, CoatingOption> = {
  // Сталеві
  hot_dip_galvanized: {
    id: "hot_dip_galvanized",
    category: "steel",
    name: "Гаряче цинкування (Hot-Dip Galvanized)",
    standard: "ДСТУ EN ISO 1461",
    thicknessMicrons: "60–85 мкм",
    durabilityYears: "30+ років",
    description: "Занурення у ванну з розплавленим цинком (+450°C). Утворює сплав із залізом, повний самовідновлювальний захист.",
    colorHex: 0x93a2b0,
    roughness: 0.4,
    metalness: 0.88
  },
  electro_galvanized: {
    id: "electro_galvanized",
    category: "steel",
    name: "Гальванічне цинкування (Білий цинк)",
    standard: "ГОСТ 9.301-86",
    thicknessMicrons: "9–15 мкм",
    durabilityYears: "8–12 років",
    description: "Електрохімічне нанесення цинку. Блискуча гладка естетична поверхня, гарний базовий захист.",
    colorHex: 0xb5c3ce,
    roughness: 0.28,
    metalness: 0.9
  },
  powder_coated_black: {
    id: "powder_coated_black",
    category: "steel",
    name: "Порошкове фарбування Чорний матовий (RAL 9005)",
    standard: "Qualicoat Class 1",
    thicknessMicrons: "70–90 мкм",
    durabilityYears: "15–20 років",
    description: "Електростатичне напилення поліефірної порошкової фарби з полімеризацією при +200°C. Преміальний вигляд.",
    colorHex: 0x22262a,
    roughness: 0.65,
    metalness: 0.18
  },
  powder_coated_anthracite: {
    id: "powder_coated_anthracite",
    category: "steel",
    name: "Порошкове фарбування Антрацит графіт (RAL 7016)",
    standard: "Qualicoat Class 2",
    thicknessMicrons: "70–90 мкм",
    durabilityYears: "18–25 років",
    description: "Сучасний архітектурний темно-сірий графітний колір. Висока стійкість до ультрафіолету та подряпин.",
    colorHex: 0x373f47,
    roughness: 0.55,
    metalness: 0.25
  },
  primer_enamel: {
    id: "primer_enamel",
    category: "steel",
    name: "Антикорозійний ґрунт ГФ-021 + Емаль ПФ-115",
    standard: "ГОСТ 25129-82",
    thicknessMicrons: "40–60 мкм",
    durabilityYears: "5–8 років",
    description: "Традиційне фарбування: фосфатуючий захисний ґрунт з фінішним покриттям у 2 шари.",
    colorHex: 0x546270,
    roughness: 0.5,
    metalness: 0.35
  },
  raw_metal: {
    id: "raw_metal",
    category: "steel",
    name: "Без покриття (Чистий метал під зварювання / Нержавійка)",
    standard: "Без покриття",
    thicknessMicrons: "0 мкм",
    durabilityYears: "Необмежено (для 304) / потребує фарбування",
    description: "Оригінальна поверхня прокату для самостійного зварювання, оксидування або нержавіючої сталі AISI 304.",
    colorHex: 0xd6dde3,
    roughness: 0.22,
    metalness: 0.92
  },

  // Алюмінієві
  anodized_silver: {
    id: "anodized_silver",
    category: "aluminum",
    name: "Захисне сріблясте анодування (Natural Silver)",
    standard: "Qualanod ISO 7599",
    thicknessMicrons: "15–20 мкм",
    durabilityYears: "25+ років",
    description: "Електрохімічне зміцнення оксидного шару. Не лущиться, захищає від солей та стирання.",
    colorHex: 0xdfe5ea,
    roughness: 0.25,
    metalness: 0.88
  },
  anodized_black: {
    id: "anodized_black",
    category: "aluminum",
    name: "Глибоке чорне анодування (Hard Black Anodizing)",
    standard: "MIL-A-8625 Type III",
    thicknessMicrons: "25–35 мкм",
    durabilityYears: "30+ років",
    description: "Надтвердий оксидний шар вугільно-чорного відтінку з підвищеною мікротвердістю до 450 HV.",
    colorHex: 0x1f2124,
    roughness: 0.35,
    metalness: 0.6
  },
  powder_coated_white: {
    id: "powder_coated_white",
    category: "aluminum",
    name: "Порошкове фарбування Білий глянець (RAL 9016)",
    standard: "Qualicoat Class 1",
    thicknessMicrons: "60–80 мкм",
    durabilityYears: "15+ років",
    description: "Сніжно-біле покриття, що відбиває тепло і гармоніює з білими тентами та прозорим склінням.",
    colorHex: 0xf4f6f8,
    roughness: 0.3,
    metalness: 0.15
  },
  powder_coated_anthracite_al: {
    id: "powder_coated_anthracite_al",
    category: "aluminum",
    name: "Порошкове фарбування Антрацит (RAL 7016)",
    standard: "Qualicoat Class 2",
    thicknessMicrons: "60–80 мкм",
    durabilityYears: "18+ років",
    description: "Стійка полімерна пудра для алюмінієвих профілів та пластин.",
    colorHex: 0x363d44,
    roughness: 0.5,
    metalness: 0.2
  },
  raw_aluminum: {
    id: "raw_aluminum",
    category: "aluminum",
    name: "Без покриття (Природна оксидна плівка алюмінію)",
    standard: "Без покриття",
    thicknessMicrons: "0.1 мкм",
    durabilityYears: "10–15 років",
    description: "Природний захист за рахунок утворення тонкої міцної плівки Al2O3 на відкритому повітрі.",
    colorHex: 0xcfd6dc,
    roughness: 0.3,
    metalness: 0.8
  },

  // Пластикові
  raw_plastic: {
    id: "raw_plastic",
    category: "plastic",
    name: "Без додаткового покриття (Оригінальний колір філаменту)",
    standard: "3D Print Raw",
    thicknessMicrons: "—",
    durabilityYears: "5–8 років (в тіні)",
    description: "Натуральна поверхня 3D-друку або виробу після лиття без додаткової хімічної обробки.",
    colorHex: 0x38414a,
    roughness: 0.65,
    metalness: 0.05
  },
  uv_protective_coating: {
    id: "uv_protective_coating",
    category: "plastic",
    name: "Поліуретановий УФ-захисний лак (UV-Resistant Clear Coat)",
    standard: "ASTM G154 UV Protection",
    thicknessMicrons: "30–50 мкм",
    durabilityYears: "10–15 років",
    description: "Герметизує мікропори між шарами 3D-друку, захищає пластик від деградації та вигорання на сонці.",
    colorHex: 0x2d343c,
    roughness: 0.4,
    metalness: 0.1
  },
  hydrophobic_seal: {
    id: "hydrophobic_seal",
    category: "plastic",
    name: "Гідрофобне силіконове просочення (Waterproof Impregnation)",
    standard: "IP65 Moisture Seal",
    thicknessMicrons: "Просочення",
    durabilityYears: "8–10 років",
    description: "Глибоке просочення полімерними силіконами для 100% захисту від проникнення вологи всередину шарів.",
    colorHex: 0x323a42,
    roughness: 0.45,
    metalness: 0.08
  }
};

/**
 * Returns available coatings for a specific material category
 */
export function getCoatingsForCategory(category: ConnectorMaterialCategory): CoatingOption[] {
  return Object.values(CONNECTOR_COATINGS).filter(c => c.category === category);
}

/**
 * Returns PBR visual material parameters (color, roughness, metalness) for 3D Three.js rendering
 */
export function getConnectorVisualPBR(
  materialId?: string,
  coatingId?: string
): { colorHex: number; roughness: number; metalness: number } {
  const matKey = (materialId as ConnectorMaterialId) || "steel_st3";
  const mat = CONNECTOR_MATERIALS[matKey] || CONNECTOR_MATERIALS.steel_st3;
  const coatKey = (coatingId as ConnectorCoatingId) || mat.defaultCoating;
  const coat = CONNECTOR_COATINGS[coatKey];
  if (coat) {
    return {
      colorHex: coat.colorHex,
      roughness: coat.roughness,
      metalness: coat.metalness
    };
  }
  return {
    colorHex: mat.baseColorHex,
    roughness: mat.roughness,
    metalness: mat.metalness
  };
}

/**
 * Calculates weight comparison and savings relative to benchmark structural steel (St3)
 */
export function getWeightComparisonToSteel(
  weightKg: number,
  materialId: ConnectorMaterialId = "steel_st3",
  plasticInfillPercent = 100
): {
  steelEquivalentWeightKg: number;
  weightSavedKg: number;
  weightSavedPercent: number;
} {
  const mat = CONNECTOR_MATERIALS[materialId] || CONNECTOR_MATERIALS.steel_st3;
  if (mat.category === "steel") {
    return {
      steelEquivalentWeightKg: weightKg,
      weightSavedKg: 0,
      weightSavedPercent: 0
    };
  }

  const steelDensity = 7850;
  const infillFactor = mat.category === "plastic" ? Math.max(0.2, plasticInfillPercent / 100) : 1.0;
  const effectiveDensity = mat.densityKgM3 * infillFactor;
  const steelEquivalent = Math.round((weightKg * (steelDensity / effectiveDensity)) * 10) / 10;
  const weightSavedKg = Math.max(0, Math.round((steelEquivalent - weightKg) * 10) / 10);
  const weightSavedPercent = steelEquivalent > 0 ? Math.round((weightSavedKg / steelEquivalent) * 1000) / 10 : 0;

  return {
    steelEquivalentWeightKg: steelEquivalent,
    weightSavedKg,
    weightSavedPercent
  };
}

/**
 * Calculates physical volume (in mm³) of a single connector
 */
export function calculateConnectorVolumeMm3(
  rayCount: number,
  isBase: boolean,
  params: ConnectorParams,
  beamProfile: BeamProfile
): number {
  const isRoundBeam = beamProfile.type === "circular" || beamProfile.type === "pipe";
  const isRoundRay =
    params.rayType === "round_tube" ||
    (params.rayType !== "plate" && isRoundBeam);

  const hubDiam = params.hubDiameter || 140;
  const hubRadius = hubDiam / 2;
  const tabLen = params.tabLength || 95;
  const tabWidth = params.tabWidth || 45;
  const plateThk = params.thickness || 4.0;
  const wallThk = params.wallThickness || 2.5;

  if (isRoundRay) {
    // 1. Hollow cylindrical hub
    const beamDiam = isRoundBeam
      ? (beamProfile.diameter || beamProfile.width || 20)
      : (beamProfile.width || 50);
    const fitClearance = 0.35;
    const rayInnerR = (beamDiam / 2) + fitClearance;
    const rayOuterR = rayInnerR + wallThk;
    const hubH = Math.max(rayOuterR * 2.2, wallThk * 2 + 6);

    const safeWall = Math.min(wallThk, hubRadius - 1.5);
    const rCavity = Math.max(1.5, hubRadius - safeWall);
    // Area of annular ring
    const hubArea = isBase
      ? (Math.PI * (hubRadius * hubRadius - rCavity * rCavity)) * 0.55
      : Math.PI * (hubRadius * hubRadius - rCavity * rCavity);
    const hubVol = hubArea * hubH;

    // 2. Hollow socket tubes
    const tubeAnnularArea = Math.PI * (rayOuterR * rayOuterR - rayInnerR * rayInnerR);
    // Plus stop shoulder and transitional collar
    const bossVol = Math.PI * (Math.pow(rayOuterR * 1.15, 2) - rayOuterR * rayOuterR) * Math.min(18, tabLen * 0.25);
    const rayVol = (tubeAnnularArea * tabLen) + bossVol;

    return Math.max(100, hubVol + rayVol * rayCount);
  } else {
    // Flat plate sheet
    const hubArea = isBase
      ? (Math.PI * hubRadius * hubRadius) * 0.55
      : (Math.PI * hubRadius * hubRadius) * 0.88; // 12% cutout for center bolt/lightning hole
    const rayArea = (tabLen * tabWidth) - ((params.boltHoleCount || 2) * Math.PI * Math.pow((params.boltDiameter || 10) / 2, 2));
    const totalAreaMm2 = Math.max(200, hubArea + rayArea * rayCount);
    return totalAreaMm2 * plateThk;
  }
}

/**
 * Calculates physical weight (in kg) of a single connector piece
 */
export function calculateConnectorPieceWeight(
  rayCount: number,
  isBase: boolean,
  params: ConnectorParams,
  beamProfile: BeamProfile
): number {
  const volumeMm3 = calculateConnectorVolumeMm3(rayCount, isBase, params, beamProfile);
  const volumeM3 = volumeMm3 / 1e9;

  const matId = (params.material as ConnectorMaterialId) || "steel_st3";
  const matInfo = CONNECTOR_MATERIALS[matId] || CONNECTOR_MATERIALS.steel_st3;
  const density = matInfo.densityKgM3;

  const isPlastic = matInfo.category === "plastic";
  const infillFactor = isPlastic ? ((params.plasticInfillPercent || 100) / 100) : 1.0;

  const weightKg = volumeM3 * density * infillFactor;
  return Math.max(0.01, Math.round(weightKg * 1000) / 1000);
}

/**
 * Complete summary of connectors weight and material specifications for the dome
 */
export interface ConnectorsWeightSummary {
  materialId: ConnectorMaterialId;
  materialName: string;
  category: ConnectorMaterialCategory;
  coatingId: ConnectorCoatingId;
  coatingName: string;
  coatingStandard: string;
  durabilityYears: string;
  densityKgM3: number;
  totalPieceCount: number;
  totalWeightKg: number;
  averagePieceWeightKg: number;
  minPieceWeightKg: number;
  maxPieceWeightKg: number;
  byType: {
    typeId: string;
    name: string;
    rayCount: number;
    countInDome: number;
    unitWeightKg: number;
    totalWeightKg: number;
  }[];
}

/**
 * Calculates complete dome connectors weight breakdown
 */
export function calculateConnectorsWeightSummary(
  model: DomeModel,
  connectorTypes: ConnectorTypeSummary[]
): ConnectorsWeightSummary {
  const params = model.connectorParams;
  const beamProfile = model.beamProfile;

  const matId = (params.material as ConnectorMaterialId) || "steel_st3";
  const matInfo = CONNECTOR_MATERIALS[matId] || CONNECTOR_MATERIALS.steel_st3;

  const coatingId = (params.coating as ConnectorCoatingId) || matInfo.defaultCoating;
  const coatingInfo = CONNECTOR_COATINGS[coatingId] || CONNECTOR_COATINGS[matInfo.defaultCoating];

  let totalWeight = 0;
  let totalPieces = 0;
  let minWeight = Infinity;
  let maxWeight = 0;

  const byType = connectorTypes.map(t => {
    const unitWeightKg = calculateConnectorPieceWeight(t.rayCount, t.isBoundary, params, beamProfile);
    const typeTotalWeightKg = Math.round(unitWeightKg * t.countInDome * 100) / 100;

    totalWeight += typeTotalWeightKg;
    totalPieces += t.countInDome;
    if (unitWeightKg < minWeight) minWeight = unitWeightKg;
    if (unitWeightKg > maxWeight) maxWeight = unitWeightKg;

    return {
      typeId: t.typeId,
      name: t.name,
      rayCount: t.rayCount,
      countInDome: t.countInDome,
      unitWeightKg,
      totalWeightKg: typeTotalWeightKg
    };
  });

  const roundedTotalKg = Math.round(totalWeight * 10) / 10;
  const avgKg = totalPieces > 0 ? Math.round((roundedTotalKg / totalPieces) * 1000) / 1000 : 0;

  return {
    materialId: matId,
    materialName: matInfo.name,
    category: matInfo.category,
    coatingId,
    coatingName: coatingInfo.name,
    coatingStandard: coatingInfo.standard,
    durabilityYears: coatingInfo.durabilityYears,
    densityKgM3: matInfo.densityKgM3,
    totalPieceCount: totalPieces,
    totalWeightKg: roundedTotalKg,
    averagePieceWeightKg: avgKg,
    minPieceWeightKg: minWeight === Infinity ? 0 : minWeight,
    maxPieceWeightKg: maxWeight,
    byType
  };
}
