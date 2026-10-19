import { Download, HelpCircle, Pause, Play, RotateCcw, StepForward, Volume2, VolumeX } from 'lucide-react';
import { STATE_LABEL, type JobStateName } from '../core';
import { bridge } from '../bridge/simBridge';
import { useSim } from '../store/simStore';
import { SCENARIO_LIST } from '../data/scenes';
import { clock, dur, download } from './format';
import { audio } from './audio';

const SPEEDS = [0.25, 1, 4, 16];

export function stateTone(s: JobStateName): 'ok' | 'warn' | 'alarm' | 'info' | '' {
  if (s === 'Fault') return 'alarm';
  if (s === 'GasHold' || s === 'Ventilating' || s === 'SeedLimit') return 'warn';
  if (s === 'Armed' || s === 'Priming' || s === 'Extracting' || s === 'Jetting' || s === 'Purging') return 'ok';
  if (s === 'Decon' || s === 'CheckOut' || s === 'CheckIn' || s === 'Setup') return 'info';
  return '';
}

export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M2.5 18.5 L8.5 8.5 L12.5 13.5 L15.5 10 L21.5 18.5" fill="none" stroke="#4fc3ff" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M12.5 13.5 V21" stroke="#4fc3ff" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1.6 2.2" />
      <circle cx="12.5" cy="21" r="1.6" fill="#37d08f" />
    </svg>
  );
}

export function TopBar() {
  const ui = useSim((s) => s.ui);
  const speed = useSim((s) => s.speed);
  const paused = useSim((s) => s.paused);
  const mode = useSim((s) => s.mode);
  const scenarioId = useSim((s) => s.scenarioId);
  const seed = useSim((s) => s.seed);
  const sound = useSim((s) => s.sound);
  const perf = useSim((s) => s.perf);
  const set = useSim((s) => s.set);
  const st = ui?.job.state ?? 'Idle';
  const tone = stateTone(st);

  const restart = (m = mode) => {
    bridge.start(scenarioId, seed, m);
    set({ briefingOpen: true });
  };

  const exportRec = async () => {
    const r = await bridge.exportRecording();
    download(`${r.scenarioId}-seed${r.seed}-${r.steps}.json`, JSON.stringify(r, null, 2));
  };

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <BrandMark />
        </div>
        <div>
          <div className="brand-name">Probe-and-Mule</div>
          <div className="brand-sub">Digital twin · SIH PS 26258</div>
        </div>
      </div>

      <div className="tb-group">
        <select className="select" value={scenarioId} onChange={(e) => bridge.start(e.target.value, seed, mode)} aria-label="Scenario">
          {SCENARIO_LIST.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {s.title}
            </option>
          ))}
        </select>
        <button className="btn icon" onClick={() => restart()} title="Restart scenario" aria-label="Restart scenario">
          <RotateCcw size={15} />
        </button>
        <div className="seg text" role="radiogroup" aria-label="Mode">
          {(['training', 'sandbox'] as const).map((m) => (
            <button key={m} className={mode === m ? 'on accent' : ''} onClick={() => m !== mode && restart(m)} role="radio" aria-checked={mode === m} title={m === 'training' ? 'Interlocks always enforced, parameters locked' : 'Edit parameters, inject failures, override (logged)'}>
              {m === 'training' ? 'Training' : 'Sandbox'}
            </button>
          ))}
        </div>
      </div>

      <div className="tb-sep tb-hide-sm" />

      <div className="tb-group">
        <span className={`chip ${tone}`} title="Job state machine (docs/03 §5.2)">
          <StateGlyph tone={tone} />
          {STATE_LABEL[st].toUpperCase()}
        </span>
        <span className={`lamp tb-hide-tab ${ui?.job.k1 ? 'on' : 'off'}`} title="K1 · machine power (E-stop, gas, ventilation, watchdog)">
          <span className="dot">{ui?.job.k1 ? <Tick /> : <Cross />}</span>K1 <span className="sub tb-hide-lg">Machine</span>
        </span>
        <span className={`lamp tb-hide-tab ${ui?.job.k2 ? 'on' : 'off'}`} title="K2 · PCP enable (K1, outriggers, chocks, tilt, dry-run, pressure, stator)">
          <span className="dot">{ui?.job.k2 ? <Tick /> : <Cross />}</span>K2 <span className="sub tb-hide-lg">PCP</span>
        </span>
        {ui?.job.override && <span className="chip alarm">OVERRIDE</span>}
      </div>

      <div className="tb-spacer" />

      <div className="tb-group">
        <button className="btn icon" onClick={() => bridge.setPaused(!paused)} title={paused ? 'Resume (Space)' : 'Pause (Space)'} aria-label={paused ? 'Resume' : 'Pause'}>
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        {paused && (
          <button className="btn icon" onClick={() => bridge.stepOnce(1)} title="Step 1 s" aria-label="Step one second">
            <StepForward size={15} />
          </button>
        )}
        <div className="seg" role="radiogroup" aria-label="Time scale">
          {SPEEDS.map((s, i) => (
            <button key={s} className={!paused && speed === s ? 'on accent' : ''} onClick={() => bridge.setSpeed(s)} title={`×${s} (key ${i + 1})`} role="radio" aria-checked={!paused && speed === s}>
              ×{s}
            </button>
          ))}
        </div>
      </div>

      <div className="tb-sep" />

      <div className="clock" title="Site local time (IST) · job elapsed">
        <div className="big">{ui ? clock(ui.clock_s) : '--:--:--'}</div>
        <div className="small">
          {perf.lagging ? <span style={{ color: 'var(--warn)' }}>SIM LAGGING · </span> : null}T+{ui ? dur(ui.t) : '0:00'}
        </div>
      </div>

      <div className="tb-sep tb-hide-lg" />
      <div className="tb-group tb-hide-lg">
        <span className="dim mono" style={{ fontSize: 10.5 }} title="Worker steps per second (100 Hz × speed) · cost per step">
          {Math.round(perf.stepsPerSec)} st/s · {perf.stepCost_us.toFixed(0)} µs
        </span>
      </div>

      <div className="tb-group">
        <button className="btn icon ghost tb-hide-tab" onClick={exportRec} title="Download session recording (seed + commands, replayable)" aria-label="Download recording">
          <Download size={16} />
        </button>
        <button className="btn icon ghost" onClick={() => audio.setEnabled(!sound)} title={sound ? 'Mute' : 'Enable sound (alarms, pumps)'} aria-label={sound ? 'Mute' : 'Enable sound'}>
          {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <button className="btn icon ghost" onClick={() => set({ helpOpen: true })} title="Keyboard and help (?)" aria-label="Help">
          <HelpCircle size={16} />
        </button>
      </div>
    </header>
  );
}

const Tick = () => (
  <svg width="9" height="9" viewBox="0 0 10 10">
    <path d="M2 5.2 L4.2 7.3 L8 2.8" stroke="#06281a" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  </svg>
);
const Cross = () => (
  <svg width="8" height="8" viewBox="0 0 10 10">
    <path d="M2.5 2.5 L7.5 7.5 M7.5 2.5 L2.5 7.5" stroke="#ff5a5f" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

/** Shape + colour state glyph (never colour alone). */
export function StateGlyph({ tone, size = 10 }: { tone: string; size?: number }) {
  if (tone === 'alarm')
    return (
      <svg width={size} height={size} viewBox="0 0 10 10">
        <path d="M5 0.8 L9.4 9 H0.6 Z" fill="currentColor" />
      </svg>
    );
  if (tone === 'warn')
    return (
      <svg width={size} height={size} viewBox="0 0 10 10">
        <rect x="1.5" y="1.5" width="7" height="7" transform="rotate(45 5 5)" fill="currentColor" />
      </svg>
    );
  return (
    <svg width={size} height={size} viewBox="0 0 10 10">
      <circle cx="5" cy="5" r="4" fill="currentColor" />
    </svg>
  );
}
