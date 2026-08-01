import { describe, it, expect } from 'vitest';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { standardCmosSchema } from '@/domain/devices/shared';
import { initDFlipFlop, stepDFlipFlop } from './d-flipflop';
import type { FlipFlopState } from './flipflop.types';

const values = defaultValues(standardCmosSchema);
const vdd = values.VDD as number;
const HI = 0.8 * vdd;
const LO = 0.2 * vdd;

function pulseClockHigh(s: FlipFlopState, d: boolean): FlipFlopState {
  const withClkLow = stepDFlipFlop(s, { d, clk: false }, values, vdd); // master tracks D
  return stepDFlipFlop(withClkLow, { d, clk: true }, values, vdd); // rising edge — captured
}

describe('D flip-flop — master-slave NAND physics, real rising-edge capture', () => {
  it('powers on reset (Q=0)', () => {
    expect(initDFlipFlop(vdd).q).toBeLessThan(LO);
  });

  it('captures D=1 on the rising edge', () => {
    const s = pulseClockHigh(initDFlipFlop(vdd), true);
    expect(s.q).toBeGreaterThan(HI);
  });

  it('does not change while CLK stays high, even if D changes', () => {
    let s = pulseClockHigh(initDFlipFlop(vdd), true); // Q -> 1
    s = stepDFlipFlop(s, { d: false, clk: true }, values, vdd); // D drops but CLK still high
    expect(s.q).toBeGreaterThan(HI); // unchanged
  });

  it('captures D=0 on the next rising edge', () => {
    let s = pulseClockHigh(initDFlipFlop(vdd), true); // Q -> 1
    s = stepDFlipFlop(s, { d: false, clk: false }, values, vdd); // clock falls, master tracks D=0
    s = stepDFlipFlop(s, { d: false, clk: true }, values, vdd); // rising edge captures D=0
    expect(s.q).toBeLessThan(LO);
  });

  it('holds across multiple ticks while D is stable', () => {
    let s = pulseClockHigh(initDFlipFlop(vdd), true);
    for (let i = 0; i < 3; i++) {
      s = stepDFlipFlop(s, { d: true, clk: false }, values, vdd);
      s = stepDFlipFlop(s, { d: true, clk: true }, values, vdd);
    }
    expect(s.q).toBeGreaterThan(HI);
  });
});
