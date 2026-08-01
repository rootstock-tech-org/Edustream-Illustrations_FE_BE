import { describe, expect, it } from 'vitest';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { standardCmosSchema } from '@/domain/devices/shared';
import { solveEncoder8to3, type Encoder8To3Inputs } from './encoder';

const values = defaultValues(standardCmosSchema);
const vdd = values.VDD as number;
const hi = (v: number) => v > vdd / 2;

const oneHot = (active: number): Encoder8To3Inputs => ({
  i0: active === 0,
  i1: active === 1,
  i2: active === 2,
  i3: active === 3,
  i4: active === 4,
  i5: active === 5,
  i6: active === 6,
  i7: active === 7,
});

describe('8:3 encoder — real NAND-of-inverted-inputs (OR) physics', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7])('encodes active line I%i to its binary code', (active) => {
    const { y2, y1, y0 } = solveEncoder8to3(oneHot(active), values, vdd);
    const code = (hi(y2) ? 4 : 0) + (hi(y1) ? 2 : 0) + (hi(y0) ? 1 : 0);
    expect(code).toBe(active);
  });
});
