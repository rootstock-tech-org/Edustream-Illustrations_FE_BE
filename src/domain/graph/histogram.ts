/**
 * Pure histogram binning + yield computation for the Monte Carlo explorer.
 * Presentation-adjacent but math-only and engine-agnostic, so it lives in the
 * domain and is unit-testable.
 */
export interface HistogramBin {
  readonly x0: number;
  readonly x1: number;
  readonly count: number;
}

export interface Histogram {
  readonly bins: readonly HistogramBin[];
  readonly min: number;
  readonly max: number;
  readonly maxCount: number;
  readonly mean: number;
  readonly std: number;
}

export function histogram(values: readonly number[], binCount = 24): Histogram {
  if (values.length === 0) {
    return { bins: [], min: 0, max: 0, maxCount: 0, mean: 0, std: 0 };
  }
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const mean = sum / values.length;
  let varSum = 0;
  for (const v of values) varSum += (v - mean) ** 2;
  const std = Math.sqrt(varSum / values.length);

  const width = (max - min) / binCount || 1;
  const counts = new Array<number>(binCount).fill(0);
  for (const v of values) {
    const idx = Math.min(binCount - 1, Math.floor((v - min) / width));
    counts[idx]! += 1;
  }
  const bins: HistogramBin[] = counts.map((count, i) => ({ x0: min + i * width, x1: min + (i + 1) * width, count }));
  const maxCount = counts.reduce((m, c) => Math.max(m, c), 0);
  return { bins, min, max, maxCount, mean, std };
}

/** Fraction (0..1) of values on the passing side of a spec limit. */
export function yieldFraction(values: readonly number[], limit: number, side: 'below' | 'above'): number {
  if (values.length === 0) return 0;
  const pass = values.filter((v) => (side === 'below' ? v <= limit : v >= limit)).length;
  return pass / values.length;
}
