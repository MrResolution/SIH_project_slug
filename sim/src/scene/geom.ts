import * as THREE from 'three';
import type { Polyline } from '../core/geometry/route';

/** THREE curve over a core Polyline, so tubes follow exactly the physics route. */
export class PolylineCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private line: Polyline, private s0 = 0, private s1 = line.length) {
    super();
  }
  getPoint(u: number, target = new THREE.Vector3()) {
    const p = this.line.sample(this.s0 + (this.s1 - this.s0) * u).p;
    return target.set(p.x, p.y, p.z);
  }
}

/** Helical curve along +y: radius r, pitch per turn, total length. */
export class HelixCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private r: number, private pitch: number, private length: number) {
    super();
  }
  getPoint(u: number, target = new THREE.Vector3()) {
    const y = u * this.length;
    const a = (y / this.pitch) * Math.PI * 2;
    return target.set(Math.cos(a) * this.r, y, Math.sin(a) * this.r);
  }
}

/** Auger flight approximated by a tube swept along a helix. */
export function helixTube(r: number, pitch: number, length: number, tubeR: number, radial = 5) {
  const turns = length / pitch;
  return new THREE.TubeGeometry(new HelixCurve(r, pitch, length), Math.max(24, Math.round(turns * 28)), tubeR, radial, false);
}

/** Smooth sagging hose between two points (quadratic, drooping to the ground). */
export function sagCurve(a: THREE.Vector3, b: THREE.Vector3, groundY: number, sag = 0.6) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y = Math.max(groundY + 0.06, Math.min(a.y, b.y) - sag);
  const c1 = a.clone().lerp(mid, 0.6);
  c1.y = Math.max(groundY + 0.06, c1.y - sag * 0.4);
  const c2 = b.clone().lerp(mid, 0.6);
  c2.y = Math.max(groundY + 0.06, c2.y - sag * 0.4);
  return new THREE.CatmullRomCurve3([a, c1, mid, c2, b], false, 'centripetal');
}
