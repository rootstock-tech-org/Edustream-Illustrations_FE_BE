import { describe, it, expect } from 'vitest';
import { AnalyticalEngine } from '@/domain/simulation/analytical/analytical.engine';
import { and2 } from './and2.device';
import { finalStageOutput } from './gate-cascade';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { solveOutputVoltage, type SolveContext } from '@/domain/simulation/analytical/network-solver';

const engine = new AnalyticalEngine();
const values = defaultValues(and2.parameterSchema);
const vdd = values.VDD as number;

function stage1OutputFor(a: boolean, b: boolean): number {
  const netlist = and2.buildNetlist(values);
  const ctx: SolveContext = { netlist, gateVoltages: { A: a ? vdd : 0, B: b ? vdd : 0 } };
  return solveOutputVoltage(ctx, vdd).vout;
}

function andOutputFor(a: boolean, b: boolean): number {
  return finalStageOutput(stage1OutputFor(a, b), values, vdd).vout;
}

describe('AND2 — stage 1 (NAND) runs on the unchanged generic engine', () => {
  it('produces a full result via the standard engine path', () => {
    const r = engine.simulate({ device: and2, values, options: { sweepPoints: 51 } });
    expect(r.deviceId).toBe('and2');
    expect(r.operatingPoint.transistors).toHaveLength(4);
  });

  it('stage 1 implements NAND (low only when A AND B are high)', () => {
    expect(stage1OutputFor(false, false)).toBeGreaterThan(0.8 * vdd);
    expect(stage1OutputFor(true, true)).toBeLessThan(0.2 * vdd);
  });
});

describe('AND2 — full NAND + inverter cascade implements the true AND function', () => {
  it('is high only when both A and B are high', () => {
    expect(andOutputFor(false, false)).toBeLessThan(0.2 * vdd);
    expect(andOutputFor(false, true)).toBeLessThan(0.2 * vdd);
    expect(andOutputFor(true, false)).toBeLessThan(0.2 * vdd);
    expect(andOutputFor(true, true)).toBeGreaterThan(0.8 * vdd);
  });
});
