import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitImpl } from 'three-stdlib';
import { E1 } from '../data/scenes/e1';
import { useSim, type CameraPreset } from '../store/simStore';
import { crawlerPose } from './Crawler';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const PRESETS: Record<Exclude<CameraPreset, 'follow'>, { pos: THREE.Vector3; target: THREE.Vector3 }> = {
  overview: { pos: v(62, 58, 58), target: v(2, 14, -16) },
  lane: { pos: v(-34, 40, 2), target: v(4, 17, -18) },
  site: { pos: v(12.5, 7.5, 38), target: v(1.2, 0.2, 26.8) },
  pit: { pos: v(E1.pit.x + 1.15, -0.25, E1.pit.z + 3.0), target: v(E1.pit.x - 0.05, -1.3, E1.pit.z) },
  skid: { pos: v(E1.park.x + 2.15, 1.45, E1.park.z - 1.55), target: v(E1.park.x + 0.12, 0.62, E1.park.z - 0.1) },
  hose: { pos: v(44, 36, -4), target: v(4, 19, -20) },
  tanker: { pos: v(E1.tanker.x + 10, E1.tanker.y + 5, E1.tanker.z + 9), target: v(E1.tanker.x + 1.5, E1.tanker.y + 1.4, E1.tanker.z) },
};

/** Orbit camera with eased fly-to presets and a crawler chase mode. */
export function CameraRig() {
  const controls = useRef<OrbitImpl>(null);
  const { camera } = useThree();
  const nonce = useSim((s) => s.cameraNonce);
  const preset = useSim((s) => s.camera);
  const fly = useRef<{ p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; k: number } | null>(null);

  useEffect(() => {
    camera.position.copy(PRESETS.overview.pos);
    controls.current?.target.copy(PRESETS.overview.target);
    controls.current?.update();
  }, [camera]);

  useEffect(() => {
    const c = controls.current;
    if (!c || nonce === 0) return;
    let p1: THREE.Vector3;
    let t1: THREE.Vector3;
    if (preset === 'follow') {
      const s = useSim.getState().snap;
      const pose = s ? crawlerPose(s.vehicle.s_m, s.vehicle.heading, s.vehicle.pitch_deg, 0) : { pos: v(E1.park.x, 0, E1.park.z), yaw: 0 };
      t1 = pose.pos.clone().add(v(0, 0.8, 0));
      p1 = t1.clone().add(v(-Math.sin(pose.yaw) * 6 + 3, 3.8, -Math.cos(pose.yaw) * 6));
    } else {
      p1 = PRESETS[preset].pos.clone();
      t1 = PRESETS[preset].target.clone();
    }
    fly.current = { p0: camera.position.clone(), t0: c.target.clone(), p1, t1, k: 0 };
  }, [nonce, preset, camera]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const f = fly.current;
    if (f) {
      f.k = Math.min(1, f.k + dt / 1.3);
      const e = f.k < 0.5 ? 4 * f.k ** 3 : 1 - (-2 * f.k + 2) ** 3 / 2;
      camera.position.lerpVectors(f.p0, f.p1, e);
      c.target.lerpVectors(f.t0, f.t1, e);
      if (f.k >= 1) fly.current = null;
    } else if (useSim.getState().camera === 'follow') {
      const s = useSim.getState().snap;
      if (s) {
        const pose = crawlerPose(s.vehicle.s_m, s.vehicle.heading, s.vehicle.pitch_deg, 0);
        const tgt = pose.pos.clone().add(v(0, 0.8, 0));
        const delta = tgt.clone().sub(c.target);
        c.target.add(delta);
        camera.position.add(delta);
      }
    }
    c.update();
  });

  return <OrbitControls ref={controls as never} makeDefault enableDamping dampingFactor={0.09} maxPolarAngle={Math.PI * 0.495} minDistance={1.2} maxDistance={420} zoomSpeed={0.9} />;
}
