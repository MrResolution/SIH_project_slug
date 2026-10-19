import type { Params } from '../params';
import type { Rng } from '../rng';
import type { EventLog } from '../events';
import type { ProbeState } from '../state';
import { N_CELLS, bandDistance, type PitLayout, type PitState } from './pit';
import { muP, tauY, bulkDensity } from './rheology';
import { G, boreArea, rpmToRadS } from '../units';

/**
 * Tier 1 · Probe: auger shear and torque, jets, air-assist, screen blinding
 * and the stochastic trash recipe (docs/simulation/03 §4).
 */

/** Height of the auger band above the intake (it spans the 250 mm screen). */
export const augerCentre = (p: Params, zIntake: number) => zIntake + p.suction.screenH_m / 2;

/**
 * Effective shear applied to each cell:
 *   γ̇_aug ≈ ω·r_a/δ,  τ_aug = τy,local + μp,local·γ̇,  τeff,ᵢ = max(τ_suction, τ_aug·e^(−dᵢ/r_m)) + τ_jet,ᵢ
 *   τ_jet = ½ρ v_jet²·κ, v_jet = √(2ΔP_jet/ρ)
 */
export function shearField(p: Params, pit: PitState, lay: PitLayout, zIntake: number, probe: ProbeState, pJet_Pa: number, out: Float64Array) {
  const rpm = Math.abs(probe.auger_rpm);
  const zc = augerCentre(p, zIntake);
  const omega = rpmToRadS(rpm);
  const gamma = (omega * p.probe.augerR_m) / p.probe.augerGap_m;
  // Local cell at the auger centre.
  let loc = -1;
  for (let i = 0; i < N_CELLS; i++) {
    if (lay.h[i] > 1e-6 && zc >= lay.zBot[i] && zc < lay.zBot[i] + lay.h[i]) {
      loc = i;
      break;
    }
  }
  const submerged = loc >= 0;
  const tsLoc = submerged ? pit.ts[loc] : 0;
  const tauAug = submerged && rpm > 20 ? tauY(p, tsLoc, pit.fluidT_C) + muP(p, tsLoc, pit.fluidT_C) * gamma : 0;
  probe.tauAuger_Pa = tauAug;
  probe.rm_m = p.probe.rm0_m + p.probe.rmPerRpm * rpm;

  const rho = bulkDensity(p, tsLoc);
  const vJet = pJet_Pa > 0 ? Math.sqrt((2 * pJet_Pa) / rho) : 0;
  const tauJet = probe.jetValve * 0.5 * rho * vJet * vJet * p.probe.jetKappa;
  probe.tauJet_Pa = tauJet;

  for (let i = 0; i < N_CELLS; i++) {
    const d = bandDistance(lay.zMid[i], zIntake, p.suction.screenH_m);
    const aug = tauAug > 0 ? tauAug * Math.exp(-d / probe.rm_m) : 0;
    const jet = tauJet > 0 ? tauJet * Math.exp(-Math.abs(lay.zMid[i] - zIntake) / p.probe.jetReach_m) : 0;
    out[i] = Math.max(p.suction.tauSuction_Pa, aug) + jet;
  }
  return { tsLoc, submerged, gamma };
}

/**
 * Auger torque and motor current, docs/simulation/03 §4.1:
 *   T = C_T·τ_local·r_a²·L_a + T₀ (+ wraps),  I = T·ω / (η_m·V_bus)
 * C_T is lumped (cutting + conveying), assumed so that cake at ~21 % TS draws
 * ≈ 8 A at 300 rpm on the 48 V bus, consistent with the 07 §4 sample telemetry.
 */
export function augerLoad(p: Params, probe: ProbeState, vBus: number) {
  const omega = Math.abs(rpmToRadS(probe.auger_rpm));
  const running = Math.abs(probe.auger_rpm) > 5;
  const T = running ? p.probe.cT * probe.tauAuger_Pa * p.probe.augerR_m ** 2 * p.probe.augerL_m + p.probe.t0_Nm + probe.wraps * p.probe.wrapTorque_Nm : 0;
  probe.torque_Nm = T;
  probe.current_A = running ? (T * omega) / (p.probe.motorEta * Math.max(vBus, 30)) + 0.4 : 0;
  return { T, omega, power_W: running ? (T * omega) / p.probe.motorEta + 20 : 0 };
}

/** Jet flow through the nozzles, PRV-limited (DR-8). */
export function jetFlow(p: Params, valve: number, pD_Pa: number, rho: number): number {
  if (valve <= 0 || pD_Pa <= 0) return 0;
  const pj = Math.min(pD_Pa, p.probe.prv_bar * 1e5);
  const a = p.probe.nozzles * boreArea(p.probe.nozzleD_mm / 1000);
  return valve * p.probe.nozzleCd * a * Math.sqrt((2 * pj) / rho);
}

/**
 * Drift-flux void fraction for the air-lift riser, docs/simulation/03 §4.3:
 *   α = j_g / (C₀(j_g + j_l) + v_d),  v_d = 0.35√(gD)
 */
export function airVoid(p: Params, qAirActual_m3s: number, qLiq_m3s: number): number {
  if (qAirActual_m3s <= 0) return 0;
  const A = boreArea(p.suction.d_m);
  const jg = qAirActual_m3s / A;
  const jl = Math.max(0, qLiq_m3s) / A;
  const vd = 0.35 * Math.sqrt(G * p.suction.d_m);
  return Math.min(0.85, jg / (p.probe.airC0 * (jg + jl) + vd));
}

interface TrashItem {
  type: string;
  perM3: number;
  fiber: number;
  size_mm: number;
  mass_kg?: number;
}

export const TRASH_RECIPES: Record<string, TrashItem[]> = {
  radford_modified: [
    { type: 'rag', perM3: 2.5, fiber: 1.0, size_mm: 250 },
    { type: 'wipe', perM3: 4, fiber: 0.8, size_mm: 180 },
    { type: 'plastic bag', perM3: 5, fiber: 0.2, size_mm: 160 },
    { type: 'sanitary pad', perM3: 2, fiber: 0.5, size_mm: 200 },
    { type: 'hair', perM3: 25, fiber: 0.9, size_mm: 8 },
    { type: 'stone', perM3: 12, fiber: 0, size_mm: 25, mass_kg: 0.05 },
  ],
  arid_grit: [
    { type: 'rag', perM3: 1.5, fiber: 1.0, size_mm: 250 },
    { type: 'plastic bag', perM3: 6, fiber: 0.2, size_mm: 160 },
    { type: 'stone', perM3: 60, fiber: 0, size_mm: 25, mass_kg: 0.06 },
  ],
  clean: [],
};

/**
 * Trash arrivals at the intake (Poisson, rate ∝ suction flow), screen
 * blinding b and auger wraps. db/dt = λ·Ṅ_fiber·(1 − b) − k_wipe·(ω/ω_ref)·b
 * @see docs/simulation/03 §4.2
 */
export function stepTrash(p: Params, recipe: string, probe: ProbeState, qSuction_m3s: number, rng: Rng, log: EventLog, t: number, dt: number): number {
  let rockKg = 0;
  const rpm = Math.abs(probe.auger_rpm);
  const augerOn = rpm > 100;
  // Continuous wiping by the auger blades.
  probe.blinding = Math.max(0, probe.blinding - p.probe.kWipe * (rpm / 300) * probe.blinding * dt);
  const items = TRASH_RECIPES[recipe] ?? [];
  if (qSuction_m3s <= 0) return 0;
  for (const it of items) {
    const mean = it.perM3 * qSuction_m3s * dt;
    if (rng.next() >= mean) continue;
    probe.trash[it.type] = (probe.trash[it.type] ?? 0) + 1;
    if (it.mass_kg) {
      rockKg += it.mass_kg;
      continue;
    }
    if (it.size_mm < 12.7) {
      probe.blinding += p.probe.lambdaFiber * it.fiber * (1 - probe.blinding);
      continue;
    }
    const pDefl = augerOn ? 0.8 * Math.min(1, rpm / 300) : 0;
    if (rng.next() < pDefl) {
      probe.deflected++;
      continue;
    }
    if (augerOn && it.fiber >= 0.5 && rng.next() < 0.45 * it.fiber) {
      probe.wraps++;
      log.push(t, 'warn', 'W_AUGER_WRAP', `A ${it.type} wrapped the auger (wraps: ${probe.wraps}). Torque rising: reverse briefly to clear.`);
      continue;
    }
    probe.blinding += 0.12 * Math.max(0.3, it.fiber) * (1 - probe.blinding);
  }
  probe.blinding = Math.min(0.97, probe.blinding);
  return rockKg;
}
