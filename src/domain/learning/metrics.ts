import type { Quantity } from '@/domain/units';
import type { SimulationResult } from '@/domain/simulation/result.types';

/** Metrics a challenge can target — each maps to an existing engine output. */
export type MetricKey =
  | 'drainCurrent'
  | 'totalPower'
  | 'staticPower'
  | 'dynamicPower'
  | 'leakage'
  | 'propagationDelay'
  | 'switchingThreshold';

export const METRIC_LABEL: Record<MetricKey, string> = {
  drainCurrent: 'Through Current',
  totalPower: 'Total Power',
  staticPower: 'Static Power',
  dynamicPower: 'Dynamic Power',
  leakage: 'Leakage',
  propagationDelay: 'Propagation Delay',
  switchingThreshold: 'Switching Threshold',
};

/** Read a metric's quantity from a result. No computation — pure lookup. */
export function readMetric(result: SimulationResult, key: MetricKey): Quantity {
  switch (key) {
    case 'drainCurrent':
      return result.operatingPoint.current.quantity;
    case 'totalPower':
      return result.metrics.totalPower.quantity;
    case 'staticPower':
      return result.metrics.staticPower.quantity;
    case 'dynamicPower':
      return result.metrics.dynamicPower.quantity;
    case 'leakage':
      return result.metrics.leakage.quantity;
    case 'propagationDelay':
      return result.metrics.propagationDelay.quantity;
    case 'switchingThreshold':
      return result.metrics.switchingThreshold.quantity;
  }
}
