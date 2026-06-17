import type { Quantity, SiUnit } from '@/domain/units';
import type { Explanation, Substitution } from '@/domain/explainability/explanation.types';

/**
 * The single source of truth for every formula in the platform.
 *
 * A formula is declared ONCE here with its canonical LaTeX, the concept it
 * teaches, its assumptions, and a pure numeric `fn`. Evaluating it via
 * `evaluate()` returns BOTH the numeric result and an Explanation whose
 * `result` and `substitutions` are derived from the very same call — making it
 * structurally impossible for the explanation to disagree with the math.
 *
 * This is how we satisfy three requirements at once:
 *   - "no duplicated formulas"      → one declaration per formula
 *   - "no hardcoded outputs"        → everything is computed from `fn`
 *   - "explainability metadata"     → emitted by the evaluator, always in sync
 */

/** Named, SI-valued inputs to a formula. Keys are the LaTeX symbols. */
export type Vars = Readonly<Record<string, Quantity>>;

export interface FormulaSpec<V extends Vars> {
  readonly id: string;
  readonly conceptId: string;
  readonly latex: string;
  readonly summary: string;
  readonly resultUnit: SiUnit;
  readonly assumptions?: readonly string[];
  /** Pure function: SI inputs → SI scalar result. No side effects. */
  readonly fn: (vars: V) => number;
}

export interface Evaluation {
  readonly quantity: Quantity;
  readonly explanation: Explanation;
}

export interface EvaluateOptions {
  /** Region of operation to annotate on the explanation, if relevant. */
  readonly regionOfOperation?: string;
  /** Sub-derivations this result was built from (for the explanation tree). */
  readonly children?: readonly Explanation[];
  /** Override the human summary for this particular evaluation. */
  readonly summary?: string;
}

/**
 * Define a formula. Returns a typed evaluator bound to the spec so call sites
 * cannot accidentally pass the wrong variable shape.
 */
export function defineFormula<V extends Vars>(spec: FormulaSpec<V>) {
  const evaluator = (vars: V, opts: EvaluateOptions = {}): Evaluation => {
    const value = spec.fn(vars);
    const result: Quantity = { value, unit: spec.resultUnit };

    const substitutions: Substitution[] = Object.entries(vars).map(
      ([symbol, quantity]) => ({ symbol, quantity }),
    );

    const explanation: Explanation = {
      formulaId: spec.id,
      conceptId: spec.conceptId,
      summary: opts.summary ?? spec.summary,
      latex: spec.latex,
      substitutions,
      result,
      assumptions: spec.assumptions ?? [],
      ...(opts.regionOfOperation !== undefined
        ? { regionOfOperation: opts.regionOfOperation }
        : {}),
      children: opts.children ?? [],
    };

    return { quantity: result, explanation };
  };

  return Object.assign(evaluator, { spec });
}

export type Formula<V extends Vars> = ReturnType<typeof defineFormula<V>>;
