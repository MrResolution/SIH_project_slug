/**
 * Interlock logic — the single source of truth, identical to docs/05 §3.
 * A pure function: no side effects, no state. Exhaustively tested over all
 * 2¹¹ = 2,048 input combinations.
 *
 *   K1_MACHINE_POWER = ESTOP_CHAIN_OK ∧ GAS_DETECTOR_HEALTHY ∧ ¬GAS_ALARM
 *                    ∧ VENT_TIMER_DONE ∧ MCU_WATCHDOG_OK
 *   K2_PCP_ENABLE    = K1 ∧ OUTRIGGERS_DOWN ∧ CHOCKS_ENGAGED ∧ |TILT| < 25°
 *                    ∧ ¬DRY_RUN ∧ ¬OVERPRESSURE ∧ STATOR_TEMP < 90 °C
 *   TRAVEL_ENABLE    = ¬PCP_RUNNING ∧ OUTRIGGERS_UP
 */

export interface InterlockInputs {
  estopChainOk: boolean;
  gasDetectorHealthy: boolean;
  gasAlarm: boolean;
  ventTimerDone: boolean;
  watchdogOk: boolean;
  outriggersDown: boolean;
  chocksEngaged: boolean;
  tiltOk: boolean;
  dryRun: boolean;
  overpressure: boolean;
  statorOk: boolean;
}

export const INTERLOCK_INPUT_KEYS: (keyof InterlockInputs)[] = [
  'estopChainOk',
  'gasDetectorHealthy',
  'gasAlarm',
  'ventTimerDone',
  'watchdogOk',
  'outriggersDown',
  'chocksEngaged',
  'tiltOk',
  'dryRun',
  'overpressure',
  'statorOk',
];

export function interlock(i: InterlockInputs): { k1: boolean; k2: boolean } {
  const k1 = i.estopChainOk && i.gasDetectorHealthy && !i.gasAlarm && i.ventTimerDone && i.watchdogOk;
  const k2 = k1 && i.outriggersDown && i.chocksEngaged && i.tiltOk && !i.dryRun && !i.overpressure && i.statorOk;
  return { k1, k2 };
}

export function travelEnable(pcpRunning: boolean, outriggersUp: boolean): boolean {
  return !pcpRunning && outriggersUp;
}

export interface BlockReason {
  key: keyof InterlockInputs;
  text: string;
}

/** Human-readable reasons K1 / K2 are open, for the pendant display and HUD. */
export function blockReasons(i: InterlockInputs, ctx: { ventLeft_s: number; gasText: string; tilt_deg: number; statorT_C: number }): { k1: BlockReason[]; k2: BlockReason[] } {
  const k1: BlockReason[] = [];
  const k2: BlockReason[] = [];
  if (!i.estopChainOk) k1.push({ key: 'estopChainOk', text: 'E-STOP latched — twist to reset' });
  if (!i.gasDetectorHealthy) k1.push({ key: 'gasDetectorHealthy', text: 'Gas detector fault / bump test overdue' });
  if (i.gasAlarm) k1.push({ key: 'gasAlarm', text: `Gas unsafe: ${ctx.gasText}` });
  if (!i.ventTimerDone) {
    const m = Math.floor(ctx.ventLeft_s / 60);
    const s = Math.floor(ctx.ventLeft_s % 60);
    k1.push({ key: 'ventTimerDone', text: `Ventilation ${m}:${String(s).padStart(2, '0')} left` });
  }
  if (!i.watchdogOk) k1.push({ key: 'watchdogOk', text: 'MCU watchdog timeout' });
  if (!i.outriggersDown) k2.push({ key: 'outriggersDown', text: 'Outriggers not down' });
  if (!i.chocksEngaged) k2.push({ key: 'chocksEngaged', text: 'Chocks not engaged' });
  if (!i.tiltOk) k2.push({ key: 'tiltOk', text: `Tilt ${ctx.tilt_deg.toFixed(1)}° ≥ 25°` });
  if (i.dryRun) k2.push({ key: 'dryRun', text: 'Dry-run trip (LT-01 low)' });
  if (i.overpressure) k2.push({ key: 'overpressure', text: 'Overpressure trip (PT-02 > 22 bar)' });
  if (!i.statorOk) k2.push({ key: 'statorOk', text: `Stator hot ${ctx.statorT_C.toFixed(0)} °C` });
  return { k1, k2 };
}
