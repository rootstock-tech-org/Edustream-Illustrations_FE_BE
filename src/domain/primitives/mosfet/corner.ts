import type { MosfetType, ProcessCorner } from './mosfet.types';

/**
 * Process-corner adjustment applied to a device of a given type.
 *
 * Corners model fabrication spread. A "fast" device has a *lower* threshold and
 * *higher* mobility (drives more current); "slow" is the opposite. FS/SF skew
 * NMOS and PMOS in opposite directions, which is exactly what stresses ratioed
 * logic and is therefore valuable to teach.
 */
export interface CornerAdjustment {
  /** Additive threshold shift ΔV_th (V). */
  readonly deltaVth: number;
  /** Multiplicative mobility scale. */
  readonly mobilityScale: number;
}

const FAST: CornerAdjustment = { deltaVth: -0.05, mobilityScale: 1.1 };
const SLOW: CornerAdjustment = { deltaVth: +0.05, mobilityScale: 0.9 };
const TYPICAL: CornerAdjustment = { deltaVth: 0, mobilityScale: 1.0 };

export function cornerAdjustment(
  corner: ProcessCorner,
  type: MosfetType,
): CornerAdjustment {
  switch (corner) {
    case 'TT':
      return TYPICAL;
    case 'FF':
      return FAST;
    case 'SS':
      return SLOW;
    case 'FS': // fast NMOS, slow PMOS
      return type === 'nmos' ? FAST : SLOW;
    case 'SF': // slow NMOS, fast PMOS
      return type === 'nmos' ? SLOW : FAST;
  }
}
