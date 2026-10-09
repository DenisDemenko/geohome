import { DomeModel, Node, Edge, Face } from "./types";
import { calculateFoundationLayout, FoundationLayoutCalculation } from "./foundation";

export interface AssemblyStepInfo {
  step: number; // 1 to 6
  name: string;
  shortName: string;
  description: string;
  constructionTip: string;
  targetProgress: number; // 0.0 to 1.0
  iconName: "foundation" | "tier1" | "tier2" | "apex" | "sheathing" | "complete";
}

export const ASSEMBLY_STEPS: AssemblyStepInfo[] = [
  {
    step: 1,
    name: "Етап 1: Розбивка осей та фундамент",
    shortName: "Фундамент",
    description: "Влаштування основи, винесення осей від центру (0,0) та встановлення закладних янкерів у вузлах.",
    constructionTip: "Перевірте рівень горизонту між янкерними пластинами нівеліром (допуск ±3 мм).",
    targetProgress: 0.15,
    iconName: "foundation"
  },
  {
    step: 2,
    name: "Етап 2: Базове кільце та 1-й ярус каркаса",
    shortName: "Базовий ярус",
    description: "Монтаж периметральних балок основи, з'єднання з янкерами та встановлення першого ряду трикутників.",
    constructionTip: "Затягуйте болти нижніх конекторів на 70%, остаточна затяжка після змикання кільця.",
    targetProgress: 0.35,
    iconName: "tier1"
  },
  {
    step: 3,
    name: "Етап 3: Проміжний ярус та вузли",
    shortName: "Середній ярус",
    description: "Монтаж середнього поясу ребер купола та проміжних багатопроменевих конекторів.",
    constructionTip: "Використовуйте тимчасові телескопічні опори або підмостки для фіксації вузлів.",
    targetProgress: 0.55,
    iconName: "tier2"
  },
  {
    step: 4,
    name: "Етап 4: Верхній ярус та замикання вершини",
    shortName: "Замикання каркаса",
    description: "Встановлення вінцевого вершинного конектора та фінішне замикання всього просторового дерев'яного каркаса.",
    constructionTip: "Після встановлення вершини перевірте всі діагоналі та виконайте фінальну протяжку болтів.",
    targetProgress: 0.72,
    iconName: "apex"
  },
  {
    step: 5,
    name: "Етап 5: Монтаж нижнього поясу обшивки",
    shortName: "Обшивка панелями",
    description: "Початок монтажу трикутних плит обшивки (фанера / OSB) знизу вгору з дотриманням деформаційних зазорів 2-3 мм.",
    constructionTip: "Закріплюйте панелі конструкційними саморізами з кроком 150 мм по периметру балки.",
    targetProgress: 0.88,
    iconName: "sheathing"
  },
  {
    step: 6,
    name: "Етап 6: Завершений купол",
    shortName: "Фініш",
    description: "Повна обшивка покрівлі, герметизація швів, готовність до гідроізоляції та покрівельного покриття.",
    constructionTip: "Купол готовий до укладання підкладкового килима та гнучкої черепиці / мембрани.",
    targetProgress: 1.0,
    iconName: "complete"
  }
];

export interface AssemblyState {
  isActive: boolean;
  step: number; // 0 = Full finished model, 1..6 = discrete steps
  progress: number; // 0.0 to 1.0 continuous progress
  isPlaying: boolean;
  speed: number; // 0.5x, 1x, 2x
}

export interface AssemblyElementsVisibility {
  showFoundation: boolean;
  showSurveyAxes: boolean;
  visibleEdgeIds: Set<number>;
  visibleNodeIds: Set<number>;
  visibleFaceIds: Set<number>;
  activeTierEdgeIds: Set<number>;
  activeTierFaceIds: Set<number>;
  stats: {
    installedAnchors: number;
    installedBeams: number;
    totalBeams: number;
    installedPanels: number;
    totalPanels: number;
    installedWeightKg: number;
  };
}

/**
 * Calculates which elements of the dome should be visible at the given assembly progress (0.0 to 1.0)
 */
export function calculateAssemblyVisibility(
  model: DomeModel,
  progress: number,
  isAssemblyModeActive: boolean
): AssemblyElementsVisibility {
  const totalBeams = model.edges.length;
  const totalPanels = model.faces.length;

  // In normal mode (not assembly animation), show complete dome structure without assembly foundation
  if (!isAssemblyModeActive) {
    const allEdges = new Set(model.edges.map(e => e.id));
    const allNodes = new Set(model.nodes.map(n => n.id));
    const allFaces = new Set(model.faces.map(f => f.id));
    return {
      showFoundation: false,
      showSurveyAxes: false,
      visibleEdgeIds: allEdges,
      visibleNodeIds: allNodes,
      visibleFaceIds: allFaces,
      activeTierEdgeIds: new Set(),
      activeTierFaceIds: new Set(),
      stats: {
        installedAnchors: model.nodes.filter(n => n.boundary).length,
        installedBeams: totalBeams,
        totalBeams,
        installedPanels: totalPanels,
        totalPanels,
        installedWeightKg: Math.round(model.structuralAnalysis?.totalDomeWeightKg || 500)
      }
    };
  }

  // If assembly mode is active and at 100%, show everything including foundation
  if (progress >= 0.999) {
    const allEdges = new Set(model.edges.map(e => e.id));
    const allNodes = new Set(model.nodes.map(n => n.id));
    const allFaces = new Set(model.faces.map(f => f.id));
    return {
      showFoundation: true,
      showSurveyAxes: false,
      visibleEdgeIds: allEdges,
      visibleNodeIds: allNodes,
      visibleFaceIds: allFaces,
      activeTierEdgeIds: new Set(),
      activeTierFaceIds: new Set(),
      stats: {
        installedAnchors: model.nodes.filter(n => n.boundary).length,
        installedBeams: totalBeams,
        totalBeams,
        installedPanels: totalPanels,
        totalPanels,
        installedWeightKg: Math.round(model.structuralAnalysis?.totalDomeWeightKg || 500)
      }
    };
  }

  // Find Z range
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const n of model.nodes) {
    if (n.position.z < minZ) minZ = n.position.z;
    if (n.position.z > maxZ) maxZ = n.position.z;
  }
  const deltaZ = Math.max(1, maxZ - minZ);

  // Foundation visible from progress >= 0.03
  const showFoundation = progress >= 0.03;
  // Survey axes visible during Step 1 (progress <= 0.22)
  const showSurveyAxes = progress >= 0.03 && progress <= 0.22;

  // Frame progress: starts at 0.18 (Step 2) up to 0.72 (Step 4 complete frame)
  const frameProgress = Math.max(0, Math.min(1, (progress - 0.18) / 0.54));

  // Sheathing progress: starts at 0.72 (Step 5) up to 1.0 (Step 6)
  const sheathingProgress = Math.max(0, Math.min(1, (progress - 0.72) / 0.28));

  const visibleNodes = new Set<number>();
  const visibleEdges = new Set<number>();
  const visibleFaces = new Set<number>();
  const activeTierEdges = new Set<number>();
  const activeTierFaces = new Set<number>();

  // Nodes visibility
  for (const node of model.nodes) {
    const normZ = (node.position.z - minZ) / deltaZ;
    if (normZ <= frameProgress + 0.02 || (node.boundary && showFoundation)) {
      visibleNodes.add(node.id);
    }
  }

  // Edges visibility
  for (const edge of model.edges) {
    const p1 = model.nodes[edge.start].position;
    const p2 = model.nodes[edge.end].position;
    const maxEdgeZ = Math.max(p1.z, p2.z);
    const normZ = (maxEdgeZ - minZ) / deltaZ;

    if (normZ <= frameProgress) {
      visibleEdges.add(edge.id);
      // Highlight current newly placed tier (within 12% of current progress)
      if (normZ >= frameProgress - 0.12) {
        activeTierEdges.add(edge.id);
      }
    }
  }

  // Faces visibility
  if (sheathingProgress > 0) {
    for (const face of model.faces) {
      const pA = model.nodes[face.a].position;
      const pB = model.nodes[face.b].position;
      const pC = model.nodes[face.c].position;
      const cenZ = (pA.z + pB.z + pC.z) / 3;
      const normZ = (cenZ - minZ) / deltaZ;

      if (normZ <= sheathingProgress) {
        visibleFaces.add(face.id);
        if (normZ >= sheathingProgress - 0.15) {
          activeTierFaces.add(face.id);
        }
      }
    }
  }

  const baseAnchorsCount = model.nodes.filter(n => n.boundary).length;
  const installedAnchors = showFoundation ? baseAnchorsCount : 0;
  const installedBeams = visibleEdges.size;
  const installedPanels = visibleFaces.size;

  const beamWeightKg = (model.structuralAnalysis?.totalDomeWeightKg || 500) * (installedBeams / Math.max(1, totalBeams));
  const panelWeightKg = (model.statistics?.domeSurfaceAreaM2 || 50) * 8 * (installedPanels / Math.max(1, totalPanels));
  const installedWeightKg = Math.round(beamWeightKg + panelWeightKg);

  return {
    showFoundation,
    showSurveyAxes,
    visibleEdgeIds: visibleEdges,
    visibleNodeIds: visibleNodes,
    visibleFaceIds: visibleFaces,
    activeTierEdgeIds: activeTierEdges,
    activeTierFaceIds: activeTierFaces,
    stats: {
      installedAnchors,
      installedBeams,
      totalBeams,
      installedPanels,
      totalPanels,
      installedWeightKg
    }
  };
}
