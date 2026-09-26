import { Node, Edge, Face, ValidationIssue } from "./types";
import { distance } from "./math";

export function validateDome(
  nodes: Node[],
  edges: Edge[],
  faces: Face[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Nodes check
  for (const node of nodes) {
    if (!node.position) {
      issues.push({
        level: "error",
        code: "NODE_POSITION_MISSING",
        message: `Вузол #${node.id} не має просторових координат`,
        nodeId: node.id
      });
    }

    if (node.edges.length === 0) {
      issues.push({
        level: "warning",
        code: "ISOLATED_NODE",
        message: `Вузол #${node.id} не з'єднаний з жодною балкою`,
        nodeId: node.id
      });
    }
  }

  // Edges check
  for (const edge of edges) {
    if (edge.start === edge.end) {
      issues.push({
        level: "error",
        code: "SELF_EDGE",
        message: `Балка #${edge.id} з'єднує вузол сам із собою`,
        edgeId: edge.id
      });
      continue;
    }

    const a = nodes[edge.start].position;
    const b = nodes[edge.end].position;
    const calculated = distance(a, b);

    if (Math.abs(calculated - edge.length) > 1.0) {
      issues.push({
        level: "error",
        code: "EDGE_LENGTH_MISMATCH",
        message: `Балка #${edge.id}: розбіжність довжини (${edge.length} vs ${calculated.toFixed(1)})`,
        edgeId: edge.id
      });
    }

    // For miniature scale models (diameter down to 150 mm), struts are naturally short
    if (edge.length < 5) {
      issues.push({
        level: "warning",
        code: "SHORT_BEAM",
        message: `Балка #${edge.id} критично коротка (${edge.length} мм) для виготовлення`,
        edgeId: edge.id
      });
    }
  }

  // Faces check
  for (const face of faces) {
    if (face.a === face.b || face.b === face.c || face.c === face.a) {
      issues.push({
        level: "error",
        code: "DEGENERATE_FACE",
        message: `Грань #${face.id} вироджена (має спільні вершини)`,
        faceId: face.id
      });
    }
  }

  return issues;
}
