import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Geometry, texture and material kit for the crawler. Small static parts that
 * share a material are baked into one merged geometry (one draw call), so the
 * model can carry fasteners, fins and fittings without a draw-call explosion.
 */

export type V3 = [number, number, number];
type Axis = 'x' | 'y' | 'z';

function orient(g: THREE.BufferGeometry, axis: Axis) {
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  return g;
}

export function box(w: number, h: number, d: number, p: V3, rot?: V3) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rot) {
    g.rotateX(rot[0]);
    g.rotateY(rot[1]);
    g.rotateZ(rot[2]);
  }
  return g.translate(p[0], p[1], p[2]);
}

export function cyl(r: number, h: number, p: V3, axis: Axis = 'y', seg = 16, rBottom = r) {
  return orient(new THREE.CylinderGeometry(r, rBottom, h, seg), axis).translate(p[0], p[1], p[2]);
}

export function torus(r: number, tube: number, p: V3, axis: Axis = 'y', arc = Math.PI * 2, seg = 24) {
  const g = new THREE.TorusGeometry(r, tube, 8, seg, arc);
  // Torus lies in the xy plane (axis z).
  if (axis === 'y') g.rotateX(Math.PI / 2);
  else if (axis === 'x') g.rotateY(Math.PI / 2);
  return g.translate(p[0], p[1], p[2]);
}

export function sphere(r: number, p: V3, seg = 12) {
  return new THREE.SphereGeometry(r, seg, Math.max(6, seg / 2)).translate(p[0], p[1], p[2]);
}

/** Tube along straight runs joined by rounded elbows (bend radius rb). */
export function pipe(points: V3[], r: number, rb = 0.05, radial = 12) {
  const path = new THREE.CurvePath<THREE.Vector3>();
  const P = points.map((p) => new THREE.Vector3(...p));
  let from = P[0];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1];
    const b = P[i];
    const c = P[i + 1];
    const inDir = b.clone().sub(a).normalize();
    const outDir = c.clone().sub(b).normalize();
    const k = Math.min(rb, b.distanceTo(a) / 2, c.distanceTo(b) / 2);
    const p0 = b.clone().addScaledVector(inDir, -k);
    const p1 = b.clone().addScaledVector(outDir, k);
    if (from.distanceTo(p0) > 1e-4) path.add(new THREE.LineCurve3(from, p0));
    path.add(new THREE.QuadraticBezierCurve3(p0, b, p1));
    from = p1;
  }
  path.add(new THREE.LineCurve3(from, P[P.length - 1]));
  const len = path.getLength();
  return new THREE.TubeGeometry(path as unknown as THREE.Curve<THREE.Vector3>, Math.max(8, Math.round(len * 90)), r, radial, false);
}

/** Bolt-head ring (hex heads) on a circle of radius rc about an axis. */
export function boltRing(n: number, rc: number, c: V3, axis: Axis, headR = 0.0065, headH = 0.006, phase = 0) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const u = Math.cos(a) * rc;
    const v = Math.sin(a) * rc;
    const p: V3 = axis === 'x' ? [c[0], c[1] + u, c[2] + v] : axis === 'y' ? [c[0] + u, c[1], c[2] + v] : [c[0] + u, c[1] + v, c[2]];
    parts.push(cyl(headR, headH, p, axis, 6));
  }
  return parts;
}

/** Bolt heads on a rectangle (flanged lids). */
export function boltRect(w: number, d: number, step: number, y: number, c: V3) {
  const parts: THREE.BufferGeometry[] = [];
  const nx = Math.max(2, Math.round(w / step));
  const nz = Math.max(2, Math.round(d / step));
  for (let i = 0; i <= nx; i++) {
    const x = c[0] - w / 2 + (i / nx) * w;
    parts.push(cyl(0.0065, 0.006, [x, y, c[2] - d / 2], 'y', 6), cyl(0.0065, 0.006, [x, y, c[2] + d / 2], 'y', 6));
  }
  for (let j = 1; j < nz; j++) {
    const z = c[2] - d / 2 + (j / nz) * d;
    parts.push(cyl(0.0065, 0.006, [c[0] - w / 2, y, z], 'y', 6), cyl(0.0065, 0.006, [c[0] + w / 2, y, z], 'y', 6));
  }
  return parts;
}

/** Merge static parts into one geometry (all converted to non-indexed). */
export function merge(parts: THREE.BufferGeometry[]) {
  const list = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute('position').count as number) * 2), 2));
    return g;
  });
  const out = mergeGeometries(list, false)!;
  parts.forEach((p) => p.dispose());
  list.forEach((g) => g.dispose());
  return out;
}

// ---------------------------------------------------------------------------
// Plate shapes (extruded along x after orientation: wheel faces, flanges, gears)
// ---------------------------------------------------------------------------

function holes(shape: THREE.Shape, count: number, at: number, r: number, phase = 0) {
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    const h = new THREE.Path();
    h.absarc(Math.cos(a) * at, Math.sin(a) * at, r, 0, Math.PI * 2, true);
    shape.holes.push(h);
  }
}

/** Disc with lightening holes and a centre bore, axis along x, centred on x = 0. */
export function holedDisc(r: number, thick: number, count: number, holeAt: number, holeR: number, bore = 0) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  holes(s, count, holeAt, holeR, Math.PI / count);
  if (bore > 0) {
    const b = new THREE.Path();
    b.absarc(0, 0, bore, 0, Math.PI * 2, true);
    s.holes.push(b);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 40 });
  g.translate(0, 0, -thick / 2);
  return g.rotateY(Math.PI / 2);
}

/** Drive sprocket: n teeth between rRoot and rTip, lightening holes, axis along x. */
export function sprocketGeo(n: number, rRoot: number, rTip: number, thick: number) {
  const s = new THREE.Shape();
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a = i * step;
    const pts: [number, number][] = [
      [a - step * 0.5, rRoot],
      [a - step * 0.24, rRoot],
      [a - step * 0.13, rTip],
      [a + step * 0.13, rTip],
      [a + step * 0.24, rRoot],
    ];
    pts.forEach(([ang, r], k) => {
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (i === 0 && k === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    });
  }
  s.closePath();
  holes(s, 5, rRoot * 0.58, rRoot * 0.2);
  const b = new THREE.Path();
  b.absarc(0, 0, rRoot * 0.22, 0, Math.PI * 2, true);
  s.holes.push(b);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 12 });
  g.translate(0, 0, -thick / 2);
  return g.rotateY(Math.PI / 2);
}

/** Chevron tread lug, base on y = 0, height h; long axis x, thin along z. */
export function chevronLug(halfW: number, bar: number, apex: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(-halfW, -bar / 2);
  s.lineTo(0, -bar / 2 + apex);
  s.lineTo(halfW, -bar / 2);
  s.lineTo(halfW, bar / 2);
  s.lineTo(0, bar / 2 + apex);
  s.lineTo(-halfW, bar / 2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); // extrusion (z) → +y, shape y → −z
  return g;
}

// ---------------------------------------------------------------------------
// Track belt loop: convex hull of the sprocket and idler circles
// ---------------------------------------------------------------------------

export interface BeltSample {
  z: number;
  y: number;
  /** Outward normal (z, y). */
  nz: number;
  ny: number;
}

/**
 * Closed belt path around a rear circle c1 and a front circle c2 (in the z–y
 * plane). Parameter s runs forward along the bottom run, up round the idler,
 * back along the top run and down round the sprocket.
 */
export class BeltLoop {
  readonly length: number;
  private segs: number[];
  private aUp: number;
  private aDn: number;
  private run: number;
  constructor(
    private c1: { z: number; y: number; r: number },
    private c2: { z: number; y: number; r: number },
  ) {
    const dz = c2.z - c1.z;
    const dy = c2.y - c1.y;
    const d = Math.hypot(dz, dy);
    const phi = Math.atan2(dy, dz);
    const beta = Math.acos((c1.r - c2.r) / d);
    this.aUp = phi + beta;
    this.aDn = phi - beta;
    this.run = Math.sqrt(d * d - (c1.r - c2.r) ** 2);
    this.segs = [this.run, c2.r * 2 * beta, this.run, c1.r * (Math.PI * 2 - 2 * beta)];
    this.length = this.segs.reduce((a, b) => a + b, 0);
  }

  sample(s: number, out: BeltSample) {
    const { c1, c2, aUp, aDn } = this;
    let u = ((s % this.length) + this.length) % this.length;
    if (u < this.segs[0]) {
      const f = u / this.segs[0];
      const z0 = c1.z + c1.r * Math.cos(aDn);
      const y0 = c1.y + c1.r * Math.sin(aDn);
      const z1 = c2.z + c2.r * Math.cos(aDn);
      const y1 = c2.y + c2.r * Math.sin(aDn);
      out.z = z0 + (z1 - z0) * f;
      out.y = y0 + (y1 - y0) * f;
      out.nz = Math.cos(aDn);
      out.ny = Math.sin(aDn);
      return out;
    }
    u -= this.segs[0];
    if (u < this.segs[1]) {
      const a = aDn + u / c2.r;
      out.nz = Math.cos(a);
      out.ny = Math.sin(a);
      out.z = c2.z + c2.r * out.nz;
      out.y = c2.y + c2.r * out.ny;
      return out;
    }
    u -= this.segs[1];
    if (u < this.segs[2]) {
      const f = u / this.segs[2];
      const z0 = c2.z + c2.r * Math.cos(aUp);
      const y0 = c2.y + c2.r * Math.sin(aUp);
      const z1 = c1.z + c1.r * Math.cos(aUp);
      const y1 = c1.y + c1.r * Math.sin(aUp);
      out.z = z0 + (z1 - z0) * f;
      out.y = y0 + (y1 - y0) * f;
      out.nz = Math.cos(aUp);
      out.ny = Math.sin(aUp);
      return out;
    }
    u -= this.segs[2];
    const a = aUp + u / c1.r;
    out.nz = Math.cos(a);
    out.ny = Math.sin(a);
    out.z = c1.z + c1.r * out.nz;
    out.y = c1.y + c1.r * out.ny;
    return out;
  }

  /** Height of the top run's inner surface at z (carrier-roller seat). */
  topY(z: number) {
    const { c1, c2, aUp } = this;
    const z0 = c2.z + c2.r * Math.cos(aUp);
    const y0 = c2.y + c2.r * Math.sin(aUp);
    const z1 = c1.z + c1.r * Math.cos(aUp);
    const y1 = c1.y + c1.r * Math.sin(aUp);
    return y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
  }

  /** Polyline of the loop offset outward by `off` (z, y as Vector2 x, y). */
  outline(off: number, n = 180) {
    const pts: THREE.Vector2[] = [];
    const o: BeltSample = { z: 0, y: 0, nz: 0, ny: 0 };
    for (let i = 0; i < n; i++) {
      this.sample((i / n) * this.length, o);
      pts.push(new THREE.Vector2(o.z + o.nz * off, o.y + o.ny * off));
    }
    return pts;
  }
}

/** Rubber belt carcass: ring between the inner and outer outlines, width w along x. */
export function beltGeo(loop: BeltLoop, thick: number, w: number) {
  // The bevel pushes the walls out by `bs`, so trace the contours `bs` inside the true surfaces.
  const bs = 0.003;
  const shape = new THREE.Shape(loop.outline(thick - bs));
  shape.holes.push(new THREE.Path(loop.outline(bs).reverse()));
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: true, bevelThickness: 0.006, bevelSize: bs, bevelSegments: 1, curveSegments: 1 });
  g.rotateY(-Math.PI / 2); // shape (z, y), extrusion → −x
  g.translate(w / 2, 0, 0);
  return g;
}

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function tex(c: HTMLCanvasElement, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Galvanised diamond (checker) plate. */
function checkerTex() {
  const { c, g } = canvas(128, 128);
  g.fillStyle = '#7f868d';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const cx = i * 32 + 16;
      const cy = j * 32 + 16;
      const rot = (i + j) % 2 === 0 ? Math.PI / 4 : -Math.PI / 4;
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      g.fillStyle = '#5c6268';
      g.beginPath();
      g.ellipse(1.5, 1.5, 12, 3.2, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b4bac0';
      g.beginPath();
      g.ellipse(0, 0, 12, 3.2, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  }
  return tex(c, 5, 12);
}

/** 45° yellow / black hazard stripes. */
function hazardTex() {
  const { c, g } = canvas(64, 64);
  g.fillStyle = '#e3b11f';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#17191c';
  for (let k = -64; k < 128; k += 32) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 16, 0);
    g.lineTo(k + 16 - 64, 64);
    g.lineTo(k - 64, 64);
    g.closePath();
    g.fill();
  }
  return tex(c);
}

/** Side decal for the fender skirt (1.82 × 0.07 m). */
function decalTex() {
  const { c, g } = canvas(1024, 40);
  g.fillStyle = '#d9a521';
  g.fillRect(0, 0, 1024, 40);
  // hazard chevrons at both ends
  g.fillStyle = '#17191c';
  for (const x0 of [0, 1024 - 56]) {
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.moveTo(x0 + k * 14, 0);
      g.lineTo(x0 + k * 14 + 7, 0);
      g.lineTo(x0 + k * 14 + 7 - 12, 40);
      g.lineTo(x0 + k * 14 - 12, 40);
      g.closePath();
      g.fill();
    }
  }
  g.fillStyle = '#17191c';
  g.textBaseline = 'middle';
  g.font = '800 25px "Inter Variable", Inter, system-ui, sans-serif';
  g.fillText('PROBE-AND-MULE', 78, 21);
  g.font = '600 15px "Inter Variable", Inter, system-ui, sans-serif';
  g.fillText('CRAWLER B  ·  750 mm  ·  48 V  ·  35° MAX', 352, 21);
  g.fillRect(338, 8, 2, 24);
  g.font = '700 17px "JetBrains Mono", ui-monospace, monospace';
  g.fillText('U-0042', 862, 21);
  return tex(c);
}

/** ISO-style warning triangle with a glyph. */
function warnTex(glyph: string) {
  const { c, g } = canvas(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = '#17191c';
  g.beginPath();
  g.moveTo(32, 2);
  g.lineTo(62, 58);
  g.lineTo(2, 58);
  g.closePath();
  g.fill();
  g.fillStyle = '#f2c230';
  g.beginPath();
  g.moveTo(32, 10);
  g.lineTo(55, 53);
  g.lineTo(9, 53);
  g.closePath();
  g.fill();
  g.fillStyle = '#17191c';
  g.font = '900 28px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(glyph, 32, 38);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Wound-hose coil: one wrap per texture repeat across the drum width. */
function coilTex() {
  const { c, g } = canvas(256, 32);
  const grad = g.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, '#13283d');
  grad.addColorStop(0.18, '#24507b');
  grad.addColorStop(0.5, '#3a74a8');
  grad.addColorStop(0.82, '#24507b');
  grad.addColorStop(1, '#13283d');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 32);
  // printed lay-line so the drum visibly turns
  g.fillStyle = 'rgba(235,240,245,0.75)';
  g.fillRect(10, 14, 46, 3);
  g.fillRect(150, 14, 18, 3);
  return tex(c, 3, 5);
}

/** Fan-cowl grille (transparent between the bars, so the fan shows through). */
function grilleTex() {
  const { c, g } = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#8c939b';
  g.lineWidth = 4;
  for (let r = 10; r < 64; r += 9) {
    g.beginPath();
    g.arc(64, 64, r, 0, Math.PI * 2);
    g.stroke();
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62);
    g.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Pressure-gauge dial face: 270° sweep from min to max, optional red band. */
export function dialTex(min: number, max: number, major: number, red: number | null, unit: string) {
  const { c, g } = canvas(128, 128);
  g.fillStyle = '#f4f5f2';
  g.beginPath();
  g.arc(64, 64, 63, 0, Math.PI * 2);
  g.fill();
  const ang = (v: number) => Math.PI * 0.75 + ((v - min) / (max - min)) * Math.PI * 1.5;
  if (red !== null) {
    g.strokeStyle = '#d23a32';
    g.lineWidth = 9;
    g.beginPath();
    g.arc(64, 64, 50, ang(red), ang(max));
    g.stroke();
  }
  g.strokeStyle = '#17191c';
  g.fillStyle = '#17191c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 15px system-ui, sans-serif';
  for (let v = min; v <= max + 1e-6; v += major / 2) {
    const a = ang(v);
    const isMajor = Math.abs((v - min) % major) < 1e-6 || Math.abs(((v - min) % major) - major) < 1e-6;
    g.lineWidth = isMajor ? 3 : 1.5;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * (isMajor ? 42 : 47), 64 + Math.sin(a) * (isMajor ? 42 : 47));
    g.lineTo(64 + Math.cos(a) * 55, 64 + Math.sin(a) * 55);
    g.stroke();
    if (isMajor) g.fillText(String(Math.round(v * 10) / 10), 64 + Math.cos(a) * 31, 64 + Math.sin(a) * 31);
  }
  g.font = '600 12px system-ui, sans-serif';
  g.fillText(unit, 64, 92);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// Shared materials (one set per page; the crawler is a singleton)
// ---------------------------------------------------------------------------

function std(color: string, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function makeKit() {
  const checker = checkerTex();
  const hazard = hazardTex();
  return {
    tex: { checker, hazard, decal: decalTex(), warn: warnTex('!'), volt: warnTex('⚡'), coil: coilTex(), grille: grilleTex() },
    m: {
      yellow: std('#d9a521', 0.5, 0.25),
      hazard: std('#ffffff', 0.55, 0.1, { map: hazard }),
      deck: std('#ffffff', 0.55, 0.55, { map: checker }),
      body: std('#2b2f35', 0.68, 0.2),
      frame: std('#3b4048', 0.5, 0.5),
      rubber: std('#1b1d20', 0.93),
      wheel: std('#4c535b', 0.45, 0.65),
      wheelDark: std('#33383e', 0.55, 0.5),
      steel: std('#aeb6bf', 0.32, 0.8),
      zinc: std('#c3c9cf', 0.38, 0.75),
      pipe: std('#9aa3ad', 0.38, 0.7),
      black: std('#141618', 0.7),
      pump: std('#2f6aa8', 0.42, 0.35),
      motor: std('#8c939b', 0.42, 0.55),
      enclosure: std('#c9ccce', 0.5, 0.15),
      red: std('#b3392f', 0.48, 0.3),
      orange: std('#e2711d', 0.5, 0.2),
      blue: std('#2f6aa8', 0.6, 0.1),
      hdpe: std('#e9eef2', 0.55),
      brass: std('#c8a24a', 0.3, 0.85),
      glass: std('#bfe3ec', 0.08, 0, { transparent: true, opacity: 0.35, depthWrite: false }),
      lens: std('#f3f6f8', 0.15, 0, { emissive: '#fff6e0', emissiveIntensity: 0.4 }),
      tail: std('#7a1010', 0.3, 0, { emissive: '#ff2a1a', emissiveIntensity: 0.35 }),
      amber: std('#ffb020', 0.2, 0, { emissive: '#ff9a10', emissiveIntensity: 0.25, transparent: true, opacity: 0.92 }),
      reflector: std('#b0190f', 0.25, 0.3),
      hose: std('#2b5a8a', 0.68),
      cable: std('#18191b', 0.6),
      hvCable: std('#e36a12', 0.55),
      copper: std('#c07a45', 0.3, 0.85),
      cell: std('#3c6db0', 0.5, 0.1),
    },
  };
}

let KIT: ReturnType<typeof makeKit> | null = null;
/** Lazily built so importing the scene in Node (tests) never touches the DOM. */
export function kit() {
  if (!KIT) KIT = makeKit();
  return KIT;
}

/** Clone a material that a component animates (emissive LEDs, x-ray shells). */
export function own<T extends THREE.Material>(m: T): T {
  return m.clone() as T;
}
