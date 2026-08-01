import { describe, it, expect } from 'vitest';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { standardCmosSchema } from '@/domain/devices/shared';
import { solveNand, solveFeedbackNetwork, type FeedbackNetwork } from './feedback-solver';

const values = defaultValues(standardCmosSchema);
const vdd = values.VDD as number;
const HI = vdd;
const LO = 0;

describe('solveNand — generic N-input NAND primitive', () => {
  it('2-input NAND truth table', () => {
    const out = (a: number, b: number) => solveNand(['A', 'B'], { A: a, B: b }, values, vdd).vout;
    expect(out(LO, LO)).toBeGreaterThan(0.8 * vdd);
    expect(out(LO, HI)).toBeGreaterThan(0.8 * vdd);
    expect(out(HI, LO)).toBeGreaterThan(0.8 * vdd);
    expect(out(HI, HI)).toBeLessThan(0.2 * vdd);
  });

  it('3-input NAND truth table (needed for JK feedback gates)', () => {
    const out = (a: number, b: number, c: number) => solveNand(['A', 'B', 'C'], { A: a, B: b, C: c }, values, vdd).vout;
    expect(out(HI, HI, HI)).toBeLessThan(0.2 * vdd);
    expect(out(HI, HI, LO)).toBeGreaterThan(0.8 * vdd);
  });

  it('tying both inputs to the same signal makes an inverter', () => {
    const inv = (a: number) => solveNand(['A', 'A'], { A: a }, values, vdd).vout;
    expect(inv(LO)).toBeGreaterThan(0.8 * vdd);
    expect(inv(HI)).toBeLessThan(0.2 * vdd);
  });
});

describe('solveFeedbackNetwork — bare cross-coupled NAND latch (S̄R̄)', () => {
  const network: FeedbackNetwork = {
    Q: { inputs: ['Sbar', 'QBar'] },
    QBar: { inputs: ['Rbar', 'Q'] },
  };

  it('sets Q high when Sbar is asserted (active low)', () => {
    const sol = solveFeedbackNetwork(network, { Sbar: LO, Rbar: HI }, { Q: LO, QBar: HI }, values, vdd);
    expect(sol.voltages.Q).toBeGreaterThan(0.8 * vdd);
    expect(sol.voltages.QBar).toBeLessThan(0.2 * vdd);
  });

  it('resets Q low when Rbar is asserted (active low)', () => {
    const sol = solveFeedbackNetwork(network, { Sbar: HI, Rbar: LO }, { Q: HI, QBar: LO }, values, vdd);
    expect(sol.voltages.Q).toBeLessThan(0.2 * vdd);
    expect(sol.voltages.QBar).toBeGreaterThan(0.8 * vdd);
  });

  it('holds its previous state when both inputs are inactive (memory)', () => {
    const held = solveFeedbackNetwork(network, { Sbar: HI, Rbar: HI }, { Q: HI, QBar: LO }, values, vdd);
    expect(held.voltages.Q).toBeGreaterThan(0.8 * vdd);

    const heldLow = solveFeedbackNetwork(network, { Sbar: HI, Rbar: HI }, { Q: LO, QBar: HI }, values, vdd);
    expect(heldLow.voltages.Q).toBeLessThan(0.2 * vdd);
  });
});
