/**
 * @sim/core — renderer-independent process physics, controller emulation and
 * telemetry. No DOM / three / react imports (docs/simulation/02 §2).
 */
export { Sim, createSim, type SimOptions } from './sim';
export { DT, SOP_STEPS, type SimGeometry, type SimState } from './state';
export type { Command, FailureKey, VacMode, TimedCommand } from './commands';
export type { Snapshot, SnapshotMessage, SimMode } from './snapshot';
export type { SimEvent, Severity } from './events';
export { HISTORY_COLUMNS, HCOL, HISTORY_DT, type HistoryColumn } from './history';
export { PARAM_META, defaultParams, getPath, pcpMotor_kW, type Params, type ParamMeta, type ParamGroup } from './params';
export { SOP, type SopStep } from './control/sop';
export { STATE_LABEL, type JobStateName } from './control/jobMachine';
export type { TelemetryMessage } from './telemetry/encoder';
export type { Scenario } from './scenario';
