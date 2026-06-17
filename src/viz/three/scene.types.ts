import type { RegionOfOperation } from '@/domain/primitives/mosfet';
import type { DeviceGeometry } from './geometry';

/** Per-transistor visual state — all values are readings of engine outputs. */
export interface TransistorVisual {
  readonly id: string;
  readonly type: 'nmos' | 'pmos';
  readonly region: RegionOfOperation;
  /** Carrier-flow activity 0..1 (from drain current). */
  readonly activity: number;
  /** Inversion-channel density 0..1 (from region + overdrive). */
  readonly channelDensity: number;
  /** Stable device-type color (resolved hex): NMOS emerald / PMOS coral. */
  readonly tint: string;
  /** Region accent color (resolved hex) for the label/badge. */
  readonly regionAccent: string;
}

/** Everything the WebGL stage needs to draw, computed by the card wrapper. */
export interface SceneData {
  readonly geometry: DeviceGeometry;
  readonly heat: number; // 0..1
  readonly voutIntensity: number; // 0..1
  readonly fieldStrength: number; // 0..1 (VDD)
  readonly leakageVisibility: number; // 0..1
  readonly pullUp: TransistorVisual; // PMOS, drawn on top
  readonly pullDown: TransistorVisual; // NMOS, drawn on bottom
  readonly reducedMotion: boolean;
}
