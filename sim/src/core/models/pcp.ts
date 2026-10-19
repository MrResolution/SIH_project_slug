import type { Params } from '../params';
import type { PcpState } from '../state';
import { muP } from './rheology';
import { G, lag } from '../units';

/**
 * Tier 2 · progressive cavity pump booster (docs/simulation/03 §7, docs/04 §5).
 *
 *   Q_pcp = n·V_d − Q_slip,      Q_slip = k_s·ΔP/μp^m·(1 + w)
 *   T     = V_d·ΔP / (2π·η)      P_shaft = T·ω = n·V_d·ΔP/η
 *
 * Drive limit: the VFD caps shaft power at the motor rating, so the operating
 * point slides along the constant-power envelope n ≤ P_motor·η/(V_d·ΔP). Above
 * the torque limit (24 bar for Option B) the rotor stalls. This reproduces
 * DR-1 when switching between Option A (3 kW) and Option B (5.5 kW).
 */

/** k_s calibrated so η_vol = slipEta20 at 20 bar with slipRefTS slurry at 300 rpm, 25 °C. */
export function slipCoeff(p: Params): number {
  const vd = p.pcp.vd_L / 1000;
  const nRef = 300 / 60;
  const muRef = muP(p, p.pcp.slipRefTS, 25);
  return ((1 - p.pcp.slipEta20) * nRef * vd * Math.pow(muRef, p.pcp.slipM)) / 20e5;
}

export interface PumpInputs {
  nCmd_revs: number;
  pAtm: number;
  pIn: number;
  mu: number;
  motor_W: number;
  cav: number;
  liqFrac: number;
  ks: number;
}

export interface PumpPoint {
  q: number;
  n: number;
  dp: number;
  slip: number;
  powerLimited: boolean;
  torqueStall: boolean;
}

/** Liquid flow delivered for a given discharge gauge pressure pD. Decreasing in pD. */
export function pumpAt(p: Params, inp: PumpInputs, pD: number): PumpPoint {
  const vd = p.pcp.vd_L / 1000;
  const dp = pD + inp.pAtm - inp.pIn;
  const dpLimit = p.pcp.dpTorqueLimit_bar * 1e5;
  let n = inp.nCmd_revs;
  let powerLimited = false;
  let torqueStall = false;
  if (dp > dpLimit) {
    n = 0;
    torqueStall = inp.nCmd_revs > 0;
  } else if (dp > 0) {
    const nMax = (inp.motor_W * p.pcp.etaMech) / (vd * dp);
    if (nMax < n) {
      n = nMax;
      powerLimited = true;
    }
  }
  const slip = (inp.ks * dp) / Math.pow(Math.max(inp.mu, 1e-4), p.pcp.slipM) * (1 + p.pcp.wear);
  const q = n * vd * inp.cav * inp.liqFrac - slip;
  return { q, n, dp, slip, powerLimited, torqueStall };
}

export function shaftLoad(p: Params, pt: PumpPoint) {
  const vd = p.pcp.vd_L / 1000;
  const dp = Math.max(0, pt.dp);
  const torque = (vd * dp) / (2 * Math.PI * p.pcp.etaMech);
  return { torque, shaft_W: torque * 2 * Math.PI * pt.n };
}

/** NPSH check (DR-3): P_in,abs < P_v + ρ·g·NPSH_r degrades η_vol. */
export function cavitationFactor(p: Params, pIn: number, rho: number): number {
  const need = p.fluid.pVapour_Pa + rho * G * p.pcp.npshr_m;
  if (pIn >= need) return 1;
  return Math.max(0.35, (pIn - p.fluid.pVapour_Pa) / (need - p.fluid.pVapour_Pa));
}

/**
 * Stator thermal node, docs/simulation/03 §7:
 *   C·dT/dt = ξ·P_shaft·(1 − η)·g(lube) + dry friction − hA·(T − T_fluid)
 * Dry running loses the liquid film: friction heat rises and hA collapses.
 */
export function stepStator(p: Params, s: PcpState, tFluid_C: number, dt: number) {
  const wet = 1 - s.gasFrac;
  const omega = 2 * Math.PI * (s.rpm / 60);
  const heat = p.pcp.statorXi * s.shaft_W * (1 - p.pcp.etaMech) + p.pcp.dryTorque_Nm * omega * s.gasFrac;
  const hA = p.pcp.statorHAdry_WK + (p.pcp.statorHA_WK - p.pcp.statorHAdry_WK) * wet;
  const tau = p.pcp.statorC_JK / hA;
  const tEq = tFluid_C + heat / hA;
  s.statorT_C = lag(s.statorT_C, tEq, tau, dt);
  if (s.statorT_C >= p.pcp.statorBurn_C) s.burnt = true;
}

/** Vendor-style slip calibration used for volume metering (BST-07): η_vol(ΔP). */
export const etaVolEstimate = (dp_bar: number) => Math.max(0.6, 0.98 - 0.0065 * Math.max(0, dp_bar));
