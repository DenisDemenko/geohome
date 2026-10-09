import React, { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import {
  DomeModel,
  NodeId,
  ConnectorParams,
  ConnectorTypeSummary,
  ConnectorGeometry,
  ConnectorBeam
} from "../core/types";
import { calculateConnector } from "../core/connectors";
import {
  generateConnectorDXF,
  downloadDXF
} from "../export/dxfExport";
import {
  generateConnectorSVG,
  downloadFile
} from "../export/svgExport";
import {
  exportConnectorTypeSTL,
  exportConnectorTypeOBJ,
  createHollowSocketTube,
  createHollowHubGeometry,
  createAnnularPlateHub
} from "../export/connector3dExport";
import {
  RotateCw,
  Eye,
  Sliders,
  Sparkles,
  Layers,
  Box,
  Compass,
  Download,
  Maximize2,
  Check,
  Disc,
  Cpu,
  Info,
  Play,
  Pause,
  Anchor,
  Circle,
  Shield,
  Scale,
  Paintbrush
} from "lucide-react";
import {
  CONNECTOR_MATERIALS,
  CONNECTOR_COATINGS,
  getCoatingsForCategory,
  getConnectorVisualPBR,
  calculateConnectorPieceWeight,
  ConnectorMaterialCategory,
  ConnectorMaterialId,
  ConnectorCoatingId
} from "../core/connectorMaterials";

export type ConnectorSystemType = "star_plate" | "pipe_hub" | "spider" | "good_karma";
export type SteelFinish = "galvanized" | "black_powder" | "stainless" | "brass";

interface Connector3DViewerProps {
  model: DomeModel;
  connectorParams: ConnectorParams;
  onChangeConnectorParams?: (params: ConnectorParams) => void;
  connectorTypes: ConnectorTypeSummary[];
  selectedTypeId: string;
  onSelectType: (typeId: string) => void;
  onSelectNode: (nodeId: NodeId) => void;
}

export const Connector3DViewer: React.FC<Connector3DViewerProps> = ({
  model,
  connectorParams,
  onChangeConnectorParams,
  connectorTypes,
  selectedTypeId,
  onSelectType,
  onSelectNode
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const connectorGroupRef = useRef<THREE.Group | null>(null);
  const animFrameId = useRef<number | null>(null);

  // Active connector system (star_plate, pipe_hub, spider, good_karma)
  const currentSystem: ConnectorSystemType = (connectorParams.type as ConnectorSystemType) || "star_plate";

  const handleSetSystem = (newSystem: ConnectorSystemType) => {
    if (onChangeConnectorParams) {
      onChangeConnectorParams({
        ...connectorParams,
        type: newSystem
      });
    }
  };

  // Active connector type and computed geometry
  const activeType = useMemo(() => {
    return (
      connectorTypes.find(t => t.typeId === selectedTypeId) ||
      connectorTypes[0] ||
      null
    );
  }, [connectorTypes, selectedTypeId]);

  const activeConnector: ConnectorGeometry | null = useMemo(() => {
    if (!activeType) return null;
    if (activeType.sampleConnector && activeType.sampleConnector.beams && activeType.sampleConnector.beams.length > 0) {
      return activeType.sampleConnector;
    }
    try {
      return calculateConnector(model, activeType.sampleNodeId);
    } catch {
      return null;
    }
  }, [model, activeType]);

  // Ray count filter for quick tab access in 3D viewer (All, 3-way, 4-way Base, 5-way Apex, 6-way Hexagons)
  const [rayCategoryFilter, setRayCategoryFilter] = useState<"all" | 3 | 4 | 5 | 6>("all");

  const filteredTypes = useMemo(() => {
    if (rayCategoryFilter === "all") return connectorTypes;
    return connectorTypes.filter(t => t.rayCount === rayCategoryFilter);
  }, [connectorTypes, rayCategoryFilter]);

  const count3R = useMemo(() => connectorTypes.filter(t => t.rayCount === 3).length, [connectorTypes]);
  const count4R = useMemo(() => connectorTypes.filter(t => t.rayCount === 4).length, [connectorTypes]);
  const count5R = useMemo(() => connectorTypes.filter(t => t.rayCount === 5).length, [connectorTypes]);
  const count6R = useMemo(() => connectorTypes.filter(t => t.rayCount === 6).length, [connectorTypes]);

  // Material & Coating states
  const currentMatId = (connectorParams.material as ConnectorMaterialId) || "steel_st3";
  const currentMatInfo = CONNECTOR_MATERIALS[currentMatId] || CONNECTOR_MATERIALS.steel_st3;
  const currentCategory: ConnectorMaterialCategory = connectorParams.materialCategory || currentMatInfo.category || "steel";
  const currentCoatingId = (connectorParams.coating as ConnectorCoatingId) || currentMatInfo.defaultCoating;
  const currentCoatingInfo = CONNECTOR_COATINGS[currentCoatingId] || CONNECTOR_COATINGS[currentMatInfo.defaultCoating];

  const categoryMaterials = useMemo(
    () => Object.values(CONNECTOR_MATERIALS).filter(m => m.category === currentCategory),
    [currentCategory]
  );
  const categoryCoatings = useMemo(
    () => getCoatingsForCategory(currentCategory),
    [currentCategory]
  );

  // Active connector unit weight in kg
  const activePieceWeightKg = useMemo(() => {
    if (!activeConnector) return 0;
    return calculateConnectorPieceWeight(
      activeConnector.beams.length,
      activeConnector.isBoundary,
      connectorParams,
      model.beamProfile
    );
  }, [activeConnector, connectorParams, model.beamProfile]);

  // Interactive 3D Options
  const [showBeams, setShowBeams] = useState(false);
  const [showFasteners, setShowFasteners] = useState(true);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showNodeMarking, setShowNodeMarking] = useState(true);
  const [showFoundationPad, setShowFoundationPad] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [steelFinish, setSteelFinish] = useState<SteelFinish>("galvanized");
  const [bendProgress, setBendProgress] = useState(1.0); // 0.0 = flat / relaxed, 1.0 = working 3D angle
  const [explodedView, setExplodedView] = useState(0.0); // 0.0 = assembled, 1.0 = exploded

  // Camera Orbit state
  const cameraSpherical = useRef({
    radius: 420,
    theta: Math.PI / 4,
    phi: Math.PI / 3.2
  });
  const targetCenter = useRef(new THREE.Vector3(0, 0, 0));
  const isDragging = useRef(false);
  const isPanning = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });
  const touchStartDist = useRef<number | null>(null);
  const touchMidPos = useRef<{ x: number; y: number } | null>(null);
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  // Initialize Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#FAF7F2"); // warm architectural paper tone
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 1, 5000);
    cameraRef.current = camera;

    // 3. Renderer with antialiasing and logarithmic depth buffer for precision
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.touchAction = "none";
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfffbf0, 1.15);
    keyLight.position.set(400, 600, 500);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xdcebf5, 0.65);
    fillLight.position.set(-400, -300, 300);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffeedd, 0.45);
    rimLight.position.set(0, -500, -200);
    scene.add(rimLight);

    // Ground Grid
    const groundGrid = new THREE.GridHelper(500, 20, 0xd8d0c2, 0xebe5da);
    groundGrid.rotation.x = Math.PI / 2;
    groundGrid.position.z = -15;
    scene.add(groundGrid);

    // Connector root group
    const connectorGroup = new THREE.Group();
    scene.add(connectorGroup);
    connectorGroupRef.current = connectorGroup;

    // Camera update helper
    const updateCamera = () => {
      const { radius, theta, phi } = cameraSpherical.current;
      const x = targetCenter.current.x + radius * Math.sin(phi) * Math.sin(theta);
      const y = targetCenter.current.y + radius * Math.sin(phi) * Math.cos(theta);
      const z = targetCenter.current.z + radius * Math.cos(phi);
      camera.position.set(x, y, z);
      camera.up.set(0, 0, 1);
      camera.lookAt(targetCenter.current);
    };
    updateCamera();

    // Mouse & Touch Controls
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) isDragging.current = true;
      else if (e.button === 2) isPanning.current = true;
      prevMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - prevMousePos.current.x;
      const dy = e.clientY - prevMousePos.current.y;
      prevMousePos.current = { x: e.clientX, y: e.clientY };

      if (isDragging.current) {
        cameraSpherical.current.theta -= dx * 0.008;
        cameraSpherical.current.phi = Math.max(
          0.05,
          Math.min(Math.PI * 0.95, cameraSpherical.current.phi - dy * 0.008)
        );
        updateCamera();
      } else if (isPanning.current) {
        const canvasH = dom.clientHeight || 450;
        const fovRad = (camera.fov * Math.PI) / 180;
        const factor = (2 * cameraSpherical.current.radius * Math.tan(fovRad / 2)) / canvasH;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        targetCenter.current.addScaledVector(right, -dx * factor);
        targetCenter.current.addScaledVector(up, dy * factor);
        updateCamera();
      }
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      isPanning.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      cameraSpherical.current.radius = Math.max(
        60,
        Math.min(1800, cameraSpherical.current.radius * zoomFactor)
      );
      updateCamera();
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging.current = true;
        prevMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length >= 2) {
        if (e.cancelable) e.preventDefault();
        isDragging.current = false;
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;
        touchStartDist.current = Math.hypot(dx, dy);
        touchMidPos.current = {
          x: (t0.clientX + t1.clientX) / 2,
          y: (t0.clientY + t1.clientY) / 2
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
      if (e.touches.length === 1 && isDragging.current) {
        const dx = e.touches[0].clientX - prevMousePos.current.x;
        const dy = e.touches[0].clientY - prevMousePos.current.y;
        prevMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

        cameraSpherical.current.theta -= dx * 0.009;
        cameraSpherical.current.phi = Math.max(
          0.05,
          Math.min(Math.PI * 0.95, cameraSpherical.current.phi - dy * 0.009)
        );
        updateCamera();
      } else if (e.touches.length >= 2) {
        isDragging.current = false;
        const t0 = e.touches[0];
        const t1 = e.touches[1];

        // Defensive initialization if touches arrived sequentially
        if (touchStartDist.current === null || touchMidPos.current === null) {
          const dx0 = t0.clientX - t1.clientX;
          const dy0 = t0.clientY - t1.clientY;
          touchStartDist.current = Math.hypot(dx0, dy0);
          touchMidPos.current = {
            x: (t0.clientX + t1.clientX) / 2,
            y: (t0.clientY + t1.clientY) / 2
          };
          return;
        }

        // 1. Pinch to Zoom
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;
        const currentDist = Math.hypot(dx, dy);
        if (currentDist > 5 && touchStartDist.current > 5) {
          const zoomDelta = touchStartDist.current / currentDist;
          touchStartDist.current = currentDist;
          cameraSpherical.current.radius = Math.max(
            60,
            Math.min(1800, cameraSpherical.current.radius * zoomDelta)
          );
        }

        // 2. Two-Finger Pan / Translate Across Screen
        const currentMidX = (t0.clientX + t1.clientX) / 2;
        const currentMidY = (t0.clientY + t1.clientY) / 2;
        const panDx = currentMidX - touchMidPos.current.x;
        const panDy = currentMidY - touchMidPos.current.y;
        touchMidPos.current = { x: currentMidX, y: currentMidY };

        if (cameraRef.current && (Math.abs(panDx) > 0.001 || Math.abs(panDy) > 0.001)) {
          const canvasH = dom.clientHeight || 450;
          const fovRad = (cameraRef.current.fov * Math.PI) / 180;
          const factor = (2 * cameraSpherical.current.radius * Math.tan(fovRad / 2)) / canvasH;

          const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraRef.current.quaternion);
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraRef.current.quaternion);

          targetCenter.current.addScaledVector(right, -panDx * factor);
          targetCenter.current.addScaledVector(up, panDy * factor);
        }

        updateCamera();
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        isDragging.current = false;
        touchStartDist.current = null;
        touchMidPos.current = null;
      } else if (e.touches.length === 1) {
        touchStartDist.current = null;
        touchMidPos.current = null;
        isDragging.current = true;
        prevMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    dom.addEventListener("wheel", handleWheel, { passive: false });
    dom.addEventListener("touchstart", handleTouchStart, { passive: false });
    dom.addEventListener("touchmove", handleTouchMove, { passive: false });
    dom.addEventListener("touchend", handleTouchEnd, { passive: false });
    dom.addEventListener("touchcancel", handleTouchEnd, { passive: false });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    });
    resizeObserver.observe(container);

    // Animation loop
    const animate = () => {
      animFrameId.current = requestAnimationFrame(animate);
      if (autoRotateRef.current && !isDragging.current && !isPanning.current) {
        cameraSpherical.current.theta += 0.005;
        updateCamera();
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      resizeObserver.disconnect();
      dom.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      dom.removeEventListener("wheel", handleWheel);
      dom.removeEventListener("touchstart", handleTouchStart);
      dom.removeEventListener("touchmove", handleTouchMove);
      dom.removeEventListener("touchend", handleTouchEnd);
      dom.removeEventListener("touchcancel", handleTouchEnd);
      renderer.dispose();
    };
  }, []);

  // Preset Views
  const setPresetView = (preset: "iso" | "top" | "side") => {
    targetCenter.current.set(0, 0, 0);
    if (preset === "top") {
      cameraSpherical.current.phi = 0.05;
      cameraSpherical.current.theta = 0;
    } else if (preset === "side") {
      cameraSpherical.current.phi = Math.PI / 2;
      cameraSpherical.current.theta = 0;
    } else {
      cameraSpherical.current.phi = Math.PI / 3.2;
      cameraSpherical.current.theta = Math.PI / 4;
    }
    const camera = cameraRef.current;
    if (camera) {
      const { radius, theta, phi } = cameraSpherical.current;
      camera.position.set(
        targetCenter.current.x + radius * Math.sin(phi) * Math.sin(theta),
        targetCenter.current.y + radius * Math.sin(phi) * Math.cos(theta),
        targetCenter.current.z + radius * Math.cos(phi)
      );
      camera.lookAt(targetCenter.current);
    }
  };

  // Rebuild 3D Geometry for all connector types & systems
  useEffect(() => {
    if (!connectorGroupRef.current || !activeConnector) return;
    const group = connectorGroupRef.current;
    group.clear();

    const isBase = activeConnector.isBoundary;
    const hubDiam = connectorParams.hubDiameter || 140;
    const hubR = hubDiam / 2;
    const tabLen = connectorParams.tabLength || 95;
    const tabW = connectorParams.tabWidth || 45;
    const thk = connectorParams.thickness || 4.0;
    const wallThk = connectorParams.wallThickness || 2.5;
    const boltDiam = connectorParams.boltDiameter || 10;
    const boltR = boltDiam / 2;
    const isRoundBeam = model.beamProfile.type === "circular" || model.beamProfile.type === "pipe";
    const isRoundRay =
      connectorParams.rayType === "round_tube" ||
      (connectorParams.rayType !== "plate" && isRoundBeam);
    const beamDiam = isRoundBeam
      ? (model.beamProfile.diameter || model.beamProfile.width || 20)
      : (model.beamProfile.width || 50);
    const beamW = isRoundBeam ? beamDiam : (model.beamProfile.width || 50);
    const beamD = isRoundBeam ? beamDiam : (model.beamProfile.depth || 150);

    // Physical clearance fit (0.35 mm radial clearance between inserted tube and socket sleeve inner surface)
    // This strictly eliminates co-planar WebGL Z-fighting / surface flickering and represents realistic manufacturing tolerances
    const fitClearance = 0.35;
    const tubeOuterR = Math.max(0.5, beamDiam / 2);
    const rayInnerR = tubeOuterR + fitClearance;
    const rayOuterR = rayInnerR + wallThk;

    // Adjust camera distance to comfortably frame the connector
    const totalDiameter = (hubR + tabLen + (showBeams ? 250 : 0)) * 2;
    cameraSpherical.current.radius = Math.max(160, totalDiameter * 1.55);

    // 1. Material definitions based on chosen connector material grade and protective coating
    const visualPBR = getConnectorVisualPBR(
      connectorParams.material as any,
      connectorParams.coating as any
    );

    const steelMat = new THREE.MeshStandardMaterial({
      color: visualPBR.colorHex,
      roughness: visualPBR.roughness,
      metalness: visualPBR.metalness
    });

    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x3d454f,
      roughness: 0.45,
      metalness: 0.75
    });

    const boltMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.2,
      metalness: 0.95
    });

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0xd29a5c, // natural spruce/pine grain
      roughness: 0.6,
      metalness: 0.05,
      transparent: true,
      opacity: 0.82
    });

    const isMetalBeam = model.beamProfile.material === "steel" || model.beamProfile.material === "aluminum" || model.beamProfile.type === "pipe";
    const tubeMat = isMetalBeam
      ? new THREE.MeshStandardMaterial({
          color: model.beamProfile.material === "aluminum" ? 0xd0d5dd : 0x8294a5,
          roughness: 0.35,
          metalness: 0.82
        })
      : woodMat;

    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0xa8a49c,
      roughness: 0.9,
      metalness: 0.05
    });

    // 2. Concrete Foundation Block (if boundary base node)
    if (isBase && showFoundationPad) {
      const padW = (hubR + tabLen) * 2.2;
      const padD = hubR * 2.4;
      const padH = 60;
      const padGeom = new THREE.BoxGeometry(padW, padD, padH);
      const padMesh = new THREE.Mesh(padGeom, concreteMat);
      padMesh.position.set(0, -padD * 0.45, -padH / 2 - thk - 2);
      padMesh.receiveShadow = true;
      group.add(padMesh);

      // Leveling Steel Baseplate
      const baseplateGeom = new THREE.BoxGeometry(padW * 0.85, padD * 0.8, thk * 1.5);
      const baseplateMesh = new THREE.Mesh(baseplateGeom, darkSteelMat);
      baseplateMesh.position.set(0, -padD * 0.45, -thk * 0.75 - 1);
      group.add(baseplateMesh);

      // Foundation Anchor Studs
      [-padW * 0.35, padW * 0.35].forEach(ax => {
        const studGeom = new THREE.CylinderGeometry(boltR * 1.3, boltR * 1.3, 40, 12);
        const stud = new THREE.Mesh(studGeom, boltMat);
        stud.position.set(ax, -padD * 0.45, 10);
        stud.rotation.x = Math.PI / 2;
        group.add(stud);

        // Heavy Nut
        const nutGeom = new THREE.CylinderGeometry(boltDiam * 1.2, boltDiam * 1.2, 10, 6);
        const nut = new THREE.Mesh(nutGeom, boltMat);
        nut.position.set(ax, -padD * 0.45, 12);
        nut.rotation.x = Math.PI / 2;
        group.add(nut);
      });
    }

    const sortedBeams = activeConnector.beams;
    const rayCount = sortedBeams.length;

    // ========================================================
    // SYSTEM 1: STAR PLATE (Пластина-зірка / Thunder Domes)
    // ========================================================
    if (currentSystem === "star_plate") {
      // A. Central Hub Disc (full closed 360° contour for all connectors: 4-, 5-, 6-petal)
      const hubHeight = isRoundRay ? Math.max(rayOuterR * 2.2, wallThk * 2 + 6) : thk;
      if (isRoundRay) {
        const hubGeom = createHollowHubGeometry(hubR, wallThk, hubHeight, 32);
        const hubMesh = new THREE.Mesh(hubGeom, steelMat);
        hubMesh.castShadow = true;
        hubMesh.receiveShadow = true;
        group.add(hubMesh);
      } else if (connectorParams.centerCutout === "lightning") {
        // True through-hole lightning cutout through solid plate
        const hubShape = new THREE.Shape();
        hubShape.absarc(0, 0, hubR, 0, Math.PI * 2, false);
        const scale = hubR * 0.024;
        const lPath = new THREE.Path();
        lPath.moveTo(3 * scale, -16 * scale);
        lPath.lineTo(-9 * scale, 2 * scale);
        lPath.lineTo(0 * scale, 2 * scale);
        lPath.lineTo(-4 * scale, 16 * scale);
        lPath.lineTo(10 * scale, -2 * scale);
        lPath.lineTo(1 * scale, -2 * scale);
        lPath.closePath();
        hubShape.holes.push(lPath);

        const hubGeom = new THREE.ExtrudeGeometry(hubShape, { depth: thk, bevelEnabled: false, curveSegments: 32 });
        hubGeom.center();
        const hubMesh = new THREE.Mesh(hubGeom, steelMat);
        hubMesh.castShadow = true;
        hubMesh.receiveShadow = true;
        group.add(hubMesh);
      } else {
        const centerHoleR = connectorParams.centerCutout === "solid" ? 0 : Math.min(hubR * 0.32, 14);
        const hubGeom = createAnnularPlateHub(hubR, centerHoleR, thk, 32);
        const hubMesh = new THREE.Mesh(hubGeom, steelMat);
        hubMesh.castShadow = true;
        hubMesh.receiveShadow = true;
        group.add(hubMesh);
      }

      // B. Radial Tabs / Round Sleeves & Struts
      sortedBeams.forEach((beam: ConnectorBeam, i: number) => {
        const planarAngleDeg = (beam as any).planarAngle ?? (i * 360) / rayCount;
        const planarAngleRad = (planarAngleDeg * Math.PI) / 180;
        const fullBendDeg = (beam as any).bendAngle || 8.0;
        const currentBendDeg = fullBendDeg * bendProgress;
        const currentBendRad = (currentBendDeg * Math.PI) / 180;

        const rayRootGroup = new THREE.Group();
        rayRootGroup.rotation.z = planarAngleRad;

        // 1. Root transition sector extending from hub interior out to the bend line (r = hubR)
        // This ensures the central disc and the ray have solid continuous metal between r=hubR*0.5 and r=hubR across the full width tabW!
        if (!isRoundRay) {
          const rootLen = hubR * 0.55;
          const rootGeom = new THREE.BoxGeometry(rootLen, tabW, thk);
          const rootMesh = new THREE.Mesh(rootGeom, steelMat);
          rootMesh.position.set(hubR - rootLen / 2, 0, 0);
          rootMesh.castShadow = true;
          rootMesh.receiveShadow = true;
          rayRootGroup.add(rootMesh);
        }

        const tabPivotGroup = new THREE.Group();
        tabPivotGroup.position.set(hubR, 0, 0);
        tabPivotGroup.rotation.y = -currentBendRad;

        // Steel Ray: True Watertight Hollow Round Socket Sleeve vs Flat Plate Blade
        if (isRoundRay) {
          // Calculate embed depth to penetrate deeply and solidly into the central ring
          const chordGap = hubR - Math.sqrt(Math.max(0, hubR * hubR - rayOuterR * rayOuterR));
          const tiltGap = rayOuterR * Math.tan(Math.abs(currentBendRad) || 0.15);
          const embedLen = Math.max(20, Math.round(chordGap + tiltGap + 14));

          const socketGeom = createHollowSocketTube(rayOuterR, rayInnerR, tabLen, 24, embedLen);
          const tabMesh = new THREE.Mesh(socketGeom, steelMat);
          tabMesh.rotation.y = Math.PI / 2;
          tabMesh.castShadow = true;
          tabMesh.receiveShadow = true;
          tabPivotGroup.add(tabMesh);

          // Transitional Reinforcing Fillet / Collar Boss (solid monolithic weld transition from central ring to sleeve)
          const bossLen = Math.min(22, tabLen * 0.28);
          const bossGeom = new THREE.CylinderGeometry(rayOuterR * 1.02, rayOuterR * 1.22, bossLen, 24);
          const bossMesh = new THREE.Mesh(bossGeom, steelMat);
          bossMesh.rotation.z = -Math.PI / 2;
          bossMesh.position.set(-embedLen * 0.25 + bossLen / 2, 0, 0);
          bossMesh.castShadow = true;
          bossMesh.receiveShadow = true;
          tabPivotGroup.add(bossMesh);
        } else {
          // Continuous Monolithic Star Blade:
          // Embedded overlap root extending backwards into the hub by overlapLen so the ray NEVER detaches when bent!
          const overlapLen = Math.max(10, thk * 2.5);
          const totalBladeLen = tabLen + overlapLen;
          const tabGeom = new THREE.BoxGeometry(totalBladeLen, tabW, thk);
          const tabMesh = new THREE.Mesh(tabGeom, steelMat);
          // Positioned so the outer tip is at x = tabLen, and the inner root extends back to x = -overlapLen
          tabMesh.position.set((tabLen - overlapLen) / 2, 0, 0);
          tabMesh.castShadow = true;
          tabMesh.receiveShadow = true;
          tabPivotGroup.add(tabMesh);

          // Physical cylindrical press-brake bend knuckle at x = 0 (the bend line)
          // Connects the flat root and tilted blade with authentic metal bend radius!
          const knuckleR = Math.max(0.6, thk * 0.7);
          const knuckleGeom = new THREE.CylinderGeometry(knuckleR, knuckleR, tabW, 20);
          const knuckleMesh = new THREE.Mesh(knuckleGeom, steelMat);
          knuckleMesh.castShadow = true;
          knuckleMesh.receiveShadow = true;
          tabPivotGroup.add(knuckleMesh);

          // Bend line visual indicator (only for sheet metal flat plates!)
          const bendLineGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, -tabW / 2, thk * 0.55),
            new THREE.Vector3(0, tabW / 2, thk * 0.55)
          ]);
          const bendLineMat = new THREE.LineDashedMaterial({
            color: 0xde7c5a,
            dashSize: 4,
            gapSize: 2,
            linewidth: 2
          });
          const bendLine = new THREE.Line(bendLineGeom, bendLineMat);
          bendLine.computeLineDistances();
          tabPivotGroup.add(bendLine);
        }

        // Fasteners
        if (showFasteners) {
          const holeDistances = tabLen < 15 ? [tabLen * 0.55] : [tabLen * 0.35, tabLen * 0.75];
          holeDistances.forEach(hDist => {
            const boltGroup = new THREE.Group();
            const explodeZ = explodedView * 60;
            boltGroup.position.set(hDist, 0, 0);

            const totalStackThk = thk + (showBeams ? beamW : 0);
            const shank = new THREE.Mesh(
              new THREE.CylinderGeometry(boltR, boltR, totalStackThk * 1.25, 12),
              boltMat
            );
            shank.rotation.x = Math.PI / 2;
            boltGroup.add(shank);

            const head = new THREE.Mesh(
              new THREE.CylinderGeometry(boltDiam * 0.9, boltDiam * 0.9, boltDiam * 0.7, 6),
              boltMat
            );
            head.rotation.x = Math.PI / 2;
            head.position.z = totalStackThk * 0.6 + boltDiam * 0.35 + explodeZ;
            boltGroup.add(head);

            const washer = new THREE.Mesh(
              new THREE.CylinderGeometry(boltDiam * 1.1, boltDiam * 1.1, 1.5, 16),
              steelMat
            );
            washer.rotation.x = Math.PI / 2;
            washer.position.z = totalStackThk * 0.55 + 0.75 + explodeZ * 0.5;
            boltGroup.add(washer);

            const nut = new THREE.Mesh(
              new THREE.CylinderGeometry(boltDiam * 0.9, boltDiam * 0.9, boltDiam * 0.8, 6),
              boltMat
            );
            nut.rotation.x = Math.PI / 2;
            nut.position.z = -totalStackThk * 0.6 - boltDiam * 0.4 - explodeZ;
            boltGroup.add(nut);

            tabPivotGroup.add(boltGroup);
          });
        }

        // Slotted Beam (Timber / Round Rod / Metal Pipe)
        if (showBeams) {
          const strutStubLen = 220;
          const strutGroup = new THREE.Group();
          const explodeDist = explodedView * 120;
          strutGroup.position.set(explodeDist, 0, 0);

          if (isRoundRay) {
            // ========================================================
            // Round Hollow Socket Sleeve & Round Tube Beam
            // Socket sleeve extends from x=0 to x=tabLen with internal shoulder at x=tabLen*0.20.
            // Tube enters socket up to x=tabLen*0.22 (safe axial clearance from stop shoulder).
            // Fit clearance of 0.35mm radially ensures ZERO Z-fighting with socket inner wall!
            // ========================================================
            const insertionStopX = tabLen * 0.22;
            const cylCenter = insertionStopX + strutStubLen / 2;

            if (model.beamProfile.type === "pipe") {
              const pipeWall = Math.max(0.6, Math.min(tubeOuterR * 0.5, (model.beamProfile as any).wallThickness || 2.0));
              const pipeGeom = createHollowSocketTube(tubeOuterR, tubeOuterR - pipeWall, strutStubLen, 24);
              const pipeMesh = new THREE.Mesh(pipeGeom, tubeMat);
              pipeMesh.rotation.y = Math.PI / 2;
              pipeMesh.position.set(insertionStopX, 0, 0);
              pipeMesh.castShadow = true;
              pipeMesh.receiveShadow = true;
              strutGroup.add(pipeMesh);
            } else {
              const cylGeom = new THREE.CylinderGeometry(tubeOuterR, tubeOuterR, strutStubLen, 24);
              const cyl = new THREE.Mesh(cylGeom, tubeMat);
              cyl.rotation.z = Math.PI / 2;
              cyl.position.set(cylCenter, 0, 0);
              cyl.castShadow = true;
              cyl.receiveShadow = true;
              strutGroup.add(cyl);
            }
          } else if (isRoundBeam) {
            // Round beam attached to flat steel blade: slotted fork to avoid blade collision
            const slotDepth = tabLen * 1.05;
            const slotGap = thk + 1.2;
            const forkLen = slotDepth;
            const solidLen = Math.max(20, strutStubLen - forkLen);

            // Slotted end fork (two half-cylinders separated by slotGap)
            const halfGeom = new THREE.CylinderGeometry(tubeOuterR, tubeOuterR, forkLen, 24, 1, false, 0, Math.PI);
            const topCyl = new THREE.Mesh(halfGeom, tubeMat);
            topCyl.rotation.z = Math.PI / 2;
            topCyl.rotation.x = Math.PI / 2;
            topCyl.position.set(forkLen / 2, 0, slotGap / 2);
            topCyl.castShadow = true;
            strutGroup.add(topCyl);

            const botCyl = new THREE.Mesh(halfGeom, tubeMat);
            botCyl.rotation.z = Math.PI / 2;
            botCyl.rotation.x = -Math.PI / 2;
            botCyl.position.set(forkLen / 2, 0, -slotGap / 2);
            botCyl.castShadow = true;
            strutGroup.add(botCyl);

            // Solid round body continuing after slot depth (no mesh overlap!)
            const solidGeom = new THREE.CylinderGeometry(tubeOuterR, tubeOuterR, solidLen, 24);
            const solidCyl = new THREE.Mesh(solidGeom, tubeMat);
            solidCyl.rotation.z = Math.PI / 2;
            solidCyl.position.set(forkLen + solidLen / 2, 0, 0);
            solidCyl.castShadow = true;
            strutGroup.add(solidCyl);
          } else {
            // Rectangular timber beam with central blade slot
            // Fork depth = tabLen * 1.05, slot clearance gap = thk + 1.2 mm
            const slotDepth = tabLen * 1.05;
            const slotGap = thk + 1.2;
            const timberHalfW = Math.max(1, (beamW - slotGap) / 2);
            const solidLen = Math.max(20, strutStubLen - slotDepth);

            // Fork top half
            const topHalf = new THREE.Mesh(
              new THREE.BoxGeometry(slotDepth, beamD * 0.65, timberHalfW),
              woodMat
            );
            topHalf.position.set(slotDepth / 2, 0, slotGap / 2 + timberHalfW / 2);
            topHalf.castShadow = true;
            strutGroup.add(topHalf);

            // Fork bottom half
            const botHalf = new THREE.Mesh(
              new THREE.BoxGeometry(slotDepth, beamD * 0.65, timberHalfW),
              woodMat
            );
            botHalf.position.set(slotDepth / 2, 0, -slotGap / 2 - timberHalfW / 2);
            botHalf.castShadow = true;
            strutGroup.add(botHalf);

            // Solid timber section starts cleanly at slotDepth (NO OVERLAPPING MESHES!)
            const solid = new THREE.Mesh(
              new THREE.BoxGeometry(solidLen, beamD * 0.65, beamW),
              woodMat
            );
            solid.position.set(slotDepth + solidLen / 2, 0, 0);
            solid.castShadow = true;
            strutGroup.add(solid);
          }
          tabPivotGroup.add(strutGroup);
        }

        // 3D Annotations
        if (showAnnotations) {
          add3DAnnotation(tabPivotGroup, i + 1, beam.beamType, fullBendDeg, tabLen + (showBeams ? 160 : 35));
        }

        rayRootGroup.add(tabPivotGroup);
        group.add(rayRootGroup);
      });
    }

    // ========================================================
    // SYSTEM 2: PIPE HUB (Трубний вузол / Pipe Hub)
    // ========================================================
    else if (currentSystem === "pipe_hub") {
      const pipeOuterR = hubR * 0.65;
      const pipeInnerR = pipeOuterR - Math.max(3, thk * 1.2);
      const pipeH = Math.max(beamD * 0.75, tabW * 1.5);

      // Central Steel Pipe (hollow cylinder)
      const pipeGeom = new THREE.CylinderGeometry(pipeOuterR, pipeOuterR, pipeH, 32);
      const pipeMesh = new THREE.Mesh(pipeGeom, steelMat);
      pipeMesh.rotation.x = Math.PI / 2;
      pipeMesh.castShadow = true;
      group.add(pipeMesh);

      // Inner hollow cutout appearance
      const innerGeom = new THREE.CylinderGeometry(pipeInnerR, pipeInnerR, pipeH * 1.02, 32);
      const innerMesh = new THREE.Mesh(innerGeom, new THREE.MeshBasicMaterial({ color: 0x151b22 }));
      innerMesh.rotation.x = Math.PI / 2;
      group.add(innerMesh);

      // Top Steel Cover Cap / Washer
      const capGeom = new THREE.CylinderGeometry(pipeOuterR * 1.05, pipeOuterR * 1.05, thk * 1.2, 32);
      const capMesh = new THREE.Mesh(capGeom, darkSteelMat);
      capMesh.rotation.x = Math.PI / 2;
      capMesh.position.z = pipeH / 2 + thk * 0.6;
      group.add(capMesh);

      // Center Tension Rod / Bolt
      const rodGeom = new THREE.CylinderGeometry(boltR * 1.5, boltR * 1.5, pipeH * 1.3, 16);
      const rodMesh = new THREE.Mesh(rodGeom, boltMat);
      rodMesh.rotation.x = Math.PI / 2;
      group.add(rodMesh);

      // Radial Welded Steel Fins & Timber Struts
      sortedBeams.forEach((beam: ConnectorBeam, i: number) => {
        const planarAngleDeg = (beam as any).planarAngle ?? (i * 360) / rayCount;
        const planarAngleRad = (planarAngleDeg * Math.PI) / 180;
        const fullBendDeg = (beam as any).bendAngle || 8.0;
        const currentBendDeg = fullBendDeg * bendProgress;
        const currentBendRad = (currentBendDeg * Math.PI) / 180;

        const rayRootGroup = new THREE.Group();
        rayRootGroup.rotation.z = planarAngleRad;

        const finPivotGroup = new THREE.Group();
        finPivotGroup.position.set(pipeOuterR, 0, 0);
        finPivotGroup.rotation.y = -currentBendRad;

        // Welded Fin Plate (thick steel tab)
        const finLen = tabLen;
        const finHeight = pipeH * 0.85;
        const finThk = Math.max(5, thk * 1.2);
        const finGeom = new THREE.BoxGeometry(finLen, finThk, finHeight);
        const finMesh = new THREE.Mesh(finGeom, steelMat);
        finMesh.position.set(finLen / 2, 0, 0);
        finMesh.castShadow = true;
        finPivotGroup.add(finMesh);

        // Weld Fillet Visualizer (metallic bead where fin meets pipe)
        const weldGeom = new THREE.CylinderGeometry(3, 3, finHeight * 0.95, 8);
        const weldMesh = new THREE.Mesh(weldGeom, darkSteelMat);
        weldMesh.position.set(0, 0, 0);
        finPivotGroup.add(weldMesh);

        // Fasteners
        if (showFasteners) {
          [finLen * 0.4, finLen * 0.78].forEach(fX => {
            const boltGroup = new THREE.Group();
            const explodeY = explodedView * 60;
            boltGroup.position.set(fX, 0, 0);

            const boltTotalLen = beamW + finThk * 2;
            const shank = new THREE.Mesh(
              new THREE.CylinderGeometry(boltR, boltR, boltTotalLen, 12),
              boltMat
            );
            shank.rotation.z = Math.PI / 2;
            boltGroup.add(shank);

            const head = new THREE.Mesh(
              new THREE.CylinderGeometry(boltDiam * 0.9, boltDiam * 0.9, boltDiam * 0.6, 6),
              boltMat
            );
            head.rotation.z = Math.PI / 2;
            head.position.y = boltTotalLen * 0.5 + explodeY;
            boltGroup.add(head);

            const nut = new THREE.Mesh(
              new THREE.CylinderGeometry(boltDiam * 0.9, boltDiam * 0.9, boltDiam * 0.7, 6),
              boltMat
            );
            nut.rotation.z = Math.PI / 2;
            nut.position.y = -boltTotalLen * 0.5 - explodeY;
            boltGroup.add(nut);

            finPivotGroup.add(boltGroup);
          });
        }

        // Timber / Round Strut with End Scallop
        if (showBeams) {
          const strutStubLen = 220;
          const strutGroup = new THREE.Group();
          const explodeDist = explodedView * 120;
          strutGroup.position.set(explodeDist, 0, 0);

          const slotDepth = finLen * 1.05;
          const slotGap = finThk + 1.2;
          const solidLen = Math.max(20, strutStubLen - slotDepth);

          if (isRoundBeam) {
            const rad = Math.max(1, beamDiam / 2);
            // Half-cylinders for slotted fork over welded fin plate
            const halfGeom = new THREE.CylinderGeometry(rad, rad, slotDepth, 24, 1, false, 0, Math.PI);
            const leftCyl = new THREE.Mesh(halfGeom, tubeMat);
            leftCyl.rotation.z = Math.PI / 2;
            leftCyl.position.set(slotDepth / 2, slotGap / 2, 0);
            leftCyl.castShadow = true;
            strutGroup.add(leftCyl);

            const rightCyl = new THREE.Mesh(halfGeom, tubeMat);
            rightCyl.rotation.z = Math.PI / 2;
            rightCyl.rotation.x = Math.PI;
            rightCyl.position.set(slotDepth / 2, -slotGap / 2, 0);
            rightCyl.castShadow = true;
            strutGroup.add(rightCyl);

            const solidCyl = new THREE.Mesh(
              new THREE.CylinderGeometry(rad, rad, solidLen, 24),
              tubeMat
            );
            solidCyl.rotation.z = Math.PI / 2;
            solidCyl.position.set(slotDepth + solidLen / 2, 0, 0);
            solidCyl.castShadow = true;
            strutGroup.add(solidCyl);
          } else {
            const halfW = Math.max(1, (beamW - slotGap) / 2);
            const leftHalf = new THREE.Mesh(
              new THREE.BoxGeometry(slotDepth, halfW, finHeight * 1.05),
              woodMat
            );
            leftHalf.position.set(slotDepth / 2, slotGap / 2 + halfW / 2, 0);
            leftHalf.castShadow = true;
            strutGroup.add(leftHalf);

            const rightHalf = new THREE.Mesh(
              new THREE.BoxGeometry(slotDepth, halfW, finHeight * 1.05),
              woodMat
            );
            rightHalf.position.set(slotDepth / 2, -slotGap / 2 - halfW / 2, 0);
            rightHalf.castShadow = true;
            strutGroup.add(rightHalf);

            const solid = new THREE.Mesh(
              new THREE.BoxGeometry(solidLen, beamW, finHeight * 1.05),
              woodMat
            );
            solid.position.set(slotDepth + solidLen / 2, 0, 0);
            solid.castShadow = true;
            strutGroup.add(solid);
          }

          finPivotGroup.add(strutGroup);
        }

        if (showAnnotations) {
          add3DAnnotation(finPivotGroup, i + 1, beam.beamType, fullBendDeg, finLen + (showBeams ? 160 : 35));
        }

        rayRootGroup.add(finPivotGroup);
        group.add(rayRootGroup);
      });
    }

    // ========================================================
    // SYSTEM 3: SPIDER (Спайдер з U-подібними чашами)
    // ========================================================
    else if (currentSystem === "spider") {
      // Heavy Central Boss Hub
      const bossR = hubR * 0.85;
      const bossH = thk * 3.5;
      const bossGeom = new THREE.CylinderGeometry(bossR, bossR * 0.9, bossH, rayCount);
      const bossMesh = new THREE.Mesh(bossGeom, darkSteelMat);
      bossMesh.rotation.x = Math.PI / 2;
      bossMesh.castShadow = true;
      group.add(bossMesh);

      // Central King Bolt
      const kingBolt = new THREE.Mesh(
        new THREE.CylinderGeometry(boltDiam * 1.2, boltDiam * 1.2, bossH * 1.4, 6),
        boltMat
      );
      kingBolt.rotation.x = Math.PI / 2;
      group.add(kingBolt);

      // U-Bracket Saddles embracing solid wood beams
      sortedBeams.forEach((beam: ConnectorBeam, i: number) => {
        const planarAngleDeg = (beam as any).planarAngle ?? (i * 360) / rayCount;
        const planarAngleRad = (planarAngleDeg * Math.PI) / 180;
        const fullBendDeg = (beam as any).bendAngle || 8.0;
        const currentBendDeg = fullBendDeg * bendProgress;
        const currentBendRad = (currentBendDeg * Math.PI) / 180;

        const rayRootGroup = new THREE.Group();
        rayRootGroup.rotation.z = planarAngleRad;

        const saddleGroup = new THREE.Group();
        saddleGroup.position.set(bossR, 0, 0);
        saddleGroup.rotation.y = -currentBendRad;

        const saddleLen = tabLen;
        const saddleInnerW = beamW + 4;
        const saddleFlangeH = Math.min(beamD * 0.6, tabW);
        const saddleThk = thk;

        // Bottom Plate of U-bracket
        const bottomPlate = new THREE.Mesh(
          new THREE.BoxGeometry(saddleLen, saddleInnerW + saddleThk * 2, saddleThk),
          steelMat
        );
        bottomPlate.position.set(saddleLen / 2, 0, -saddleFlangeH / 2);
        saddleGroup.add(bottomPlate);

        // Left Vertical Flange of U-bracket
        const leftFlange = new THREE.Mesh(
          new THREE.BoxGeometry(saddleLen, saddleThk, saddleFlangeH),
          steelMat
        );
        leftFlange.position.set(saddleLen / 2, saddleInnerW / 2 + saddleThk / 2, 0);
        saddleGroup.add(leftFlange);

        // Right Vertical Flange of U-bracket
        const rightFlange = new THREE.Mesh(
          new THREE.BoxGeometry(saddleLen, saddleThk, saddleFlangeH),
          steelMat
        );
        rightFlange.position.set(saddleLen / 2, -saddleInnerW / 2 - saddleThk / 2, 0);
        saddleGroup.add(rightFlange);

        // Solid Timber / Round Strut sitting inside the U-saddle
        if (showBeams) {
          const strutLen = 220;
          const explodeDist = explodedView * 120;
          if (isRoundBeam) {
            const rad = Math.max(1, beamDiam / 2);
            const cylGeom = new THREE.CylinderGeometry(rad, rad, strutLen, 24);
            const cyl = new THREE.Mesh(cylGeom, woodMat);
            cyl.rotation.z = Math.PI / 2;
            cyl.position.set(strutLen / 2 + 5 + explodeDist, 0, 0);
            cyl.castShadow = true;
            saddleGroup.add(cyl);
          } else {
            const solidBeam = new THREE.Mesh(
              new THREE.BoxGeometry(strutLen, beamW, saddleFlangeH * 1.15),
              woodMat
            );
            solidBeam.position.set(strutLen / 2 + 5 + explodeDist, 0, 0);
            solidBeam.castShadow = true;
            saddleGroup.add(solidBeam);
          }
        }

        // Horizontal Bolts through U-flanges and Timber
        if (showFasteners) {
          [saddleLen * 0.35, saddleLen * 0.75].forEach(bX => {
            const boltGroup = new THREE.Group();
            const explodeY = explodedView * 60;
            boltGroup.position.set(bX, 0, 0);

            const totalW = saddleInnerW + saddleThk * 2;
            const shank = new THREE.Mesh(
              new THREE.CylinderGeometry(boltR, boltR, totalW * 1.25, 12),
              boltMat
            );
            shank.rotation.z = Math.PI / 2;
            boltGroup.add(shank);

            const head = new THREE.Mesh(
              new THREE.CylinderGeometry(boltDiam * 0.9, boltDiam * 0.9, boltDiam * 0.6, 6),
              boltMat
            );
            head.rotation.z = Math.PI / 2;
            head.position.y = totalW * 0.6 + explodeY;
            boltGroup.add(head);

            const nut = new THREE.Mesh(
              new THREE.CylinderGeometry(boltDiam * 0.9, boltDiam * 0.9, boltDiam * 0.7, 6),
              boltMat
            );
            nut.rotation.z = Math.PI / 2;
            nut.position.y = -totalW * 0.6 - explodeY;
            boltGroup.add(nut);

            saddleGroup.add(boltGroup);
          });
        }

        if (showAnnotations) {
          add3DAnnotation(saddleGroup, i + 1, beam.beamType, fullBendDeg, saddleLen + (showBeams ? 160 : 35));
        }

        rayRootGroup.add(saddleGroup);
        group.add(rayRootGroup);
      });
    }

    // ========================================================
    // SYSTEM 4: GOOD KARMA (Безконекторне взаємоперекриття брусів)
    // ========================================================
    else if (currentSystem === "good_karma") {
      const swirlRadius = Math.max(beamW * 0.8, hubR * 0.45);
      const strutLen = 240;

      // Reciprocal Pinwheel Beams overlapping each other
      sortedBeams.forEach((beam: ConnectorBeam, i: number) => {
        const baseAngleDeg = (i * 360) / rayCount;
        const baseAngleRad = (baseAngleDeg * Math.PI) / 180;
        const fullBendDeg = (beam as any).bendAngle || 7.5;
        const currentBendDeg = fullBendDeg * bendProgress;
        const currentBendRad = (currentBendDeg * Math.PI) / 180;

        const rayRootGroup = new THREE.Group();
        rayRootGroup.rotation.z = baseAngleRad;

        const strutPivotGroup = new THREE.Group();
        // Offset laterally by swirlRadius to create reciprocal spiral!
        const explodeDist = explodedView * 100;
        strutPivotGroup.position.set(swirlRadius + explodeDist, (beamW * 0.55), 0);
        strutPivotGroup.rotation.y = -currentBendRad;

        // Beveled Timber / Round Strut
        if (isRoundBeam) {
          const rad = Math.max(1, beamDiam / 2);
          const cylGeom = new THREE.CylinderGeometry(rad, rad, strutLen, 24);
          const cyl = new THREE.Mesh(cylGeom, woodMat);
          cyl.rotation.z = Math.PI / 2;
          cyl.position.set(strutLen / 2, 0, 0);
          cyl.castShadow = true;
          strutPivotGroup.add(cyl);
        } else {
          const strutGeom = new THREE.BoxGeometry(strutLen, beamW, beamD * 0.65);
          const strutMesh = new THREE.Mesh(strutGeom, woodMat);
          strutMesh.position.set(strutLen / 2, 0, 0);
          strutMesh.castShadow = true;
          strutPivotGroup.add(strutMesh);

          // Precision Bevel Joint Face (highlighted cut end)
          const bevelFaceGeom = new THREE.BoxGeometry(2, beamW * 1.02, beamD * 0.66);
          const bevelFace = new THREE.Mesh(
            bevelFaceGeom,
            new THREE.MeshStandardMaterial({ color: 0xb58048, roughness: 0.8 })
          );
          bevelFace.position.set(0, 0, 0);
          strutPivotGroup.add(bevelFace);
        }

        // Through-Tension Bolts at Strut Overlap Joint
        if (showFasteners) {
          const boltGroup = new THREE.Group();
          boltGroup.position.set(beamW * 0.8, 0, 0);

          const shank = new THREE.Mesh(
            new THREE.CylinderGeometry(boltR * 1.1, boltR * 1.1, beamD * 0.9, 12),
            boltMat
          );
          shank.rotation.x = Math.PI / 2;
          boltGroup.add(shank);

          // Heavy Square Washer (characteristic of Good Karma joints)
          const washerGeom = new THREE.BoxGeometry(boltDiam * 2.2, boltDiam * 2.2, 3);
          const topWasher = new THREE.Mesh(washerGeom, steelMat);
          topWasher.position.z = beamD * 0.35 + (explodedView * 40);
          boltGroup.add(topWasher);

          const botWasher = new THREE.Mesh(washerGeom, steelMat);
          botWasher.position.z = -beamD * 0.35 - (explodedView * 40);
          boltGroup.add(botWasher);

          const topNut = new THREE.Mesh(
            new THREE.CylinderGeometry(boltDiam * 0.9, boltDiam * 0.9, boltDiam * 0.7, 6),
            boltMat
          );
          topNut.rotation.x = Math.PI / 2;
          topNut.position.z = beamD * 0.35 + 4 + (explodedView * 50);
          boltGroup.add(topNut);

          strutPivotGroup.add(boltGroup);
        }

        if (showAnnotations) {
          add3DAnnotation(strutPivotGroup, i + 1, beam.beamType, fullBendDeg, strutLen * 0.8);
        }

        rayRootGroup.add(strutPivotGroup);
        group.add(rayRootGroup);
      });

      // Central Reciprocal Skylight Ring (Center Rosette)
      const ringGeom = new THREE.TorusGeometry(swirlRadius * 0.95, 4, 16, 32);
      const ringMesh = new THREE.Mesh(ringGeom, darkSteelMat);
      ringMesh.position.z = (beamD * 0.32);
      group.add(ringMesh);
    }

    // 3D Node Number / Marking Badge directly above the connector hub
    if (showNodeMarking && activeType) {
      const sampleNode = model.nodes[activeType.sampleNodeId];
      const sampleLabel = sampleNode?.label || `AA${activeType.sampleNodeId + 1}`;
      const nodeLabelsList = activeType.nodeIds.map(nid => model.nodes[nid]?.label || `AA${nid + 1}`);

      const canvas = document.createElement("canvas");
      canvas.width = 384;
      canvas.height = 144;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // Rounded badge card
        ctx.fillStyle = "rgba(15, 23, 42, 0.92)"; // Dark Navy #0F172A
        ctx.beginPath();
        ctx.roundRect(8, 8, 368, 128, 20);
        ctx.fill();
        ctx.strokeStyle = "#38BDF8"; // Cyber sky blue
        ctx.lineWidth = 4;
        ctx.stroke();

        // Header
        ctx.fillStyle = "#94A3B8";
        ctx.font = "bold 20px monospace, sans-serif";
        ctx.textAlign = "center";
        const subText = activeType.nodeIds.length > 1
          ? `ВУЗЛИ КУПОЛА (${activeType.countInDome} ШТ)`
          : "МАРКУВАННЯ ВУЗЛА";
        ctx.fillText(subText, 192, 38);

        // Big Node Marking e.g. AA1
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "900 48px 'JetBrains Mono', monospace, sans-serif";
        ctx.fillText(sampleLabel, 192, 88);

        // Subtitle with dome node numbers
        ctx.fillStyle = "#38BDF8";
        ctx.font = "bold 18px monospace, sans-serif";
        const nodesLine = activeType.nodeIds.length > 1
          ? (nodeLabelsList.length <= 6 ? nodeLabelsList.join(" · ") : `${nodeLabelsList.slice(0, 5).join(" · ")} ...`)
          : `ID: #${activeType.sampleNodeId}`;
        ctx.fillText(nodesLine, 192, 118);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        const badgeScale = Math.max(65, Math.min(125, hubR * 1.45));
        sprite.scale.set(badgeScale, badgeScale * (144 / 384), 1);
        // Position directly above connector center
        const hubH = Math.max(25, hubR * 0.6);
        sprite.position.set(0, 0, hubH + 30 + (explodedView * 40));
        group.add(sprite);
      }
    }
  }, [
    activeConnector,
    activeType,
    currentSystem,
    connectorParams,
    model.beamProfile,
    model.nodes,
    showBeams,
    showFasteners,
    showAnnotations,
    showNodeMarking,
    showFoundationPad,
    steelFinish,
    bendProgress,
    explodedView
  ]);

  // Helper to create 3D canvas billboard annotations
  const add3DAnnotation = (
    parentGroup: THREE.Group,
    rayIdx: number,
    beamType: string,
    bendDeg: number,
    distanceX: number
  ) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "rgba(26, 46, 59, 0.88)";
    ctx.beginPath();
    ctx.roundRect(10, 10, 236, 108, 16);
    ctx.fill();
    ctx.strokeStyle = "#5B9279";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#FAF7F2";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Луч #${rayIdx} (${beamType})`, 128, 52);

    ctx.fillStyle = "#DE7C5A";
    ctx.font = "bold 26px monospace";
    ctx.fillText(`δ = ${bendDeg}°`, 128, 92);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(65, 32.5, 1);
    sprite.position.set(distanceX, 0, 30);
    parentGroup.add(sprite);
  };

  // Export handlers
  const handleExportDXF = () => {
    if (!activeConnector || !activeType) return;
    const sampleLabel = model.nodes[activeType.sampleNodeId]?.label || `AA${activeType.sampleNodeId + 1}`;
    const nodeLabels = activeType.nodeIds.map(nid => model.nodes[nid]?.label || `AA${nid + 1}`);
    const dxf = generateConnectorDXF(activeConnector, connectorParams, {
      countInDome: activeType.countInDome,
      typeName: activeType.name,
      sampleNodeLabel: sampleLabel,
      nodeLabels: nodeLabels
    });
    const nameClean = activeType.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadDXF(`connector_${sampleLabel}_3D_${currentSystem}_${nameClean}.dxf`, dxf);
  };

  const handleExportSVG = () => {
    if (!activeConnector || !activeType) return;
    const sampleLabel = model.nodes[activeType.sampleNodeId]?.label || `AA${activeType.sampleNodeId + 1}`;
    const nodeLabels = activeType.nodeIds.map(nid => model.nodes[nid]?.label || `AA${nid + 1}`);
    const svg = generateConnectorSVG(activeConnector, { ...model, connectorParams }, {
      countInDome: activeType.countInDome,
      typeName: activeType.name,
      sampleNodeLabel: sampleLabel,
      nodeLabels: nodeLabels
    });
    const nameClean = activeType.name.replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadFile(`connector_${sampleLabel}_3D_${currentSystem}_${nameClean}.svg`, svg, "image/svg+xml");
  };

  const handleExportSTL = () => {
    if (!activeType) return;
    const sampleLabel = model.nodes[activeType.sampleNodeId]?.label || `AA${activeType.sampleNodeId + 1}`;
    const isRound = connectorParams.rayType === "round_tube" || (connectorParams.rayType !== "plate" && isRoundBeam);
    const style = isRound ? "round_tube" : "plate";
    const stl = exportConnectorTypeSTL(model, activeType, style, connectorParams);
    const nameClean = activeType.name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
    downloadFile(`connector_${sampleLabel}_${activeType.rayCount}way_${style}_${nameClean}.stl`, stl, "application/octet-stream");
  };

  const handleExportOBJ = () => {
    if (!activeType) return;
    const sampleLabel = model.nodes[activeType.sampleNodeId]?.label || `AA${activeType.sampleNodeId + 1}`;
    const isRound = connectorParams.rayType === "round_tube" || (connectorParams.rayType !== "plate" && isRoundBeam);
    const style = isRound ? "round_tube" : "plate";
    const obj = exportConnectorTypeOBJ(model, activeType, style, connectorParams);
    const nameClean = activeType.name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
    downloadFile(`connector_${sampleLabel}_${activeType.rayCount}way_${style}_${nameClean}.obj`, obj, "application/octet-stream");
  };

  const isRoundBeam = model.beamProfile.type === "circular" || model.beamProfile.type === "pipe";
  const isRoundRay = connectorParams.rayType === "round_tube" || (connectorParams.rayType !== "plate" && isRoundBeam);
  const beamDiam = isRoundBeam
    ? (model.beamProfile.diameter || model.beamProfile.width || 20)
    : (model.beamProfile.width || 50);

  if (!activeType || !activeConnector) {
    return (
      <div className="p-8 text-center text-[#5A6778]">
        Не вдалося розрахувати геометрію конектора для 3D перегляду.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Connector System Selector Bar (Зірка / Труба-Хаб / Спайдер / Good Karma) */}
      <div className="p-2 rounded-2xl bg-white border border-[#E8E2D8] shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-[#5A6778] uppercase tracking-wider px-2">
            Конструктивна система:
          </span>
          <div className="flex items-center p-1 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8]">
            <button
              onClick={() => handleSetSystem("star_plate")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                currentSystem === "star_plate"
                  ? "bg-[#1A2E3B] text-white shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
              title="Сталева пелюсткова пластина (Thunder Domes): розкрій на лазері, прес-листогиб, внутрішній паз у брусі"
            >
              <Disc className="w-3.5 h-3.5 text-[#DE7C5A]" />
              <span>Зірка (Thunder)</span>
            </button>

            <button
              onClick={() => handleSetSystem("pipe_hub")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                currentSystem === "pipe_hub"
                  ? "bg-[#1A2E3B] text-white shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
              title="Трубний вузол (Pipe Hub): центральна товстостінна труба з привареними радіальними сталевими пелюстками"
            >
              <Circle className="w-3.5 h-3.5 text-[#5B9279]" />
              <span>Труба-Хаб (Pipe)</span>
            </button>

            <button
              onClick={() => handleSetSystem("spider")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                currentSystem === "spider"
                  ? "bg-[#1A2E3B] text-white shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
              title="Спайдер (Spider): зовнішні U-подібні чаші, що охоплюють брус без внутрішнього поздовжнього пропилу"
            >
              <Shield className="w-3.5 h-3.5 text-[#DDA843]" />
              <span>Спайдер (U-чаші)</span>
            </button>

            <button
              onClick={() => handleSetSystem("good_karma")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                currentSystem === "good_karma"
                  ? "bg-[#1A2E3B] text-white shadow-xs"
                  : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
              title="Безконекторний замок (Good Karma): дерев'яний взаємоперекриваючий вузол зі скошеними торцями без важкого металу"
            >
              <RotateCw className="w-3.5 h-3.5 text-[#2E7D32]" />
              <span>Good Karma (Дерево)</span>
            </button>
          </div>
        </div>

        {/* System Brief Explanation */}
        <div className="text-[11px] text-[#5A6778] flex items-center gap-1.5 px-2">
          <Info className="w-3.5 h-3.5 text-[#5B9279]" />
          <span>
            {currentSystem === "star_plate" && "Листова сталь для лазера + прес-листогиб. Найпопулярніша надійна система."}
            {currentSystem === "pipe_hub" && "Зварна сталева труба Ø108–150 мм. Надзвичайна жорсткість для великих прольотів."}
            {currentSystem === "spider" && "U-подібні сідла зовні бруса. Зберігає цілісність деревини без розщеплення."}
            {currentSystem === "good_karma" && "Дерев'яне самозаклинювання з косими запилами. Екологічно, мінімум сталі."}
          </span>
        </div>
      </div>

      {/* 2. Type Selector Bar (Всі типи вузлів купола: 4-way Base, 5-way Apex, 6-way Hexagons) */}
      <div className="flex flex-col gap-2.5 p-3 rounded-2xl bg-white/70 border border-[#E8E2D8] shadow-2xs">
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs px-1">
          <span className="font-bold text-[#1A2E3B] uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
            <Disc className="w-3.5 h-3.5 text-[#DE7C5A]" />
            <span>Оберіть конектор для 3D перегляду ({connectorTypes.length} видів у куполі):</span>
          </span>
          {/* Quick Ray Tabs */}
          <div className="flex items-center gap-1 bg-[#F5F0E8] p-1 rounded-xl text-xs flex-wrap">
            <button
              type="button"
              onClick={() => setRayCategoryFilter("all")}
              className={`px-2 py-0.5 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                rayCategoryFilter === "all" ? "bg-white text-[#1A2E3B] shadow-2xs" : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
            >
              Всі ({connectorTypes.length})
            </button>
            {count3R > 0 && (
              <button
                type="button"
                onClick={() => {
                  setRayCategoryFilter(3);
                  const first3 = connectorTypes.find(t => t.rayCount === 3);
                  if (first3) {
                    onSelectType(first3.typeId);
                    onSelectNode(first3.sampleNodeId);
                  }
                }}
                className={`px-2 py-0.5 rounded-lg font-bold text-xs flex items-center gap-1 cursor-pointer transition-all ${
                  rayCategoryFilter === 3 ? "bg-[#DDA843] text-white shadow-2xs" : "text-[#DDA843] hover:bg-[#FEF9EE]"
                }`}
                title="Швидкий вибір 3-променевого конектора"
              >
                <Anchor className="w-3 h-3" />
                <span>3-променеві ({count3R})</span>
              </button>
            )}
            {count4R > 0 && (
              <button
                type="button"
                onClick={() => {
                  setRayCategoryFilter(4);
                  const first4 = connectorTypes.find(t => t.rayCount === 4);
                  if (first4) {
                    onSelectType(first4.typeId);
                    onSelectNode(first4.sampleNodeId);
                  }
                }}
                className={`px-2 py-0.5 rounded-lg font-bold text-xs flex items-center gap-1 cursor-pointer transition-all ${
                  rayCategoryFilter === 4 ? "bg-[#DE7C5A] text-white shadow-2xs" : "text-[#DE7C5A] hover:bg-[#FDF0E6]"
                }`}
                title="Швидкий вибір 4-променевого конектора основи"
              >
                <Anchor className="w-3 h-3" />
                <span>4-променеві ({count4R})</span>
              </button>
            )}
            {count5R > 0 && (
              <button
                type="button"
                onClick={() => {
                  setRayCategoryFilter(5);
                  const first5 = connectorTypes.find(t => t.rayCount === 5);
                  if (first5) {
                    onSelectType(first5.typeId);
                    onSelectNode(first5.sampleNodeId);
                  }
                }}
                className={`px-2 py-0.5 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                  rayCategoryFilter === 5 ? "bg-[#5B9279] text-white shadow-2xs" : "text-[#5B9279] hover:bg-[#E1EDE3]"
                }`}
              >
                5-променеві ({count5R})
              </button>
            )}
            {count6R > 0 && (
              <button
                type="button"
                onClick={() => {
                  setRayCategoryFilter(6);
                  const first6 = connectorTypes.find(t => t.rayCount === 6);
                  if (first6) {
                    onSelectType(first6.typeId);
                    onSelectNode(first6.sampleNodeId);
                  }
                }}
                className={`px-2 py-0.5 rounded-lg font-bold text-xs cursor-pointer transition-all ${
                  rayCategoryFilter === 6 ? "bg-[#4A7C9B] text-white shadow-2xs" : "text-[#4A7C9B] hover:bg-[#EBF3F8]"
                }`}
              >
                6-променеві ({count6R})
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 max-w-full">
          {filteredTypes.map(t => {
            const isSelected = selectedTypeId === t.typeId;
            return (
              <button
                key={t.typeId}
                onClick={() => {
                  onSelectType(t.typeId);
                  onSelectNode(t.sampleNodeId);
                }}
                className={`px-2.5 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border max-w-full ${
                  isSelected
                    ? "bg-[#1A2E3B] text-white border-[#1A2E3B] shadow-xs"
                    : "bg-white hover:bg-[#FAF7F2] text-[#1A2E3B] border-[#DCD6CA] hover:border-[#B8AF9E]"
                }`}
                title={`Переглянути ${t.name} (тираж ${t.countInDome} шт.)`}
              >
                {/* Ray Badge */}
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md shrink-0 ${
                    isSelected
                      ? "bg-[#DE7C5A] text-white"
                      : t.isBoundary
                      ? "bg-[#FDEAE2] text-[#DE7C5A] border border-[#DE7C5A]/30"
                      : t.rayCount === 5
                      ? "bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE]"
                      : "bg-[#E4EEF5] text-[#1A2E3B] border border-[#BDD3E3]"
                  }`}
                >
                  {t.rayCount}R
                </span>

                {t.isBoundary && <Anchor className="w-3.5 h-3.5 text-[#DE7C5A] shrink-0" />}
                <span className="truncate max-w-[130px] sm:max-w-[200px]">
                  {t.isBoundary
                    ? `4R Опора основи`
                    : t.rayCount === 5
                    ? `5R Apex (Пентагон)`
                    : `6R Гексагон`}
                </span>

                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded-md shrink-0 ${
                    isSelected
                      ? "bg-[#2E7D32] text-white"
                      : "bg-[#E1EDE3] text-[#1A3E26]"
                  }`}
                >
                  {t.countInDome} шт
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Main 3D Canvas Viewport & Controls */}
      <div className="flex flex-col gap-2.5">
        {/* Top Control Bar above 3D Viewport - never overlaps the canvas! */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 sm:p-3 rounded-2xl bg-white border border-[#E8E2D8] shadow-2xs">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Box className="w-4 h-4 text-[#DE7C5A] shrink-0" />
            <span className="text-xs font-bold text-[#1A2E3B] truncate">
              {activeType.name}
            </span>
            <span className="text-xs font-mono font-black text-white bg-[#0F172A] px-2 py-0.5 rounded-lg border border-[#38BDF8] shrink-0 shadow-2xs">
              {model.nodes[activeType.sampleNodeId]?.label || `AA${activeType.sampleNodeId + 1}`}
            </span>
            <span className="text-xs font-mono font-black text-[#2E7D32] bg-[#E1EDE3] px-2 py-0.5 rounded-lg border border-[#A6C7AE] shrink-0">
              Тираж: {activeType.countInDome} шт
            </span>
            {activeType.isBoundary && (
              <span className="text-[10px] font-mono font-bold text-[#DE7C5A] bg-[#FDEAE2] px-2 py-0.5 rounded-lg border border-[#DE7C5A]/40 flex items-center gap-1 shrink-0">
                <Anchor className="w-2.5 h-2.5" />
                Опора основи
              </span>
            )}
          </div>

          {/* Camera Presets & Auto-rotate */}
          <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8] shrink-0">
            <button
              onClick={() => setPresetView("iso")}
              className="px-2 py-1 text-[10px] sm:text-[11px] font-bold rounded-lg text-[#5A6778] hover:text-[#1A2E3B] hover:bg-white transition-all cursor-pointer"
              title="Ізометричний ракурс"
            >
              3D Ізо
            </button>
            <button
              onClick={() => setPresetView("top")}
              className="px-2 py-1 text-[10px] sm:text-[11px] font-bold rounded-lg text-[#5A6778] hover:text-[#1A2E3B] hover:bg-white transition-all cursor-pointer"
              title="Вигляд зверху"
            >
              План
            </button>
            <button
              onClick={() => setPresetView("side")}
              className="px-2 py-1 text-[10px] sm:text-[11px] font-bold rounded-lg text-[#5A6778] hover:text-[#1A2E3B] hover:bg-white transition-all cursor-pointer"
              title="Вигляд збоку"
            >
              Фасад
            </button>
            <button
              onClick={() => setPresetView("iso")}
              className="p-1 rounded-lg text-[#5A6778] hover:text-[#1A2E3B] hover:bg-white transition-all cursor-pointer"
              title="Відцентрувати та скинути ракурс"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <div className="w-[1px] h-3.5 bg-[#E8E2D8] mx-0.5" />
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`p-1 rounded-lg transition-all cursor-pointer ${
                autoRotate ? "bg-[#E1EDE3] text-[#2E7D32]" : "text-[#5A6778] hover:text-[#1A2E3B]"
              }`}
              title={autoRotate ? "Зупинити обертання" : "Увімкнути авто-обертання"}
            >
              {autoRotate ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* 3D Viewport with dedicated, completely unobstructed canvas */}
        <div className="relative rounded-3xl overflow-hidden tactile-inset border border-white/60 bg-[#FAF7F2] h-[360px] sm:h-[460px] md:h-[540px] shadow-inner">
          {/* Three.js Canvas mount */}
          <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing touch-none" />
        </div>

        {/* Controls Toolbar: Moved BELOW the 3D Canvas on mobile and desktop, completely unblocking the 3D model! */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-[#E8E2D8] shadow-xs flex flex-col gap-3">
          {/* Node markings and system info banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#E8E2D8]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold text-[#5A6778] uppercase">
                Вузли купола ({activeType.nodeIds.length} шт):
              </span>
              <div className="flex items-center gap-1 flex-wrap">
                {activeType.nodeIds.map(nid => {
                  const nLabel = model.nodes[nid]?.label || `AA${nid + 1}`;
                  return (
                    <button
                      key={nid}
                      type="button"
                      onClick={() => onSelectNode(nid)}
                      className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FAF7F2] hover:bg-[#DE7C5A] hover:text-white border border-[#DCD6CA] text-[#1A2E3B] transition-colors cursor-pointer"
                      title={`Вибрати вузол ${nLabel} на 3D моделі купола`}
                    >
                      {nLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[#5A6778]">
              <span>Система: <b className="text-[#1A2E3B]">
                {currentSystem === "star_plate" && "Зірка (Thunder Domes)"}
                {currentSystem === "pipe_hub" && "Трубний вузол (Pipe Hub)"}
                {currentSystem === "spider" && "Спайдер (U-чаші)"}
                {currentSystem === "good_karma" && "Good Karma (Reciprocal)"}
              </b></span>
              <span className="text-[#DE7C5A] font-mono font-bold">
                (стінка {(connectorParams.wallThickness || 2.5).toFixed(1)} мм)
              </span>
            </div>
          </div>
          {/* Sliders: Bend Angle & Exploded View */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            {/* Press Brake Bend / Angle Offset Slider */}
            <div className="flex items-center gap-2 p-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8]">
              <span className="text-[11px] font-bold text-[#1A2E3B] whitespace-nowrap flex items-center gap-1 min-w-[110px]">
                <Sliders className="w-3.5 h-3.5 text-[#DE7C5A]" />
                {currentSystem === "good_karma" ? "Кут перехрестя:" : "Згин пелюсток:"}
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={bendProgress}
                onChange={e => setBendProgress(parseFloat(e.target.value))}
                className="w-full accent-[#DE7C5A] cursor-pointer"
                title="Регулювання кутів просторового сходження: від 0% (плоский стан) до 100% (зігнутий просторовий вузол)"
              />
              <span className="text-[11px] font-mono font-bold text-[#DE7C5A] w-10 text-right">
                {Math.round(bendProgress * 100)}%
              </span>
            </div>

            {/* Exploded View Slider */}
            <div className="flex items-center gap-2 p-2 rounded-xl bg-[#FAF7F2] border border-[#E8E2D8]">
              <span className="text-[11px] font-bold text-[#1A2E3B] whitespace-nowrap flex items-center gap-1 min-w-[110px]">
                <Maximize2 className="w-3.5 h-3.5 text-[#5B9279]" />
                Вибух-схема:
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={explodedView}
                onChange={e => setExplodedView(parseFloat(e.target.value))}
                className="w-full accent-[#5B9279] cursor-pointer"
                title="Рознесений вигляд вузла: розсуває балки, пластини та болти для огляду збірки"
              />
              <span className="text-[11px] font-mono font-bold text-[#5B9279] w-10 text-right">
                {Math.round(explodedView * 100)}%
              </span>
            </div>
          </div>

          {/* Visibility Toggles, Material, Style & Hollowness Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[#E8E2D8]">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Toggle Beams */}
              <button
                onClick={() => setShowBeams(!showBeams)}
                className={`px-2.5 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                  showBeams
                    ? "bg-[#FAF7F2] text-[#1A2E3B] border border-[#DCD6CA] shadow-2xs"
                    : "text-[#8C9BAE] hover:text-[#1A2E3B]"
                }`}
                title="Показати або сховати балки/труби каркаса"
              >
                <span>🪵 Балки</span>
              </button>

              {/* Toggle Fasteners */}
              <button
                onClick={() => setShowFasteners(!showFasteners)}
                className={`px-2.5 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                  showFasteners
                    ? "bg-[#FAF7F2] text-[#1A2E3B] border border-[#DCD6CA] shadow-2xs"
                    : "text-[#8C9BAE] hover:text-[#1A2E3B]"
                }`}
                title="Показати або сховати болти М та гайки"
              >
                <span>🔩 Болти</span>
              </button>

              {/* Toggle 3D Labels */}
              <button
                onClick={() => setShowAnnotations(!showAnnotations)}
                className={`px-2.5 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                  showAnnotations
                    ? "bg-[#FAF7F2] text-[#1A2E3B] border border-[#DCD6CA] shadow-2xs"
                    : "text-[#8C9BAE] hover:text-[#1A2E3B]"
                }`}
                title="Показати або сховати 3D мітки променів та кутів згину"
              >
                <span>🏷️ Мітки</span>
              </button>

              {/* Toggle 3D Node Number / Marking */}
              <button
                onClick={() => setShowNodeMarking(!showNodeMarking)}
                className={`px-2.5 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  showNodeMarking
                    ? "bg-[#0F172A] text-white shadow-2xs border border-[#38BDF8]"
                    : "text-[#8C9BAE] hover:text-[#1A2E3B]"
                }`}
                title="Показати або сховати маркування вузла на 3D моделі конектора"
              >
                <span className="font-mono text-[10px] bg-[#38BDF8] text-[#0F172A] px-1 rounded font-bold">
                  {model.nodes[activeType.sampleNodeId]?.label || `AA${activeType.sampleNodeId + 1}`}
                </span>
                <span>Вузол</span>
              </button>

              {/* Toggle Foundation Pad for base node */}
              {activeType.isBoundary && (
                <button
                  onClick={() => setShowFoundationPad(!showFoundationPad)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 ${
                    showFoundationPad
                      ? "bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE]"
                      : "text-[#8C9BAE] hover:text-[#1A2E3B]"
                  }`}
                  title="Показати або сховати бетонну фундаментну подушку та анкери"
                >
                  <span>🧱 Фундамент</span>
                </button>
              )}

              {/* Material Category Quick Switcher */}
              {onChangeConnectorParams && (
                <div className="flex items-center gap-0.5 p-0.5 rounded-xl bg-white border border-[#DCD6CA] shadow-2xs">
                  <button
                    type="button"
                    onClick={() => {
                      const defaultMat = "steel_st3";
                      onChangeConnectorParams({
                        ...connectorParams,
                        materialCategory: "steel",
                        material: defaultMat,
                        coating: CONNECTOR_MATERIALS[defaultMat].defaultCoating
                      });
                    }}
                    className={`px-2 py-0.5 text-[11px] font-bold rounded-lg transition-all ${
                      currentCategory === "steel"
                        ? "bg-[#1A2E3B] text-white shadow-2xs"
                        : "text-[#5A6778] hover:text-[#1A2E3B]"
                    }`}
                    title="Конструкційна сталь"
                  >
                    🔩 Сталь
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const defaultMat = "aluminum_d16t";
                      onChangeConnectorParams({
                        ...connectorParams,
                        materialCategory: "aluminum",
                        material: defaultMat,
                        coating: CONNECTOR_MATERIALS[defaultMat].defaultCoating
                      });
                    }}
                    className={`px-2 py-0.5 text-[11px] font-bold rounded-lg transition-all ${
                      currentCategory === "aluminum"
                        ? "bg-[#1A2E3B] text-white shadow-2xs"
                        : "text-[#5A6778] hover:text-[#1A2E3B]"
                    }`}
                    title="Авіаційний алюміній"
                  >
                    🪶 Алюміній
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const defaultMat = "plastic_petg";
                      onChangeConnectorParams({
                        ...connectorParams,
                        materialCategory: "plastic",
                        material: defaultMat,
                        coating: CONNECTOR_MATERIALS[defaultMat].defaultCoating,
                        plasticInfillPercent: connectorParams.plasticInfillPercent || 100
                      });
                    }}
                    className={`px-2 py-0.5 text-[11px] font-bold rounded-lg transition-all ${
                      currentCategory === "plastic"
                        ? "bg-[#1A2E3B] text-white shadow-2xs"
                        : "text-[#5A6778] hover:text-[#1A2E3B]"
                    }`}
                    title="Інженерний пластик (3D-друк)"
                  >
                    🧊 Пластик
                  </button>
                </div>
              )}

              {/* Specific Material Grade Select */}
              {onChangeConnectorParams && (
                <select
                  value={currentMatId}
                  onChange={e => {
                    const newMatId = e.target.value as ConnectorMaterialId;
                    const newMat = CONNECTOR_MATERIALS[newMatId] || CONNECTOR_MATERIALS.steel_st3;
                    onChangeConnectorParams({
                      ...connectorParams,
                      material: newMatId,
                      materialCategory: newMat.category,
                      coating: newMat.defaultCoating
                    });
                  }}
                  className="text-xs font-bold px-2 py-1 rounded-xl bg-white border border-[#DCD6CA] text-[#1A2E3B] outline-none cursor-pointer"
                  title="Марка матеріалу вузла"
                >
                  {categoryMaterials.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.shortName} (σт={m.yieldStrengthMpa} МПа)
                    </option>
                  ))}
                </select>
              )}

              {/* Coating Select */}
              {onChangeConnectorParams && (
                <select
                  value={currentCoatingId}
                  onChange={e =>
                    onChangeConnectorParams({
                      ...connectorParams,
                      coating: e.target.value as ConnectorCoatingId
                    })
                  }
                  className="text-xs font-bold px-2 py-1 rounded-xl bg-white border border-[#DCD6CA] text-[#1A2E3B] outline-none cursor-pointer"
                  title="Спосіб фарбування або антикорозійного покриття"
                >
                  {categoryCoatings.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.durabilityYears})
                    </option>
                  ))}
                </select>
              )}

              {/* Live Active Node Weight Badge */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#E1EDE3] text-[#1A3E26] border border-[#A6C7AE] text-xs font-mono font-bold shadow-2xs whitespace-nowrap"
                title={`Розрахункова фізична маса вузла (#${activeType.typeId}) з урахуванням матеріалу ${currentMatInfo.name} та товщини`}
              >
                <Scale className="w-3.5 h-3.5 text-[#2E7D32]" />
                <span>
                  {activePieceWeightKg < 1
                    ? `${Math.round(activePieceWeightKg * 1000)} г`
                    : `${activePieceWeightKg.toFixed(2)} кг`}
                </span>
              </div>

              {/* Ray Style Toggle: Round Tube vs Plate */}
              {onChangeConnectorParams && (
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#FAF7F2] border border-[#DCD6CA]">
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConnectorParams({
                        ...connectorParams,
                        rayType: "round_tube"
                      })
                    }
                    className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all ${
                      (connectorParams.rayType === "round_tube" || (connectorParams.rayType !== "plate" && isRoundBeam))
                        ? "bg-[#1A2E3B] text-white shadow-2xs"
                        : "text-[#5A6778] hover:text-[#1A2E3B]"
                    }`}
                    title="Круглі гільзи (для круглих балок)"
                  >
                    ⭕️ Круглі
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onChangeConnectorParams({
                        ...connectorParams,
                        rayType: "plate"
                      })
                    }
                    className={`px-2 py-0.5 text-[11px] font-bold rounded-md transition-all ${
                      (connectorParams.rayType === "plate" || (connectorParams.rayType !== "round_tube" && !isRoundBeam))
                        ? "bg-[#1A2E3B] text-white shadow-2xs"
                        : "text-[#5A6778] hover:text-[#1A2E3B]"
                    }`}
                    title="Пластини (для прямокутного бруса)"
                  >
                    ⭐️ Пластина
                  </button>
                </div>
              )}

              {/* Wall Thickness & Hollowness Control (0.5 mm - 20.0 mm) */}
              {onChangeConnectorParams && (
                <div
                  className="flex items-center gap-1.5 bg-[#FAF7F2] px-2 py-0.5 rounded-xl border border-[#DCD6CA] text-[11px] shadow-2xs"
                  title="Пустотність та товщина стінки конектора (0.5 мм – 20.0 мм)"
                >
                  <span className="font-semibold text-[#5A6778] flex items-center gap-0.5 whitespace-nowrap">
                    <span className="text-[#DE7C5A]">⭕️</span>
                    <span>Стінка:</span>
                  </span>
                  <input
                    type="range"
                    min={0.5}
                    max={20.0}
                    step={0.5}
                    value={connectorParams.wallThickness || 2.5}
                    onChange={e =>
                      onChangeConnectorParams({
                        ...connectorParams,
                        wallThickness: Number(e.target.value)
                      })
                    }
                    className="w-16 accent-[#DE7C5A] cursor-pointer"
                    title="Повзунок товщини стінки від 0.5 мм до 20.0 мм"
                  />
                  <input
                    type="number"
                    min={0.5}
                    max={20.0}
                    step={0.1}
                    value={connectorParams.wallThickness || 2.5}
                    onChange={e => {
                      const val = Number(e.target.value);
                      if (!isNaN(val)) {
                        onChangeConnectorParams({
                          ...connectorParams,
                          wallThickness: Math.max(0.5, Math.min(20, val))
                        });
                      }
                    }}
                    className="w-12 text-center font-mono font-bold text-[#DE7C5A] outline-none border border-[#E8E2D8] rounded-md px-1 py-0.5 bg-white"
                    title="Введіть товщину стінки від 0.5 мм до 20.0 мм"
                  />
                  <span className="text-[10px] text-[#8C9BAE]">мм</span>
                </div>
              )}
            </div>

            {/* Export Buttons (STL / OBJ / DXF / SVG) */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleExportSTL}
                className="px-2.5 py-1 text-xs font-bold rounded-xl bg-[#DE7C5A] text-white hover:bg-[#C9603D] flex items-center gap-1 shadow-2xs cursor-pointer"
                title="Завантажити 3D модель цього конектора у форматі STL для 3D друку (Cura, PrusaSlicer, Bambu Studio)"
              >
                <Download className="w-3 h-3" />
                <span>STL</span>
              </button>
              <button
                onClick={handleExportOBJ}
                className="px-2.5 py-1 text-xs font-bold rounded-xl bg-[#1A2E3B] text-white hover:bg-[#2D3748] flex items-center gap-1 shadow-2xs cursor-pointer"
                title="Завантажити 3D модель цього конектора у форматі OBJ (Wavefront) для Blender, FreeCAD, Rhino"
              >
                <Download className="w-3 h-3 text-[#5B9279]" />
                <span>OBJ</span>
              </button>
              <button
                onClick={handleExportDXF}
                className="px-2 py-1 text-xs font-bold rounded-xl bg-white border border-[#DCD6CA] hover:bg-slate-50 text-[#1A2E3B] flex items-center gap-1 cursor-pointer"
                title="Завантажити креслення цього конектора у DXF для ЧПУ"
              >
                <Cpu className="w-3 h-3 text-[#DE7C5A]" />
                <span>DXF</span>
              </button>
              <button
                onClick={handleExportSVG}
                className="p-1 rounded-xl tactile-btn text-[#5A6778] hover:text-[#1A2E3B] cursor-pointer"
                title="Завантажити векторне креслення SVG"
              >
                <Download className="w-3.5 h-3.5 text-[#5B9279]" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Technical Specifications of the 3D Connector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-white border border-[#E8E2D8] text-xs">
        <div>
          <span className="text-[10px] text-[#5A6778] block">Сердцевина / База</span>
          <span className="font-mono font-bold text-[#1A2E3B]">
            {currentSystem === "star_plate" && `Диск Ø${connectorParams.hubDiameter} мм`}
            {currentSystem === "pipe_hub" && `Труба Ø${Math.round(connectorParams.hubDiameter * 0.7)}×${connectorParams.thickness} мм`}
            {currentSystem === "spider" && `Сідло U-${model.beamProfile.width + 4} мм`}
            {currentSystem === "good_karma" && `Ексцентриситет ${(model.beamProfile.width * 0.8).toFixed(0)} мм`}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-[#5A6778] block">Переріз балки каркаса</span>
          <span className="font-mono font-bold text-[#1A2E3B]">
            {isRoundBeam
              ? `Ø ${beamDiam} мм (${model.beamProfile.type === "pipe" ? "трубка" : "кругляк"})`
              : `${model.beamProfile.width} × ${model.beamProfile.depth} мм`}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-[#5A6778] block">Болтове кріплення</span>
          <span className="font-mono font-bold text-[#2E7D32]">
            {connectorParams.boltHoleCount || 2} × M{connectorParams.boltDiameter} ({connectorParams.thickness} мм сталь)
          </span>
        </div>
        <div>
          <span className="text-[10px] text-[#5A6778] block">Кути згину пелюсток (δ)</span>
          <span className="font-mono font-bold text-[#DE7C5A]">
            {Math.min(...activeType.rayDetails.map(r => r.bendAngleDeg))}° – {Math.max(...activeType.rayDetails.map(r => r.bendAngleDeg))}°
          </span>
        </div>
      </div>
    </div>
  );
};
