import type { Quantity } from '@/domain/units';
import type { RegionOfOperation, MosfetType } from '@/domain/primitives/mosfet';
import type { ExplainedQuantity, SimulationResult } from '@/domain/simulation/result.types';

/** Operating point of a single transistor at the chosen V_GS / V_DS. */
export interface TransistorOperatingPoint {
  /** Drain current I_D (magnitude). */
  readonly drainCurrent: ExplainedQuantity;
  /** Transconductance gₘ = ∂I_D/∂V_GS. */
  readonly transconductance: ExplainedQuantity;
  /** Effective threshold V_th used at this bias. */
  readonly threshold: ExplainedQuantity;
  /** Gate overdrive V_GS − V_th (negative in cutoff). */
  readonly overdrive: Quantity;
  readonly region: RegionOfOperation;
  /** The biases that produced this point (source-referenced magnitudes). */
  readonly vgs: number;
  readonly vds: number;
}

export interface IVPoint {
  readonly x: number;
  readonly y: number;
}

/** One I–V trace (e.g. I_D–V_DS at a fixed V_GS). */
export interface IVCurve {
  readonly id: string;
  readonly label: string;
  /** The fixed gate bias for an output-characteristic family member. */
  readonly vgs?: number;
  readonly points: readonly IVPoint[];
}

/** Complete result of simulating a single transistor. */
export interface TransistorResult {
  readonly kind: 'transistor';
  readonly deviceId: string;
  readonly engineId: string;
  readonly type: MosfetType;
  readonly operatingPoint: TransistorOperatingPoint;
  /** Output characteristics: I_D–V_DS, one curve per V_GS. */
  readonly idVds: readonly IVCurve[];
  /** Transfer characteristic: I_D–V_GS at the operating V_DS. */
  readonly idVgs: IVCurve;
}

/** Either device flavour's result. Consumers narrow on `kind`. */
export type AnyResult = SimulationResult | TransistorResult;
