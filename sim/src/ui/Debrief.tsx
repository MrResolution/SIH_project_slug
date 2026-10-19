import { useEffect, useState } from 'react';
import { CheckCircle2, Download, XCircle, MinusCircle } from 'lucide-react';
import type { Snapshot } from '../core';
import { bridge } from '../bridge/simBridge';
import { useSim } from '../store/simStore';
import { download, dur, fmt, fmtInt } from './format';

/** Scoring rubric, docs/simulation/06 §4 (100 points; any critical violation fails the job). */
export function score(ui: Snapshot) {
  const j = ui.job;
  const crit = j.criticals.filter((c) => c !== 'seed_removed');
  const safety = crit.length ? 0 : Math.max(0, 40 - 2 * Math.min(10, j.blockedAttempts) - (j.exposure_s > 0.5 ? 6 : 0) - (j.ppe ? 0 : 10));
  const removed = ui.pit.removedPct;
  const eff = Math.min(20, (20 * removed) / 90) + (j.criticals.includes('seed_removed') ? 0 : 5);
  const spec = ui.power.specific_kWhm3;
  const res = (ui.totals.freshWater_L <= 0 ? 5 : 0) + (spec > 0 && spec < 1.5 ? 5 : spec > 0 ? Math.max(0, 5 - (spec - 1.5) * 5) : 0) + (j.trips.overpressure || crit.includes('hose_burst') ? 0 : 5);
  const mins = j.elapsed_s / 60;
  const efc = mins <= 0 ? 0 : mins <= 90 ? 10 : Math.max(0, (10 * 90) / mins);
  const steps = j.sop.filter(Boolean).length;
  // Overrides can only be entered with a reason from the pendant, so justification is always recorded.
  const proc = (6 * steps) / 14 + (j.checkedIn && j.fstp ? 2 : 0) + 2;
  const total = safety + eff + res + efc + proc;
  return {
    rows: [
      { k: 'Safety', max: 40, v: safety, note: crit.length ? `critical: ${crit.join(', ')}` : `${j.blockedAttempts} blocked attempts${j.exposure_s > 0.5 ? ', manhole exposure' : ''}` },
      { k: 'Effectiveness', max: 25, v: eff, note: `${fmt(removed, 0)} % removed, seed ${j.criticals.includes('seed_removed') ? 'removed' : 'respected'}` },
      { k: 'Resource use', max: 15, v: res, note: `${fmtInt(ui.totals.freshWater_L)} L fresh water · ${spec > 0 ? fmt(spec, 2) : '—'} kWh/m³` },
      { k: 'Efficiency', max: 10, v: efc, note: `${dur(j.elapsed_s)} vs 90 min par` },
      { k: 'Procedure & records', max: 10, v: proc, note: `${steps}/14 SOP steps, QR in/out ${j.fstp ? '✓' : '—'}` },
    ],
    total,
    pass: !crit.length && total >= 80,
    crit,
  };
}

export function Debrief() {
  const ui = useSim((s) => s.ui);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const done = !!ui?.job.fstp;
  const key = ui?.job.jobId ?? '';
  useEffect(() => {
    if (!done) setDismissed(null);
  }, [done]);
  if (!ui || !done || dismissed === key) return null;
  const sc = score(ui);
  const f = ui.job.fstp!;
  const saveJson = async () => {
    const r = await bridge.exportRecording();
    download(`debrief-${ui.job.jobId}.json`, JSON.stringify({ score: sc, objectives: ui.objectives, fstp: f, totals: ui.totals, recording: r }, null, 2));
  };
  return (
    <div className="modal-back">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="debrief-title">
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20 }}>
          <div>
            <div className="sec-title">Debrief · {ui.job.jobId}</div>
            <h1 id="debrief-title">{sc.pass ? 'Job completed safely' : sc.crit.length ? 'Job failed: critical violation' : 'Job completed — below the pass mark'}</h1>
            <div className="dim2">
              {fmtInt(f.received_L)} L delivered to the FSTP · {fmt(ui.pit.removedPct, 0)} % of the tank emptied · zero fresh water
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="score" style={{ color: sc.pass ? 'var(--ok)' : 'var(--warn)' }}>
              {Math.round(sc.total)}
              <span style={{ fontSize: 18, color: 'var(--text-3)' }}>/100</span>
            </div>
            <span className={`chip ${sc.pass ? 'ok' : 'alarm'}`}>{sc.pass ? 'PASS' : 'NOT PASSED'}</span>
          </div>
        </div>
        <div className="modal-body scroll" style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 18 }}>
          <div>
            <div className="sec-title" style={{ marginBottom: 8 }}>
              Score breakdown
            </div>
            {sc.rows.map((r) => (
              <div key={r.k} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <b>{r.k}</b>
                  <span className="mono">
                    {fmt(r.v, 0)} / {r.max}
                  </span>
                </div>
                <div className="progress" style={{ marginTop: 5, height: 6 }}>
                  <div style={{ width: `${(r.v / r.max) * 100}%`, background: r.v / r.max > 0.75 ? 'var(--ok)' : r.v / r.max > 0.4 ? 'var(--warn)' : 'var(--alarm)' }} />
                </div>
                <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>
                  {r.note}
                </div>
              </div>
            ))}
            <div className="sec-title" style={{ margin: '16px 0 8px' }}>
              Objectives
            </div>
            <ul className="obj-list">
              {ui.objectives.map((o) => (
                <li key={o.id}>
                  {o.met === true ? <CheckCircle2 size={15} color="var(--ok)" /> : o.met === false ? <XCircle size={15} color="var(--alarm)" /> : <MinusCircle size={15} color="var(--text-3)" />}
                  <span style={{ flex: 1 }}>{o.label}</span>
                  <span className="mono dim">{o.value}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="sec-title" style={{ marginBottom: 8 }}>
              Chain of custody · FSTP reconciliation
            </div>
            {f.rules.map((r) => (
              <div key={r.id} className={`tile compact ${r.pass ? 'ok' : 'alarm'}`} style={{ marginBottom: 6, display: 'grid', gridTemplateColumns: '30px 1fr', gap: 8 }}>
                <span className="mono" style={{ fontWeight: 700, color: r.pass ? 'var(--ok)' : 'var(--alarm)' }}>
                  {r.id}
                </span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{r.label}</div>
                  <div className="dim" style={{ fontSize: 11 }}>
                    {r.detail}
                  </div>
                </div>
              </div>
            ))}
            <div className={`chip ${f.verified ? 'ok' : 'alarm'}`} style={{ marginTop: 4 }}>
              {f.verified ? 'Verified — NAMASTE incentive released' : 'Flagged — incentive withheld'}
            </div>
            <div className="grid2" style={{ marginTop: 14 }}>
              <Metric k="Energy" v={`${fmt(ui.power.energy_kWh, 2)} kWh`} s={`${fmt(ui.power.specific_kWhm3, 2)} kWh/m³`} />
              <Metric k="Peak PT-02" v={`${fmt(ui.totals.maxPd_bar, 1)} bar`} s="relief 20 · trip 22" />
              <Metric k="Peak H₂S" v={`${fmt(ui.gas.peak.h2s_ppm, 0)} ppm`} s="sealed headspace on opening" />
              <Metric k="Jetted (recycled)" v={`${fmtInt(ui.totals.jetted_L)} L`} s="pit's own liquid" />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={saveJson}>
            <Download size={14} /> Save debrief + recording
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setDismissed(key)}>
              Back to the site
            </button>
            <button className="btn primary" onClick={() => bridge.start(useSim.getState().scenarioId, useSim.getState().seed + 1, useSim.getState().mode)}>
              Run again (new seed)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ k, v, s }: { k: string; v: string; s: string }) {
  return (
    <div className="tile compact">
      <div className="lbl">{k}</div>
      <div className="val" style={{ fontSize: 15 }}>
        {v}
      </div>
      <div className="sub">{s}</div>
    </div>
  );
}
