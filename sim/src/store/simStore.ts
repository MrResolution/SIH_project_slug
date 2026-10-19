import { create } from 'zustand';
import { HISTORY_COLUMNS, type SimEvent, type SimMode, type Snapshot, type TelemetryMessage } from '../core';

export type CameraPreset = 'overview' | 'lane' | 'site' | 'pit' | 'skid' | 'hose' | 'tanker' | 'follow';
export type RightTab = 'instruments' | 'charts' | 'analysis' | 'sandbox' | 'telemetry';
export type HeatField = 'ts' | 'tau' | 'mobility';

export interface ViewFlags {
  cutaway: boolean;
  xray: boolean;
  heat: HeatField;
  gas: boolean;
  labels: boolean;
  weather: boolean;
}

export interface Perf {
  stepsPerSec: number;
  stepCost_us: number;
  lagging: boolean;
  fps: number;
}

const MAX_POINTS = 14400;
const MAX_EVENTS = 600;

export interface SimStore {
  ready: boolean;
  error: string | null;
  scenarioId: string;
  seed: number;
  mode: SimMode;
  /** Latest snapshot (≈ 30 Hz) — read with getState() inside render loops. */
  snap: Snapshot | null;
  /** Throttled snapshot (≈ 8 Hz) for React panels. */
  ui: Snapshot | null;
  perf: Perf;
  speed: number;
  paused: boolean;
  events: SimEvent[];
  /** Column-major history (HISTORY_COLUMNS order); `historyVersion` bumps on append. */
  history: (number | null)[][];
  historyVersion: number;
  telemetry: TelemetryMessage[];
  camera: CameraPreset;
  cameraNonce: number;
  view: ViewFlags;
  rightTab: RightTab;
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  pendantOpen: boolean;
  helpOpen: boolean;
  briefingOpen: boolean;
  sound: boolean;
  selected: string | null;

  setCamera: (c: CameraPreset) => void;
  setView: (v: Partial<ViewFlags>) => void;
  set: (p: Partial<SimStore>) => void;
  resetData: () => void;
}

const emptyHistory = () => HISTORY_COLUMNS.map(() => [] as (number | null)[]);

export const useSim = create<SimStore>((set) => ({
  ready: false,
  error: null,
  scenarioId: 'S02',
  seed: 42,
  mode: 'training',
  snap: null,
  ui: null,
  perf: { stepsPerSec: 0, stepCost_us: 0, lagging: false, fps: 0 },
  speed: 4,
  paused: false,
  events: [],
  history: emptyHistory(),
  historyVersion: 0,
  telemetry: [],
  camera: 'overview',
  cameraNonce: 0,
  view: { cutaway: true, xray: false, heat: 'ts', gas: true, labels: true, weather: true },
  rightTab: 'instruments',
  // Side panels overlay the view on tablets, so start them closed there.
  leftOpen: typeof window === 'undefined' || window.innerWidth > 1180,
  rightOpen: typeof window === 'undefined' || window.innerWidth > 1180,
  bottomOpen: true,
  pendantOpen: false,
  helpOpen: false,
  briefingOpen: true,
  sound: false,
  selected: null,

  setCamera: (c) => set((s) => ({ camera: c, cameraNonce: s.cameraNonce + 1 })),
  setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
  set: (p) => set(p),
  resetData: () => set({ snap: null, ui: null, events: [], history: emptyHistory(), historyVersion: 0, telemetry: [] }),
}));

let lastUi = 0;

/** Applies a worker snapshot message to the store. */
export function ingest(snap: Snapshot, events: SimEvent[], rows: number[][], telemetry: TelemetryMessage[], perf: Omit<Perf, 'fps'> & { speed: number; paused: boolean }) {
  const st = useSim.getState();
  const patch: Partial<SimStore> = { snap };
  const now = performance.now();
  if (now - lastUi > 120 || events.length) {
    lastUi = now;
    patch.ui = snap;
    patch.perf = { ...st.perf, stepsPerSec: perf.stepsPerSec, stepCost_us: perf.stepCost_us, lagging: perf.lagging };
  }
  if (events.length) {
    const all = st.events.concat(events);
    patch.events = all.length > MAX_EVENTS ? all.slice(all.length - MAX_EVENTS) : all;
  }
  if (rows.length) {
    const h = st.history;
    for (const r of rows) for (let c = 0; c < h.length; c++) h[c].push(Number.isFinite(r[c]) ? r[c] : null);
    if (h[0].length > MAX_POINTS) for (const col of h) col.splice(0, col.length - MAX_POINTS);
    patch.historyVersion = st.historyVersion + 1;
  }
  if (telemetry.length) {
    const all = st.telemetry.concat(telemetry);
    patch.telemetry = all.length > 300 ? all.slice(all.length - 300) : all;
  }
  useSim.setState(patch);
}
