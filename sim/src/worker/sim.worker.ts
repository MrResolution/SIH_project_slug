/// <reference lib="webworker" />
import { DT, Sim } from '../core';
import { SCENARIOS, geometryFor } from '../data/scenes';
import type { FromWorker, ToWorker } from './protocol';

/**
 * The physics runs here at a fixed 100 Hz, independent of the frame rate
 * (SIM-NFR-03). At ×N the worker runs N steps per 10 ms of wall time up to a
 * CPU budget; if it falls behind it reports "lagging" and drops the backlog.
 * @see docs/simulation/02 §4
 */

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: FromWorker) => ctx.postMessage(m);

let sim: Sim | null = null;
let speed = 1;
let paused = false;
let acc = 0;
let lastWall = performance.now();
let lastPost = 0;
let lastEventSeq = 0;
let lastHistT = -1;
let lastTelemSeq = 0;
let stepsWindow = 0;
let costWindow = 0;
let windowStart = performance.now();
let stepsPerSec = 0;
let stepCost = 0;
let lagging = false;
let timer: ReturnType<typeof setTimeout> | null = null;

const BUDGET_MS = 9;
const POST_MS = 33;

function publish() {
  if (!sim) return;
  const events = sim.log.since(lastEventSeq);
  if (events.length) lastEventSeq = events[events.length - 1].seq;
  const h = sim.history;
  let i = h.length;
  while (i > 0 && h[i - 1][0] > lastHistT) i--;
  const rows = h.slice(i);
  if (rows.length) lastHistT = rows[rows.length - 1][0];
  const telemetry = sim.telem.out.filter((m) => m.seq > lastTelemSeq);
  if (telemetry.length) lastTelemSeq = telemetry[telemetry.length - 1].seq;
  post({ type: 'snapshot', snap: sim.snapshot(), events, history: rows, telemetry, perf: { stepsPerSec, stepCost_us: stepCost, lagging, speed, paused } });
}

function tick() {
  const now = performance.now();
  const dtWall = Math.min(0.25, (now - lastWall) / 1000);
  lastWall = now;
  if (sim && !paused) {
    acc += dtWall * speed;
    const t0 = performance.now();
    let n = 0;
    while (acc >= DT) {
      sim.step();
      acc -= DT;
      n++;
      if (performance.now() - t0 > BUDGET_MS) break;
    }
    const cost = performance.now() - t0;
    lagging = acc > 0.5;
    if (lagging) acc = 0.1;
    stepsWindow += n;
    costWindow += cost;
  }
  if (now - windowStart >= 1000) {
    stepsPerSec = stepsWindow / ((now - windowStart) / 1000);
    stepCost = stepsWindow ? (costWindow / stepsWindow) * 1000 : 0;
    stepsWindow = 0;
    costWindow = 0;
    windowStart = now;
  }
  if (now - lastPost >= POST_MS) {
    lastPost = now;
    publish();
  }
  timer = setTimeout(tick, 4);
}

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    switch (m.type) {
      case 'init': {
        const sc = SCENARIOS[m.scenarioId];
        if (!sc) throw new Error(`Unknown scenario ${m.scenarioId}`);
        sim = new Sim({ scenario: sc, geometry: geometryFor(sc.scene), seed: m.seed, mode: m.mode });
        lastEventSeq = 0;
        lastHistT = -1;
        lastTelemSeq = 0;
        acc = 0;
        lastWall = performance.now();
        post({ type: 'ready', scenarioId: m.scenarioId, seed: m.seed });
        publish();
        if (!timer) tick();
        break;
      }
      case 'cmd':
        sim?.enqueue(m.cmd);
        break;
      case 'speed':
        speed = Math.max(0.05, Math.min(64, m.speed));
        break;
      case 'pause':
        paused = m.paused;
        acc = 0;
        break;
      case 'stepOnce':
        if (sim) {
          sim.run(m.seconds);
          publish();
        }
        break;
      case 'exportRecording':
        if (sim)
          post({
            type: 'recording',
            recording: { format: 'probe-and-mule/recording@1', scenarioId: sim.scenario.id, seed: sim.seed, mode: sim.mode, steps: sim.state.step, hash: sim.hash(), commands: sim.recorded },
          });
        break;
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
