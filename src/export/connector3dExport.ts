import * as THREE from "three";
import JSZip from "jszip";
import {
  DomeModel,
  ConnectorParams,
  ConnectorTypeSummary,
  ConnectorGeometry,
  BeamProfile,
  NodeId
} from "../core/types";
import { calculateConnector } from "../core/connectors";

export type ConnectorRayStyle = "round_tube" | "plate";

/**
 * Creates a watertight 3D hollow annular socket tube geometry.
 * Length is along Z axis [0 .. length].
 * Outer radius: rOuter, Inner socket radius: rInner.
 * Wall thickness = rOuter - rInner (adjustable 0.5 - 20.0 mm).
 * The front end at z = length is an OPEN annular rim so the strut enters freely.
 * At z = zStop (length * 0.2), there is an internal stop shoulder,
 * transitioning to a through-bore that connects into the central hub cavity.
 * NO solid caps! Both ends are hollow and open.
 */
export function createHollowSocketTube(
  rOuter: number,
  rInner: number,
  length: number,
  segments: number = 32,
  embedLen: number = 0
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];

  const ringCount = Math.max(16, segments);
  const cos: number[] = [];
  const sin: number[] = [];
  for (let i = 0; i < ringCount; i++) {
    const th = (i * Math.PI * 2) / ringCount;
    cos.push(Math.cos(th));
    sin.push(Math.sin(th));
  }

  // Mechanical internal stop depth (where strut stops):
  const zStop = Math.max(0.2, length * 0.2);
  const rThroughBore = Math.max(1.5, rInner * 0.7);
  const zStart = -embedLen;

  // 1. Outer Cylinder Wall: z=zStart to z=length (r = rOuter, normals out)
  const vOuter0 = 0;
  const vOuter1 = ringCount;
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rOuter, sin[i] * rOuter, zStart);
    normals.push(cos[i], sin[i], 0);
  }
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rOuter, sin[i] * rOuter, length);
    normals.push(cos[i], sin[i], 0);
  }
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vOuter0 + i, vOuter1 + i, vOuter0 + next);
    indices.push(vOuter1 + i, vOuter1 + next, vOuter0 + next);
  }

  // 2. Front Entrance Annular Rim: at z=length, connecting rOuter to rInner (normal +Z)
  const vInner1 = vertices.length / 3;
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rInner, sin[i] * rInner, length);
    normals.push(0, 0, 1);
  }
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vOuter1 + i, vInner1 + i, vOuter1 + next);
    indices.push(vInner1 + i, vInner1 + next, vOuter1 + next);
  }

  // 3. Inner Socket Wall: from z=length down to z=zStop (r = rInner, normals in)
  const vInnerStop = vertices.length / 3;
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rInner, sin[i] * rInner, zStop);
    normals.push(-cos[i], -sin[i], 0);
  }
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vInner1 + i, vInnerStop + i, vInner1 + next);
    indices.push(vInnerStop + i, vInnerStop + next, vInner1 + next);
  }

  // 4. Internal Stop Shoulder: at z=zStop, connecting rInner down to rThroughBore (normal +Z)
  const vThroughStop = vertices.length / 3;
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rThroughBore, sin[i] * rThroughBore, zStop);
    normals.push(0, 0, 1);
  }
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vInnerStop + i, vThroughStop + i, vInnerStop + next);
    indices.push(vThroughStop + i, vThroughStop + next, vInnerStop + next);
  }

  // 5. Through-bore Wall: from z=zStop down to z=zStart (r = rThroughBore, normals in)
  const vThrough0 = vertices.length / 3;
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rThroughBore, sin[i] * rThroughBore, zStart);
    normals.push(-cos[i], -sin[i], 0);
  }
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vThroughStop + i, vThrough0 + i, vThroughStop + next);
    indices.push(vThrough0 + i, vThrough0 + next, vThroughStop + next);
  }

  // 6. Base Annular Rim: at z=zStart, connecting rThroughBore to rOuter (normal -Z into hub)
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vThrough0 + i, vOuter0 + i, vThrough0 + next);
    indices.push(vOuter0 + i, vOuter0 + next, vThrough0 + next);
  }

  geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geom.setIndex(indices);
  return geom;
}

/**
 * Creates a watertight 3D hollow cylindrical hub geometry.
 * Outer radius: rOuter, Wall thickness: wallThk (0.5 - 20 mm).
 * Inner cavity radius: rCavity = max(2.0, rOuter - wallThk).
 * Height: height (centered at z = 0, [-height/2 .. height/2]).
 * Central access openings on top and bottom faces so the hub is truly hollow.
 */
export function createHollowHubGeometry(
  rOuter: number,
  wallThk: number,
  height: number,
  segments: number = 32
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const indices: number[] = [];
  const normals: number[] = [];

  const ringCount = Math.max(16, segments);
  const cos: number[] = [];
  const sin: number[] = [];
  for (let i = 0; i < ringCount; i++) {
    const th = (i * Math.PI * 2) / ringCount;
    cos.push(Math.cos(th));
    sin.push(Math.sin(th));
  }

  const hHalf = height / 2;
  const safeWall = Math.min(wallThk, rOuter - 1.5);
  const rCavity = Math.max(1.5, rOuter - safeWall);
  const zCavityTop = hHalf - Math.min(safeWall, height * 0.35);
  const zCavityBot = -hHalf + Math.min(safeWall, height * 0.35);
  // Central access hole on top and bottom (allows looking into hollow chamber and cable/bolt access)
  const rBore = Math.max(2.0, Math.min(rCavity * 0.65, rOuter * 0.5));

  // 1. Outer Cylinder Wall: z = -hHalf to z = hHalf (r = rOuter, normals out)
  const vOutBot = 0;
  const vOutTop = ringCount;
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rOuter, sin[i] * rOuter, -hHalf);
    normals.push(cos[i], sin[i], 0);
  }
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rOuter, sin[i] * rOuter, hHalf);
    normals.push(cos[i], sin[i], 0);
  }
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vOutBot + i, vOutTop + i, vOutBot + next);
    indices.push(vOutTop + i, vOutTop + next, vOutBot + next);
  }

  // 2. Top Face Rim: at z = hHalf, connecting rOuter to rBore (normal +Z)
  const vTopBoreOut = vertices.length / 3;
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rBore, sin[i] * rBore, hHalf);
    normals.push(0, 0, 1);
  }
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vOutTop + i, vTopBoreOut + i, vOutTop + next);
    indices.push(vTopBoreOut + i, vTopBoreOut + next, vOutTop + next);
  }

  // 3. Top Bore Inner Wall: from z = hHalf down to z = zCavityTop (r = rBore, normals in)
  const vTopBoreIn = vertices.length / 3;
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rBore, sin[i] * rBore, zCavityTop);
    normals.push(-cos[i], -sin[i], 0);
  }
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vTopBoreOut + i, vTopBoreIn + i, vTopBoreOut + next);
    indices.push(vTopBoreIn + i, vTopBoreIn + next, vTopBoreOut + next);
  }

  // 4. Cavity Ceiling: at z = zCavityTop, connecting rBore out to rCavity (normal -Z into cavity)
  const vCavityTop = vertices.length / 3;
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rCavity, sin[i] * rCavity, zCavityTop);
    normals.push(0, 0, -1);
  }
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vTopBoreIn + i, vCavityTop + i, vTopBoreIn + next);
    indices.push(vCavityTop + i, vCavityTop + next, vTopBoreIn + next);
  }

  // 5. Cavity Inner Cylindrical Wall: from z = zCavityTop down to z = zCavityBot (r = rCavity, normals in)
  const vCavityBot = vertices.length / 3;
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rCavity, sin[i] * rCavity, zCavityBot);
    normals.push(-cos[i], -sin[i], 0);
  }
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vCavityTop + i, vCavityBot + i, vCavityTop + next);
    indices.push(vCavityBot + i, vCavityBot + next, vCavityTop + next);
  }

  // 6. Cavity Floor: at z = zCavityBot, connecting rCavity in to rBore (normal +Z into cavity)
  const vBotBoreIn = vertices.length / 3;
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rBore, sin[i] * rBore, zCavityBot);
    normals.push(0, 0, 1);
  }
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vCavityBot + i, vBotBoreIn + i, vCavityBot + next);
    indices.push(vBotBoreIn + i, vBotBoreIn + next, vCavityBot + next);
  }

  // 7. Bottom Bore Inner Wall: from z = zCavityBot down to z = -hHalf (r = rBore, normals in)
  const vBotBoreOut = vertices.length / 3;
  for (let i = 0; i < ringCount; i++) {
    vertices.push(cos[i] * rBore, sin[i] * rBore, -hHalf);
    normals.push(-cos[i], -sin[i], 0);
  }
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vBotBoreIn + i, vBotBoreOut + i, vBotBoreIn + next);
    indices.push(vBotBoreOut + i, vBotBoreOut + next, vBotBoreIn + next);
  }

  // 8. Bottom Face Rim: at z = -hHalf, connecting rBore out to rOuter (normal -Z)
  for (let i = 0; i < ringCount; i++) {
    const next = (i + 1) % ringCount;
    indices.push(vBotBoreOut + i, vOutBot + i, vBotBoreOut + next);
    indices.push(vOutBot + i, vOutBot + next, vBotBoreOut + next);
  }

  geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geom.setIndex(indices);
  return geom;
}

/**
 * Creates a flat annular disc (solid steel plate with central through-hole for rigging/mounting).
 */
export function createAnnularPlateHub(
  rOuter: number,
  holeRadiusOrWall: number,
  thickness: number,
  segments: number = 32
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, rOuter, 0, Math.PI * 2, false);

  // Ensure central hole is a realistic mounting hole (radius ~ rOuter * 0.32, max 16mm),
  // leaving the hub as a solid, strong steel plate rather than an empty wire ring!
  let rHole = holeRadiusOrWall;
  if (!rHole || rHole < 1.0) {
    rHole = Math.min(rOuter * 0.32, 14);
  } else if (rHole >= rOuter - 6) {
    // If caller passed rOuter - wallThk or large value, constrain to realistic center hole
    rHole = Math.min(rOuter * 0.32, 14);
  } else {
    rHole = Math.min(rHole, rOuter * 0.45);
  }

  if (rHole > 1.5) {
    const holePath = new THREE.Path();
    holePath.absarc(0, 0, rHole, 0, Math.PI * 2, true);
    shape.holes.push(holePath);
  }

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: segments
  });
  geom.center();
  return geom;
}

/**
 * Builds a complete solid 3D THREE.Group of a geodesic connector
 * centered at origin (0, 0, 0) with hub base in XY plane.
 * Supports any ray count (3, 4, 5, 6, etc.), dome shell nodes,
 * boundary base nodes, round sockets, plate blades, and all structural systems.
 */
export function buildConnector3DGroup(
  connector: ConnectorGeometry,
  params: ConnectorParams,
  beamProfile: BeamProfile,
  rayStyle?: ConnectorRayStyle,
  angleMode: "bent3d" | "flat" = "bent3d",
  bendProgress: number = 1.0
): THREE.Group {
  const group = new THREE.Group();

  // Determine ray style: if not specified, default to round tube for circular/pipe beams, plate for rectangular
  const isRoundBeam = beamProfile.type === "circular" || beamProfile.type === "pipe";
  const activeStyle: ConnectorRayStyle =
    rayStyle ||
    (params.rayType === "round_tube"
      ? "round_tube"
      : params.rayType === "plate"
      ? "plate"
      : isRoundBeam
      ? "round_tube"
      : "plate");

  const hubDiam = Math.max(2, params.hubDiameter || 140);
  const hubRadius = hubDiam / 2;
  const tabLen = Math.max(2, params.tabLength || 95);
  const tabWidth = Math.max(1.5, params.tabWidth || 45);
  const plateThk = Math.max(0.4, params.thickness || 4);
  const wallThk = Math.max(0.4, params.wallThickness || 2.5);
  const beamDiam = Math.max(1, beamProfile.diameter || beamProfile.width || 20);
  const isBase = !!connector.isBoundary;

  const effectiveBendFactor = angleMode === "flat" ? 0.0 : Math.max(0.0, Math.min(1.0, bendProgress));

  const defaultMat = new THREE.MeshStandardMaterial({
    color: 0x5a6e82,
    metalness: 0.85,
    roughness: 0.3
  });

  const sortedBeams = connector.beams;
  const rayCount = sortedBeams.length;

  if (activeStyle === "round_tube") {
    // ==========================================
    // ROUND TUBULAR CONNECTOR (КРУГЛІ ЛУЧИ)
    // ==========================================
    const rayOuterR = (beamDiam / 2) + wallThk;
    const rayInnerR = beamDiam / 2;
    const hubH = Math.max(rayOuterR * 2.2, wallThk * 2 + 6);

    // 1. Central Hub: TRULY HOLLOW cylindrical tube body with wall thickness wallThk
    const hubGeom = createHollowHubGeometry(hubRadius, wallThk, hubH, 32);
    const hubMesh = new THREE.Mesh(hubGeom, defaultMat);
    hubMesh.name = "Hollow_Central_Hub_Body";
    group.add(hubMesh);

    // 2. Round Tubular Socket Rays
    for (let i = 0; i < rayCount; i++) {
      const beam = sortedBeams[i];
      const planarDeg = (beam as any).planarAngle !== undefined ? (beam as any).planarAngle : (i * 360) / rayCount;
      const planarRad = (planarDeg * Math.PI) / 180;
      const cosA = Math.cos(planarRad);
      const sinA = Math.sin(planarRad);

      const fullBendDeg = (beam as any).bendAngle || 8.0;
      const bendDeg = fullBendDeg * effectiveBendFactor;
      const bendRad = (bendDeg * Math.PI) / 180;

      // Ray direction unit vector in local space
      const rayDir = new THREE.Vector3(
        cosA * Math.cos(bendRad),
        sinA * Math.cos(bendRad),
        Math.sin(bendRad)
      ).normalize();

      // Embed socket deeply into central hub wall and cavity for a 100% solid, gap-free monolithic union
      const chordGap = hubRadius - Math.sqrt(Math.max(0, hubRadius * hubRadius - rayOuterR * rayOuterR));
      const tiltGap = rayOuterR * Math.tan(Math.abs(bendRad) || 0.15);
      const embedLen = Math.max(20, Math.round(chordGap + tiltGap + 14));

      const socketGeom = createHollowSocketTube(rayOuterR, rayInnerR, tabLen, 24, embedLen);
      const socketMesh = new THREE.Mesh(socketGeom, defaultMat);

      // Tube geometry is along +Z axis from -embedLen to tabLen.
      // Position start at hubRadius * rayDir, and orient +Z along rayDir:
      socketMesh.position.copy(rayDir).multiplyScalar(hubRadius);
      socketMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), rayDir);
      socketMesh.name = `Ray_Socket_${i + 1}_${beam.beamType}`;
      group.add(socketMesh);

      // Transitional reinforcement boss / weld collar at hub junction
      const bossLen = Math.min(20, tabLen * 0.25);
      const bossGeom = new THREE.CylinderGeometry(rayOuterR * 1.02, rayOuterR * 1.22, bossLen, 24);
      const bossMesh = new THREE.Mesh(bossGeom, defaultMat);
      bossMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rayDir);
      bossMesh.position.copy(rayDir).multiplyScalar(hubRadius - embedLen * 0.25 + bossLen / 2);
      bossMesh.name = `Ray_Boss_Collar_${i + 1}`;
      group.add(bossMesh);

      // Add retention pin/bolt hole collar detail
      const collarR = rayOuterR * 1.08;
      const collarGeom = createHollowSocketTube(collarR, rayOuterR, Math.max(2, wallThk * 1.5), 20);
      const collarMesh = new THREE.Mesh(collarGeom, defaultMat);
      collarMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), rayDir);
      collarMesh.position.copy(rayDir).multiplyScalar(hubRadius + tabLen * 0.85);
      group.add(collarMesh);
    }

    // If Base footing node: add horizontal bottom foundation mounting flange
    if (isBase) {
      const padW = hubRadius * 2.2;
      const padD = hubRadius * 1.4;
      const padH = Math.max(3, wallThk * 1.6);
      const padGeom = new THREE.BoxGeometry(padW, padD, padH);
      const padMesh = new THREE.Mesh(padGeom, defaultMat);
      padMesh.position.set(0, -padD * 0.45, -hubH / 2 - padH / 2);
      padMesh.name = "Foundation_Mounting_Flange";
      group.add(padMesh);
    }
  } else {
    // ==========================================
    // RECTANGULAR PLATE CONNECTOR (ПЛАСТИНА / ЗІРКА)
    // ==========================================
    const connSys = params.type || "star_plate";

    // 1. Central Hub Disc (full 360° closed contour for all connectors)
    let hubMesh: THREE.Mesh;
    if (connSys === "pipe_hub") {
      const hubH = Math.max(tabWidth * 1.2, 50);
      const hubGeom = createHollowHubGeometry(hubRadius, wallThk, hubH, 32);
      hubMesh = new THREE.Mesh(hubGeom, defaultMat);
      hubMesh.name = "Hollow_Pipe_Hub";
    } else {
      const hubGeom = createAnnularPlateHub(hubRadius, wallThk, plateThk, 32);
      hubMesh = new THREE.Mesh(hubGeom, defaultMat);
      hubMesh.name = "Hollow_Plate_Hub";
    }
    group.add(hubMesh);

    // 2. Rectangular Blade Rays / Tabs
    for (let i = 0; i < rayCount; i++) {
      const beam = sortedBeams[i];
      const planarDeg = (beam as any).planarAngle !== undefined ? (beam as any).planarAngle : (i * 360) / rayCount;
      const planarRad = (planarDeg * Math.PI) / 180;
      const cosA = Math.cos(planarRad);
      const sinA = Math.sin(planarRad);

      const fullBendDeg = (beam as any).bendAngle || 8.0;
      const bendDeg = fullBendDeg * effectiveBendFactor;
      const bendRad = (bendDeg * Math.PI) / 180;

      // In local coordinates:
      // Length along rayDir, Width perpendicular in plane, Thickness along normal
      const rayDir = new THREE.Vector3(
        cosA * Math.cos(bendRad),
        sinA * Math.cos(bendRad),
        Math.sin(bendRad)
      ).normalize();

      const perpDir = new THREE.Vector3(-sinA, cosA, 0).normalize();
      const normDir = new THREE.Vector3().crossVectors(rayDir, perpDir).normalize();

      // Tab extends seamlessly from hubRadius - overlapLen outward to hubRadius + tabLen
      const overlapLen = Math.max(10, plateThk * 2.5);
      const totalBladeLen = tabLen + overlapLen;
      const tabGeom = new THREE.BoxGeometry(tabWidth, plateThk, totalBladeLen);
      const tabMesh = new THREE.Mesh(tabGeom, defaultMat);

      const centerDist = hubRadius + (tabLen - overlapLen) / 2;
      tabMesh.position.copy(rayDir).multiplyScalar(centerDist);

      // Orientation basis: X = perpDir, Y = normDir, Z = rayDir
      const rotMat = new THREE.Matrix4().makeBasis(perpDir, normDir, rayDir);
      tabMesh.quaternion.setFromRotationMatrix(rotMat);
      tabMesh.name = `Plate_Ray_${i + 1}_${beam.beamType}`;
      group.add(tabMesh);
    }

    // Base bracket foundation footing
    if (isBase) {
      const padW = hubRadius * 2.2;
      const padD = hubRadius * 1.3;
      const padH = plateThk * 1.5;
      const padGeom = new THREE.BoxGeometry(padW, padD, padH);
      const padMesh = new THREE.Mesh(padGeom, defaultMat);
      padMesh.position.set(0, -padD * 0.45, -plateThk / 2);
      padMesh.name = "Foundation_Baseplate";
      group.add(padMesh);
    }
  }

  return group;
}

/**
 * Converts a THREE.Group of 3D meshes to standard ASCII STL format (.stl)
 */
export function groupToSTL(group: THREE.Group, solidName: string = "connector"): string {
  group.updateMatrixWorld(true);
  const cleanName = solidName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const lines: string[] = [`solid ${cleanName}`];

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const normal = new THREE.Vector3();

  group.traverse(child => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geom = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const pos = geom.getAttribute("position");
      const index = geom.getIndex();

      if (pos) {
        const numTriangles = index ? index.count / 3 : pos.count / 3;

        for (let i = 0; i < numTriangles; i++) {
          const iA = index ? index.getX(i * 3) : i * 3;
          const iB = index ? index.getX(i * 3 + 1) : i * 3 + 1;
          const iC = index ? index.getX(i * 3 + 2) : i * 3 + 2;

          vA.fromBufferAttribute(pos, iA);
          vB.fromBufferAttribute(pos, iB);
          vC.fromBufferAttribute(pos, iC);

          cb.subVectors(vC, vB);
          ab.subVectors(vA, vB);
          normal.crossVectors(cb, ab).normalize();

          // If degenerate triangle, fallback to z=1 normal
          if (isNaN(normal.x) || normal.lengthSq() < 0.0001) {
            normal.set(0, 0, 1);
          }

          lines.push(`  facet normal ${normal.x.toFixed(5)} ${normal.y.toFixed(5)} ${normal.z.toFixed(5)}`);
          lines.push("    outer loop");
          lines.push(`      vertex ${vA.x.toFixed(4)} ${vA.y.toFixed(4)} ${vA.z.toFixed(4)}`);
          lines.push(`      vertex ${vB.x.toFixed(4)} ${vB.y.toFixed(4)} ${vB.z.toFixed(4)}`);
          lines.push(`      vertex ${vC.x.toFixed(4)} ${vC.y.toFixed(4)} ${vC.z.toFixed(4)}`);
          lines.push("    endloop");
          lines.push("  endfacet");
        }
      }
      geom.dispose();
    }
  });

  lines.push(`endsolid ${cleanName}`);
  return lines.join("\n");
}

/**
 * Converts a THREE.Group of 3D meshes to standard Wavefront OBJ format (.obj)
 */
export function groupToOBJ(group: THREE.Group, objectName: string = "connector"): string {
  group.updateMatrixWorld(true);
  const cleanName = objectName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const lines: string[] = [
    `# Geodesic Dome Connector CAD Export`,
    `# Model: KupolGeo Core v0.2`,
    `# Part: ${cleanName}`,
    `# Units: Millimeters (mm)`,
    `o ${cleanName}`
  ];

  let vertexOffset = 1;

  group.traverse(child => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const geom = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const pos = geom.getAttribute("position");
      const index = geom.getIndex();

      if (pos) {
        const numTriangles = index ? index.count / 3 : pos.count / 3;

        // Write vertices
        for (let i = 0; i < pos.count; i++) {
          lines.push(
            `v ${pos.getX(i).toFixed(4)} ${pos.getY(i).toFixed(4)} ${pos.getZ(i).toFixed(4)}`
          );
        }

        // Write faces
        for (let i = 0; i < numTriangles; i++) {
          const iA = (index ? index.getX(i * 3) : i * 3) + vertexOffset;
          const iB = (index ? index.getX(i * 3 + 1) : i * 3 + 1) + vertexOffset;
          const iC = (index ? index.getX(i * 3 + 2) : i * 3 + 2) + vertexOffset;

          lines.push(`f ${iA} ${iB} ${iC}`);
        }

        vertexOffset += pos.count;
      }
      geom.dispose();
    }
  });

  return lines.join("\n");
}

/**
 * Exports a single connector type summary into STL string
 */
export function exportConnectorTypeSTL(
  model: DomeModel,
  typeSummary: ConnectorTypeSummary,
  rayStyle: ConnectorRayStyle,
  params: ConnectorParams = model.connectorParams
): string {
  const conn = calculateConnector(model, typeSummary.sampleNodeId);
  const group = buildConnector3DGroup(conn, params, model.beamProfile, rayStyle);
  const styleLabel = rayStyle === "round_tube" ? "RoundTube" : "Plate";
  const sampleLabel = model.nodes[typeSummary.sampleNodeId]?.label || `AA${typeSummary.sampleNodeId + 1}`;
  const name = `Connector_Node_${sampleLabel}_${typeSummary.rayCount}Way_${typeSummary.isBoundary ? "Base" : "Dome"}_${styleLabel}`;
  return groupToSTL(group, name);
}

/**
 * Exports a single connector type summary into OBJ string
 */
export function exportConnectorTypeOBJ(
  model: DomeModel,
  typeSummary: ConnectorTypeSummary,
  rayStyle: ConnectorRayStyle,
  params: ConnectorParams = model.connectorParams
): string {
  const conn = calculateConnector(model, typeSummary.sampleNodeId);
  const group = buildConnector3DGroup(conn, params, model.beamProfile, rayStyle);
  const styleLabel = rayStyle === "round_tube" ? "RoundTube" : "Plate";
  const sampleLabel = model.nodes[typeSummary.sampleNodeId]?.label || `AA${typeSummary.sampleNodeId + 1}`;
  const name = `Connector_Node_${sampleLabel}_${typeSummary.rayCount}Way_${typeSummary.isBoundary ? "Base" : "Dome"}_${styleLabel}`;
  return groupToOBJ(group, name);
}

/**
 * Exports a single connector node (by nodeId) into STL string for 3D printing
 */
export function exportSingleConnectorNodeSTL(
  model: DomeModel,
  nodeId: NodeId,
  rayStyle?: ConnectorRayStyle,
  params: ConnectorParams = model.connectorParams
): string {
  const conn = calculateConnector(model, nodeId);
  const isRound = rayStyle
    ? rayStyle === "round_tube"
    : (params.rayType === "round_tube" || (params.rayType !== "plate" && (model.beamProfile.type === "circular" || model.beamProfile.type === "pipe")));
  const style: ConnectorRayStyle = isRound ? "round_tube" : "plate";
  const group = buildConnector3DGroup(conn, params, model.beamProfile, style);
  const sampleLabel = model.nodes[nodeId]?.label || `AA${nodeId + 1}`;
  const name = `Connector_Node_${sampleLabel}_ID_${nodeId}_${conn.beamCount}Way_${conn.isBoundary ? "Base" : "Dome"}`;
  return groupToSTL(group, name);
}

/**
 * Options for generating standard round pipe connectors (3, 4, 5-petal)
 */
export interface StandardPipeConnectorOptions {
  pipeDiameter?: number; // mm - outer diameter of inserted pipe (inner diameter of sleeve)
  wallThickness?: number; // mm - wall thickness of socket sleeve and hub
  socketLength?: number; // mm - depth of socket sleeve along the ray
  hubDiameter?: number; // mm - central hub diameter
  bendAngleDeg?: number; // degrees - dome tilt angle (0° = flat, 7.5° - 12° = spherical dome curvature)
  pinHoleDiameter?: number; // mm - locking pin / bolt diameter
  layout?: "symmetric" | "base"; // symmetric 360° star or semi-circular base footing
}

export interface StandardPipeModelSpec {
  rayCount: number;
  name: string;
  ukrainianName: string;
  description: string;
  angles: number[];
  layout: "symmetric" | "base";
  defaultBendDeg: number;
}

export const STANDARD_PIPE_CONNECTORS: StandardPipeModelSpec[] = [
  {
    rayCount: 3,
    name: "3-Way Round Pipe Connector (120° Symmetric)",
    ukrainianName: "3-лепістковий конектор під круглу трубу (120°)",
    description: "Симетричний 3-променевий розтруб для трикутних вершин купола та просторових конструкцій",
    angles: [0, 120, 240],
    layout: "symmetric",
    defaultBendDeg: 8.5
  },
  {
    rayCount: 4,
    name: "4-Way Round Pipe Connector (90° Cross)",
    ukrainianName: "4-лепістковий конектор під круглу трубу (90° Хрестовина)",
    description: "Хрестоподібний 4-променевий вузол для ортогональної сітки та купольних перехресть",
    angles: [0, 90, 180, 270],
    layout: "symmetric",
    defaultBendDeg: 7.5
  },
  {
    rayCount: 4,
    name: "4-Way Round Pipe Base Footing (Foundation Bracket)",
    ukrainianName: "4-лепістковий опорний конектор основи (Base Bracket)",
    description: "Опорний вузол основи купола: 2 горизонтальні гільзи вздовж фундаменту та 2 похилі гільзи в купол",
    angles: [0, 60, 120, 180],
    layout: "base",
    defaultBendDeg: 0
  },
  {
    rayCount: 5,
    name: "5-Way Round Pipe Connector (72° Pentagon / Apex)",
    ukrainianName: "5-лепістковий конектор під круглу трубу (72° Apex / Пентагон)",
    description: "П'ятипроменевий вершиний вузол Апекс та 12 пентагональних центрів геодезичного купола",
    angles: [0, 72, 144, 216, 288],
    layout: "symmetric",
    defaultBendDeg: 10.0
  },
  {
    rayCount: 6,
    name: "6-Way Round Pipe Connector (60° Hexagon)",
    ukrainianName: "6-лепістковий конектор під круглу трубу (60° Гексагон)",
    description: "Шестипроменевий вузол сферичних гексагонів для основної несучої оболонки купола",
    angles: [0, 60, 120, 180, 240, 300],
    layout: "symmetric",
    defaultBendDeg: 6.5
  }
];

/**
 * Builds a watertight 3D THREE.Group of a standalone standard round pipe connector
 * for 3, 4, or 5 petals (or 6 petals).
 */
export function buildStandardRoundPipeConnector3DGroup(
  rayCount: number,
  options: StandardPipeConnectorOptions = {}
): THREE.Group {
  const group = new THREE.Group();

  const pipeDiam = Math.max(10, options.pipeDiameter || 25);
  const wallThk = Math.max(0.5, Math.min(20, options.wallThickness || 2.5));
  const socketLen = Math.max(20, options.socketLength || 90);
  const hubDiam = Math.max(30, options.hubDiameter || 120);
  const hubRadius = hubDiam / 2;
  const bendAngleDeg = options.bendAngleDeg !== undefined ? options.bendAngleDeg : (rayCount === 5 ? 10.0 : rayCount === 6 ? 6.5 : 8.0);
  const bendRad = (bendAngleDeg * Math.PI) / 180;
  const layout = options.layout || "symmetric";
  const isBase = layout === "base";

  const rayInnerR = pipeDiam / 2;
  const rayOuterR = rayInnerR + wallThk;
  const hubH = Math.max(rayOuterR * 2.2, wallThk * 2 + 8);

  const defaultMat = new THREE.MeshStandardMaterial({
    color: 0x5a6e82,
    metalness: 0.85,
    roughness: 0.3
  });

  // 1. Central Hollow Hub (full 360° closed contour)
  const hubGeom = createHollowHubGeometry(hubRadius, wallThk, hubH, 32);
  const hubMesh = new THREE.Mesh(hubGeom, defaultMat);
  hubMesh.name = "Hollow_Central_Hub";
  group.add(hubMesh);

  // 2. Compute Ray Angles
  let angles: number[] = [];
  if (isBase) {
    if (rayCount === 3) angles = [0, 90, 180];
    else if (rayCount === 4) angles = [0, 60, 120, 180];
    else angles = Array.from({ length: rayCount }, (_, i) => (i * 180) / (rayCount - 1));
  } else {
    angles = Array.from({ length: rayCount }, (_, i) => (i * 360) / rayCount);
  }

  // 3. Construct Each Round Tubular Socket Sleeve
  for (let i = 0; i < rayCount; i++) {
    const planarRad = (angles[i] * Math.PI) / 180;
    const cosA = Math.cos(planarRad);
    const sinA = Math.sin(planarRad);

    const rayDir = new THREE.Vector3(
      cosA * Math.cos(bendRad),
      sinA * Math.cos(bendRad),
      Math.sin(bendRad)
    ).normalize();

    const chordGap = hubRadius - Math.sqrt(Math.max(0, hubRadius * hubRadius - rayOuterR * rayOuterR));
    const tiltGap = rayOuterR * Math.tan(Math.abs(bendRad) || 0.15);
    const embedLen = Math.max(20, Math.round(chordGap + tiltGap + 14));

    const socketGeom = createHollowSocketTube(rayOuterR, rayInnerR, socketLen, 32, embedLen);
    const socketMesh = new THREE.Mesh(socketGeom, defaultMat);

    socketMesh.position.copy(rayDir).multiplyScalar(hubRadius);
    socketMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), rayDir);
    socketMesh.name = `Pipe_Socket_${i + 1}_${angles[i]}deg`;
    group.add(socketMesh);

    // Transitional reinforcement boss / weld collar at hub junction
    const bossLen = Math.min(20, socketLen * 0.25);
    const bossGeom = new THREE.CylinderGeometry(rayOuterR * 1.02, rayOuterR * 1.22, bossLen, 24);
    const bossMesh = new THREE.Mesh(bossGeom, defaultMat);
    bossMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rayDir);
    bossMesh.position.copy(rayDir).multiplyScalar(hubRadius - embedLen * 0.25 + bossLen / 2);
    bossMesh.name = `Pipe_Boss_Collar_${i + 1}`;
    group.add(bossMesh);

    // Collar ring with reinforcement
    const collarR = rayOuterR * 1.08;
    const collarGeom = createHollowSocketTube(collarR, rayOuterR, Math.max(2.5, wallThk * 1.5), 24);
    const collarMesh = new THREE.Mesh(collarGeom, defaultMat);
    collarMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), rayDir);
    collarMesh.position.copy(rayDir).multiplyScalar(hubRadius + socketLen * 0.85);
    group.add(collarMesh);

    // Retention pin / bolt collar through-hole pin representation
    const pinDiam = options.pinHoleDiameter || 6;
    const pinGeom = new THREE.CylinderGeometry(pinDiam / 2, pinDiam / 2, rayOuterR * 2.3, 16);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0x22262a, metalness: 0.9, roughness: 0.2 });
    const pinMesh = new THREE.Mesh(pinGeom, pinMat);
    pinMesh.position.copy(rayDir).multiplyScalar(hubRadius + socketLen * 0.55);
    // Orient perpendicular to rayDir
    const perpDir = new THREE.Vector3(-sinA, cosA, 0).normalize();
    pinMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), perpDir);
    pinMesh.name = `Pin_Bolt_${i + 1}`;
    group.add(pinMesh);
  }

  return group;
}

/**
 * Exports a standard round pipe connector into an ASCII STL string
 */
export function exportStandardRoundPipeConnectorSTL(
  rayCount: number,
  options: StandardPipeConnectorOptions = {}
): string {
  const group = buildStandardRoundPipeConnector3DGroup(rayCount, options);
  const layout = options.layout === "base" ? "Base" : "Symmetric";
  const solidName = `PipeConnector_${rayCount}Way_${layout}_D${options.pipeDiameter || 25}mm`;
  return groupToSTL(group, solidName);
}

/**
 * Exports a standard round pipe connector into an ASCII OBJ string
 */
export function exportStandardRoundPipeConnectorOBJ(
  rayCount: number,
  options: StandardPipeConnectorOptions = {}
): string {
  const group = buildStandardRoundPipeConnector3DGroup(rayCount, options);
  const layout = options.layout === "base" ? "Base" : "Symmetric";
  const objectName = `PipeConnector_${rayCount}Way_${layout}_D${options.pipeDiameter || 25}mm`;
  return groupToOBJ(group, objectName);
}

/**
 * Generates a ZIP file containing 3, 4, and 5-petal round pipe connectors in STL and OBJ
 */
export async function generateStandardRoundPipeConnectorsZip(
  options: StandardPipeConnectorOptions = {}
): Promise<Blob> {
  const zip = new JSZip();
  const pipeDiam = options.pipeDiameter || 25;
  const wallThk = options.wallThickness || 2.5;
  const socketLen = options.socketLength || 90;
  const hubDiam = options.hubDiameter || 120;

  let readme = `KupolGeo - 3, 4, 5-Petal Round Pipe Connectors Package\n`;
  readme += `====================================================\n`;
  readme += `Pipe Outer Diameter (Socket Inner Ø): ${pipeDiam} mm\n`;
  readme += `Wall Thickness: ${wallThk} mm\n`;
  readme += `Sleeve Outer Diameter: ${pipeDiam + wallThk * 2} mm\n`;
  readme += `Socket Insertion Depth: ${socketLen} mm\n`;
  readme += `Central Hub Diameter: ${hubDiam} mm\n\n`;
  readme += `INCLUDED MODELS:\n`;
  readme += `1. 3-Way Connector (120° Symmetric) - for apex / triangular mesh\n`;
  readme += `2. 4-Way Connector (90° Cross) - for orthogonal grid & 4-way hubs\n`;
  readme += `3. 4-Way Base Footing Bracket (0°-60°-120°-180°) - for foundation ring\n`;
  readme += `4. 5-Way Connector (72° Pentagon / Apex) - for icosahedral apex hubs\n`;
  readme += `5. 6-Way Connector (60° Hexagon) - for standard geodesic dome shell\n\n`;
  readme += `3D PRINTING RECOMMENDATIONS:\n`;
  readme += `- Material: PETG, ABS, ASA, or Nylon PA-CF (Carbon Fiber filled Nylon).\n`;
  readme += `- Infill: 50% - 100% (Gyroid or Rectilinear pattern).\n`;
  readme += `- Perimeters / Walls: 4 to 6 perimeters minimum for load-bearing struts.\n`;
  readme += `- Layer Height: 0.20 mm - 0.28 mm.\n`;

  zip.file("README_PIPE_CONNECTORS.txt", readme);

  for (const model of STANDARD_PIPE_CONNECTORS) {
    const group = buildStandardRoundPipeConnector3DGroup(model.rayCount, {
      ...options,
      layout: model.layout,
      bendAngleDeg: options.bendAngleDeg !== undefined ? options.bendAngleDeg : model.defaultBendDeg
    });

    const fileBase = `PipeConnector_${model.rayCount}Way_${model.layout === "base" ? "Base" : "Sym"}_D${pipeDiam}mm`;

    const stl = groupToSTL(group, fileBase);
    zip.file(`STL/${fileBase}.stl`, stl);

    const obj = groupToOBJ(group, fileBase);
    zip.file(`OBJ/${fileBase}.obj`, obj);
  }

  return await zip.generateAsync({ type: "blob" });
}

/**
 * Builds a ZIP file containing 3D models (STL and/or OBJ) of ALL connector types in the dome.
 * Options allow generating round tubular connectors, plate connectors, or both.
 */
export async function generateAllConnectorsZip(
  model: DomeModel,
  connectorTypes: ConnectorTypeSummary[],
  options: {
    rayStyle: "current" | "round_tube" | "plate" | "both";
    format: "stl" | "obj" | "both";
    params?: ConnectorParams;
  }
): Promise<Blob> {
  const zip = new JSZip();
  const effectiveParams = options.params || model.connectorParams;
  const isRoundBeam = model.beamProfile.type === "circular" || model.beamProfile.type === "pipe";
  const currentRayStyle: ConnectorRayStyle =
    effectiveParams.rayType === "round_tube"
      ? "round_tube"
      : effectiveParams.rayType === "plate"
      ? "plate"
      : isRoundBeam
      ? "round_tube"
      : "plate";

  const stylesToGenerate: ConnectorRayStyle[] =
    options.rayStyle === "both"
      ? ["round_tube", "plate"]
      : options.rayStyle === "current"
      ? [currentRayStyle]
      : [options.rayStyle];

  const formatsToGenerate: ("stl" | "obj")[] =
    options.format === "both" ? ["stl", "obj"] : [options.format];

  // Readme manifest
  let readme = `KupolGeo - Geodesic Dome Connector 3D CAD/CAM Package\n`;
  readme += `====================================================\n`;
  readme += `Frequency: ${model.parameters.frequency}V\n`;
  readme += `Dome Diameter: ${model.parameters.diameter} mm\n`;
  readme += `Dome Height: ${model.parameters.height} mm\n`;
  readme += `Beam Cross-Section: ${model.beamProfile.name} (${model.beamProfile.type})\n`;
  if (isRoundBeam) {
    readme += `Beam Diameter: Ø ${model.beamProfile.diameter || model.beamProfile.width} mm\n`;
    readme += `Connector Sleeve Wall Thickness: ${effectiveParams.wallThickness || 2.5} mm\n`;
    readme += `Connector Sleeve Outer Diameter: Ø ${(model.beamProfile.diameter || model.beamProfile.width || 20) + (effectiveParams.wallThickness || 2.5) * 2} mm\n`;
  } else {
    readme += `Beam Width x Depth: ${model.beamProfile.width} x ${model.beamProfile.depth} mm\n`;
    readme += `Plate Steel Thickness: ${effectiveParams.thickness} mm\n`;
  }
  readme += `Hub Diameter: ${effectiveParams.hubDiameter} mm\n`;
  readme += `Ray / Tab Length: ${effectiveParams.tabLength} mm\n`;
  readme += `Fastener / Bolt: M${effectiveParams.boltDiameter}\n\n`;
  readme += `CONNECTOR TYPES SPECIFICATION IN THIS DOME:\n`;
  readme += `--------------------------------------------\n`;

  connectorTypes.forEach((t, idx) => {
    readme += `#${idx + 1}: ${t.name}\n`;
    readme += `    - Ray Count: ${t.rayCount}\n`;
    readme += `    - Position: ${t.isBoundary ? "Foundation Base Horizon" : "Spherical Dome Shell"}\n`;
    readme += `    - Quantity in Dome: ${t.countInDome} pcs\n`;
    readme += `    - Strut Types: ${t.beamSignature}\n`;
    readme += `    - Press-Brake Bend Angles: ${t.rayDetails.map(r => `${r.bendAngleDeg}°`).join(", ")}\n\n`;
  });

  readme += `3D PRINTING GUIDELINES:\n`;
  readme += `- For Round Tube Connectors: PETG, ABS, ASA, or Nylon (PA-CF) recommended.\n`;
  readme += `- Recommended Infill: 40% - 100% (Gyroid or Rectilinear).\n`;
  readme += `- Walls / Perimeters: 4 to 6 perimeters for structural strength.\n`;

  zip.file("README_CONNECTORS.txt", readme);

  for (const style of stylesToGenerate) {
    const styleFolder = style === "round_tube" ? "Round_Tube_Sockets" : "Plate_Brackets";

    for (const t of connectorTypes) {
      const conn = calculateConnector(model, t.sampleNodeId);
      const group = buildConnector3DGroup(conn, effectiveParams, model.beamProfile, style);
      const fileBaseName = `${t.rayCount}Way_${t.isBoundary ? "Base" : "Dome"}_type_${t.typeId.replace(/[^a-zA-Z0-9]/g, "_")}`;

      if (formatsToGenerate.includes("stl")) {
        const stlContent = groupToSTL(group, `${fileBaseName}_${style}`);
        zip.file(`${styleFolder}/STL/${fileBaseName}.stl`, stlContent);
      }

      if (formatsToGenerate.includes("obj")) {
        const objContent = groupToOBJ(group, `${fileBaseName}_${style}`);
        zip.file(`${styleFolder}/OBJ/${fileBaseName}.obj`, objContent);
      }
    }

    // If exporting round tubes, also add standard 3, 4, 5-petal round pipe models
    if (style === "round_tube") {
      const pipeDiam = model.beamProfile.diameter || model.beamProfile.width || 25;
      for (const std of STANDARD_PIPE_CONNECTORS) {
        const stdGroup = buildStandardRoundPipeConnector3DGroup(std.rayCount, {
          pipeDiameter: pipeDiam,
          wallThickness: effectiveParams.wallThickness || 2.5,
          socketLength: effectiveParams.tabLength || 90,
          hubDiameter: effectiveParams.hubDiameter || 120,
          layout: std.layout,
          bendAngleDeg: std.defaultBendDeg
        });
        const stdName = `Standard_Pipe_${std.rayCount}Way_${std.layout === "base" ? "Base" : "Sym"}_D${pipeDiam}mm`;
        if (formatsToGenerate.includes("stl")) {
          zip.file(`${styleFolder}/Standard_3_4_5_Way/STL/${stdName}.stl`, groupToSTL(stdGroup, stdName));
        }
        if (formatsToGenerate.includes("obj")) {
          zip.file(`${styleFolder}/Standard_3_4_5_Way/OBJ/${stdName}.obj`, groupToOBJ(stdGroup, stdName));
        }
      }
    }
  }

  return await zip.generateAsync({ type: "blob" });
}
