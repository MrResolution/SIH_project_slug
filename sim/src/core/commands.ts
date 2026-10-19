import type { ParamValue } from './params';

/**
 * Operator and world commands. They are timestamped in sim time (step index)
 * by the worker and applied at step boundaries, so a run is fully reproducible
 * from {seed, scenario, commands[]} (docs/simulation/02 §5).
 */

export type FailureKey =
  | 'kink'
  | 'crush'
  | 'checkValveRemoved'
  | 'dryRunTripDisabled'
  | 'overpressureTripDisabled'
  | 'h2sSensorStuck'
  | 'detectorFault'
  | 'batteryCold'
  | 'interlockOverride';

export type VacMode = 'off' | 'vac' | 'blow';

export type Command =
  | { type: 'DRIVE'; target: 'pit' | 'road' }
  | { type: 'DRIVE_STOP' }
  | { type: 'OUTRIGGERS'; down: boolean }
  | { type: 'CHOCKS'; engaged: boolean }
  | { type: 'SCAN_QR' }
  | { type: 'CONFIRM_PPE' }
  | { type: 'MANHOLE'; open: boolean }
  | { type: 'SNIFFER'; placed: boolean }
  | { type: 'BLOWER'; on: boolean }
  | { type: 'TRIPOD'; deployed: boolean }
  | { type: 'LANCE'; dir: -1 | 0 | 1 }
  | { type: 'LANCE_TO'; z_m: number }
  | { type: 'LANCE_AUTO'; on: boolean }
  | { type: 'ARM' }
  | { type: 'ESTOP' }
  | { type: 'ESTOP_RESET' }
  | { type: 'VAC'; mode: VacMode }
  | { type: 'AUGER'; dir: -1 | 0 | 1 }
  | { type: 'AUGER_SPEED'; rpm: number }
  | { type: 'PCP'; run: boolean }
  | { type: 'PCP_SPEED'; rpm: number }
  | { type: 'JET'; on: boolean }
  | { type: 'AIR'; on: boolean }
  | { type: 'HEATER'; on: boolean }
  | { type: 'SEED_OVERRIDE'; reason: string }
  | { type: 'FINISH' }
  | { type: 'DECON_CONFIRM' }
  | { type: 'CLOSE_JOB' }
  | { type: 'FSTP_CHECKOUT'; facility: 'fstp' | 'drain' }
  | { type: 'FAULT_RESET' }
  | { type: 'SET_PARAM'; path: string; value: ParamValue }
  | { type: 'FAILURE'; key: FailureKey; on: boolean; s_m?: number; severity?: number }
  | { type: 'GAS_SPIKE'; mult: number }
  | { type: 'TRASH_BURST' };

export interface TimedCommand {
  step: number;
  cmd: Command;
}
