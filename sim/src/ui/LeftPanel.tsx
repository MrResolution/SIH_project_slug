import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Info, Lock, QrCode, ShieldAlert, Square, Truck } from 'lucide-react';
import { SOP, type Snapshot } from '../core';
import { send } from '../bridge/simBridge';
import { useSim } from '../store/simStore';
import { SCENARIOS } from '../data/scenes';
import { dur, fmt, fmtInt } from './format';

export function LeftPanel() {
  const ui = useSim((s) => s.ui);
  const scenarioId = useSim((s) => s.scenarioId);
  const sc = SCENARIOS[scenarioId];
  const [open, setOpen] = useState<Set<number>>(new Set());
  if (!ui || !sc) return <div className="loading">Loading…</div>;
  const cur = ui.job.sopCurrent;
  const done = ui.job.sop.filter(Boolean).length;
  const c = sc.containment;

  const toggle = (i: number) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <>
      <div className="jobcard">
        <div className="sec-title">
          {sc.id} · {sc.site.name}
        </div>
        <h2>{sc.title.en}</h2>
        <div className="meta">
          <div className="kv">
            <div className="k">Household</div>
            <div className="v">
              {sc.household.label} <span className="dim mono">{sc.household.qr.slice(-5)}</span>
            </div>
          </div>
          <div className="kv">
            <div className="k">Job</div>
            <div className="v mono" style={{ fontSize: 11.5 }}>
              {ui.job.jobId ?? <span className="dim">not checked in</span>}
            </div>
          </div>
          <div className="kv">
            <div className="k">Containment</div>
            <div className="v">
              Septic · {c.l_m}×{c.w_m}×{c.depth_m} m
            </div>
          </div>
          <div className="kv">
            <div className="k">Contents</div>
            <div className="v">
              {fmtInt(ui.pit.volume0_L)} L · {c.lined ? 'lined' : 'unlined'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <div className="progress" style={{ flex: 1 }}>
            <div style={{ width: `${(done / SOP.length) * 100}%` }} />
          </div>
          <span className="mono dim" style={{ fontSize: 11 }}>
            {done}/{SOP.length} steps
          </span>
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
        <div className="section" style={{ paddingBottom: 4, borderBottom: 0 }}>
          <div className="sec-head" style={{ marginBottom: 0 }}>
            <div className="sec-title">
              Machine-guided SOP <span className="tag">docs/05 §5</span>
            </div>
            <span className="dim" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Lock size={11} /> interlocked
            </span>
          </div>
        </div>
        <ol className="sop">
          {SOP.map((step, i) => {
            const isDone = ui.job.sop[i];
            const isCur = i === cur;
            const expanded = isCur || open.has(i);
            return (
              <li key={step.id} className={`${isDone ? 'done' : ''} ${isCur ? 'current' : ''}`}>
                <span className="badge">{isDone ? '✓' : step.id}</span>
                <div className="row1" style={{ cursor: 'pointer' }} onClick={() => !isCur && toggle(i)}>
                  <span className="title">{step.title}</span>
                  {step.locked && (
                    <span className="lock" title="Interlocked by hardware">
                      <Lock size={11} />
                    </span>
                  )}
                </div>
                {expanded && (
                  <>
                    <div className="detail">{step.detail}</div>
                    <StepActions i={i} ui={ui} />
                    {isCur && (
                      <div className="hint">
                        <Info size={13} />
                        <span>{step.hint}</span>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}

function A({ children, onClick, disabled, kind = '', title }: { children: ReactNode; onClick: () => void; disabled?: boolean; kind?: string; title?: string }) {
  return (
    <button className={`btn sm ${kind}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

function Blocks({ items }: { items: { text: string }[] }) {
  if (!items.length) return null;
  return (
    <div className="block-list">
      {items.map((b) => (
        <div className="block-item" key={b.text}>
          <ShieldAlert size={12} /> {b.text}
        </div>
      ))}
    </div>
  );
}

const SEED_REASONS = ['Tank being decommissioned', 'Owner request: full clean for repair', 'Digestion failed: re-seed planned'];

function StepActions({ i, ui }: { i: number; ui: Snapshot }) {
  const j = ui.job;
  const v = ui.vehicle;
  const e = ui.equip;
  const st = j.state;
  const mode = useSim((s) => s.mode);
  switch (i) {
    case 0:
      return (
        <>
          <div className="actions">
            {!v.atPit ? (
              v.moving ? (
                <A onClick={() => send({ type: 'DRIVE_STOP' })}>
                  <Square size={12} /> Stop
                </A>
              ) : (
                <A kind="primary" onClick={() => send({ type: 'DRIVE', target: 'pit' })}>
                  <Truck size={13} /> Drive to pit
                </A>
              )
            ) : null}
            <A kind={v.outriggers >= 1 ? 'on' : ''} disabled={!v.atPit} onClick={() => send({ type: 'OUTRIGGERS', down: v.outriggers < 0.5 })}>
              {v.outriggers >= 0.999 ? 'Outriggers down ✓' : v.outriggers > 0 ? `Outriggers ${Math.round(v.outriggers * 100)}%` : 'Deploy outriggers'}
            </A>
            <A kind={v.chocks >= 1 ? 'on' : ''} disabled={!v.atPit} onClick={() => send({ type: 'CHOCKS', engaged: v.chocks < 0.5 })}>
              {v.chocks >= 0.999 ? 'Chocks ✓' : 'Engage chocks'}
            </A>
          </div>
          {!v.atPit && (
            <div style={{ marginTop: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }} className="dim">
                <span>
                  {v.moving ? 'Descending the lane' : 'At the road, beside the tanker'} · pitch {fmt(v.pitch_deg, 0)}°
                </span>
                <span className="mono">
                  {fmt(v.s_m, 0)} / {fmt(v.laneLength_m, 0)} m
                </span>
              </div>
              <div className="progress" style={{ marginTop: 5 }}>
                <div style={{ width: `${(v.s_m / v.laneLength_m) * 100}%` }} />
              </div>
            </div>
          )}
        </>
      );
    case 1:
      return (
        <div className="actions">
          <A kind="primary" disabled={!v.atPit || st !== 'Idle'} onClick={() => send({ type: 'SCAN_QR' })}>
            <QrCode size={13} /> Scan household QR
          </A>
        </div>
      );
    case 2:
      return (
        <div className="actions">
          <A kind="primary" disabled={st !== 'CheckIn'} onClick={() => send({ type: 'CONFIRM_PPE' })}>
            Confirm PPE · crew of 3
          </A>
        </div>
      );
    case 3:
      return (
        <div className="actions">
          <A kind={e.manholeOpen ? 'on' : 'primary'} disabled={!v.atPit || !!e.crewTask || e.manholeOpen} onClick={() => send({ type: 'MANHOLE', open: true })}>
            {e.crewTask === 'manhole' ? 'Lifting…' : e.manholeOpen ? 'Manhole open ✓' : 'Open manhole (lifter)'}
          </A>
        </div>
      );
    case 4: {
      const pct = Math.min(1, j.vent_s / j.ventTotal_s);
      return (
        <>
          <div className="actions">
            <A kind={e.snifferPlaced ? 'on' : 'primary'} disabled={!e.manholeOpen || !!e.crewTask} onClick={() => send({ type: 'SNIFFER', placed: !e.snifferPlaced })}>
              {e.crewTask === 'sniffer' ? 'Placing…' : e.snifferPlaced ? 'Sniffer placed ✓' : 'Hang gas sniffer'}
            </A>
            <A kind={e.blowerOn ? 'on' : 'primary'} disabled={!e.manholeOpen || !!e.crewTask} onClick={() => send({ type: 'BLOWER', on: !e.blowerOn })}>
              {e.crewTask === 'blower' ? 'Starting…' : e.blowerOn ? 'Blower ON' : 'Start Ex blower'}
            </A>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
              <span className={ui.gas.alarm ? '' : 'dim'} style={{ color: ui.gas.alarm ? 'var(--alarm)' : undefined }}>
                {j.ventDone ? 'Ventilation complete' : ui.gas.alarm ? `Gas unsafe · ${ui.gas.alarmSpecies.join(', ')} — timer held at 0` : e.blowerOn && e.snifferPlaced ? 'Timer running' : 'Timer waits for sniffer + blower'}
              </span>
              <span className="mono">
                {dur(j.vent_s)} / {dur(j.ventTotal_s)}
              </span>
            </div>
            <div className="progress" style={{ marginTop: 5 }}>
              <div style={{ width: `${pct * 100}%`, background: j.ventDone ? 'var(--ok)' : ui.gas.alarm ? 'var(--alarm)' : 'var(--warn)' }} />
            </div>
          </div>
        </>
      );
    }
    case 5:
      return (
        <>
          <div className="actions">
            <A kind={e.tripod >= 1 ? 'on' : 'primary'} disabled={!e.manholeOpen || (e.tripod > 0 && e.tripod < 1)} onClick={() => send({ type: 'TRIPOD', deployed: e.tripod < 0.5 })}>
              {e.tripod > 0 && e.tripod < 1 ? `Tripod ${Math.round(e.tripod * 100)}%` : e.tripod >= 1 ? 'Tripod set ✓' : 'Set up tripod'}
            </A>
          </div>
          <LanceControls ui={ui} />
        </>
      );
    case 6:
      return (
        <>
          <div className="actions">
            <A kind={st === 'Ventilating' && j.k1 ? 'primary' : ''} disabled={st !== 'Ventilating'} onClick={() => send({ type: 'ARM' })}>
              ARM
            </A>
            <A kind={ui.cube.vaneMode === 'vac' ? 'on' : st === 'Armed' ? 'primary' : ''} disabled={!['Armed', 'Priming', 'Extracting', 'Jetting'].includes(st)} onClick={() => send({ type: 'VAC', mode: ui.cube.vaneMode === 'vac' ? 'off' : 'vac' })}>
              {ui.cube.vaneMode === 'vac' ? 'VAC ON' : 'VAC PRIME'}
            </A>
            <span className="dim mono" style={{ fontSize: 11, alignSelf: 'center' }}>
              cube {fmt(ui.cube.level_L, 0)} L · {fmt(ui.cube.p_barg, 2)} bar(g)
            </span>
          </div>
          {st === 'Ventilating' && <Blocks items={j.k1Block} />}
        </>
      );
    case 7:
      return (
        <>
          <div className="actions">
            <A kind={ui.probe.augerDir > 0 ? 'on' : 'primary'} disabled={!['Priming', 'Extracting', 'Jetting', 'Armed'].includes(st)} onClick={() => send({ type: 'AUGER', dir: ui.probe.augerDir > 0 ? 0 : 1 })}>
              {ui.probe.augerDir > 0 ? `Auger ${fmt(ui.probe.auger_rpm, 0)} rpm` : 'Auger FWD'}
            </A>
            <A kind={ui.pcp.run ? 'on' : 'primary'} disabled={!['Priming', 'Extracting', 'Jetting'].includes(st)} onClick={() => send({ type: 'PCP', run: !ui.pcp.run })}>
              {ui.pcp.run ? `PCP ${fmt(ui.pcp.rpm, 0)} rpm` : 'PCP START'}
            </A>
          </div>
          {['Priming', 'Extracting'].includes(st) && !j.k2 && <Blocks items={[...j.k1Block, ...j.k2Block]} />}
        </>
      );
    case 8: {
      const ts = ui.suction.tsMix;
      return (
        <>
          <div className="actions">
            <A kind={ui.probe.jetCmd ? 'on' : ui.probe.current_A > 5 ? 'primary' : ''} disabled={!['Priming', 'Extracting', 'Jetting'].includes(st)} onClick={() => send({ type: 'JET', on: !ui.probe.jetCmd })}>
              {ui.probe.jetCmd ? `JET ON · ${fmt(ui.probe.jet_lpm, 0)} L/min` : 'JET ON'}
            </A>
            <A kind={ui.probe.airCmd ? 'on' : ''} disabled={!['Priming', 'Extracting', 'Jetting'].includes(st)} onClick={() => send({ type: 'AIR', on: !ui.probe.airCmd })} title="Air-assist lowers the riser density (deep pits at altitude)">
              {ui.probe.airCmd ? 'AIR ON' : 'Air-assist'}
            </A>
          </div>
          <div className="grid2" style={{ marginTop: 9 }}>
            <MiniStat label="Pumped TS" value={ui.suction.primed ? `${fmt(ts, 1)} %` : '—'} tone={!ui.suction.primed ? '' : ts <= 12 ? 'ok' : ts <= 14 ? 'warn' : 'alarm'} sub="target ≤ 12 %" />
            <MiniStat label="Auger IT-01" value={`${fmt(ui.probe.current_A, 1)} A`} tone={ui.probe.current_A > 6 ? 'warn' : ''} sub={ui.probe.current_A > 6 ? 'cake at tip' : 'normal'} />
          </div>
        </>
      );
    }
    case 9:
      return <SeedControls ui={ui} />;
    case 10:
      // The seed step latches as soon as the limit fires, so the decision stays reachable here.
      return (
        <>
          {['Extracting', 'Jetting', 'SeedLimit'].includes(st) && <SeedControls ui={ui} />}
          <div className="dim mono" style={{ fontSize: 11, marginTop: 6 }}>
            {st === 'Purging' ? `blow mode · cube ${fmt(ui.cube.level_L, 1)} L · ${fmt(ui.cube.p_barg, 2)} bar(g)` : 'Starts automatically after FINISH.'}
          </div>
        </>
      );
    case 11:
      return (
        <div className="actions">
          <A kind="primary" disabled={st !== 'Decon'} onClick={() => send({ type: 'DECON_CONFIRM' })}>
            Confirm decon (1 % Cl, lime)
          </A>
        </div>
      );
    case 12:
      return (
        <>
          <LanceControls ui={ui} compact />
          <div className="actions">
            <A kind={e.tripod <= 0 ? 'on' : ''} disabled={e.tripod <= 0 || e.lanceZ_m < ui.pit.depth_m + 0.25} onClick={() => send({ type: 'TRIPOD', deployed: false })}>
              {e.tripod <= 0 ? 'Tripod stowed ✓' : 'Stow tripod'}
            </A>
            <A kind={!e.manholeOpen ? 'on' : ''} disabled={!e.manholeOpen || e.tripod > 0 || !!e.crewTask} onClick={() => send({ type: 'MANHOLE', open: false })}>
              {e.manholeOpen ? 'Close manhole' : 'Manhole closed ✓'}
            </A>
            <A disabled={v.chocks <= 0} onClick={() => send({ type: 'CHOCKS', engaged: false })}>
              Chocks off
            </A>
            <A kind={v.outriggers <= 0 ? 'on' : ''} disabled={v.outriggers <= 0 || ui.pcp.rpm > 1} onClick={() => send({ type: 'OUTRIGGERS', down: false })}>
              {v.outriggers <= 0 ? 'Outriggers up ✓' : 'Raise outriggers'}
            </A>
          </div>
        </>
      );
    case 13:
      return (
        <>
          <div className="actions">
            <A kind="primary" disabled={st !== 'CheckOut'} onClick={() => send({ type: 'CLOSE_JOB' })}>
              Close job record
            </A>
            <A kind="primary" disabled={!j.closed || !!j.fstp} onClick={() => send({ type: 'FSTP_CHECKOUT', facility: 'fstp' })}>
              <QrCode size={13} /> Discharge at FSTP
            </A>
            {mode === 'sandbox' && (
              <A kind="danger" disabled={!j.closed || !!j.fstp} onClick={() => send({ type: 'FSTP_CHECKOUT', facility: 'drain' })} title="S10 anti-dumping test">
                Roadside drain (illegal)
              </A>
            )}
          </div>
          {st === 'CheckOut' && (
            <div className="dim" style={{ fontSize: 11, marginTop: 8 }}>
              Tanker {fmtInt(ui.receiver.v_L)} L · PCP metered {fmtInt(ui.pcp.metered_L - ui.hose.vol_L)} L (net of hose hold-up)
            </div>
          )}
        </>
      );
  }
  return null;
}

/** FINISH (start the purge) or a logged seed-layer override. */
function SeedControls({ ui }: { ui: Snapshot }) {
  const st = ui.job.state;
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="actions">
        <A kind={st === 'SeedLimit' ? 'primary' : ''} disabled={!['Extracting', 'Jetting', 'SeedLimit'].includes(st)} onClick={() => send({ type: 'FINISH' })}>
          FINISH → purge
        </A>
        <A disabled={st !== 'SeedLimit'} onClick={() => setOpen((x) => !x)} kind="danger">
          Override…
        </A>
      </div>
      {open && st === 'SeedLimit' && (
        <div className="actions">
          {SEED_REASONS.map((r) => (
            <A
              key={r}
              kind="ghost"
              onClick={() => {
                send({ type: 'SEED_OVERRIDE', reason: r });
                setOpen(false);
              }}
            >
              {r}
            </A>
          ))}
        </div>
      )}
      <div className="dim mono" style={{ fontSize: 11, marginTop: 8 }}>
        removed {fmt(ui.pit.removedPct, 0)} % · left {fmt(ui.pit.surface_m * 1000, 0)} mm · DT-01 {fmt(ui.pit.depthGauge_m, 2)} m
      </div>
    </>
  );
}

function LanceControls({ ui, compact }: { ui: Snapshot; compact?: boolean }) {
  const e = ui.equip;
  const ok = e.tripod >= 1;
  return (
    <div style={{ marginTop: 9 }}>
      <div className="actions" style={{ marginTop: 0 }}>
        <A disabled={!ok} onClick={() => send({ type: 'LANCE', dir: e.lanceDir === -1 ? 0 : -1 })} kind={e.lanceDir === -1 ? 'on' : ''}>
          <ArrowDown size={13} /> Lower
        </A>
        <A disabled={!ok} onClick={() => send({ type: 'LANCE', dir: 0 })}>
          <Square size={11} />
        </A>
        <A disabled={!ok} onClick={() => send({ type: 'LANCE', dir: e.lanceDir === 1 ? 0 : 1 })} kind={e.lanceDir === 1 ? 'on' : ''}>
          <ArrowUp size={13} /> Raise
        </A>
        {!compact ? (
          <>
            <A disabled={!ok} onClick={() => send({ type: 'LANCE_TO', z_m: Math.max(0.1, Math.min(ui.pit.bedTop_m || 0.85, ui.pit.surface_m - 0.3)) })} title="Lower the tip to the cake / supernatant interface">
              To interface
            </A>
            <A disabled={!ok} kind={e.lanceAuto ? 'on' : ''} onClick={() => send({ type: 'LANCE_AUTO', on: !e.lanceAuto })} title="Winch follows the falling level, keeping the tip 0.45 m below the surface (DT-01)">
              {e.lanceAuto ? 'Auto-follow ON' : 'Auto-follow'}
            </A>
          </>
        ) : (
          <A disabled={!ok} onClick={() => send({ type: 'LANCE_TO', z_m: ui.pit.depth_m + 0.35 })}>
            Raise fully
          </A>
        )}
      </div>
      <div className="dim mono" style={{ fontSize: 11, marginTop: 6 }}>
        tip {fmt(e.lanceZ_m, 2)} m · surface {fmt(ui.pit.surface_m, 2)} m · cake top {fmt(ui.pit.bedTop_m, 2)} m
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className={`tile compact ${tone ?? ''}`}>
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
