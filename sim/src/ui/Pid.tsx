import type { ReactNode } from 'react';
import type { Snapshot } from '../core';
import { useSim, type CameraPreset } from '../store/simStore';
import { rgb, tsColor } from './colors';
import { fmt, fmtInt } from './format';

const EMPTY = '#364052';
const PIPE = 5;

/** Line coloured by contents (TS ramp) when flowing; dashes animate at a speed ∝ flow. */
function Pipe({ d, q, ts, width = PIPE, dashed, color, warn }: { d: string; q: number; ts: number; width?: number; dashed?: boolean; color?: string; warn?: boolean }) {
  const flowing = q > 0.5;
  const c = color ?? (warn ? '#f3b343' : flowing ? rgb(tsColor(ts)) : EMPTY);
  const dur = Math.max(0.25, Math.min(3, 40 / Math.max(1, q)));
  return (
    <g>
      <path d={d} fill="none" stroke="#0b0f15" strokeWidth={width + 3} strokeLinejoin="round" strokeLinecap="round" />
      <path d={d} fill="none" stroke={c} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={dashed ? '4 4' : undefined} opacity={flowing || color ? 1 : 0.9} />
      {flowing && !dashed && <path d={d} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.4} className="flowline" style={{ animationDuration: `${dur}s` }} strokeLinecap="round" />}
    </g>
  );
}

function Bubble({ x, y, tag, value, tone = '', anchor = 'right' }: { x: number; y: number; tag: [string, string]; value?: string; tone?: '' | 'warn' | 'alarm' | 'ok'; anchor?: 'right' | 'left' | 'below' | 'above' }) {
  const stroke = tone === 'alarm' ? '#ff5a5f' : tone === 'warn' ? '#f3b343' : tone === 'ok' ? '#37d08f' : '#8a97aa';
  const vx = anchor === 'right' ? x + 17 : anchor === 'left' ? x - 17 : x;
  const vy = anchor === 'below' ? y + 26 : anchor === 'above' ? y - 18 : y + 4;
  return (
    <g className={tone === 'alarm' ? 'blink' : undefined}>
      <circle cx={x} cy={y} r={13} fill="#10151d" stroke={stroke} strokeWidth={1.4} />
      <line x1={x - 13} x2={x + 13} y1={y} y2={y} stroke={stroke} strokeWidth={0.8} opacity={0.6} />
      <text x={x} y={y - 3} fontSize={8} textAnchor="middle" fill="#cdd5df" fontWeight={700}>
        {tag[0]}
      </text>
      <text x={x} y={y + 9} fontSize={8} textAnchor="middle" fill="#cdd5df" fontFamily="var(--mono)">
        {tag[1]}
      </text>
      {value && (
        <text x={vx} y={vy} fontSize={10.5} textAnchor={anchor === 'right' ? 'start' : anchor === 'left' ? 'end' : 'middle'} fill={tone === 'alarm' ? '#ff9a9d' : tone === 'warn' ? '#ffd27a' : '#e6ebf2'} fontFamily="var(--mono)" fontWeight={600}>
          {value}
        </text>
      )}
    </g>
  );
}

function Sym({ cam, children, label }: { cam: CameraPreset; children: ReactNode; label: string }) {
  const setCamera = useSim((s) => s.setCamera);
  return (
    <g className="sym" onClick={() => setCamera(cam)} role="button" aria-label={label}>
      <title>{label} — click to fly the camera there</title>
      {children}
    </g>
  );
}

function Label({ x, y, children, anchor = 'middle', dim }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; dim?: boolean }) {
  return (
    <text x={x} y={y} fontSize={10} textAnchor={anchor} fill={dim ? '#6b7789' : '#a7b1c0'} fontWeight={dim ? 400 : 600}>
      {children}
    </text>
  );
}

function Valve({ x, y, open, vertical, tone }: { x: number; y: number; open: boolean; vertical?: boolean; tone?: 'warn' }) {
  const c = tone === 'warn' ? '#f3b343' : open ? '#37d08f' : '#6b7789';
  const t = vertical ? `rotate(90 ${x} ${y})` : undefined;
  return (
    <g transform={t}>
      <path d={`M ${x - 9} ${y - 7} L ${x + 9} ${y + 7} L ${x + 9} ${y - 7} L ${x - 9} ${y + 7} Z`} fill={open ? c : '#10151d'} stroke={c} strokeWidth={1.4} strokeLinejoin="round" />
    </g>
  );
}

export function Pid() {
  const ui = useSim((s) => s.ui);
  if (!ui) return null;
  return <PidSvg ui={ui} />;
}

function PidSvg({ ui }: { ui: Snapshot }) {
  const pit = ui.pit;
  const depth = pit.depth_m;
  const pitTop = 40;
  const pitBot = 168;
  const zy = (z: number) => pitBot - (z / depth) * (pitBot - pitTop);
  const tipY = Math.min(zy(Math.min(ui.equip.lanceZ_m, depth + 0.35)), pitBot - 2);
  const lanceIn = ui.equip.tripod >= 1;
  const qS = ui.suction.q_lpm;
  const qP = Math.max(0, ui.pcp.q_lpm);
  const qH = ui.hose.q_lpm;
  const qJ = ui.hose.jet_lpm;
  const qR = ui.hose.relief_lpm;
  const tsP = ui.suction.tsMix;
  const tsC = ui.cube.ts;
  const g = ui.gas.sensed;
  const gasTone = ui.gas.alarm ? 'alarm' : ui.equip.snifferPlaced ? 'ok' : '';
  const pdTone = ui.hose.pD_bar >= 22 ? 'alarm' : ui.hose.pD_bar >= 20 ? 'warn' : '';
  const cubeFrac = Math.min(1, ui.cube.level_L / 90);
  const tank = ui.receiver.v_L / ui.receiver.cap_L;

  // Discharge hose drawn as a stepped climb from the check valve to the tanker.
  const hx0 = 676;
  const hy0 = 98;
  const hx1 = 1004;
  const hy1 = 44;
  const steps = 7;
  const hosePts: [number, number][] = [[hx0, hy0]];
  for (let i = 1; i <= steps; i++) {
    const x = hx0 + ((hx1 - hx0) * i) / steps;
    const yPrev = hosePts[hosePts.length - 1][1];
    const y = hy0 + ((hy1 - hy0) * i) / steps;
    hosePts.push([x - (hx1 - hx0) / steps / 2, yPrev], [x - (hx1 - hx0) / steps / 2 + 8, y], [x, y]);
  }
  const hosePath = 'M ' + hosePts.map((p) => p.join(' ')).join(' L ');
  // Filled portion: approximate by cumulative polyline length.
  const segLens = hosePts.slice(1).map((p, i) => Math.hypot(p[0] - hosePts[i][0], p[1] - hosePts[i][1]));
  const total = segLens.reduce((a, b) => a + b, 0);
  let left = total * ui.hose.fill;
  const filled: [number, number][] = [hosePts[0]];
  for (let i = 0; i < segLens.length && left > 0; i++) {
    const a = hosePts[i];
    const b = hosePts[i + 1];
    const f = Math.min(1, left / segLens[i]);
    filled.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    left -= segLens[i];
  }
  const filledPath = 'M ' + filled.map((p) => p.join(' ')).join(' L ');
  const kinkS = ui.hose.kink?.s_m ?? ui.hose.crushed?.s_m;
  let kinkPt: [number, number] | null = null;
  if (kinkS !== undefined) {
    let target = (kinkS / ui.hose.length_m) * total;
    for (let i = 0; i < segLens.length; i++) {
      if (target <= segLens[i]) {
        const a = hosePts[i];
        const b = hosePts[i + 1];
        const f = target / segLens[i];
        kinkPt = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        break;
      }
      target -= segLens[i];
    }
  }

  return (
    <svg className="pid-svg" viewBox="-50 -12 1165 218" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Live process and instrumentation diagram">
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#2a3443" strokeWidth="2" />
        </pattern>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a97aa" />
        </marker>
      </defs>

      {/* ---------------- Pit ---------------- */}
      <Sym cam="pit" label="Septic tank (pit) with lance">
        <rect x={10} y={pitTop - 6} width={180} height={6} fill="url(#hatch)" />
        <rect x={30} y={pitTop} width={130} height={pitBot - pitTop} fill="#0b0f15" />
        {pit.cells.map((c, i) => (c.h > 1e-4 ? <rect key={i} x={30} y={zy(c.z0 + c.h)} width={130} height={Math.max(0.5, zy(c.z0) - zy(c.z0 + c.h))} fill={rgb(tsColor(c.ts))} opacity={0.95} /> : null))}
        <path d={`M 30 ${pitTop} L 30 ${pitBot} L 160 ${pitBot} L 160 ${pitTop}`} fill="none" stroke="#8a97aa" strokeWidth={2} className="hl" />
        <line x1={30} x2={80} y1={pitTop} y2={pitTop} stroke="#8a97aa" strokeWidth={3} />
        <line x1={110} x2={160} y1={pitTop} y2={pitTop} stroke="#8a97aa" strokeWidth={3} />
        {!ui.equip.manholeOpen && <line x1={80} x2={110} y1={pitTop - 2} y2={pitTop - 2} stroke="#8a97aa" strokeWidth={3} />}
        {lanceIn && (
          <g>
            <rect x={92} y={6} width={6} height={Math.max(0, tipY - 6)} fill="#aab4c0" />
            <path d={`M 88 ${tipY - 14} l 14 -4 M 88 ${tipY - 8} l 14 -4 M 88 ${tipY - 2} l 14 -4`} stroke={Math.abs(ui.probe.auger_rpm) > 20 ? '#4fc3ff' : '#6b7789'} strokeWidth={1.6} />
            {qJ > 1 && <path d={`M 92 ${tipY} l -12 6 M 98 ${tipY} l 12 6`} stroke="#8fd2e2" strokeWidth={1.6} markerEnd="url(#arr)" />}
          </g>
        )}
        <Label x={95} y={188}>
          Pit · {fmtInt(pit.volume_L)} L · {fmt(pit.removedPct, 0)} % out
        </Label>
      </Sym>
      <Bubble x={45} y={18} tag={['GD', '01']} value={ui.equip.snifferPlaced ? `H₂S ${fmt(g.h2s_ppm, 0)} · O₂ ${fmt(g.o2_pct, 1)}` : 'not placed'} tone={gasTone as '' | 'ok' | 'alarm'} anchor="left" />
      <g opacity={ui.equip.blowerOn ? 1 : 0.4}>
        <circle cx={140} cy={18} r={10} fill="#10151d" stroke={ui.equip.blowerOn ? '#37d08f' : '#6b7789'} strokeWidth={1.4} />
        <path d="M 140 18 l 0 -7 M 140 18 l 6 4 M 140 18 l -6 4" stroke={ui.equip.blowerOn ? '#37d08f' : '#6b7789'} strokeWidth={1.4} />
        <text x={140} y={6} fontSize={8} textAnchor="middle" fill="#8a97aa" fontWeight={700}>
          BL-01
        </text>
        {ui.equip.blowerOn && <path d="M 130 22 Q 112 26 108 36" fill="none" stroke="#37d08f" strokeWidth={1.2} markerEnd="url(#arr)" />}
      </g>
      {lanceIn && (
        <g>
          <line x1={23} x2={30} y1={100} y2={100} stroke="#8a97aa" strokeWidth={1} strokeDasharray="2 2" />
          <Bubble x={10} y={100} tag={['DT', '01']} value={`${fmt(ui.pit.depthGauge_m, 2)} m`} anchor="below" />
        </g>
      )}

      {/* ---------------- Suction leg ---------------- */}
      <Pipe d={`M 95 6 L 236 6 L 236 54`} q={qS} ts={tsP} warn={ui.suction.stalled} />
      <Label x={165} y={-1} dim>
        suction {fmt(qS, 0)} L/min{ui.suction.stalled ? ' · LIFT LIMIT' : ''}
      </Label>
      <Pipe d={`M 288 26 L 104 26 L 104 ${Math.max(40, tipY - 20)}`} q={ui.probe.airCmd ? 1 : 0} ts={0} width={1.6} dashed color={ui.probe.airCmd ? '#9aa9ff' : '#3a4454'} />

      {/* ---------------- Surge cube + vane ---------------- */}
      <Sym cam="skid" label="Surge cube, vane pump and PCP (booster skid)">
        <rect x={210} y={54} width={62} height={80} rx={7} fill="#0b0f15" stroke="#8a97aa" strokeWidth={2} className="hl" />
        <rect x={212} y={54 + 78 * (1 - cubeFrac) + 1} width={58} height={78 * cubeFrac} rx={5} fill={rgb(tsColor(tsC))} opacity={0.9} />
        <line x1={210} x2={216} y1={54 + 80 * (1 - 0.9)} y2={54 + 80 * (1 - 0.9)} stroke="#f3b343" />
        <line x1={210} x2={216} y1={54 + 80 * (1 - 6 / 90)} y2={54 + 80 * (1 - 6 / 90)} stroke="#ff5a5f" />
        <Label x={241} y={48}>
          Surge cube 90 L
        </Label>
        <circle cx={300} cy={30} r={13} fill="#10151d" stroke={ui.cube.vaneMode === 'off' ? '#6b7789' : '#4fc3ff'} strokeWidth={1.6} />
        <g transform={`rotate(${(ui.t * 360 * (ui.cube.vaneMode === 'off' ? 0 : 1.5)) % 360} 300 30)`}>
          <path d="M 300 20 L 300 40 M 290 30 L 310 30" stroke={ui.cube.vaneMode === 'off' ? '#6b7789' : '#4fc3ff'} strokeWidth={1.4} />
        </g>
        <line x1={256} x2={287} y1={30} y2={30} stroke="#8a97aa" strokeWidth={2} />
        <line x1={256} x2={256} y1={30} y2={54} stroke="#8a97aa" strokeWidth={2} />
        <path d="M 313 30 L 334 30 L 334 14" fill="none" stroke="#8a97aa" strokeWidth={1.4} markerEnd="url(#arr)" />
        <text x={300} y={9} fontSize={8.5} textAnchor="middle" fill="#8a97aa" fontWeight={700}>
          M-VAC {ui.cube.vaneMode === 'off' ? 'off' : ui.cube.vaneMode === 'vac' ? `vac ${fmt(ui.cube.vaneU * 100, 0)}%` : 'BLOW'}
        </text>
      </Sym>
      <Bubble x={188} y={96} tag={['LT', '01']} value={`${fmt(ui.cube.level_L, 0)} L`} tone={ui.cube.floatTripped ? 'warn' : ''} anchor="below" />
      <line x1={201} x2={210} y1={96} y2={96} stroke="#8a97aa" strokeWidth={1} strokeDasharray="2 2" />
      <Bubble x={300} y={76} tag={['PT', '01']} value={`${fmt(ui.cube.p_barg, 2)} bar(g)`} />
      <line x1={272} x2={287} y1={76} y2={76} stroke="#8a97aa" strokeWidth={1} strokeDasharray="2 2" />

      {/* rock trap → PCP */}
      <Pipe d={`M 241 134 L 241 158 L 334 158`} q={qP} ts={tsC} />
      <rect x={233} y={146} width={16} height={10} fill="#10151d" stroke="#8a97aa" />

      {/* ---------------- PCP ---------------- */}
      <Sym cam="skid" label="Progressive cavity pump">
        <rect x={334} y={144} width={104} height={28} rx={14} fill="#10151d" stroke={ui.pcp.rpm > 5 ? '#4fc3ff' : '#8a97aa'} strokeWidth={2} className="hl" />
        <path d={Array.from({ length: 9 }, (_, i) => `${i === 0 ? 'M' : 'L'} ${344 + i * 10.5} ${158 + (i % 2 ? -8 : 8)}`).join(' ')} fill="none" stroke={ui.pcp.rpm > 5 ? '#4fc3ff' : '#6b7789'} strokeWidth={1.6} />
        <circle cx={456} cy={158} r={12} fill="#10151d" stroke="#8a97aa" strokeWidth={1.6} />
        <text x={456} y={162} fontSize={10} textAnchor="middle" fill="#cdd5df" fontWeight={700}>
          M
        </text>
        <Label x={384} y={134}>
          PCP · {fmt(ui.pcp.rpm, 0)} rpm · {fmt(ui.pcp.shaft_kW, 1)} kW
        </Label>
      </Sym>
      <Bubble x={512} y={160} tag={['TT', '01']} value={`${fmt(ui.pcp.statorT_C, 0)} °C`} tone={ui.pcp.statorT_C >= 90 ? 'alarm' : ui.pcp.statorT_C >= 70 ? 'warn' : ''} anchor="right" />

      {/* discharge riser and tee */}
      <Pipe d={`M 430 144 L 430 98 L 664 98`} q={qP} ts={tsC} />
      {/* jet branch: tee → V-01 → PRV → back to the lance tip */}
      <Pipe d={`M 474 98 L 474 186 L 168 186 L 168 16 L 98 16 L 98 ${tipY}`} q={lanceIn ? qJ : 0} ts={tsC} width={3} />
      <Valve x={474} y={124} open={ui.probe.jetValve > 0.5} vertical />
      <text x={486} y={127} fontSize={9} fill="#a7b1c0" fontWeight={700}>
        V-01 jets {fmt(qJ, 0)}
      </text>
      <g>
        <rect x={340} y={178} width={32} height={16} rx={3} fill="#10151d" stroke="#8a97aa" />
        <text x={356} y={189} fontSize={8} textAnchor="middle" fill="#a7b1c0" fontWeight={700}>
          PRV 6
        </text>
      </g>
      <Bubble x={520} y={70} tag={['PT', '02']} value={`${fmt(ui.hose.pD_bar, 1)} bar`} tone={pdTone} />
      <line x1={520} x2={520} y1={83} y2={98} stroke="#8a97aa" strokeWidth={1} strokeDasharray="2 2" />

      {/* relief → back to cube */}
      <Pipe d={`M 590 98 L 590 46 L 280 46 L 280 64 L 272 64`} q={qR} ts={tsC} width={3} warn={ui.hose.reliefOpen} />
      <g>
        <Valve x={590} y={98} open={ui.hose.reliefOpen} tone={ui.hose.reliefOpen ? 'warn' : undefined} />
        <path d="M 590 91 L 590 80 M 585 84 L 595 81 M 585 88 L 595 85" stroke="#8a97aa" strokeWidth={1.2} />
        <text x={600} y={78} fontSize={9} fill={ui.hose.reliefOpen ? '#ffd27a' : '#a7b1c0'} fontWeight={700}>
          PSV 20 bar{ui.hose.reliefOpen ? ` · ${fmt(qR, 0)} L/min` : ''}
        </text>
      </g>

      {/* check valve */}
      <g>
        <circle cx={644} cy={98} r={10} fill="#10151d" stroke={ui.hose.checkValve ? '#8a97aa' : '#ff5a5f'} strokeWidth={1.4} />
        <path d="M 638 92 L 650 98 L 638 104 Z" fill={ui.hose.checkValve ? '#8a97aa' : 'none'} stroke={ui.hose.checkValve ? '#8a97aa' : '#ff5a5f'} />
        <text x={644} y={120} fontSize={9} textAnchor="middle" fill={ui.hose.checkValve ? '#a7b1c0' : '#ff9a9d'} fontWeight={700}>
          {ui.hose.checkValve ? 'CV' : 'CV removed'}
        </text>
      </g>

      {/* ---------------- Discharge hose ---------------- */}
      <Sym cam="hose" label="Discharge hose up the stepped lane">
        <path d={hosePath} fill="none" stroke="#0b0f15" strokeWidth={PIPE + 3} strokeLinejoin="round" />
        <path d={hosePath} fill="none" stroke={EMPTY} strokeWidth={PIPE} strokeLinejoin="round" className="hl" />
        {ui.hose.fill > 0.001 && <path d={filledPath} fill="none" stroke={rgb(tsColor(ui.hose.meanTS))} strokeWidth={PIPE} strokeLinejoin="round" strokeLinecap="round" />}
        {qH > 0.5 && <path d={filledPath} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.4} className="flowline" style={{ animationDuration: `${Math.max(0.25, Math.min(3, 40 / qH))}s` }} />}
        {kinkPt && (
          <g className="blink">
            <circle cx={kinkPt[0]} cy={kinkPt[1]} r={9} fill="none" stroke="#ff5a5f" strokeWidth={2} />
            <text x={kinkPt[0]} y={kinkPt[1] + 22} fontSize={9} textAnchor="middle" fill="#ff9a9d" fontWeight={700}>
              {ui.hose.crushed ? 'CRUSHED' : 'KINK'}
            </text>
          </g>
        )}
        <Label x={840} y={132}>
          Discharge hose {fmt(ui.hose.length_m, 0)} m · +{fmt(ui.hose.elevGain_m, 0)} m
        </Label>
        <Label x={840} y={146} dim>
          {ui.hose.fill >= 0.999 ? `full · ${fmt(qH, 0)} L/min to tanker` : ui.hose.fill > 0 ? `front at ${fmt(ui.hose.front_m, 0)} m · ${fmt(qH, 0)} L/min` : 'empty'}
        </Label>
      </Sym>

      {/* ---------------- Tanker ---------------- */}
      <Sym cam="tanker" label="Road tanker (receiver)">
        <rect x={1010} y={22} width={78} height={42} rx={20} fill="#0b0f15" stroke="#8a97aa" strokeWidth={2} className="hl" />
        <clipPath id="tankclip">
          <rect x={1010} y={22} width={78} height={42} rx={20} />
        </clipPath>
        <rect x={1010} y={22 + 42 * (1 - tank)} width={78} height={42 * tank} fill={rgb(tsColor(ui.hose.meanTS || 10))} clipPath="url(#tankclip)" />
        <line x1={1020} x2={1078} y1={74} y2={74} stroke="#8a97aa" strokeWidth={2} />
        <circle cx={1028} cy={78} r={5} fill="#10151d" stroke="#8a97aa" />
        <circle cx={1070} cy={78} r={5} fill="#10151d" stroke="#8a97aa" />
        <Label x={1049} y={100}>
          Tanker
        </Label>
        <Label x={1049} y={113} dim>
          {fmtInt(ui.receiver.v_L)} / {fmtInt(ui.receiver.cap_L)} L
        </Label>
      </Sym>
    </svg>
  );
}
