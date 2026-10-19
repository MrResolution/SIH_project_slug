# Sim 06 · Scenarios and Training Design

## 1. Scenario file schema

Scenarios are JSON files in `sim/src/data/scenarios/`, validated with Zod at load time. Anything not set falls back to `parameters.json`.

```jsonc
{
  "id": "S02",
  "title": { "en": "Himalayan winter — deep pit below the road", "hi": "हिमालयी सर्दी — सड़क से नीचे गहरा गड्ढा" },
  "scene": "E1",
  "modes": ["training", "challenge", "sandbox", "demo"],
  "site": {
    "altitude_m": 2200,
    "ambient": { "mean_c": -2, "amplitude_c": 6, "t0_h": 14 },
    "weather": "snow",
    "surface": "packed_snow",
    "start": "road_spawn_A",
    "household": "HH-07"
  },
  "containment": {
    "type": "septic_tank", "shape": "box", "l_m": 2.0, "w_m": 1.2, "depth_m": 2.4,
    "lined": true, "groundwater_m": -3.0,
    "layers": {
      "scum":  { "thickness_m": 0.15, "ts_pct": 14 },
      "sup":   { "thickness_m": 0.80, "ts_pct": 2 },
      "bed":   { "thickness_m": 0.90, "ts_top_pct": 12, "ts_bottom_pct": 21 }
    },
    "trash_recipe": "radford_modified",
    "gas": { "h2s_gen": 0.8, "ch4_gen": 2.0, "o2_consumption": 1.0, "dissolved_h2s_reservoir": 1.0 }
  },
  "route": {
    "hose_path": "path_HH07",
    "elevation_gain_m": 38,
    "hose_length_m": 140
  },
  "equipment": {
    "variant": "crawler", "pcp_option": "B", "power": "engine",
    "hose_m": 150, "check_valve": true
  },
  "objectives": [
    { "id": "empty", "type": "volume_removed_pct", "gte": 90 },
    { "id": "seed", "type": "seed_layer_respected" },
    { "id": "water", "type": "fresh_water_used_l", "lte": 0 },
    { "id": "time", "type": "job_time_min", "lte": 90, "optional": true }
  ],
  "events": [
    { "at": "state:Extracting+120s", "do": "gas_spike", "args": { "species": "h2s", "mult": 4 } }
  ],
  "failures_allowed": ["rollover", "collapse", "burst", "gas_exposure", "freeze"]
}
```

## 2. Scenario catalogue

| ID | Title | Scene | Teaches / proves | Key conditions | Fail triggers |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S01** | Lab rig baseline | L1 | Model calibration, Stage 1–3 tests | 208 L drum, TS 3–12%, back-pressure valve | — |
| **S02** | Himalayan winter, deep pit below the road | E1 | Booster beats the barometric limit; cold conditioning; purge | 2,200 m, −2 °C, +38 m rise, 140 m hose, bed TS 12–21% | Freeze, rollover, gas |
| **S03** | Arid cake, no water | E2 | Auger + closed-loop jetting, zero freshwater | 250 m, 42 °C, bed TS 18–24%, sand grit (rock trap fills) | Auger stall unmanaged, PCP wear |
| **S04** | Monsoon unlined pit | E3 | Soft draw-down, collapse risk, sinkage | High groundwater, unlined, mud μ 0.3, rain | Collapse (SI > 1), stuck crawler |
| **S05** | The narrow stair lane | E4 | Manoeuvring at 750 mm width, 90° turns, 35° flights | 0.95 m lane, 3 flights | Wall contact, rollover |
| **S06** | Gas spike during agitation | E1 / E4 | SAF-04: stirring releases H₂S; respond correctly | High dissolved H₂S reservoir | Exposure if the crew approaches the manhole during the alarm |
| **S07** | Hose kink on the hill | E1 | Relief, trip, find the kink | Scripted kink at a random segment | Burst if the trip is disabled (sandbox only) |
| **S08** | Running dry | Any | Dry-run protection, level awareness | Small pit, low volume | Stator burn (sandbox only) |
| **S09** | Seed layer | Any | 25 mm rule, override logging | Thin bed | Seed removed without justification → penalty |
| **S10** | The shortcut (anti-dumping) | E1 → FSTP | Chain of custody; flagged discharge | Offered "nearby drain" discharge point | Illegal dump → flagged job, no incentive |
| **S11** | Vacuum truck vs Probe-and-Mule | E1 | Compare mode headline | Same as S02 | — |
| **S12** | Freezing night | E1 | Purge (M4) and heater, battery cold derate | −10 °C overnight, job resumes at dawn | Ice blockage, battery charge inhibit |

### Sandbox-only engineering scenarios

| ID | Purpose |
| :--- | :--- |
| X01 | **DR-1 explainer**: Option A vs B on the S02 site; operating point vs the envelope |
| X02 | **DR-2 explainer**: L<sub>max</sub> vs τ<sub>y</sub> sweep, reproducing [04 §4](../04-engineering-calculations.md#maximum-hose-length) |
| X03 | **DR-3 explainer**: PCP inlet under cube vacuum; continuous vs batch mode |
| X04 | Altitude sweep from 0 to 4,000 m: suction limit, engine derate, energy per m³ |
| X05 | Hose diameter study: 3" vs 4" (pressure, mass, residual volume) |
| X06 | Battery sizing: jobs per charge vs pack size and temperature (DR-7) |

## 3. Training curriculum

| Module | Scenarios | Learning outcomes |
| :--- | :--- | :--- |
| M1 Why it matters | Demo, S11 | Explain manual scavenging risks, the law, and why trucks fail on hills |
| M2 Safety first | S06 (guided), S09 | Ventilation, gas limits, PPE, interlock meaning, seed layer |
| M3 Getting there | S05 | Drive, park, outriggers, chocks, tilt alarm |
| M4 Running a job | S02 (guided) | Prime, extract, condition with jets, read gauges |
| M5 When things go wrong | S07, S08, S04 | Kink response, dry-run, collapse warning signs |
| M6 Climate | S03, S12 | Arid cake technique, cold-weather purge |
| M7 Closing the loop | S10 | Decon, QR check-out, the anti-dumping rules |
| Final | S02 Challenge (no hints) | Full independent job, score ≥ 80 |

## 4. Scoring rubric (100 points)

| Category | Points | Measured by |
| :--- | ---: | :--- |
| **Safety** (gate: any critical violation means the job fails) | 40 | Blocked unsafe attempts (−2 each), exposure events (critical), PPE complete, upwind standoff kept, decon done |
| **Effectiveness** | 25 | % volume removed (target ≥ 90%), seed layer respected |
| **Resource use** | 15 | Fresh water 0 L, kWh/m³ below target, no hose damage |
| **Efficiency** | 10 | Job time vs par time |
| **Procedure & records** | 10 | Steps in order, QR check-in/out, override justification |

**Critical violations** (automatic fail):
- Gas exposure: the operator's position stays inside the plume above the limit for more than 5 s
- Rollover
- Pit collapse with the crew within 1 m
- Illegal dump

## 5. Debrief report contents

- Session metadata: scenario, seed, duration and mode
- Score card by category, with a pass/fail stamp
- Timeline with events, alarms and score deltas, synced to the replay
- Charts: gas, P<sub>disch</sub>, Q and energy
- "Top 3 things to improve", each with a link to the replay timestamp
- Exports: PDF (client-side) and the session `.json` recording
