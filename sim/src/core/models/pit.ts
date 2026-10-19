import type { Params } from '../params';
import type { Scenario } from '../scenario';
import { bulkDensity, tauY } from './rheology';
import { clamp, lag } from '../units';

/**
 * Stratified pit column (docs/simulation/03 §3).
 *
 * N = 24 Lagrangian horizontal cells from the floor up. Each cell keeps a
 * volume V and a total-solids TS; its thickness is V / A, so withdrawing from a
 * cell lets everything above it settle down — the free surface is simply the
 * top of the top cell. Solids are conserved as Σ V·TS.
 */

export const N_CELLS = 24;
export const KIND_BED = 0;
export const KIND_SUP = 1;
export const KIND_SCUM = 2;

export interface PitState {
  shape: 'box' | 'cylinder';
  area_m2: number;
  depth_m: number;
  lined: boolean;
  v: Float64Array;
  ts: Float64Array;
  kind: Uint8Array;
  v0_m3: number;
  solids0: number;
  hLiq_m: number;
  dhdt: number;
  rathole_m: number;
  si: number;
  collapsed: boolean;
  seedEvent: boolean;
  fluidT_C: number;
  gw_m: number;
  hCrit_m: number;
  beta_s: number;
}

export interface PitLayout {
  zBot: Float64Array;
  zMid: Float64Array;
  h: Float64Array;
  surface: number;
}

export function initPit(sc: Scenario, _p: Params): PitState {
  const c = sc.containment;
  const area = c.shape === 'box' ? c.l_m * c.w_m : Math.PI * (c.l_m / 2) ** 2;
  const L = c.layers;
  const hTot = L.scum.thickness_m + L.sup.thickness_m + L.bed.thickness_m;
  let nScum = L.scum.thickness_m > 0 ? Math.max(1, Math.round((N_CELLS * L.scum.thickness_m) / hTot)) : 0;
  let nBed = L.bed.thickness_m > 0 ? Math.max(2, Math.round((N_CELLS * L.bed.thickness_m) / hTot)) : 0;
  let nSup = N_CELLS - nScum - nBed;
  if (L.sup.thickness_m > 0 && nSup < 1) {
    nSup = 1;
    if (nBed > nScum) nBed--;
    else nScum--;
  }
  const v = new Float64Array(N_CELLS);
  const ts = new Float64Array(N_CELLS);
  const kind = new Uint8Array(N_CELLS);
  let i = 0;
  for (let k = 0; k < nBed; k++, i++) {
    const f = (k + 0.5) / nBed;
    v[i] = (area * L.bed.thickness_m) / nBed;
    ts[i] = L.bed.ts_bottom_pct + (L.bed.ts_top_pct - L.bed.ts_bottom_pct) * f;
    kind[i] = KIND_BED;
  }
  for (let k = 0; k < nSup; k++, i++) {
    v[i] = nSup > 0 ? (area * L.sup.thickness_m) / nSup : 0;
    ts[i] = L.sup.ts_pct;
    kind[i] = KIND_SUP;
  }
  for (let k = 0; k < nScum; k++, i++) {
    v[i] = (area * L.scum.thickness_m) / nScum;
    ts[i] = L.scum.ts_pct;
    kind[i] = KIND_SCUM;
  }
  let v0 = 0;
  let solids = 0;
  for (let k = 0; k < N_CELLS; k++) {
    v0 += v[k];
    solids += v[k] * ts[k];
  }
  return {
    shape: c.shape,
    area_m2: area,
    depth_m: c.depth_m,
    lined: c.lined,
    v,
    ts,
    kind,
    v0_m3: v0,
    solids0: solids,
    hLiq_m: v0 / area,
    dhdt: 0,
    rathole_m: 0,
    si: 0,
    collapsed: false,
    seedEvent: false,
    fluidT_C: c.fluidTemp_c,
    gw_m: c.depth_m + c.groundwater_m,
    hCrit_m: c.hCrit_m,
    beta_s: c.beta_s,
  };
}

export function pitVolume(pit: PitState): number {
  let s = 0;
  for (let i = 0; i < N_CELLS; i++) s += pit.v[i];
  return s;
}

export function layoutPit(pit: PitState, out?: PitLayout): PitLayout {
  const lay = out ?? { zBot: new Float64Array(N_CELLS), zMid: new Float64Array(N_CELLS), h: new Float64Array(N_CELLS), surface: 0 };
  let z = 0;
  for (let i = 0; i < N_CELLS; i++) {
    const h = pit.v[i] / pit.area_m2;
    lay.zBot[i] = z;
    lay.h[i] = h;
    lay.zMid[i] = z + h / 2;
    z += h;
  }
  lay.surface = z;
  return lay;
}

export function cellDensity(p: Params, pit: PitState, i: number): number {
  return pit.kind[i] === KIND_SCUM ? p.fluid.rhoScum : bulkDensity(p, pit.ts[i]);
}

/** Volume-weighted density of the column above z (for the hydrostatic head at the intake). */
export function columnDensityAbove(p: Params, pit: PitState, lay: PitLayout, z: number): number {
  let m = 0;
  let vol = 0;
  for (let i = 0; i < N_CELLS; i++) {
    const top = lay.zBot[i] + lay.h[i];
    if (top <= z || lay.h[i] <= 0) continue;
    const frac = (top - Math.max(z, lay.zBot[i])) / lay.h[i];
    const dv = pit.v[i] * frac;
    m += dv * cellDensity(p, pit, i);
    vol += dv;
  }
  return vol > 1e-9 ? m / vol : p.fluid.rhoWater;
}

/** Distance from z to the band [z0, z0 + h] (0 inside it). */
export const bandDistance = (z: number, z0: number, h: number) => Math.max(0, Math.abs(z - (z0 + h / 2)) - h / 2);

export interface DrawResult {
  w: Float64Array;
  tsMix: number;
  rhoMix: number;
  mobility: Float64Array;
  mobile_m3: number;
  uncovered: number;
}

/**
 * Mobility-weighted draw at the intake, docs/simulation/03 §3.2:
 *   φᵢ = Δhᵢ · e^(−dᵢ/ℓ) / (1 + (τy,ᵢ/τeff,ᵢ)⁴)
 * Δhᵢ (cell thickness) turns the doc's equal-cell sum into a height integral
 * so that thin Lagrangian cells are not over-weighted. Ratholing emerges: with
 * no auger shear the cake has ~zero mobility and the draw comes from above.
 */
export function computeDraw(p: Params, pit: PitState, lay: PitLayout, zIntake: number, tauEff: Float64Array, out?: DrawResult): DrawResult {
  const r = out ?? { w: new Float64Array(N_CELLS), mobility: new Float64Array(N_CELLS), tsMix: 0, rhoMix: 0, mobile_m3: 0, uncovered: 1 };
  const ell = p.suction.intakeReach_m;
  const screen = p.suction.screenH_m;
  let sum = 0;
  let mobile = 0;
  for (let i = 0; i < N_CELLS; i++) {
    if (lay.h[i] <= 1e-6) {
      r.w[i] = 0;
      r.mobility[i] = 0;
      continue;
    }
    const ty = tauY(p, pit.ts[i], pit.fluidT_C);
    const ratio = ty / Math.max(tauEff[i], 1e-6);
    const m = 1 / (1 + ratio * ratio * ratio * ratio);
    const d = bandDistance(lay.zMid[i], zIntake, screen);
    const reach = Math.exp(-d / ell);
    r.mobility[i] = m;
    r.w[i] = lay.h[i] * reach * m;
    sum += r.w[i];
    mobile += pit.v[i] * reach * m;
  }
  let ts = 0;
  let rho = 0;
  if (sum > 1e-12) {
    for (let i = 0; i < N_CELLS; i++) {
      r.w[i] /= sum;
      ts += r.w[i] * pit.ts[i];
      rho += r.w[i] * cellDensity(p, pit, i);
    }
  } else {
    r.w.fill(0);
    ts = 0;
    rho = p.fluid.rhoWater;
  }
  r.tsMix = ts;
  r.rhoMix = rho;
  r.mobile_m3 = mobile;
  const band = p.suction.uncoverBand_m;
  r.uncovered = clamp((zIntake + band - lay.surface) / band, 0, 1);
  return r;
}

/** Withdraws `vol` (m³) using the draw weights; returns the volume actually drawn. */
export function applyDraw(pit: PitState, w: Float64Array, vol: number): number {
  if (vol <= 0) return 0;
  let remaining = vol;
  let drawn = 0;
  for (let pass = 0; pass < 3 && remaining > 1e-12; pass++) {
    let wsum = 0;
    for (let i = 0; i < N_CELLS; i++) if (pit.v[i] > 1e-12) wsum += w[i];
    if (wsum <= 1e-12) break;
    const want = remaining;
    for (let i = 0; i < N_CELLS; i++) {
      if (pit.v[i] <= 1e-12 || w[i] <= 0) continue;
      const dv = Math.min(pit.v[i], (want * w[i]) / wsum);
      pit.v[i] -= dv;
      remaining -= dv;
      drawn += dv;
    }
  }
  return drawn;
}

/** Injects jetted liquid at height z (closed-loop: cube liquid back to the cake). */
export function applyInjection(pit: PitState, lay: PitLayout, z: number, vol: number, tsIn: number) {
  if (vol <= 0) return;
  let target = N_CELLS - 1;
  for (let i = 0; i < N_CELLS; i++) {
    if (lay.h[i] > 1e-6 && z < lay.zBot[i] + lay.h[i]) {
      target = i;
      break;
    }
  }
  // If the cell is empty (column fully drained), use the lowest non-empty or the floor cell.
  const v = pit.v[target];
  pit.ts[target] = (v * pit.ts[target] + vol * tsIn) / (v + vol);
  pit.v[target] = v + vol;
}

/**
 * Exchanges TS towards the zone mean, weighted by gᵢ = e^(−dᵢ/r):
 *   dTSᵢ/dt = k·gᵢ·(TS̄ − TSᵢ), TS̄ = Σ Vᵢgᵢ TSᵢ / Σ Vᵢgᵢ
 * Σ Vᵢ·dTSᵢ = 0, so solids are conserved exactly.
 * @see docs/simulation/03 §3.3
 */
export function mixZone(pit: PitState, lay: PitLayout, zCentre: number, bandH: number, reach: number, rate: number, dt: number, g: Float64Array) {
  if (rate <= 0 || reach <= 0) return;
  let num = 0;
  let den = 0;
  for (let i = 0; i < N_CELLS; i++) {
    if (pit.v[i] <= 1e-9) {
      g[i] = 0;
      continue;
    }
    const d = bandDistance(lay.zMid[i], zCentre, bandH);
    g[i] = d < 3 * reach ? Math.exp(-d / reach) : 0;
    num += pit.v[i] * g[i] * pit.ts[i];
    den += pit.v[i] * g[i];
  }
  if (den <= 1e-12) return;
  const mean = num / den;
  for (let i = 0; i < N_CELLS; i++) {
    if (g[i] > 0) pit.ts[i] += Math.min(1, rate * g[i] * dt) * (mean - pit.ts[i]);
  }
}

/** Top of the contiguous consolidated bed (TS ≥ 8 %) measured from the floor. */
export function bedTop(pit: PitState, lay: PitLayout): number {
  let top = 0;
  for (let i = 0; i < N_CELLS; i++) {
    if (pit.v[i] <= 1e-9) continue;
    if (pit.ts[i] >= 8) top = lay.zBot[i] + lay.h[i];
    else break;
  }
  return top;
}

/** Volume-weighted TS of the whole pit. */
export function meanTS(pit: PitState): number {
  let v = 0;
  let s = 0;
  for (let i = 0; i < N_CELLS; i++) {
    v += pit.v[i];
    s += pit.v[i] * pit.ts[i];
  }
  return v > 1e-9 ? s / v : 0;
}

/**
 * Rathole cone depth (visual + teaching): grows when the draw comes from above
 * an immobile cake around the intake, collapses when the auger mixes.
 */
export function updateRathole(pit: PitState, lay: PitLayout, zIntake: number, drawing: boolean, intakeMobility: number, augerOn: boolean, dt: number) {
  const top = bedTop(pit, lay);
  if (augerOn) pit.rathole_m = lag(pit.rathole_m, 0, 10, dt);
  else if (drawing && intakeMobility < 0.2 && top > zIntake) pit.rathole_m = lag(pit.rathole_m, top - zIntake, 40, dt);
}

/**
 * Wall stability index for unlined pits, docs/simulation/03 §3.5:
 *   SI = (h_gw − h_liq)/H_crit + β·|dh_liq/dt|
 */
export function wallStability(pit: PitState): number {
  return (pit.gw_m - pit.hLiq_m) / pit.hCrit_m + pit.beta_s * Math.abs(pit.dhdt) * 60;
}
