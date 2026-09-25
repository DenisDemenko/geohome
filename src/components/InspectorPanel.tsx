import React from "react";
import { DomeModel, NodeId, EdgeId, FaceId } from "../core/types";
import { calculateConnector } from "../core/connectors";
import { calculateBeamMiterAngles } from "../core/beams";
import {
  generateConnectorSVG,
  generateSingleBeamBlueprintSVG,
  generateSingleTriangleBlueprintSVG,
  downloadFile
} from "../export/svgExport";
import {
  Compass,
  Ruler,
  Layers,
  X,
  Download,
  Info,
  ExternalLink,
  ChevronRight
} from "lucide-react";

interface InspectorPanelProps {
  model: DomeModel;
  selectedNodeId: NodeId | null;
  selectedEdgeId: EdgeId | null;
  selectedFaceId: FaceId | null;
  onClose: () => void;
  onSelectNode: (id: NodeId) => void;
  onSelectEdge: (id: EdgeId) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  model,
  selectedNodeId,
  selectedEdgeId,
  selectedFaceId,
  onClose,
  onSelectNode,
  onSelectEdge
}) => {
  if (selectedNodeId === null && selectedEdgeId === null && selectedFaceId === null) {
    return null;
  }

  // 1. NODE INSPECTOR
  if (selectedNodeId !== null) {
    const node = model.nodes.find(n => n.id === selectedNodeId);
    if (!node) return null;
    const connector = calculateConnector(model, node.id);

    return (
      <div className="p-5 rounded-3xl tactile-card border border-white/80 animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26]">
              <Compass className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1A2E3B]">Інспектор вузла #{node.id}</h3>
              <p className="text-[11px] text-[#5A6778]">
                {node.boundary ? "Крайовий вузол основи (фундаментний)" : "Внутрішній вузол сфери"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl tactile-btn text-[#8C9BAE] hover:text-[#1A2E3B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Spatial Coordinates */}
        <div className="grid grid-cols-3 gap-2 my-3 text-xs">
          <div className="p-2 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">X</span>
            <span className="font-mono font-bold text-[#1A2E3B]">{node.position.x.toFixed(1)} мм</span>
          </div>
          <div className="p-2 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">Y</span>
            <span className="font-mono font-bold text-[#1A2E3B]">{node.position.y.toFixed(1)} мм</span>
          </div>
          <div className="p-2 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">Z (Висота)</span>
            <span className="font-mono font-bold text-[#1A2E3B]">{node.position.z.toFixed(1)} мм</span>
          </div>
        </div>

        {/* Connected Beams List */}
        <div className="mb-3">
          <span className="text-xs font-bold text-[#5A6778] block mb-1.5 uppercase">
            З'єднані балки ({connector.beams.length} шт):
          </span>
          <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
            {connector.beams.map(b => (
              <div
                key={b.edgeId}
                onClick={() => onSelectEdge(b.edgeId)}
                className="flex items-center justify-between p-2 rounded-xl bg-white/70 hover:bg-white cursor-pointer transition-colors text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: model.edges[b.edgeId]?.color }}
                  />
                  <span className="font-bold text-[#1A2E3B]">
                    Балка #{b.edgeId} (Тип {b.beamType})
                  </span>
                </div>
                <span className="font-mono text-[#5A6778]">{b.length} мм</span>
              </div>
            ))}
          </div>
        </div>

        {/* Download Single Node SVG */}
        <button
          onClick={() => {
            const svg = generateConnectorSVG(connector, model);
            downloadFile(`connector_node_${node.id}.svg`, svg);
          }}
          className="w-full py-2 text-xs font-bold rounded-xl tactile-btn-mint flex items-center justify-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Завантажити розкрій конектора #{node.id} (SVG)</span>
        </button>
      </div>
    );
  }

  // 2. BEAM INSPECTOR
  if (selectedEdgeId !== null) {
    const edge = model.edges[selectedEdgeId];
    if (!edge) return null;
    const miter = calculateBeamMiterAngles(edge, model.nodes);

    return (
      <div className="p-5 rounded-3xl tactile-card border border-white/80 animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center text-white"
              style={{ backgroundColor: edge.color }}
            >
              <Ruler className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1A2E3B]">
                Інспектор балки #{edge.id} (Тип {edge.type})
              </h3>
              <p className="text-[11px] text-[#5A6778]">
                Вузол #{edge.start} ↔ Вузол #{edge.end}
                {edge.isBaseBeam && (
                  <span className="ml-1.5 text-[#1A3E26] font-semibold">
                    • Опорний брус горизонту фундаменту (Z = 0)
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl tactile-btn text-[#8C9BAE] hover:text-[#1A2E3B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 my-3 text-xs">
          <div className="p-2.5 rounded-xl tactile-inset-subtle border border-[#CBD5E0]">
            <span className="text-[10px] text-[#4A5568] font-bold block">1. До вузла сходження</span>
            <span className="font-mono font-bold text-sm text-[#1A2E3B]">{edge.length} мм</span>
            <span className="text-[9px] text-[#718096] block">по осях вузлів</span>
          </div>
          <div className="p-2.5 rounded-xl bg-[#E1EDE3]/70 border border-[#A6C7AE]">
            <span className="text-[10px] text-[#1A3E26] font-bold block">2. Обрізаний під конектор</span>
            <span className="font-mono font-black text-sm text-[#2E7D32]">
              {edge.cutLength || Math.round(edge.length - model.connectorParams.hubDiameter)} мм
            </span>
            <span className="text-[9px] text-[#2E7D32] block">чистий розпил бруса</span>
          </div>
          <div className="p-2.5 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#DE7C5A] font-bold block">Кільце конектора</span>
            <span className="font-mono font-bold text-sm text-[#DE7C5A]">
              -{(model.connectorParams.hubDiameter / 2).toFixed(0)} мм
            </span>
            <span className="text-[9px] text-[#8C9BAE] block">відступ з кожного торця</span>
          </div>
          <div className="p-2.5 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">Торцевий зпил</span>
            <span className="font-mono font-bold text-sm text-[#DE7C5A]">
              {miter.startMiterDeg}°
            </span>
            <span className="text-[9px] text-[#8C9BAE] block">кут на торцювальній пилі</span>
          </div>
          <div className="p-2.5 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">Переріз бруса</span>
            <span className="font-mono font-bold text-sm text-[#1A2E3B]">
              {model.beamProfile.width}×{model.beamProfile.depth}
            </span>
            <span className="text-[9px] text-[#8C9BAE] block">ширина × висота</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => onSelectNode(edge.start)}
            className="flex-1 py-1.5 px-3 text-xs font-medium rounded-xl tactile-btn text-[#4A5568]"
          >
            Перейти до Вузла #{edge.start}
          </button>
          <button
            onClick={() => onSelectNode(edge.end)}
            className="flex-1 py-1.5 px-3 text-xs font-medium rounded-xl tactile-btn text-[#4A5568]"
          >
            Перейти до Вузла #{edge.end}
          </button>
        </div>

        <button
          onClick={() => {
            const svg = generateSingleBeamBlueprintSVG(model, edge.type);
            downloadFile(
              `kupolgeo_beam_type_${edge.type}_${model.parameters.frequency}V.svg`,
              svg,
              "image/svg+xml;charset=utf-8"
            );
          }}
          className="w-full mt-2.5 py-2 px-3 text-xs font-bold rounded-xl tactile-btn-mint flex items-center justify-center gap-2 shadow-2xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Завантажити креслення балки типу {edge.type} (SVG)</span>
        </button>
      </div>
    );
  }

  // 3. FACE INSPECTOR
  if (selectedFaceId !== null) {
    const face = model.faces[selectedFaceId];
    if (!face) return null;
    const group = model.faceGroups.find(g => g.type === face.type);

    return (
      <div className="p-5 rounded-3xl tactile-card border border-white/80 animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center justify-between pb-3 border-b border-[#E8E2D8]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center bg-[#FDF0E6] text-[#DE7C5A]">
              <Layers className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1A2E3B]">
                Інспектор панелі обшивки #{face.id}
              </h3>
              <p className="text-[11px] text-[#5A6778]">Тип грані: {face.type}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl tactile-btn text-[#8C9BAE] hover:text-[#1A2E3B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 my-3 text-xs">
          <div className="p-2.5 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">Площа</span>
            <span className="font-mono font-bold text-sm text-[#1A2E3B]">
              {(face.area / 1_000_000).toFixed(3)} м²
            </span>
          </div>
          <div className="p-2.5 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">Сторони</span>
            <span className="font-mono font-bold text-xs text-[#1A2E3B]">
              {group ? group.lengths.join(" × ") : "---"} мм
            </span>
          </div>
          <div className="p-2.5 rounded-xl tactile-inset-subtle">
            <span className="text-[10px] text-[#8C9BAE] block">Кути панелі</span>
            <span className="font-mono font-bold text-xs text-[#DE7C5A]">
              {group ? group.angles.join("° / ") : "---"}°
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            const svg = generateSingleTriangleBlueprintSVG(model, face.type);
            downloadFile(
              `sheathing_triangle_${face.type}_${model.parameters.frequency}V.svg`,
              svg,
              "image/svg+xml;charset=utf-8"
            );
          }}
          className="w-full mt-2.5 py-2 px-3 text-xs font-bold rounded-xl tactile-btn-peach flex items-center justify-center gap-2 shadow-2xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Завантажити креслення трикутника типу {face.type} (SVG)</span>
        </button>
      </div>
    );
  }

  return null;
};
