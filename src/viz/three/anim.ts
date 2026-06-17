/**
 * Exponential smoothing toward a target, independent of frame rate. `lambda` is
 * the approach rate (larger = snappier). Used in useFrame so geometry/visual
 * morphs ease physically instead of snapping, holding 60 FPS with zero allocs.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
