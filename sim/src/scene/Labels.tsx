import { Html } from '@react-three/drei';
import { E1, E1_HOSE_ROUTE, E1_ROAD_Y } from '../data/scenes/e1';
import { useSim } from '../store/simStore';
import { fmt, fmtInt } from '../ui/format';
import { crawlerPose } from './Crawler';
import { ATTACH } from './crawler/layout';

/** Live engineering callouts pinned to components (8 Hz). */
export function Labels() {
  const ui = useSim((s) => s.ui);
  const on = useSim((s) => s.view.labels);
  const camera = useSim((s) => s.camera);
  if (!ui || !on) return null;
  const v = ui.vehicle;
  const pose = crawlerPose(v.s_m, v.heading, v.pitch_deg, v.roll_deg);
  const atPit = v.atPit;
  const near = camera === 'pit' || camera === 'skid' || camera === 'site' || camera === 'follow';
  const front = ui.hose.fill > 0.01 && ui.hose.fill < 0.999 ? E1_HOSE_ROUTE.sample(ui.hose.front_m).p : null;
  const pdTone = ui.hose.pD_bar >= 22 ? 'alarm' : ui.hose.pD_bar >= 20 ? 'warn' : '';
  return (
    <group>
      {!atPit && (
        <Callout pos={[pose.pos.x, pose.pos.y + 1.7, pose.pos.z]} tag="CRAWLER · IN-01" value={`${fmt(v.v_ms, 2)} m/s · pitch ${fmt(Math.abs(v.pitch_deg), 0)}°`} />
      )}
      {atPit && near && (
        <>
          <Callout pos={[E1.park.x + ATTACH.pt02.x, ATTACH.pt02.y + 0.62, E1.park.z + ATTACH.pt02.z]} tag="PT-02 · PCP" value={`${fmt(ui.hose.pD_bar, 1)} bar · ${fmt(ui.pcp.rpm, 0)} rpm`} tone={pdTone} />
          <Callout pos={[E1.park.x + ATTACH.cube.x, ATTACH.cube.y + 0.42, E1.park.z + ATTACH.cube.z]} tag="LT-01 · CUBE" value={`${fmt(ui.cube.level_L, 0)} L · ${fmt(ui.cube.p_barg, 2)} bar(g)`} />
        </>
      )}
      {atPit && ui.equip.snifferPlaced && (
        <Callout pos={[E1.pit.x - 0.4, 0.75, E1.pit.z + 0.3]} tag="GD-01 · H₂S" value={`${fmt(ui.gas.sensed.h2s_ppm, 1)} ppm · O₂ ${fmt(ui.gas.sensed.o2_pct, 1)}%`} tone={ui.gas.alarm ? 'alarm' : 'ok'} />
      )}
      {atPit && ui.equip.tripod >= 1 && camera === 'pit' && (
        <Callout pos={[E1.pit.x + 0.5, -2.4 + ui.equip.lanceZ_m + 0.35, E1.pit.z + 0.62]} tag="AUGER · IT-01" value={`${fmt(ui.probe.auger_rpm, 0)} rpm · ${fmt(ui.probe.current_A, 1)} A`} tone={ui.probe.stalled ? 'alarm' : ui.probe.current_A > 6 ? 'warn' : ''} />
      )}
      {front && <Callout pos={[front.x, front.y + 0.9, front.z]} tag="SLUDGE FRONT" value={`${fmt(ui.hose.front_m, 0)} m · ${fmt(ui.hose.q_lpm, 0)} L/min`} />}
      {ui.hose.kink && (
        <Callout pos={[E1_HOSE_ROUTE.sample(ui.hose.kink.s_m).p.x, E1_HOSE_ROUTE.sample(ui.hose.kink.s_m).p.y + 1, E1_HOSE_ROUTE.sample(ui.hose.kink.s_m).p.z]} tag="KINK" value={`s = ${fmt(ui.hose.kink.s_m, 0)} m`} tone="alarm" />
      )}
      <Callout pos={[E1.tanker.x + 1, E1_ROAD_Y + 3.4, E1.tanker.z]} tag="TANKER" value={`${fmtInt(ui.receiver.v_L)} / ${fmtInt(ui.receiver.cap_L)} L`} />
    </group>
  );
}

/** Fixed screen-size callout (constant pixel size at any zoom). */
function Callout({ pos, tag, value, tone = '' }: { pos: [number, number, number]; tag: string; value: string; tone?: string }) {
  return (
    <Html position={pos} zIndexRange={[2, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`label3d ${tone}`}>
        <div className="card">
          <div className="tg">{tag}</div>
          <div className="vv">{value}</div>
        </div>
        <div className="stem" />
      </div>
    </Html>
  );
}
