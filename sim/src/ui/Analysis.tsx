import { useRef } from 'react';
import type { Snapshot } from '../core';
import { useSim, type HeatField } from '../store/simStore';
import { E1_HOSE_ROUTE } from '../data/scenes/e1';
import { mobColor, pColor, rgb, tauColor, tsColor, SERIES } from './colors';
import { fmt } from './format';
import { Section } from './widgets';

const AX = '#6b7789';
const GRID = '#1c232e';

function Frame({ w, h, pad, xTicks, yTicks, xLabel, yLabel, x, y, children }: { w: number; h: number; pad: [number, number, number, number]; xTicks: number[]; yTicks: number[]; xLabel: string; yLabel: string; x: (v: number) => number; y: (v: number) => number; children: React.ReactNode }) {
  const [t, r, b, l] = pad;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
      {yTicks.map((v) => (
        <g key={`y${v}`}>
          <line x1={l} x2={w - r} y1={y(v)} y2={y(v)} stroke={GRID} />
          <text x={l - 5} y={y(v) + 3} fontSize={9} textAnchor="end" fill={AX} fontFamily="var(--mono)">
            {v}
          </text>
        </g>
      ))}
      {xTicks.map((v) => (
        <g key={`x${v}`}>
          <line x1={x(v)} x2={x(v)} y1={t} y2={h - b} stroke={GRID} />
          <text x={x(v)} y={h - b + 12} fontSize={9} textAnchor="middle" fill={AX} fontFamily="var(--mono)">
            {v}
          </text>
        </g>
      ))}
      <text x={(l + w - r) / 2} y={h - 3} fontSize={9.5} textAnchor="middle" fill={AX}>
        {xLabel}
      </text>
      <text x={10} y={(t + h - b) / 2} fontSize={9.5} textAnchor="middle" fill={AX} transform={`rotate(-90 10 ${(t + h - b) / 2})`}>
        {yLabel}
      </text>
      {children}
    </svg>
  );
}

/** PCP Q–ΔP envelope with constant-power curves A/B, relief/trip lines, hose system curves and the live operating point (DR-1 / DR-2 explainer). */
function Envelope({ ui }: { ui: Snapshot }) {
  const trail = useRef<[number, number][]>([]);
  const W = 352;
  const H = 230;
  const pad: [number, number, number, number] = [10, 12, 30, 34];
  const qMax = 300;
  const pMax = 28;
  const x = (q: number) => pad[3] + (q / qMax) * (W - pad[1] - pad[3]);
  const y = (p: number) => H - pad[2] - (Math.min(p, pMax) / pMax) * (H - pad[0] - pad[2]);
  const L = ui.pcp.limits;
  const curve = (kW: number) => {
    const pts: string[] = [];
    for (let q = 20; q <= qMax; q += 4) {
      const dp = (kW * 1000 * L.etaMech) / (q / 60000) / 1e5;
      if (dp > pMax + 2) continue;
      pts.push(`${x(q).toFixed(1)},${y(dp).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  const qDispMax = L.rpmMax * L.vd_L;
  // System curve for the current hose contents (full-hose extrapolation once the front is known).
  const c = ui.hose.curve;
  const fill = Math.max(ui.hose.fill, 1e-3);
  const sys = (q: number) => (c.static_bar + c.yield_bar + c.visc_bar_per_lpm * q) / Math.min(1, fill) + c.c2_bar_per_lpm2 * q * q;
  // Reference curves over the full hose for conditioned slurry (τy 20, μ 0.3) and unconditioned cake (τy 273, μ 1.0).
  const D = ui.hose.d_m;
  const A = (Math.PI * D * D) / 4;
  const Lh = ui.hose.length_m;
  const ref = (ty: number, mu: number, rho: number) => (q: number) => (rho * 9.81 * ui.hose.elevGain_m + ((16 / 3) * ty) / D * Lh + ((32 * mu) / (D * D * A)) * (q / 60000) * Lh) / 1e5;
  const cond = ref(20, 0.3, 1040);
  const cake = ref(273, 1.0, 1088);
  const poly = (f: (q: number) => number) => {
    const pts: string[] = [];
    for (let q = 0; q <= qMax; q += 6) {
      const v = f(q);
      if (v > pMax + 4) break;
      pts.push(`${x(q).toFixed(1)},${y(v).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  const opQ = Math.max(0, ui.pcp.q_lpm);
  const opP = Math.max(0, ui.pcp.dp_bar);
  if (ui.pcp.rpm > 5) {
    const last = trail.current[trail.current.length - 1];
    if (!last || Math.abs(last[0] - opQ) > 0.5 || Math.abs(last[1] - opP) > 0.05) trail.current.push([opQ, opP]);
    if (trail.current.length > 80) trail.current.shift();
  }
  return (
    <Frame w={W} h={H} pad={pad} xTicks={[0, 50, 100, 150, 200, 250, 300]} yTicks={[0, 5, 10, 15, 20, 25]} xLabel="PCP flow Q (L/min)" yLabel="ΔP (bar)" x={x} y={y}>
      <rect x={x(0)} y={y(L.relief_bar)} width={x(qMax) - x(0)} height={y(0) - y(L.relief_bar)} fill="rgba(55,208,143,0.04)" />
      <line x1={x(0)} x2={x(qMax)} y1={y(L.relief_bar)} y2={y(L.relief_bar)} stroke="var(--warn)" strokeDasharray="5 4" />
      <text x={x(qMax) - 2} y={y(L.relief_bar) - 3} fontSize={9} textAnchor="end" fill="var(--warn)">
        relief {L.relief_bar} bar
      </text>
      <line x1={x(0)} x2={x(qMax)} y1={y(L.trip_bar)} y2={y(L.trip_bar)} stroke="var(--alarm)" strokeDasharray="2 3" />
      <text x={x(qMax) - 2} y={y(L.trip_bar) - 3} fontSize={9} textAnchor="end" fill="var(--alarm)">
        trip {L.trip_bar}
      </text>
      <line x1={x(qDispMax)} x2={x(qDispMax)} y1={y(0)} y2={y(pMax)} stroke="#4c5768" strokeDasharray="3 3" />
      <text x={x(qDispMax) - 3} y={y(pMax) + 10} fontSize={9} textAnchor="end" fill={AX}>
        {L.rpmMax} rpm
      </text>
      <polyline points={curve(L.motorA_kW)} fill="none" stroke={SERIES.violet} strokeWidth={1.5} strokeDasharray="6 4" />
      <polyline points={curve(L.motorB_kW)} fill="none" stroke={SERIES.blue} strokeWidth={1.8} />
      <text x={x(46)} y={y((L.motorA_kW * 1000 * L.etaMech) / (46 / 60000) / 1e5) - 4} fontSize={9} fill={SERIES.violet}>
        A {L.motorA_kW} kW
      </text>
      <text x={x(150) + 4} y={y((L.motorB_kW * 1000 * L.etaMech) / (150 / 60000) / 1e5) - 5} fontSize={9} fill={SERIES.blue}>
        B {L.motorB_kW} kW
      </text>
      <polyline points={poly(cake)} fill="none" stroke={SERIES.red} strokeWidth={1.2} strokeDasharray="2 3" opacity={0.85} />
      <text x={x(4)} y={y(Math.min(pMax - 0.5, cake(0))) + 10} fontSize={9} fill={SERIES.red}>
        hose · unconditioned cake (τy 273 Pa)
      </text>
      <polyline points={poly(cond)} fill="none" stroke={SERIES.green} strokeWidth={1.2} strokeDasharray="5 3" opacity={0.85} />
      <text x={x(222)} y={y(cond(222)) - 5} fontSize={9} fill={SERIES.green}>
        τy 20 Pa
      </text>
      {ui.hose.fill > 0.6 && <polyline points={poly(sys)} fill="none" stroke={SERIES.orange} strokeWidth={2} />}
      {ui.hose.fill > 0.6 && (
        <text x={x(262)} y={y(Math.min(pMax - 1, sys(262))) - 5} fontSize={9} fill={SERIES.orange} textAnchor="end">
          hose now
        </text>
      )}
      {trail.current.length > 1 && <polyline points={trail.current.map(([q, p]) => `${x(q)},${y(p)}`).join(' ')} fill="none" stroke="rgba(230,235,242,0.35)" strokeWidth={1} />}
      {ui.pcp.rpm > 5 && (
        <g>
          <circle cx={x(opQ)} cy={y(opP)} r={8} fill="rgba(255,255,255,0.08)" stroke="#fff" strokeOpacity={0.4} />
          <circle cx={x(opQ)} cy={y(opP)} r={4} fill={ui.pcp.powerLimited ? 'var(--warn)' : '#fff'} />
          <text x={x(opQ) + 10} y={y(opP) + 3} fontSize={9.5} fill="#e6ebf2" fontFamily="var(--mono)">
            {fmt(opQ, 0)} L/min · {fmt(opP, 1)} bar
          </text>
        </g>
      )}
    </Frame>
  );
}

/** Hose elevation profile coloured by pressure, with the sludge front. */
function HoseProfile({ ui }: { ui: Snapshot }) {
  const W = 352;
  const H = 150;
  const pad: [number, number, number, number] = [10, 12, 28, 34];
  const route = E1_HOSE_ROUTE;
  const L = route.length;
  const z0 = route.sample(0).p.y;
  const zMax = Math.ceil((ui.hose.elevGain_m + 4) / 10) * 10;
  const x = (s: number) => pad[3] + (s / L) * (W - pad[1] - pad[3]);
  const y = (z: number) => H - pad[2] - ((z + 2) / (zMax + 2)) * (H - pad[0] - pad[2]);
  const N = 120;
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const s = (i / N) * L;
    return [s, route.sample(s).p.y - z0] as const;
  });
  const prof = ui.hose.pProfile;
  const segs = [];
  for (let i = 0; i < N; i++) {
    const s = pts[i][0];
    const k = Math.min(prof.length - 1, Math.round((s / L) * (prof.length - 1)));
    const filled = s <= ui.hose.front_m;
    segs.push(<line key={i} x1={x(pts[i][0])} y1={y(pts[i][1])} x2={x(pts[i + 1][0])} y2={y(pts[i + 1][1])} stroke={filled ? rgb(pColor(prof[k])) : '#3a4454'} strokeWidth={filled ? 3.2 : 1.6} strokeLinecap="round" />);
  }
  const area = `M ${x(0)} ${y(-2)} ` + pts.map(([s, z]) => `L ${x(s).toFixed(1)} ${y(z).toFixed(1)}`).join(' ') + ` L ${x(L)} ${y(-2)} Z`;
  const kink = ui.hose.kink ?? ui.hose.crushed;
  return (
    <Frame w={W} h={H} pad={pad} xTicks={[0, 25, 50, 75, 100, 125]} yTicks={[0, 10, 20, 30, 40].filter((v) => v <= zMax)} xLabel="distance along hose from PCP (m)" yLabel="rise (m)" x={x} y={y}>
      <path d={area} fill="rgba(110,125,145,0.09)" />
      {segs}
      {ui.hose.fill > 0 && ui.hose.fill < 1 && (
        <g>
          <line x1={x(ui.hose.front_m)} x2={x(ui.hose.front_m)} y1={y(-2)} y2={y(zMax)} stroke="var(--accent)" strokeDasharray="3 3" />
          <text x={x(ui.hose.front_m) + 3} y={y(zMax) + 9} fontSize={9} fill="var(--accent)">
            front {fmt(ui.hose.front_m, 0)} m
          </text>
        </g>
      )}
      {kink && (
        <g>
          <circle cx={x(kink.s_m)} cy={y(route.sample(kink.s_m).p.y - z0)} r={6} fill="none" stroke="var(--alarm)" strokeWidth={2} />
          <text x={x(kink.s_m) + 8} y={y(route.sample(kink.s_m).p.y - z0) - 6} fontSize={9} fill="var(--alarm)">
            {ui.hose.crushed ? 'crushed' : 'kink'}
          </text>
        </g>
      )}
      <text x={x(L) - 2} y={y(ui.hose.elevGain_m) - 6} fontSize={9} textAnchor="end" fill={AX}>
        tanker +{fmt(ui.hose.elevGain_m, 0)} m
      </text>
    </Frame>
  );
}

function Budget({ ui }: { ui: Snapshot }) {
  const h = ui.hose;
  const parts = [
    { k: 'Static head', v: Math.max(0, h.static_bar), c: SERIES.blue },
    { k: 'Yield τy', v: h.yield_bar, c: SERIES.orange },
    { k: 'Viscous', v: h.visc_bar, c: SERIES.violet },
  ];
  const tot = Math.max(1, parts.reduce((a, b) => a + b.v, 0), h.pD_bar);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 4, overflow: 'hidden', background: 'var(--line)' }}>
        {parts.map((p) => (
          <div key={p.k} style={{ width: `${(p.v / tot) * 100}%`, background: p.c }} title={`${p.k} ${p.v.toFixed(2)} bar`} />
        ))}
      </div>
      <div className="legend-row" style={{ marginTop: 6 }}>
        {parts.map((p) => (
          <span key={p.k}>
            <i style={{ background: p.c, height: 6, width: 6, borderRadius: 2 }} />
            {p.k} <b className="mono" style={{ color: 'var(--text-2)' }}>{p.v.toFixed(1)}</b>
          </span>
        ))}
        <span>
          = PT-02 <b className="mono" style={{ color: 'var(--text)' }}>{h.pD_bar.toFixed(1)} bar</b>
        </span>
      </div>
    </div>
  );
}

/** Stratified pit column (24 cells) with lance, auger reach and seed layer. */
export function PitColumn({ ui, heat, height = 220 }: { ui: Snapshot; heat: HeatField; height?: number }) {
  const W = 172;
  const H = height;
  const top = 10;
  const bot = 18;
  const depth = ui.pit.depth_m;
  const y = (z: number) => H - bot - (z / depth) * (H - top - bot);
  const x0 = 40;
  const x1 = 128;
  const color = (c: Snapshot['pit']['cells'][number]) => (heat === 'tau' ? tauColor(0.065 * Math.pow(Math.max(c.ts, 0), 2.7) * 1.28) : heat === 'mobility' ? mobColor(c.mob) : tsColor(c.ts));
  const lanceX = (x0 + x1) / 2 + 12;
  const tip = ui.equip.lanceZ_m;
  const intake = ui.probe.intakeZ_m;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ flexShrink: 0 }}>
      <rect x={x0 - 3} y={top - 2} width={x1 - x0 + 6} height={H - top - bot + 5} rx={3} fill="#2a2f36" />
      <rect x={x0} y={top} width={x1 - x0} height={H - top - bot} fill="#0b0f15" />
      {ui.pit.cells.map((c, i) =>
        c.h > 1e-4 ? <rect key={i} x={x0} y={y(c.z0 + c.h)} width={x1 - x0} height={Math.max(0.6, y(c.z0) - y(c.z0 + c.h))} fill={rgb(color(c))} /> : null,
      )}
      {ui.pit.cells.map((c, i) => (c.h > 1e-4 && c.w > 0.002 ? <rect key={`w${i}`} x={x1 + 4} y={y(c.z0 + c.h)} width={Math.min(26, c.w * 90)} height={Math.max(0.6, y(c.z0) - y(c.z0 + c.h) - 0.5)} fill="rgba(79,195,255,0.65)" /> : null))}
      <text x={x1 + 4} y={top + 6} fontSize={8} fill={AX}>
        draw
      </text>
      <line x1={x0} x2={x1} y1={y(ui.pit.surface_m)} y2={y(ui.pit.surface_m)} stroke="#cfeef7" strokeWidth={1} />
      <line x1={x0 - 6} x2={x1} y1={y(0.025)} y2={y(0.025)} stroke="var(--warn)" strokeDasharray="2 2" />
      {ui.pit.bedTop_m > 0.01 && <line x1={x0 - 6} x2={x0 + 10} y1={y(ui.pit.bedTop_m)} y2={y(ui.pit.bedTop_m)} stroke="#d6a23a" />}
      {ui.equip.tripod >= 1 && tip < depth + 0.4 && (
        <g>
          {Math.abs(ui.probe.auger_rpm) > 20 && <rect x={lanceX - 3 - ui.probe.rm_m * 18} y={y(Math.min(depth, intake + 0.125 + ui.probe.rm_m))} width={6 + ui.probe.rm_m * 36} height={Math.max(0, y(Math.max(0, intake + 0.125 - ui.probe.rm_m)) - y(Math.min(depth, intake + 0.125 + ui.probe.rm_m)))} fill="rgba(79,195,255,0.08)" stroke="rgba(79,195,255,0.35)" strokeDasharray="2 2" rx={4} />}
          <rect x={lanceX - 2.5} y={top - 6} width={5} height={Math.max(0, y(tip) - top + 6)} fill="#b9c2cc" />
          <rect x={lanceX - 4} y={y(intake + 0.25)} width={8} height={y(intake) - y(intake + 0.25)} fill="#e3b11f" opacity={0.9} />
          {ui.probe.jetValve > 0.1 && (
            <>
              <path d={`M ${lanceX - 4} ${y(intake)} l -12 6`} stroke="#8fd2e2" strokeWidth={1.5} />
              <path d={`M ${lanceX + 4} ${y(intake)} l 12 6`} stroke="#8fd2e2" strokeWidth={1.5} />
            </>
          )}
        </g>
      )}
      {[0, 0.5, 1, 1.5, 2].filter((v) => v <= depth).map((v) => (
        <text key={v} x={x0 - 8} y={y(v) + 3} fontSize={8.5} textAnchor="end" fill={AX} fontFamily="var(--mono)">
          {v.toFixed(1)}
        </text>
      ))}
      <text x={(x0 + x1) / 2} y={H - 4} fontSize={8.5} textAnchor="middle" fill={AX}>
        mean TS {fmt(ui.pit.meanTS, 1)} %
      </text>
    </svg>
  );
}

/** H_max vs altitude for water, sludge and aerated mix with the current site (docs/04 §2). */
function AltitudePlot({ ui }: { ui: Snapshot }) {
  const W = 352;
  const H = 150;
  const pad: [number, number, number, number] = [10, 12, 28, 34];
  const x = (a: number) => pad[3] + (a / 4000) * (W - pad[1] - pad[3]);
  const y = (h: number) => H - pad[2] - (h / 14) * (H - pad[0] - pad[2]);
  const P = (a: number) => 101325 * Math.pow(1 - 2.25577e-5 * a, 5.25588);
  const line = (rho: number, eta: number) => Array.from({ length: 41 }, (_, i) => `${x(i * 100)},${y((P(i * 100) * eta) / (rho * 9.81))}`).join(' ');
  const alt = ui.env.altitude_m;
  const req = Math.max(0, ui.suction.liftReq_m);
  return (
    <Frame w={W} h={H} pad={pad} xTicks={[0, 1000, 2000, 3000, 4000]} yTicks={[0, 4, 8, 12]} xLabel="altitude (m)" yLabel="H_max (m)" x={x} y={y}>
      <polyline points={line(1000, 1)} fill="none" stroke={SERIES.blue} strokeWidth={1.5} />
      <polyline points={line(700, 0.85)} fill="none" stroke={SERIES.teal} strokeWidth={1.5} strokeDasharray="5 3" />
      <polyline points={line(1100, 0.85)} fill="none" stroke={SERIES.orange} strokeWidth={1.8} />
      <text x={x(4000) - 2} y={y(6.7) - 4} fontSize={9} textAnchor="end" fill={SERIES.blue}>
        water, perfect vacuum
      </text>
      <text x={x(4000) - 2} y={y(7.6) - 6} fontSize={9} textAnchor="end" fill={SERIES.teal}>
        aerated 700 kg/m³
      </text>
      <text x={x(4000) - 2} y={y(5.0) + 12} fontSize={9} textAnchor="end" fill={SERIES.orange}>
        sludge 1,100 kg/m³
      </text>
      <line x1={x(alt)} x2={x(alt)} y1={y(0)} y2={y(14)} stroke="#e6ebf2" strokeOpacity={0.4} strokeDasharray="3 3" />
      <circle cx={x(alt)} cy={y(ui.env.hMaxSludge_m)} r={3.5} fill={SERIES.orange} />
      {req > 0 && <circle cx={x(alt)} cy={y(Math.min(13.5, req))} r={4} fill="none" stroke={req > ui.env.hMaxSludge_m ? 'var(--alarm)' : 'var(--ok)'} strokeWidth={2} />}
      <text x={x(alt) + 6} y={y(ui.env.hMaxSludge_m) + 3} fontSize={9} fill="#e6ebf2" fontFamily="var(--mono)">
        {fmt(ui.env.hMaxSludge_m, 2)} m @ {alt} m
      </text>
      <text x={x(80)} y={y(13) + 2} fontSize={9} fill={AX}>
        Vacuum truck at the road needs +{fmt(ui.hose.elevGain_m + ui.pit.depth_m, 0)} m → impossible
      </text>
    </Frame>
  );
}

function DesignReview({ ui }: { ui: Snapshot }) {
  const rows = [
    {
      id: 'DR-1',
      title: 'PCP power',
      ok: !ui.pcp.powerLimited,
      text: ui.pcp.rpm > 5 ? `Shaft ${fmt(ui.pcp.shaft_kW, 1)} of ${ui.pcp.motor_kW} kW (Option ${ui.pcp.option})${ui.pcp.powerLimited ? ' — speed limited' : ''}` : `Option ${ui.pcp.option} · ${ui.pcp.motor_kW} kW`,
    },
    {
      id: 'DR-2',
      title: 'Conditioning',
      ok: !ui.suction.primed || ui.suction.tauY_Pa <= 55,
      text: ui.suction.primed ? `Pumped τy ${fmt(ui.suction.tauY_Pa, 0)} Pa (target ≲ 50) · TS ${fmt(ui.suction.tsMix, 1)} %` : 'Nothing pumped yet',
    },
    {
      id: 'DR-3',
      title: 'PCP inlet',
      ok: ui.pcp.cavitation >= 0.97,
      text: `Inlet ${fmt(ui.pcp.pIn_kPa, 0)} kPa abs · cube ${fmt(ui.cube.p_barg, 2)} bar(g)`,
    },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r) => (
        <div key={r.id} className={`tile compact ${r.ok ? 'ok' : 'warn'}`} style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: 8, alignItems: 'center' }}>
          <span className="mono" style={{ fontWeight: 700, color: r.ok ? 'var(--ok)' : 'var(--warn)' }}>
            {r.id}
          </span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{r.title}</div>
            <div className="dim" style={{ fontSize: 11 }}>
              {r.text}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Analysis() {
  const ui = useSim((s) => s.ui);
  const heat = useSim((s) => s.view.heat);
  const setView = useSim((s) => s.setView);
  if (!ui) return null;
  return (
    <>
      <Section title="Design review, live" tag="docs/04 §7">
        <DesignReview ui={ui} />
      </Section>
      <Section title="PCP operating envelope" tag="Q–ΔP">
        <Envelope ui={ui} />
        <p className="note">
          The operating point slides along the <b>constant-power curve</b> once the drive limits. Unconditioned cake needs ≈ 40 bar over the hose — beyond the relief; conditioned slurry sits well inside Option B.
        </p>
      </Section>
      <Section title="Discharge hose" tag={`${fmt(ui.hose.length_m, 0)} m · +${fmt(ui.hose.elevGain_m, 0)} m`}>
        <HoseProfile ui={ui} />
        <Budget ui={ui} />
      </Section>
      <Section
        title="Pit column"
        tag="24 cells"
        right={
          <div className="seg text">
            {(['ts', 'tau', 'mobility'] as const).map((h) => (
              <button key={h} className={heat === h ? 'on accent' : ''} onClick={() => setView({ heat: h })}>
                {h === 'ts' ? 'TS' : h === 'tau' ? 'τy' : 'Mobility'}
              </button>
            ))}
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <PitColumn ui={ui} heat={heat} />
          <div className="note" style={{ fontSize: 11.5 }}>
            <p style={{ marginTop: 0 }}>
              Blue bars show where the intake is drawing from. Without auger shear the cake has almost no mobility and the draw comes from the supernatant above — a <b>rathole</b>.
            </p>
            <p>
              The auger mixes cells within <b>r_m = {fmt(ui.probe.rm_m, 2)} m</b>; the jets return the pit&apos;s own liquid to the cake. Dashed amber: 25 mm seed layer.
            </p>
            <p className="mono" style={{ color: 'var(--text-2)' }}>
              surface {fmt(ui.pit.surface_m, 2)} m · cake top {fmt(ui.pit.bedTop_m, 2)} m · rathole {fmt(ui.pit.rathole_m, 2)} m
            </p>
          </div>
        </div>
      </Section>
      <Section title="Barometric suction limit" tag="docs/04 §2">
        <AltitudePlot ui={ui} />
        <p className="note">
          Altitude only affects the short pit-side suction leg. The ring marks the lift the leg needs right now ({fmt(ui.suction.liftReq_m, 1)} m incl. friction).
        </p>
      </Section>
    </>
  );
}
