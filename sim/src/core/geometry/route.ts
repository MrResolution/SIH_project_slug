/**
 * Renderer-independent polyline geometry. The same definition drives the
 * physics (hose elevation profile, vehicle pitch) and the 3D meshes (stairs,
 * hose tube), so physics and visuals always match (docs/simulation/04 §5.2).
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);

export interface PathSample {
  p: Vec3;
  /** Unit tangent in the direction of increasing s. */
  t: Vec3;
  /** Index of the segment that contains s. */
  seg: number;
}

export class Polyline {
  readonly pts: Vec3[];
  /** Cumulative arc length at each point. */
  readonly cum: number[];
  readonly length: number;

  constructor(pts: Vec3[]) {
    if (pts.length < 2) throw new Error('Polyline needs at least 2 points');
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + len(sub(pts[i], pts[i - 1])));
    this.length = this.cum[this.cum.length - 1];
  }

  private segAt(s: number): number {
    let lo = 0;
    let hi = this.cum.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  sample(sRaw: number): PathSample {
    const s = Math.min(Math.max(sRaw, 0), this.length);
    const i = this.segAt(s);
    const a = this.pts[i];
    const b = this.pts[i + 1];
    const segLen = this.cum[i + 1] - this.cum[i] || 1e-9;
    const u = (s - this.cum[i]) / segLen;
    const d = sub(b, a);
    return {
      p: { x: a.x + d.x * u, y: a.y + d.y * u, z: a.z + d.z * u },
      t: { x: d.x / segLen, y: d.y / segLen, z: d.z / segLen },
      seg: i,
    };
  }

  /** Elevation y(s) sampled on a uniform grid of spacing `ds` (for O(1) lookup). */
  elevationTable(ds: number): ElevationTable {
    const n = Math.max(2, Math.ceil(this.length / ds) + 1);
    const y = new Float64Array(n);
    for (let k = 0; k < n; k++) y[k] = this.sample(Math.min(k * ds, this.length)).p.y;
    return new ElevationTable(y, ds, this.length);
  }

  reversed(): Polyline {
    return new Polyline([...this.pts].reverse());
  }
}

export class ElevationTable {
  constructor(readonly y: Float64Array, readonly ds: number, readonly length: number) {}
  at(s: number): number {
    const x = Math.min(Math.max(s, 0), this.length) / this.ds;
    const i = Math.min(Math.floor(x), this.y.length - 2);
    const u = x - i;
    return this.y[i] * (1 - u) + this.y[i + 1] * u;
  }
}

/** Distance in plan (x, z) from a point to a polyline, plus the nearest elevation. */
export function planDistance(line: Polyline, x: number, z: number): { d: number; y: number; s: number } {
  let best = Infinity;
  let bestY = 0;
  let bestS = 0;
  for (let i = 0; i < line.pts.length - 1; i++) {
    const a = line.pts[i];
    const b = line.pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const u = l2 > 0 ? Math.min(Math.max(((x - a.x) * dx + (z - a.z) * dz) / l2, 0), 1) : 0;
    const px = a.x + dx * u;
    const pz = a.z + dz * u;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      bestY = a.y + (b.y - a.y) * u;
      bestS = line.cum[i] + (line.cum[i + 1] - line.cum[i]) * u;
    }
  }
  return { d: best, y: bestY, s: bestS };
}
