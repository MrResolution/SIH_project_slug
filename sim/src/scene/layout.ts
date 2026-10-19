import { planDistance } from '../core/geometry/route';
import { E1, E1_LANE } from '../data/scenes/e1';
import { fbm, groundHeight, mulberry } from './terrain';

/** Seeded placement of houses and trees around the lane (scenery only). */

export interface House {
  x: number;
  z: number;
  y: number;
  w: number;
  d: number;
  h1: number;
  h2: number;
  roofH: number;
  rot: number;
  wall: string;
  roof: string;
  hh07?: boolean;
}

export interface Tree {
  x: number;
  y: number;
  z: number;
  s: number;
  lean: number;
}

const WALLS = ['#efe7d6', '#f1ece2', '#e9d9c4', '#d9e4e8', '#e8d7d9', '#dfe6d4', '#f2e6c8', '#cfd8e2'];
const ROOFS = ['#9a3b2f', '#3d6a5a', '#405f86', '#6f6f6f', '#7a2f2a', '#55606b', '#2f5b4b'];

const C = E1.courtyard;

function footprintOk(x: number, z: number, w: number, d: number, rot: number, houses: House[]) {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const corners = [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
    [0, 0],
  ].map(([u, v]) => [x + u * c - v * s, z + u * s + v * c]);
  for (const [cx, cz] of corners) {
    if (planDistance(E1_LANE, cx, cz).d < 2.0) return null;
    if (cz > -67 && cz < -57.5) return null; // road
    if (cx > C.x0 - 2.5 && cx < C.x1 + 3 && cz > C.z0 - 1.5 && cz < C.z1 + 2) return null; // courtyard
    if (Math.hypot(cx - E1.tanker.x, cz - E1.tanker.z) < 9) return null;
  }
  for (const h of houses) {
    const r = Math.max(h.w, h.d) / 2 + Math.max(w, d) / 2 + 1.4;
    if (Math.hypot(h.x - x, h.z - z) < r) return null;
  }
  const ys = corners.map(([cx, cz]) => groundHeight(cx, cz));
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  if (hi - lo > 3.4) return null;
  return lo;
}

export function makeHouses(): House[] {
  const rnd = mulberry(20261019);
  const houses: House[] = [];
  // HH-07 itself, facing the courtyard.
  const hh = E1.house;
  houses.push({ x: (hh.x0 + hh.x1) / 2, z: (hh.z0 + hh.z1) / 2, y: 0, w: hh.x1 - hh.x0, d: hh.z1 - hh.z0, h1: 2.9, h2: 2.7, roofH: 1.6, rot: Math.PI / 2, wall: '#efe2c6', roof: '#9a3b2f', hh07: true });
  let tries = 0;
  while (houses.length < 46 && tries < 3000) {
    tries++;
    const x = -58 + rnd() * 120;
    const z = -80 + rnd() * 128;
    const near = Math.abs(x - 3) < 30;
    if (!near && rnd() < 0.55) continue;
    const w = 4.2 + rnd() * 3.6;
    const d = 3.4 + rnd() * 1.6;
    const rot = (rnd() - 0.5) * 0.25 + (rnd() < 0.15 ? Math.PI / 2 : 0);
    const y = footprintOk(x, z, w, d, rot, houses);
    if (y === null) continue;
    const floors = rnd() < 0.3 ? 1 : 2;
    houses.push({
      x,
      z,
      y,
      w,
      d,
      h1: 2.6 + rnd() * 0.5,
      h2: floors === 2 ? 2.5 + rnd() * 0.4 : 0,
      roofH: 1.1 + rnd() * 0.8,
      rot,
      wall: WALLS[Math.floor(rnd() * WALLS.length)],
      roof: ROOFS[Math.floor(rnd() * ROOFS.length)],
    });
  }
  return houses;
}

export function makeTrees(houses: House[]): Tree[] {
  const rnd = mulberry(77);
  const trees: Tree[] = [];
  let tries = 0;
  while (trees.length < 420 && tries < 9000) {
    tries++;
    const x = -110 + rnd() * 220;
    const z = -150 + rnd() * 215;
    // Denser on the flanks and the hill above the road.
    const dens = fbm(x * 0.03, z * 0.03, 3);
    if (rnd() > dens * 1.4 - 0.15) continue;
    if (planDistance(E1_LANE, x, z).d < 2.8) continue;
    if (z > -67.5 && z < -56.5) continue;
    if (x > C.x0 - 3 && x < C.x1 + 4 && z > C.z0 - 2 && z < C.z1 + 3) continue;
    if (Math.hypot(x - E1.tanker.x, z - E1.tanker.z) < 10) continue;
    let ok = true;
    for (const h of houses) if (Math.abs(h.x - x) < h.w / 2 + 1.6 && Math.abs(h.z - z) < h.d / 2 + 1.6) ok = false;
    if (!ok) continue;
    trees.push({ x, z, y: groundHeight(x, z), s: 0.7 + rnd() * 0.75, lean: (rnd() - 0.5) * 0.06 });
  }
  return trees;
}
