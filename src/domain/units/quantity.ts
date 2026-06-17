/**
 * A physical quantity carried through the domain in SI base units.
 *
 * Design: the engine computes exclusively in SI (metres, volts, amps, farads,
 * kelvin). Human-facing units (nm, µm, µA, fF…) are a *formatting* concern and
 * live in `format.ts` — never in the math. This keeps every formula evaluator
 * unit-consistent and prevents the classic "mixed nm and m" simulation bug.
 */
export interface Quantity {
  /** Magnitude in the SI base unit named by `unit`. */
  readonly value: number;
  /** SI base unit symbol, e.g. 'V', 'A', 'F', 'm', 'K', '1' (dimensionless). */
  readonly unit: SiUnit;
}

export type SiUnit =
  | '1' // dimensionless
  | 'V' // volt
  | 'A' // ampere
  | 'A/V^2' // transconductance parameter k'
  | 'F' // farad
  | 'F/m^2' // capacitance per area
  | 'm' // metre
  | 'm^2/V·s' // mobility
  | 'K' // kelvin
  | 'W' // watt
  | 's' // second
  | '1/m^3' // doping concentration
  | '1/V'; // channel-length modulation

export const quantity = (value: number, unit: SiUnit): Quantity => ({ value, unit });

/** Dimensionless helper. */
export const scalar = (value: number): Quantity => ({ value, unit: '1' });
