import { device, series, parallel } from '@/domain/netlist/netlist';
import type { StaticCmosNetlist } from '@/domain/netlist/netlist';
import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import {
  solveOutputVoltage,
  collectDeviceStates,
  type SolveContext,
  type DeviceState,
} from '@/domain/simulation/analytical/network-solver';
import { buildMosfetParams } from '@/domain/devices/shared';

/**
 * Generic building blocks for sequential (stateful, feedback) circuits —
 * flip-flops. Everything real (SR/D/JK/T) is built from ONLY N-input NAND
 * gates, exactly as it is on a 7400-series datasheet. No new engine code is
 * needed: an N-input NAND is just a bigger series/parallel netlist, solved by
 * the SAME `solveOutputVoltage`/`collectDeviceStates` primitives the
 * combinational gates already use. Tying two legs of a NAND to the same
 * signal (e.g. `['D', 'D']`) yields an inverter — the classic 7400 trick —
 * so no separate inverter primitive is required either.
 *
 * The genuinely new piece is `solveFeedbackNetwork`: a Gauss–Seidel fixed
 * point iteration over a *graph* of NAND gates whose inputs may reference
 * each other's outputs, forming the cross-coupled loops that give a latch
 * its memory. Seeding the iteration from the PREVIOUS converged state (not a
 * neutral guess) is what makes the bistable "hold" behaviour physically
 * correct — the loop settles back into whichever stable point it already
 * occupied, exactly like a real cross-coupled latch.
 */

/** Build an N-input static-CMOS NAND netlist. Duplicate names are allowed
 *  (and used deliberately) to build an inverter from a NAND gate. */
function nandNetlist(inputNames: readonly string[], values: ParameterValues): StaticCmosNetlist {
  const transistors: Record<string, { id: string; gate: string; params: ReturnType<typeof buildMosfetParams> }> = {};
  const nIds: string[] = [];
  const pIds: string[] = [];
  inputNames.forEach((name, i) => {
    const nId = `MN${i}`;
    const pId = `MP${i}`;
    transistors[nId] = { id: nId, gate: name, params: buildMosfetParams(values, 'nmos') };
    transistors[pId] = { id: pId, gate: name, params: buildMosfetParams(values, 'pmos') };
    nIds.push(nId);
    pIds.push(pId);
  });
  return {
    inputs: [...new Set(inputNames)],
    output: 'Y',
    transistors,
    pullUp: parallel(...pIds.map(device)),
    pullDown: series(...nIds.map(device)),
  };
}

export interface NandSolution {
  readonly vout: number;
  readonly current: number;
  readonly transistors: readonly DeviceState[];
}

/** Solve one N-input NAND gate given the voltage on each named input. */
export function solveNand(
  inputNames: readonly string[],
  voltageOf: Readonly<Record<string, number>>,
  values: ParameterValues,
  vdd: number,
): NandSolution {
  const netlist = nandNetlist(inputNames, values);
  const gateVoltages: Record<string, number> = {};
  for (const name of inputNames) gateVoltages[name] = voltageOf[name] ?? 0;
  const ctx: SolveContext = { netlist, gateVoltages };
  const { vout, current } = solveOutputVoltage(ctx, vdd);
  const transistors: DeviceState[] = [];
  collectDeviceStates(netlist.pullUp, vdd, vout, ctx, transistors);
  collectDeviceStates(netlist.pullDown, vout, 0, ctx, transistors);
  return { vout, current, transistors };
}

/** One NAND gate inside a feedback network. `inputs` reference either an
 *  external signal name (from `externalInputs`) or another gate's id (its
 *  own key in the `FeedbackNetwork`) — cycles between gate ids are exactly
 *  what create a cross-coupled latch. */
export interface FeedbackGateSpec {
  readonly inputs: readonly string[];
}

export type FeedbackNetwork = Readonly<Record<string, FeedbackGateSpec>>;

export interface FeedbackSolution {
  /** Converged output voltage for every gate id in the network. */
  readonly voltages: Readonly<Record<string, number>>;
  /** Per-gate transistor states, for visualization. */
  readonly transistors: Readonly<Record<string, readonly DeviceState[]>>;
}

const DEFAULT_ITERATIONS = 60;

/**
 * Solve a network of cross-coupled NAND gates to its DC fixed point via
 * Gauss–Seidel relaxation, seeded from `seed` (the previous tick's converged
 * voltages). This seeding is what gives a bistable latch correct memory: for
 * inputs that don't force a unique state (e.g. an SR latch's "hold" input),
 * the iteration settles back near wherever it already was, not an arbitrary
 * neutral point.
 */
export function solveFeedbackNetwork(
  network: FeedbackNetwork,
  externalInputs: Readonly<Record<string, number>>,
  seed: Readonly<Record<string, number>>,
  values: ParameterValues,
  vdd: number,
  iterations: number = DEFAULT_ITERATIONS,
): FeedbackSolution {
  const gateIds = Object.keys(network);
  const voltages: Record<string, number> = { ...externalInputs };
  for (const id of gateIds) voltages[id] = seed[id] ?? vdd / 2;

  const epsilon = Math.max(1e-4, vdd * 1e-4);
  let transistors: Record<string, readonly DeviceState[]> = {};
  for (let iter = 0; iter < iterations; iter++) {
    let maxDelta = 0;
    const sweepTransistors: Record<string, readonly DeviceState[]> = {};
    for (const id of gateIds) {
      const spec = network[id]!;
      const sol = solveNand(spec.inputs, voltages, values, vdd);
      maxDelta = Math.max(maxDelta, Math.abs(sol.vout - voltages[id]!));
      voltages[id] = sol.vout;
      sweepTransistors[id] = sol.transistors;
    }
    transistors = sweepTransistors;
    // Once every gate's output stops moving between sweeps, the network has
    // reached its DC fixed point — no need to keep iterating.
    if (maxDelta < epsilon) break;
  }

  const outVoltages: Record<string, number> = {};
  for (const id of gateIds) outVoltages[id] = voltages[id]!;
  return { voltages: outVoltages, transistors };
}
