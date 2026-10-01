# VLSI Digital Twin

An AI-powered VLSI digital-twin platform. Target architecture (see
`docs/architecture.md` for the full, stable reference):

> One prompt -> one canonical VLSI IR -> multiple REAL, synchronized
> views (schematic, simulation, 3D/physical, silicon/GDS, breadboard) ->
> one digital twin.

Every view must trace back to the same IR component/port/connection ids
(the convention already used by every generator in this codebase) - this
is what makes it a digital twin, not four disconnected illustrations
generated independently from the same prompt. Every future step is
evaluated against this target (see `docs/architecture.md`'s "Roadmap
evaluation principle"), not judged on its own as "a nice UI addition".

The platform is being built incrementally, one step at a time. The
platform is currently at **Step 15** (see the "Step 15" section below for
what that is) - a full step-by-step build log follows in this file.

## Project structure

```
backend/
  app/
    api/       # HTTP route handlers
    core/      # configuration
    domain/    # (empty placeholder) future VLSI domain logic
    main.py    # FastAPI app entrypoint
  tests/       # pytest tests
  requirements.txt
  Dockerfile
frontend/      # (empty placeholder) future Next.js app
shared/
  ir-schema/   # (empty placeholder) future canonical IR schema
  proto/       # (empty placeholder) future shared protocol definitions
infrastructure/
  docker/      # (empty placeholder) future infra/docker assets
  scripts/     # (empty placeholder) future ops scripts
docs/          # project documentation
docker-compose.yml
.env.example
```

## Running the backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env   # optional, only needed for docker-compose
uvicorn app.main:app --reload
```

Then verify:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

## Running tests

```bash
cd backend
source .venv/bin/activate
pytest
```

## Running with Docker

```bash
cp .env.example .env
docker compose up --build
```

## Step 2 - Canonical VLSI IR

The IR (Intermediate Representation) is the single, structured description
of a circuit that every future stage of this platform (guardrails,
schematic compiler, behavioral simulation, physical/EDA flow, 3D digital
twin) will read and write - so no downstream layer ever invents its own
incompatible representation of the same design.

It lives at `backend/app/domain/ir/`:

- `models.py` - the canonical Pydantic v2 models: `IRDocument`, `Component`,
  `Port`, `Connection`/`ConnectionEndpoint`, `Annotation`, `Provenance`,
  `VisualMetadata`, `Parameter`, `BitRange`. All models are frozen
  (immutable) - once built, an IR object can only be replaced, never
  silently mutated in place.
- `validation.py` - `validate_document()`, a dedicated structural validator
  that never raises. It returns a `ValidationResult` with structured
  `ValidationIssue`s (code/message/path) covering: schema-version support,
  globally-unique ids, component/port reference integrity on every
  connection, port-direction consistency (including hierarchy boundary
  ports), bit-range validity, parent-reference validity, hierarchy-cycle
  detection, root-component-list consistency, and multiple-driver
  conflicts (a port driven by more than one connection with overlapping
  bit ranges - non-overlapping bus-assembly slices are not flagged).
- `serialization.py` - deterministic `to_dict`/`to_json`/`from_dict`/
  `from_json`, plus `json_schema()` which generates the JSON Schema
  directly from the Pydantic models (never hand-maintained separately).
- `examples.py` - 5 small, hand-written golden `IRDocument` fixtures
  (simple inverter, AND gate, two-component connection, hierarchical
  module, multi-bit connection) - a foundation for future golden
  regression fixtures.

The generated JSON Schema artifact lives at `shared/ir-schema/ir.schema.json`
and is drift-checked by a test (it must always match what the current
Pydantic models actually generate).

`Component.kind` is deliberately a plain, open string (not a closed enum) -
the IR itself does not decide which VLSI concepts are "supported"; that is
a future knowledge/whitelist service's job.

In plain terms: a **Component** is one logical circuit element (a gate,
register, module, transistor, etc.); a **Port** is one named signal
terminal on a component (with a direction, width, and optional bit
range); a **Connection**/net wires one component's port to another's;
**Provenance** records where a design came from (source, who/what created
it, when, and an optional request id/notes) - never secrets. Every
`IRDocument` carries a `schema_version` (the version of the IR's own
structure) separately from a `design_version` (the version of this
particular circuit design) plus an optional `parent_version` pointing at
the design it was derived from. The whole document is immutable, and
`validate_document()` must be run before any future system (guardrails,
compiler, simulation, physical flow) is allowed to consume it.

What is intentionally NOT implemented yet: no database/persistence, no
event sourcing, no AI/LLM generation of IR documents, no schematic
rendering, no simulation, no EDA/physical flow, no 3D digital twin. This
step is the data model and its validation/serialization only.

## Step 3 - Guardrails

Guardrails sit right after the Canonical IR and right before any future
downstream consumer:

```
Canonical IR -> Guardrails -> Safe normalization -> Validated IR
```

They live at `backend/app/domain/guardrails/`:

- `models.py` - `GuardrailIssue` (code/severity/message/path) and
  `GuardrailResult` (is_valid/errors/warnings/normalized_document). Both
  frozen, matching the IR's own immutability convention.
- `rules.py` - guardrail-only checks that are genuinely NEW on top of
  Step 2 (empty/whitespace-only identifiers; a dangling annotation
  reference, reported as a WARNING since annotations never affect
  circuit semantics). Everything Step 2's `validate_document()` already
  owns (duplicate ids, missing component/port references, bad bit
  ranges, port-direction consistency, hierarchy cycles/invalid parents,
  root-component mismatches, multiple-driver conflicts, unsupported
  schema version) is reused as-is, never reimplemented.
- `normalization.py` - `normalize_document()`: deterministically reorders
  components/ports/parameters/connections/annotations/root_component_ids
  by id (or name for parameters). Only list ORDER ever changes - never a
  value - so circuit semantics (entirely id-based in this IR) are
  provably unaffected. Idempotent and deterministic by construction.
- `validator.py` - `run_guardrails(document)`, the single entry point:
  validate -> (if zero errors) normalize -> validate again -> return a
  `GuardrailResult`. If the document already fails validation,
  normalization is skipped and `normalized_document` stays `None`.

**Errors vs warnings**: an ERROR means `is_valid` is `False` and no
normalized document is returned - something is structurally wrong or
unsafe to interpret. A WARNING never blocks `is_valid` - it flags a
harmless imperfection (currently: a dangling annotation reference) that
future systems may still want to know about.

**Guardrails are intentionally conservative.** They never invent missing
components/ports, change a signal's direction or width, reconnect
signals, or guess at ambiguous user intent. Anything unsafe to normalize
is reported as an issue instead - "reject unsafe ambiguity rather than
guessing."

Run just the guardrail tests with:

```bash
cd backend
.venv/bin/pytest tests/domain/guardrails -v
```

What is intentionally NOT implemented yet in Step 3: no AI/LLM, no
simulation, no EDA/physical flow, no database, no 3D digital twin - only
the guardrails/normalization layer on top of the existing Canonical IR.

## Step 4 - Schematic Generation

```
Canonical IR -> Guardrails -> Normalized IR -> Schematic Generator -> Deterministic Schematic
```

The schematic is a downstream VIEW generated FROM the Canonical IR - it is
never a second source of truth, and it never changes circuit meaning. It
lives at `backend/app/domain/schematic/`:

- `models.py` - `SchematicDocument`/`SchematicComponent`/`SchematicPort`/
  `SchematicWire`/`SchematicEndpoint`/`RoutedPoint`/`SchematicResult`, all
  frozen like the IR/guardrails models. Reuses the IR's own
  `PortDirection`/`BitRange` directly instead of redefining them.
- `layout.py` - a simple, deterministic auto-layout: components are
  layered left-to-right by longest-path over the connection graph
  (Kahn-style, so a legitimate combinational feedback loop can never
  cause an infinite loop), stacked top-to-bottom within a column by
  sorted id. INPUT ports render on a component's left edge, OUTPUT/INOUT
  on the right, stacked in sorted port-id order. Isolated here so it can
  later be replaced by a smarter placer.
- `errors.py` - `SchematicError` (code/message/path).
- `generator.py` - `generate_schematic(document) -> SchematicResult`, the
  single public entry point: calls `run_guardrails()` (Step 3, never
  reimplemented), and only if the result is valid does it render a
  `SchematicDocument` from `normalized_document`. If guardrails reject
  the IR, no schematic is generated - only a structured list of errors.

**Traceability**: every generated object carries a `source_*_id` back to
the exact Canonical IR object it came from (`SchematicComponent.
source_component_id`, `SchematicPort.source_port_id`, `SchematicWire.
source_connection_id`) - a `SchematicComponent`/`SchematicPort`/
`SchematicWire`'s own `id` is always deterministically derived from that
source id (e.g. `sc_and1`, `sp_and1.a`, `sw_conn_1`), never randomly
generated.

**Determinism**: the generator uses only sorted-by-id iteration and pure
arithmetic for coordinates - the same IR document always produces a
byte-identical `SchematicResult`, verified by dedicated tests (including
that reversing the input `components`/`connections` list order does not
change the generated output).

**Guardrail integration**: schematic generation never duplicates Step 2/3
validation logic - it is entirely gated by `run_guardrails()`. Non-
blocking guardrail warnings (e.g. a dangling annotation reference) pass
through as `SchematicResult.warnings` without preventing generation.

What is intentionally NOT implemented yet: hierarchy-aware nested visual
grouping (a v1 simplification - components currently layer purely by
connection topology, not by parent/child nesting, though hierarchy stays
fully traceable via IR ids), orthogonal wire routing (wires are currently
simple 2-point straight lines between port positions), annotation
rendering in the schematic, and - as with every prior step - no AI/LLM,
simulation, EDA tool invocation, physical design, 3D rendering, HTTP API,
or database.

## Step 5 - Behavioral Simulation

```
Canonical IR -> Guardrails -> Normalized IR -> Behavioral Simulator -> SimulationResult
```

The simulator is a downstream EXECUTION view of the Canonical IR - it
never becomes a second source of truth, and it is completely independent
of the schematic layer (it never imports `app.domain.schematic` or reads
any coordinate). It lives at `backend/app/domain/simulation/`:

- `models.py` - `LogicValue` (a genuinely new type - nothing in the IR
  already represents a digital signal value - three states: `0`, `1`,
  `x`/unknown, never silently collapsed to 0), `SimulationSignal`
  (source_port_id/value/width), `SimulationStep`, `SimulationResult`
  (is_valid/errors/warnings/steps/final_signals). All frozen, matching
  every other domain's convention.
- `errors.py` - `SimulationError` (code/message/path).
- `engine.py` - `simulate(document, input_values, *, max_iterations=64)
  -> SimulationResult`, the single public entry point.

**Supported primitives**: `input`, `output`, `AND`, `OR`, `NOT` only -
exactly the set explicitly required, nothing more. `BUFFER`/`MODULE`/
`REGISTER` (all present in `app.domain.ir.examples`) deliberately produce
`UNSUPPORTED_COMPONENT_KIND` rather than a guessed behavior: `BUFFER`'s
semantics are not actually unambiguous in this repo's own example (one
instance has only an OUTPUT port, the other only an INPUT port - a real
passthrough is never demonstrated), `MODULE` has no IR-defined boundary
behavior, and `REGISTER` would need clock semantics nowhere specified.

**Unknown-state semantics** are explicit, conservative three-valued logic
(never Python truthiness): `0 AND x = 0`, `1 AND x = x`, `x AND x = x`;
`1 OR x = 1`, `0 OR x = x`, `x OR x = x`; `NOT x = x`. An input's value is
only ever `x` if the caller explicitly supplies `"x"` - a value that is
simply never supplied is a hard `MISSING_INPUT_VALUE` error, never a
silent default.

**Guardrail integration**: `simulate()` calls `run_guardrails()` first and
never duplicates Step 2/3 validation logic; if the IR is rejected, no
simulated state is ever returned - only structured errors. Non-blocking
guardrail warnings pass through unchanged.

**Determinism**: a synchronous (Jacobi-style) fixed-point evaluator -
every round computes every component's outputs purely from the
*previous* round's values, so evaluation order can never affect the
result. Verified by tests that reversing the input `components`/
`connections` list order produces an identical `SimulationResult`.

**Feedback/cycle safety**: evaluation is bounded by `max_iterations`
(default 64) so a connection-graph feedback loop can never hang the
process. The supported AND/OR/NOT primitives are a monotone extension of
boolean logic over `{0, 1, x}`, so any circuit built purely from them
provably converges (verified directly with a real self-feedback NOT gate,
which settles at a stable `x` almost immediately) - the iteration cap and
`NON_CONVERGENT_SIMULATION` error exist as a defensive safety net, tested
via an artificially low override rather than a circuit that can actually
diverge today.

**Traceability**: every `SimulationSignal.source_port_id` is a real
Canonical IR port id - never invented, never a random UUID.

What is intentionally NOT implemented: cycle-accurate simulation,
Verilog/SystemVerilog execution, synthesis, timing simulation, transistor
simulation, SPICE, any EDA tool integration, multi-bit/bus evaluation
(any port with width != 1, or any connection with an explicit bit_range,
produces `UNSUPPORTED_WIDTH`/`UNSUPPORTED_BIT_RANGE` rather than invented
bit-vector semantics), and clocked/sequential behavior (registers/flip-
flops report `UNSUPPORTED_COMPONENT_KIND`).

## Step 6 - Simulation API

```
Canonical IR -> Guardrails -> Behavioral Simulation -> HTTP API -> SimulationResult
```

Step 6 exposes the existing Step 5 simulator over HTTP - it adds zero new
circuit semantics, zero new validation rules, and zero new
`SimulationResult` shape. The API is pure transport/orchestration:

- `backend/app/services/simulation_service.py` - `run_simulation(document_data,
  input_values, max_iterations=None)`: the ONLY place a raw client-supplied
  IR dict is parsed (`app.domain.ir.serialization.from_dict`). A dict that
  isn't a valid Canonical IR produces a structured `INVALID_IR_DOCUMENT`
  result rather than an exception; otherwise it delegates entirely to the
  one real simulator, `app.domain.simulation.engine.simulate()`.
- `backend/app/api/simulation.py` - `POST /api/simulation/simulate`. The
  request body is `{"document": <Canonical IR JSON>, "input_values":
  {"in_a.out": 1, ...}, "max_iterations": <optional int>}`. The response
  body is the exact same `SimulationResult` shape the domain simulator
  produces (`is_valid`/`errors`/`warnings`/`steps`/`final_signals`) - no
  second, frontend-specific result format was created.

**HTTP status semantics**: a fundamentally malformed request (missing
`document`, `document` not a JSON object, or an unknown request field) is
rejected by FastAPI's normal request validation with **422**. Everything
else - a well-formed request whose IR/inputs are invalid, unsupported, or
non-convergent, all the way through a fully successful simulation - is
**200**, with `is_valid` distinguishing success from every failure case.
Expected simulation failures are always the same structured
code/message/path errors the domain layer already produces - never a
generic exception string, never a 500.

**Interactive docs**: since this project uses FastAPI, `POST
/api/simulation/simulate` is automatically documented at `/docs` (Swagger
UI) and `/openapi.json`, with the request/response schemas and the
endpoint's own description (supported logic values, supported component
kinds, what does NOT exist yet) generated directly from the code above -
nothing hand-duplicated.

Example request/response:

```json
POST /api/simulation/simulate
{
  "document": { "...": "a full Canonical IR document" },
  "input_values": { "in_a.out": 1, "in_b.out": 1 }
}
```
```json
{
  "is_valid": true,
  "errors": [],
  "warnings": [],
  "steps": [ "...": "one entry per fixed-point round" ],
  "final_signals": [
    { "source_port_id": "and1.y", "value": "1", "width": 1 },
    { "source_port_id": "out_y.in", "value": "1", "width": 1 }
  ]
}
```

Run just the API tests with:

```bash
cd backend
.venv/bin/pytest tests/test_simulation_api.py -v
```

What is intentionally NOT implemented: no frontend/UI (this step is
backend-contract-only), no authentication/rate limiting/quotas, and -
same as Step 5 - no Verilog/SystemVerilog, timing, synthesis, SPICE,
sequential/clocked logic, or multi-bit/bus simulation. The API does not
claim any of these; it exposes exactly what the domain simulator already
honestly supports.

## Step 7 - Physical/Silicon Representation (foundational)

```
Canonical IR -> Guardrails -> Normalized IR -> Physical Layout Generator -> PhysicalDocument
```

A deterministic, traceable downstream VIEW - like the schematic and
simulation layers, never a second source of truth. Lives at
`backend/app/domain/physical/`:

- `models.py` - `PhysicalDocument` (source_document_id/source_schema_version/
  die_width/die_height/blocks/nets), `PhysicalBlock` (one per IR
  Component: id/source_component_id/kind/name/x/y/width/height/area/pins),
  `PhysicalPin` (reuses IR's own `PortDirection`), `PhysicalNet`/
  `PhysicalEndpoint` (one per IR Connection - structural connectivity
  only, see below), `PhysicalResult`. All frozen, matching every other
  domain's convention.
- `errors.py` - `PhysicalError` (code/message/path).
- `layout.py` - a simple, deterministic **shelf-packing** floorplan:
  blocks are placed left-to-right in sorted-id order, wrapping to a new
  row once a row-width budget is exceeded; pins are placed on a block's
  left (INPUT) or right (OUTPUT/INOUT) edge, stacked in sorted port-id
  order - the same real physical-pin-placement convention the schematic
  layer already uses. Block size is a small, explicit, documented,
  technology-agnostic rule (a fixed base size that grows slightly with
  pin count) - **not** derived from any real process/technology (PDK)
  library, since no EDA toolchain integration exists yet.
- `validation.py` - `validate_physical_document()`: every block stays
  within the die bounds, no two blocks overlap, and every net resolves to
  a real pin on a real block. Mirrors the IR/guardrails
  code/message/path issue shape.
- `serialization.py` - `to_dict`/`to_json`/`from_dict`/`from_json`/
  `json_schema()`, identical in shape to `app.domain.ir.serialization`.
  The generated JSON Schema artifact lives at
  `shared/physical-schema/physical.schema.json` and is drift-checked by a
  test, exactly like the IR's own schema artifact.
- `generator.py` - `generate_physical_layout(document) -> PhysicalResult`,
  the single public entry point: calls `run_guardrails()` (reused, never
  duplicated), builds the `PhysicalDocument`, then re-validates it with
  this domain's own `validate_physical_document()` as a defensive
  self-check before returning it.

**Deliberately honest scope limits**: `PhysicalNet` records only WHICH
pins connect (for traceability) - it carries **no routed geometry**.
Unlike the schematic layer's wires (an abstract diagram, never claiming
to be real routing), a physical die's actual routing implies real
DRC-compliant metal geometry, which is genuine EDA work and is
deliberately not attempted here. Placement is purely **structural** -
unlike the behavioral simulator, physical layout does not care about
component `kind` at all, so components the simulator can't evaluate
(`MODULE`, `REGISTER`, `BUFFER`, multi-bit ports) are placed here without
issue, since floorplanning needs no behavioral semantics.

**Traceability**: every `PhysicalBlock.source_component_id`, `PhysicalPin.
source_port_id`, and `PhysicalNet.source_connection_id` is a real
Canonical IR id; the physical object's own `id` is always deterministically
derived from it (`phys_<component_id>`, `pin_<port_id>`, `net_<connection_id>`)
- never a random UUID.

What is intentionally NOT implemented: real place-and-route, any real
process/technology (PDK) data, DRC/LVS, real routed wire geometry, GDSII
or any other real physical format, a 3D digital twin, and (same as every
prior step) no database, Redis, AI/LLM, or EDA tool invocation.

## Step 8 - Schematic + Physical Generation HTTP API

```
Canonical IR -> Guardrails -> Schematic Generator  -> HTTP API -> SchematicResult
Canonical IR -> Guardrails -> Physical Layout Generator -> HTTP API -> PhysicalResult
```

Step 8 exposes the existing Step 4 (schematic) and Step 7 (physical)
domain generators over HTTP, mirroring Step 6's simulation-API
architecture exactly. It adds zero new circuit/layout semantics and zero
new result shapes - it is pure transport/orchestration on top of
already-tested domain code:

- `backend/app/services/schematic_service.py` - `run_schematic_generation
  (document_data)`: the ONLY place a raw client-supplied IR dict is
  parsed for this endpoint. A dict that isn't a valid Canonical IR
  produces a structured `INVALID_IR_DOCUMENT` result rather than an
  exception; otherwise delegates entirely to
  `app.domain.schematic.generator.generate_schematic()`.
- `backend/app/services/physical_service.py` - the identical pattern for
  `app.domain.physical.generator.generate_physical_layout()`.
- `backend/app/api/schematic.py` - `POST /api/schematic/generate`.
- `backend/app/api/physical.py` - `POST /api/physical/generate`.

Both endpoints accept `{"document": <Canonical IR JSON>}` (a plain
Canonical IR document - unlike the simulation endpoint, neither schematic
nor physical generation take `input_values`, since they are purely
structural/deterministic, not behavioral) and return the exact existing
`SchematicResult`/`PhysicalResult` shape
(`is_valid`/`errors`/`warnings`/`schematic`|`physical`) - no second,
frontend-specific result format was created.

**HTTP status semantics** are identical to Step 6: a fundamentally
malformed request (missing `document`, `document` not a JSON object, or
an unknown request field) is rejected with **422**. Everything else - a
well-formed request whose IR is invalid, all the way through a fully
successful generation - is **200**, with `is_valid` distinguishing
success from failure. Expected failures are always the same structured
code/message/path errors the domain layer already produces.

Example:

```json
POST /api/schematic/generate
{ "document": { "...": "a full Canonical IR document" } }
```
```json
{
  "is_valid": true,
  "errors": [],
  "warnings": [],
  "schematic": {
    "source_document_id": "doc_and_gate",
    "source_schema_version": "1.0.0",
    "components": [ "...": "one SchematicComponent per IR Component" ],
    "wires": [ "...": "one SchematicWire per IR Connection" ]
  }
}
```

`POST /api/physical/generate` follows the identical request shape and
returns `PhysicalResult` (`physical.blocks`/`physical.nets`) instead.

Run just the new API tests with:

```bash
cd backend
.venv/bin/pytest tests/test_schematic_api.py tests/test_physical_api.py -v
```

What is intentionally NOT implemented: no combined schematic+physical
endpoint (one endpoint per domain, matching Step 6's precedent), no
frontend/UI, no 3D rendering, no authentication/rate limiting, and - same
as every prior step - no database, Redis, AI/LLM, or real EDA tool
invocation.

## Step 9 - 3D Digital Twin Foundation (Scene Data Contract)

```
Canonical IR -> Guardrails -> Schematic + Physical Generators -> Scene Generator -> HTTP API -> SceneResult
```

Step 9 is the smallest backend foundation for the eventual "interactive
3D digital twin" named in this project's own long-term pipeline - a
**deterministic, traceable 3D-ready DATA CONTRACT**, not a renderer. No
frontend, no 3D framework, no camera/controls were introduced (the
`frontend/` directory remains empty, as it was before this step) - this
is deliberately a pure data-layer increment, matching every prior step's
"smallest useful increment" philosophy.

Lives at `backend/app/domain/scene/` (models/errors/generator/`__init__`),
`backend/app/services/scene_service.py`, `backend/app/api/scene.py`
(`POST /api/scene/generate`) - identical architecture to Step 6/8.

**Key architectural decision (documented, not silently resolved)**: the
scene generator calls BOTH existing view generators -
`generate_schematic()` and `generate_physical_layout()` - but they compute
geometry in two genuinely different, mutually-incompatible 2D coordinate
spaces (schematic uses topological dataflow layering; physical uses a
shelf-packing floorplan). Mixing raw coordinates from both into one scene
would be geometrically inconsistent, so **physical layout is the sole
geometry source** for `SceneObject` position/size (it is the more
spatially-meaningful of the two, and is literally the "physical/silicon"
representation this scene projects into 3D). The schematic result is
still fully computed and its `is_valid`/errors/warnings are folded in as
a defensive cross-check - both wrap the identical guardrails call for the
same document, so they must always agree; a divergence would itself
surface as a `SCENE_SOURCE_MISMATCH` error rather than being silently
ignored.

**3D semantics**: `SceneObject` reuses `PhysicalBlock`'s existing,
already-deterministic `x`/`y`/`width`/`height` UNCHANGED, adds a
deterministic `z` baseline (always `0.0`) and a fixed, clearly
illustrative extrusion `depth` (always `20.0`) - the same "illustrative,
not real PDK/process data" honesty convention `app.domain.physical`
already established for its own block sizing. `SceneObject`'s own `id` is
deterministically derived (`scene_<source_component_id>`), never random.

**Determinism/ordering**: both underlying generators already sort by id
internally (Steps 4/7), so the scene generator inherits order-
independence for free without needing to alter either existing contract
- verified by a dedicated test (reversing the IR's `components` list
produces an identical scene).

Request/response contract identical in spirit to Step 8:
`POST /api/scene/generate` with `{"document": <Canonical IR JSON>}` ->
the exact `SceneResult` shape (`is_valid`/`errors`/`warnings`/`scene`).
Same HTTP semantics: 422 for a malformed request wrapper, 200 with
`is_valid` distinguishing every other outcome (invalid IR, unsupported,
or success) - never a partial scene on failure.

What is intentionally NOT implemented: no rendering framework of any
kind (Three.js/WebGL/Canvas/SVG), no frontend project/scaffolding, no
camera/controls/interaction, no real PDK/process Z-thickness data, no
real routing geometry, no persistence, and - same as every prior step -
no database, Redis, AI/LLM, or EDA tool invocation. An actual interactive
3D renderer consuming this contract is a distinct, later step.

## Step 10 - Frontend/API Integration Foundation

```
Backend (Steps 1-9, unchanged) -> CORS -> Next.js frontend -> POST /api/scene/generate -> raw SceneResult displayed
```

Step 10 is a frontend/API integration foundation ONLY - it proves a real
browser-based frontend can reach the existing backend and render the
existing Step 9 Scene contract. It is deliberately NOT the interactive 3D
renderer itself (no Three.js/WebGL/canvas, no camera/controls, no visual
digital-twin representation) - that remains a distinct, later step.

**Frontend** (`frontend/`): a minimal Next.js + TypeScript project (the
stack decided in this project's original technology direction - no
Tailwind/styling framework, no state-management library, matching the
"smallest useful increment" every prior backend step also followed). One
page (`src/app/page.tsx`) calls `generateScene()` (`src/lib/api.ts` - a
thin fetch wrapper whose `SceneResult`/`SceneObject`/`SceneError`
TypeScript interfaces mirror the backend's Pydantic models field-for-
field, no second/duplicate schema) against a hardcoded example IR
document (`src/lib/exampleDocument.ts`, identical to the backend's own
`and_gate_document()` fixture - there is no IR-authoring UI yet) and
displays the raw JSON response. `NEXT_PUBLIC_API_BASE_URL` (see
`.env.local.example`) configures the backend origin; defaults to
`http://localhost:8000` for same-host local development.

**Backend CORS** (`app/core/config.py`'s new `cors_origins` setting,
wired into `app/main.py` via `CORSMiddleware`): defaults to
`http://localhost:3000`/`http://127.0.0.1:3000` (the Next.js dev server)
only - no production origin assumptions baked in. Covered by 3 new
regression tests (`tests/test_cors.py`): an allowed origin receives the
CORS header on `/health`, a preflight `OPTIONS` request against
`/api/scene/generate` succeeds, and a disallowed origin receives no CORS
header at all.

**Run locally**:

```bash
# backend
cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

# frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Then open the frontend dev server's URL in a browser - it fetches from
the backend and displays the Scene JSON directly on the page.

What is intentionally NOT implemented: any 3D rendering (Three.js/WebGL/
canvas/SVG), camera/controls/interaction, a styling framework, state
management, IR authoring/editing UI, authentication, and - same as every
prior step - no database, Redis, AI/LLM, or EDA tool invocation.

## Step 11 - 3D Rendering Foundation

```
IR -> Scene generation -> backend API -> CORS -> Next.js frontend -> real 3D scene (this step)
```

The first actual visual representation of the digital twin: the frontend
now renders the existing, unmodified `SceneResult.scene.objects` as
simple 3D boxes, using **Three.js via React Three Fiber** (`three`,
`@react-three/fiber`, `@react-three/drei` - exactly these three
dependencies, WebGL only, no WebGPU).

`frontend/src/components/SceneViewer.tsx` (new, client component): maps
each `SceneObject`'s existing `x`/`y`/`z` -> box position and
`width`/`height`/`depth` -> box size directly, with NO changes to the
Scene contract. A small, deterministic, presentation-only
color-by-`kind` convention is applied client-side only (`input` blue-ish,
`output` green-ish, everything else neutral gray) - the backend Scene
contract has no color field and was not touched to support this. A
basic perspective camera + `OrbitControls` (rotate/pan/zoom) frames the
scene using a simple bounding-box-center calculation (not an elaborate
auto-fit system) with a fixed isometric-ish offset, since the current
example scenes are flat (`z` always `0`) and would look edge-on from
directly overhead.

`frontend/src/app/page.tsx` now renders `<SceneViewer />` above the
existing raw `SceneResult` JSON output (kept, unchanged in content -
still useful for confirming the rendered scene matches the real backend
contract exactly).

**Zero backend changes** - `app/domain/*`, `/api/scene/generate`, the
Scene contract, CORS configuration, and every other backend file are
completely untouched; the full 241-test backend suite is unaffected by
this step.

What is intentionally NOT implemented: object selection/hover
highlighting, drag/editing, text labels/overlays, animation or
simulation-driven visuals, IR authoring UI, WebGPU, OpenUSD, physics,
complex materials, or any styling/production-UI polish - this step is
strictly "render the existing boxes and let the camera orbit."

## Step 12 - Object Selection

```
Existing Step 11 scene -> click/hover interaction -> selection state (frontend-only) -> info panel
```

The first interactive feature in the 3D view: clicking a rendered box in
`SceneViewer` selects it (highlighted amber via an emissive-color change on
its existing material - no outline/post-processing library added), and a new
info panel below the canvas shows that object's existing `SceneObject` fields
verbatim (`id`, `source_component_id`, `kind`, `x`/`y`/`z`,
`width`/`height`/`depth`) - no new fields invented, nothing beyond what the
Scene contract already returns. Hovering a box shows a lighter (white)
highlight and switches the cursor to a pointer, distinct from the amber
selected state. Clicking empty canvas space (`Canvas`'s `onPointerMissed`)
deselects.

`frontend/src/components/SceneViewer.tsx`: `SceneBox` gained local hover
state plus `onClick`/`onPointerOver`/`onPointerOut` handlers; `SceneViewer`
now accepts `selectedObjectId`/`onSelect` props (selection state itself lives
in `page.tsx`, passed down) instead of managing selection internally.

`frontend/src/app/page.tsx`: added `selectedObjectId` state and a new
`SceneInfoPanel` component (plain HTML, no new dependency) rendered between
the 3D view and the existing raw JSON output.

**Zero backend changes** - `app/domain/*`, `/api/scene/generate`, and the
Scene contract are completely untouched; the full 241-test backend suite is
unaffected by this step. **No new dependency was added** - selection/hover
use React Three Fiber's built-in pointer-event props
(`onClick`/`onPointerOver`/`onPointerOut`/`onPointerMissed`), already part of
the existing `@react-three/fiber` install.

What is intentionally NOT implemented: multi-select, drag/editing, text
labels rendered inside the 3D scene itself (only the separate 2D info
panel), simulation-state-driven visuals, wire/connection rendering (the
Scene contract has no connection data - see architecture notes), keyboard
navigation, or any new state-management library.

## Step 13 - Wire Visualization

```
Existing Step 12 scene + selection -> separate POST /api/physical/generate fetch -> straight connection wires
```

Renders one straight 3D line per real IR connection, using the already-
existing, unmodified Step 8 Physical API (`POST /api/physical/generate`) -
fetched as a second, separate request alongside the existing Scene fetch.
`PhysicalDocument.nets` (which pins connect) and `PhysicalBlock.pins`
(real per-pin x/y) supply the two real endpoints for every wire; no routed
geometry is invented - `PhysicalNet` itself carries none (see its own
docstring), so each wire is exactly the straight line between its two real
endpoints, nothing more.

**Coordinate-space note**: `PhysicalBlock.x`/`y` is the block's corner (not
center) - verified directly against `layout.py`'s `compute_pin_positions`
(left-side pins sit at exactly `block.x`, right-side pins at
`block.x + block.width`). The existing `SceneBox` places a Three.js
`BoxGeometry` (centered on its own local origin) at `(object.x, object.y)`,
so the rendered box's visual center is actually that corner coordinate.
`SceneViewer.tsx`'s new `resolvePinPosition()` subtracts half the owning
block's width/height from each pin position so wires land exactly on the
rendered box edges instead of floating outside them - a coordinate-frame
reconciliation only, not new routing geometry, and it does not touch or
move the boxes themselves in any way.

`frontend/src/lib/api.ts`: added `PhysicalPin`/`PhysicalBlock`/
`PhysicalEndpoint`/`PhysicalNet`/`PhysicalDocument`/`PhysicalError`/
`PhysicalResult` types (mirroring the backend Physical contract exactly)
and `getPhysicalLayout()`.

`frontend/src/app/page.tsx`: fetches physical layout via `getPhysicalLayout`
alongside the existing scene fetch, passes `physical` down to `SceneViewer`.

`frontend/src/components/SceneViewer.tsx`: new `Wire` component (drei's
`Line`, already installed) renders each resolved net as a plain gray
straight line at the same baseline Z the boxes already use; wires are
decorative only in this step - no click/hover/selection on them.

**Zero backend changes** - `app/domain/*`, both `/api/scene/generate` and
`/api/physical/generate`, and both contracts are completely untouched; the
full 241-test backend suite is unaffected by this step. **No new dependency
was added** - wire rendering uses `@react-three/drei`'s existing `Line`
helper (already part of the Step 11 install).

What is intentionally NOT implemented: wire selection/hover/click,
orthogonal/routed wire paths, arrowheads or directionality markers, wire
labels, or any interaction beyond the existing Step 12 box selection - this
step is strictly "draw the real connections as straight lines."

## Step 14 - Text Labels

```
Existing Step 13 scene + wires -> already-fetched PhysicalBlock.name -> always-visible 3D text label per box
```

Adds a small, always-visible text label above each rendered box, using
`@react-three/drei`'s `Text` (backed by `troika-three-text`, already
installed transitively by `drei` since Step 11 - no new dependency). Label
text is the real `PhysicalBlock.name` (e.g. "AND1", "A", "B", "Y"), looked
up by `source_component_id` from the `physical` data already fetched in
Step 13 for wire rendering - no new network call, no Scene/Physical
contract change. If the physical layout hasn't loaded yet or has no
matching block, the label is simply omitted for that object (never a
fabricated placeholder).

`frontend/src/components/SceneViewer.tsx`: new `blockNameFor()` lookup +
`SceneLabel` component, positioned directly above each box
(`object.y + object.height / 2 + LABEL_OFFSET`, reusing the same
already-centered `object.x`/`y`/`z` convention `SceneBox` itself uses - no
coordinate correction needed here, unlike the Step 13 wire/pin math).
Labels are small, plain, light-gray/white text - purely decorative, no
click/hover/selection behavior of their own.

**Zero backend changes** - `app/domain/*` and both existing API contracts
are completely untouched; the full 241-test backend suite is unaffected by
this step. **No new dependency was added.**

What is intentionally NOT implemented: label click/hover/selection,
billboarding (labels are flat text and can appear edge-on from steep
orbited camera angles - a known, minor, accepted limitation, not fixed in
this step), font/size/color customization beyond a small plain style, or
any other roadmap item.

## Step 15 - Prompt Resolution (deterministic seam toward a generative illustrator)

```
User prompt -> POST /api/prompt/resolve -> deterministic alias match -> IRDocument
            -> (unchanged) generateScene() + getPhysicalLayout() -> (unchanged) SceneViewer
```

The first step toward this project's actual stated long-term goal (a
natural-language, prompt-based VLSI illustrator) rather than another 3D
cosmetic feature. Adds a real `prompt -> intent resolution -> IRDocument`
architectural seam - deliberately deterministic (keyword/alias matching)
for now, never a real LLM, and never a fabricated/guessed circuit for an
unrecognized prompt.

**New backend domain** `app/domain/prompt/` (`models.py`: `PromptResolution`
- `is_recognized`/`circuit_key`/`message`/`document`; `resolver.py`:
`resolve_prompt(prompt: str) -> PromptResolution`, word-boundary
keyword/alias matching against the existing `app.domain.ir.examples.ALL_EXAMPLES`
fixtures). `resolve_prompt()`'s signature is the one seam a future
Groq/LLM-based resolver would replace - no downstream consumer (this
domain's own service/API layer, or Scene/Physical/Simulation generation)
would need to change.

**New example circuit** `mux_2to1_document()` added to
`app/domain/ir/examples.py` (registered in `ALL_EXAMPLES` as
`"mux_2to1"`): a real 2:1 multiplexer (`Y = (A AND NOT SEL) OR (B AND SEL)`)
built from only the simulation engine's currently-supported primitives
(input/output/AND/OR/NOT) - fully simulatable, unlike a real adder which
would need an unsupported XOR gate (deliberately deferred, not built this
step).

**New API** `POST /api/prompt/resolve` (`app/api/prompt.py` +
`app/services/prompt_service.py`, registered in `main.py`) - always HTTP
200 for both a recognized and an unrecognized prompt (a business-level
outcome, not a request error, matching every other endpoint's convention);
only a fundamentally malformed request body (missing `prompt`) produces a
422.

**Frontend**: `lib/api.ts` gained `PromptResolution` + `resolvePrompt()`.
`page.tsx` gained a real prompt input + submit button; the page still
shows the Step 10 hardcoded AND-gate example by default on load, and only
replaces the displayed circuit when a prompt actually resolves - an
unrecognized prompt shows the resolver's own honest message and leaves the
current circuit untouched. `SceneViewer.tsx` needed **zero changes** -
confirmed live: the 2:1 mux (8 components, a different shape/row-wrapped
layout than the AND gate) renders correctly with boxes, wires, and labels,
and selection still works, using the exact same generic renderer built in
Steps 11-14.

**Zero changes** to `app/domain/{guardrails,ir/models.py,ir/validation.py,
ir/serialization.py,physical,scene,schematic,simulation}` or their
existing API contracts - only `ir/examples.py` gained one new fixture
function. `app/domain/simulation/engine.py`'s supported-kinds whitelist was
not touched (the new mux example was deliberately designed to already fit
within it).

Tests: +10 backend (`tests/domain/prompt/test_resolver.py`: alias
matching, unrecognized-prompt honesty, word-boundary false-positive guard,
full MUX truth-table simulation; `tests/test_prompt_api.py`: known/
unrecognized prompt round-trips, 422 on malformed request, and a
round-trip proof that a resolved MUX document can be fed directly into
`/api/scene/generate` unchanged) - 251 backend tests total (was 241).

What is intentionally NOT implemented: any real LLM/Groq/NLU integration
(explicitly deferred - this step is the deterministic architectural
foundation only), fuzzy/approximate matching, additional example circuits
beyond AND gate + 2:1 mux, persisting user prompts, or any change to
Steps 11-14's rendering/selection/wire/label behavior.

## Step 16 - Production AI Prompt Resolution (Groq)

```
User prompt -> Groq LLM -> VLSIIntent (untrusted) -> deterministic compiler
            -> existing guardrails -> IRDocument -> (unchanged) Schematic/Simulation/Physical/Scene/3D
```

Replaces Step 15's deterministic keyword matcher with a real Groq LLM as
the production `prompt -> IR` front door, while preserving the exact same
public seam (`resolve_prompt(str) -> PromptResolution`) every caller
already relied on. The most important architectural rule from this step:
**the LLM is never asked to produce IR directly.** It only ever produces a
simpler, untrusted `VLSIIntent` JSON shape; a fully deterministic compiler
(zero AI, 100% unit-testable without any network access) is the only
thing that ever builds a real `IRDocument`, and the existing guardrails
remain the final authority exactly as before.

**New backend domain files** (`app/domain/prompt/`):
- `intent.py` - `VLSIIntent`/`IntentComponent`/`IntentConnection`/
  `IntentPort` (the untrusted, LLM-facing schema; `extra="forbid"`
  everywhere, so any malformed/unexpected shape is rejected immediately).
- `groq_client.py` - the only module that talks to Groq (official `groq`
  Python SDK). Converts every real SDK exception
  (`APITimeoutError`/`APIConnectionError`/`APIStatusError`/anything
  unexpected) into one of this project's own typed exceptions
  (`GroqConfigError`/`GroqTimeoutError`/`GroqProviderError`) - callers
  never see raw SDK internals.
- `compiler.py` - `compile_intent(VLSIIntent) -> CompileOutcome`, the
  deterministic heart of this step. Primitive kinds (`input`/`output`/
  `AND`/`OR`/`NOT`) get a fixed port template; any other kind (adder,
  mux, register, counter, flip_flop, ALU, CMOS structures, ...) must
  supply explicit `ports` in the intent itself and is represented as one
  correctly-ported, opaque component - never gate-level synthesized in
  this step. A kind with no explicit ports and no built-in primitive
  template is an honest, structured `UNSUPPORTED_COMPONENT_KIND` failure,
  never a fabricated/guessed circuit. Connections resolve by component id
  + port NAME (inferring the sole input/output port when unambiguous)
  into real IR port ids.
- `deterministic.py` - Step 15's original keyword/alias matcher,
  preserved verbatim under a new name
  (`resolve_prompt_deterministically()`). **Never called automatically**
  - an AI/provider failure is always surfaced honestly as such, never
  silently replaced by a deterministic guess. Kept, tested, and
  importable in case a future explicit "try without AI" feature wants it.
- `resolver.py` (rewritten) - orchestrates Groq -> `VLSIIntent` validation
  -> `compile_intent()` -> `run_guardrails()` -> `PromptResolution`,
  converting every failure into one of 7 typed `PromptFailureReason`
  values (`missing_api_key`/`provider_timeout`/`provider_error`/
  `malformed_intent`/`unsupported_component_kind`/`invalid_connection`/
  `guardrails_rejected`).
- `models.py` - `PromptResolution` gained one new, additive
  `failure_reason: PromptFailureReason | None` field; every existing
  field is unchanged.

**Config** (`app/core/config.py`): new `groq_api_key`/`groq_model`
(default `llama-3.3-70b-versatile`)/`groq_timeout_seconds` settings.
Missing `GROQ_API_KEY` produces a structured `missing_api_key` failure
from `/api/prompt/resolve`, never a crash. New `backend/.env.example`
(the file `Settings(env_file=".env")` actually reads for local dev) plus
a matching addition to the root `.env.example` for docker-compose parity.

**New dependency**: the official `groq` Python SDK
(`requirements.txt`: `groq>=1.7,<2.0`) - installed and its real exception/
client API verified directly (not guessed) before writing any integration
code, since live Groq documentation was unreachable (CSP-blocked) during
investigation.

**API** (`app/api/prompt.py`): same endpoint/request shape as Step 15
(`POST /api/prompt/resolve`, always HTTP 200 for both a recognized and a
failed prompt - a business-level outcome, not a request error; 422 only
for a malformed request body). The response now always includes the new
`failure_reason` field (`null` on success).

**Frontend**: `lib/api.ts` gained the `PromptFailureReason` type on
`PromptResolution`. `page.tsx` now visually distinguishes AI/infrastructure
failures (`missing_api_key`/`provider_timeout`/`provider_error` - shown in
red, prefixed "AI service issue:") from circuit-content failures
(`malformed_intent`/`unsupported_component_kind`/`invalid_connection`/
`guardrails_rejected` - shown in amber, prefixed "Circuit generation
issue:"), plus a "Thinking..." loading state on the submit button. The
AND-gate default and replace-only-on-success behavior from Step 15 are
unchanged. **`SceneViewer.tsx` needed zero changes** - confirmed live: a
mocked/real AI-resolved circuit renders through the exact same generic
renderer built in Steps 11-14.

**Zero changes** to `app/domain/{ir,guardrails,schematic,simulation,
physical,scene}` or their contracts - the compiler produces ordinary
`IRDocument` objects that flow through every existing, untouched
generator exactly like any hand-authored example.

**Tests** (all Groq interaction mocked - zero real network calls in the
suite, zero API key needed to run it): `test_intent.py` (schema
validation), `test_compiler.py` (primitive circuits compile+simulate,
compound kinds compile but are honestly non-simulatable,
unsupported-kind/invalid-connection/ambiguous-port/empty-intent
failures), `test_groq_client.py` (mocked SDK: success, missing key,
timeout, connection error, status error, non-JSON content, empty
content), `test_resolver.py` (full orchestration: success + all 7 typed
failure reasons + an explicit "no silent fallback to the deterministic
matcher" regression test), `test_deterministic.py` (Step 15's original
tests, preserved, retargeted at the renamed module). API tests
(`test_prompt_api.py`) rewritten to mock the same seam. **278 backend
tests total** (251 + 27 new).

**Live-verified** (real HTTP calls against the real running backend, no
`GROQ_API_KEY` configured in this environment): `POST /api/prompt/resolve`
correctly returns the honest `missing_api_key` failure end-to-end; the
browser correctly shows the red "AI service issue" message and leaves the
AND-gate circuit untouched (no fabrication); Steps 11-15 behavior (boxes,
wires, labels, selection, hover, orbit, zoom) all confirmed still working
via live interaction. Full mocked-Groq success/failure paths are proven
by the automated test suite; a real Groq API key was not available in
this environment to additionally verify a live successful AI generation.

What is intentionally NOT implemented: real gate-level synthesis of
compound concepts (an "adder" is one opaque component, not real
full-adder-chain wiring), any real EDA tool (Yosys/OpenROAD/KLayout/
ngspice), cross-view selection sync, breadboard/silicon views - all
deferred per the locked `docs/architecture.md` roadmap.

## Step 17 - Cross-View Synchronization Foundation

```
IRDocument -> Schematic + Physical/Scene (unchanged, existing generators)
                        |
        SchematicViewer + SceneViewer (both consume the SAME SelectionContext)
                        |
     selectedComponentId / selectedPortId / selectedConnectionId
     (keyed ONLY by canonical source_component_id/source_port_id/source_connection_id)
```

The first real step toward "one canonical IR -> multiple synchronized
views" rather than another isolated view. Adds a second real view
(Schematic, previously never rendered by the frontend at all) alongside
the existing 3D view, and a shared selection model so clicking a
component or wire in *either* view highlights the exact same component/
connection in the *other* - because both views resolve selection against
the same canonical IR ids, never a view-specific generated id.

**Investigation finding (confirmed, not assumed)**: every backend
generator (Schematic/Physical/Simulation) already correctly threads
`source_component_id`/`source_port_id`/`source_connection_id` through -
**zero backend changes were needed**. The one real identity-propagation
gap found was in the *frontend*: Step 13's 3D wire-building code fetched
`PhysicalNet.source_connection_id` but silently dropped it before
rendering - fixed as part of this step. A second, more subtle gap: Step
12's selection was keyed by the *Scene-generated* id (`SceneObject.id`,
e.g. `"scene_and1"`), not the canonical `source_component_id`
(`"and1"`) - this only ever worked because exactly one view existed;
fixed by rekeying 3D selection matching onto `source_component_id`.

**New**: `frontend/src/lib/selection/SelectionContext.tsx` - a small
React Context (no new dependency) holding `selectedComponentId`/
`selectedPortId`/`selectedConnectionId` (mutually exclusive - selecting
one clears the other two) plus `selectComponent`/`selectPort`/
`selectConnection`/`clearSelection`. `frontend/src/components/
SchematicViewer.tsx` - a real, minimum interactive 2D SVG projection of
the backend's own (already-tested, unmodified) `SchematicDocument`:
components as rectangles at their real `x`/`y`/`width`/`height`, wires as
their real routed polyline `points` - not an independent drawing.
Components, ports (schematic-only in this step - 3D has no per-port
visual target), and wires are all clickable and update the shared
context.

**Modified**: `lib/api.ts` gained `Schematic*` types + `getSchematic()`.
`SceneViewer.tsx` now consumes `useSelection()` instead of local props,
matches by `source_component_id` (fix), and threads
`source_connection_id` into clickable wires. `page.tsx` wraps both views
in one `SelectionProvider` and fetches schematic alongside scene/physical.

**Zero backend changes** - confirmed by direct inspection of every
relevant model before writing any code, not assumed.

**Testing** (first-ever frontend test framework in this project - Vitest
+ React Testing Library + the official `@react-three/test-renderer` for
the 3D view, chosen specifically because jsdom has no real WebGL and
`@react-three/test-renderer` renders the R3F scene graph without one):
17 new frontend tests - `SelectionContext.test.tsx` (6: initial state,
mutual exclusivity across all 3 pairs, clear, outside-provider error
guard), `SchematicViewer.test.tsx` (7: component/wire click selects the
canonical id, empty-space click clears, external selection highlights
correctly, a non-matching id never highlights, hover never mutates
persistent selection, null-schematic fallback), `SceneViewer.test.tsx`
(4: 3D click selects the canonical id, external selection highlights the
matching mesh via its real emissive color, a non-matching id never
highlights, wire click selects `source_connection_id`). A real, genuine
bug was found and fixed *in the test code itself* during this work: an
early draft called a Context state-setter unconditionally during render
(not inside `useEffect`), causing an infinite re-render loop that looked
like a tooling/environment hang until root-caused - fixed by moving the
call into `useEffect`, a real lesson about test code correctness, not a
library/environment limitation.

**Live-verified** (real browser, both views rendered together): clicking
"AND1" in the schematic highlights the same box amber in the 3D view;
clicking "B" (`in_b`) in the 3D view highlights the same box amber in the
schematic; clicking a wire in the schematic selects the real
`source_connection_id` (`conn_1`); clicking empty space in the 3D view
clears selection; orbit/zoom/hover/labels/wires from Steps 11-14 all
confirmed still working. Verified: 278/278 backend tests unchanged, 17/17
new frontend tests, `npm run build` clean.

**Known, honestly-documented limitation**: the 2:1 mux prompt could not
be live-verified for cross-view sync in this environment specifically
because no real `GROQ_API_KEY` is configured (a carried-over Step 16
environment gap, not a Step 17 regression) - the AND-gate live
verification above and the automated tests (which use non-AND-gate mock
shapes) both exercise the identical, document-shape-agnostic
synchronization mechanism.

What is intentionally NOT implemented: a Simulation view (no simulation
view exists in the frontend at all yet - explicitly out of scope, the
selection Context is already reusable by one later), 3D port-level
selection (schematic-only for now, documented rather than faked), real
gate-level synthesis, any real EDA tool integration, a breadboard or
silicon/GDS view.

## Step 18 - Real HDL to Yosys Synthesis (2026-09-14)

Replaces "no synthesis exists" with a REAL HDL -> REAL Yosys pipeline,
strictly for documents built entirely from the primitive kinds that
already have real, unambiguous gate-level semantics (`input`/`output`/
`AND`/`OR`/`NOT`) - the exact same boundary Step 16's compiler and the
Step 5 simulation engine already draw. Compound/opaque kinds (adder,
mux-as-one-block, register, etc.) still get zero fabricated HDL - an
honest `UNSUPPORTED_COMPONENT_KIND` failure instead.

**New backend packages**: `app/domain/hdl/` (`generator.py`:
`generate_verilog(document) -> HdlGenerationResult` - deterministic,
attributed Verilog generation) and `app/domain/synthesis/`
(`yosys_runner.py`: real `subprocess` invocation of the actual Yosys
executable - never mocked; `mapping.py`: honest reconstruction of
canonical IDs from the real Yosys JSON netlist; `pipeline.py`:
`run_synthesis(document) -> SynthesisResult`, the single orchestrator).
New API: `POST /api/synthesis/generate` (`app/api/synthesis.py` +
`app/services/synthesis_service.py`, registered in `main.py`), following
the exact same thin-transport/loose-JSON-document pattern as
`/api/schematic/generate`.

**Identity preservation - a real mechanism, verified by direct testing,
not assumed**: the investigation's original plan (instantiate Verilog's
*built-in* `and`/`or`/`not` gate primitives with a chosen instance name
plus a `(* canonical_component_id = "..." *)` attribute) was tried first
and found to NOT work - Yosys's `read_verilog` frontend elaborates
built-in gate primitives into anonymous, auto-named internal cells
(`"hide_name": 1`) and silently drops the attribute. The actual, verified
mechanism: every gate is a **named instance of a small, generated
user-defined Verilog submodule** (e.g. `_AND_2IN_1W`), one per distinct
(kind, input count, width) shape - a submodule instance's chosen name
*is* preserved exactly as the real JSON cell key by Yosys's
`hierarchy`/`proc`/`opt` passes (no `flatten` is ever run). Every
top-level Verilog port is named after its owning component's own id, so
top-level I/O identity is automatic and unconditional. A redundant
`(* canonical_component_id = "..." *)` + `(* keep *)` pair is still
attached to every instance as defense-in-depth. `mapping.py` never
invents a mapping: a synthesized cell is attributed to a canonical
component only via its own instance name (primary) or that attribute
(fallback); anything else is reported in `unmapped_cell_names`, and a
genuine one-to-many relationship (if Yosys's optimizer ever produces
one) is reported via `ComponentIdMapping.note`, never silently resolved
to one arbitrary "winner" cell.

**Synthesis depth**: deliberately generic only - `hierarchy -check -top
X; proc; opt; write_json; write_verilog; stat` - no target
cell-library/PDK mapping (that is explicitly Step 19's job, per the
locked roadmap).

**Yosys installation**: real Yosys 0.69+24, installed on the actual
remote backend server via YosysHQ's OSS CAD Suite prebuilt tarball (no
sudo, no Docker - chosen specifically because Step 19's broader
open-source ASIC toolchain will need the same suite anyway) to
`~/tools/oss-cad-suite/`. The backend references the binary via a new
`yosys_path` setting (`app/core/config.py`, defaults to `"yosys"`
resolved via PATH; set to the OSS CAD Suite's absolute path via
`YOSYS_PATH` in `.env` here since it is not on the backend process's
PATH).

**Tests**: 20 new backend tests (298 total) - `tests/domain/hdl/
test_generator.py` (7: AND-gate/mux identity anchors, shared shape-def
reuse, unsupported-kind honesty, undriven-input honesty, invalid-IR
honesty, a real-Yosys-gated syntax-validity check), `tests/domain/
synthesis/test_mapping.py` (5, pure/no real Yosys needed: exact 1:1,
attribute fallback, honest unmapped, honest one-to-many, missing-module
safety), `tests/domain/synthesis/test_yosys_runner.py` (3: missing-binary
honesty plus 2 real-Yosys-gated), `tests/domain/synthesis/
test_pipeline.py` (2, both real-Yosys-gated end-to-end: AND gate and mux
each get perfect, zero-warning identity mappings), `tests/
test_synthesis_api.py` (3, 1 real-Yosys-gated). All real-Yosys-gated
tests actually RAN (not skipped) against the real installed binary in
this environment - 298/298 passed, zero skipped.

**Live-verified end-to-end** (real HTTP request to the actual running
server, not just TestClient): `POST /api/synthesis/generate` with the
real AND-gate IR document returned `is_valid: true`, zero errors/
warnings, a real Yosys stat report showing `1 submodules: _AND_2IN_1W`,
and a perfect `and1 -> ["and1"]` identity mapping. Regression-checked
`/health`, `/api/prompt/resolve`, and the OpenAPI route registration -
all unaffected.

**Known limitations, explicitly not addressed (deferred, matches the
locked roadmap)**: only primitive-kind (input/output/AND/OR/NOT)
documents can be synthesized - no HDL exists for any compound/opaque
kind. No target cell-library/PDK mapping, no placement/routing, no GDS -
those are Steps 19-20. No frontend surface for this endpoint yet (no
view consumes it) - deliberately out of scope, matching how Step 16 also
shipped its endpoint before any frontend used it.

## Step 19 - Real Physical Design via LibreLane + SKY130 + OpenROAD (2026-09-14)

Replaces "no physical design exists" with a REAL LibreLane-orchestrated
flow: real Yosys (bundled in the LibreLane image, SKY130-target
technology mapping) -> real OpenROAD floorplan/PDN/placement/routing ->
real Magic GDS export -> real DRC/LVS/Antenna signoff. Consumes Step 18's
existing `generate_verilog()` directly (never regenerated/duplicated) -
still strictly primitive-only (input/output/AND/OR/NOT), matching Step
18's own honest boundary.

**Pre-implementation calibration experiments** (required before any
production code, all run in an untracked sandbox, never mocked):
multi-component identity (two independent AND gates, the existing MUX
example, mixed AND/OR/NOT, and a canonical id containing a hyphen) all
independently survive as real placed SKY130 cells; tool-generated cell
classification (real DEF `+SOURCE DIST` = fill/tap/decap, `+SOURCE
TIMING` = timing-repair buffers, real logic gates carry no SOURCE tag at
all); die-sizing calibration (a fixed 300x300 micron absolute die verified
safe, 0 DRC/LVS errors, for every tested design from 1 to 16 total
components - adopted as a conservative bounded policy, not an
unverified formula); and a cancellation/process-cleanup experiment that
found a real gap - killing only the wrapping process leaves the actual
Docker container running indefinitely - fixed by explicitly `docker
kill`-ing the container matched by image + working directory.

**New backend package**: `app/domain/physical_design/` (`models.py`:
job/result/identity contracts, incl. `CellClassification` with only the
two verified tool-generated categories plus CANONICAL/UNKNOWN -
`ConnectionIdentityStatus` has no "exact" value at all, since no
experiment ever proved net-level identity recoverable; `sizing.py`: the
evidence-grounded, bounded die-sizing policy; `librelane_runner.py`: real
subprocess invocation of the LibreLane CLI, always forcing
`SYNTH_HIERARCHY_MODE=keep`, with real Docker-container cancellation on
timeout; `mapping.py`: parses a real DEF and reconstructs identity by
matching the `^([^/]+)/` hierarchical prefix against Step 18's own
`HdlModule.gate_instance_ids`/`top_level_ports` tables - never guessed
from text alone; `pipeline.py`: the orchestrator, deliberately
independent of Step 18's own `run_synthesis()`; `job_registry.py`: a
minimal in-process job registry, honest about losing state across a
backend restart). New job-based API: `POST /api/physical-design/build`
(202, returns immediately) + `GET /api/physical-design/jobs/{job_id}`
(poll for status/result), registered in `main.py`.

**Tests**: 26 new (324 total) - `tests/domain/physical_design/
{test_mapping,test_sizing,test_librelane_runner,test_pipeline}.py` +
`tests/test_physical_design_api.py`. Real-tool-gated tests for both the
AND gate and the MUX genuinely ran (LibreLane is installed on this
server) - 0 skipped.

**Real bug found and fixed during testing**: real OpenROAD timing metrics
for a clockless (combinational-only) design legitimately report
`Infinity` for register-to-register slack (there are no such paths) -
this crashed JSON serialization (`json`'s default encoder disallows
non-finite floats). Fixed by sanitizing non-finite metric values to
`null` - never fabricated as 0, never silently dropped.

**Live-verified**: a real AND-gate build via the actual running API
reached `succeeded` with a real, non-empty DEF (2.1MB)/GDS (2.0MB)/
netlist (1MB), 0 DRC/LVS/Antenna errors, and `and1` correctly mapped to
the real placed cell `and1/_0_` (`sky130_fd_sc_hd__and2_2`) - confirmed
by direct inspection of the actual files, not just the API's own claim.

**Known limitations, explicitly not solved (honest, not fabricated)**:
`Connection.id` -> physical net identity remains `unavailable` -
internal nets get auto-generated names with no demonstrated
reversibility. Die sizing beyond 16 total components is unverified (the
sizing policy honestly flags this rather than silently reusing the same
constant). Job state is in-memory only - a backend restart loses
in-flight job records (reports 404, never a fabricated status). No
frontend consumes this API yet (matches Step 18's own precedent). No
GDS viewing/visualization - that is explicitly Step 20's job.

## Step 20 - Frontend Physical Design Integration (2026-09-14)

Gives Step 19's real LibreLane/SKY130/OpenROAD job API its first frontend
consumer: a `PhysicalDesignPanel` on the main page, next to the existing
3D/schematic views. NOTE: this redefines what "Step 20" means for this
project - the ORIGINAL roadmap named Step 20 as a KLayout/gdstk GDS
viewer; per explicit instruction this pass instead built the frontend
product layer for Step 19's job API, with the strongest real, non-fake
visualization technically supportable without a full GDS/LEF parser (see
below). A real KLayout/gdstk-based GDS viewer remains a future step.

**Backend (additive only - zero rewrites, all existing Step 19 tests
still pass unchanged)**: `app/domain/physical_design/mapping.py` now also
parses each real DEF cell's actual `PLACED`/`FIXED (x y) ORIENT` clause
and the real `DIEAREA`/`UNITS DISTANCE MICRONS` statements, converting to
real microns. New `CellPlacement` model + `PhysicalIdentityMapping.
cell_placements` + `PhysicalDesignResult.die_width_um/die_height_um`
(`app/domain/physical_design/models.py`) expose this - purely additive
fields, nothing existing changed shape.

**Frontend (new)**: `lib/api.ts` gained the Step 19 job-API types +
`startPhysicalDesignBuild()`/`getPhysicalDesignJob()`. New
`components/PhysicalDesignPanel.tsx`: a "Build Physical Design" button
(explicit, user-triggered - never auto-fires, since a real build takes
minutes), polls the real job every 3s, and renders real DRC/LVS/Antenna
pass-fail, real artifact list (type/filename/size), the real canonical
identity mapping table, and a real DEF-derived floorplan (SVG markers at
each real placed cell's actual (x, y) origin, colored by real
classification).

**Honest visualization limitation (not fabricated as more than it is)**:
DEF `PLACED` lines give each real cell's origin POINT only, not its true
footprint polygon (that needs the LEF cell outlines, not parsed here) -
every cell is drawn as a small fixed-size marker at its real position,
never an invented shape/size. Real `tool_generated_fill` cells (fill/tap/
decap - tens of thousands on a real die) are excluded from the drawing
itself for browser performance, with an honest count shown in a caption;
they remain fully present in the raw JSON. A real GDS/LEF-polygon
renderer was not attempted - explicitly deferred, not faked.

**Tests**: backend +4 (328 total) for the new placement/die-area parsing;
frontend +4 (21 total) for `PhysicalDesignPanel` (build+poll+succeeded
render, honest failure display, network-error display, no-fabricated-UI-
before-build-starts). `npm run test`/`tsc --noEmit`/`npm run build` all
clean.

**Live-verified end-to-end via the real running app** (not just tests):
clicked "Build Physical Design" in the actual browser against the actual
backend - a real job id appeared, a real `docker run ghcr.io/librelane/
librelane` process was confirmed running server-side with a matching
work directory, and the UI polled to `succeeded` showing real DRC/LVS/
Antenna PASS, real artifact sizes (def 2.06MB/gds 1.93MB/netlist 994.6KB/
metrics 15.9KB), the real `and1 -> and1/_0_` identity mapping, and a real
floorplan showing the real logic gate + the 3 real timing-repair buffers
(22,839 real fill/tap cells honestly noted as omitted from the drawing).

**Known limitations, explicitly not solved**: no full GDS/LEF-shape
polygon rendering (point-placement only). Floorplan excludes fill/tap/
decap cells from the visual by design. Die-sizing policy still
unverified beyond 16 total components (unchanged from Step 19). Job
state still in-memory only (unchanged from Step 19). (Job cancellation
was later added - see below.)

## Step 20 follow-up - Real job cancellation (2026-09-14)

An independent audit of Step 20 found `cancel_librelane_run()` existed
in `librelane_runner.py` but was completely unreachable (dead code) -
no API endpoint, no service method, no frontend control. This pass
completed that architecture: a real, user-triggered cancel action that
terminates the actual Docker/LibreLane/OpenROAD process, not just a
status flag.

**Decision (cancellation vs. a real GDS/LEF polygon viewer)**: evaluated
both roadmap candidates against the ACTUAL installed environment before
choosing. `gdstk`/`klayout` are NOT installed in the main backend venv
(only inside the isolated `.venv-librelane` and the LibreLane Docker
image, neither of which the backend's own process can import from
without a new dependency or a fragile cross-venv subprocess bridge) -
and adding a new dependency was explicitly out of scope for this pass.
Cancellation, by contrast, only required wiring together
already-existing, already-tested low-level machinery. Chose
cancellation as the safer, more valuable, better-supported-by-the-
current-architecture option; the real GDS/LEF polygon viewer remains a
future step, honestly deferred (not attempted with fake geometry).

**Backend**: `models.py` gained `FailureCode.CANCELLED`. `job_registry.py`
gained a per-job `threading.Event` + `request_cancel()` (idempotent,
returns whether the job was actually queued/running at the time) + a
terminal-status guard in `_update()` - once a job is CANCELLED (or any
other terminal status), no later worker-thread report can ever overwrite
it. `librelane_runner.py`'s `run_librelane()` now polls `communicate()`
in short intervals (instead of one big blocking call) so a cancel
request is noticed within roughly a second, reusing the exact same
process-kill path as timeout. `pipeline.py`/`physical_design_service.py`
thread the cancel signal through; a job cancelled while still queued
(waiting for a concurrency slot) never starts the real pipeline at all.
New `POST /api/physical-design/jobs/{job_id}/cancel` (200 for a
genuinely queued/running job, 404 for an unknown id, 409 for a job
already in a terminal state - never silently no-ops as if it worked).

**Two REAL bugs found and fixed while building this** (both pre-existing,
not introduced by this pass, both directly relevant to whether
cancellation/timeout ever actually worked):
1. `process.kill()` only kills the DIRECT child - a forked grandchild
   (e.g. a plain shell script's own external command) keeps the
   inherited stdout/stderr pipes open, so `communicate()` blocks until
   THAT grandchild exits naturally. Verified directly: a fake
   `bash -c "sleep 60"` script left `communicate()` blocked for the
   full 60 seconds even though the direct child was killed at the 1s
   mark. Fixed via `start_new_session=True` + `os.killpg(...)` (kill
   the whole process group).
2. `docker ps --filter ancestor=ghcr.io/librelane/librelane` (no tag)
   matches NOTHING against a real running container whose image is
   tagged `ghcr.io/librelane/librelane:3.0.14` - Docker's `ancestor`
   filter requires an exact repo[:tag] match. This meant the container-
   kill path had been a silent no-op the whole time (verified live: a
   real cancel request correctly flipped a job's status to "cancelled"
   but left the real Docker container and its internal LibreLane/
   OpenROAD processes running to completion, uninterrupted, in the
   background). Fixed by listing all running containers and matching
   the image's repository portion in Python instead of relying on
   Docker's own filter syntax.

**Frontend**: `lib/api.ts` gained `cancelPhysicalDesignJob()` +
`CANCELLABLE_JOB_STATUSES`. `PhysicalDesignPanel.tsx` gained a "Cancel"
button, shown only while a job is queued/running; cancelling shows the
real cancelled status/message honestly (never a fabricated success).

**Tests**: backend +15 (343 total) across `test_job_registry.py` (new,
7 tests), `test_librelane_runner.py` (+2: cancellation-kills-the-
process-tree regression, real Docker integration test for the
ancestor-filter bug using a re-tagged `busybox` container),
`test_physical_design_service.py` (new, 3 tests covering the real
mid-flight cancel race directly against the service layer - bypassing
FastAPI's TestClient, which was found to run `BackgroundTasks` to
completion before returning control to the caller, making a genuine
race impossible to observe through the HTTP layer), `test_physical_
design_api.py` (+3: 404/409/route-contract). Frontend +3 (28 total).

**Real cancellation experiment** (required before considering this
done - not just "tests pass"): triggered a real build via the live
browser, confirmed via `pgrep`/`docker ps` that a real LibreLane/
OpenROAD process chain was genuinely running, clicked Cancel, and
confirmed within ~15 seconds that (a) the UI showed "cancelled" with
the honest message, (b) the real Docker container was gone from
`docker ps`, (c) zero orphaned LibreLane/OpenROAD processes remained,
and (d) the job status stayed "cancelled" and never later flipped to
"succeeded". Repeated once before the ancestor-filter fix (correctly
showed the bug: status flipped to cancelled correctly, but the real
process kept running to completion in the background, undetected by
tests since no test previously exercised a REAL tagged Docker
container) and once after (fully passed).

## Step 20 follow-up - Real GDS/Silicon Viewer (2026-09-14)

Completes the originally-planned Step 20 KLayout/gdstk GDS viewer -
previously deferred in favor of the DEF-placement-origin floorplan
(point markers only, never true footprint polygons). This pass adds a
REAL GDS geometry viewer parsing the actual GDS artifact, never DEF
data relabeled as GDS.

**Tooling investigation**: `gdstk`/`klayout` are NOT installed in this
project's own backend venv (confirmed: `ModuleNotFoundError`, no system
`klayout` binary either). The real `klayout` Python package (0.30.12,
the official KLayout database API bindings) IS already installed and
working inside the isolated `.venv-librelane` venv (a LibreLane
dependency, never previously used directly by this project's own code).
Chose to invoke it via a small subprocess bridge script
(`backend/scripts/gds_bridge.py`) rather than adding `klayout` as a new
dependency to the main backend venv - reuses already-verified-working
infrastructure, consistent with how `librelane_binary` itself is already
invoked from an isolated venv.

**Backend (additive only)**: new `app/domain/physical_design/{gds_models,
gds_reader,sky130_gds_layers}.py` + `backend/scripts/gds_bridge.py`.
`gds_bridge.py` runs under the real klayout-having Python interpreter,
parses the real GDS via `klayout.db.Layout`, and prints one real JSON
object to stdout (`summary` or `region` mode) - never fabricates a
result, always reports `{"error": ...}` on any real failure.
`gds_reader.py` (runs in the MAIN backend venv, no klayout import)
invokes the bridge via subprocess and converts its JSON into real
Pydantic models. `sky130_gds_layers.py` is a small, static, publicly-
documented SKY130 PDK (layer, datatype) -> name reference table (NOT
derived from any specific file) used only as a best-effort display aid;
an unmapped layer/datatype pair is `None`, never guessed.

New endpoints: `GET /api/physical-design/jobs/{job_id}/gds/summary`
(real dbu/bounding-box/cell-count/per-layer-shape-count metadata -
always cheap regardless of file size) and `GET .../gds/region?layer=&
datatype=&min_x_um=&min_y_um=&max_x_um=&max_y_um=&limit=` (real
polygon/path/box outline points for ONE layer within a bounded
viewport, `limit` capped at 5000, `truncated:true` honestly reported
when more real shapes exist in that region beyond the limit). A real
GDS can have hundreds of thousands of shapes (measured: 575,637 real
boxes alone for a single AND gate at the calibrated 300x300um die) -
the full file is never returned in one response.

**Frontend**: new `components/GdsViewer.tsx` - fetches the real summary
on open, renders a real, sorted, checkbox layer list (real shape counts,
known SKY130 name or an honest `L{layer}/D{datatype}` fallback), and a
`<canvas>` renderer drawing REAL polygon/path/box outline points for
each selected layer, transformed into the current pan/zoom viewport
(scroll to zoom centered on cursor, drag to pan) - never a fixed-size
placeholder shape. Changing the viewport or layer selection triggers a
debounced (250ms) real region re-query, never on every intermediate
drag frame. Wired into `PhysicalDesignPanel.tsx` via an "Open Real GDS
Viewer" toggle, shown only for a succeeded job, clearly labeled and
visually separate from the pre-existing DEF-derived floorplan section
(now itself re-labeled "DEF-derived floorplan (placement origins
only)" for an explicit, honest distinction between the two views).

**Tests**: backend +11 (`test_gds_reader.py`: 6, incl. 4 real-tool-gated
tests against a real GDS fixture file committed at
`tests/fixtures/gds/and_gate.gds`, a real, previously-generated 2.02MB
AND-gate GDS artifact; `test_gds_api.py`: 5, incl. one real-tool-gated
end-to-end API test that constructs a real succeeded-job directory
layout around the same fixture, avoiding a slow real multi-minute
LibreLane run for a pure API-contract test while still exercising the
entire real parsing stack). Frontend +5 (`GdsViewer.test.tsx`) - 35
total frontend tests.

**Real end-to-end verification**: triggered a NEW real browser build
(job `0d3a66940e6f4ef3a1cdb41dcd704928`), confirmed the real GDS
artifact on disk (2,020,856 bytes, byte-identical to the fixture since
it's the same deterministic AND-gate design), independently re-parsed
the SAME fresh file directly via the bridge script and cross-checked
every value against the live API's `/gds/summary` response (dbu, bbox,
box/polygon/path counts - exact match), opened the real "Open Real GDS
Viewer" UI, selected the real `met1` layer (45,797 real shapes) and
`met4` layer (4 real shapes) and confirmed the canvas rendered the
correct real routing-grid pattern (horizontal met1 lines, vertical met4
power straps at their real coordinates, matching values independently
verified against the raw GDS during development) - screenshots
confirmed real, non-fabricated geometry. Docker/process state confirmed
clean before and after (only the pre-existing unrelated `rag-frontend`
container ever present).

**Known limitations, explicitly not solved**: layer names beyond the
small static SKY130 reference table show only their raw `L{layer}/
D{datatype}` numbers (real, never fabricated, just unnamed). No cell-
hierarchy-aware rendering (all geometry is queried against the real
flattened top-cell view via `begin_shapes_rec`/`begin_shapes_touching` -
matches how a real placed/routed die is actually organized after
LibreLane's synthesis, so this is not a meaningful gap for THIS
artifact type). No automatic default layer selection (starts with zero
layers visible - deliberate, avoids an expensive default fetch before
the user expresses interest). Viewport pan/zoom shows real geometry
from the PREVIOUS debounced fetch for up to 250ms during continuous
dragging (a real, acceptable trade-off against firing a request on
every mouse-move frame) - the shapes shown are always real, just
possibly one query-cycle stale during active dragging.

## Roadmap (not yet implemented)

A cross-view (3D <-> Schematic) synchronization foundation (Step 17),
real HDL-to-Yosys synthesis for primitive-only circuits (Step 18), real
physical design via LibreLane + SKY130 + OpenROAD (Step 19), and a
frontend Physical Design product layer (Step 20) are now implemented,
alongside every earlier step. See `docs/architecture.md` for the full
locked target architecture and roadmap evaluation principle. Future
steps: a real KLayout/gdstk-based GDS/silicon viewer, real circuit
simulation via ngspice, a breadboard digital twin, and a final unified
digital-twin workspace where schematic/simulation/3D/breadboard/silicon
all stay synchronized via the same canonical ids.
