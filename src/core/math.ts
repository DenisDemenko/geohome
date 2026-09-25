import { Vec3 } from "./types";

export function add(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z
  };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z
  };
}

export function mul(a: Vec3, scalar: number): Vec3 {
  return {
    x: a.x * scalar,
    y: a.y * scalar,
    z: a.z * scalar
  };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

export function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  if (l === 0) {
    return { x: 0, y: 0, z: 1 };
  }
  return mul(a, 1 / l);
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function key3(v: Vec3, precision = 4): string {
  return [
    v.x.toFixed(precision),
    v.y.toFixed(precision),
    v.z.toFixed(precision)
  ].join(",");
}

export function angleBetween(a: Vec3, b: Vec3): number {
  const lA = length(a);
  const lB = length(b);
  if (lA === 0 || lB === 0) return 0;
  const cosine = clamp(dot(a, b) / (lA * lB), -1, 1);
  return (Math.acos(cosine) * 180) / Math.PI;
}

/**
 * Calculates normal of triangle defined by vertices A, B, C (counter-clockwise)
 */
export function triangleNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const edge1 = sub(b, a);
  const edge2 = sub(c, a);
  return normalize(cross(edge1, edge2));
}

/**
 * Calculates area of triangle ABC in mm^2
 */
export function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  const edge1 = sub(b, a);
  const edge2 = sub(c, a);
  return 0.5 * length(cross(edge1, edge2));
}

/**
 * Calculates 3 interior angles of triangle given lengths a, b, c
 * Returns angles in degrees opposite to a, b, c
 */
export function triangleInteriorAngles(a: number, b: number, c: number): [number, number, number] {
  const angleA = Math.acos(clamp((b * b + c * c - a * a) / (2 * b * c), -1, 1)) * (180 / Math.PI);
  const angleB = Math.acos(clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1)) * (180 / Math.PI);
  const angleC = Math.max(0, 180 - angleA - angleB);
  return [angleA, angleB, angleC];
}

/**
 * Calculates 2D coordinates of a triangle with edges a, b, c
 * places point A at (0, 0), point B along X-axis at (c, 0), and point C at (x_c, y_c)
 */
export function unfoldTriangleTo2D(a: number, b: number, c: number): {
  pA: { x: number; y: number };
  pB: { x: number; y: number };
  pC: { x: number; y: number };
} {
  // c is side AB
  // b is side AC
  // a is side BC
  const cosA = clamp((b * b + c * c - a * a) / (2 * b * c), -1, 1);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const xC = b * cosA;
  const yC = b * sinA;

  return {
    pA: { x: 0, y: 0 },
    pB: { x: c, y: 0 },
    pC: { x: xC, y: yC }
  };
}
