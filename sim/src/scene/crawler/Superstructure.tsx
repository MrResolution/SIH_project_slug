import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { useSim } from '../../store/simStore';
import { helixTube } from '../geom';
import { box, boltRing, cyl, holedDisc, kit, merge, own, pipe, sphere, torus } from './kit';
import { DECK, HOSE_EXIT, HOSE_R, HOSE_RUN_X, REEL, ROOF, TRACK } from './layout';
import type { CrawlerMotion } from './motion';

/**
 * Everything above the skid line except the booster: the 150 m hose reel
 * (swivel, rewind gear-motor, coil that shrinks as hose pays out), the
 * on-board hose run over the roof rollers to the rear fairlead, the roof
 * frame with the stowed probe lance and davit tripod, work lamps, travel
 * beacon, GNSS puck and the interlock LED ring, the four outriggers with
 * levelling pads and LS-01..04 lamps, track chocks, and the rear-deck PPE
 * locker and decon sprayer.
 */

const ROLLER_R = 0.02;
const ROLLER_Y = ROOF.y + ROOF.r + ROLLER_R;
const HOSE_TOP = ROLLER_Y + ROLLER_R + HOSE_R;
const OUTRIGGER = { x: 0.33, y: 0.405, z: 0.935, arm: 0.432, swing: THREE.MathUtils.degToRad(143) };

function labelTex(text: string, fg: string, bg: string) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = fg;
  g.font = '800 30px "Inter Variable", Inter, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * On-board hose, taut: off the top of the coil, up over the front roller,
 * along the roof rollers, and down through the rear fairlead to HOSE_EXIT.
 */
function hoseRun(rCoil: number) {
  const top = REEL.y + rCoil - HOSE_R * 0.5;
  return pipe(
    [
      [HOSE_RUN_X, top, REEL.z],
      [HOSE_RUN_X, top, REEL.z - 0.17],
      [HOSE_RUN_X, HOSE_TOP + 0.012, ROOF.zF],
      [HOSE_RUN_X, HOSE_TOP + 0.008, ROOF.zR],
      [HOSE_EXIT.x, HOSE_EXIT.y, HOSE_EXIT.z],
    ],
    HOSE_R,
    0.11,
    10,
  );
}

export function Superstructure({ motion }: { motion: React.RefObject<CrawlerMotion> }) {
  const K = kit();

  // ---------------- reel ----------------
  const reel = useRef<THREE.Group>(null);
  const coil = useRef<THREE.Mesh>(null);
  const hose = useRef<THREE.Mesh>(null);
  const lastR = useRef(-1);
  const coilMats = useMemo(() => {
    const cap = new THREE.MeshStandardMaterial({ color: '#1d3550', roughness: 0.8 });
    return [new THREE.MeshStandardMaterial({ map: K.tex.coil, roughness: 0.7 }), cap, cap];
  }, [K]);
  const reelGeo = useMemo(() => {
    const flange = holedDisc(REEL.R, 0.012, 6, 0.2, 0.052, 0.03);
    const flanges = merge([
      flange.clone().translate(REEL.halfW, 0, 0),
      flange.translate(-REEL.halfW, 0, 0),
      torus(REEL.R, 0.007, [REEL.halfW, 0, 0], 'x', Math.PI * 2, 40),
      torus(REEL.R, 0.007, [-REEL.halfW, 0, 0], 'x', Math.PI * 2, 40),
    ]);
    const drum = merge([cyl(REEL.hub, REEL.halfW * 2, [0, 0, 0], 'x', 28), cyl(0.025, 0.68, [0, 0, 0], 'x', 12), ...boltRing(6, 0.07, [REEL.halfW + 0.008, 0, 0], 'x'), ...boltRing(6, 0.07, [-REEL.halfW - 0.008, 0, 0], 'x')]);
    const coilG = new THREE.CylinderGeometry(1, 1, REEL.halfW * 2 - 0.012, 48, 1, false).rotateZ(Math.PI / 2);
    // A-frame stands, bearing blocks, base plates
    const legL = Math.hypot(0.16, REEL.y - DECK.y1);
    const legA = Math.atan2(0.16, REEL.y - DECK.y1);
    const stand = (sx: number) => [
      box(0.02, legL, 0.04, [sx * 0.265, (REEL.y + DECK.y1) / 2, REEL.z - 0.08], [legA, 0, 0]),
      box(0.02, legL, 0.04, [sx * 0.265, (REEL.y + DECK.y1) / 2, REEL.z + 0.08], [-legA, 0, 0]),
      box(0.04, 0.01, 0.38, [sx * 0.265, DECK.y1 + 0.005, REEL.z]),
      box(0.032, 0.07, 0.07, [sx * 0.265, REEL.y, REEL.z]),
      box(0.02, 0.02, 0.3, [sx * 0.265, 0.56, REEL.z]),
    ];
    const stands = merge([...stand(-1), ...stand(1)]);
    // swivel joint (+x) and rewind gear-motor (−x)
    const swivel = merge([cyl(0.03, 0.06, [0.31, REEL.y, REEL.z], 'x', 16), cyl(0.03, 0.04, [0.31, REEL.y + 0.03, REEL.z], 'y', 16), cyl(0.036, 0.012, [0.288, REEL.y, REEL.z], 'x', 16)]);
    const rewind = merge([box(0.06, 0.09, 0.09, [-0.31, REEL.y, REEL.z]), cyl(0.038, 0.13, [-0.31, REEL.y, REEL.z + 0.11], 'z', 18), cyl(0.04, 0.01, [-0.31, REEL.y, REEL.z + 0.18], 'z', 18)]);
    return { flanges, drum, coilG, stands, swivel, rewind };
  }, []);

  // ---------------- roof frame ----------------
  const roofGeo = useMemo(() => {
    const hoop = (z: number) =>
      pipe(
        [
          [-ROOF.x, DECK.y1, z],
          [-ROOF.x, ROOF.y, z],
          [ROOF.x, ROOF.y, z],
          [ROOF.x, DECK.y1, z],
        ],
        ROOF.r,
        0.07,
        10,
      );
    const yellow = merge([
      hoop(ROOF.zF),
      hoop(ROOF.zR),
      cyl(ROOF.r, ROOF.zF - ROOF.zR, [-0.334, ROOF.y - 0.004, (ROOF.zF + ROOF.zR) / 2], 'z', 10),
      cyl(ROOF.r, ROOF.zF - ROOF.zR, [0.334, ROOF.y - 0.004, (ROOF.zF + ROOF.zR) / 2], 'z', 10),
      cyl(ROOF.r * 0.85, 0.668, [0, ROOF.y, ROOF.zM], 'x', 10),
    ]);
    const zinc = merge([
      ...[ROOF.zF, ROOF.zR].flatMap((z) => [box(0.05, 0.008, 0.05, [-ROOF.x, DECK.y1 + 0.004, z]), box(0.05, 0.008, 0.05, [ROOF.x, DECK.y1 + 0.004, z])]),
      ...[ROOF.zF, ROOF.zR].flatMap((z) => [torus(0.018, 0.005, [-0.33, ROOF.y + 0.035, z], 'x', Math.PI * 2, 14), torus(0.018, 0.005, [0.33, ROOF.y + 0.035, z], 'x', Math.PI * 2, 14)]),
      // hose roller brackets and guide pins
      ...[ROOF.zF, ROOF.zM, ROOF.zR].flatMap((z) => [
        box(0.008, 0.04, 0.03, [HOSE_RUN_X - 0.066, ROLLER_Y - 0.005, z]),
        box(0.008, 0.04, 0.03, [HOSE_RUN_X + 0.066, ROLLER_Y - 0.005, z]),
        cyl(0.006, 0.1, [HOSE_RUN_X - 0.07, ROLLER_Y + 0.05, z], 'y', 8),
        cyl(0.006, 0.1, [HOSE_RUN_X + 0.07, ROLLER_Y + 0.05, z], 'y', 8),
      ]),
      // rear fairlead ring on an arm from the hoop
      box(0.11, 0.014, 0.014, [0.3, HOSE_EXIT.y + 0.06, ROOF.zR]),
      box(0.014, 0.014, 0.03, [0.25, HOSE_EXIT.y + 0.06, ROOF.zR - 0.015]),
      // lamp brackets
      box(0.03, 0.016, 0.016, [-0.348, 1.05, ROOF.zF + 0.016]),
      box(0.03, 0.016, 0.016, [0.348, 1.05, ROOF.zF + 0.016]),
      // LED-ring mast, GNSS bracket, beacon base
      cyl(0.01, 0.18, [0.04, ROOF.y + 0.09, ROOF.zF], 'y', 8),
      box(0.05, 0.008, 0.05, [0.07, ROOF.y + ROOF.r + 0.004, ROOF.zR]),
    ]);
    const fair = torus(0.065, 0.009, [0, 0, 0], 'z', Math.PI * 2, 20);
    const roller = new THREE.CylinderGeometry(ROLLER_R, ROLLER_R, 0.12, 14).rotateZ(Math.PI / 2);
    return { yellow, zinc, fair, roller };
  }, []);
  const rollers = useRef<(THREE.Mesh | null)[]>([]);
  const fairQ = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.03, -0.9, -0.35).normalize()), []);

  // ---------------- lights, beacon, LED ring ----------------
  const work = useMemo(() => own(K.m.lens), [K]);
  const beacon = useMemo(() => own(K.m.amber), [K]);
  const spinner = useRef<THREE.Mesh>(null);
  const led = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ff5a5f', emissive: '#ff5a5f', emissiveIntensity: 1.1, toneMapped: false }), []);
  const ledLight = useRef<THREE.PointLight>(null);

  // ---------------- stowed lance + tripod ----------------
  const stowed = useRef<THREE.Group>(null);
  const stowGeo = useMemo(() => {
    const y = ROOF.y + ROOF.r + 0.038;
    const lance = merge([cyl(0.038, 1.5, [-0.29, y, 0.03], 'z', 14), cyl(0.038, 1.5, [-0.21, y, 0.03], 'z', 14), cyl(0.06, 0.04, [-0.29, y, 0.8], 'z', 16)]);
    const augerHead = merge([cyl(0.055, 0.16, [-0.21, y, -0.8], 'z', 18), cyl(0.04, 0.12, [-0.21, y + 0.07, -0.75], 'y', 12)]);
    const screen = cyl(0.044, 0.25, [-0.29, y, 0.65], 'z', 14);
    const auger = helixTube(0.036, 0.09, 0.22, 0.009, 3).rotateX(Math.PI / 2).translate(-0.29, y, 0.54);
    const ly = ROOF.y + ROOF.r + 0.022;
    const legs = merge([
      cyl(0.022, 1.6, [-0.13, ly, -0.02], 'z', 10),
      cyl(0.022, 1.6, [-0.085, ly, -0.02], 'z', 10),
      cyl(0.022, 1.6, [-0.1075, ly + 0.039, -0.02], 'z', 10),
      box(0.1, 0.07, 0.07, [-0.1075, ly + 0.02, -0.85]),
    ]);
    const winch = merge([cyl(0.028, 0.04, [-0.045, ly + 0.02, -0.8], 'x', 14), box(0.008, 0.06, 0.008, [-0.022, ly + 0.04, -0.8]), cyl(0.006, 0.03, [-0.012, ly + 0.07, -0.8], 'x', 6)]);
    const straps = merge(
      [ROOF.zF, ROOF.zM, ROOF.zR].flatMap((z) => [box(0.3, 0.008, 0.03, [-0.19, ROOF.y + 0.11, z + 0.03]), box(0.008, 0.1, 0.03, [-0.338, ROOF.y + 0.06, z + 0.03]), box(0.008, 0.1, 0.03, [-0.042, ROOF.y + 0.06, z + 0.03])]),
    );
    return { lance, augerHead, screen, auger, legs, winch, straps };
  }, []);

  // ---------------- outriggers + chocks ----------------
  const arms = useRef<(THREE.Group | null)[]>([]);
  const pads = useRef<(THREE.Group | null)[]>([]);
  const lsMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#173022', emissive: '#37d08f', emissiveIntensity: 0, toneMapped: false }), []);  const armMat = useMemo(() => {
    const t = K.tex.hazard.clone();
    t.repeat.set(1, 5);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.15 });
  }, [K]);
  const outriggerGeo = useMemo(() => {
    const bracket = merge([box(0.07, 0.07, 0.03, [0, 0, 0]), cyl(0.012, 0.06, [0, 0, 0], 'z', 10)]);
    // Jack along +y from the arm tip; the pad's ground face is at y = 0.06 (ribs on the jack side).
    const pad = merge([cyl(0.016, 0.05, [0, 0.025, 0], 'y', 10), cyl(0.065, 0.02, [0, 0.05, 0], 'y', 22), box(0.11, 0.006, 0.012, [0, 0.037, 0]), box(0.012, 0.006, 0.11, [0, 0.037, 0])]);
    const handle = merge([cyl(0.004, 0.05, [0, 0.02, 0], 'x', 6)]);
    return { bracket, pad, handle };
  }, []);
  const chockGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(-0.16, 0);
    s.lineTo(-0.16, 0.1);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.13, bevelEnabled: false });
    g.rotateY(-Math.PI / 2); // shape (z, y), extrusion → −x
    g.translate(0.065, 0, 0);
    return merge([g, torus(0.025, 0.005, [0, 0.1, -0.16], 'x', Math.PI, 12)]);
  }, []);
  const chocks = useRef<THREE.Group>(null);

  // ---------------- rear deck ----------------
  const ppeLabel = useMemo(() => labelTex('PPE ×3', '#ffffff', '#2f6aa8'), []);
  const deconLabel = useMemo(() => labelTex('DECON', '#1b4d2b', '#e9eef2'), []);
  const sprayerGeo = useMemo(
    () =>
      merge([
        cyl(0.008, 0.12, [-0.02, 0.8, -0.8], 'y', 8),
        cyl(0.008, 0.09, [-0.02, 0.86, -0.8], 'x', 8),
        cyl(0.004, 0.3, [0.065, 0.6, -0.8], 'y', 6),
        cyl(0.006, 0.05, [0.065, 0.76, -0.8], 'y', 6),
        sphere(0.01, [0.065, 0.785, -0.8]),
      ]),
    [],
  );
  // Label wrapped on the sprayer's rear face (θ = π points to −z).
  const deconLabelGeo = useMemo(() => new THREE.CylinderGeometry(0.0815, 0.0815, 0.05, 16, 1, true, Math.PI - 0.5, 1.0), []);

  useEffect(() => {
    // Hose geometry is rebuilt as the coil shrinks; dispose the last one on unmount.
    const h = hose.current;
    return () => h?.geometry.dispose();
  }, []);

  useFrame((_, dt) => {
    const st = useSim.getState();
    const s = st.snap;
    const mo = motion.current;
    if (!s || !mo) return;
    const v = s.vehicle;

    // Reel drum turns with the hose paid out; coil radius follows the wound area.
    if (reel.current) reel.current.rotation.x = -mo.reelAngle;
    coil.current?.scale.set(1, mo.rCoil, mo.rCoil);
    if (hose.current && Math.abs(mo.rCoil - lastR.current) > 0.004) {
      lastR.current = mo.rCoil;
      hose.current.geometry.dispose();
      hose.current.geometry = hoseRun(mo.rCoil);
    }
    rollers.current.forEach((r) => r && (r.rotation.x = -mo.paid / ROLLER_R));

    // Outriggers: arm swings 143° down and out; the pad swivels to land flat.
    const d = v.outriggers;
    arms.current.forEach((a, i) => {
      if (!a) return;
      const side = i % 2 === 0 ? -1 : 1;
      a.rotation.z = -side * OUTRIGGER.swing * d;
      const p = pads.current[i];
      if (p) p.rotation.z = -side * (Math.PI - OUTRIGGER.swing) * d;
    });
    lsMat.emissiveIntensity = d > 0.98 ? 1.1 : 0;
    if (chocks.current) chocks.current.visible = v.chocks > 0.5;
    if (stowed.current) stowed.current.visible = s.equip.tripod <= 0.001;

    // Interlock LED ring: red K1 open · amber K1 only · green K2; flashes on alarm or E-stop.
    const col = s.job.estop ? '#ff3b3b' : s.job.k2 ? '#37d08f' : s.job.k1 ? '#f3b343' : '#ff5a5f';
    led.color.set(col);
    led.emissive.set(col);
    const alert = s.alarms.length > 0 || s.job.estop;
    led.emissiveIntensity = 1.1 + (alert ? Math.sin(performance.now() / 120) * 0.6 : 0);
    ledLight.current?.color.set(col);

    // Travel beacon rotates while moving; work lamps on in travel and at the pit.
    const t = performance.now() / 1000;
    if (spinner.current && v.moving) spinner.current.rotation.y += dt * 9;
    beacon.emissiveIntensity = v.moving ? 1.2 + Math.max(0, Math.sin(t * 9)) * 2.2 : 0.15;
    work.emissiveIntensity = v.moving ? 2.8 : v.atPit ? 1.8 : 0.35;
  });

  const ly = ROOF.y + ROOF.r + 0.022;
  return (
    <group>
      {/* ================= hose reel ================= */}
      <group ref={reel} position={[0, REEL.y, REEL.z]}>
        <mesh geometry={reelGeo.flanges} material={K.m.red} castShadow />
        <mesh geometry={reelGeo.drum} material={K.m.zinc} />
        <mesh ref={coil} geometry={reelGeo.coilG} material={coilMats} castShadow />
      </group>
      <mesh geometry={reelGeo.stands} material={K.m.frame} />
      <mesh geometry={reelGeo.swivel} material={K.m.steel} />
      <mesh geometry={reelGeo.rewind} material={K.m.motor} />
      <mesh ref={hose} material={K.m.hose} castShadow>
        <bufferGeometry />
      </mesh>

      {/* ================= roof frame ================= */}
      <mesh geometry={roofGeo.yellow} material={K.m.yellow} castShadow />
      <mesh geometry={roofGeo.zinc} material={K.m.zinc} />
      {[ROOF.zF, ROOF.zM, ROOF.zR].map((z, i) => (
        <mesh key={z} ref={(m) => (rollers.current[i] = m)} position={[HOSE_RUN_X, ROLLER_Y, z]} geometry={roofGeo.roller} material={K.m.black} />
      ))}
      <mesh geometry={roofGeo.fair} material={K.m.zinc} position={[HOSE_EXIT.x, HOSE_EXIT.y + 0.05, HOSE_EXIT.z]} quaternion={fairQ} />
      {/* work lamps (forward, beside the reel) */}
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * 0.318, 1.05, ROOF.zF + 0.035]}>
          <RoundedBox args={[0.068, 0.05, 0.04]} radius={0.008} smoothness={2} material={K.m.black} />
          <mesh position={[0, 0, 0.0205]} material={work}>
            <planeGeometry args={[0.056, 0.038]} />
          </mesh>
        </group>
      ))}
      {/* travel beacon */}
      <group position={[-0.01, ROOF.y + ROOF.r, ROOF.zR]}>
        <mesh position={[0, 0.01, 0]} material={K.m.black}>
          <cylinderGeometry args={[0.032, 0.034, 0.02, 18]} />
        </mesh>
        <mesh position={[0, 0.02, 0]} material={beacon} scale={[1, 1.35, 1]}>
          <sphereGeometry args={[0.028, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <mesh ref={spinner} position={[0, 0.034, 0]} material={K.m.steel}>
          <boxGeometry args={[0.03, 0.012, 0.004]} />
        </mesh>
      </group>
      {/* GNSS puck */}
      <mesh position={[0.07, ROOF.y + ROOF.r + 0.019, ROOF.zR]} material={K.m.enclosure}>
        <cylinderGeometry args={[0.026, 0.03, 0.022, 20]} />
      </mesh>
      {/* interlock LED ring on its mast */}
      <mesh position={[0.04, ROOF.y + 0.18, ROOF.zF]} rotation={[Math.PI / 2, 0, 0]} material={led}>
        <torusGeometry args={[0.07, 0.022, 10, 28]} />
      </mesh>
      <mesh position={[0.04, ROOF.y + 0.18, ROOF.zF]} material={K.m.black}>
        <cylinderGeometry args={[0.05, 0.05, 0.03, 18]} />
      </mesh>
      <pointLight ref={ledLight} position={[0.04, ROOF.y + 0.18, ROOF.zF]} intensity={0.6} distance={3} color="#ff5a5f" />

      {/* ================= stowed lance + davit tripod ================= */}
      <group ref={stowed}>
        <mesh geometry={stowGeo.lance} material={K.m.steel} castShadow />
        <mesh geometry={stowGeo.augerHead} material={K.m.wheelDark} />
        <mesh geometry={stowGeo.screen}>
          <meshStandardMaterial color="#3d434a" metalness={0.6} roughness={0.5} wireframe />
        </mesh>
        <mesh geometry={stowGeo.auger} material={K.m.yellow} />
        <mesh geometry={stowGeo.legs} material={K.m.yellow} castShadow />
        <mesh geometry={stowGeo.winch} material={K.m.red} />
        <mesh geometry={stowGeo.straps} material={K.m.orange} />
        {[-0.13, -0.085, -0.1075].map((x, i) => (
          <mesh key={x} position={[x, ly + (i === 2 ? 0.039 : 0), 0.79]} material={K.m.black}>
            <boxGeometry args={[0.05, 0.03, 0.03]} />
          </mesh>
        ))}
      </group>

      {/* ================= outriggers (MOB-04) ================= */}
      {[
        [-1, 1],
        [1, 1],
        [-1, -1],
        [1, -1],
      ].map(([sx, sz], i) => (
        <group key={i} position={[sx * OUTRIGGER.x, OUTRIGGER.y, sz * OUTRIGGER.z]}>
          <mesh geometry={outriggerGeo.bracket} material={K.m.frame} position={[0, 0, -sz * 0.012]} />
          {/* LS limit switch + lamp */}
          <mesh position={[-sx * 0.05, 0.02, -sz * 0.012]} material={K.m.black}>
            <boxGeometry args={[0.024, 0.03, 0.022]} />
          </mesh>
          <mesh position={[-sx * 0.05, 0.039, -sz * 0.012]} material={lsMat}>
            <sphereGeometry args={[0.006, 8, 6]} />
          </mesh>
          <group ref={(g) => (arms.current[i] = g)}>
            <mesh position={[0, OUTRIGGER.arm / 2, 0]} material={armMat} castShadow>
              <boxGeometry args={[0.045, OUTRIGGER.arm, 0.035]} />
            </mesh>
            <group ref={(g) => (pads.current[i] = g)} position={[0, OUTRIGGER.arm, 0]}>
              <mesh geometry={outriggerGeo.pad} material={K.m.black} castShadow />
              <mesh geometry={outriggerGeo.handle} material={K.m.zinc} position={[0, 0.005, 0]} />
            </group>
          </group>
        </group>
      ))}
      <group ref={chocks}>
        {[-1, 1].map((sx) => (
          <mesh key={sx} geometry={chockGeo} material={K.m.yellow} position={[sx * TRACK.x, 0, -0.75]} castShadow />
        ))}
      </group>

      {/* ================= rear deck: PPE locker, decon sprayer ================= */}
      <RoundedBox args={[0.24, 0.22, 0.18]} radius={0.01} smoothness={2} position={[-0.23, DECK.y1 + 0.11, -0.8]} material={K.m.blue} castShadow />
      <mesh position={[-0.23, DECK.y1 + 0.13, -0.8905]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.1, 0.05]} />
        <meshStandardMaterial map={ppeLabel} roughness={0.6} />
      </mesh>
      <mesh position={[-0.23, DECK.y1 + 0.06, -0.893]} material={K.m.black}>
        <boxGeometry args={[0.07, 0.014, 0.012]} />
      </mesh>
      <mesh position={[-0.02, 0.59, -0.8]} material={K.m.hdpe} castShadow>
        <cylinderGeometry args={[0.078, 0.082, 0.3, 22]} />
      </mesh>
      <mesh position={[-0.02, 0.745, -0.8]} material={K.m.hdpe} scale={[1, 0.35, 1]}>
        <sphereGeometry args={[0.078, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[-0.02, 0.62, -0.8]} geometry={deconLabelGeo}>
        <meshStandardMaterial map={deconLabel} roughness={0.6} />
      </mesh>
      <mesh geometry={sprayerGeo} material={K.m.black} />
    </group>
  );
}
