import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { useSim } from '../../store/simStore';
import { HelixCurve } from '../geom';
import { BeltLoop, beltGeo, box, chevronLug, cyl, holedDisc, kit, merge, own, sphere, sprocketGeo, torus, boltRing, type BeltSample } from './kit';
import { IDLER_Y, SPROCKET_Y, TRACK, TUB } from './layout';
import type { CrawlerMotion } from './motion';

/**
 * Rubber-track undercarriage and chassis tub: belts with chevron lugs that
 * travel with the odometer (and counter-rotate in skid-steer turns), drive
 * sprockets on hub motors, sprung front idlers, double-flange road rollers,
 * carrier rollers, and the 48 V LiFePO₄ battery bay (visible in X-ray).
 */

const BELT_W = TRACK.width - 0.012; // + 2 × 6 mm bevel = 180 mm
const SIDES = [-1, 1] as const;

export function Undercarriage({ motion }: { motion: React.RefObject<CrawlerMotion> }) {
  const K = kit();
  const loop = useMemo(
    () =>
      new BeltLoop(
        { z: TRACK.sprocket.z, y: SPROCKET_Y, r: TRACK.sprocket.r },
        { z: TRACK.idler.z, y: IDLER_Y, r: TRACK.idler.r },
      ),
    [],
  );
  const geo = useMemo(() => {
    const roller = merge([
      cyl(TRACK.rollerR, 0.045, [-0.035, 0, 0], 'x', 20),
      cyl(TRACK.rollerR, 0.045, [0.035, 0, 0], 'x', 20),
      cyl(TRACK.rollerR + 0.009, 0.008, [-0.061, 0, 0], 'x', 20),
      cyl(TRACK.rollerR + 0.009, 0.008, [0.061, 0, 0], 'x', 20),
      cyl(0.016, 0.15, [0, 0, 0], 'x', 8),
      // spoke marks so rotation reads
      box(0.004, 0.07, 0.01, [-0.0585, 0, 0]),
      box(0.004, 0.07, 0.01, [0.0585, 0, 0]),
    ]);
    const carrier = merge([cyl(TRACK.carrierR, 0.1, [0, 0, 0], 'x', 16), box(0.004, 0.05, 0.008, [0.051, 0, 0]), cyl(0.012, 0.13, [0, 0, 0], 'x', 8)]);
    const idlerRims = merge([
      cyl(TRACK.idler.r - 0.002, 0.05, [-0.036, 0, 0], 'x', 32),
      cyl(TRACK.idler.r - 0.002, 0.05, [0.036, 0, 0], 'x', 32),
      cyl(0.045, 0.13, [0, 0, 0], 'x', 16),
      cyl(0.018, 0.17, [0, 0, 0], 'x', 10),
    ]);
    const idlerFace = holedDisc(TRACK.idler.r - 0.012, 0.008, 6, 0.072, 0.026, 0);
    const sprocket = sprocketGeo(11, TRACK.sprocket.r - 0.03, TRACK.sprocket.r - 0.004, 0.05);
    const sprocketHub = merge([cyl(0.055, 0.07, [0, 0, 0], 'x', 20), ...boltRing(8, 0.04, [0.036, 0, 0], 'x')]);
    return { roller, carrier, idlerRims, idlerFace, sprocket, sprocketHub };
  }, []);

  /** Static per-side running gear: track frame, roller hangers, idler yoke, tensioner, cross-members. */
  const frameGeo = useMemo(
    () =>
      SIDES.map((sx) => {
        const x = sx * TRACK.x;
        const inner = sx * (TRACK.x - 0.075);
        const out = x + sx * 0.058;
        const parts = [
          box(0.07, 0.09, 1.12, [x, 0.2, 0]),
          box(0.075, 0.012, 1.1, [x, 0.25, 0]),
          // roller hangers (in the gap between the roller halves)
          ...TRACK.rollers.map((z) => box(0.018, 0.07, 0.05, [x, 0.13, z])),
          // carrier roller bracket, cantilevered from the inner side
          box(0.012, 0.05, 0.04, [inner + sx * 0.003, 0.27, 0]),
          box(0.045, 0.012, 0.04, [sx * 0.232, 0.25, 0]),
          // idler yoke plates either side of the idler (slide in the frame)
          box(0.012, 0.05, 0.22, [x - 0.077, IDLER_Y, TRACK.idler.z - 0.08]),
          box(0.012, 0.05, 0.22, [x + 0.077, IDLER_Y, TRACK.idler.z - 0.08]),
          // grease tensioner: cylinder, rod through the spring, push block on the yoke
          cyl(0.02, 0.1, [out, 0.2, 0.35], 'z', 12),
          cyl(0.009, 0.15, [out, 0.2, 0.47], 'z', 8),
          box(0.04, 0.04, 0.02, [out, 0.2, 0.53]),
          cyl(0.005, 0.02, [out, 0.226, 0.33], 'y', 6),
          // cross-members into the tub
          box(0.07, 0.07, 0.09, [sx * 0.222, 0.2, 0.34]),
          box(0.07, 0.07, 0.09, [sx * 0.222, 0.2, -0.34]),
          // mud scrapers ahead of the sprocket and behind the idler
          box(0.16, 0.012, 0.03, [x, 0.07, -0.5], [0.5, 0, 0]),
          box(0.16, 0.012, 0.03, [x, 0.07, 0.5], [-0.5, 0, 0]),
        ];
        return merge(parts);
      }),
    [],
  );
  const springGeo = useMemo(() => {
    const g = new THREE.TubeGeometry(new HelixCurve(0.022, 0.016, 0.12), 140, 0.0045, 5, false);
    g.rotateX(Math.PI / 2);
    return g;
  }, []);
  const beltG = useMemo(() => beltGeo(loop, TRACK.belt, BELT_W), [loop]);
  const carrierY = loop.topY(0) - TRACK.carrierR;
  const towEye = useMemo(() => torus(0.03, 0.009, [0, 0.155, 0.79], 'x', Math.PI * 2, 16), []);
  const hvCable = useMemo(
    () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.05, 0.3, 0.36), new THREE.Vector3(0.09, 0.33, 0.46), new THREE.Vector3(0.07, 0.34, 0.56), new THREE.Vector3(0.02, 0.36, 0.66)]), 24, 0.009, 6),
    [],
  );

  // ---- lugs: one instanced mesh for both belts ----
  const lugGeo = useMemo(() => chevronLug(BELT_W / 2 - 0.006, 0.026, 0.02, TRACK.lug), []);
  const nLug = Math.floor(loop.length / TRACK.lugPitch);
  const pitch = loop.length / nLug;
  const lugs = useRef<THREE.InstancedMesh>(null);
  const lastOdo = useRef<[number, number]>([NaN, NaN]);
  const tmp = useMemo(() => ({ s: { z: 0, y: 0, nz: 0, ny: 0 } as BeltSample, m: new THREE.Matrix4(), X: new THREE.Vector3(1, 0, 0), N: new THREE.Vector3(), T: new THREE.Vector3() }), []);

  const sprockets = useRef<(THREE.Group | null)[]>([]);
  const idlers = useRef<(THREE.Group | null)[]>([]);
  const rollers = useRef<(THREE.Mesh | null)[]>([]);
  const carriers = useRef<(THREE.Mesh | null)[]>([]);

  // ---- chassis tub + battery bay (x-ray) ----
  const tubMat = useMemo(() => {
    const m = own(K.m.body);
    m.transparent = true;
    return m;
  }, [K]);
  const battery = useRef<THREE.Group>(null);
  const heaterMat = useMemo(() => own(K.m.orange), [K]);
  const batteryGeo = useMemo(() => {
    const cells: THREE.BufferGeometry[] = [];
    const posts: THREE.BufferGeometry[] = [];
    const bars: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 8; k++) {
        const z = -0.3 + k * 0.074;
        cells.push(box(0.165, 0.19, 0.066, [sx * 0.088, 0.245, z]));
        posts.push(cyl(0.01, 0.014, [sx * 0.088 - 0.05, 0.347, z], 'y', 8), cyl(0.01, 0.014, [sx * 0.088 + 0.05, 0.347, z], 'y', 8));
        if (k < 7) bars.push(box(0.024, 0.006, 0.09, [sx * 0.088 + (k % 2 ? 0.05 : -0.05), 0.356, z + 0.037]));
      }
    }
    return { cells: merge(cells), posts: merge(posts), bars: merge(bars) };
  }, []);

  // ---- lamps and SOC bar ----
  const headMat = useMemo(() => own(K.m.lens), [K]);
  const tailMat = useMemo(() => own(K.m.tail), [K]);
  const soc = useRef<THREE.InstancedMesh>(null);
  const socColor = useMemo(() => new THREE.Color(), []);

  const chassisGeo = useMemo(
    () =>
      merge([
        // front bumper and struts
        cyl(0.018, 0.34, [0, 0.21, 0.8], 'x', 12),
        cyl(0.014, 0.08, [-0.12, 0.21, 0.765], 'z', 10),
        cyl(0.014, 0.08, [0.12, 0.21, 0.765], 'z', 10),
        sphere(0.019, [-0.17, 0.21, 0.8], 10),
        sphere(0.019, [0.17, 0.21, 0.8], 10),
        // rear hitch tongue
        box(0.07, 0.03, 0.09, [0, 0.15, -0.78]),
        // lamp housings
        box(0.08, 0.05, 0.03, [-0.11, 0.3, 0.748]),
        box(0.08, 0.05, 0.03, [0.11, 0.3, 0.748]),
        box(0.06, 0.04, 0.025, [-0.14, 0.31, -0.748]),
        box(0.06, 0.04, 0.025, [0.14, 0.31, -0.748]),
        // rear service panel (SOC bar, charge port surround)
        box(0.13, 0.042, 0.006, [0, 0.255, -0.741]),
        box(0.07, 0.07, 0.008, [0, 0.18, -0.741]),
      ]),
    [],
  );

  useFrame(() => {
    const st = useSim.getState();
    const s = st.snap;
    const mo = motion.current;
    if (!s || !mo) return;
    // Running gear: every wheel turns with its belt.
    SIDES.forEach((_, i) => {
      const odo = mo.odo[i];
      const sp = sprockets.current[i];
      if (sp) sp.rotation.x = odo / TRACK.sprocket.r;
      const id = idlers.current[i];
      if (id) id.rotation.x = odo / TRACK.idler.r;
      for (let k = 0; k < TRACK.rollers.length; k++) {
        const r = rollers.current[i * TRACK.rollers.length + k];
        if (r) r.rotation.x = odo / TRACK.rollerR;
      }
      const c = carriers.current[i];
      if (c) c.rotation.x = odo / TRACK.carrierR;
    });
    const L = lugs.current;
    if (L && (mo.odo[0] !== lastOdo.current[0] || mo.odo[1] !== lastOdo.current[1])) {
      lastOdo.current = [mo.odo[0], mo.odo[1]];
      const { s: o, m, X, N, T } = tmp;
      SIDES.forEach((sx, i) => {
        for (let k = 0; k < nLug; k++) {
          loop.sample(k * pitch - mo.odo[i], o);
          N.set(0, o.ny, o.nz);
          T.crossVectors(X, N);
          m.makeBasis(X, N, T);
          m.setPosition(sx * TRACK.x, o.y + o.ny * TRACK.belt, o.z + o.nz * TRACK.belt);
          L.setMatrixAt(i * nLug + k, m);
        }
      });
      L.instanceMatrix.needsUpdate = true;
    }
    // X-ray: see-through tub with the cells inside.
    const xray = st.view.xray;
    tubMat.opacity = xray ? 0.16 : 1;
    tubMat.depthWrite = !xray;
    if (battery.current) battery.current.visible = xray;
    heaterMat.emissive.set(s.thermal.heaterActive ? '#ff6a1a' : '#000000');
    heaterMat.emissiveIntensity = s.thermal.heaterActive ? 1.4 + Math.sin(performance.now() / 300) * 0.3 : 0;
    // Travel lamps on while driving.
    headMat.emissiveIntensity = s.vehicle.moving ? 2.6 : 0.35;
    tailMat.emissiveIntensity = s.vehicle.moving ? 1.6 : 0.35;
    // Battery state-of-charge bar (5 segments).
    if (soc.current) {
      const lit = Math.ceil(Math.max(0, Math.min(1, s.power.soc)) * 5 - 1e-6);
      for (let k = 0; k < 5; k++) {
        socColor.set(k >= lit ? '#1c2a20' : s.power.soc < 0.2 ? '#ff4b3e' : '#37d08f');
        soc.current.setColorAt(k, socColor);
      }
      if (soc.current.instanceColor) soc.current.instanceColor.needsUpdate = true;
    }
  });

  const socMatrices = useMemo(() => Array.from({ length: 5 }, (_, k) => new THREE.Matrix4().makeTranslation(-0.044 + k * 0.022, 0.255, -0.746)), []);

  return (
    <group>
      {SIDES.map((sx, i) => (
        <group key={sx}>
          <mesh geometry={beltG} material={K.m.rubber} position={[sx * TRACK.x, 0, 0]} castShadow receiveShadow />
          <mesh geometry={frameGeo[i]} material={K.m.frame} />
          <mesh geometry={springGeo} material={K.m.zinc} position={[sx * (TRACK.x + 0.058), 0.2, 0.405]} />
          {/* drive: hub motor on the inner side, sprocket on the belt line */}
          <mesh position={[sx * (TRACK.x - 0.07), SPROCKET_Y, TRACK.sprocket.z]} rotation={[0, 0, Math.PI / 2]} material={K.m.wheelDark} castShadow>
            <cylinderGeometry args={[0.092, 0.092, 0.06, 28]} />
          </mesh>
          <group ref={(g) => (sprockets.current[i] = g)} position={[sx * TRACK.x, SPROCKET_Y, TRACK.sprocket.z]}>
            <mesh geometry={geo.sprocket} material={K.m.wheel} />
            <mesh geometry={geo.sprocketHub} material={K.m.zinc} rotation={[0, sx > 0 ? 0 : Math.PI, 0]} />
          </group>
          {/* sprung front idler */}
          <group ref={(g) => (idlers.current[i] = g)} position={[sx * TRACK.x, IDLER_Y, TRACK.idler.z]}>
            <mesh geometry={geo.idlerRims} material={K.m.wheel} />
            <mesh geometry={geo.idlerFace} material={K.m.wheelDark} position={[0.063, 0, 0]} />
            <mesh geometry={geo.idlerFace} material={K.m.wheelDark} position={[-0.063, 0, 0]} />
          </group>
          {TRACK.rollers.map((z, k) => (
            <mesh
              key={z}
              ref={(m) => (rollers.current[i * TRACK.rollers.length + k] = m)}
              geometry={geo.roller}
              material={K.m.wheel}
              position={[sx * TRACK.x, TRACK.lug + TRACK.belt + TRACK.rollerR, z]}
            />
          ))}
          <mesh ref={(m) => (carriers.current[i] = m)} geometry={geo.carrier} material={K.m.wheel} position={[sx * TRACK.x, carrierY, 0]} />
        </group>
      ))}
      <instancedMesh ref={lugs} args={[lugGeo, K.m.rubber, nLug * 2]} castShadow frustumCulled={false} />

      {/* chassis tub (battery bay) */}
      <RoundedBox args={[TUB.w, TUB.y1 - TUB.y0, TUB.l]} radius={0.03} smoothness={3} position={[0, (TUB.y0 + TUB.y1) / 2, 0]} material={tubMat} castShadow />
      <mesh geometry={chassisGeo} material={K.m.frame} />
      <mesh geometry={towEye} material={K.m.red} />
      {/* lamps */}
      {[-0.11, 0.11].map((x) => (
        <mesh key={x} position={[x, 0.3, 0.764]} material={headMat}>
          <planeGeometry args={[0.066, 0.036]} />
        </mesh>
      ))}
      {[-0.14, 0.14].map((x) => (
        <mesh key={x} position={[x, 0.31, -0.761]} rotation={[0, Math.PI, 0]} material={tailMat}>
          <planeGeometry args={[0.05, 0.03]} />
        </mesh>
      ))}
      {[-0.172, 0.172].map((x) => (
        <mesh key={x} position={[x, 0.2, -0.745]} material={K.m.reflector}>
          <boxGeometry args={[0.03, 0.05, 0.006]} />
        </mesh>
      ))}
      {/* rear service panel: SOC bar, charge port, isolator, ⚡ label */}
      <instancedMesh
        ref={soc}
        args={[undefined, undefined, 5]}
        onUpdate={(im) => {
          socMatrices.forEach((m, k) => {
            im.setMatrixAt(k, m);
            im.setColorAt(k, new THREE.Color('#1c2a20'));
          });
          im.instanceMatrix.needsUpdate = true;
        }}
      >
        <boxGeometry args={[0.017, 0.016, 0.004]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh position={[0, 0.18, -0.755]} rotation={[Math.PI / 2, 0, 0]} material={K.m.black}>
        <cylinderGeometry args={[0.022, 0.022, 0.024, 18]} />
      </mesh>
      <mesh position={[0.005, 0.18, -0.769]} rotation={[Math.PI / 2, 0, 0]} material={K.m.red}>
        <cylinderGeometry args={[0.024, 0.024, 0.006, 18]} />
      </mesh>
      <mesh position={[0.1, 0.18, -0.748]} rotation={[0, 0, 0.6]} material={K.m.red}>
        <boxGeometry args={[0.012, 0.045, 0.012]} />
      </mesh>
      <mesh position={[-0.105, 0.19, -0.746]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.055, 0.055]} />
        <meshStandardMaterial map={K.tex.volt} transparent alphaTest={0.4} roughness={0.6} />
      </mesh>

      {/* battery bay contents, x-ray only: 16 × 200 Ah prismatic cells (48 V), busbars, heater mat, BMS, contactor */}
      <group ref={battery} visible={false}>
        <mesh geometry={batteryGeo.cells} material={K.m.cell} />
        <mesh geometry={batteryGeo.posts} material={K.m.zinc} />
        <mesh geometry={batteryGeo.bars} material={K.m.copper} />
        <mesh position={[0, 0.142, -0.04]} material={heaterMat}>
          <boxGeometry args={[0.34, 0.008, 0.6]} />
        </mesh>
        <mesh position={[0, 0.24, 0.42]} material={K.m.black}>
          <boxGeometry args={[0.22, 0.12, 0.13]} />
        </mesh>
        <mesh position={[0.07, 0.31, 0.56]} material={K.m.red}>
          <boxGeometry args={[0.08, 0.06, 0.08]} />
        </mesh>
        <mesh geometry={hvCable} material={K.m.hvCable} />
      </group>
    </group>
  );
}
