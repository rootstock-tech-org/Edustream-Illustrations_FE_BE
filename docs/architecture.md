# VLSI Digital Twin - Target Architecture & Roadmap Evaluation Principle

This document is the stable reference for the project's actual long-term
target shape. `README.md` remains the step-by-step build log (what has
been implemented so far, in order); this file is "why, target shape, and
how every future step should be judged" - it should rarely need rewriting,
unlike the README which grows with every step.

## Core principle

> One prompt -> one canonical VLSI IR -> multiple REAL, synchronized
> views -> one digital twin.

Explicitly rejected anti-pattern: four independent, disconnected
illustrations that happen to be generated from the same starting prompt
but never reference each other:

```
Prompt -> random schematic
Prompt -> random 3D
Prompt -> random breadboard
```

That is NOT a digital twin - it is four unrelated pictures. A real digital
twin means every view is a projection of the exact same underlying data,
and selecting a component in one view can (eventually) be reflected in
every other active view.

## Target data flow

```
                     USER PROMPT
                         |
                         v
                  AI / NLU ENGINE
         (Step 15: deterministic keyword/alias bridge today;
          future: Groq/LLM-based, same resolve_prompt() seam)
                         |
                         v
               VLSI CANONICAL IR
       (backend/app/domain/ir/ - already real, already stable)
                         |
            +------------+------------+
            v            v            v
       SCHEMATIC     SIMULATION    PHYSICAL
            |                          |
            |                  +-------+--------+
            |                  v                v
            |              3D VIEW          SILICON VIEW
            |          (Steps 9-14,      (real EDA target -
            |           already built)    Yosys/OpenROAD/KLayout/
            |                             gdstk/SKY130 - not yet built)
            v
       BREADBOARD
   (when the prompt is practical/electronics-oriented,
    e.g. "show me how to wire this on a breadboard" -
    not yet built)
```

Every view traces back to the SAME `IRDocument`'s component/port/
connection ids. This tracing convention already exists in every generator
in this codebase (`source_component_id`/`source_port_id`/
`source_connection_id` on `SchematicComponent`/`SchematicWire`/
`PhysicalBlock`/`PhysicalNet`/`SceneObject`/`SimulationSignal`) - it is the
foundation cross-view synchronization will be built on, not something
that needs to be invented from scratch.

## Current implementation status (honest: real vs synthetic today)

| Layer | Status today | What "real" would mean |
|---|---|---|
| Canonical IR | Real, stable data model | (already real) |
| Prompt/Intent resolution | Deterministic keyword/alias matcher (Step 15) | Groq/LLM-based real NLU, plugged into the exact same `resolve_prompt()` seam |
| Guardrails | Real structural validation | (already real) |
| Schematic | Deterministic synthetic layout (this project's own layering algorithm) | Schematic-as-diagram doesn't inherently need an external EDA tool - this is fine as a real, deterministic generator |
| Simulation | Small deterministic behavioral engine (input/output/AND/OR/NOT only) | Real SPICE-level simulation via `ngspice` for analog/transistor-level circuits |
| Synthesis (HDL -> gate-level netlist) | **Implemented (Step 18)** - real HDL generation (`app/domain/hdl`) + the REAL `Yosys` executable (generic synthesis only, no target cell library yet), for primitive-only (input/output/AND/OR/NOT) documents; honest, identity-preserving mapping back to canonical component ids | Extend HDL generation to more primitive/compound kinds as they gain real gate-level definitions |
| Physical | **Implemented (Step 19 + Step 20 follow-ups: cancellation, real GDS viewer)** - real physical design via `LibreLane` (real Yosys SKY130 techmapping + real `OpenROAD` floorplan/PDN/placement/routing + real `Magic` GDS export), consuming Step 18's `generate_verilog()` HDL directly; a real, user-cancellable job API; a real GDS/silicon viewer parsing the actual GDS via `klayout` (subprocess bridge into the isolated LibreLane venv) with real pan/zoom/layer-selection; the OLD synthetic shelf-packing floorplan (`app/domain/physical/`) is untouched and still used by the existing 3D twin | Extend the real flow to more primitive/compound kinds as they gain real HDL definitions; feed the real physical result into the 3D twin (currently still synthetic) |
| 3D View | Real renderer (Three.js / React Three Fiber) of the *synthetic* Physical layout | Same renderer, fed by REAL physical/GDS data instead of the synthetic floorplan |
| Silicon / GDS View | Does not exist yet | Real GDS via `gdstk`/`KLayout`, rendered from actual `OpenROAD`/`SKY130` output |
| Breadboard View | Does not exist yet | A new view mapping IR components to a real breadboard/IC/jumper-wire representation (KiCad-adjacent ecosystem) |
| Cross-view selection sync | **Implemented (Step 17)** - a shared `SelectionContext` (component/port/connection, mutually exclusive) keyed by canonical `source_*_id`s propagates across the Schematic and 3D views | Extend the same context to future Simulation/Breadboard/Silicon views as they're built - no new architecture needed |

## Roadmap evaluation principle

Every future step must be justified against this question:

> Does this move the platform closer to *one prompt -> one canonical IR ->
> multiple REAL, synchronized views -> one digital twin*?

Explicitly NOT sufficient justification on their own: "it looks nice in
3D", "it's the next obvious UI polish item", "it's a small cosmetic
addition to an already-working view". A candidate step that only makes an
existing view slightly prettier - without adding (a) a new REAL
synchronized view, (b) real EDA/tooling integration replacing a synthetic
placeholder, or (c) cross-view synchronization - should be deprioritized
in favor of steps that do one of those three things.

## Step 21: Canonical Identity/Provenance Layer (2026-09-14)

### Why this step exists

Every prior step's identity tracing (HDL gate instance names, real
placed DEF/GDS cells, real DEF pins) was real but SCATTERED - each
consumer (the frontend's "Canonical identity mapping" table, the GDS
viewer, etc.) had to know which of several different, differently-shaped
objects to look at for one canonical component's cross-layer identity.
This step does NOT change how any of that data is produced (Step 18's
HDL generator and Step 19's physical identity mapping are byte-for-byte
untouched) - it adds ONE new, additive projection that unifies them into
a single per-component ledger, so future consumers (frontend panels,
future views, future automated accuracy checks) have one place to ask
"what does canonical component X correspond to across every layer this
platform can back with real evidence?"

### What was added

- `backend/app/domain/identity/` (new package): `models.py` defines
  `DesignLayer` (`logical`/`hdl`/`physical` - a deliberately small,
  closed set; grows only when a new layer gains real backing data, never
  speculatively), `ComponentIdentityRecord` (one canonical component's
  identity across every layer with real evidence), `DesignIdentityLedger`
  (the full per-design result), `IdentityError` (structured failure,
  mirrors `GdsReadError`'s code/message shape). `builder.py`'s
  `build_design_identity_ledger(document, hdl_module, identity_mapping)`
  is a PURE aggregation function - it never re-parses a DEF/GDS/Verilog
  file itself, only projects three already-real sources (the
  `IRDocument`, Step 18's `HdlModule`, Step 19's
  `PhysicalIdentityMapping`) into the unified shape.
- `PhysicalDesignJob` gained an additive `source_document` field (the raw
  IR dict a job was built from) so a later identity-ledger request can
  cheaply, deterministically re-derive HDL identity (`generate_verilog()`
  is a pure function of the document) without re-running any real tool.
- New endpoint `GET /api/physical-design/jobs/{job_id}/identity` - 404
  for an unknown job, 409 if not yet succeeded or if it predates this
  feature (no stored source document).
- Frontend: a new "Canonical Identity Ledger" table in
  `PhysicalDesignPanel.tsx`, fetched once a job succeeds, showing each
  component's HDL instance name + physical cell(s)/DEF pin + which
  layers have real evidence, side-by-side with the pre-existing
  "Canonical identity mapping" table (kept, unchanged - the new ledger
  is a richer superset view, not a replacement).

### Honesty boundaries (deliberately NOT modelled)

A "synthesized-cell" layer distinct from `physical` was deliberately NOT
added - this project's real physical flow goes straight from HDL to real
LibreLane/SKY130 placement, with no separate, inspectable generic-
synthesis-only netlist stage in between. Claiming a distinct synthesized-
cell identity here would be fabricated, not real; if a future flow ever
produces one, extend `DesignLayer` then, not ahead of real data.
Connection-level identity is always reported `unavailable`, exactly
mirroring `PhysicalIdentityMapping.connection_identity_status`'s own
existing honesty guarantee - no new claim is made here either.

## Step 21 follow-up: Floating Input Port Guardrail (2026-09-14)

Added `check_floating_input_ports()` to `app/domain/guardrails/rules.py`
- a WARNING-severity (never blocks `is_valid`) check for any INPUT/INOUT
port that is never the target of any connection in the document, mirrors
the existing `check_annotation_references` warning pattern exactly. A
component's own downward hierarchy-boundary input port (legitimately
driven only from inside, an upward flow from a child) is correctly
excluded, reusing the same `parent_id` boundary concept
`app/domain/ir/validation.py`'s own connection-direction check already
established. This closes one concrete gap identified during a full
audit of the existing validation coverage (structural checks in
`ir/validation.py` plus the 2 existing guardrail-only checks) - dangling-
net/floating-input detection was the one commonly-useful check not yet
present anywhere in the pipeline.

## KiCad Integration Investigation (2026-09-14) - investigation only, no code written

Per an explicit request to investigate (not yet build) how KiCad fits
into the canonical model. Findings:

- **Tooling reality check**: neither `kicad-cli` nor KiCad's Python
  `pcbnew` module is installed anywhere in this project's environment
  (confirmed directly - `kicad-cli` not found, `import pcbnew` fails).
  No KiCad artifact can be honestly claimed as generated/verified until
  KiCad itself (or its file-format libraries, e.g. `kiutils`/`skip`) is
  actually installed - this is a genuine prerequisite, not a design
  decision to defer arbitrarily.
- **Relevant KiCad formats for this project's canonical model**:
  - `.kicad_sch` (S-expression schematic) - could in principle be
    generated from the Canonical IR's components/ports/connections for
    a PURELY SCHEMATIC (symbol + net) representation, analogous to this
    project's own existing deterministic schematic compiler
    (`app/domain/schematic/`) but targeting KiCad's file format instead
    of this project's own SVG. This is the most plausible near-term
    target IF this feature is ever prioritized - no real EDA placement
    data is required, only symbols/nets, which the Canonical IR already
    has.
  - `.kicad_pcb` (PCB layout) is NOT realistically derivable from
    anything this platform currently produces - this project's designs
    are gate/transistor-level IC circuits (SKY130 standard cells or bare
    transistors), not discrete-component PCB designs; there is no
    meaningful component-to-PCB-footprint mapping without an entirely
    separate "which discrete part number embodies this logical gate"
    knowledge base that does not exist here (this project explicitly
    targets on-die VLSI, not board-level PCB design).
  - Symbol/footprint LIBRARY mapping: KiCad symbols are keyed by
    `(library, symbol_name)` pairs with pin-name/number metadata: a real
    mapping would need a NEW knowledge-base entry per supported
    `Component.kind` (e.g. "AND gate" -> `74xx:74HC08` quad-AND IC symbol
    + which of its 4 physical gates map to this one logical gate) - a
    real, non-trivial one-time content-authoring effort, not a code
    architecture problem.
- **Net/component identity mapping strategy (if ever built)**: would
  reuse this project's EXISTING `Component.id`/`Connection.id` as the
  authoritative source, generating KiCad reference designators (e.g.
  `U1`, `U2`) deterministically from canonical ids (same "never use
  display names as the only identity mechanism" principle this whole
  platform already follows) - architecturally this fits the SAME
  additive-projection pattern Step 21's identity ledger already
  establishes (a new `DesignLayer.KICAD_SCHEMATIC` value + a new
  `kicad_reference_designator` field on `ComponentIdentityRecord`, only
  ever added once real KiCad export code exists to back it).
- **Conclusion**: a real, honest KiCad integration is buildable as a NEW,
  independent `app/domain/kicad/` package (following this codebase's
  established one-domain-per-concern convention) that consumes the
  Canonical IR read-only and emits `.kicad_sch` text directly (S-
  expression format is plain text, no KiCad binary/GUI needed to WRITE
  it - only to visually open/verify it) - but this requires (1)
  installing KiCad or a maintained third-party S-expression writer
  library first, and (2) a real symbol-library mapping content effort
  per supported component kind. NOT implemented this pass - correctly
  scoped as future work requiring its own dedicated investigation-then-
  build step, per this project's established "one tool integration at a
  time, each independently investigated/approved" convention (see the
  "Tool choices per layer" list above, which already lists KiCad as a
  distinct, not-yet-built line item).

## Step 21 follow-up: Real Sequential Logic - D Flip-Flop/Register (2026-09-14)

Proof-of-extensibility follow-up to the canonical identity/provenance
layer (this is the FIRST real sequential, non-combinational, kind
supported all the way through the real toolchain).

### Canonical model

A new `"DFF"` component kind: exactly one `d` INPUT port, one `clk`
INPUT port (always 1-bit, even for a wide register - a clock is never a
"bus"), one `q` OUTPUT port (width matches `d`). NO reset (sync or
async) is modelled - this platform's guardrails/simulation layers have
no reset semantics anywhere yet, and fabricating one would be worse than
not supporting it; a future step can add it once genuinely needed.

### HDL generation (`app/domain/hdl/generator.py`)

A `"DFF"` component compiles to a real `always @(posedge clk) q <= d;`
process inside its own NAMED submodule (`_DFF_<width>W`), instantiated
by name - the EXACT SAME identity-preservation mechanism the existing
combinational gate shapes already use (Yosys's `hierarchy`/`proc`/`opt`
passes, no `flatten`, preserve a submodule instance's chosen name).
Verified DIRECTLY against the real Yosys JSON netlist output (not
assumed): the top-level cell for a DFF instance is
`{"type": "_DFF_1W", "attributes": {"canonical_component_id": "dff1"}}`
with `hide_name: 0` - the instance name genuinely survives. Inside the
submodule, the sequential process becomes a real `$dff` RTLIL primitive.

### Real Yosys/LibreLane synthesis result (verified, not assumed)

A real end-to-end run (`dff_document()` -> real LibreLane -> real
OpenROAD -> real SKY130) was executed and manually inspected before any
test was written. Result: real DRC/LVS/Antenna all PASS; the real final
DEF shows `dff1/_0_ sky130_fd_sc_hd__dfxtp_2` - Yosys/LibreLane mapped
the generic sequential process to a REAL SKY130 standard-cell D
flip-flop (`dfxtp` = D-flip-flop, positive-edge-triggered, no reset -
consistent with this pass deliberately not modelling reset). Real net
entries confirm CLK/D/Q are each correctly wired to the real placed
cell's real pins. This proves the answer to "which sequential cell does
Yosys produce" empirically, not by assumption.

### Identity ledger (Step 21's own new code) - zero changes needed

`app/domain/identity/builder.py` required ZERO code changes to support
DFF - it already generically projects whatever `HdlModule.
gate_instance_ids`/`PhysicalIdentityMapping` contain, and a DFF instance
now populates both exactly like a combinational gate does (the same
`hdl_module.gate_instance_ids["dff1"] == "dff1"` mechanism). This is the
concrete proof the canonical identity backbone genuinely generalizes,
rather than being combinational-gate-specific.

### Validation (`app/domain/guardrails/rules.py`)

New `check_dff_port_shape()` - an ERROR-level (blocking) check requiring
exactly one `d`/`clk`/`q` port with correct directions, unique names, a
1-bit `clk`, and `q` width matching `d`. Runs BEFORE HDL generation, so a
malformed DFF is rejected with a clear, structured error rather than a
confusing downstream failure.

### Prompt/intent compiler (`app/domain/prompt/compiler.py` +
`groq_client.py`)

`"DFF"` added to `_PRIMITIVE_TEMPLATES` (alongside input/output/AND/OR/
NOT) - any VLSIIntent with `kind: "DFF"` and no explicit ports gets the
correct d/clk/q template automatically; the `clk` port is force-pinned
to width 1 regardless of the component's requested data width (an
"8-bit register" gets an 8-bit d/q but a 1-bit clk). The Groq system
prompt was updated to tell the LLM that `"DFF"` is a real primitive kind
covering "D flip-flop"/"register"/"store on clock edge" style requests -
different valid phrasings resolve to the SAME canonical port shape
(verified directly: an intent built via the template and one with
identical explicit ports produce byte-for-byte equivalent
canonical ports).

### Simulation - honestly deferred, not fabricated

`app/domain/simulation/engine.py` has NO clock/time-stepping concept at
all (a single fixed-point combinational evaluator) - real DFF simulation
would need genuinely new infrastructure this platform doesn't have yet.
Zero code changes were made here: `"DFF"` is simply not in
`_SUPPORTED_KINDS`, so a DFF-containing document is honestly rejected
with the SAME `UNSUPPORTED_COMPONENT_KIND` structured error every other
unsupported kind already gets - never a crash, never a fabricated
simulated value. A real behavioral DFF simulator is a real, separate,
future step (needs an edge-triggered state-update model, not a minor
addition).

### Frontend - zero changes needed

`app/domain/schematic/generator.py` and `app/domain/scene/generator.py`
have no kind-based dispatch/allowlist at all (confirmed by direct
inspection) - they render any component generically from its ports/
connections. A DFF-containing IRDocument therefore already renders
correctly through the EXISTING SceneViewer/SchematicViewer/
PhysicalDesignPanel with no new frontend code.

### Tests

New tests added (all passing): HDL generator (+5: DFF generation,
width-parameterized shape reuse, undriven d/clk, guardrail-first
rejection, real Yosys netlist inspection), guardrails (+4: valid DFF
passes, missing clk/wide clk/width-mismatch each rejected as an ERROR),
prompt compiler (+3: template-based DFF compiles+simulable-shape,
different valid descriptions resolve to the same canonical port shape,
clk stays 1-bit for a wide register request), simulation (+1: DFF is
honestly UNSUPPORTED_COMPONENT_KIND, not a crash), identity ledger (+1:
DFF flows through with zero new ledger code), physical-design API (+1,
real-LibreLane-gated: a real DFF build reaches succeeded with real
DRC/LVS PASS and the real `dff1/_0_` physical cell mapping surfaced
through both the existing identity_mapping AND the new /identity
endpoint).

## Tool choices per layer (to be introduced ONE AT A TIME as their own
dedicated steps, each independently investigated/approved - never dumped
in together):

- Synthesis: `Yosys`
- Physical design (place & route): `OpenROAD` / `OpenLane` / `LibreLane`
- Layout/GDS visualization & manipulation: `KLayout`, `gdstk`
- Process design kit: `SKY130` (open-source, real)
- Circuit/SPICE-level simulation: `ngspice`
- PCB/breadboard-side ecosystem: `KiCad` (where applicable - see Step 21
  investigation above; not yet built, tooling not installed)

## Historical step-by-step build log

See `README.md` for the full incremental history (Steps 1-20 as of this
writing) of what has actually been implemented so far, in order.
