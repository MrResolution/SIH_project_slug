# Sim 04 · 3D Scenes, Assets and Visual Effects

## 1. Scene list

| ID | Scene | Purpose | Key features | Size |
| :--- | :--- | :--- | :--- | :--- |
| E1 | **Himalayan terraced village** (Mussoorie / Shimla style, 2,200 m) | Flagship demo, the hill booster use case | Road at the top, 120 m of stepped lane with 30–38° flights, terraced houses, pits 6–40 m below the road, pine trees, snow / winter variant, low sun | 300 × 200 m |
| E2 | **Arid village** (W. Rajasthan, 250 m) | Waterless conditioning | Flat sandy lanes, handcart behind a motorcycle, hard semi-solid pit cake, heat shimmer, water tanker absent (no water) | 250 × 250 m |
| E3 | **Flood-plain village** (Assam, 60 m) | Soft ground, collapse risk | Waterlogged clay, high groundwater, unlined pits, monsoon rain, puddles and mud deformation decals, crawler sinkage | 250 × 200 m |
| E4 | **Peri-urban stair lane** (Shillong / Aizawl style, 1,500 m) | Narrow-access manoeuvring | 0.9–1.1 m lanes with 90° turns, concrete stairs, overhead wires, parked scooters | 150 × 150 m |
| L1 | **Lab test rig** | Validation twin of [08 §1](../08-test-and-validation-plan.md#1-test-rig) | 208 L clear drum, scaffold, 50 m hose loop, IBC on load cells, DAQ screen | Room |
| S1 | **Machine showroom** | Explore mode, exploded views | Turntable, studio lighting, explode slider, labelled callouts | Studio |

All field scenes include:
- a **motorable road** with a tanker parking spot
- **5–8 households** with QR plates and different containment types
- an **FSTP gate** at the scene edge, or a teleport to it, for check-out

## 2. Equipment assets

| Asset | LOD0 tris | Rig / animation | Notes |
| :--- | ---: | :--- | :--- |
| Tracked crawler (Variant B) | 60k | Track belt UV scroll + road-wheel bones, outrigger hinges, skid-steer | 750 mm width to scale; quick-release frame visible |
| Handcart (Variant A) | 25k | Wheels, hitch articulation, stand | Pintle hitch |
| 2-wheeler + rider | 30k | Wheels, steering, rider IK | Tows the handcart |
| Booster skid | 45k | PCP rotor (see §4), vane pump fan, valve handles, hose reel | Cutaway variant with interior meshes |
| Probe lance | 15k | Auger rotation, wiper blades, jet nozzle FX sockets | X-ray material shows the internal screen |
| Davit tripod + winch | 8k | Leg unfold, winch drum, cable (dynamic) | — |
| Ex-proof blower + duct | 6k | Fan, flexible duct (rope) | — |
| Gas sniffer | 3k | LED states | Tethered cable |
| Pendant / remote | 4k | Buttons as pressable meshes (first-person view) | Mirrors the HUD pendant |
| Hoses (3" suction / discharge, 1" jet, air) | procedural | Tube geometry from the PBD rope, rebuilt each frame | Pressure colour ramp, transparent X-ray mode |
| Road tanker (receiver) | 40k | Level gauge, inlet valve | Generic, unbranded |
| Vacuum truck (Compare mode) | 50k | Hose, vacuum gauge | Generic, unbranded |
| Crew × 3 | 15k each | Mixamo-style rig: walk, carry, kneel, operate, alarm reaction | PPE swap (gauntlets, face shield, respirator, hi-vis) |
| Pit / septic tank | procedural | Lid open/close, wall collapse variant | Built from the scenario's dimensions |
| Decon kit, PPE locker, drums | 10k total | Spray VFX | — |

Asset rules:
- glTF 2.0 with PBR metallic-roughness
- **Meshopt** geometry compression
- **KTX2** textures (UASTC for normals, ETC1S for albedo)
- At most 2k textures for hero assets and 1k for props
- 3 LODs, plus impostors for distant houses and trees

## 3. Process visualisation (the "make the invisible visible" layer)

| Effect | Technique | Driven by |
| :--- | :--- | :--- |
| **Pit stratification cutaway** | A clipping plane through the pit. A volume-slice quad uses a shader sampling a 1D texture (24 cells) of TS, coloured by a TS colour ramp. Scum, supernatant and bed get distinct materials. | `pit.cells[].TS` |
| **TS / τ<sub>y</sub> heat-map** | The same shader with a selectable field and legend | Sandbox toggle |
| **Ratholing cone** | Displacement of the bed surface mesh along the intake axis, by the withdrawn-volume deficit | `pit.ratholeDepth` |
| **Auger mixing** | GPU particles (≈ 5k instanced) advected by an analytic swirl field around the auger; colour = local TS | rpm, `r_m` |
| **Jets** | Cone sprite + ribbon particles from the nozzles, with intensity ∝ Q<sub>jet</sub> | `jet.q` |
| **Air bubbles** | Instanced spheres rising in the riser, with density ∝ α | `probe.alpha` |
| **Flow in hoses** | X-ray mode: an animated texture along the tube UV, with scroll speed ∝ V and colour ∝ TS; the sludge front is a hard edge at x<sub>f</sub> | `hose.v`, `hose.xf` |
| **Pressure along the hose** | Vertex colour ramp from 0 to 22 bar, red pulsing above 20 bar | `hose.p(s)` |
| **PCP cavities** | Cutaway: the rotor turns about its own axis while its centre orbits in the opposite direction at eccentricity e (correct 1:2 PCP kinematics); cavity "packets" of fluid translate axially | ω |
| **Surge cube level** | Cutaway liquid plane with a sloshing shader (crawler on a slope tilts the plane) | V<sub>liq</sub>, tilt |
| **Gas plume** | Raymarched low-res volumetric (Medium+), or layered sprites (Low), coloured by dominant hazard; dissipates with blower flow and wind | gas C<sub>k</sub>, Q<sub>vent</sub> |
| **Interlock status** | LED ring on the skid + HUD ring (red / amber / green), plus outline glow on locked components | K1, K2 |
| **Freezing** | Frost decal and an ice-crystal shader on hoses; a blocked segment shows white | ice fraction |
| **Kink / burst** | Hose mesh pinch; burst = spray particles + sludge decal (Training failure) | kinks[] |
| **Collapse** | Pit-wall mesh swap + soil particles + camera shake | SI > 1 |
| **Spills** | Decals; decon spray removes them (lime-white overlay) | events |

## 4. Accurate PCP animation (reference)

For a single-lobe rotor in a double-lobe stator:

- Rotor rotation about its own axis is θ<sub>r</sub>(t) = ωt.
- The rotor centre orbits the stator axis: x<sub>c</sub> = e·cos(−ωt), y<sub>c</sub> = e·sin(−ωt). This is opposite in direction to the rotation, at the same speed.
- Cavity packets advance axially by one stator pitch P<sub>s</sub> per revolution. The visual flow velocity is v = P<sub>s</sub>·ω/2π, minus a slip fraction shown as backflow shimmer.

## 5. Terrain and environment pipeline

1. **Heightmaps:** procedurally generated, or derived from public DEMs (for example 30 m SRTM / CartoDEM, then upsampled with procedural detail). These are used as *inspiration*, not as exact real sites.
2. **Terraces and stairs:** a procedural spline-based generator (`stairsFromSpline(rise, tread, width)`) produces both render meshes and Rapier colliders from **one** definition, so physics and visuals always match.
3. **Buildings:** a modular kit (walls, roofs, balconies) assembled by a seeded generator, with instancing for repeated parts.
4. **Vegetation:** instanced pines, shrubs and grass with wind shader, LOD cross-fade, and density by quality preset.
5. **Sky and lighting:** a physical sky with time-of-day matching the scenario's T<sub>amb</sub> curve, cascaded shadow maps (2–4 cascades), and fog by altitude and humidity.
6. **Weather:** snow (GPU particles + accumulation shader), rain (particles + wet-surface roughness), and heat haze (screen-space distortion).

## 6. Cameras

| Camera | Use |
| :--- | :--- |
| Orbit | Default; pivots on the selected object |
| Follow | Chase cam on the crawler, with collision avoidance on stairs |
| Operator first-person | Holding the pendant, standing at the 5 m standoff (training realism) |
| Cutaway | Locks to the clipping plane through the pit, skid or hose |
| Cinematic | Spline camera paths for Demo mode, with keyframed FOV and DOF |
| Split-screen | Compare mode: 2 viewports, synchronised time |

## 7. Performance budgets (Medium preset, integrated GPU)

| Budget | Target |
| :--- | ---: |
| Draw calls | ≤ 300 |
| Triangles on screen | ≤ 1.5 M |
| Texture memory | ≤ 512 MB |
| Particles (total) | ≤ 15k |
| Shadow map | 2 cascades × 2048 |
| JS main-thread frame time | ≤ 8 ms |
| Worker step time (100 Hz) | ≤ 1 ms/step at ×1 |

Techniques: instancing, frustum and occlusion culling (drei `<Bvh>`, BVH raycasts), texture atlases, a merged static environment per chunk, on-demand rendering when paused, and dynamic render-scale if the FPS stays below target.

## 8. Audio

| Sound | Model |
| :--- | :--- |
| PCP whine | Pitch ∝ rpm, gain ∝ load; adds a rattle when there is gas or cavitation |
| Vane pump | Hiss ∝ vacuum |
| Auger | Grind ∝ torque; squeal on stall |
| Blower | Steady hum |
| Alarms | Distinct ISO 7731-style tones for gas, overpressure, tilt and dry-run |
| Ambience | Wind, birds, rain or snow by scene and time |
| Voice prompts | SOP steps in EN / HI (TTS-generated at build time, cached) |

Audio follows a spatial model (Web Audio PannerNode) attached to the emitters.
