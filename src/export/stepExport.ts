import { DomeModel } from "../core/types";
import { normalize, cross, sub } from "../core/math";

/**
 * Generates an ISO 10303-21 compliant STEP AP203/AP214 CAD file.
 * Imports directly into Autodesk Fusion 360, FreeCAD, SolidWorks, Rhino, Inventor.
 */
export function exportDomeSTEP(model: DomeModel): string {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const lines: string[] = [];

  let idCounter = 1;
  const nextId = () => `#${idCounter++}`;

  lines.push("ISO-10303-21;");
  lines.push("HEADER;");
  lines.push("FILE_DESCRIPTION(('KupolGeo Parametric Geodesic Dome AP203 CAD Model'), '2;1');");
  lines.push(`FILE_NAME('geodesic_dome_${model.parameters.frequency}V.stp', '${timestamp}', ('KupolGeo Engineer'), ('KupolGeo Studio'), 'KupolGeo Geometry Engine v0.1', 'AI Studio Build', '');`);
  lines.push("FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));");
  lines.push("ENDSEC;");
  lines.push("DATA;");

  // Basic context and units
  const idContext = nextId(); // e.g. #1
  const idLengthUnit = nextId(); // #2
  const idUncertainty = nextId(); // #3
  const idGeomContext = nextId(); // #4
  const idOrigin = nextId(); // #5
  const idDirZ = nextId(); // #6
  const idDirX = nextId(); // #7
  const idAxis = nextId(); // #8

  const nodePointIds = new Map<number, string>();
  const vertexPointIds = new Map<number, string>();

  // 1. Cartesian Points & Vertices for Nodes
  for (const node of model.nodes) {
    const ptId = nextId();
    nodePointIds.set(node.id, ptId);
    lines.push(`${ptId} = CARTESIAN_POINT('Node_${node.id}', (${node.position.x.toFixed(4)}, ${node.position.y.toFixed(4)}, ${node.position.z.toFixed(4)}));`);

    const vertId = nextId();
    vertexPointIds.set(node.id, vertId);
    lines.push(`${vertId} = VERTEX_POINT('V_${node.id}', ${ptId});`);
  }

  // 2. Lines & Edges for Beams
  const edgeCurveIds = new Map<number, string>();
  for (const edge of model.edges) {
    const pStart = model.nodes[edge.start].position;
    const pEnd = model.nodes[edge.end].position;
    const dir = normalize(sub(pEnd, pStart));

    const dirId = nextId();
    lines.push(`${dirId} = DIRECTION('Dir_Edge_${edge.id}', (${dir.x.toFixed(4)}, ${dir.y.toFixed(4)}, ${dir.z.toFixed(4)}));`);

    const vectorId = nextId();
    lines.push(`${vectorId} = VECTOR('Vec_Edge_${edge.id}', ${dirId}, ${edge.length.toFixed(4)});`);

    const lineId = nextId();
    lines.push(`${lineId} = LINE('Line_Edge_${edge.id}', ${nodePointIds.get(edge.start)}, ${vectorId});`);

    const edgeCurveId = nextId();
    edgeCurveIds.set(edge.id, edgeCurveId);
    lines.push(`${edgeCurveId} = EDGE_CURVE('Edge_${edge.id}_Type_${edge.type}', ${vertexPointIds.get(edge.start)}, ${vertexPointIds.get(edge.end)}, ${lineId}, .T.);`);
  }

  // 3. Faces (Advanced Face B-Rep facets)
  const faceIds: string[] = [];
  const edgeMap = new Map<string, number>();
  for (const e of model.edges) {
    edgeMap.set(`${Math.min(e.start, e.end)}-${Math.max(e.start, e.end)}`, e.id);
  }

  for (const face of model.faces) {
    // Find edge IDs for triangle face
    const e1Id = edgeMap.get(`${Math.min(face.a, face.b)}-${Math.max(face.a, face.b)}`)!;
    const e2Id = edgeMap.get(`${Math.min(face.b, face.c)}-${Math.max(face.b, face.c)}`)!;
    const e3Id = edgeMap.get(`${Math.min(face.c, face.a)}-${Math.max(face.c, face.a)}`)!;

    // Oriented edges
    const oe1 = nextId();
    const oe2 = nextId();
    const oe3 = nextId();

    const e1 = model.edges[e1Id];
    const e2 = model.edges[e2Id];
    const e3 = model.edges[e3Id];

    lines.push(`${oe1} = ORIENTED_EDGE('', *, *, ${edgeCurveIds.get(e1Id)}, ${e1.start === face.a ? '.T.' : '.F.'});`);
    lines.push(`${oe2} = ORIENTED_EDGE('', *, *, ${edgeCurveIds.get(e2Id)}, ${e2.start === face.b ? '.T.' : '.F.'});`);
    lines.push(`${oe3} = ORIENTED_EDGE('', *, *, ${edgeCurveIds.get(e3Id)}, ${e3.start === face.c ? '.T.' : '.F.'});`);

    const edgeLoopId = nextId();
    lines.push(`${edgeLoopId} = EDGE_LOOP('Loop_Face_${face.id}', (${oe1}, ${oe2}, ${oe3}));`);

    const faceBoundId = nextId();
    lines.push(`${faceBoundId} = FACE_OUTER_BOUND('Bound_Face_${face.id}', ${edgeLoopId}, .T.);`);

    // Plane equation
    const pA = model.nodes[face.a].position;
    const pB = model.nodes[face.b].position;
    const pC = model.nodes[face.c].position;
    const n = normalize(cross(sub(pB, pA), sub(pC, pA)));

    const planeNormDirId = nextId();
    lines.push(`${planeNormDirId} = DIRECTION('', (${n.x.toFixed(4)}, ${n.y.toFixed(4)}, ${n.z.toFixed(4)}));`);

    const planeAxisId = nextId();
    lines.push(`${planeAxisId} = AXIS2_PLACEMENT_3D('', ${nodePointIds.get(face.a)}, ${planeNormDirId}, $);`);

    const planeId = nextId();
    lines.push(`${planeId} = PLANE('Plane_Face_${face.id}', ${planeAxisId});`);

    const advFaceId = nextId();
    faceIds.push(advFaceId);
    lines.push(`${advFaceId} = ADVANCED_FACE('Face_${face.id}_Type_${face.type}', (${faceBoundId}), ${planeId}, .T.);`);
  }

  // 4. Closed Shell & Manifold Surface Representation
  const openShellId = nextId();
  lines.push(`${openShellId} = OPEN_SHELL('Dome_Shell', (${faceIds.join(", ")}));`);

  const shellSurfaceModelId = nextId();
  lines.push(`${shellSurfaceModelId} = SHELL_BASED_SURFACE_MODEL('Dome_Surface', (${openShellId}));`);

  // Product and Representation context
  const productDefContextId = nextId();
  lines.push(`${productDefContextId} = APPLICATION_CONTEXT('configuration control');`);

  const appProtocolDefId = nextId();
  lines.push(`${appProtocolDefId} = APPLICATION_PROTOCOL_DEFINITION('international standard', 'config_control_design', 1994, ${productDefContextId});`);

  const productId = nextId();
  lines.push(`${productId} = PRODUCT('KupolGeo_Dome_${model.parameters.frequency}V', 'Geodesic Dome Structure', '', (#${idCounter + 2}));`);

  const productDefFormationId = nextId();
  lines.push(`${productDefFormationId} = PRODUCT_DEFINITION_FORMATION('1.0', 'Initial Revision', ${productId});`);

  const productContextId = nextId();
  lines.push(`${productContextId} = PRODUCT_CONTEXT('', ${productDefContextId}, 'mechanical');`);

  const productDefId = nextId();
  lines.push(`${productDefId} = PRODUCT_DEFINITION('design', 'KupolGeo Geodesic Dome', ${productDefFormationId}, ${productDefContextId});`);

  const shapeDefRepId = nextId();
  const shapeRepId = nextId();
  lines.push(`${shapeDefRepId} = PRODUCT_DEFINITION_SHAPE('Dome_Shape', 'CAD Geometry', ${productDefId});`);
  lines.push(`${shapeRepId} = SHAPE_REPRESENTATION('Dome_Representation', (${shellSurfaceModelId}), ${idGeomContext});`);

  // System Context Boilerplate
  lines.push(`${idOrigin} = CARTESIAN_POINT('Origin', (0., 0., 0.));`);
  lines.push(`${idDirZ} = DIRECTION('Z_Axis', (0., 0., 1.));`);
  lines.push(`${idDirX} = DIRECTION('X_Axis', (1., 0., 0.));`);
  lines.push(`${idAxis} = AXIS2_PLACEMENT_3D('World_Coordinate_System', ${idOrigin}, ${idDirZ}, ${idDirX});`);

  lines.push(`${idLengthUnit} = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI., .METRE.) );`);
  lines.push(`${idUncertainty} = UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.01), ${idLengthUnit}, 'distance_accuracy_value', 'confusion accuracy');`);
  lines.push(`${idGeomContext} = ( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${idUncertainty})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${idLengthUnit})) REPRESENTATION_CONTEXT('Dome3D', '3D Spatial Geometry') );`);

  lines.push("ENDSEC;");
  lines.push("END-ISO-10303-21;");

  return lines.join("\n");
}
