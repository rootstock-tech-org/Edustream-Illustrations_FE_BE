import { describe, it, expect } from 'vitest';
import { histogram, yieldFraction } from './histogram';

describe('histogram', () => {
  it('bins all values and preserves the total count', () => {
    const values = [1, 2, 2, 3, 3, 3, 4, 5];
    const h = histogram(values, 5);
    const total = h.bins.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(values.length);
    expect(h.min).toBe(1);
    expect(h.max).toBe(5);
    expect(h.maxCount).toBeGreaterThan(0);
  });

  it('computes mean and std', () => {
    const h = histogram([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(h.mean).toBeCloseTo(5, 6);
    expect(h.std).toBeCloseTo(2, 6);
  });

  it('handles the empty case safely', () => {
    const h = histogram([]);
    expect(h.bins).toHaveLength(0);
    expect(h.maxCount).toBe(0);
  });
});

describe('yieldFraction', () => {
  it('counts the passing side of a spec limit', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(yieldFraction(values, 5, 'below')).toBeCloseTo(0.5, 6);
    expect(yieldFraction(values, 5, 'above')).toBeCloseTo(0.6, 6);
  });
});
