import { describe, it, expect } from 'vitest';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { standardCmosSchema } from '@/domain/devices/shared';
import { initJkFlipFlop, stepJkFlipFlop } from './jk-flipflop';
import type { FlipFlopState } from './flipflop.types';

const values = defaultValues(standardCmosSchema);
const vdd = values.VDD as number;
const HI = 0.8 * vdd;
const LO = 0.2 * vdd;

function pulse(s: FlipFlopState, j: boolean, k: boolean): FlipFlopState {
  const low = stepJkFlipFlop(s, { j, k, clk: false }, values, vdd); // master samples J/K + feedback
  return stepJkFlipFlop(low, { j, k, clk: true }, values, vdd); // rising edge
}

describe('JK flip-flop — master-slave NAND physics with output feedback', () => {
  it('powers on reset (Q=0)', () => {
    expect(initJkFlipFlop(vdd).q).toBeLessThan(LO);
  });

  it('sets Q=1 when J=1,K=0', () => {
    const s = pulse(initJkFlipFlop(vdd), true, false);
    expect(s.q).toBeGreaterThan(HI);
  });

  it('resets Q=0 when J=0,K=1', () => {
    let s = pulse(initJkFlipFlop(vdd), true, false); // set first
    s = pulse(s, false, true);
    expect(s.q).toBeLessThan(LO);
  });

  it('holds when J=0,K=0', () => {
    let s = pulse(initJkFlipFlop(vdd), true, false); // Q -> 1
    s = pulse(s, false, false);
    expect(s.q).toBeGreaterThan(HI);
  });

  it('toggles on every clock edge when J=K=1', () => {
    let s = initJkFlipFlop(vdd);
    expect(s.q).toBeLessThan(LO); // 0
    s = pulse(s, true, true);
    expect(s.q).toBeGreaterThan(HI); // 1
    s = pulse(s, true, true);
    expect(s.q).toBeLessThan(LO); // back to 0
    s = pulse(s, true, true);
    expect(s.q).toBeGreaterThan(HI); // back to 1
  });
});
