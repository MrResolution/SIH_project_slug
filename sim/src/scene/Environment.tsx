import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { E1, E1_LANE_SEGMENTS, E1_LANE_WIDTH, E1_ROAD_Y } from '../data/scenes/e1';
import { buildTerrain, groundHeight } from './terrain';
import { makeHouses, makeTrees, type House } from './layout';
import { useCutawayPlanes } from './cutaway';

/** E1 terrain, stepped lane, terraced village, forest and far ranges. */
export function Environment({ snow }: { snow: boolean }) {
  return (
    <group>
      <Terrain snow={snow} />
      <Lane />
      <Village snow={snow} />
      <Forest snow={snow} />
      <Ranges />
      <RoadFurniture />
    </group>
  );
}

function Terrain({ snow }: { snow: boolean }) {
  const geo = useMemo(() => buildTerrain(-75, 80, -118, 66, 0.5, snow), [snow]);
  const outer = useMemo(() => buildTerrain(-260, 260, -330, 240, 4, snow, [-71, 76, -114, 62]), [snow]);
  const planes = useCutawayPlanes();
  return (
    <group>
      <mesh geometry={geo} receiveShadow castShadow={false}>
        <meshStandardMaterial vertexColors roughness={0.95} metalness={0} clippingPlanes={planes} clipIntersection />
      </mesh>
      {/* Coarse outer skirt, dropped slightly so the detailed patch wins where they overlap. */}
      <mesh geometry={outer} position={[0, -0.25, 0]} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
    </group>
  );
}

/** Stairs, landings, parapets and handrails built from the same lane segments the physics uses. */
function Lane() {
  const steps = useRef<THREE.InstancedMesh>(null);
  const slabs = useRef<THREE.InstancedMesh>(null);
  const walls = useRef<THREE.InstancedMesh>(null);
  const flights = E1_LANE_SEGMENTS.filter((s) => s.kind === 'flight');
  const landings = E1_LANE_SEGMENTS.filter((s) => s.kind === 'landing');
  const nSteps = flights.reduce((a, f) => a + (f.steps ?? 0), 0);
  const W = E1_LANE_WIDTH;

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const col = new THREE.Color();
    let k = 0;
    for (const f of flights) {
      const n = f.steps!;
      const r = f.riser!;
      const t = f.tread!;
      for (let i = 0; i < n; i++) {
        const top = f.a.y - (i + 1) * r;
        const h = r + 0.5;
        p.set(f.a.x, top - h / 2, f.a.z + (i + 0.5) * t);
        s.set(W, h, t + 0.004);
        m.compose(p, q.identity(), s);
        steps.current!.setMatrixAt(k, m);
        col.set(i % 2 ? '#8e8a82' : '#97938a').offsetHSL(0, 0, (Math.sin(k * 12.9) * 0.5) * 0.04);
        steps.current!.setColorAt(k, col);
        k++;
      }
    }
    steps.current!.instanceMatrix.needsUpdate = true;
    if (steps.current!.instanceColor) steps.current!.instanceColor.needsUpdate = true;

    landings.forEach((l, i) => {
      const dx = l.b.x - l.a.x;
      const dz = l.b.z - l.a.z;
      const len = Math.hypot(dx, dz);
      const along = Math.abs(dx) > Math.abs(dz);
      p.set((l.a.x + l.b.x) / 2, l.a.y - 0.08, (l.a.z + l.b.z) / 2);
      s.set(along ? len + W : W, 0.16, along ? W : len + 0.02);
      m.compose(p, q.identity(), s);
      slabs.current!.setMatrixAt(i, m);
    });
    slabs.current!.instanceMatrix.needsUpdate = true;

    // Parapet walls along both sides of each flight.
    let w = 0;
    for (const f of flights) {
      const L = Math.hypot(f.b.z - f.a.z, f.b.y - f.a.y);
      const ang = Math.atan2(f.a.y - f.b.y, f.b.z - f.a.z);
      for (const side of [-1, 1]) {
        p.set(f.a.x + side * (W / 2 + 0.11), (f.a.y + f.b.y) / 2 + 0.28, (f.a.z + f.b.z) / 2);
        q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang);
        s.set(0.22, 0.75, L);
        m.compose(p, q, s);
        walls.current!.setMatrixAt(w++, m);
      }
    }
    walls.current!.count = w;
    walls.current!.instanceMatrix.needsUpdate = true;
  }, [flights, landings, W]);

  const rails = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (const f of flights) {
      pts.push(new THREE.Vector3(f.a.x + W / 2 + 0.11, f.a.y + 0.95, f.a.z), new THREE.Vector3(f.b.x + W / 2 + 0.11, f.b.y + 0.95, f.b.z));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [flights, W]);

  return (
    <group>
      <instancedMesh ref={steps} args={[undefined, undefined, nSteps]} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={slabs} args={[undefined, undefined, landings.length]} receiveShadow castShadow>
        <boxGeometry />
        <meshStandardMaterial color="#8c887f" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={walls} args={[undefined, undefined, flights.length * 2]} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial color="#6f6a62" roughness={1} />
      </instancedMesh>
      <lineSegments geometry={rails}>
        <lineBasicMaterial color="#2c3138" />
      </lineSegments>
    </group>
  );
}

function prismGeometry() {
  // Gable roof: unit footprint (1 × 1), ridge along x at height 1.
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    // left slope
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0,
    // right slope
    -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, 0.5, 0, 0.5,
    // gables
    -0.5, 0, -0.5, -0.5, 1, 0, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

function Village({ snow }: { snow: boolean }) {
  const houses = useMemo(() => makeHouses(), []);
  const lower = useRef<THREE.InstancedMesh>(null);
  const upper = useRef<THREE.InstancedMesh>(null);
  const roofs = useRef<THREE.InstancedMesh>(null);
  const caps = useRef<THREE.InstancedMesh>(null);
  const wins = useRef<THREE.InstancedMesh>(null);
  const prism = useMemo(() => prismGeometry(), []);
  const nWin = houses.length * 10;

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    let wi = 0;
    const place = (mesh: THREE.InstancedMesh, i: number, h: House, ox: number, oy: number, oz: number, sx: number, sy: number, sz: number) => {
      q.setFromAxisAngle(up, h.rot);
      p.set(ox, oy, oz).applyQuaternion(q).add(new THREE.Vector3(h.x, h.y, h.z));
      s.set(sx, sy, sz);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    };
    houses.forEach((h, i) => {
      const plinth = 1.6;
      place(lower.current!, i, h, 0, (h.h1 - plinth) / 2, 0, h.w, h.h1 + plinth, h.d);
      c.set(h.h2 > 0 ? '#8d877b' : h.wall).offsetHSL(0, 0, ((i * 37) % 10) / 200);
      lower.current!.setColorAt(i, c);
      const top = h.h1 + h.h2;
      if (h.h2 > 0) place(upper.current!, i, h, 0, h.h1 + h.h2 / 2, 0, h.w + 0.18, h.h2, h.d + 0.18);
      else place(upper.current!, i, h, 0, -50, 0, 0.01, 0.01, 0.01);
      upper.current!.setColorAt(i, c.set(h.wall));
      place(roofs.current!, i, h, 0, top, 0, h.w + 0.7, h.roofH, h.d + 0.8);
      roofs.current!.setColorAt(i, c.set(h.roof));
      place(caps.current!, i, h, 0, top + 0.05, 0, h.w + 0.6, h.roofH * 0.98, h.d + 0.72);
      // Windows on both long faces.
      const floors = h.h2 > 0 ? [h.h1 * 0.55, h.h1 + h.h2 * 0.5] : [h.h1 * 0.55];
      for (const fy of floors)
        for (const side of [-1, 1]) {
          const n = Math.max(1, Math.floor(h.w / 1.9));
          for (let k = 0; k < n && wi < nWin; k++) {
            const xx = -h.w / 2 + (h.w / n) * (k + 0.5);
            place(wins.current!, wi++, h, xx, fy, side * (h.d / 2 + (fy > h.h1 ? 0.1 : 0.01)), 0.8, 1.05, 0.06);
          }
        }
    });
    for (; wi < nWin; wi++) {
      m.makeScale(0, 0, 0);
      wins.current!.setMatrixAt(wi, m);
    }
    for (const mesh of [lower, upper, roofs, caps, wins]) {
      mesh.current!.instanceMatrix.needsUpdate = true;
      if (mesh.current!.instanceColor) mesh.current!.instanceColor.needsUpdate = true;
    }
  }, [houses, nWin]);

  return (
    <group>
      <instancedMesh ref={lower} args={[undefined, undefined, houses.length]} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={upper} args={[undefined, undefined, houses.length]} castShadow receiveShadow>
        <boxGeometry />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[prism, undefined, houses.length]} castShadow receiveShadow>
        <meshStandardMaterial roughness={0.6} metalness={0.25} side={THREE.DoubleSide} />
      </instancedMesh>
      {snow && (
        <instancedMesh ref={caps} args={[prism, undefined, houses.length]} receiveShadow>
          <meshStandardMaterial color="#f2f6fa" roughness={0.85} transparent opacity={0.92} />
        </instancedMesh>
      )}
      {!snow && <instancedMesh ref={caps} args={[prism, undefined, houses.length]} visible={false} />}
      <instancedMesh ref={wins} args={[undefined, undefined, nWin]}>
        <boxGeometry />
        <meshStandardMaterial color="#26313b" roughness={0.3} metalness={0.4} emissive="#3a2a12" emissiveIntensity={0.25} />
      </instancedMesh>
      <QrPlate />
    </group>
  );
}

/** HH-07 QR plate beside the manhole (TEL-03). */
function QrPlate() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#111';
    let s = 7;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        s = (s * 9301 + 49297) % 233280;
        if (s / 233280 > 0.5 || (x < 2 && y < 2) || (x > 5 && y < 2) || (x < 2 && y > 5)) g.fillRect(4 + x * 7, 4 + y * 7, 7, 7);
      }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <mesh position={[E1.house.x1 + 0.03, 1.4, E1.pit.z - 0.4]} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[0.22, 0.22]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

function Forest({ snow }: { snow: boolean }) {
  const houses = useMemo(() => makeHouses(), []);
  const trees = useMemo(() => makeTrees(houses), [houses]);
  const foliage = useRef<THREE.InstancedMesh>(null);
  const trunks = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => {
    // Deodar: three drooping tiers.
    const tiers = [
      new THREE.ConeGeometry(1.9, 3.4, 9, 1).translate(0, 2.9, 0),
      new THREE.ConeGeometry(1.45, 2.8, 9, 1).translate(0, 4.7, 0),
      new THREE.ConeGeometry(0.95, 2.4, 8, 1).translate(0, 6.3, 0),
      new THREE.ConeGeometry(0.45, 1.6, 7, 1).translate(0, 7.6, 0),
    ];
    return mergeGeometries(tiers)!;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    trees.forEach((t, i) => {
      e.set(t.lean, (i * 2.399) % (Math.PI * 2), t.lean * 0.6);
      q.setFromEuler(e);
      p.set(t.x, t.y - 0.2, t.z);
      s.set(t.s, t.s * (0.9 + ((i * 7) % 5) * 0.06), t.s);
      m.compose(p, q, s);
      foliage.current!.setMatrixAt(i, m);
      c.set(snow ? '#5d7464' : '#2e4a34').offsetHSL(0, 0, (((i * 13) % 7) - 3) / 120);
      foliage.current!.setColorAt(i, c);
      s.set(t.s * 0.9, t.s, t.s * 0.9);
      m.compose(p, q, s);
      trunks.current!.setMatrixAt(i, m);
    });
    foliage.current!.instanceMatrix.needsUpdate = true;
    trunks.current!.instanceMatrix.needsUpdate = true;
    if (foliage.current!.instanceColor) foliage.current!.instanceColor.needsUpdate = true;
  }, [trees, snow]);
  return (
    <group>
      <instancedMesh ref={foliage} args={[geo, undefined, trees.length]} castShadow receiveShadow>
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.13, 0.2, 2.6, 6]} />
        <meshStandardMaterial color="#4b3828" roughness={1} />
      </instancedMesh>
    </group>
  );
}

/** Far snow ranges (Bandarpunch / Garhwal backdrop), vertex-coloured by height. */
function Ranges() {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const ang = -Math.PI * 0.95 + (i / 25) * Math.PI * 1.9 + (rnd() - 0.5) * 0.2;
      const r = 520 + rnd() * 520;
      const h = 140 + rnd() * 260;
      const g = new THREE.ConeGeometry(160 + rnd() * 160, h, 7, 4);
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        const y = pos.getY(k);
        if (y < h / 2 - 1) {
          pos.setX(k, pos.getX(k) * (0.8 + rnd() * 0.45));
          pos.setZ(k, pos.getZ(k) * (0.8 + rnd() * 0.45));
          pos.setY(k, y + (rnd() - 0.5) * h * 0.08);
        }
      }
      g.translate(Math.sin(ang) * r, h / 2 - 40, -Math.cos(ang) * r);
      parts.push(g.toNonIndexed());
    }
    const merged = mergeGeometries(parts)!;
    const pos = merged.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const rock = new THREE.Color('#58616f');
    const snowC = new THREE.Color('#eef3f8');
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const y = pos.getY(k);
      c.copy(rock).lerp(snowC, Math.min(1, Math.max(0, (y - 60) / 90)));
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
    }
    merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
    merged.computeVertexNormals();
    return merged;
  }, []);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial vertexColors flatShading roughness={1} />
    </mesh>
  );
}

/** Road guard wall, electricity poles and overhead wires along the road and lane. */
function RoadFurniture() {
  const poles = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let x = -60; x <= 60; x += 24) pts.push([x, E1_ROAD_Y, -66.4]);
    pts.push([2.2, groundHeight(2.2, -34), -34], [-3.5, groundHeight(-3.5, -9), -9], [9.5, groundHeight(9.5, 14), 14]);
    return pts;
  }, []);
  const wires = useMemo(() => {
    const segs: THREE.Vector3[] = [];
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i];
      const b = poles[i + 1];
      for (const dy of [7.6, 7.2]) {
        const n = 10;
        for (let k = 0; k < n; k++) {
          const t0 = k / n;
          const t1 = (k + 1) / n;
          const sag = (t: number) => -1.1 * 4 * t * (1 - t);
          segs.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0 + dy + sag(t0), a[2] + (b[2] - a[2]) * t0));
          segs.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1 + dy + sag(t1), a[2] + (b[2] - a[2]) * t1));
        }
      }
    }
    return new THREE.BufferGeometry().setFromPoints(segs);
  }, [poles]);
  return (
    <group>
      {/* guard wall on the valley side of the road, open at the lane head */}
      {[
        [-35, 64],
        [32, 58],
      ].map(([cx, len], i) => (
        <mesh key={i} position={[cx, E1_ROAD_Y + 0.35, -58.4]} castShadow receiveShadow>
          <boxGeometry args={[len, 0.7, 0.35]} />
          <meshStandardMaterial color="#b9b4a8" roughness={0.9} />
        </mesh>
      ))}
      {poles.map((p, i) => (
        <mesh key={i} position={[p[0], p[1] + 3.9, p[2]]} castShadow>
          <cylinderGeometry args={[0.09, 0.12, 7.8, 6]} />
          <meshStandardMaterial color="#6e6a63" roughness={0.9} />
        </mesh>
      ))}
      <lineSegments geometry={wires}>
        <lineBasicMaterial color="#1b1e22" />
      </lineSegments>
      {/* road centre dashes */}
      {Array.from({ length: 30 }, (_, i) => (
        <mesh key={i} position={[-72 + i * 5, E1_ROAD_Y + 0.02, -62.2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[2, 0.12]} />
          <meshBasicMaterial color="#d8d4c6" />
        </mesh>
      ))}
      <mesh position={[E1.tanker.x + 6.5, E1_ROAD_Y + 0.6, E1.tanker.z - 2.4]}>
        <boxGeometry args={[0.35, 1.2, 0.2]} />
        <meshStandardMaterial color="#f2efe6" />
      </mesh>
    </group>
  );
}
