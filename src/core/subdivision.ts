import { Vec3, Face, Frequency } from "./types";
import { normalize, key3 } from "./math";

export interface SubdivisionResult {
  vertices: Vec3[];
  faces: Face[];
}

export function subdivideIcosahedron(
  vertices: Vec3[],
  faces: Face[],
  frequency: Frequency
): SubdivisionResult {
  if (frequency < 1 || frequency > 8) {
    throw new Error("Frequency must be between 1 and 8");
  }

  const vertexMap = new Map<string, number>();
  const resultVertices: Vec3[] = [];
  const resultFaces: Face[] = [];

  function addVertex(v: Vec3): number {
    const normalized = normalize(v);
    const key = key3(normalized, 6);
    const existing = vertexMap.get(key);

    if (existing !== undefined) {
      return existing;
    }

    const id = resultVertices.length;
    resultVertices.push(normalized);
    vertexMap.set(key, id);
    return id;
  }

  let faceId = 0;

  for (const face of faces) {
    const A = vertices[face.a];
    const B = vertices[face.b];
    const C = vertices[face.c];

    const grid: number[][] = [];

    for (let i = 0; i <= frequency; i++) {
      grid[i] = [];

      for (let j = 0; j <= frequency - i; j++) {
        const u = i / frequency;
        const v = j / frequency;
        const w = 1 - u - v;

        const p = normalize({
          x: A.x * w + B.x * u + C.x * v,
          y: A.y * w + B.y * u + C.y * v,
          z: A.z * w + B.z * u + C.z * v
        });

        grid[i][j] = addVertex(p);
      }
    }

    for (let i = 0; i < frequency; i++) {
      for (let j = 0; j < frequency - i; j++) {
        const a = grid[i][j];
        const b = grid[i + 1][j];
        const c = grid[i][j + 1];

        resultFaces.push({
          id: faceId++,
          a,
          b,
          c,
          type: "",
          normal: { x: 0, y: 0, z: 0 },
          area: 0
        });

        if (j < frequency - i - 1) {
          const d = grid[i + 1][j + 1];
          resultFaces.push({
            id: faceId++,
            a: b,
            b: d,
            c,
            type: "",
            normal: { x: 0, y: 0, z: 0 },
            area: 0
          });
        }
      }
    }
  }

  return {
    vertices: resultVertices,
    faces: resultFaces
  };
}
