import { describe, it, expect } from 'vitest';
import { solveMosfet } from './mosfet.model';
import { computeThreshold } from './threshold';
import { computeLeakage } from './leakage';
import { PHYSICS, SILICON, MODEL } from './constants';
import type { MosfetParameters } from './mosfet.types';

/**
 * A representative 180 nm-ish NMOS. Tests assert against values computed by
 * hand from the same physical equations — proving outputs are derived, never
 * hardcoded, and that the model is internally consistent.
 */
const NMOS: MosfetParameters = {
  type: 'nmos',
  W: 1e-6,
  L: 1.8e-7,
  Tox: 4e-9,
  Na: 1e23,
  vth0: 0.4,
  mobility0: 0.045, // 450 cm^2/V·s
  lambda: 0.05,
  subthresholdSlopeFactor: 1.3,
  temperature: 300,
  corner: 'TT',
};

// Independently recompute the threshold the way the model does, for cross-check.
function expectedThresholdAt(vsb: number, params = NMOS): number {
  const vT = (PHYSICS.K_BOLTZMANN * params.temperature) / PHYSICS.Q;
  const cOx = SILICON.EPS_OX / params.Tox;
  const phiF = vT * Math.log(params.Na / SILICON.NI_300K);
  const gamma = Math.sqrt(2 * PHYSICS.Q * SILICON.EPS_SI * params.Na) / cOx;
  const body = gamma * (Math.sqrt(2 * phiF + vsb) - Math.sqrt(2 * phiF));
  const temp = MODEL.VTH_TEMP_COEFF * (params.temperature - MODEL.T_NOMINAL);
  return params.vth0 + body + temp; // TT corner → ΔV_corner = 0
}

describe('threshold voltage', () => {
  it('equals V_th0 plus body effect at zero V_SB (no temp/corner shift)', () => {
    const vth = computeThreshold(NMOS, 0).quantity.value;
    expect(vth).toBeCloseTo(expectedThresholdAt(0), 9);
  });

  it('increases with reverse body bias (body effect)', () => {
    const vth0 = computeThreshold(NMOS, 0).quantity.value;
    const vth1 = computeThreshold(NMOS, 1).quantity.value;
    expect(vth1).toBeGreaterThan(vth0);
  });

  it('decreases with rising temperature (negative temp coefficient)', () => {
    const hot = computeThreshold({ ...NMOS, temperature: 400 }, 0).quantity.value;
    const cold = computeThreshold({ ...NMOS, temperature: 300 }, 0).quantity.value;
    expect(hot).toBeLessThan(cold);
    expect(hot - cold).toBeCloseTo(MODEL.VTH_TEMP_COEFF * 100, 6);
  });
});

describe('region of operation', () => {
  it('is cutoff when V_GS < V_th', () => {
    const sol = solveMosfet(NMOS, { vgs: 0.2, vds: 1.0 });
    expect(sol.region).toBe('cutoff');
  });

  it('is triode when 0 < V_DS < V_ov', () => {
    const sol = solveMosfet(NMOS, { vgs: 1.2, vds: 0.1 });
    expect(sol.region).toBe('triode');
  });

  it('is saturation when V_DS >= V_ov', () => {
    const sol = solveMosfet(NMOS, { vgs: 1.2, vds: 1.5 });
    expect(sol.region).toBe('saturation');
  });
});

describe('drain current', () => {
  it('matches the square-law in saturation', () => {
    const vgs = 1.2;
    const vds = 1.5;
    const sol = solveMosfet(NMOS, { vgs, vds });

    const vT = (PHYSICS.K_BOLTZMANN * NMOS.temperature) / PHYSICS.Q;
    void vT;
    const cOx = SILICON.EPS_OX / NMOS.Tox;
    const mu = NMOS.mobility0 * (NMOS.temperature / MODEL.T_NOMINAL) ** MODEL.MOBILITY_TEMP_EXP;
    const kPrime = mu * cOx;
    const vov = vgs - expectedThresholdAt(0);
    const expected = 0.5 * kPrime * (NMOS.W / NMOS.L) * vov ** 2 * (1 + NMOS.lambda * vds);

    expect(sol.current.value).toBeCloseTo(expected, 12);
    expect(sol.region).toBe('saturation');
  });

  it('rises monotonically with V_GS in saturation', () => {
    const a = solveMosfet(NMOS, { vgs: 1.0, vds: 1.5 }).current.value;
    const b = solveMosfet(NMOS, { vgs: 1.4, vds: 1.5 }).current.value;
    expect(b).toBeGreaterThan(a);
  });

  it('leakage grows exponentially with temperature', () => {
    const cold = computeLeakage({ ...NMOS, temperature: 300 }, 0, 1.0).quantity.value;
    const hot = computeLeakage({ ...NMOS, temperature: 400 }, 0, 1.0).quantity.value;
    expect(hot).toBeGreaterThan(cold * 10);
  });
});

describe('process corners', () => {
  it('FF drives more current than SS at the same bias', () => {
    const bias = { vgs: 1.2, vds: 1.5 };
    const ff = solveMosfet({ ...NMOS, corner: 'FF' }, bias).current.value;
    const ss = solveMosfet({ ...NMOS, corner: 'SS' }, bias).current.value;
    expect(ff).toBeGreaterThan(ss);
  });
});

describe('explanation / computation parity (Risk R6 guard)', () => {
  it('explanation.result always equals the returned current', () => {
    const sol = solveMosfet(NMOS, { vgs: 1.2, vds: 1.5 });
    expect(sol.explanation.result.value).toBe(sol.current.value);
    expect(sol.explanation.regionOfOperation).toBe(sol.region);
  });

  it('substitutions reflect the actual inputs used', () => {
    const sol = solveMosfet(NMOS, { vgs: 1.2, vds: 1.5 });
    const symbols = sol.explanation.substitutions.map((s) => s.symbol);
    expect(symbols).toContain('V_ov');
    expect(symbols).toContain('V_DS');
  });

  it('carries a non-empty derivation tree', () => {
    const sol = solveMosfet(NMOS, { vgs: 1.2, vds: 1.5 });
    expect(sol.explanation.children.length).toBeGreaterThan(0);
  });
});
