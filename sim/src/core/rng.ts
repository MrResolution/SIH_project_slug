/**
 * Seeded PRNG (xoshiro128**). `Math.random` is banned in the core so that the
 * same seed and the same command log always give a bit-identical run.
 * @see docs/simulation/02 §5 (determinism)
 */
export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal (Box–Muller). */
  normal(): number;
  /** Poisson-distributed count for a given mean (Knuth; fine for small means). */
  poisson(mean: number): number;
  /** Serialisable internal state. */
  state(): [number, number, number, number];
}

const rotl = (x: number, k: number) => (x << k) | (x >>> (32 - k));

/** splitmix32: expands a single seed into well-mixed state words. */
function splitmix32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function createRng(seed: number): Rng {
  const sm = splitmix32(seed);
  let a = sm(), b = sm(), c = sm(), d = sm();
  let spare: number | null = null;

  const nextU32 = () => {
    const result = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= t;
    d = rotl(d, 11);
    return result;
  };

  const next = () => nextU32() / 4294967296;

  return {
    next,
    normal() {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return s;
      }
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    },
    poisson(mean: number) {
      if (mean <= 0) return 0;
      const L = Math.exp(-mean);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > L && k < 1000);
      return k - 1;
    },
    state: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
}
