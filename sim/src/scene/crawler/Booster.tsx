import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import type { Snapshot } from '../../core/snapshot';
import { useSim } from '../../store/simStore';
import { tsColor } from '../../ui/colors';
import { HelixCurve } from '../geom';
import { box, boltRect, boltRing, cyl, kit, merge, own, pipe, sphere, torus, type V3 } from './kit';
import { ATTACH, CTRL, CUBE, GOOSENECK, PCP, REEL, RISER, SKID } from './layout';
import { Fan, Gauge, Grille } from './parts';

/**
 * Tier 2 booster skid on the 950 × 680 ISO frame:
 *  · PCP train — 5.5 kW motor (fan behind the cowl grille), inline gearbox,
 *    bearing lantern with ST-01, suction housing fed from the cube through a
 *    butterfly valve, tie-rodded Viton stator with heat bands and TT-01,
 *    discharge housing. X-ray shows the rotor's 1:2 hypocycloid motion, the
 *    cavities carrying sludge, and the coupling rod with its universal joints.
 *  · Discharge riser — V-01 jetting branch, PT-02 gauge, 20 bar PSV with the
 *    return line to the cube, check valve, run to the reel swivel.
 *  · 90 L surge cube — flanged lid, sight glass, inlet gooseneck with 3"
 *    cam-lock, float shut-off, LT-01, PT-01, V/P relief, lid-mounted vane pump.
 *  · Controller — IP66 cabinet with VFD heat-sink, sloped console with a live
 *    HMI, K1/K2 lamps and the E-stop, LTE antenna.
 */

type Station = readonly [number, number];
const mid = (s: Station) => (s[0] + s[1]) / 2;
const len = (s: Station) => s[1] - s[0];
const X = PCP.x;
const Y = PCP.y;
const STATOR_L = len(PCP.stator);
const STATOR_Z = mid(PCP.stator);

/** Unit quaternion that lays a plane on the console slope, text up-slope, readable from +x. */
const HMI_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)));
const SLOPE = Math.atan2(0.1, CTRL.w);

function qrTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#111';
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 21; i++) for (let j = 0; j < 21; j++) if (rnd() > 0.52) g.fillRect(4 + i * 2.7, 4 + j * 2.7, 2.7, 2.7);
  for (const [x, y] of [
    [4, 4],
    [41, 4],
    [4, 41],
  ]) {
    g.fillRect(x, y, 19, 19);
    g.fillStyle = '#fff';
    g.fillRect(x + 3, y + 3, 13, 13);
    g.fillStyle = '#111';
    g.fillRect(x + 6, y + 6, 7, 7);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

const STATE_LABEL: Record<string, string> = {
  PowerOff: 'POWER OFF',
  Idle: 'IDLE',
  CheckIn: 'CHECK-IN',
  Setup: 'SETUP',
  Ventilating: 'VENTILATING',
  GasHold: 'GAS HOLD',
  Armed: 'ARMED',
  Priming: 'PRIMING',
  Extracting: 'EXTRACTING',
  Jetting: 'JETTING',
  SeedLimit: 'SEED LIMIT',
  Purging: 'PURGING',
  Decon: 'DECON',
  CheckOut: 'CHECK-OUT',
  Fault: 'FAULT',
};

function drawHmi(g: CanvasRenderingContext2D, s: Snapshot) {
  const W = 256;
  const H = 160;
  g.fillStyle = '#06110c';
  g.fillRect(0, 0, W, H);
  const alarm = s.alarms.length > 0 || s.job.estop;
  g.fillStyle = alarm ? '#5a1414' : '#0f2a1c';
  g.fillRect(0, 0, W, 38);
  g.font = '700 24px "JetBrains Mono", ui-monospace, monospace';
  g.textBaseline = 'middle';
  g.fillStyle = alarm ? '#ff7a70' : '#5ff0a8';
  g.fillText(s.job.estop ? 'E-STOP' : STATE_LABEL[s.job.state] ?? s.job.state, 10, 20);
  // interlock chips
  const chip = (x: number, label: string, on: boolean, col: string) => {
    g.fillStyle = on ? col : '#1b2620';
    g.fillRect(x, 48, 54, 26);
    g.fillStyle = on ? '#06110c' : '#55665c';
    g.font = '700 17px "JetBrains Mono", ui-monospace, monospace';
    g.fillText(label, x + 12, 62);
  };
  chip(10, 'K1', s.job.k1, '#f3b343');
  chip(70, 'K2', s.job.k2, '#37d08f');
  g.fillStyle = '#9fd8b8';
  g.font = '600 16px "JetBrains Mono", ui-monospace, monospace';
  g.fillText(`${s.pcp.rpm.toFixed(0)} rpm`, 140, 62);
  g.fillText(`PD ${s.hose.pD_bar.toFixed(1)} bar`, 10, 94);
  g.fillText(`CUBE ${s.cube.level_L.toFixed(0)} L`, 140, 94);
  g.fillText(`H2S ${s.gas.sensed.h2s_ppm.toFixed(1)}`, 10, 122);
  g.fillText(`SOC ${(s.power.soc * 100).toFixed(0)}%`, 140, 122);
  // pressure bar (0–30 bar, relief at 20)
  g.fillStyle = '#1b2620';
  g.fillRect(10, 140, 236, 10);
  const f = Math.min(1, s.hose.pD_bar / 30);
  g.fillStyle = s.hose.pD_bar >= 20 ? '#ff5a5f' : '#38c6ff';
  g.fillRect(10, 140, 236 * f, 10);
  g.fillStyle = '#f3b343';
  g.fillRect(10 + 236 * (20 / 30), 136, 2, 18);
}

export function Booster() {
  const K = kit();

  // ---- animated / x-ray materials ----
  const mats = useMemo(() => {
    const t = (m: THREE.MeshStandardMaterial) => {
      const c = own(m);
      // Stay `transparent` from the start: toggling it needs a shader recompile.
      c.transparent = true;
      return c;
    };
    const cowl = own(K.m.motor);
    cowl.side = THREE.DoubleSide;
    return {
      stator: t(K.m.pump),
      housing: t(K.m.pump),
      cube: t(new THREE.MeshStandardMaterial({ color: '#b8c1ca', metalness: 0.7, roughness: 0.3 })),
      cubeFrame: t(new THREE.MeshStandardMaterial({ color: '#9aa4ae', metalness: 0.7, roughness: 0.35 })),
      heat: own(K.m.orange),
      psv: own(K.m.red),
      cowl,
      liquid: new THREE.MeshStandardMaterial({ color: '#8fb64a', roughness: 0.6 }),
      gaugeLiquid: new THREE.MeshStandardMaterial({ color: '#8fb64a', roughness: 0.4 }),
      k1: new THREE.MeshStandardMaterial({ color: '#3a2c10', emissive: '#f3b343', emissiveIntensity: 0, toneMapped: false }),
      k2: new THREE.MeshStandardMaterial({ color: '#10301f', emissive: '#37d08f', emissiveIntensity: 0, toneMapped: false }),
      fault: new THREE.MeshStandardMaterial({ color: '#3a1010', emissive: '#ff4b3e', emissiveIntensity: 0, toneMapped: false }),
    };
  }, [K]);

  const hmi = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 160;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return { c, g: c.getContext('2d')!, t, last: -1 };
  }, []);
  const qr = useMemo(() => qrTexture(), []);

  // ---- static geometry, baked per material ----
  const geo = useMemo(() => {
    const corners: [number, number][] = [
      [-SKID.x, SKID.z0],
      [SKID.x, SKID.z0],
      [-SKID.x, SKID.z1],
      [SKID.x, SKID.z1],
    ];
    const skidL = SKID.z1 - SKID.z0;
    const skidZ = (SKID.z0 + SKID.z1) / 2;
    const frame = merge([
      box(0.04, 0.05, skidL, [-SKID.x, 0.455, skidZ]),
      box(0.04, 0.05, skidL, [SKID.x, 0.455, skidZ]),
      ...[SKID.z0 + 0.02, -0.2, SKID.z1 - 0.02].map((z) => box(SKID.x * 2, 0.05, 0.04, [0, 0.455, z])),
      ...corners.map(([x, z]) => box(0.056, 0.056, 0.056, [x, 0.458, z])),
      // PCP base plate and pedestals
      box(0.2, 0.01, SKID.z1 - SKID.z0, [X, 0.485, skidZ]),
      box(0.1, 0.012, 0.08, [X, 0.495, mid(PCP.discharge)]),
      box(0.08, 0.03, 0.06, [X, 0.502, mid(PCP.bearing)]),
      box(0.12, 0.016, 0.05, [X, 0.498, STATOR_Z]),
      box(0.16, 0.052, 0.035, [X, 0.457, -0.7]),
      box(0.16, 0.052, 0.035, [X, 0.457, -0.82]),
      // vane-pump base on the cube lid, controller plinth
      box(0.15, 0.012, 0.31, [-0.21, 0.917, -0.47]),
      box(CTRL.w - 0.02, 0.01, CTRL.d - 0.02, [CTRL.x, 0.485, CTRL.z]),
      box(CUBE.w, 0.01, CUBE.d - 0.02, [CUBE.x, 0.485, CUBE.z]),
      // extinguisher bracket
      box(0.012, 0.03, 0.1, [0.362, 0.62, -0.6]),
      torus(0.044, 0.005, [0.318, 0.62, -0.6], 'y'),
    ]);
    const twist = merge(
      corners.flatMap(([x, z]) => [
        cyl(0.012, 0.03, [x, 0.494, z], 'y', 8),
        box(0.05, 0.008, 0.01, [x + Math.sign(x) * 0.03, 0.47, z], [0, 0, Math.sign(x) * 0.25]),
      ]),
    );

    // motor: body, cooling fins, end shields, terminal box
    const fins: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      if (Math.sin(a) > 0.8 || Math.sin(a) < -0.85) continue;
      fins.push(box(0.005, 0.016, 0.17, [X + Math.cos(a) * 0.094, Y + Math.sin(a) * 0.094, mid(PCP.motor) - 0.005], [0, 0, a - Math.PI / 2]));
    }
    const motor = merge([
      cyl(0.088, len(PCP.motor), [X, Y, mid(PCP.motor)], 'z', 28),
      ...fins,
      cyl(0.092, 0.02, [X, Y, PCP.motor[1] - 0.01], 'z', 28),
      cyl(0.092, 0.02, [X, Y, PCP.motor[0] + 0.01], 'z', 28),
      box(0.075, 0.05, 0.085, [X, Y + 0.113, -0.74]),
      box(0.082, 0.008, 0.092, [X, Y + 0.142, -0.74]),
      cyl(0.012, 0.02, [X - 0.046, Y + 0.113, -0.74], 'x', 10),
      cyl(0.06, 0.012, [X, Y, PCP.motor[0] + 0.006], 'z', 24),
    ]);
    // pump castings that go see-through in x-ray
    const housing = merge([
      cyl(0.085, len(PCP.suction), [X, Y, mid(PCP.suction)], 'z', 28),
      cyl(0.095, 0.014, [X, Y, PCP.suction[0] + 0.007], 'z', 28),
      cyl(0.095, 0.014, [X, Y, PCP.suction[1] - 0.007], 'z', 28),
      cyl(0.042, 0.06, [X - 0.105, Y, mid(PCP.suction)], 'x', 18),
      cyl(0.07, 0.012, [X - 0.13, Y, mid(PCP.suction)], 'x', 22),
      cyl(0.05, 0.012, [X, Y + 0.09, mid(PCP.suction)], 'y', 20),
      cyl(0.056, len(PCP.bearing), [X, Y, mid(PCP.bearing)], 'z', 24),
      cyl(0.075, len(PCP.discharge), [X, Y, mid(PCP.discharge)], 'z', 28),
      cyl(0.095, 0.014, [X, Y, PCP.discharge[0] + 0.007], 'z', 28),
      cyl(0.08, 0.016, [X, Y, PCP.discharge[1] + 0.006], 'z', 28),
      cyl(0.036, 0.05, [X, Y + 0.085, RISER.z], 'y', 16),
    ]);
    // tie rods, nuts, bolts, gland, drain plug, sensors' fittings
    const rods: THREE.BufferGeometry[] = [];
    for (const [dx, dy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const px = X + dx * 0.059;
      const py = Y + dy * 0.059;
      rods.push(cyl(0.0065, STATOR_L + 0.04, [px, py, STATOR_Z], 'z', 8));
      rods.push(cyl(0.011, 0.014, [px, py, PCP.stator[0] - 0.02], 'z', 6), cyl(0.011, 0.014, [px, py, PCP.stator[1] + 0.02], 'z', 6));
    }
    const zinc = merge([
      ...rods,
      ...boltRing(8, 0.083, [X, Y, PCP.suction[0] - 0.002], 'z'),
      ...boltRing(8, 0.083, [X, Y, PCP.discharge[1] + 0.016], 'z'),
      ...boltRing(6, 0.058, [X - 0.138, Y, mid(PCP.suction)], 'x'),
      ...boltRing(6, 0.038, [X, Y + 0.098, mid(PCP.suction)], 'y'),
      cyl(0.061, 0.012, [X, Y, PCP.bearing[1] + 0.004], 'z', 24),
      cyl(0.012, 0.016, [X, Y - 0.088, mid(PCP.suction)], 'y', 6),
      // butterfly valve stem
      cyl(0.008, 0.05, [0.031, Y + 0.085, mid(PCP.suction)], 'y', 8),
      // cube lid bolts, cam-lock, float housing, return port, sight-glass fittings
      ...boltRect(CUBE.w + 0.01, CUBE.d + 0.01, 0.06, CUBE.y + CUBE.h / 2 + 0.023, [CUBE.x, 0, CUBE.z]),
      cyl(0.047, 0.045, [ATTACH.cubeInlet.x - 0.03, GOOSENECK.y, GOOSENECK.z], 'x', 20),
      cyl(0.06, 0.012, [GOOSENECK.x, 0.917, GOOSENECK.z], 'y', 20),
      // GD-01 junction box socket
      cyl(0.013, 0.02, [ATTACH.sniffer.x - 0.01, ATTACH.sniffer.y, ATTACH.sniffer.z], 'x', 12),
      cyl(0.04, 0.07, [-0.05, 0.948, -0.43], 'y', 18),
      cyl(0.044, 0.01, [-0.05, 0.986, -0.43], 'y', 18),
      cyl(0.017, 0.03, [CUBE.x + CUBE.w / 2 + 0.012, 0.72, -0.27], 'x', 10),
      box(0.03, 0.022, 0.03, [-0.355, 0.528, -0.31]),
      box(0.03, 0.022, 0.03, [-0.355, 0.852, -0.31]),
      cyl(0.0035, 0.3, [-0.366, CUBE.y, -0.29], 'y', 6),
      cyl(0.0035, 0.3, [-0.366, CUBE.y, -0.33], 'y', 6),
      // PT-01 / PT-02 stems
      cyl(0.005, 0.016, [0.028, 0.83, -0.57], 'x', 8),
      cyl(0.006, 0.03, [X + 0.045, RISER.gaugeY, RISER.z], 'x', 8),
      // jet-port cam-lock
      cyl(0.017, 0.02, [ATTACH.jetTee.x - 0.008, RISER.jetY, RISER.z], 'x', 14),
      // riser flanges and bolts
      cyl(0.058, 0.012, [X, 0.69, RISER.z], 'y', 20),
      ...boltRing(6, 0.047, [X, 0.698, RISER.z], 'y'),
      cyl(0.058, 0.012, [0.31, RISER.top, 0.36], 'z', 20),
      ...boltRing(6, 0.047, [0.31, RISER.top, 0.368], 'z'),
      cyl(0.058, 0.012, [0.31, RISER.top, 0.52], 'z', 20),
      ...boltRing(6, 0.047, [0.31, RISER.top, 0.528], 'z'),
    ]);
    const steelPipe = merge([
      // discharge riser → top run → forward run → drop into the reel swivel
      pipe(
        [
          [X, Y + 0.09, RISER.z],
          [X, RISER.top, RISER.z],
          [0.31, RISER.top, RISER.z],
          [0.31, RISER.top, REEL.z],
          [0.31, REEL.y + 0.05, REEL.z],
        ],
        0.032,
        0.055,
      ),
      // jet branch with the tee boss
      cyl(0.013, 0.12, [X + 0.06, RISER.jetY, RISER.z], 'x', 10),
      cyl(0.04, 0.03, [X, RISER.jetY, RISER.z], 'y', 16),
      // PSV boss on the top run
      cyl(0.03, 0.03, [0.25, RISER.top + 0.035, RISER.z], 'y', 14),
      // cube inlet gooseneck
      pipe(
        [
          [GOOSENECK.x, 0.905, GOOSENECK.z],
          [GOOSENECK.x, GOOSENECK.y, GOOSENECK.z],
          [ATTACH.cubeInlet.x - 0.05, GOOSENECK.y, GOOSENECK.z],
        ],
        0.038,
        0.05,
      ),
    ]);
    const brass = merge([
      // V-01 body, PSV body, cube V/P relief
      box(0.034, 0.034, 0.034, [0.262, RISER.jetY, RISER.z]),
      cyl(0.026, 0.04, [0.25, RISER.top + 0.07, RISER.z], 'y', 14),
      cyl(0.011, 0.03, [0.25, RISER.top + 0.07, RISER.z - 0.035], 'z', 10),
      cyl(0.018, 0.04, [-0.31, 0.932, -0.27], 'y', 12),
    ]);
    const dark = merge([
      // butterfly valve body + lever, check valve, ST-01, TT-01, LT-01, cam arms
      cyl(0.068, 0.026, [0.031, Y, mid(PCP.suction)], 'x', 22),
      box(0.012, 0.01, 0.12, [0.031, Y + 0.11, mid(PCP.suction) - 0.05]),
      cyl(0.042, 0.075, [0.31, RISER.top, 0.44], 'z', 18),
      box(0.022, 0.022, 0.022, [X, Y + 0.066, mid(PCP.bearing)]),
      box(0.026, 0.014, 0.026, [X, Y + 0.069, STATOR_Z]),
      cyl(0.022, 0.05, [-0.05, 0.937, -0.53], 'y', 12),
      box(0.06, 0.008, 0.008, [ATTACH.cubeInlet.x - 0.06, GOOSENECK.y, GOOSENECK.z - 0.052], [0, 0.3, 0]),
      box(0.06, 0.008, 0.008, [ATTACH.cubeInlet.x - 0.06, GOOSENECK.y, GOOSENECK.z + 0.052], [0, -0.3, 0]),
      // gearbox breather, extinguisher head + horn
      cyl(0.01, 0.025, [X, 0.672, mid(PCP.gearbox)], 'y', 8),
      box(0.05, 0.04, 0.05, [0.318, 0.733, -0.6]),
      cyl(0.01, 0.07, [0.318, 0.72, -0.56], 'z', 8),
      // controller: hinges, handle, glands, sniffer socket, whip base
      cyl(0.007, 0.05, [CTRL.x - CTRL.w / 2 - 0.008, 0.69, CTRL.d / 2 - 0.03], 'y', 8),
      cyl(0.007, 0.05, [CTRL.x - CTRL.w / 2 - 0.008, 0.55, CTRL.d / 2 - 0.03], 'y', 8),
      box(0.012, 0.06, 0.018, [CTRL.x - CTRL.w / 2 - 0.01, 0.62, -CTRL.d / 2 + 0.04]),
      ...[-0.27, -0.23, -0.19, -0.15].map((x) => cyl(0.009, 0.018, [x, 0.52, CTRL.d / 2 + 0.008], 'z', 8)),
      cyl(0.012, 0.02, [-0.07, 0.8, -0.125], 'y', 10),
      cyl(0.004, 0.26, [-0.07, 0.93, -0.125], 'y', 6),
    ]);
    const heatSink = merge(Array.from({ length: 9 }, (_, k) => box(0.005, 0.17, 0.026, [-0.305 + k * 0.024, 0.625, CTRL.d / 2 + 0.013])));
    const enclosure = (() => {
      const s = new THREE.Shape();
      s.moveTo(-CTRL.w / 2, 0);
      s.lineTo(CTRL.w / 2, 0);
      s.lineTo(CTRL.w / 2, 0.03);
      s.lineTo(-CTRL.w / 2, 0.13);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: CTRL.d - 0.04, bevelEnabled: false });
      g.translate(CTRL.x, 0.75, -(CTRL.d - 0.04) / 2);
      return merge([g, box(0.006, 0.232, 0.272, [CTRL.x - CTRL.w / 2 - 0.003, 0.62, 0])]);
    })();
    // cube shell extras (share the shell's x-ray material): lid flange, base flange, stiffeners
    const cubeX = merge([
      box(CUBE.w + 0.03, 0.02, CUBE.d + 0.03, [CUBE.x, CUBE.y + CUBE.h / 2 + 0.01, CUBE.z]),
      box(CUBE.w + 0.02, 0.014, CUBE.d + 0.02, [CUBE.x, CUBE.y - CUBE.h / 2 + 0.007, CUBE.z]),
      box(0.012, CUBE.h - 0.03, 0.025, [CUBE.x - CUBE.w / 2 - 0.006, CUBE.y, -0.56]),
      box(0.012, CUBE.h - 0.03, 0.025, [CUBE.x - CUBE.w / 2 - 0.006, CUBE.y, -0.42]),
      box(0.025, CUBE.h - 0.03, 0.012, [-0.26, CUBE.y, CUBE.z - CUBE.d / 2 - 0.006]),
      box(0.025, CUBE.h - 0.03, 0.012, [-0.06, CUBE.y, CUBE.z - CUBE.d / 2 - 0.006]),
      box(0.025, CUBE.h - 0.03, 0.012, [-0.25, CUBE.y, CUBE.z + CUBE.d / 2 + 0.006]),
    ]);
    // vane pump (lid-mounted): motor with fins, pump head, exhaust filter
    const vFins: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      if (Math.sin(a) < -0.7) continue;
      vFins.push(box(0.004, 0.01, 0.13, [-0.21 + Math.cos(a) * 0.06, 0.98 + Math.sin(a) * 0.06, -0.535], [0, 0, a - Math.PI / 2]));
    }
    const vMotor = merge([
      cyl(0.056, 0.15, [-0.21, 0.98, -0.535], 'z', 24),
      ...vFins,
      box(0.1, 0.03, 0.03, [-0.21, 0.935, -0.5]),
      box(0.1, 0.03, 0.03, [-0.21, 0.935, -0.575]),
      box(0.05, 0.035, 0.05, [-0.21, 1.045, -0.5]),
    ]);
    const vHead = merge([cyl(0.066, 0.11, [-0.21, 0.985, -0.405], 'z', 24), cyl(0.06, 0.012, [-0.21, 0.985, -0.344], 'z', 24), cyl(0.026, 0.07, [-0.3, 0.99, -0.4], 'x', 14), cyl(0.029, 0.012, [-0.338, 0.99, -0.4], 'x', 14)]);
    const vacLine = pipe(
      [
        [-0.21, 0.985, -0.345],
        [-0.21, 0.985, -0.3],
        [-0.21, 0.925, -0.3],
      ],
      0.014,
      0.03,
      8,
    );
    // rubber: PSV return line to the cube, motor cable, LT-01 / TT-01 leads
    const tube = (pts: V3[], r: number) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 48, r, 6, false);
    const hoses = merge([
      // PSV-20 return: down beside the riser, back along the stator, into the cube's side
      pipe(
        [
          [0.25, RISER.top + 0.07, RISER.z - 0.05],
          [0.27, RISER.top + 0.07, 0.17],
          [0.27, 0.72, 0.17],
          [0.27, 0.72, -0.27],
          [CUBE.x + CUBE.w / 2 + 0.02, 0.72, -0.27],
        ],
        0.011,
        0.05,
        8,
      ),
      tube(
        [
          [CTRL.x + CTRL.w / 2, 0.5, -0.12],
          [0.06, 0.489, -0.22],
          [0.065, 0.489, -0.66],
          [0.07, 0.6, -0.73],
          [X - 0.05, Y + 0.113, -0.74],
        ],
        0.01,
      ),
      tube(
        [
          [-0.05, 0.96, -0.53],
          [-0.12, 0.93, -0.66],
          [-0.2, 0.8, -0.66],
        ],
        0.004,
      ),
      // GD-01 junction box → controller, along the deck under the PCP
      tube(
        [
          [0.35, 0.505, 0.13],
          [0.345, 0.447, 0.11],
          [0.05, 0.447, 0.1],
          [CTRL.x + CTRL.w / 2, 0.505, 0.08],
        ],
        0.007,
      ),
    ]);
    return { frame, twist, motor, housing, zinc, steelPipe, brass, dark, heatSink, enclosure, cubeX, vMotor, vHead, vacLine, hoses };
  }, []);

  const heatBands = useMemo(() => merge([cyl(0.0645, 0.03, [X, Y, -0.22], 'z', 28), cyl(0.0645, 0.03, [X, Y, 0.08], 'z', 28)]), []);
  const cowlGeo = useMemo(() => new THREE.CylinderGeometry(0.093, 0.093, 0.03, 28, 1, true).rotateX(Math.PI / 2), []);
  const vCowlGeo = useMemo(() => new THREE.CylinderGeometry(0.059, 0.059, 0.026, 24, 1, true).rotateX(Math.PI / 2), []);
  const capGeo = useMemo(() => sphere(0.024, [0, 0.012, 0], 16), []);

  // ---- PCP rotor (x-ray) ----
  const rotorGeo = useMemo(() => {
    const g = new THREE.TubeGeometry(new HelixCurve(PCP.e, PCP.statorPitch / 2, STATOR_L), 160, 0.034, 10, false);
    g.rotateX(Math.PI / 2); // helix axis y → z
    g.translate(0, 0, -STATOR_L / 2);
    return g;
  }, []);
  const rotorOrbit = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Mesh>(null);
  const cavities = useRef<THREE.Group>(null);
  const coupling = useRef<THREE.Group>(null);
  const pcpAngle = useRef(0);
  const cubeLiquid = useRef<THREE.Mesh>(null);
  const sight = useRef<THREE.Mesh>(null);
  const v01 = useRef<THREE.Mesh>(null);
  const estop = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    const st = useSim.getState();
    const s = st.snap;
    if (!s) return;
    const xray = st.view.xray;
    // Phantom view of the cube in X-ray, and in cutaway once the job is on site.
    const seeInside = xray || (st.view.cutaway && s.vehicle.atPit);
    mats.stator.opacity = xray ? 0.2 : 1;
    mats.stator.depthWrite = !xray;
    mats.housing.opacity = xray ? 0.28 : 1;
    mats.housing.depthWrite = !xray;
    mats.cube.opacity = seeInside ? 0.2 : 1;
    mats.cube.depthWrite = !seeInside;
    mats.cubeFrame.opacity = seeInside ? 0.6 : 1;

    // PCP X-ray: rotor spins at ω about its own axis while its centre orbits at −ω (1:2 kinematics).
    const omega = (s.pcp.rpm / 60) * Math.PI * 2;
    pcpAngle.current += (omega * dt * Math.min(st.speed, 2)) / 6;
    const th = pcpAngle.current;
    rotorOrbit.current?.position.set(X + PCP.e * Math.cos(-th), Y + PCP.e * Math.sin(-th), STATOR_Z);
    if (rotor.current) {
      rotor.current.rotation.z = th;
      rotor.current.visible = xray;
    }
    if (coupling.current) {
      coupling.current.rotation.z = th;
      coupling.current.visible = xray;
    }
    const c = tsColor(s.cube.ts);
    if (cavities.current) {
      cavities.current.visible = xray && s.pcp.rpm > 5;
      const P = PCP.statorPitch;
      const adv = ((th / (Math.PI * 2)) * P) % P;
      cavities.current.children.forEach((ch, i) => {
        ch.position.z = STATOR_Z - STATOR_L / 2 + ((i * P + adv) % STATOR_L);
        ((ch as THREE.Mesh).material as THREE.MeshStandardMaterial).color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
      });
    }

    // Surge cube: liquid inside (x-ray / cutaway) and in the sight glass.
    const f = Math.max(0.001, Math.min(1, s.cube.level_L / CUBE.cap_L));
    mats.liquid.color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
    mats.gaugeLiquid.color.copy(mats.liquid.color);
    if (cubeLiquid.current) {
      cubeLiquid.current.visible = seeInside && f > 0.01;
      cubeLiquid.current.scale.set(1, f, 1);
      cubeLiquid.current.position.y = CUBE.y - CUBE.h / 2 + (CUBE.h * f) / 2;
    }
    if (sight.current) {
      sight.current.visible = f > 0.01;
      sight.current.scale.set(1, 0.3 * f, 1);
      sight.current.position.y = CUBE.y - 0.15 + 0.15 * f;
    }

    // Heat bands (thermal jacket) glow while the 24 V heaters run.
    mats.heat.emissive.set(s.thermal.heaterActive ? '#ff6a1a' : '#000000');
    mats.heat.emissiveIntensity = s.thermal.heaterActive ? 1.2 : 0;
    // V-01 position indicator and the PSV lifting.
    if (v01.current) v01.current.rotation.y = s.probe.jetValve * (Math.PI / 2);
    mats.psv.emissive.set(s.hose.reliefOpen ? '#ff2a1a' : '#000000');
    mats.psv.emissiveIntensity = s.hose.reliefOpen ? 1 + Math.sin(performance.now() / 90) * 0.8 : 0;

    // Console lamps and E-stop.
    // Untone-mapped emissives stay at ≤ 1.1 so the lamp hue does not clip (green → cyan).
    mats.k1.emissiveIntensity = s.job.k1 ? 1.1 : 0;
    mats.k2.emissiveIntensity = s.job.k2 ? 1.1 : 0;
    const flash = Math.sin(performance.now() / 140) > 0;
    mats.fault.emissiveIntensity = (s.alarms.length || s.job.estop) && flash ? 1.1 : 0;
    if (estop.current) estop.current.position.y = s.job.estop ? -0.008 : 0;

    // HMI at 4 Hz.
    const now = performance.now();
    if (now - hmi.last > 250) {
      hmi.last = now;
      drawHmi(hmi.g, s);
      hmi.t.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* ---------------- ISO skid frame ---------------- */}
      <mesh geometry={geo.frame} material={K.m.frame} castShadow />
      <mesh geometry={geo.twist} material={K.m.orange} />

      {/* ---------------- PCP train ---------------- */}
      <mesh geometry={geo.motor} material={K.m.motor} castShadow />
      <mesh geometry={cowlGeo} material={mats.cowl} position={[X, Y, mid(PCP.cowl)]} />
      <Fan position={[X, Y, PCP.cowl[0] + 0.012]} r={0.08} rotation={[0, Math.PI, 0]} speed={(s) => Math.min(30, s.pcp.rpm * 0.1)} />
      <Grille position={[X, Y, PCP.cowl[0] - 0.0005]} r={0.093} rotation={[0, Math.PI, 0]} />
      <RoundedBox args={[0.17, 0.17, len(PCP.gearbox)]} radius={0.016} smoothness={3} position={[X, 0.575, mid(PCP.gearbox)]} material={K.m.motor} castShadow />
      <mesh geometry={geo.housing} material={mats.housing} castShadow />
      <mesh position={[X, Y, STATOR_Z]} rotation={[Math.PI / 2, 0, 0]} material={mats.stator} castShadow>
        <cylinderGeometry args={[0.062, 0.062, STATOR_L, 28, 1, false]} />
      </mesh>
      <mesh geometry={heatBands} material={mats.heat} />
      <mesh geometry={geo.zinc} material={K.m.zinc} />
      <mesh position={[X + 0.0635, Y + 0.004, 0.13]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.042, 0.042]} />
        <meshStandardMaterial map={K.tex.warn} transparent alphaTest={0.4} roughness={0.6} />
      </mesh>
      <group ref={rotorOrbit}>
        <mesh ref={rotor} geometry={rotorGeo} visible={false}>
          <meshStandardMaterial color="#d6dbe0" metalness={0.85} roughness={0.25} />
        </mesh>
      </group>
      <group ref={cavities} position={[X, Y, 0]} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.036, 12, 8]} />
            <meshStandardMaterial transparent opacity={0.65} />
          </mesh>
        ))}
      </group>
      {/* coupling rod with two universal joints (x-ray) */}
      <group ref={coupling} position={[X, Y, -0.47]} visible={false}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={K.m.steel}>
          <cylinderGeometry args={[0.011, 0.011, 0.24, 10]} />
        </mesh>
        {[-0.1, 0.11].map((z) => (
          <mesh key={z} position={[0, 0, z]} material={K.m.steel}>
            <boxGeometry args={[0.03, 0.03, 0.03]} />
          </mesh>
        ))}
      </group>

      {/* ---------------- discharge piping and fittings ---------------- */}
      <mesh geometry={geo.steelPipe} material={K.m.pipe} castShadow />
      <mesh geometry={geo.brass} material={K.m.brass} />
      <mesh geometry={geo.dark} material={K.m.black} />
      {/* V-01 actuator + position pointer */}
      <mesh position={[0.262, RISER.jetY + 0.036, RISER.z]} material={K.m.blue}>
        <boxGeometry args={[0.042, 0.036, 0.05]} />
      </mesh>
      <mesh ref={v01} position={[0.262, RISER.jetY + 0.056, RISER.z]} material={K.m.yellow}>
        <boxGeometry args={[0.005, 0.004, 0.034]} />
      </mesh>
      {/* PSV-20 bar: spring bonnet, cap, easing lever */}
      <mesh position={[0.25, RISER.top + 0.125, RISER.z]} material={mats.psv}>
        <cylinderGeometry args={[0.02, 0.024, 0.09, 14]} />
      </mesh>
      <mesh position={[0.25, RISER.top + 0.177, RISER.z]} material={K.m.black}>
        <cylinderGeometry args={[0.012, 0.012, 0.016, 10]} />
      </mesh>
      <Gauge position={[X + 0.062, RISER.gaugeY, RISER.z]} face="+x" r={0.03} min={0} max={30} major={10} red={20} unit="bar" read={(s) => s.hose.pD_bar} />

      {/* ---------------- surge cube + vane pump ---------------- */}
      <RoundedBox args={[CUBE.w, CUBE.h, CUBE.d]} radius={0.012} smoothness={2} position={[CUBE.x, CUBE.y, CUBE.z]} material={mats.cube} castShadow />
      <mesh geometry={geo.cubeX} material={mats.cubeFrame} />
      <mesh ref={cubeLiquid} position={[CUBE.x, CUBE.y, CUBE.z]} material={mats.liquid} visible={false}>
        <boxGeometry args={[CUBE.w - 0.02, CUBE.h, CUBE.d - 0.02]} />
      </mesh>
      {/* sight glass on the outboard face */}
      <mesh position={[-0.356, CUBE.y, -0.31]} material={K.m.glass}>
        <cylinderGeometry args={[0.012, 0.012, 0.3, 12]} />
      </mesh>
      <mesh ref={sight} position={[-0.356, CUBE.y, -0.31]} material={mats.gaugeLiquid}>
        <cylinderGeometry args={[0.0095, 0.0095, 1, 10]} />
      </mesh>
      <mesh position={[-0.31, 0.958, -0.27]} material={K.m.yellow}>
        <cylinderGeometry args={[0.022, 0.022, 0.012, 14]} />
      </mesh>
      <Gauge position={[0.044, 0.83, -0.57]} face="+x" r={0.026} min={-1} max={2} major={1} red={1.5} unit="bar g" read={(s) => s.cube.p_barg} />
      <mesh position={[CUBE.x - CUBE.w / 2 - 0.0125, 0.78, -0.48]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[0.05, 0.05]} />
        <meshStandardMaterial map={K.tex.warn} transparent alphaTest={0.4} roughness={0.6} />
      </mesh>
      <mesh geometry={geo.vMotor} material={K.m.motor} castShadow />
      <mesh geometry={vCowlGeo} material={mats.cowl} position={[-0.21, 0.98, -0.623]} />
      <Fan position={[-0.21, 0.98, -0.624]} r={0.05} rotation={[0, Math.PI, 0]} speed={(s) => (s.cube.vaneMode !== 'off' ? 28 : 0)} />
      <Grille position={[-0.21, 0.98, -0.6365]} r={0.059} rotation={[0, Math.PI, 0]} />
      <mesh geometry={geo.vHead} material={K.m.pump} />
      <mesh geometry={geo.vacLine} material={K.m.black} />

      {/* ---------------- controller ---------------- */}
      <RoundedBox args={[CTRL.w, CTRL.h, CTRL.d]} radius={0.012} smoothness={2} position={[CTRL.x, 0.49 + CTRL.h / 2, CTRL.z]} material={K.m.enclosure} castShadow />
      <mesh geometry={geo.enclosure} material={K.m.enclosure} />
      <mesh geometry={geo.heatSink} material={K.m.steel} />
      <mesh position={[CTRL.x - CTRL.w / 2 - 0.0065, 0.66, 0.05]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[0.06, 0.06]} />
        <meshBasicMaterial map={qr} />
      </mesh>
      <group position={[CTRL.x, 0.75 + 0.08, CTRL.z]} rotation={[0, 0, -SLOPE]}>
        {/* HMI with live state, interlocks, discharge pressure, SOC */}
        <mesh position={[0.03, 0.003, 0.02]} quaternion={HMI_Q}>
          <planeGeometry args={[0.14, 0.0875]} />
          <meshBasicMaterial map={hmi.t} toneMapped={false} />
        </mesh>
        <mesh position={[0.03, 0.0005, 0.02]} material={K.m.black}>
          <boxGeometry args={[0.092, 0.002, 0.15]} />
        </mesh>
        {/* lamps: K1 amber · K2 green · alarm red */}
        {[mats.k1, mats.k2, mats.fault].map((m, i) => (
          <mesh key={i} position={[-0.085, 0.004, 0.035 + i * 0.03]} material={m}>
            <cylinderGeometry args={[0.009, 0.009, 0.008, 14]} />
          </mesh>
        ))}
        {/* E-stop: red mushroom on a yellow collar */}
        <mesh position={[-0.085, 0.008, -0.07]} material={K.m.yellow}>
          <boxGeometry args={[0.052, 0.016, 0.052]} />
        </mesh>
        <group ref={estop}>
          <mesh position={[-0.085, 0.025, -0.07]} material={K.m.red}>
            <cylinderGeometry args={[0.024, 0.02, 0.018, 18]} />
          </mesh>
          <mesh position={[-0.085, 0.022, -0.07]} geometry={capGeo} material={K.m.red} scale={[1, 0.4, 1]} />
        </group>
        <mesh position={[-0.085, 0.006, -0.01]} material={K.m.black}>
          <cylinderGeometry args={[0.01, 0.01, 0.01, 12]} />
        </mesh>
      </group>
      <mesh geometry={geo.hoses} material={K.m.cable} />

      {/* GD-01 junction box (sniffer cable from the manhole lands here) */}
      <RoundedBox args={[0.03, 0.09, 0.07]} radius={0.006} smoothness={2} position={[ATTACH.sniffer.x - 0.025, ATTACH.sniffer.y, ATTACH.sniffer.z]} material={K.m.enclosure} />
      <mesh position={[ATTACH.sniffer.x - 0.025, 0.47, ATTACH.sniffer.z]} material={K.m.frame}>
        <boxGeometry args={[0.012, 0.08, 0.012]} />
      </mesh>

      {/* ---------------- fire extinguisher ---------------- */}
      <mesh position={[0.318, 0.575, -0.6]} material={K.m.red} castShadow>
        <cylinderGeometry args={[0.042, 0.042, 0.26, 18]} />
      </mesh>
      <mesh position={[0.318, 0.705, -0.6]} material={K.m.red} scale={[1, 0.45, 1]}>
        <sphereGeometry args={[0.042, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
    </group>
  );
}
