# Sim 05 · UI/UX and Modes

## 1. Modes

| Mode | For | What the user does | Interlocks |
| :--- | :--- | :--- | :--- |
| **Explore** | Everyone | Showroom S1: rotate, explode, click parts for specs, cost and requirement links | n/a |
| **Sandbox** | Engineers | Pick any scene, edit any parameter, run sweeps, export CSV, toggle failures | Enforced, with an optional visible **override** (logged) |
| **Training** | Operators | Guided SOP, scored; failures have consequences; debrief | **Always enforced** |
| **Challenge** | Training graduates, judges | Scenario objectives under time and resource limits, with no hints | Enforced |
| **Compare** | Judges / officials | Split-screen: vacuum truck vs Probe-and-Mule on the same pit and site | Enforced |
| **Demo** | Pitch | A 5-minute scripted, narrated tour that can be paused at any time to take control | Enforced |

## 2. Main screen layout (desktop)

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ☰  Scenario: S02 Himalayan Winter ▾ │ Mode: Training │ ⏸ ▶ ×1 ×4 ×16 │ 09:41 │ 🌐 EN │
├───────────────┬───────────────────────────────────────────────┬───────────────┤
│ STEP PANEL    │                                               │ GAUGES        │
│ ✔ 1 Park      │                                               │ Gas  O₂ 20.4% │
│ ✔ 2 Check-in  │                3D VIEWPORT                    │      H₂S 3 ppm│
│ ▶ 3 Ventilate │                                               │ Vent ⏱ 06:12  │
│   4 Tripod    │      [interlock ring: AMBER — venting]        │ Cube −0.42 bar│
│   5 Prime     │                                               │ PCP 290 rpm   │
│   …           │                                               │ P_d 9.8 bar   │
│               │                                               │ Q 138 L/min   │
│ HINT: Place   │                                               │ SOC 74%       │
│ sniffer at    │                                               │ E 1.12 kWh/m³ │
│ manhole.      │                                               ├───────────────┤
│               │                                               │ CHART (uPlot) │
├───────────────┴───────────────────────────────────────────────┴───────────────┤
│ P&ID strip (live) ▸ Pit ─▶ Lance ─▶ Cube ─▶ PCP ─▶ Relief ─▶ Hose ─▶ Tanker   │
│ Event log: 09:35 Outriggers down ✓  09:36 Blower ON  09:38 H₂S peak 7 ppm     │
└───────────────────────────────────────────────────────────────────────────────┘
          [ PENDANT ]  (floating, draggable: mirrors the real controller)
```

- Each side panel is collapsible. **F** gives a full-screen viewport, and **P** toggles the P&ID as a full overlay.
- **Tablet:** the panels become bottom sheets, and the pendant docks at the bottom right.

## 3. The pendant (virtual twin of the real controller)

| Control | Behaviour |
| :--- | :--- |
| E-STOP (big red) | Latches; requires twist-reset (click + drag) |
| ARM | Only works when K1 permits. Otherwise it shows the blocking reason ("Vent 3:48 left", "H₂S 14 ppm"). |
| VAC PRIME / BLOW | Vane pump direction |
| AUGER ⟲ / ⟳ + speed dial | Direction and 0–300 rpm |
| PCP START/STOP + speed dial | Stepped 200–500 rpm |
| JET ON/OFF | 3-way valve |
| AIR ON/OFF | Sparger |
| LANCE ▲ / ▼ | Winch |
| Display (2 lines) | State machine status + the top alarm |

The design intent is that **a trainee who learns the virtual pendant can use the real one**. Layout, labels and colours match the hardware panel design.

## 4. Information views

| View | Content |
| :--- | :--- |
| Gauges | Gas (4), vent timer, P<sub>cube</sub>, P<sub>disch</sub>, Q, rpm (PCP / auger), auger current, stator T, SOC/fuel, kWh/m³, volume pumped, seed-layer margin |
| Charts | Choose up to 4 series; 10 min rolling window or full session; markers for events |
| **Live P&ID** | ISA-style symbols. Pipes are coloured by flow and TS, valves by state, and alarms blink. Clicking a symbol jumps the camera to that component. |
| Envelope plot | PCP Q–ΔP plane with constant-power curves (Options A/B), the live operating point and the hose system curve. **This is the DR-1 / DR-2 explainer.** |
| Altitude plot | H<sub>max</sub> vs altitude for water, sludge and aerated mix, with the current site marked |
| Telemetry panel | Live JSON messages ([07 §4](../07-telemetry-and-digital-platform.md#4-message-formats-mqtt-json)), broker status |
| Job card | Household QR, containment info, job ID, check-in / check-out status |

## 5. Sandbox tools

- **Parameter panel (Leva):** grouped as Rheology, Pit, Probe, Cube, PCP, Hose, Gas, Thermal, Power and Vehicle. Each parameter has a ↺ reset and a source tag (assumed / report / calibrated).
- **Failure injection:** sensor stuck, hose kink at a chosen point, vehicle on hose, check valve removed, dry-run trip disabled, interlock override, battery cold.
- **Parameter sweep:** pick 1–2 parameters and a range, and choose an output metric (for example L<sub>max</sub>, time to empty or kWh/m³). The sweep runs headless in extra workers and shows a line or heat-map result, with CSV and PNG export.
- **Presets:** "Source report spec (3 kW)" vs "Recommended (5.5 kW)", and "Unconditioned cake" vs "Conditioned slurry".

## 6. Training-mode UX

1. **Briefing card:** site, containment, weather, crew, objectives and the safety reminder.
2. **Step panel:** the SOP from [05 §5](../05-safety-and-compliance.md#5-standard-operating-procedure-machine-guided). The current step is highlighted. Hints appear after 30 s of inactivity and can be turned off in Challenge mode.
3. **World interactions:** hover highlights. Click-and-hold actions show a progress ring ("Deploying outrigger…"). The PPE dressing screen shows the crew avatars.
4. **Consequences:** unsafe acts are *blocked by the interlock*, with an explanation of why. Acts the interlock can't block (for example leaning over the manhole in first-person, or opening a coupling under pressure) cause an exposure penalty, a visual effect, and an incident in the debrief.
5. **Debrief:**
   - timeline with scrubbing (from the replay)
   - score breakdown
   - mistakes with "what should have happened" clips
   - certificate PDF (client-side generated) for completed modules

## 7. Compare-mode UX

- **Left viewport:** a conventional vacuum truck parked on the road, with a suction hose down the hill. The physics are the same, but there is no PCP, auger or jets.
- **Right viewport:** the Probe-and-Mule.
- **Shared timeline and a scorecard** that fills in live:

| Metric | Vacuum truck | Probe-and-Mule |
| :--- | :--- | :--- |
| Reached pit? | ❌ (lane too narrow) or hose from the road | ✅ |
| Suction achieved? | ❌ "lift limit 6.1 m < 9 m required" | ✅ (booster) |
| Volume removed | 0 L / partial (supernatant only, rathole) | 1,840 L |
| Fresh water used | 400 L (dilution) | 0 L |
| Manual entry needed? | ⚠️ Yes | No |
| Gas checks enforced? | Checklist only | Interlocked |
| Capital cost | ₹15–25 L | ₹2.9–4.1 L |

## 8. Demo-mode script (≈ 5 min)

| t | Shot | Narration (EN; HI subtitle) | Sim action |
| :--- | :--- | :--- | :--- |
| 0:00 | Drone fly-over of E1 at dawn | "In the Himalayas, toilets exist, but the pits behind them can't be emptied." | Cinematic camera |
| 0:25 | Vacuum truck at the road | "A vacuum truck can't lift sludge this high, especially at 2,200 metres." | Compare: stall, altitude plot pops up |
| 0:55 | Crawler descends the stairs | "Our crawler is 750 mm wide and climbs 35-degree stairs." | Auto-drive along the path |
| 1:30 | Ventilation + gas | "The machine won't start until the pit has been ventilated and the gas is safe." | Timer ×16, H₂S falls, ring turns green |
| 2:10 | Pit cutaway | "The auger and recycled pit water break the cake. No fresh water is used." | TS heat-map: red → green |
| 2:50 | PCP cutaway + hose X-ray | "A progressive cavity pump pushes the sludge 150 m up the hill." | Front advances; envelope plot |
| 3:30 | Kink event | "If a hose kinks, a relief valve and pressure trip protect the crew." | Injected kink → relief |
| 3:55 | Seed layer + decon | "It leaves the seed layer and guides the crew through disinfection." | Events |
| 4:20 | QR + dashboard | "Every job is traced from the household to the treatment plant." | Telemetry panel, dashboard |
| 4:45 | Cost card | "Total cost: ₹2.9 to 4.1 lakh, within the NAMASTE subsidy." | End card |

## 9. Accessibility and localisation

- Full keyboard map, shown on the **?** screen:
  - WASD for driving
  - Tab cycles interactables
  - Space for the primary action
  - 1–6 for pendant buttons
- Colour: alarms use **shape + colour + sound** (never colour alone), and palettes are checked for deuteranopia and protanopia.
- Captions for all narration and alarms. UI scaling of 100–200%. A reduced-motion option disables camera shake and fast cinematic moves.
- Languages: EN and HI at launch, with a string-length-tolerant layout and Devanagari font subsetting.
