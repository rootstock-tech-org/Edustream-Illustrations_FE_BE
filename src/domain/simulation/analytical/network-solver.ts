import { solveMosfet, mosfetCurrent } from '@/domain/primitives/mosfet';
import type { Quantity } from '@/domain/units';
import type { RegionOfOperation, MosfetType } from '@/domain/primitives/mosfet';
import type { StaticCmosNetlist, NetworkNode } from '@/domain/netlist/netlist';

/**
 * DC solver for an arbitrary static-CMOS switch network. Branch current is
 * defined recursively over the series/parallel tree, with internal series-node
 * voltages found by bisection. Because the solver is topology-agnostic, every
 * complementary gate (inverter, NAND, NOR, AOI…) is solved by the SAME code —
 * only the netlist tree differs.
 */

export interface SolveContext {
  readonly netlist: StaticCmosNetlist;
  /** Gate voltage (V) for each input signal name. */
  readonly gateVoltages: Readonly<Record<string, number>>;
}

const BISECT_ITERS = 48;

/**
 * Current flowing from `vTop` to `vBottom` through `node` (vTop ≥ vBottom).
 * Always non-negative for our monotone operating-point search.
 */
export function branchCurrent(
  node: NetworkNode,
  vTop: number,
  vBottom: number,
  ctx: SolveContext,
): number {
  switch (node.kind) {
    case 'device':
      return deviceCurrent(node.deviceId, vTop, vBottom, ctx);
    case 'parallel':
      return node.children.reduce(
        (sum, child) => sum + branchCurrent(child, vTop, vBottom, ctx),
        0,
      );
    case 'series':
      return seriesCurrent(node.children, vTop, vBottom, ctx);
  }
}

function deviceCurrent(
  deviceId: string,
  vTop: number,
  vBottom: number,
  ctx: SolveContext,
): number {
  const t = ctx.netlist.transistors[deviceId];
  if (!t) throw new Error(`Unknown transistor '${deviceId}' in netlist`);
  const vg = ctx.gateVoltages[t.gate] ?? 0;
  const vds = Math.max(0, vTop - vBottom);

  // Source is the low terminal for NMOS, the high terminal for PMOS. The model
  // takes source-referenced magnitudes (see mosfet.types.ts).
  const vgs = t.params.type === 'nmos' ? vg - vBottom : vTop - vg;
  return mosfetCurrent(t.params, { vgs, vds }).current;
}

/**
 * Current through a series chain. Recursively splits off the top element and
 * finds the internal node voltage where its current matches the rest of the
 * chain. f(vMid) = I_head(vMid) − I_tail(vMid) is monotonic, so we bisect.
 */
function seriesCurrent(
  children: readonly NetworkNode[],
  vTop: number,
  vBottom: number,
  ctx: SolveContext,
): number {
  if (children.length === 1) return branchCurrent(children[0]!, vTop, vBottom, ctx);
  const { head, vMid } = splitSeries(children, vTop, vBottom, ctx);
  return branchCurrent(head, vTop, vMid, ctx);
}

/**
 * Finds the internal node voltage of a series chain by bisection, splitting the
 * chain into its head element and the remaining tail. Shared by the current
 * computation and per-device state recovery so they stay consistent.
 */
function splitSeries(
  children: readonly NetworkNode[],
  vTop: number,
  vBottom: number,
  ctx: SolveContext,
): { head: NetworkNode; tail: NetworkNode; vMid: number } {
  const head = children[0]!;
  const tail: NetworkNode = { kind: 'series', children: children.slice(1) };
  let lo = vBottom;
  let hi = vTop;
  let vMid = (lo + hi) / 2;
  for (let i = 0; i < BISECT_ITERS; i++) {
    vMid = (lo + hi) / 2;
    const iHead = branchCurrent(head, vTop, vMid, ctx);
    const iTail = branchCurrent(tail, vMid, vBottom, ctx);
    if (iHead > iTail) lo = vMid;
    else hi = vMid;
  }
  return { head, tail, vMid };
}

/** Recovered electrical state of a single transistor at the operating point. */
export interface DeviceState {
  readonly id: string;
  readonly type: MosfetType;
  readonly region: RegionOfOperation;
  readonly current: Quantity;
  readonly threshold: Quantity;
  /** Gate overdrive V_GS − V_th (V); negative in cutoff. */
  readonly overdrive: Quantity;
}

/** Walk a network, recovering each transistor's region/current/threshold. */
export function collectDeviceStates(
  node: NetworkNode,
  vTop: number,
  vBottom: number,
  ctx: SolveContext,
  out: DeviceState[],
): void {
  switch (node.kind) {
    case 'device': {
      const t = ctx.netlist.transistors[node.deviceId]!;
      const vg = ctx.gateVoltages[t.gate] ?? 0;
      const vds = Math.max(0, vTop - vBottom);
      const vgs = t.params.type === 'nmos' ? vg - vBottom : vTop - vg;
      const sol = solveMosfet(t.params, { vgs, vds });
      out.push({ id: t.id, type: t.params.type, region: sol.region, current: sol.current, threshold: sol.threshold, overdrive: sol.overdrive });
      return;
    }
    case 'parallel':
      for (const child of node.children) collectDeviceStates(child, vTop, vBottom, ctx, out);
      return;
    case 'series': {
      if (node.children.length === 1) {
        collectDeviceStates(node.children[0]!, vTop, vBottom, ctx, out);
        return;
      }
      const { head, tail, vMid } = splitSeries(node.children, vTop, vBottom, ctx);
      collectDeviceStates(head, vTop, vMid, ctx, out);
      collectDeviceStates(tail, vMid, vBottom, ctx, out);
      return;
    }
  }
}

export interface OperatingPointSolution {
  /** Output node voltage (V). */
  readonly vout: number;
  /** Through (short-circuit) current at the output node (A). */
  readonly current: number;
}

/**
 * Solve the output voltage for the given gate drive and supply. KCL at OUT:
 * pull-up current into OUT equals pull-down current out of OUT. Both are
 * monotonic in Vout, so the balance point is found by bisection.
 */
export function solveOutputVoltage(ctx: SolveContext, vdd: number): OperatingPointSolution {
  const { pullUp, pullDown } = ctx.netlist;
  let lo = 0;
  let hi = vdd;
  let vout = vdd / 2;
  let current = 0;
  for (let i = 0; i < BISECT_ITERS; i++) {
    vout = (lo + hi) / 2;
    const iPullDown = branchCurrent(pullDown, vout, 0, ctx);
    const iPullUp = branchCurrent(pullUp, vdd, vout, ctx);
    current = (iPullDown + iPullUp) / 2;
    // As Vout rises: pull-down current rises, pull-up current falls.
    if (iPullDown < iPullUp) lo = vout;
    else hi = vout;
  }
  return { vout, current };
}
