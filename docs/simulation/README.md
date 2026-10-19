# Web3D Simulation — Design Documentation

The simulation is a **browser-based, real-time 3D digital twin** of the Probe-and-Mule desludging system. It runs in any modern browser (WebGL2, with WebGPU where available) and needs no installation.

- It **demonstrates** the solution to SIH judges: the machine climbing stairs, the sludge being conditioned, the pressure building up the hill, and the interlocks stopping an unsafe start.
- It **tests the engineering** across climatic zones before hardware exists. The physics core uses the same equations as [04 · Engineering Calculations](../04-engineering-calculations.md).
- It **trains operators** on the machine-guided SOP without any exposure to gas or sludge.

| # | Document | What it covers |
| :--- | :--- | :--- |
| 01 | [Vision and Requirements](01-vision-and-requirements.md) | Audiences, goals, fidelity, SIM-FR / SIM-NFR requirements |
| 02 | [Architecture and Tech Stack](02-architecture-and-tech-stack.md) | Layers, threads, data flow, modules, determinism, HIL, telemetry |
| 03 | [Physics and Process Models](03-physics-and-process-models.md) | Every model: pit, gas, rheology, probe, suction, cube, PCP, hose, thermal, power, crawler |
| 04 | [3D Scenes and Assets](04-3d-scenes-and-assets.md) | Environments, equipment models, shaders, cutaways, animation, asset pipeline |
| 05 | [UI/UX and Modes](05-ui-ux-and-modes.md) | Explore, Sandbox, Training, Compare and Demo modes, HUD, P&ID overlay, accessibility |
| 06 | [Scenarios and Training](06-scenarios-and-training.md) | Scenario schema, 12 scenarios, scoring rubric |
| 07 | [Implementation Plan and Testing](07-implementation-plan-and-testing.md) | Milestones, repo layout, performance budgets, testing, CI/CD |

> **About the term "Web3D".** Here it means real-time interactive 3D on the web (WebGL2 / WebGPU, through Three.js). If formal **X3D (Web3D Consortium)** compliance is needed later, the glTF assets can be converted to X3D. The simulation core is renderer-independent (see 02).
