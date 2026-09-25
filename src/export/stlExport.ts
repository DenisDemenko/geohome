import { DomeModel } from "../core/types";
import { sub, cross, normalize } from "../core/math";

export function exportDomeSTL(model: DomeModel): string {
  const lines: string[] = [];
  lines.push("solid geodesic_dome");

  for (const face of model.faces) {
    const A = model.nodes[face.a].position;
    const B = model.nodes[face.b].position;
    const C = model.nodes[face.c].position;

    const normal = normalize(cross(sub(B, A), sub(C, A)));

    lines.push(`  facet normal ${normal.x.toFixed(4)} ${normal.y.toFixed(4)} ${normal.z.toFixed(4)}`);
    lines.push("    outer loop");
    lines.push(`      vertex ${A.x.toFixed(3)} ${A.y.toFixed(3)} ${A.z.toFixed(3)}`);
    lines.push(`      vertex ${B.x.toFixed(3)} ${B.y.toFixed(3)} ${B.z.toFixed(3)}`);
    lines.push(`      vertex ${C.x.toFixed(3)} ${C.y.toFixed(3)} ${C.z.toFixed(3)}`);
    lines.push("    endloop");
    lines.push("  endfacet");
  }

  lines.push("endsolid geodesic_dome");
  return lines.join("\n");
}
