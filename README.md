# Semiconductor Explorer

A production-grade, **explainable** educational simulator for CMOS / VLSI devices.
Every output carries its full derivation, the AI tutor is grounded in those
deterministic results, and new devices are added as data, not code.

## Quick start

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # domain + engine + worker + state tests
npm run typecheck      # strict tsc
npm run build          # production build
```

Optional AI tutor: copy `.env.example` to `.env.local` and set `GROQ_API_KEY`
(Groq-hosted `gpt-oss-120b`). Without it the tutor uses a deterministic,
grounded offline fallback.

## Architecture (strict, lint-enforced layering)

```
app/      Next.js routes (thin)            ← outermost
ui/       React components + hooks (presentation only)
viz/      R3F scene + Recharts/graph renderers
state/    Zustand stores + worker bridge
ai/       Tutor provider abstraction (Groq | local fallback)
workers/  Typed RPC + simulation worker
domain/   Pure TS: physics, netlist, engine, explainability   ← innermost
```

`domain/` is framework-free pure TypeScript. The boundary is enforced by
ESLint (`no-restricted-imports`), not convention — `domain/` cannot import
React, Next, three, the AI SDK, or any outer layer.

### Key design decisions

- **One formula, one place.** Every equation is declared once in a
  `FormulaRegistry` and *emits its own Explanation as it computes*, so the
  derivation shown to the learner can never drift from the number used.
- **Devices are data.** A device is a netlist of MOSFET primitives. The engine
  solves an arbitrary series/parallel pull-up/pull-down network, so the
  inverter and NAND share one solver. Adding NAND was **2 lines** (one device
  file + one registry entry) with zero engine/UI/state changes.
- **Strategy everywhere swappable.** `SimulationEngine` (analytical now,
  SPICE/WASM later) and `TutorProvider` (Groq now, anything later) hide behind
  interfaces.
- **Perf seams.** Simulation runs in a Web Worker behind a typed RPC protocol;
  a numeric fast-path keeps a 201-point sweep < 50 ms; 3D animation runs via
  refs in `useFrame` (no per-frame React renders); Recharts and R3F are
  dynamically imported so they never block first paint.
- **Accessibility is structural.** Every chart has a `GraphSpec`-generated data
  table (the real screen-reader path); reduced-motion is honored; controls are
  keyboard-navigable and labelled.

### Adding a device

Create `src/domain/devices/<gate>.device.ts` returning a `DeviceDefinition`
(name, shared schema, and a `buildNetlist` that wires primitives with
`series`/`parallel`/`device`), then register it in
`src/domain/devices/registry.ts`. Nothing else changes.
# illustration-edtech
