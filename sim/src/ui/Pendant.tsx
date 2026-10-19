import { useEffect, useRef, useState } from 'react';
import { Minus, Plus, SlidersHorizontal } from 'lucide-react';
import { STATE_LABEL, type Snapshot } from '../core';
import { send } from '../bridge/simBridge';
import { useSim } from '../store/simStore';
import { fmt } from './format';

/**
 * Virtual twin of the hardware pendant (docs/simulation/05 §3). Buttons never
 * grey out — like the real controller, a blocked press is refused by the
 * interlock and the reason appears on the 2-line display.
 */
export function Pendant() {
  const ui = useSim((s) => s.ui);
  const events = useSim((s) => s.events);
  const open = useSim((s) => s.pendantOpen);
  const set = useSim((s) => s.set);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [augerRpm, setAugerRpm] = useState(300);
  const [pcpRpm, setPcpRpm] = useState(300);
  const [twist, setTwist] = useState(0);
  const twistRef = useRef<{ cx: number; cy: number; a0: number } | null>(null);
  const [blockMsg, setBlockMsg] = useState<{ text: string; at: number } | null>(null);
  // Start minimised when the 3D view is short (laptops), so the scene stays visible.
  const [mini, setMini] = useState(() => typeof window !== 'undefined' && window.innerHeight < 820);

  // Latest blocked attempt goes to the display for a few seconds.
  useEffect(() => {
    const last = events[events.length - 1];
    if (last && last.code === 'W_BLOCKED') setBlockMsg({ text: last.msg.replace(/^Blocked: /, ''), at: performance.now() });
  }, [events]);
  useEffect(() => {
    if (!blockMsg) return;
    const id = setTimeout(() => setBlockMsg(null), 5000);
    return () => clearTimeout(id);
  }, [blockMsg]);

  useEffect(() => {
    if (ui) {
      setAugerRpm(ui.probe.augerSet_rpm);
      setPcpRpm(ui.pcp.set_rpm);
    }
    // only on (re)load of a session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui?.job.jobId === null]);

  if (!ui) return null;
  const parent = box.current?.parentElement;
  const style = pos ? { left: pos.x, top: pos.y } : { right: 14, bottom: 14 };

  const onGrip = (e: React.PointerEvent) => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !parent) return;
    const pr = parent.getBoundingClientRect();
    const w = box.current?.offsetWidth ?? 300;
    const h = box.current?.offsetHeight ?? 400;
    setPos({ x: Math.max(4, Math.min(pr.width - w - 4, e.clientX - pr.left - drag.current.dx)), y: Math.max(4, Math.min(pr.height - h - 4, e.clientY - pr.top - drag.current.dy)) });
  };

  // E-STOP twist-reset: press latches; when latched, drag around the mushroom ≥ 75° to release.
  const onEstopDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!ui.job.estop) {
      send({ type: 'ESTOP' });
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    twistRef.current = { cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx) };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onEstopMove = (e: React.PointerEvent) => {
    const t = twistRef.current;
    if (!t) return;
    let d = ((Math.atan2(e.clientY - t.cy, e.clientX - t.cx) - t.a0) * 180) / Math.PI;
    if (d < -180) d += 360;
    if (d > 180) d -= 360;
    setTwist(Math.max(0, d));
    if (d >= 75) {
      twistRef.current = null;
      setTwist(0);
      send({ type: 'ESTOP_RESET' });
    }
  };
  const onEstopUp = () => {
    twistRef.current = null;
    setTwist(0);
  };

  const lcd = lcdLines(ui, blockMsg?.text ?? null);

  return (
    <div ref={box} className={`pendant ${mini ? 'mini' : ''}`} style={style} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
      <div className="grip" onPointerDown={onGrip}>
        <span>Pendant · U-0042</span>
        <span style={{ display: 'flex', gap: 2 }}>
          {!mini && (
            <button className="btn xs ghost icon" style={{ color: '#8d949e' }} onClick={() => set({ pendantOpen: !open })} onPointerDown={(e) => e.stopPropagation()} aria-label={open ? 'Hide speed dials' : 'Show speed dials'} title={open ? 'Hide speed dials' : 'Speed dials, heater, stop keys'}>
              <SlidersHorizontal size={12} />
            </button>
          )}
          <button className="btn xs ghost icon" style={{ color: '#8d949e' }} onClick={() => setMini(!mini)} onPointerDown={(e) => e.stopPropagation()} aria-label={mini ? 'Expand pendant' : 'Minimise pendant'}>
            {mini ? <Plus size={12} /> : <Minus size={12} />}
          </button>
        </span>
      </div>
      <div className="yellow" />
      <div className="lcd" aria-live="polite">
        <div>{lcd[0]}</div>
        <div className={`l2 ${lcd[2]}`}>{lcd[1]}</div>
      </div>
      {!mini && (
        <>
          <div className="pd-top">
            <button className={`estop ${ui.job.estop ? 'latched' : ''}`} onPointerDown={onEstopDown} onPointerMove={onEstopMove} onPointerUp={onEstopUp} aria-label={ui.job.estop ? 'E-stop latched: drag around to twist-reset' : 'Emergency stop'} title={ui.job.estop ? 'Latched — drag around the mushroom to twist-reset, then RESET' : 'E-STOP (key E): drops K1, all motors stop'}>
              <span className="mush" style={{ transform: `${ui.job.estop ? 'translateY(3px) scale(0.97) ' : ''}rotate(${twist}deg)` }}>
                {ui.job.estop ? 'TWIST' : 'STOP'}
              </span>
            </button>
            <div className="pd-grid2">
              <button className={`pbtn ${ui.job.state === 'Ventilating' && ui.job.k1 ? 'green' : ''} ${ui.job.k1 ? 'lit' : ''}`} onClick={() => send({ type: 'ARM' })} title="Arm machine power (needs K1)">
                <span className="led" />
                ARM
              </button>
              <button className={`pbtn ${ui.job.state === 'Fault' ? 'lit-amber' : ''}`} onClick={() => send({ type: 'FAULT_RESET' })} title="Reset a cleared fault">
                <span className="led" />
                RESET
              </button>
              <button className={`pbtn blue ${ui.cube.vaneMode === 'vac' ? 'lit' : ''}`} onClick={() => send({ type: 'VAC', mode: ui.cube.vaneMode === 'vac' ? 'off' : 'vac' })} title={`Vane pump vacuum · cube ${fmt(ui.cube.p_barg, 2)} bar(g)`}>
                <span className="led" />
                PRIME
              </button>
              <button className={`pbtn ${ui.cube.vaneMode === 'blow' ? 'lit-amber' : ''}`} onClick={() => send({ type: 'VAC', mode: ui.cube.vaneMode === 'blow' ? 'off' : 'blow' })} title="Vane pump blow (purge)">
                <span className="led" />
                BLOW
              </button>
            </div>
          </div>
          <div className="pd-label">
            <span>
              Auger <span className="mono">{fmt(ui.probe.auger_rpm, 0)}</span>
            </span>
            <span>
              PCP <span className="mono">{fmt(ui.pcp.rpm, 0)} rpm</span>
            </span>
          </div>
          <div className="pd-grid4">
            <button className={`pbtn ${ui.probe.augerDir < 0 ? 'lit-amber' : ''}`} onClick={() => send({ type: 'AUGER', dir: ui.probe.augerDir < 0 ? 0 : -1 })} title="Auger reverse — clears wraps and stalls">
              <span className="led" />⟲
            </button>
            <button className={`pbtn green ${ui.probe.augerDir > 0 ? 'lit' : ''}`} onClick={() => send({ type: 'AUGER', dir: ui.probe.augerDir > 0 ? 0 : 1 })} title="Auger forward (toggle)">
              <span className="led" />⟳
            </button>
            <button className={`pbtn green ${ui.pcp.run && ui.pcp.rpm > 1 ? 'lit' : ''}`} onClick={() => send({ type: 'PCP', run: true })} title="PCP start (needs K2)">
              <span className="led" />▶
            </button>
            <button className="pbtn red" onClick={() => send({ type: 'PCP', run: false })} title="PCP stop">
              ■
            </button>
            <button className={`pbtn ${ui.probe.jetCmd ? 'lit' : ''}`} onClick={() => send({ type: 'JET', on: !ui.probe.jetCmd })} title="3-way jetting valve">
              <span className="led" />
              JET
            </button>
            <button className={`pbtn ${ui.probe.airCmd ? 'lit' : ''}`} onClick={() => send({ type: 'AIR', on: !ui.probe.airCmd })} title="Air-assist sparger">
              <span className="led" />
              AIR
            </button>
            <button className={`pbtn ${ui.equip.lanceDir === 1 ? 'lit' : ''}`} onClick={() => send({ type: 'LANCE', dir: ui.equip.lanceDir === 1 ? 0 : 1 })} title={`Lance up · tip ${fmt(ui.equip.lanceZ_m, 2)} m`}>
              <span className="led" />▲
            </button>
            <button className={`pbtn ${ui.equip.lanceDir === -1 ? 'lit' : ''}`} onClick={() => send({ type: 'LANCE', dir: ui.equip.lanceDir === -1 ? 0 : -1 })} title={`Lance down · tip ${fmt(ui.equip.lanceZ_m, 2)} m`}>
              <span className="led" />▼
            </button>
          </div>
          {open && (
            <>
              <div className="dial">
                <span className="dlbl">AUG</span>
                <input type="range" min={0} max={300} step={10} value={augerRpm} onChange={(e) => setAugerRpm(+e.target.value)} onPointerUp={() => send({ type: 'AUGER_SPEED', rpm: augerRpm })} onKeyUp={() => send({ type: 'AUGER_SPEED', rpm: augerRpm })} aria-label="Auger speed" />
                <span className="num">{augerRpm} rpm</span>
              </div>
              <div className="dial">
                <span className="dlbl">PCP</span>
                <input type="range" min={200} max={500} step={10} value={pcpRpm} onChange={(e) => setPcpRpm(+e.target.value)} onPointerUp={() => send({ type: 'PCP_SPEED', rpm: pcpRpm })} onKeyUp={() => send({ type: 'PCP_SPEED', rpm: pcpRpm })} aria-label="PCP speed" />
                <span className="num">{pcpRpm} rpm</span>
              </div>
              <div className="pd-grid4" style={{ marginTop: 8 }}>
                <button className="pbtn" onClick={() => send({ type: 'AUGER', dir: 0 })} title="Auger stop">
                  AUG ■
                </button>
                <button className="pbtn" onClick={() => send({ type: 'VAC', mode: 'off' })} title="Vane pump off">
                  VAC ■
                </button>
                <button className={`pbtn ${ui.equip.lanceAuto ? 'lit' : ''}`} onClick={() => send({ type: 'LANCE_AUTO', on: !ui.equip.lanceAuto })} title="Winch auto-follow (DT-01)">
                  <span className="led" />
                  AUTO
                </button>
                <button className={`pbtn ${ui.equip.heaterCmd ? 'lit-amber' : ''}`} onClick={() => send({ type: 'HEATER', on: !ui.equip.heaterCmd })} title="Jacket and pack heater (thermostatic)">
                  <span className="led" />
                  HEAT
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function lcdLines(ui: Snapshot, blocked: string | null): [string, string, '' | 'warn' | 'alarm'] {
  const st = STATE_LABEL[ui.job.state].toUpperCase();
  const k = `K1${ui.job.k1 ? '●' : '○'} K2${ui.job.k2 ? '●' : '○'}`;
  const l1 = `${st.padEnd(11)} ${k}`;
  if (blocked) return [l1, `✕ ${blocked}`, 'warn'];
  if (ui.job.state === 'Fault') return [l1, `FAULT ${ui.job.faults.join(' ')} — clear, then RESET`, 'alarm'];
  if (ui.gas.alarm && ui.equip.snifferPlaced) return [l1, `GAS ${ui.gas.alarmSpecies.join(' ')} · H2S ${fmt(ui.gas.sensed.h2s_ppm, 0)} ppm`, 'alarm'];
  if (ui.job.estop) return [l1, 'E-STOP LATCHED', 'alarm'];
  if (ui.probe.stalled) return [l1, 'AUGER OVERLOAD — REVERSE', 'alarm'];
  if (!ui.job.k1 && ui.job.k1Block.length && ['Setup', 'Ventilating', 'GasHold'].includes(ui.job.state)) return [l1, ui.job.k1Block[0].text, 'warn'];
  if (ui.hose.reliefOpen) return [l1, `RELIEF OPEN ${fmt(ui.hose.pD_bar, 1)} bar`, 'warn'];
  if (ui.suction.stalled) return [l1, 'SUCTION STALLED — LIFT LIMIT', 'warn'];
  if (ui.pcp.rpm > 5) return [l1, `Q ${fmt(ui.hose.q_lpm, 0)} L/min  P ${fmt(ui.hose.pD_bar, 1)} bar  TS ${fmt(ui.suction.tsMix, 1)}%`, ''];
  if (ui.job.state === 'Priming') return [l1, `PRIMING · cube ${fmt(ui.cube.level_L, 0)} L`, ''];
  return [l1, ui.job.ventDone ? 'READY' : 'Follow the SOP on the left', ''];
}
