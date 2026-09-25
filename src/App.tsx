import React, { useState, useMemo } from "react";
import {
  DomeParameters,
  BeamProfile,
  ConnectorParams,
  NodeId,
  EdgeId,
  FaceId
} from "./core/types";
import { generateDome } from "./core/dome";
import { approveGeometry, revokeApproval } from "./core/approval";
import { DEFAULT_BEAM_PROFILES } from "./core/beams";
import { DEFAULT_CONNECTOR_PARAMS } from "./core/connectors";
import { exportDomeSpecificationPDF } from "./export/pdfExport";

import { Viewer3D } from "./components/Viewer3D";
import { ParamControls } from "./components/ParamControls";
import { BeamBlueprintsPanel } from "./components/BeamBlueprintsPanel";
import { StructuralCalcPanel } from "./components/StructuralCalcPanel";
import { ConnectorCutPanel } from "./components/ConnectorCutPanel";
import { SheathingNestingPanel } from "./components/SheathingNestingPanel";
import { ExportPanel } from "./components/ExportPanel";
import { InspectorPanel } from "./components/InspectorPanel";

import {
  Box,
  Layers,
  Disc,
  Hammer,
  Download,
  CheckCircle2,
  Lock,
  Sparkles,
  Maximize,
  Compass,
  FileCode,
  Printer,
  Ruler
} from "lucide-react";

export default function App() {
  // Navigation active tab
  const [activeTab, setActiveTab] = useState<
    "3d" | "beams" | "connectors" | "sheathing" | "export"
  >("3d");

  // Core Dome Parameters State
  const [params, setParams] = useState<DomeParameters>({
    diameter: 8000, // 8 meters
    height: 4000,
    cutType: "1/2",
    frequency: 3, // 3V default popular geodesic dome
    levelBaseHorizon: true, // Level dome with beams along foundation horizon
    levelingMode: "flat_ring"
  });

  const [beamProfile, setBeamProfile] = useState<BeamProfile>(DEFAULT_BEAM_PROFILES[0]);
  const [connectorParams, setConnectorParams] = useState<ConnectorParams>(DEFAULT_CONNECTOR_PARAMS);

  // Approval state
  const [isApproved, setIsApproved] = useState(false);
  const [lockedVersion, setLockedVersion] = useState<string | undefined>(undefined);

  // Selected element in 3D / inspectors
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<EdgeId | null>(null);
  const [selectedFaceId, setSelectedFaceId] = useState<FaceId | null>(null);

  // Generate Master Dome Model
  const domeModel = useMemo(() => {
    let model = generateDome(params, beamProfile, connectorParams);
    if (isApproved && lockedVersion) {
      model.approved = true;
      model.geometryVersion = lockedVersion;
    }
    return model;
  }, [params, beamProfile, connectorParams, isApproved, lockedVersion]);

  // Handle Geometry Approval
  const handleApprove = () => {
    const approved = approveGeometry(domeModel);
    setIsApproved(true);
    setLockedVersion(approved.geometryVersion);
  };

  const handleRevoke = () => {
    setIsApproved(false);
    setLockedVersion(undefined);
  };

  return (
    <div className="min-h-screen bg-[#F4EFEB] text-[#2F3944] pb-16">
      {/* 1. TOP BAR (Strict 3-zone contract) */}
      <header className="sticky top-0 z-40 px-6 py-3.5 bg-[#FAF7F2]/90 backdrop-blur-md border-b border-[#E8E2D8] shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Zone 1: Single text element Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-2xl flex items-center justify-center bg-[#E1EDE3] text-[#1A3E26] shadow-xs">
              <Box className="w-4 h-4 text-[#5B9279]" />
            </div>
            <a href="/" className="text-lg font-extrabold tracking-tight text-[#1A2E3B] whitespace-nowrap">
              КуполГео CAD
            </a>
          </div>

          {/* Zone 2: Navigation links / tabs */}
          <nav className="hidden md:flex items-center gap-1 p-1 rounded-2xl tactile-inset">
            <button
              onClick={() => setActiveTab("3d")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === "3d"
                  ? "tactile-pill-active text-[#1A2E3B] bg-[#FAF7F2] shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              <Box className="w-3.5 h-3.5 text-[#5B9279]" />
              <span>3D Конструктор</span>
            </button>

            <button
              onClick={() => setActiveTab("beams")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === "beams"
                  ? "tactile-pill-active text-[#1A2E3B] bg-[#FAF7F2] shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              <Ruler className="w-3.5 h-3.5 text-[#DE7C5A]" />
              <span>Креслення балок</span>
            </button>

            <button
              onClick={() => setActiveTab("connectors")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === "connectors"
                  ? "tactile-pill-active text-[#1A2E3B] bg-[#FAF7F2] shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              <Disc className="w-3.5 h-3.5 text-[#4A7C9B]" />
              <span>Розкрій конекторів</span>
            </button>

            <button
              onClick={() => setActiveTab("sheathing")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === "sheathing"
                  ? "tactile-pill-active text-[#1A2E3B] bg-[#FAF7F2] shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-[#DDA843]" />
              <span>Розкрій обшивки</span>
            </button>

            <button
              onClick={() => setActiveTab("export")}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                activeTab === "export"
                  ? "tactile-pill-active text-[#1A2E3B] bg-[#FAF7F2] shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              <Download className="w-3.5 h-3.5 text-[#5B9279]" />
              <span>Експорт CAD / CAM</span>
            </button>
          </nav>

          {/* Zone 3: Primary Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportDomeSpecificationPDF(domeModel)}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn flex items-center gap-1.5 whitespace-nowrap text-[#1A2E3B] hover:text-[#2E7D32]"
              title="Сформувати повну інженерну специфікацію та кошторис у PDF"
            >
              <Printer className="w-3.5 h-3.5 text-[#2E7D32]" />
              <span className="hidden md:inline">Специфікація</span>
              <span className="font-mono text-[#2E7D32] font-black">PDF</span>
            </button>

            {isApproved ? (
              <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE]">
                <Lock className="w-3.5 h-3.5" />
                <span>{lockedVersion}</span>
              </span>
            ) : (
              <button
                onClick={handleApprove}
                className="px-3.5 py-1.5 text-xs font-bold rounded-xl tactile-btn-mint flex items-center gap-1.5 whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Затвердити геометрію</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab("export")}
              className="px-3 py-1.5 text-xs font-bold rounded-xl tactile-btn text-[#1A2E3B] flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-[#5B9279]" />
              <span className="hidden sm:inline">Файли</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Sub-Navigation Bar */}
      <div className="md:hidden px-4 py-2 bg-[#FAF7F2] border-b border-[#E8E2D8] overflow-x-auto flex gap-1">
        <button
          onClick={() => setActiveTab("3d")}
          className={`px-3 py-1 text-xs font-bold rounded-lg whitespace-nowrap ${
            activeTab === "3d" ? "bg-[#E1EDE3] text-[#1A3E26]" : "text-[#5A6778]"
          }`}
        >
          3D Конструктор
        </button>
        <button
          onClick={() => setActiveTab("beams")}
          className={`px-3 py-1 text-xs font-bold rounded-lg whitespace-nowrap ${
            activeTab === "beams" ? "bg-[#FDF0E6] text-[#DE7C5A]" : "text-[#5A6778]"
          }`}
        >
          Балки
        </button>
        <button
          onClick={() => setActiveTab("connectors")}
          className={`px-3 py-1 text-xs font-bold rounded-lg whitespace-nowrap ${
            activeTab === "connectors" ? "bg-[#EBF3F8] text-[#4A7C9B]" : "text-[#5A6778]"
          }`}
        >
          Конектори
        </button>
        <button
          onClick={() => setActiveTab("sheathing")}
          className={`px-3 py-1 text-xs font-bold rounded-lg whitespace-nowrap ${
            activeTab === "sheathing" ? "bg-[#FAF2DE] text-[#DDA843]" : "text-[#5A6778]"
          }`}
        >
          Обшивка
        </button>
        <button
          onClick={() => setActiveTab("export")}
          className={`px-3 py-1 text-xs font-bold rounded-lg whitespace-nowrap ${
            activeTab === "export" ? "bg-[#E1EDE3] text-[#1A3E26]" : "text-[#5A6778]"
          }`}
        >
          Експорт
        </button>
      </div>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 flex flex-col gap-6">
        {/* Soft 3D Metric Overview Banner */}
        <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-0.5">Діаметр / Висота</span>
            <span className="text-sm font-mono font-bold text-[#1A2E3B]">
              {(domeModel.parameters.diameter / 1000).toFixed(1)} м × {(domeModel.parameters.height / 1000).toFixed(1)} м
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-0.5">Площа підлоги</span>
            <span className="text-sm font-mono font-bold text-[#1A2E3B]">
              {domeModel.statistics.floorAreaM2} м²
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-0.5">Площа купола</span>
            <span className="text-sm font-mono font-bold text-[#1A2E3B]">
              {domeModel.statistics.domeSurfaceAreaM2} м²
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-0.5">Всього балок</span>
            <span className="text-sm font-mono font-bold text-[#2E7D32]">
              {domeModel.edges.length} шт ({domeModel.beamGroups.length} типів)
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-0.5">Вузлів / Конекторів</span>
            <span className="text-sm font-mono font-bold text-[#1A2E3B]">
              {domeModel.nodes.length} шт
            </span>
          </div>

          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-0.5">Об'єм купола</span>
            <span className="text-sm font-mono font-bold text-[#1A2E3B]">
              {domeModel.statistics.domeVolumeM3} м³
            </span>
          </div>
        </section>

        {/* Tab 1: 3D CONSTRUCTOR WORKSPACE */}
        {activeTab === "3d" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: 3D Interactive Viewport & Inspector */}
            <div className="lg:col-span-8 flex flex-col gap-5">
              <Viewer3D
                model={domeModel}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                selectedFaceId={selectedFaceId}
                onSelectNode={setSelectedNodeId}
                onSelectEdge={setSelectedEdgeId}
                onSelectFace={setSelectedFaceId}
                onChangeConnectorParams={setConnectorParams}
              />

              {/* Real-time Inspector */}
              <InspectorPanel
                model={domeModel}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                selectedFaceId={selectedFaceId}
                onClose={() => {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                  setSelectedFaceId(null);
                }}
                onSelectNode={setSelectedNodeId}
                onSelectEdge={setSelectedEdgeId}
              />
            </div>

            {/* Right Column: Parameters & Controls */}
            <div className="lg:col-span-4 flex flex-col gap-5">
              <ParamControls
                params={params}
                onChangeParams={setParams}
                beamProfile={beamProfile}
                onChangeProfile={setBeamProfile}
                connectorParams={connectorParams}
                onChangeConnectorParams={setConnectorParams}
                approved={isApproved}
                geometryVersion={lockedVersion}
                onApprove={handleApprove}
                onRevoke={handleRevoke}
              />
            </div>
          </div>
        )}

        {/* Tab 2: BEAM BLUEPRINTS & STRUCTURAL CALCULATION */}
        {activeTab === "beams" && (
          <div className="flex flex-col gap-6">
            <BeamBlueprintsPanel
              model={domeModel}
              connectorParams={connectorParams}
              onChangeConnectorParams={setConnectorParams}
            />
            <StructuralCalcPanel
              model={domeModel}
              connectorParams={connectorParams}
              onChangeConnectorParams={setConnectorParams}
            />
          </div>
        )}

        {/* Tab 3: CONNECTOR CUT & UNFOLDING */}
        {activeTab === "connectors" && (
          <ConnectorCutPanel
            model={domeModel}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            connectorParams={connectorParams}
            onChangeConnectorParams={setConnectorParams}
          />
        )}

        {/* Tab 4: SHEATHING CUT & NESTING */}
        {activeTab === "sheathing" && <SheathingNestingPanel model={domeModel} />}

        {/* Tab 5: CAD & CAM EXPORT (SVG, OBJ, STEP, STL) */}
        {activeTab === "export" && (
          <ExportPanel model={domeModel} selectedNodeId={selectedNodeId} />
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 mt-16 pt-6 border-t border-[#E8E2D8] flex flex-col sm:flex-row items-center justify-between text-xs text-[#8C9BAE] gap-3">
        <div>
          <span>КуполГео · Параметричне геометричне ядро v0.1</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Експорт 2D SVG</span>
          <span>·</span>
          <span>3D Wavefront OBJ</span>
          <span>·</span>
          <span>3D ISO 10303 STEP</span>
        </div>
      </footer>
    </div>
  );
}
