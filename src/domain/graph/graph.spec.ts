import type { SiUnit } from '@/domain/units';

/**
 * Renderer-agnostic description of a plot. The Recharts renderer and the
 * accessible data-table are BOTH generated from this one model, guaranteeing
 * the visual and the screen-reader representations never diverge (Risk R3).
 */
export interface GraphSpec {
  readonly id: string;
  readonly title: string;
  readonly x: GraphAxis;
  readonly y: GraphAxis;
  readonly series: readonly GraphSeries[];
  readonly annotations?: readonly GraphAnnotation[];
}

export interface GraphAxis {
  readonly label: string;
  readonly unit: SiUnit;
  /** Optional display scaling (value/scale shown to the user). */
  readonly scale?: number;
}

export interface GraphSeries {
  readonly id: string;
  readonly label: string;
  readonly points: readonly GraphPoint[];
  /** Token name resolved to a CSS variable by the renderer (not raw hex). */
  readonly colorToken?: string;
  /** Stroke opacity 0..1 — used to fan a family of curves by one varying bias. */
  readonly opacity?: number;
}

export interface GraphPoint {
  readonly x: number;
  readonly y: number;
}

export type GraphAnnotation =
  | { readonly kind: 'vline'; readonly x: number; readonly label: string; readonly colorToken?: string }
  | { readonly kind: 'point'; readonly x: number; readonly y: number; readonly label: string; readonly colorToken?: string }
  /** A shaded x-range marking an operating region (e.g. an inverter's
   *  cutoff / saturation / linear bands). `code` is the short on-chart tag,
   *  `label` the full description shown in the legend. */
  | { readonly kind: 'band'; readonly x0: number; readonly x1: number; readonly code: string; readonly label: string; readonly colorToken?: string };
