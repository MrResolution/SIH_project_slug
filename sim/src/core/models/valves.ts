import type { Params } from '../params';
import { clamp, lpmToM3s } from '../units';

/**
 * Valves (docs/simulation/03 §9).
 * Relief: spring valve cracking at 20 bar, full lift at 22 bar, orifice flow
 * through the current lift. The lift follows its static target with a short
 * lag (τ ≈ 0.25 s), so a sudden blockage overshoots the 22 bar PT-02 trip
 * while a slow pressure rise is held by the relief.
 */
export function reliefTargetLift(p: Params, pD_Pa: number): number {
  return clamp((pD_Pa - p.hose.relief_bar * 1e5) / ((p.hose.reliefFull_bar - p.hose.relief_bar) * 1e5), 0, 1);
}

export function reliefFlow(p: Params, lift: number, pD_Pa: number): number {
  if (lift <= 0 || pD_Pa <= 0) return 0;
  return lift * lpmToM3s(p.hose.reliefCap_lpm) * Math.sqrt(pD_Pa / (p.hose.reliefFull_bar * 1e5));
}
