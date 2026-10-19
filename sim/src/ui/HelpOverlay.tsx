import { useSim } from '../store/simStore';

const KEYS: [string, string][] = [
  ['Space', 'Pause / resume'],
  ['1 – 4', 'Time scale ×0.25 · ×1 · ×4 · ×16'],
  ['E', 'E-STOP (latches; twist-reset on the pendant)'],
  ['C', 'Toggle pit / ground cutaway'],
  ['X', 'Toggle X-ray (hose flow, PCP rotor)'],
  ['G', 'Toggle gas plume'],
  ['O · K · B', 'Camera: overview · pit · booster skid'],
  ['F', 'Full-screen viewport (hide side panels)'],
  ['P', 'Collapse / expand the P&ID strip'],
  ['?', 'This help'],
];

export function HelpOverlay() {
  const open = useSim((s) => s.helpOpen);
  const set = useSim((s) => s.set);
  if (!open) return null;
  return (
    <div className="modal-back" onClick={() => set({ helpOpen: false })}>
      <div className="modal" style={{ width: 'min(720px, 100%)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="modal-head">
          <div className="sec-title">Help</div>
          <h1 id="help-title">Controls and how to read the twin</h1>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
          <div>
            <div className="sec-title" style={{ marginBottom: 10 }}>
              Keyboard
            </div>
            {KEYS.map(([k, d]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 12.5 }}>
                <span className="kbd" style={{ minWidth: 64 }}>
                  {k}
                </span>
                <span className="dim2">{d}</span>
              </div>
            ))}
            <div className="note" style={{ marginTop: 12 }}>
              Mouse: drag to orbit, right-drag to pan, wheel to zoom. Click a P&amp;ID symbol to fly the camera to that component.
            </div>
          </div>
          <div className="note" style={{ fontSize: 12.5 }}>
            <div className="sec-title" style={{ marginBottom: 10 }}>
              Reading the screen
            </div>
            <p>
              <b>Interlock ring</b> (top of the 3D view): red = K1 open, amber = machine power but PCP not enabled, green = PCP enabled. The pendant shows the reason when a button is blocked.
            </p>
            <p>
              <b>Colours</b> on the pit, hoses and P&amp;ID show total solids: pale = liquid, green = conditioned slurry (≤ 12 %), brown = cake. Hose X-ray colours show pressure.
            </p>
            <p>
              <b>Alarms</b> always use shape + colour + sound: ▲ alarm, ◆ warning, ● normal.
            </p>
            <p>
              <b>Physics</b>: lumped models from docs/04 at a fixed 100 Hz in a Web Worker, deterministic per seed. Values tagged <i>assumed</i> in the Sandbox await rig calibration.
            </p>
          </div>
        </div>
        <div className="modal-foot">
          <span className="dim" style={{ fontSize: 12 }}>
            Share an exact setup with <span className="mono">?scenario=S02&amp;mode=sandbox&amp;seed=42</span>
          </span>
          <button className="btn primary" onClick={() => set({ helpOpen: false })}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
