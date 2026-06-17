import type { Quantity } from '@/domain/units';
import type { Explanation } from '@/domain/explainability/explanation.types';
import type { RegionOfOperation, MosfetType } from '@/domain/primitives/mosfet';

/** A value paired with the derivation that produced it. */
export interface ExplainedQuantity {
  readonly quantity: Quantity;
  readonly explanation: Explanation;
}

/** Per-transistor state at the operating point. */
export interface TransistorState {
  readonly id: string;
  readonly type: MosfetType;
  readonly region: RegionOfOperation;
  readonly current: Quantity;
  readonly threshold: Quantity;
  /** Gate overdrive V_GS − V_th (V); negative in cutoff. */
  readonly overdrive: Quantity;
}

/** The steady-state solution at the user's chosen input voltage. */
export interface OperatingPoint {
  readonly inputVoltage: Quantity;
  readonly outputVoltage: ExplainedQuantity;
  /** Through / short-circuit current at the output node. */
  readonly current: ExplainedQuantity;
  readonly transistors: readonly TransistorState[];
}

/** Scalar device characteristics. */
export interface DeviceMetrics {
  readonly staticPower: ExplainedQuantity;
  readonly dynamicPower: ExplainedQuantity;
  readonly totalPower: ExplainedQuantity;
  readonly leakage: ExplainedQuantity;
  readonly propagationDelay: ExplainedQuantity;
  /** Switching threshold V_M (where Vout = Vin). */
  readonly switchingThreshold: ExplainedQuantity;
}

/** One sampled point of a sweep. Plain numbers — transport-friendly. */
export interface SweepPoint {
  readonly vin: number;
  readonly vout: number;
  readonly current: number;
}

export interface TransferCurve {
  readonly points: readonly SweepPoint[];
}

/** The complete result of simulating a device at a parameter set. */
export interface SimulationResult {
  readonly deviceId: string;
  readonly engineId: string;
  readonly operatingPoint: OperatingPoint;
  readonly metrics: DeviceMetrics;
  readonly transferCurve: TransferCurve;
}
