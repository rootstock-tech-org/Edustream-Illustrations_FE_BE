import type { ParameterSchema, ParameterValues } from '@/domain/parameters/parameter.schema';
import type { StaticCmosNetlist, InputVector } from '@/domain/netlist/netlist';
import type { MosfetParameters, MosfetType } from '@/domain/primitives/mosfet';

/**
 * Declarative descriptor of a GATE device (a static-CMOS network solved for an
 * output node). Adding a new gate = adding one of these (plus the netlist it
 * builds). No engine, state, UI, or viz code changes — those layers consume the
 * definition generically.
 */
export interface DeviceDefinition {
  readonly kind: 'gate';
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Concept id for the glossary. */
  readonly conceptId: string;
  /** Hidden from the primary device navigation (implementation kept). */
  readonly hidden?: boolean;
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

/**
 * Declarative descriptor of a SINGLE-TRANSISTOR device (one MOSFET biased
 * directly by V_GS / V_DS — no circuit, no output node). This is the
 * foundational teaching device: students explore one transistor's I–V family,
 * region of operation, threshold, and transconductance BEFORE meeting any gate.
 *
 * It reuses the exact same MOSFET model (`solveMosfet`) as the gates — only the
 * surrounding circuit differs — so the physics is single-source.
 */
export interface TransistorDevice {
  readonly kind: 'transistor';
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly conceptId: string;
  readonly hidden?: boolean;
  readonly parameterSchema: ParameterSchema;
  /** Carrier polarity of the device under study. */
  readonly transistorType: MosfetType;
  /** Build SI MOSFET parameters from the exposed user values. */
  readonly buildParams: (values: ParameterValues) => MosfetParameters;
  /** Parameter keys holding the source-referenced terminal biases. */
  readonly vgsKey: string;
  readonly vdsKey: string;
}

/** Either device flavour. Consumers narrow on `kind`. */
export type AnyDevice = DeviceDefinition | TransistorDevice;
