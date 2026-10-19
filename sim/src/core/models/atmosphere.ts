import type { Params } from '../params';
import { G } from '../units';

/**
 * Standard atmosphere, docs/04 §2 / docs/simulation/03 §1:
 *   P_atm(h) = 101325 · (1 − 2.25577e-5 · h)^5.25588  Pa
 */
export function pAtm_Pa(altitude_m: number): number {
  return 101325 * Math.pow(1 - 2.25577e-5 * altitude_m, 5.25588);
}

/**
 * Maximum static suction lift, docs/04 §2:
 *   H_max = P_atm(h)·η_vac / (ρ g) − h_friction − h_leak
 */
export function hMaxSuction_m(altitude_m: number, rho: number, etaVac: number, hFriction_m = 0, hLeak_m = 0): number {
  return (pAtm_Pa(altitude_m) * etaVac) / (rho * G) - hFriction_m - hLeak_m;
}

/**
 * Diurnal ambient temperature. Peak at t0 (scenario `ambient.t0_h`):
 *   T_amb(t) = T_mean + A·cos(2π(t_day − t0)/86400)
 * (docs/simulation/03 §1 writes sin; cos places the maximum at t0, which is how
 * the scenarios specify it.)
 */
export function tAmb_C(timeOfDay_s: number, mean_c: number, amplitude_c: number, t0_h: number): number {
  return mean_c + amplitude_c * Math.cos((2 * Math.PI * (timeOfDay_s - t0_h * 3600)) / 86400);
}

/**
 * Engine power available at altitude: ≈ 3.5 % per 300 m for naturally aspirated
 * engines (docs/simulation/03 §12, assumed rule of thumb).
 */
export function engineDerate(p: Params, altitude_m: number): number {
  return Math.max(0.3, 1 - p.power.engineDerate_per300m * (Math.max(0, altitude_m) / 300));
}
