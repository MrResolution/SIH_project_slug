import type { Params } from '../params';
import type { Scenario } from '../scenario';
import type { Rng } from '../rng';
import { lag } from '../units';

/**
 * Well-mixed headspace gas model, docs/simulation/03 §10:
 *   dCₖ/dt = (Gₖ + Rₖ(agitation) − Q_vent·(Cₖ − Cₖ,amb)) / V_h
 * integrated exactly over a step (the ODE is linear for fixed Q and V_h).
 * Concentrations are volume fractions; sensors convert to %, ppm and %LEL.
 */

export interface Conc {
  o2: number;
  h2s: number;
  ch4: number;
  co: number;
}

export interface Reading {
  o2_pct: number;
  h2s_ppm: number;
  ch4_lel: number;
  co_ppm: number;
}

export interface GasState {
  c: Conc;
  lagged: Reading;
  noise: Reading;
  sensed: Reading;
  dissolved: number;
  qVent_m3s: number;
  release_m3s: number;
  headspace_m3: number;
  alarm: boolean;
  alarmSpecies: ('O2' | 'H2S' | 'CH4' | 'CO')[];
  stuckH2S: number | null;
  peak: { h2s_ppm: number; ch4_lel: number; co_ppm: number; o2Min_pct: number };
}

export const AMBIENT: Conc = { o2: 0.2095, h2s: 0, ch4: 0, co: 0 };
const toReading = (c: Conc): Reading => ({ o2_pct: c.o2 * 100, h2s_ppm: c.h2s * 1e6, ch4_lel: c.ch4 * 2000, co_ppm: c.co * 1e6 });

function generation(p: Params, sc: Scenario) {
  const g = sc.containment.gas;
  return {
    h2s: p.gas.h2sGen_m3s * g.h2s_gen,
    ch4: p.gas.ch4Gen_m3s * g.ch4_gen,
    o2: -p.gas.o2Use_m3s * g.o2_consumption,
    co: p.gas.coGen_m3s * g.co_gen,
  };
}

/** Initial condition: the sealed pit at steady state with its vent pipe only. */
export function initGas(sc: Scenario, p: Params): GasState {
  const G = generation(p, sc);
  const q = p.gas.natSealed_m3s;
  const c: Conc = {
    o2: Math.max(0.12, AMBIENT.o2 + G.o2 / q),
    h2s: G.h2s / q,
    ch4: G.ch4 / q,
    co: G.co / q,
  };
  const amb = toReading(AMBIENT);
  return {
    c,
    lagged: { ...amb },
    noise: { o2_pct: 0, h2s_ppm: 0, ch4_lel: 0, co_ppm: 0 },
    sensed: { ...amb },
    dissolved: 1,
    qVent_m3s: q,
    release_m3s: 0,
    headspace_m3: 1,
    alarm: false,
    alarmSpecies: [],
    stuckH2S: null,
    peak: { h2s_ppm: 0, ch4_lel: 0, co_ppm: 0, o2Min_pct: 20.9 },
  };
}

export interface GasInputs {
  headspace_m3: number;
  manholeOpen: boolean;
  blowerOn: boolean;
  snifferPlaced: boolean;
  wind_ms: number;
  augerRpm: number;
  jet_m3s: number;
  spike: number;
  stuck: boolean;
  detectorFault: boolean;
}

export function stepGas(g: GasState, p: Params, sc: Scenario, inp: GasInputs, rng: Rng, dt: number) {
  const G = generation(p, sc);
  const Vh = Math.max(0.05, inp.headspace_m3);
  g.headspace_m3 = Vh;

  let q = inp.manholeOpen ? p.gas.natOpen_m3s + p.gas.natWind_m3s_per_ms * inp.wind_ms : p.gas.natSealed_m3s;
  if (inp.blowerOn && inp.manholeOpen) q += p.gas.blower_m3s;
  g.qVent_m3s = q;

  // Agitation release of dissolved H₂S (finite reservoir). The doc writes the
  // index as a product; we sum the auger and jet terms so that either one alone
  // releases gas (stirring OR jetting), which matches the S06 narrative.
  const agit = Math.abs(inp.augerRpm) / 300 + inp.jet_m3s / (p.probe.jetRef_lpm / 60000);
  const rAgit = p.gas.agitationR0_m3s * sc.containment.gas.dissolved_h2s_reservoir * agit * g.dissolved;
  // Scripted / injected spike: equivalent to full agitation × spike multiplier.
  const rSpike = inp.spike * p.gas.agitationR0_m3s * 2;
  const R = rAgit + rSpike;
  g.release_m3s = R;
  if (p.gas.dissolvedH2S_m3 > 0) g.dissolved = Math.max(0, g.dissolved - (rAgit / p.gas.dissolvedH2S_m3) * dt);

  const decay = Math.exp((-q * dt) / Vh);
  const relax = (c: number, amb: number, src: number) => {
    const ss = amb + src / q;
    return ss + (c - ss) * decay;
  };
  g.c.h2s = Math.max(0, relax(g.c.h2s, AMBIENT.h2s, G.h2s + R));
  g.c.ch4 = Math.max(0, relax(g.c.ch4, AMBIENT.ch4, G.ch4));
  g.c.co = Math.max(0, relax(g.c.co, AMBIENT.co, G.co));
  g.c.o2 = Math.min(0.25, Math.max(0, relax(g.c.o2, AMBIENT.o2, G.o2)));

  // Sensor: the sniffer reads the headspace when it hangs in the manhole,
  // otherwise ambient air. First-order lag with τ = T90 / ln 10.
  const src = toReading(inp.snifferPlaced && inp.manholeOpen ? g.c : AMBIENT);
  const ln10 = Math.LN10;
  g.lagged.h2s_ppm = lag(g.lagged.h2s_ppm, src.h2s_ppm, p.gas.t90H2S_s / ln10, dt);
  g.lagged.co_ppm = lag(g.lagged.co_ppm, src.co_ppm, p.gas.t90CO_s / ln10, dt);
  g.lagged.o2_pct = lag(g.lagged.o2_pct, src.o2_pct, p.gas.t90O2_s / ln10, dt);
  g.lagged.ch4_lel = lag(g.lagged.ch4_lel, src.ch4_lel, p.gas.t90CH4_s / ln10, dt);

  // AR(1) sensor noise (≈ 0.5 s correlation) so readings flicker realistically.
  const a = 0.98;
  const b = Math.sqrt(1 - a * a);
  g.noise.h2s_ppm = a * g.noise.h2s_ppm + b * p.gas.noiseH2S_ppm * rng.normal();
  g.noise.o2_pct = a * g.noise.o2_pct + b * p.gas.noiseO2_pct * rng.normal();
  g.noise.ch4_lel = a * g.noise.ch4_lel + b * p.gas.noiseCH4_lel * rng.normal();
  g.noise.co_ppm = a * g.noise.co_ppm + b * p.gas.noiseCO_ppm * rng.normal();

  let h2s = Math.max(0, g.lagged.h2s_ppm + g.noise.h2s_ppm);
  if (inp.stuck) {
    if (g.stuckH2S === null) g.stuckH2S = h2s;
    h2s = g.stuckH2S;
  } else g.stuckH2S = null;
  g.sensed.h2s_ppm = h2s;
  g.sensed.o2_pct = Math.max(0, g.lagged.o2_pct + g.noise.o2_pct);
  g.sensed.ch4_lel = Math.max(0, g.lagged.ch4_lel + g.noise.ch4_lel);
  g.sensed.co_ppm = Math.max(0, g.lagged.co_ppm + g.noise.co_ppm);

  // Alarm with hysteresis, as commercial detectors do: an active species clears
  // only once it is 15 % inside its limit (O₂: 0.3 % inside the band).
  const s = g.sensed;
  const was = new Set(g.alarmSpecies);
  const species: GasState['alarmSpecies'] = [];
  const band = (sp: 'O2' | 'H2S' | 'CH4' | 'CO', over: boolean, clear: boolean) => {
    if (over || (was.has(sp) && !clear)) species.push(sp);
  };
  band('O2', s.o2_pct < p.safety.o2Low_pct || s.o2_pct > p.safety.o2High_pct, s.o2_pct > p.safety.o2Low_pct + 0.3 && s.o2_pct < p.safety.o2High_pct - 0.3);
  band('H2S', s.h2s_ppm >= p.safety.h2sMax_ppm, s.h2s_ppm < p.safety.h2sMax_ppm * 0.85);
  band('CH4', s.ch4_lel >= p.safety.ch4Max_lel, s.ch4_lel < p.safety.ch4Max_lel * 0.85);
  band('CO', s.co_ppm >= p.safety.coMax_ppm, s.co_ppm < p.safety.coMax_ppm * 0.85);
  g.alarmSpecies = species;
  g.alarm = species.length > 0 || inp.detectorFault;
}

/** True headspace hazard index 0..1 for the plume visual and exposure check. */
export function plumeIntensity(g: GasState): { level: number; dominant: 'H2S' | 'CH4' | 'CO' | 'O2' | 'none' } {
  const r = toReading(g.c);
  const parts = [
    { k: 'H2S' as const, v: r.h2s_ppm / 50 },
    { k: 'CH4' as const, v: r.ch4_lel / 40 },
    { k: 'CO' as const, v: r.co_ppm / 100 },
    { k: 'O2' as const, v: Math.max(0, 19.5 - r.o2_pct) / 4 },
  ].sort((x, y) => y.v - x.v);
  const level = Math.min(1, parts[0].v);
  return { level, dominant: level < 0.02 ? 'none' : parts[0].k };
}

export const trueReading = (g: GasState) => toReading(g.c);
