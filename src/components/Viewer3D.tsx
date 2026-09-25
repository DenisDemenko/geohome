import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { DomeModel, NodeId, EdgeId, FaceId } from "../core/types";
import {
  Maximize2,
  RotateCw,
  Eye,
  Layers,
  Box,
  Compass,
  Sparkles
} from "lucide-react";

export type RenderMode = "beams" | "sheathing" | "glass" | "connectors" | "wireframe";

interface Viewer3DProps {
  model: DomeModel;
  selectedNodeId: NodeId | null;
  selectedEdgeId: EdgeId | null;
  selectedFaceId: FaceId | null;
  onSelectNode: (id: NodeId | null) => void;
  onSelectEdge: (id: EdgeId | null) => void;
  onSelectFace: (id: FaceId | null) => void;
  onChangeConnectorParams?: (params: any) => void;
}

export const Viewer3D: React.FC<Viewer3DProps> = ({
  model,
  selectedNodeId,
  selectedEdgeId,
  selectedFaceId,
  onSelectNode,
  onSelectEdge,
  onSelectFace,
  onChangeConnectorParams
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

    const camera = new THREE.PerspectiveCamera(45, width / height, 50, 200000);
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

        const minRadius = model.parameters.diameter * 0.5;
        const maxRadius = model.parameters.diameter * 6.0;
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
      const minRadius = model.parameters.diameter * 0.5;
      const maxRadius = model.parameters.diameter * 6.0;
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

    const nodeRadius = Math.max(30, model.parameters.diameter * 0.01);

    // 1. Render Beams
    if (renderMode === "beams" || renderMode === "wireframe" || renderMode === "glass") {
      for (const edge of model.edges) {
        const p1 = model.nodes[edge.start].position;
        const p2 = model.nodes[edge.end].position;

        const isSelected = selectedEdgeId === edge.id;
        const color = isSelected ? 0xff5533 : edge.color;

        if (renderMode === "beams") {
          // Render 3D struts TRIMMED by connector ring radius at each end!
          const vStart = new THREE.Vector3(p1.x, p1.y, p1.z);
          const vEnd = new THREE.Vector3(p2.x, p2.y, p2.z);
          const fullDir = new THREE.Vector3().subVectors(vEnd, vStart);
          const fullLen = fullDir.length();
          const dirNorm = fullDir.clone().normalize();

          // Cut-back by connector ring radius from node center
          const ringRadius = (model.connectorParams.hubDiameter || 140) / 2;
          const trimmedLen = Math.max(15, fullLen - ringRadius * 2);

          const strutRadius = Math.max(16, model.beamProfile.width * 0.35);

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
          const ringRadius = (model.connectorParams.hubDiameter || 140) / 2;
          const vStart = new THREE.Vector3(p1.x, p1.y, p1.z);
          const vEnd = new THREE.Vector3(p2.x, p2.y, p2.z);
          const dirNorm = new THREE.Vector3().subVectors(vEnd, vStart).normalize();
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

    // 2. Render Cladding Panels / Faces
    if (renderMode === "sheathing" || renderMode === "glass") {
      for (const face of model.faces) {
        const pA = model.nodes[face.a].position;
        const pB = model.nodes[face.b].position;
        const pC = model.nodes[face.c].position;

        const geom = new THREE.BufferGeometry();
        const vertices = new Float32Array([
          pA.x, pA.y, pA.z,
          pB.x, pB.y, pB.z,
          pC.x, pC.y, pC.z
        ]);
        geom.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        geom.computeVertexNormals();

        const isSelected = selectedFaceId === face.id;
        const fGroup = model.faceGroups.find(g => g.type === face.type);
        const faceColor = isSelected ? 0xff6644 : (fGroup ? fGroup.color : 0xe4eef5);

        let mat: THREE.Material;
        if (renderMode === "glass") {
          mat = new THREE.MeshPhysicalMaterial({
            color: 0x88c4e0,
            transmission: 0.75,
            opacity: 0.65,
            transparent: true,
            roughness: 0.15,
            ior: 1.5,
            side: THREE.DoubleSide
          });
        } else {
          mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(faceColor),
            roughness: 0.55,
            metalness: 0.05,
            side: THREE.DoubleSide
          });
        }

        const mesh = new THREE.Mesh(geom, mat);
        mesh.userData = { type: "face", faceId: face.id };
        group.add(mesh);

        // Edge contour for panel seams
        const edgesGeom = new THREE.EdgesGeometry(geom);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x5a6a7a,
          linewidth: 1
        });
        const wire = new THREE.LineSegments(edgesGeom, lineMat);
        group.add(wire);
      }
    }

    // 3. Render Thunder Domes Star/Ray Connectors (Лучеві конектори у 3D з початку)
    if (showConnectors || renderMode === "connectors") {
      const hubDiam = model.connectorParams.hubDiameter || 140;
      const hubR = Math.max(18, hubDiam / 2);
      const tabL = Math.max(25, model.connectorParams.tabLength || 95);
      const tabW = Math.max(16, model.connectorParams.tabWidth || 45);
      const thk = Math.max(3.5, model.connectorParams.thickness || 4);

      // Shared geometries for performance
      const hubGeom = new THREE.CylinderGeometry(hubR, hubR, thk, 24);
      const tabGeom = new THREE.BoxGeometry(tabW, thk, tabL);
      const boltGeom = new THREE.CylinderGeometry(tabW * 0.11, tabW * 0.11, thk * 1.5, 8);
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
        connGroup.position.copy(nodePos).addScaledVector(avgN, 3.5);

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
  }, [model, renderMode, selectedNodeId, selectedEdgeId, selectedFaceId, showConnectors]);

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
      <div className="absolute top-4 left-4 flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl tactile-card backdrop-blur-md bg-[#FAF7F2]/90 border border-white/80 shadow-md">
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
        >
          <Layers className="w-3.5 h-3.5 text-[#DE7C5A]" />
          <span>Обшивка</span>
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
                min={20}
                max={300}
                step={5}
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
              -{(model.connectorParams.hubDiameter / 2).toFixed(0)} мм/торец
            </span>
          </div>
        )}
      </div>

      {/* Camera & Orbit Tooling (Top-Right) */}
      <div className="absolute top-4 right-4 flex items-center gap-1.5 p-1.5 rounded-2xl tactile-card backdrop-blur-md bg-[#FAF7F2]/90 border border-white/80 shadow-md">
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

      {/* Interactive Helper Overlay (Bottom-Left) */}
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

      {/* Selected Element Quick Strip (Bottom-Right) */}
      {(selectedNodeId !== null || selectedEdgeId !== null || selectedFaceId !== null) && (
        <div className="absolute bottom-4 right-4 px-4 py-2 rounded-2xl tactile-card-mint backdrop-blur-md border border-white/80 flex items-center gap-3 animate-in fade-in zoom-in-95 duration-200">
          <span className="text-xs font-semibold text-[#1A3E26]">
            {selectedNodeId !== null && `Обрано Вузол #${selectedNodeId}`}
            {selectedEdgeId !== null && (() => {
              const e = model.edges[selectedEdgeId];
              const cutL = e.cutLength || Math.round(e.length - model.connectorParams.hubDiameter);
              return `Обрано Балку #${selectedEdgeId} (${e?.type}) · До вузла сходження: ${e?.length} мм · Обрізаний під конектор: ${cutL} мм`;
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
    </div>
  );
};
