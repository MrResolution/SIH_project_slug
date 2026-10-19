import { z } from 'zod';

/**
 * Scenario file schema (docs/simulation/06 §1). Anything not set falls back to
 * `parameters.json`; `params` holds dotted-path overrides.
 */

const Localised = z.object({ en: z.string(), hi: z.string().optional() });

const Layers = z.object({
  scum: z.object({ thickness_m: z.number().min(0), ts_pct: z.number().min(0).max(40) }),
  sup: z.object({ thickness_m: z.number().min(0), ts_pct: z.number().min(0).max(40) }),
  bed: z.object({ thickness_m: z.number().min(0), ts_top_pct: z.number().min(0).max(40), ts_bottom_pct: z.number().min(0).max(40) }),
});

const Objective = z.object({
  id: z.string(),
  type: z.enum(['volume_removed_pct', 'seed_layer_respected', 'fresh_water_used_l', 'job_time_min', 'no_critical_violation']),
  gte: z.number().optional(),
  lte: z.number().optional(),
  optional: z.boolean().optional(),
  label: z.string(),
});

const ScenarioEvent = z.object({
  /** "t:<seconds>" or "state:<JobState>+<seconds>s" */
  at: z.string(),
  do: z.enum(['gas_spike', 'kink', 'crush', 'trash_burst']),
  args: z.record(z.union([z.number(), z.string()])).optional(),
});

export const ScenarioSchema = z.object({
  id: z.string(),
  title: Localised,
  summary: z.string(),
  scene: z.enum(['E1']),
  modes: z.array(z.enum(['training', 'sandbox', 'challenge', 'demo', 'compare'])),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime_h: z.number().min(0).max(24),
  site: z.object({
    name: z.string(),
    altitude_m: z.number().min(-100).max(6000),
    ambient: z.object({ mean_c: z.number(), amplitude_c: z.number().min(0), t0_h: z.number() }),
    wind_ms: z.number().min(0),
    weather: z.enum(['clear', 'snow', 'rain', 'haze']),
    surface: z.enum(['dry_concrete', 'wet_stone', 'mud', 'packed_snow', 'ice']),
    gp: z.string(),
    state: z.string(),
  }),
  household: z.object({ qr: z.string(), label: z.string(), head: z.string(), lat: z.number(), lon: z.number() }),
  containment: z.object({
    type: z.enum(['septic_tank', 'pit_latrine', 'twin_pit']),
    shape: z.enum(['box', 'cylinder']),
    l_m: z.number().positive(),
    w_m: z.number().positive(),
    depth_m: z.number().positive(),
    lined: z.boolean(),
    groundwater_m: z.number(),
    hCrit_m: z.number().positive(),
    beta_s: z.number().min(0),
    fluidTemp_c: z.number(),
    lastEmptied_y: z.number().min(0),
    layers: Layers,
    trash_recipe: z.enum(['radford_modified', 'clean', 'arid_grit']),
    gas: z.object({
      h2s_gen: z.number().min(0),
      ch4_gen: z.number().min(0),
      o2_consumption: z.number().min(0),
      co_gen: z.number().min(0),
      dissolved_h2s_reservoir: z.number().min(0),
    }),
  }),
  equipment: z.object({
    variant: z.enum(['crawler', 'handcart']),
    unit_id: z.string(),
    operator_id: z.string(),
    fw: z.string(),
    hose_m: z.number().positive(),
    battery_soc: z.number().min(0).max(1),
  }),
  facility: z.object({ qr: z.string(), name: z.string(), lat: z.number(), lon: z.number(), geofence_m: z.number().positive() }),
  params: z.record(z.union([z.number(), z.boolean(), z.string()])),
  objectives: z.array(Objective),
  events: z.array(ScenarioEvent),
  failures_allowed: z.array(z.string()),
});

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ObjectiveDef = z.infer<typeof Objective>;

export function parseScenario(raw: unknown): Scenario {
  return ScenarioSchema.parse(raw);
}
