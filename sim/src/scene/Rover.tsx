import { useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { E1_LANE } from '../data/scenes/e1';
import { useSim } from '../store/simStore';
import { BoosterSkid } from './BoosterSkid';

/**
 * Tier 3 · Tracked Rover / Crawler (Variant B, 750 mm wide) chassis.
 * Local frame: +z forward, origin at the centre of the track contact patch.
 * Pose comes from the core's kinematic lane-follow.
 */

const YELLOW = '#d9a521';
const DARK = '#2b2f35';

/** Pose helper shared with labels / camera follow. */
export function roverPose(s_m: number, heading: 1 | -1, pitchDeg: number, rollDeg: number) {
  const a = E1_LANE.sample(Math.max(0, s_m));
  const t = a.t;
  const h = Math.hypot(t.x, t.z) || 1;
  let yaw = Math.atan2(t.x / h, t.z / h);
  if (heading < 0) yaw += Math.PI;
  const pitchWorld = ((heading > 0 ? -pitchDeg : pitchDeg) * Math.PI) / 180;
  return { pos: new THREE.Vector3(a.p.x, a.p.y, a.p.z), yaw, pitch: pitchWorld, roll: (rollDeg * Math.PI) / 180 };
}

/** Alias for backward compatibility with crawler references. */
export const crawlerPose = roverPose;

function trackTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b1d20';
  g.fillRect(0, 0, 32, 128);
  for (let y = 0; y < 128; y += 16) {
    g.fillStyle = '#2b2e33';
    g.fillRect(0, y, 32, 7);
    g.fillStyle = '#121315';
    g.fillRect(0, y + 7, 32, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface RoverProps {
  /** Optional payload to mount on the rover deck. Defaults to `<BoosterSkid />`. */
  children?: ReactNode;
}

/**
 * The Rover component:
 * - Left and right rubber tracks with tread texture & road wheels
 * - Main chassis box + yellow top deck
 * - 48 V LiFePO4 battery pack
 * - 4 corner fold-down outriggers
 * - Deployable wheel/track chocks
 * - Accepts mounted equipment / children (default: BoosterSkid)
 */
export function Rover({ children }: RoverProps = {}) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const outriggers = useRef<(THREE.Group | null)[]>([]);
  const chocks = useRef<THREE.Group>(null);
  const tex = useMemo(() => trackTexture(), []);
  const smooth = useRef({ yaw: 0, init: false });

  useFrame((_, dt) => {
    const st = useSim.getState();
    const s = st.snap;
    if (!s || !root.current || !body.current) return;
    const v = s.vehicle;
    const pose = roverPose(v.s_m, v.heading, v.pitch_deg, v.roll_deg);
    root.current.position.copy(pose.pos);

    // Smooth yaw through the 90° landing turns (skid-steer pivot).
    const sm = smooth.current;
    if (!sm.init) {
      sm.yaw = pose.yaw;
      sm.init = true;
    }
    let dy = pose.yaw - sm.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    sm.yaw += dy * Math.min(1, dt * 4);
    root.current.rotation.set(0, sm.yaw, 0);
    body.current.rotation.set(pose.pitch, 0, pose.roll);
    tex.offset.y = -v.s_m * 0.9;

    // Outriggers (stowed upright → deployed down and out).
    outriggers.current.forEach((o, i) => {
      if (!o) return;
      // Arm points up when stowed; deployed it swings 143° down and out so the pad meets the ground.
      const side = i % 2 === 0 ? -1 : 1;
      o.rotation.z = -side * THREE.MathUtils.degToRad(143) * v.outriggers;
    });
    if (chocks.current) chocks.current.visible = v.chocks > 0.5;
  });

  return (
    <group ref={root}>
      <group ref={body}>
        {/* tracks */}
        {[-1, 1].map((sx) => (
          <group key={sx} position={[sx * 0.285, 0.16, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.18, 0.32, 1.42]} />
              <meshStandardMaterial map={tex} roughness={0.95} />
            </mesh>
            {[-1, 1].map((sz) => (
              <mesh key={sz} position={[0, 0, sz * 0.71]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.16, 0.16, 0.18, 18]} />
                <meshStandardMaterial map={tex} roughness={0.95} />
              </mesh>
            ))}
            {[-0.71, -0.36, 0, 0.36, 0.71].map((z, k) => (
              <mesh key={k} position={[sx * 0.093, 0, z]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[k === 0 || k === 4 ? 0.11 : 0.07, k === 0 || k === 4 ? 0.11 : 0.07, 0.012, 14]} />
                <meshStandardMaterial color="#5d636b" metalness={0.6} roughness={0.4} />
              </mesh>
            ))}
          </group>
        ))}

        {/* chassis + deck */}
        <mesh position={[0, 0.26, 0]} castShadow>
          <boxGeometry args={[0.39, 0.22, 1.5]} />
          <meshStandardMaterial color={DARK} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.405, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.75, 0.05, 1.82]} />
          <meshStandardMaterial color={YELLOW} roughness={0.55} metalness={0.25} />
        </mesh>

        {/* battery pack */}
        <mesh position={[0, 0.3, -0.1]}>
          <boxGeometry args={[0.36, 0.14, 0.9]} />
          <meshStandardMaterial color="#1f2328" roughness={0.6} />
        </mesh>

        {/* outriggers at the deck corners */}
        {[
          [-1, 0.72],
          [1, 0.72],
          [-1, -0.72],
          [1, -0.72],
        ].map(([sx, z], i) => (
          <group key={i} position={[sx * 0.38, 0.4, z]}>
            <group ref={(g) => (outriggers.current[i] = g)}>
              <mesh position={[0, 0.27, 0]}>
                <boxGeometry args={[0.05, 0.54, 0.05]} />
                <meshStandardMaterial color="#3b4048" metalness={0.5} roughness={0.5} />
              </mesh>
              <mesh position={[0, 0.54, 0]}>
                <cylinderGeometry args={[0.07, 0.07, 0.025, 14]} />
                <meshStandardMaterial color="#1e2226" />
              </mesh>
            </group>
          </group>
        ))}

        {/* chocks */}
        <group ref={chocks}>
          {[-1, 1].map((sx) => (
            <mesh key={sx} position={[sx * 0.285, 0.06, -0.92]} rotation={[0, 0, 0]}>
              <boxGeometry args={[0.16, 0.12, 0.16]} />
              <meshStandardMaterial color="#e3b11f" />
            </mesh>
          ))}
        </group>

        {/* Mounted payload / equipment on the deck */}
        {children !== undefined ? children : <BoosterSkid />}
      </group>
    </group>
  );
}

/** Alias for backward compatibility with crawler references. */
export const Crawler = Rover;
