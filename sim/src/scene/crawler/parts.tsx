import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Snapshot } from '../../core/snapshot';
import { useSim } from '../../store/simStore';
import { cyl, dialTex, kit, merge, type V3 } from './kit';

export type Facing = '+x' | '-x' | '+z' | '-z' | '+y';
/** Plane orientation for each facing direction (PlaneGeometry faces +z). */
export const FACE: Record<Facing, V3> = {
  '+x': [0, Math.PI / 2, 0],
  '-x': [0, -Math.PI / 2, 0],
  '+z': [0, 0, 0],
  '-z': [0, Math.PI, 0],
  '+y': [-Math.PI / 2, 0, 0],
};

/**
 * Bourdon-tube pressure gauge with a live needle (270° sweep). The dial face
 * matches the transmitter range in docs/03 §5 (PT-01 −1…+2 bar(g), PT-02 0…30 bar).
 */
export function Gauge({
  position,
  face,
  r = 0.032,
  min,
  max,
  major,
  red = null,
  unit,
  read,
}: {
  position: V3;
  face: Facing;
  r?: number;
  min: number;
  max: number;
  major: number;
  red?: number | null;
  unit: string;
  read: (s: Snapshot) => number;
}) {
  const K = kit();
  const dial = useMemo(() => dialTex(min, max, major, red, unit), [min, max, major, red, unit]);
  const needle = useRef<THREE.Group>(null);
  const val = useRef(min);
  useFrame((_, dt) => {
    const s = useSim.getState().snap;
    if (!s || !needle.current) return;
    const v = Math.max(min, Math.min(max, read(s)));
    val.current += (v - val.current) * Math.min(1, dt * 6);
    // Dial angle on the canvas (y down) → plane angle (y up); the needle mesh points along +y.
    const a = Math.PI * 0.75 + ((val.current - min) / (max - min)) * Math.PI * 1.5;
    needle.current.rotation.z = -a - Math.PI / 2;
  });
  return (
    <group position={position} rotation={FACE[face]}>
      <mesh position={[0, 0, -0.008]} rotation={[Math.PI / 2, 0, 0]} material={K.m.steel}>
        <cylinderGeometry args={[r + 0.005, r + 0.005, 0.016, 28]} />
      </mesh>
      <mesh position={[0, 0, 0.0006]}>
        <circleGeometry args={[r, 32]} />
        <meshStandardMaterial map={dial} roughness={0.5} />
      </mesh>
      <group ref={needle} position={[0, 0, 0.0018]}>
        <mesh position={[0, r * 0.36, 0]}>
          <boxGeometry args={[r * 0.08, r * 0.92, 0.0012]} />
          <meshBasicMaterial color="#c8261e" />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.0026]} rotation={[Math.PI / 2, 0, 0]} material={K.m.black}>
        <cylinderGeometry args={[r * 0.12, r * 0.12, 0.002, 12]} />
      </mesh>
    </group>
  );
}

/** Cooling fan behind a grille, spinning about z at `speed(s)` rad/s (visual). */
export function Fan({ position, r, rotation = [0, 0, 0], speed }: { position: V3; r: number; rotation?: V3; speed: (s: Snapshot) => number }) {
  const K = kit();
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const blades = Array.from({ length: 6 }, (_, k) => {
      const g = new THREE.BoxGeometry(r * 0.78, r * 0.3, 0.003);
      g.rotateX(0.45);
      g.translate(r * 0.5, 0, 0);
      g.rotateZ((k / 6) * Math.PI * 2);
      return g;
    });
    return merge([...blades, cyl(r * 0.22, 0.012, [0, 0, 0], 'z', 12)]);
  }, [r]);
  useFrame((_, dt) => {
    const s = useSim.getState().snap;
    if (!s || !ref.current) return;
    ref.current.rotation.z += speed(s) * dt;
  });
  return (
    <group position={position} rotation={rotation}>
      <mesh ref={ref} geometry={geo} material={K.m.black} />
    </group>
  );
}

/** Grille disc (transparent between the bars) facing +z. */
export function Grille({ position, r, rotation = [0, 0, 0] }: { position: V3; r: number; rotation?: V3 }) {
  const K = kit();
  return (
    <mesh position={position} rotation={rotation}>
      <circleGeometry args={[r, 28]} />
      <meshStandardMaterial map={K.tex.grille} transparent alphaTest={0.4} side={THREE.DoubleSide} metalness={0.6} roughness={0.4} />
    </mesh>
  );
}
