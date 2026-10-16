import React, { useEffect, useRef, useState, useMemo } from "react";
import * as THREE from "three";
import {
  DomeModel,
  NodeId,
  EdgeId,
  FaceId,
  SheathingParams,
  WindowGlazingParams,
  DoorOpeningParams,
  SolarGlazingParams,
  InnerSheathingParams
} from "../core/types";
import { PLYWOOD_MATERIALS, DEFAULT_SHEATHING_PARAMS, extractSheathingPanels } from "../core/sheathing";
import {
  DEFAULT_WINDOW_PARAMS,
  GLAZING_OPTIONS,
  WINDOW_FRAME_OPTIONS,
  calculateWindowMetrics,
  getTopZenithOculusFaceIds,
  getPanoramicTierFaceIds,
  GlazingOption,
  WindowFrameOption
} from "../core/windows";
import {
  DEFAULT_DOOR_PARAMS,
  DEFAULT_SOLAR_PARAMS,
  DEFAULT_INNER_SHEATHING_PARAMS,
  calculateSolarGeneration,
  calculateRectangularDoorPortal,
  calculateDoorwayTriangulationAndPanels,
  getWindowNodes
} from "../core/conversions";
import {
  analyzeDomeSolar,
  DomeSolarAnalysis,
  getCardinalDirection
} from "../core/solarAnalysis";
import {
  AssemblyState,
  ASSEMBLY_STEPS,
  calculateAssemblyVisibility
} from "../core/assembly";
import { AssemblyControlBar } from "./AssemblyControlBar";
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
  Smartphone,
  Hammer,
  Sun,
  Check,
  CheckCircle2,
  Trash2,
  HelpCircle,
  Wand2,
  X,
  ChevronUp,
  ChevronDown,
  DoorOpen,
  Zap,
  Home,
  CircleDot,
  Disc,
  Scissors,
  Film,
  Camera,
  User,
  TreePine,
  Moon,
  Play,
  Pause,
  Square,
  Video,
  Download
} from "lucide-react";
import { ARModal } from "./ARModal";
import { VideoExportModal, AnimationType, VideoExportOptions } from "./VideoExportModal";

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

// In-memory cache for triangle and node label canvas textures
const triangleLabelTextureCache = new Map<string, THREE.Texture>();

function getNodeLabelTexture(
  label: string,
  isSelected: boolean,
  isBoundary: boolean,
  isSpecialNode = false
): THREE.Texture {
  const cacheKey = `node_${label}_${isSelected}_${isBoundary}_${isSpecialNode}`;
  if (triangleLabelTextureCache.has(cacheKey)) {
    return triangleLabelTextureCache.get(cacheKey)!;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 144;
  canvas.height = 60;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  // Background rounded capsule badge
  const bg = isSelected
    ? "#FF5722"
    : isSpecialNode
    ? "#D97706"
    : isBoundary
    ? "#C25E3E"
    : "#1E293B";
  const border = isSelected ? "#FFFFFF" : isSpecialNode ? "#FEF3C7" : "#CBD5E1";

  ctx.fillStyle = bg;
  const r = 16;
  const x = 3, y = 3, w = 138, h = 54;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Label text e.g. "AA1", "AA2", "AB3", "ДВ43"
  ctx.fillStyle = "#FFFFFF";
  const fontSize = label.length > 5 ? 22 : label.length > 4 ? 25 : 28;
  ctx.font = `bold ${fontSize}px "JetBrains Mono", system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 72, 30);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  triangleLabelTextureCache.set(cacheKey, texture);
  return texture;
}

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

function getWindowLabelTexture(
  label: string,
  isSelected: boolean
): THREE.Texture {
  const cacheKey = `window_${label}_${isSelected}`;
  if (triangleLabelTextureCache.has(cacheKey)) {
    return triangleLabelTextureCache.get(cacheKey)!;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = isSelected ? "#FFF3E0" : "#E0F2FE";
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = isSelected ? "#FF5722" : "#0284C7";
  ctx.lineWidth = 10;
  ctx.stroke();

  ctx.font = "32px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🪟", 64, 46);

  ctx.fillStyle = isSelected ? "#D9480F" : "#0369A1";
  const fontSize = label.length > 5 ? 20 : label.length > 3 ? 24 : 28;
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(label, 64, 88);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  triangleLabelTextureCache.set(cacheKey, texture);
  return texture;
}

function getFabricStripLabelTexture(
  seqIndex: number,
  faceType: string,
  isSelected: boolean
): THREE.Texture {
  const cacheKey = `fabric_${seqIndex}_${faceType}_${isSelected}`;
  if (triangleLabelTextureCache.has(cacheKey)) {
    return triangleLabelTextureCache.get(cacheKey)!;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = isSelected ? "#FEF3C7" : "#FFFBEB";
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = isSelected ? "#DC2626" : "#D97706";
  ctx.lineWidth = 10;
  ctx.stroke();

  ctx.fillStyle = isSelected ? "#B45309" : "#92400E";
  ctx.font = "bold 34px monospace, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`#${seqIndex}`, 64, 48);

  ctx.fillStyle = "#78350F";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.fillText(faceType || "Тент", 64, 88);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  triangleLabelTextureCache.set(cacheKey, texture);
  return texture;
}

function getDoorLabelTexture(
  label: string,
  isSelected: boolean,
  dimStr: string
): THREE.Texture {
  const cacheKey = `door_${label}_${isSelected}_${dimStr}`;
  if (triangleLabelTextureCache.has(cacheKey)) {
    return triangleLabelTextureCache.get(cacheKey)!;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = isSelected ? "#FEF3C7" : "#FFFBEB";
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = isSelected ? "#FF5722" : "#D97706";
  ctx.lineWidth = 10;
  ctx.stroke();

  ctx.font = "32px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🚪", 64, 46);

  ctx.fillStyle = isSelected ? "#B45309" : "#78350F";
  const fontSize = dimStr.length > 7 ? 16 : 19;
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillText(dimStr || label, 64, 88);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  triangleLabelTextureCache.set(cacheKey, texture);
  return texture;
}

function getSolarLabelTexture(
  label: string,
  isSelected: boolean,
  watts: number
): THREE.Texture {
  const cacheKey = `solar_${label}_${isSelected}_${watts}`;
  if (triangleLabelTextureCache.has(cacheKey)) {
    return triangleLabelTextureCache.get(cacheKey)!;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = isSelected ? "#EDE9FE" : "#1E1B4B";
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = isSelected ? "#FF5722" : "#7C3AED";
  ctx.lineWidth = 10;
  ctx.stroke();

  ctx.font = "32px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("⚡", 64, 46);

  ctx.fillStyle = isSelected ? "#5B21B6" : "#E0E7FF";
  ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
  ctx.fillText(`${watts} Вт`, 64, 88);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  triangleLabelTextureCache.set(cacheKey, texture);
  return texture;
}

function getSolarEfficiencyBadgeTexture(
  label: string,
  efficiencyPct: number,
  isOptimal: boolean,
  isSelected: boolean
): THREE.Texture {
  const cacheKey = `solar_eff_${label}_${Math.round(efficiencyPct)}_${isOptimal}_${isSelected}`;
  if (triangleLabelTextureCache.has(cacheKey)) {
    return triangleLabelTextureCache.get(cacheKey)!;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = isSelected
    ? "#FF5722"
    : isOptimal
    ? "#EA580C"
    : efficiencyPct >= 75
    ? "#D97706"
    : "#334155";
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = isOptimal ? "#FDE047" : efficiencyPct >= 75 ? "#FCD34D" : "#94A3B8";
  ctx.lineWidth = isOptimal ? 9 : 5;
  ctx.stroke();

  ctx.font = "28px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(isOptimal ? "🔥" : efficiencyPct >= 75 ? "☀️" : "⚡", 64, 44);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 21px system-ui, -apple-system, sans-serif";
  ctx.fillText(`${Math.round(efficiencyPct)}%`, 64, 88);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  triangleLabelTextureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Creates an architectural extruded clamping frame bar along an edge of the triangle face
 */
function createClampingFrameBar(
  v1: THREE.Vector3,
  v2: THREE.Vector3,
  pCen: THREE.Vector3,
  faceNormal: THREE.Vector3,
  baseOffset: number,
  frameW: number,
  frameH: number,
  mat: THREE.Material,
  trimEndOffset = 0
): THREE.Group {
  const barGroup = new THREE.Group();

  const fullDir = new THREE.Vector3().subVectors(v2, v1);
  const totalLen = fullDir.length();
  const dir = fullDir.clone().normalize();
  const safeTrim = Math.min(trimEndOffset, totalLen * 0.35);

  const startPt = v1.clone().addScaledVector(dir, safeTrim);
  const endPt = v2.clone().addScaledVector(dir, -safeTrim);

  const outer1 = startPt.clone().addScaledVector(faceNormal, baseOffset);
  const outer2 = endPt.clone().addScaledVector(faceNormal, baseOffset);

  let inward = new THREE.Vector3().crossVectors(faceNormal, dir).normalize();
  if (inward.dot(new THREE.Vector3().subVectors(pCen, startPt)) < 0) {
    inward.negate();
  }

  const inner1 = outer1.clone().addScaledVector(inward, frameW);
  const inner2 = outer2.clone().addScaledVector(inward, frameW);

  const topOuter1 = outer1.clone().addScaledVector(faceNormal, frameH);
  const topOuter2 = outer2.clone().addScaledVector(faceNormal, frameH);
  const topInner1 = inner1.clone().addScaledVector(faceNormal, frameH);
  const topInner2 = inner2.clone().addScaledVector(faceNormal, frameH);

  const geom = new THREE.BufferGeometry();
  const verts = new Float32Array([
    // Top face
    topOuter1.x, topOuter1.y, topOuter1.z,
    topOuter2.x, topOuter2.y, topOuter2.z,
    topInner2.x, topInner2.y, topInner2.z,
    topOuter1.x, topOuter1.y, topOuter1.z,
    topInner2.x, topInner2.y, topInner2.z,
    topInner1.x, topInner1.y, topInner1.z,

    // Inner slope face (facing glass)
    topInner1.x, topInner1.y, topInner1.z,
    topInner2.x, topInner2.y, topInner2.z,
    inner2.x, inner2.y, inner2.z,
    topInner1.x, topInner1.y, topInner1.z,
    inner2.x, inner2.y, inner2.z,
    inner1.x, inner1.y, inner1.z,

    // Outer side face (facing outside triangle)
    topOuter2.x, topOuter2.y, topOuter2.z,
    topOuter1.x, topOuter1.y, topOuter1.z,
    outer1.x, outer1.y, outer1.z,
    topOuter2.x, topOuter2.y, topOuter2.z,
    outer1.x, outer1.y, outer1.z,
    outer2.x, outer2.y, outer2.z
  ]);
  geom.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, mat);
  barGroup.add(mesh);

  // EPDM Gasket line (black rubber seal between frame and glass)
  const gasketGeom = new THREE.BufferGeometry().setFromPoints([inner1, inner2]);
  const gasketMat = new THREE.LineBasicMaterial({ color: 0x111111, linewidth: 2 });
  const gasketLine = new THREE.Line(gasketGeom, gasketMat);
  barGroup.add(gasketLine);

  // Stainless steel button head pressure plate screws along the bar
  const len = v1.distanceTo(v2);
  const boltCount = Math.max(2, Math.min(5, Math.floor(len / 400)));
  const boltMat = new THREE.MeshStandardMaterial({
    color: 0xDCE3EA,
    metalness: 0.9,
    roughness: 0.2
  });
  const boltRadius = Math.max(1.0, Math.min(4.5, frameW * 0.12));
  const boltHeight = Math.max(0.8, boltRadius * 0.7);
  const boltGeom = new THREE.CylinderGeometry(boltRadius, boltRadius, boltHeight, 8);

  for (let b = 1; b <= boltCount; b++) {
    const t = b / (boltCount + 1);
    const pOnBar = new THREE.Vector3().lerpVectors(topOuter1, topOuter2, t).addScaledVector(inward, frameW * 0.45);
    const bolt = new THREE.Mesh(boltGeom, boltMat);
    bolt.position.copy(pOnBar);
    bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), faceNormal);
    barGroup.add(bolt);
  }

  return barGroup;
}

/**
 * Stylized Architectural Silhouette Figure (1.80m / 1800mm tall)
 * Provides instant real-world human scale reference for geodesic domes
 */
function buildHumanFigure(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1E40AF, // Architectural deep cobalt
    roughness: 0.45,
    metalness: 0.15
  });

  // Base subtle ground shadow
  const shadowGeom = new THREE.CylinderGeometry(280, 280, 2, 24);
  shadowGeom.rotateX(Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x0F172A, transparent: true, opacity: 0.35 });
  const shadow = new THREE.Mesh(shadowGeom, shadowMat);
  shadow.position.z = 1;
  group.add(shadow);

  // Shoes / Feet
  const shoeGeom = new THREE.BoxGeometry(85, 160, 40);
  const shoeL = new THREE.Mesh(shoeGeom, mat);
  shoeL.position.set(-80, 0, 20);
  group.add(shoeL);
  const shoeR = new THREE.Mesh(shoeGeom, mat);
  shoeR.position.set(80, 0, 20);
  group.add(shoeR);

  // Legs
  const legGeom = new THREE.CylinderGeometry(50, 40, 850, 12);
  legGeom.rotateX(Math.PI / 2);
  const legL = new THREE.Mesh(legGeom, mat);
  legL.position.set(-80, 0, 460);
  group.add(legL);
  const legR = new THREE.Mesh(legGeom, mat);
  legR.position.set(80, 0, 460);
  group.add(legR);

  // Pelvis / Hips
  const pelvisGeom = new THREE.CylinderGeometry(145, 135, 190, 16);
  pelvisGeom.rotateX(Math.PI / 2);
  const pelvis = new THREE.Mesh(pelvisGeom, mat);
  pelvis.position.set(0, 0, 980);
  group.add(pelvis);

  // Torso / Chest
  const torsoGeom = new THREE.CylinderGeometry(175, 145, 430, 16);
  torsoGeom.rotateX(Math.PI / 2);
  const torso = new THREE.Mesh(torsoGeom, mat);
  torso.position.set(0, 0, 1290);
  group.add(torso);

  // Arms
  const armGeom = new THREE.CylinderGeometry(38, 32, 640, 10);
  armGeom.rotateX(Math.PI / 2);
  const armL = new THREE.Mesh(armGeom, mat);
  armL.position.set(-215, 0, 1180);
  group.add(armL);
  const armR = new THREE.Mesh(armGeom, mat);
  armR.position.set(215, 0, 1180);
  group.add(armR);

  // Neck
  const neckGeom = new THREE.CylinderGeometry(55, 60, 85, 12);
  neckGeom.rotateX(Math.PI / 2);
  const neck = new THREE.Mesh(neckGeom, mat);
  neck.position.set(0, 0, 1540);
  group.add(neck);

  // Head
  const headGeom = new THREE.SphereGeometry(105, 16, 16);
  const head = new THREE.Mesh(headGeom, mat);
  head.position.set(0, 0, 1690);
  group.add(head);

  // Height Badge billboard
  const badgeCanvas = document.createElement("canvas");
  badgeCanvas.width = 144;
  badgeCanvas.height = 54;
  const bCtx = badgeCanvas.getContext("2d");
  if (bCtx) {
    bCtx.fillStyle = "#1E293B";
    bCtx.beginPath();
    bCtx.roundRect(4, 4, 136, 46, 12);
    bCtx.fill();
    bCtx.strokeStyle = "#38BDF8";
    bCtx.lineWidth = 3;
    bCtx.stroke();
    bCtx.fillStyle = "#FFFFFF";
    bCtx.font = "bold 22px system-ui, -apple-system, sans-serif";
    bCtx.textAlign = "center";
    bCtx.textBaseline = "middle";
    bCtx.fillText("1.80 м", 72, 27);
  }
  const badgeTex = new THREE.CanvasTexture(badgeCanvas);
  const badgeMat = new THREE.SpriteMaterial({ map: badgeTex });
  const sprite = new THREE.Sprite(badgeMat);
  sprite.position.set(0, 0, 1920);
  sprite.scale.set(340, 128, 1);
  group.add(sprite);

  return group;
}

/**
 * Natural environment landscape: green lawn ground disc and decorative low-poly trees
 */
function buildNatureLandscape(diameter: number): THREE.Group {
  const group = new THREE.Group();
  const radius = Math.max(10000, diameter * 2.5);

  // Grass lawn circle
  const lawnGeom = new THREE.CircleGeometry(radius, 64);
  const lawnMat = new THREE.MeshStandardMaterial({
    color: 0x486b46,
    roughness: 0.92,
    metalness: 0.04
  });
  const lawn = new THREE.Mesh(lawnGeom, lawnMat);
  lawn.position.z = -2;
  lawn.receiveShadow = true;
  group.add(lawn);

  // Outer natural forest perimeter ring (slightly darker green)
  const ringGeom = new THREE.RingGeometry(radius * 0.75, radius * 1.3, 64);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x2e4a30,
    roughness: 0.95,
    metalness: 0.02
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.position.z = -1.8;
  group.add(ring);

  // Stylized decorative low-poly trees around perimeter
  const treeCount = 18;
  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2 + 0.15;
    const dist = radius * (0.85 + (i % 3) * 0.12);
    const treeX = Math.cos(angle) * dist;
    const treeY = Math.sin(angle) * dist;
    const treeH = diameter * (0.35 + ((i * 7) % 5) * 0.08);
    const treeR = diameter * 0.12;

    const coneGeom = new THREE.ConeGeometry(treeR, treeH, 7);
    coneGeom.rotateX(Math.PI / 2);
    const coneMat = new THREE.MeshStandardMaterial({
      color: i % 2 === 0 ? 0x244227 : 0x2e5232,
      roughness: 0.85,
      metalness: 0.05
    });
    const cone = new THREE.Mesh(coneGeom, coneMat);
    cone.position.set(treeX, treeY, treeH * 0.5);
    group.add(cone);
  }

  return group;
}

/**
 * Applies lighting, background color, and environment objects based on theme
 */
function applyEnvironmentTheme(
  theme: "studio" | "nature" | "sunset" | "night",
  scene: THREE.Scene,
  lights: {
    ambient: THREE.AmbientLight;
    dir1: THREE.DirectionalLight;
    dir2: THREE.DirectionalLight;
    interior: THREE.PointLight;
  },
  grid: THREE.GridHelper | null,
  natureGroup: THREE.Group | null
) {
  if (theme === "studio") {
    scene.background = new THREE.Color(0xf6f3ed);
    lights.ambient.color.setHex(0xffffff);
    lights.ambient.intensity = 0.85;
    lights.dir1.color.setHex(0xfff6ea);
    lights.dir1.intensity = 1.2;
    lights.dir1.position.set(15000, 25000, 20000);
    lights.dir2.color.setHex(0xdcebf5);
    lights.dir2.intensity = 0.6;
    lights.interior.intensity = 0;
    if (grid) grid.visible = true;
    if (natureGroup) natureGroup.visible = false;
  } else if (theme === "nature") {
    scene.background = new THREE.Color(0xbfe0f7); // Clear bright sky
    lights.ambient.color.setHex(0xdcf0d8);
    lights.ambient.intensity = 0.95;
    lights.dir1.color.setHex(0xfffae0);
    lights.dir1.intensity = 1.35;
    lights.dir1.position.set(22000, 30000, 28000);
    lights.dir2.color.setHex(0xbad7df);
    lights.dir2.intensity = 0.55;
    lights.interior.intensity = 0;
    if (grid) grid.visible = false;
    if (natureGroup) natureGroup.visible = true;
  } else if (theme === "sunset") {
    scene.background = new THREE.Color(0xd27552); // Sunset terracotta sky
    lights.ambient.color.setHex(0x5e3725);
    lights.ambient.intensity = 0.65;
    lights.dir1.color.setHex(0xffa149);
    lights.dir1.intensity = 1.8;
    lights.dir1.position.set(38000, 8000, 5000); // Low golden hour sun
    lights.dir2.color.setHex(0x6b3b5b);
    lights.dir2.intensity = 0.4;
    lights.interior.intensity = 0.8;
    if (grid) grid.visible = false;
    if (natureGroup) natureGroup.visible = true;
  } else if (theme === "night") {
    scene.background = new THREE.Color(0x0a0f1d); // Midnight navy
    lights.ambient.color.setHex(0x18243c);
    lights.ambient.intensity = 0.35;
    lights.dir1.color.setHex(0x829ec7);
    lights.dir1.intensity = 0.45;
    lights.dir1.position.set(-15000, 20000, 25000); // Cool moonlight
    lights.dir2.color.setHex(0x111b2b);
    lights.dir2.intensity = 0.2;
    lights.interior.intensity = 2.8; // Warm lantern inside the dome!
    if (grid) grid.visible = false;
    if (natureGroup) natureGroup.visible = true;
  }
}

/**
 * Draws professional title watermark and lower third on video canvas recording
 */
function drawTitleOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  model: DomeModel,
  stepTitle?: string
) {
  const pad = 20;
  const cardW = Math.min(width - pad * 2, 440);
  const cardH = stepTitle ? 80 : 64;
  const x = pad;
  const y = height - cardH - pad;

  ctx.save();
  // Glassmorphic dark card
  ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
  ctx.beginPath();
  ctx.roundRect(x, y, cardW, cardH, 14);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Color accent bar
  ctx.fillStyle = "#DE7C5A";
  ctx.beginPath();
  ctx.roundRect(x + 4, y + 4, 4, cardH - 8, 2);
  ctx.fill();

  // Title text
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 14px system-ui, -apple-system, sans-serif";
  ctx.fillText(
    `КуполГео · V${model.parameters.frequency} · Ø${(model.parameters.diameter / 1000).toFixed(1)}м`,
    x + 18,
    y + 22
  );

  // Subtitle / Specs
  const area = model.statistics?.floorAreaM2 || Math.round(Math.PI * Math.pow(model.parameters.diameter / 2000, 2) * 10) / 10;
  const beams = model.statistics?.edges || model.edges.length;
  const h = (model.parameters.height / 1000).toFixed(2);
  ctx.fillStyle = "#94A3B8";
  ctx.font = "11px system-ui, -apple-system, sans-serif";
  ctx.fillText(`Площа: ${area} м² | Балки: ${beams} шт | Висота: ${h} м`, x + 18, y + 40);

  if (stepTitle) {
    ctx.fillStyle = "#FDE68A";
    ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
    ctx.fillText(`▶ ${stepTitle}`, x + 18, y + 62);
  }

  // Top watermark
  ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
  ctx.beginPath();
  ctx.roundRect(width - 150 - pad, pad, 150, 30, 8);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "bold 11px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🌐 КУПОЛГЕО 3D", width - 75 - pad, pad + 19);

  ctx.restore();
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
  windowFaceIds?: number[];
  onToggleWindowFace?: (faceId: number) => void;
  onSetWindowFaceIds?: (faceIds: number[]) => void;
  windowParams?: WindowGlazingParams;
  onChangeWindowParams?: (params: WindowGlazingParams) => void;
  doorFaceIds?: number[];
  doorParams?: DoorOpeningParams;
  onToggleDoorway?: (faceId: number, width?: number, height?: number) => void;
  onChangeDoorParams?: (params: Partial<DoorOpeningParams>) => void;
  onClearDoorway?: () => void;
  solarFaceIds?: number[];
  solarParams?: SolarGlazingParams;
  onToggleSolarFace?: (faceId: number) => void;
  onSetSolarFaceIds?: (faceIds: number[]) => void;
  onChangeSolarParams?: (params: Partial<SolarGlazingParams>) => void;
  innerSheathingParams?: InnerSheathingParams;
  onChangeInnerSheathingParams?: (params: Partial<InnerSheathingParams>) => void;
  displayLayers?: Display3DLayers;
  onChangeDisplayLayers?: (updater: Display3DLayers | ((prev: Display3DLayers) => Display3DLayers)) => void;
  solarAnalysis?: DomeSolarAnalysis | null;
  fabricStripFaceIds?: number[];
  onToggleFabricStripFace?: (faceId: number) => void;
  onSetFabricStripFaceIds?: (faceIds: number[]) => void;
  onCopyWindowsToFabricStrip?: () => void;
  onClearFabricStrip?: () => void;
  onNavigateToSheathing?: () => void;
}

export interface Display3DLayers {
  showBeams: boolean;
  showConnectors: boolean;
  showOuterSheathing: boolean;
  showInnerSheathing: boolean;
  sheathingOpacity?: number;
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
  onChangeSheathingParams,
  windowFaceIds = [],
  onToggleWindowFace,
  onSetWindowFaceIds,
  windowParams = DEFAULT_WINDOW_PARAMS,
  onChangeWindowParams,
  doorFaceIds = [],
  doorParams = DEFAULT_DOOR_PARAMS,
  onToggleDoorway,
  onChangeDoorParams,
  onClearDoorway,
  solarFaceIds = [],
  solarParams = DEFAULT_SOLAR_PARAMS,
  onToggleSolarFace,
  onSetSolarFaceIds,
  onChangeSolarParams,
  innerSheathingParams,
  onChangeInnerSheathingParams,
  displayLayers,
  onChangeDisplayLayers,
  solarAnalysis: propSolarAnalysis,
  fabricStripFaceIds = [],
  onToggleFabricStripFace,
  onSetFabricStripFaceIds,
  onCopyWindowsToFabricStrip,
  onClearFabricStrip,
  onNavigateToSheathing
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const animFrameId = useRef<number | null>(null);

  // Sub-groups for instantaneous 0ms display layer toggling without scene reconstruction
  const beamsGroupRef = useRef<THREE.Group | null>(null);
  const connectorsGroupRef = useRef<THREE.Group | null>(null);
  const outerSheathingGroupRef = useRef<THREE.Group | null>(null);
  const innerSheathingGroupRef = useRef<THREE.Group | null>(null);
  const hitMeshesGroupRef = useRef<THREE.Group | null>(null);
  const nodeLabelsGroupRef = useRef<THREE.Group | null>(null);
  const triangleLabelsGroupRef = useRef<THREE.Group | null>(null);

  const [renderMode, setRenderMode] = useState<RenderMode>("beams");
  const [autoRotate, setAutoRotate] = useState(false);

  // Independent 3D Display Layers: Frame (struts), Connectors, Outer Sheathing, Inner Sheathing
  const [internalDisplayLayers, setInternalDisplayLayers] = useState<Display3DLayers>({
    showBeams: true,
    showConnectors: true,
    showOuterSheathing: false,
    showInnerSheathing: innerSheathingParams?.enabled || false,
    sheathingOpacity: 0.85
  });

  const activeLayers = displayLayers || internalDisplayLayers;
  const setLayers = (updater: Display3DLayers | ((prev: Display3DLayers) => Display3DLayers)) => {
    if (onChangeDisplayLayers) {
      onChangeDisplayLayers(updater);
    } else {
      setInternalDisplayLayers(updater);
    }
  };

  const showBeams = activeLayers.showBeams;
  const showConnectors = activeLayers.showConnectors;
  const showOuterSheathing = activeLayers.showOuterSheathing;
  const showInnerSheathing = activeLayers.showInnerSheathing;
  const sheathingOpacity = activeLayers.sheathingOpacity ?? 0.85;

  const [showTriangleLabels, setShowTriangleLabels] = useState(true);
  const [showNodeLabels, setShowNodeLabels] = useState(true);
  const [filterTriangleType, setFilterTriangleType] = useState<string | null>(null);
  const [sheathingStyle, setSheathingStyle] = useState<"colored" | "plywood">("colored");
  const [seamGapMm, setSeamGapMm] = useState<number>(() => {
    return sheathingParams?.seamGapMm ?? model.sheathingParams?.seamGapMm ?? 0;
  });
  const [isARModalOpen, setIsARModalOpen] = useState<boolean>(false);

  // Video Animation & Export Studio State
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);

  // Dedicated 360° Circular Orbit Flyaround State
  const [isOrbitActive, setIsOrbitActive] = useState<boolean>(false);
  const [isOrbitPlaying, setIsOrbitPlaying] = useState<boolean>(false);
  const [orbitSpeed, setOrbitSpeed] = useState<number>(1); // 0.5, 1, 2
  const [orbitDirection, setOrbitDirection] = useState<1 | -1>(1); // 1 = clockwise, -1 = counter-clockwise
  const [orbitAltitude, setOrbitAltitude] = useState<"medium" | "low" | "high" | "wave">("medium");
  const [orbitRecordDuration, setOrbitRecordDuration] = useState<number>(10);
  const [currentOrbitAngleDeg, setCurrentOrbitAngleDeg] = useState<number>(0);

  const isOrbitActiveRef = useRef<boolean>(false);
  const isOrbitPlayingRef = useRef<boolean>(false);
  const orbitSpeedRef = useRef<number>(1);
  const orbitDirectionRef = useRef<1 | -1>(1);
  const orbitAltitudeRef = useRef<"medium" | "low" | "high" | "wave">("medium");

  useEffect(() => {
    isOrbitActiveRef.current = isOrbitActive;
  }, [isOrbitActive]);
  useEffect(() => {
    isOrbitPlayingRef.current = isOrbitPlaying;
  }, [isOrbitPlaying]);
  useEffect(() => {
    orbitSpeedRef.current = orbitSpeed;
  }, [orbitSpeed]);
  useEffect(() => {
    orbitDirectionRef.current = orbitDirection;
  }, [orbitDirection]);
  useEffect(() => {
    orbitAltitudeRef.current = orbitAltitude;
  }, [orbitAltitude]);

  // Exploded View (Вибух-схема) State
  const [explodedProgress, setExplodedProgress] = useState(0);
  const [isExplodedActive, setIsExplodedActive] = useState(false);
  const [isExplodedPlaying, setIsExplodedPlaying] = useState(false);

  // Architectural Human Scale Silhouette (1.80m)
  const [showHumanScale, setShowHumanScale] = useState(false);

  // Environment Lighting & Sky Theme: "studio" | "nature" | "sunset" | "night"
  const [environmentTheme, setEnvironmentTheme] = useState<"studio" | "nature" | "sunset" | "night">("studio");

  // Auxiliary refs for recording and 3D objects
  const recordingStateRef = useRef<{
    options: VideoExportOptions;
    startTime: number;
    startTheta: number;
    startPhi: number;
    mr: MediaRecorder;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingCanvasRef = useRef<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } | null>(null);

  const humanGroupRef = useRef<THREE.Group | null>(null);
  const natureGroupRef = useRef<THREE.Group | null>(null);
  const interiorLightRef = useRef<THREE.PointLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const dirLight1Ref = useRef<THREE.DirectionalLight | null>(null);
  const dirLight2Ref = useRef<THREE.DirectionalLight | null>(null);

  // Sync sheathing params from props
  useEffect(() => {
    if (sheathingParams?.seamGapMm !== undefined) {
      setSeamGapMm(sheathingParams.seamGapMm);
    }
    if (sheathingParams?.thickness !== undefined) {
      setPlywoodThickness(sheathingParams.thickness);
    }
    if (sheathingParams?.material !== undefined) {
      setPlywoodMaterial(sheathingParams.material);
    }
  }, [sheathingParams?.seamGapMm, sheathingParams?.thickness, sheathingParams?.material]);

  // Handlers to toggle 3D layers
  const handleToggleBeams = () => {
    setLayers(prev => ({ ...prev, showBeams: !prev.showBeams }));
  };

  const handleToggleConnectors = () => {
    setLayers(prev => ({ ...prev, showConnectors: !prev.showConnectors }));
  };

  const handleToggleOuterSheathing = () => {
    setLayers(prev => ({ ...prev, showOuterSheathing: !prev.showOuterSheathing }));
  };

  const handleToggleInnerSheathing = () => {
    setLayers(prev => ({ ...prev, showInnerSheathing: !prev.showInnerSheathing }));
  };

  const handleToggleAllLayers = () => {
    const allActive = showBeams && showConnectors && showOuterSheathing && showInnerSheathing;
    if (allActive) {
      // Toggle back to default: frame + connectors
      setLayers(prev => ({
        ...prev,
        showBeams: true,
        showConnectors: true,
        showOuterSheathing: false,
        showInnerSheathing: false
      }));
    } else {
      // Enable all 4 layers together!
      setLayers(prev => ({
        ...prev,
        showBeams: true,
        showConnectors: true,
        showOuterSheathing: true,
        showInnerSheathing: true,
        sheathingOpacity: 0.85
      }));
    }
  };

  // Active Conversion Tool Mode: "none" | "window" | "door" | "solar" | "fabric_strip"
  const [conversionMode, setConversionMode] = useState<"none" | "window" | "door" | "solar" | "fabric_strip">("none");
  const windowMode = conversionMode === "window";
  const setWindowMode = (val: boolean) => setConversionMode(val ? "window" : "none");

  // Responsive UI state: keep 3D viewport visible on mobile by minimizing floating panels
  const [isFaceHudMinimized, setIsFaceHudMinimized] = useState<boolean>(() => {
    return typeof window !== "undefined" ? window.innerWidth < 768 : false;
  });
  const [isSheathingBarCollapsed, setIsSheathingBarCollapsed] = useState<boolean>(() => {
    return typeof window !== "undefined" ? window.innerWidth < 768 : false;
  });

  const activeWindowFaceIds = useMemo(() => {
    return windowFaceIds && windowFaceIds.length > 0
      ? windowFaceIds
      : (model.windowFaceIds || []);
  }, [windowFaceIds, model.windowFaceIds]);

  const activeDoorFaceIds = useMemo(() => {
    return doorFaceIds && doorFaceIds.length > 0
      ? doorFaceIds
      : (model.doorFaceIds || []);
  }, [doorFaceIds, model.doorFaceIds]);

  const activeSolarFaceIds = useMemo(() => {
    return solarFaceIds && solarFaceIds.length > 0
      ? solarFaceIds
      : (model.solarFaceIds || []);
  }, [solarFaceIds, model.solarFaceIds]);

  const activeFabricStripFaceIds = useMemo(() => {
    return fabricStripFaceIds && fabricStripFaceIds.length > 0
      ? fabricStripFaceIds
      : (model.fabricStripFaceIds || []);
  }, [fabricStripFaceIds, model.fabricStripFaceIds]);

  // Real-time solar orientation and insolation efficiency analysis
  const solarAnalysis = useMemo(() => {
    if (propSolarAnalysis) return propSolarAnalysis;
    return analyzeDomeSolar(model, {
      domeAzimuthDeg: solarParams?.domeOrientationDeg ?? 0,
      latitudeDeg: solarParams?.latitudeDeg ?? 49.0,
      peakPowerPerM2: solarParams?.peakPowerPerM2 ?? 210
    });
  }, [propSolarAnalysis, model, solarParams?.domeOrientationDeg, solarParams?.latitudeDeg, solarParams?.peakPowerPerM2]);

  // Current electrical generation for all active solar faces
  const solarGen = useMemo(() => {
    return calculateSolarGeneration({
      ...model,
      solarFaceIds: activeSolarFaceIds,
      solarParams
    });
  }, [model, activeSolarFaceIds, solarParams]);

  const totalProjectPanelsCount = useMemo(() => {
    return extractSheathingPanels(model).length;
  }, [model]);

  const doorInfillPanelsCount = useMemo(() => {
    if (!activeDoorFaceIds || activeDoorFaceIds.length === 0) return 0;
    const baseDomePanelsCount = model.faces.length - activeDoorFaceIds.length - (model.windowFaceIds?.length || 0) - (model.solarFaceIds?.length || 0);
    return Math.max(0, totalProjectPanelsCount - baseDomePanelsCount);
  }, [model, totalProjectPanelsCount, activeDoorFaceIds]);

  const conversionModeRef = useRef(conversionMode);
  conversionModeRef.current = conversionMode;

  const onToggleWindowFaceRef = useRef(onToggleWindowFace);
  onToggleWindowFaceRef.current = onToggleWindowFace;

  const onToggleDoorwayRef = useRef(onToggleDoorway);
  onToggleDoorwayRef.current = onToggleDoorway;

  const onToggleSolarFaceRef = useRef(onToggleSolarFace);
  onToggleSolarFaceRef.current = onToggleSolarFace;

  const onToggleFabricStripFaceRef = useRef(onToggleFabricStripFace);
  onToggleFabricStripFaceRef.current = onToggleFabricStripFace;

  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const touchStartTime = useRef<number>(0);

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

  // 3D Step-by-Step Assembly Animation State
  const [assemblyState, setAssemblyState] = useState<AssemblyState>({
    isActive: false,
    step: 1,
    progress: 1.0,
    isPlaying: false,
    speed: 1
  });

  // Calculate visible elements according to assembly progress
  const assemblyVisibility = useMemo(() => {
    return calculateAssemblyVisibility(model, assemblyState.progress, assemblyState.isActive);
  }, [model, assemblyState.progress, assemblyState.isActive]);

  // Assembly animation loop ticker
  useEffect(() => {
    if (!assemblyState.isPlaying) return;
    let lastTime = performance.now();
    let reqId: number;

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Rate: ~10 seconds for 100% assembly at 1x speed
      const rate = 0.10 * assemblyState.speed;
      setAssemblyState(prev => {
        let nextP = prev.progress + rate * dt;
        let nextStep = prev.step;
        for (const s of ASSEMBLY_STEPS) {
          if (nextP >= s.targetProgress - 0.08) nextStep = s.step;
        }
        if (nextP >= 1.0) {
          return { ...prev, progress: 1.0, step: 6, isPlaying: false };
        }
        return { ...prev, progress: nextP, step: nextStep };
      });

      reqId = requestAnimationFrame(tick);
    };

    reqId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(reqId);
  }, [assemblyState.isPlaying, assemblyState.speed]);

  const handleSetAssemblyStep = (stepNumber: number) => {
    const found = ASSEMBLY_STEPS.find(s => s.step === stepNumber);
    if (!found) return;
    setAssemblyState(prev => ({
      ...prev,
      isActive: true,
      step: stepNumber,
      progress: found.targetProgress,
      isPlaying: false
    }));
  };

  const handleToggleAssemblyMode = () => {
    setAssemblyState(prev => {
      const willBeActive = !prev.isActive;
      return {
        ...prev,
        isActive: willBeActive,
        progress: willBeActive ? 0.15 : 1.0,
        step: willBeActive ? 1 : 6,
        isPlaying: false
      };
    });
  };

  // Keep state synchronized with props
  useEffect(() => {
    if (sheathingParams?.thickness !== undefined) {
      setPlywoodThickness(sheathingParams.thickness);
    }
    if (sheathingParams?.material) {
      setPlywoodMaterial(sheathingParams.material);
    }
    if (sheathingParams?.seamGapMm !== undefined) {
      setSeamGapMm(sheathingParams.seamGapMm);
    }
  }, [sheathingParams?.thickness, sheathingParams?.material, sheathingParams?.seamGapMm]);

  const handleThicknessChange = (newThickness: number) => {
    const val = Math.max(0.5, Math.min(60, Number(newThickness.toFixed(1))));
    setPlywoodThickness(val);
    if (onChangeSheathingParams) {
      const foundMat = PLYWOOD_MATERIALS.find(m => m.id === plywoodMaterial);
      onChangeSheathingParams({
        ...(sheathingParams || DEFAULT_SHEATHING_PARAMS),
        thickness: val,
        material: plywoodMaterial,
        density: foundMat?.density || 680,
        seamGapMm
      });
    }
  };

  const handleSeamGapChange = (newGap: number) => {
    const val = Math.max(0, Math.min(10, Number(newGap.toFixed(1))));
    setSeamGapMm(val);
    if (onChangeSheathingParams) {
      const foundMat = PLYWOOD_MATERIALS.find(m => m.id === plywoodMaterial);
      onChangeSheathingParams({
        ...(sheathingParams || DEFAULT_SHEATHING_PARAMS),
        thickness: plywoodThickness,
        material: plywoodMaterial,
        density: foundMat?.density || 680,
        seamGapMm: val
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
        density: foundMat?.density || 680,
        seamGapMm
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
  const touchMidPos = useRef<{ x: number; y: number } | null>(null);
  const wasTwoFinger = useRef(false);

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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.touchAction = "none";
    rendererRef.current = renderer;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Set initial camera distance based on dome radius
    const domeR = model.parameters.diameter / 2;
    cameraSpherical.current.radius = domeR * 3.2;
    targetCenter.current.set(0, 0, model.parameters.height * 0.45);

    // Soft Studio Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const dirLight1 = new THREE.DirectionalLight(0xfff6ea, 1.2);
    dirLight1.position.set(15000, 25000, 20000);
    dirLight1.castShadow = true;
    scene.add(dirLight1);
    dirLight1Ref.current = dirLight1;

    const dirLight2 = new THREE.DirectionalLight(0xdcebf5, 0.6);
    dirLight2.position.set(-15000, -15000, 10000);
    scene.add(dirLight2);
    dirLight2Ref.current = dirLight2;

    // Warm Interior Point Light (active in night/sunset mode)
    const interiorLight = new THREE.PointLight(0xF59E0B, 0, model.parameters.diameter * 2.5);
    interiorLight.position.set(0, 0, model.parameters.height * 0.45);
    scene.add(interiorLight);
    interiorLightRef.current = interiorLight;

    // Subtle ground grid
    const groundGrid = new THREE.GridHelper(model.parameters.diameter * 2.2, 30, 0xcdc5b6, 0xe4ded3);
    groundGrid.rotation.x = Math.PI / 2; // Lie on XY ground
    groundGrid.position.z = -1;
    scene.add(groundGrid);
    gridHelperRef.current = groundGrid;

    // Human Scale Silhouette Figure (1.80m tall)
    const humanGroup = buildHumanFigure();
    humanGroup.position.set(domeR * 1.15, -domeR * 0.25, 0);
    humanGroup.rotation.z = Math.PI * 0.6;
    humanGroup.visible = showHumanScale;
    scene.add(humanGroup);
    humanGroupRef.current = humanGroup;

    // Nature Environment Landscape (Lawn disc & stylized trees)
    const natureGroup = buildNatureLandscape(model.parameters.diameter);
    natureGroup.visible = environmentTheme !== "studio";
    scene.add(natureGroup);
    natureGroupRef.current = natureGroup;

    const group = new THREE.Group();
    scene.add(group);
    groupRef.current = group;

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
      // Button 0: Left mouse button -> Rotate view around dome
      // Button 1: Middle mouse button (wheel press) -> Pan / move dome in all directions!
      // Button 2: Right mouse button -> Pan / move dome in all directions
      if (e.button === 0) {
        isDraggingRef.current = true;
      } else if (e.button === 1 || e.button === 2) {
        e.preventDefault();
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
        const canvasH = dom.clientHeight || 500;
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
      isDraggingRef.current = false;
      isPanningRef.current = false;
    };

    // Touch support for mobile / tablets: 1-finger rotate, 2-finger pan & pinch zoom
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        const t = e.touches[0];
        pointerDownPos.current = { x: t.clientX, y: t.clientY };
        prevMousePos.current = { x: t.clientX, y: t.clientY };
        touchStartPos.current = { x: t.clientX, y: t.clientY };
        touchStartTime.current = performance.now();
        dragDistanceRef.current = 0;
      } else if (e.touches.length >= 2) {
        if (e.cancelable) e.preventDefault();
        isDraggingRef.current = false;
        wasTwoFinger.current = true;
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
      // Prevent browser zoom / page scrolling while interacting with the 3D canvas
      if (e.cancelable) {
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
      } else if (e.touches.length >= 2) {
        wasTwoFinger.current = true;
        isDraggingRef.current = false;
        const t0 = e.touches[0];
        const t1 = e.touches[1];

        // Ensure touch tracking is defensively initialized even if touches landed sequentially
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

          const minRadius = Math.max(10, model.parameters.diameter * 0.2);
          const maxRadius = Math.max(200, model.parameters.diameter * 8.0);
          cameraSpherical.current.radius = Math.max(
            minRadius,
            Math.min(maxRadius, cameraSpherical.current.radius * zoomDelta)
          );
        }

        // 2. Two-Finger Pan / Translate 3D Scene Across Screen
        const currentMidX = (t0.clientX + t1.clientX) / 2;
        const currentMidY = (t0.clientY + t1.clientY) / 2;
        const panDx = currentMidX - touchMidPos.current.x;
        const panDy = currentMidY - touchMidPos.current.y;
        touchMidPos.current = { x: currentMidX, y: currentMidY };

        if (cameraRef.current && (Math.abs(panDx) > 0.001 || Math.abs(panDy) > 0.001)) {
          const canvasH = dom.clientHeight || 500;
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
        const dt = performance.now() - touchStartTime.current;
        // If single tap on mobile screen (minimal drag distance, duration < 450ms, and not a two-finger gesture)
        if (!wasTwoFinger.current && dragDistanceRef.current < 12 && dt < 450 && touchStartPos.current) {
          performRaycast(touchStartPos.current.x, touchStartPos.current.y);
        }
        isDraggingRef.current = false;
        touchStartDist.current = null;
        touchMidPos.current = null;
        touchStartPos.current = null;
        wasTwoFinger.current = false;
      } else if (e.touches.length === 1) {
        // Transition from 2 fingers to 1 finger smoothly without jumping
        touchStartDist.current = null;
        touchMidPos.current = null;
        isDraggingRef.current = true;
        const t = e.touches[0];
        prevMousePos.current = { x: t.clientX, y: t.clientY };
      }
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

    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener("mousedown", handleMouseDown);
    dom.addEventListener("auxclick", handleAuxClick);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    dom.addEventListener("touchstart", handleTouchStart, { passive: false });
    dom.addEventListener("touchmove", handleTouchMove, { passive: false });
    dom.addEventListener("touchend", handleTouchEnd, { passive: false });
    dom.addEventListener("touchcancel", handleTouchEnd, { passive: false });
    dom.addEventListener("wheel", handleWheel, { passive: false });
    dom.addEventListener("contextmenu", e => e.preventDefault());

    // Raycast on click or tap to select node/beam/face
    const performRaycast = (clientX: number, clientY: number) => {
      const rect = dom.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      raycaster.params.Line = { threshold: model.parameters.diameter * 0.015 };

      if (!groupRef.current) return;
      const intersects = raycaster.intersectObjects(groupRef.current.children, true);

      if (intersects.length > 0) {
        const first = intersects[0].object;

        // 1. If clicked directly on a structural node/connector, ALWAYS select the node/connector!
        // The connector MUST NEVER be converted into a window, door, or sheathing!
        if (first.userData?.nodeId !== undefined) {
          onSelectNode(first.userData.nodeId);
          onSelectEdge(null);
          onSelectFace(null);
          return;
        }

        // 2. If an active conversion mode is on ("window", "door", "solar"), prioritize face hits to allow instant conversion
        if (conversionModeRef.current !== "none") {
          const faceHit = intersects.find(hit => hit.object.userData?.faceId !== undefined);
          if (faceHit && faceHit.object.userData?.faceId !== undefined) {
            const fid = faceHit.object.userData.faceId;
            onSelectFace(fid);
            onSelectNode(null);
            onSelectEdge(null);
            if (conversionModeRef.current === "window" && onToggleWindowFaceRef.current) {
              onToggleWindowFaceRef.current(fid);
            } else if (conversionModeRef.current === "door" && onToggleDoorwayRef.current) {
              onToggleDoorwayRef.current(fid);
            } else if (conversionModeRef.current === "solar" && onToggleSolarFaceRef.current) {
              onToggleSolarFaceRef.current(fid);
            } else if (conversionModeRef.current === "fabric_strip" && onToggleFabricStripFaceRef.current) {
              onToggleFabricStripFaceRef.current(fid);
            }
            return;
          }
        }

        // 3. Normal selection priority: node -> edge -> face
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
          const fid = first.userData.faceId;
          onSelectFace(fid);
          onSelectNode(null);
          onSelectEdge(null);
          if (conversionModeRef.current === "window" && onToggleWindowFaceRef.current) {
            onToggleWindowFaceRef.current(fid);
          } else if (conversionModeRef.current === "door" && onToggleDoorwayRef.current) {
            onToggleDoorwayRef.current(fid);
          } else if (conversionModeRef.current === "solar" && onToggleSolarFaceRef.current) {
            onToggleSolarFaceRef.current(fid);
          } else if (conversionModeRef.current === "fabric_strip" && onToggleFabricStripFaceRef.current) {
            onToggleFabricStripFaceRef.current(fid);
          }
          return;
        }
      }
    };

    const handleCanvasClick = (e: MouseEvent) => {
      // If the user rotated the model (dragged more than 6px), do not trigger element selection
      if (dragDistanceRef.current > 6) {
        return;
      }
      performRaycast(e.clientX, e.clientY);
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

      // Active video recording driver (highest priority)
      if (recordingStateRef.current && rendererRef.current && cameraRef.current) {
        const { options, startTime, startTheta, startPhi, mr } = recordingStateRef.current;
        const elapsed = (performance.now() - startTime) / 1000;
        const progress = Math.min(1.0, elapsed / Math.max(1, options.durationSeconds));

        setRecordingProgress(progress * 100);

        let currentStepTitle: string | undefined;

        if (options.type === "orbit_360") {
          // Dynamic 360° circular orbit respecting selected rotation direction and altitude preset
          cameraSpherical.current.theta = startTheta + progress * Math.PI * 2 * orbitDirectionRef.current;
          const alt = orbitAltitudeRef.current;
          if (alt === "low") {
            cameraSpherical.current.phi = Math.PI * 0.46;
          } else if (alt === "high") {
            cameraSpherical.current.phi = Math.PI * 0.22;
          } else if (alt === "wave") {
            cameraSpherical.current.phi = Math.PI * 0.35 + Math.sin(progress * Math.PI * 2) * 0.12;
          } else {
            cameraSpherical.current.phi = Math.PI * 0.36;
          }
          updateCamera();
        } else if (options.type === "assembly_timelapse") {
          const stepIdx = Math.min(ASSEMBLY_STEPS.length - 1, Math.floor(progress * ASSEMBLY_STEPS.length));
          const stepNum = ASSEMBLY_STEPS[stepIdx].step;
          currentStepTitle = ASSEMBLY_STEPS[stepIdx].name;
          handleSetAssemblyStep(stepNum);
          cameraSpherical.current.theta += 0.006;
          updateCamera();
        } else if (options.type === "exploded_view") {
          // Smooth radial oscillation 0 -> 1 -> 0
          const exp = Math.sin(progress * Math.PI);
          setExplodedProgress(exp);
          cameraSpherical.current.theta += 0.005;
          updateCamera();
        } else if (options.type === "sun_path") {
          if (dirLight1Ref.current) {
            const sunAngle = progress * Math.PI;
            dirLight1Ref.current.position.set(
              Math.cos(sunAngle) * 35000,
              Math.sin(sunAngle) * 35000,
              Math.max(5000, Math.sin(sunAngle) * 25000)
            );
          }
          cameraSpherical.current.theta += 0.003;
          updateCamera();
        }

        // Live calculation of orbit degrees for radar
        const rad = ((cameraSpherical.current.theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        setCurrentOrbitAngleDeg(Math.round((rad / (Math.PI * 2)) * 360));

        renderer.render(scene, camera);

        // Frame capture to recording canvas
        if (recordingCanvasRef.current) {
          const { ctx, canvas } = recordingCanvasRef.current;
          if (ctx) {
            ctx.drawImage(renderer.domElement, 0, 0);
            if (options.includeTitleOverlay) {
              drawTitleOverlay(ctx, canvas.width, canvas.height, model, currentStepTitle);
            }
          }
        }

        if (progress >= 1.0) {
          if (mr.state === "recording") {
            mr.stop();
          }
          recordingStateRef.current = null;
          recordingCanvasRef.current = null;
        }
        return;
      } else if (isOrbitActiveRef.current && isOrbitPlayingRef.current && !isDraggingRef.current) {
        // Dedicated 360° Circular Orbit Flyaround
        const step = 0.005 * orbitSpeedRef.current * orbitDirectionRef.current;
        cameraSpherical.current.theta += step;

        const alt = orbitAltitudeRef.current;
        if (alt === "low") {
          cameraSpherical.current.phi = THREE.MathUtils.lerp(cameraSpherical.current.phi, Math.PI * 0.46, 0.06);
        } else if (alt === "high") {
          cameraSpherical.current.phi = THREE.MathUtils.lerp(cameraSpherical.current.phi, Math.PI * 0.22, 0.06);
        } else if (alt === "wave") {
          const wavePhi = Math.PI * 0.35 + Math.sin(cameraSpherical.current.theta * 2) * 0.12;
          cameraSpherical.current.phi = THREE.MathUtils.lerp(cameraSpherical.current.phi, wavePhi, 0.06);
        } else {
          cameraSpherical.current.phi = THREE.MathUtils.lerp(cameraSpherical.current.phi, Math.PI * 0.36, 0.06);
        }

        updateCamera();

        const rad = ((cameraSpherical.current.theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        setCurrentOrbitAngleDeg(Math.round((rad / (Math.PI * 2)) * 360));
      } else if (autoRotateRef.current && !isDraggingRef.current) {
        cameraSpherical.current.theta += 0.004;
        updateCamera();
        const rad = ((cameraSpherical.current.theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        setCurrentOrbitAngleDeg(Math.round((rad / (Math.PI * 2)) * 360));
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (animFrameId.current) cancelAnimationFrame(animFrameId.current);
      resizeObserver.disconnect();
      dom.removeEventListener("mousedown", handleMouseDown);
      dom.removeEventListener("auxclick", handleAuxClick);
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

    // Dispose previous scene objects to prevent GPU memory leaks and WebGL stalls
    const disposeObject = (obj: THREE.Object3D) => {
      if ((obj as any).geometry) {
        (obj as any).geometry.dispose();
      }
      if ((obj as any).material) {
        const mat = (obj as any).material;
        if (Array.isArray(mat)) {
          mat.forEach(m => {
            if (m && typeof m.dispose === "function") m.dispose();
          });
        } else if (mat && typeof mat.dispose === "function") {
          mat.dispose();
        }
      }
    };
    group.traverse(disposeObject);
    group.clear();

    const beamsGroup = new THREE.Group();
    const connectorsGroup = new THREE.Group();
    const outerSheathingGroup = new THREE.Group();
    const innerSheathingGroup = new THREE.Group();
    const hitMeshesGroup = new THREE.Group();
    const windowsDoorsGroup = new THREE.Group();
    const nodeLabelsGroup = new THREE.Group();
    const triangleLabelsGroup = new THREE.Group();

    beamsGroupRef.current = beamsGroup;
    connectorsGroupRef.current = connectorsGroup;
    outerSheathingGroupRef.current = outerSheathingGroup;
    innerSheathingGroupRef.current = innerSheathingGroup;
    hitMeshesGroupRef.current = hitMeshesGroup;
    nodeLabelsGroupRef.current = nodeLabelsGroup;
    triangleLabelsGroupRef.current = triangleLabelsGroup;

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

    // 0. Render 3D Concrete Foundation and Anchor Studs
    if (assemblyVisibility.showFoundation) {
      const baseNodes = model.nodes.filter(n => n.boundary || Math.abs(n.position.z) < 15);
      if (baseNodes.length >= 3) {
        const sorted = [...baseNodes].sort((a, b) => {
          return Math.atan2(a.position.y, a.position.x) - Math.atan2(b.position.y, b.position.x);
        });

        const outerR = (model.parameters.diameter / 2) + Math.max(15, model.parameters.diameter * 0.025);
        const innerR = Math.max(10, (model.parameters.diameter / 2) - Math.max(15, model.parameters.diameter * 0.025));
        const stripDepth = Math.max(10, model.parameters.diameter * 0.035);

        // Concrete ring shape
        const shape = new THREE.Shape();
        sorted.forEach((n, idx) => {
          const a = Math.atan2(n.position.y, n.position.x);
          const x = Math.cos(a) * outerR;
          const y = Math.sin(a) * outerR;
          if (idx === 0) shape.moveTo(x, y);
          else shape.lineTo(x, y);
        });
        shape.closePath();

        const hole = new THREE.Path();
        sorted.forEach((n, idx) => {
          const a = Math.atan2(n.position.y, n.position.x);
          const x = Math.cos(a) * innerR;
          const y = Math.sin(a) * innerR;
          if (idx === 0) hole.moveTo(x, y);
          else hole.lineTo(x, y);
        });
        hole.closePath();
        shape.holes.push(hole);

        const concreteGeom = new THREE.ExtrudeGeometry(shape, {
          depth: stripDepth,
          bevelEnabled: true,
          bevelSegments: 2,
          steps: 1,
          bevelSize: Math.max(2, stripDepth * 0.05),
          bevelThickness: Math.max(2, stripDepth * 0.05)
        });

        const concreteMat = new THREE.MeshStandardMaterial({
          color: 0xD3CCC1,
          roughness: 0.92,
          metalness: 0.05
        });

        const concreteMesh = new THREE.Mesh(concreteGeom, concreteMat);
        concreteMesh.position.z = -stripDepth;
        concreteMesh.castShadow = true;
        concreteMesh.receiveShadow = true;
        beamsGroup.add(concreteMesh);

        // Embedded Steel Anchor Plates & Studs
        const plateSize = Math.max(8, model.parameters.diameter * 0.02);
        const plateGeom = new THREE.BoxGeometry(plateSize, plateSize, Math.max(2, plateSize * 0.1));
        const studGeom = new THREE.CylinderGeometry(
          Math.max(0.6, plateSize * 0.06),
          Math.max(0.6, plateSize * 0.06),
          Math.max(4, plateSize * 0.5),
          8
        );
        const anchorSteelMat = new THREE.MeshStandardMaterial({
          color: 0x475569,
          metalness: 0.85,
          roughness: 0.25
        });

        sorted.forEach(n => {
          const a = Math.atan2(n.position.y, n.position.x);
          const plate = new THREE.Mesh(plateGeom, anchorSteelMat);
          plate.position.set(n.position.x, n.position.y, Math.max(1, plateSize * 0.05));
          plate.rotation.z = a;
          beamsGroup.add(plate);

          const s1 = new THREE.Mesh(studGeom, anchorSteelMat);
          s1.position.set(
            n.position.x - plateSize * 0.22 * Math.sin(a),
            n.position.y + plateSize * 0.22 * Math.cos(a),
            plateSize * 0.25
          );
          s1.rotation.x = Math.PI / 2;
          beamsGroup.add(s1);

          const s2 = new THREE.Mesh(studGeom, anchorSteelMat);
          s2.position.set(
            n.position.x + plateSize * 0.22 * Math.sin(a),
            n.position.y - plateSize * 0.22 * Math.cos(a),
            plateSize * 0.25
          );
          s2.rotation.x = Math.PI / 2;
          beamsGroup.add(s2);
        });

        // Survey Layout Axes from Apex Projection to Base Anchors (Етап 1: Розбивка осей)
        if (assemblyVisibility.showSurveyAxes) {
          const centerPinGeom = new THREE.CylinderGeometry(
            Math.max(1.2, plateSize * 0.18),
            Math.max(1.2, plateSize * 0.18),
            Math.max(6, plateSize * 0.8),
            16
          );
          const centerPinMat = new THREE.MeshStandardMaterial({
            color: 0xDDA843,
            metalness: 0.8,
            roughness: 0.2
          });
          const centerPin = new THREE.Mesh(centerPinGeom, centerPinMat);
          centerPin.position.set(0, 0, plateSize * 0.4);
          centerPin.rotation.x = Math.PI / 2;
          beamsGroup.add(centerPin);

          // Plumb line from Apex (0, 0, height) to center base (0, 0, 0)
          const plumbPoints = [
            new THREE.Vector3(0, 0, model.parameters.height),
            new THREE.Vector3(0, 0, 0)
          ];
          const plumbGeom = new THREE.BufferGeometry().setFromPoints(plumbPoints);
          const plumbMat = new THREE.LineDashedMaterial({
            color: 0xDDA843,
            dashSize: Math.max(15, model.parameters.diameter * 0.025),
            gapSize: Math.max(10, model.parameters.diameter * 0.015),
            linewidth: 2
          });
          const plumbLine = new THREE.Line(plumbGeom, plumbMat);
          plumbLine.computeLineDistances();
          beamsGroup.add(plumbLine);

          // Radial surveying axes from center projection (0,0) to each foundation anchor node
          const axisMat = new THREE.LineDashedMaterial({
            color: 0x5B9279,
            dashSize: Math.max(15, model.parameters.diameter * 0.025),
            gapSize: Math.max(10, model.parameters.diameter * 0.015),
            linewidth: 2
          });

          sorted.forEach(n => {
            const rayPoints = [
              new THREE.Vector3(0, 0, 1.5),
              new THREE.Vector3(n.position.x, n.position.y, 1.5)
            ];
            const rayGeom = new THREE.BufferGeometry().setFromPoints(rayPoints);
            const rayLine = new THREE.Line(rayGeom, axisMat);
            rayLine.computeLineDistances();
            beamsGroup.add(rayLine);
          });
        }
      }
    }

    // Layer display conditions: independent control of beams, connectors, outer sheathing, inner sheathing, or all together
    const shouldRenderBeams =
      showBeams ||
      renderMode === "beams" ||
      renderMode === "hybrid" ||
      renderMode === "wireframe" ||
      assemblyState.isActive;

    const shouldRenderConnectors =
      showConnectors ||
      renderMode === "connectors" ||
      renderMode === "hybrid";

    const shouldRenderOuterSheathing =
      showOuterSheathing ||
      renderMode === "sheathing" ||
      renderMode === "hybrid" ||
      renderMode === "glass" ||
      (assemblyState.isActive && assemblyVisibility.visibleFaceIds.size > 0);

    const shouldRenderInnerSheathing =
      showInnerSheathing ||
      (innerSheathingParams?.enabled ?? false);

    // 1. Render Beams
    if (shouldRenderBeams) {
      const beamMatCache = new Map<string, THREE.MeshStandardMaterial>();
      const getBeamStrutMat = (col: string | number, isMetal: boolean): THREE.MeshStandardMaterial => {
        const key = `${col}_${isMetal}`;
        let m = beamMatCache.get(key);
        if (!m) {
          m = new THREE.MeshStandardMaterial({
            color: new THREE.Color(col),
            roughness: isMetal ? 0.35 : 0.55,
            metalness: isMetal ? 0.8 : 0.05
          });
          beamMatCache.set(key, m);
        }
        return m;
      };

      const beamLineCache = new Map<string, THREE.LineBasicMaterial>();
      const getBeamLineMat = (col: string | number, isSel: boolean): THREE.LineBasicMaterial => {
        const key = `${col}_${isSel}`;
        let m = beamLineCache.get(key);
        if (!m) {
          m = new THREE.LineBasicMaterial({
            color: new THREE.Color(col),
            linewidth: isSel ? 4 : 2
          });
          beamLineCache.set(key, m);
        }
        return m;
      };

      for (const edge of model.edges) {
        if (assemblyState.isActive && !assemblyVisibility.visibleEdgeIds.has(edge.id)) {
          continue;
        }

        const isNewTier = assemblyState.isActive && assemblyVisibility.activeTierEdgeIds.has(edge.id);
        const p1 = model.nodes[edge.start].position;
        const p2 = model.nodes[edge.end].position;

        const isSelected = selectedEdgeId === edge.id;
        const color = isSelected ? 0xff5533 : (isNewTier ? 0xF59E0B : edge.color);

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
          const isRound = model.beamProfile.type === "circular" || model.beamProfile.type === "pipe";
          const maxAllowedStrutRadius = fullLen * 0.18;
          const beamDiam = model.beamProfile.diameter || model.beamProfile.width || 20;

          const isMetal = model.beamProfile.material === "steel" || model.beamProfile.material === "aluminum";
          const strutMat = getBeamStrutMat(color, isMetal);

          const mid = new THREE.Vector3().addVectors(vStart, vEnd).multiplyScalar(0.5);

          if (isRound) {
            // Smooth circular cross-section cylinder (1 - 50 mm)
            const strutRadius = Math.max(0.4, Math.min(maxAllowedStrutRadius, beamDiam / 2));
            const strutGeom = new THREE.CylinderGeometry(
              strutRadius,
              strutRadius,
              trimmedLen,
              24
            );
            const mesh = new THREE.Mesh(strutGeom, strutMat);
            mesh.position.copy(mid);
            mesh.quaternion.setFromUnitVectors(
              new THREE.Vector3(0, 1, 0),
              dirNorm
            );
            mesh.userData = { type: "beam", edgeId: edge.id };
            beamsGroup.add(mesh);
          } else {
            // True rectangular timber beam cross-section (width x depth)
            const strutW = Math.max(1, Math.min(fullLen * 0.25, model.beamProfile.width || 50));
            const strutD = Math.max(1, Math.min(fullLen * 0.35, model.beamProfile.depth || 150));
            const strutGeom = new THREE.BoxGeometry(strutW, strutD, trimmedLen);
            const mesh = new THREE.Mesh(strutGeom, strutMat);
            mesh.position.copy(mid);

            // Align Z axis with beam direction (dirNorm)
            // Align Y axis radially outward from dome center
            const radial = mid.clone().normalize();
            let yAxis = radial.clone().sub(dirNorm.clone().multiplyScalar(radial.dot(dirNorm))).normalize();
            if (yAxis.lengthSq() < 0.001) {
              yAxis = new THREE.Vector3(0, 0, 1).sub(dirNorm.clone().multiplyScalar(dirNorm.z)).normalize();
            }
            const xAxis = new THREE.Vector3().crossVectors(yAxis, dirNorm).normalize();
            const rotMat = new THREE.Matrix4().makeBasis(xAxis, yAxis, dirNorm);
            mesh.quaternion.setFromRotationMatrix(rotMat);
            mesh.userData = { type: "beam", edgeId: edge.id };
            beamsGroup.add(mesh);
          }
        } else {
          // Line wireframe trimmed by ring radius
          const pStartTrimmed = vStart.clone().addScaledVector(dirNorm, ringRadius);
          const pEndTrimmed = vEnd.clone().addScaledVector(dirNorm, -ringRadius);

          const geom = new THREE.BufferGeometry().setFromPoints([
            pStartTrimmed,
            pEndTrimmed
          ]);
          const mat = getBeamLineMat(color, isSelected);
          const line = new THREE.Line(geom, mat);
          line.userData = { type: "beam", edgeId: edge.id };
          beamsGroup.add(line);
        }
      }
    }

    // 2. Render Cladding Panels & Overlaid Windows on Frame Faces (Обшивка та накладені вікна на каркас)
    const hasWindows = activeWindowFaceIds.length > 0;
    const shouldRenderFaces = true; // Always construct sub-groups for 0ms layer toggling

    if (shouldRenderFaces) {
      const isMultiLayer = (shouldRenderOuterSheathing && (shouldRenderBeams || shouldRenderConnectors)) || (renderMode as string) === "hybrid" || assemblyState.isActive || (renderMode === "beams" && hasWindows);
      const isHybrid = isMultiLayer;
      const isGlass = renderMode === "glass" && !assemblyState.isActive;
      const groupIndexMap = new Map<string, number>();
      model.faceGroups.forEach((g, i) => groupIndexMap.set(g.type, i));

      const glazing = GLAZING_OPTIONS[windowParams?.glazingType || "double_glass"] || GLAZING_OPTIONS.double_glass;
      const frameOption = WINDOW_FRAME_OPTIONS[windowParams?.frameColor || "anthracite"] || WINDOW_FRAME_OPTIONS.anthracite;

      // Shared materials & caches for fast face rendering without WebGL shader compilation lag
      const sheathingMatCache = new Map<string, THREE.Material>();
      const getSheathingMat = (colorHex: string, roughness: number, metalness: number, isTransp: boolean, opacity: number): THREE.Material => {
        const key = `${colorHex}_${roughness}_${metalness}_${isTransp}_${opacity.toFixed(2)}`;
        let m = sheathingMatCache.get(key);
        if (!m) {
          m = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colorHex),
            roughness,
            metalness,
            transparent: isTransp,
            opacity,
            side: THREE.DoubleSide
          });
          sheathingMatCache.set(key, m);
        }
        return m;
      };

      const sheathingEdgeMatCache = new Map<string, THREE.Material>();
      const getSheathingEdgeMat = (sideColor: string, isTransp: boolean, opacity: number): THREE.Material => {
        const key = `${sideColor}_${isTransp}_${opacity.toFixed(2)}`;
        let m = sheathingEdgeMatCache.get(key);
        if (!m) {
          m = new THREE.MeshStandardMaterial({
            color: new THREE.Color(sideColor),
            roughness: 0.85,
            metalness: 0.02,
            transparent: isTransp,
            opacity,
            side: THREE.DoubleSide
          });
          sheathingEdgeMatCache.set(key, m);
        }
        return m;
      };

      const borderLineMatCache = new Map<string, THREE.LineBasicMaterial>();
      const getBorderLineMat = (color: number, linewidth: number, isDimmed: boolean, opacity: number): THREE.LineBasicMaterial => {
        const key = `${color}_${linewidth}_${isDimmed}_${opacity.toFixed(2)}`;
        let m = borderLineMatCache.get(key);
        if (!m) {
          m = new THREE.LineBasicMaterial({
            color,
            linewidth,
            transparent: isDimmed,
            opacity
          });
          borderLineMatCache.set(key, m);
        }
        return m;
      };

      const previewMatCache = new Map<string, THREE.MeshBasicMaterial>();
      const getPreviewMat = (color: string | number, opacity: number): THREE.MeshBasicMaterial => {
        const key = `${color}_${opacity.toFixed(2)}`;
        let m = previewMatCache.get(key);
        if (!m) {
          m = new THREE.MeshBasicMaterial({
            color,
            opacity,
            transparent: true,
            side: THREE.DoubleSide
          });
          previewMatCache.set(key, m);
        }
        return m;
      };

      const spriteMatCache = new Map<string, THREE.SpriteMaterial>();
      const getOrCreateSpriteMat = (tex: THREE.Texture, cacheKey: string): THREE.SpriteMaterial => {
        let sm = spriteMatCache.get(cacheKey);
        if (!sm) {
          sm = new THREE.SpriteMaterial({
            map: tex,
            depthTest: true,
            depthWrite: false,
            transparent: true
          });
          spriteMatCache.set(cacheKey, sm);
        }
        return sm;
      };

      const sharedInvisibleHitMat = new THREE.MeshBasicMaterial({ visible: false });

      // Shared inner sheathing materials (drywall, chipboard, OSB, plywood)
      const innerMatConfig = innerSheathingParams?.material || "drywall";
      let innerColor = 0xF3F4F6;
      if (innerMatConfig === "chipboard") innerColor = 0xD8B896;
      else if (innerMatConfig === "osb3") innerColor = 0xCE9E64;
      else if (innerMatConfig === "plywood_fk") innerColor = 0xE6C291;

      const sharedInnerMat = new THREE.MeshStandardMaterial({
        color: innerColor,
        roughness: innerMatConfig === "drywall" ? 0.95 : 0.7,
        metalness: 0.04,
        side: THREE.DoubleSide
      });

      const sharedInnerBorderMat = new THREE.LineBasicMaterial({
        color: 0x94A3B8,
        linewidth: 1.5,
        transparent: true,
        opacity: 0.65
      });

      for (const face of model.faces) {
        if (assemblyState.isActive && !assemblyVisibility.visibleFaceIds.has(face.id)) {
          continue;
        }

        const isNewPanelTier = assemblyState.isActive && assemblyVisibility.activeTierFaceIds.has(face.id);
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

        // Physical outward offset: outer sheathing is positioned on the EXTERIOR faces of the frame struts
        const effBeamDepth = (model.beamProfile.type === "circular" || model.beamProfile.type === "pipe")
          ? (model.beamProfile.diameter || model.beamProfile.width)
          : model.beamProfile.depth;
        const outwardOffset = Math.max(1, (effBeamDepth / 2) + 1.2 + (model.sheathingParams?.offsetMm || 0));

        const avgSide = (vA.distanceTo(vB) + vB.distanceTo(vC) + vC.distanceTo(vA)) / 3;

        // CHECK IF THIS TRIANGLE FACE IS CONVERTED TO A DOOR, SOLAR, OR WINDOW
        const isDoor = activeDoorFaceIds.includes(face.id);
        const isSolar = activeSolarFaceIds.includes(face.id);
        const isWindow = activeWindowFaceIds.includes(face.id);

        if (isDoor) {
          // --- DOORWAY OPENING BAY (Sheathing cut open for rectangular walk-through entrance) ---
          // Subtle interactive boundary so user can click to inspect/configure doorway
          const portalHitGeom = new THREE.BufferGeometry().setFromPoints([vA, vB, vC]);
          portalHitGeom.computeVertexNormals();
          const portalHitMat = new THREE.MeshBasicMaterial({
            color: isSelected ? 0xFF5722 : 0xD97706,
            opacity: isSelected ? 0.35 : 0.08,
            transparent: true,
            side: THREE.DoubleSide
          });
          const portalHitMesh = new THREE.Mesh(portalHitGeom, portalHitMat);
          portalHitMesh.position.addScaledVector(faceNormal, outwardOffset);
          portalHitMesh.userData = { type: "face", faceId: face.id, isDoor: true };
          windowsDoorsGroup.add(portalHitMesh);

          // Inset dashed border line indicating doorway cut boundary on the triangle
          const outlineGeom = new THREE.BufferGeometry().setFromPoints([vA, vB, vC, vA]);
          const outlineMat = new THREE.LineDashedMaterial({
            color: isSelected ? 0xFF5722 : 0xD97706,
            dashSize: 40,
            gapSize: 20,
            linewidth: 2
          });
          const outlineLine = new THREE.Line(outlineGeom, outlineMat);
          outlineLine.computeLineDistances();
          outlineLine.position.addScaledVector(faceNormal, outwardOffset + 1);
          outlineLine.userData = { type: "face", faceId: face.id, isDoor: true };
          windowsDoorsGroup.add(outlineLine);

          continue; // Finish door face rendering (Rectangular portal rendered below)
        }

        if (isSolar) {
          // --- PHOTOVOLTAIC BIPV SOLAR PANEL UNDER GLASS ---
          const hubRadius = Math.max(2, (model.connectorParams.hubDiameter || 140) / 2);
          const ringRadius = Math.min(hubRadius + 4, avgSide * 0.25);
          const solarThick = Math.max(2.5, Math.min(18, avgSide * 0.015));
          const solarOffset = outwardOffset + 0.8;
          const sShrink = 0.982;
          const sA = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vA, pCen), sShrink).addScaledVector(faceNormal, solarOffset);
          const sB = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vB, pCen), sShrink).addScaledVector(faceNormal, solarOffset);
          const sC = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vC, pCen), sShrink).addScaledVector(faceNormal, solarOffset);

          const sA_out = sA.clone().addScaledVector(faceNormal, solarThick);
          const sB_out = sB.clone().addScaledVector(faceNormal, solarThick);
          const sC_out = sC.clone().addScaledVector(faceNormal, solarThick);

          const solarGeom = new THREE.BufferGeometry().setFromPoints([sA_out, sB_out, sC_out]);
          solarGeom.computeVertexNormals();
          const solarMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(isSelected ? "#FFF3E0" : "#0F172A"),
            emissive: new THREE.Color(isSelected ? "#7C3AED" : "#0A192F"),
            roughness: 0.12,
            metalness: 0.7,
            clearcoat: 1.0,
            clearcoatRoughness: 0.04,
            reflectivity: 0.9,
            side: THREE.DoubleSide
          });
          const solarMesh = new THREE.Mesh(solarGeom, solarMat);
          solarMesh.userData = { type: "face", faceId: face.id, isSolar: true };
          windowsDoorsGroup.add(solarMesh);

          // Clamping frame around solar panel (trimmed before connector hub)
          const frameW = Math.max(2.5, Math.min(48, avgSide * 0.045));
          const frameH = Math.max(2.2, solarThick + 3);
          const sFrameMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(isSelected ? "#FF5722" : "#1E293B"),
            metalness: 0.85,
            roughness: 0.25,
            side: THREE.DoubleSide
          });
          const sBarAB = createClampingFrameBar(vA, vB, pCen, faceNormal, outwardOffset, frameW, frameH, sFrameMat, ringRadius);
          const sBarBC = createClampingFrameBar(vB, vC, pCen, faceNormal, outwardOffset, frameW, frameH, sFrameMat, ringRadius);
          const sBarCA = createClampingFrameBar(vC, vA, pCen, faceNormal, outwardOffset, frameW, frameH, sFrameMat, ringRadius);
          sBarAB.userData = { type: "face", faceId: face.id, isSolar: true };
          sBarBC.userData = { type: "face", faceId: face.id, isSolar: true };
          sBarCA.userData = { type: "face", faceId: face.id, isSolar: true };
          windowsDoorsGroup.add(sBarAB);
          windowsDoorsGroup.add(sBarBC);
          windowsDoorsGroup.add(sBarCA);

          // Solar centroid badge
          if (showTriangleLabels) {
            const watts = Math.round((face.area / 1_000_000) * (solarParams?.peakPowerPerM2 || 210));
            const labelTex = getSolarLabelTexture(`S${face.id}`, isSelected, watts);
            const spriteMat = new THREE.SpriteMaterial({
              map: labelTex,
              depthTest: true,
              depthWrite: false,
              transparent: true
            });
            const sprite = new THREE.Sprite(spriteMat);
            const spriteScale = Math.max(10, Math.min(200, avgSide * 0.22));
            sprite.scale.set(spriteScale, spriteScale, 1);
            sprite.position.copy(pCen).addScaledVector(faceNormal, outwardOffset + frameH + 2);
            sprite.userData = { type: "face", faceId: face.id, isSolar: true };
            triangleLabelsGroup.add(sprite);
          }
          continue; // Finish solar face rendering
        }

        if (isWindow) {
          // --- ARCHITECTURAL WINDOW OVERLAID ON FRAME FACE ---
          const hubRadius = Math.max(2, (model.connectorParams.hubDiameter || 140) / 2);
          const ringRadius = Math.min(hubRadius + 4, avgSide * 0.25);
          const glassThick = Math.max(1.8, Math.min(24, avgSide * 0.015));
          const glassOffset = outwardOffset + 0.8;
          const inwardOffset = -((effBeamDepth / 2) + 1.2);

          // Glass pane vertices slightly inset for thermal expansion and seal gasket
          const gShrink = 0.982;
          const gA = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vA, pCen), gShrink).addScaledVector(faceNormal, glassOffset);
          const gB = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vB, pCen), gShrink).addScaledVector(faceNormal, glassOffset);
          const gC = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vC, pCen), gShrink).addScaledVector(faceNormal, glassOffset);

          const gA_out = gA.clone().addScaledVector(faceNormal, glassThick);
          const gB_out = gB.clone().addScaledVector(faceNormal, glassThick);
          const gC_out = gC.clone().addScaledVector(faceNormal, glassThick);

          const glassGeom = new THREE.BufferGeometry();
          const glassVerts = new Float32Array([
            // 1. Top face (outer glass)
            gA_out.x, gA_out.y, gA_out.z,
            gB_out.x, gB_out.y, gB_out.z,
            gC_out.x, gC_out.y, gC_out.z,

            // 2. Bottom face (inner glass)
            gA.x, gA.y, gA.z,
            gC.x, gC.y, gC.z,
            gB.x, gB.y, gB.z,

            // 3. Edge AB
            gA.x, gA.y, gA.z,
            gB.x, gB.y, gB.z,
            gB_out.x, gB_out.y, gB_out.z,
            gA.x, gA.y, gA.z,
            gB_out.x, gB_out.y, gB_out.z,
            gA_out.x, gA_out.y, gA_out.z,

            // 4. Edge BC
            gB.x, gB.y, gB.z,
            gC.x, gC.y, gC.z,
            gC_out.x, gC_out.y, gC_out.z,
            gB.x, gB.y, gB.z,
            gC_out.x, gC_out.y, gC_out.z,
            gB_out.x, gB_out.y, gB_out.z,

            // 5. Edge CA
            gC.x, gC.y, gC.z,
            gA.x, gA.y, gA.z,
            gA_out.x, gA_out.y, gA_out.z,
            gC.x, gC.y, gC.z,
            gA_out.x, gA_out.y, gA_out.z,
            gC_out.x, gC_out.y, gC_out.z
          ]);
          glassGeom.setAttribute("position", new THREE.BufferAttribute(glassVerts, 3));
          glassGeom.computeVertexNormals();

          const glassMat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(isSelected ? "#FFF3E0" : glazing.tintColorHex),
            transmission: glazing.transmission || 0.88,
            opacity: 0.92,
            transparent: true,
            roughness: glazing.roughness || 0.08,
            metalness: 0.05,
            ior: 1.52,
            reflectivity: 0.85,
            clearcoat: 1.0,
            clearcoatRoughness: 0.04,
            side: THREE.DoubleSide
          });
          const glassMesh = new THREE.Mesh(glassGeom, glassMat);
          glassMesh.userData = { type: "face", faceId: face.id, isWindow: true };
          windowsDoorsGroup.add(glassMesh);

          // Clamping Frame along the 3 perimeter edges on top of frame struts
          // Inset ends so they NEVER touch, cover or convert the connector hub!
          const frameW = Math.max(2.5, Math.min(48, avgSide * 0.045));
          const frameH = Math.max(2.2, glassThick + 4);
          const frameMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(isSelected ? "#FF5722" : frameOption.colorHex),
            metalness: frameOption.metalness,
            roughness: frameOption.roughness,
            side: THREE.DoubleSide
          });

          // 3 Extruded clamping bars (trimmed cleanly before node connector)
          const barAB = createClampingFrameBar(vA, vB, pCen, faceNormal, outwardOffset, frameW, frameH, frameMat, ringRadius);
          const barBC = createClampingFrameBar(vB, vC, pCen, faceNormal, outwardOffset, frameW, frameH, frameMat, ringRadius);
          const barCA = createClampingFrameBar(vC, vA, pCen, faceNormal, outwardOffset, frameW, frameH, frameMat, ringRadius);
          barAB.userData = { type: "face", faceId: face.id, isWindow: true };
          barBC.userData = { type: "face", faceId: face.id, isWindow: true };
          barCA.userData = { type: "face", faceId: face.id, isWindow: true };
          windowsDoorsGroup.add(barAB);
          windowsDoorsGroup.add(barBC);
          windowsDoorsGroup.add(barCA);

          // --- SYNCHRONIZED INNER SHEATHING CONVERSION INTO WINDOW ---
          // When outer triangle is converted to window, inner sheathing automatically converts into a window opening too!
          // It forms the interior window reveal (відкоси) through the beam depth, plus interior trim!
          const inShrink = 0.985;
          const ipA = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vA, pCen), inShrink).addScaledVector(faceNormal, inwardOffset);
          const ipB = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vB, pCen), inShrink).addScaledVector(faceNormal, inwardOffset);
          const ipC = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vC, pCen), inShrink).addScaledVector(faceNormal, inwardOffset);

          // Interior reveal jambs (відкоси між зовнішнім склом та внутрішньою обшивкою)
          const revealMat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0xFF5722 : 0xEDF2F7, // Clean bright interior window reveal
            roughness: 0.75,
            metalness: 0.05,
            side: THREE.DoubleSide
          });
          const revealVerts = new Float32Array([
            // Quad AB
            gA.x, gA.y, gA.z,  gB.x, gB.y, gB.z,  ipB.x, ipB.y, ipB.z,
            gA.x, gA.y, gA.z,  ipB.x, ipB.y, ipB.z,  ipA.x, ipA.y, ipA.z,
            // Quad BC
            gB.x, gB.y, gB.z,  gC.x, gC.y, gC.z,  ipC.x, ipC.y, ipC.z,
            gB.x, gB.y, gB.z,  ipC.x, ipC.y, ipC.z,  ipB.x, ipB.y, ipB.z,
            // Quad CA
            gC.x, gC.y, gC.z,  gA.x, gA.y, gA.z,  ipA.x, ipA.y, ipA.z,
            gC.x, gC.y, gC.z,  ipA.x, ipA.y, ipA.z,  ipC.x, ipC.y, ipC.z
          ]);
          const revealGeom = new THREE.BufferGeometry();
          revealGeom.setAttribute("position", new THREE.BufferAttribute(revealVerts, 3));
          revealGeom.computeVertexNormals();
          const revealMesh = new THREE.Mesh(revealGeom, revealMat);
          revealMesh.userData = { type: "face", faceId: face.id, isWindow: true };
          windowsDoorsGroup.add(revealMesh);

          // Interior trim frame along inner sheathing plane
          const inBarAB = createClampingFrameBar(ipA, ipB, pCen, faceNormal.clone().negate(), 0, frameW * 0.85, 8, revealMat, ringRadius);
          const inBarBC = createClampingFrameBar(ipB, ipC, pCen, faceNormal.clone().negate(), 0, frameW * 0.85, 8, revealMat, ringRadius);
          const inBarCA = createClampingFrameBar(ipC, ipA, pCen, faceNormal.clone().negate(), 0, frameW * 0.85, 8, revealMat, ringRadius);
          inBarAB.userData = { type: "face", faceId: face.id, isWindow: true };
          inBarBC.userData = { type: "face", faceId: face.id, isWindow: true };
          inBarCA.userData = { type: "face", faceId: face.id, isWindow: true };
          windowsDoorsGroup.add(inBarAB);
          windowsDoorsGroup.add(inBarBC);
          windowsDoorsGroup.add(inBarCA);

          // 3D Centroid badge sprite for window
          if (showTriangleLabels) {
            const labelTex = getWindowLabelTexture(face.type || `W${face.id}`, isSelected);
            const spriteMat = new THREE.SpriteMaterial({
              map: labelTex,
              depthTest: true,
              depthWrite: false,
              transparent: true
            });
            const sprite = new THREE.Sprite(spriteMat);
            const spriteScale = Math.max(10, Math.min(200, avgSide * 0.22));
            sprite.scale.set(spriteScale, spriteScale, 1);
            sprite.position.copy(pCen).addScaledVector(faceNormal, outwardOffset + frameH + 2);
            sprite.userData = { type: "face", faceId: face.id, isWindow: true };
            triangleLabelsGroup.add(sprite);
          }

          continue; // Finish window face rendering
        }

        // --- NON-CONVERTED FACE (SHEATHING / HITBOX / PREVIEW) ---
        const solarMetric = solarAnalysis?.metricsByFaceId.get(face.id);
        const isSolarHeatmapOn = (conversionMode === "solar" || Boolean(solarParams?.heatmapEnabled));
        const isOptimalSolar = isSolarHeatmapOn && solarMetric && (solarMetric.efficiencyPct >= 85 || solarAnalysis?.optimalFaceIds.includes(face.id));

        // 1. Interactive Hit Mesh & Conversion Preview (Active when outer sheathing is hidden)
        const isFabricFace = activeFabricStripFaceIds.includes(face.id);
        const fabricSeq = isFabricFace ? activeFabricStripFaceIds.indexOf(face.id) + 1 : 0;

        if (conversionMode !== "none" || windowMode || isSolarHeatmapOn || isFabricFace) {
          const previewGeom = new THREE.BufferGeometry().setFromPoints([vA, vB, vC]);
          previewGeom.computeVertexNormals();
          const previewColor =
            isFabricFace
              ? (isSelected ? 0xDC2626 : 0xD97706)
              : conversionMode === "fabric_strip"
              ? (isSelected ? 0xFF5722 : 0xF59E0B)
              : conversionMode === "door"
              ? (isSelected ? 0xFF5722 : 0xD97706)
              : conversionMode === "solar" || isSolarHeatmapOn
              ? (isSelected ? 0xFF5722 : (solarMetric ? solarMetric.heatmapColor : 0x7C3AED))
              : (isSelected ? 0xFF5722 : 0x0284C7);

          const previewMat = getPreviewMat(
            previewColor,
            isSelected ? 0.55 : isFabricFace ? 0.65 : conversionMode === "fabric_strip" ? 0.15 : (isSolarHeatmapOn ? 0.55 : 0.09)
          );
          const previewMesh = new THREE.Mesh(previewGeom, previewMat);
          previewMesh.position.addScaledVector(faceNormal, outwardOffset);
          previewMesh.userData = { type: "face", faceId: face.id, isFabric: isFabricFace };
          hitMeshesGroup.add(previewMesh);

          const borderGeom = new THREE.BufferGeometry().setFromPoints([vA, vB, vC, vA]);
          const borderMat = getBorderLineMat(
            isFabricFace ? 0xB45309 : isOptimalSolar ? 0xFDE047 : (typeof previewColor === "number" ? previewColor : 0x0284C7),
            isFabricFace ? 2.5 : 1.5,
            false,
            isSelected ? 0.95 : isFabricFace ? 0.95 : isOptimalSolar ? 0.95 : 0.4
          );
          const borderLine = new THREE.Line(borderGeom, borderMat);
          borderLine.position.addScaledVector(faceNormal, outwardOffset + 0.1);
          borderLine.userData = { type: "face", faceId: face.id };
          hitMeshesGroup.add(borderLine);

          // Centroid badge sprite for Fabric Strip face
          if (isFabricFace) {
            const labelTex = getFabricStripLabelTexture(fabricSeq, face.type || `T${face.id}`, isSelected);
            const spriteMat = getOrCreateSpriteMat(labelTex, `fabric_badge_${fabricSeq}_${face.type || `T${face.id}`}_${isSelected}`);
            const sprite = new THREE.Sprite(spriteMat);
            const spriteScale = Math.max(10, Math.min(220, avgSide * 0.25));
            sprite.scale.set(spriteScale, spriteScale, 1);
            sprite.position.copy(pCen).addScaledVector(faceNormal, outwardOffset + 3);
            sprite.userData = { type: "face", faceId: face.id, isFabric: true };
            hitMeshesGroup.add(sprite);
          } else if (showTriangleLabels && isSolarHeatmapOn && solarMetric) {
            // Centroid badge sprite showing solar efficiency
            const labelTex = getSolarEfficiencyBadgeTexture(
              face.type || `T${groupIdx + 1}`,
              solarMetric.efficiencyPct,
              Boolean(isOptimalSolar),
              isSelected
            );
            const spriteMat = getOrCreateSpriteMat(labelTex, `solar_eff_${face.type || `T${groupIdx + 1}`}_${Math.round(solarMetric.efficiencyPct)}_${Boolean(isOptimalSolar)}_${isSelected}`);
            const sprite = new THREE.Sprite(spriteMat);
            const spriteScale = Math.max(8, Math.min(220, avgSide * 0.22));
            sprite.scale.set(spriteScale, spriteScale, 1);
            sprite.position.copy(pCen).addScaledVector(faceNormal, outwardOffset + 2);
            sprite.userData = { type: "face", faceId: face.id };
            hitMeshesGroup.add(sprite);
          }
        } else {
          // Invisible hit mesh so touch/click still detects face when sheathing is hidden
          const hitGeom = new THREE.BufferGeometry().setFromPoints([vA, vB, vC]);
          hitGeom.computeVertexNormals();
          const hitMesh = new THREE.Mesh(hitGeom, sharedInvisibleHitMat);
          hitMesh.userData = { type: "face", faceId: face.id };
          hitMeshesGroup.add(hitMesh);
        }

        // 2. Volumetric Outer Sheathing Panel (added to outerSheathingGroup)
        const gapMm = Math.max(0, Math.min(10, seamGapMm));
        let shrinkFactor = 1.0;
        if (gapMm > 0.001 && !isGlass) {
          // Precise inradius calculation: r = 2 * Area / Perimeter
          const area = 0.5 * edgeAB.clone().cross(edgeAC).length();
          const perim = vA.distanceTo(vB) + vB.distanceTo(vC) + vC.distanceTo(vA);
          const inradius = perim > 0.01 ? (2 * area) / perim : Math.max(1, avgSide * 0.2887);
          // Each panel edge retreats towards centroid by half of the total seam gap (gapMm / 2)
          shrinkFactor = Math.max(0.70, Math.min(1.0, 1 - (gapMm * 0.5) / Math.max(1, inradius)));
        }

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
        } else if (isSolarHeatmapOn && solarMetric) {
          faceColorHex = solarMetric.heatmapColor;
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
          const isTransp = isMultiLayer || isDimmed || shouldRenderInnerSheathing;
          const panelOpacity = isDimmed ? 0.18 : (isMultiLayer ? (sheathingOpacity ?? 0.85) : (shouldRenderInnerSheathing ? 0.80 : 1.0));
          mat = getSheathingMat(faceColorHex, sheathingStyle === "plywood" ? 0.65 : 0.45, 0.05, isTransp, panelOpacity);

          // Realistic cut edge of plywood / veneer with slightly darker ply core
          const sideColor = isSelected
            ? "#FF5722"
            : (sheathingStyle === "plywood" ? "#8A542A" : "#36271A");
          edgeMat = getSheathingEdgeMat(sideColor, isTransp, panelOpacity);
        }

        const mesh = new THREE.Mesh(geom, [mat, edgeMat]);
        mesh.userData = { type: "face", faceId: face.id };
        outerSheathingGroup.add(mesh);

        // Seam border contour for distinct triangle panel appearance
        if (!isGlass) {
          const borderPoints = [pA_out, pB_out, pC_out, pA_out];
          const borderGeom = new THREE.BufferGeometry().setFromPoints(borderPoints);
          const bColor = isSelected
            ? 0xFFFFFF
            : isOptimalSolar
            ? 0xFDE047 // Radiant golden highlight for optimal solar faces
            : isFiltered
            ? 0xDE7C5A
            : 0x2A3845;
          const bWidth = isSelected ? 3 : isOptimalSolar ? 3.5 : 1.5;
          const bOpacity = isDimmed ? 0.2 : isOptimalSolar ? 0.95 : 0.85;
          const borderMat = getBorderLineMat(bColor, bWidth, isDimmed, bOpacity);
          const borderLine = new THREE.Line(borderGeom, borderMat);
          borderLine.userData = { type: "face", faceId: face.id };
          outerSheathingGroup.add(borderLine);

          // Vertical thickness corner lines
          const cornerPoints = [
            pA_in, pA_out,
            pB_in, pB_out,
            pC_in, pC_out
          ];
          const cornerGeom = new THREE.BufferGeometry().setFromPoints(cornerPoints);
          const cornerLine = new THREE.LineSegments(cornerGeom, borderMat);
          cornerLine.userData = { type: "face", faceId: face.id };
          outerSheathingGroup.add(cornerLine);
        }

        // 3D Centroid Badge Label for Triangle Type (Позначення типу на грані)
        if (!isGlass && !isDimmed) {
          const typeName = face.type || `T${groupIdx + 1}`;
          const spriteKey = (isSolarHeatmapOn && solarMetric)
            ? `solar_eff_${typeName}_${Math.round(solarMetric.efficiencyPct)}_${Boolean(isOptimalSolar)}_${isSelected}`
            : `${typeName}_${isSelected ? "#FF5722" : faceColorHex}_${isSelected ? "#FFF3E0" : "#FFFFFF"}`;
          const labelTex = (isSolarHeatmapOn && solarMetric)
            ? getSolarEfficiencyBadgeTexture(
                typeName,
                solarMetric.efficiencyPct,
                Boolean(isOptimalSolar),
                isSelected
              )
            : getTriangleLabelTexture(
                typeName,
                isSelected ? "#FF5722" : faceColorHex,
                isSelected ? "#FFF3E0" : "#FFFFFF"
              );
          const spriteMat = getOrCreateSpriteMat(labelTex, spriteKey);
          const sprite = new THREE.Sprite(spriteMat);
          const spriteScale = Math.max(8, Math.min(220, avgSide * 0.22));
          sprite.scale.set(spriteScale, spriteScale, 1);
          sprite.position.copy(pCen).addScaledVector(
            faceNormal,
            outwardOffset + panelThick + Math.max(1, spriteScale * 0.05)
          );
          sprite.userData = { type: "face", faceId: face.id };
          triangleLabelsGroup.add(sprite);
        }

        // 3. Inner Sheathing (Interior lining: drywall, chipboard, OSB, plywood on inside face of struts)
        if (!isGlass) {
          const inwardOffset = -((effBeamDepth / 2) + 1.2);
          const inGapMm = Math.max(0, Math.min(10, innerSheathingParams?.seamGapMm ?? seamGapMm));
          let inShrink = 1.0;
          if (inGapMm > 0.001) {
            const area = 0.5 * edgeAB.clone().cross(edgeAC).length();
            const perim = vA.distanceTo(vB) + vB.distanceTo(vC) + vC.distanceTo(vA);
            const inradius = perim > 0.01 ? (2 * area) / perim : Math.max(1, avgSide * 0.2887);
            inShrink = Math.max(0.70, Math.min(1.0, 1 - (inGapMm * 0.5) / Math.max(1, inradius)));
          }
          const ipA = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vA, pCen), inShrink).addScaledVector(faceNormal, inwardOffset);
          const ipB = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vB, pCen), inShrink).addScaledVector(faceNormal, inwardOffset);
          const ipC = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vC, pCen), inShrink).addScaledVector(faceNormal, inwardOffset);

          const innerGeom = new THREE.BufferGeometry().setFromPoints([ipA, ipC, ipB]);
          innerGeom.computeVertexNormals();
          const innerMesh = new THREE.Mesh(innerGeom, sharedInnerMat);
          innerMesh.userData = { type: "face", faceId: face.id, isInner: true };
          innerSheathingGroup.add(innerMesh);

          // Interior panel border line
          const innerBorderGeom = new THREE.BufferGeometry().setFromPoints([ipA, ipB, ipC, ipA]);
          const innerBorderLine = new THREE.Line(innerBorderGeom, sharedInnerBorderMat);
          innerBorderLine.userData = { type: "face", faceId: face.id, isInner: true };
          innerSheathingGroup.add(innerBorderLine);
        }
      }
    }

    // 2.5. Render 3D Rectangular Doorway Portal (Прямокутний дверний пройм, вписаний у декілька трикутників та утворює прохід у купол)
    if (activeDoorFaceIds.length > 0) {
      let anchorFaceId = doorParams?.anchorFaceId;
      if (anchorFaceId === undefined || !activeDoorFaceIds.includes(anchorFaceId)) {
        let lowestZ = Infinity;
        let bestId = activeDoorFaceIds[0];
        for (const fid of activeDoorFaceIds) {
          const f = model.faces.find(fa => fa.id === fid);
          if (f) {
            const zAvg = (model.nodes[f.a].position.z + model.nodes[f.b].position.z + model.nodes[f.c].position.z) / 3;
            if (zAvg < lowestZ) {
              lowestZ = zAvg;
              bestId = f.id;
            }
          }
        }
        anchorFaceId = bestId;
      }

      const effBeamDepth = (model.beamProfile.type === "circular" || model.beamProfile.type === "pipe")
        ? (model.beamProfile.diameter || model.beamProfile.width)
        : model.beamProfile.depth;
      const portalW = doorParams?.widthMm || 900;
      const portalH = doorParams?.heightMm || 2050;
      const portalDepth = Math.max(160, effBeamDepth + 80);
      const elevationFromBase = doorParams?.elevationFromBaseMm || 0;
      const offsetFromDome = doorParams?.offsetFromDomeMm || 0;
      const bayClusterType = doorParams?.bayClusterType || "auto";
      const clusterHubNodeId = doorParams?.clusterHubNodeId;

      const triResult = calculateDoorwayTriangulationAndPanels(
        model,
        anchorFaceId,
        portalW,
        portalH,
        portalDepth,
        elevationFromBase,
        offsetFromDome,
        bayClusterType,
        clusterHubNodeId
      );
      if (triResult) {
        const portal = triResult.portal;
        const pGroup = new THREE.Group();
        const { centerGround, tangentDir, normalOutward, normalInward, widthMm, heightMm, depthMm, postThicknessMm } = portal;

        const vCenter = new THREE.Vector3(centerGround.x, centerGround.y, centerGround.z);
        const vTan = new THREE.Vector3(tangentDir.x, tangentDir.y, tangentDir.z).normalize();
        const vOut = new THREE.Vector3(normalOutward.x, normalOutward.y, normalOutward.z).normalize();
        const vIn = new THREE.Vector3(normalInward.x, normalInward.y, normalInward.z).normalize();
        const vUp = new THREE.Vector3(0, 0, 1);

        const isDoorSelected = selectedFaceId !== null && activeDoorFaceIds.includes(selectedFaceId);

        // Highlight perimeter boundary of pentagon or hexagon cluster if selected
        if (portal.clusterType === "pentagon" || portal.clusterType === "hexagon" || activeDoorFaceIds.length > 2) {
          const clusterBorderMat = new THREE.LineDashedMaterial({
            color: 0xF59E0B,
            dashSize: 80,
            gapSize: 40,
            linewidth: 3
          });
          for (const fid of portal.capturedFaceIds) {
            const f = model.faces.find(fa => fa.id === fid);
            if (f) {
              const pA = model.nodes[f.a].position;
              const pB = model.nodes[f.b].position;
              const pC = model.nodes[f.c].position;
              const clGeom = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(pA.x, pA.y, pA.z),
                new THREE.Vector3(pB.x, pB.y, pB.z),
                new THREE.Vector3(pC.x, pC.y, pC.z),
                new THREE.Vector3(pA.x, pA.y, pA.z)
              ]);
              const clLine = new THREE.Line(clGeom, clusterBorderMat);
              clLine.computeLineDistances();
              clLine.userData = { type: "face", faceId: anchorFaceId, isDoor: true };
              pGroup.add(clLine);
            }
          }
        }

        // Materials: Structural laminated timber door posts and lintel
        const timberMat = new THREE.MeshStandardMaterial({
          color: isDoorSelected ? 0xFF5722 : 0x8C5027,
          roughness: 0.65,
          metalness: 0.05,
          side: THREE.DoubleSide
        });

        const casingMat = new THREE.MeshStandardMaterial({
          color: isDoorSelected ? 0xFF8A50 : 0xBA7A45,
          roughness: 0.7,
          metalness: 0.05,
          side: THREE.DoubleSide
        });

        const rotMat = new THREE.Matrix4().makeBasis(vTan, vOut, vUp);

        // 1. Left Vertical Jamb Post
        const postGeom = new THREE.BoxGeometry(postThicknessMm, depthMm, heightMm);
        const leftPost = new THREE.Mesh(postGeom, timberMat);
        const leftPos = vCenter.clone()
          .addScaledVector(vTan, -(widthMm / 2 - postThicknessMm / 2))
          .addScaledVector(vUp, heightMm / 2);
        leftPost.position.copy(leftPos);
        leftPost.setRotationFromMatrix(rotMat);
        leftPost.userData = { type: "face", faceId: anchorFaceId, isDoor: true };
        pGroup.add(leftPost);

        // 2. Right Vertical Jamb Post
        const rightPost = new THREE.Mesh(postGeom, timberMat);
        const rightPos = vCenter.clone()
          .addScaledVector(vTan, (widthMm / 2 - postThicknessMm / 2))
          .addScaledVector(vUp, heightMm / 2);
        rightPost.position.copy(rightPos);
        rightPost.setRotationFromMatrix(rotMat);
        rightPost.userData = { type: "face", faceId: anchorFaceId, isDoor: true };
        pGroup.add(rightPost);

        // 3. Top Horizontal Lintel Beam (Перемичка над дверима)
        const lintelGeom = new THREE.BoxGeometry(widthMm, depthMm, postThicknessMm);
        const lintel = new THREE.Mesh(lintelGeom, timberMat);
        const lintelPos = vCenter.clone().addScaledVector(vUp, heightMm - postThicknessMm / 2);
        lintel.position.copy(lintelPos);
        lintel.setRotationFromMatrix(rotMat);
        lintel.userData = { type: "face", faceId: anchorFaceId, isDoor: true };
        pGroup.add(lintel);

        // 4. Ground Threshold Plate (Поріг)
        const threshGeom = new THREE.BoxGeometry(widthMm, depthMm + 20, Math.max(16, postThicknessMm * 0.35));
        const thresh = new THREE.Mesh(threshGeom, timberMat);
        thresh.position.copy(vCenter.clone().addScaledVector(vUp, Math.max(8, postThicknessMm * 0.18)));
        thresh.setRotationFromMatrix(rotMat);
        thresh.userData = { type: "face", faceId: anchorFaceId, isDoor: true };
        pGroup.add(thresh);

        // If distance from base > 0 (elevated threshold), render foundation apron box
        if (elevationFromBase > 0) {
          const baseApronGeom = new THREE.BoxGeometry(widthMm, depthMm + 10, elevationFromBase);
          const baseApron = new THREE.Mesh(baseApronGeom, casingMat);
          baseApron.position.copy(vCenter.clone().addScaledVector(vUp, -elevationFromBase / 2));
          baseApron.setRotationFromMatrix(rotMat);
          baseApron.userData = { type: "face", faceId: anchorFaceId, isDoor: true };
          pGroup.add(baseApron);
        }

        // 5. Entrance Walk-Through Tunnel Casing (Короб проходу у купол)
        const tunnelDepth = depthMm * 0.85;
        const linerThk = 18;
        const topLinerGeom = new THREE.BoxGeometry(widthMm - postThicknessMm * 2, tunnelDepth, linerThk);
        const topLiner = new THREE.Mesh(topLinerGeom, casingMat);
        topLiner.position.copy(vCenter.clone()
          .addScaledVector(vIn, tunnelDepth * 0.25)
          .addScaledVector(vUp, heightMm - postThicknessMm - linerThk / 2));
        topLiner.setRotationFromMatrix(rotMat);
        topLiner.userData = { type: "face", faceId: anchorFaceId, isDoor: true };
        pGroup.add(topLiner);

        // 6. Door Opening Walk-Through Passage Void (Чистий відкритий прохід)
        const passageGeom = new THREE.PlaneGeometry(widthMm - postThicknessMm * 2, heightMm - postThicknessMm);
        const passageMat = new THREE.MeshBasicMaterial({
          color: 0xFDE68A,
          opacity: 0.15,
          transparent: true,
          side: THREE.DoubleSide
        });
        const passageMesh = new THREE.Mesh(passageGeom, passageMat);
        passageMesh.position.copy(vCenter.clone().addScaledVector(vUp, (heightMm - postThicknessMm) / 2));
        passageMesh.setRotationFromMatrix(rotMat);
        passageMesh.userData = { type: "face", faceId: anchorFaceId, isDoor: true };
        pGroup.add(passageMesh);

        // 7. Structural Connecting Beams (З'єднувальні балки порталу дверей з каркасом купола: зліва, справа, зверху)
        const connBeamMat = new THREE.MeshStandardMaterial({
          color: isDoorSelected ? 0xFF7043 : 0x935116,
          roughness: 0.6,
          metalness: 0.08,
          side: THREE.DoubleSide
        });

        for (const cb of triResult.connectingBeams) {
          const vS = new THREE.Vector3(cb.start.x, cb.start.y, cb.start.z);
          const vE = new THREE.Vector3(cb.end.x, cb.end.y, cb.end.z);
          const beamLen = vS.distanceTo(vE);
          if (beamLen < 1) continue;

          const beamMid = new THREE.Vector3().addVectors(vS, vE).multiplyScalar(0.5);
          const beamDir = new THREE.Vector3().subVectors(vE, vS).normalize();

          const bGeom = new THREE.BoxGeometry(cb.widthMm, beamLen, cb.depthMm);
          const bMesh = new THREE.Mesh(bGeom, connBeamMat);
          bMesh.position.copy(beamMid);
          bMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir);
          bMesh.userData = { type: "face", faceId: anchorFaceId, isDoor: true };
          pGroup.add(bMesh);
        }

        // 8. Triangulated Infill Sheathing Panels (Трикутники з'єднання двері з каркасом купола: зліва, справа, зверху)
        const infillPanelMat = new THREE.MeshStandardMaterial({
          color: isDoorSelected ? 0xFF8A65 : 0xD29B63,
          roughness: 0.65,
          metalness: 0.04,
          side: THREE.DoubleSide
        });

        const infillBorderMat = new THREE.LineBasicMaterial({
          color: isDoorSelected ? 0xFFFFFF : 0x5D4037,
          linewidth: 2
        });

        const allRenderPanels = [
          ...triResult.infillTriangles,
          ...(triResult.vestibulePanels || [])
        ];

        for (const tp of allRenderPanels) {
          const p1 = new THREE.Vector3(tp.vertices3D[0].x, tp.vertices3D[0].y, tp.vertices3D[0].z);
          const p2 = new THREE.Vector3(tp.vertices3D[1].x, tp.vertices3D[1].y, tp.vertices3D[1].z);
          const p3 = new THREE.Vector3(tp.vertices3D[2].x, tp.vertices3D[2].y, tp.vertices3D[2].z);

          // Exterior Triangulated Panel
          const tGeom = new THREE.BufferGeometry().setFromPoints([p1, p2, p3]);
          tGeom.computeVertexNormals();
          const tMesh = new THREE.Mesh(tGeom, infillPanelMat);
          tMesh.userData = { type: "face", faceId: anchorFaceId, isDoor: true };
          pGroup.add(tMesh);

          // Panel perimeter contour line
          const bGeom = new THREE.BufferGeometry().setFromPoints([p1, p2, p3, p1]);
          const bLine = new THREE.Line(bGeom, infillBorderMat);
          bLine.userData = { type: "face", faceId: anchorFaceId, isDoor: true };
          pGroup.add(bLine);

          // If inner sheathing is enabled, also render interior lining infill panel
          if (showInnerSheathing) {
            const innerInfillMat = new THREE.MeshStandardMaterial({
              color: 0xF3F4F6,
              roughness: 0.9,
              side: THREE.DoubleSide
            });
            const inwardShift = vIn.clone().multiplyScalar(portalDepth * 0.7);
            const ip1 = p1.clone().add(inwardShift);
            const ip2 = p2.clone().add(inwardShift);
            const ip3 = p3.clone().add(inwardShift);
            const inGeom = new THREE.BufferGeometry().setFromPoints([ip1, ip3, ip2]);
            inGeom.computeVertexNormals();
            const inMesh = new THREE.Mesh(inGeom, innerInfillMat);
            inMesh.userData = { type: "face", faceId: anchorFaceId, isDoor: true, isInner: true };
            pGroup.add(inMesh);

            const inBGeom = new THREE.BufferGeometry().setFromPoints([ip1, ip2, ip3, ip1]);
            const inBLine = new THREE.Line(inBGeom, new THREE.LineBasicMaterial({ color: 0x94A3B8, linewidth: 1.5 }));
            inBLine.userData = { type: "face", faceId: anchorFaceId, isDoor: true, isInner: true };
            pGroup.add(inBLine);
          }
        }

        // 9. Doorway Dimension 3D Badge Sprite
        if (showTriangleLabels) {
          let badgeText = `${widthMm}×${heightMm}`;
          if (elevationFromBase > 0) {
            badgeText += ` (+${elevationFromBase}мм)`;
          }
          if (portal.clusterType === "pentagon") {
            badgeText += " ⬟5-гранник";
          } else if (portal.clusterType === "hexagon") {
            badgeText += " ⬡6-гранник";
          }

          const doorLabelTex = getDoorLabelTexture(
            "Вхід",
            isDoorSelected,
            badgeText
          );
          const dSpriteMat = new THREE.SpriteMaterial({
            map: doorLabelTex,
            depthTest: true,
            depthWrite: false,
            transparent: true
          });
          const dSprite = new THREE.Sprite(dSpriteMat);
          const spriteScale = Math.max(14, Math.min(240, widthMm * 0.28));
          dSprite.scale.set(spriteScale, spriteScale, 1);
          dSprite.position.copy(vCenter.clone()
            .addScaledVector(vUp, heightMm + spriteScale * 0.45)
            .addScaledVector(vOut, depthMm * 0.5));
          dSprite.userData = { type: "face", faceId: anchorFaceId, isDoor: true };
          pGroup.add(dSprite);
        }

        // Supplemented Doorway Triangulation Nodes 3D Markings
        if (showNodeLabels && triResult.doorwayNodes && triResult.doorwayNodes.length > 0) {
          const spriteW = Math.max(14, Math.min(130, widthMm * 0.12));
          const spriteH = spriteW * 0.42;
          for (const dNode of triResult.doorwayNodes) {
            const dPos = new THREE.Vector3(dNode.position.x, dNode.position.y, dNode.position.z);
            const labelTex = getNodeLabelTexture(dNode.label, false, false, true);
            const spriteMat = new THREE.SpriteMaterial({
              map: labelTex,
              depthTest: true,
              depthWrite: false,
              transparent: true
            });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.scale.set(spriteW, spriteH, 1);
            // Offset to the left of the doorway node
            sprite.position.copy(dPos)
              .addScaledVector(vTan, -(spriteW * 0.55 + postThicknessMm * 0.8))
              .addScaledVector(vOut, 16);
            pGroup.add(sprite);

            // Small physical structural node marker
            const markerGeom = new THREE.SphereGeometry(Math.max(4, postThicknessMm * 0.2), 12, 12);
            const markerMat = new THREE.MeshStandardMaterial({
              color: 0xD97706,
              metalness: 0.8,
              roughness: 0.25
            });
            const marker = new THREE.Mesh(markerGeom, markerMat);
            marker.position.copy(dPos);
            pGroup.add(marker);
          }
        }

        windowsDoorsGroup.add(pGroup);
      }
    }

    // 3. Render Thunder Domes Star/Ray Connectors (Лучеві конектори у 3D з початку)
    if (shouldRenderConnectors) {
      const hubDiam = model.connectorParams.hubDiameter || 140;
      const hubR = Math.max(1.0, hubDiam / 2);
      const tabL = Math.max(1.2, model.connectorParams.tabLength || 95);
      const tabW = Math.max(1.0, model.connectorParams.tabWidth || 45);
      const thk = Math.max(0.4, model.connectorParams.thickness || 4);
      const wallThk = Math.max(0.4, model.connectorParams.wallThickness || 2.5);

      const isRoundBeam = model.beamProfile.type === "circular" || model.beamProfile.type === "pipe";
      const isRoundRay =
        model.connectorParams.rayType === "round_tube" ||
        (model.connectorParams.rayType !== "plate" && isRoundBeam);

      const beamDiam = Math.max(1, model.beamProfile.diameter || model.beamProfile.width || 20);
      const fitClearance = 0.35;
      const rayInnerR = (beamDiam / 2) + fitClearance;
      const rayOuterR = rayInnerR + wallThk;

      // Shared geometries for performance based on connector system type
      const connSys = model.connectorParams.type || "star_plate";
      const isPipeHub = connSys === "pipe_hub";
      const isSpider = connSys === "spider";
      const isGoodKarma = connSys === "good_karma";

      // Hub geometry: if round ray, central hub matches tubular wall thickness & height
      const hubHeight = isRoundRay
        ? Math.max(rayOuterR * 2.2, wallThk * 2 + 6)
        : (isPipeHub ? tabW * 1.2 : thk);
      const hubGeom = new THREE.CylinderGeometry(
        isPipeHub ? hubR * 0.65 : hubR,
        isPipeHub ? hubR * 0.65 : hubR,
        hubHeight,
        28
      );

      // Ray / Tab geometry:
      // When round ray is active: cylindrical tubular socket sleeve!
      // When rectangular beam / plate: flat rectangular blade / tab!
      const tabGeom = isRoundRay
        ? new THREE.CylinderGeometry(rayOuterR, rayOuterR, tabL, 20)
        : (isSpider
          ? new THREE.BoxGeometry(tabW * 1.1, tabW * 0.6, tabL)
          : (isPipeHub ? new THREE.BoxGeometry(thk * 1.5, tabW * 0.9, tabL) : new THREE.BoxGeometry(tabW, thk, tabL)));

      const boltR = Math.max(0.3, Math.min(tabW * 0.16, (model.connectorParams.boltDiameter || 10) / 2));
      const boltGeom = new THREE.CylinderGeometry(boltR, boltR, isRoundRay ? rayOuterR * 2.3 : thk * 1.4, 8);
      const boltMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937,
        metalness: 0.95,
        roughness: 0.15
      });

      const steelMatCache = new Map<number, THREE.MeshStandardMaterial>();
      const getSteelMat = (steelCol: number): THREE.MeshStandardMaterial => {
        let sm = steelMatCache.get(steelCol);
        if (!sm) {
          sm = new THREE.MeshStandardMaterial({
            color: steelCol,
            metalness: 0.85,
            roughness: 0.28
          });
          steelMatCache.set(steelCol, sm);
        }
        return sm;
      };

      for (const node of model.nodes) {
        if (assemblyState.isActive && !assemblyVisibility.visibleNodeIds.has(node.id)) {
          continue;
        }

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

        const steelMat = getSteelMat(steelColor);

        // A. Central hub
        if (!isGoodKarma) {
          const hubMesh = new THREE.Mesh(hubGeom, steelMat);
          hubMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), avgN);
          hubMesh.userData = { type: "node", nodeId: node.id };
          connGroup.add(hubMesh);
        }

        // B. Steel rays/tabs/sleeves along each connected beam
        for (const edgeId of node.edges) {
          const edge = model.edges[edgeId];
          const otherId = edge.start === node.id ? edge.end : edge.start;
          const otherPos = model.nodes[otherId].position;

          const beamDir = new THREE.Vector3(
            otherPos.x - node.position.x,
            otherPos.y - node.position.y,
            otherPos.z - node.position.z
          ).normalize();

          const tabMesh = new THREE.Mesh(tabGeom, steelMat);
          const tabCenterDist = (isPipeHub ? hubR * 0.65 : hubR) + tabL * 0.45;
          tabMesh.position.copy(beamDir).multiplyScalar(tabCenterDist);

          if (isRoundRay) {
            // Round tubular socket aligns along beamDir
            tabMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamDir);
          } else {
            // Flat plate blade oriented tangent to surface
            const perpDir = new THREE.Vector3().crossVectors(avgN, beamDir).normalize();
            const normalDir = new THREE.Vector3().crossVectors(beamDir, perpDir).normalize();
            const rotMat = new THREE.Matrix4().makeBasis(perpDir, normalDir, beamDir);
            tabMesh.quaternion.setFromRotationMatrix(rotMat);
          }

          tabMesh.userData = { type: "node", nodeId: node.id };
          connGroup.add(tabMesh);

          // Fasteners
          if (!isGoodKarma) {
            const b1 = new THREE.Mesh(boltGeom, boltMat);
            b1.position.copy(beamDir).multiplyScalar((isPipeHub ? hubR * 0.65 : hubR) + tabL * 0.32);
            b1.quaternion.copy(tabMesh.quaternion);
            b1.userData = { type: "node", nodeId: node.id };
            connGroup.add(b1);

            const b2 = new THREE.Mesh(boltGeom, boltMat);
            b2.position.copy(beamDir).multiplyScalar((isPipeHub ? hubR * 0.65 : hubR) + tabL * 0.72);
            b2.quaternion.copy(tabMesh.quaternion);
            b2.userData = { type: "node", nodeId: node.id };
            connGroup.add(b2);
          }
        }

        connectorsGroup.add(connGroup);
      }
    }

    // 4. Render 3D Engineering Node Markings & Labels (Маркування вузлів типу АА1, АА2, АБ3...)
    if (showNodeLabels) {
      const avgBeamLen = model.edges.length > 0
        ? model.edges.reduce((sum, e) => sum + e.length, 0) / model.edges.length
        : 1000;
      // Proportional badge scale: clear, legible, compact, placed to the left of connector
      const spriteW = Math.max(12, Math.min(130, avgBeamLen * 0.085));
      const spriteH = spriteW * 0.42;

      const hubDiam = model.connectorParams.hubDiameter || 140;
      const tabL = model.connectorParams.tabLength || 95;
      // Total radial reach of connector hub & tabs
      const connRadius = (hubDiam / 2) + Math.min(tabL * 0.7, 45);
      // Lateral distance to the left: connector radius + badge half-width + clearance gap
      const lateralDist = connRadius + (spriteW * 0.52) + 8;
      const outwardDist = Math.max(5, (model.connectorParams.thickness || 4) + 5);

      for (const node of model.nodes) {
        if (assemblyState.isActive && !assemblyVisibility.visibleNodeIds.has(node.id)) {
          continue;
        }

        const isSelected = selectedNodeId === node.id;
        const nodePos = new THREE.Vector3(node.position.x, node.position.y, node.position.z);

        // Surface outward normal
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

        // Tangent "Left" direction relative to the exterior observer looking at the node
        // Exterior observer looks along -avgN with world +Z as up.
        // Left vector in this tangent plane is avgN x (0, 0, 1)
        const leftDir = new THREE.Vector3().crossVectors(avgN, new THREE.Vector3(0, 0, 1));
        if (leftDir.lengthSq() < 0.001) {
          leftDir.set(-1, 0, 0); // At top apex, use -X as left
        } else {
          leftDir.normalize();
        }

        const badgePos = nodePos.clone()
          .addScaledVector(avgN, outwardDist)
          .addScaledVector(leftDir, lateralDist);

        const labelText = node.label || `AA${node.id + 1}`;
        const labelTex = getNodeLabelTexture(labelText, isSelected, !!node.boundary, false);
        const spriteMat = new THREE.SpriteMaterial({
          map: labelTex,
          depthTest: true,
          depthWrite: false,
          transparent: true
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(spriteW, spriteH, 1);
        sprite.position.copy(badgePos);
        sprite.userData = { type: "node", nodeId: node.id };
        nodeLabelsGroup.add(sprite);

        // Thin CAD callout leader line from connector edge to badge
        const leaderMat = new THREE.LineBasicMaterial({
          color: isSelected ? 0xFF5722 : 0x64748B,
          transparent: true,
          opacity: 0.55
        });
        const leaderStart = nodePos.clone()
          .addScaledVector(avgN, outwardDist)
          .addScaledVector(leftDir, connRadius);
        const leaderEnd = badgePos.clone().addScaledVector(leftDir, -spriteW * 0.44);
        const leaderGeom = new THREE.BufferGeometry().setFromPoints([leaderStart, leaderEnd]);
        const leaderLine = new THREE.Line(leaderGeom, leaderMat);
        leaderLine.userData = { type: "node", nodeId: node.id };
        nodeLabelsGroup.add(leaderLine);
      }

      // Render supplemented window nodes (if any)
      const windowNodes = getWindowNodes(model, model.nodes.length + 1);
      for (const wNode of windowNodes) {
        const wPos = new THREE.Vector3(wNode.position.x, wNode.position.y, wNode.position.z);
        const wTex = getNodeLabelTexture(wNode.label, selectedFaceId === wNode.faceId, false, true);
        const wMat = new THREE.SpriteMaterial({
          map: wTex,
          depthTest: true,
          depthWrite: false,
          transparent: true
        });
        const wSprite = new THREE.Sprite(wMat);
        wSprite.scale.set(spriteW * 0.9, spriteH * 0.9, 1);
        wSprite.position.copy(wPos).add(new THREE.Vector3(-spriteW * 0.6, 0, 16));
        wSprite.userData = { type: "face", faceId: wNode.faceId, isWindow: true };
        nodeLabelsGroup.add(wSprite);
      }
    }

    // Assemble all sub-groups into root group
    group.add(beamsGroup);
    group.add(connectorsGroup);
    group.add(windowsDoorsGroup);
    group.add(outerSheathingGroup);
    group.add(innerSheathingGroup);
    group.add(hitMeshesGroup);
    group.add(nodeLabelsGroup);
    group.add(triangleLabelsGroup);

    // Initial layer visibility
    const effShowBeams = showBeams || renderMode === "beams" || renderMode === "hybrid" || renderMode === "wireframe" || assemblyState.isActive;
    const effShowConnectors = showConnectors || renderMode === "connectors" || renderMode === "hybrid";
    const effShowOuter = showOuterSheathing || renderMode === "sheathing" || renderMode === "hybrid" || renderMode === "glass" || (assemblyState.isActive && assemblyVisibility.visibleFaceIds.size > 0);
    const effShowInner = showInnerSheathing || (innerSheathingParams?.enabled ?? false);

    beamsGroup.visible = effShowBeams;
    connectorsGroup.visible = effShowConnectors;
    outerSheathingGroup.visible = effShowOuter;
    hitMeshesGroup.visible = !effShowOuter;
    innerSheathingGroup.visible = effShowInner;
    nodeLabelsGroup.visible = showNodeLabels;
    triangleLabelsGroup.visible = showTriangleLabels;
  }, [
    model,
    renderMode,
    selectedNodeId,
    selectedEdgeId,
    selectedFaceId,
    filterTriangleType,
    sheathingStyle,
    plywoodThickness,
    plywoodMaterial,
    seamGapMm,
    assemblyState.isActive,
    assemblyState.progress,
    assemblyVisibility,
    activeWindowFaceIds,
    activeDoorFaceIds,
    activeSolarFaceIds,
    doorParams,
    solarParams,
    innerSheathingParams?.material,
    innerSheathingParams?.seamGapMm,
    conversionMode,
    solarAnalysis
  ]);

  // Fast 0ms visibility updates for 3D layers without rebuilding geometry
  useEffect(() => {
    const effShowBeams = showBeams || renderMode === "beams" || renderMode === "hybrid" || renderMode === "wireframe" || assemblyState.isActive;
    const effShowConnectors = showConnectors || renderMode === "connectors" || renderMode === "hybrid";
    const effShowOuter = showOuterSheathing || renderMode === "sheathing" || renderMode === "hybrid" || renderMode === "glass" || (assemblyState.isActive && assemblyVisibility.visibleFaceIds.size > 0);
    const effShowInner = showInnerSheathing || (innerSheathingParams?.enabled ?? false);

    if (beamsGroupRef.current) beamsGroupRef.current.visible = effShowBeams;
    if (connectorsGroupRef.current) connectorsGroupRef.current.visible = effShowConnectors;
    if (outerSheathingGroupRef.current) outerSheathingGroupRef.current.visible = effShowOuter;
    if (hitMeshesGroupRef.current) hitMeshesGroupRef.current.visible = !effShowOuter;
    if (innerSheathingGroupRef.current) innerSheathingGroupRef.current.visible = effShowInner;
    if (nodeLabelsGroupRef.current) nodeLabelsGroupRef.current.visible = showNodeLabels;
    if (triangleLabelsGroupRef.current) triangleLabelsGroupRef.current.visible = showTriangleLabels;
  }, [
    showBeams,
    showConnectors,
    showOuterSheathing,
    showInnerSheathing,
    showNodeLabels,
    showTriangleLabels,
    renderMode,
    assemblyState.isActive,
    assemblyVisibility.visibleFaceIds.size,
    innerSheathingParams?.enabled
  ]);

  // Fast 0ms opacity updates for sheathing without rebuilding geometry
  useEffect(() => {
    if (!outerSheathingGroupRef.current) return;
    outerSheathingGroupRef.current.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => {
              if (m && 'opacity' in m && (m as any).transparent) {
                (m as any).opacity = sheathingOpacity;
              }
            });
          } else if ('opacity' in mesh.material && (mesh.material as any).transparent) {
            (mesh.material as any).opacity = sheathingOpacity;
          }
        }
      }
    });
  }, [sheathingOpacity]);

  // Fast exploded view radial offset for all components without rebuilding geometry
  useEffect(() => {
    const domeR = model.parameters.diameter / 2;
    const applyExplosion = (group: THREE.Group | null, factor: number) => {
      if (!group) return;
      group.children.forEach(child => {
        const centroid = (child as any).userData?.centroid as THREE.Vector3 | undefined;
        if (centroid) {
          const radial = centroid.clone().setZ(Math.max(0, centroid.z)).normalize();
          child.position.copy(radial.multiplyScalar(domeR * factor * explodedProgress));
        }
      });
    };

    applyExplosion(outerSheathingGroupRef.current, 0.24);
    applyExplosion(innerSheathingGroupRef.current, -0.06);
    applyExplosion(beamsGroupRef.current, 0.10);
    applyExplosion(connectorsGroupRef.current, 0.03);
    applyExplosion(hitMeshesGroupRef.current, 0.24);
    applyExplosion(triangleLabelsGroupRef.current, 0.24);
  }, [explodedProgress, model.parameters.diameter]);

  // Exploded View smooth cycle playback
  useEffect(() => {
    if (!isExplodedPlaying) return;
    let animId: number;
    const startT = performance.now();
    const cycle = () => {
      const elapsed = (performance.now() - startT) / 1000;
      // 4-second back-and-forth sinusoidal loop
      const val = 0.5 - 0.5 * Math.cos((elapsed * Math.PI) / 2);
      setExplodedProgress(val);
      animId = requestAnimationFrame(cycle);
    };
    animId = requestAnimationFrame(cycle);
    return () => cancelAnimationFrame(animId);
  }, [isExplodedPlaying]);

  // Environment lighting & sky theme synchronization
  useEffect(() => {
    if (!sceneRef.current || !ambientLightRef.current || !dirLight1Ref.current || !dirLight2Ref.current || !interiorLightRef.current) return;
    applyEnvironmentTheme(
      environmentTheme,
      sceneRef.current,
      {
        ambient: ambientLightRef.current,
        dir1: dirLight1Ref.current,
        dir2: dirLight2Ref.current,
        interior: interiorLightRef.current
      },
      gridHelperRef.current,
      natureGroupRef.current
    );
  }, [environmentTheme]);

  // Human scale figure visibility & positioning
  useEffect(() => {
    if (!humanGroupRef.current) return;
    humanGroupRef.current.visible = showHumanScale;
    const domeR = model.parameters.diameter / 2;
    humanGroupRef.current.position.set(domeR * 1.15, -domeR * 0.25, 0);
  }, [showHumanScale, model.parameters.diameter]);

  // Video recording initiation & stream capture
  const handleStartRecording = (options: VideoExportOptions) => {
    if (!rendererRef.current) return;
    const renderer = rendererRef.current;
    const dom = renderer.domElement;

    setIsRecording(true);
    setRecordingProgress(0);
    setRecordedVideoUrl(null);

    const chunks: Blob[] = [];
    recordingChunksRef.current = chunks;

    let stream: MediaStream;
    if (options.includeTitleOverlay) {
      const recCanvas = document.createElement("canvas");
      recCanvas.width = dom.width;
      recCanvas.height = dom.height;
      const rCtx = recCanvas.getContext("2d");
      recordingCanvasRef.current = { canvas: recCanvas, ctx: rCtx };
      stream = recCanvas.captureStream(options.fps);
    } else {
      stream = dom.captureStream(options.fps);
    }

    let mimeType = "video/webm; codecs=vp9";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm; codecs=vp8";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "";
        }
      }
    }

    try {
      const mr = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 8000000 } : undefined);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      mr.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || "video/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
        setIsRecording(false);
        setRecordingProgress(100);

        // Auto trigger download for seamless UX
        const link = document.createElement("a");
        link.href = url;
        link.download = `geodome-${options.type}-${model.parameters.frequency}V-${model.parameters.diameter}mm.webm`;
        link.click();
      };

      mr.start(100);

      const startTime = performance.now();
      const startTheta = cameraSpherical.current.theta;
      const startPhi = cameraSpherical.current.phi;

      recordingStateRef.current = {
        options,
        startTime,
        startTheta,
        startPhi,
        mr
      };
    } catch (err) {
      console.error("MediaRecorder start error:", err);
      setIsRecording(false);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    recordingStateRef.current = null;
    recordingCanvasRef.current = null;
  };

  // Start dedicated 360° circular orbit video recording
  const handleStart360OrbitRecording = (durationSec = 10) => {
    setIsOrbitActive(true);
    setIsOrbitPlaying(true);
    handleStartRecording({
      type: "orbit_360",
      durationSeconds: durationSec,
      fps: 30,
      includeTitleOverlay: true,
      resolutionMultiplier: 1.0
    });
  };

  const handleTakeHighResSnapshot = (multiplier = 2) => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;

    const originalPixelRatio = renderer.getPixelRatio();
    const targetPixelRatio = Math.min(4, Math.max(1, (window.devicePixelRatio || 1) * multiplier));

    renderer.setPixelRatio(targetPixelRatio);
    renderer.render(scene, camera);

    const dataUrl = renderer.domElement.toDataURL("image/png");

    renderer.setPixelRatio(originalPixelRatio);
    renderer.render(scene, camera);

    const link = document.createElement("a");
    link.download = `geodome-3d-${model.parameters.frequency}V-${model.parameters.diameter}mm-snapshot.png`;
    link.href = dataUrl;
    link.click();
  };

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
    targetCenter.current.set(0, 0, model.parameters.height * 0.45);
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
    targetCenter.current.set(0, 0, model.parameters.height * 0.45);
    if (cameraRef.current) {
      cameraRef.current.position.set(0, domeR * 3.2, model.parameters.height * 0.45);
      cameraRef.current.lookAt(targetCenter.current);
    }
  };

  const setViewInside = () => {
    const domeR = model.parameters.diameter / 2;
    cameraSpherical.current = {
      radius: Math.max(30, domeR * 0.4),
      theta: Math.PI / 4,
      phi: Math.PI * 0.38
    };
    targetCenter.current.set(0, 0, model.parameters.height * 0.4);
    if (cameraRef.current) {
      const { radius, theta, phi } = cameraSpherical.current;
      cameraRef.current.position.set(
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.sin(phi) * Math.cos(theta),
        model.parameters.height * 0.35 + radius * Math.cos(phi)
      );
      cameraRef.current.lookAt(0, 0, model.parameters.height * 0.7);
    }
  };

  return (
    <div className="relative w-full h-[480px] sm:h-[540px] lg:h-[620px] rounded-3xl overflow-hidden tactile-inset select-none border border-white/60 touch-none">
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing touch-none" />

      {/* Row 1: Dedicated Full-Width 3D Layers & Display Modes Bar (Always Visible & Swipeable) */}
      <div className="absolute top-2 sm:top-2.5 inset-x-2 sm:inset-x-3 z-20 pointer-events-none">
        <div className="pointer-events-auto w-full flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-2xl tactile-card backdrop-blur-md bg-[#FAF7F2]/95 border border-white/80 shadow-md overflow-x-auto no-scrollbar scroll-smooth touch-pan-x">
          {/* Quick badge indicating this is the layer control bar */}
          <div className="flex items-center gap-1 pl-1.5 pr-1 text-[11px] font-bold text-[#8C9BAE] uppercase tracking-wider shrink-0 select-none">
            <Layers className="w-3.5 h-3.5 text-[#5A6778]" />
            <span className="hidden xs:inline">Шари:</span>
          </div>

          {/* 1. Frame / Struts Toggle */}
          <button
            type="button"
            onClick={handleToggleBeams}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 cursor-pointer ${
              showBeams
                ? "bg-[#E1EDE3] text-[#1A3E26] ring-1 ring-[#A6C7AE] font-bold shadow-2xs"
                : "text-[#5A6778] hover:text-[#2D3748] bg-white/70"
            }`}
            title="Показати/сховати дерев'яні або металеві балки (каркас купола)"
          >
            <Box className="w-3.5 h-3.5 text-[#5B9279]" />
            <span>Каркас</span>
            {showBeams && <span className="text-[10px] text-[#2E7D32] font-bold">✓</span>}
          </button>

          {/* 2. Ray Connectors Toggle */}
          <button
            type="button"
            onClick={handleToggleConnectors}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 cursor-pointer ${
              showConnectors
                ? "bg-[#E0F2FE] text-[#0369A1] ring-1 ring-[#7DD3FC] font-bold shadow-2xs"
                : "text-[#5A6778] hover:text-[#2D3748] bg-white/70"
            }`}
            title="Показати/сховати лучеві вузлові конектори"
          >
            <Disc className="w-3.5 h-3.5 text-[#0284C7]" />
            <span className="hidden sm:inline">Конектори</span>
            <span className="sm:hidden">Вузли</span>
            {showConnectors && <span className="text-[10px] text-[#0284C7] font-bold">✓</span>}
          </button>

          {/* 3. Outer Sheathing Triangles Toggle */}
          <button
            type="button"
            onClick={handleToggleOuterSheathing}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 cursor-pointer ${
              showOuterSheathing
                ? "bg-[#FDEFE7] text-[#8B5E34] ring-1 ring-[#FDBA74] font-bold shadow-2xs"
                : "text-[#5A6778] hover:text-[#2D3748] bg-white/70"
            }`}
            title="Показати/сховати зовнішні трикутники обшивки (фанера / OSB зі швом)"
          >
            <Triangle className="w-3.5 h-3.5 text-[#DE7C5A]" />
            <span className="hidden sm:inline">Зовн. обшивка</span>
            <span className="sm:hidden">Обшивка</span>
            {showOuterSheathing && <span className="text-[10px] text-[#DE7C5A] font-bold">✓</span>}
            {showOuterSheathing && (
              <span className="hidden md:inline px-1.5 py-0.5 text-[10px] font-mono font-bold bg-[#EFE8DD] text-[#7A4E21] rounded-md">
                {plywoodThickness} мм
              </span>
            )}
          </button>

          {/* 4. Inner Sheathing Toggle */}
          <button
            type="button"
            onClick={handleToggleInnerSheathing}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 cursor-pointer ${
              showInnerSheathing
                ? "bg-[#EDE9FE] text-[#6D28D9] ring-1 ring-[#C4B5FD] font-bold shadow-2xs"
                : "text-[#5A6778] hover:text-[#2D3748] bg-white/70"
            }`}
            title="Показати/сховати внутрішню обшивку купола (гіпсокартон / фанера)"
          >
            <Home className="w-3.5 h-3.5 text-[#7C3AED]" />
            <span className="hidden sm:inline">Внутр. обшивка</span>
            <span className="sm:hidden">Внутр.</span>
            {showInnerSheathing && <span className="text-[10px] text-[#7C3AED] font-bold">✓</span>}
          </button>

          {/* 5. All Elements Together Button */}
          <button
            type="button"
            onClick={handleToggleAllLayers}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-xl transition-all shrink-0 cursor-pointer ${
              showBeams && showConnectors && showOuterSheathing && showInnerSheathing
                ? "bg-[#D97706] text-white shadow-xs ring-2 ring-[#FDE68A]"
                : "bg-[#FFFBEB] text-[#92400E] hover:bg-[#FEF3C7] border border-[#FDE68A]"
            }`}
            title="Відобразити всі 4 елементи разом: каркас + конектори + зовнішня обшивка + внутрішня обшивка"
          >
            <Layers className="w-3.5 h-3.5 text-[#D97706]" />
            <span className="hidden sm:inline">Всі разом</span>
            <span className="sm:hidden">Всі 4</span>
          </button>

          {/* 6. 3D Assembly Animation Mode */}
          <button
            type="button"
            onClick={handleToggleAssemblyMode}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer shrink-0 ${
              assemblyState.isActive
                ? "bg-[#DE7C5A] text-white ring-2 ring-[#DE7C5A]/30"
                : "bg-white hover:bg-[#FAF7F2] text-[#1A2E3B] border border-[#E8E2D8]"
            }`}
            title="Поетапна 3D анімація монтажу купола (від фундаменту до фінальної обшивки)"
          >
            <Hammer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">3D Збірка</span>
            <span className="sm:hidden">Збірка</span>
            {assemblyState.isActive && (
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            )}
          </button>

          <span className="w-[1px] h-4 bg-[#DCD6CA] mx-0.5 shrink-0" />

          {/* 7. Window Mode Button */}
          <button
            type="button"
            onClick={() => {
              const next = conversionMode === "window" ? "none" : "window";
              setConversionMode(next);
              setWindowMode(next === "window");
              if (next === "window" && renderMode === "beams") {
                setRenderMode("hybrid");
              }
            }}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 cursor-pointer ${
              conversionMode === "window"
                ? "bg-[#0284C7] text-white shadow-xs font-bold ring-2 ring-[#38BDF8]"
                : activeWindowFaceIds.length > 0
                ? "bg-[#E0F2FE] text-[#0369A1] hover:bg-[#BAE6FD] font-semibold"
                : "text-[#5A6778] hover:text-[#2D3748] bg-white/70"
            }`}
            title="Режим вибору трикутників обшивки для конверсії у вікна"
          >
            <Sun className={`w-3.5 h-3.5 ${conversionMode === "window" ? "text-amber-300" : "text-[#0284C7]"}`} />
            <span>Вікна</span>
            {activeWindowFaceIds.length > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-md ${
                conversionMode === "window" ? "bg-white/20 text-white" : "bg-[#BAE6FD] text-[#0369A1]"
              }`}>
                {activeWindowFaceIds.length}
              </span>
            )}
          </button>

          {/* 8. Doorway Conversion Mode Button */}
          <button
            type="button"
            onClick={() => {
              const next = conversionMode === "door" ? "none" : "door";
              setConversionMode(next);
              setWindowMode(false);
              if (next === "door" && renderMode === "beams") {
                setRenderMode("hybrid");
              }
            }}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 cursor-pointer ${
              conversionMode === "door"
                ? "bg-[#D97706] text-white shadow-xs font-bold ring-2 ring-[#FDE68A]"
                : activeDoorFaceIds.length > 0
                ? "bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A] font-semibold"
                : "text-[#5A6778] hover:text-[#2D3748] bg-white/70"
            }`}
            title="Режим конвертації у дверний пройм із авто-захопленням сусіднього трикутника"
          >
            <DoorOpen className={`w-3.5 h-3.5 ${conversionMode === "door" ? "text-white" : "text-[#D97706]"}`} />
            <span>Двері</span>
            {activeDoorFaceIds.length > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-md ${
                conversionMode === "door" ? "bg-white/20 text-white" : "bg-[#FDE68A] text-[#92400E]"
              }`}>
                {activeDoorFaceIds.length}
              </span>
            )}
          </button>

          {/* 9. Solar PV Triangle Mode Button */}
          <button
            type="button"
            onClick={() => {
              const next = conversionMode === "solar" ? "none" : "solar";
              setConversionMode(next);
              setWindowMode(false);
              if (next === "solar" && renderMode === "beams") {
                setRenderMode("hybrid");
              }
            }}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 cursor-pointer ${
              conversionMode === "solar"
                ? "bg-[#7C3AED] text-white shadow-xs font-bold ring-2 ring-[#DDD6FE]"
                : activeSolarFaceIds.length > 0
                ? "bg-[#EDE9FE] text-[#5B21B6] hover:bg-[#DDD6FE] font-semibold"
                : "text-[#5A6778] hover:text-[#2D3748] bg-white/70"
            }`}
            title="Режим вибору трикутників для генерації струму під склом (BIPV)"
          >
            <Zap className={`w-3.5 h-3.5 ${conversionMode === "solar" ? "text-yellow-300" : "text-[#7C3AED]"}`} />
            <span className="hidden sm:inline">Сонячні BIPV</span>
            <span className="sm:hidden">BIPV</span>
            {activeSolarFaceIds.length > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-md ${
                conversionMode === "solar" ? "bg-white/20 text-white" : "bg-[#DDD6FE] text-[#5B21B6]"
              }`}>
                {activeSolarFaceIds.length}
              </span>
            )}
          </button>

          {/* 10. Fabric Strip Selection Mode Button */}
          <button
            type="button"
            onClick={() => {
              const next = conversionMode === "fabric_strip" ? "none" : "fabric_strip";
              setConversionMode(next);
              setWindowMode(false);
              if (next === "fabric_strip" && renderMode === "beams") {
                setRenderMode("hybrid");
              }
            }}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 cursor-pointer ${
              conversionMode === "fabric_strip"
                ? "bg-[#D97706] text-white shadow-xs font-bold ring-2 ring-[#FDE68A]"
                : activeFabricStripFaceIds.length > 0
                ? "bg-[#FEF3C7] text-[#92400E] hover:bg-[#FDE68A] font-semibold"
                : "text-[#5A6778] hover:text-[#2D3748] bg-white/70"
            }`}
            title="Режим вибору трикутників у безперервну смугу розкрою тканини / тенту"
          >
            <Scissors className={`w-3.5 h-3.5 ${conversionMode === "fabric_strip" ? "text-white" : "text-[#D97706]"}`} />
            <span className="hidden sm:inline">Смуга тенту</span>
            <span className="sm:hidden">Тент</span>
            {activeFabricStripFaceIds.length > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-md ${
                conversionMode === "fabric_strip" ? "bg-white/20 text-white" : "bg-[#FDE68A] text-[#92400E]"
              }`}>
                {activeFabricStripFaceIds.length}
              </span>
            )}
          </button>

          <span className="w-[1px] h-4 bg-[#DCD6CA] mx-0.5 shrink-0" />

          {/* 11. Glass Mode Button */}
          <button
            type="button"
            onClick={() => setRenderMode("glass")}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 cursor-pointer ${
              renderMode === "glass" ? "tactile-pill-active text-[#1A2E3B] bg-[#E6F1F7]" : "text-[#5A6778] hover:text-[#2D3748] bg-white/70"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#4A7C9B]" />
            <span>Скло</span>
          </button>

          {/* 12. Button: Node Labels */}
          <button
            type="button"
            onClick={() => setShowNodeLabels(!showNodeLabels)}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl transition-all shrink-0 cursor-pointer ${
              showNodeLabels
                ? "bg-[#5B9279] text-white font-bold shadow-2xs"
                : "text-[#5A6778] hover:text-[#2D3748] bg-white/70"
            }`}
            title="Включити/виключити нумерацію вузлів купола та пройомів (маркування типу АА1, АА2, АБ3...)"
          >
            <CircleDot className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">№ Вузлів: {showNodeLabels ? "Увімк." : "Вимк."}</span>
            <span className="sm:hidden">№ Вузлів</span>
          </button>

          {/* Interactive Connector Ring Size & Strut Trim Input (Desktop) */}
          {onChangeConnectorParams && (
            <div className="hidden lg:flex items-center gap-1.5 pl-2 ml-1 border-l border-[#DCD6CA] text-xs shrink-0">
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

              {/* Quick Wall Thickness / Ray Type Control */}
              <div className="flex items-center gap-1 pl-1.5 border-l border-[#DCD6CA]">
                <span className="text-[11px] font-semibold text-[#5A6778] whitespace-nowrap">
                  {model.beamProfile.type === "circular" || model.beamProfile.type === "pipe" || model.connectorParams.rayType === "round_tube"
                    ? "Стінка:"
                    : "Пластина:"}
                </span>
                <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-lg border border-[#DCD6CA] shadow-2xs">
                  <input
                    type="number"
                    min={0.5}
                    max={20}
                    step={0.1}
                    value={
                      model.beamProfile.type === "circular" || model.beamProfile.type === "pipe" || model.connectorParams.rayType === "round_tube"
                        ? (model.connectorParams.wallThickness || 2.5)
                        : (model.connectorParams.thickness || 4)
                    }
                    onChange={e => {
                      const raw = Number(e.target.value);
                      if (!isNaN(raw)) {
                        const val = Math.max(0.5, Math.min(20, raw));
                        if (model.beamProfile.type === "circular" || model.beamProfile.type === "pipe" || model.connectorParams.rayType === "round_tube") {
                          onChangeConnectorParams({
                            ...model.connectorParams,
                            wallThickness: val
                          });
                        } else {
                          onChangeConnectorParams({
                            ...model.connectorParams,
                            thickness: val
                          });
                        }
                      }
                    }}
                    className="w-10 text-xs font-mono font-bold text-center text-[#1A2E3B] outline-none"
                    title="Товщина стінки конектора від 0.5 мм до 20.0 мм"
                  />
                  <span className="text-[10px] text-[#8C9BAE]">мм</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Secondary Bar - 3D Camera, 360 Orbit, Video Studio, AR & Scene Tools */}
      <div className="absolute top-11 sm:top-12 inset-x-2 sm:inset-x-auto sm:right-3 z-10 pointer-events-none flex justify-end">
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 rounded-2xl tactile-card backdrop-blur-md bg-[#FAF7F2]/95 border border-white/80 shadow-md max-w-full overflow-x-auto no-scrollbar">
          {/* Button: 360° Circular Orbit Flyaround */}
          <button
            type="button"
            onClick={() => {
              const next = !isOrbitActive;
              setIsOrbitActive(next);
              setIsOrbitPlaying(next);
            }}
            title="Автоматичний круговий обліт камери навколо купола (360° Orbit) з панеллю керування та можливістю запису відео"
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 ${
              isOrbitActive
                ? "bg-gradient-to-r from-[#DE7C5A] to-[#C9603D] text-white shadow-md ring-2 ring-[#DE7C5A]/40"
                : "bg-white hover:bg-[#FAF7F2] text-[#1A2E3B] border border-[#E8E2D8] shadow-2xs"
            }`}
          >
            <RotateCw className={`w-3.5 h-3.5 ${isOrbitActive && isOrbitPlaying ? "animate-spin text-white" : "text-[#DE7C5A]"}`} />
            <span>360° Обліт</span>
            {isOrbitActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            )}
          </button>

          {/* Button: Video Animation & Studio Export */}
          <button
            type="button"
            onClick={() => setIsVideoModalOpen(true)}
            title="3D Відеостудія: 360° обліт, таймлапс монтажу, вибух-схема та 4K фото"
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-[#1A2E3B] to-[#2D3748] text-white hover:bg-black shadow-sm transition-all transform active:scale-95 whitespace-nowrap cursor-pointer shrink-0"
          >
            <Film className="w-3.5 h-3.5 text-[#DE7C5A]" />
            <span className="hidden sm:inline">Відеостудія 3D</span>
            <span className="sm:hidden text-[11px]">Відео</span>
            {isRecording && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
          </button>

          {/* Button 'Перегляд в AR' */}
          <button
            type="button"
            onClick={() => setIsARModalOpen(true)}
            title="Перегляд купола у доповненій реальності (AR) через камеру смартфона"
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-[#DE7C5A] to-[#C9603D] text-white hover:opacity-95 shadow-sm transition-all transform active:scale-95 whitespace-nowrap cursor-pointer shrink-0"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Перегляд в AR</span>
            <span className="sm:hidden text-[11px]">AR</span>
          </button>

          {/* Button: Exploded View toggle */}
          <button
            type="button"
            onClick={() => {
              const next = !isExplodedActive;
              setIsExplodedActive(next);
              if (!next) {
                setExplodedProgress(0);
                setIsExplodedPlaying(false);
              } else {
                setExplodedProgress(0.65);
              }
            }}
            title="Вибух-схема: радіальний розліт обшивки та балок купола назовні"
            className={`flex items-center gap-1 px-1.5 sm:px-2 py-1 sm:py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer shrink-0 ${
              isExplodedActive || explodedProgress > 0.05
                ? "bg-[#4A7C9B] text-white font-bold shadow-2xs"
                : "tactile-btn text-[#5A6778]"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span className="hidden md:inline">Вибух-схема</span>
            <span className="md:hidden text-[11px]">Вибух</span>
          </button>

          {/* Button: Human 1.8m scale figure toggle */}
          <button
            type="button"
            onClick={() => setShowHumanScale(!showHumanScale)}
            title="Фігура людини зростом 1.80 м для наочного відчуття реального масштабу"
            className={`flex items-center gap-1 px-1.5 sm:px-2 py-1 sm:py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer shrink-0 ${
              showHumanScale
                ? "bg-[#0284C7] text-white font-bold shadow-2xs"
                : "tactile-btn text-[#5A6778]"
            }`}
          >
            <User className="w-3.5 h-3.5 text-[#7DD3FC]" />
            <span className="hidden md:inline">Людина 1.8м</span>
            <span className="md:hidden text-[11px]">1.8м</span>
          </button>

          {/* Button: Environment theme cycler */}
          <button
            type="button"
            onClick={() => {
              const themes: Array<"studio" | "nature" | "sunset" | "night"> = ["studio", "nature", "sunset", "night"];
              const nextIdx = (themes.indexOf(environmentTheme) + 1) % themes.length;
              setEnvironmentTheme(themes[nextIdx]);
            }}
            title={`Оточення: ${
              environmentTheme === "studio"
                ? "Мінімалістична студія"
                : environmentTheme === "nature"
                ? "Ліс та газон"
                : environmentTheme === "sunset"
                ? "Золота година / Захід"
                : "Зоряна ніч"
            }. Клікніть для зміни оточення.`}
            className="flex items-center gap-1 px-1.5 sm:px-2 py-1 sm:py-1.5 text-xs font-semibold rounded-xl tactile-btn text-[#5A6778] transition-all cursor-pointer shrink-0"
          >
            {environmentTheme === "studio" && <Box className="w-3.5 h-3.5 text-[#8B5E34]" />}
            {environmentTheme === "nature" && <TreePine className="w-3.5 h-3.5 text-[#2E7D32]" />}
            {environmentTheme === "sunset" && <Sun className="w-3.5 h-3.5 text-[#EA580C]" />}
            {environmentTheme === "night" && <Moon className="w-3.5 h-3.5 text-[#6366F1]" />}
            <span className="hidden lg:inline capitalize">
              {environmentTheme === "studio" ? "Студія" : environmentTheme === "nature" ? "Природа" : environmentTheme === "sunset" ? "Захід" : "Ніч"}
            </span>
          </button>

          <span className="w-[1px] h-4 bg-[#DCD6CA] mx-0.5 shrink-0" />

          {/* Camera presets */}
          <button
            type="button"
            onClick={setViewTop}
            title="Вид зверху (План)"
            className="hidden sm:inline-block px-2 py-1 text-xs font-medium rounded-xl tactile-btn text-[#4A5568] shrink-0 cursor-pointer"
          >
            План
          </button>

          <button
            type="button"
            onClick={setViewFront}
            title="Вид спереду (Фасад)"
            className="hidden sm:inline-block px-2 py-1 text-xs font-medium rounded-xl tactile-btn text-[#4A5568] shrink-0 cursor-pointer"
          >
            Фасад
          </button>

          <button
            type="button"
            onClick={setViewInside}
            title="Огляд зсередини (інтер'єр та внутрішня обшивка)"
            className="hidden sm:inline-block px-2 py-1 text-xs font-medium rounded-xl tactile-btn text-[#4A5568] shrink-0 cursor-pointer"
          >
            Зсередини
          </button>

          <button
            type="button"
            onClick={resetCamera}
            title="Скинути ракурс"
            className="p-1 sm:p-1.5 rounded-xl text-xs tactile-btn text-[#4A5568] shrink-0 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 360° Circular Orbit Flyaround Interactive Control Bar */}
      {isOrbitActive && (
        <div className="absolute top-20 sm:top-22 left-3 right-3 sm:left-4 sm:right-auto z-20 animate-in fade-in slide-in-from-top-2 duration-150 max-w-[calc(100%-24px)] sm:max-w-2xl">
          <div className="flex flex-col gap-2 p-2.5 sm:p-3 rounded-2xl tactile-card backdrop-blur-md bg-[#FAF7F2]/95 border border-[#DE7C5A] shadow-xl text-xs text-[#1A2E3B]">
            {/* Top row: Status, play/pause, angle radar, and close */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#DE7C5A] to-[#E5A352] flex items-center justify-center text-white shadow-2xs shrink-0">
                  <RotateCw className={`w-4 h-4 ${isOrbitPlaying ? "animate-spin" : ""}`} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-[#1A2E3B]">360° Круговий обліт</span>
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                      {currentOrbitAngleDeg}° / 360°
                    </span>
                  </div>
                  <p className="text-[10px] text-[#6B7280] hidden sm:block">
                    Кінематографічне кругове обертання камери навколо геокупола
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Play / Pause button */}
                <button
                  type="button"
                  onClick={() => setIsOrbitPlaying(!isOrbitPlaying)}
                  className={`px-2.5 py-1 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1 shadow-2xs ${
                    isOrbitPlaying
                      ? "bg-[#1A2E3B] text-white"
                      : "bg-[#DE7C5A] text-white hover:bg-[#C9603D]"
                  }`}
                  title={isOrbitPlaying ? "Призупинити обліт" : "Продовжити обліт"}
                >
                  {isOrbitPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{isOrbitPlaying ? "Пауза" : "Пуск"}</span>
                </button>

                {/* Close bar */}
                <button
                  type="button"
                  onClick={() => {
                    setIsOrbitActive(false);
                    setIsOrbitPlaying(false);
                  }}
                  className="p-1 text-[#64748B] hover:text-[#1E293B] hover:bg-black/5 rounded-xl cursor-pointer"
                  title="Закрити панель обльоту"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Middle row: Speed, Direction, Altitude Preset Controls */}
            <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-[#E8E2D8] text-[11px]">
              {/* Speed Buttons */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold text-[#5A6778]">Швидкість:</span>
                {[0.5, 1, 2].map(spd => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setOrbitSpeed(spd)}
                    className={`px-1.5 py-0.5 rounded-lg font-mono font-bold transition-all ${
                      orbitSpeed === spd
                        ? "bg-[#1A2E3B] text-white shadow-2xs"
                        : "bg-white border border-[#DCD6CA] text-[#4A5568] hover:bg-[#F3EFE6]"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              {/* Direction Button */}
              <button
                type="button"
                onClick={() => setOrbitDirection(orbitDirection === 1 ? -1 : 1)}
                className="px-2 py-0.5 rounded-lg bg-white border border-[#DCD6CA] text-[#4A5568] hover:bg-[#F3EFE6] font-semibold transition-all flex items-center gap-1 cursor-pointer"
                title="Змінити напрямок обертання"
              >
                <span>Напрямок:</span>
                <span className="font-bold">{orbitDirection === 1 ? "↻ За годинниковою" : "↺ Проти"}</span>
              </button>

              {/* Altitude presets */}
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[10px] font-semibold text-[#5A6778]">Ракурс:</span>
                {(["low", "medium", "high", "wave"] as const).map(alt => (
                  <button
                    key={alt}
                    type="button"
                    onClick={() => setOrbitAltitude(alt)}
                    className={`px-1.5 py-0.5 rounded-lg text-[10px] font-semibold transition-all ${
                      orbitAltitude === alt
                        ? "bg-[#DE7C5A] text-white font-bold shadow-2xs"
                        : "bg-white border border-[#DCD6CA] text-[#4A5568] hover:bg-[#F3EFE6]"
                    }`}
                  >
                    {alt === "low" ? "Фасад" : alt === "medium" ? "45° Ізо" : alt === "high" ? "Дрон ✈" : "Хвиля ~"}
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom row: Direct 360° Video Recording Trigger */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-[#E8E2D8]">
              {isRecording ? (
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                    <span className="font-bold text-xs text-red-600">
                      Йде запис 360° відео: {Math.round(recordingProgress)}% ({currentOrbitAngleDeg}° / 360°)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleStopRecording}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm cursor-pointer"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    <span>Зупинити та зберегти</span>
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#5A6778]">
                    <span>Тривалість відео:</span>
                    {[5, 10, 15].map(sec => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => setOrbitRecordDuration(sec)}
                        className={`px-2 py-0.5 rounded-lg font-mono font-bold text-[10px] transition-all ${
                          orbitRecordDuration === sec
                            ? "bg-[#8B5E34] text-white shadow-2xs"
                            : "bg-white border border-[#DCD6CA] text-[#4A5568] hover:bg-[#F3EFE6]"
                        }`}
                      >
                        {sec}с
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleStart360OrbitRecording(orbitRecordDuration)}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-red-600 to-[#EA580C] hover:from-red-700 hover:to-[#C2410C] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-red-500/20 cursor-pointer transition-all transform active:scale-95"
                  >
                    <Video className="w-3.5 h-3.5 fill-current" />
                    <span>🔴 Записати відео прольоту 360° ({orbitRecordDuration}с)</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Exploded View Dynamic Slider Control */}
      {isExplodedActive && (
        <div className="absolute top-20 sm:top-22 left-3 sm:left-4 z-20 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl tactile-card backdrop-blur-md bg-[#FAF7F2]/95 border border-[#38BDF8] shadow-lg text-xs text-[#1A2E3B]">
            <div className="flex items-center gap-1.5 font-bold text-[#0369A1]">
              <Sparkles className="w-4 h-4 text-[#0284C7]" />
              <span>Вибух-схема:</span>
            </div>

            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={explodedProgress}
              onChange={e => {
                setIsExplodedPlaying(false);
                setExplodedProgress(parseFloat(e.target.value));
              }}
              className="w-24 sm:w-36 h-2 rounded-lg bg-[#E8E2D8] accent-[#0284C7] cursor-pointer"
              title="Ступінь розльоту деталей від 0% до 100%"
            />

            <span className="font-mono font-bold text-[11px] bg-white px-2 py-0.5 rounded-lg border border-[#CBD5E1] min-w-[45px] text-center">
              {Math.round(explodedProgress * 100)}%
            </span>

            <button
              type="button"
              onClick={() => setIsExplodedPlaying(!isExplodedPlaying)}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 ${
                isExplodedPlaying
                  ? "bg-[#0284C7] text-white shadow-2xs"
                  : "bg-white text-[#0369A1] border border-[#CBD5E1] hover:bg-[#F0F9FF]"
              }`}
            >
              {isExplodedPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
              <span>{isExplodedPlaying ? "Пауза" : "Анімувати"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsExplodedActive(false);
                setExplodedProgress(0);
                setIsExplodedPlaying(false);
              }}
              className="p-1 text-[#64748B] hover:text-[#1E293B] hover:bg-black/5 rounded-lg cursor-pointer"
              title="Закрити вибух-схему"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Active Conversion Mode Contextual Floating Banner */}
      {conversionMode === "door" && (
        <div className="absolute top-20 sm:top-22 left-3 right-3 sm:left-4 sm:right-auto z-20 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[#FFFBEB]/95 backdrop-blur-md border border-[#FDE68A] shadow-md text-xs text-[#92400E]">
            <div className="flex items-center gap-2">
              <DoorOpen className="w-4 h-4 text-[#D97706] shrink-0" />
              <div>
                <span className="font-bold">Режим конвертації у дверний пройм:</span>
                <span className="text-[11px] text-[#B45309] block sm:inline sm:ml-1.5">
                  Клікніть на нижній трикутник купола (сусідній захоплюється автоматично)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1 text-[11px] font-semibold bg-white px-2 py-0.5 rounded-lg border border-[#FDE68A]">
                <span>Ш:</span>
                <input
                  type="number"
                  min={700}
                  max={1500}
                  step={50}
                  value={doorParams.widthMm}
                  onChange={e => onChangeDoorParams && onChangeDoorParams({ widthMm: Number(e.target.value) })}
                  className="w-14 font-mono font-bold text-center text-[#92400E] outline-none"
                />
                <span>мм</span>
              </label>
              <label className="flex items-center gap-1 text-[11px] font-semibold bg-white px-2 py-0.5 rounded-lg border border-[#FDE68A]">
                <span>В:</span>
                <input
                  type="number"
                  min={1800}
                  max={2400}
                  step={50}
                  value={doorParams.heightMm}
                  onChange={e => onChangeDoorParams && onChangeDoorParams({ heightMm: Number(e.target.value) })}
                  className="w-14 font-mono font-bold text-center text-[#92400E] outline-none"
                />
                <span>мм</span>
              </label>
              {activeDoorFaceIds.length > 0 && onClearDoorway && (
                <button
                  type="button"
                  onClick={onClearDoorway}
                  className="px-2 py-1 text-[11px] font-bold text-red-600 bg-white hover:bg-red-50 border border-red-200 rounded-lg cursor-pointer"
                >
                  Очистити
                </button>
              )}
              <button
                type="button"
                onClick={() => setConversionMode("none")}
                className="p-1 text-[#92400E] hover:bg-white rounded-lg cursor-pointer"
                title="Закрити режим"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {conversionMode === "solar" && (
        <div className="absolute top-20 sm:top-22 left-2 right-2 sm:left-4 sm:right-auto z-20 animate-in fade-in slide-in-from-top-2 duration-150 max-w-[calc(100%-16px)] sm:max-w-2xl">
          <div className="flex flex-col gap-2 p-3 rounded-2xl bg-[#EDE9FE]/95 backdrop-blur-md border border-[#DDD6FE] shadow-lg text-xs text-[#5B21B6]">
            {/* Header row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sun className="w-4 h-4 text-[#EA580C] shrink-0 animate-pulse" />
                <div>
                  <span className="font-bold text-[#4C1D95]">Розрахунок орієнтації сонця та BIPV панелі:</span>
                  <span className="text-[11px] text-[#6D28D9] block sm:inline sm:ml-1.5">
                    Клікніть на будь-який трикутник або оберіть найбільш ефективні
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Heatmap toggle */}
                <button
                  type="button"
                  onClick={() => onChangeSolarParams && onChangeSolarParams({ heatmapEnabled: !solarParams.heatmapEnabled })}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer border transition-all ${
                    solarParams.heatmapEnabled
                      ? "bg-[#EA580C] text-white border-[#C2410C] shadow-2xs"
                      : "bg-white text-[#5A6778] border-[#E8E2D8] hover:bg-[#F5F1E9]"
                  }`}
                  title="Увімкнути/вимкнути 3D сонячну теплову карту"
                >
                  {solarParams.heatmapEnabled ? "Heatmap ✓" : "Heatmap"}
                </button>

                <button
                  type="button"
                  onClick={() => setConversionMode("none")}
                  className="p-1 text-[#5B21B6] hover:bg-white rounded-lg cursor-pointer"
                  title="Закрити режим"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick 1-click Auto Select Actions */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-[#DDD6FE]/70">
              <span className="text-[10px] font-semibold text-[#6D28D9]">Авто-підсвітка:</span>

              <button
                type="button"
                onClick={() => onSetSolarFaceIds && onSetSolarFaceIds(solarAnalysis.optimalFaceIds)}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-[#EA580C] hover:bg-[#C2410C] text-white shadow-2xs cursor-pointer flex items-center gap-1"
                title="Обрати всі трикутники з коефіцієнтом сонячної ефективності ≥85%"
              >
                <span>🔥 Оптимальні (≥85%)</span>
                <span className="bg-black/20 px-1 rounded font-mono">{solarAnalysis.optimalFaceIds.length}</span>
              </button>

              <button
                type="button"
                onClick={() => onSetSolarFaceIds && onSetSolarFaceIds(solarAnalysis.sortedByEfficiency.slice(0, 12))}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white hover:bg-[#F5F3FF] border border-[#DDD6FE] text-[#6D28D9] cursor-pointer flex items-center gap-1"
                title="Обрати топ-12 найпродуктивніших трикутників"
              >
                <span>⭐ Топ-12</span>
              </button>

              <button
                type="button"
                onClick={() => onSetSolarFaceIds && onSetSolarFaceIds(solarAnalysis.southFacingFaceIds)}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white hover:bg-[#F5F3FF] border border-[#DDD6FE] text-[#6D28D9] cursor-pointer flex items-center gap-1"
                title="Обрати всі грані південного сектору купола"
              >
                <span>🧭 Південь ({solarAnalysis.southFacingFaceIds.length})</span>
              </button>

              {activeSolarFaceIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onSetSolarFaceIds && onSetSolarFaceIds([])}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white hover:bg-red-50 border border-red-200 text-red-600 cursor-pointer ml-auto"
                >
                  Очистити ({activeSolarFaceIds.length})
                </button>
              )}
            </div>

            {/* Live generation metrics pill & Heatmap legend */}
            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-[#DDD6FE]/60 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[#5B21B6]">Обрано:</span>
                <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-white border border-[#DDD6FE] text-[#5B21B6]">
                  {activeSolarFaceIds.length} шт · {(solarGen.peakPowerWatts / 1000).toFixed(2)} кВт · ~{solarGen.annualKWh} кВт·год/рік
                </span>
              </div>

              <div className="flex items-center gap-1 text-[9px] font-bold">
                <span className="px-1 py-0.2 rounded bg-[#EA580C] text-white">🔥 ≥92%</span>
                <span className="px-1 py-0.2 rounded bg-[#F59E0B] text-white">☀️ 85%</span>
                <span className="px-1 py-0.2 rounded bg-[#EAB308] text-white">⚡ 75%</span>
                <span className="px-1 py-0.2 rounded bg-[#84CC16] text-white">🌿 65%</span>
                <span className="px-1 py-0.2 rounded bg-[#475569] text-white">❄️ &lt;65%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {conversionMode === "window" && (
        <div className="absolute top-20 sm:top-22 left-3 right-3 sm:left-4 sm:right-auto z-20 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[#F0F9FF]/95 backdrop-blur-md border border-[#BAE6FD] shadow-md text-xs text-[#0369A1]">
            <div className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-[#0284C7] shrink-0" />
              <div>
                <span className="font-bold">Режим трикутних вікон:</span>
                <span className="text-[11px] text-[#0284C7] block sm:inline sm:ml-1.5">
                  Клікніть на трикутник для конвертації у склопакет або полікарбонат
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeWindowFaceIds.length > 0 && (
                <span className="font-mono font-bold text-[11px] bg-white px-2 py-1 rounded-lg border border-[#BAE6FD] text-[#0284C7]">
                  {activeWindowFaceIds.length} вікон
                </span>
              )}
              <button
                type="button"
                onClick={() => setConversionMode("none")}
                className="p-1 text-[#0369A1] hover:bg-white rounded-lg cursor-pointer"
                title="Закрити режим"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {conversionMode === "fabric_strip" && (
        <div className="absolute top-20 sm:top-22 left-3 right-3 sm:left-4 sm:right-auto z-20 animate-in fade-in slide-in-from-top-2 duration-150 max-w-[calc(100%-16px)] sm:max-w-2xl">
          <div className="flex flex-col gap-2 p-3 rounded-2xl bg-[#FFFBEB]/95 backdrop-blur-md border border-[#FDE68A] shadow-lg text-xs text-[#92400E]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Scissors className="w-4 h-4 text-[#D97706] shrink-0" />
                <div>
                  <span className="font-bold">Вибір смуги розкрою тканини / тенту:</span>
                  <span className="text-[11px] text-[#B45309] block sm:inline sm:ml-1.5">
                    Клацайте по суміжних трикутниках купола від основи до вершини
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-[11px] bg-white px-2 py-1 rounded-lg border border-[#FDE68A] text-[#92400E]">
                  {activeFabricStripFaceIds.length} трикутників
                </span>
                <button
                  type="button"
                  onClick={() => setConversionMode("none")}
                  className="p-1 text-[#92400E] hover:bg-white rounded-lg cursor-pointer"
                  title="Закрити режим"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Action Toolbar */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-[#FDE68A]/70">
              {activeWindowFaceIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onCopyWindowsToFabricStrip && onCopyWindowsToFabricStrip()}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-[#0284C7] hover:bg-[#0369A1] text-white shadow-2xs cursor-pointer flex items-center gap-1"
                  title="Скопіювати конфігурацію вікон як смугу тканини"
                >
                  <Sun className="w-3 h-3 text-amber-300" />
                  <span>Взяти з вікон ({activeWindowFaceIds.length})</span>
                </button>
              )}

              {activeFabricStripFaceIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onClearFabricStrip && onClearFabricStrip()}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white hover:bg-red-50 border border-red-200 text-red-600 cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Очистити</span>
                </button>
              )}

              {onNavigateToSheathing && (
                <button
                  type="button"
                  onClick={() => onNavigateToSheathing()}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#D97706] hover:bg-[#B45309] text-white shadow-2xs cursor-pointer ml-auto flex items-center gap-1"
                >
                  <span>До розкрою тенту →</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showInnerSheathing && (
        <div className="absolute top-20 sm:top-22 right-3 z-20 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-[#CBD5E1] shadow-md text-xs text-[#334155]">
            <Home className="w-3.5 h-3.5 text-[#64748B]" />
            <span className="font-semibold text-[11px]">Внутрішня обшивка:</span>
            <select
              value={innerSheathingParams?.material || "drywall"}
              onChange={e => onChangeInnerSheathingParams && onChangeInnerSheathingParams({ material: e.target.value as any })}
              className="text-[11px] font-bold bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg px-2 py-0.5 outline-none cursor-pointer"
            >
              <option value="drywall">Гіпсокартон 12.5 мм</option>
              <option value="chipboard">ДСП плита 16 мм</option>
              <option value="osb3">Плита OSB-3 9 мм</option>
              <option value="plywood_fk">Фанера ФК 9 мм</option>
            </select>
          </div>
        </div>
      )}

      {/* 3D Assembly Step-by-Step Control Panel (Draggable & Collapsible) */}
      {assemblyState.isActive ? (
        <AssemblyControlBar
          state={assemblyState}
          visibility={assemblyVisibility}
          onChangeState={setAssemblyState}
          onSetStep={handleSetAssemblyStep}
          onClose={handleToggleAssemblyMode}
        />
      ) : (renderMode === "sheathing" || renderMode === "hybrid") && selectedFaceId === null ? (
        <>
          {/* Mobile Collapsed Sheathing Bar Trigger */}
          {isSheathingBarCollapsed && (
            <div className="absolute bottom-3 left-3 sm:hidden z-10">
              <button
                type="button"
                onClick={() => setIsSheathingBarCollapsed(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl tactile-card backdrop-blur-md bg-[#FAF7F2]/95 border border-white/90 shadow-md text-xs font-bold text-[#8B5E34] cursor-pointer"
              >
                <Triangle className="w-3.5 h-3.5 text-[#DE7C5A]" />
                <span>Панелі ({totalProjectPanelsCount}) · {plywoodThickness} мм</span>
                <ChevronUp className="w-3.5 h-3.5 text-[#5A6778]" />
              </button>
            </div>
          )}

          {/* Full Sheathing Panel */}
          <div className={`absolute bottom-3 left-3 right-3 sm:left-4 sm:right-auto flex flex-col gap-2 p-2.5 rounded-2xl tactile-card backdrop-blur-md bg-[#FAF7F2]/95 border border-white/90 shadow-lg text-xs z-10 animate-in fade-in slide-in-from-bottom-2 duration-150 max-w-[calc(100%-24px)] sm:max-w-3xl max-h-[45vh] overflow-y-auto ${
            isSheathingBarCollapsed ? "hidden sm:flex" : "flex"
          }`}>
            {/* Row 1: Types & Filters */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1.5 font-bold text-[#1A2E3B] pr-2 mr-1 border-r border-[#DCD6CA]">
                <Triangle className="w-3.5 h-3.5 text-[#DE7C5A]" />
                <span>Панелі ({totalProjectPanelsCount} шт):</span>
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
                Всі ({totalProjectPanelsCount})
              </button>

              {/* Door vestibule indicator badge */}
              {doorInfillPanelsCount > 0 && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                  <span>🚪 Тамбур (+{doorInfillPanelsCount} шт)</span>
                </div>
              )}

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

                {/* Toggle Node Numbering */}
                <button
                  type="button"
                  onClick={() => setShowNodeLabels(!showNodeLabels)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-medium transition-all cursor-pointer ${
                    showNodeLabels
                      ? "bg-[#5B9279] text-white font-bold shadow-2xs"
                      : "bg-white/80 hover:bg-white text-[#5A6778] border border-[#E8E2D8]"
                  }`}
                  title="Включити/виключити нумерацію вузлів (маркування типу АА1, АА2, ДВ43...)"
                >
                  <CircleDot className="w-3 h-3" />
                  <span>Вузли {showNodeLabels ? "Увімк." : "Вимк."}</span>
                </button>

                {/* Toggle Style: Colored vs Plywood */}
                <button
                  onClick={() => setSheathingStyle(sheathingStyle === "colored" ? "plywood" : "colored")}
                  className="px-2 py-1 rounded-xl text-[11px] font-medium bg-white/80 hover:bg-white text-[#5A6778] border border-[#E8E2D8] transition-all whitespace-nowrap"
                  title="Перемкнути між кольоровими типами та текстурою фанери"
                >
                  {sheathingStyle === "colored" ? "🎨 Кольори типів" : "🪵 Фанера/OSB"}
                </button>

                {/* Mobile collapse button */}
                <button
                  type="button"
                  onClick={() => setIsSheathingBarCollapsed(true)}
                  className="sm:hidden p-1 rounded-xl tactile-btn text-[#5A6778] hover:text-[#1A2E3B]"
                  title="Згорнути панель"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
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

            {/* Row 3: Seam gap slider between triangles (0 to 10 mm, defaults to 0 mm) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E8E2D8] text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 font-bold text-[#8B5E34]">
                  <Triangle className="w-3.5 h-3.5 text-[#DE7C5A]" />
                  <span>Зазор між трикутниками:</span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={seamGapMm}
                    onChange={e => handleSeamGapChange(parseFloat(e.target.value) || 0)}
                    className="w-24 sm:w-36 h-2 rounded-lg bg-[#E8E2D8] accent-[#DE7C5A] cursor-pointer"
                    title="Зазор між трикутниками обшивки від 0 до 10 мм"
                  />
                  <span className="font-mono font-bold text-xs text-[#DE7C5A] bg-white px-2 py-0.5 rounded-lg border border-[#DCD6CA] min-w-[55px] text-center">
                    {seamGapMm === 0 ? "0 мм (встик)" : `${seamGapMm} мм`}
                  </span>
                </div>

                {/* Quick gap presets */}
                <div className="flex items-center gap-1">
                  {[0, 2, 3, 5, 10].map(gap => (
                    <button
                      key={gap}
                      type="button"
                      onClick={() => handleSeamGapChange(gap)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold transition-all cursor-pointer ${
                        seamGapMm === gap
                          ? "bg-[#DE7C5A] text-white font-bold shadow-2xs"
                          : "bg-white/80 hover:bg-white text-[#5A6778] border border-[#E8E2D8]"
                      }`}
                      title={gap === 0 ? "Встановити зазор 0 мм (панелі встик)" : `Встановити зазор ${gap} мм`}
                    >
                      {gap === 0 ? "0 мм" : `${gap} мм`}
                    </button>
                  ))}
                </div>
              </div>

              <span className="text-[10px] text-[#8C9BAE] hidden md:inline italic">
                {seamGapMm === 0 ? "Панелі щільно з'єднані без зазору" : `Компенсаційний шов ${seamGapMm} мм між суміжними панелями`}
              </span>
            </div>
          </div>
        </>
      ) : (
        /* Interactive Helper Overlay (Bottom-Left) - desktop only to prevent mobile 3D occlusion */
        <div className="hidden sm:flex absolute bottom-4 left-4 px-3.5 py-2 rounded-xl tactile-card text-xs text-[#5A6778] backdrop-blur-md bg-[#FAF7F2]/90 border border-white/80 items-center gap-3">
          <div className="flex items-center gap-2">
            <RotateCw className="w-3.5 h-3.5 text-[#5B9279]" />
            <span><b>Затисніть ліву кнопку миші</b> або проведіть пальцем для 3D обертання купола</span>
          </div>
          <span className="text-slate-300">|</span>
          <button
            onClick={handleToggleConnectors}
            className="text-[#4A7C9B] hover:underline font-semibold cursor-pointer"
          >
            {showConnectors ? "Сховати конектори" : "Показати лучеві конектори"}
          </button>
        </div>
      )}

      {/* Active Window Mode Floating Helper Banner (Top-Center) */}
      {windowMode && (
        <div className="absolute top-20 sm:top-22 left-1/2 -translate-x-1/2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl tactile-card backdrop-blur-md bg-[#FAF7F2]/95 border border-[#38BDF8] shadow-lg flex items-center gap-2 sm:gap-3 z-20 max-w-[calc(100%-24px)] animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="w-2 h-2 rounded-full bg-[#0284C7] animate-ping shrink-0" />
          <div className="text-[11px] sm:text-xs text-[#1A2E3B] truncate">
            <span className="font-bold text-[#0369A1]">Режим вікон: </span>
            <span className="hidden sm:inline">доторкніться до будь-якого трикутника для конверсії</span>
            <span className="sm:hidden">торкніться грані</span>
          </div>
          <span className="px-1.5 sm:px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-[#E0F2FE] text-[#0369A1] whitespace-nowrap shrink-0">
            Вікон: {activeWindowFaceIds.length}
          </span>
          <button
            onClick={() => setWindowMode(false)}
            className="px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold rounded-lg bg-[#0284C7] text-white hover:bg-[#0369A1] transition-all shrink-0 shadow-2xs cursor-pointer"
          >
            Готово
          </button>
        </div>
      )}

      {/* Selected Element Quick Strip or Interactive Window HUD (Bottom-Right / Bottom on Mobile) */}
      {selectedFaceId !== null ? (() => {
        const face = model.faces[selectedFaceId];
        if (!face) return null;
        const group = model.faceGroups.find(g => g.type === face.type);
        const isWindow = activeWindowFaceIds.includes(face.id);
        const areaM2 = face.area / 1_000_000;
        const glazing = GLAZING_OPTIONS[windowParams?.glazingType || "double_glass"] || GLAZING_OPTIONS.double_glass;
        const frame = WINDOW_FRAME_OPTIONS[windowParams?.frameColor || "anthracite"] || WINDOW_FRAME_OPTIONS.anthracite;

        // Minimized compact bottom bar: ensures 3D viewport remains 100% visible and interactive on mobile
        if (isFaceHudMinimized) {
          return (
            <div className="absolute bottom-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:bottom-4 px-3.5 py-2.5 rounded-2xl tactile-card backdrop-blur-md bg-[#FAF7F2]/95 border border-white/90 shadow-xl flex items-center justify-between gap-2.5 z-20 animate-in fade-in slide-in-from-bottom-2 duration-150 max-w-md">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                  isWindow ? "bg-[#E0F2FE] text-[#0284C7]" : "bg-[#FDF0E6] text-[#DE7C5A]"
                }`}>
                  {isWindow ? <Sun className="w-4 h-4 text-[#0284C7]" /> : <Triangle className="w-4 h-4 text-[#DE7C5A]" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[#1A2E3B] truncate">
                      {isWindow ? `Вікно #${face.id}` : `Грань #${face.id}`}
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                      isWindow ? "bg-[#E0F2FE] text-[#0369A1]" : "bg-[#FAF5EE] text-[#8B6534]"
                    }`}>
                      Тип {face.type}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#5A6778] block truncate">
                    {areaM2.toFixed(3)} м² · {isWindow ? glazing.shortName : "Обшивка"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {onToggleWindowFace && (
                  <button
                    type="button"
                    onClick={() => onToggleWindowFace(face.id)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer flex items-center gap-1 active:scale-95 ${
                      isWindow
                        ? "bg-[#FAF5EE] hover:bg-[#F5EBE0] text-[#8B6534] border border-[#E8D9C8]"
                        : "bg-gradient-to-r from-[#0284C7] to-[#0369A1] text-white"
                    }`}
                  >
                    {isWindow ? <span>🪵 В обшивку</span> : <span>🪟 У вікно</span>}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsFaceHudMinimized(false)}
                  className="p-1.5 rounded-xl tactile-btn text-[#5A6778] hover:text-[#1A2E3B]"
                  title="Розгорнути деталі вікна та параметри скління"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onSelectFace(null)}
                  className="p-1.5 rounded-xl tactile-btn text-[#8C9BAE] hover:text-[#1A2E3B]"
                  title="Закрити"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        }

        // Expanded full face & window inspector card
        return (
          <div className="absolute bottom-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:bottom-4 p-3.5 sm:p-4 rounded-3xl tactile-card backdrop-blur-md bg-[#FAF7F2]/95 border border-white/90 shadow-2xl flex flex-col gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200 z-20 w-auto sm:w-96 max-w-[calc(100vw-24px)] max-h-[52vh] sm:max-h-none overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E8E2D8] pb-2">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  isWindow ? "bg-[#E0F2FE] text-[#0284C7]" : "bg-[#FDF0E6] text-[#DE7C5A]"
                }`}>
                  {isWindow ? <Sun className="w-4 h-4 text-[#0284C7]" /> : <Triangle className="w-4 h-4 text-[#DE7C5A]" />}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-[#1A2E3B]">
                      {isWindow ? `Вікно на каркасі #${face.id}` : `Грань обшивки #${face.id}`}
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                      isWindow ? "bg-[#E0F2FE] text-[#0369A1] border border-[#BAE6FD]" : "bg-[#FAF5EE] text-[#8B6534] border border-[#EFE7DC]"
                    }`}>
                      Тип {face.type}
                    </span>
                  </div>
                  <span className="text-[10px] sm:text-[11px] text-[#5A6778]">
                    {group?.lengths.join(" × ")} мм · {areaM2.toFixed(3)} м²
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsFaceHudMinimized(true)}
                  className="p-1.5 rounded-xl tactile-btn text-[#5A6778] hover:text-[#1A2E3B] transition-colors"
                  title="Згорнути вікно, щоб повністю бачити 3D купол"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onSelectFace(null)}
                  className="p-1.5 rounded-xl tactile-btn text-[#8C9BAE] hover:text-[#1A2E3B] transition-colors"
                  title="Закрити панель"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Big Primary Conversion Action Button */}
            {onToggleWindowFace && (
              <button
                type="button"
                onClick={() => onToggleWindowFace(face.id)}
                className={`w-full py-2.5 px-3 rounded-2xl text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2 transform active:scale-98 ${
                  isWindow
                    ? "bg-[#FAF5EE] hover:bg-[#F5EBE0] text-[#8B6534] border border-[#E8D9C8]"
                    : "bg-gradient-to-r from-[#0284C7] to-[#0369A1] hover:brightness-105 text-white"
                }`}
              >
                {isWindow ? (
                  <>
                    <span>🪵</span>
                    <span>Повернути у глуху обшивку</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-4 h-4 text-amber-300" />
                    <span>Конвертувати у вікно на каркасі</span>
                  </>
                )}
              </button>
            )}

            {/* Glazing & Frame Configuration (if window or configuring) */}
            {onChangeWindowParams && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#E8E2D8]/80 text-[11px]">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-[#8C9BAE]">Тип скління:</span>
                  <select
                    value={windowParams?.glazingType || "double_glass"}
                    onChange={e =>
                      onChangeWindowParams({
                        ...(windowParams || DEFAULT_WINDOW_PARAMS),
                        glazingType: e.target.value as any
                      })
                    }
                    className="bg-white px-2 py-1 rounded-xl border border-[#DCD6CA] text-[#1A2E3B] font-medium outline-none text-[11px] shadow-2xs cursor-pointer"
                  >
                    {Object.values(GLAZING_OPTIONS).map(g => (
                      <option key={g.id} value={g.id}>
                        {g.shortName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold text-[#8C9BAE]">Притискний оклад:</span>
                  <select
                    value={windowParams?.frameColor || "anthracite"}
                    onChange={e =>
                      onChangeWindowParams({
                        ...(windowParams || DEFAULT_WINDOW_PARAMS),
                        frameColor: e.target.value as any
                      })
                    }
                    className="bg-white px-2 py-1 rounded-xl border border-[#DCD6CA] text-[#1A2E3B] font-medium outline-none text-[11px] shadow-2xs cursor-pointer"
                  >
                    {Object.values(WINDOW_FRAME_OPTIONS).map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Quick Batch Presets */}
            {onSetWindowFaceIds && (
              <div className="flex items-center justify-between pt-1 border-t border-[#E8E2D8]/80 text-[10px]">
                <span className="text-[#8C9BAE] font-semibold">Швидкі пресети:</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      const oculusIds = getTopZenithOculusFaceIds(model);
                      onSetWindowFaceIds(Array.from(new Set([...activeWindowFaceIds, ...oculusIds])));
                    }}
                    className="px-2 py-0.5 rounded-lg bg-white hover:bg-[#E0F2FE] text-[#0284C7] font-bold border border-[#BAE6FD] transition-colors"
                    title="Зробити верхівку купола прозорим зенітним ліхтарем (Oculus)"
                  >
                    Верхівка (Окулус)
                  </button>
                  <button
                    onClick={() => {
                      const panIds = getPanoramicTierFaceIds(model);
                      onSetWindowFaceIds(Array.from(new Set([...activeWindowFaceIds, ...panIds])));
                    }}
                    className="px-2 py-0.5 rounded-lg bg-white hover:bg-[#E0F2FE] text-[#0284C7] font-bold border border-[#BAE6FD] transition-colors"
                    title="Зробити середній фасад панорамним віконним рядом"
                  >
                    Панорама
                  </button>
                  {activeWindowFaceIds.length > 0 && (
                    <button
                      onClick={() => onSetWindowFaceIds([])}
                      className="px-1.5 py-0.5 rounded-lg bg-white hover:bg-red-50 text-red-600 font-semibold border border-red-200 transition-colors"
                      title="Очистити всі встановлені вікна"
                    >
                      Скинути
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })() : (selectedNodeId !== null || selectedEdgeId !== null) && (
        <div className="absolute bottom-3 inset-x-3 sm:inset-x-auto sm:right-4 sm:bottom-4 px-3.5 sm:px-4 py-2 rounded-2xl tactile-card-mint backdrop-blur-md border border-white/80 flex items-center justify-between sm:justify-start gap-3 animate-in fade-in zoom-in-95 duration-200 z-10 max-w-md">
          <span className="text-xs font-semibold text-[#1A3E26] truncate">
            {selectedNodeId !== null && `Обрано Вузол #${selectedNodeId}`}
            {selectedEdgeId !== null && (() => {
              const e = model.edges[selectedEdgeId];
              const cutL = e.cutLength || Math.round(e.length - model.connectorParams.hubDiameter);
              return `Балка #${selectedEdgeId} (${e?.type}) · L: ${e?.length} мм · Обріз: ${cutL} мм`;
            })()}
          </span>
          <button
            onClick={() => {
              onSelectNode(null);
              onSelectEdge(null);
            }}
            className="text-xs font-bold text-[#8C9BAE] hover:text-[#1A3E26] shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* 3D Compass & Sun Orientation Indicator */}
      {(conversionMode === "solar" || Boolean(solarParams?.heatmapEnabled)) && (
        <div className="absolute bottom-3 left-3 z-10 pointer-events-auto">
          <div className="flex items-center gap-2 p-2 px-2.5 rounded-2xl tactile-card backdrop-blur-md bg-[#FAF7F2]/95 border border-white/90 shadow-md text-xs">
            <div className="relative w-8 h-8 rounded-full border border-[#DCD6CA] flex items-center justify-center bg-white shadow-2xs">
              {/* Rotatable compass rose */}
              <div
                className="absolute inset-0 flex items-center justify-center transition-transform duration-300 pointer-events-none"
                style={{ transform: `rotate(${-((solarParams?.domeOrientationDeg ?? 0))}deg)` }}
              >
                <span className="absolute top-0 text-[8px] font-black text-red-600 leading-none">Пн</span>
                <span className="absolute bottom-0 text-[8px] font-black text-[#EA580C] leading-none">Пд</span>
                <span className="absolute right-0 text-[8px] font-black text-[#5A6778] leading-none">Сх</span>
                <span className="absolute left-0 text-[8px] font-black text-[#5A6778] leading-none">Зх</span>
                {/* Sun pointer to South (180°) */}
                <div className="w-1.5 h-1.5 rounded-full bg-[#EA580C] shadow-2xs" />
              </div>
            </div>

            <div className="flex flex-col leading-tight">
              <div className="flex items-center gap-1 font-bold text-[#1A2E3B] text-[11px]">
                <Sun className="w-3 h-3 text-[#EA580C]" />
                <span>Сонце: Південь (180°)</span>
              </div>
              <span className="text-[10px] text-[#5A6778]">
                Нахил ~36° · Макс: {solarAnalysis.maxEfficiencyPct}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification when video recording completes from floating bar */}
      {recordedVideoUrl && !isRecording && !isVideoModalOpen && (
        <div className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-[#1B4D2E]/95 text-white backdrop-blur-md shadow-2xl border border-emerald-400/40 text-xs animate-in fade-in slide-in-from-bottom-2 max-w-[95%]">
          <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
          <span className="font-semibold whitespace-nowrap">Відео 360° обльоту збережено!</span>
          <a
            href={recordedVideoUrl}
            download={`geodome-orbit360-${model.parameters.frequency}V-${model.parameters.diameter}mm.webm`}
            className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold rounded-xl flex items-center gap-1 shadow-sm transition-all whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Завантажити</span>
          </a>
          <button
            type="button"
            onClick={() => setIsVideoModalOpen(true)}
            className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl transition-all whitespace-nowrap"
          >
            Переглянути
          </button>
          <button
            type="button"
            onClick={() => setRecordedVideoUrl(null)}
            className="p-1 hover:bg-white/20 rounded-lg text-white/70 hover:text-white"
            title="Закрити сповіщення"
          >
            <X className="w-3.5 h-3.5" />
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

      {/* 3D Video Studio & Motion Recording Modal */}
      <VideoExportModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        model={model}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        isRecording={isRecording}
        recordingProgress={recordingProgress}
        recordedVideoUrl={recordedVideoUrl}
        onTakeHighResSnapshot={handleTakeHighResSnapshot}
      />
    </div>
  );
};
