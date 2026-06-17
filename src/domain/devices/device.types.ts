import type { ParameterSchema, ParameterValues } from '@/domain/parameters/parameter.schema';
import type { StaticCmosNetlist, InputVector } from '@/domain/netlist/netlist';

/**
 * Declarative descriptor of a device. Adding a new device = adding one of these
 * (plus the netlist it builds). No engine, state, UI, or viz code changes —
 * those layers consume DeviceDefinition generically.
 */
export interface DeviceDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Concept id for the glossary. */
  readonly conceptId: string;
  /** Schema that drives the auto-generated parameter panel + validation. */
  readonly parameterSchema: ParameterSchema;
  /** Build the topology from concrete parameter values. */
  readonly buildNetlist: (values: ParameterValues) => StaticCmosNetlist;
  /** Input signal swept to produce the transfer curve. */
  readonly sweepInput: string;
  /**
   * Logic-input vectors used for worst-case metric extraction (leakage, drive).
   * For a single-input gate this is [{IN:false},{IN:true}].
   */
  readonly characteristicVectors: readonly InputVector[];
}
