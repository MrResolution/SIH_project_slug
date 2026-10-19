# 02 · System Requirements Specification (SRS)

Requirements use these words consistently:
- **SHALL** marks a mandatory requirement.
- **SHOULD** marks a target that may be traded off.
- **MAY** marks an optional feature.

Each requirement has an ID so that the [test plan](08-test-and-validation-plan.md) and the [simulation](simulation/README.md) can trace back to it.

ID prefixes:

| Prefix | Area |
| :--- | :--- |
| `SYS` | Whole system |
| `PRB` | Tier 1 Probe |
| `BST` | Tier 2 Booster skid |
| `MOB` | Tier 3 Mobility |
| `SAF` | Safety |
| `ENV` | Environment / climate |
| `TEL` | Telemetry / digital |
| `ECO` | Cost |
| `MNT` | Maintainability |

---

## 1. System-level requirements

| ID | Requirement | Rationale / Source |
| :--- | :--- | :--- |
| SYS-01 | The system SHALL empty on-site containments (septic tanks, single pits, twin leach pits, VIP latrines) without any person entering the containment. | PEMSR Act 2013 §7 |
| SYS-02 | The system SHALL extract sludge from 0 to 25% Total Solids (TS). | Eawag consistency classes |
| SYS-03 | The system SHALL transfer sludge to a road tanker or sealed drums located up to **150 m** hose length and **+50 m** elevation above the pit (stretch target: 200 m). | Terraced hill use case |
| SYS-04 | The system SHALL work at altitudes from 0 to 3,500 m above sea level. | Himalayan settlements |
| SYS-05 | The system SHALL use no external fresh water for fluidization. | Arid zones, freezing |
| SYS-06 | The system SHALL leave ≥ 25 mm of bottom sludge as biological seed. | CPHEEO / SBM(G) guidance |
| SYS-07 | A crew of 2–3 SHALL be able to set up the system in ≤ 15 minutes, excluding the 10 min ventilation. | Productivity |
| SYS-08 | The system SHOULD empty a 2 m³ containment in ≤ 45 minutes of pumping. | Service economics |
| SYS-09 | All subsystems SHALL be modular with quick-release connections. Each module SHALL be ≤ 60 kg so 2 people can carry it. | Stair carry-down fallback |

## 2. Tier 1 — Probe (in-pit lance)

| ID | Requirement |
| :--- | :--- |
| PRB-01 | The lance SHALL weigh < 22 kg excluding the hose bundle. |
| PRB-02 | The lance SHALL have a 76.2 mm (3") OD SS 304/316 body with a 250 mm intake screen of 12.7 mm perforations. |
| PRB-03 | An external auger SHALL run at variable speed up to 300 rpm, bidirectional, with a solid drive shaft (no flexible cable). |
| PRB-04 | Internal wiping blades SHALL clear the screen continuously while the auger runs. |
| PRB-05 | The auger SHALL apply shear above the sludge yield stress (design point τ ≥ 300 Pa local). |
| PRB-06 | A closed-loop jetting circuit SHALL recirculate pit supernatant at 4–6 bar through 2 tangential nozzles at the tip. |
| PRB-07 | An air-injection sparger SHALL deliver 2–3 bar, up to 150 L/min, to reduce the riser mixture density to ≤ 750 kg/m³. |
| PRB-08 | A 25 mm spacer foot plus a pressure-transducer depth gauge SHALL warn the operator at 95% desludge. Removing sludge below the seed layer SHALL require an explicit override. |
| PRB-09 | The motor and electrical parts SHALL be IP68 where submerged and IP67 elsewhere. |
| PRB-10 | The lance SHALL hang from a foldable davit tripod and be operated by a 5 m pendant or a wireless IP67 remote. |

## 3. Tier 2 — Booster skid

| ID | Requirement |
| :--- | :--- |
| BST-01 | A 90 L surge cube SHALL prime the suction line by vacuum to −0.85 bar(g) and SHALL be reversible to +1.5 bar(g) blow-purge. |
| BST-02 | The surge cube SHALL include a 15 mm rock-trap baffle, a two-stage float shut-off, and vacuum/pressure relief valves. |
| BST-03 | A progressive cavity pump (PCP) SHALL feed from the surge cube with flooded suction, pass solids ≥ 20 mm, and run at 200–500 rpm. |
| BST-04 | The PCP SHALL deliver the **operating envelope defined in [04 §5](04-engineering-calculations.md#5-pcp-booster-sizing-and-operating-envelope)**. As a minimum: ≥ 90 L/min at 12 bar, and ≥ 150 L/min at ≤ 6 bar. *(Changed from the source report's "150–300 L/min at 12–24 bar"; see the design review.)* |
| BST-05 | A capacitive dry-run sensor plus a stator thermal probe SHALL cut PCP power within 1.5 s of loss of inflow. |
| BST-06 | A spring relief valve SHALL bypass discharge back to the surge cube at 20 bar. A pressure transmitter SHALL trip the drive at 22 bar. |
| BST-07 | Pumped volume SHALL be measured from PCP shaft revolutions (displacement × rev × volumetric efficiency). |
| BST-08 | A 3-way valve SHALL route surge-cube supernatant to the jetting circuit. |
| BST-09 | Skid footprint SHALL be ≤ 950 × 680 mm on the ISO quick-release frame. |

## 4. Tier 3 — Mobility

| ID | Requirement |
| :--- | :--- |
| MOB-01 | Crawler overall width SHALL be ≤ 750 mm. |
| MOB-02 | The crawler SHALL climb and descend 35° (70%) slopes and stairs fully loaded. |
| MOB-03 | Crawler payload SHALL be ≥ 500 kg. Speed SHALL be 0–5 km/h. |
| MOB-04 | The crawler SHALL have fold-down outriggers and track chocks with limit switches, interlocked with the PCP (see SAF-07). |
| MOB-05 | An inclinometer SHALL alarm at 25° roll or pitch and SHALL inhibit travel with the PCP running. |
| MOB-06 | The handcart variant SHALL be dual-axle, pneumatic-tyred, with a universal pintle hitch for 2-wheeler or e-rickshaw towing. |
| MOB-07 | The prime mover SHALL be either a 48 V LiFePO₄ pack or an altitude-tuned engine/genset. The energy store SHALL support ≥ 2 jobs per charge or refuel (see [04 §6](04-engineering-calculations.md#6-power-and-energy-budget)). |
| MOB-08 | In shuttle mode the vehicle SHALL carry 6 × 50 L sealed HDPE drums or a 300 L baffled tank. |

## 5. Safety

| ID | Requirement |
| :--- | :--- |
| SAF-01 | A multi-gas detector SHALL continuously sample O₂, H₂S, CH₄ (%LEL) and CO at the manhole. |
| SAF-02 | A 24 V explosion-proof blower SHALL run for a mandatory **10 min** before any pump or auger can be armed. |
| SAF-03 | Machine power relays SHALL stay open unless **all** of these hold: O₂ 19.5–21.0%, H₂S < 10 ppm, CH₄ < 10% LEL, CO < 25 ppm, and the timer is complete. |
| SAF-04 | If any gas limit is exceeded during operation, the interlock SHALL stop the pumps and auger within 2 s and sound an alarm. |
| SAF-05 | The interlock SHALL be implemented in hardware, through relay logic or a safety-rated controller. Software failures SHALL fail **safe** (relays open). A watchdog SHALL be present. |
| SAF-06 | An emergency stop (E-stop) SHALL be on the skid and on the pendant/remote, and SHALL be hard-wired. |
| SAF-07 | The PCP SHALL NOT run unless the outriggers or chocks are engaged (limit switches). |
| SAF-08 | All hose joints SHALL use dry-break cam-lock couplings. |
| SAF-09 | The system SHALL carry a 15 L 1% chlorine sprayer, a 5 kg hydrated-lime hopper, sorbent pads, and a PPE locker for 3 people. |
| SAF-10 | Job close-out SHALL require confirmation that the disinfection step is done. |

## 6. Environmental / climate

| ID | Requirement |
| :--- | :--- |
| ENV-01 | Operating ambient SHALL be −10 °C to +50 °C. Storage SHALL be −20 °C to +60 °C. |
| ENV-02 | Elastomers SHALL be rated −10 °C to +120 °C (EPDM / Viton). |
| ENV-03 | The pump and surge cube SHALL have an insulated jacket with 24 V heat pads or an exhaust heat-exchanger loop. |
| ENV-04 | The end-of-job blow-purge SHALL clear the lines of liquid to prevent ice plugs. |
| ENV-05 | Electrical enclosures SHALL be ≥ IP65, or ≥ IP67 for parts exposed to sludge or rain. |

## 7. Telemetry and digital

| ID | Requirement |
| :--- | :--- |
| TEL-01 | The telemetry node SHALL log GPS, gas-clearance record, discharge pressure, PCP revolutions (volume), duration, and pH (optional sensor). |
| TEL-02 | The node SHALL buffer ≥ 30 days of jobs offline and sync over GSM/GPRS when coverage is available. |
| TEL-03 | A job SHALL start with a household QR scan and close with a treatment-facility QR scan. |
| TEL-04 | The backend SHALL flag a job when the discharge location is not a registered facility (anti-dumping). |
| TEL-05 | The backend SHOULD expose an API for SBM(G) / ULB portals and NAMASTE incentive release. |

## 8. Cost

| ID | Requirement |
| :--- | :--- |
| ECO-01 | The complete unit BoM SHALL be ≤ ₹5.00 lakh, the NAMASTE capital subsidy ceiling. |
| ECO-02 | Target BoM SHOULD be ₹2.1 L (handcart) and ₹3.45 L (crawler). |
| ECO-03 | ≥ 80% of BoM value SHOULD come from domestic suppliers. |

## 9. Maintainability

| ID | Requirement |
| :--- | :--- |
| MNT-01 | The PCP stator SHALL be field-replaceable in ≤ 1 hour with hand tools. |
| MNT-02 | Lance screen and auger SHALL be removable without special tools for cleaning. |
| MNT-03 | Wear parts (stator, wiper blades, seals) SHALL be standard catalogue items. |

## 10. Simulation requirements (summary)

The full list is in [simulation/01](simulation/01-vision-and-requirements.md). The simulation SHALL model every requirement in §1–§6 that has a numeric limit, so each one can be demonstrated or broken in the sandbox.
