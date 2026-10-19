# 04 · Engineering Calculations and Operating Envelope

This document checks the physics behind the design. The **same equations are implemented in the Web3D simulation** (see [simulation/03](simulation/03-physics-and-process-models.md)), so the hand calculations here double as the simulation's test oracle.

> **Status of numbers.** Values marked **(assumed)** are placeholders chosen to be physically reasonable. Before final design they must be replaced with rheometer data from our bentonite simulant (see [08 §2](08-test-and-validation-plan.md)) or with vendor data.

---

## 1. Sludge generation (demand sizing)

Population basis (CPHEEO norm):

$$Q_{FS} = N_{people} \times 0.00021 \ \text{m}^3/\text{day}$$

For example, a Gram Panchayat of 5,000 people generates **1.05 m³/day**, which is about **383 m³/year**. At an average of 2 m³ per job, that is ≈ 190 jobs/year. **One unit at 1–2 jobs/day can serve about 2–4 GPs of this size.**

Scheduled-emptying basis:

$$Q_{FS} = \frac{N_{tanks} \times V_{avg}}{T_{emptying} \times D_{operating}}$$

For example, 800 tanks × 2 m³ ÷ (3 years × 250 days) = **2.13 m³/day**, or about one job per day.

## 2. Barometric suction limit vs altitude

Standard atmosphere:

$$P_{atm}(h) = 101.325 \left(1 - 2.25577\times10^{-5}\,h\right)^{5.25588}\ \text{kPa}$$

Maximum static suction lift:

$$H_{max} = \frac{P_{atm}(h)\,\eta_{vac}}{\rho\, g} - h_{friction} - h_{leak}$$

Computed values (friction and leak = 0, η<sub>vac</sub> = 0.85 for sludge):

| Altitude (m) | P<sub>atm</sub> (kPa) | Water, perfect vacuum (m) | Sludge 1,100 kg/m³, η 0.85 (m) | Aerated mix 700 kg/m³, η 0.85 (m) |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 101.3 | 10.33 | 7.98 | 12.54 |
| 1,000 | 89.9 | 9.16 | 7.08 | 11.12 |
| 2,200 | 77.5 | 7.90 | 6.11 | 9.60 |
| 3,500 | 65.8 | 6.70 | 5.18 | 8.14 |

**Conclusions**
1. The source report's statement that "lift falls below 7.9 m at 2,200 m" is **confirmed** for water. For real sludge the figure is about **6.1 m before friction**.
2. Air-assist gives 10–15 m only near sea level. At 2,200 m it gives **≈ 9.6 m**. The source report's "10 to 15 m" claim needs qualifying by altitude.
3. **Design implication.** The suction leg (pit → surge cube) must be kept short. The skid is placed at the pit edge, and the static lift should be no more than (pit depth + 0.8 m cube height). The long, uphill leg is handled by the PCP under positive pressure, which doesn't depend on P<sub>atm</sub>.

## 3. Rheology model

Herschel–Bulkley:

$$\tau = \tau_y + K\dot\gamma^{\,n}$$

For pipe-flow sizing we use the **Bingham-plastic** simplification (n = 1, K = μ<sub>p</sub>). This is conservative at high shear for a shear-thinning fluid.

Solids-dependence (assumed). These are power-law and exponential fits through the source report's anchor points: τ<sub>y</sub> ≈ 5 Pa at 5% TS, and ≈ 273 Pa for consolidated sludge at about 22% TS.

$$\tau_y(TS) \approx 0.065\, TS^{2.7}\ \text{Pa} \qquad \mu_p(TS) \approx 0.021\, e^{0.176\,TS}\ \text{Pa·s} \qquad (TS\ \text{in}\ \%)$$

| TS (%) | τ<sub>y</sub> (Pa) | μ<sub>p</sub> (Pa·s) | Class |
| ---: | ---: | ---: | :--- |
| 3 | 1.3 | 0.04 | Liquid |
| 5 | 5 | 0.05 | Liquid / slurry |
| 8 | 18 | 0.09 | Slurry |
| 12 | 53 | 0.17 | Slurry |
| 15 | 98 | 0.29 | Semi-solid |
| 20 | 212 | 0.71 | Semi-solid |
| 22 | 273 | 1.0 | Consolidated cake |

Temperature dependence (assumed Arrhenius, E<sub>a</sub> ≈ 20 kJ/mol, to be calibrated):

$$\mu_p(T) = \mu_p(T_{ref})\,\exp\!\left[\frac{E_a}{R}\left(\frac{1}{T}-\frac{1}{T_{ref}}\right)\right]$$

Going from 25 °C to 2 °C raises μ<sub>p</sub> by about **1.9×**. This is why cold zones need conditioning and a heated jacket.

**What conditioning must achieve.** The auger and jetting must break the cake **and dilute it with supernatant** until the pumped mixture is at about **TS ≤ 12% (τ<sub>y</sub> ≲ 50 Pa)**. As §4 shows, the long hose is not feasible above that.

## 4. Discharge-hose friction (positive-pressure leg)

For laminar Bingham flow in a pipe, the Buckingham–Reiner relation can be approximated, for τ<sub>w</sub> ≫ τ<sub>y</sub>, as:

$$\frac{\Delta P}{L} \approx \frac{16}{3}\frac{\tau_y}{D} + \frac{32\,\mu_p\,V}{D^2}$$

The calculation uses D = 76.2 mm (3"), A = 4.56 × 10⁻³ m², and ρ = 1,100 kg/m³. Bingham Reynolds numbers are below 2,000 in every case below, so the flow is laminar and the formula is valid.

| Flow (L/min) | V (m/s) | τ<sub>y</sub>=5, μ=0.05 | τ<sub>y</sub>=20, μ=0.3 | τ<sub>y</sub>=50, μ=0.5 | τ<sub>y</sub>=273, μ=1.0 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 45 | 0.16 | 0.8 bar | 3.3 bar | 7.9 bar | **40.0 bar** |
| 90 | 0.33 | 0.9 bar | 3.9 bar | 8.8 bar | **41.8 bar** |
| 150 | 0.55 | 1.0 bar | 4.6 bar | 10.0 bar | **44.3 bar** |
| 300 | 1.10 | 1.3 bar | 6.4 bar | 13.0 bar | **50.3 bar** |

*Friction pressure drop over **200 m** of 3" hose.*

Static head for +50 m with 1,100 kg/m³ sludge is **5.4 bar**.

### Maximum hose length

Assume a relief setting of 20 bar and +50 m elevation, which leaves 14.6 bar available for friction:

| Sludge state | L<sub>max</sub> at 90 L/min | L<sub>max</sub> at 150 L/min |
| :--- | ---: | ---: |
| Liquid (τ<sub>y</sub> 5 Pa) | > 3 km | > 2.9 km |
| Conditioned slurry (τ<sub>y</sub> 20 Pa) | ≈ 750 m | ≈ 630 m |
| Thick slurry (τ<sub>y</sub> 50 Pa) | ≈ 330 m | ≈ 290 m |
| **Unconditioned cake (τ<sub>y</sub> 273 Pa)** | **≈ 70 m** | **≈ 66 m** |

**Conclusions**
1. A 150–200 m run up a 50 m hill is feasible **only for conditioned sludge** (τ<sub>y</sub> ≲ 50 Pa). The Probe's conditioning is therefore what makes the long hose work, not an optional extra.
2. The simulation must show this coupling. If jetting is turned off on a cake pit, discharge pressure climbs and the relief valve opens.
3. A larger hose (4", D = 101.6 mm) cuts the yield term by 25% and the viscous term by about 44%, but it is heavier and holds more sludge. This is kept as an option.

### Suction leg check

The suction leg is 5 m of 3" hose, carrying τ<sub>y</sub> 50 Pa slurry at 90 L/min. Friction is 4,406 Pa/m × 5 m = 0.22 bar, which is **≈ 2.0 m of sludge head**. At 2,200 m (H<sub>max</sub> 6.1 m), that leaves **≈ 4 m of static lift**. Pits deeper than about 3 m at altitude therefore need air-assist or a shorter, larger-bore suction hose.

## 5. PCP booster sizing and operating envelope

Hydraulic power is P<sub>hyd</sub> = ΔP · Q. Shaft power is P<sub>shaft</sub> = P<sub>hyd</sub> / η, with η<sub>PCP</sub> ≈ 0.6 assumed for viscous slurry.

| Q (L/min) | 12 bar → P<sub>shaft</sub> | 24 bar → P<sub>shaft</sub> |
| ---: | ---: | ---: |
| 45 | 1.5 kW | 3.0 kW |
| 90 | 3.0 kW | 6.0 kW |
| 150 | 5.0 kW | 10.0 kW |
| 300 | 10.0 kW | **20.0 kW** |

> **Finding.** The source report specifies a **4 HP (3.0 kW)** PCP delivering **150–300 L/min at 12–24 bar**. That combination needs 5–20 kW of shaft power, so it is **physically impossible** with a 3 kW motor. A 3 kW PCP can deliver about **90 L/min at 12 bar** or **45 L/min at 24 bar**.

**Recommended envelope (design baseline):**

| Option | Motor | 300 L/min at | 150 L/min at | 90 L/min at | 45 L/min at |
| :--- | :--- | ---: | ---: | ---: | ---: |
| A (source report motor) | 3.0 kW | 3.6 bar | 7.2 bar | 12 bar | 24 bar |
| **B (recommended)** | **5.5 kW** | **6.6 bar** | **13.2 bar** | **22 bar** | 24 bar (relief-limited) |

Option B with conditioned slurry (τ<sub>y</sub> 20 Pa) at 150 L/min needs 4.6 + 5.4 = **10 bar**, which is well inside the envelope. At that rate a 2 m³ pit empties in **≈ 13 min** of pumping.

PCP rotational speed: a pump with ≈ 0.5 L/rev displacement at 300 rpm gives 150 L/min at η<sub>vol</sub> ≈ 0.95–1.0 (slip rises with pressure). Speeds of 200–500 rpm are within the abrasive-duty range.

**Volume metering (BST-07):**

$$V = N_{rev}\cdot V_{disp}\cdot \eta_{vol}(\Delta P)$$

η<sub>vol</sub> falls from about 0.98 at 0 bar to about 0.85 at 20 bar (assumed), so the volume calculation needs a slip-vs-pressure calibration curve from the vendor test.

## 6. Power and energy budget

| Load | Rating | Duty per job (2 m³) | Energy |
| :--- | ---: | :--- | ---: |
| PCP (Option B) | 5.5 kW | ~13–25 min at ~60–80% | ≈ 0.9–1.8 kWh |
| Auger | 1.2 kW | ~25 min at 60% | ≈ 0.3 kWh |
| Vane pump (prime / purge / air) | 1.5 kW | ~10 min | ≈ 0.25 kWh |
| Jetting (through the vane-cube path or a small pump) | — | included above | — |
| Ex-proof blower | ~0.1 kW | 10–15 min | 0.03 kWh |
| Heaters (cold zone) | 0.3 kW | 60 min | 0.3 kWh |
| Controller + telemetry | 20 W | 90 min | 0.03 kWh |
| Crawler travel (≈ 500 kg, +50 m climb, η 0.5, plus rolling losses on 200 m) | — | — | ≈ 0.2 kWh |
| **Total per job** | | | **≈ 2.0–2.9 kWh** |

- **Specific energy:** ≈ 1.0–1.45 kWh/m³ including everything, and ≈ 0.45–0.9 kWh/m³ for pumping alone. This meets the < 1.5 kWh/m³ target, but only just once heaters are counted.
- **Battery sizing (MOB-07: 2 jobs):** about 6 kWh usable is needed. A **48 V 150 Ah LiFePO₄** pack (7.2 kWh nominal, ~5.8 kWh at 80% DoD) is marginal. **48 V 200 Ah (9.6 kWh)** is recommended. LiFePO₄ must not be charged below 0 °C, so the pack needs a heater and a BMS low-temperature charge inhibit.
- **Genset variant:** a 5 kVA single-phase genset is enough only with Option A (3 kW). Option B needs about 7.5 kVA, or a VFD that accepts single-phase input and is derated.

## 7. Design consistency review

These are issues found while checking the source report, and their proposed resolutions. Track them as GitHub Issues.

| # | Issue | Severity | Resolution | Owner |
| :--- | :--- | :--- | :--- | :--- |
| DR-1 | PCP spec of 3 kW at 150–300 L/min and 12–24 bar is physically impossible (§5). | **High** | Adopt Option B (5.5 kW) or restate the envelope. BST-04 is updated. | Mech |
| DR-2 | A 200 m hose with unconditioned cake (τ<sub>y</sub> 273 Pa) needs ~40–50 bar (§4). | **High** | Make conditioning to TS ≤ 12% part of the procedure. Use the auger current and PT-02 trend to detect inadequate conditioning. | Mech / Ctrl |
| DR-3 | The PCP draws from a surge cube held under vacuum. Its inlet sees about 15 kPa absolute, so there is a risk of gas release and cavitation and the NPSH available is low. | Medium | Run the cube at the minimum vacuum needed (about −0.3 to −0.5 bar(g)), or use batch fill-vent-pump cycles, and place the PCP inlet below the cube outlet. Model both in the simulation. | Mech |
| DR-4 | The air-assist claim of a 10–15 m lift is only true near sea level (§2). | Low | Quote the range by altitude: 9.6 m at 2,200 m. | Docs |
| DR-5 | The hose length in the BoM (50 m / 100 m) does not match the claimed 100–200 m reach. | Medium | Add a 100 m hose extension option to the BoM (estimated +₹15–25k, to be quoted). | Cost |
| DR-6 | In crawler shuttle mode, 300 L of sludge plus equipment (≈ 605 kg) exceeds the 500 kg payload ([03 §7](03-system-architecture.md#7-physical-layout-crawler-variant)). | Medium | Limit the onboard tank to 200 L, or increase the payload spec. | Mech |
| DR-7 | The battery capacity for the 48 V crawler is not specified. | Medium | Specify 48 V 200 Ah with heater (§6) and update the BoM. | Elec |
| DR-8 | The jetting pump source is not defined. The surge cube is at vacuum or low pressure, but the jets need 4–6 bar. | Medium | Add a small PCP side-stream or tee off the PCP discharge through a pressure-reducing valve to 6 bar. A PCP tee is recommended because it needs no extra pump. | Mech |
| DR-9 | Statistics and dates in the source report (deaths, NAMASTE outlay, submission counts) are not referenced. | Low | Verify them against PIB, MoSJE and MoJS sources before submission. | Research |

## 8. Parameter table (shared with the simulation)

These defaults are loaded by the simulation from `sim/src/data/parameters.json` (see [simulation/02](simulation/02-architecture-and-tech-stack.md)).

| Symbol | Default | Unit | Source |
| :--- | ---: | :--- | :--- |
| ρ<sub>sludge</sub> | 1,100 | kg/m³ | Report |
| η<sub>vac</sub> | 0.85 | – | Report |
| D<sub>hose</sub> | 0.0762 | m | Report |
| τ<sub>y</sub>(TS) | 0.065·TS^2.7 | Pa | Assumed fit |
| μ<sub>p</sub>(TS) | 0.021·e^(0.176·TS) | Pa·s | Assumed fit |
| E<sub>a</sub> | 20,000 | J/mol | Assumed |
| P<sub>relief</sub> | 20 | bar | Report |
| P<sub>trip</sub> | 22 | bar | This doc |
| V<sub>disp,PCP</sub> | 0.5 | L/rev | Assumed |
| η<sub>PCP</sub> | 0.6 | – | Assumed |
| P<sub>motor,PCP</sub> | 5.5 | kW | DR-1 |
| V<sub>cube</sub> | 90 | L | Report |
| P<sub>vac,prime</sub> | −0.85 | bar(g) | Report |
| P<sub>jet</sub> | 4–6 | bar | Report |
| Q<sub>air</sub> | 150 | L/min (free air) | Report |
| Seed layer | 25 | mm | CPHEEO |
| Gas limits | O₂ 19.5–21%, H₂S < 10 ppm, CH₄ < 10% LEL, CO < 25 ppm | – | SOP |
| Ventilation time | 600 | s | SOP |
| Crawler gradeability | 35 | ° | Report |
| Tilt alarm | 25 | ° | Report |
