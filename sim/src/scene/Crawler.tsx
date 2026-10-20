import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { E1_LANE } from '../data/scenes/e1';
import { useSim } from '../store/simStore';
import { Booster } from './crawler/Booster';
import { kit } from './crawler/kit';
import { DECK, HALF_W, REEL, TRACK } from './crawler/layout';
import type { CrawlerMotion } from './crawler/motion';
import { Superstructure } from './crawler/Superstructure';
import { Undercarriage } from './crawler/Undercarriage';

/**
 * Tier 3 · tracked crawler (Variant B, 750 mm wide) carrying the Tier 2
 * booster skid. Local frame: +z forward, origin at the centre of the track
 * contact patch. Pose comes from the core's kinematic lane-follow; this
 * component also integrates the track odometers (with skid-steer
 * counter-rotation through the landing turns) and the hose paid off the reel.
 * General arrangement: crawler/layout.ts.
 */

/** Pose helper shared with labels / camera follow. */
export function crawlerPose(s_m: number, heading: 1 | -1, pitchDeg: number, rollDeg: number) {
  const a = E1_LANE.sample(Math.max(0, s_m));
  const t = a.t;
  const h = Math.hypot(t.x, t.z) || 1;
  let yaw = Math.atan2(t.x / h, t.z / h);
  if (heading < 0) yaw += Math.PI;
  const pitchWorld = ((heading > 0 ? -pitchDeg : pitchDeg) * Math.PI) / 180;
  return { pos: new THREE.Vector3(a.p.x, a.p.y, a.p.z), yaw, pitch: pitchWorld, roll: (rollDeg * Math.PI) / 180 };
}

export function Crawler() {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const motion = useRef<CrawlerMotion>({ odo: [0, 0], paid: 0, reelAngle: 0, rCoil: REEL.full });
  const smooth = useRef({ yaw: 0, s: 0, init: false });

  useFrame((_, dt) => {
    const s = useSim.getState().snap;
    if (!s || !root.current || !body.current) return;
    const v = s.vehicle;
    const mo = motion.current;
    const pose = crawlerPose(v.s_m, v.heading, v.pitch_deg, v.roll_deg);
    root.current.position.copy(pose.pos);
    const paid = v.atPit ? s.hose.length_m : Math.min(s.hose.length_m, v.s_m + 6);
    // Smooth yaw through the 90° landing turns (skid-steer pivot).
    const sm = smooth.current;
    if (!sm.init) {
      sm.yaw = pose.yaw;
      sm.s = v.s_m;
      mo.paid = paid;
      sm.init = true;
    }
    let dy = pose.yaw - sm.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    const dYaw = dy * Math.min(1, dt * 4);
    sm.yaw += dYaw;
    root.current.rotation.set(0, sm.yaw, 0);
    body.current.rotation.set(pose.pitch, 0, pose.roll);

    // Track odometers: forward travel plus the pivot (positive yaw = turning towards +x, so the +x belt slows).
    const ds = Math.abs(v.s_m - sm.s);
    sm.s = v.s_m;
    if (ds < 2) {
      mo.odo[0] += ds + dYaw * TRACK.x;
      mo.odo[1] += ds - dYaw * TRACK.x;
    }
    // Hose on the reel: coil radius from the wound cross-section, drum angle from the length paid.
    const left = Math.max(0, REEL.cap_m - paid) / REEL.cap_m;
    mo.rCoil = Math.sqrt(REEL.hub ** 2 + left * (REEL.full ** 2 - REEL.hub ** 2));
    const dp = paid - mo.paid;
    mo.paid = paid;
    if (Math.abs(dp) < 5) mo.reelAngle += dp / mo.rCoil;
  });

  return (
    <group ref={root}>
      <group ref={body}>
        <Undercarriage motion={motion} />
        <Deck />
        <Booster />
        <Superstructure motion={motion} />
      </group>
    </group>
  );
}

/** Diamond-plate deck with yellow fender skirts, side decals and hazard-striped ends. */
function Deck() {
  const K = kit();
  const mats = useMemo(() => {
    const ends = K.tex.hazard.clone();
    ends.repeat.set(14, 1);
    ends.needsUpdate = true;
    const end = new THREE.MeshStandardMaterial({ map: ends, roughness: 0.55, metalness: 0.1 });
    // BoxGeometry groups: +x, −x, +y, −y, +z, −z
    return [K.m.yellow, K.m.yellow, K.m.deck, K.m.body, end, end];
  }, [K]);
  const h = DECK.y1 - DECK.y0;
  const yc = (DECK.y0 + DECK.y1) / 2;
  return (
    <group>
      <mesh position={[0, yc, 0]} material={mats} castShadow receiveShadow>
        <boxGeometry args={[DECK.w, h, DECK.l]} />
      </mesh>
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <mesh position={[sx * (HALF_W - 0.003), yc, 0]} material={K.m.yellow} castShadow>
            <boxGeometry args={[0.006, h, DECK.l]} />
          </mesh>
          <mesh position={[sx * (HALF_W + 0.0006), yc, 0]} rotation={[0, (sx * Math.PI) / 2, 0]}>
            <planeGeometry args={[DECK.l - 0.02, h - 0.006]} />
            <meshStandardMaterial map={K.tex.decal} roughness={0.5} metalness={0.15} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
