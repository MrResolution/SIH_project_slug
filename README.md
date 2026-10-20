# Probe-and-Mule: Mechanized Faecal Sludge Extraction for Hilly Terrains and Varied Climates

> **Smart India Hackathon, Problem Statement 26258.** Ministry of Jal Shakti, Swachh Bharat Mission (Grameen).
> Low-cost, portable and adaptable mechanized desludging for extreme climatic zones and hilly terrain.

In hill villages, toilets exist but the pits behind them cannot be emptied. Vacuum trucks can't reach the houses down narrow stepped lanes, they can't lift thick sludge more than about 4 m, and they lose suction at altitude. People are then sent into the pits, which is illegal and often fatal.

**Probe-and-Mule** is a modular, subsidy-eligible machine that empties pits **without anyone entering them**:

| Tier | What it does |
| :--- | :--- |
| **1 · Probe** | In-pit lance. A 300 rpm auger and wiping screen break the sludge cake and reject trash. Closed-loop jetting with the pit's own liquid means **zero fresh water**. Air-assist handles deep pits. |
| **2 · Booster** | A vacuum surge cube primes the line, then a **progressive cavity pump pushes** sludge up to 150 m through a hose and +50 m up the hill to a road tanker. This is not limited by atmospheric pressure. |
| **3 · Mule** | The same skid mounts on a **750 mm tracked crawler** (35° stairs) or a **2-wheeler-towable handcart**. |
| **Safety** | Pumps physically can't start until the pit has been ventilated for 10 minutes and the gas is safe (O₂, H₂S, CH₄, CO). |
| **Digital** | QR check-in, telemetry and FSTP check-out create a chain of custody, block illegal dumping, and trigger automatic incentive release. |
| **Web3D sim** | A browser digital twin for the demo, engineering what-ifs, and operator training. |

**Estimated cost: ₹2.9 L (handcart) to ₹4.1 L (crawler)**, within the ₹5 L NAMASTE capital subsidy.

---

## Documentation

| # | Document | Contents |
| :--- | :--- | :--- |
| 01 | [Problem Statement and Project Understanding](docs/01-problem-statement.md) | Problem, stakeholders, zones, scope, success criteria |
| 02 | [Requirements Specification](docs/02-requirements-specification.md) | Traceable SYS / PRB / BST / MOB / SAF / ENV / TEL / ECO requirements |
| 03 | [System Architecture](docs/03-system-architecture.md) | Decomposition, process flow, modes, control layers, state machine, sensors, interfaces |
| 04 | [Engineering Calculations](docs/04-engineering-calculations.md) | Altitude lift, rheology, hose friction, PCP envelope, energy, **design review** |
| 05 | [Safety and Compliance](docs/05-safety-and-compliance.md) | Legal framework, interlock logic, FMEA, machine-guided SOP |
| 06 | [Cost and BoM](docs/06-cost-and-bom.md) | Baseline and revised BoM, power-train options, entrepreneur economics |
| 07 | [Telemetry and Digital Platform](docs/07-telemetry-and-digital-platform.md) | Data model, MQTT messages, anti-dumping rules, backend |
| 08 | [Test and Validation Plan](docs/08-test-and-validation-plan.md) | Simulant rig, Stage 0–6 tests, sim validation |
| 09 | [Project Plan](docs/09-project-plan.md) | Workstreams, timeline, milestones, repo layout, risks |
| 10 | [Rover and Mobility Architecture](docs/10-rover-and-mobility-architecture.md) | Subsystem layout, kinematics, powertrain, interlocks, 3D simulation architecture |
| 11 | [Technical Q&A & Implementation Status](docs/11-technical-questions-and-implementation-status.md) | In-depth answers on thick sludge, steep terrain, anti-tipping, power/waste movement, and roadmap |
| — | [Glossary](docs/glossary.md) | Terms and abbreviations |
| 🎮 | [**Web3D Simulation Design**](docs/simulation/README.md) | 7 documents: requirements, architecture, physics, scenes, UI, scenarios, implementation |
| 📄 | [Original research report](information.md) | Full source analysis this project is based on |

## Key engineering findings

The calculations in [04](docs/04-engineering-calculations.md) found issues in the source report that must be resolved before the design is frozen:

1. **DR-1: the PCP is under-powered.** 150–300 L/min at 12–24 bar needs 5–20 kW, but the report specifies 3 kW. **Recommendation: 5.5 kW**, which gives 150 L/min at 13 bar.
2. **DR-2: the sludge must be conditioned for the long hose.** Unconditioned cake (τ<sub>y</sub> ≈ 273 Pa) needs about 40–50 bar over 200 m. Diluting it to TS ≤ 12% with jetting brings this down to about 10 bar.
3. **DR-3: PCP inlet under vacuum.** The surge cube vacuum must be minimised, or the cube run in batch mode.
4. Also: the hose length in the BoM, the crawler payload in shuttle mode, battery sizing, the jetting pump source, and statistics that need fact-checking. See [04 §7](docs/04-engineering-calculations.md#7-design-consistency-review).

## Repository layout

```
├── README.md            ← you are here
├── information.md/.txt  ← original research report
├── docs/                ← engineering + simulation documentation
│   └── simulation/
└── sim/                 ← Web3D digital twin (Vite + React Three Fiber, physics in a Web Worker)
```

Planned additions are `firmware/`, `platform/`, `cad/`, `test-data/` and `test-reports/` (see [09 §4](docs/09-project-plan.md#4-repository-structure-target)).

## Run the simulation

The first slice runs scenario S02 (Himalayan winter, pit 38 m below the road) end to end, from driving the crawler down the lane to FSTP check-out. See [sim/README.md](sim/README.md) for what is built, how it is verified and where it deviates from the design.

```bash
cd sim && npm install && npm run dev
```
