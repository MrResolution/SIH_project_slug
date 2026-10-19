/**
 * Small, deterministic root finders. All hydraulic residuals in the core are
 * monotonic on their bracket, so plain bisection is robust and cheap enough
 * (≈ 40 iterations ≈ a few µs) at 100 Hz × 16.
 * @see docs/simulation/03 §5 and §8.4
 */

/**
 * Bisection for a monotonically *decreasing* f on [lo, hi].
 * Returns lo if f(lo) ≤ 0 and hi if f(hi) ≥ 0.
 */
export function bisectDecreasing(f: (x: number) => number, lo: number, hi: number, iters = 40): number {
  const flo = f(lo);
  if (flo <= 0) return lo;
  const fhi = f(hi);
  if (fhi >= 0) return hi;
  let a = lo;
  let b = hi;
  for (let i = 0; i < iters; i++) {
    const m = 0.5 * (a + b);
    if (f(m) > 0) a = m;
    else b = m;
  }
  return 0.5 * (a + b);
}

/** Solve c2·x² + c1·x + c0 = 0 for the largest real root ≥ 0 (or 0 if none). */
export function positiveQuadraticRoot(c2: number, c1: number, c0: number): number {
  if (c0 >= 0) return 0;
  if (c2 <= 1e-30) return c1 > 0 ? -c0 / c1 : Infinity;
  const disc = c1 * c1 - 4 * c2 * c0;
  // c0 < 0 and c2 > 0 → disc > c1² ≥ 0; use the numerically stable form.
  const sq = Math.sqrt(disc);
  return (2 * -c0) / (c1 + sq);
}
