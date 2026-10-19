# 06 · Bill of Materials, Cost and Business Model

## 1. Funding fit

| Scheme | Relevance |
| :--- | :--- |
| **NAMASTE** (MoSJE + MoHUA), with a rural expansion reported in the source | Capital subsidy **up to ₹5.00 lakh** per sanitation-worker enterprise, plus bank linkage and insurance |
| **Swachhta Udyami Yojana (SUY)** | Concessional loans for sanitation entrepreneurs |
| SBM(G) Phase II ODF Plus FSM funds | GP / block-level procurement for shared units |

**Design rule:** the full turnkey unit must stay **at or below ₹5.00 L** (ECO-01), so an entrepreneur can own it with **no commercial debt**. A ₹15–25 L vacuum truck is far beyond that, and the source report links such trucks to high loan-rejection rates.

## 2. Baseline BoM (from the source report)

| Subsystem | Handcart / 2-wheeler (₹) | Tracked crawler (₹) |
| :--- | ---: | ---: |
| 4 HP single-phase PCP (24 bar max, Viton/Nitrile stator) | 50,000 | 50,000 |
| Lance: SS316 excluder + auger + 1.2 kVA motor | 32,000 | 32,000 |
| 90 L surge cube + 1.5 kVA reversible vane pump | 38,000 | 38,000 |
| Hoses, jetting loop, cam-locks, relief valve | 28,000 | 35,000 |
| Mobility + prime mover | 35,000 | 1,45,000 |
| Safety, gas interlock, cold kit, PPE, drums | 27,000 | 45,000 |
| **Total** | **2,10,000** | **3,45,000** |

## 3. Revised BoM after the design review

These changes follow from [04 §7](04-engineering-calculations.md#7-design-consistency-review). All deltas are **estimates to be confirmed with vendor quotes**.

| Change | Ref | Handcart Δ (₹) | Crawler Δ (₹) |
| :--- | :--- | ---: | ---: |
| Upsize PCP drive to 5.5 kW plus VFD | DR-1 | +20,000 | +20,000 |
| Jetting tee + pressure-reducing valve (6 bar) | DR-8 | +5,000 | +5,000 |
| Hose extension to reach the claimed distance (+50 m handcart / +100 m crawler) | DR-5 | +10,000 | +20,000 |
| Genset upgrade 5 → 7.5 kVA (handcart only) | §6 of 04 | +25,000 | — |
| Controller, safety relays, sensors (PT-02/03, LT-01, DT-01, ST-01/02, IN-01) — itemised separately | 03 §5.3 | +12,000 | +12,000 |
| Telemetry node (GNSS + GSM + flash + QR scanner) | 07 | +6,000 | +6,000 |
| **Revised total (before power-train choice)** | | **≈ 2,88,000** | **≈ 4,08,000** |

### Crawler power-train options

| Option | Description | Extra cost estimate | Total (≈) | ≤ ₹5 L? |
| :--- | :--- | ---: | ---: | :---: |
| B1 Engine-hydraulic | 9 HP altitude-tuned engine drives the hydraulic tracks and a 7.5 kVA alternator | included in the ₹1.45 L chassis line (to be confirmed) | ₹4.1 L | ✅ |
| B2 Battery 5 kWh | 48 V 100 Ah LiFePO₄ with heater: 1 job per charge, charged at the GP | +₹0.8 L | ₹4.9 L | ⚠️ marginal |
| B3 Battery 9.6 kWh | 48 V 200 Ah: 2 jobs per charge (meets MOB-07) | +₹1.5–1.9 L | ₹5.6–6.0 L | ❌ |

**Recommendation:** use **B1 (engine-hydraulic) for the hackathon prototype and first deployments**. Keep B2 as a "quiet / zero-emission" option for later, when cell prices fall. The handcart (**≈ ₹2.9 L**) is the most cost-effective unit for plains and peri-urban areas.

## 4. Detailed component list (prototype build)

This is the purchasing checklist. Quantities are for 1 prototype.

| # | Item | Spec | Qty | Est. unit ₹ | Supplier type |
| -: | :--- | :--- | -: | ---: | :--- |
| 1 | Progressive cavity pump | 2-stage, ≈ 0.5 L/rev, 24 bar, 20 mm solids, Viton stator | 1 | 50,000 | Coimbatore / Mumbai PCP OEM |
| 2 | PCP drive motor + VFD | 5.5 kW, 1-ph input VFD or 48 V PMSM + controller | 1 | 30,000 | Motor / drive dealer |
| 3 | SS316 tube Ø76.2 × 2 mm | 1.5 m | 1 | 4,000 | SS stockist |
| 4 | Laser-cut screen (12.7 mm holes) | SS316, 250 mm | 1 | 2,500 | Job shop |
| 5 | Auger flight + solid shaft | EN24 alloy shaft, SS flight | 1 | 6,000 | Fabricator |
| 6 | Auger motor | 1.2 kW BLDC, IP68 potted, gearbox 300 rpm | 1 | 15,000 | BLDC supplier |
| 7 | Surge cube | 90 L MS 4 mm, epoxy-lined, flanged, sight glass | 1 | 12,000 | Fabricator |
| 8 | Reversible vane pump | 1.5 kW, −0.85 / +1.5 bar | 1 | 22,000 | Vacuum pump dealer |
| 9 | Float shut-off (2-stage) + V/P relief valves | — | 1 set | 4,000 | Tanker parts |
| 10 | Suction hose 3" | 5 m PVC-helix | 1 | 2,500 | Hose dealer |
| 11 | Discharge hose 3" | 25 bar working pressure, 50 m lengths | 2–3 | 12,000 | Hose dealer |
| 12 | Cam-lock dry-break couplings 3" SS | Type A/C/D | 8 | 1,200 | Fittings |
| 13 | 3-way motorised valve 1" | 12/24 V | 1 | 4,500 | Valves |
| 14 | Relief valve 20 bar 3" | Spring, return line | 1 | 6,000 | Valves |
| 15 | Pressure transmitters | 4–20 mA (−1…2, 0…10, 0…30 bar) | 3 | 3,000 | Instrumentation |
| 16 | Capacitive level sensor | — | 1 | 2,500 | Instrumentation |
| 17 | Depth transducer | Submersible 0–5 m | 1 | 3,500 | Instrumentation |
| 18 | 4-gas detector with relay outputs | O₂/H₂S/CH₄/CO, fixed-mount | 1 | 18,000 | Safety supplier |
| 19 | Ex-proof blower 24 V + 2 m duct | — | 1 | 9,000 | Safety supplier |
| 20 | Safety relay module + E-stops + limit switches | Cat. 3 / PL d class | 1 set | 7,000 | Automation dealer |
| 21 | MCU board + I/O | ESP32-S3 or STM32 + 4–20 mA AFE + relay outputs | 1 | 3,500 | Electronics |
| 22 | Telemetry | GNSS + 4G/2G modem + 32 MB flash + QR scanner | 1 | 6,000 | Electronics |
| 23 | Inclinometer | 2-axis MEMS | 1 | 1,500 | Electronics |
| 24 | Davit tripod + manual winch | Aluminium, 150 kg SWL | 1 | 12,000 | Rescue-equipment supplier |
| 25 | Chassis | Mini tracked carrier 750 mm (B1) or handcart | 1 | 1,45,000 / 35,000 | Mini-dumper OEM / fabricator |
| 26 | Thermal jacket + 24 V heat pads | — | 1 | 6,000 | — |
| 27 | Decon: 15 L sprayer, lime hopper, sorbents | — | 1 | 3,500 | — |
| 28 | PPE kit for 3 | Per CPHEEO SOP | 1 | 12,000 | Safety supplier |
| 29 | 50 L HDPE sealed drums | UN-rated | 6 | 1,200 | — |

## 5. Entrepreneur economics (illustrative)

> All values are **assumptions** for discussion. Replace them with survey data from target districts.

| Item | Assumption |
| :--- | ---: |
| Capital cost | ₹2.9 L (handcart) / ₹4.1 L (crawler) — **100% subsidised** |
| Jobs per month | 25 |
| Fee per job (hills, hard access) | ₹2,500 |
| Monthly revenue | ₹62,500 |
| Fuel / energy (≈ 3 kWh-equivalent per job) | ₹3,000 |
| Wear parts (stator ₹8k / 500 h, hoses, wiper blades) | ₹3,500 |
| Tanker hire / tipping fee share | ₹10,000 |
| Crew wages (2 helpers × ₹12,000) | ₹24,000 |
| Insurance, telemetry SIM, misc. | ₹2,500 |
| **Monthly operating surplus to owner** | **≈ ₹19,500** |

Sensitivity: each extra 5 jobs/month adds ≈ ₹10k. Below about 15 jobs/month, the unit needs a GP service contract or a VGF top-up.

## 6. Cost-reduction levers

1. Single-stage PCP with a 12 bar cap for sites where the hill rise is under 30 m (saves about ₹15k).
2. Use a standard e-rickshaw 48 V PMSM drive in place of the industrial VFD.
3. Have one GP-owned crawler serve several handcart owners.
4. Make the lance in batches with local SS fabricators.
