import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/core/sim';
import { DT } from '../../src/core/state';
import type { Command } from '../../src/core/commands';
import { SCENARIOS, geometryFor } from '../../src/data/scenes';

/**
 * Golden run of S02 following the machine-guided SOP with good technique
 * (condition first with auger + jets, lower the lance as the level falls).
 * docs/simulation/07 §4 "scenario regression".
 */

function makeSim(seed = 7) {
  return new Sim({ scenario: SCENARIOS.S02, geometry: geometryFor('E1'), seed, mode: 'training' });
}

function driver(sim: Sim) {
  const cmd = (c: Command) => {
    sim.enqueue(c);
    sim.step();
  };
  const runFor = (s: number) => sim.run(s);
  const runUntil = (pred: () => boolean, maxS: number) => {
    const n = Math.round(maxS / DT);
    for (let i = 0; i < n && !pred(); i++) sim.step();
    return pred();
  };
  return { cmd, runFor, runUntil };
}

export function runGoodJob(sim: Sim, trace?: (row: Record<string, unknown>) => void) {
  const { cmd, runFor, runUntil } = driver(sim);
  const s = sim.state;
  cmd({ type: 'DRIVE', target: 'pit' });
  runUntil(() => s.vehicle.atPit && !s.vehicle.moving, 1200);
  cmd({ type: 'OUTRIGGERS', down: true });
  cmd({ type: 'CHOCKS', engaged: true });
  runFor(8);
  cmd({ type: 'SCAN_QR' });
  cmd({ type: 'CONFIRM_PPE' });
  cmd({ type: 'MANHOLE', open: true });
  runFor(3);
  cmd({ type: 'SNIFFER', placed: true });
  runFor(2);
  cmd({ type: 'BLOWER', on: true });
  runFor(3);
  runUntil(() => s.il.ventDone, 1500);
  cmd({ type: 'TRIPOD', deployed: true });
  runFor(9);
  cmd({ type: 'LANCE_TO', z_m: 0.8 });
  runUntil(() => s.equip.lanceTarget_m === null, 60);
  cmd({ type: 'ARM' });
  cmd({ type: 'VAC', mode: 'vac' });
  runUntil(() => s.cube.vLiq_m3 > 0.02, 240);
  cmd({ type: 'AUGER', dir: 1 });
  cmd({ type: 'PCP', run: true });
  runFor(20);
  cmd({ type: 'JET', on: true });
  const t0 = s.t;
  let lastTrace = -1e9;
  while (s.t - t0 < 3600 && !s.pit.seedEvent && s.job.state !== 'Fault') {
    sim.run(5);
    // Clear rag wraps by a short reversal, as the pendant prompts.
    if (s.probe.wraps >= 2 || s.probe.stalled) {
      cmd({ type: 'AUGER', dir: -1 });
      runUntil(() => s.probe.wraps === 0 && !s.probe.stalled, 20);
      cmd({ type: 'AUGER', dir: 1 });
    }
    // Follow the level down, staying ~0.45 m below the surface.
    const surf = s.pit.hLiq_m;
    const target = Math.max(0, Math.min(0.8, surf - 0.45));
    if (Math.abs(target - s.equip.lanceZ_m) > 0.02) cmd({ type: 'LANCE_TO', z_m: target });
    if (trace && s.t - lastTrace >= 60) {
      lastTrace = s.t;
      const sn = sim.snapshot();
      trace({
        t_min: +(s.t / 60).toFixed(1),
        state: sn.job.state,
        pD: +sn.hose.pD_bar.toFixed(1),
        qHose: Math.round(sn.hose.q_lpm),
        qS: Math.round(sn.suction.q_lpm),
        jet: Math.round(sn.probe.jet_lpm),
        rel: Math.round(sn.hose.relief_lpm),
        tsMix: +sn.suction.tsMix.toFixed(1),
        tsPit: +sn.pit.meanTS.toFixed(1),
        cubeL: Math.round(sn.cube.level_L),
        pC: +sn.cube.p_barg.toFixed(2),
        pit: Math.round(sn.pit.removedPct),
        fill: Math.round(sn.hose.fill * 100),
        augA: +sn.probe.current_A.toFixed(1),
        rpm: Math.round(sn.pcp.rpm),
        kW: +sn.pcp.shaft_kW.toFixed(1),
        h2s: +sn.gas.sensed.h2s_ppm.toFixed(1),
        lance: +s.equip.lanceZ_m.toFixed(2),
        surf: +surf.toFixed(2),
      });
    }
  }
  return { cmd, runFor, runUntil };
}

describe('S02 golden run', () => {
  it('completes the SOP end-to-end with good technique', () => {
    const sim = makeSim();
    const rows: Record<string, unknown>[] = [];
    const { cmd, runFor, runUntil } = runGoodJob(sim, (r) => rows.push(r));
    if (process.env.TRACE) console.table(rows);
    const s = sim.state;
    const snap = sim.snapshot();
    if (process.env.TRACE) {
      console.log('events:', sim.log.items.filter((e) => e.sev !== 'info').map((e) => `${(e.t / 60).toFixed(1)} ${e.code} ${e.msg}`).join('\n'));
      console.log({ removed: snap.pit.removedPct, maxPd: snap.totals.maxPd_bar, energy: snap.power.energy_kWh, spec: snap.power.specific_kWhm3, delivered: snap.totals.delivered_L, metered: snap.pcp.metered_L, soc: snap.power.soc });
    }
    expect(s.job.criticals.filter((c) => c !== 'seed_removed')).toEqual([]);
    expect(s.pit.seedEvent).toBe(true);
    expect(snap.pit.removedPct).toBeGreaterThan(90);
    expect(snap.totals.maxPd_bar).toBeLessThan(20);

    // Finish: purge, decon, stow, close, FSTP.
    cmd({ type: 'FINISH' });
    runUntil(() => s.job.state === 'Decon', 600);
    expect(s.job.state).toBe('Decon');
    cmd({ type: 'DECON_CONFIRM' });
    cmd({ type: 'LANCE_TO', z_m: s.pit.depth_m + 0.35 });
    runUntil(() => s.equip.lanceTarget_m === null, 60);
    cmd({ type: 'TRIPOD', deployed: false });
    runFor(9);
    cmd({ type: 'MANHOLE', open: false });
    runFor(3);
    cmd({ type: 'CHOCKS', engaged: false });
    cmd({ type: 'OUTRIGGERS', down: false });
    runFor(8);
    cmd({ type: 'CLOSE_JOB' });
    expect(s.job.closed).toBe(true);
    cmd({ type: 'FSTP_CHECKOUT', facility: 'fstp' });
    expect(s.job.fstp?.verified).toBe(true);
    expect(s.job.sop.every(Boolean)).toBe(true);
    const events = sim.telem.out.map((m) => m.event);
    expect(events).toContain('job.started');
    expect(events).toContain('job.telemetry');
    expect(events).toContain('job.closed');
  }, 120000);
});
