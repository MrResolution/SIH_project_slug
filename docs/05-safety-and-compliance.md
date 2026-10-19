# 05 · Safety, Hazard Analysis and Regulatory Compliance

Most sanitation-worker deaths happen because a step in the procedure was skipped. Our design principle is therefore **"the machine enforces the SOP"**: every safety step that can be checked by hardware is interlocked, not left to a checklist.

---

## 1. Legal and regulatory framework

| Instrument | What it requires | How the design complies |
| :--- | :--- | :--- |
| **PEMSR Act 2013** (Prohibition of Employment as Manual Scavengers and their Rehabilitation), §7 | No person may be engaged for hazardous cleaning of a sewer or septic tank. Penalties: up to 2 years / ₹2 L for a first offence, up to 5 years / ₹5 L for a repeat. | Whole-system goal: no human enters the pit, and all work is done from the surface (SYS-01). |
| PEMSR Rules 2013 — protective gear and safety devices | PPE and safety devices for any cleaning work | Onboard PPE locker for 3 people (SAF-09) |
| **MoHUA / CPHEEO SOP** for septic-tank cleaning | Ventilate 10–15 min, test gases, use PPE, keep vacuum truck ≤ 25 m away, leave a seed layer | Interlocked ventilation and gas check (SAF-02/03), seed-layer stop (PRB-08) |
| MoHUA 2019 ERSU advisory | Emergency Response Sanitation Units | Telemetry gives the ERSU a live job status and alarms (TEL) |
| SBM(G) Phase II ODF Plus guidelines | Safe FSM, conveyance to treatment | QR chain of custody to FSTP (TEL-03/04) |
| **NAMASTE / Swachhta Udyami Yojana** | Capital subsidy up to ₹5 L, insurance for workers | BoM ≤ ₹5 L (ECO-01) |
| CPCB / SPCB rules | No discharge of untreated septage to the environment | Anti-dumping geofence check (TEL-04) |
| Electrical: IS/IEC 60079 (explosive atmospheres), IS/IEC 60529 (IP) | Ex-rated equipment in a methane zone, ingress protection | Ex-proof blower and gas sensor head, IP67/68 at the pit (PRB-09, ENV-05) |

> The team should confirm the latest versions of the SOP and NAMASTE guidelines from official sources before submission.

## 2. Gas hazards and limits

| Gas | Hazard | Interlock limit | Typical alarm set-points (commercial 4-gas detector) |
| :--- | :--- | :--- | :--- |
| O₂ | Asphyxiation (< 19.5%), fire risk (> 23.5%) | 19.5–21.0% | Low 19.5%, High 23.5% |
| H₂S | Toxic. Olfactory fatigue above about 100 ppm. Fatal above about 500 ppm. | < 10 ppm | TWA 10, STEL 15 |
| CH₄ | Explosive, LEL 5% vol | < 10% LEL | 10% / 20% LEL |
| CO | Toxic | < 25 ppm | 25 / 50 ppm |

## 3. Interlock logic

Logic in Boolean form. Layer 0 is hard-wired, as described in [03 §5](03-system-architecture.md#5-control-architecture).

```
K1_MACHINE_POWER = ESTOP_CHAIN_OK
                 ∧ GAS_DETECTOR_HEALTHY ∧ ¬GAS_ALARM
                 ∧ VENT_TIMER_DONE(600 s, resets on any GAS_ALARM)
                 ∧ MCU_WATCHDOG_OK

K2_PCP_ENABLE    = K1_MACHINE_POWER
                 ∧ OUTRIGGERS_DOWN ∧ CHOCKS_ENGAGED
                 ∧ |TILT| < 25°
                 ∧ ¬DRY_RUN ∧ ¬OVERPRESSURE(PT-02 > 22 bar)
                 ∧ STATOR_TEMP < 90 °C

TRAVEL_ENABLE    = ¬PCP_RUNNING ∧ OUTRIGGERS_UP
```

**Fault-response times**

| Condition | Response | Max time |
| :--- | :--- | ---: |
| Gas alarm during work | Drop K1 (all motors), siren and strobe, blower stays ON | 2 s |
| E-stop | Drop K1 | < 100 ms (hard-wired) |
| Dry-run (LT-01 low or TT-01 rising) | Drop K2 | 1.5 s |
| Overpressure | Relief valve opens mechanically at 20 bar; PT-02 > 22 bar drops K2 | Instant / 200 ms |
| Tilt > 25° | Drop K2, inhibit travel | 500 ms |
| Watchdog timeout | Drop K1 | 250 ms |
| Gas detector fault or bump-test overdue | K1 cannot close | — |

## 4. Hazard analysis (FMEA)

Severity (S), Occurrence (O) and Detection (D) are each scored 1–10. RPN = S × O × D. The scores are for the design *with* the mitigations in place.

| # | Hazard / failure mode | Effect | Cause | Mitigation | S | O | D | RPN |
| :--- | :--- | :--- | :--- | :--- | -: | -: | -: | -: |
| H1 | Toxic gas exposure at the manhole | Fatality | No ventilation, operator leaning over the pit | 10-min interlock, continuous sniffer, remote pendant, upwind standoff | 10 | 2 | 2 | 40 |
| H2 | Methane ignition | Explosion | Sparks from motors | Ex-rated blower, sealed BLDC motors, CH₄ interlock < 10% LEL, no flame or genset within 3 m of the manhole | 10 | 1 | 3 | 30 |
| H3 | Hose burst under pressure | Sludge spray, injury, contamination | Kink, overpressure, worn hose | 20 bar relief, 22 bar trip, hose rated ≥ 3× working pressure, hose inspection log | 7 | 3 | 3 | 63 |
| H4 | Crawler rollover on a slope | Crush injury | Slope > 35°, high centre of gravity, operating on a slope | Inclinometer alarm at 25°, outriggers, travel/pump interlock, low CG layout | 9 | 2 | 3 | 54 |
| H5 | Pit wall collapse | Machine falls in, worker injury | Unlined pit, fast draw-down | VFD soft draw-down, tripod span 1.5× manhole, exclusion zone | 8 | 3 | 4 | 96 |
| H6 | Pathogen exposure during decoupling | Disease | Drips from couplings | Dry-break cam-locks, 1% chlorine wash, PPE, decon step required before close-out | 6 | 4 | 3 | 72 |
| H7 | PCP dry-run | Stator destroyed (cost, downtime) | Pit empty, suction blocked | Capacitive level plus stator thermistor, 1.5 s cut | 4 | 5 | 2 | 40 |
| H8 | Auger entanglement / pinch | Hand injury | Servicing while powered | Lock-out tag-out, auger guard, K1 open during service mode | 7 | 2 | 3 | 42 |
| H9 | Electric shock in wet conditions | Fatality | Water ingress | IP67, RCD/GFCI on the AC variant, 48 V DC bus on the crawler | 10 | 1 | 3 | 30 |
| H10 | Line freezing | Burst fitting, blockage | Sub-zero overnight | Blow-purge (M4), heat jacket, drain valves | 5 | 4 | 3 | 60 |
| H11 | Seed layer over-extracted | Tank digestion disrupted | Operator error | 25 mm foot, 95% depth warning, override is logged | 3 | 4 | 2 | 24 |
| H12 | Illegal dumping | Environmental contamination | Operator incentive | QR check-out at FSTP plus GPS match before incentive release | 6 | 4 | 3 | 72 |
| H13 | Battery thermal event | Fire | Damage, cold charging | LiFePO₄ chemistry, BMS, heated pack with charge inhibit below 0 °C | 8 | 1 | 3 | 24 |

The highest RPNs are **H5 (pit collapse)**, **H6** and **H12**. The simulation must include scenarios for these (see [simulation/06](simulation/06-scenarios-and-training.md)).

## 5. Standard operating procedure (machine-guided)

The controller and pendant walk the crew through these steps. Steps marked 🔒 are interlocked.

1. **Arrive and park.** Position the crawler or handcart. Deploy outriggers and chocks 🔒.
2. **Check in.** Scan the household QR code, which starts the job record.
3. **PPE.** Crew put on gauntlets, gumboots, face shield, respirator and hi-vis. The crew confirms on the pendant.
4. **Open the manhole** with a manhole lifter, not by hand.
5. **Ventilate.** Place the sniffer and blower. The 10-min timer runs 🔒. If gas is unsafe, the timer restarts.
6. **Set up the tripod and lance.** Lower the lance to the scum layer with the winch.
7. **Prime.** Vacuum-prime the surge cube 🔒.
8. **Extract.** Start the auger, then the PCP 🔒. Watch flow and pressure.
9. **Condition.** If flow drops or auger current rises, open the jetting valve. Supernatant goes back to the cake.
10. **Seed-layer stop.** The depth gauge warns at 95%. Stop, or override (logged).
11. **Purge.** Run the vane pump in blow mode to clear the lines.
12. **Decontaminate.** Spray couplings and the lance with 1% chlorine. Spread lime on any spills. Confirm 🔒.
13. **Close the manhole** and stow equipment.
14. **Check out.** Scan the QR at the FSTP when the tanker or drums are discharged.

## 6. Ergonomics

- No lift over 25 kg per person. Modules over 25 kg have 2-person handles.
- The pendant keeps the operator **≥ 5 m** from the manhole, upwind.
- Controls use large buttons usable with gloves, an LED status ring (red / amber / green) and audio prompts in Hindi, English and regional languages.
- **Hearing:** the PCP and vane pump should stay below 85 dB(A) at 1 m, which favours the battery variant.
