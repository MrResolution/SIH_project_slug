import * as THREE from 'three';
import { planDistance } from '../core/geometry/route';
import { E1, E1_LANE, E1_LANE_END, E1_LANE_SEGMENTS, E1_LANE_WIDTH, E1_ROAD_Y } from '../data/scenes/e1';

/**
 * Procedural E1 hillside. The base profile follows the lane's own elevation
 * (so terraces line up with the landings), flights are broken into two
 * stone-walled sub-terraces, and the lane corridor is carved to the stair
 * height. Everything is a pure function of (x, z) so trees, houses and the
 * crawler can sample the same ground.
 */

// ---- seeded value noise -----------------------------------------------------
function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, z: number, oct = 4) {
  let f = 0;
  let amp = 0.5;
  let fr = 1;
  for (let i = 0; i < oct; i++) {
    f += amp * vnoise(x * fr, z * fr);
    fr *= 2.03;
    amp *= 0.5;
  }
  return f;
}
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ---- flights as z-intervals ------------------------------------------------
interface FlightZ {
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  x: number;
}
export const FLIGHTS: FlightZ[] = E1_LANE_SEGMENTS.filter((s) => s.kind === 'flight').map((s) => ({ z0: s.a.z, z1: s.b.z, y0: s.a.y, y1: s.b.y, x: s.a.x }));
const LANE_Z0 = E1_LANE.pts[0].z;
const LANE_Z1 = E1_LANE_END.z;

/** Terraced profile along z: flat landings, each flight's drop split into two stone walls. */
function terraceY(z: number): number {
  if (z <= LANE_Z0 + 0.5) return E1_ROAD_Y;
  for (let i = 0; i < FLIGHTS.length; i++) {
    const f = FLIGHTS[i];
    if (z < f.z0) return f.y0;
    if (z <= f.z1) {
      const L = f.z1 - f.z0;
      const ym = (f.y0 + f.y1) / 2;
      const w1 = f.z0 + 0.3 * L;
      const w2 = f.z0 + 0.72 * L;
      if (z < w1) return f.y0;
      if (z < w1 + 0.7) return f.y0 + (ym - f.y0) * smooth(w1, w1 + 0.7, z);
      if (z < w2) return ym;
      if (z < w2 + 0.7) return ym + (f.y1 - ym) * smooth(w2, w2 + 0.7, z);
      return f.y1;
    }
  }
  return 0;
}

/** Ground height (world y) without the lane carve. */
export function baseHeight(x: number, z: number): number {
  const ax = Math.abs(x - 3);
  // Terraces meander away from the lane.
  const wob = smooth(9, 24, ax);
  const zz = z + wob * (3.2 * Math.sin(x / 21 + 0.7) + 1.4 * Math.sin(x / 8.5 + 2));
  let y: number;
  if (zz < -66) {
    // Hill above the road.
    const d = -66 - zz;
    y = E1_ROAD_Y + d * 0.62 + fbm(x * 0.08, z * 0.08) * 3 * smooth(0, 8, d) + Math.max(0, d - 25) * 0.35;
  } else if (zz < -58.2) {
    y = E1_ROAD_Y;
  } else if (zz <= LANE_Z1 + 8.5) {
    y = terraceY(zz);
  } else {
    // Below the courtyard: stepped fields falling to the valley.
    const d = zz - (LANE_Z1 + 8.5);
    y = -Math.floor(d / 4.2) * 1.7 - smooth(0, 0.6, d % 4.2) * 0 - d * 0.02;
  }
  // Flanks: gentle cross-slope and roughness away from the village core.
  const flank = smooth(26, 70, ax);
  y += flank * (fbm(x * 0.04 + 7, z * 0.04) * 10 - 3) + smooth(40, 90, ax) * (ax - 40) * 0.25;
  y += (fbm(x * 0.35, z * 0.35, 3) - 0.5) * 0.18;
  return y;
}

const LANE_HALF = E1_LANE_WIDTH / 2;
const C = E1.courtyard;

/** Ground height including the lane carve and the courtyard pad. */
export function groundHeight(x: number, z: number): number {
  let y = baseHeight(x, z);
  // Courtyard of HH-07.
  if (x > C.x0 - 6 && x < C.x1 + 3 && z > C.z0 - 1 && z < C.z1 + 3) {
    const k = Math.min(smooth(C.x0 - 6, C.x0, x), 1 - smooth(C.x1, C.x1 + 3, x), smooth(C.z0 - 1, C.z0, z), 1 - smooth(C.z1, C.z1 + 3, z));
    y = y + (0 - y) * k;
  }
  // Lane corridor: carve / fill to the stair surface with short side batters.
  if (z > LANE_Z0 - 3 && z < LANE_Z1 + 3) {
    const pd = planDistance(E1_LANE, x, z);
    const inner = LANE_HALF + 0.35;
    if (pd.d < inner + 1.2) {
      const k = 1 - smooth(inner, inner + 1.2, pd.d);
      y = y + (pd.y - 0.04 - y) * k;
    }
  }
  return y;
}

/** Vertex-coloured terrain mesh (winter palette). */
export function buildTerrain(x0: number, x1: number, z0: number, z1: number, step: number, snow: boolean, hole?: [number, number, number, number]): THREE.BufferGeometry {
  const nx = Math.round((x1 - x0) / step) + 1;
  const nz = Math.round((z1 - z0) / step) + 1;
  const pos = new Float32Array(nx * nz * 3);
  const col = new Float32Array(nx * nz * 3);
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * step;
      const z = z0 + j * step;
      H[j * nx + i] = groundHeight(x, z);
    }
  const grass = new THREE.Color('#5d6b3e');
  const dryGrass = new THREE.Color('#7d7650');
  const soil = new THREE.Color('#6b5442');
  const stone = new THREE.Color('#7a7770');
  const stoneDark = new THREE.Color('#57544f');
  const snowC = new THREE.Color('#e9eef3');
  const paving = new THREE.Color('#8b867c');
  const tmp = new THREE.Color();
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const x = x0 + i * step;
      const z = z0 + j * step;
      const y = H[k];
      pos[k * 3] = x;
      pos[k * 3 + 1] = y;
      pos[k * 3 + 2] = z;
      const hx = H[j * nx + Math.min(nx - 1, i + 1)] - H[j * nx + Math.max(0, i - 1)];
      const hz = H[Math.min(nz - 1, j + 1) * nx + i] - H[Math.max(0, j - 1) * nx + i];
      const slope = Math.sqrt(hx * hx + hz * hz) / (2 * step);
      const n = fbm(x * 0.3, z * 0.3, 3);
      tmp.copy(grass).lerp(dryGrass, n);
      if (slope > 0.45) tmp.lerp(soil, smooth(0.45, 0.9, slope));
      if (slope > 1.2) tmp.copy(stone).lerp(stoneDark, fbm(x * 1.7, y * 1.7, 2));
      // Paved road and lane.
      const onRoad = z > -65.8 && z < -58.6 && Math.abs(y - E1_ROAD_Y) < 0.3;
      if (onRoad) tmp.set('#4a4d52').lerp(new THREE.Color('#585b60'), n * 0.6);
      const inCourt = x > C.x0 && x < C.x1 && z > C.z0 && z < C.z1;
      if (inCourt) tmp.copy(paving).lerp(stone, n * 0.4);
      if (snow && slope < 0.7 && !onRoad) {
        const cover = smooth(0.25, 0.75, fbm(x * 0.12 + 3, z * 0.12, 3) + 0.25 - slope * 0.5) * (inCourt ? 0.35 : 0.85);
        tmp.lerp(snowC, cover);
      }
      col[k * 3] = tmp.r;
      col[k * 3 + 1] = tmp.g;
      col[k * 3 + 2] = tmp.b;
    }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let t = 0;
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      if (hole) {
        const cx = x0 + (i + 0.5) * step;
        const cz = z0 + (j + 0.5) * step;
        if (cx > hole[0] && cx < hole[1] && cz > hole[2] && cz < hole[3]) continue;
      }
      idx[t++] = a;
      idx[t++] = c;
      idx[t++] = b;
      idx[t++] = b;
      idx[t++] = c;
      idx[t++] = d;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx.subarray(0, t), 1));
  g.computeVertexNormals();
  return g;
}

/** Deterministic PRNG for scenery placement. */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
