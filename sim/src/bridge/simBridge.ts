import type { Command, SimMode } from '../core';
import type { FromWorker, Recording, ToWorker } from '../worker/protocol';
import { ingest, useSim } from '../store/simStore';
import { audio } from '../ui/audio';

/**
 * Main-thread side of the worker bridge: commands go in, snapshots come out
 * (docs/simulation/02 §2). One worker per session; re-init on scenario reset.
 */
class SimBridge {
  private worker: Worker | null = null;
  private onRecording: ((r: Recording) => void) | null = null;

  start(scenarioId: string, seed: number, mode: SimMode) {
    if (!this.worker) {
      this.worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
      this.worker.onerror = (e) => useSim.setState({ error: e.message || 'Simulation worker failed' });
    }
    useSim.getState().resetData();
    useSim.setState({ scenarioId, seed, mode, ready: false, error: null });
    this.post({ type: 'init', scenarioId, seed, mode });
    const { speed, paused } = useSim.getState();
    this.post({ type: 'speed', speed });
    this.post({ type: 'pause', paused });
  }

  private post(m: ToWorker) {
    this.worker?.postMessage(m);
  }

  private receive(m: FromWorker) {
    switch (m.type) {
      case 'ready':
        // Drop anything a previous session (e.g. a StrictMode double start) already posted.
        useSim.getState().resetData();
        useSim.setState({ ready: true });
        break;
      case 'snapshot':
        ingest(m.snap, m.events, m.history, m.telemetry, m.perf);
        if (m.events.length) audio.onEvents(m.events);
        audio.onSnapshot(m.snap);
        break;
      case 'recording':
        this.onRecording?.(m.recording);
        this.onRecording = null;
        break;
      case 'error':
        useSim.setState({ error: m.message });
        break;
    }
  }

  send(cmd: Command) {
    audio.click();
    this.post({ type: 'cmd', cmd });
  }

  setSpeed(speed: number) {
    useSim.setState({ speed, paused: false });
    this.post({ type: 'speed', speed });
    this.post({ type: 'pause', paused: false });
  }

  setPaused(paused: boolean) {
    useSim.setState({ paused });
    this.post({ type: 'pause', paused });
  }

  stepOnce(seconds: number) {
    this.post({ type: 'stepOnce', seconds });
  }

  exportRecording(): Promise<Recording> {
    return new Promise((resolve) => {
      this.onRecording = resolve;
      this.post({ type: 'exportRecording' });
    });
  }
}

export const bridge = new SimBridge();
export const send = (cmd: Command) => bridge.send(cmd);
