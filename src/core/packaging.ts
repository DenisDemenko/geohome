import {
  DomeModel,
  BeamTypeGroup,
  FaceTypeGroup,
  ConnectorParams
} from "./types";
import { classifyConnectorTypes } from "./connectors";
import { calculateSheetNesting } from "./sheathing";

export type PalletStandardId = "euro_1" | "industrial" | "long_timber" | "sheet_pallet";

export interface PalletStandard {
  id: PalletStandardId;
  name: string;
  shortName: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number; // base pallet height, typically ~144mm
  tareWeightKg: number;
  maxPayloadKg: number;
  description: string;
}

export const PALLET_STANDARDS: Record<PalletStandardId, PalletStandard> = {
  euro_1: {
    id: "euro_1",
    name: "Європалета EUR 1 (EPAL)",
    shortName: "EUR 1 (1200×800)",
    lengthMm: 1200,
    widthMm: 800,
    heightMm: 144,
    tareWeightKg: 25,
    maxPayloadKg: 1200,
    description: "Стандартний європейський піддон 1200×800 мм для перевезень та стелажів"
  },
  industrial: {
    id: "industrial",
    name: "Фінська / Промислова (EUR 2)",
    shortName: "FIN (1200×1000)",
    lengthMm: 1200,
    widthMm: 1000,
    heightMm: 144,
    tareWeightKg: 30,
    maxPayloadKg: 1500,
    description: "Розширений піддон 1200×1000 мм для важких вузлів та обладнання"
  },
  long_timber: {
    id: "long_timber",
    name: "Подовжений піддон для балок (Скід)",
    shortName: "Тімбер-скід (2400×1000)",
    lengthMm: 2400,
    widthMm: 1000,
    heightMm: 150,
    tareWeightKg: 45,
    maxPayloadKg: 2200,
    description: "Спеціальний посилений піддон під довгі пачки пиломатеріалів каркаса"
  },
  sheet_pallet: {
    id: "sheet_pallet",
    name: "Піддон для листових матеріалів",
    shortName: "Листовий (2500×1250)",
    lengthMm: 2500,
    widthMm: 1250,
    heightMm: 150,
    tareWeightKg: 50,
    maxPayloadKg: 2500,
    description: "Великогабаритний піддон під стандартні формати фанери та OSB"
  }
};

export interface PackagingItemContent {
  name: string;
  category: "struts" | "connectors" | "fasteners" | "panels" | "foundation" | "accessories";
  quantity: number;
  unit: string;
  unitWeightKg: number;
  totalWeightKg: number;
  details?: string;
  material?: string;
}

export interface BoxPackage {
  id: string; // e.g. "BOX-CONN-01"
  code: string; // short code for label e.g. "C-01"
  palletId: string; // assigned pallet
  title: string;
  category: "struts" | "connectors" | "fasteners" | "panels" | "foundation" | "accessories";
  type: "standard_box" | "timber_bundle" | "hardware_box" | "panel_stack" | "accessory_box";
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  tareWeightKg: number;
  netWeightKg: number;
  grossWeightKg: number;
  maxWeightCapacityKg: number;
  items: PackagingItemContent[];
  color: string;
  stackable: boolean;
  fragile: boolean;
  assemblyTier?: string;
  qrPayload: string;
  barcode: string;
}

export interface PlacedPackage {
  package: BoxPackage;
  xMm: number; // relative to pallet top corner
  yMm: number;
  zMm: number; // height above pallet deck
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  layerIndex: number;
  rotationDeg: number; // 0 or 90
}

export interface OptimizedPallet {
  id: string; // e.g. "PLT-01"
  palletNumber: number;
  title: string;
  category: "connectors_hardware" | "timber_struts" | "sheathing_panels" | "mixed";
  palletStandard: PalletStandard;
  packages: PlacedPackage[];
  totalPackagesCount: number;
  totalItemsCount: number;
  palletTareWeightKg: number;
  netCargoWeightKg: number;
  grossWeightKg: number;
  maxPayloadKg: number;
  cargoLengthMm: number;
  cargoWidthMm: number;
  cargoHeightMm: number;
  totalHeightWithPalletMm: number;
  volumeM3: number;
  volumeUtilizationPct: number;
  weightUtilizationPct: number;
  strappingBandsCount: number; // PET strapping bands
  stretchFilmTurns: number;
  cornerProtectorsCount: number;
  isOverloaded: boolean;
  isOverheight: boolean;
  layerCount: number;
}

export interface VehicleOption {
  id: "van_35" | "truck_75" | "semi_trailer_20";
  name: string;
  cargoCapacityKg: number;
  cargoVolumeM3: number;
  maxEuroPallets: number;
  cargoBayDimensionsMm: { length: number; width: number; height: number };
  description: string;
}

export const VEHICLE_OPTIONS: VehicleOption[] = [
  {
    id: "van_35",
    name: "Малотоннажний бус (до 3.5 т)",
    cargoCapacityKg: 1400,
    cargoVolumeM3: 13.5,
    maxEuroPallets: 4,
    cargoBayDimensionsMm: { length: 3700, width: 1750, height: 1900 },
    description: "Ідеально для куполів 1V-3V діаметром до 6-7 метрів"
  },
  {
    id: "truck_75",
    name: "Середньотонажна вантажівка (7.5 т)",
    cargoCapacityKg: 3800,
    cargoVolumeM3: 35.0,
    maxEuroPallets: 14,
    cargoBayDimensionsMm: { length: 6100, width: 2450, height: 2400 },
    description: "Оптимально для куполів 3V-5V із повною обшивкою"
  },
  {
    id: "semi_trailer_20",
    name: "Магістральна єврофура (20-22 т / TIR)",
    cargoCapacityKg: 22000,
    cargoVolumeM3: 86.0,
    maxEuroPallets: 33,
    cargoBayDimensionsMm: { length: 13600, width: 2450, height: 2600 },
    description: "Для великих комерційних куполів або партії з кількох комплектів"
  }
];

export interface PackagingConfig {
  palletStandard: PalletStandardId;
  maxBoxWeightKg: number; // ergonomic lifting limit (default 25 kg)
  maxPalletHeightMm: number; // max stack height (default 1800 mm)
  includeSheathing: boolean;
  fastenerSpareFactorPct: number; // e.g. 5% spare bolts
  strategy: "by_category" | "by_assembly_tier";
}

export const DEFAULT_PACKAGING_CONFIG: PackagingConfig = {
  palletStandard: "euro_1",
  maxBoxWeightKg: 25,
  maxPalletHeightMm: 1800,
  includeSheathing: true,
  fastenerSpareFactorPct: 5,
  strategy: "by_category"
};

export interface PackagingPlan {
  config: PackagingConfig;
  pallets: OptimizedPallet[];
  allPackages: BoxPackage[];
  totalGrossWeightKg: number;
  totalNetWeightKg: number;
  totalTareWeightKg: number;
  totalVolumeM3: number;
  totalPalletsCount: number;
  totalPackagesCount: number;
  categoryBreakdown: {
    category: string;
    label: string;
    weightKg: number;
    packagesCount: number;
    color: string;
  }[];
  vehicleUtilization: {
    vehicle: VehicleOption;
    weightPct: number;
    volumePct: number;
    palletsPct: number;
    isSuitable: boolean;
  }[];
  recommendedVehicle: VehicleOption;
  loadingMetersLdm: number;
}

/**
 * Calculates theoretical mass and BOM of manufactured dome components
 */
export function calculateDomeManufacturedBOM(
  model: DomeModel,
  config: PackagingConfig = DEFAULT_PACKAGING_CONFIG
) {
  const { parameters, beamProfile, connectorParams, faceGroups, edges, nodes } = model;

  // 1. Struts (Балки каркасу)
  const strutsByGroup = model.beamGroups.map(group => {
    const cutLenMm = group.cutLength || (group.length - (group.hubSetback || 0) * 2);
    const isRound = beamProfile.type === "circular" || beamProfile.type === "pipe";
    const dVal = beamProfile.diameter || beamProfile.width;
    let volumeM3PerUnit: number;
    if (isRound) {
      if (beamProfile.type === "pipe") {
        const t = Math.min(beamProfile.wallThickness || 3, dVal * 0.45);
        const dInner = Math.max(0, dVal - 2 * t);
        volumeM3PerUnit = (cutLenMm / 1000) * (Math.PI / 4) * (Math.pow(dVal / 1000, 2) - Math.pow(dInner / 1000, 2));
      } else {
        volumeM3PerUnit = (cutLenMm / 1000) * (Math.PI / 4) * Math.pow(dVal / 1000, 2);
      }
    } else {
      volumeM3PerUnit = (cutLenMm / 1000) * (beamProfile.width / 1000) * (beamProfile.depth / 1000);
    }
    const unitWeightKg = Math.round(volumeM3PerUnit * beamProfile.density * 100) / 100;
    const totalWeightKg = Math.round(unitWeightKg * group.count * 10) / 10;

    return {
      type: group.type,
      lengthMm: cutLenMm,
      nominalLengthMm: group.length,
      count: group.count,
      color: group.color,
      isBaseBeam: !!group.isBaseBeam,
      unitWeightKg,
      totalWeightKg,
      widthMm: beamProfile.width,
      depthMm: beamProfile.depth
    };
  });

  // 2. Connectors (Вузлові пластини)
  const connectorSummaries = classifyConnectorTypes(model, connectorParams);
  const materialDensities: Record<string, number> = {
    steel_st3: 7850,
    stainless_304: 7950,
    aluminum_d16t: 2700,
    plywood: 680
  };
  const connDensity = materialDensities[connectorParams.material] || 7850;

  const connectorsByGroup = connectorSummaries.map(item => {
    // Estimate planar steel area: central disc + ray rectangles - bolt holes
    const hubRadM = (connectorParams.hubDiameter / 2) / 1000;
    const hubAreaM2 = Math.PI * hubRadM * hubRadM;
    const rayAreaM2 = item.rayCount * (connectorParams.tabLength / 1000) * (connectorParams.tabWidth / 1000);
    const thickM = connectorParams.thickness / 1000;
    const totalAreaM2 = (hubAreaM2 + rayAreaM2) * 0.88; // accounts for lightning/round cutout and corners
    const unitWeightKg = Math.round(totalAreaM2 * thickM * connDensity * 100) / 100;
    const totalWeightKg = Math.round(unitWeightKg * item.countInDome * 10) / 10;

    return {
      typeId: item.typeId,
      name: item.name,
      rayCount: item.rayCount,
      count: item.countInDome,
      isBoundary: item.isBoundary,
      unitWeightKg: Math.max(0.05, unitWeightKg),
      totalWeightKg: Math.max(0.1, totalWeightKg)
    };
  });

  // 3. Fasteners (Метизи та кріплення)
  const totalStruts = edges.length;
  const boltHolesPerRay = connectorParams.boltHoleCount || 2;
  const nominalBolts = totalStruts * 2 * boltHolesPerRay;
  const spareMultiplier = 1 + config.fastenerSpareFactorPct / 100;
  const totalBolts = Math.ceil(nominalBolts * spareMultiplier);
  const totalNuts = totalBolts;
  const totalWashers = totalBolts * 2; // washers under head & nut

  // Base anchors
  const baseNodesCount = nodes.filter(n => n.boundary).length;
  const totalAnchors = Math.ceil(baseNodesCount * 2 * spareMultiplier);

  // Fasteners weight estimation
  // Bolt size: M8 ~0.06 kg, M10 ~0.095 kg, M12 ~0.14 kg, M16 ~0.26 kg
  const boltDiam = connectorParams.boltDiameter || 10;
  let unitBoltWeightKg = 0.095;
  if (boltDiam <= 4) unitBoltWeightKg = 0.01;
  else if (boltDiam <= 6) unitBoltWeightKg = 0.035;
  else if (boltDiam <= 8) unitBoltWeightKg = 0.06;
  else if (boltDiam <= 10) unitBoltWeightKg = 0.095;
  else if (boltDiam <= 12) unitBoltWeightKg = 0.14;
  else unitBoltWeightKg = 0.25;

  const boltLenMm = Math.max(20, Math.round((beamProfile.width + connectorParams.thickness * 2 + 15) / 5) * 5);
  const unitNutWeightKg = Math.round(unitBoltWeightKg * 0.25 * 1000) / 1000;
  const unitWasherWeightKg = Math.round(unitBoltWeightKg * 0.15 * 1000) / 1000;
  const unitAnchorWeightKg = 0.28;

  const totalFastenerWeightKg = Math.round(
    (totalBolts * unitBoltWeightKg +
      totalNuts * unitNutWeightKg +
      totalWashers * unitWasherWeightKg +
      totalAnchors * unitAnchorWeightKg) * 10
  ) / 10;

  // 4. Sheathing Panels (Обшивка)
  const sheathingThickness = model.sheathingParams?.thickness || 12;
  const sheathingDensity = model.sheathingParams?.density || 680;
  const panelsByGroup = faceGroups.map(fg => {
    const unitWeightKg = Math.round(fg.area * (sheathingThickness / 1000) * sheathingDensity * 10) / 10;
    const totalWeightKg = Math.round(unitWeightKg * fg.count * 10) / 10;
    return {
      type: fg.type,
      count: fg.count,
      color: fg.color,
      areaM2: fg.area,
      unitWeightKg,
      totalWeightKg
    };
  });

  return {
    strutsByGroup,
    connectorsByGroup,
    fasteners: {
      boltDiam,
      boltLenMm,
      totalBolts,
      totalNuts,
      totalWashers,
      totalAnchors,
      totalFastenerWeightKg,
      unitBoltWeightKg,
      unitNutWeightKg,
      unitWasherWeightKg,
      unitAnchorWeightKg
    },
    panelsByGroup,
    sheathingThickness,
    sheathingDensity
  };
}

/**
 * Optimizes materials into standardized boxes and strapped bundles
 */
export function generateOptimizedPackages(
  model: DomeModel,
  config: PackagingConfig = DEFAULT_PACKAGING_CONFIG
): BoxPackage[] {
  const bom = calculateDomeManufacturedBOM(model, config);
  const packages: BoxPackage[] = [];
  let boxSequence = 1;

  // Helper to build QR payload & barcode
  const makeTracking = (code: string, desc: string, weightKg: number) => {
    const barcode = `KG-${model.parameters.frequency}V-${code}-${Math.round(weightKg)}`;
    const qrPayload = JSON.stringify({
      app: "KupolGeo CAD",
      box: code,
      item: desc,
      weight: `${weightKg}kg`,
      frequency: `${model.parameters.frequency}V`,
      diameter: `${model.parameters.diameter / 1000}m`
    });
    return { barcode, qrPayload };
  };

  // ==========================================
  // 1. FASTENERS (Метизи та кріплення)
  // Standard reinforced cardboard boxes (300 x 200 x 150 mm, max ~20-25 kg)
  // ==========================================
  const maxFastenerBoxWeight = Math.min(config.maxBoxWeightKg, 22);
  const totalFastenerWeight = bom.fasteners.totalFastenerWeightKg;
  const fastenerBoxCount = Math.max(1, Math.ceil(totalFastenerWeight / maxFastenerBoxWeight));

  const boltsPerBox = Math.ceil(bom.fasteners.totalBolts / fastenerBoxCount);
  const nutsPerBox = Math.ceil(bom.fasteners.totalNuts / fastenerBoxCount);
  const washersPerBox = Math.ceil(bom.fasteners.totalWashers / fastenerBoxCount);
  const anchorsPerBox = Math.ceil(bom.fasteners.totalAnchors / fastenerBoxCount);

  for (let i = 0; i < fastenerBoxCount; i++) {
    const bCount = Math.min(bom.fasteners.totalBolts - i * boltsPerBox, boltsPerBox);
    const nCount = Math.min(bom.fasteners.totalNuts - i * nutsPerBox, nutsPerBox);
    const wCount = Math.min(bom.fasteners.totalWashers - i * washersPerBox, washersPerBox);
    const aCount = Math.min(bom.fasteners.totalAnchors - i * anchorsPerBox, anchorsPerBox);

    const netWeight = Math.round(
      (bCount * bom.fasteners.unitBoltWeightKg +
        nCount * bom.fasteners.unitNutWeightKg +
        wCount * bom.fasteners.unitWasherWeightKg +
        aCount * bom.fasteners.unitAnchorWeightKg) * 10
    ) / 10;
    const tare = 0.6; // kg
    const gross = Math.round((netWeight + tare) * 10) / 10;

    const code = `FST-${String(i + 1).padStart(2, "0")}`;
    const { barcode, qrPayload } = makeTracking(code, `Метизи та кріплення Комплект ${i + 1}/${fastenerBoxCount}`, gross);

    packages.push({
      id: `PKG-FASTENER-${i + 1}`,
      code,
      palletId: "PLT-01",
      title: `Коробка №${boxSequence++}: Метизи та кріплення (${i + 1}/${fastenerBoxCount})`,
      category: "fasteners",
      type: "hardware_box",
      lengthMm: 300,
      widthMm: 200,
      heightMm: 150,
      tareWeightKg: tare,
      netWeightKg: netWeight,
      grossWeightKg: gross,
      maxWeightCapacityKg: 25,
      color: "#DE7C5A",
      stackable: true,
      fragile: false,
      assemblyTier: "Всі яруси",
      barcode,
      qrPayload,
      items: [
        {
          name: `Болти високоміцні M${bom.fasteners.boltDiam}×${bom.fasteners.boltLenMm} (DIN 933)`,
          category: "fasteners",
          quantity: bCount,
          unit: "шт",
          unitWeightKg: bom.fasteners.unitBoltWeightKg,
          totalWeightKg: Math.round(bCount * bom.fasteners.unitBoltWeightKg * 10) / 10,
          material: "Сталь 8.8 цинк"
        },
        {
          name: `Гайки самоконтрастні M${bom.fasteners.boltDiam} з поліамідним кільцем (DIN 985)`,
          category: "fasteners",
          quantity: nCount,
          unit: "шт",
          unitWeightKg: bom.fasteners.unitNutWeightKg,
          totalWeightKg: Math.round(nCount * bom.fasteners.unitNutWeightKg * 10) / 10,
          material: "Сталь 8.0 цинк"
        },
        {
          name: `Шайби посилені кузовні M${bom.fasteners.boltDiam} (DIN 9021)`,
          category: "fasteners",
          quantity: wCount,
          unit: "шт",
          unitWeightKg: bom.fasteners.unitWasherWeightKg,
          totalWeightKg: Math.round(wCount * bom.fasteners.unitWasherWeightKg * 10) / 10,
          material: "Сталь оцинкована"
        },
        ...(aCount > 0
          ? [
              {
                name: `Анкери фундаментні розпірні M12×150 для опорних вузлів`,
                category: "foundation" as const,
                quantity: aCount,
                unit: "шт",
                unitWeightKg: bom.fasteners.unitAnchorWeightKg,
                totalWeightKg: Math.round(aCount * bom.fasteners.unitAnchorWeightKg * 10) / 10,
                material: "Сталь оцинкована"
              }
            ]
          : [])
      ]
    });
  }

  // ==========================================
  // 2. CONNECTORS (Вузлові конектори)
  // Eurobox 400 x 300 x 220 mm (max ~25 kg for worker ergonomics)
  // ==========================================
  const maxConnBoxWeight = config.maxBoxWeightKg;
  let currentConnBoxItems: PackagingItemContent[] = [];
  let currentConnNetWeight = 0;
  let connBoxSubIndex = 1;

  const flushConnBox = () => {
    if (currentConnBoxItems.length === 0) return;
    const tare = 1.0; // kg heavy corrugated box
    const net = Math.round(currentConnNetWeight * 10) / 10;
    const gross = Math.round((net + tare) * 10) / 10;
    const code = `CON-${String(connBoxSubIndex).padStart(2, "0")}`;
    const titles = currentConnBoxItems.map(it => it.name.split(" ")[0]).join(", ");
    const { barcode, qrPayload } = makeTracking(code, `Конектори ${titles}`, gross);

    packages.push({
      id: `PKG-CONN-${connBoxSubIndex}`,
      code,
      palletId: "PLT-01",
      title: `Коробка №${boxSequence++}: Конектори вузлові (Місце ${connBoxSubIndex})`,
      category: "connectors",
      type: "standard_box",
      lengthMm: 400,
      widthMm: 300,
      heightMm: 220,
      tareWeightKg: tare,
      netWeightKg: net,
      grossWeightKg: gross,
      maxWeightCapacityKg: config.maxBoxWeightKg,
      color: "#4A7C9B",
      stackable: true,
      fragile: false,
      assemblyTier: "Каркас вузли",
      barcode,
      qrPayload,
      items: [...currentConnBoxItems]
    });

    connBoxSubIndex++;
    currentConnBoxItems = [];
    currentConnNetWeight = 0;
  };

  bom.connectorsByGroup.forEach(group => {
    let remaining = group.count;
    while (remaining > 0) {
      const availableWeight = maxConnBoxWeight - currentConnNetWeight;
      const canFitCount = Math.max(1, Math.floor(availableWeight / group.unitWeightKg));
      const takeCount = Math.min(remaining, canFitCount);

      const itemWeight = Math.round(takeCount * group.unitWeightKg * 10) / 10;
      currentConnBoxItems.push({
        name: `${group.name}`,
        category: "connectors",
        quantity: takeCount,
        unit: "шт",
        unitWeightKg: group.unitWeightKg,
        totalWeightKg: itemWeight,
        material: model.connectorParams.material
      });

      currentConnNetWeight += itemWeight;
      remaining -= takeCount;

      if (currentConnNetWeight >= maxConnBoxWeight * 0.85 || remaining > 0) {
        flushConnBox();
      }
    }
  });
  flushConnBox();

  // ==========================================
  // 3. ACCESSORIES & ASSEMBLY TOOL KIT (Комплект для монтажу)
  // Single box 400 x 300 x 180 mm
  // ==========================================
  {
    const code = "ACC-01";
    const gross = 8.5;
    const { barcode, qrPayload } = makeTracking(code, "Монтажний набір та ущільнювачі", gross);
    packages.push({
      id: "PKG-ACCESSORY-01",
      code,
      palletId: "PLT-01",
      title: `Коробка №${boxSequence++}: Монтажний комплект та герметизація`,
      category: "accessories",
      type: "accessory_box",
      lengthMm: 400,
      widthMm: 300,
      heightMm: 180,
      tareWeightKg: 0.8,
      netWeightKg: 7.7,
      grossWeightKg: gross,
      maxWeightCapacityKg: 20,
      color: "#5B9279",
      stackable: true,
      fragile: true,
      assemblyTier: "Стартовий набір",
      barcode,
      qrPayload,
      items: [
        {
          name: "Стрічка ущільнювальна EPDM / бутил-каучукова (3 рулони по 20м)",
          category: "accessories",
          quantity: 3,
          unit: "рул",
          unitWeightKg: 1.2,
          totalWeightKg: 3.6,
          details: "Для гідроізоляції стиків променів конектора та деревини"
        },
        {
          name: "Антикорозійний цинковий спрей-грунт холодного цинкування (400 мл)",
          category: "accessories",
          quantity: 2,
          unit: "балон",
          unitWeightKg: 0.45,
          totalWeightKg: 0.9,
          details: "Для захисту монтажних зрізів металу та отворів"
        },
        {
          name: `Біти та посилені магнітні торцеві головки 1/2" під болт M${bom.fasteners.boltDiam}`,
          category: "accessories",
          quantity: 2,
          unit: "шт",
          unitWeightKg: 0.25,
          totalWeightKg: 0.5,
          details: "Професійний інструмент під гайковерт"
        },
        {
          name: "Ламінована інженерна схема маркування та послідовності збірки А3",
          category: "accessories",
          quantity: 1,
          unit: "компл",
          unitWeightKg: 0.3,
          totalWeightKg: 0.3,
          details: "Вологостійка покрокова інструкція для монтажної бригади"
        },
        {
          name: "Підкладки нівелювальні композитні (набір товщин 2, 5, 10 мм)",
          category: "accessories",
          quantity: 50,
          unit: "шт",
          unitWeightKg: 0.04,
          totalWeightKg: 2.0,
          details: "Для юстування горизонту опорних вузлів"
        }
      ]
    });
  }

  // ==========================================
  // 4. STRUTS (Балки каркасу)
  // Strapped timber bundles (пакети пиломатеріалів)
  // Bundled by beam type (e.g. 6 to 10 beams per bundle depending on weight)
  // ==========================================
  let strutBundleIdx = 1;

  bom.strutsByGroup.forEach(group => {
    const singleWeight = group.unitWeightKg;
    // Calculate beams per bundle so it can be comfortably handled by 2 people (20-35 kg per bundle)
    let beamsPerBundle = Math.max(2, Math.floor(28 / Math.max(1, singleWeight)));
    // Clamp to aesthetic multiples (e.g. 4, 6, 8, 10)
    if (beamsPerBundle > 10) beamsPerBundle = 10;
    else if (beamsPerBundle >= 8) beamsPerBundle = 8;
    else if (beamsPerBundle >= 6) beamsPerBundle = 6;
    else if (beamsPerBundle >= 4) beamsPerBundle = 4;

    const totalBundlesForType = Math.ceil(group.count / beamsPerBundle);

    // Bundle cross section: e.g. 2 wide x N high
    const beamsWide = Math.min(2, beamsPerBundle);
    const beamsHigh = Math.ceil(beamsPerBundle / beamsWide);
    const bundleWidthMm = beamsWide * group.widthMm + 20; // plus packing strapping margin
    const bundleHeightMm = beamsHigh * group.depthMm + 20;
    const bundleLengthMm = Math.round(group.lengthMm);

    for (let b = 0; b < totalBundlesForType; b++) {
      const countInThis = Math.min(group.count - b * beamsPerBundle, beamsPerBundle);
      const net = Math.round(countInThis * singleWeight * 10) / 10;
      const tare = 0.8; // strapping bands, wooden spacers, edge boards
      const gross = Math.round((net + tare) * 10) / 10;

      const code = `STR-${group.type}-${String(b + 1).padStart(2, "0")}`;
      const { barcode, qrPayload } = makeTracking(
        code,
        `Балки Тип ${group.type} (${countInThis} шт, ${bundleLengthMm} мм)`,
        gross
      );

      packages.push({
        id: `PKG-STRUT-${group.type}-${b + 1}`,
        code,
        palletId: "PLT-02", // will be assigned during pallet packing
        title: `Пачка №${boxSequence++}: Балки каркаса Тип «${group.type}» (${countInThis} шт)`,
        category: "struts",
        type: "timber_bundle",
        lengthMm: bundleLengthMm,
        widthMm: bundleWidthMm,
        heightMm: bundleHeightMm,
        tareWeightKg: tare,
        netWeightKg: net,
        grossWeightKg: gross,
        maxWeightCapacityKg: 40,
        color: group.color,
        stackable: true,
        fragile: false,
        assemblyTier: group.isBaseBeam ? "Ярус 0 (Основа)" : "Купол каркас",
        barcode,
        qrPayload,
        items: [
          {
            name: `Балка Тип «${group.type}» торцьована з отворами (довжина ${bundleLengthMm} мм)`,
            category: "struts",
            quantity: countInThis,
            unit: "шт",
            unitWeightKg: singleWeight,
            totalWeightKg: net,
            details: `Перетин: ${group.widthMm}×${group.depthMm} мм. Матеріал: ${model.beamProfile.name}`,
            material: model.beamProfile.material
          }
        ]
      });
      strutBundleIdx++;
    }
  });

  // ==========================================
  // 5. SHEATHING PANELS (Панелі обшивки)
  // If enabled: grouped into stacked triangular packs
  // ==========================================
  if (config.includeSheathing && bom.panelsByGroup.length > 0) {
    let panelPackIdx = 1;

    bom.panelsByGroup.forEach(group => {
      // E.g. 10 - 15 triangular panels per strapped stack
      const maxPackWeight = 35;
      const panelsPerPack = Math.max(3, Math.min(15, Math.floor(maxPackWeight / Math.max(1, group.unitWeightKg))));
      const packCount = Math.ceil(group.count / panelsPerPack);

      // Estimate bounding dimensions of the triangle
      const approxSide = Math.round(Math.sqrt((4 * group.areaM2 * 1000000) / Math.sqrt(3)));
      const packLengthMm = Math.max(600, approxSide);
      const packWidthMm = Math.max(500, Math.round(approxSide * 0.866));
      const packHeightMm = Math.round(panelsPerPack * (bom.sheathingThickness + 1) + 30); // with corrugated caps

      for (let p = 0; p < packCount; p++) {
        const countInThis = Math.min(group.count - p * panelsPerPack, panelsPerPack);
        const net = Math.round(countInThis * group.unitWeightKg * 10) / 10;
        const tare = 1.8; // protective hardboard sheets top/bottom + strapping
        const gross = Math.round((net + tare) * 10) / 10;

        const code = `PNL-${group.type}-${String(p + 1).padStart(2, "0")}`;
        const { barcode, qrPayload } = makeTracking(
          code,
          `Панелі обшивки Тип ${group.type} (${countInThis} шт)`,
          gross
        );

        packages.push({
          id: `PKG-PANEL-${group.type}-${p + 1}`,
          code,
          palletId: "PLT-03",
          title: `Пачка №${boxSequence++}: Трикутні панелі обшивки Тип «${group.type}» (${countInThis} шт)`,
          category: "panels",
          type: "panel_stack",
          lengthMm: packLengthMm,
          widthMm: packWidthMm,
          heightMm: packHeightMm,
          tareWeightKg: tare,
          netWeightKg: net,
          grossWeightKg: gross,
          maxWeightCapacityKg: 45,
          color: group.color,
          stackable: true,
          fragile: true,
          assemblyTier: "Обшивка купола",
          barcode,
          qrPayload,
          items: [
            {
              name: `Трикутна панель Тип «${group.type}» (товщина ${bom.sheathingThickness} мм)`,
              category: "panels",
              quantity: countInThis,
              unit: "шт",
              unitWeightKg: group.unitWeightKg,
              totalWeightKg: net,
              details: `Площа 1 шт: ${group.areaM2.toFixed(2)} м². Фаска та отвори виконані на ЧПК`,
              material: model.sheathingParams?.material || "plywood_birch"
            }
          ]
        });
        panelPackIdx++;
      }
    });
  }

  return packages;
}

/**
 * Packs boxes into pallets with real 3D coordinates, layer arrangement,
 * weight limits and volume utilization analysis.
 */
export function optimizePalletArrangement(
  allPackages: BoxPackage[],
  model: DomeModel,
  config: PackagingConfig = DEFAULT_PACKAGING_CONFIG
): OptimizedPallet[] {
  const pallets: OptimizedPallet[] = [];
  const palletStd = PALLET_STANDARDS[config.palletStandard] || PALLET_STANDARDS.euro_1;

  // Separate packages into logical pallet types
  const hardwareAndConnectors = allPackages.filter(
    p => p.category === "connectors" || p.category === "fasteners" || p.category === "accessories"
  );
  const struts = allPackages.filter(p => p.category === "struts");
  const panels = allPackages.filter(p => p.category === "panels");

  let palletNumber = 1;

  // ========================================================
  // PALLET 1 (and 2 if heavy): CONNECTORS & HARDWARE & TOOLS
  // Standard Euro-pallet (1200 x 800) with grid packing
  // ========================================================
  if (hardwareAndConnectors.length > 0) {
    let unplaced = [...hardwareAndConnectors];

    while (unplaced.length > 0) {
      const palletId = `PLT-${String(palletNumber).padStart(2, "0")}`;
      const placed: PlacedPackage[] = [];

      // Grid placement:
      // Pallet deck: 1200 x 800 mm
      // Typical box: 400 x 300 mm -> fits exactly 2 columns of 300 (or 2 x 400) -> 2 x 3 = 6 boxes per layer!
      // or 300 x 200 mm boxes fit 4 x 2 = 8 per layer
      let currentZ = 0;
      let layerIdx = 0;
      let palletNetWeight = 0;

      while (unplaced.length > 0 && currentZ < config.maxPalletHeightMm - palletStd.heightMm - 200) {
        let currentX = 0;
        let currentY = 0;
        let maxRowHeight = 0;
        let layerMaxZ = 0;
        let placedInLayer = 0;

        // Try to place boxes in this layer
        const remainingForLayer = [...unplaced];
        for (const pkg of remainingForLayer) {
          // Check weight limit
          if (palletNetWeight + pkg.grossWeightKg > palletStd.maxPayloadKg) {
            break;
          }

          let pLen = pkg.lengthMm;
          let pWid = pkg.widthMm;

          // Check if fits in current row
          if (currentX + pLen > palletStd.lengthMm) {
            // New row
            currentX = 0;
            currentY += maxRowHeight + 10;
            maxRowHeight = 0;
          }

          // Check if exceeds pallet width
          if (currentY + pWid > palletStd.widthMm) {
            // Layer is full
            break;
          }

          placed.push({
            package: { ...pkg, palletId },
            xMm: currentX,
            yMm: currentY,
            zMm: currentZ,
            lengthMm: pLen,
            widthMm: pWid,
            heightMm: pkg.heightMm,
            layerIndex: layerIdx,
            rotationDeg: 0
          });

          palletNetWeight += pkg.grossWeightKg;
          currentX += pLen + 15;
          maxRowHeight = Math.max(maxRowHeight, pWid);
          layerMaxZ = Math.max(layerMaxZ, pkg.heightMm);
          placedInLayer++;

          // Remove from unplaced
          const idx = unplaced.findIndex(u => u.id === pkg.id);
          if (idx !== -1) unplaced.splice(idx, 1);
        }

        if (placedInLayer === 0) {
          // Cannot place any more items on this pallet
          break;
        }

        currentZ += layerMaxZ + 15; // gap between layers / cardboard interlayers
        layerIdx++;
      }

      // If loop didn't place anything (e.g. single item too big), force place 1 item
      if (placed.length === 0 && unplaced.length > 0) {
        const pkg = unplaced.shift()!;
        placed.push({
          package: { ...pkg, palletId },
          xMm: 20,
          yMm: 20,
          zMm: 0,
          lengthMm: pkg.lengthMm,
          widthMm: pkg.widthMm,
          heightMm: pkg.heightMm,
          layerIndex: 0,
          rotationDeg: 0
        });
        palletNetWeight += pkg.grossWeightKg;
        currentZ = pkg.heightMm;
        layerIdx = 1;
      }

      const gross = Math.round((palletNetWeight + palletStd.tareWeightKg) * 10) / 10;
      const totalH = Math.round(currentZ + palletStd.heightMm);
      const volM3 = Math.round(((palletStd.lengthMm * palletStd.widthMm * totalH) / 1000000000) * 100) / 100;
      const actualBoxesVolM3 = placed.reduce(
        (sum, p) => sum + (p.lengthMm * p.widthMm * p.heightMm) / 1000000000,
        0
      );
      const volUtilPct = Math.min(95, Math.round((actualBoxesVolM3 / Math.max(0.1, volM3)) * 100));

      pallets.push({
        id: palletId,
        palletNumber: palletNumber++,
        title: `Палета №${palletNumber - 1}: Вузлові конектори, метизи та монтажний набір`,
        category: "connectors_hardware",
        palletStandard: palletStd,
        packages: placed,
        totalPackagesCount: placed.length,
        totalItemsCount: placed.reduce((sum, p) => sum + p.package.items.reduce((s, it) => s + it.quantity, 0), 0),
        palletTareWeightKg: palletStd.tareWeightKg,
        netCargoWeightKg: Math.round(palletNetWeight * 10) / 10,
        grossWeightKg: gross,
        maxPayloadKg: palletStd.maxPayloadKg,
        cargoLengthMm: palletStd.lengthMm,
        cargoWidthMm: palletStd.widthMm,
        cargoHeightMm: currentZ,
        totalHeightWithPalletMm: totalH,
        volumeM3: volM3,
        volumeUtilizationPct: volUtilPct,
        weightUtilizationPct: Math.round((gross / palletStd.maxPayloadKg) * 100),
        strappingBandsCount: 4,
        stretchFilmTurns: 6,
        cornerProtectorsCount: 4,
        isOverloaded: gross > palletStd.maxPayloadKg,
        isOverheight: totalH > config.maxPalletHeightMm,
        layerCount: layerIdx
      });
    }
  }

  // ========================================================
  // PALLETS FOR TIMBER STRUTS (Балки каркасу)
  // Uses long timber skid standard or standard pallet
  // ========================================================
  if (struts.length > 0) {
    // If struts are long (> 1300 mm), use long_timber skid
    const maxStrutLen = Math.max(...struts.map(s => s.lengthMm));
    const strutPalletStd =
      maxStrutLen > 1300 ? PALLET_STANDARDS.long_timber : palletStd;

    let unplacedStruts = [...struts];

    while (unplacedStruts.length > 0) {
      const palletId = `PLT-${String(palletNumber).padStart(2, "0")}`;
      const placed: PlacedPackage[] = [];
      let currentZ = 0;
      let layerIdx = 0;
      let palletNetWeight = 0;

      while (unplacedStruts.length > 0 && currentZ < config.maxPalletHeightMm - strutPalletStd.heightMm - 150) {
        let currentY = 0;
        let layerMaxH = 0;
        let placedInLayer = 0;

        // Struts lie along the pallet length X
        const remaining = [...unplacedStruts];
        for (const pkg of remaining) {
          if (palletNetWeight + pkg.grossWeightKg > strutPalletStd.maxPayloadKg) {
            break;
          }

          if (currentY + pkg.widthMm > strutPalletStd.widthMm) {
            break;
          }

          placed.push({
            package: { ...pkg, palletId },
            xMm: 20,
            yMm: currentY,
            zMm: currentZ,
            lengthMm: Math.min(strutPalletStd.lengthMm - 40, pkg.lengthMm),
            widthMm: pkg.widthMm,
            heightMm: pkg.heightMm,
            layerIndex: layerIdx,
            rotationDeg: 0
          });

          palletNetWeight += pkg.grossWeightKg;
          currentY += pkg.widthMm + 15;
          layerMaxH = Math.max(layerMaxH, pkg.heightMm);
          placedInLayer++;

          const idx = unplacedStruts.findIndex(u => u.id === pkg.id);
          if (idx !== -1) unplacedStruts.splice(idx, 1);
        }

        if (placedInLayer === 0) break;
        currentZ += layerMaxH + 15;
        layerIdx++;
      }

      if (placed.length === 0 && unplacedStruts.length > 0) {
        const pkg = unplacedStruts.shift()!;
        placed.push({
          package: { ...pkg, palletId },
          xMm: 20,
          yMm: 20,
          zMm: 0,
          lengthMm: pkg.lengthMm,
          widthMm: pkg.widthMm,
          heightMm: pkg.heightMm,
          layerIndex: 0,
          rotationDeg: 0
        });
        palletNetWeight += pkg.grossWeightKg;
        currentZ = pkg.heightMm;
        layerIdx = 1;
      }

      const gross = Math.round((palletNetWeight + strutPalletStd.tareWeightKg) * 10) / 10;
      const totalH = Math.round(currentZ + strutPalletStd.heightMm);
      const volM3 = Math.round(((strutPalletStd.lengthMm * strutPalletStd.widthMm * totalH) / 1000000000) * 100) / 100;
      const actualVol = placed.reduce((sum, p) => sum + (p.lengthMm * p.widthMm * p.heightMm) / 1000000000, 0);
      const volUtilPct = Math.min(95, Math.round((actualVol / Math.max(0.1, volM3)) * 100));

      const typesList = Array.from(new Set(placed.map(p => p.package.title.match(/Тип «(.*?)»/)?.[1] || ""))).filter(Boolean);

      pallets.push({
        id: palletId,
        palletNumber: palletNumber++,
        title: `Палета №${palletNumber - 1}: Пиломатеріали балок каркаса (${typesList.join(", ")})`,
        category: "timber_struts",
        palletStandard: strutPalletStd,
        packages: placed,
        totalPackagesCount: placed.length,
        totalItemsCount: placed.reduce((sum, p) => sum + p.package.items.reduce((s, it) => s + it.quantity, 0), 0),
        palletTareWeightKg: strutPalletStd.tareWeightKg,
        netCargoWeightKg: Math.round(palletNetWeight * 10) / 10,
        grossWeightKg: gross,
        maxPayloadKg: strutPalletStd.maxPayloadKg,
        cargoLengthMm: strutPalletStd.lengthMm,
        cargoWidthMm: strutPalletStd.widthMm,
        cargoHeightMm: currentZ,
        totalHeightWithPalletMm: totalH,
        volumeM3: volM3,
        volumeUtilizationPct: volUtilPct,
        weightUtilizationPct: Math.round((gross / strutPalletStd.maxPayloadKg) * 100),
        strappingBandsCount: 6, // 3 longitudinal + 3 transverse PET bands
        stretchFilmTurns: 8,
        cornerProtectorsCount: 8,
        isOverloaded: gross > strutPalletStd.maxPayloadKg,
        isOverheight: totalH > config.maxPalletHeightMm,
        layerCount: layerIdx
      });
    }
  }

  // ========================================================
  // PALLETS FOR SHEATHING PANELS (Панелі обшивки)
  // Uses sheet pallet (2500 x 1250) or industrial pallet
  // ========================================================
  if (panels.length > 0) {
    const sheetPalletStd = PALLET_STANDARDS.sheet_pallet;
    let unplacedPanels = [...panels];

    while (unplacedPanels.length > 0) {
      const palletId = `PLT-${String(palletNumber).padStart(2, "0")}`;
      const placed: PlacedPackage[] = [];
      let currentZ = 0;
      let layerIdx = 0;
      let palletNetWeight = 0;

      while (unplacedPanels.length > 0 && currentZ < config.maxPalletHeightMm - sheetPalletStd.heightMm - 100) {
        let currentX = 20;
        let currentY = 20;
        let layerMaxH = 0;
        let placedInLayer = 0;

        const remaining = [...unplacedPanels];
        for (const pkg of remaining) {
          if (palletNetWeight + pkg.grossWeightKg > sheetPalletStd.maxPayloadKg) break;

          if (currentX + pkg.lengthMm > sheetPalletStd.lengthMm) {
            currentX = 20;
            currentY += pkg.widthMm + 20;
          }

          if (currentY + pkg.widthMm > sheetPalletStd.widthMm) break;

          placed.push({
            package: { ...pkg, palletId },
            xMm: currentX,
            yMm: currentY,
            zMm: currentZ,
            lengthMm: pkg.lengthMm,
            widthMm: pkg.widthMm,
            heightMm: pkg.heightMm,
            layerIndex: layerIdx,
            rotationDeg: 0
          });

          palletNetWeight += pkg.grossWeightKg;
          currentX += pkg.lengthMm + 20;
          layerMaxH = Math.max(layerMaxH, pkg.heightMm);
          placedInLayer++;

          const idx = unplacedPanels.findIndex(u => u.id === pkg.id);
          if (idx !== -1) unplacedPanels.splice(idx, 1);
        }

        if (placedInLayer === 0) break;
        currentZ += layerMaxH + 10;
        layerIdx++;
      }

      if (placed.length === 0 && unplacedPanels.length > 0) {
        const pkg = unplacedPanels.shift()!;
        placed.push({
          package: { ...pkg, palletId },
          xMm: 20,
          yMm: 20,
          zMm: 0,
          lengthMm: pkg.lengthMm,
          widthMm: pkg.widthMm,
          heightMm: pkg.heightMm,
          layerIndex: 0,
          rotationDeg: 0
        });
        palletNetWeight += pkg.grossWeightKg;
        currentZ = pkg.heightMm;
        layerIdx = 1;
      }

      const gross = Math.round((palletNetWeight + sheetPalletStd.tareWeightKg) * 10) / 10;
      const totalH = Math.round(currentZ + sheetPalletStd.heightMm);
      const volM3 = Math.round(((sheetPalletStd.lengthMm * sheetPalletStd.widthMm * totalH) / 1000000000) * 100) / 100;
      const actualVol = placed.reduce((sum, p) => sum + (p.lengthMm * p.widthMm * p.heightMm) / 1000000000, 0);
      const volUtilPct = Math.min(95, Math.round((actualVol / Math.max(0.1, volM3)) * 100));

      pallets.push({
        id: palletId,
        palletNumber: palletNumber++,
        title: `Палета №${palletNumber - 1}: Трикутні панелі обшивки купола`,
        category: "sheathing_panels",
        palletStandard: sheetPalletStd,
        packages: placed,
        totalPackagesCount: placed.length,
        totalItemsCount: placed.reduce((sum, p) => sum + p.package.items.reduce((s, it) => s + it.quantity, 0), 0),
        palletTareWeightKg: sheetPalletStd.tareWeightKg,
        netCargoWeightKg: Math.round(palletNetWeight * 10) / 10,
        grossWeightKg: gross,
        maxPayloadKg: sheetPalletStd.maxPayloadKg,
        cargoLengthMm: sheetPalletStd.lengthMm,
        cargoWidthMm: sheetPalletStd.widthMm,
        cargoHeightMm: currentZ,
        totalHeightWithPalletMm: totalH,
        volumeM3: volM3,
        volumeUtilizationPct: volUtilPct,
        weightUtilizationPct: Math.round((gross / sheetPalletStd.maxPayloadKg) * 100),
        strappingBandsCount: 6,
        stretchFilmTurns: 8,
        cornerProtectorsCount: 8,
        isOverloaded: gross > sheetPalletStd.maxPayloadKg,
        isOverheight: totalH > config.maxPalletHeightMm,
        layerCount: layerIdx
      });
    }
  }

  return pallets;
}

/**
 * Builds the comprehensive packaging and logistics plan
 */
export function buildPackagingPlan(
  model: DomeModel,
  config: PackagingConfig = DEFAULT_PACKAGING_CONFIG
): PackagingPlan {
  const allPackages = generateOptimizedPackages(model, config);
  const pallets = optimizePalletArrangement(allPackages, model, config);

  const totalGrossWeightKg = Math.round(pallets.reduce((sum, p) => sum + p.grossWeightKg, 0) * 10) / 10;
  const totalNetWeightKg = Math.round(pallets.reduce((sum, p) => sum + p.netCargoWeightKg, 0) * 10) / 10;
  const totalTareWeightKg = Math.round((totalGrossWeightKg - totalNetWeightKg) * 10) / 10;
  const totalVolumeM3 = Math.round(pallets.reduce((sum, p) => sum + p.volumeM3, 0) * 100) / 100;

  // Loading Meters (LDM) = sum(pallet_length * pallet_width) / (2.4m * 1m)
  const loadingMetersLdm = Math.round(
    pallets.reduce((sum, p) => sum + (p.palletStandard.lengthMm * p.palletStandard.widthMm) / (2400 * 1000), 0) * 10
  ) / 10;

  // Category breakdown
  const categoryMap: Record<string, { label: string; weightKg: number; count: number; color: string }> = {
    struts: { label: "Балки каркасу (деревина)", weightKg: 0, count: 0, color: "#2E7D32" },
    connectors: { label: "Металеві конектори (сталь)", weightKg: 0, count: 0, color: "#4A7C9B" },
    fasteners: { label: "Метизи (болти, гайки, анкери)", weightKg: 0, count: 0, color: "#DE7C5A" },
    panels: { label: "Панелі обшивки", weightKg: 0, count: 0, color: "#DDA843" },
    accessories: { label: "Монтажний набір та ущільнювачі", weightKg: 0, count: 0, color: "#5B9279" }
  };

  allPackages.forEach(pkg => {
    if (categoryMap[pkg.category]) {
      categoryMap[pkg.category].weightKg += pkg.grossWeightKg;
      categoryMap[pkg.category].count += 1;
    }
  });

  const categoryBreakdown = Object.entries(categoryMap)
    .filter(([_, data]) => data.count > 0)
    .map(([cat, data]) => ({
      category: cat,
      label: data.label,
      weightKg: Math.round(data.weightKg * 10) / 10,
      packagesCount: data.count,
      color: data.color
    }));

  // Vehicle utilization analysis
  const vehicleUtilization = VEHICLE_OPTIONS.map(veh => {
    const weightPct = Math.round((totalGrossWeightKg / veh.cargoCapacityKg) * 100);
    const volumePct = Math.round((totalVolumeM3 / veh.cargoVolumeM3) * 100);
    const palletsPct = Math.round((pallets.length / veh.maxEuroPallets) * 100);
    const isSuitable = weightPct <= 100 && volumePct <= 100 && palletsPct <= 100;
    return {
      vehicle: veh,
      weightPct,
      volumePct,
      palletsPct,
      isSuitable
    };
  });

  const suitableVehicles = vehicleUtilization.filter(v => v.isSuitable);
  const recommendedVehicle = suitableVehicles.length > 0
    ? suitableVehicles[0].vehicle
    : VEHICLE_OPTIONS[VEHICLE_OPTIONS.length - 1];

  return {
    config,
    pallets,
    allPackages,
    totalGrossWeightKg,
    totalNetWeightKg,
    totalTareWeightKg,
    totalVolumeM3,
    totalPalletsCount: pallets.length,
    totalPackagesCount: allPackages.length,
    categoryBreakdown,
    vehicleUtilization,
    recommendedVehicle,
    loadingMetersLdm
  };
}

/**
 * Exports packing manifest to CSV format
 */
export function exportPackingManifestCSV(plan: PackagingPlan, model: DomeModel): string {
  const lines: string[] = [];
  lines.push("Пакувальний лист та маніфест відвантаження комплекту геодезичного купола");
  lines.push(`Проект: Геодезичний купол ${model.parameters.frequency}V (D=${model.parameters.diameter / 1000}м, H=${model.parameters.height / 1000}м)`);
  lines.push(`Дата формування: ${new Date().toLocaleDateString("uk-UA")}`);
  lines.push(`Загальна вага брутто: ${plan.totalGrossWeightKg} кг; Кількість палет: ${plan.totalPalletsCount}; Всього місць: ${plan.totalPackagesCount}`);
  lines.push("");
  lines.push("№ Місця;Код;Палета;Назва упаковки;Категорія;Габарити Д×Ш×В (мм);Вага Нетто (кг);Вага Брутто (кг);Штрихкод;Вміст / Складники");

  let seq = 1;
  plan.pallets.forEach(plt => {
    plt.packages.forEach(placed => {
      const p = placed.package;
      const itemsSummary = p.items.map(it => `${it.name} - ${it.quantity} ${it.unit}`).join(" | ");
      lines.push(
        [
          seq++,
          `"${p.code}"`,
          `"${plt.title.split(":")[0]}"`,
          `"${p.title.replace(/"/g, '""')}"`,
          `"${p.category}"`,
          `"${p.lengthMm}×${p.widthMm}×${p.heightMm}"`,
          p.netWeightKg.toFixed(1),
          p.grossWeightKg.toFixed(1),
          `"${p.barcode}"`,
          `"${itemsSummary.replace(/"/g, '""')}"`
        ].join(";")
      );
    });
  });

  return "\uFEFF" + lines.join("\r\n");
}
