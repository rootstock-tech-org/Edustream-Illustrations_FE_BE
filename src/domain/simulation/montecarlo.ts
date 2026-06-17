import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import { getDevice } from '@/domain/devices/registry';
import { AnalyticalEngine } from './analytical/analytical.engine';

/**
 * Educational Monte Carlo over process variation. It reuses the SAME analytical
 * engine — sampling threshold, channel length, and oxide thickness around the
 * chosen operating point (the corner sets the mean; this adds the random
 * spread) — and collects the resulting metric distributions. Each run uses a
 * 2-point sweep because only the metrics are needed, keeping samples cheap.
 *
 * Deterministic (seeded) so runs are reproducible and testable. This is a
 * teaching model, not industrial signoff.
 */
export interface MonteCarloSample {
  readonly propagationDelay: number;
  readonly leakage: number;
  readonly switchingThreshold: number;
}

const engine = new AnalyticalEngine();

export function runMonteCarlo(
  deviceId: string,
  baseValues: ParameterValues,
  count: number,
  seed: number,
): MonteCarloSample[] {
  const device = getDevice(deviceId);
  const rand = mulberry32(seed);
  const gauss = gaussian(rand);

  const baseVth = Number(baseValues.Vth);
  const baseL = Number(baseValues.L);
  const baseTox = Number(baseValues.Tox);

  // Process spreads (1σ): threshold ~30 mV, length ~6%, oxide ~3%.
  const sVth = Math.max(0.02, 0.05 * baseVth);
  const sL = 0.06 * baseL;
  const sTox = 0.03 * baseTox;

  const out: MonteCarloSample[] = [];
  for (let i = 0; i < count; i++) {
    const values: ParameterValues = {
      ...baseValues,
      Vth: clamp(baseVth + gauss() * sVth, 0.15, 0.85),
      L: clamp(baseL + gauss() * sL, 20e-9, 1e-6),
      Tox: clamp(baseTox + gauss() * sTox, 1e-9, 20e-9),
    };
    const r = engine.simulate({ device, values, options: { sweepPoints: 2 } });
    out.push({
      propagationDelay: r.metrics.propagationDelay.quantity.value,
      leakage: r.metrics.leakage.quantity.value,
      switchingThreshold: r.metrics.switchingThreshold.quantity.value,
    });
  }
  return out;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Deterministic PRNG (mulberry32) — reproducible, no Math.random. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal samples via Box–Muller, driven by a uniform PRNG. */
function gaussian(rand: () => number): () => number {
  return () => {
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
}
