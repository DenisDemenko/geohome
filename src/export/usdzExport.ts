import * as THREE from "three";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import QRCode from "qrcode";
import { DomeModel } from "../core/types";

export interface USDZExportOptions {
  /** "1:1" (real architectural scale in meters), "1:10" (tabletop ~40cm), "1:20" (miniature ~20cm) */
  scale?: "1:1" | "1:10" | "1:20";
  style?: "hybrid" | "beams" | "sheathing";
  plywoodThickness?: number; // mm
  beamColorStyle?: "types" | "timber";
  sheathingStyle?: "colored" | "plywood";
}

const SHEATHING_PALETTE = [
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

const WOOD_TONES = ["#DCA46A", "#DEAA72", "#E5B47F", "#D49C62", "#CFA06E"];

/**
 * Builds a dedicated Three.js scene aligned with AR coordinate requirements:
 * - Y-up orientation (dome stands upright on floor/table)
 * - Floor detected by camera is at Y = 0
 * - Scaled in meters (0.001 for 1:1 scale, 0.0001 for 1:10 tabletop)
 */
export function buildARThreeScene(model: DomeModel, options: USDZExportOptions = {}): THREE.Scene {
  const {
    scale = "1:1",
    style = "hybrid",
    plywoodThickness = 12,
    beamColorStyle = "types",
    sheathingStyle = "colored"
  } = options;

  // Scale factor (our internal units are mm, USDZ in AR expects meters)
  const scaleFactor =
    scale === "1:10"
      ? 0.0001 // ~40 cm tabletop
      : scale === "1:20"
      ? 0.00005 // ~20 cm miniature
      : 0.001; // 1:1 real life architectural scale (e.g. 4.0 meters)

  const scene = new THREE.Scene();

  // Find lowest Z to place dome base precisely on the floor (Y = 0)
  const minZ = Math.min(...model.nodes.map(n => n.position.z));

  // Transform coordinates: X -> X, Z (height) -> Y, Y (depth) -> -Z
  const toARVec = (p: { x: number; y: number; z: number }): THREE.Vector3 => {
    return new THREE.Vector3(
      p.x * scaleFactor,
      (p.z - minZ) * scaleFactor,
      -p.y * scaleFactor
    );
  };

  // 1. Render Beams
  if (style === "beams" || style === "hybrid") {
    const hubDiam = (model.connectorParams.hubDiameter || 140) * scaleFactor;
    const ringRadius = hubDiam / 2;

    for (const edge of model.edges) {
      const p1 = model.nodes[edge.start].position;
      const p2 = model.nodes[edge.end].position;

      const vStart = toARVec(p1);
      const vEnd = toARVec(p2);

      const fullDir = new THREE.Vector3().subVectors(vEnd, vStart);
      const fullLen = fullDir.length();
      if (fullLen <= 0.0001) continue;

      const trimmedLen = Math.max(0.001, fullLen - Math.min(ringRadius * 2, fullLen * 0.4));
      const strutRadius = Math.max(
        0.0015,
        Math.min(fullLen * 0.12, (model.beamProfile.width * 0.35) * scaleFactor)
      );

      const strutGeom = new THREE.CylinderGeometry(strutRadius, strutRadius, trimmedLen, 8);
      const center = new THREE.Vector3().addVectors(vStart, vEnd).multiplyScalar(0.5);

      const strutColor = beamColorStyle === "types"
        ? new THREE.Color(edge.color)
        : new THREE.Color(0xD4A373); // Warm natural pine timber

      const strutMat = new THREE.MeshStandardMaterial({
        color: strutColor,
        roughness: 0.65,
        metalness: 0.05
      });

      const strutMesh = new THREE.Mesh(strutGeom, strutMat);
      strutMesh.position.copy(center);

      const up = new THREE.Vector3(0, 1, 0);
      const dirNorm = fullDir.clone().normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dirNorm);
      strutMesh.quaternion.copy(quat);

      scene.add(strutMesh);
    }

    // Connectors at nodes
    const connRadius = Math.max(0.003, ringRadius);
    const connHeight = Math.max(0.001, (model.connectorParams.thickness || 4) * scaleFactor);
    const connGeom = new THREE.CylinderGeometry(connRadius, connRadius, connHeight, 12);
    const connMat = new THREE.MeshStandardMaterial({
      color: 0x8C9BAE,
      roughness: 0.4,
      metalness: 0.8
    });

    for (const node of model.nodes) {
      const pos = toARVec(node.position);
      const connMesh = new THREE.Mesh(connGeom, connMat);
      connMesh.position.copy(pos);
      scene.add(connMesh);
    }
  }

  // 2. Render Plywood / Sheathing Triangles
  if (style === "sheathing" || style === "hybrid") {
    const groupIndexMap = new Map<string, number>();
    model.faceGroups.forEach((g, i) => groupIndexMap.set(g.type, i));

    const panelThick = Math.max(0.5, plywoodThickness) * scaleFactor;
    const outwardOffset = style === "hybrid"
      ? Math.max(0.001, ((model.beamProfile.depth / 2) + 1.2) * scaleFactor)
      : Math.max(0.0005, (model.parameters.diameter * 0.001) * scaleFactor);

    for (const face of model.faces) {
      const vA_orig = toARVec(model.nodes[face.a].position);
      const vB_orig = toARVec(model.nodes[face.b].position);
      const vC_orig = toARVec(model.nodes[face.c].position);

      const pCen = new THREE.Vector3()
        .add(vA_orig)
        .add(vB_orig)
        .add(vC_orig)
        .multiplyScalar(1 / 3);

      const edgeAB = new THREE.Vector3().subVectors(vB_orig, vA_orig);
      const edgeAC = new THREE.Vector3().subVectors(vC_orig, vA_orig);
      const faceNormal = new THREE.Vector3().crossVectors(edgeAB, edgeAC).normalize();
      if (faceNormal.dot(pCen) < 0) {
        faceNormal.negate();
      }

      // Expansion seam shrinkage
      const avgSide = (vA_orig.distanceTo(vB_orig) + vB_orig.distanceTo(vC_orig) + vC_orig.distanceTo(vA_orig)) / 3;
      const shrinkFactor = Math.max(0.97, Math.min(0.995, 1 - Math.max(0.001, avgSide * 0.01) / avgSide));

      const pA_in = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vA_orig, pCen), shrinkFactor).addScaledVector(faceNormal, outwardOffset);
      const pB_in = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vB_orig, pCen), shrinkFactor).addScaledVector(faceNormal, outwardOffset);
      const pC_in = pCen.clone().addScaledVector(new THREE.Vector3().subVectors(vC_orig, pCen), shrinkFactor).addScaledVector(faceNormal, outwardOffset);

      const pA_out = pA_in.clone().addScaledVector(faceNormal, panelThick);
      const pB_out = pB_in.clone().addScaledVector(faceNormal, panelThick);
      const pC_out = pC_in.clone().addScaledVector(faceNormal, panelThick);

      const geom = new THREE.BufferGeometry();
      // 8 triangles = 24 vertices for closed volumetric prism
      const vertices = new Float32Array([
        // Top face (outer)
        pA_out.x, pA_out.y, pA_out.z,
        pB_out.x, pB_out.y, pB_out.z,
        pC_out.x, pC_out.y, pC_out.z,

        // Bottom face (inner)
        pA_in.x, pA_in.y, pA_in.z,
        pC_in.x, pC_in.y, pC_in.z,
        pB_in.x, pB_in.y, pB_in.z,

        // Side AB
        pA_in.x, pA_in.y, pA_in.z,
        pB_in.x, pB_in.y, pB_in.z,
        pB_out.x, pB_out.y, pB_out.z,

        pA_in.x, pA_in.y, pA_in.z,
        pB_out.x, pB_out.y, pB_out.z,
        pA_out.x, pA_out.y, pA_out.z,

        // Side BC
        pB_in.x, pB_in.y, pB_in.z,
        pC_in.x, pC_in.y, pC_in.z,
        pC_out.x, pC_out.y, pC_out.z,

        pB_in.x, pB_in.y, pB_in.z,
        pC_out.x, pC_out.y, pC_out.z,
        pB_out.x, pB_out.y, pB_out.z,

        // Side CA
        pC_in.x, pC_in.y, pC_in.z,
        pA_in.x, pA_in.y, pA_in.z,
        pA_out.x, pA_out.y, pA_out.z,

        pC_in.x, pC_in.y, pC_in.z,
        pA_out.x, pA_out.y, pA_out.z,
        pC_out.x, pC_out.y, pC_out.z
      ]);

      geom.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      geom.computeVertexNormals();

      const groupIdx = groupIndexMap.get(face.type) ?? 0;
      let faceColorHex: string;
      if (sheathingStyle === "plywood") {
        faceColorHex = WOOD_TONES[groupIdx % WOOD_TONES.length];
      } else {
        faceColorHex = SHEATHING_PALETTE[groupIdx % SHEATHING_PALETTE.length];
      }

      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(faceColorHex),
        roughness: sheathingStyle === "plywood" ? 0.65 : 0.45,
        metalness: 0.05
      });

      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);
    }
  }

  return scene;
}

/**
 * Exports the dome model into binary USDZ format for Apple AR Quick Look
 */
export async function generateDomeUSDZ(
  model: DomeModel,
  options: USDZExportOptions = {}
): Promise<Blob> {
  const scene = buildARThreeScene(model, options);
  const exporter = new USDZExporter();
  const buffer = await exporter.parseAsync(scene);
  return new Blob([buffer], { type: "model/vnd.usdz+zip" });
}

/**
 * Triggers direct download of the USDZ model file
 */
export async function downloadUSDZ(
  model: DomeModel,
  options: USDZExportOptions = {},
  filename?: string
): Promise<void> {
  const blob = await generateDomeUSDZ(model, options);
  const fname =
    filename ||
    `geodesic_dome_${model.parameters.frequency}V_${(model.parameters.diameter / 1000).toFixed(1)}m_${options.scale || "1-1"}.usdz`;

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fname;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

/**
 * Generates mobile AR deep-link URL carrying the dome parameters
 */
export function generateARLink(params: {
  diameter: number;
  frequency: number;
  cutType: string;
  thickness: number;
  style?: string;
  scale?: string;
}): string {
  const url = new URL(window.location.href);
  url.searchParams.set("ar", "1");
  url.searchParams.set("d", String(params.diameter));
  url.searchParams.set("f", String(params.frequency));
  url.searchParams.set("cut", params.cutType);
  url.searchParams.set("th", String(params.thickness));
  if (params.style) url.searchParams.set("style", params.style);
  if (params.scale) url.searchParams.set("scale", params.scale);
  return url.toString();
}

/**
 * Generates high-contrast, scannable QR Code Data URL (PNG)
 */
export async function generateARQRCode(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 320,
    margin: 2,
    color: {
      dark: "#1A2E3B",
      light: "#FFFFFF"
    },
    errorCorrectionLevel: "M"
  });
}
