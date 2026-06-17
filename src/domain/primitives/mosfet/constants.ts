/**
 * Fundamental physical constants and silicon material properties (SI units).
 * Single source — no formula re-declares these.
 */
export const PHYSICS = {
  /** Elementary charge (C). */
  Q: 1.602176634e-19,
  /** Boltzmann constant (J/K). */
  K_BOLTZMANN: 1.380649e-23,
  /** Vacuum permittivity (F/m). */
  EPS_0: 8.8541878128e-12,
} as const;

export const SILICON = {
  /** Relative permittivity of silicon. */
  EPS_R_SI: 11.7,
  /** Relative permittivity of SiO2 gate oxide. */
  EPS_R_OX: 3.9,
  /** Intrinsic carrier concentration of Si at 300 K (1/m^3). */
  NI_300K: 1.0e16,
  /** Permittivity of silicon (F/m). */
  get EPS_SI() {
    return this.EPS_R_SI * PHYSICS.EPS_0;
  },
  /** Permittivity of SiO2 (F/m). */
  get EPS_OX() {
    return this.EPS_R_OX * PHYSICS.EPS_0;
  },
} as const;

export const MODEL = {
  /** Nominal/reference temperature for all temperature-dependent models (K). */
  T_NOMINAL: 300,
  /** Threshold voltage temperature coefficient (V/K), typical short-channel. */
  VTH_TEMP_COEFF: -2.0e-3,
  /** Mobility temperature exponent: µ(T) = µ0·(T/T0)^EXP. */
  MOBILITY_TEMP_EXP: -1.5,
} as const;
