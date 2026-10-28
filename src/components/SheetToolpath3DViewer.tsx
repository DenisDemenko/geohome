import React, { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  SheathingSheetLayout,
  DomeModel,
  SheathingParams,
  InnerSheathingParams
} from "../core/types";
import {
  ToolpathConfig,
  DEFAULT_TOOLPATH_CONFIG,
  SheetToolpathResult,
  calculateSheetToolpath,
  downloadMach3TapFile,
  downloadGCodeFile
} from "../core/toolpath";
import { ToolpathModal } from "./ToolpathModal";
import {
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Cpu,
  Download,
  Eye,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Settings2,
  Check,
  Scissors,
  Layers,
  Info,
  Clock,
  Ruler,
  Compass
} from "lucide-react";

interface SheetToolpath3DViewerProps {
  model: DomeModel;
  sheetLayout: SheathingSheetLayout;
  sheetIndex: number;
  totalSheets: number;
  onSelectSheet?: (index: number) => void;
  toolDiameter?: number;
  onChangeToolDiameter?: (diam: number) => void;
  feedRateMmMin?: number;
  onChangeFeedRate?: (rate: number) => void;
  passes?: number;
  onChangePasses?: (passes: number) => void;
  materialName?: string;
  isInner?: boolean;
}

export const SheetToolpath3DViewer: React.FC<SheetToolpath3DViewerProps> = ({
  model,
  sheetLayout,
  sheetIndex,
  totalSheets,
  onSelectSheet,
  toolDiameter: propToolDiameter = 6,
  onChangeToolDiameter,
  feedRateMmMin: propFeedRate = 3500,
  onChangeFeedRate,
  passes: propPasses = 2,
  onChangePasses,
  materialName = "Фанера",
  isInner = false
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Local Toolpath CAM parameters (allowing full interactive configuration)
  const [config, setConfig] = useState<ToolpathConfig>(() => ({
    ...DEFAULT_TOOLPATH_CONFIG,
    toolDiameterMm: propToolDiameter,
    feedRateMmMin: propFeedRate,
    passes: propPasses,
    layer: isInner ? "inner" : "outer",
    sheetThicknessMm: (sheetLayout as any).thickness || 12,
    holdingTabs: true,
    tabWidthMm: 12,
    tabHeightMm: 4,
    spindleRpm: 18000,
    safeHeightMm: 15,
    retractHeightMm: 5,
    postProcessor: "mach3"
  }));

  // Sync prop changes
  useEffect(() => {
    setConfig(prev => ({
      ...prev,
      toolDiameterMm: propToolDiameter,
      feedRateMmMin: propFeedRate,
      passes: propPasses,
      layer: isInner ? "inner" : "outer",
      sheetThicknessMm: (sheetLayout as any).thickness || prev.sheetThicknessMm
    }));
  }, [propToolDiameter, propFeedRate, propPasses, isInner, sheetLayout]);

  // Compute Sheet Toolpath
  const toolpathResult: SheetToolpathResult = useMemo(() => {
    return calculateSheetToolpath(sheetLayout, sheetIndex, config);
  }, [sheetLayout, sheetIndex, config]);

  // Modal inspection state
  const [isGCodeModalOpen, setIsGCodeModalOpen] = useState(false);
  const [isParamsDrawerOpen, setIsParamsDrawerOpen] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0.0 to 1.0
  const [playSpeed, setPlaySpeed] = useState<number>(1.0); // 0.5x, 1x, 2x, 5x
  const [isHudMinimized, setIsHudMinimized] = useState(false);

  // Live spindle telemetry
  const [telemetry, setTelemetry] = useState<{
    x: number;
    y: number;
    z: number;
    motion: string;
    feed: number;
    partIndex: number;
    partType: string;
  }>({
    x: 0,
    y: 0,
    z: config.safeHeightMm,
    motion: "G0 Холостий",
    feed: 6000,
    partIndex: 1,
    partType: "A"
  });

  // Three.js internal references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const spindleGroupRef = useRef<THREE.Group | null>(null);
  const cutterFluteMeshRef = useRef<THREE.Mesh | null>(null);
  const toolpathLinesGroupRef = useRef<THREE.Group | null>(null);

  // Camera spherical orbit state
  const cameraSpherical = useRef({
    radius: 2500,
    theta: Math.PI * 0.15,
    phi: Math.PI * 0.32
  });
  const targetCenter = useRef(new THREE.Vector3(0, 0, 0));
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const prevMousePos = useRef({ x: 0, y: 0 });

  // Software WebGL detection
  const isSoftwareGlRef = useRef(false);

  // Pre-calculate cumulative lengths along toolpath for scrub slider
  const { totalLength, segmentStartLengths } = useMemo(() => {
    const segs = toolpathResult.allSegments;
    const starts: number[] = [];
    let cum = 0;
    for (let i = 0; i < segs.length; i++) {
      starts.push(cum);
      cum += Math.max(0.1, segs[i].lengthMm);
    }
    return { totalLength: Math.max(1, cum), segmentStartLengths: starts };
  }, [toolpathResult.allSegments]);

  // Handle Play/Pause
  const togglePlay = () => {
    setIsPlaying(p => {
      if (!p && progress >= 0.999) {
        setProgress(0);
      }
      return !p;
    });
  };

  const handleReset = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  // Camera presets
  const applyCameraPreset = (theta: number, phi: number, radiusMult = 1.35) => {
    const sheetDiagonal = Math.hypot(toolpathResult.sheetWidth, toolpathResult.sheetHeight);
    cameraSpherical.current = {
      radius: sheetDiagonal * radiusMult,
      theta,
      phi
    };
    targetCenter.current.set(0, 0, 0);
    updateCamera();
  };

  const updateCamera = () => {
    const camera = cameraRef.current;
    if (!camera) return;
    const { radius, theta, phi } = cameraSpherical.current;
    camera.position.x = targetCenter.current.x + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.y = targetCenter.current.y - radius * Math.sin(phi) * Math.cos(theta);
    camera.position.z = targetCenter.current.z + radius * Math.cos(phi);
    camera.lookAt(targetCenter.current);
  };

  // Build Procedural 3D CNC Spindle Model (3–12 part assembly conforming to skill guidelines)
  const buildSpindleAssembly = (toolDiam: number): THREE.Group => {
    const group = new THREE.Group();

    // 1. Spindle Main Housing (Heavy Industrial High-Frequency Spindle Body, e.g. 2.2kW ER20)
    const bodyRadius = 40; // 80mm diameter body
    const bodyHeight = 160;
    const bodyGeom = new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyHeight, 32);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2A3439, // Cast steel / dark anodized casing
      roughness: 0.35,
      metalness: 0.85
    });
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.position.z = bodyHeight / 2 + 50;
    bodyMesh.rotation.x = Math.PI / 2;
    group.add(bodyMesh);

    // 2. Aluminum Top Endcap & Electric Terminal
    const capGeom = new THREE.CylinderGeometry(bodyRadius * 0.95, bodyRadius * 0.95, 25, 24);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x94A3B8,
      roughness: 0.25,
      metalness: 0.9
    });
    const capMesh = new THREE.Mesh(capGeom, capMat);
    capMesh.position.z = bodyHeight + 62.5;
    capMesh.rotation.x = Math.PI / 2;
    group.add(capMesh);

    // 3. Spindle Nose & Lower Bearing Carrier
    const noseGeom = new THREE.CylinderGeometry(bodyRadius * 0.75, bodyRadius * 0.85, 30, 24);
    const noseMat = new THREE.MeshStandardMaterial({
      color: 0xE2E8F0, // Bright ground steel
      roughness: 0.2,
      metalness: 0.95
    });
    const noseMesh = new THREE.Mesh(noseGeom, noseMat);
    noseMesh.position.z = 35;
    noseMesh.rotation.x = Math.PI / 2;
    group.add(noseMesh);

    // 4. ER20 Collet Clamping Nut (Black Oxide Hexagonal/Slotted Nut)
    const nutRadius = 17; // 34mm OD ER20 nut
    const nutHeight = 20;
    const nutGeom = new THREE.CylinderGeometry(nutRadius, nutRadius, nutHeight, 16);
    const nutMat = new THREE.MeshStandardMaterial({
      color: 0x1E293B, // Black oxide
      roughness: 0.45,
      metalness: 0.8
    });
    const nutMesh = new THREE.Mesh(nutGeom, nutMat);
    nutMesh.position.z = 12;
    nutMesh.rotation.x = Math.PI / 2;
    group.add(nutMesh);

    // 5. Carbide End Mill Bit (Shank + Spiral Cutting Flutes)
    const bitRadius = Math.max(1.5, toolDiam / 2);
    const fluteHeight = 25;
    const shankHeight = 15;
    const bitGeom = new THREE.CylinderGeometry(bitRadius, bitRadius, fluteHeight + shankHeight, 16);
    const bitMat = new THREE.MeshStandardMaterial({
      color: 0xF8FAFC, // Polished Tungsten Carbide
      roughness: 0.15,
      metalness: 0.95
    });
    const bitMesh = new THREE.Mesh(bitGeom, bitMat);
    bitMesh.position.z = -((fluteHeight + shankHeight) / 2) + 2;
    bitMesh.rotation.x = Math.PI / 2;
    group.add(bitMesh);
    cutterFluteMeshRef.current = bitMesh;

    // 6. Laser / Cutting Focal Indicator (Small bright dot at cutting tip)
    const tipDotGeom = new THREE.SphereGeometry(bitRadius * 0.95, 12, 12);
    const tipDotMat = new THREE.MeshBasicMaterial({
      color: 0xF97316 // Glowing orange cutter contact point
    });
    const tipDot = new THREE.Mesh(tipDotGeom, tipDotMat);
    tipDot.position.z = 0;
    group.add(tipDot);

    return group;
  };

  // Initialize Three.js Scene
  useEffect(() => {
    const dom = mountRef.current;
    if (!dom) return;

    // Software WebGL probe
    const isSoftware = (() => {
      try {
        const gl = document.createElement("canvas").getContext("webgl2");
        if (!gl) return true;
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return false;
      }
    })();
    isSoftwareGlRef.current = isSoftware;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0xF4EFE6); // Warm workshop architectural backdrop

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      dom.clientWidth / (dom.clientHeight || 500),
      10,
      20000
    );
    camera.up.set(0, 0, 1); // Z is UP
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftware,
      powerPreference: "high-performance"
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftware ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(dom.clientWidth, dom.clientHeight || 500);
    rendererRef.current = renderer;
    dom.appendChild(renderer.domElement);

    // Studio Environment map (RoomEnvironment PMREMGenerator)
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    } catch {
      // fallback
    }

    // Studio Lights
    const ambLight = new THREE.AmbientLight(0xFFFFFF, 0.7);
    scene.add(ambLight);

    const dirLight1 = new THREE.DirectionalLight(0xFFF7ED, 1.3);
    dirLight1.position.set(2000, -2500, 3500);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xE0F2FE, 0.6);
    dirLight2.position.set(-2000, 2000, 2500);
    scene.add(dirLight2);

    // CNC Table Base Grid & Rulers
    const tableW = toolpathResult.sheetWidth + 400;
    const tableH = toolpathResult.sheetHeight + 400;

    // Table Plate Mesh (Aluminum T-slot Vacuum Bed)
    const tableGeom = new THREE.BoxGeometry(tableW, tableH, 30);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0xCBD5E1, // Aluminum tooling plate
      roughness: 0.45,
      metalness: 0.8
    });
    const tableMesh = new THREE.Mesh(tableGeom, tableMat);
    tableMesh.position.set(0, 0, -15 - config.sheetThicknessMm);
    scene.add(tableMesh);

    // T-Slot Grooves visualizer
    const gridHelper = new THREE.GridHelper(
      Math.max(tableW, tableH),
      Math.round(Math.max(tableW, tableH) / 100),
      0x94A3B8,
      0xE2E8F0
    );
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.set(0, 0, -config.sheetThicknessMm - 0.1);
    scene.add(gridHelper);

    // 3D Material Sheet Slab
    const sheetGeom = new THREE.BoxGeometry(
      toolpathResult.sheetWidth,
      toolpathResult.sheetHeight,
      config.sheetThicknessMm
    );

    // Sheet color and roughness based on material type
    let sheetColor = 0xD4A373; // Birch plywood
    let sheetRough = 0.65;
    if (materialName.toLowerCase().includes("гіпсокартон") || materialName.toLowerCase().includes("drywall")) {
      sheetColor = 0xF1F5F9;
      sheetRough = 0.85;
    } else if (materialName.toLowerCase().includes("osb")) {
      sheetColor = 0xC29553;
      sheetRough = 0.75;
    } else if (materialName.toLowerCase().includes("дсп") || materialName.toLowerCase().includes("chipboard")) {
      sheetColor = 0xD7B899;
      sheetRough = 0.8;
    } else if (materialName.toLowerCase().includes("полікарбонат") || materialName.toLowerCase().includes("скло")) {
      sheetColor = 0xBAE6FD;
      sheetRough = 0.15;
    }

    const sheetMat = new THREE.MeshStandardMaterial({
      color: sheetColor,
      roughness: sheetRough,
      metalness: 0.05
    });
    const sheetMesh = new THREE.Mesh(sheetGeom, sheetMat);
    sheetMesh.position.set(0, 0, -config.sheetThicknessMm / 2);
    scene.add(sheetMesh);

    // Sheet Border Outline
    const borderGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-toolpathResult.sheetWidth / 2, -toolpathResult.sheetHeight / 2, 0.5),
      new THREE.Vector3(toolpathResult.sheetWidth / 2, -toolpathResult.sheetHeight / 2, 0.5),
      new THREE.Vector3(toolpathResult.sheetWidth / 2, toolpathResult.sheetHeight / 2, 0.5),
      new THREE.Vector3(-toolpathResult.sheetWidth / 2, toolpathResult.sheetHeight / 2, 0.5),
      new THREE.Vector3(-toolpathResult.sheetWidth / 2, -toolpathResult.sheetHeight / 2, 0.5)
    ]);
    const borderMat = new THREE.LineBasicMaterial({ color: 0x78350F, linewidth: 2 });
    const sheetOutline = new THREE.Line(borderGeom, borderMat);
    scene.add(sheetOutline);

    // Origin Datum Marker (X0 Y0 at bottom-left corner of sheet)
    const originGroup = new THREE.Group();
    originGroup.position.set(-toolpathResult.sheetWidth / 2, -toolpathResult.sheetHeight / 2, 0);

    const xArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      120,
      0xEF4444,
      25,
      12
    );
    const yArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
      120,
      0x10B981,
      25,
      12
    );
    const zArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 1),
      90,
      0x3B82F6,
      20,
      10
    );
    originGroup.add(xArrow, yArrow, zArrow);
    scene.add(originGroup);

    // Nested Cutout Polygons (Placed parts)
    const placedPanels = (sheetLayout.placedPanels || []).filter(
      p => p.sheetIndex === sheetIndex
    );

    // Palette lookup for triangle types
    const typeColorMap = new Map<string, number>();
    (model.faceGroups || []).forEach((g, idx) => {
      const colNum = typeof g.color === "string" ? parseInt(g.color.replace("#", ""), 16) : g.color;
      typeColorMap.set(g.type, isNaN(colNum) ? 0xDE7C5A : colNum);
    });

    const panelsGroup = new THREE.Group();
    placedPanels.forEach(panel => {
      if (!panel.polygon || panel.polygon.length < 3) return;

      const pCol = typeColorMap.get(panel.panelType) || 0xDE7C5A;

      // Build 2D shape for extrusion
      const shape = new THREE.Shape();
      const first = panel.polygon[0];
      shape.moveTo(first[0] - toolpathResult.sheetWidth / 2, first[1] - toolpathResult.sheetHeight / 2);
      for (let i = 1; i < panel.polygon.length; i++) {
        const pt = panel.polygon[i];
        shape.lineTo(pt[0] - toolpathResult.sheetWidth / 2, pt[1] - toolpathResult.sheetHeight / 2);
      }
      shape.closePath();

      const pGeom = new THREE.ShapeGeometry(shape);
      const pMat = new THREE.MeshStandardMaterial({
        color: pCol,
        roughness: 0.5,
        metalness: 0.1,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const pMesh = new THREE.Mesh(pGeom, pMat);
      pMesh.position.z = 0.2; // Slightly above sheet surface
      panelsGroup.add(pMesh);

      // Panel perimeter line
      const linePts = panel.polygon.map(
        pt => new THREE.Vector3(pt[0] - toolpathResult.sheetWidth / 2, pt[1] - toolpathResult.sheetHeight / 2, 0.4)
      );
      linePts.push(linePts[0]);
      const lineGeom = new THREE.BufferGeometry().setFromPoints(linePts);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x1E293B, linewidth: 2 });
      const pLine = new THREE.Line(lineGeom, lineMat);
      panelsGroup.add(pLine);
    });
    scene.add(panelsGroup);

    // 3D Toolpath trajectory lines group
    const toolpathGroup = new THREE.Group();
    toolpathLinesGroupRef.current = toolpathGroup;

    // Segment color mapping
    const getSegColor = (type: string): number => {
      switch (type) {
        case "rapid":
          return 0x00E5FF; // Vibrant cyan
        case "plunge":
          return 0x10B981; // Emerald green
        case "cut":
          return 0xF97316; // Vibrant orange
        case "tab":
          return 0xFACC15; // Golden yellow
        case "retract":
          return 0xEF4444; // Red
        default:
          return 0xF97316;
      }
    };

    toolpathResult.allSegments.forEach(seg => {
      const pts = [
        new THREE.Vector3(seg.from.x, seg.from.y, seg.from.z),
        new THREE.Vector3(seg.to.x, seg.to.y, seg.to.z)
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: getSegColor(seg.type),
        linewidth: seg.type === "cut" ? 3 : 1.5,
        transparent: seg.type === "rapid",
        opacity: seg.type === "rapid" ? 0.75 : 1.0
      });
      const line = new THREE.Line(geom, mat);
      toolpathGroup.add(line);
    });
    scene.add(toolpathGroup);

    // 3D Spindle Assembly
    const spindle = buildSpindleAssembly(config.toolDiameterMm);
    spindleGroupRef.current = spindle;
    scene.add(spindle);

    // Initial camera position (Isometric 3D)
    applyCameraPreset(Math.PI * 0.15, Math.PI * 0.32, 1.35);

    // Pointer / Orbit Event handlers
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isDraggingRef.current = true;
      } else if (e.button === 2) {
        isPanningRef.current = true;
      }
      prevMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - prevMousePos.current.x;
      const dy = e.clientY - prevMousePos.current.y;
      prevMousePos.current = { x: e.clientX, y: e.clientY };

      if (isDraggingRef.current) {
        cameraSpherical.current.theta -= dx * 0.007;
        cameraSpherical.current.phi = Math.max(
          0.02,
          Math.min(Math.PI * 0.48, cameraSpherical.current.phi - dy * 0.007)
        );
        updateCamera();
      } else if (isPanningRef.current) {
        const factor = (cameraSpherical.current.radius * 0.0015);
        targetCenter.current.x -= dx * factor * Math.cos(cameraSpherical.current.theta);
        targetCenter.current.y -= dx * factor * Math.sin(cameraSpherical.current.theta);
        targetCenter.current.x += dy * factor * Math.sin(cameraSpherical.current.theta);
        targetCenter.current.y -= dy * factor * Math.cos(cameraSpherical.current.theta);
        updateCamera();
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      isPanningRef.current = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      const sheetDiag = Math.hypot(toolpathResult.sheetWidth, toolpathResult.sheetHeight);
      cameraSpherical.current.radius = Math.max(
        sheetDiag * 0.25,
        Math.min(sheetDiag * 4.0, cameraSpherical.current.radius * zoomFactor)
      );
      updateCamera();
    };

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    // Touch support for mobile devices
    const touchStartPos = { x: 0, y: 0 };
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        touchStartPos.x = e.touches[0].clientX;
        touchStartPos.y = e.touches[0].clientY;
        prevMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isDraggingRef.current && e.touches.length === 1) {
        if (e.cancelable) e.preventDefault();
        const dx = e.touches[0].clientX - prevMousePos.current.x;
        const dy = e.touches[0].clientY - prevMousePos.current.y;
        prevMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

        cameraSpherical.current.theta -= dx * 0.008;
        cameraSpherical.current.phi = Math.max(
          0.02,
          Math.min(Math.PI * 0.48, cameraSpherical.current.phi - dy * 0.008)
        );
        updateCamera();
      }
    };

    const handleTouchEnd = () => {
      isDraggingRef.current = false;
    };

    dom.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    dom.addEventListener("wheel", handleWheel, { passive: false });
    dom.addEventListener("contextmenu", handleContextMenu);
    dom.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!dom || !cameraRef.current || !rendererRef.current) return;
      const w = dom.clientWidth;
      const h = dom.clientHeight || 500;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    });
    resizeObserver.observe(dom);

    // Continuous Animation / Render Loop
    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Spin cutter bit when cutting or moving
      if (cutterFluteMeshRef.current) {
        cutterFluteMeshRef.current.rotation.z += 0.35;
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      dom.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      dom.removeEventListener("wheel", handleWheel);
      dom.removeEventListener("contextmenu", handleContextMenu);
      dom.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      if (rendererRef.current?.domElement && dom.contains(rendererRef.current.domElement)) {
        dom.removeChild(rendererRef.current.domElement);
      }
      renderer.dispose();
    };
  }, [sheetIndex, toolpathResult, config, materialName, sheetLayout, model]);

  // Synchronize Spindle Position with Progress & Playback
  useEffect(() => {
    let animFrame: number;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (isPlaying) {
        // Advance progress proportional to feedrate
        const currentSegIndex = Math.min(
          toolpathResult.allSegments.length - 1,
          Math.max(0, Math.floor(progress * toolpathResult.allSegments.length))
        );
        const currentSeg = toolpathResult.allSegments[currentSegIndex];
        const effectiveFeed = currentSeg?.feedrate || config.feedRateMmMin;
        const mmPerSec = (effectiveFeed / 60) * playSpeed;
        const progressDelta = (mmPerSec * dt) / totalLength;

        setProgress(prev => {
          const next = prev + progressDelta;
          if (next >= 1.0) {
            setIsPlaying(false);
            return 1.0;
          }
          return next;
        });
      }

      // Calculate spindle 3D position along toolpath segments
      const targetDist = progress * totalLength;
      const segs = toolpathResult.allSegments;

      if (segs.length > 0 && spindleGroupRef.current) {
        let activeSeg = segs[0];
        let segT = 0;

        for (let i = 0; i < segs.length; i++) {
          const segStart = segmentStartLengths[i] || 0;
          const segLen = segs[i].lengthMm;
          if (targetDist >= segStart && targetDist <= segStart + segLen) {
            activeSeg = segs[i];
            segT = segLen > 0.001 ? (targetDist - segStart) / segLen : 0;
            break;
          }
          if (i === segs.length - 1) {
            activeSeg = segs[i];
            segT = 1.0;
          }
        }

        const posX = THREE.MathUtils.lerp(activeSeg.from.x, activeSeg.to.x, segT);
        const posY = THREE.MathUtils.lerp(activeSeg.from.y, activeSeg.to.y, segT);
        const posZ = THREE.MathUtils.lerp(activeSeg.from.z, activeSeg.to.z, segT);

        spindleGroupRef.current.position.set(posX, posY, posZ);

        // Convert centered coordinates back to local workpiece coordinates (X0 Y0 at sheet corner)
        const localX = posX + toolpathResult.sheetWidth / 2;
        const localY = posY + toolpathResult.sheetHeight / 2;

        const motionLabel =
          activeSeg.type === "rapid"
            ? "G0 Холостий перехід"
            : activeSeg.type === "plunge"
            ? `G1 Врізання (Прохід ${activeSeg.passIndex})`
            : activeSeg.type === "tab"
            ? "G1 Перемичка (Таб)"
            : activeSeg.type === "retract"
            ? "G0 Відведення"
            : `G1 Різання (Прохід ${activeSeg.passIndex})`;

        setTelemetry({
          x: Math.round(localX * 10) / 10,
          y: Math.round(localY * 10) / 10,
          z: Math.round(posZ * 10) / 10,
          motion: motionLabel,
          feed: activeSeg.feedrate,
          partIndex: activeSeg.faceId,
          partType: activeSeg.faceType
        });
      }

      animFrame = requestAnimationFrame(loop);
    };

    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [isPlaying, progress, playSpeed, totalLength, toolpathResult, segmentStartLengths, config.feedRateMmMin]);

  return (
    <div className="w-full rounded-3xl overflow-hidden border border-[#DCD6CA] bg-white shadow-lg flex flex-col">
      {/* 1. 3D WebGL Canvas Viewport (100% Unobstructed Visual Area) */}
      <div className="relative w-full h-[360px] sm:h-[460px] md:h-[500px] bg-[#111827] overflow-hidden select-none">
        {/* WebGL Canvas Container */}
        <div
          ref={mountRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
        />

        {/* Top Minimal Floating HUD Bar (Compact pills, non-obstructive) */}
        <div className="absolute top-2.5 inset-x-2.5 sm:inset-x-3 flex items-center justify-between pointer-events-none gap-2">
          {/* Left: Sheet Spec Pill */}
          <div className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-xl backdrop-blur-md bg-white/90 border border-white/80 shadow-xs text-xs font-bold text-[#1A2E3B]">
            <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            <span>Лист #{sheetIndex + 1}</span>
            <span className="hidden sm:inline text-[11px] font-normal text-[#5A6778]">
              ({toolpathResult.sheetWidth} × {toolpathResult.sheetHeight} мм)
            </span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-[#FAF2DE] text-[#B7791F]">
              Ø{config.toolDiameterMm} мм
            </span>
          </div>

          {/* Right: Camera Angle Presets (Top 2D, Isometric 3D, Horizon 0°) */}
          <div className="pointer-events-auto flex items-center gap-1 p-1 rounded-xl backdrop-blur-md bg-white/90 border border-white/80 shadow-xs text-xs">
            <button
              type="button"
              onClick={() => applyCameraPreset(0, 0.02, 1.4)}
              className="px-2 py-0.5 font-bold rounded-lg text-[#1A2E3B] hover:bg-[#FAF7F2] transition-all cursor-pointer"
              title="Вигляд зверху (2D план)"
            >
              2D
            </button>
            <button
              type="button"
              onClick={() => applyCameraPreset(Math.PI * 0.15, Math.PI * 0.32, 1.35)}
              className="px-2 py-0.5 font-bold rounded-lg bg-[#1A2E3B] text-white shadow-2xs transition-all cursor-pointer"
              title="3D Перспектива / Ізометрія"
            >
              3D
            </button>
            <button
              type="button"
              onClick={() => applyCameraPreset(0, Math.PI * 0.48, 1.3)}
              className="px-2 py-0.5 font-bold rounded-lg text-[#1A2E3B] hover:bg-[#FAF7F2] transition-all cursor-pointer"
              title="0° Горизонт (вигляд з торця плити)"
            >
              0°
            </button>
          </div>
        </div>

        {/* Bottom Floating Telemetry Strip (Single-line slim indicator: 32px height) */}
        <div className="absolute bottom-2 inset-x-2 sm:inset-x-3 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 px-3 py-1 rounded-xl backdrop-blur-md bg-[#111827]/85 border border-white/10 text-white shadow-lg text-[11px] font-mono max-w-full overflow-x-auto no-scrollbar">
            <span className="flex items-center gap-1.5 text-[#10B981] font-bold shrink-0">
              <span className="w-2 h-2 rounded-full bg-[#10B981] inline-block" />
              <span>{telemetry.motion}</span>
            </span>
            <span className="text-white/25">|</span>
            <span className="shrink-0 text-white/90">
              X:<b>{telemetry.x}</b> Y:<b>{telemetry.y}</b> Z:<b>{telemetry.z}</b>
            </span>
            <span className="text-white/25">|</span>
            <span className="text-[#38BDF8] shrink-0">F:{telemetry.feed} мм/хв</span>
            {telemetry.partIndex && (
              <>
                <span className="text-white/25">|</span>
                <span className="text-amber-300 shrink-0">Деталь #{telemetry.partIndex} (Тип {telemetry.partType})</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* 2. Controls & CAM Parameters Dock (BELOW canvas in document flow: ZERO viewport occlusion!) */}
      <div className="flex flex-col gap-3 p-3.5 sm:p-4 bg-[#FAF7F2] border-t border-[#E8E2D8]">
        {/* Row 1: Transport Playback & Quick Export Buttons */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Play/Pause, Reset & Scrub Slider */}
          <div className="flex items-center gap-2 flex-1">
            <button
              type="button"
              onClick={togglePlay}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#DE7C5A] to-[#C9603D] text-white font-bold text-xs shadow-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isPlaying ? "Пауза" : "Пуск фрези"}</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="p-1.5 rounded-xl tactile-btn text-[#5A6778] hover:text-[#1A2E3B] shrink-0"
              title="Скинути в початок"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            {/* Scrub Slider */}
            <div className="flex-1 flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold text-[#8C9BAE]">0%</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={progress}
                onChange={e => {
                  setIsPlaying(false);
                  setProgress(parseFloat(e.target.value));
                }}
                className="w-full accent-[#DE7C5A] cursor-pointer"
              />
              <span className="text-[11px] font-mono font-bold text-[#1A2E3B] w-10 text-right">
                {Math.round(progress * 100)}%
              </span>
            </div>

            {/* Speed Presets */}
            <div className="hidden sm:flex items-center gap-0.5 bg-white p-0.5 rounded-xl border border-[#DCD6CA] shrink-0">
              {[0.5, 1.0, 2.0, 5.0].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPlaySpeed(s)}
                  className={`px-2 py-0.5 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                    playSpeed === s
                      ? "bg-[#1A2E3B] text-white shadow-2xs"
                      : "text-[#5A6778] hover:text-[#1A2E3B]"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Action Tools: Parameters Toggle, .TAP Download, G-Code Modal */}
          <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto shrink-0">
            {/* Toggle Parameters Drawer */}
            <button
              type="button"
              onClick={() => setIsParamsDrawerOpen(p => !p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                isParamsDrawerOpen
                  ? "bg-[#DE7C5A] text-white shadow-xs"
                  : "bg-white text-[#1A2E3B] hover:bg-[#FAF7F2] border border-[#CBD5E0]"
              }`}
              title="Налаштувати параметри фрези, глибину та швидкість"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Параметри фрези</span>
              {isParamsDrawerOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {/* Download G-Code (.gcode) File */}
            <button
              type="button"
              onClick={() =>
                downloadGCodeFile(
                  toolpathResult.gcode,
                  `sheet_${sheetIndex + 1}_of_${totalSheets}_nesting_mach3`,
                  "gcode"
                )
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-[#10B981] to-[#059669] text-white hover:brightness-110 shadow-xs transition-all cursor-pointer whitespace-nowrap"
              title="Завантажити керуючу програму ЧПУ у форматі G-code (.gcode) за постпроцесором Mach3"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Експорт G-code</span>
            </button>

            {/* Download Mach3 .TAP File */}
            <button
              type="button"
              onClick={() =>
                downloadGCodeFile(
                  toolpathResult.gcode,
                  `sheet_${sheetIndex + 1}_of_${totalSheets}_nesting_mach3`,
                  "tap"
                )
              }
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-[#D97706] to-[#B45309] text-white hover:brightness-110 shadow-xs transition-all cursor-pointer whitespace-nowrap"
              title="Завантажити готовий .TAP файл для Mach3 / Mach2 CNC"
            >
              <Download className="w-3 h-3 text-amber-200" />
              <span>.TAP</span>
            </button>

            {/* View G-Code Modal */}
            <button
              type="button"
              onClick={() => setIsGCodeModalOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-[#1A2E3B] text-white hover:bg-black shadow-xs transition-all cursor-pointer whitespace-nowrap"
              title="Переглянути та скопіювати згенерований G-код програми"
            >
              <Cpu className="w-3 h-3 text-[#DE7C5A]" />
              <span>G-код Mach3</span>
            </button>
          </div>
        </div>

        {/* Row 2: Collapsible CAM Parameters (Rendered BELOW in document flow, never covering canvas) */}
        {isParamsDrawerOpen && (
          <div className="p-3.5 rounded-2xl bg-white border border-[#E8E2D8] flex flex-wrap items-center justify-between gap-3 text-xs shadow-inner">
            {/* Tool Diameter Picker */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-[#1A2E3B] flex items-center gap-1">
                <Scissors className="w-3.5 h-3.5 text-[#2B6CB0]" />
                <span>Діаметр фрези:</span>
              </span>
              <div className="flex items-center gap-1 bg-[#FAF7F2] p-0.5 rounded-xl border border-[#DCD6CA]">
                {[4, 6, 8, 10, 12].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setConfig(c => ({ ...c, toolDiameterMm: d }));
                      if (onChangeToolDiameter) onChangeToolDiameter(d);
                    }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      config.toolDiameterMm === d
                        ? "bg-[#2B6CB0] text-white shadow-xs"
                        : "text-[#4A5568] hover:bg-white"
                    }`}
                  >
                    Ø{d} мм
                  </button>
                ))}
              </div>
            </div>

            {/* Depth Passes */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#1A2E3B]">Проходи по глибині:</span>
              <select
                value={config.passes}
                onChange={e => {
                  const val = Number(e.target.value);
                  setConfig(c => ({ ...c, passes: val }));
                  if (onChangePasses) onChangePasses(val);
                }}
                className="px-2.5 py-1 font-mono font-bold bg-[#FAF7F2] border border-[#CBD5E0] rounded-xl outline-none cursor-pointer"
              >
                <option value={1}>1 прохід (чистовий)</option>
                <option value={2}>2 проходи (рекомендовано)</option>
                <option value={3}>3 проходи (товстий матеріал)</option>
              </select>
            </div>

            {/* Feedrate */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#1A2E3B]">Подача F:</span>
              <input
                type="number"
                step={250}
                min={1000}
                max={12000}
                value={config.feedRateMmMin}
                onChange={e => {
                  const val = Number(e.target.value);
                  setConfig(c => ({ ...c, feedRateMmMin: val }));
                  if (onChangeFeedRate) onChangeFeedRate(val);
                }}
                className="w-20 px-2 py-1 font-mono font-bold text-center bg-[#FAF7F2] border border-[#CBD5E0] rounded-xl outline-none"
              />
              <span className="text-[11px] text-[#8C9BAE]">мм/хв</span>
            </div>

            {/* Holding Tabs Toggle */}
            <label className="flex items-center gap-2 cursor-pointer font-bold text-[#1A2E3B]">
              <input
                type="checkbox"
                checked={config.holdingTabs}
                onChange={e => setConfig(c => ({ ...c, holdingTabs: e.target.checked }))}
                className="rounded text-[#DE7C5A] accent-[#DE7C5A]"
              />
              <span>Перемички (Tabs {config.tabWidthMm}×{config.tabHeightMm} мм)</span>
            </label>

            {/* Post-processor */}
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[#1A2E3B]">Постпроцесор:</span>
              <select
                value={config.postProcessor}
                onChange={e => setConfig(c => ({ ...c, postProcessor: e.target.value as any }))}
                className="px-2 py-1 font-mono font-bold bg-[#FAF7F2] border border-[#CBD5E0] rounded-xl outline-none cursor-pointer"
              >
                <option value="mach3">Autodesk Fusion 360 (mach3mill.cps)</option>
                <option value="mach2">Autodesk Fusion 360 (mach2mill.cps)</option>
              </select>
            </div>
          </div>
        )}

        {/* Row 3: Legend of Toolpath Moves & Metrics */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-1 border-t border-[#E8E2D8] text-[#5A6778]">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#00E5FF]" />
              <span>G0 Холостий перехід</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
              <span>G1 Врізання</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F97316]" />
              <span>G1 Контурний різ (компенсація Ø{config.toolDiameterMm} мм)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FACC15]" />
              <span>Перемичка (Tab)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
              <span>G0 Відведення</span>
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px] text-[#1A2E3B]">
            <span>Сумарний різ: <b>{toolpathResult.metrics.cutLengthMeters} м</b></span>
            <span>·</span>
            <span>Час: <b>~{toolpathResult.metrics.estimatedTimeMinutes} хв</b></span>
          </div>
        </div>
      </div>

      {/* G-Code Inspection Modal */}
      {isGCodeModalOpen && (
        <ToolpathModal
          isOpen={isGCodeModalOpen}
          onClose={() => setIsGCodeModalOpen(false)}
          toolpathResult={toolpathResult as any}
          config={config}
          onChangeConfig={c => setConfig(prev => ({ ...prev, ...c }))}
          frequency={model.parameters.frequency}
          diameterMm={model.parameters.diameter}
        />
      )}
    </div>
  );
};
