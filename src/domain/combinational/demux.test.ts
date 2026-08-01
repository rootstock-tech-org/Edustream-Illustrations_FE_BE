import { describe, expect, it } from 'vitest';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { standardCmosSchema } from '@/domain/devices/shared';
import { solveDemux1to4 } from './demux';

const values = defaultValues(standardCmosSchema);
const vdd = values.VDD as number;
const hi = (v: number) => v > vdd / 2;

describe('1:4 DEMUX — real NAND-then-invert physics', () => {
  it('routes D to Y0 only when S1=0,S0=0', () => {
    const { y0, y1, y2, y3 } = solveDemux1to4({ d: true, s1: false, s0: false }, values, vdd);
    expect([hi(y0), hi(y1), hi(y2), hi(y3)]).toEqual([true, false, false, false]);
  });

  it('routes D to Y1 only when S1=0,S0=1', () => {
    const { y0, y1, y2, y3 } = solveDemux1to4({ d: true, s1: false, s0: true }, values, vdd);
    expect([hi(y0), hi(y1), hi(y2), hi(y3)]).toEqual([false, true, false, false]);
  });

  it('routes D to Y2 only when S1=1,S0=0', () => {
    const { y0, y1, y2, y3 } = solveDemux1to4({ d: true, s1: true, s0: false }, values, vdd);
    expect([hi(y0), hi(y1), hi(y2), hi(y3)]).toEqual([false, false, true, false]);
  });

  it('routes D to Y3 only when S1=1,S0=1', () => {
    const { y0, y1, y2, y3 } = solveDemux1to4({ d: true, s1: true, s0: true }, values, vdd);
    expect([hi(y0), hi(y1), hi(y2), hi(y3)]).toEqual([false, false, false, true]);
  });

  it('all outputs low when D=0, regardless of select', () => {
    const { y0, y1, y2, y3 } = solveDemux1to4({ d: false, s1: true, s0: false }, values, vdd);
    expect([hi(y0), hi(y1), hi(y2), hi(y3)]).toEqual([false, false, false, false]);
  });
});
