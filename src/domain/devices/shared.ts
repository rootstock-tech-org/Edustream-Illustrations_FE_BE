import type { MosfetParameters, MosfetType, ProcessCorner } from '@/domain/primitives/mosfet';
import type { ParameterValues, ParameterSchema } from '@/domain/parameters/parameter.schema';

/**
 * Standard parameter keys shared by all static-CMOS devices, and the helper
 * that turns user-facing values into per-transistor SI parameters. Centralised
 * so every device speaks the same electrical vocabulary.
 */
export const PARAM = {
  L: 'L',
  W: 'W',
  Tox: 'Tox',
  VDD: 'VDD',
  Na: 'Na',
  Vth: 'Vth',
  Cload: 'Cload',
  Temperature: 'T',
  Vin: 'Vin',
  Corner: 'corner',
} as const;

/**
 * Per-type model constants that are NOT user inputs (kept out of the schema to
 * match the product's input list). Electron mobility ~2× hole mobility is the
 * canonical reason PMOS must be sized wider — a key teaching point.
 */
const TYPE_CONSTANTS: Record<MosfetType, { mobility0: number; lambda: number; n: number }> = {
  nmos: { mobility0: 0.045, lambda: 0.05, n: 1.3 }, // ~450 cm²/V·s electrons
  pmos: { mobility0: 0.02, lambda: 0.05, n: 1.3 }, //  ~200 cm²/V·s holes
};

const num = (values: ParameterValues, key: string): number => {
  const v = values[key];
  return typeof v === 'number' ? v : Number(v);
};

export const vdd = (values: ParameterValues): number => num(values, PARAM.VDD);
export const cload = (values: ParameterValues): number => num(values, PARAM.Cload);
export const vin = (values: ParameterValues): number => num(values, PARAM.Vin);

/**
 * The standard parameter schema shared by every static-CMOS device. Declared
 * once here so the inverter, NAND, NOR, … all expose the same vetted inputs
 * with no duplication. Devices that need extra knobs can compose onto this.
 */
export const standardCmosSchema: ParameterSchema = {
  groups: [
    {
      title: 'Geometry',
      parameters: [
        { key: PARAM.L, label: 'Gate Length (L)', unit: 'm', conceptId: 'channel-length',
          kind: { type: 'continuous', min: 20e-9, max: 1e-6, default: 180e-9, step: 5e-9, display: { symbol: 'nm', scale: 1e-9 } } },
        { key: PARAM.W, label: 'Gate Width (W)', unit: 'm', conceptId: 'channel-width',
          kind: { type: 'continuous', min: 50e-9, max: 5e-6, default: 1e-6, step: 50e-9, display: { symbol: 'nm', scale: 1e-9 } } },
        { key: PARAM.Tox, label: 'Oxide Thickness (Tox)', unit: 'm', conceptId: 'oxide-capacitance',
          kind: { type: 'continuous', min: 1e-9, max: 20e-9, default: 4e-9, step: 0.5e-9, display: { symbol: 'nm', scale: 1e-9 } } },
      ],
    },
    {
      title: 'Process',
      parameters: [
        { key: PARAM.Na, label: 'Channel Doping (Na)', unit: '1/m^3', conceptId: 'doping',
          kind: { type: 'continuous', min: 1e21, max: 1e24, default: 1e23, step: 1e21, logScale: true, display: { symbol: 'm⁻³', scale: 1 } } },
        { key: PARAM.Vth, label: 'Threshold Voltage (Vth0)', unit: 'V', conceptId: 'threshold-voltage',
          kind: { type: 'continuous', min: 0.2, max: 0.8, default: 0.4, step: 0.01, display: { symbol: 'V', scale: 1 } } },
        { key: PARAM.Corner, label: 'Process Corner', unit: '1', conceptId: 'process-corner',
          kind: { type: 'enum', default: 'TT', options: [
            { value: 'TT', label: 'Typical (TT)' },
            { value: 'FF', label: 'Fast (FF)' },
            { value: 'SS', label: 'Slow (SS)' },
            { value: 'FS', label: 'Fast-N / Slow-P (FS)' },
            { value: 'SF', label: 'Slow-N / Fast-P (SF)' },
          ] } },
      ],
    },
    {
      title: 'Operating Conditions',
      parameters: [
        { key: PARAM.VDD, label: 'Supply Voltage (VDD)', unit: 'V', conceptId: 'supply-voltage',
          kind: { type: 'continuous', min: 0.4, max: 3.3, default: 1.8, step: 0.05, display: { symbol: 'V', scale: 1 } } },
        { key: PARAM.Vin, label: 'Input Voltage (Vin)', unit: 'V', conceptId: 'transfer-characteristic',
          kind: { type: 'continuous', min: 0, max: 3.3, default: 0.9, step: 0.01, display: { symbol: 'V', scale: 1 } } },
        { key: PARAM.Cload, label: 'Load Capacitance (CL)', unit: 'F', conceptId: 'load-capacitance',
          kind: { type: 'continuous', min: 1e-15, max: 1e-12, default: 10e-15, step: 1e-15, display: { symbol: 'fF', scale: 1e-15 } } },
        { key: PARAM.Temperature, label: 'Temperature (T)', unit: 'K', conceptId: 'temperature',
          kind: { type: 'continuous', min: 233, max: 423, default: 300, step: 1, display: { symbol: 'K', scale: 1 } } },
      ],
    },
  ],
};

/** Build SI MOSFET parameters of the given type from shared user values. */
export function buildMosfetParams(values: ParameterValues, type: MosfetType): MosfetParameters {
  const consts = TYPE_CONSTANTS[type];
  return {
    type,
    W: num(values, PARAM.W),
    L: num(values, PARAM.L),
    Tox: num(values, PARAM.Tox),
    Na: num(values, PARAM.Na),
    vth0: num(values, PARAM.Vth), // magnitude; PMOS interpreted as |V_th|
    mobility0: consts.mobility0,
    lambda: consts.lambda,
    subthresholdSlopeFactor: consts.n,
    temperature: num(values, PARAM.Temperature),
    corner: (values[PARAM.Corner] as ProcessCorner) ?? 'TT',
  };
}
