# Probe-and-Mule · Web3D digital twin

Browser simulation of the Probe-and-Mule desludging system, built from the design in [`docs/simulation/`](../docs/simulation/README.md). This first slice runs scenario **S02 · Himalayan winter, deep pit below the road** end to end in Training and Sandbox modes.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173. Useful URL parameters: `?mode=sandbox&seed=7&scenario=S02`.

```bash
npm test
```

```bash
npm run build
```

## What is in this slice

| Area | Status |
| :--- | :--- |
| **Physics core** (`src/core`, no DOM / three imports) | Atmosphere, rheology, 24-cell stratified pit with mobility-weighted draw, ratholing and auger/jet mixing, gas headspace ODE with agitation release and lagged noisy sensors, auger torque and screen blinding with a stochastic trash recipe, suction-leg solve with air-assist (drift-flux), surge cube with vane pump and level-PI minimum-vacuum control, PCP with slip, constant-power drive limit, NPSH and stator thermal model, plug-flow hose with fill front, Bingham friction and kinks, relief and check valves, thermal/ice, LiFePO₄ battery and genset derate, kinematic crawler on the stepped lane. |
| **Controller** | Interlock = pure function of docs/05 §3 (exhaustively tested), job state machine of docs/03 §5.2, machine-guided 14-step SOP with latched completion. |
| **Runtime** | Fixed 100 Hz step in a Web Worker, ×0.25 to ×16, pause / single-step, deterministic per seed, command recording and replay (download from the top bar). |
| **Telemetry** | `job.started`, `job.telemetry` (6 × 10 s batches), `job.closed` exactly as docs/07 §4, plus FSTP reconciliation (R1–R4) with the anti-dumping check. Inspect or export `.jsonl` in the Telemetry tab. |
| **3D** | Procedural E1 village (terraces, 7 stair flights from the same lane definition the physics uses, 46 houses, 400+ deodars, snow, far ranges), crawler with outriggers / reel / X-ray PCP (correct 1:2 rotor kinematics) / transparent surge cube, pit cutaway with live TS / τy / mobility heat-map, lance with rotating auger, jets and swirl tracers, tripod, blower, sniffer, gas plume, crew in PPE, tanker, discharge hose X-ray (pressure ramp, fill front, flow stripes). |
| **UI** | Top bar (scenario, mode, job state, K1/K2 lamps, time control), SOP panel with per-step actions and blocking reasons, instruments (gas, PT-02 dial, flows, cube, PCP, probe, energy), trends (uPlot), analysis (live DR-1/2/3 review, PCP envelope, hose profile and pressure budget, pit column, altitude limit), sandbox (presets, failure injection, docs/04 §8 parameters with provenance tags), telemetry inspector, live ISA-style P&ID, event log, hardware-style pendant with twist-reset E-stop, briefing card and scored debrief (docs/simulation/06 §4). |

## Verification

`npm test` runs 59 checks: every table in docs/04 (P_atm and H_max by altitude, τy / μp, hose ΔP over 200 m, L_max, Option A/B constant-power envelope, slip calibration), the full 2,048-case interlock truth table, every state-machine transition, determinism and replay, volume conservation, gas alarm → K1 drop, hose crush → PT-02 trip, DR-1 and DR-2 behaviour, PPE exposure, lance auto-follow, and a golden S02 job from the road to FSTP check-out.

The golden run lands where docs/04 predicts: ≈ 9 bar at ≈ 100 L/min to the tanker with 10 % TS slurry, 95 % removed, ≈ 0.9–1.0 kWh/m³, zero fresh water.

## Deliberate deviations from the design docs

- **State machine as a pure transition table** instead of XState: deterministic, serialisable, and unit-tested per transition. Fault reset returns to *Armed* (or *Ventilating* if K1 is open) rather than *Idle*, so a cleared trip does not split the job record; FINISH is also accepted before the seed limit.
- **Kinematic "rail" crawler** along the lane (the fallback docs/simulation/07 §7 names) instead of Rapier rigid bodies. Pitch, travel energy and travel/pump interlocks are modelled; rollover dynamics are not yet.
- **Jetting from a PCP tee through the 6 bar PRV** (DR-8), so PCP outflow = hose + jets + relief.
- **Relief sized below full pump flow, PT-02 trip with a 50 ms filter**: docs/05 gives 200 ms as the maximum response time; a slow pressure rise is held by the relief, a sudden blockage trips.
- **Lance auto-follow** (winch driven by DT-01, only ever lowers) and a "lance high" warning were added after play-testing showed the intake easily uncovers at ×16.
- **Gas alarm hysteresis** (clears 15 % inside the limit), as commercial detectors do, to stop the timer flapping at the threshold.

## Not yet built

Compare and Demo modes, scenarios other than S02 (and scenes E2–E4, L1, S1), Hindi strings, PWA/offline, MQTT-over-WebSocket sink, HIL, parameter sweeps, Rapier vehicle dynamics. Parameters tagged *assumed* in the Sandbox still await rig calibration (docs/08).

## Layout

```
src/core/        physics, controller, telemetry — renderer-independent
src/data/        parameters.json, scenarios/S02.json, scenes/e1.ts (lane + hose route)
src/worker/      100 Hz loop and protocol
src/bridge/      worker ↔ store
src/store/       zustand store (snapshots, history, UI state)
src/scene/       React Three Fiber scene
src/ui/          panels, pendant, P&ID, charts, modals, styles
tests/core/      vitest oracles, control, scenario and golden-run tests
```
