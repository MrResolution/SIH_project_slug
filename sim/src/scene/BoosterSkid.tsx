import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSim } from '../store/simStore';
import { tsColor } from '../ui/colors';
import { HelixCurve } from './geom';

const STEEL = '#aeb6bf';
const YELLOW = '#d9a521';

/**
 * Tier 2 · High-pressure positive displacement booster skid.
 * Mounted on the Tier 3 Rover / Crawler chassis via quick-release ISO frame.
 * Includes:
 *  - ISO skid mounting frame
 *  - 90 L transparent surge cube with liquid level + vane vacuum pump
 *  - 5.5 kW Progressive Cavity Pump (PCP) with 1:2 eccentric rotor kinematics
 *  - Hose reel with dynamic payout coil
 *  - Controller mast with K1/K2 hardware-interlocked LED beacon ring
 *  - Rear deck storage: decon tank, PPE locker, stowed tripod and lance
 */
export function BoosterSkid() {
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const ledLight = useRef<THREE.PointLight>(null);
  const reel = useRef<THREE.Group>(null);
  const coil = useRef<THREE.Mesh>(null);
  const stator = useRef<THREE.MeshStandardMaterial>(null);
  const rotorOrbit = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Mesh>(null);
  const cavities = useRef<THREE.Group>(null);
  const cubeShell = useRef<THREE.MeshStandardMaterial>(null);
  const cubeLiquid = useRef<THREE.Mesh>(null);
  const cubeLiquidMat = useRef<THREE.MeshStandardMaterial>(null);
  const vaneFan = useRef<THREE.Mesh>(null);
  const stowed = useRef<THREE.Group>(null);
  const pcpAngle = useRef(0);

  const rotorGeo = useMemo(() => {
    const g = new THREE.TubeGeometry(new HelixCurve(0.012, 0.12, 0.74), 160, 0.034, 10, false);
    g.rotateX(Math.PI / 2); // helix axis y → z
    g.translate(0, 0, -0.37);
    return g;
  }, []);

  useFrame((_, dt) => {
    const st = useSim.getState();
    const s = st.snap;
    if (!s) return;
    const v = s.vehicle;

    // Interlock LED ring: red K1 open · amber K1 only · green K2.
    const col = s.job.k2 ? '#37d08f' : s.job.k1 ? '#f3b343' : '#ff5a5f';
    if (led.current) {
      led.current.color.set(col);
      led.current.emissive.set(col);
      led.current.emissiveIntensity = 2.2 + (s.alarms.length ? Math.sin(performance.now() / 120) * 1.4 : 0);
    }
    if (ledLight.current) ledLight.current.color.set(col);

    // Hose reel pays out as the crawler descends.
    const paid = v.atPit ? s.hose.length_m : Math.min(s.hose.length_m, v.s_m + 6);
    const left = Math.max(0, 150 - paid) / 150;
    if (coil.current) coil.current.scale.setScalar(0.62 + 0.38 * left);
    if (reel.current && v.moving) reel.current.rotation.x += dt * v.v_ms * 3.5;

    if (stowed.current) stowed.current.visible = s.equip.tripod <= 0.001;

    // PCP X-ray: rotor spins at ω about its own axis while its centre orbits at −ω (1:2 kinematics).
    const xray = st.view.xray;
    if (stator.current) {
      stator.current.opacity = xray ? 0.2 : 1;
      stator.current.depthWrite = !xray;
    }
    const omega = (s.pcp.rpm / 60) * Math.PI * 2;
    pcpAngle.current += (omega * dt * Math.min(st.speed, 2)) / 6;
    const e = 0.012;
    if (rotorOrbit.current) rotorOrbit.current.position.set(e * Math.cos(-pcpAngle.current), e * Math.sin(-pcpAngle.current), 0);
    if (rotor.current) {
      rotor.current.rotation.z = pcpAngle.current;
      rotor.current.visible = xray;
    }
    if (cavities.current) {
      cavities.current.visible = xray && s.pcp.rpm > 5;
      const pitchS = 0.24;
      const adv = ((pcpAngle.current / (Math.PI * 2)) * pitchS) % pitchS;
      const c = tsColor(s.cube.ts);
      cavities.current.children.forEach((ch, i) => {
        ch.position.z = -0.36 + ((i * pitchS + adv) % 0.72);
        ((ch as THREE.Mesh).material as THREE.MeshStandardMaterial).color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
      });
    }

    // Surge cube: transparent shell in X-ray / cutaway view, liquid level tilts with the chassis.
    const seeInside = xray || st.view.cutaway;
    if (cubeShell.current) {
      cubeShell.current.opacity = seeInside ? 0.28 : 1;
      cubeShell.current.depthWrite = !seeInside;
    }
    if (cubeLiquid.current) {
      const f = Math.max(0.001, Math.min(1, s.cube.level_L / 90));
      cubeLiquid.current.visible = seeInside && f > 0.01;
      cubeLiquid.current.scale.set(1, f, 1);
      cubeLiquid.current.position.y = -0.2 + (0.4 * f) / 2;
      const c = tsColor(s.cube.ts);
      cubeLiquidMat.current?.color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
    }
    if (vaneFan.current && s.cube.vaneMode !== 'off') vaneFan.current.rotation.y += dt * 30;
  });

  return (
    <group>
      {/* ISO skid frame */}
      {[
        [-0.33, 0],
        [0.33, 0],
      ].map(([x], i) => (
        <mesh key={i} position={[x, 0.46, -0.02]}>
          <boxGeometry args={[0.04, 0.05, 0.96]} />
          <meshStandardMaterial color="#3b4048" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}

      {/* surge cube + vane pump (left rear) */}
      <group position={[-0.17, 0.69, -0.42]}>
        <mesh castShadow>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial ref={cubeShell} color="#b8c1ca" metalness={0.7} roughness={0.3} transparent />
        </mesh>
        <mesh ref={cubeLiquid}>
          <boxGeometry args={[0.37, 0.4, 0.37]} />
          <meshStandardMaterial ref={cubeLiquidMat} color="#8fb64a" roughness={0.6} />
        </mesh>
        <mesh position={[-0.205, 0, 0]}>
          <boxGeometry args={[0.012, 0.3, 0.06]} />
          <meshStandardMaterial color="#9fd4df" transparent opacity={0.6} />
        </mesh>
        <mesh position={[0, 0.26, -0.05]}>
          <cylinderGeometry args={[0.075, 0.075, 0.13, 16]} />
          <meshStandardMaterial color="#456f99" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh ref={vaneFan} position={[0, 0.33, -0.05]}>
          <boxGeometry args={[0.13, 0.01, 0.025]} />
          <meshStandardMaterial color="#d7dde3" />
        </mesh>
        {/* suction inlet stub */}
        <mesh position={[0, 0.06, 0.21]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.045, 0.045, 0.06, 14]} />
          <meshStandardMaterial color="#2c3138" />
        </mesh>
      </group>

      {/* PCP + motor (right, along the vehicle) */}
      <group position={[0.17, 0.56, -0.12]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.78, 22, 1, false]} />
          <meshStandardMaterial ref={stator} color="#2f6aa8" metalness={0.35} roughness={0.45} transparent />
        </mesh>
        <group ref={rotorOrbit}>
          <mesh ref={rotor} geometry={rotorGeo}>
            <meshStandardMaterial color="#d6dbe0" metalness={0.85} roughness={0.25} />
          </mesh>
        </group>
        <group ref={cavities}>
          {[0, 1, 2].map((i) => (
            <mesh key={i}>
              <sphereGeometry args={[0.042, 12, 8]} />
              <meshStandardMaterial transparent opacity={0.65} />
            </mesh>
          ))}
        </group>
        <mesh position={[0, 0, -0.5]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.095, 0.095, 0.22, 20]} />
          <meshStandardMaterial color="#59616b" metalness={0.5} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0, -0.66]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.12, 20]} />
          <meshStandardMaterial color="#3f464f" metalness={0.5} roughness={0.5} />
        </mesh>
        {/* discharge elbow + relief valve + PT-02 */}
        <mesh position={[0, 0.1, 0.36]}>
          <cylinderGeometry args={[0.04, 0.04, 0.2, 14]} />
          <meshStandardMaterial color="#9aa3ad" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0.08, 0.2, 0.36]}>
          <cylinderGeometry args={[0.025, 0.035, 0.14, 12]} />
          <meshStandardMaterial color="#b3392f" />
        </mesh>
        <mesh position={[-0.06, 0.2, 0.36]}>
          <cylinderGeometry args={[0.035, 0.035, 0.02, 16]} />
          <meshStandardMaterial color="#e8ecef" />
        </mesh>
      </group>

      {/* hose reel (front) */}
      <group ref={reel} position={[0, 0.74, 0.58]}>
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * 0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.34, 0.34, 0.025, 28]} />
            <meshStandardMaterial color="#b3392f" metalness={0.3} roughness={0.5} />
          </mesh>
        ))}
        <mesh ref={coil} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.33, 0.33, 0.47, 28]} />
          <meshStandardMaterial color="#1e2328" roughness={0.75} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.12, 0.12, 0.5, 18]} />
          <meshStandardMaterial color="#7d858e" metalness={0.5} />
        </mesh>
      </group>
      {[-0.3, 0.3].map((x) => (
        <mesh key={x} position={[x, 0.56, 0.58]}>
          <boxGeometry args={[0.03, 0.3, 0.06]} />
          <meshStandardMaterial color="#3b4048" />
        </mesh>
      ))}

      {/* controller + interlock LED ring mast */}
      <group position={[-0.2, 0.55, 0.1]}>
        <mesh castShadow>
          <boxGeometry args={[0.28, 0.22, 0.26]} />
          <meshStandardMaterial color="#6b737d" metalness={0.3} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.02, 0.131]}>
          <planeGeometry args={[0.16, 0.08]} />
          <meshStandardMaterial color="#0e1c14" emissive="#1c4a2c" emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0.05, 0.42, -0.05]}>
          <cylinderGeometry args={[0.012, 0.012, 0.62, 8]} />
          <meshStandardMaterial color="#3b4048" />
        </mesh>
        <mesh position={[0.05, 0.75, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.07, 0.022, 10, 28]} />
          <meshStandardMaterial ref={led} color="#ff5a5f" emissive="#ff5a5f" emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
        <pointLight ref={ledLight} position={[0.05, 0.75, -0.05]} intensity={0.6} distance={3} color="#ff5a5f" />
      </group>

      {/* rear deck: decon tank, PPE locker, blower, stowed tripod + lance */}
      <mesh position={[0.2, 0.56, -0.8]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.09, 0.09, 0.28, 16]} />
        <meshStandardMaterial color="#e9eef2" roughness={0.5} />
      </mesh>
      <mesh position={[-0.2, 0.55, -0.8]}>
        <boxGeometry args={[0.26, 0.22, 0.16]} />
        <meshStandardMaterial color="#2f6aa8" roughness={0.6} />
      </mesh>
      <group ref={stowed}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0.36 + i * 0.012, 0.47 + i * 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.018, 0.018, 1.7, 8]} />
            <meshStandardMaterial color={YELLOW} />
          </mesh>
        ))}
        <mesh position={[-0.37, 0.48, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.038, 0.038, 1.75, 12]} />
          <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}
