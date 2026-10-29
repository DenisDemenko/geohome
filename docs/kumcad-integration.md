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


## Phase 3.1 — actual beam cross-sections

The exported CAD interchange now includes `beamProfile` from GeoHome
(type, width, depth, diameter and wall thickness in millimetres). The
OpenCASCADE/CadQuery adapter constructs four cross-section types:

- `circular`: solid round beam.
- `pipe`: hollow circular pipe with checked positive wall thickness.
- `rectangular`: solid width-by-depth timber/metal bar.
- `square`: equal-width solid square bar (CLI override).

Example:

```bash
python tools/occt_bridge/geohome_to_step.py dome.json dome.step
python tools/occt_bridge/geohome_to_step.py dome.json pipes.step --profile pipe --strut-diameter-mm 40 --wall-mm 3
python tools/occt_bridge/geohome_to_step.py dome.json timber.step --profile rectangular --width-mm 50 --depth-mm 100
```

CI executes a geometry test suite covering section volume, STEP writing,
STEP re-import, and pipe thickness validation, alongside web lint/build/tests.
`--strut-diameter-mm` is the legacy fallback; without `--profile`,
GeoHome's embedded section type and dimensions take precedence.

**Not yet implemented:** precise mitre/bevel cuts, cut-length/hub setbacks,
individual connector bodies, solid naming in assemblies, material metadata,
or a direct KumCAD runtime connection. Resulting CAD is suitable for
interchange/visual checks, not yet for manufacturing.


## Phase 3.2 — end-cut planes (experimental)

The interchange carries optional per-strut `startMiterDeg`, `endMiterDeg`,
`bevelDeg` and `hubSetbackMm`, plus the existing `cutLengthMm`. The
OpenCASCADE bridge intersects each beam with a pair of oriented half-spaces:

- `cutLengthMm` sets a centered net beam length (equal setback at both ends).
- Otherwise `hubSetbackMm` is applied symmetrically when present.
- Positive miter tilts the inward cutting normal toward the stable local X;
  positive bevel tilts it toward the local Y.
- Absent angles default to 0 degrees. Cut angles must be less than 80 degrees.

Automated tests assert exact straight-cut length, valid angled-cut solids,
invalid cut-length rejection, STEP export/re-import and web build/test success.

**Engineering limitation:** GeoHome's currently computed miter/bevel values are
approximate and do not encode a connector-specific local angular reference.
Therefore this is geometric cut-plane support, not verified fabrication
instructions. Before CNC manufacturing, define the local frame for each node,
calculate exact face/connector intersections, validate material allowances, and
run physical calibration tests.


## Phase 4 — validation on main baseline, browser export, and connector prototype

This branch (`feat/kumcad-connectors-validation`) starts from the main-branch
integration commit `4281251`. CI now runs:

- TypeScript checks, interchange tests, Vite production build.
- A headless Chromium smoke test: open GeoHome, select CAD/CAM export,
  download CAD JSON, parse it and validate the schema and nonempty model.
- OpenCASCADE beam STEP export/re-import.
- A second STEP export of experimental connector bodies, including 3D
  spherical central hubs, radially oriented outer sleeves, and hollow bores.
  Tests validate positive volume, valid solids, and constraints on bore sizes.

Connector export command:

```bash
python tools/occt_bridge/geohome_to_step.py dome.json beams.step \
  --connectors-step connectors.step \
  --hub-diameter-mm 50 --socket-outer-mm 30 \
  --socket-inner-mm 20 --socket-length-mm 45
```

**Scope warning:** This connector design is a geometric prototype only. It
does not model fastener holes, load paths, wall-to-hub stresses, print
tolerances or exact beam-to-hub contact; no fabrication safety is implied.
The STEP export has been re-imported with CadQuery/OpenCASCADE, **not with
KumCAD itself**. A native KumCAD desktop import test remains outstanding.
The workflow is configured to cover `main` after this CI configuration is
merged; current verification is on a branch descended from `main`.


## Phase 5 — native KumCAD STEP import validation

The `feat/kumcad-native-step-smoke` branch adds an isolated test harness at
`tools/kumcad_native/` and workflow `.github/workflows/kumcad-native.yml`.

- KumCAD source pinned to commit `49598b6f30a8d0af309381663f55b14405d738d7`.
- KumCAD's real `lcad::readStep()` is linked into an executable, not duplicated.
- GeoHome test fixtures are produced using the existing CadQuery bridge.
- The native reader imports both STEP files, checks non-null shapes, positive
  volume and the number of solids.
- CI runs on Ubuntu with Qt6/OCCT development packages. A temporary OCCT
  toolkit-name compatibility shim is used for Ubuntu's older OCCT 7.6;
  no upstream KumCAD source is patched.

Verified CI: https://github.com/DenisDemenko/geohome/actions/runs/40853772835

| Fixture | Solids | Total volume (mm^3) |
| --- | ---: | ---: |
| Beams | 3 | 1016640 |
| Connectors | 3 | 177900 |

This is source-level/native-library interoperability, **not** a Windows GUI
test or a persistent synchronization channel. The proposed next stage is
an opt-in Windows local companion that imports user-selected STEP files in
KumCAD and reports status; that requires explicit app/IPC integration.
