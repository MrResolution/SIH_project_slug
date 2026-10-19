import type { Params } from '../params';
import { R_GAS, cToK } from '../units';

/**
 * Bingham-plastic rheology as a function of total solids and temperature.
 *   τy(TS,T) = a·TS^b · f_T(T)^0.5     μp(TS,T) = μ₀·e^(c·TS) · f_T(T)
 *   f_T(T)   = exp[(Eₐ/R)(1/T − 1/T_ref)]
 * @see docs/04 §3, docs/simulation/03 §2
 */

export function fT(p: Params, t_C: number): number {
  const T = cToK(t_C);
  return Math.exp((p.rheology.Ea_Jmol / R_GAS) * (1 / T - 1 / p.rheology.Tref_K));
}

/** Yield stress, Pa. TS in %. */
export function tauY(p: Params, ts_pct: number, t_C = 25): number {
  const ts = Math.max(0, ts_pct);
  return p.rheology.a * Math.pow(ts, p.rheology.b) * Math.pow(fT(p, t_C), p.rheology.tauTempExp);
}

/** Plastic viscosity, Pa·s. TS in %. */
export function muP(p: Params, ts_pct: number, t_C = 25): number {
  return p.rheology.mu0 * Math.exp(p.rheology.c * Math.max(0, ts_pct)) * fT(p, t_C);
}

/**
 * Bulk density: 1000 + 4·TS kg/m³ (assumed linear, ≈ 1,088 at 22 %).
 * docs/simulation/03 §2 helpers.
 */
export function bulkDensity(p: Params, ts_pct: number): number {
  return p.fluid.rhoWater + p.rheology.densityPerTS * Math.max(0, ts_pct);
}

export type SludgeClass = 'liquid' | 'slurry' | 'semi-solid' | 'solid';

/** Eawag consistency classes (TS thresholds). */
export function sludgeClass(ts_pct: number): SludgeClass {
  if (ts_pct < 5) return 'liquid';
  if (ts_pct < 15) return 'slurry';
  if (ts_pct < 25) return 'semi-solid';
  return 'solid';
}

/**
 * Laminar Bingham pipe pressure gradient (Buckingham–Reiner approximation for
 * τ_w ≫ τ_y), docs/04 §4:
 *   ΔP/L ≈ (16/3)·τy/D + 32·μp·V/D²
 * Returned as the two coefficients so callers can solve linearly in Q:
 *   ΔP/L = yield + visc·Q
 */
export function binghamGradient(tauY_Pa: number, muP_Pas: number, d_m: number): { yield_Pa_m: number; visc_Pa_m_per_m3s: number } {
  const area = (Math.PI * d_m * d_m) / 4;
  return {
    yield_Pa_m: ((16 / 3) * tauY_Pa) / d_m,
    visc_Pa_m_per_m3s: (32 * muP_Pas) / (d_m * d_m * area),
  };
}

/** Convenience: ΔP over length L at flow Q (m³/s), Pa. */
export function binghamDp(tauY_Pa: number, muP_Pas: number, d_m: number, q_m3s: number, l_m: number): number {
  if (q_m3s <= 0) return 0;
  const g = binghamGradient(tauY_Pa, muP_Pas, d_m);
  return (g.yield_Pa_m + g.visc_Pa_m_per_m3s * q_m3s) * l_m;
}

/** Bingham Reynolds number ρVD/μp (laminar check, docs/04 §4). */
export function binghamRe(rho: number, v_ms: number, d_m: number, muP_Pas: number): number {
  return (rho * v_ms * d_m) / muP_Pas;
}
