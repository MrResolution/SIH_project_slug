import { AlertTriangle, CloudSnow, Gauge, HardHat, Mountain, Route, Target, Truck } from 'lucide-react';
import { useSim } from '../store/simStore';
import { SCENARIOS } from '../data/scenes';
import { fmt, fmtInt } from './format';
import { BrandMark } from './TopBar';

/** Training briefing card (docs/simulation/05 §6.1). */
export function Briefing() {
  const open = useSim((s) => s.briefingOpen);
  const ui = useSim((s) => s.ui);
  const scenarioId = useSim((s) => s.scenarioId);
  const mode = useSim((s) => s.mode);
  const set = useSim((s) => s.set);
  const sc = SCENARIOS[scenarioId];
  if (!open || !sc) return null;
  const L = sc.containment.layers;
  const close = () => set({ briefingOpen: false });
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="brief-title">
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BrandMark size={20} />
            <span className="sec-title">
              Job briefing · {sc.id} · {mode === 'training' ? 'Training — interlocks always enforced' : 'Sandbox — parameters editable'}
            </span>
          </div>
          <h1 id="brief-title">{sc.title.en}</h1>
          <div className="dim2" style={{ fontSize: 13, maxWidth: 760 }}>
            {sc.summary}
          </div>
        </div>
        <div className="modal-body scroll">
          <div className="brief-grid">
            <Card icon={<Mountain size={13} />} k="Site" v={`${fmtInt(sc.site.altitude_m)} m`} s={`${sc.site.name} · P_atm ${fmt(ui?.env.pAtm_kPa, 1)} kPa`} />
            <Card icon={<CloudSnow size={13} />} k="Weather" v={`${sc.site.ambient.mean_c} °C · ${sc.site.weather}`} s={`±${sc.site.ambient.amplitude_c} °C diurnal · wind ${sc.site.wind_ms} m/s from E`} />
            <Card icon={<Gauge size={13} />} k="Containment" v={`Septic tank · ${fmtInt(ui?.pit.volume0_L ?? 0)} L`} s={`${sc.containment.l_m} × ${sc.containment.w_m} × ${sc.containment.depth_m} m, ${sc.containment.lined ? 'lined' : 'unlined'}, last emptied ${sc.containment.lastEmptied_y} y ago`} />
            <Card icon={<Route size={13} />} k="Route" v={`${fmt(ui?.hose.length_m, 0)} m hose · +${fmt(ui?.hose.elevGain_m, 0)} m`} s={`${fmt(ui?.vehicle.laneLength_m, 0)} m stepped lane, 7 flights at ≈ 31°`} />
            <Card icon={<Truck size={13} />} k="Equipment" v="Crawler B · PCP 5.5 kW" s="750 mm tracks · 48 V 200 Ah LiFePO₄ · 90 L surge cube" />
            <Card icon={<HardHat size={13} />} k="Crew" v="3 · remote pendant" s="Gauntlets, gumboots, face shield, respirator, hi-vis · 5 m upwind stand-off" />
            <Card icon={<Gauge size={13} />} k="Layers (top → bottom)" v={`Scum ${L.scum.ts_pct}% · Sup ${L.sup.ts_pct}% · Cake ${L.bed.ts_top_pct}–${L.bed.ts_bottom_pct}%`} s={`${L.scum.thickness_m} m / ${L.sup.thickness_m} m / ${L.bed.thickness_m} m`} />
            <Card icon={<Mountain size={13} />} k="Why trucks fail here" v={`Lift limit ${fmt(ui?.env.hMaxSludge_m, 1)} m`} s={`A truck at the road would need ≈ ${fmt((ui?.hose.elevGain_m ?? 38) + sc.containment.depth_m, 0)} m of suction lift`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, marginTop: 18 }}>
            <div>
              <div className="sec-title" style={{ marginBottom: 9 }}>
                <Target size={12} /> Objectives
              </div>
              <ul className="obj-list">
                {sc.objectives.map((o) => (
                  <li key={o.id}>
                    <span className="badge-dot" style={{ width: 7, height: 7, borderRadius: 2, background: o.optional ? 'var(--text-4)' : 'var(--accent)' }} />
                    {o.label}
                    {o.optional && <span className="dim">(optional)</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="safety-box">
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div>
                <b>Nobody enters the pit.</b> The machine will not start until the pit has been ventilated for 10 minutes with all four gases inside limits. Stirring the cake releases dissolved H₂S — if the alarm sounds, all motors stop and the blower keeps running. Keep the crew back.
              </div>
            </div>
          </div>
          <div className="note" style={{ marginTop: 16 }}>
            Tip: use <span className="kbd">×16</span> for the ventilation wait and the long pump-out. Every number on screen comes from the docs/04 equations running at 100 Hz in a worker.
          </div>
        </div>
        <div className="modal-foot">
          <span className="dim" style={{ fontSize: 12 }}>
            Press <span className="kbd">?</span> any time for controls
          </span>
          <button className="btn primary" onClick={close} autoFocus>
            Begin job
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ icon, k, v, s }: { icon: React.ReactNode; k: string; v: string; s: string }) {
  return (
    <div className="brief-card">
      <div className="k">
        {icon}
        {k}
      </div>
      <div className="v">{v}</div>
      <div className="s">{s}</div>
    </div>
  );
}
