/**
 * Concept glossary: conceptual prose decoupled from the math. Referenced by
 * `conceptId` from formulas, parameters, and devices, and used to ground the AI
 * tutor so it explains established concepts rather than inventing physics.
 */
export interface Concept {
  readonly id: string;
  readonly term: string;
  readonly summary: string;
}

const CONCEPTS: readonly Concept[] = [
  { id: 'cmos-inverter', term: 'CMOS Inverter', summary: 'Complementary NMOS/PMOS pair: the input drives both gates; exactly one network conducts in steady state, giving rail-to-rail output and near-zero static current.' },
  { id: 'nand-gate', term: 'NAND Gate', summary: 'Series NMOS pull-down and parallel PMOS pull-up. Output is low only when all inputs are high; the series stack reduces pull-down drive versus an inverter.' },
  { id: 'nor-gate', term: 'NOR Gate', summary: 'Parallel NMOS pull-down and series PMOS pull-up. Output is high only when all inputs are low; the series pull-up stack reduces pull-up drive versus an inverter.' },
  { id: 'and-gate', term: 'AND Gate', summary: 'Static CMOS cannot invert twice in one stage, so AND = NAND followed by an inverter. Stage 1 (series NMOS / parallel PMOS) computes NOT(A·B); stage 2 inverts it back to A·B.' },
  { id: 'or-gate', term: 'OR Gate', summary: 'OR = NOR followed by an inverter. Stage 1 (parallel NMOS / series PMOS) computes NOT(A+B); stage 2 inverts it back to A+B.' },
  { id: 'threshold-voltage', term: 'Threshold Voltage', summary: 'Gate-source voltage at which a conducting channel forms. Raised by reverse body bias and substrate doping; falls slightly with temperature.' },
  { id: 'saturation-region', term: 'Saturation Region', summary: 'V_DS ≥ V_GS − V_th: the channel pinches off and current depends mainly on gate overdrive, only weakly on V_DS.' },
  { id: 'triode-region', term: 'Triode Region', summary: 'V_DS < V_GS − V_th: the channel behaves like a voltage-controlled resistor.' },
  { id: 'subthreshold-conduction', term: 'Subthreshold Leakage', summary: 'Below threshold the current is exponential in gate voltage. It sets static leakage and rises sharply with temperature.' },
  { id: 'switching-threshold', term: 'Switching Threshold (V_M)', summary: 'The input where output equals input — the high-gain trip point of the transfer characteristic, set by the NMOS/PMOS strength ratio.' },
  { id: 'propagation-delay', term: 'Propagation Delay', summary: 'Time to drive the load through half the supply; grows with load capacitance and shrinks with on-current.' },
  { id: 'dynamic-power', term: 'Dynamic Power', summary: 'Power to charge/discharge the load each cycle, ∝ C·V_DD²·f. Dominates at high activity.' },
  { id: 'process-corner', term: 'Process Corner', summary: 'Fabrication spread. Fast corners lower threshold and raise mobility; FS/SF skew NMOS and PMOS oppositely, stressing ratioed logic.' },
];

const BY_ID = new Map(CONCEPTS.map((c) => [c.id, c]));

export const getConcept = (id: string): Concept | undefined => BY_ID.get(id);
export const listConcepts = (): readonly Concept[] => CONCEPTS;
