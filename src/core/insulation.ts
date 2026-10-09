import { DomeModel, FaceTypeGroup, InsulationMaterialId, InsulationParams } from "./types";
export type { InsulationMaterialId, InsulationParams };

export type InsulationCategory = "foam" | "mineral" | "organic" | "polyiso";

export interface InsulationMaterial {
  id: InsulationMaterialId;
  name: string;
  shortName: string;
  category: InsulationCategory;
  densityKgM3: number; // kg/m^3
  thermalConductivityLambda: number; // W/(m*K)
  specificHeatCapacity: number; // J/(kg*K)
  volumetricHeatCapacityKJ: number; // kJ/(m^3*K)
  vaporPermeability: number; // mg/(m*h*Pa)
  fireClass: string;
  ecoRating: "A+" | "A" | "B" | "C";
  soundReductionDb: number;
  defaultPricePerM3UAH: number;
  packAreaM2_100mm: number;
  description: string;
  features: string[];
  applicationNotes: string;
  icon: string;
  color: string;
  badgeBg: string;
}

export const INSULATION_MATERIALS: InsulationMaterial[] = [
  {
    id: "mineral_wool",
    name: "Базальтова кам'яна вата (Rockwool / Knauf)",
    shortName: "Мінеральна вата",
    category: "mineral",
    densityKgM3: 45,
    thermalConductivityLambda: 0.036,
    specificHeatCapacity: 840,
    volumetricHeatCapacityKJ: 37.8,
    vaporPermeability: 0.55,
    fireClass: "НГ (Негорюча, плавлення > 1000°C)",
    ecoRating: "A",
    soundReductionDb: 46,
    defaultPricePerM3UAH: 2400,
    packAreaM2_100mm: 4.8,
    description: "Пружні плити з гірських порід базальту. Золотий стандарт каркасного будівництва: негорюча, паропроникна та відмінно поглинає шум дощу.",
    features: [
      "100% захист дерев'яного каркаса від вогню (клас НГ)",
      "Висока паропроникність — стіни 'дихають' без конденсату",
      "Пружні краї щільно стають у розпір між балками каркаса",
      "Чудове шумопоглинання шуму граду та дощу по куполу"
    ],
    applicationNotes: "Обов'язковий паробар'єр зсередини купола та супердифузійна мембрана з вентильованим зазором ззовні.",
    icon: "🪨",
    color: "#D97706",
    badgeBg: "bg-amber-100 text-amber-800 border-amber-300"
  },
  {
    id: "eps_foam",
    name: "Пінополістирол EPS-80 / EPS-100 (Пінопласт)",
    shortName: "Пінопласт (EPS)",
    category: "foam",
    densityKgM3: 18,
    thermalConductivityLambda: 0.038,
    specificHeatCapacity: 1340,
    volumetricHeatCapacityKJ: 24.1,
    vaporPermeability: 0.05,
    fireClass: "Г1 (Самогасний з антипіреном)",
    ecoRating: "B",
    soundReductionDb: 32,
    defaultPricePerM3UAH: 1850,
    packAreaM2_100mm: 6.0,
    description: "Класичний білий пінопласт високої щільності. Максимально бюджетний, надлегкий утеплювач з низьким водопоглинанням, легко ріжеться струною.",
    features: [
      "Найнижча вартість кубічного метра утеплювача",
      "Мінімальна вага — практично не навантажує фундамент купола",
      "Стабільна геометрія, стійкий до короткочасного зволоження",
      "Простота ручного розкрою на трикутні клини"
    ],
    applicationNotes: "Вимагає якісної герметизації монтажною піною або клей-піною по периметру балок для усунення щілин.",
    icon: "🧱",
    color: "#0284C7",
    badgeBg: "bg-sky-100 text-sky-800 border-sky-300"
  },
  {
    id: "xps_foam",
    name: "Екструдований пінополістирол (XPS / Penoplex)",
    shortName: "Екструдер (XPS)",
    category: "foam",
    densityKgM3: 35,
    thermalConductivityLambda: 0.032,
    specificHeatCapacity: 1450,
    volumetricHeatCapacityKJ: 50.8,
    vaporPermeability: 0.015,
    fireClass: "Г1 / Г4",
    ecoRating: "B",
    soundReductionDb: 34,
    defaultPricePerM3UAH: 3900,
    packAreaM2_100mm: 5.4,
    description: "Високоміцний закритовічковий матеріал з нульовим водопоглинанням. Ідеальний для цокольних прямокутників, підлоги та вологих зон купола.",
    features: [
      "Нульове водопоглинання (не боїться конденсату й ґрунтової вологи)",
      "Підвищена міцність на стиск (> 250 кПа)",
      "Один з найнижчих коефіцієнтів теплопровідності (λ = 0.032)",
      "Стійкий до гниття, плісняви та гризунів"
    ],
    applicationNotes: "Рекомендований для утеплення стінового поясу цоколя та нижнього ярусу примикання до фундаменту.",
    icon: "🟧",
    color: "#EA580C",
    badgeBg: "bg-orange-100 text-orange-800 border-orange-300"
  },
  {
    id: "wood_fiber",
    name: "Деревоволокнисті плити (Steico Flex / Белтермо)",
    shortName: "Деревоволокно",
    category: "organic",
    densityKgM3: 50,
    thermalConductivityLambda: 0.038,
    specificHeatCapacity: 2100,
    volumetricHeatCapacityKJ: 105.0,
    vaporPermeability: 0.40,
    fireClass: "Г3 (Важкозаймистий)",
    ecoRating: "A+",
    soundReductionDb: 48,
    defaultPricePerM3UAH: 4200,
    packAreaM2_100mm: 4.3,
    description: "Преміальний натуральний утеплювач з волокон хвойної деревини. Рекордна питома теплоємність (2100 Дж/кг·К) — захищає купол від літньої спеки.",
    features: [
      "Найвища теплова інерція серед усіх утеплювачів (105 кДж/м³·К)",
      "Максимальний фазовий зсув температури (до 10-12 годин затримки спеки)",
      "100% екологічний масив деревини без формальдегідів",
      "Регулює вологість у куполі за рахунок гігроскопічності волокон"
    ],
    applicationNotes: "Найкраще рішення для житлових еко-куполів із цілорічним проживанням та захистом мансарди від сонця.",
    icon: "🌲",
    color: "#84532D",
    badgeBg: "bg-amber-900/10 text-amber-900 border-amber-900/30"
  },
  {
    id: "ecowool",
    name: "Ековата задувна (Целюлозний еко-утеплювач)",
    shortName: "Ековата",
    category: "organic",
    densityKgM3: 45,
    thermalConductivityLambda: 0.038,
    specificHeatCapacity: 2000,
    volumetricHeatCapacityKJ: 90.0,
    vaporPermeability: 0.35,
    fireClass: "Г2 (Не поширює полум'я, з антипіренами бури)",
    ecoRating: "A+",
    soundReductionDb: 47,
    defaultPricePerM3UAH: 2100,
    packAreaM2_100mm: 5.0,
    description: "Целюлозний розпушений утеплювач із природними антисептиками. Задувається під внутрішню обшивку без швів, обрізків та містків холоду.",
    features: [
      "Суцільний монолітний шар без стиків і містків холоду у вузлах купола",
      "Природний захист дерев'яного каркаса від гниття та комах (солі бору)",
      "Висока теплоємність для комфорту в літній період",
      "Нуль відходів розкрою — оплачується лише фактичний об'єм"
    ],
    applicationNotes: "Монтується механізованим задувним способом після зашивки внутрішньої мембрани/плити.",
    icon: "🌱",
    color: "#059669",
    badgeBg: "bg-emerald-100 text-emerald-800 border-emerald-300"
  },
  {
    id: "pir_polyiso",
    name: "PIR-плити з фольгою (Поліізоціанурат)",
    shortName: "PIR (Фольгований)",
    category: "polyiso",
    densityKgM3: 32,
    thermalConductivityLambda: 0.022,
    specificHeatCapacity: 1400,
    volumetricHeatCapacityKJ: 44.8,
    vaporPermeability: 0.005,
    fireClass: "Г1 (Не підтримує горіння, коксується)",
    ecoRating: "B",
    soundReductionDb: 35,
    defaultPricePerM3UAH: 5500,
    packAreaM2_100mm: 5.76,
    description: "Космічні технології теплоізоляції: найнижча теплопровідність (λ = 0.022). Товщина всього 100 мм замінює 180 мм звичайного утеплювача.",
    features: [
      "Рекордно тонкий шар: 100 мм дає опір R = 4.55 м²·К/Вт",
      "Двостороннє покриття алюмінієвою фольгою відбиває 95% тепла",
      "Вбудований паробар'єр (не потрібна додаткова плівка при проклеюванні скотчем)",
      "Максимальне збереження внутрішнього корисного об'єму купола"
    ],
    applicationNotes: "Стики плит проклеюються фольгованим скотчем. Ідеальний для компактних глемпінгів і геокуполів.",
    icon: "✨",
    color: "#7C3AED",
    badgeBg: "bg-purple-100 text-purple-800 border-purple-300"
  },
  {
    id: "glass_wool",
    name: "Скловолокниста мінеральна вата (Isover / Ursa)",
    shortName: "Скловата",
    category: "mineral",
    densityKgM3: 20,
    thermalConductivityLambda: 0.039,
    specificHeatCapacity: 840,
    volumetricHeatCapacityKJ: 16.8,
    vaporPermeability: 0.50,
    fireClass: "НГ (Негорюча)",
    ecoRating: "A",
    soundReductionDb: 44,
    defaultPricePerM3UAH: 1600,
    packAreaM2_100mm: 7.2,
    description: "Легкі пружні мати з тонкого кварцового волокна. Економічний варіант негорючої ізоляції зі зручним пакуванням високого ступеня стиснення.",
    features: [
      "Найкраща ціна серед негорючих матеріалів класу НГ",
      "Компактна доставка: рулони стиснуті в 4 рази на заводі",
      "Мала вага та висока еластичність волокон",
      "Добре прилягає до криволінійних поверхонь"
    ],
    applicationNotes: "Вимагає ретельної пароізоляції з проклеюванням стиків бутилкаучуковою стрічкою.",
    icon: "🧶",
    color: "#CA8A04",
    badgeBg: "bg-yellow-100 text-yellow-800 border-yellow-300"
  }
];

export const DEFAULT_INSULATION_PARAMS: InsulationParams = {
  enabled: true,
  materialId: "mineral_wool",
  thicknessMm: 150,
  hasVaporBarrier: true,
  hasWindBarrier: true,
  hasCounterBatten: true,
  counterBattenThicknessMm: 30,
  wastePercentage: 8
};

export interface MaterialComparisonItem {
  material: InsulationMaterial;
  thicknessMm: number;
  rValueInsulation: number;
  rValueTotal: number;
  uValue: number;
  dbnCompliant: boolean;
  reqThicknessForDbnMm: number;
  insulationVolumeM3: number;
  insulationMassKg: number;
  heatCapacityInsulationMJ: number;
  totalEnvelopeHeatCapacityMJ: number;
  totalEnvelopeHeatCapacityKWh: number;
  thermalPhaseShiftHours: number;
  coolingTimeConstantHours: number;
  designHeatingLossWatts: number;
  monthlyHeatingKWh: number;
  estimatedCostUAH: number;
}

export interface TriangleInsulationSpec {
  type: string;
  count: number;
  widthMm: number;
  heightMm: number;
  areaM2: number;
  totalAreaM2: number;
  volumeM3: number;
  color: string;
}

export interface InsulationCalculationResult {
  params: InsulationParams;
  material: InsulationMaterial;
  strutDepthMm: number;
  cavityThicknessMm: number;
  netDomeAreaM2: number;
  plinthAreaM2: number;
  totalInsulatedAreaM2: number;
  framingFraction: number; // % occupied by timber frame
  netCavityAreaM2: number;
  netInsulationVolumeM3: number;
  orderVolumeM3: number; // with cutting waste
  insulationMassKg: number;
  
  // Thermal Resistance
  rValueInsulation: number; // m^2*K/W
  rValueOuterSheathing: number;
  rValueInnerSheathing: number;
  rValueAirGap: number;
  rValueTotalEnvelope: number; // m^2*K/W
  uValueEnvelope: number; // W/(m^2*K)
  dbnRequiredR: number; // 4.0 for zone 1 Ukraine
  dbnCompliant: boolean;
  dbnRatioPct: number;
  reqThicknessForDbnMm: number;

  // Thermal Capacity & Inertia
  heatCapacityInsulationKJ: number;
  heatCapacityInsulationMJ: number;
  heatCapacityInnerSheathingMJ: number;
  heatCapacityTimberFrameMJ: number;
  totalEnvelopeHeatCapacityMJ: number; // MJ/K
  totalEnvelopeHeatCapacityKWh: number; // kWh/K
  thermalPhaseShiftHours: number; // phase shift / lag
  coolingTimeConstantHours: number; // tau cooling hours

  // Heating Energy Estimates
  designHeatingLossWatts: number; // peak winter heat loss at delta T = 42 deg C (-22 to +20)
  designHeatingLossPerM2Watts: number;
  averageWinterLossWatts: number; // at delta T = 20 deg C (0 to +20)
  monthlyHeatingKWh: number;

  // Breakdown by geometries
  trianglesSpec: TriangleInsulationSpec[];
  plinthSpec?: {
    count: number;
    widthMm: number;
    heightMm: number;
    areaM2: number;
    totalAreaM2: number;
    volumeM3: number;
  };

  // Standard packages needed
  standardPacksNeeded: number;
  estimatedMaterialCostUAH: number;
  estimatedMembranesCostUAH: number;
  totalSystemCostUAH: number;

  // Full comparison of all fillers side by side
  materialsComparison: MaterialComparisonItem[];
}

/**
 * Calculates complete insulation volume, cutting breakdown, thermal resistance (R-value, U-value),
 * heat capacity (MJ/°C, kWh/°C), thermal phase shift lag, cooling time constant,
 * and side-by-side comparison matrix for all filler materials.
 */
export function calculateInsulationMetrics(
  model: DomeModel,
  customParams?: Partial<InsulationParams>,
  innerSheathingMaterialId = "drywall"
): InsulationCalculationResult {
  const strutDepth = model.beamProfile?.depth || 150;
  const p: InsulationParams = {
    ...DEFAULT_INSULATION_PARAMS,
    thicknessMm: customParams?.thicknessMm ?? strutDepth,
    ...customParams
  };

  const mat =
    INSULATION_MATERIALS.find(m => m.id === p.materialId) ||
    INSULATION_MATERIALS[0];

  // Exclude windows / skylights from insulation area
  const excludedIds = new Set<number>();
  (model.windowFaceIds || []).forEach(id => excludedIds.add(id));
  (model.doorFaceIds || []).forEach(id => excludedIds.add(id));

  const domeFaces = model.faces.filter(f => !f.isPlinthFace && !excludedIds.has(f.id));
  const netDomeAreaM2 =
    Math.round((domeFaces.reduce((sum, f) => sum + f.area, 0) / 1_000_000) * 100) / 100;

  const isPlinth = Boolean(
    model.parameters.plinth?.enabled && (model.statistics?.plinthHeightMm ?? 0) > 0
  );
  const plinthAreaM2 = isPlinth ? (model.statistics.plinthWallAreaM2 || 0) : 0;
  const totalInsulatedAreaM2 = Math.round((netDomeAreaM2 + plinthAreaM2) * 100) / 100;

  // Framing factor: timber struts occupy ~8-12% of surface & cavity volume
  const beamW = model.beamProfile?.width || 50;
  const totalEdgeLenM = model.edges.reduce((sum, e) => sum + e.length, 0) / 1000;
  const frameFaceAreaM2 = (totalEdgeLenM * (beamW / 1000)) / 2;
  const framingFraction = Math.min(
    0.16,
    Math.max(0.06, totalInsulatedAreaM2 > 0 ? frameFaceAreaM2 / totalInsulatedAreaM2 : 0.09)
  );

  const netCavityAreaM2 = Math.round(totalInsulatedAreaM2 * (1 - framingFraction) * 100) / 100;
  const thicknessM = p.thicknessMm / 1000;
  const netInsulationVolumeM3 = Math.round(netCavityAreaM2 * thicknessM * 100) / 100;
  const orderVolumeM3 = Math.round(netInsulationVolumeM3 * (1 + p.wastePercentage / 100) * 100) / 100;
  const insulationMassKg = Math.round(netInsulationVolumeM3 * mat.densityKgM3);

  // 1. Thermal Resistance & Transmittance
  const rSi = 0.13; // interior surface film (W/(m^2*K))
  const rSe = 0.04; // exterior surface film

  // Outer sheathing (plywood/OSB ~ 12-15mm, lambda ~ 0.13)
  const outerThickM = (model.sheathingParams?.thickness || 12) / 1000;
  const rOuter = Math.round((outerThickM / 0.13) * 1000) / 1000;

  // Insulation layer R-value
  const rIns = Math.round((thicknessM / mat.thermalConductivityLambda) * 100) / 100;

  // Inner sheathing (drywall ~ 12.5mm lambda 0.25, OSB ~ 12mm lambda 0.13, wood ~ 15mm lambda 0.14)
  let innerThickM = 0.0125;
  let innerLambda = 0.25;
  let innerDensity = 850;
  let innerSpecificHeat = 840;

  if (innerSheathingMaterialId === "chipboard" || innerSheathingMaterialId === "osb3") {
    innerLambda = 0.13;
    innerDensity = 650;
    innerSpecificHeat = 1700;
  } else if (innerSheathingMaterialId === "plywood_fk" || innerSheathingMaterialId === "wood_lining") {
    innerLambda = 0.14;
    innerDensity = 550;
    innerSpecificHeat = 1800;
  }
  const rInner = Math.round((innerThickM / innerLambda) * 1000) / 1000;

  // Air gap / counter batten
  const rAirGap = p.hasCounterBatten ? 0.16 : 0.0;

  const rTotalEnvelope = Math.round((rSi + rOuter + rIns + rInner + rAirGap + rSe) * 100) / 100;
  const uValueEnvelope = Math.round((1 / Math.max(0.1, rTotalEnvelope)) * 1000) / 1000;

  const dbnRequiredR = 4.0; // DBN V.2.6-31:2021 zone 1 roof / dome
  const dbnCompliant = rTotalEnvelope >= dbnRequiredR;
  const dbnRatioPct = Math.round((rTotalEnvelope / dbnRequiredR) * 100);
  const reqThicknessForDbnMm = Math.max(
    50,
    Math.ceil((dbnRequiredR - (rSi + rOuter + rInner + rAirGap + rSe)) * mat.thermalConductivityLambda * 1000)
  );

  // 2. Heat Capacity Calculations (Теплоємність купола)
  // Insulation heat capacity
  const heatCapacityInsulationKJ = Math.round(insulationMassKg * (mat.specificHeatCapacity / 1000));
  const heatCapacityInsulationMJ = Math.round((heatCapacityInsulationKJ / 1000) * 10) / 10;

  // Inner sheathing heat capacity
  const innerMassKg = totalInsulatedAreaM2 * innerThickM * innerDensity;
  const innerHeatCapacityKJ = innerMassKg * (innerSpecificHeat / 1000);
  const heatCapacityInnerSheathingMJ = Math.round((innerHeatCapacityKJ / 1000) * 10) / 10;

  // Timber frame heat capacity (wood density ~ 500 kg/m^3, c ~ 1600 J/kg*K)
  const woodVolM3 = model.structuralAnalysis?.totalWoodVolumeM3 || (totalEdgeLenM * (beamW / 1000) * (strutDepth / 1000));
  const woodMassKg = woodVolM3 * 500;
  const woodHeatCapacityKJ = woodMassKg * 1.6;
  const heatCapacityTimberFrameMJ = Math.round((woodHeatCapacityKJ / 1000) * 10) / 10;

  const totalEnvelopeHeatCapacityMJ =
    Math.round(
      (heatCapacityInsulationMJ + heatCapacityInnerSheathingMJ + heatCapacityTimberFrameMJ) * 10
    ) / 10;
  const totalEnvelopeHeatCapacityKWh =
    Math.round(((totalEnvelopeHeatCapacityMJ * 1000) / 3600) * 10) / 10;

  // 3. Thermal Phase Shift / Lag (Фазовий зсув температури в годинах)
  // Formula: Delta t = 1.38 * d * sqrt(rho * c / lambda) in hours
  const thermalPhaseShiftHours = Math.round(
    1.38 * thicknessM * Math.sqrt((mat.densityKgM3 * mat.specificHeatCapacity) / Math.max(0.01, mat.thermalConductivityLambda)) * 10
  ) / 10;

  // 4. Cooling Time Constant (Постійна часу остигання tau в годинах)
  // tau = C_envelope / (S * U * 3600) in hours
  const heatLossRateWattsPerK = totalInsulatedAreaM2 * uValueEnvelope;
  const coolingTimeConstantHours = Math.round(
    ((totalEnvelopeHeatCapacityMJ * 1_000_000) / Math.max(1, heatLossRateWattsPerK * 3600)) * 10
  ) / 10;

  // 5. Heating Energy Estimates
  // Peak winter heating loss at delta T = 42 deg C (-22 outside to +20 inside)
  const designHeatingLossWatts = Math.round(heatLossRateWattsPerK * 42);
  const designHeatingLossPerM2Watts = Math.round(designHeatingLossWatts / Math.max(1, totalInsulatedAreaM2));
  // Average winter month at delta T = 20 deg C (0 to +20)
  const averageWinterLossWatts = Math.round(heatLossRateWattsPerK * 20);
  const monthlyHeatingKWh = Math.round((averageWinterLossWatts * 24 * 30) / 1000);

  // 6. Geometry Breakdown (Triangles & Plinth)
  const trianglesSpec: TriangleInsulationSpec[] = model.faceGroups
    .filter(g => g.type !== "PL")
    .map(g => {
      const wMm = g.lengths[0];
      const hMm = Math.round((2 * (g.area * 1_000_000)) / Math.max(1, wMm));
      const gAreaM2 = Math.round(g.area * 1000) / 1000;
      const totalArea = Math.round(gAreaM2 * g.count * 100) / 100;
      const vol = Math.round(totalArea * thicknessM * 100) / 100;
      return {
        type: g.type,
        count: g.count,
        widthMm: wMm,
        heightMm: hMm,
        areaM2: gAreaM2,
        totalAreaM2: totalArea,
        volumeM3: vol,
        color: g.color
      };
    });

  let plinthSpec: InsulationCalculationResult["plinthSpec"];
  if (isPlinth && plinthAreaM2 > 0) {
    const plinthGroup = model.faceGroups.find(g => g.type === "PL");
    const pCount = plinthGroup?.count || model.statistics.plinthBayCount || 15;
    const pW = plinthGroup?.lengths[0] || 1200;
    const pH = model.statistics.plinthHeightMm || 800;
    const pArea = Math.round(((pW * pH) / 1_000_000) * 1000) / 1000;
    const pVol = Math.round(plinthAreaM2 * thicknessM * 100) / 100;
    plinthSpec = {
      count: pCount,
      widthMm: pW,
      heightMm: pH,
      areaM2: pArea,
      totalAreaM2: plinthAreaM2,
      volumeM3: pVol
    };
  }

  // 7. Costs and Packaging
  const standardPackVolM3 = (mat.packAreaM2_100mm * 0.1);
  const standardPacksNeeded = Math.ceil(orderVolumeM3 / Math.max(0.1, standardPackVolM3));
  const estimatedMaterialCostUAH = Math.round(orderVolumeM3 * mat.defaultPricePerM3UAH);

  // Membrane costs: vapor barrier (~40 грн/м2) + wind barrier (~55 грн/м2)
  const vaporBarrierCost = p.hasVaporBarrier ? Math.round(totalInsulatedAreaM2 * 1.15 * 40) : 0;
  const windBarrierCost = p.hasWindBarrier ? Math.round(totalInsulatedAreaM2 * 1.15 * 55) : 0;
  const estimatedMembranesCostUAH = vaporBarrierCost + windBarrierCost;
  const totalSystemCostUAH = estimatedMaterialCostUAH + estimatedMembranesCostUAH;

  // 8. Multi-Material Side-by-Side Comparison
  const materialsComparison: MaterialComparisonItem[] = INSULATION_MATERIALS.map(m => {
    const mRIns = Math.round((thicknessM / m.thermalConductivityLambda) * 100) / 100;
    const mRTotal = Math.round((rSi + rOuter + mRIns + rInner + rAirGap + rSe) * 100) / 100;
    const mU = Math.round((1 / Math.max(0.1, mRTotal)) * 1000) / 1000;
    const mCompliant = mRTotal >= dbnRequiredR;
    const mReqThick = Math.max(
      50,
      Math.ceil((dbnRequiredR - (rSi + rOuter + rInner + rAirGap + rSe)) * m.thermalConductivityLambda * 1000)
    );
    const mMassKg = Math.round(netInsulationVolumeM3 * m.densityKgM3);
    const mHeatCapKJ = Math.round(mMassKg * (m.specificHeatCapacity / 1000));
    const mHeatCapMJ = Math.round((mHeatCapKJ / 1000) * 10) / 10;
    const mTotalEnvelopeMJ = Math.round((mHeatCapMJ + heatCapacityInnerSheathingMJ + heatCapacityTimberFrameMJ) * 10) / 10;
    const mTotalEnvelopeKWh = Math.round(((mTotalEnvelopeMJ * 1000) / 3600) * 10) / 10;

    const mPhaseShift = Math.round(
      1.38 * thicknessM * Math.sqrt((m.densityKgM3 * m.specificHeatCapacity) / Math.max(0.01, m.thermalConductivityLambda)) * 10
    ) / 10;

    const mHeatLossRate = totalInsulatedAreaM2 * mU;
    const mCoolingTime = Math.round(
      ((mTotalEnvelopeMJ * 1_000_000) / Math.max(1, mHeatLossRate * 3600)) * 10
    ) / 10;

    const mPeakLossWatts = Math.round(mHeatLossRate * 42);
    const mMonthlyKWh = Math.round((mHeatLossRate * 20 * 24 * 30) / 1000);
    const mCost = Math.round(orderVolumeM3 * m.defaultPricePerM3UAH);

    return {
      material: m,
      thicknessMm: p.thicknessMm,
      rValueInsulation: mRIns,
      rValueTotal: mRTotal,
      uValue: mU,
      dbnCompliant: mCompliant,
      reqThicknessForDbnMm: mReqThick,
      insulationVolumeM3: orderVolumeM3,
      insulationMassKg: mMassKg,
      heatCapacityInsulationMJ: mHeatCapMJ,
      totalEnvelopeHeatCapacityMJ: mTotalEnvelopeMJ,
      totalEnvelopeHeatCapacityKWh: mTotalEnvelopeKWh,
      thermalPhaseShiftHours: mPhaseShift,
      coolingTimeConstantHours: mCoolingTime,
      designHeatingLossWatts: mPeakLossWatts,
      monthlyHeatingKWh: mMonthlyKWh,
      estimatedCostUAH: mCost
    };
  });

  return {
    params: p,
    material: mat,
    strutDepthMm: strutDepth,
    cavityThicknessMm: p.thicknessMm,
    netDomeAreaM2,
    plinthAreaM2,
    totalInsulatedAreaM2,
    framingFraction: Math.round(framingFraction * 100),
    netCavityAreaM2,
    netInsulationVolumeM3,
    orderVolumeM3,
    insulationMassKg,
    rValueInsulation: rIns,
    rValueOuterSheathing: rOuter,
    rValueInnerSheathing: rInner,
    rValueAirGap: rAirGap,
    rValueTotalEnvelope: rTotalEnvelope,
    uValueEnvelope,
    dbnRequiredR,
    dbnCompliant,
    dbnRatioPct,
    reqThicknessForDbnMm,
    heatCapacityInsulationKJ,
    heatCapacityInsulationMJ,
    heatCapacityInnerSheathingMJ,
    heatCapacityTimberFrameMJ,
    totalEnvelopeHeatCapacityMJ,
    totalEnvelopeHeatCapacityKWh,
    thermalPhaseShiftHours,
    coolingTimeConstantHours,
    designHeatingLossWatts,
    designHeatingLossPerM2Watts,
    averageWinterLossWatts,
    monthlyHeatingKWh,
    trianglesSpec,
    plinthSpec,
    standardPacksNeeded,
    estimatedMaterialCostUAH,
    estimatedMembranesCostUAH,
    totalSystemCostUAH,
    materialsComparison
  };
}
