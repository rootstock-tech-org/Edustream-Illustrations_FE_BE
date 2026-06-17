import { describe, it, expect } from 'vitest';
import { AnalyticalEngine } from '@/domain/simulation/analytical/analytical.engine';
import { nand2 } from './nand2.device';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { branchCurrent, solveOutputVoltage, type SolveContext } from '@/domain/simulation/analytical/network-solver';

/**
 * The extensibility proof, verified: NAND logic emerges from the SAME engine
 * used by the inverter, with no engine changes — only the new netlist tree.
 */
const engine = new AnalyticalEngine();
const values = defaultValues(nand2.parameterSchema);
const vdd = values.VDD as number;

function outputFor(a: boolean, b: boolean): number {
  const netlist = nand2.buildNetlist(values);
  const ctx: SolveContext = {
    netlist,
    gateVoltages: { A: a ? vdd : 0, B: b ? vdd : 0 },
  };
  // Reuse the generic solver directly for a clean truth-table check.
  return solveOutputVoltage(ctx, vdd).vout;
}

describe('NAND2 — runs on the unchanged generic engine', () => {
  it('produces a full result via the standard engine path', () => {
    const r = engine.simulate({ device: nand2, values, options: { sweepPoints: 51 } });
    expect(r.deviceId).toBe('nand2');
    expect(r.operatingPoint.transistors).toHaveLength(4);
  });

  it('implements the NAND truth table (low only when A AND B are high)', () => {
    expect(outputFor(false, false)).toBeGreaterThan(0.8 * vdd);
    expect(outputFor(false, true)).toBeGreaterThan(0.8 * vdd);
    expect(outputFor(true, false)).toBeGreaterThan(0.8 * vdd);
    expect(outputFor(true, true)).toBeLessThan(0.2 * vdd); // pull-down conducts
  });

  it('series pull-down carries less current than a single device would', () => {
    // Stacking two NMOS in series reduces drive vs one — the classic NAND cost.
    const netlist = nand2.buildNetlist(values);
    const ctx: SolveContext = { netlist, gateVoltages: { A: vdd, B: vdd } };
    const seriesCurrent = branchCurrent(netlist.pullDown, vdd, 0, ctx);
    const singleCurrent = branchCurrent({ kind: 'device', deviceId: 'MNA' }, vdd, 0, ctx);
    expect(seriesCurrent).toBeLessThan(singleCurrent);
  });
});
