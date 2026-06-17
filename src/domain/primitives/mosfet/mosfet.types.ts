/** Carrier type / device polarity. */
export type MosfetType = 'nmos' | 'pmos';

/**
 * Process corner: (NMOS, PMOS) speed pairing.
 *   TT typical, FF fast/fast, SS slow/slow, FS fast-N/slow-P, SF slow-N/fast-P.
 */
export type ProcessCorner = 'TT' | 'FF' | 'SS' | 'FS' | 'SF';

/** Operating region of a MOSFET. */
export type RegionOfOperation = 'cutoff' | 'triode' | 'saturation';

/**
 * Physical + electrical parameters of a single MOSFET, all in SI base units.
 *
 * NOTE ON SIGN CONVENTION: this model is written for NMOS-style positive
 * quantities. PMOS devices are evaluated by passing *source-referenced
 * magnitudes* (V_SG, V_SD, |V_th|); callers (e.g. the inverter solver) perform
 * that mapping. This keeps a single, well-tested current model for both types.
 */
export interface MosfetParameters {
  readonly type: MosfetType;
  /** Channel width W (m). */
  readonly W: number;
  /** Channel length L (m). */
  readonly L: number;
  /** Gate-oxide thickness T_ox (m). */
  readonly Tox: number;
  /** Channel (substrate) doping concentration N_a (1/m^3). */
  readonly Na: number;
  /** Nominal zero-bias threshold magnitude V_th0 (V), source-referenced. */
  readonly vth0: number;
  /** Carrier mobility at T_NOMINAL, µ0 (m^2/V·s). */
  readonly mobility0: number;
  /** Channel-length-modulation parameter λ (1/V). */
  readonly lambda: number;
  /** Subthreshold slope factor n (dimensionless, ~1.0–1.5). */
  readonly subthresholdSlopeFactor: number;
  /** Junction temperature (K). */
  readonly temperature: number;
  /** Process corner. */
  readonly corner: ProcessCorner;
}

/** Terminal bias, expressed as source-referenced magnitudes (see sign note). */
export interface MosfetBias {
  /** Gate-source voltage magnitude (V). */
  readonly vgs: number;
  /** Drain-source voltage magnitude (V). */
  readonly vds: number;
  /** Source-body voltage magnitude (V), ≥ 0. Defaults to 0. */
  readonly vsb?: number;
}
