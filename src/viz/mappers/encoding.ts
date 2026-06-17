import type { RegionOfOperation } from '@/domain/primitives/mosfet';

/**
 * Visual encodings: pure functions mapping simulation quantities to visual
 * properties. They live in viz/ (NOT domain/) because they are presentation
 * decisions, not physics. Keeping them here means the science never depends on
 * how we choose to draw it.
 */

/** Map a node voltage (0..VDD) to an emissive intensity 0..1. */
export function voltageToIntensity(voltage: number, vdd: number): number {
  if (vdd <= 0) return 0;
  return clamp01(voltage / vdd);
}

/** Map a drain current to a 0..1 activity level using a log scale (wide range). */
export function currentToActivity(current: number, referenceAmps = 1e-4): number {
  const a = Math.abs(current);
  if (a <= 0) return 0;
  const decades = 4; // span ~4 decades below the reference
  const norm = (Math.log10(a) - Math.log10(referenceAmps) + decades) / decades;
  return clamp01(norm);
}

/**
 * Inversion-channel density 0..1 from region + gate overdrive. Cutoff fades to
 * zero; near threshold (small |overdrive|) a weak channel appears; strong
 * inversion saturates to 1. Purely a visual reading of engine state.
 */
export function channelDensity(region: RegionOfOperation, overdriveVolts: number, activity: number): number {
  if (region === 'cutoff') {
    // overdrive is negative in cutoff; ramp 0→0.35 as it approaches 0.
    return clamp01(1 + overdriveVolts / 0.3) * 0.35;
  }
  return clamp01(0.6 + 0.4 * activity);
}

/** Supply-driven field strength 0..1 (drives glow/bloom radius). */
export function fieldStrength(vdd: number, maxVdd = 3.3): number {
  return clamp01(vdd / maxVdd);
}

/** Leakage path visibility 0..1 (log-scaled; only shows when meaningful). */
export function leakageVisibility(leakageAmps: number): number {
  return currentToActivity(leakageAmps, 1e-7);
}

/** Temperature heat level 0..1 across the operating range. */
export function heatLevel(temperatureK: number, minK = 233, maxK = 423): number {
  return clamp01((temperatureK - minK) / (maxK - minK));
}

/** Region → CSS color token (resolved by the renderer). */
export function regionColorToken(region: RegionOfOperation): string {
  switch (region) {
    case 'saturation':
      return 'accent';
    case 'triode':
      return 'nmos';
    case 'cutoff':
      return 'ink-muted';
  }
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
