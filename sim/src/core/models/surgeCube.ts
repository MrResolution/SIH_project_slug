import type { Params } from '../params';
import type { CubeState } from '../state';
import { clamp, lpmToM3s } from '../units';

/**
 * 90 L surge cube with reversible sliding-vane pump (docs/simulation/03 §6).
 *
 * Gas is tracked as m = P·V_gas (isothermal ideal gas), so
 *   dm/dt = −S_vane(P)·P + leak + ingested air,  P = m / (V_cube − V_liq)
 * S_vane(P) = u·S₀·(1 − P_ult/P), P_ult = 0.15·P_atm.
 *
 * Vacuum control (DR-3): in `level` mode a PI loop on the cube level sets the
 * vacuum, so the cube runs at the *minimum* vacuum needed for Qₛ = Q_pcp; in
 * `fixed` mode it holds a gauge set-point. The float isolates the vane pump
 * above 90 % full.
 */

export const cubeVol = (p: Params) => p.cube.v_L / 1000;
export const gasVolume = (p: Params, c: CubeState) => Math.max(0.0005, cubeVol(p) - c.vLiq_m3);
export const cubePressure = (p: Params, c: CubeState) => c.mGas / gasVolume(p, c);

export interface CubeFlows {
  qIn_m3s: number;
  tsIn: number;
  qOut_m3s: number;
  qReturn_m3s: number;
  /** Free air (at P_atm) entering the gas space: air-assist + air ingested at the intake. */
  airFree_m3s: number;
  /** Free air leaving through the suction leg when the cube is blown. */
  blowBack_m3s: number;
  fluidT_C: number;
}

/** Vane-pump command from the selected control law. Mutates pSet / integrator. */
export function vaneControl(p: Params, c: CubeState, pAtm: number, dt: number): number {
  const pUlt = p.cube.pultFrac * pAtm;
  const pMin = pUlt + 2000;
  const pMax = pAtm - 1000;
  if (c.vaneMode !== 'vac' || c.floatTripped) {
    c.levelI = 0;
    return c.vaneMode === 'blow' ? 1 : 0;
  }
  if (p.cube.mode === 'fixed') {
    c.pSet_Pa = clamp(pAtm + p.cube.fixedSetpoint_barg * 1e5, pMin, pMax);
  } else {
    const eL = p.cube.setLevel_L - c.vLiq_m3 * 1000;
    const kp = p.cube.levelKp_Pa_per_L;
    const vac = p.cube.baseVacuum_kPa * 1000 + kp * (eL + c.levelI);
    const pSet = pAtm - vac;
    const clampedSet = clamp(pSet, pMin, pMax);
    // Conditional integration (anti-windup).
    const saturated = (pSet < pMin && eL > 0) || (pSet > pMax && eL < 0);
    if (!saturated) c.levelI += (eL * dt) / p.cube.levelTi_s;
    c.levelI = clamp(c.levelI, -80, 80);
    c.pSet_Pa = clampedSet;
  }
  const P = cubePressure(p, c);
  return clamp((p.cube.pressKp_per_kPa * (P - c.pSet_Pa)) / 1000, 0, 1);
}

export function stepCube(p: Params, c: CubeState, pAtm: number, f: CubeFlows, dt: number) {
  const V = cubeVol(p);
  const pUlt = p.cube.pultFrac * pAtm;

  // ---- liquid (well mixed; return and outflow leave at the cube TS) ----
  const vOld = c.vLiq_m3;
  const vRaw = vOld + (f.qIn_m3s + f.qReturn_m3s - f.qOut_m3s) * dt;
  const vNew = clamp(vRaw, 0, 0.985 * V);
  const solids = vOld * c.ts + f.qIn_m3s * dt * f.tsIn + (f.qReturn_m3s - f.qOut_m3s) * dt * c.ts;
  c.ts = vRaw > 1e-6 ? Math.max(0, solids / vRaw) : f.qIn_m3s > 0 ? f.tsIn : c.ts;
  c.vLiq_m3 = vNew;
  if (vNew > p.cube.floatFrac * V) c.floatTripped = true;
  else if (vNew < (p.cube.floatFrac - 0.1) * V) c.floatTripped = false;
  if (f.qIn_m3s > 0) c.temp_C += (f.fluidT_C - c.temp_C) * Math.min(1, (f.qIn_m3s * dt) / Math.max(c.vLiq_m3, 0.002));

  // ---- gas: m is conserved through liquid-volume changes (isothermal) ----
  const P = cubePressure(p, c);
  let dm = 0;
  const u = c.vaneU;
  if (c.vaneMode === 'vac' && !c.floatTripped && u > 0) {
    const S = u * lpmToM3s(p.cube.vaneS0_lpm) * Math.max(0, 1 - pUlt / P);
    dm -= S * P * dt;
  } else if (c.vaneMode === 'blow') {
    const pTop = pAtm + p.cube.blow_barg * 1e5;
    dm += lpmToM3s(p.cube.vaneS0_lpm) * pAtm * Math.max(0, (pTop - P) / (pTop - pAtm)) * dt;
  }
  dm += lpmToM3s(p.cube.leak_lpm) * pAtm * ((pAtm - P) / pAtm) * dt;
  dm += f.airFree_m3s * pAtm * dt;
  dm -= f.blowBack_m3s * pAtm * dt;
  c.mGas = Math.max(pUlt * 0.9 * gasVolume(p, c), c.mGas + dm);
  c.p_Pa = cubePressure(p, c);
}
