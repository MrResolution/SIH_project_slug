import type { ElevationTable } from '../geometry/route';
import type { Params } from '../params';
import type { HoseState, Parcel } from '../state';
import { binghamGradient, bulkDensity, muP, tauY } from './rheology';
import { positiveQuadraticRoot } from '../solver';
import { G } from '../units';

/**
 * Discharge hose network (docs/simulation/03 §8).
 *
 * Contents are a plug-flow queue of parcels (index 0 = oldest = the sludge
 * front, last = at the PCP), so a slug of thick cake travels up the hill and
 * the pressure responds when it actually arrives — the cause-and-effect the
 * training needs. For the filled length x_f:
 *   ΔP_hose = Σ ρ_k·g·Δz_k + Σ (16/3·τy,k/D + 32·μp,k·V/D²)·L_k + ΣK·½ρV²
 * which is linear + quadratic in Q, so Q(ΔP) has a closed form.
 */

export interface HoseCoeffs {
  static_Pa: number;
  yield_Pa: number;
  /** Viscous term per unit flow, Pa/(m³/s). */
  visc: number;
  /** Quadratic minor-loss coefficient, Pa/(m³/s)². */
  c2: number;
  crushed: boolean;
  front_m: number;
}

const parcelLen = (h: HoseState, pc: Parcel) => pc.v / h.area_m2;

/**
 * Kink loss coefficient for severity s ∈ (0, 1]: the open area shrinks to
 * (1 − 0.97·s) of the bore, so K ≈ K₀·s / a² — mild kinks cost little, a hose
 * folded flat (s → 1) is practically closed (docs/simulation/03 §8.3).
 */
export const kinkLossK = (p: Params, severity: number) => {
  const s = Math.min(1, Math.max(0, severity));
  const a = 1 - 0.97 * s;
  return (p.hose.kinkK * s) / (a * a);
};

export function makeParcel(p: Params, v: number, ts: number, t_C: number): Parcel {
  return { v, ts, rho: bulkDensity(p, ts), tauY: tauY(p, ts, t_C), mu: muP(p, ts, t_C) };
}

export function hoseCoeffs(p: Params, h: HoseState, elev: ElevationTable): HoseCoeffs {
  const D = p.hose.d_m;
  let s = 0;
  let stat = 0;
  let yld = 0;
  let visc = 0;
  for (let i = h.parcels.length - 1; i >= 0; i--) {
    const pc = h.parcels[i];
    const L = parcelLen(h, pc);
    const s1 = Math.min(s + L, h.length_m);
    const Lc = s1 - s;
    if (Lc <= 0) break;
    const g = binghamGradient(pc.tauY, pc.mu, D);
    stat += pc.rho * G * (elev.at(s1) - elev.at(s));
    yld += g.yield_Pa_m * Lc;
    visc += g.visc_Pa_m_per_m3s * Lc;
    s = s1;
  }
  const A = h.area_m2;
  const rhoIn = h.parcels.length ? h.parcels[h.parcels.length - 1].rho : 1000;
  let K = p.hose.minorK;
  if (h.kink) K += kinkLossK(p, h.kink.severity);
  return { static_Pa: stat, yield_Pa: yld, visc, c2: (K * 0.5 * rhoIn) / (A * A), crushed: !!h.crushed, front_m: s };
}

/**
 * Hose flow for a given inlet gauge pressure pD (outlet at atmosphere).
 * Forward if pD exceeds static + yield; backflow (no check valve) if the hill
 * column exceeds pD by more than the yield; otherwise the plug holds.
 */
export function hoseFlowAt(c: HoseCoeffs, pD: number, checkValve: boolean): number {
  if (c.crushed) return 0;
  const fwd = c.static_Pa + c.yield_Pa - pD;
  if (fwd < 0) return positiveQuadraticRoot(c.c2, c.visc, fwd);
  if (!checkValve) {
    const back = pD - c.static_Pa + c.yield_Pa;
    if (back < 0) return -positiveQuadraticRoot(c.c2, c.visc, back);
  }
  return 0;
}

export interface HoseAdvance {
  delivered_m3: number;
  deliveredSolids_kg: number;
  returned_m3: number;
}

/** Advances the parcel queue by one step of flow q (m³/s). */
export function advanceHose(p: Params, h: HoseState, q: number, tsIn: number, t_C: number, dt: number): HoseAdvance {
  const res: HoseAdvance = { delivered_m3: 0, deliveredSolids_kg: 0, returned_m3: 0 };
  const capacity = h.length_m * h.area_m2;
  if (q > 0) {
    const vin = q * dt;
    const last = h.parcels[h.parcels.length - 1];
    if (last && Math.abs(last.ts - tsIn) < 0.15 && last.v < 0.008) {
      const ts = (last.v * last.ts + vin * tsIn) / (last.v + vin);
      const merged = makeParcel(p, last.v + vin, ts, t_C);
      h.parcels[h.parcels.length - 1] = merged;
    } else {
      h.parcels.push(makeParcel(p, vin, tsIn, t_C));
    }
    h.vol_m3 += vin;
    // Overflow at the tanker inlet.
    let excess = h.vol_m3 - capacity;
    while (excess > 1e-12 && h.parcels.length) {
      const front = h.parcels[0];
      const take = Math.min(front.v, excess);
      front.v -= take;
      excess -= take;
      h.vol_m3 -= take;
      res.delivered_m3 += take;
      res.deliveredSolids_kg += take * front.rho * (front.ts / 100);
      if (front.v <= 1e-12) h.parcels.shift();
    }
  } else if (q < 0) {
    let back = -q * dt;
    while (back > 1e-12 && h.parcels.length) {
      const pc = h.parcels[h.parcels.length - 1];
      const take = Math.min(pc.v, back);
      pc.v -= take;
      back -= take;
      h.vol_m3 -= take;
      res.returned_m3 += take;
      if (pc.v <= 1e-12) h.parcels.pop();
    }
  }
  if (h.vol_m3 < 0) h.vol_m3 = 0;
  return res;
}

/** Mean TS of the contents (volume-weighted). */
export function hoseMeanTS(h: HoseState): number {
  let v = 0;
  let s = 0;
  for (const pc of h.parcels) {
    v += pc.v;
    s += pc.v * pc.ts;
  }
  return v > 1e-9 ? s / v : 0;
}

/**
 * p(s) and TS(s) on 33 samples along the hose for the HUD and the 3D colour
 * ramp. Beyond the front the hose holds air at atmospheric pressure.
 */
export function hoseProfile(p: Params, h: HoseState, elev: ElevationTable, pD: number, q: number) {
  const N = h.pProfile.length;
  const D = p.hose.d_m;
  const A = h.area_m2;
  const V = q / A;
  // Walk parcels from the inlet, accumulating losses.
  let s = 0;
  let loss = 0;
  let k = 0;
  const step = h.length_m / (N - 1);
  const kinkS = h.kink ? h.kink.s_m : Infinity;
  const kinkLoss = h.kink ? kinkLossK(p, h.kink.severity) * 0.5 * 1050 * V * V : 0;
  const front = Math.min(h.vol_m3 / A, h.length_m);
  for (let i = h.parcels.length - 1; i >= 0 && k < N; i--) {
    const pc = h.parcels[i];
    const L = pc.v / A;
    const s1 = Math.min(s + L, h.length_m);
    const g = binghamGradient(pc.tauY, pc.mu, D);
    const fricPerM = q > 0 ? g.yield_Pa_m + g.visc_Pa_m_per_m3s * q : 0;
    while (k < N && k * step <= s1 + 1e-9) {
      const sk = k * step;
      const sub = Math.max(0, sk - s);
      const lossK = loss + fricPerM * sub + pc.rho * G * (elev.at(sk) - elev.at(s)) + (sk > kinkS ? kinkLoss : 0);
      h.pProfile[k] = Math.max(0, pD - lossK);
      h.tsProfile[k] = pc.ts;
      k++;
    }
    loss += fricPerM * (s1 - s) + pc.rho * G * (elev.at(s1) - elev.at(s));
    s = s1;
  }
  for (; k < N; k++) {
    h.pProfile[k] = k * step <= front + 1e-6 ? Math.max(0, pD - loss) : 0;
    h.tsProfile[k] = -1;
  }
}
