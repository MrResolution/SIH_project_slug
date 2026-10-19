import type { Snapshot } from '../core';
import { useSim } from '../store/simStore';
import { Dial, LevelBar, Ring, Section, Tile, type Tone } from './widgets';
import { dur, fmt, fmtInt } from './format';

const gasTone = (v: number, lim: number): Tone => (v >= lim ? 'alarm' : v >= lim * 0.6 ? 'warn' : 'ok');

export function Instruments() {
  const ui = useSim((s) => s.ui);
  if (!ui) return null;
  return (
    <>
      <GasSection ui={ui} />
      <HydraulicsSection ui={ui} />
      <ProbeSection ui={ui} />
      <MachineSection ui={ui} />
      <JobSection ui={ui} />
    </>
  );
}

function GasSection({ ui }: { ui: Snapshot }) {
  const g = ui.gas.sensed;
  const placed = ui.equip.snifferPlaced;
  const j = ui.job;
  const frac = j.vent_s / j.ventTotal_s;
  const ringColor = j.ventDone ? 'var(--ok)' : ui.gas.alarm ? 'var(--alarm)' : 'var(--warn)';
  const o2Tone: Tone = g.o2_pct < 19.5 || g.o2_pct > 23.5 ? 'alarm' : g.o2_pct < 20 ? 'warn' : 'ok';
  return (
    <Section title="Gas · ventilation" tag={placed ? 'GD-01 at manhole' : 'GD-01 reading ambient'} right={ui.gas.alarm ? <span className="chip alarm">ALARM</span> : placed ? <span className="chip ok">within limits</span> : null}>
      <div className="grid4">
        <Tile compact label="O₂" value={fmt(g.o2_pct, 1)} unit="%" tone={o2Tone} sub="19.5–23.5" />
        <Tile compact label="H₂S" value={fmt(g.h2s_ppm, g.h2s_ppm < 10 ? 1 : 0)} unit="ppm" tone={gasTone(g.h2s_ppm, 10)} sub="< 10" />
        <Tile compact label="CH₄" value={fmt(g.ch4_lel, 0)} unit="%LEL" tone={gasTone(g.ch4_lel, 10)} sub="< 10" />
        <Tile compact label="CO" value={fmt(g.co_ppm, 0)} unit="ppm" tone={gasTone(g.co_ppm, 25)} sub="< 25" />
      </div>
      <div className="ring-wrap" style={{ marginTop: 10 }}>
        <Ring frac={frac} color={ringColor} size={62}>
          <div className="mono" style={{ fontSize: 11.5, fontWeight: 600 }}>
            {j.ventDone ? '✓' : dur(Math.max(0, j.ventTotal_s - j.vent_s))}
          </div>
        </Ring>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 12.5 }}>{j.ventDone ? 'Ventilated — K1 permitted' : ui.gas.alarm ? 'Gas unsafe — timer held at 0' : ui.equip.blowerOn && placed ? 'Ventilating · 10 min interlock' : 'Ventilation not started'}</div>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
            Blower {ui.equip.blowerOn ? 'ON' : 'off'} · exchange {fmt(ui.gas.qVent_m3h, 0)} m³/h · headspace {fmt(ui.gas.headspace_m3, 2)} m³
          </div>
          <div className="dim" style={{ fontSize: 11.5 }}>
            Peak H₂S {fmt(ui.gas.peak.h2s_ppm, 0)} ppm · dissolved reservoir {fmt(ui.gas.dissolved * 100, 0)} %
          </div>
        </div>
      </div>
    </Section>
  );
}

function HydraulicsSection({ ui }: { ui: Snapshot }) {
  const h = ui.hose;
  const pcp = ui.pcp;
  const cube = ui.cube;
  const pTone: Tone = h.pD_bar >= 22 ? 'alarm' : h.pD_bar >= 20 ? 'warn' : '';
  const powerFrac = pcp.shaft_kW / pcp.motor_kW;
  return (
    <Section title="Booster hydraulics" tag="Tier 2" right={h.reliefOpen ? <span className="chip warn">RELIEF OPEN</span> : pcp.powerLimited ? <span className="chip warn">POWER LIMIT</span> : null}>
      <div style={{ display: 'grid', gridTemplateColumns: '146px minmax(0, 1fr)', gap: 8, alignItems: 'start' }}>
        <div className={`tile ${pTone}`} style={{ padding: '4px 0 2px', display: 'grid', placeItems: 'center' }}>
          <Dial
            value={h.pD_bar}
            min={0}
            max={30}
            label="PT-02"
            unit="bar"
            size={146}
            bands={[
              { from: 0, to: 15, color: '#1f6f55' },
              { from: 15, to: 20, color: '#7a6a2a' },
              { from: 20, to: 22, color: '#b36b26' },
              { from: 22, to: 30, color: '#a83236' },
            ]}
          />
        </div>
        <div className="grid2" style={{ gap: 6 }}>
          <Tile compact label="To tanker" value={fmt(h.q_lpm, 0)} unit="L/min" sub={h.fill < 1 ? `front ${fmt(h.front_m, 0)} / ${fmt(h.length_m, 0)} m` : 'hose full'} />
          <Tile compact label="Suction" value={fmt(ui.suction.q_lpm, 0)} unit="L/min" tone={ui.suction.stalled ? 'alarm' : ui.suction.starved ? 'warn' : ''} sub={ui.suction.stalled ? 'lift limit' : ui.suction.primed ? 'primed' : 'not primed'} />
          <Tile compact label="Jets" value={fmt(h.jet_lpm, 0)} unit="L/min" sub={`PRV ≤ 6 bar`} />
          <Tile compact label="Relief" value={fmt(h.relief_lpm, 0)} unit="L/min" tone={h.reliefOpen ? 'warn' : ''} sub={`lift ${fmt(h.reliefLift * 100, 0)} %`} />
        </div>
      </div>
      <div className="grid3" style={{ marginTop: 8 }}>
        <Tile compact label="PCP" tag="ST-01" value={fmt(pcp.rpm, 0)} unit="rpm" sub={`set ${pcp.set_rpm} · η_vol ${fmt(pcp.etaVol * 100, 0)}%`} />
        <Tile
          compact
          label="Shaft"
          value={fmt(pcp.shaft_kW, 1)}
          unit="kW"
          tone={pcp.powerLimited ? 'warn' : ''}
          bar={{ value: powerFrac, min: 0, max: 1.05, marks: [{ at: 1, tone: 'warn' }] }}
          sub={`Option ${pcp.option} · ${pcp.motor_kW} kW`}
        />
        <Tile compact label="Torque" value={fmt(pcp.torque_Nm, 0)} unit="N·m" sub={`ΔP ${fmt(pcp.dp_bar, 1)} bar`} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 12, marginTop: 10, alignItems: 'center' }}>
        <LevelBar
          frac={cube.level_L / 90}
          marks={[
            { at: 6 / 90, label: 'LO' },
            { at: 45 / 90, label: 'SP' },
            { at: 0.9, label: 'FLT' },
          ]}
        />
        <div className="grid2" style={{ gap: 6 }}>
          <Tile compact label="Surge cube" tag="LT-01" value={fmt(cube.level_L, 0)} unit="L" tone={cube.floatTripped ? 'warn' : cube.level_L < 6 && pcp.rpm > 20 ? 'alarm' : ''} sub={`TS ${fmt(cube.ts, 1)} % · trap ${fmt(cube.rockTrap_kg, 1)} kg`} />
          <Tile compact label="Cube pressure" tag="PT-01" value={fmt(cube.p_barg, 2)} unit="bar(g)" sub={cube.vaneMode === 'vac' ? `vane ${fmt(cube.vaneU * 100, 0)}% · SP ${fmt(cube.pSet_barg, 2)}` : `vane ${cube.vaneMode}`} />
          <Tile compact label="PCP inlet" value={fmt(pcp.pIn_kPa, 0)} unit="kPa abs" tone={pcp.cavitation < 0.97 ? 'warn' : ''} sub={pcp.cavitation < 0.97 ? `NPSH low · −${fmt((1 - pcp.cavitation) * 100, 0)}% flow` : 'NPSH ok (DR-3)'} />
          <Tile compact label="Suction lift" value={fmt(ui.suction.liftReq_m, 1)} unit="m" tone={ui.suction.liftReq_m > ui.suction.liftAvail_m * 0.92 ? 'warn' : ''} sub={`available ${fmt(ui.suction.liftAvail_m, 1)} m @ ${fmtInt(ui.env.altitude_m)} m`} />
        </div>
      </div>
    </Section>
  );
}

function ProbeSection({ ui }: { ui: Snapshot }) {
  const pr = ui.probe;
  const ts = ui.suction.tsMix;
  return (
    <Section title="Probe" tag="Tier 1 · in-pit lance" right={pr.stalled ? <span className="chip alarm">AUGER STALL</span> : pr.wraps ? <span className="chip warn">{pr.wraps} wrap{pr.wraps > 1 ? 's' : ''}</span> : null}>
      <div className="grid3">
        <Tile compact label="Auger" tag="ST-02" value={fmt(pr.auger_rpm, 0)} unit="rpm" sub={`γ̇ ${fmt((Math.abs(pr.auger_rpm) * 2 * Math.PI * 0.038) / 60 / 0.01, 0)} s⁻¹`} />
        <Tile compact label="Current" tag="IT-01" value={fmt(pr.current_A, 1)} unit="A" tone={pr.current_A > 8 ? 'alarm' : pr.current_A > 5 ? 'warn' : ''} bar={{ value: pr.current_A, min: 0, max: 14, marks: [{ at: 6, tone: 'warn' }] }} sub={`${fmt(pr.torque_Nm, 1)} N·m`} />
        <Tile compact label="Screen" value={fmt(pr.blinding * 100, 0)} unit="% blind" tone={pr.blinding > 0.55 ? 'warn' : ''} bar={{ value: pr.blinding, min: 0, max: 1, marks: [{ at: 0.55, tone: 'warn' }] }} sub={`${pr.deflected} items deflected`} />
      </div>
      <div className="grid3" style={{ marginTop: 6 }}>
        <Tile compact label="Pumped TS" value={ui.suction.primed ? fmt(ts, 1) : '—'} unit="%" tone={!ui.suction.primed ? '' : ts <= 12 ? 'ok' : ts <= 14 ? 'warn' : 'alarm'} bar={{ value: ts, min: 0, max: 24, marks: [{ at: 12, tone: 'warn' }] }} sub={`τy ${fmt(ui.suction.tauY_Pa, 0)} Pa`} />
        <Tile compact label="Lance tip" value={fmt(ui.equip.lanceZ_m, 2)} unit="m" sub={`DT-01 ${fmt(ui.pit.depthGauge_m, 2)} m`} />
        <Tile compact label="Air-assist" value={pr.airCmd ? fmt(pr.alpha * 100, 0) : 'off'} unit={pr.airCmd ? '% α' : ''} sub="drift-flux void" />
      </div>
    </Section>
  );
}

function MachineSection({ ui }: { ui: Snapshot }) {
  const pw = ui.power;
  const th = ui.thermal;
  const pcp = ui.pcp;
  const sTone: Tone = pcp.statorT_C >= 90 ? 'alarm' : pcp.statorT_C >= 70 ? 'warn' : '';
  return (
    <Section title="Machine · energy" tag={pw.source === 'battery' ? 'LiFePO₄ 48 V 200 Ah' : 'Genset'}>
      <div className="grid3">
        <Tile compact label="Stator" tag="TT-01" value={fmt(pcp.statorT_C, 0)} unit="°C" tone={sTone} bar={{ value: pcp.statorT_C, min: -10, max: 130, marks: [{ at: 90, tone: 'alarm' }] }} sub={pcp.gasFrac > 0.1 ? 'running dry!' : 'trip 90 °C'} />
        {pw.source === 'battery' ? (
          <Tile compact label="Battery SOC" value={fmt(pw.soc * 100, 0)} unit="%" tone={pw.soc < 0.15 ? 'alarm' : pw.soc < 0.3 ? 'warn' : ''} bar={{ value: pw.soc, min: 0, max: 1, color: 'var(--ok)', marks: [{ at: 0.1, tone: 'alarm' }] }} sub={`${fmt(pw.vBus, 1)} V · ${fmt(pw.iBus, 0)} A`} />
        ) : (
          <Tile compact label="Fuel used" value={fmt(pw.fuel_L, 2)} unit="L" sub="BSFC 300 g/kWh" />
        )}
        <Tile compact label="Power" value={fmt(pw.p_kW, 2)} unit="kW" sub={`PCP ${fmt(pw.loads.pcp / 1000, 1)} · aug ${fmt(pw.loads.auger / 1000, 2)}`} />
      </div>
      <div className="grid3" style={{ marginTop: 6 }}>
        <Tile compact label="Energy" value={fmt(pw.energy_kWh, 2)} unit="kWh" sub={`pumping ${fmt(pw.pump_kWh, 2)}`} />
        <Tile compact label="Specific" value={pw.specific_kWhm3 > 0 ? fmt(pw.specific_kWhm3, 2) : '—'} unit="kWh/m³" tone={pw.specific_kWhm3 > 1.5 ? 'warn' : pw.specific_kWhm3 > 0 ? 'ok' : ''} sub="target < 1.5" />
        <Tile compact label="Lines" value={fmt(th.line_C, 1)} unit="°C" tone={th.ice > 0.3 ? 'alarm' : th.ice > 0.05 ? 'warn' : ''} sub={`${th.heaterActive ? 'heater ON · ' : ''}ice ${fmt(th.ice * 100, 0)}%`} />
      </div>
    </Section>
  );
}

function JobSection({ ui }: { ui: Snapshot }) {
  const p = ui.pit;
  return (
    <Section title="Job progress" tag={ui.job.jobId ?? ''}>
      <div className="grid3">
        <Tile compact label="Removed" value={fmt(p.removedPct, 0)} unit="%" tone={p.removedPct >= 90 ? 'ok' : ''} bar={{ value: p.removedPct, min: 0, max: 100, color: 'var(--ok)', marks: [{ at: 95, tone: 'warn' }] }} sub={`${fmtInt(p.volume_L)} L left`} />
        <Tile compact label="Tanker" value={fmtInt(ui.receiver.v_L)} unit="L" bar={{ value: ui.receiver.v_L, min: 0, max: ui.receiver.cap_L }} sub={`of ${fmtInt(ui.receiver.cap_L)} L`} />
        <Tile compact label="Seed margin" value={fmt(p.seedMargin_mm, 0)} unit="mm" tone={p.seedMargin_mm < 75 ? 'warn' : ''} sub="leave ≥ 25 mm" />
      </div>
      <div className="grid3" style={{ marginTop: 6 }}>
        <Tile compact label="In hose" value={fmtInt(ui.hose.vol_L)} unit="L" sub={`${fmt(ui.hose.fill * 100, 0)} % full`} />
        <Tile compact label="Fresh water" value={fmtInt(ui.totals.freshWater_L)} unit="L" tone="ok" sub="closed-loop jets" />
        <Tile compact label="Job time" value={dur(ui.job.elapsed_s)} sub={ui.job.blockedAttempts ? `${ui.job.blockedAttempts} blocked attempts` : 'since ARM'} />
      </div>
    </Section>
  );
}
