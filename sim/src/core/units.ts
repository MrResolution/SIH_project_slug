/**
 * SI helpers and unit conversions. Internally the core is SI everywhere; the UI
 * converts at the edge. Names carry their units (`pDisch_Pa`, `q_m3s`, ...).
 * @see docs/simulation/07 §3 (coding standards)
 */

/** Gravitational acceleration used by docs/04 (tables are computed with 9.81). */
export const G = 9.81;
/** Universal gas constant, J/(mol·K). */
export const R_GAS = 8.314;
export const KELVIN = 273.15;

export const BAR = 1e5;
export const KPA = 1e3;

export const barToPa = (bar: number) => bar * BAR;
export const paToBar = (pa: number) => pa / BAR;

/** L/min → m³/s */
export const lpmToM3s = (lpm: number) => lpm / 60000;
/** m³/s → L/min */
export const m3sToLpm = (q: number) => q * 60000;

export const cToK = (c: number) => c + KELVIN;
export const kToC = (k: number) => k - KELVIN;

export const rpmToRadS = (rpm: number) => (rpm * 2 * Math.PI) / 60;
export const rpmToRevS = (rpm: number) => rpm / 60;

export const degToRad = (d: number) => (d * Math.PI) / 180;
export const radToDeg = (r: number) => (r * 180) / Math.PI;

/** Cross-sectional area of a circular bore. */
export const boreArea = (d_m: number) => (Math.PI * d_m * d_m) / 4;

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Hermite smoothstep on [e0, e1]. */
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * First-order lag towards a target with time constant tau (exact discretisation,
 * so it is unconditionally stable for any dt).
 */
export const lag = (current: number, target: number, tau_s: number, dt: number) =>
  tau_s <= 0 ? target : target + (current - target) * Math.exp(-dt / tau_s);

/** Move `current` towards `target` by at most `rate·dt`. */
export const slew = (current: number, target: number, rate: number, dt: number) => {
  const d = target - current;
  const step = rate * dt;
  return Math.abs(d) <= step ? target : current + Math.sign(d) * step;
};
