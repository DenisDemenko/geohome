import { DomeModel } from "./types";

export function approveGeometry(model: DomeModel): DomeModel {
  const errors = model.validation.filter(issue => issue.level === "error");
  if (errors.length > 0) {
    throw new Error(
      `Неможливо затвердити геометрію: виявлено ${errors.length} критичних помилок.`
    );
  }

  const version = createGeometryVersion(model);

  return {
    ...model,
    approved: true,
    geometryVersion: version
  };
}

export function revokeApproval(model: DomeModel): DomeModel {
  return {
    ...model,
    approved: false,
    geometryVersion: undefined
  };
}

function createGeometryVersion(model: DomeModel): string {
  const data = JSON.stringify({
    parameters: model.parameters,
    nodesCount: model.nodes.length,
    edgesCount: model.edges.length,
    facesCount: model.faces.length
  });

  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data.charCodeAt(i);
    hash |= 0;
  }

  return `GEOM-v${model.parameters.frequency}V-${Math.abs(hash).toString(16).toUpperCase()}`;
}
