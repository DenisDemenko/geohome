import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { DomeModel, NodeId, EdgeId, FaceId, SheathingParams } from "../core/types";
import { PLYWOOD_MATERIALS, DEFAULT_SHEATHING_PARAMS } from "../core/sheathing";
import {
  Maximize2,
  RotateCw,
  Eye,
  Layers,
  Box,
  Compass,
  Sparkles,
  Triangle,
  Tag,
  Sliders,
  Scale,
  Smartphone
} from "lucide-react";
import { ARModal } from "./ARModal";

export type RenderMode = "beams" | "sheathing" | "hybrid" | "glass" | "connectors" | "wireframe";

// Distinct architectural palette for sheathing triangles
export const SHEATHING_PALETTE = [
  "#E5A352", // Amber birch / plywood
  "#5B9279", // Mint / Sage panel
  "#DE7C5A", // Terracotta panel
  "#4A7C9B", // Ocean slate panel
  "#DDA843", // Warm Ochre panel
  "#8E6B9D", // Heather Purple panel
  "#3D6B5D", // Deep Forest panel
  "#B56576", // Dusty Rose panel
  "#6D8B74"  // Olive panel
];

// In-memory cache for triangle label canvas textures
const triangleLabelTextureCache = new Map<string, THREE.Texture>();

function getTriangleLabelTexture(
  label: string,
  borderColor: string,
  bgColor: string = "#FFFFFF"
): THREE.Texture {
  const cacheKey = `${label}_${borderColor}_${bgColor}`;
  if (triangleLabelTextureCache.has(cacheKey)) {
    return triangleLabelTextureCache.get(cacheKey)!;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  // Circle background badge
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();

  // Border ring with face color
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 10;
  ctx.stroke();

  // Triangle type text
  ctx.fillStyle = "#1A2E3B";
  const fontSize = label.length > 5 ? 30 : label.length > 3 ? 38 : 50;
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 64, 66);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  triangleLabelTextureCache.set(cacheKey, texture);
  return texture;
}

interface Viewer3DProps {
  model: DomeModel;
  selectedNodeId: NodeId | null;
  selectedEdgeId: EdgeId | null;
  selectedFaceId: FaceId | null;
  onSelectNode: (id: NodeId | null) => void;
  onSelectEdge: (id: EdgeId | null) => void;
  onSelectFace: (id: FaceId | null) => void;
  onChangeConnectorParams?: (params: any) => void;
  sheathingParams?: SheathingParams;
  onChangeSheathingParams?: (params: SheathingParams) => void;
}

export const Viewer3D: React.FC<Viewer3DProps> = ({
  model,
  selectedNodeId,
  selectedEdgeId,
  selectedFaceId,
  onSelectNode,
  onSelectEdge,
  onSelectFace,
  onChangeConnectorParams,
  sheathingParams,
  onChangeSheathingParams
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const animFrameId = useRef<number | null>(null);

  const [renderMode, setRenderMode] = useState<RenderMode>("beams");
  const [autoRotate, setAutoRotate] = useState(false);
  const [showConnectors, setShowConnectors] = useState(true);
  const [showTriangleLabels, setShowTriangleLabels] = useState(true);
  const [filterTriangleType, setFilterTriangleType] = useState<string | null>(null);
  const [sheathingStyle, setSheathingStyle] = useState<"colored" | "plywood">("colored");
  const [isARModalOpen, setIsARModalOpen] = useState<boolean>(false);

  // Plywood thickness & material state (supports micro-thickness for scaled models up to heavy construction plywood)
  const initialThickness =
    sheathingParams?.thickness ??
    model.sheathingParams?.thickness ??
    (model.parameters.diameter < 1000 ? 1.5 : 12);
  const initialMaterial =
    sheathingParams?.material ??
    model.sheathingParams?.material ??
    "plywood_birch";

  const [plywoodThickness, setPlywoodThickness] = useState<number>(initialThickness);
  const [plywoodMaterial, setPlywoodMaterial] = useState<SheathingParams["material"]>(initialMaterial);

  // Keep state synchronized with props
  useEffect(() => {
    if (sheathingParams?.thickness !== undefined) {
      setPlywoodThickness(sheathingParams.thickness);
    }
    if (sheathingParams?.material) {
      setPlywoodMaterial(sheathingParams.material);
    }
  }, [sheathingParams?.thickness, sheathingParams?.material]);

  const handleThicknessChange = (newThickness: number) => {
    const val = Math.max(0.5, Math.min(60, Number(newThickness.toFixed(1))));
    setPlywoodThickness(val);
    if (onChangeSheathingParams) {
      const foundMat = PLYWOOD_MATERIALS.find(m => m.id === plywoodMaterial);
      onChangeSheathingParams({
        ...(sheathingParams || DEFAULT_SHEATHING_PARAMS),
        thickness: val,
        material: plywoodMaterial,
        density: foundMat?.density || 680
      });
    }
  };

  const handleMaterialChange = (mat: SheathingParams["material"]) => {
    setPlywoodMaterial(mat);
    const foundMat = PLYWOOD_MATERIALS.find(m => m.id === mat);
    if (onChangeSheathingParams) {
      onChangeSheathingParams({
        ...(sheathingParams || DEFAULT_SHEATHING_PARAMS),
        thickness: plywoodThickness,
        material: mat,
        density: foundMat?.density || 680
      });
    }
  };

  // Orbit control state with momentum and click vs drag disambiguation
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const dragDistanceRef = useRef(0);
  const pointerDownPos = useRef({ x: 0, y: 0 });
  const prevMousePos = useRef({ x: 0, y: 0 });
  const touchStartDist = useRef<number | null>(null);

  const cameraSpherical = useRef({
    radius: 18000,
    theta: Math.PI / 4, // azimuth
    phi: Math.PI / 3 // elevation
  });
  const targetCenter = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 3000));
  const autoRotateRef = useRef(false);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const prevDiameterRef = useRef<number>(model.parameters.diameter);

  // Sync autoRotate state with ref
  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  // Initialize Scene
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf6f3ed); // Soft cream matching UI
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 200000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Soft Studio Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xfff6ea, 1.2);
    dirLight1.position.set(15000, 25000, 20000);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xdcebf5, 0.6);
    dirLight2.position.set(-15000, -15000, 10000);
    scene.add(dirLight2);

    // Subtle ground grid
    const groundGrid = new THREE.GridHelper(model.parameters.diameter * 2.2, 30, 0xcdc5b6, 0xe4ded3);
    groundGrid.rotation.x = Math.PI / 2; // Lie on XY ground
    groundGrid.position.z = -1;
    scene.add(groundGrid);
    gridHelperRef.current = groundGrid;

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

    // Set initial camera distance based on dome radius
    const domeR = model.parameters.diameter / 2;
    cameraSpherical.current.radius = domeR * 3.2;
    targetCenter.current.set(0, 0, model.parameters.height * 0.45);

    function updateCamera() {
      const { radius, theta, phi } = cameraSpherical.current;
      const x = targetCenter.current.x + radius * Math.sin(phi) * Math.sin(theta);
      const y = targetCenter.current.y + radius * Math.sin(phi) * Math.cos(theta);
      const z = targetCenter.current.z + radius * Math.cos(phi);
      camera.position.set(x, y, z);
      camera.up.set(0, 0, 1);
      camera.lookAt(targetCenter.current);
    }
    updateCamera();

    // Mouse & Touch Controls with silky-smooth rotation & click vs drag disambiguation
    const handleMouseDown = (e: MouseEvent) => {
      // Disregard if clicked on controls overlays
      if (e.button === 0) {
        isDraggingRef.current = true;
      } else if (e.button === 2) {
        isPanningRef.current = true;
      }
      pointerDownPos.current = { x: e.clientX, y: e.clientY };
      prevMousePos.current = { x: e.clientX, y: e.clientY };
      dragDistanceRef.current = 0;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - prevMousePos.current.x;
      const dy = e.clientY - prevMousePos.current.y;
      prevMousePos.current = { x: e.clientX, y: e.clientY };

      const totalDist = Math.hypot(
        e.clientX - pointerDownPos.current.x,
        e.clientY - pointerDownPos.current.y
      );
      dragDistanceRef.current = Math.max(dragDistanceRef.current, totalDist);

      if (isDraggingRef.current) {
        // Horizontal mouse movement rotates azimuth around dome vertical axis Z
        cameraSpherical.current.theta -= dx * 0.0075;
        // Vertical mouse movement changes altitude angle (phi)
        cameraSpherical.current.phi = Math.max(
          0.04,
          Math.min(Math.PI * 0.49, cameraSpherical.current.phi - dy * 0.0075)
        );
        updateCamera();
      } else if (isPanningRef.current) {
        const panSpeed = cameraSpherical.current.radius * 0.001;
        const right = new THREE.Vector3();
        camera.getWorldDirection(right);
        right.cross(camera.up).normalize();
        targetCenter.current.addScaledVector(right, -dx * panSpeed);
        targetCenter.current.z += dy * panSpeed;
        updateCamera();
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      isPanningRef.current = false;
    };

    // Touch support for mobile / tablets with scroll prevention ONLY while touching the 3D canvas
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        const t = e.touches[0];
        pointerDownPos.current = { x: t.clientX, y: t.clientY };
        prevMousePos.current = { x: t.clientX, y: t.clientY };
        dragDistanceRef.current = 0;
      } else if (e.touches.length === 2) {
        isDraggingRef.current = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        touchStartDist.current = Math.hypot(dx, dy);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Prevent page scrolling ONLY when actively rotating or pinching the 3D model inside the canvas
      if ((isDraggingRef.current || touchStartDist.current !== null) && e.cancelable) {
        e.preventDefault();
      }
      if (e.touches.length === 1 && isDraggingRef.current) {
        const t = e.touches[0];
        const dx = t.clientX - prevMousePos.current.x;
        const dy = t.clientY - prevMousePos.current.y;
        prevMousePos.current = { x: t.clientX, y: t.clientY };

        const totalDist = Math.hypot(
          t.clientX - pointerDownPos.current.x,
          t.clientY - pointerDownPos.current.y
        );
        dragDistanceRef.current = Math.max(dragDistanceRef.current, totalDist);

        cameraSpherical.current.theta -= dx * 0.009;
        cameraSpherical.current.phi = Math.max(
          0.04,
          Math.min(Math.PI * 0.49, cameraSpherical.current.phi - dy * 0.009)
        );
        updateCamera();
      } else if (e.touches.length === 2 && touchStartDist.current !== null) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDist = Math.hypot(dx, dy);
        const zoomDelta = touchStartDist.current / currentDist;
        touchStartDist.current = currentDist;

        const minRadius = Math.max(10, model.parameters.diameter * 0.2);
        const maxRadius = Math.max(200, model.parameters.diameter * 8.0);
        cameraSpherical.current.radius = Math.max(
          minRadius,
          Math.min(maxRadius, cameraSpherical.current.radius * zoomDelta)
        );
        updateCamera();
      }
    };

    const handleTouchEnd = () => {
      isDraggingRef.current = false;
      touchStartDist.current = null;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      const minRadius = Math.max(10, model.parameters.diameter * 0.2);
      const maxRadius = Math.max(200, model.parameters.diameter * 8.0);
      cameraSpherical.current.radius = Math.max(
        minRadius,
        Math.min(maxRadius, cameraSpherical.current.radius * zoomFactor)
      );
      updateCamera();
    };

    const dom = renderer.domElement;
    dom.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    dom.addEventListener("touchstart", handleTouchStart, { passive: false });
    dom.addEventListener("touchmove", handleTouchMove, { passive: false });
    dom.addEventListener("touchend", handleTouchEnd);
    dom.addEventListener("touchcancel", handleTouchEnd);
    dom.addEventListener("wheel", handleWheel, { passive: false });
    dom.addEventListener("contextmenu", e => e.preventDefault());

    // Raycast on click to select node/beam/face ONLY if not dragged
    const handleCanvasClick = (e: MouseEvent) => {
      // If the user rotated the model (dragged more than 6px), do not trigger element selection
      if (dragDistanceRef.current > 6) {
        return;
      }

      const rect = dom.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      raycaster.params.Line = { threshold: model.parameters.diameter * 0.015 };

      if (!groupRef.current) return;
      const intersects = raycaster.intersectObjects(groupRef.current.children, true);

      if (intersects.length > 0) {
        const first = intersects[0].object;
        if (first.userData?.nodeId !== undefined) {
          onSelectNode(first.userData.nodeId);
          onSelectEdge(null);
          onSelectFace(null);
          return;
        }
        if (first.userData?.edgeId !== undefined) {
          onSelectEdge(first.userData.edgeId);
          onSelectNode(null);
          onSelectFace(null);
          return;
        }
        if (first.userData?.faceId !== undefined) {
          onSelectFace(first.userData.faceId);
          onSelectNode(null);
          onSelectEdge(null);
          return;
        }
      }
    };
    dom.addEventListener("click", handleCanvasClick);

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

    // Render loop
    const animate = () => {
      animFrameId.current = requestAnimationFrame(animate);
      if (autoRotateRef.current && !isDraggingRef.current) {
        cameraSpherical.current.theta += 0.004;
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
      dom.removeEventListener("touchstart", handleTouchStart);
      dom.removeEventListener("touchmove", handleTouchMove);
      dom.removeEventListener("touchend", handleTouchEnd);
      dom.removeEventListener("touchcancel", handleTouchEnd);
      dom.removeEventListener("wheel", handleWheel);
      dom.removeEventListener("click", handleCanvasClick);
      renderer.dispose();
    };
  }, []);

  // Update Geometry Mesh when model or renderMode changes
  useEffect(() => {
    if (!groupRef.current || !sceneRef.current) return;
    const group = groupRef.current;
    group.clear();

    // Re-frame camera and update ground grid if dome diameter changes significantly
    const domeR = model.parameters.diameter / 2;
    if (Math.abs(prevDiameterRef.current - model.parameters.diameter) / Math.max(1, prevDiameterRef.current) > 0.25) {
      prevDiameterRef.current = model.parameters.diameter;
      cameraSpherical.current.radius = Math.max(120, domeR * 3.2);
      targetCenter.current.set(0, 0, model.parameters.height * 0.45);
      if (gridHelperRef.current && sceneRef.current) {
        sceneRef.current.remove(gridHelperRef.current);
        const newGrid = new THREE.GridHelper(model.parameters.diameter * 2.2, 30, 0xcdc5b6, 0xe4ded3);
        newGrid.rotation.x = Math.PI / 2;
        newGrid.position.z = -1;
        sceneRef.current.add(newGrid);
        gridHelperRef.current = newGrid;
      }
    }

    const nodeRadius = Math.max(1.2, model.parameters.diameter * 0.008);

    // 1. Render Beams
    if (renderMode === "beams" || renderMode === "wireframe" || renderMode === "glass" || renderMode === "hybrid") {
      for (const edge of model.edges) {
        const p1 = model.nodes[edge.start].position;
        const p2 = model.nodes[edge.end].position;

        const isSelected = selectedEdgeId === edge.id;
        const color = isSelected ? 0xff5533 : edge.color;

        const vStart = new THREE.Vector3(p1.x, p1.y, p1.z);
        const vEnd = new THREE.Vector3(p2.x, p2.y, p2.z);
        const fullDir = new THREE.Vector3().subVectors(vEnd, vStart);
        const fullLen = fullDir.length();
        const dirNorm = fullDir.clone().normalize();

        const hubDiam = model.connectorParams.hubDiameter || 140;
        const effectiveHubDiam = Math.min(hubDiam, fullLen * 0.55);
        const ringRadius = effectiveHubDiam / 2;
        const trimmedLen = Math.max(0.6, fullLen - ringRadius * 2);

        if (renderMode === "beams" || renderMode === "hybrid") {
          // Render 3D struts TRIMMED by connector ring radius at each end!
          const maxAllowedStrutRadius = fullLen * 0.18;
          const strutRadius = Math.max(0.4, Math.min(maxAllowedStrutRadius, model.beamProfile.width * 0.35));

          const strutGeom = new THREE.CylinderGeometry(
            strutRadius,
            strutRadius,
            trimmedLen,
            8
          );
          const strutMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            roughness: 0.45,
            metalness: model.beamProfile.material === "steel" ? 0.6 : 0.1
          });

          const mesh = new THREE.Mesh(strutGeom, strutMat);
          const mid = new THREE.Vector3().addVectors(vStart, vEnd).multiplyScalar(0.5);
          mesh.position.copy(mid);
          mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            dirNorm
          );
          mesh.userData = { type: "beam", edgeId: edge.id };
          group.add(mesh);
        } else {
          // Line wireframe trimmed by ring radius
          const pStartTrimmed = vStart.clone().addScaledVector(dirNorm, ringRadius);
          const pEndTrimmed = vEnd.clone().addScaledVector(dirNorm, -ringRadius);

          const geom = new THREE.BufferGeometry().setFromPoints([
            pStartTrimmed,
            pEndTrimmed
          ]);
          const mat = new THREE.LineBasicMaterial({
            color: new THREE.Color(color),
            linewidth: isSelected ? 4 : 2
          });
          const line = new THREE.Line(geom, mat);
          line.userData = { type: "beam", edgeId: edge.id };
          group.add(line);
        }
      }
    }

    // 2. Render Cladding Panels / Faces (Режим перегляду трикутників обшивки)
    if (renderMode === "sheathing" || renderMode === "hybrid" || renderMode === "glass") {
      const isHybrid = renderMode === "hybrid";
      const isGlass = renderMode === "glass";
      const groupIndexMap = new Map<string, number>();
      model.faceGroups.forEach((g, i) => groupIndexMap.set(g.type, i));

      for (const face of model.faces) {
        const pA_orig = model.nodes[face.a].position;
        const pB_orig = model.nodes[face.b].position;
        const pC_orig = model.nodes[face.c].position;

        const vA = new THREE.Vector3(pA_orig.x, pA_orig.y, pA_orig.z);
        const vB = new THREE.Vector3(pB_orig.x, pB_orig.y, pB_orig.z);
        const vC = new THREE.Vector3(pC_orig.x, pC_orig.y, pC_orig.z);

        // Centroid & outward face normal
        const pCen = new THREE.Vector3()
          .add(vA)
          .add(vB)
          .add(vC)
          .multiplyScalar(1 / 3);

        const edgeAB = new THREE.Vector3().subVectors(vB, vA);
        const edgeAC = new THREE.Vector3().subVectors(vC, vA);
        const faceNormal = new THREE.Vector3().crossVectors(edgeAB, edgeAC).normalize();
        if (faceNormal.dot(pCen) < 0) {
          faceNormal.negate();
        }

        const isSelected = selectedFaceId === face.id;
        const isFiltered = filterTriangleType !== null && face.type === filterTriangleType;
        const isDimmed = filterTriangleType !== null && face.type !== filterTriangleType;

        const groupIdx = groupIndexMap.get(face.type) ?? 0;

        // Physical outward offset: in hybrid mode sits right on top of timber beams
        const outwardOffset = isHybrid
          ? Math.max(1, (model.beamProfile.depth / 2) + 1.2)
          : Math.max(0.2, model.parameters.diameter * 0.001);

        // Expansion seam / gap between adjacent triangular panels (2-3 mm, scaled for small domes)
        const avgSide = (vA.distanceTo(vB) + vB.distanceTo(vC) + vC.distanceTo(vA)) / 3;
        const shrinkFactor = isGlass
          ? 1.0
          : Math.max(0.965, Math.min(0.992, 1 - Math.max(0.8, Math.min(4, avgSide * 0.012)) / avgSide));

        const pA = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vA, pCen), shrinkFactor).addScaledVector(faceNormal, outwardOffset);
        const pB = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vB, pCen), shrinkFactor).addScaledVector(faceNormal, outwardOffset);
        const pC = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vC, pCen), shrinkFactor).addScaledVector(faceNormal, outwardOffset);

        const panelThick = Math.max(0.5, plywoodThickness);
        const pA_in = pA;
        const pB_in = pB;
        const pC_in = pC;
        const pA_out = pA.clone().addScaledVector(faceNormal, panelThick);
        const pB_out = pB.clone().addScaledVector(faceNormal, panelThick);
        const pC_out = pC.clone().addScaledVector(faceNormal, panelThick);

        const geom = new THREE.BufferGeometry();
        // 8 triangles = 24 vertices for volumetric 3D plywood sheet with physical thickness
        const vertices = new Float32Array([
          // 1. Top face (outer surface, normal +faceNormal)
          pA_out.x, pA_out.y, pA_out.z,
          pB_out.x, pB_out.y, pB_out.z,
          pC_out.x, pC_out.y, pC_out.z,

          // 2. Bottom face (inner surface facing frame, normal -faceNormal)
          pA_in.x, pA_in.y, pA_in.z,
          pC_in.x, pC_in.y, pC_in.z,
          pB_in.x, pB_in.y, pB_in.z,

          // 3. Side Edge AB
          pA_in.x, pA_in.y, pA_in.z,
          pB_in.x, pB_in.y, pB_in.z,
          pB_out.x, pB_out.y, pB_out.z,

          pA_in.x, pA_in.y, pA_in.z,
          pB_out.x, pB_out.y, pB_out.z,
          pA_out.x, pA_out.y, pA_out.z,

          // 4. Side Edge BC
          pB_in.x, pB_in.y, pB_in.z,
          pC_in.x, pC_in.y, pC_in.z,
          pC_out.x, pC_out.y, pC_out.z,

          pB_in.x, pB_in.y, pB_in.z,
          pC_out.x, pC_out.y, pC_out.z,
          pB_out.x, pB_out.y, pB_out.z,

          // 5. Side Edge CA
          pC_in.x, pC_in.y, pC_in.z,
          pA_in.x, pA_in.y, pA_in.z,
          pA_out.x, pA_out.y, pA_out.z,

          pC_in.x, pC_in.y, pC_in.z,
          pA_out.x, pA_out.y, pA_out.z,
          pC_out.x, pC_out.y, pC_out.z
        ]);
        geom.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        geom.addGroup(0, 6, 0);   // Top & bottom faces -> material 0
        geom.addGroup(6, 18, 1);  // Side thickness edges -> material 1
        geom.computeVertexNormals();

        let faceColorHex: string;
        if (isSelected) {
          faceColorHex = "#FF5722"; // Radiant orange
        } else if (isGlass) {
          faceColorHex = "#88C4E0";
        } else if (sheathingStyle === "plywood") {
          const woodTones = ["#DCA46A", "#DEAA72", "#E5B47F", "#D49C62", "#CFA06E"];
          faceColorHex = woodTones[groupIdx % woodTones.length];
        } else {
          faceColorHex = SHEATHING_PALETTE[groupIdx % SHEATHING_PALETTE.length];
        }

        let mat: THREE.Material;
        let edgeMat: THREE.Material;

        if (isGlass) {
          mat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(faceColorHex),
            transmission: 0.75,
            opacity: 0.65,
            transparent: true,
            roughness: 0.15,
            ior: 1.5,
            side: THREE.DoubleSide
          });
          edgeMat = mat;
        } else {
          mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(faceColorHex),
            roughness: sheathingStyle === "plywood" ? 0.65 : 0.45,
            metalness: 0.05,
            transparent: isHybrid || isDimmed,
            opacity: isDimmed ? 0.18 : (isHybrid ? 0.88 : 1.0),
            side: THREE.DoubleSide
          });

          // Realistic cut edge of plywood / veneer with slightly darker ply core
          const sideColor = isSelected
            ? "#FF5722"
            : (sheathingStyle === "plywood" ? "#8A542A" : "#36271A");
          edgeMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(sideColor),
            roughness: 0.85,
            metalness: 0.02,
            transparent: isHybrid || isDimmed,
            opacity: isDimmed ? 0.18 : (isHybrid ? 0.88 : 1.0),
            side: THREE.DoubleSide
          });
        }

        const mesh = new THREE.Mesh(geom, [mat, edgeMat]);
        mesh.userData = { type: "face", faceId: face.id };
        group.add(mesh);

        // Seam border contour for distinct triangle panel appearance
        if (!isGlass) {
          const borderPoints = [pA_out, pB_out, pC_out, pA_out];
          const borderGeom = new THREE.BufferGeometry().setFromPoints(borderPoints);
          const borderMat = new THREE.LineBasicMaterial({
            color: isSelected ? 0xFFFFFF : (isFiltered ? 0xDE7C5A : 0x2A3845),
            linewidth: isSelected ? 3 : 1.5,
            transparent: isDimmed,
            opacity: isDimmed ? 0.2 : 0.85
          });
          const borderLine = new THREE.Line(borderGeom, borderMat);
          borderLine.userData = { type: "face", faceId: face.id };
          group.add(borderLine);

          // Vertical thickness corner lines
          const cornerPoints = [
            pA_in, pA_out,
            pB_in, pB_out,
            pC_in, pC_out
          ];
          const cornerGeom = new THREE.BufferGeometry().setFromPoints(cornerPoints);
          const cornerLine = new THREE.LineSegments(cornerGeom, borderMat);
          cornerLine.userData = { type: "face", faceId: face.id };
          group.add(cornerLine);
        }

        // 3D Centroid Badge Label for Triangle Type (Позначення типу на грані)
        if (showTriangleLabels && !isGlass && !isDimmed) {
          const typeName = face.type || `T${groupIdx + 1}`;
          const labelTex = getTriangleLabelTexture(
            typeName,
            isSelected ? "#FF5722" : faceColorHex,
            isSelected ? "#FFF3E0" : "#FFFFFF"
          );
          const spriteMat = new THREE.SpriteMaterial({
            map: labelTex,
            depthTest: true,
            depthWrite: false,
            transparent: true
          });
          const sprite = new THREE.Sprite(spriteMat);
          const spriteScale = Math.max(8, Math.min(220, avgSide * 0.22));
          sprite.scale.set(spriteScale, spriteScale, 1);
          sprite.position.copy(pCen).addScaledVector(
            faceNormal,
            outwardOffset + panelThick + Math.max(1, spriteScale * 0.05)
          );
          sprite.userData = { type: "face", faceId: face.id };
          group.add(sprite);
        }
      }
    }

    // 3. Render Thunder Domes Star/Ray Connectors (Лучеві конектори у 3D з початку)
    if (renderMode === "connectors" || ((showConnectors || renderMode === "hybrid") && renderMode !== "sheathing")) {
      const hubDiam = model.connectorParams.hubDiameter || 140;
      const hubR = Math.max(1.0, hubDiam / 2);
      const tabL = Math.max(1.2, model.connectorParams.tabLength || 95);
      const tabW = Math.max(1.0, model.connectorParams.tabWidth || 45);
      const thk = Math.max(0.4, model.connectorParams.thickness || 4);

      // Shared geometries for performance
      const hubGeom = new THREE.CylinderGeometry(hubR, hubR, thk, 24);
      const tabGeom = new THREE.BoxGeometry(tabW, thk, tabL);
      const boltR = Math.max(0.3, Math.min(tabW * 0.16, (model.connectorParams.boltDiameter || 10) / 2));
      const boltGeom = new THREE.CylinderGeometry(boltR, boltR, thk * 1.4, 8);
      const boltMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        metalness: 0.95,
        roughness: 0.15
      });

      for (const node of model.nodes) {
        const isSelected = selectedNodeId === node.id;
        const nodePos = new THREE.Vector3(node.position.x, node.position.y, node.position.z);

        // Calculate node outward surface normal from adjacent faces
        let avgN = new THREE.Vector3();
        let fCount = 0;
        for (const f of model.faces) {
          if (f.a === node.id || f.b === node.id || f.c === node.id) {
            avgN.x += f.normal.x;
            avgN.y += f.normal.y;
            avgN.z += f.normal.z;
            fCount++;
          }
        }
        if (fCount > 0 && avgN.lengthSq() > 0.001) {
          avgN.normalize();
        } else {
          avgN.set(node.position.x, node.position.y, Math.max(10, node.position.z)).normalize();
        }

        const connGroup = new THREE.Group();
        // Slightly offset outward along normal so it sits cleanly on exterior of beam struts
        const offsetDist = Math.max(0.15, Math.min(3.5, thk * 0.8));
        connGroup.position.copy(nodePos).addScaledVector(avgN, offsetDist);

        let steelColor = 0x6e7e8e; // Realistic galvanized plate steel
        if (isSelected) steelColor = 0xff4b2b;
        else if (node.boundary) steelColor = 0xde7c5a; // warm coral/copper for foundation base

        const steelMat = new THREE.MeshStandardMaterial({
          color: steelColor,
          metalness: 0.85,
          roughness: 0.28
        });

        // A. Central hub disc
        const hubMesh = new THREE.Mesh(hubGeom, steelMat);
        hubMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), avgN);
        hubMesh.userData = { type: "node", nodeId: node.id };
        connGroup.add(hubMesh);

        // B. Steel rays/tabs along each connected beam
        for (const edgeId of node.edges) {
          const edge = model.edges[edgeId];
          const otherId = edge.start === node.id ? edge.end : edge.start;
          const otherPos = model.nodes[otherId].position;

          const beamDir = new THREE.Vector3(
            otherPos.x - node.position.x,
            otherPos.y - node.position.y,
            otherPos.z - node.position.z
          ).normalize();

          // Vector perpendicular to beamDir in the plate plane
          const perpDir = new THREE.Vector3().crossVectors(avgN, beamDir).normalize();
          // Adjusted normal perpendicular to both
          const normalDir = new THREE.Vector3().crossVectors(beamDir, perpDir).normalize();

          const tabMesh = new THREE.Mesh(tabGeom, steelMat);
          const tabCenterDist = hubR + tabL * 0.45;
          tabMesh.position.copy(beamDir).multiplyScalar(tabCenterDist);

          // Orientation matrix: X = perpDir (width), Y = normalDir (thickness), Z = beamDir (length)
          const rotMat = new THREE.Matrix4().makeBasis(perpDir, normalDir, beamDir);
          tabMesh.quaternion.setFromRotationMatrix(rotMat);
          tabMesh.userData = { type: "node", nodeId: node.id };
          connGroup.add(tabMesh);

          // Bolt 1
          const b1 = new THREE.Mesh(boltGeom, boltMat);
          b1.position.copy(beamDir).multiplyScalar(hubR + tabL * 0.32);
          b1.quaternion.copy(tabMesh.quaternion);
          connGroup.add(b1);

          // Bolt 2
          const b2 = new THREE.Mesh(boltGeom, boltMat);
          b2.position.copy(beamDir).multiplyScalar(hubR + tabL * 0.72);
          b2.quaternion.copy(tabMesh.quaternion);
          connGroup.add(b2);
        }

        group.add(connGroup);
      }
    }
  }, [
    model,
    renderMode,
    selectedNodeId,
    selectedEdgeId,
    selectedFaceId,
    showConnectors,
    showTriangleLabels,
    filterTriangleType,
    sheathingStyle,
    plywoodThickness,
    plywoodMaterial
  ]);

  // Camera presets
  const resetCamera = () => {
    const domeR = model.parameters.diameter / 2;
    cameraSpherical.current = {
      radius: domeR * 3.2,
      theta: Math.PI / 4,
      phi: Math.PI / 3
    };
    targetCenter.current.set(0, 0, model.parameters.height * 0.45);
    if (cameraRef.current) {
      const { radius, theta, phi } = cameraSpherical.current;
      cameraRef.current.position.set(
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.sin(phi) * Math.cos(theta),
        targetCenter.current.z + radius * Math.cos(phi)
      );
      cameraRef.current.lookAt(targetCenter.current);
    }
  };

  const setViewTop = () => {
    const domeR = model.parameters.diameter / 2;
    cameraSpherical.current = {
      radius: domeR * 3.0,
      theta: 0,
      phi: 0.05
    };
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0.1, domeR * 3.0);
      cameraRef.current.lookAt(targetCenter.current);
    }
  };

  const setViewFront = () => {
    const domeR = model.parameters.diameter / 2;
    cameraSpherical.current = {
      radius: domeR * 3.2,
      theta: 0,
      phi: Math.PI * 0.48
    };
    if (cameraRef.current) {
      cameraRef.current.position.set(0, domeR * 3.2, model.parameters.height * 0.45);
      cameraRef.current.lookAt(targetCenter.current);
    }
  };

  return (
    <div className="relative w-full h-[540px] lg:h-[620px] rounded-3xl overflow-hidden tactile-inset select-none border border-white/60 touch-none">
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing touch-none" />

      {/* Floating Soft 3D Control Bar (Top-Left) */}
      <div className="absolute top-4 left-4 flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl tactile-card backdrop-blur-md bg-[#FAF7F2]/90 border border-white/80 shadow-md max-w-[calc(100%-140px)]">
        <button
          onClick={() => setRenderMode("beams")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
            renderMode === "beams" ? "tactile-pill-active text-[#1A3E26] bg-[#E1EDE3]" : "text-[#5A6778] hover:text-[#2D3748]"
          }`}
        >
          <Box className="w-3.5 h-3.5 text-[#5B9279]" />
          <span>Балки (3D)</span>
        </button>

        <button
          onClick={() => setRenderMode("sheathing")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
            renderMode === "sheathing" ? "tactile-pill-active text-[#4A2411] bg-[#FDEFE7]" : "text-[#5A6778] hover:text-[#2D3748]"
          }`}
          title="Режим перегляду трикутників обшивки (панелей купола зі швами та маркуванням)"
        >
          <Triangle className="w-3.5 h-3.5 text-[#DE7C5A]" />
          <span>Трикутники обшивки</span>
          <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-[#EFE8DD] text-[#7A4E21] rounded-md">
            {plywoodThickness} мм
          </span>
        </button>

        <button
          onClick={() => setRenderMode("hybrid")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
            renderMode === "hybrid" ? "tactile-pill-active text-[#3A2A1A] bg-[#F9E8D2]" : "text-[#5A6778] hover:text-[#2D3748]"
          }`}
          title="Комбінований режим: дерев'яні балки каркаса + трикутники обшивки поверх"
        >
          <Layers className="w-3.5 h-3.5 text-[#DDA843]" />
          <span>Каркас + Обшивка</span>
          <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-[#EFE8DD] text-[#7A4E21] rounded-md">
            {plywoodThickness} мм
          </span>
        </button>

        <button
          onClick={() => setRenderMode("glass")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
            renderMode === "glass" ? "tactile-pill-active text-[#1A2E3B] bg-[#E6F1F7]" : "text-[#5A6778] hover:text-[#2D3748]"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-[#4A7C9B]" />
          <span>Скло</span>
        </button>

        <button
          onClick={() => setRenderMode("connectors")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
            renderMode === "connectors" ? "tactile-pill-active text-[#1A3E26] bg-[#E1EDE3]" : "text-[#5A6778] hover:text-[#2D3748]"
          }`}
        >
          <Eye className="w-3.5 h-3.5 text-[#5B9279]" />
          <span>Конектори</span>
        </button>

        {/* Interactive Connector Ring Size & Strut Trim Input */}
        {onChangeConnectorParams && (
          <div className="flex items-center gap-1.5 pl-2 ml-1 border-l border-[#DCD6CA] text-xs">
            <span className="text-[11px] font-semibold text-[#5A6778] whitespace-nowrap">
              Кільце Ø:
            </span>
            <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-lg border border-[#DCD6CA] shadow-2xs">
              <input
                type="number"
                min={2}
                max={300}
                step={model.connectorParams.hubDiameter < 20 ? 0.5 : 5}
                value={model.connectorParams.hubDiameter}
                onChange={e =>
                  onChangeConnectorParams({
                    ...model.connectorParams,
                    hubDiameter: Number(e.target.value)
                  })
                }
                className="w-12 text-xs font-mono font-bold text-center text-[#1A2E3B] outline-none"
                title="Діаметр кола конектора для автоматичної обрізки бруса від центру вузла"
              />
              <span className="text-[10px] text-[#8C9BAE]">мм</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-[#2E7D32] bg-[#E1EDE3] px-1.5 py-0.5 rounded-md whitespace-nowrap">
              -{(model.connectorParams.hubDiameter / 2).toFixed(model.connectorParams.hubDiameter < 10 ? 1 : 0)} мм/торец
            </span>
          </div>
        )}
      </div>

      {/* Camera & Orbit Tooling + AR Button (Top-Right) */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5 p-1.5 rounded-2xl tactile-card backdrop-blur-md bg-[#FAF7F2]/90 border border-white/80 shadow-md">
        {/* Button 'Перегляд в AR' */}
        <button
          onClick={() => setIsARModalOpen(true)}
          title="Перегляд купола у доповненій реальності (AR) через камеру смартфона"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-[#DE7C5A] to-[#C9603D] text-white hover:opacity-95 shadow-sm transition-all transform active:scale-95 whitespace-nowrap cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Перегляд в AR</span>
        </button>

        <span className="w-[1px] h-4 bg-[#DCD6CA] mx-0.5" />

        <button
          onClick={() => setAutoRotate(!autoRotate)}
          title="Автоматичне обертання"
          className={`p-2 rounded-xl text-xs transition-all ${
            autoRotate ? "tactile-btn-pressed text-[#5B9279] bg-[#E1EDE3]" : "tactile-btn text-[#5A6778]"
          }`}
        >
          <RotateCw className={`w-4 h-4 ${autoRotate ? "animate-spin" : ""}`} />
        </button>

        <button
          onClick={setViewTop}
          title="Вид зверху (План)"
          className="px-2.5 py-1.5 text-xs font-medium rounded-xl tactile-btn text-[#4A5568]"
        >
          План
        </button>

        <button
          onClick={setViewFront}
          title="Вид спереду (Фасад)"
          className="px-2.5 py-1.5 text-xs font-medium rounded-xl tactile-btn text-[#4A5568]"
        >
          Фасад
        </button>

        <button
          onClick={resetCamera}
          title="Скинути ракурс"
          className="p-2 rounded-xl text-xs tactile-btn text-[#4A5568]"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Sheathing Triangles Interactive Legend & Controls (Bottom-Left) */}
      {(renderMode === "sheathing" || renderMode === "hybrid") ? (
        <div className="absolute bottom-4 left-4 right-4 sm:right-auto flex flex-col gap-2 p-2.5 rounded-2xl tactile-card backdrop-blur-md bg-[#FAF7F2]/95 border border-white/90 shadow-lg text-xs z-10 animate-in fade-in slide-in-from-bottom-2 duration-150 max-w-[calc(100%-32px)] sm:max-w-3xl">
          {/* Row 1: Types & Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex items-center gap-1.5 font-bold text-[#1A2E3B] pr-2 mr-1 border-r border-[#DCD6CA]">
              <Triangle className="w-3.5 h-3.5 text-[#DE7C5A]" />
              <span>Панелі ({model.faces.length} шт):</span>
            </div>

            {/* All types filter chip */}
            <button
              onClick={() => setFilterTriangleType(null)}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all ${
                filterTriangleType === null
                  ? "bg-[#1A2E3B] text-white shadow-2xs font-bold"
                  : "bg-white/80 hover:bg-white text-[#5A6778] border border-[#E8E2D8]"
              }`}
            >
              Всі ({model.faces.length})
            </button>

            {/* Chips for each unique triangle type */}
            {model.faceGroups.map((g, idx) => {
              const colorHex = SHEATHING_PALETTE[idx % SHEATHING_PALETTE.length];
              const isSelectedType = filterTriangleType === g.type;
              return (
                <button
                  key={g.type}
                  onClick={() => setFilterTriangleType(isSelectedType ? null : g.type)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] transition-all ${
                    isSelectedType
                      ? "bg-[#E1EDE3] text-[#1B4D2E] font-bold ring-2 ring-[#5B9279] shadow-2xs"
                      : "bg-white/80 hover:bg-white text-[#4A5568] border border-[#E8E2D8]"
                  }`}
                  title={`Показати тільки трикутники типу ${g.type} (${g.lengths.join("×")} мм)`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block border border-black/10 shrink-0"
                    style={{ backgroundColor: colorHex }}
                  />
                  <span className="font-mono font-bold">{g.type}</span>
                  <span className="text-[10px] text-[#8C9BAE]">({g.count} шт)</span>
                </button>
              );
            })}

            <div className="flex items-center gap-2 pl-2 ml-auto sm:border-l border-[#DCD6CA]">
              {/* Toggle Labels */}
              <button
                onClick={() => setShowTriangleLabels(!showTriangleLabels)}
                className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-medium transition-all ${
                  showTriangleLabels
                    ? "bg-[#DE7C5A] text-white font-bold shadow-2xs"
                    : "bg-white/80 hover:bg-white text-[#5A6778] border border-[#E8E2D8]"
                }`}
                title="Увімкнути/вимкнути 3D маркування типів на трикутниках обшивки"
              >
                <Tag className="w-3 h-3" />
                <span>Маркування {showTriangleLabels ? "Увімк." : "Вимк."}</span>
              </button>

              {/* Toggle Style: Colored vs Plywood */}
              <button
                onClick={() => setSheathingStyle(sheathingStyle === "colored" ? "plywood" : "colored")}
                className="px-2 py-1 rounded-xl text-[11px] font-medium bg-white/80 hover:bg-white text-[#5A6778] border border-[#E8E2D8] transition-all whitespace-nowrap"
                title="Перемкнути між кольоровими типами та текстурою фанери"
              >
                {sheathingStyle === "colored" ? "🎨 Кольори типів" : "🪵 Фанера/OSB"}
              </button>
            </div>
          </div>

          {/* Row 2: Plywood Thickness & Material Controls with 3D physical extrusion */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#E8E2D8] text-xs">
            <div className="flex items-center gap-1.5 font-bold text-[#8B5E34]">
              <Layers className="w-3.5 h-3.5 text-[#DE7C5A]" />
              <span>Товщина фанери:</span>
            </div>

            {/* Stepper & input */}
            <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-xl border border-[#DCD6CA] shadow-2xs">
              <button
                type="button"
                onClick={() => handleThicknessChange(plywoodThickness - (plywoodThickness <= 3 ? 0.5 : 1))}
                className="w-4 h-4 flex items-center justify-center font-bold text-[#5A6778] hover:text-[#1A2E3B] hover:bg-[#F0EBE1] rounded"
                title="Зменшити товщину на 1 мм"
              >
                -
              </button>
              <input
                type="number"
                min={0.5}
                max={50}
                step={plywoodThickness < 4 ? 0.5 : 1}
                value={plywoodThickness}
                onChange={e => handleThicknessChange(parseFloat(e.target.value) || 1)}
                className="w-12 text-xs font-mono font-bold text-center text-[#1A2E3B] outline-none"
                title="Введіть товщину фанери або обшивки у мм"
              />
              <span className="text-[10px] text-[#8C9BAE]">мм</span>
              <button
                type="button"
                onClick={() => handleThicknessChange(plywoodThickness + (plywoodThickness < 3 ? 0.5 : 1))}
                className="w-4 h-4 flex items-center justify-center font-bold text-[#5A6778] hover:text-[#1A2E3B] hover:bg-[#F0EBE1] rounded"
                title="Збільшити товщину на 1 мм"
              >
                +
              </button>
            </div>

            {/* Quick preset buttons */}
            <div className="flex items-center gap-1">
              {(model.parameters.diameter < 1000
                ? [1, 1.5, 2, 3, 4, 6]
                : [6, 9, 12, 15, 18, 21, 24]
              ).map(th => (
                <button
                  key={th}
                  type="button"
                  onClick={() => handleThicknessChange(th)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-semibold transition-all ${
                    plywoodThickness === th
                      ? "bg-[#8B5E34] text-white shadow-2xs font-bold"
                      : "bg-white/80 hover:bg-white text-[#5A6778] border border-[#E8E2D8]"
                  }`}
                  title={`Встановити товщину ${th} мм`}
                >
                  {th}
                </button>
              ))}
            </div>

            {/* Material selector */}
            <div className="flex items-center gap-1 ml-auto">
              <select
                value={plywoodMaterial}
                onChange={e => handleMaterialChange(e.target.value as any)}
                className="bg-white/90 border border-[#DCD6CA] text-[11px] font-medium text-[#1A2E3B] rounded-lg px-2 py-0.5 outline-none shadow-2xs cursor-pointer"
                title="Матеріал обшивки (впливає на питому щільність та розрахункову вагу)"
              >
                {PLYWOOD_MATERIALS.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.density} кг/м³)
                  </option>
                ))}
              </select>

              {/* Weight & volume badge */}
              {(() => {
                const totalAreaM2 = model.statistics?.domeSurfaceAreaM2 || 0;
                const totalVolM3 = (totalAreaM2 * plywoodThickness) / 1000;
                const currentDensity = PLYWOOD_MATERIALS.find(m => m.id === plywoodMaterial)?.density || 680;
                const totalWeightKg = Math.round(totalVolM3 * currentDensity);
                const loadPerM2 = ((currentDensity * plywoodThickness) / 1000).toFixed(1);

                return (
                  <span
                    className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-[#EAE2D5] text-[#5C3C1B] whitespace-nowrap"
                    title={`Загальний об'єм фанери: ${totalVolM3.toFixed(3)} м³, вага: ${totalWeightKg} кг, навантаження: ${loadPerM2} кг/м²`}
                  >
                    <span>{totalWeightKg < 1 ? `${(totalWeightKg * 1000).toFixed(0)} г` : `${totalWeightKg} кг`}</span>
                    <span className="text-[#8C9BAE]">({loadPerM2} кг/м²)</span>
                  </span>
                );
              })()}
            </div>
          </div>
        </div>
      ) : (
        /* Interactive Helper Overlay (Bottom-Left) */
        <div className="absolute bottom-4 left-4 px-3.5 py-2 rounded-xl tactile-card text-xs text-[#5A6778] backdrop-blur-md bg-[#FAF7F2]/90 border border-white/80 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <RotateCw className="w-3.5 h-3.5 text-[#5B9279]" />
            <span><b>Затисніть ліву кнопку миші</b> або проведіть пальцем для 3D обертання купола</span>
          </div>
          <span className="text-slate-300">|</span>
          <button
            onClick={() => setShowConnectors(!showConnectors)}
            className="text-[#4A7C9B] hover:underline font-semibold"
          >
            {showConnectors ? "Сховати конектори" : "Показати лучеві конектори"}
          </button>
        </div>
      )}

      {/* Selected Element Quick Strip (Bottom-Right) */}
      {(selectedNodeId !== null || selectedEdgeId !== null || selectedFaceId !== null) && (
        <div className="absolute bottom-4 right-4 px-4 py-2 rounded-2xl tactile-card-mint backdrop-blur-md border border-white/80 flex items-center gap-3 animate-in fade-in zoom-in-95 duration-200 z-10">
          <span className="text-xs font-semibold text-[#1A3E26]">
            {selectedNodeId !== null && `Обрано Вузол #${selectedNodeId}`}
            {selectedEdgeId !== null && (() => {
              const e = model.edges[selectedEdgeId];
              const cutL = e.cutLength || Math.round(e.length - model.connectorParams.hubDiameter);
              return `Обрано Балку #${selectedEdgeId} (${e?.type}) · До вузла: ${e?.length} мм · Обрізаний: ${cutL} мм`;
            })()}
            {selectedFaceId !== null && `Обрано Панель #${selectedFaceId} (Тип ${model.faces[selectedFaceId]?.type})`}
          </span>
          <button
            onClick={() => {
              onSelectNode(null);
              onSelectEdge(null);
              onSelectFace(null);
            }}
            className="text-xs font-bold text-[#8C9BAE] hover:text-[#1A3E26]"
          >
            ✕
          </button>
        </div>
      )}

      {/* AR Preview Modal */}
      <ARModal
        model={model}
        plywoodThickness={plywoodThickness}
        isOpen={isARModalOpen}
        onClose={() => setIsARModalOpen(false)}
      />
    </div>
  );
};
