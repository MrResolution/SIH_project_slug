import { describe, expect, it } from 'vitest';
import { INTERLOCK_INPUT_KEYS, interlock, travelEnable, type InterlockInputs } from '../../src/core/control/interlock';
import { TRANSITIONS, transition, type JobStateName } from '../../src/core/control/jobMachine';

describe('docs/05 §3 · interlock truth table (all 2¹¹ inputs)', () => {
  it('matches the Boolean specification exactly', () => {
    let k1Count = 0;
    let k2Count = 0;
    for (let mask = 0; mask < 1 << 11; mask++) {
      const i = Object.fromEntries(INTERLOCK_INPUT_KEYS.map((k, b) => [k, ((mask >> b) & 1) === 1])) as unknown as InterlockInputs;
      const k1 = i.estopChainOk && i.gasDetectorHealthy && !i.gasAlarm && i.ventTimerDone && i.watchdogOk;
      const k2 = k1 && i.outriggersDown && i.chocksEngaged && i.tiltOk && !i.dryRun && !i.overpressure && i.statorOk;
      const r = interlock(i);
      expect(r.k1).toBe(k1);
      expect(r.k2).toBe(k2);
      if (r.k1) k1Count++;
      if (r.k2) k2Count++;
      // K2 can never close without K1 (Layer 0 hierarchy).
      if (r.k2) expect(r.k1).toBe(true);
    }
    expect(k1Count).toBe(1 << 6); // 5 inputs fixed → 2⁶ free combinations
    expect(k2Count).toBe(1);
  });
  it('travel enable', () => {
    expect(travelEnable(false, true)).toBe(true);
    expect(travelEnable(true, true)).toBe(false);
    expect(travelEnable(false, false)).toBe(false);
  });
});

describe('docs/03 §5.2 · job state machine', () => {
  const path: [JobStateName, Parameters<typeof transition>[1], JobStateName][] = [
    ['PowerOff', 'KEY_ON', 'Idle'],
    ['Idle', 'SCAN_QR', 'CheckIn'],
    ['CheckIn', 'CREW_LOGGED', 'Setup'],
    ['Setup', 'SETUP_DONE', 'Ventilating'],
    ['Ventilating', 'GAS_UNSAFE', 'GasHold'],
    ['GasHold', 'GAS_SAFE', 'Ventilating'],
    ['Ventilating', 'ARM', 'Armed'],
    ['Armed', 'VAC_START', 'Priming'],
    ['Priming', 'PCP_START', 'Extracting'],
    ['Extracting', 'JET_ON', 'Jetting'],
    ['Jetting', 'JET_OFF', 'Extracting'],
    ['Extracting', 'SEED_LIMIT', 'SeedLimit'],
    ['SeedLimit', 'OVERRIDE', 'Extracting'],
    ['SeedLimit', 'FINISH', 'Purging'],
    ['Extracting', 'FAULT', 'Fault'],
    ['Fault', 'RESET_TO_ARMED', 'Armed'],
    ['Fault', 'RESET_TO_VENT', 'Ventilating'],
    ['Purging', 'PURGED', 'Decon'],
    ['Decon', 'DECON_OK', 'CheckOut'],
    ['CheckOut', 'CLOSE', 'Idle'],
  ];
  for (const [from, ev, to] of path) it(`${from} —${ev}→ ${to}`, () => expect(transition(from, ev)).toBe(to));
  it('rejects transitions not in the statechart', () => {
    expect(transition('Idle', 'PCP_START')).toBeNull();
    expect(transition('Ventilating', 'PCP_START')).toBeNull();
    expect(transition('GasHold', 'ARM')).toBeNull();
    expect(transition('Decon', 'FAULT')).toBeNull();
  });
  it('every state is reachable from PowerOff', () => {
    const seen = new Set<JobStateName>(['PowerOff']);
    const queue: JobStateName[] = ['PowerOff'];
    while (queue.length) {
      const s = queue.shift()!;
      for (const to of Object.values(TRANSITIONS[s])) if (to && !seen.has(to)) (seen.add(to), queue.push(to));
    }
    expect(seen.size).toBe(Object.keys(TRANSITIONS).length);
  });
});
