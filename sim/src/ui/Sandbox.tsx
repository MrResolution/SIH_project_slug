import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Lock, RotateCcw } from 'lucide-react';
import { PARAM_META, defaultParams, getPath, type ParamGroup, type ParamMeta } from '../core';
import { send } from '../bridge/simBridge';
import { useSim } from '../store/simStore';
import { Section } from './widgets';
import { fmt } from './format';

const GROUPS: ParamGroup[] = ['PCP', 'Hose', 'Rheology', 'Pit & Probe', 'Surge cube', 'Gas & Safety', 'Thermal & Power'];

const PRESETS: { label: string; hint: string; set: [string, number | string | boolean][] }[] = [
  { label: 'Source report spec · 3 kW', hint: 'DR-1: the 3 kW PCP cannot hold 150 L/min at 12–24 bar', set: [['pcp.option', 'A']] },
  { label: 'Recommended · 5.5 kW', hint: 'Option B baseline', set: [['pcp.option', 'B']] },
  { label: '4″ discharge hose', hint: 'Cuts yield term 25 %, viscous ~44 %', set: [['hose.d_m', 0.1016]] },
  { label: 'Fixed −0.85 bar vacuum', hint: 'DR-3: deep cube vacuum starves the PCP inlet', set: [['cube.mode', 'fixed'], ['cube.fixedSetpoint_barg', -0.85]] },
  { label: 'Min-vacuum level control', hint: 'DR-3 recommended', set: [['cube.mode', 'level']] },
];

export function Sandbox() {
  const mode = useSim((s) => s.mode);
  const ui = useSim((s) => s.ui);
  const [vals, setVals] = useState<Record<string, number | string | boolean>>({});
  const [openG, setOpenG] = useState<Set<ParamGroup>>(new Set(['PCP', 'Hose']));
  const defs = useMemo(() => defaultParams(), []);
  const [kinkS, setKinkS] = useState(60);
  const [kinkSev, setKinkSev] = useState(0.92);

  if (mode !== 'sandbox')
    return (
      <Section title="Sandbox" tag="engineering what-ifs">
        <div className="lockbox">
          <Lock size={16} />
          <div>
            <b style={{ color: 'var(--text)' }}>Training mode locks the physics.</b>
            <div style={{ marginTop: 4 }}>Switch to Sandbox in the top bar to edit the docs/04 §8 parameters, run the DR-1/2/3 presets and inject failures. Interlocks stay enforced there too; the override is visible and logged.</div>
          </div>
        </div>
      </Section>
    );

  const value = (m: ParamMeta) => (m.path in vals ? vals[m.path] : getPath(defs, m.path));
  const setParam = (path: string, v: number | string | boolean) => {
    setVals((x) => ({ ...x, [path]: v }));
    send({ type: 'SET_PARAM', path, value: v });
  };
  const fails = ui?.hose;

  return (
    <>
      <Section title="Presets" tag="design review">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {PRESETS.map((pr) => (
            <button key={pr.label} className="btn sm" style={{ justifyContent: 'space-between', height: 'auto', padding: '7px 10px' }} onClick={() => pr.set.forEach(([p, v]) => setParam(p, v))}>
              <span>{pr.label}</span>
              <span className="dim" style={{ fontWeight: 400, fontSize: 11, whiteSpace: 'normal', textAlign: 'right' }}>
                {pr.hint}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Failure injection" tag="logged in the recording">
        <div className="fail-row">
          <div>
            <div className="t1">Hose kink</div>
            <div className="t2">
              at {kinkS} m · severity {fmt(kinkSev * 100, 0)} %
            </div>
          </div>
          <button className={`toggle ${fails?.kink ? 'on' : ''}`} onClick={() => send({ type: 'FAILURE', key: 'kink', on: !fails?.kink, s_m: kinkS, severity: kinkSev })} aria-label="Toggle hose kink" />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0 6px' }}>
          <input type="range" min={5} max={140} value={kinkS} onChange={(e) => setKinkS(+e.target.value)} style={{ flex: 1 }} aria-label="Kink position" />
          <input type="range" min={0.3} max={0.99} step={0.01} value={kinkSev} onChange={(e) => setKinkSev(+e.target.value)} style={{ flex: 1 }} aria-label="Kink severity" />
        </div>
        <FailRow label="Vehicle / rock on hose" sub="crushed segment: closed valve (S07)" on={!!fails?.crushed} onToggle={(on) => send({ type: 'FAILURE', key: 'crush', on, s_m: kinkS })} />
        <FailRow label="Check valve removed" sub="hill column drains back when the PCP stops" on={fails ? !fails.checkValve : false} onToggle={(on) => send({ type: 'FAILURE', key: 'checkValveRemoved', on })} />
        <FailRow label="Dry-run trip disabled" sub="watch TT-01 climb to stator burn (S08)" on={!!ui?.fail.dryRunTripDisabled} onToggle={(on) => send({ type: 'FAILURE', key: 'dryRunTripDisabled', on })} />
        <FailRow label="Overpressure trip disabled" sub="burst above 30 bar if blocked" on={!!ui?.fail.overpressureTripDisabled} onToggle={(on) => send({ type: 'FAILURE', key: 'overpressureTripDisabled', on })} />
        <FailRow label="H₂S sensor stuck" sub="detector freezes at its current reading" on={!!ui?.fail.h2sSensorStuck} onToggle={(on) => send({ type: 'FAILURE', key: 'h2sSensorStuck', on })} />
        <FailRow label="Detector fault / bump test overdue" sub="K1 cannot close" on={!!ui?.fail.detectorFault} onToggle={(on) => send({ type: 'FAILURE', key: 'detectorFault', on })} />
        <FailRow label="Battery cold soak" sub="−10 °C capacity and resistance" on={!!ui?.fail.batteryCold} onToggle={(on) => send({ type: 'FAILURE', key: 'batteryCold', on })} />
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn sm" onClick={() => send({ type: 'GAS_SPIKE', mult: 6 })}>
            H₂S release (S06)
          </button>
          <button className="btn sm" onClick={() => send({ type: 'TRASH_BURST' })}>
            Rag mat on screen
          </button>
          <button className={`btn sm ${ui?.job.override ? 'danger' : ''}`} onClick={() => send({ type: 'FAILURE', key: 'interlockOverride', on: !ui?.job.override })}>
            {ui?.job.override ? 'Override ON — click to clear' : 'Interlock override'}
          </button>
        </div>
      </Section>

      <Section title="Parameters" tag="docs/04 §8">
        {GROUPS.map((g) => {
          const metas = PARAM_META.filter((m) => m.group === g);
          const open = openG.has(g);
          return (
            <div key={g} className="accordion" style={{ borderBottom: '1px solid var(--line)' }}>
              <button
                onClick={() =>
                  setOpenG((s) => {
                    const n = new Set(s);
                    if (n.has(g)) n.delete(g);
                    else n.add(g);
                    return n;
                  })
                }
              >
                <span>{g}</span>
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {open && (
                <div style={{ paddingBottom: 8 }}>
                  {metas.map((m) => (
                    <ParamRow key={m.path} meta={m} value={value(m)} def={getPath(defs, m.path)} onChange={(v) => setParam(m.path, v)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Section>
    </>
  );
}

function FailRow({ label, sub, on, onToggle }: { label: string; sub: string; on: boolean; onToggle: (on: boolean) => void }) {
  return (
    <div className="fail-row">
      <div>
        <div className="t1">{label}</div>
        <div className="t2">{sub}</div>
      </div>
      <button
        className={`toggle danger ${on ? 'on' : ''}`}
        onClick={() => onToggle(!on)}
        aria-label={`Toggle ${label}`}
      />
    </div>
  );
}

function ParamRow({ meta, value, def, onChange }: { meta: ParamMeta; value: unknown; def: unknown; onChange: (v: number | string | boolean) => void }) {
  const changed = value !== def;
  return (
    <div className="param">
      <div className="name">
        {meta.label}
        <span className={`src ${meta.source}`}>{meta.source === 'doc04' ? 'docs/04' : meta.source}</span>
      </div>
      <button className="btn xs ghost icon" disabled={!changed} onClick={() => onChange(def as number)} title="Reset to default" aria-label={`Reset ${meta.label}`}>
        <RotateCcw size={11} />
      </button>
      <div className="control">
        {meta.options ? (
          <select className="select" style={{ flex: 1, minHeight: 26, padding: '3px 26px 3px 8px', fontSize: 12 }} value={String(value)} onChange={(e) => onChange(e.target.value)}>
            {meta.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : typeof def === 'boolean' ? (
          <button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} aria-label={meta.label} />
        ) : (
          <>
            <input type="range" min={meta.min} max={meta.max} step={meta.step} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} aria-label={meta.label} />
            <input
              className="num-input"
              type="number"
              step={meta.step}
              value={Number(value)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onChange(v);
              }}
              aria-label={`${meta.label} value`}
            />
            <span className="dim" style={{ fontSize: 10.5, width: 44 }}>
              {meta.unit}
            </span>
          </>
        )}
      </div>
      {meta.hint && (
        <div className="dim" style={{ gridColumn: '1 / -1', fontSize: 10.5 }}>
          {meta.hint}
        </div>
      )}
    </div>
  );
}
