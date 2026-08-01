import { describe, expect, it } from 'vitest';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { standardCmosSchema } from '@/domain/devices/shared';
import { solveDecoder3to8 } from './decoder';

const values = defaultValues(standardCmosSchema);
const vdd = values.VDD as number;
const hi = (v: number) => v > vdd / 2;

describe('3:8 decoder — real single-AND-term-per-line physics', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7])('activates only Y%i for binary code %i', (code) => {
    const a2 = (code & 0b100) !== 0;
    const a1 = (code & 0b010) !== 0;
    const a0 = (code & 0b001) !== 0;
    const { outputs } = solveDecoder3to8({ a2, a1, a0 }, values, vdd);
    const activeIndices = outputs.map((v, i) => (hi(v) ? i : -1)).filter((i) => i >= 0);
    expect(activeIndices).toEqual([code]);
  });
});
