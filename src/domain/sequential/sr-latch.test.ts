import { describe, it, expect } from 'vitest';
import { defaultValues } from '@/domain/parameters/parameter.schema';
import { standardCmosSchema } from '@/domain/devices/shared';
import { initSrLatch, stepSrLatch } from './sr-latch';

const values = defaultValues(standardCmosSchema);
const vdd = values.VDD as number;

describe('gated SR latch — real cross-coupled NAND physics', () => {
  it('powers on reset (Q=0)', () => {
    const s0 = initSrLatch(vdd);
    expect(s0.q).toBeLessThan(0.2 * vdd);
  });

  it('is transparent (holds) while CLK is low, even with S asserted', () => {
    let s = initSrLatch(vdd);
    s = stepSrLatch(s, { s: true, r: false, clk: false }, values, vdd);
    expect(s.q).toBeLessThan(0.2 * vdd); // unaffected — clock gates it off
  });

  it('sets Q high when S=1,R=0,CLK=1', () => {
    let s = initSrLatch(vdd);
    s = stepSrLatch(s, { s: true, r: false, clk: true }, values, vdd);
    expect(s.q).toBeGreaterThan(0.8 * vdd);
    expect(s.qBar).toBeLessThan(0.2 * vdd);
  });

  it('resets Q low when S=0,R=1,CLK=1', () => {
    let s = initSrLatch(vdd);
    s = stepSrLatch(s, { s: true, r: false, clk: true }, values, vdd); // set first
    s = stepSrLatch(s, { s: false, r: true, clk: true }, values, vdd); // then reset
    expect(s.q).toBeLessThan(0.2 * vdd);
    expect(s.qBar).toBeGreaterThan(0.8 * vdd);
  });

  it('holds its set state when clocked with S=R=0 (memory)', () => {
    let s = initSrLatch(vdd);
    s = stepSrLatch(s, { s: true, r: false, clk: true }, values, vdd); // set
    s = stepSrLatch(s, { s: false, r: false, clk: true }, values, vdd); // hold, clocked
    expect(s.q).toBeGreaterThan(0.8 * vdd);
  });

  it('holds through a clock pulse going back low', () => {
    let s = initSrLatch(vdd);
    s = stepSrLatch(s, { s: true, r: false, clk: true }, values, vdd); // set
    s = stepSrLatch(s, { s: false, r: false, clk: false }, values, vdd); // clock falls
    expect(s.q).toBeGreaterThan(0.8 * vdd);
  });
});
