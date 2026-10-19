import { describe, expect, it } from 'vitest';
import { Sim } from '../../src/core/sim';
import { DT } from '../../src/core/state';
import type { Command } from '../../src/core/commands';
import { pitVolume } from '../../src/core/models/pit';
import { SCENARIOS, geometryFor } from '../../src/data/scenes';

function setup(mode: 'sandbox' | 'training' = 'sandbox', seed = 11) {
  const sim = new Sim({ scenario: SCENARIOS.S02, geometry: geometryFor('E1'), seed, mode });
  const s = sim.state;
  const cmd = (c: Command) => {
    sim.enqueue(c);
    sim.step();
  };
  const until = (pred: () => boolean, maxS: number) => {
    for (let i = 0; i < maxS / DT && !pred(); i++) sim.step();
    return pred();
  };
  /** Drive, set up and ventilate; returns once K1 is permitted. */
  const toArmed = () => {
    cmd({ type: 'DRIVE', target: 'pit' });
    until(() => s.vehicle.atPit && !s.vehicle.moving, 1200);
    cmd({ type: 'OUTRIGGERS', down: true });
    cmd({ type: 'CHOCKS', engaged: true });
    sim.run(8);
    cmd({ type: 'SCAN_QR' });
    cmd({ type: 'CONFIRM_PPE' });
    cmd({ type: 'MANHOLE', open: true });
    sim.run(3);
    cmd({ type: 'SNIFFER', placed: true });
    sim.run(2);
    cmd({ type: 'BLOWER', on: true });
    sim.run(3);
    until(() => s.il.ventDone, 1500);
    cmd({ type: 'TRIPOD', deployed: true });
    sim.run(9);
  };
  const extract = (lanceZ: number, jets: boolean) => {
    cmd({ type: 'LANCE_TO', z_m: lanceZ });
    until(() => s.equip.lanceTarget_m === null, 60);
    cmd({ type: 'ARM' });
    cmd({ type: 'VAC', mode: 'vac' });
    until(() => s.cube.vLiq_m3 > 0.02, 240);
    cmd({ type: 'AUGER', dir: 1 });
    cmd({ type: 'PCP', run: true });
    if (jets) cmd({ type: 'JET', on: true });
  };
  return { sim, s, cmd, until, toArmed, extract };
}

describe('determinism (SIM-NFR-03)', () => {
  it('same seed + same commands → identical state hash', () => {
    const a = setup('sandbox', 5);
    const b = setup('sandbox', 5);
    for (const x of [a, b]) {
      x.toArmed();
      x.extract(0.8, true);
      x.sim.run(120);
    }
    expect(a.sim.hash()).toBe(b.sim.hash());
    expect(a.sim.recorded.length).toBe(b.sim.recorded.length);
  }, 60000);
  it('a different seed changes the sensor noise', () => {
    const a = setup('sandbox', 1);
    const b = setup('sandbox', 2);
    a.toArmed();
    b.toArmed();
    expect(a.sim.hash()).not.toBe(b.sim.hash());
  }, 60000);
  it('replaying the recorded command log reproduces the run', () => {
    const a = setup('sandbox', 9);
    a.toArmed();
    a.extract(0.8, true);
    a.sim.run(60);
    const replay = new Sim({ scenario: SCENARIOS.S02, geometry: geometryFor('E1'), seed: 9, mode: 'sandbox' });
    const log = [...a.sim.recorded];
    let k = 0;
    while (replay.state.step < a.sim.state.step) {
      while (k < log.length && log[k].step === replay.state.step + 1) replay.enqueue(log[k++].cmd);
      replay.step();
    }
    expect(replay.hash()).toBe(a.sim.hash());
  }, 60000);
});

describe('safety interlocks in the running sim', () => {
  it('PCP and ARM are blocked before ventilation is complete', () => {
    const { sim, s, cmd, until } = setup('training');
    cmd({ type: 'DRIVE', target: 'pit' });
    until(() => s.vehicle.atPit, 1200);
    cmd({ type: 'ARM' });
    cmd({ type: 'PCP', run: true });
    expect(s.job.blockedAttempts).toBe(2);
    expect(s.il.k1).toBe(false);
    expect(s.pcp.run).toBe(false);
    expect(sim.log.items.some((e) => e.code === 'W_BLOCKED')).toBe(true);
  }, 60000);
  it('a gas alarm while extracting drops K1 and faults the job (SAF-04)', () => {
    const { s, cmd, toArmed, extract, sim } = setup();
    toArmed();
    extract(0.8, true);
    sim.run(60);
    cmd({ type: 'GAS_SPIKE', mult: 12 });
    sim.run(90);
    expect(s.job.state).toBe('Fault');
    expect(s.job.faults).toContain('GAS');
    expect(s.pcp.rpm).toBe(0);
    expect(s.equip.blowerOn).toBe(true);
    expect(s.il.ventDone).toBe(false);
  }, 60000);
  it('a crushed hose opens the relief and trips PT-02 (S07)', () => {
    const { s, cmd, toArmed, extract, sim } = setup();
    toArmed();
    extract(0.8, true);
    sim.run(240);
    cmd({ type: 'FAILURE', key: 'crush', on: true, s_m: 60 });
    sim.run(5);
    expect(s.il.overpressure).toBe(true);
    expect(s.job.state).toBe('Fault');
    expect(s.totals.maxPd_Pa / 1e5).toBeGreaterThan(22);
    expect(s.totals.maxPd_Pa / 1e5).toBeLessThan(30);
  }, 60000);
  it('working the manhole without PPE is a critical exposure; with PPE it is not', () => {
    for (const ppe of [false, true]) {
      const { s, cmd, until, sim } = setup('training');
      cmd({ type: 'DRIVE', target: 'pit' });
      until(() => s.vehicle.atPit && !s.vehicle.moving, 1200);
      cmd({ type: 'SCAN_QR' });
      if (ppe) cmd({ type: 'CONFIRM_PPE' });
      cmd({ type: 'MANHOLE', open: true });
      sim.run(3);
      cmd({ type: 'SNIFFER', placed: true });
      sim.run(2);
      cmd({ type: 'BLOWER', on: true });
      sim.run(3);
      expect(s.job.criticals.includes('gas_exposure')).toBe(!ppe);
    }
  }, 60000);
  it('training mode refuses the interlock override', () => {
    const { s, cmd } = setup('training');
    cmd({ type: 'FAILURE', key: 'interlockOverride', on: true });
    expect(s.il.override).toBe(false);
  });
});

describe('design-review explainers', () => {
  it('DR-1: Option A (3 kW) is power-limited where Option B is not', () => {
    const a = setup();
    a.cmd({ type: 'SET_PARAM', path: 'pcp.option', value: 'A' });
    a.toArmed();
    a.extract(0.8, true);
    a.sim.run(420);
    const b = setup();
    b.toArmed();
    b.extract(0.8, true);
    b.sim.run(420);
    expect(a.s.pcp.powerLimited).toBe(true);
    expect(a.s.pcp.rpm).toBeLessThan(290);
    expect(b.s.pcp.powerLimited).toBe(false);
    expect(b.s.hose.q_m3s).toBeGreaterThan(a.s.hose.q_m3s);
  }, 60000);
  it('DR-2: drawing unconditioned cake fails (suction lift limit or relief) while a conditioned slurry flows', () => {
    const bad = setup();
    bad.toArmed();
    bad.extract(0.0, false);
    bad.sim.run(300);
    const failed = bad.s.suction.stalled || bad.s.hose.reliefLift > 0.02 || bad.s.suction.q_m3s * 60000 < 40;
    expect(failed).toBe(true);
    const good = setup();
    good.toArmed();
    good.extract(0.8, true);
    good.sim.run(300);
    expect(good.s.suction.tsMix).toBeLessThan(12.5);
    expect(good.s.suction.q_m3s * 60000).toBeGreaterThan(100);
  }, 60000);
});

describe('lance auto-follow', () => {
  it('keeps the intake submerged down to the seed-layer stop without a dry-run trip', () => {
    const { s, sim, cmd, until, toArmed, extract } = setup('training', 3);
    toArmed();
    extract(0.8, true);
    cmd({ type: 'LANCE_AUTO', on: true });
    // Operator only answers the auger-overload prompt (reverse to clear wraps); the winch does the rest.
    for (let t = 0; t < 3600 && !s.pit.seedEvent && s.job.state !== 'Fault'; t += 5) {
      until(() => s.pit.seedEvent || s.job.state === 'Fault', 5);
      if (s.probe.wraps >= 2 || s.probe.stalled) {
        cmd({ type: 'AUGER', dir: -1 });
        until(() => s.probe.wraps === 0 && !s.probe.stalled, 20);
        cmd({ type: 'AUGER', dir: 1 });
      }
    }
    sim.run(1);
    expect(s.job.state).toBe('SeedLimit');
    expect(s.il.dryRun).toBe(false);
    expect(s.pcp.run).toBe(false);
  }, 120000);
});

describe('conservation', () => {
  it('pit + suction leg + cube + hose + tanker volume is conserved', () => {
    const { s, toArmed, extract, sim } = setup();
    const v0 = pitVolume(s.pit);
    toArmed();
    extract(0.8, true);
    sim.run(600);
    const total = pitVolume(s.pit) + s.suction.legLiquid_m3 + s.cube.vLiq_m3 + s.hose.vol_m3 + s.receiver.v_m3;
    expect(Math.abs(total - v0)).toBeLessThan(1e-3);
    expect(s.totals.freshWater_L).toBe(0);
  }, 60000);
});
