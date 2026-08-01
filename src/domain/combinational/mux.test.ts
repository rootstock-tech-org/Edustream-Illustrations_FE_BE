import { describe, expect, it } from 'vitest';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { standardCmosSchema } from '@/domain/devices/shared';
import { solveMux4to1 } from './mux';

const values = defaultValues(standardCmosSchema);
const vdd = values.VDD as number;
const hi = (v: number) => v > vdd / 2;

describe('4:1 MUX — real NAND-NAND SOP physics', () => {
  const inputs = { i0: false, i1: true, i2: false, i3: true } as const;

  it('selects I0 when S1=0,S0=0', () => {
    const { y } = solveMux4to1({ ...inputs, s1: false, s0: false }, values, vdd);
    expect(hi(y)).toBe(inputs.i0);
  });

  it('selects I1 when S1=0,S0=1', () => {
    const { y } = solveMux4to1({ ...inputs, s1: false, s0: true }, values, vdd);
    expect(hi(y)).toBe(inputs.i1);
  });

  it('selects I2 when S1=1,S0=0', () => {
    const { y } = solveMux4to1({ ...inputs, s1: true, s0: false }, values, vdd);
    expect(hi(y)).toBe(inputs.i2);
  });

  it('selects I3 when S1=1,S0=1', () => {
    const { y } = solveMux4to1({ ...inputs, s1: true, s0: true }, values, vdd);
    expect(hi(y)).toBe(inputs.i3);
  });
});
