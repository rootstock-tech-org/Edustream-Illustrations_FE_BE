import type { DeviceState } from '@/domain/simulation/analytical/network-solver';

/**
 * Common shape returned by every flip-flop's `step*` function. `voltages`
 * holds every internal gate's converged output — it is fed back in as the
 * `seed` for the NEXT call, which is what gives the circuit real memory
 * across simulation ticks (see feedback-solver.ts).
 */
export interface FlipFlopState {
  readonly voltages: Readonly<Record<string, number>>;
  readonly q: number;
  readonly qBar: number;
  readonly transistors: Readonly<Record<string, readonly DeviceState[]>>;
}
