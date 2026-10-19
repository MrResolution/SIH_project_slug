import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { Line2, LineMaterial } from 'three-stdlib';
import { E1, E1_LANE, E1_ROAD_Y } from '../data/scenes/e1';
import { useSim } from '../store/simStore';
import { groundHeight } from './terrain';

/** Blower, sniffer, crew, gas plume, tanker and falling snow. */
export function SiteProps({ snow }: { snow: boolean }) {
  return (
    <group>
      <RouteGuide />
      <Blower />
      <Sniffer />
      <Crew />
      <GasPlume />
      <Tanker />
      {snow && <Snow />}
    </group>
  );
}

/** Pulsing guide along the lane from the crawler to the pit (until it arrives). */
function RouteGuide() {
  const ref = useRef<Line2>(null);
  const pts = useMemo(() => {
    const out: [number, number, number][] = [];
    for (let s = 0; s <= E1_LANE.length; s += 0.5) {
      const p = E1_LANE.sample(s).p;
      out.push([p.x - 0.18, p.y + 0.2, p.z]);
    }
    return out;
  }, []);
  useFrame(() => {
    const s = useSim.getState().snap;
    const l = ref.current;
    if (!s || !l) return;
    l.visible = !s.vehicle.atPit;
    const m = l.material as LineMaterial;
    m.opacity = 0.7 + 0.25 * Math.sin(performance.now() / 260);
    // Hide the part already travelled (segments are 0.5 m apart).
    l.geometry.instanceCount = Math.max(0, pts.length - 1 - Math.floor(s.vehicle.s_m / 0.5));
  });
  return <Line ref={ref} points={[...pts].reverse()} color="#38c6ff" lineWidth={4} transparent opacity={0.9} depthTest={false} renderOrder={5} toneMapped={false} />;
}

function Blower() {
  const fan = useRef<THREE.Mesh>(null);
  const grp = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const s = useSim.getState().snap;
    if (!s || !grp.current) return;
    grp.current.visible = s.vehicle.atPit && (s.equip.blowerOn || s.equip.manholeOpen);
    if (fan.current && s.equip.blowerOn) fan.current.rotation.x += dt * 40;
  });
  return (
    <group ref={grp} position={[E1.pit.x + 1.15, 0, E1.pit.z + 0.6]}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.36, 0.34, 0.3]} />
        <meshStandardMaterial color="#e3b11f" roughness={0.5} />
      </mesh>
      <mesh position={[-0.1, 0.32, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.12, 0.12, 0.16, 20]} />
        <meshStandardMaterial color="#3b4048" />
      </mesh>
      <mesh ref={fan} position={[-0.19, 0.32, 0]}>
        <boxGeometry args={[0.01, 0.2, 0.03]} />
        <meshStandardMaterial color="#d7dde3" />
      </mesh>
      <mesh position={[0.1, 0.39, 0.12]}>
        <boxGeometry args={[0.1, 0.03, 0.03]} />
        <meshStandardMaterial color="#1f2328" />
      </mesh>
    </group>
  );
}

function Sniffer() {
  const grp = useRef<THREE.Group>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const s = useSim.getState().snap;
    if (!s || !grp.current) return;
    grp.current.visible = s.equip.snifferPlaced;
    if (led.current) {
      const on = s.gas.alarm ? Math.sin(performance.now() / 90) > 0 : true;
      const c = s.gas.alarm ? '#ff3b3b' : '#37d08f';
      led.current.emissive.set(on ? c : '#000000');
      led.current.color.set(c);
    }
  });
  return (
    <group ref={grp} position={[E1.pit.x - 0.36, 0.04, E1.pit.z + 0.3]}>
      <mesh position={[0, 0.07, 0]} castShadow>
        <boxGeometry args={[0.12, 0.14, 0.07]} />
        <meshStandardMaterial color="#f2c230" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.12, 0.036]}>
        <boxGeometry args={[0.07, 0.035, 0.005]} />
        <meshStandardMaterial color="#0e1c14" emissive="#1c4a2c" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[0.04, 0.155, 0]}>
        <sphereGeometry args={[0.012, 10, 8]} />
        <meshStandardMaterial ref={led} color="#37d08f" emissive="#37d08f" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      {/* probe hose hanging into the manhole */}
      <mesh position={[0.24, -0.3, -0.18]} rotation={[0, 0, 0.12]}>
        <cylinderGeometry args={[0.006, 0.006, 0.7, 5]} />
        <meshStandardMaterial color="#15171a" />
      </mesh>
    </group>
  );
}

/** Three crew in PPE: the operator holds the pendant at the upwind stand-off; one works the manhole. */
function Person({ vest = '#ff8a1e', helmet = '#f4f4f0', refGroup }: { vest?: string; helmet?: string; refGroup: (g: THREE.Group | null) => void }) {
  return (
    <group ref={refGroup}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <capsuleGeometry args={[0.13, 0.55, 4, 10]} />
        <meshStandardMaterial color="#2f3a4a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.08, 0]} castShadow>
        <capsuleGeometry args={[0.19, 0.42, 4, 12]} />
        <meshStandardMaterial color={vest} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.08, 0]}>
        <cylinderGeometry args={[0.205, 0.205, 0.05, 14]} />
        <meshStandardMaterial color="#d9dee3" emissive="#9aa3ad" emissiveIntensity={0.25} />
      </mesh>
      <mesh position={[0, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.12, 14, 10]} />
        <meshStandardMaterial color="#c9967a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.63, 0]}>
        <sphereGeometry args={[0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={helmet} roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.53, 0.11]}>
        <boxGeometry args={[0.16, 0.08, 0.04]} />
        <meshStandardMaterial color="#2a3036" roughness={0.6} />
      </mesh>
    </group>
  );
}

function Crew() {
  const g = useRef<(THREE.Group | null)[]>([]);
  const pos = useRef([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
  const init = useRef(false);
  useFrame((_, dt) => {
    const s = useSim.getState().snap;
    if (!s) return;
    const atPit = s.vehicle.atPit;
    const targets = [
      atPit ? new THREE.Vector3(E1.operator.x, 0, E1.operator.z) : new THREE.Vector3(E1.tanker.x + 4.2, E1_ROAD_Y, E1.tanker.z + 2.6),
      atPit ? (s.equip.crewTask || (s.equip.tripod > 0 && s.equip.tripod < 1) ? new THREE.Vector3(E1.pit.x + 0.55, 0, E1.pit.z + 0.85) : new THREE.Vector3(E1.pit.x + 2.4, 0, E1.pit.z - 1.6)) : new THREE.Vector3(E1.tanker.x + 5.4, E1_ROAD_Y, E1.tanker.z + 3.4),
      atPit ? new THREE.Vector3(E1.park.x - 1.35, 0, E1.park.z - 1.9) : new THREE.Vector3(E1.tanker.x + 1.4, E1_ROAD_Y, E1.tanker.z + 2.8),
    ];
    // While the crawler descends, the third crew member walks beside it.
    if (!atPit && s.vehicle.s_m > 2) targets[2] = new THREE.Vector3(NaN, 0, 0);
    targets.forEach((t, i) => {
      const grp = g.current[i];
      if (!grp) return;
      const p = pos.current[i];
      if (Number.isNaN(t.x)) {
        grp.visible = false;
        return;
      }
      grp.visible = true;
      if (!init.current) p.copy(t);
      const d = t.clone().sub(p);
      const dist = d.length();
      if (dist > 8) p.copy(t);
      else if (dist > 0.02) p.add(d.multiplyScalar(Math.min(1, (dt * 1.4) / dist)));
      grp.position.set(p.x, groundHeight(p.x, p.z), p.z);
      // Face the manhole (or the tanker at the road).
      const look = atPit ? new THREE.Vector3(E1.pit.x, 0, E1.pit.z) : new THREE.Vector3(E1.tanker.x, 0, E1.tanker.z);
      grp.rotation.y = Math.atan2(look.x - p.x, look.z - p.z);
    });
    init.current = true;
  });
  return (
    <group>
      <Person refGroup={(x) => (g.current[0] = x)} vest="#ff8a1e" />
      <Person refGroup={(x) => (g.current[1] = x)} vest="#c6e83a" />
      <Person refGroup={(x) => (g.current[2] = x)} vest="#ff8a1e" helmet="#3a7bd5" />
    </group>
  );
}

function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Gas plume above the open manhole: coloured by the dominant hazard, drifting downwind (−x). */
function GasPlume() {
  const tex = useMemo(() => puffTexture(), []);
  const N = 22;
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  const t = useRef(0);
  useFrame((_, dt) => {
    const st = useSim.getState();
    const s = st.snap;
    if (!s) return;
    t.current += dt * Math.min(st.speed, 4);
    const level = st.view.gas ? s.gas.plume : 0;
    const col = s.gas.dominant === 'CH4' ? '#b89cff' : s.gas.dominant === 'CO' ? '#c9ccd2' : s.gas.dominant === 'O2' ? '#8fd3ff' : '#d8e36a';
    const blow = s.equip.blowerOn ? 1.8 : 1;
    sprites.current.forEach((sp, i) => {
      if (!sp) return;
      const phase = (t.current * 0.18 * blow + i / N) % 1;
      const drift = phase * (1.6 + s.env.wind_ms * 0.8);
      sp.position.set(E1.pit.x - drift + Math.sin(i * 7.1 + t.current) * 0.15, 0.25 + phase * 2.4, E1.pit.z + Math.cos(i * 3.3) * 0.25 * phase);
      const sc = 0.4 + phase * 1.8;
      sp.scale.set(sc, sc, 1);
      const m = sp.material as THREE.SpriteMaterial;
      m.opacity = Math.min(0.55, level * 0.9) * (1 - phase) * Math.min(1, phase * 6);
      m.color.set(col);
      sp.visible = level > 0.02;
    });
  });
  return (
    <group>
      {Array.from({ length: N }, (_, i) => (
        <sprite key={i} ref={(s) => (sprites.current[i] = s)}>
          <spriteMaterial map={tex} transparent depthWrite={false} opacity={0} />
        </sprite>
      ))}
    </group>
  );
}

/** Generic municipal road tanker (receiver), parked heading −x. */
function Tanker() {
  const level = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const s = useSim.getState().snap;
    if (!s || !level.current) return;
    const f = Math.min(1, s.receiver.v_L / s.receiver.cap_L);
    level.current.scale.y = Math.max(0.001, f);
    level.current.position.y = 1.15 - 0.55 + (1.1 * f) / 2;
  });
  const T = E1.tanker;
  return (
    <group position={[T.x, T.y, T.z]}>
      {/* chassis */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[6.4, 0.25, 1.1]} />
        <meshStandardMaterial color="#25292e" />
      </mesh>
      {/* cab */}
      <mesh position={[-2.65, 1.45, 0]} castShadow>
        <boxGeometry args={[1.5, 1.7, 2.2]} />
        <meshStandardMaterial color="#2b5d8f" roughness={0.45} metalness={0.2} />
      </mesh>
      <mesh position={[-3.41, 1.75, 0]}>
        <boxGeometry args={[0.02, 0.75, 1.9]} />
        <meshStandardMaterial color="#1b2733" metalness={0.6} roughness={0.15} />
      </mesh>
      {/* tank */}
      <mesh position={[0.95, 1.6, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.95, 0.95, 4.3, 28]} />
        <meshStandardMaterial color="#e8ebee" roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0.95, 1.6, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.965, 0.965, 0.32, 28, 1, true]} />
        <meshStandardMaterial color="#2b5d8f" side={THREE.DoubleSide} />
      </mesh>
      {/* level sight tube */}
      <mesh position={[3.12, 1.15, 0.55]}>
        <cylinderGeometry args={[0.05, 0.05, 1.12, 10]} />
        <meshStandardMaterial color="#cfe8f0" transparent opacity={0.35} />
      </mesh>
      <mesh ref={level} position={[3.12, 0.6, 0.55]}>
        <cylinderGeometry args={[0.04, 0.04, 1.1, 10]} />
        <meshStandardMaterial color="#8a6a3d" />
      </mesh>
      {/* inlet coupling (hose connects here) */}
      <mesh position={[3.15, 1.6, 0.9]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 0.3, 12]} />
        <meshStandardMaterial color="#9aa3ad" metalness={0.6} />
      </mesh>
      {/* wheels */}
      {[-2.6, 0.2, 1.4].map((x) =>
        [-1, 1].map((sz) => (
          <mesh key={`${x}${sz}`} position={[x, 0.45, sz * 0.95]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.45, 0.45, 0.3, 20]} />
            <meshStandardMaterial color="#141517" roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Falling snow in a box that follows the camera target. */
function Snow() {
  const N = 4500;
  const ref = useRef<THREE.Points>(null);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      p[i * 3] = (Math.random() - 0.5) * 120;
      p[i * 3 + 1] = Math.random() * 60;
      p[i * 3 + 2] = (Math.random() - 0.5) * 120;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return g;
  }, []);
  useFrame((state, dt) => {
    const pts = ref.current;
    if (!pts) return;
    const on = useSim.getState().view.weather;
    pts.visible = on;
    if (!on) return;
    const a = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < N; i++) {
      arr[i * 3 + 1] -= dt * (1.1 + (i % 7) * 0.08);
      arr[i * 3] += Math.sin(t * 0.7 + i) * dt * 0.25 - dt * 0.35;
      if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] += 60;
      if (arr[i * 3] < -60) arr[i * 3] += 120;
    }
    a.needsUpdate = true;
    const c = state.camera.position;
    pts.position.set(c.x, c.y - 30, c.z);
  });
  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <pointsMaterial color="#ffffff" size={0.07} sizeAttenuation transparent opacity={0.8} depthWrite={false} />
    </points>
  );
}
