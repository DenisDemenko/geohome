import React, { useState, useMemo, useEffect } from "react";
import {
  DomeParameters,
  BeamProfile,
  ConnectorParams,
  SheathingParams,
  NodeId,
  EdgeId,
  FaceId,
  DoorOpeningParams,
  SolarGlazingParams,
  InnerSheathingParams
} from "./core/types";
import { generateDome } from "./core/dome";
import { approveGeometry, revokeApproval } from "./core/approval";
import { DEFAULT_BEAM_PROFILES } from "./core/beams";
import { DEFAULT_CONNECTOR_PARAMS, getProportionalConnectorParams } from "./core/connectors";
import { DEFAULT_SHEATHING_PARAMS, getRecommendedPlywoodThickness } from "./core/sheathing";
import { DEFAULT_WINDOW_PARAMS } from "./core/windows";
import {
  DEFAULT_DOOR_PARAMS,
  DEFAULT_SOLAR_PARAMS,
  DEFAULT_INNER_SHEATHING_PARAMS,
  findDoorNeighborFaces,
  getDoorwayLevelingTier
} from "./core/conversions";
import { analyzeDomeSolar } from "./core/solarAnalysis";
import { WindowGlazingParams } from "./core/types";
import { exportDomeSpecificationPDF } from "./export/pdfExport";

import { Viewer3D } from "./components/Viewer3D";
import { ParamControls } from "./components/ParamControls";
import { BeamBlueprintsPanel } from "./components/BeamBlueprintsPanel";
import { StructuralCalcPanel } from "./components/StructuralCalcPanel";
import { ConnectorCutPanel } from "./components/ConnectorCutPanel";
import { SheathingNestingPanel } from "./components/SheathingNestingPanel";
import { ExportPanel } from "./components/ExportPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { MobileARViewer } from "./components/MobileARViewer";
import { FoundationLayoutPanel } from "./components/FoundationLayoutPanel";
import { LoadAnalysisPanel } from "./components/LoadAnalysisPanel";
import { PackagingPanel } from "./components/PackagingPanel";
import { CostEstimatePanel } from "./components/CostEstimatePanel";
import MobileNavigation, {
  NAVIGATION_TABS,
  TabId,
  IsMobileMenuOpen
} from "./components/MobileNavigation";

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
  Ruler,
  Anchor,
  Activity,
  Boxes,
  Coins
} from "lucide-react";

export default function App() {
  // Mobile AR Quick Look route check (?ar=1)
  const isARMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("ar") === "1";
  if (isARMode) {
    return <MobileARViewer />;
  }

  // Navigation active tab
  const [activeTab, setActiveTab] = useState<TabId>("3d");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const tabs = NAVIGATION_TABS;
  const activeTabObj = tabs.find(t => t.id === activeTab) || tabs[0];

  // Load saved configuration from localStorage if available
  const savedConfig = useMemo(() => {
    try {
      const raw = localStorage.getItem("geodome_user_configuration_v1");
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // ignore
    }
    return null;
  }, []);

  // Core Dome Parameters State
  const [params, setParams] = useState<DomeParameters>(() => {
    return (
      savedConfig?.params || {
        diameter: 8000, // 8 meters
        height: 4000,
        cutType: "1/2",
        frequency: 3, // 3V default popular geodesic dome
        levelBaseHorizon: true, // Level dome with beams along foundation horizon
        levelingMode: "flat_ring"
      }
    );
  });

  const [beamProfile, setBeamProfile] = useState<BeamProfile>(DEFAULT_BEAM_PROFILES[0]);
  const [connectorParams, setConnectorParams] = useState<ConnectorParams>(DEFAULT_CONNECTOR_PARAMS);
  const [sheathingParams, setSheathingParams] = useState<SheathingParams>({
    ...DEFAULT_SHEATHING_PARAMS,
    thickness: getRecommendedPlywoodThickness(4000)
  });
  const [autoScaleConnectors, setAutoScaleConnectors] = useState<boolean>(true);

  // Approval state
  const [isApproved, setIsApproved] = useState(false);
  const [lockedVersion, setLockedVersion] = useState<string | undefined>(undefined);

  // Selected element in 3D / inspectors
  const [selectedNodeId, setSelectedNodeId] = useState<NodeId | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<EdgeId | null>(null);
  const [selectedFaceId, setSelectedFaceId] = useState<FaceId | null>(null);

  // Converted window faces (skylights & facade windows overlaid on dome frame)
  const [windowFaceIds, setWindowFaceIds] = useState<number[]>(() => {
    return savedConfig?.windowFaceIds || [];
  });
  const [windowParams, setWindowParams] = useState<WindowGlazingParams>(DEFAULT_WINDOW_PARAMS);

  // Door Opening conversion state (with width and height and neighbor auto-capture)
  const [doorFaceIds, setDoorFaceIds] = useState<number[]>(() => {
    return savedConfig?.doorFaceIds || [];
  });
  const [doorParams, setDoorParams] = useState<DoorOpeningParams>(DEFAULT_DOOR_PARAMS);

  // Solar Electric Triangle conversion state (BIPV power generation under glass)
  const [solarFaceIds, setSolarFaceIds] = useState<number[]>(() => {
    return savedConfig?.solarFaceIds || [];
  });
  const [solarParams, setSolarParams] = useState<SolarGlazingParams>(DEFAULT_SOLAR_PARAMS);

  // Dedicated Fabric Strip selection state (ланцюжок трикутників смуги розкрою тканини)
  const [fabricStripFaceIds, setFabricStripFaceIds] = useState<number[]>(() => {
    if (savedConfig?.fabricStripFaceIds && savedConfig.fabricStripFaceIds.length > 0) {
      return savedConfig.fabricStripFaceIds;
    }
    if (savedConfig?.windowFaceIds && savedConfig.windowFaceIds.length > 0) {
      return savedConfig.windowFaceIds;
    }
    return [];
  });

  // Automatically persist user configuration to localStorage
  useEffect(() => {
    try {
      const dataToSave = {
        params,
        windowFaceIds,
        doorFaceIds,
        doorParams,
        solarFaceIds,
        fabricStripFaceIds
      };
      localStorage.setItem("geodome_user_configuration_v1", JSON.stringify(dataToSave));
    } catch (e) {
      // ignore
    }
  }, [params, windowFaceIds, doorFaceIds, doorParams, solarFaceIds, fabricStripFaceIds]);

  // Inner Sheathing state (gypsum drywall, chipboard, OSB, plywood FK)
  const [innerSheathingParams, setInnerSheathingParams] = useState<InnerSheathingParams>(DEFAULT_INNER_SHEATHING_PARAMS);

  // Independent 3D Display Layers: Frame (struts), Connectors, Outer Sheathing, Inner Sheathing
  const [displayLayers, setDisplayLayers] = useState<{
    showBeams: boolean;
    showConnectors: boolean;
    showOuterSheathing: boolean;
    showInnerSheathing: boolean;
    sheathingOpacity?: number;
  }>({
    showBeams: true,
    showConnectors: true,
    showOuterSheathing: false,
    showInnerSheathing: false,
    sheathingOpacity: 0.85
  });

  const handleDisplayLayersChange = (updater: {
    showBeams: boolean;
    showConnectors: boolean;
    showOuterSheathing: boolean;
    showInnerSheathing: boolean;
    sheathingOpacity?: number;
  } | ((prev: {
    showBeams: boolean;
    showConnectors: boolean;
    showOuterSheathing: boolean;
    showInnerSheathing: boolean;
    sheathingOpacity?: number;
  }) => {
    showBeams: boolean;
    showConnectors: boolean;
    showOuterSheathing: boolean;
    showInnerSheathing: boolean;
    sheathingOpacity?: number;
  })) => {
    setDisplayLayers(updater);
  };

  const handleToggleWindowFace = (faceId: number) => {
    // Remove from door and solar
    setDoorFaceIds(prev => prev.filter(id => id !== faceId));
    setSolarFaceIds(prev => prev.filter(id => id !== faceId));
    setWindowFaceIds(prev =>
      prev.includes(faceId) ? prev.filter(id => id !== faceId) : [...prev, faceId]
    );
  };

  const handleToggleDoorwayFace = (anchorFaceId: number, customWidth?: number, customHeight?: number) => {
    // If clicking an existing door face, remove/clear doorway
    if (doorFaceIds.includes(anchorFaceId)) {
      setDoorFaceIds([]);
      setDoorParams(prev => ({ ...prev, doorFaceIds: [], anchorFaceId: undefined }));
      return;
    }

    const width = customWidth ?? doorParams.widthMm;
    const height = customHeight ?? doorParams.heightMm;

    // Use current dome model geometry to auto-capture neighbor triangle(s)
    const baseDome = generateDome(params, beamProfile, connectorParams, sheathingParams);
    const captured = findDoorNeighborFaces(
      baseDome,
      anchorFaceId,
      width,
      height,
      doorParams.bayClusterType,
      doorParams.clusterHubNodeId
    );

    // Remove captured faces from window and solar selections
    setWindowFaceIds(prev => prev.filter(id => !captured.includes(id)));
    setSolarFaceIds(prev => prev.filter(id => !captured.includes(id)));

    setDoorFaceIds(captured);
    setDoorParams(prev => ({
      ...prev,
      anchorFaceId,
      widthMm: width,
      heightMm: height,
      doorFaceIds: captured
    }));

    // Auto-enable Tier Leveling for tier 2 or 3 where door opening falls relative to 2nd floor horizon
    const autoTier = getDoorwayLevelingTier(baseDome, anchorFaceId, height, captured);
    setParams(prev => ({
      ...prev,
      tierLeveling: {
        ...prev.tierLeveling,
        [autoTier]: {
          level: autoTier,
          enabled: true,
          radialMode: prev.tierLeveling?.[autoTier]?.radialMode || "vertical"
        }
      }
    }));
  };

  const handleUpdateDoorParams = (newParams: Partial<DoorOpeningParams>) => {
    setDoorParams(prev => {
      const updated = { ...prev, ...newParams };
      if (updated.anchorFaceId !== undefined) {
        const baseDome = generateDome(params, beamProfile, connectorParams, sheathingParams);
        const captured = findDoorNeighborFaces(
          baseDome,
          updated.anchorFaceId,
          updated.widthMm,
          updated.heightMm,
          updated.bayClusterType,
          updated.clusterHubNodeId
        );
        updated.doorFaceIds = captured;
        setDoorFaceIds(captured);

        // Auto-enable tier leveling for tier 2 or 3 where door opening falls
        const autoTier = getDoorwayLevelingTier(baseDome, updated.anchorFaceId, updated.heightMm, captured);
        setParams(p => {
          if (p.tierLeveling?.[autoTier]?.enabled) return p;
          return {
            ...p,
            tierLeveling: {
              ...p.tierLeveling,
              [autoTier]: {
                level: autoTier,
                enabled: true,
                radialMode: p.tierLeveling?.[autoTier]?.radialMode || "vertical"
              }
            }
          };
        });
      }
      return updated;
    });
  };

  const handleClearDoorway = () => {
    setDoorFaceIds([]);
    setDoorParams(prev => ({ ...prev, doorFaceIds: [], anchorFaceId: undefined }));
  };

  const handleToggleSolarFace = (faceId: number) => {
    // Remove from window and door
    setWindowFaceIds(prev => prev.filter(id => id !== faceId));
    setDoorFaceIds(prev => prev.filter(id => id !== faceId));
    setSolarFaceIds(prev =>
      prev.includes(faceId) ? prev.filter(id => id !== faceId) : [...prev, faceId]
    );
  };

  const handleSetSolarFaceIds = (faceIds: number[]) => {
    // Remove newly selected solar faces from window and door
    setWindowFaceIds(prev => prev.filter(id => !faceIds.includes(id)));
    setDoorFaceIds(prev => prev.filter(id => !faceIds.includes(id)));
    setSolarFaceIds(faceIds);
  };

  const handleUpdateSolarParams = (newParams: Partial<SolarGlazingParams>) => {
    setSolarParams(prev => ({ ...prev, ...newParams }));
  };

  const handleUpdateInnerSheathingParams = (newParams: Partial<InnerSheathingParams>) => {
    setInnerSheathingParams(prev => ({ ...prev, ...newParams }));
  };

  // Dedicated Fabric Strip handlers
  const handleToggleFabricStripFace = (faceId: number) => {
    setFabricStripFaceIds(prev =>
      prev.includes(faceId) ? prev.filter(id => id !== faceId) : [...prev, faceId]
    );
  };

  const handleCopyWindowsToFabricStrip = () => {
    if (windowFaceIds.length > 0) {
      setFabricStripFaceIds([...windowFaceIds]);
    }
  };

  const handleClearFabricStrip = () => {
    setFabricStripFaceIds([]);
  };

  // Handle parameter changes with proportional connector scaling for ultra small domes
  const handleParamsChange = (newParams: DomeParameters) => {
    if (autoScaleConnectors && newParams.diameter !== params.diameter) {
      const updatedConnector = getProportionalConnectorParams(newParams.diameter, connectorParams);
      setConnectorParams(updatedConnector);

      // Auto-adapt plywood thickness proportionally
      const recThickness = getRecommendedPlywoodThickness(newParams.diameter);
      setSheathingParams(prev => ({ ...prev, thickness: recThickness }));

      // Auto-adapt beam profile when switching to miniature/model scale (< 1200 mm)
      if (newParams.diameter < 1200 && beamProfile.width >= 35) {
        const miniProfile = DEFAULT_BEAM_PROFILES.find(p => p.width <= 10) || DEFAULT_BEAM_PROFILES[0];
        setBeamProfile(miniProfile);
      } else if (newParams.diameter >= 3000 && beamProfile.width <= 12) {
        const stdProfile = DEFAULT_BEAM_PROFILES.find(p => p.width === 50) || DEFAULT_BEAM_PROFILES[0];
        setBeamProfile(stdProfile);
      }
    }
    setParams(newParams);
  };

  const handleResetToProportional = () => {
    const updated = getProportionalConnectorParams(params.diameter, connectorParams);
    setConnectorParams(updated);
    setSheathingParams(prev => ({
      ...prev,
      thickness: getRecommendedPlywoodThickness(params.diameter)
    }));
  };

  // Generate Master Dome Model (structural geometry recomputes with tier leveling when door is attached)
  const baseDomeModel = useMemo(() => {
    return generateDome(
      {
        ...params,
        doorFaceIds,
        doorParams
      },
      beamProfile,
      connectorParams,
      sheathingParams
    );
  }, [params, doorFaceIds, doorParams, beamProfile, connectorParams, sheathingParams]);

  // Ensure tier leveling is automatically enabled if a doorway opening is present
  useEffect(() => {
    if (doorFaceIds.length > 0 && doorParams.anchorFaceId !== undefined && baseDomeModel) {
      const isLeveled = Boolean(
        params.tierLeveling?.[2]?.enabled ||
        params.tierLeveling?.[3]?.enabled ||
        params.tierLeveling?.[4]?.enabled
      );
      if (!isLeveled) {
        const autoTier = getDoorwayLevelingTier(
          baseDomeModel,
          doorParams.anchorFaceId,
          doorParams.heightMm,
          doorFaceIds
        );
        setParams(prev => ({
          ...prev,
          tierLeveling: {
            ...prev.tierLeveling,
            [autoTier]: {
              level: autoTier,
              enabled: true,
              radialMode: prev.tierLeveling?.[autoTier]?.radialMode || "vertical"
            }
          }
        }));
      }
    }
  }, [doorFaceIds, doorParams.anchorFaceId, doorParams.heightMm, baseDomeModel]);

  // Combined Dome Model with user features (windows, doors, solar, inner sheathing)
  const domeModel = useMemo(() => {
    const model = {
      ...baseDomeModel,
      approved: Boolean(isApproved && lockedVersion),
      geometryVersion: isApproved && lockedVersion ? lockedVersion : undefined,
      windowFaceIds,
      windowParams: { ...windowParams, windowFaceIds },
      doorFaceIds,
      doorParams: { ...doorParams, doorFaceIds },
      solarFaceIds,
      solarParams: { ...solarParams, solarFaceIds },
      innerSheathingParams,
      fabricStripFaceIds
    };
    return model;
  }, [
    baseDomeModel,
    isApproved,
    lockedVersion,
    windowFaceIds,
    windowParams,
    doorFaceIds,
    doorParams,
    solarFaceIds,
    solarParams,
    innerSheathingParams,
    fabricStripFaceIds
  ]);

  // Memoized solar orientation analysis (computed once for the whole app)
  const solarAnalysis = useMemo(() => {
    return analyzeDomeSolar(domeModel, {
      domeAzimuthDeg: solarParams?.domeOrientationDeg ?? 0,
      latitudeDeg: solarParams?.latitudeDeg ?? 49.0,
      peakPowerPerM2: solarParams?.peakPowerPerM2 ?? 210
    });
  }, [
    domeModel,
    solarParams.domeOrientationDeg,
    solarParams.latitudeDeg,
    solarParams.peakPowerPerM2
  ]);

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
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? "tactile-pill-active text-[#1A2E3B] bg-[#FAF7F2] shadow-xs"
                      : "text-[#5A6778] hover:text-[#1A2E3B]"
                  }`}
                  title={tab.desc}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: tab.color }} />
                  <span className="hidden xl:inline">{tab.label}</span>
                  <span className="xl:hidden">{tab.shortLabel}</span>
                </button>
              );
            })}
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

      {/* Mobile Toggleable Hamburger Navigation Menu using isMobileMenuOpen */}
      <MobileNavigation
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        tabs={tabs}
      />

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 flex flex-col gap-6">
        {/* Soft 3D Metric Overview Banner */}
        <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-2xl tactile-card">
            <span className="text-[11px] text-[#5A6778] block mb-0.5">Діаметр / Висота</span>
            <span className="text-sm font-mono font-bold text-[#1A2E3B]">
              {(domeModel.parameters.diameter / 1000).toFixed(domeModel.parameters.diameter < 1000 ? 2 : 1)} м
              {domeModel.parameters.diameter < 1000 ? ` (${(domeModel.parameters.diameter / 10).toFixed(0)} см)` : ""} ×{" "}
              {(domeModel.parameters.height / 1000).toFixed(domeModel.parameters.height < 1000 ? 2 : 1)} м
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: 3D Interactive Viewport & Inspector (pinned on desktop) */}
            <div className="lg:col-span-8 flex flex-col gap-5 lg:sticky lg:top-4 lg:self-start">
              <Viewer3D
                model={domeModel}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                selectedFaceId={selectedFaceId}
                onSelectNode={setSelectedNodeId}
                onSelectEdge={setSelectedEdgeId}
                onSelectFace={setSelectedFaceId}
                onChangeConnectorParams={setConnectorParams}
                sheathingParams={sheathingParams}
                onChangeSheathingParams={setSheathingParams}
                windowFaceIds={windowFaceIds}
                onToggleWindowFace={handleToggleWindowFace}
                onSetWindowFaceIds={setWindowFaceIds}
                windowParams={windowParams}
                onChangeWindowParams={setWindowParams}
                doorFaceIds={doorFaceIds}
                doorParams={doorParams}
                onToggleDoorway={handleToggleDoorwayFace}
                onChangeDoorParams={handleUpdateDoorParams}
                onClearDoorway={handleClearDoorway}
                solarFaceIds={solarFaceIds}
                solarParams={solarParams}
                onToggleSolarFace={handleToggleSolarFace}
                onSetSolarFaceIds={handleSetSolarFaceIds}
                onChangeSolarParams={handleUpdateSolarParams}
                innerSheathingParams={innerSheathingParams}
                onChangeInnerSheathingParams={handleUpdateInnerSheathingParams}
                displayLayers={displayLayers}
                onChangeDisplayLayers={handleDisplayLayersChange}
                solarAnalysis={solarAnalysis}
                fabricStripFaceIds={fabricStripFaceIds}
                onToggleFabricStripFace={handleToggleFabricStripFace}
                onSetFabricStripFaceIds={setFabricStripFaceIds}
                onCopyWindowsToFabricStrip={handleCopyWindowsToFabricStrip}
                onClearFabricStrip={handleClearFabricStrip}
                onNavigateToSheathing={() => setActiveTab("sheathing")}
                onChangeParams={handleParamsChange}
              />

              {/* Real-time Inspector */}
              <InspectorPanel
                model={domeModel}
                selectedNodeId={selectedNodeId}
                selectedEdgeId={selectedEdgeId}
                selectedFaceId={selectedFaceId}
                windowFaceIds={windowFaceIds}
                onToggleWindowFace={handleToggleWindowFace}
                windowParams={windowParams}
                onChangeWindowParams={setWindowParams}
                doorFaceIds={doorFaceIds}
                doorParams={doorParams}
                onToggleDoorway={handleToggleDoorwayFace}
                onChangeDoorParams={handleUpdateDoorParams}
                onClearDoorway={handleClearDoorway}
                solarFaceIds={solarFaceIds}
                solarParams={solarParams}
                onToggleSolarFace={handleToggleSolarFace}
                onSetSolarFaceIds={handleSetSolarFaceIds}
                onChangeSolarParams={handleUpdateSolarParams}
                innerSheathingParams={innerSheathingParams}
                onChangeInnerSheathingParams={handleUpdateInnerSheathingParams}
                solarAnalysis={solarAnalysis}
                onClose={() => {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                  setSelectedFaceId(null);
                }}
                onSelectNode={setSelectedNodeId}
                onSelectEdge={setSelectedEdgeId}
              />
            </div>

            {/* Right Column: Parameters & Controls (scrollable independently on desktop) */}
            <div className="lg:col-span-4 flex flex-col gap-5 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1.5 custom-scrollbar">
              <ParamControls
                params={params}
                onChangeParams={handleParamsChange}
                beamProfile={beamProfile}
                onChangeProfile={setBeamProfile}
                connectorParams={connectorParams}
                onChangeConnectorParams={setConnectorParams}
                model={domeModel}
                approved={isApproved}
                geometryVersion={lockedVersion}
                onApprove={handleApprove}
                onRevoke={handleRevoke}
                autoScaleConnectors={autoScaleConnectors}
                onToggleAutoScaleConnectors={setAutoScaleConnectors}
                onResetToProportional={handleResetToProportional}
                sheathingParams={sheathingParams}
                onChangeSheathingParams={setSheathingParams}
                displayLayers={displayLayers}
                onChangeDisplayLayers={handleDisplayLayersChange}
                solarFaceIds={solarFaceIds}
                solarParams={solarParams}
                onToggleSolarFace={handleToggleSolarFace}
                onSetSolarFaceIds={handleSetSolarFaceIds}
                onChangeSolarParams={handleUpdateSolarParams}
                solarAnalysis={solarAnalysis}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
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
            onResetToProportional={handleResetToProportional}
          />
        )}

        {/* Tab 4: SHEATHING CUT & NESTING */}
        {activeTab === "sheathing" && (
          <SheathingNestingPanel
            model={domeModel}
            params={params}
            onChangeParams={handleParamsChange}
            innerSheathingParams={innerSheathingParams}
            onChangeInnerSheathingParams={handleUpdateInnerSheathingParams}
            sheathingParams={sheathingParams}
            onChangeSheathingParams={setSheathingParams}
            fabricStripFaceIds={fabricStripFaceIds}
            onToggleFabricStripFace={handleToggleFabricStripFace}
            onSetFabricStripFaceIds={setFabricStripFaceIds}
            onCopyWindowsToFabricStrip={handleCopyWindowsToFabricStrip}
            onClearFabricStrip={handleClearFabricStrip}
            onNavigateTo3D={() => setActiveTab("3d")}
          />
        )}

        {/* Tab 5: FOUNDATION LAYOUT & FORMWORK */}
        {activeTab === "foundation" && <FoundationLayoutPanel model={domeModel} />}

        {/* Tab 6: REAL-TIME STRUCTURAL LOADS & D3 VISUALIZATION */}
        {activeTab === "loads" && <LoadAnalysisPanel model={domeModel} />}

        {/* Tab 7: PACKAGING & PALLET OPTIMIZATION */}
        {activeTab === "packaging" && <PackagingPanel model={domeModel} />}

        {/* Tab 8: COST ESTIMATION & BUDGET */}
        {activeTab === "cost" && <CostEstimatePanel model={domeModel} />}

        {/* Tab 9: CAD & CAM EXPORT (SVG, OBJ, STEP, STL) */}
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
