import test from "node:test";
import assert from "node:assert/strict";
import { generateDome } from "../../core/dome";
import { serializeKumCadInterchange, toKumCadInterchange } from "./interchange";

const parameters = { diameter: 6000, height: 3000, cutType: "1/2" as const, frequency: 2 as const };

test("exports a generated dome as versioned, millimetre CAD geometry", () => {
  const dome = generateDome(parameters);
  const result = toKumCadInterchange(dome);
  assert.equal(result.schema, "geohome.kumcad.interchange");
  assert.equal(result.version, 1);
  assert.equal(result.units, "mm");
  assert.equal(result.coordinateSystem, "right-handed-z-up");
  assert.equal(result.vertices.length, dome.nodes.length);
  assert.equal(result.struts.length, dome.edges.length);
  assert.equal(result.triangles.length, dome.faces.length);
  assert.equal(result.connectors.length, dome.nodes.length);
  assert.equal(JSON.parse(serializeKumCadInterchange(dome)).struts.length, dome.edges.length);
});

test("rejects an edge referring to an absent vertex", () => {
  const dome = generateDome(parameters);
  assert.ok(dome.edges.length > 0);
  dome.edges[0].end = -999;
  assert.throws(() => toKumCadInterchange(dome), /Invalid endpoints/);
});

test("rejects non-finite vertex coordinates and invalid cut lengths", () => {
  const dome = generateDome(parameters);
  dome.nodes[0].position.x = Number.NaN;
  assert.throws(() => toKumCadInterchange(dome), /Invalid vertex position/);

  const another = generateDome(parameters);
  another.edges[0].cutLength = -2;
  assert.throws(() => toKumCadInterchange(another), /cut length/);
});
