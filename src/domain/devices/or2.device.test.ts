import { describe, it, expect } from 'vitest';
import { AnalyticalEngine } from '@/domain/simulation/analytical/analytical.engine';
import { or2 } from './or2.device';
import { finalStageOutput } from './gate-cascade';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { solveOutputVoltage, type SolveContext } from '@/domain/simulation/analytical/network-solver';

const engine = new AnalyticalEngine();
const values = defaultValues(or2.parameterSchema);
const vdd = values.VDD as number;

function stage1OutputFor(a: boolean, b: boolean): number {
  const netlist = or2.buildNetlist(values);
  const ctx: SolveContext = { netlist, gateVoltages: { A: a ? vdd : 0, B: b ? vdd : 0 } };
  return solveOutputVoltage(ctx, vdd).vout;
}

function orOutputFor(a: boolean, b: boolean): number {
  return finalStageOutput(stage1OutputFor(a, b), values, vdd).vout;
}

describe('OR2 — stage 1 (NOR) runs on the unchanged generic engine', () => {
  it('produces a full result via the standard engine path', () => {
    const r = engine.simulate({ device: or2, values, options: { sweepPoints: 51 } });
    expect(r.deviceId).toBe('or2');
    expect(r.operatingPoint.transistors).toHaveLength(4);
  });

  it('stage 1 implements NOR (high only when A AND B are both low)', () => {
    expect(stage1OutputFor(false, false)).toBeGreaterThan(0.8 * vdd);
    expect(stage1OutputFor(true, false)).toBeLessThan(0.2 * vdd);
    expect(stage1OutputFor(false, true)).toBeLessThan(0.2 * vdd);
    expect(stage1OutputFor(true, true)).toBeLessThan(0.2 * vdd);
  });
});

describe('OR2 — full NOR + inverter cascade implements the true OR function', () => {
  it('is high whenever A or B (or both) is high', () => {
    expect(orOutputFor(false, false)).toBeLessThan(0.2 * vdd);
    expect(orOutputFor(false, true)).toBeGreaterThan(0.8 * vdd);
    expect(orOutputFor(true, false)).toBeGreaterThan(0.8 * vdd);
    expect(orOutputFor(true, true)).toBeGreaterThan(0.8 * vdd);
  });
});
