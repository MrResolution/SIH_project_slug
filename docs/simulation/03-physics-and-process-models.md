# Sim 03 · Physics and Process Models

All models are **lumped-parameter** and run at a fixed **Δt = 10 ms** using **semi-implicit (symplectic) Euler** for ODE states. The flows in the series hydraulic path are solved **quasi-steadily** within each step. Units are SI internally. "(assumed)" marks parameters that must be calibrated from rig data ([08](../08-test-and-validation-plan.md)).

---

## 0. State vector overview

| Model | Continuous states | Discrete states |
| :--- | :--- | :--- |
| Atmosphere | — | altitude h, T<sub>amb</sub>, wind |
| Pit | TS<sub>i</sub>, V<sub>i</sub> for N = 24 vertical cells; groundwater head | wall type, collapsed? |
| Gas | C<sub>O₂</sub>, C<sub>H₂S</sub>, C<sub>CH₄</sub>, C<sub>CO</sub> (headspace); sensor readings | manhole open? blower on? |
| Probe | lance tip depth z<sub>L</sub>; screen blinding b; wrap count | auger dir, jets on, air on |
| Suction leg | Q<sub>s</sub> (algebraic) | primed? |
| Surge cube | V<sub>liq</sub>, P<sub>cube</sub>, rock-trap mass | float tripped |
| PCP | ω, T<sub>stator</sub>, wear | running, tripped |
| Hose | filled length x<sub>f</sub>, contents TS | kinks[] |
| Receiver | V<sub>rec</sub> | — |
| Thermal | T of lines, cube, stator, battery | ice fraction per line |
| Power | SOC, T<sub>batt</sub>, fuel | genset on |
| Controller | 600 s timer | FSM state, K1, K2 |

## 1. Atmosphere

$$P_{atm}(h)=101325\,(1-2.25577\times10^{-5}h)^{5.25588}\ \text{Pa}$$

T<sub>amb</sub>(t) follows a scenario-defined diurnal curve: T<sub>mean</sub> + A·sin(2π(t − t<sub>0</sub>)/86400). Wind speed and direction are used for the gas plume visual and the operator "upwind" check.

## 2. Rheology (`rheology.ts`)

$$\tau_y(TS,T)=a\,TS^{\,b}\cdot f_T(T),\qquad \mu_p(TS,T)=\mu_0\,e^{c\,TS}\cdot f_T(T)$$

$$f_T(T)=\exp\!\left[\frac{E_a}{R}\Big(\frac1T-\frac1{T_{ref}}\Big)\right]$$

Defaults (assumed): a = 0.065, b = 2.7, μ<sub>0</sub> = 0.021, c = 0.176, E<sub>a</sub> = 20 kJ/mol, T<sub>ref</sub> = 298 K.

Apply f<sub>T</sub> to μ<sub>p</sub> in full and to τ<sub>y</sub> at half strength (exponent × 0.5, assumed), then calibrate.

**Helpers**
- `bulkDensity(TS) = 1000 + 4.0·TS` kg/m³ (assumed linear; gives ≈ 1,088 at 22%). This is clamped to the scenario-defined ρ if one is provided.
- `class(TS)` returns liquid, slurry, semi-solid or solid, using the Eawag thresholds.

## 3. Pit model (`pit.ts`)

### 3.1 Geometry and stratification

The containment is a cylinder or box (scenario-defined), discretised into **N = 24 horizontal cells** from the floor up.

Initial profile, set by the scenario:
- **Sludge bed** from 0 to h<sub>bed</sub>, with TS rising with depth from TS<sub>top</sub> to TS<sub>bottom</sub> (consolidation)
- **Supernatant** from h<sub>bed</sub> to h<sub>sup</sub>, at TS ≈ 1–3%
- **Scum** from h<sub>sup</sub> to h<sub>scum</sub>, at TS 10–20% with low density (ρ ≈ 950) and FOG

### 3.2 Withdrawal (intake)

The intake sits at the lance screen height z<sub>s</sub>, with the screen 250 mm tall. Each step the suction flow Q<sub>s</sub>Δt is withdrawn from the cells by a **mobility-weighted draw**:

$$w_i=\frac{\phi_i}{\sum\phi},\qquad \phi_i=\frac{e^{-|z_i-z_s|/\ell}}{1+(\tau_{y,i}/\tau_{eff,i})^{4}}$$

τ<sub>eff,i</sub> is the effective shear the probe applies to cell i (see §4). ℓ = 0.3 m is the intake reach (assumed).

- **Ratholing emerges from this weighting.** Without auger shear, τ<sub>eff</sub> ≈ suction-induced shear (~20 Pa), so cells with high yield stress get almost zero weight. The draw then comes from the supernatant above, the cake stays put, and the visual shows a cone forming.
- If the remaining mobile volume within reach is less than the demand, **air is ingested** and the suction leg loses prime.

### 3.3 Mixing and jetting

- **Auger mixing zone:** cells within the auger radius of influence r<sub>m</sub> = 0.15 m + 0.002·rpm (m, assumed) exchange TS toward their mean, with rate k<sub>mix</sub>·(rpm/300) s⁻¹ (assumed k<sub>mix</sub> = 0.05).
- **Jetting:** supernatant from the surge cube is injected at the bottom cells. It adds volume Q<sub>jet</sub>Δt at TS<sub>jet</sub> (the cube's liquid TS) and applies extra shear:
  $$\tau_{jet}=\tfrac12\rho v_{jet}^2\cdot\kappa,\qquad v_{jet}=\sqrt{2\Delta P_{jet}/\rho}$$
  With ΔP = 5 bar, v ≈ 30 m/s and the impact pressure is very high locally. κ = 0.002 is the attenuation over the cake (assumed), which gives τ<sub>jet</sub> ≈ 1 kPa at the nozzles, decaying with distance across the cake.
- **Net effect:** the bottom cells' TS falls toward the target of ≤ 12%. The simulation shows a **TS heat-map** on the pit cutaway.

### 3.4 Seed layer and depth gauge

DT-01 reads the hydrostatic head above the tip. When the remaining sludge height is h<sub>sludge</sub> ≤ 25 mm + margin, or when 95% of the initial volume has been removed, the `SEED_LIMIT` event fires.

### 3.5 Wall stability (unlined pits, FMEA H5)

The stability index is:

$$SI = \frac{h_{gw}-h_{liq}}{H_{crit}} + \beta\,\Big|\frac{dh_{liq}}{dt}\Big|$$

where h<sub>gw</sub> is the groundwater head outside the pit and h<sub>liq</sub> is the liquid level inside. When SI exceeds 1, a collapse event fires: the wall mesh is swapped for a collapsed variant, soil is added to the bottom cells, and an alarm sounds.

- A rapid draw-down (a high dh/dt from a high VFD speed) raises SI, which teaches **"soft draw-down"**.
- H<sub>crit</sub> and β come from the scenario: they are large for lined pits and small for unlined pits in waterlogged clay.

## 4. Probe (`probe.ts`)

### 4.1 Auger shear and torque

The shear rate at the flight tip is about the tip velocity divided by the clearance gap:

$$\dot\gamma_{aug}\approx\frac{\omega r_{a}}{\delta},\qquad \tau_{eff}=\tau_{y}+\mu_p\dot\gamma_{aug}$$

With r<sub>a</sub> = 38 mm, δ = 10 mm and 300 rpm, the shear rate is ≈ 120 s⁻¹. That is above the source report's threshold of 50 s⁻¹.

Applied shear decays with distance from the auger: τ<sub>eff,i</sub> = τ<sub>eff</sub>·e<sup>−d<sub>i</sub>/r<sub>m</sub></sup>.

Torque and motor current:

$$T_{aug}=C_T\,\tau_{y,local}\,r_a^2 L_a + T_0,\qquad I = \frac{T_{aug}\,\omega}{\eta_m V_{bus}}$$

Defaults (assumed): C<sub>T</sub> = 2π, L<sub>a</sub> = 0.15 m, T<sub>0</sub> = 0.5 N·m.

- If T<sub>aug</sub> exceeds T<sub>max</sub>, the auger **stalls**. The pendant shows "Auger overload, reverse", and reversing clears the stall.
- The **current trend (IT-01)** is the cue to turn jetting on. It is exposed in the HUD.

### 4.2 Screen blinding and trash

The simulation tracks a blinding fraction b ∈ [0, 1]. Its effect on flow is an extra loss on the suction leg: ΔP<sub>screen</sub> = K<sub>s</sub>/(1 − b)²·½ρV².

Blinding evolves as:

$$\frac{db}{dt}= \lambda_{fiber}\,\dot N_{fiber}\,(1-b) - k_{wipe}\frac{\omega}{\omega_{ref}}\,b$$

- **Trash** is a list of discrete items drawn from the scenario recipe (the Radford recipe by default), each with a type, size and fibrousness. Items near the intake are tested each step with a probability proportional to the local draw weight.
  - Large items are deflected by the auger with probability p<sub>defl</sub>(rpm).
  - Fibrous items that are not deflected contribute to Ṅ<sub>fiber</sub>, or cause a **wrap** with p<sub>wrap</sub>. A wrap raises T<sub>0</sub> and is cleared by reversal.
  - Items smaller than 12.7 mm can pass through. Particles larger than 15 mm settle in the rock trap, and items larger than 20 mm that reach the PCP raise a wear and jam risk.

### 4.3 Air-assist (drift-flux)

$$\alpha=\frac{j_g}{C_0(j_g+j_l)+v_d},\qquad \rho_{mix}=(1-\alpha)\rho_{sl}+\alpha\rho_{air}$$

- C<sub>0</sub> = 1.2 and v<sub>d</sub> = 0.35√(gD) are standard slug-flow values.
- j<sub>g</sub> is the superficial gas velocity at the local pressure. Free-air Q<sub>air</sub> is corrected by Boyle's law to the riser mean pressure.
- ρ<sub>mix</sub> is used in the suction-leg static head for the riser section above the injection point.

## 5. Suction leg (`suction.ts`)

The leg runs from the pit intake to the surge cube and has length L<sub>s</sub> (2–5 m) and static rise Δz<sub>s</sub> = z<sub>cube inlet</sub> − z<sub>liquid surface</sub>. Find Q<sub>s</sub> ≥ 0 such that:

$$P_{atm} + \rho g\,(z_{surf}-z_{intake}) - P_{cube} = \rho_{mix} g\,\Delta z_{riser} + \Delta P_{fric}(Q_s) + \Delta P_{screen}(Q_s) + \Delta P_{entry}(Q_s)$$

- ΔP<sub>fric</sub> uses the Bingham pipe gradient from [04 §4](../04-engineering-calculations.md#4-discharge-hose-friction-positive-pressure-leg) with the mixture's τ<sub>y</sub> and μ<sub>p</sub> (the draw-weighted average of the cells).
- The right-hand side increases monotonically with Q, so the solution uses **bisection** on [0, Q<sub>max</sub>] for 30 iterations.
- If the left-hand side is smaller than the right-hand side at Q = 0, then Q<sub>s</sub> = 0 and the HUD shows **"Suction stalled: lift limit"**. This is the high-altitude teaching moment.
- Prime is lost if air is ingested (§3.2) and is regained by the vane pump drawing the cube down again.

## 6. Surge cube (`surgeCube.ts`)

Liquid and gas volumes:

$$\frac{dV_{liq}}{dt}=Q_s - Q_{pcp,in} - Q_{jet} + Q_{relief,ret},\qquad V_{gas}=V_{cube}-V_{liq}$$

The gas pressure follows a polytropic air balance with the vane pump:

$$\frac{d(P V_{gas})}{dt}= -S_{vane}(P)\,P + \dot m_{leak}RT + \dot V_{air,ingested}P_{atm}$$

- Pump speed: S<sub>vane</sub>(P) = S<sub>0</sub>(1 − P<sub>ult</sub>/P), with ultimate vacuum P<sub>ult</sub> = 0.15·P<sub>atm</sub>. In blow mode S becomes negative and the gas goes to +1.5 bar(g).
- **Float shut-off:** when V<sub>liq</sub> > 0.9·V<sub>cube</sub>, the vane-pump suction is isolated to protect the pump.
- **Rock trap:** settled solid mass accumulates. Above a threshold, it raises an "empty rock trap" maintenance prompt.
- **Cube vacuum set-point controller** (DR-3): a PI controller holds P<sub>cube</sub> at the minimum needed for the target Q<sub>s</sub>. An alternative batch mode fills, vents and then pumps. Both modes are selectable in the sandbox.

## 7. PCP (`pcp.ts`)

$$Q_{pcp}=n\,V_d\,-\,Q_{slip},\qquad Q_{slip}=k_s\frac{\Delta P}{\mu_p^{\,m}}\cdot(1+w)$$

- Defaults (assumed): V<sub>d</sub> = 0.5 L/rev, m = 0.5, w = wear factor (0 → 1). k<sub>s</sub> is calibrated so that η<sub>vol</sub> = 0.85 at 20 bar with 9% slurry.
- Shaft torque and power:
  $$T=\frac{V_d\,\Delta P}{2\pi\,\eta_{mech}}+T_{fr},\qquad P_{shaft}=T\omega$$
- **Drive limit:** the VFD limits current, so if P<sub>shaft</sub> > P<sub>motor</sub>, ω is reduced until the power equals P<sub>motor</sub>. The operating point therefore slides along the constant-power envelope of [04 §5](../04-engineering-calculations.md#5-pcp-booster-sizing-and-operating-envelope). The sandbox lets users switch between Option A (3 kW) and Option B (5.5 kW) to reproduce **DR-1**.
- **Inlet condition (DR-3):** P<sub>in,abs</sub> = P<sub>cube</sub> + ρgh<sub>flood</sub>. If P<sub>in,abs</sub> < P<sub>v</sub> + NPSH<sub>r</sub>, or the gas fraction is above 10%, η<sub>vol</sub> is degraded and noise and vibration VFX are triggered.
- **Stator thermal:**
  $$C\frac{dT_s}{dt}= \underbrace{\xi\,P_{shaft}\,(1-\eta)}_{\text{heat}}\cdot g(\text{lubrication}) - hA(T_s-T_{fluid})$$
  When the inlet runs dry, lubrication is lost: g rises by about 20× and hA falls. With BST-05, LT-01 trips within 1.5 s; if the trip is disabled in the sandbox, T<sub>s</sub> exceeds 120 °C and the "stator burnt" failure shows.

## 8. Discharge hose network (`hose.ts`)

### 8.1 Geometry from Rapier

The hose is a position-based-dynamics rope with one segment per 0.5 m. Each step Rapier sends:
- the elevation profile z(s) along the hose
- the curvature κ(s)
- crush flags, set when a vehicle wheel or track is on the hose

### 8.2 Filling transient

The hose starts empty or full of air, and the sludge front moves at x<sub>f</sub>′ = Q/A. Only the filled length contributes friction, plus the static head to the front elevation:

$$\Delta P_{hose}= \rho g\,[z(x_f)-z(0)] + \int_0^{x_f}\!\Big(\frac{16}{3}\frac{\tau_y}{D}+\frac{32\mu_pV}{D^2}\Big)ds + \sum K_j\tfrac12\rho V^2$$

Once x<sub>f</sub> = L, the discharge is at the tanker inlet. The HUD shows the **front advancing up the hill**, and a pressure-along-hose colour ramp is drawn on the 3D hose.

### 8.3 Kinks and crushes

- If curvature exceeds 1/R<sub>min</sub>, with R<sub>min</sub> = 0.25 m for a 3" hose (assumed), a kink with K<sub>kink</sub> = 50–∞ is added according to severity.
- A crushed segment gives K = ∞, which is a closed valve.
- The result is a pressure rise. The relief valve opens at 20 bar and the PT-02 trip fires at 22 bar. This is scenario S07.

### 8.4 PCP–hose coupling (series solve)

Find ΔP such that Q<sub>pcp</sub>(ΔP) = Q<sub>hose</sub>(ΔP) + Q<sub>relief</sub>(ΔP):

- Q<sub>relief</sub> = 0 below 20 bar. Above 20 bar it rises linearly, with full lift at 22 bar.
- The solution uses Newton iteration with a bisection fallback, at most 4 iterations per step. The previous step's value is the warm start.

## 9. Valves (`valves.ts`)

| Valve | Model |
| :--- | :--- |
| Relief 20 bar | Linear lift between cracking and full-lift pressure; return flow to the cube |
| 3-way jetting | Position 0/1 with a 2 s actuator travel; jetting flow from a PCP tee through a PRV at 6 bar (DR-8) |
| PRV jetting | Holds downstream at ≤ 6 bar; Q<sub>jet</sub> = C<sub>v</sub>√(ΔP/SG) across the nozzles |
| Check valve | Prevents backflow from the hill when the PCP stops |
| Dry-break cam-locks | Discrete connected/disconnected states; a drip VFX plays if a coupling is opened under pressure (training penalty) |

Without the check valve, stopping the PCP would make the hill column (+50 m, ≈ 5.4 bar) flow back. Removing it is a sandbox toggle.

## 10. Gas model (`gas.ts`)

The headspace volume is V<sub>h</sub> = pit volume − liquid volume. For each species k:

$$\frac{dC_k}{dt}=\frac{G_k + R_k(\text{agitation})-Q_{vent}\,(C_k-C_{k,amb})}{V_h}$$

- **Generation G<sub>k</sub>** comes from the scenario (old, sealed pits are high). O₂ is consumed: G<sub>O₂</sub> is negative.
- **Agitation release:**
  $$R_{H_2S}=r_0\,\frac{\omega_{aug}}{\omega_{ref}}\,\frac{Q_{jet}}{Q_{ref}}\,M_{H_2S}$$
  where M<sub>H₂S</sub> is a finite dissolved reservoir that depletes. **Stirring the sludge causes H₂S spikes.** This is a key training scenario (S06) and drives the gas-alarm-during-operation interlock (SAF-04).
- **Ventilation:** Q<sub>vent</sub> = Q<sub>blower</sub> when the blower is on and the manhole is open, plus natural exchange k<sub>nat</sub>·wind.
- **Sensor:** first-order lag with T<sub>90</sub> = 30 s for H₂S/CO and 15 s for O₂/CH₄, plus Gaussian noise. A failure-injection option covers a stuck sensor and a bump test overdue.
- **Visual:** a "gas vision" toggle renders a volumetric plume coloured by the dominant hazard.

## 11. Thermal and freezing (`thermal.ts`)

There are four lumped nodes: lines, cube, PCP stator and battery. Each obeys:

$$C_j\frac{dT_j}{dt}= \dot Q_{in,j} - U_jA_j (T_j - T_{amb}) + \dot Q_{heater,j}$$

- Each line node also tracks a residual liquid volume. When T<sub>line</sub> < 0 °C, the ice fraction grows at a rate proportional to (0 − T)·residual. A line becomes blocked at 30% ice.
- The blow-purge (M4) cuts the residual to about 5%.
- Viscosity uses T<sub>fluid</sub>, so cold sludge is thicker (§2).

## 12. Power and energy (`power.ts`)

- **Battery:** SOC′ = −I/(3600·C<sub>Ah</sub>). The terminal voltage is V = OCV<sub>LFP</sub>(SOC) − I·R(T).
  - Capacity is derated in the cold: about 80% at −10 °C (assumed).
  - Charging is inhibited below 0 °C.
  - Below a low-SOC threshold the BMS limits power.
- **Engine / genset:** available power is derated by **≈ 3.5% per 300 m** above 0 m for naturally aspirated engines (assumed rule of thumb) and by temperature. Fuel use follows a BSFC map with a default of 300 g/kWh (assumed).
- **Energy accounting:** E = ∫ΣP dt, and specific energy is E/V<sub>pumped</sub>. Both are shown live and in the debrief.

## 13. Crawler and handcart dynamics (Rapier, main thread)

- **Chassis:** a rigid body with mass and inertia from CAD. The centre-of-gravity height changes with skid load and tank fill.
- **Tracks:** modelled as 6 road-wheel ray-cast contacts per side with spring-damper suspension. Traction is F ≤ μ<sub>surface</sub>N, and tracks are driven by a skid-steer torque map with motor or hydraulic limits.

| Surface | μ (assumed) |
| :--- | ---: |
| Dry concrete stairs | 0.8 |
| Wet stone | 0.45 |
| Mud | 0.3 |
| Packed snow | 0.25 |
| Ice | 0.1 |

- **Stairs:** compound box colliders. The track spans at least 2 nosings, which needs a track length of at least 2.2× the tread, and the simulation checks this.
- **Rollover:** if the CG projection leaves the support polygon, the body is free to tip. The inclinometer alarms at 25°. Above the critical angle a **rollover event** fires and is scored as a failure.
- **Outriggers:** a deploy animation, then they become fixed colliders that widen the support polygon. The limit switches are true when there is contact.
- **Handcart:** an articulated hitch to the 2-wheeler. The rider is driven by keyboard or touch. Pneumatic tyres are modelled as ray-cast wheels.

## 14. Controller emulation

- `interlock.ts` is the **pure function from [05 §3](../05-safety-and-compliance.md#3-interlock-logic)**. It takes the input states, returns K1 and K2, and has no side effects.
- `jobMachine.ts` is the **XState statechart from [03 §5.2](../03-system-architecture.md#52-job-state-machine)**.
- Pendant commands go through the FSM, so a user cannot start the PCP without K2 even in the sandbox. A visible "Sandbox override" toggle exists for engineering what-ifs, but it is **disabled in Training mode** and logged in recordings.

## 15. Verification tests (each in Vitest)

| Test | Reference | Tolerance |
| :--- | :--- | :--- |
| P<sub>atm</sub> at 0 / 1,000 / 2,200 / 3,500 m | 04 §2 table | ±0.1 kPa |
| H<sub>max</sub> for sludge and the aerated mix | 04 §2 table | ±0.02 m |
| τ<sub>y</sub>, μ<sub>p</sub> table | 04 §3 table | ±1% |
| Hose ΔP at 4 flows × 4 rheologies | 04 §4 table | ±1% |
| L<sub>max</sub> table | 04 §4 | ±2% |
| PCP constant-power envelope (A and B) | 04 §5 | ±1% |
| Interlock truth table (all 2¹¹ = 2,048 input combinations) | 05 §3 | exact |
| FSM: every transition in 03 §5.2 | Statechart | exact |
| Energy per job, standard scenario | 04 §6 | ±10% |
| Determinism: same seed and inputs | — | bit-identical snapshot hash |
