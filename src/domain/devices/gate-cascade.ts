import { device } from '@/domain/netlist/netlist';
import type { StaticCmosNetlist } from '@/domain/netlist/netlist';
import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import {
  solveOutputVoltage,
  collectDeviceStates,
  type SolveContext,
  type DeviceState,
} from '@/domain/simulation/analytical/network-solver';
import { buildMosfetParams } from './shared';

/** Stage 2 solution: the inverter's output plus each of its two transistors' states. */
export interface Stage2Solution {
  readonly vout: number;
  readonly current: number;
  readonly transistors: readonly DeviceState[];
}

/**
 * Stage 2 of AND/OR: a plain static-CMOS inverter that flips a NAND/NOR
 * stage-1 output back to the true (non-inverted) gate function. Reuses the
 * same generic solver the engine uses for stage 1 — no engine changes — it's
 * just called a second time, feeding stage 1's Vout in as stage 2's Vin.
 */
function inverterNetlist(values: ParameterValues): StaticCmosNetlist {
  return {
    inputs: ['IN'],
    output: 'Y',
    transistors: {
      MN: { id: 'MN', gate: 'IN', params: buildMosfetParams(values, 'nmos') },
      MP: { id: 'MP', gate: 'IN', params: buildMosfetParams(values, 'pmos') },
    },
    pullUp: device('MP'),
    pullDown: device('MN'),
  };
}

/** Solve the closing inverter stage given stage 1's output voltage. */
export function finalStageOutput(stage1Vout: number, values: ParameterValues, vdd: number): Stage2Solution {
  const netlist = inverterNetlist(values);
  const ctx: SolveContext = { netlist, gateVoltages: { IN: stage1Vout } };
  const { vout, current } = solveOutputVoltage(ctx, vdd);
  const transistors: DeviceState[] = [];
  collectDeviceStates(netlist.pullUp, vdd, vout, ctx, transistors);
  collectDeviceStates(netlist.pullDown, vout, 0, ctx, transistors);
  return { vout, current, transistors };
}
