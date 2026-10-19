import { z } from 'zod';
import defaults from '../data/parameters.json';

/**
 * Typed parameter loader. Defaults live in `src/data/parameters.json` (mirrors
 * docs/04 §8). Scenarios and the Sandbox may override any leaf by path.
 * @see docs/simulation/02 §9
 */

type Widen<T> = T extends number ? number : T extends string ? string : T extends boolean ? boolean : { -readonly [K in keyof T]: Widen<T[K]> };
type Raw = Omit<typeof defaults, '$comment'>;
export type Params = Widen<Raw> & {
  pcp: Widen<Raw['pcp']> & { option: PcpOption };
  cube: Widen<Raw['cube']> & { mode: CubeMode };
  power: Widen<Raw['power']> & { source: PowerSource };
};
export type PcpOption = 'A' | 'B';
export type CubeMode = 'level' | 'fixed';
export type PowerSource = 'battery' | 'engine';

/** Builds a strict Zod schema with the same shape as the defaults. */
function schemaFrom(v: unknown): z.ZodTypeAny {
  if (typeof v === 'number') return z.number().finite();
  if (typeof v === 'boolean') return z.boolean();
  if (typeof v === 'string') return z.string();
  if (v && typeof v === 'object') {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [k, child] of Object.entries(v)) if (k !== '$comment') shape[k] = schemaFrom(child);
    return z.object(shape).strict();
  }
  return z.unknown();
}

const { $comment: _ignored, ...rawDefaults } = defaults;
const baseSchema = schemaFrom(rawDefaults) as z.ZodObject<z.ZodRawShape>;
export const ParamsSchema = baseSchema.superRefine((p, ctx) => {
  const q = p as unknown as Params;
  if (!['A', 'B'].includes(q.pcp.option)) ctx.addIssue({ code: 'custom', path: ['pcp', 'option'], message: 'pcp.option must be A or B' });
  if (!['level', 'fixed'].includes(q.cube.mode)) ctx.addIssue({ code: 'custom', path: ['cube', 'mode'], message: 'cube.mode must be level or fixed' });
  if (!['battery', 'engine'].includes(q.power.source)) ctx.addIssue({ code: 'custom', path: ['power', 'source'], message: 'power.source must be battery or engine' });
  if (q.hose.reliefFull_bar <= q.hose.relief_bar) ctx.addIssue({ code: 'custom', path: ['hose', 'reliefFull_bar'], message: 'full-lift pressure must exceed cracking pressure' });
});

export function defaultParams(): Params {
  return ParamsSchema.parse(structuredClone(rawDefaults)) as Params;
}

export type ParamValue = number | boolean | string;

export function getPath(obj: unknown, path: string): ParamValue | undefined {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur && typeof cur === 'object' && key in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[key];
    else return undefined;
  }
  return cur as ParamValue;
}

/** Sets a leaf in place. Refuses unknown paths and type changes. */
export function setPath(obj: Params, path: string, value: ParamValue): boolean {
  const keys = path.split('.');
  let cur: Record<string, unknown> = obj as unknown as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    const next = cur[keys[i]];
    if (!next || typeof next !== 'object') return false;
    cur = next as Record<string, unknown>;
  }
  const leaf = keys[keys.length - 1];
  if (!(leaf in cur) || typeof cur[leaf] !== typeof value) return false;
  if (typeof value === 'number' && !Number.isFinite(value)) return false;
  cur[leaf] = value;
  return true;
}

/** Deep-merge a partial override (scenario `params` block) into a params object. */
export function applyOverrides(p: Params, overrides: Record<string, ParamValue> | undefined): Params {
  if (overrides) for (const [path, v] of Object.entries(overrides)) setPath(p, path, v);
  return ParamsSchema.parse(p) as Params;
}

export const pcpMotor_kW = (p: Params) => (p.pcp.option === 'A' ? p.pcp.motorA_kW : p.pcp.motorB_kW);

// ---------------------------------------------------------------------------
// Sandbox metadata: label, unit, range and provenance for every exposed leaf.
// `source` is shown as a tag in the UI (docs/simulation/05 §5).
// ---------------------------------------------------------------------------

export type ParamSource = 'report' | 'assumed' | 'doc04' | 'sop' | 'calibrated';
export interface ParamMeta {
  path: string;
  label: string;
  unit: string;
  group: ParamGroup;
  min?: number;
  max?: number;
  step?: number;
  source: ParamSource;
  options?: { value: string; label: string }[];
  hint?: string;
}
export type ParamGroup = 'Rheology' | 'Pit & Probe' | 'Surge cube' | 'PCP' | 'Hose' | 'Gas & Safety' | 'Thermal & Power';

export const PARAM_META: ParamMeta[] = [
  { path: 'fluid.rhoSludge', label: 'Sludge density ρ', unit: 'kg/m³', group: 'Rheology', min: 1000, max: 1300, step: 10, source: 'report' },
  { path: 'rheology.a', label: 'τy coefficient a', unit: 'Pa', group: 'Rheology', min: 0.02, max: 0.2, step: 0.005, source: 'assumed', hint: 'τy = a·TS^b' },
  { path: 'rheology.b', label: 'τy exponent b', unit: '–', group: 'Rheology', min: 2, max: 3.5, step: 0.05, source: 'assumed' },
  { path: 'rheology.mu0', label: 'μp coefficient μ₀', unit: 'Pa·s', group: 'Rheology', min: 0.005, max: 0.06, step: 0.001, source: 'assumed', hint: 'μp = μ₀·e^(c·TS)' },
  { path: 'rheology.c', label: 'μp exponent c', unit: '1/%', group: 'Rheology', min: 0.1, max: 0.25, step: 0.002, source: 'assumed' },
  { path: 'rheology.Ea_Jmol', label: 'Activation energy Eₐ', unit: 'J/mol', group: 'Rheology', min: 0, max: 40000, step: 1000, source: 'assumed' },

  { path: 'probe.rpmMax', label: 'Auger max speed', unit: 'rpm', group: 'Pit & Probe', min: 100, max: 400, step: 10, source: 'report' },
  { path: 'probe.kMix', label: 'Auger mixing rate k_mix', unit: '1/s', group: 'Pit & Probe', min: 0, max: 0.2, step: 0.005, source: 'assumed' },
  { path: 'probe.kMixJet', label: 'Jet mixing rate', unit: '1/s', group: 'Pit & Probe', min: 0, max: 0.2, step: 0.005, source: 'assumed' },
  { path: 'probe.prv_bar', label: 'Jetting PRV set-point', unit: 'bar', group: 'Pit & Probe', min: 2, max: 8, step: 0.5, source: 'doc04', hint: 'DR-8: PCP tee through PRV' },
  { path: 'probe.nozzleD_mm', label: 'Jet nozzle bore', unit: 'mm', group: 'Pit & Probe', min: 2, max: 8, step: 0.1, source: 'assumed' },
  { path: 'probe.air_lpm', label: 'Air-assist flow (free air)', unit: 'L/min', group: 'Pit & Probe', min: 0, max: 300, step: 10, source: 'report' },
  { path: 'suction.hoseLen_m', label: 'Suction hose length', unit: 'm', group: 'Pit & Probe', min: 1, max: 8, step: 0.5, source: 'report' },
  { path: 'suction.intakeReach_m', label: 'Intake reach ℓ', unit: 'm', group: 'Pit & Probe', min: 0.1, max: 0.8, step: 0.05, source: 'assumed' },
  { path: 'suction.kScreen', label: 'Screen loss K_s', unit: '–', group: 'Pit & Probe', min: 1, max: 100, step: 1, source: 'assumed' },

  { path: 'cube.mode', label: 'Vacuum control', unit: '', group: 'Surge cube', source: 'doc04', options: [{ value: 'level', label: 'Level PI (min. vacuum)' }, { value: 'fixed', label: 'Fixed set-point' }], hint: 'DR-3' },
  { path: 'cube.fixedSetpoint_barg', label: 'Fixed vacuum set-point', unit: 'bar(g)', group: 'Surge cube', min: -0.85, max: -0.05, step: 0.05, source: 'report' },
  { path: 'cube.setLevel_L', label: 'Level set-point', unit: 'L', group: 'Surge cube', min: 15, max: 75, step: 5, source: 'assumed' },
  { path: 'cube.vaneS0_lpm', label: 'Vane pump speed S₀', unit: 'L/min', group: 'Surge cube', min: 100, max: 800, step: 25, source: 'assumed' },

  { path: 'pcp.option', label: 'PCP drive', unit: '', group: 'PCP', source: 'doc04', options: [{ value: 'A', label: 'Option A · 3.0 kW (source report)' }, { value: 'B', label: 'Option B · 5.5 kW (recommended)' }], hint: 'DR-1' },
  { path: 'pcp.vd_L', label: 'Displacement V_d', unit: 'L/rev', group: 'PCP', min: 0.2, max: 1.0, step: 0.05, source: 'assumed' },
  { path: 'pcp.etaMech', label: 'PCP efficiency η', unit: '–', group: 'PCP', min: 0.3, max: 0.85, step: 0.01, source: 'assumed' },
  { path: 'pcp.slipEta20', label: 'η_vol at 20 bar (9% TS)', unit: '–', group: 'PCP', min: 0.6, max: 0.98, step: 0.01, source: 'assumed' },
  { path: 'pcp.wear', label: 'Stator wear factor w', unit: '–', group: 'PCP', min: 0, max: 1, step: 0.05, source: 'assumed' },
  { path: 'pcp.npshr_m', label: 'NPSH required', unit: 'm', group: 'PCP', min: 1, max: 8, step: 0.5, source: 'assumed' },

  { path: 'hose.d_m', label: 'Hose bore D', unit: 'm', group: 'Hose', min: 0.05, max: 0.1016, step: 0.0254, source: 'report', hint: '3″ = 0.0762, 4″ = 0.1016' },
  { path: 'hose.relief_bar', label: 'Relief cracking pressure', unit: 'bar', group: 'Hose', min: 10, max: 24, step: 0.5, source: 'report' },
  { path: 'hose.trip_bar', label: 'PT-02 trip pressure', unit: 'bar', group: 'Hose', min: 12, max: 26, step: 0.5, source: 'doc04' },
  { path: 'hose.reliefCap_lpm', label: 'Relief capacity', unit: 'L/min', group: 'Hose', min: 20, max: 300, step: 10, source: 'assumed' },
  { path: 'hose.checkValve', label: 'Check valve fitted', unit: '', group: 'Hose', source: 'report' },

  { path: 'gas.blower_m3s', label: 'Blower flow', unit: 'm³/s', group: 'Gas & Safety', min: 0.02, max: 0.3, step: 0.01, source: 'assumed' },
  { path: 'gas.h2sGen_m3s', label: 'H₂S generation', unit: 'm³/s', group: 'Gas & Safety', min: 0, max: 2e-6, step: 1e-8, source: 'assumed' },
  { path: 'gas.agitationR0_m3s', label: 'Agitation H₂S release r₀', unit: 'm³/s', group: 'Gas & Safety', min: 0, max: 2e-6, step: 1e-8, source: 'assumed' },
  { path: 'safety.vent_s', label: 'Ventilation time', unit: 's', group: 'Gas & Safety', min: 60, max: 1200, step: 30, source: 'sop' },
  { path: 'safety.h2sMax_ppm', label: 'H₂S limit', unit: 'ppm', group: 'Gas & Safety', min: 1, max: 20, step: 1, source: 'sop' },
  { path: 'safety.ch4Max_lel', label: 'CH₄ limit', unit: '%LEL', group: 'Gas & Safety', min: 5, max: 25, step: 1, source: 'sop' },

  { path: 'power.source', label: 'Power source', unit: '', group: 'Thermal & Power', source: 'report', options: [{ value: 'battery', label: 'LiFePO₄ 48 V' }, { value: 'engine', label: 'Engine genset' }] },
  { path: 'power.battery_Ah', label: 'Battery capacity', unit: 'Ah', group: 'Thermal & Power', min: 100, max: 300, step: 10, source: 'doc04', hint: 'DR-7: 200 Ah recommended' },
  { path: 'power.engine_kW', label: 'Genset rating (sea level)', unit: 'kW', group: 'Thermal & Power', min: 3, max: 12, step: 0.5, source: 'doc04' },
  { path: 'thermal.heater_W', label: 'Jacket heater power', unit: 'W', group: 'Thermal & Power', min: 0, max: 600, step: 50, source: 'report' },
];
