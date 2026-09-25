import { Vec3, Face } from "./types";
import { normalize } from "./math";

// Standard vertical icosahedron with North Pole at (0, 0, 1) and South Pole at (0, 0, -1)
// All horizontal rings are exact concentric horizontal circles.
const C = 1 / Math.sqrt(5); // ~0.4472135955
const S = 2 / Math.sqrt(5); // ~0.894427191

const rawVertices: Vec3[] = [
  // 0: Apex (North Pole)
  { x: 0, y: 0, z: 1 },

  // 1 - 5: Upper ring (pentagon at z = C)
  { x: S * Math.cos(0), y: S * Math.sin(0), z: C },
  { x: S * Math.cos((2 * Math.PI) / 5), y: S * Math.sin((2 * Math.PI) / 5), z: C },
  { x: S * Math.cos((4 * Math.PI) / 5), y: S * Math.sin((4 * Math.PI) / 5), z: C },
  { x: S * Math.cos((6 * Math.PI) / 5), y: S * Math.sin((6 * Math.PI) / 5), z: C },
  { x: S * Math.cos((8 * Math.PI) / 5), y: S * Math.sin((8 * Math.PI) / 5), z: C },

  // 6 - 10: Lower ring (pentagon at z = -C, staggered by 36 deg)
  { x: S * Math.cos(Math.PI / 5), y: S * Math.sin(Math.PI / 5), z: -C },
  { x: S * Math.cos((3 * Math.PI) / 5), y: S * Math.sin((3 * Math.PI) / 5), z: -C },
  { x: S * Math.cos((5 * Math.PI) / 5), y: S * Math.sin((5 * Math.PI) / 5), z: -C },
  { x: S * Math.cos((7 * Math.PI) / 5), y: S * Math.sin((7 * Math.PI) / 5), z: -C },
  { x: S * Math.cos((9 * Math.PI) / 5), y: S * Math.sin((9 * Math.PI) / 5), z: -C },

  // 11: South Pole
  { x: 0, y: 0, z: -1 }
];

export const ICOSAHEDRON_VERTICES: Vec3[] = rawVertices.map(normalize);

// 20 triangular faces with outward counter-clockwise winding
export const ICOSAHEDRON_FACES: Face[] = [
  // 5 Top faces (connecting apex 0 to 1..5)
  { id: 0, a: 0, b: 1, c: 2, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 1, a: 0, b: 2, c: 3, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 2, a: 0, b: 3, c: 4, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 3, a: 0, b: 4, c: 5, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 4, a: 0, b: 5, c: 1, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },

  // 10 Middle belt faces
  { id: 5, a: 1, b: 6, c: 2, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 6, a: 2, b: 6, c: 7, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 7, a: 2, b: 7, c: 3, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 8, a: 3, b: 7, c: 8, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 9, a: 3, b: 8, c: 4, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 10, a: 4, b: 8, c: 9, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 11, a: 4, b: 9, c: 5, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 12, a: 5, b: 9, c: 10, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 13, a: 5, b: 10, c: 1, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 14, a: 1, b: 10, c: 6, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },

  // 5 Bottom faces (connecting 6..10 to south pole 11)
  { id: 15, a: 11, b: 7, c: 6, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 16, a: 11, b: 8, c: 7, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 17, a: 11, b: 9, c: 8, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 18, a: 11, b: 10, c: 9, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 },
  { id: 19, a: 11, b: 6, c: 10, type: "", normal: { x: 0, y: 0, z: 0 }, area: 0 }
];
