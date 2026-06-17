# Phase 10 — Running Findings Log

Findings recorded during the visual overhaul, to be addressed in the formal
Production Readiness Review (Phase 10).

## PERF-1 · NAND (series-gate) simulation exceeds the 50 ms target

- **Observed:** NAND2 live simulation ≈ 332 ms at the default 201-point sweep
  (CMOS inverter ≈ 12 ms). Measured via the in-app perf HUD.
- **Cause:** the generic network solver resolves series stacks with nested
  bisection (`BISECT_ITERS = 48`). A series pull-down costs ~48× the per-branch
  evaluations, multiplied across 201 sweep points and the outer Vout bisection.
- **Impact:** runs in the Web Worker, so the **UI stays 60 FPS**; only the
  result latency exceeds the stated sub-50 ms sim-update target. Noticeable as
  lag when scrubbing NAND.
- **Status:** NOT changed — engine treated as verified per project rules.
- **Recommended fix (no architecture change):** lower `BISECT_ITERS` 48→~28
  (≈1e-8 V resolution, ample) and/or live transfer-curve points 201→~121; add a
  perf regression test. Estimated NAND compute → well under 50 ms.

## VIS-1 · Heat cue subtlety, channel-band particle shape, body-color scheme

Addressed during increment-1 polish (device-type base color + region accent,
stronger thermal overlay, flattened carrier band). Re-verify in Phase 10.
