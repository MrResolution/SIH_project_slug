import type { Params } from '../params';
import { binghamGradient, muP, tauY } from './rheology';
import { airVoid } from './probe';
import { bisectDecreasing } from '../solver';
import { G, boreArea, lpmToM3s } from '../units';

/**
 * Suction leg: pit intake → lance riser → suction hose → surge-cube inlet.
 * Find Qₛ ≥ 0 such that (docs/simulation/03 §5)
 *   P_atm + ρ_col·g·(z_surf − z_in) − P_cube = ρ_mix·g·(z_cube − z_in) + ΔP_fric(Q) + ΔP_screen(Q) + ΔP_entry(Q)
 * The right-hand side rises monotonically with Q, so bisection is robust.
 * If even Q → 0⁺ cannot be driven (yield + lift > available), Qₛ = 0:
 * "suction stalled — lift limit", the high-altitude teaching moment.
 */

export interface SuctionInputs {
  pAtm: number;
  pCube: number;
  zSurf: number;
  zIntake: number;
  zCube: number;
  rhoCol: number;
  tsMix: number;
  rhoSlurry: number;
  temp_C: number;
  blinding: number;
  airFree_m3s: number;
  length_m: number;
}

export interface SuctionSolution {
  q_m3s: number;
  stalled: boolean;
  alpha: number;
  rhoMix: number;
  dpLoss_Pa: number;
  /** Lift the leg needs at this flow, metres of slurry. */
  liftReq_m: number;
  /** Lift the vane pump could deliver at its ultimate vacuum, metres of slurry. */
  liftAvail_m: number;
}

export function solveSuction(p: Params, s: SuctionInputs): SuctionSolution {
  const D = p.suction.d_m;
  const A = boreArea(D);
  const ty = tauY(p, s.tsMix, s.temp_C);
  const mu = muP(p, s.tsMix, s.temp_C);
  const grad = binghamGradient(ty, mu, D);
  const kScreen = p.suction.kScreen / Math.max(0.03, (1 - s.blinding) ** 2);
  const rise = s.zCube - s.zIntake;
  // Air-assist: free air corrected (Boyle) to the riser mean pressure.
  const pMean = 0.5 * (s.pCube + s.pAtm + s.rhoCol * G * Math.max(0, s.zSurf - s.zIntake));
  const qAirActual = s.airFree_m3s > 0 ? (s.airFree_m3s * s.pAtm) / Math.max(pMean, 5000) : 0;

  const losses = (q: number) => {
    if (q <= 0) return 0;
    const v = q / A;
    const dyn = 0.5 * s.rhoSlurry * v * v;
    return (grad.yield_Pa_m + grad.visc_Pa_m_per_m3s * q) * s.length_m + (kScreen + p.suction.kEntry) * dyn;
  };
  const rhoMixAt = (q: number) => {
    const a = airVoid(p, qAirActual, q);
    return (1 - a) * s.rhoSlurry + a * p.fluid.rhoAir;
  };
  const drive = s.pAtm + s.rhoCol * G * (s.zSurf - s.zIntake) - s.pCube;
  const residual = (q: number) => drive - rhoMixAt(q) * G * rise - losses(q);

  const qMax = lpmToM3s(p.suction.qMax_lpm);
  const q0 = 1e-7;
  let q = 0;
  let stalled = false;
  if (residual(q0) <= 0) stalled = true;
  else q = bisectDecreasing(residual, q0, qMax, 36);

  const alpha = airVoid(p, qAirActual, q);
  const rhoMix = (1 - alpha) * s.rhoSlurry + alpha * p.fluid.rhoAir;
  const loss = losses(Math.max(q, q0));
  const pUlt = p.cube.pultFrac * s.pAtm;
  return {
    q_m3s: q,
    stalled,
    alpha,
    rhoMix,
    dpLoss_Pa: loss,
    liftReq_m: (s.zCube - s.zSurf) + loss / (s.rhoSlurry * G),
    liftAvail_m: (s.pAtm - pUlt) / (s.rhoSlurry * G),
  };
}
