import { describe, it, expect } from 'vitest';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { standardCmosSchema } from '@/domain/devices/shared';
import { initTFlipFlop, stepTFlipFlop } from './t-flipflop';
import type { FlipFlopState } from './flipflop.types';

const values = defaultValues(standardCmosSchema);
const vdd = values.VDD as number;
const HI = 0.8 * vdd;
const LO = 0.2 * vdd;

function pulse(s: FlipFlopState, t: boolean): FlipFlopState {
  const low = stepTFlipFlop(s, { t, clk: false }, values, vdd);
  return stepTFlipFlop(low, { t, clk: true }, values, vdd);
}

describe('T flip-flop — JK physics with J=K=T tied together', () => {
  it('powers on reset (Q=0)', () => {
    expect(initTFlipFlop(vdd).q).toBeLessThan(LO);
  });

  it('holds when T=0', () => {
    const s = pulse(initTFlipFlop(vdd), false);
    expect(s.q).toBeLessThan(LO);
  });

  it('toggles every edge when T=1', () => {
    let s = initTFlipFlop(vdd);
    s = pulse(s, true);
    expect(s.q).toBeGreaterThan(HI);
    s = pulse(s, true);
    expect(s.q).toBeLessThan(LO);
    s = pulse(s, true);
    expect(s.q).toBeGreaterThan(HI);
  });
});
