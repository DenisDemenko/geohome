import type { DomeModel, Vec3 } from "../../core/types";

/**
 * GeoHome -> KumCAD interchange contract, version 1.
 *
 * KumCAD currently exposes a Qt/C++ desktop application, not a verified HTTP
 * or browser API. This adapter intentionally produces portable geometric data;
 * a future native sidecar can consume it and create OCCT/STEP solids.
 *
 * Coordinates and dimensions are always in millimetres.
 */
export interface KumCadInterchangeV1 {
  schema: "geohome.kumcad.interchange";
  version: 1;
  units: "mm";
  coordinateSystem: "right-handed-z-up";
  source: "GeoHome";
  dome: {
    diameterMm: number;
    heightMm: number;
    frequency: number;
  };
  beamProfile: {
    type: "rectangular" | "pipe" | "circular";
    widthMm: number;
    depthMm: number;
    diameterMm: number | null;
    wallThicknessMm: number | null;
  };
  vertices: Array<{ id: number; position: Vec3 }>;
  struts: Array<{
    id: number;
    startVertexId: number;
    endVertexId: number;
    nominalLengthMm: number;
    cutLengthMm: number | null;
    profileType: string;
  }>;
  triangles: Array<{ id: number; vertexIds: [number, number, number] }>;
  connectors: Array<{
    vertexId: number;
    beamIds: number[];
    boundary: boolean;
  }>;
}

function finiteNonnegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${field}: expected a finite, nonnegative value`);
  }
  return value;
}

function validPosition(position: Vec3, id: number): Vec3 {
  if (![position.x, position.y, position.z].every(Number.isFinite)) {
    throw new Error(`Invalid vertex position at node ${id}`);
  }
  return { x: position.x, y: position.y, z: position.z };
}

/** Deterministic, JSON-serializable CAD handoff without changing the model. */
export function toKumCadInterchange(model: DomeModel): KumCadInterchangeV1 {
  finiteNonnegative(model.parameters.diameter, "dome diameter");
  finiteNonnegative(model.parameters.height, "dome height");

  const vertices = model.nodes.map(node => ({
    id: node.id,
    position: validPosition(node.position, node.id),
  }));
  const vertexIds = new Set(vertices.map(node => node.id));
  if (vertexIds.size !== vertices.length) throw new Error("Duplicate node IDs");

  const edgeIds = new Set<number>();
  const struts = model.edges.map(edge => {
    if (edgeIds.has(edge.id)) throw new Error(`Duplicate edge ID ${edge.id}`);
    edgeIds.add(edge.id);
    if (!vertexIds.has(edge.start) || !vertexIds.has(edge.end) || edge.start === edge.end) {
      throw new Error(`Invalid endpoints for edge ${edge.id}`);
    }
    return {
      id: edge.id,
      startVertexId: edge.start,
      endVertexId: edge.end,
      nominalLengthMm: finiteNonnegative(edge.length, `edge ${edge.id} length`),
      cutLengthMm: edge.cutLength == null ? null : finiteNonnegative(edge.cutLength, `edge ${edge.id} cut length`),
      profileType: edge.type,
    };
  });

  const triangles = model.faces.map(face => {
    const ids: [number, number, number] = [face.a, face.b, face.c];
    if (new Set(ids).size !== 3 || ids.some(id => !vertexIds.has(id))) {
      throw new Error(`Invalid vertices for face ${face.id}`);
    }
    return { id: face.id, vertexIds: ids };
  });

  const connectors = model.nodes.map(node => {
    if (node.edges.some(id => !edgeIds.has(id))) {
      throw new Error(`Invalid edge reference at connector ${node.id}`);
    }
    return { vertexId: node.id, beamIds: [...node.edges], boundary: node.boundary };
  });

  return {
    schema: "geohome.kumcad.interchange",
    version: 1,
    units: "mm",
    coordinateSystem: "right-handed-z-up",
    source: "GeoHome",
    dome: {
      diameterMm: model.parameters.diameter,
      heightMm: model.parameters.height,
      frequency: model.parameters.frequency,
    },
    beamProfile: {
      type: model.beamProfile.type,
      widthMm: finiteNonnegative(model.beamProfile.width, "profile width"),
      depthMm: finiteNonnegative(model.beamProfile.depth, "profile depth"),
      diameterMm: model.beamProfile.diameter == null ? null : finiteNonnegative(model.beamProfile.diameter, "profile diameter"),
      wallThicknessMm: model.beamProfile.wallThickness == null ? null : finiteNonnegative(model.beamProfile.wallThickness, "profile wall thickness"),
    },
    vertices,
    struts,
    triangles,
    connectors,
  };
}

export function serializeKumCadInterchange(model: DomeModel): string {
  return JSON.stringify(toKumCadInterchange(model), null, 2);
}
