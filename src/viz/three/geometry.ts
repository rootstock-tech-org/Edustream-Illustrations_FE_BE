/**
 * Maps device parameters to 3D geometry dimensions. These are PRESENTATION
 * encoders (how big to draw things), not physics — they live in viz/, take SI
 * inputs, and never feed back into the simulation. Wider W → wider body; longer
 * L → longer gate/channel; thicker Tox → larger gate↔channel gap.
 */
export interface DeviceGeometry {
  /** Transistor body / channel width (scene units). */
  readonly bodyWidth: number;
  /** Channel + gate length along the transport direction (scene units). */
  readonly channelLength: number;
  /** Gate-to-channel oxide gap (scene units). */
  readonly oxideGap: number;
}

export function deviceGeometry(W: number, L: number, Tox: number): DeviceGeometry {
  return {
    bodyWidth: lerp(0.7, 2.4, logNorm(W, 50e-9, 5e-6)),
    channelLength: lerp(0.55, 1.7, logNorm(L, 20e-9, 1e-6)),
    oxideGap: lerp(0.05, 0.3, linNorm(Tox, 1e-9, 20e-9)),
  };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp01(t);
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const linNorm = (v: number, min: number, max: number) => (v - min) / (max - min);
const logNorm = (v: number, min: number, max: number) =>
  (Math.log10(Math.max(v, min)) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
