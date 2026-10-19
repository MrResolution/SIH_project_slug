# Sim 01 · Vision and Requirements

## 1. Vision

> *Show, in a browser, why a vacuum truck fails on a Himalayan hillside, and how the Probe-and-Mule succeeds. Use physics that engineers can check, in a 3D world judges can feel, and with a safety drill a sanitation worker can learn from.*

## 2. Audiences and their goals

| Audience | Goal | Primary mode |
| :--- | :--- | :--- |
| SIH judges / ministry officials | Understand the problem and the solution in about 5 minutes; see that it works | **Demo**, **Compare** |
| Our engineering team | Explore the design space and find failure limits before building | **Sandbox** |
| Sanitation workers / trainees | Learn the SOP: ventilation, gas, PPE, seed layer, decon | **Training** |
| GP / ULB / NAMASTE stakeholders | See the cost, safety and traceability story | **Explore**, telemetry dashboard |

## 3. Goals and non-goals

**Goals**
- G1. **Credible physics.** Lumped-parameter models from [04](../04-engineering-calculations.md) that reproduce the hand calculations, then calibrated with rig data.
- G2. **Visual clarity.** Cutaways, X-ray views and live P&ID overlays make hidden processes visible: the inside of the pit, the PCP cavities, and the sludge front in the hose.
- G3. **Cause and effect.** Every parameter change has a visible, explainable consequence. For example, switching jetting off shows τ<sub>y</sub> rising, discharge pressure rising, and the relief valve opening.
- G4. **Safety fidelity.** The interlock logic is identical to [05 §3](../05-safety-and-compliance.md#3-interlock-logic) and cannot be bypassed in Training mode.
- G5. **Runs anywhere.** A mid-range laptop browser, with tablet support, and offline after the first load (PWA).

**Non-goals**
- Full CFD or SPH sludge simulation. Particles are *visual* and are driven by the lumped model.
- Certified training. The simulation is a teaching aid, not a replacement for hands-on certification.
- Photorealism at any cost. Clarity comes before realism.

## 4. Fidelity levels

| Aspect | Fidelity | Notes |
| :--- | :--- | :--- |
| Hydraulics (suction, PCP, hose) | **High.** Quasi-steady 1D with transients for hose filling and cube level | Matches 04 within ±1% |
| Rheology | **High (model)**, parameters assumed until calibrated | τ<sub>y</sub>(TS, T), μ<sub>p</sub>(TS, T) |
| Pit mixing / stratification | **Medium.** 1D vertical cells plus an auger mixing zone | Enough to show ratholing and conditioning |
| Gas | **Medium.** Well-mixed headspace ODE, agitation release, sensor lag | Training-critical |
| Crawler dynamics | **Medium-high.** Rigid-body physics engine with track contact, slope traction and rollover | Rapier |
| Hose geometry | **Medium.** Position-based rope lying on terrain; kink detection | Visual + hydraulic coupling |
| Thermal / freezing | **Low-medium.** Lumped nodes | Winter scenario |
| Power / battery | **Medium.** SOC, OCV curve, cold derate, engine altitude derate | Cost / energy story |
| Trash / clogging | **Medium (stochastic).** Discrete trash items, screen blinding fraction | Radford recipe |

## 5. Functional requirements (SIM-FR)

| ID | Requirement | Traces to |
| :--- | :--- | :--- |
| SIM-FR-01 | The sim SHALL provide 4 field environments (Himalayan terraced village, arid village, flood-plain village, peri-urban stair lane) plus a lab test-rig scene and a machine showroom. | 01 §4 |
| SIM-FR-02 | The user SHALL be able to drive the crawler or tow the handcart from the road to the pit, over stairs and slopes, with rollover possible. | MOB-01…05 |
| SIM-FR-03 | The user SHALL deploy outriggers, tripod, lance, blower, sniffer and hoses through guided interactions. | SOP 05 §5 |
| SIM-FR-04 | The sim SHALL model pit gas evolution, ventilation and sensor readings, and enforce the interlock exactly as in 05 §3. | SAF-01…07 |
| SIM-FR-05 | The sim SHALL model pit stratification, TS-dependent rheology, auger shear, jetting dilution, ratholing and air-assist. | PRB-03…08 |
| SIM-FR-06 | The sim SHALL model the suction leg vs altitude, surge cube level and pressure, PCP flow/pressure/power/slip, hose friction and elevation, hose filling, kinks, relief and trips. | BST-01…07 |
| SIM-FR-07 | The sim SHALL model energy use (battery SOC or fuel) and report specific energy in kWh/m³. | 04 §6 |
| SIM-FR-08 | The sim SHALL model ambient temperature effects: viscosity, freezing in lines, heater and purge. | ENV-01…04 |
| SIM-FR-09 | The sim SHALL show live gauges, time-series charts and a 2D P&ID synchronised with the 3D view. | G2 |
| SIM-FR-10 | The sim SHALL provide cutaway / X-ray views of the pit, lance, surge cube, PCP and hose. | G2 |
| SIM-FR-11 | The sim SHALL include a Training mode with step prompts, scoring and a debrief report. | 06 |
| SIM-FR-12 | The sim SHALL include a Compare mode that runs a conventional vacuum truck and the Probe-and-Mule on the same site side by side. | Pitch |
| SIM-FR-13 | The sim SHALL include a Demo mode: a scripted, narrated ~5 min tour with camera paths and captions (EN / HI). | Pitch |
| SIM-FR-14 | The Sandbox SHALL expose all parameters in [04 §8](../04-engineering-calculations.md#8-parameter-table-shared-with-the-simulation) and support parameter sweeps with CSV export. | Engineering |
| SIM-FR-15 | The sim SHALL emit telemetry JSON identical to [07 §4](../07-telemetry-and-digital-platform.md#4-message-formats-mqtt-json), to a local log and optionally to an MQTT-over-WebSocket broker. | TEL-01 |
| SIM-FR-16 | The sim SHALL support time scaling (pause, ×0.25 to ×16) and deterministic **record / replay** of sessions. | Debrief, testing |
| SIM-FR-17 | The sim SHOULD support a Hardware-in-the-Loop (HIL) mode in which the real controller board reads simulated sensors over WebSerial and drives the simulated motors. | SAF-05 verification |
| SIM-FR-18 | The sim SHALL include the household and FSTP QR check-in / check-out flow and the anti-dumping check. | TEL-03/04 |

## 6. Non-functional requirements (SIM-NFR)

| ID | Requirement |
| :--- | :--- |
| SIM-NFR-01 | ≥ 60 FPS on a desktop with a discrete GPU. ≥ 30 FPS on an integrated-GPU laptop (Intel Iris Xe class) at 1080p, on "Medium" quality. |
| SIM-NFR-02 | Initial download ≤ 25 MB (compressed). Each scene streams ≤ 40 MB on demand. Time to interactive ≤ 8 s on 20 Mbps. |
| SIM-NFR-03 | The physics core runs at a fixed 100 Hz in a Web Worker, independent of frame rate. With the same seed and inputs, results are deterministic to 1e-9. |
| SIM-NFR-04 | Works on the latest 2 versions of Chrome, Edge and Firefox, and on Safari 17+. Tablet touch controls are supported. |
| SIM-NFR-05 | Offline-capable PWA after the first load, for field training in low-connectivity areas. |
| SIM-NFR-06 | Accessible: keyboard-only operation, colour-blind-safe palettes, captions, and UI scaling of 100–200%. |
| SIM-NFR-07 | Localised: English and Hindi at launch. Text strings are externalised so regional languages can be added. |
| SIM-NFR-08 | No backend is required. Static hosting is enough (GitHub Pages / Vercel). Telemetry broker connection is optional. |
| SIM-NFR-09 | Physics modules have ≥ 90% unit-test line coverage, and every equation in 04 has a test. |
| SIM-NFR-10 | Graphics quality presets: Low / Medium / High / Ultra, auto-detected at first launch. |
