import type { Quantity } from '@/domain/units';

/**
 * The Explanation tree is a FIRST-CLASS OUTPUT of every computation, because
 * learning is the product. It is not prose written alongside the math — it is
 * emitted BY the evaluator (see `formula.registry.ts`), so the explanation can
 * never drift from the number it describes (Risk R6).
 *
 * The tree mirrors the computation: a result's `children` are the sub-results
 * it was derived from, enabling progressive disclosure in the UI and providing
 * the structured grounding context for the AI tutor.
 */
export interface Explanation {
  /** Stable id of the formula that produced this result. */
  readonly formulaId: string;
  /** Links to the concept glossary for conceptual prose. */
  readonly conceptId: string;
  /** One-line human summary. */
  readonly summary: string;
  /** Canonical LaTeX of the formula. */
  readonly latex: string;
  /** The exact variable values substituted into the formula. */
  readonly substitutions: readonly Substitution[];
  /** The computed result — identical to what the engine used downstream. */
  readonly result: Quantity;
  /** Explicit modelling assumptions/limitations (honesty for education). */
  readonly assumptions: readonly string[];
  /** For device-level results, the region of operation if applicable. */
  readonly regionOfOperation?: string;
  /** Sub-derivations this result depends on. */
  readonly children: readonly Explanation[];
}

export interface Substitution {
  /** Symbol as it appears in the formula, e.g. 'V_GS', 'k\'', 'C_ox'. */
  readonly symbol: string;
  /** The value substituted, in SI units. */
  readonly quantity: Quantity;
}
