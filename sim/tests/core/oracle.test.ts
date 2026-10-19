import { describe, expect, it } from 'vitest';
import { defaultParams } from '../../src/core/params';
import { hMaxSuction_m, pAtm_Pa } from '../../src/core/models/atmosphere';
import { binghamDp, binghamRe, muP, tauY } from '../../src/core/models/rheology';
import { pumpAt, shaftLoad, slipCoeff } from '../../src/core/models/pcp';
import { lpmToM3s } from '../../src/core/units';

/**
 * Physics oracles: every table in docs/04 reproduced by the core.
 * Tolerances follow docs/simulation/03 §15; where the doc rounds to one
 * decimal we allow half a unit of the last digit.
 */
const p = defaultParams();
const near = (got: number, want: number, rel: number, abs = 0) => expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.max(rel * Math.abs(want), abs));

describe('docs/04 §2 · barometric suction limit', () => {
  const table = [
    { h: 0, patm: 101.3, water: 10.33, sludge: 7.98, aer: 12.54 },
    { h: 1000, patm: 89.9, water: 9.16, sludge: 7.08, aer: 11.12 },
    { h: 2200, patm: 77.5, water: 7.9, sludge: 6.11, aer: 9.6 },
    { h: 3500, patm: 65.8, water: 6.7, sludge: 5.18, aer: 8.14 },
  ];
  for (const r of table) {
    it(`P_atm and H_max at ${r.h} m`, () => {
      near(pAtm_Pa(r.h) / 1000, r.patm, 0, 0.1);
      near(hMaxSuction_m(r.h, 1000, 1), r.water, 0, 0.02);
      near(hMaxSuction_m(r.h, 1100, 0.85), r.sludge, 0, 0.02);
      near(hMaxSuction_m(r.h, 700, 0.85), r.aer, 0, 0.02);
    });
  }
});

describe('docs/04 §3 · rheology', () => {
  const table = [
    { ts: 3, ty: 1.3, mu: 0.04 },
    { ts: 5, ty: 5, mu: 0.05 },
    { ts: 8, ty: 18, mu: 0.09 },
    { ts: 12, ty: 53, mu: 0.17 },
    { ts: 15, ty: 98, mu: 0.29 },
    { ts: 20, ty: 212, mu: 0.71 },
    { ts: 22, ty: 273, mu: 1.0 },
  ];
  for (const r of table) {
    it(`τy and μp at TS ${r.ts} %`, () => {
      near(tauY(p, r.ts, 25), r.ty, 0.01, r.ty < 10 ? 0.05 : 0.5);
      near(muP(p, r.ts, 25), r.mu, 0.01, 0.005);
    });
  }
  it('cooling 25 → 2 °C raises μp by ≈ 1.9×', () => {
    near(muP(p, 10, 2) / muP(p, 10, 25), 1.9, 0.05);
  });
});

describe('docs/04 §4 · discharge hose friction over 200 m of 3″', () => {
  const D = 0.0762;
  const rheo = [
    { ty: 5, mu: 0.05 },
    { ty: 20, mu: 0.3 },
    { ty: 50, mu: 0.5 },
    { ty: 273, mu: 1.0 },
  ];
  const table: [number, number[]][] = [
    [45, [0.8, 3.3, 7.9, 40.0]],
    [90, [0.9, 3.9, 8.8, 41.8]],
    [150, [1.0, 4.6, 10.0, 44.3]],
    [300, [1.3, 6.4, 13.0, 50.3]],
  ];
  for (const [q, row] of table) {
    it(`ΔP at ${q} L/min`, () => {
      row.forEach((want, j) => near(binghamDp(rheo[j].ty, rheo[j].mu, D, lpmToM3s(q), 200) / 1e5, want, 0.01, 0.06));
    });
  }
  it('flow stays laminar (Re_B < 2000)', () => {
    const v = lpmToM3s(300) / ((Math.PI * D * D) / 4);
    expect(binghamRe(1100, v, D, 0.05)).toBeLessThan(2000);
  });
  it('L_max with 14.6 bar available for friction', () => {
    const avail = 14.6e5;
    const lmax = (ty: number, mu: number, q: number) => avail / (binghamDp(ty, mu, D, lpmToM3s(q), 1));
    near(lmax(20, 0.3, 90), 750, 0.02, 15);
    near(lmax(50, 0.5, 150), 290, 0.02, 6);
    near(lmax(273, 1.0, 90), 70, 0.02, 2);
    near(lmax(273, 1.0, 150), 66, 0.02, 2);
  });
});

describe('docs/04 §5 · PCP constant-power envelope', () => {
  const base = { pAtm: 101325, pIn: 101325, mu: 0.1, cav: 1, liqFrac: 1, ks: 0 };
  const dpAt = (kW: number, qLpm: number) => {
    // Find the ΔP at which the power-limited displacement equals qLpm.
    let lo = 0;
    let hi = 40e5;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const pt = pumpAt(p, { ...base, nCmd_revs: 100, motor_W: kW * 1000 }, mid);
      if (pt.q > lpmToM3s(qLpm)) lo = mid;
      else hi = mid;
    }
    return lo / 1e5;
  };
  const optionA = [
    [300, 3.6],
    [150, 7.2],
    [90, 12],
    [45, 24],
  ];
  const optionB = [
    [300, 6.6],
    [150, 13.2],
    [90, 22],
  ];
  it('Option A · 3.0 kW', () => optionA.forEach(([q, bar]) => near(dpAt(3.0, q), bar, 0.01, 0.06)));
  it('Option B · 5.5 kW', () => optionB.forEach(([q, bar]) => near(dpAt(5.5, q), bar, 0.01, 0.06)));
  it('shaft power = ΔP·Q/η (doc §5 table)', () => {
    const pt = pumpAt(p, { ...base, nCmd_revs: 150 / 0.5 / 60, motor_W: 1e6 }, 12e5);
    near(shaftLoad(p, pt).shaft_W / 1000, 5.0, 0.01);
  });
  it('slip calibrated: η_vol = 0.85 at 20 bar, 9 % slurry, 300 rpm', () => {
    const ks = slipCoeff(p);
    const pt = pumpAt(p, { ...base, nCmd_revs: 5, motor_W: 1e6, mu: muP(p, 9, 25), ks }, 20e5);
    near(pt.q / (5 * 0.0005), 0.85, 0.001);
  });
});
