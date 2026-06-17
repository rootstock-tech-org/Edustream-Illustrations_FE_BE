import type { Quantity, SiUnit } from '@/domain/units';
import type { Explanation } from './explanation.types';

/**
 * Builds an Explanation for a value obtained by numerical root-finding rather
 * than a closed-form formula (e.g. the switching threshold V_M, or the leakage
 * current at a static operating point). Keeps such values inside the same
 * explanation structure so the UI and tutor treat them uniformly.
 */
export function measuredExplanation(args: {
  value: number;
  unit: SiUnit;
  conceptId: string;
  summary: string;
  method: string;
  children?: readonly Explanation[];
}): { quantity: Quantity; explanation: Explanation } {
  const quantity: Quantity = { value: args.value, unit: args.unit };
  return {
    quantity,
    explanation: {
      formulaId: 'measured-quantity',
      conceptId: args.conceptId,
      summary: args.summary,
      latex: '\\text{(found numerically)}',
      substitutions: [],
      result: quantity,
      assumptions: [args.method],
      children: args.children ?? [],
    },
  };
}
