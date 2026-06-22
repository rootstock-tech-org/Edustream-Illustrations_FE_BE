import type { MosfetParameters, MosfetType } from '@/domain/primitives/mosfet';
import type {
  ParameterValues,
  ParameterSchema,
  ParameterDescriptor,
} from '@/domain/parameters/parameter.schema';
import { standardCmosSchema, PARAM } from './shared';

/**
 * Parameter vocabulary for the single-transistor explorers. The product spec
 * exposes exactly: V_GS, V_DS, W, L, T_ox and temperature. Everything else
 * (doping, nominal V_th0, corner) is held at a sensible default — the explorer
 * teaches device behaviour, not process selection (that lives in the gates).
 */
export const TPARAM = {
  VGS: 'VGS',
  VDS: 'VDS',
  W: PARAM.W,
  L: PARAM.L,
  Tox: PARAM.Tox,
  Temperature: PARAM.Temperature,
} as const;

/** Per-type model constants — same source as the gates (single vocabulary). */
const TYPE_CONSTANTS: Record<MosfetType, { mobility0: number; lambda: number; n: number }> = {
  nmos: { mobility0: 0.045, lambda: 0.05, n: 1.3 }, // ~450 cm²/V·s electrons
  pmos: { mobility0: 0.02, lambda: 0.05, n: 1.3 }, //  ~200 cm²/V·s holes
};

/** Internal process defaults (not user-facing in the explorer). */
const INTERNAL = { Na: 1e23, vth0: 0.4, corner: 'TT' as const };

const num = (values: ParameterValues, key: string): number => {
  const v = values[key];
  return typeof v === 'number' ? v : Number(v);
};

/** Pull an existing descriptor out of the shared schema so W/L/Tox/T stay DRY. */
const shared = (key: string): ParameterDescriptor =>
  standardCmosSchema.groups.flatMap((g) => g.parameters).find((p) => p.key === key)!;

/**
 * The schema for an NMOS/PMOS explorer: terminal biases + geometry + oxide +
 * temperature. W/L/Tox/T descriptors are reused verbatim from the gate schema;
 * only the bias knobs are new.
 */
export const transistorSchema: ParameterSchema = {
  groups: [
    {
      title: 'Terminal Bias',
      parameters: [
        { key: TPARAM.VGS, label: 'Gate–Source Voltage (V_GS)', unit: 'V', conceptId: 'threshold-voltage',
          kind: { type: 'continuous', min: 0, max: 1.8, default: 1.0, step: 0.01, display: { symbol: 'V', scale: 1 } } },
        { key: TPARAM.VDS, label: 'Drain–Source Voltage (V_DS)', unit: 'V', conceptId: 'transfer-characteristic',
          kind: { type: 'continuous', min: 0, max: 1.8, default: 1.0, step: 0.01, display: { symbol: 'V', scale: 1 } } },
      ],
    },
    {
      title: 'Geometry',
      parameters: [shared(PARAM.W), shared(PARAM.L), shared(PARAM.Tox)],
    },
    {
      title: 'Environment',
      parameters: [shared(PARAM.Temperature)],
    },
  ],
};

/** Build SI MOSFET parameters from the explorer's exposed values. */
export function buildTransistorParams(values: ParameterValues, type: MosfetType): MosfetParameters {
  const c = TYPE_CONSTANTS[type];
  return {
    type,
    W: num(values, TPARAM.W),
    L: num(values, TPARAM.L),
    Tox: num(values, TPARAM.Tox),
    Na: INTERNAL.Na,
    vth0: INTERNAL.vth0, // magnitude; PMOS interpreted as |V_th|
    mobility0: c.mobility0,
    lambda: c.lambda,
    subthresholdSlopeFactor: c.n,
    temperature: num(values, TPARAM.Temperature),
    corner: INTERNAL.corner,
  };
}
