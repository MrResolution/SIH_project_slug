import type { Params } from '../params';
import type { ThermalState } from '../state';
import { lag } from '../units';

/**
 * Lumped thermal nodes (docs/simulation/03 §11): small lines (suction leg, jet
 * line, cube drains) and the battery. The stator node lives in pcp.ts.
 *   C·dT/dt = Q_in − U·A·(T − T_amb) + Q_heater
 * Lines that hold residual liquid below 0 °C grow ice; at 30 % they block.
 */

const C_LINE_JK = 6000;
const C_BATT_JK = 60000;

export interface ThermalInputs {
  tAmb_C: number;
  tFluid_C: number;
  flowing: boolean;
  heaterCmd: boolean;
  iBus_A: number;
  rBatt_ohm: number;
  linesWet: boolean;
}

export function stepThermal(p: Params, th: ThermalState, inp: ThermalInputs, dt: number) {
  // Thermostatic jacket heater with hysteresis.
  if (!inp.heaterCmd) th.heaterActive = false;
  else if (th.line_C < p.thermal.heaterAuto_C) th.heaterActive = true;
  else if (th.line_C > p.thermal.heaterAuto_C + 4) th.heaterActive = false;

  const uaLine = C_LINE_JK / p.thermal.lineTauIdle_s;
  const heat = th.heaterActive ? p.thermal.heater_W * 0.7 : 0;
  if (inp.flowing) th.line_C = lag(th.line_C, inp.tFluid_C, p.thermal.lineTauFlow_s, dt);
  th.line_C += ((heat - uaLine * (th.line_C - inp.tAmb_C)) / C_LINE_JK) * dt;

  if (inp.linesWet) th.residual = Math.max(th.residual, 1);
  if (th.line_C < 0 && th.residual > 0 && !inp.flowing) th.ice = Math.min(1, th.ice + p.thermal.iceRate_per_Ks * -th.line_C * th.residual * dt);
  else if (th.line_C > 0) th.ice = Math.max(0, th.ice - 0.0008 * th.line_C * dt);

  // Battery: slow node, Joule heating, pack heater share of the jacket.
  const battHeat = inp.iBus_A * inp.iBus_A * inp.rBatt_ohm + (inp.heaterCmd && th.batt_C < 8 ? p.thermal.heater_W * 0.3 : 0);
  th.batt_C += ((battHeat - (C_BATT_JK / p.thermal.battTau_s) * (th.batt_C - inp.tAmb_C)) / C_BATT_JK) * dt;
}

export const linesBlocked = (p: Params, th: ThermalState) => th.ice >= p.thermal.iceBlock;
