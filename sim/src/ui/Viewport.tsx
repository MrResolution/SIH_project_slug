import { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AlertTriangle, Eye, Layers, Scan, Snowflake, Tag, Wind } from 'lucide-react';
import { Scene } from '../scene/Scene';
import { useSim, type CameraPreset } from '../store/simStore';
import { Pendant } from './Pendant';
import { TS_STOPS, P_STOPS, TAU_STOPS, MOB_STOPS, cssGradient } from './colors';
import { clock, dur, fmt } from './format';

const CAMS: [CameraPreset, string][] = [
  ['overview', 'Overview'],
  ['lane', 'Lane'],
  ['site', 'Site'],
  ['pit', 'Pit'],
  ['skid', 'Skid'],
  ['hose', 'Hose'],
  ['tanker', 'Tanker'],
  ['follow', 'Follow'],
];

/** Measures render FPS into the store (for the perf readout). */
function FpsProbe() {
  const acc = useRef({ n: 0, t: performance.now() });
  useFrame(() => {
    const a = acc.current;
    a.n++;
    const now = performance.now();
    if (now - a.t > 1000) {
      const fps = (a.n * 1000) / (now - a.t);
      a.n = 0;
      a.t = now;
      const p = useSim.getState().perf;
      useSim.setState({ perf: { ...p, fps } });
    }
  });
  return null;
}

export function Viewport() {
  const ready = useSim((s) => s.ready);
  const error = useSim((s) => s.error);
  return (
    <>
      <div className="vp-canvas">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
          camera={{ fov: 42, near: 0.08, far: 3000, position: [62, 58, 58] }}
          onCreated={(state) => {
            state.gl.localClippingEnabled = true;
            if (import.meta.env.DEV) (window as unknown as { __r3f: unknown }).__r3f = state;
          }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
          <FpsProbe />
        </Canvas>
      </div>
      {!ready && !error && <div className="loading">Starting the physics worker…</div>}
      {error && (
        <div className="loading" style={{ color: 'var(--alarm)' }}>
          {error}
        </div>
      )}
      <CameraBar />
      <ViewBar />
      <InterlockHud />
      <AlarmBanner />
      <DriveHud />
      <SiteBadge />
      <Legend />
      <Pendant />
    </>
  );
}

function CameraBar() {
  const cam = useSim((s) => s.camera);
  const setCamera = useSim((s) => s.setCamera);
  return (
    <div className="overlay cam-bar">
      <div className="seg text" role="radiogroup" aria-label="Camera">
        {CAMS.map(([k, l]) => (
          <button key={k} className={cam === k ? 'on accent' : ''} onClick={() => setCamera(k)} role="radio" aria-checked={cam === k}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function ViewBar() {
  const view = useSim((s) => s.view);
  const setView = useSim((s) => s.setView);
  const items: { k: keyof typeof view; label: string; icon: typeof Eye; key: string }[] = [
    { k: 'cutaway', label: 'Cutaway', icon: Layers, key: 'C' },
    { k: 'xray', label: 'X-ray', icon: Scan, key: 'X' },
    { k: 'gas', label: 'Gas', icon: Wind, key: 'G' },
    { k: 'labels', label: 'Labels', icon: Tag, key: '' },
    { k: 'weather', label: 'Snow', icon: Snowflake, key: '' },
  ];
  return (
    <div className="overlay view-bar glass" role="toolbar" aria-label="View layers">
      {items.map((it) => (
        <button key={it.k} className={`btn sm ${view[it.k] ? 'on' : ''}`} onClick={() => setView({ [it.k]: !view[it.k] })} aria-pressed={!!view[it.k]} title={it.key ? `${it.label} (${it.key})` : it.label}>
          <it.icon size={13} />
          <span className="lbl">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

function InterlockHud() {
  const ui = useSim((s) => s.ui);
  if (!ui) return null;
  const j = ui.job;
  const ring = j.k2 ? 'green' : j.k1 ? 'amber' : 'red';
  let s1 = j.k2 ? 'PCP ENABLED' : j.k1 ? 'MACHINE POWER · PCP LOCKED' : 'MACHINE LOCKED';
  let s2 = '';
  if (!j.k1) s2 = j.k1Block[0]?.text ?? '';
  else if (!j.k2) s2 = j.k2Block[0]?.text ?? '';
  else s2 = `${fmt(ui.hose.q_lpm, 0)} L/min to tanker · PT-02 ${fmt(ui.hose.pD_bar, 1)} bar`;
  if (j.override) {
    s1 = 'INTERLOCK OVERRIDE (SANDBOX)';
    s2 = 'logged in the recording';
  }
  return (
    <div className="overlay il-hud glass" role="status" aria-live="polite">
      <div className={`il-ring ${ring}`}>
        <svg width="14" height="14" viewBox="0 0 14 14">
          {ring === 'green' ? <path d="M3 7.4 L6 10 L11 4" stroke="#37d08f" strokeWidth="2" fill="none" strokeLinecap="round" /> : ring === 'amber' ? <rect x="4.5" y="4.5" width="5" height="5" transform="rotate(45 7 7)" fill="#f3b343" /> : <path d="M7 2 L12.5 12 H1.5 Z" fill="#ff5a5f" />}
        </svg>
      </div>
      <div className="il-text">
        <div className="s1">{s1}</div>
        <div className="s2">{s2}</div>
      </div>
      {!j.ventDone && j.vent_s > 0 && (
        <div className="mono" style={{ fontSize: 12, color: 'var(--warn)', marginLeft: 6 }}>
          ⏱ {dur(j.ventTotal_s - j.vent_s)}
        </div>
      )}
    </div>
  );
}

function AlarmBanner() {
  const ui = useSim((s) => s.ui);
  const events = useSim((s) => s.events);
  if (!ui) return null;
  if (!ui.alarms.length && ui.job.state !== 'Fault') return null;
  const last = [...events].reverse().find((e) => e.sev === 'alarm');
  if (!last) return null;
  return (
    <div className="overlay alarm-banner" role="alert">
      <AlertTriangle size={18} />
      <span>{last.msg}</span>
    </div>
  );
}

function DriveHud() {
  const ui = useSim((s) => s.ui);
  const setCamera = useSim((s) => s.setCamera);
  const cam = useSim((s) => s.camera);
  useEffect(() => {
    // Chase the crawler automatically when it starts moving from the overview.
    if (ui?.vehicle.moving && cam === 'overview') setCamera('follow');
  }, [ui?.vehicle.moving, cam, setCamera]);
  if (!ui || !ui.vehicle.moving) return null;
  const v = ui.vehicle;
  return (
    <div className="overlay drive-hud glass">
      <div className="kv">
        <div className="k">Crawler</div>
        <div className="v mono">{v.target === 'pit' ? 'descending' : 'climbing'}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div className="progress">
          <div style={{ width: `${(v.s_m / v.laneLength_m) * 100}%` }} />
        </div>
        <div className="dim mono" style={{ fontSize: 10.5, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
          <span>
            {fmt(v.s_m, 0)} / {fmt(v.laneLength_m, 0)} m
          </span>
          <span>hose paid out {fmt(Math.min(ui.hose.length_m, v.s_m + 6), 0)} m</span>
        </div>
      </div>
      <div className="kv">
        <div className="k">Pitch</div>
        <div className="v mono">{fmt(Math.abs(v.pitch_deg), 0)}°</div>
      </div>
      <div className="kv">
        <div className="k">Speed</div>
        <div className="v mono">{fmt(v.v_ms, 2)} m/s</div>
      </div>
    </div>
  );
}

function SiteBadge() {
  const ui = useSim((s) => s.ui);
  const fps = useSim((s) => s.perf.fps);
  if (!ui) return null;
  return (
    <div className="overlay site-badge glass">
      <div className="kv">
        <div className="k">Altitude</div>
        <div className="v">{ui.env.altitude_m} m</div>
      </div>
      <div className="kv">
        <div className="k">P_atm</div>
        <div className="v">{fmt(ui.env.pAtm_kPa, 1)} kPa</div>
      </div>
      <div className="kv">
        <div className="k">Ambient</div>
        <div className="v">{fmt(ui.env.tAmb_C, 1)} °C</div>
      </div>
      <div className="kv">
        <div className="k">Wind</div>
        <div className="v">{fmt(ui.env.wind_ms, 1)} m/s E</div>
      </div>
      <div className="kv tb-hide-md">
        <div className="k">Local</div>
        <div className="v">{clock(ui.clock_s).slice(0, 5)}</div>
      </div>
      <div className="kv tb-hide-md">
        <div className="k">Render</div>
        <div className="v">{fmt(fps, 0)} fps</div>
      </div>
    </div>
  );
}

function Legend() {
  const view = useSim((s) => s.view);
  const xray = view.xray;
  const heat = view.heat;
  const stops = xray ? P_STOPS : heat === 'tau' ? TAU_STOPS : heat === 'mobility' ? MOB_STOPS : TS_STOPS;
  const [lo, hi] = xray ? [0, 22] : heat === 'tau' ? [0, 2.5] : heat === 'mobility' ? [0, 1] : [0, 24];
  const ticks = xray ? ['0', '5', '10', '15', '20 bar'] : heat === 'tau' ? ['1', '10', '30', '100', '300 Pa'] : heat === 'mobility' ? ['stuck', '', '', '', 'mobile'] : ['0', '6', '12', '18', '24 % TS'];
  const title = xray ? 'Hose pressure (X-ray)' : heat === 'tau' ? 'Yield stress τy' : heat === 'mobility' ? 'Mobility at the intake' : 'Total solids — target ≤ 12 %';
  return (
    <div className="overlay legend glass" style={{ left: 12, right: 'auto', bottom: 66 }}>
      <div className="sec-title" style={{ fontSize: 10 }}>
        {title}
      </div>
      <div className="ramp" style={{ background: cssGradient(stops, lo, hi) }} />
      <div className="ticks">
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  );
}
