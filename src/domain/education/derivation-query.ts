import type { Explanation } from '@/domain/explainability/explanation.types';
import type { SimulationResult } from '@/domain/simulation/result.types';

/**
 * Reads named intermediate/output values straight out of the derivation tree.
 * The structured-impact builder uses this so every reported effect is a MEASURED
 * value from the engine's own computation — not a narrative guess.
 */
export function findFormulaValue(result: SimulationResult, formulaId: string): number | null {
  for (const root of roots(result)) {
    const found = search(root, formulaId);
    if (found !== null) return found;
  }
  return null;
}

function roots(result: SimulationResult): Explanation[] {
  const m = result.metrics;
  return [
    result.operatingPoint.outputVoltage.explanation,
    result.operatingPoint.current.explanation,
    m.staticPower.explanation,
    m.dynamicPower.explanation,
    m.totalPower.explanation,
    m.leakage.explanation,
    m.propagationDelay.explanation,
    m.switchingThreshold.explanation,
  ];
}

function search(node: Explanation, formulaId: string): number | null {
  if (node.formulaId === formulaId) return node.result.value;
  for (const child of node.children) {
    const found = search(child, formulaId);
    if (found !== null) return found;
  }
  return null;
}
