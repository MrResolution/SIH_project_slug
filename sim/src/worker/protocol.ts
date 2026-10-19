import type { Command, SimMode, SnapshotMessage, TimedCommand } from '../core';

/** Main thread → worker. */
export type ToWorker =
  | { type: 'init'; scenarioId: string; seed: number; mode: SimMode }
  | { type: 'cmd'; cmd: Command }
  | { type: 'speed'; speed: number }
  | { type: 'pause'; paused: boolean }
  | { type: 'stepOnce'; seconds: number }
  | { type: 'exportRecording' };

export interface Recording {
  format: 'probe-and-mule/recording@1';
  scenarioId: string;
  seed: number;
  mode: SimMode;
  steps: number;
  hash: string;
  commands: TimedCommand[];
}

/** Worker → main thread. */
export type FromWorker = SnapshotMessage | { type: 'ready'; scenarioId: string; seed: number } | { type: 'recording'; recording: Recording } | { type: 'error'; message: string };
