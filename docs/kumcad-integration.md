# KumCAD integration — initial bridge

Status: **Phase 1: interchange contract committed; no native KumCAD runtime connected yet.**

## Existing GeoHome capabilities

GeoHome is a Vite/React/TypeScript application using Three.js. Its existing
`src/core/dome.ts` computes the dome model; `src/core/connectors.ts` computes
connector angles; `src/export/` already contains DXF, STEP, STL, SVG and OBJ
exporters. These remain the source of truth.

## Implemented in this branch

`src/integrations/kumcad/interchange.ts` provides:

- `toKumCadInterchange(model)`: a typed, JSON-serializable geometry handoff.
- `serializeKumCadInterchange(model)`: a serialized JSON document.
- Explicit millimetres, right-handed Z-up coordinates, versioned schema.
- Vertex/edge/face consistency checks and numeric validation.
- Strut lengths and connector incidence useful for downstream CAD creation.

Example (not yet wired to the UI):

```ts
import { serializeKumCadInterchange } from "./integrations/kumcad/interchange";

const payload = serializeKumCadInterchange(domeModel);
const file = new Blob([payload], { type: "application/json" });
```

## Next implementation stages

1. Add unit tests for a small generated dome, invalid topology, and JSON roundtrip.
2. Add an opt-in "Export CAD interchange JSON" action to GeoHome's export panel.
3. Verify whether KumCAD exposes stable reusable native core APIs. Build a separate,
   pinned C++/OpenCASCADE sidecar and map the JSON schema to real solids or STEP,
   rather than claiming its desktop app can be called from a browser.
4. Add a controlled local upload/import workflow and sample fixture, then test on
   Windows (including Qt/OCCT packaging).
5. Inspect GPL-3.0 obligations before linking or distributing KumCAD-derived code.
   A separately communicating process does not automatically resolve licensing questions.

## Safety and scope

No submodule, compiled binary, remote process execution, server route, or deployment
has been introduced. Existing DXF/STEP/STL exporters and the main branch are untouched.
This contract is **not** yet a native KumCAD file format or an established KumCAD API.


## Phase 2 — working UI and experimental OCCT bridge

- GeoHome's **Export** panel now includes **Завантажити CAD JSON**.
- `npm run test:cad` runs the TypeScript interchange tests through the existing
  `tsx` development dependency.
- `tools/occt_bridge/geohome_to_step.py` is an opt-in, local Python/CadQuery
  converter, which produces STEP cylinders following each GeoHome beam centreline.
- Example local setup (Python/CadQuery environment required):

```bash
python -m pip install cadquery
python tools/occt_bridge/geohome_to_step.py dome.json dome.step --strut-diameter-mm 20
```

CadQuery contains an OpenCASCADE geometry kernel. The result is a simple
**visual CAD handoff**, not a precise timber/steel profile or fabrication-ready
assembly; connector solids, mitres, cutting allowances and structural validation
are not implemented in this converter.

Tests/builds have not yet been executed in CI for this branch. The script is
not invoked by the web app and requires a local Python environment.
A direct KumCAD import path/API remains to be investigated separately.
