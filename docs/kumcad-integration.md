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
