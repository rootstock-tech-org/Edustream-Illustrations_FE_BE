import type { DeviceDefinition } from '@/domain/devices/device.types';
import type { ParameterValues } from '@/domain/parameters/parameter.schema';
import type { SimulationResult } from './result.types';

export interface SimulationRequest {
  readonly device: DeviceDefinition;
  readonly values: ParameterValues;
  readonly options?: {
    /** Number of points in the transfer-curve sweep. */
    readonly sweepPoints?: number;
  };
}

/**
 * Strategy contract for all simulation backends. The MVP `AnalyticalEngine`
 * implements it with closed-form models; a future SPICE/WASM core implements
 * the SAME interface so the rest of the app is engine-agnostic.
 */
export interface SimulationEngine {
  readonly id: string;
  simulate(request: SimulationRequest): SimulationResult;
}
