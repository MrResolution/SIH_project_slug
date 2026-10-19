/**
 * Job state machine — docs/03 §5.2, as a pure transition table so it runs
 * deterministically in the worker and is exhaustively testable.
 *
 * Refinements over the statechart (documented, deliberate):
 *  - Fault → reset returns to Armed when K1 is still closed, or to Ventilating
 *    when it is not (e.g. after a gas fault the vent timer has restarted). The
 *    diagram's Fault → Idle would force a new check-in and split the job record.
 *  - FINISH is accepted from Extracting / Jetting too, so the crew can end a job
 *    before the seed-layer limit (e.g. suction lost on the last of the cake).
 */

export type JobStateName =
  | 'PowerOff'
  | 'Idle'
  | 'CheckIn'
  | 'Setup'
  | 'Ventilating'
  | 'GasHold'
  | 'Armed'
  | 'Priming'
  | 'Extracting'
  | 'Jetting'
  | 'SeedLimit'
  | 'Purging'
  | 'Decon'
  | 'CheckOut'
  | 'Fault';

export type JobEventType =
  | 'KEY_ON'
  | 'SCAN_QR'
  | 'CREW_LOGGED'
  | 'SETUP_DONE'
  | 'GAS_UNSAFE'
  | 'GAS_SAFE'
  | 'ARM'
  | 'VAC_START'
  | 'PCP_START'
  | 'JET_ON'
  | 'JET_OFF'
  | 'SEED_LIMIT'
  | 'OVERRIDE'
  | 'FINISH'
  | 'FAULT'
  | 'RESET_TO_ARMED'
  | 'RESET_TO_VENT'
  | 'PURGED'
  | 'DECON_OK'
  | 'CLOSE';

export const TRANSITIONS: Record<JobStateName, Partial<Record<JobEventType, JobStateName>>> = {
  PowerOff: { KEY_ON: 'Idle' },
  Idle: { SCAN_QR: 'CheckIn' },
  CheckIn: { CREW_LOGGED: 'Setup' },
  Setup: { SETUP_DONE: 'Ventilating' },
  Ventilating: { GAS_UNSAFE: 'GasHold', ARM: 'Armed' },
  GasHold: { GAS_SAFE: 'Ventilating' },
  Armed: { VAC_START: 'Priming', FAULT: 'Fault' },
  Priming: { PCP_START: 'Extracting', FAULT: 'Fault' },
  Extracting: { JET_ON: 'Jetting', SEED_LIMIT: 'SeedLimit', FINISH: 'Purging', FAULT: 'Fault' },
  Jetting: { JET_OFF: 'Extracting', SEED_LIMIT: 'SeedLimit', FINISH: 'Purging', FAULT: 'Fault' },
  SeedLimit: { OVERRIDE: 'Extracting', FINISH: 'Purging', FAULT: 'Fault' },
  Purging: { PURGED: 'Decon', FAULT: 'Fault' },
  Decon: { DECON_OK: 'CheckOut' },
  CheckOut: { CLOSE: 'Idle' },
  Fault: { RESET_TO_ARMED: 'Armed', RESET_TO_VENT: 'Ventilating' },
};

export function transition(state: JobStateName, ev: JobEventType): JobStateName | null {
  return TRANSITIONS[state][ev] ?? null;
}

/** States in which machine power (K1-gated motors) may run. */
export const RUN_STATES: ReadonlySet<JobStateName> = new Set(['Armed', 'Priming', 'Extracting', 'Jetting', 'SeedLimit', 'Purging']);
/** States in which the PCP may run (additionally needs K2). */
export const PCP_STATES: ReadonlySet<JobStateName> = new Set(['Priming', 'Extracting', 'Jetting', 'SeedLimit', 'Purging']);

export const STATE_LABEL: Record<JobStateName, string> = {
  PowerOff: 'Power off',
  Idle: 'Idle',
  CheckIn: 'Checked in',
  Setup: 'Setup',
  Ventilating: 'Ventilating',
  GasHold: 'Gas hold',
  Armed: 'Armed',
  Priming: 'Priming',
  Extracting: 'Extracting',
  Jetting: 'Jetting',
  SeedLimit: 'Seed limit',
  Purging: 'Purging',
  Decon: 'Decon',
  CheckOut: 'Check-out',
  Fault: 'FAULT',
};
