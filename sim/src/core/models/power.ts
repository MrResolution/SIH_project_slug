import type { Params } from '../params';
import type { PowerState } from '../state';
import { engineDerate } from './atmosphere';

/**
 * Power and energy (docs/simulation/03 §12, docs/04 §6).
 * Battery: 16S LiFePO₄, SOC' = −I/(3600·C_Ah), V = OCV(SOC) − I·R(T).
 * Capacity derates to ≈ 80 % at −10 °C (assumed). Engine variant: power
 * derated ≈ 3.5 % per 300 m; fuel from a 300 g/kWh BSFC.
 */

const OCV_TABLE: [number, number][] = [
  [0, 2.8],
  [0.05, 3.1],
  [0.1, 3.2],
  [0.2, 3.25],
  [0.4, 3.28],
  [0.6, 3.3],
  [0.8, 3.33],
  [0.95, 3.38],
  [1, 3.45],
];

export function ocvCell(soc: number): number {
  const s = Math.min(1, Math.max(0, soc));
  for (let i = 1; i < OCV_TABLE.length; i++) {
    const [s1, v1] = OCV_TABLE[i];
    const [s0, v0] = OCV_TABLE[i - 1];
    if (s <= s1) return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0);
  }
  return OCV_TABLE[OCV_TABLE.length - 1][1];
}

export const capacityDerate = (t_C: number) => (t_C >= 15 ? 1 : t_C <= -10 ? 0.8 : 0.8 + (0.2 * (t_C + 10)) / 25);
export const battResistance = (p: Params, t_C: number) => p.power.rInt_ohm * (t_C < 10 ? 1 + 0.04 * (10 - t_C) : 1);

/** Power the drive train may give the PCP right now (W, electrical). */
export function pcpPowerAvailable(p: Params, pw: PowerState, otherLoads_W: number, altitude_m: number, motor_W: number): number {
  if (p.power.source === 'engine') {
    const avail = p.power.engine_kW * 1000 * 0.8 * engineDerate(p, altitude_m) - otherLoads_W;
    return Math.max(0, Math.min(motor_W, avail * p.pcp.motorEta));
  }
  return pw.soc < p.power.socLimit ? motor_W * 0.5 : motor_W;
}

export function stepPower(p: Params, pw: PowerState, battT_C: number, cold: boolean, dt: number) {
  const L = pw.loads;
  const total = L.pcp + L.auger + L.vane + L.blower + L.heater + L.aux + L.travel;
  pw.pTotal_W = total;
  pw.energy_J += total * dt;
  pw.energyPump_J += (L.pcp + L.auger + L.vane) * dt;
  if (p.power.source === 'engine') {
    pw.fuel_L += ((total / 1000) * (dt / 3600) * p.power.bsfc_g_kWh) / 1000 / p.power.dieselDensity_kg_L;
    pw.vBus = 230;
    pw.iBus = total / 230;
    pw.limited = false;
    return;
  }
  const t = cold ? Math.min(battT_C, -10) : battT_C;
  const ocv = ocvCell(pw.soc) * p.power.cells;
  const R = battResistance(p, t);
  // V = OCV − I·R and P = V·I  →  R·I² − OCV·I + P = 0
  const disc = Math.max(0, ocv * ocv - 4 * R * total);
  const I = (ocv - Math.sqrt(disc)) / (2 * R);
  pw.iBus = I;
  pw.vBus = ocv - I * R;
  pw.soc = Math.max(0, pw.soc - (I * dt) / (3600 * p.power.battery_Ah * capacityDerate(t)));
  pw.limited = pw.soc < p.power.socLimit;
}
