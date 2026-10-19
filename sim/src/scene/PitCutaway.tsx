import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { E1 } from '../data/scenes/e1';
import { useSim } from '../store/simStore';
import { mobColor, tauColor, tsColor } from '../ui/colors';
import { CUT } from './cutaway';
import { helixTube } from './geom';

const P = E1.pit;
const L = 2.0;
const Wd = 1.2;
const T = 0.12;
/** Lance length from tip to the top flange (m). */
export const LANCE_TOP = 3.0;

/** Layered soil section texture for the excavation faces. */
function soilTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  const bands: [number, string][] = [
    [0, '#3d2f24'],
    [0.08, '#5a4532'],
    [0.32, '#7a5b3c'],
    [0.6, '#8a6d4a'],
    [0.82, '#6c6158'],
    [1, '#5d5650'],
  ];
  const grad = g.createLinearGradient(0, 0, 0, 512);
  bands.forEach(([t, col]) => grad.addColorStop(t, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 512);
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const y = r() * 512;
    const big = y > 380 ? 2.2 : 1;
    g.fillStyle = `rgba(${150 + r() * 60},${140 + r() * 50},${120 + r() * 40},${0.25 + r() * 0.3})`;
    g.beginPath();
    g.ellipse(r() * 256, y, (1 + r() * 3) * big, (0.8 + r() * 2) * big, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(30,20,12,${0.15 + r() * 0.2})`;
    g.beginPath();
    const y = r() * 512;
    g.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + (r() - 0.5) * 6);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Sludge column: one box, coloured by height through a 64-texel strip updated from the 24 cells. */
function useSludgeMaterial() {
  return useMemo(() => {
    const data = new Uint8Array(64 * 4);
    const tex = new THREE.DataTexture(data, 1, 64, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uY0: { value: -2.4 }, uY1: { value: -0.5 }, uTime: { value: 0 }, uLight: { value: new THREE.Vector3(0.45, 0.8, 0.4).normalize() } },
      vertexShader: /* glsl */ `
        varying vec3 vW; varying vec3 vN;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform float uY0; uniform float uY1; uniform float uTime; uniform vec3 uLight;
        varying vec3 vW; varying vec3 vN;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){
          float t = clamp((vW.y - uY0) / max(uY1 - uY0, 1e-3), 0.0, 1.0);
          vec3 c = texture2D(uTex, vec2(0.5, t)).rgb;
          // fine granular texture + faint horizontal laminations
          float g = h(floor(vW.xz * 90.0) + floor(vW.y * 90.0));
          c *= 0.93 + 0.1 * g;
          c *= 0.96 + 0.04 * sin(vW.y * 140.0 + sin(vW.x * 7.0) * 2.0);
          float top = step(0.7, vN.y);
          c = mix(c, c * 1.12 + 0.03 * sin(uTime * 1.3 + vW.x * 9.0), top);
          float l = 0.55 + 0.45 * max(dot(normalize(vN), uLight), 0.0);
          gl_FragColor = vec4(c * l, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    return { mat, tex, data };
  }, []);
}

export function PitCutaway() {
  const cutaway = useSim((s) => s.view.cutaway);
  const soil = useMemo(() => soilTexture(), []);
  const sludge = useSludgeMaterial();
  const column = useRef<THREE.Mesh>(null);
  const rathole = useRef<THREE.Mesh>(null);
  const lance = useRef<THREE.Group>(null);
  const auger = useRef<THREE.Mesh>(null);
  const jets = useRef<THREE.Group>(null);
  const tripod = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Mesh | null)[]>([]);
  const cable = useRef<THREE.Mesh>(null);
  const lid = useRef<THREE.Mesh>(null);
  const swirl = useRef<THREE.InstancedMesh>(null);
  const augerAngle = useRef(0);
  const augerGeo = useMemo(() => helixTube(0.058, 0.09, 0.26, 0.012, 3), []);
  const NS = 260;
  const seeds = useMemo(() => Array.from({ length: NS }, (_, i) => [((i * 0.618) % 1) * Math.PI * 2, ((i * 0.377) % 1), ((i * 0.733) % 1)]), []);
  const tmpM = useMemo(() => new THREE.Matrix4(), []);
  const tmpC = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    const st = useSim.getState();
    const s = st.snap;
    if (!s) return;
    const depth = s.pit.depth_m;
    const floor = -depth;
    const surf = floor + s.pit.surface_m;
    const heat = st.view.heat;
    // ---- column texture ----
    const cells = s.pit.cells;
    const d = sludge.data;
    let ci = 0;
    for (let k = 0; k < 64; k++) {
      const z = ((k + 0.5) / 64) * s.pit.surface_m;
      while (ci < cells.length - 1 && cells[ci].z0 + cells[ci].h < z) ci++;
      const c = cells[ci];
      const col = heat === 'tau' ? tauColor(0.065 * Math.pow(Math.max(0, c.ts), 2.7) * 1.28) : heat === 'mobility' ? mobColor(c.mob) : tsColor(c.ts);
      d[k * 4] = col[0];
      d[k * 4 + 1] = col[1];
      d[k * 4 + 2] = col[2];
      d[k * 4 + 3] = 255;
    }
    sludge.tex.needsUpdate = true;
    sludge.mat.uniforms.uY0.value = floor;
    sludge.mat.uniforms.uY1.value = surf;
    sludge.mat.uniforms.uTime.value += dt;
    if (column.current) {
      const h = Math.max(0.002, s.pit.surface_m);
      // Section through the lance axis: only the back half is drawn, so the probe shows in front of the cut face.
      const half = st.view.cutaway;
      column.current.scale.set(L - 0.004, h, half ? Wd / 2 - 0.002 : Wd - 0.004);
      column.current.position.set(P.x, floor + h / 2, half ? P.z - Wd / 4 : P.z);
    }
    // ---- rathole cone ----
    if (rathole.current) {
      const r = s.pit.rathole_m;
      rathole.current.visible = r > 0.03 && st.view.cutaway;
      const top = floor + s.pit.bedTop_m;
      rathole.current.scale.set(0.12 + r * 0.45, r, 0.12 + r * 0.45);
      rathole.current.position.set(P.x, top - r / 2 + 0.005, P.z);
    }
    // ---- lance, auger, jets ----
    const tripodE = s.equip.tripod;
    if (lance.current) {
      lance.current.visible = tripodE >= 1;
      lance.current.position.set(P.x, floor + s.equip.lanceZ_m, P.z);
    }
    const rpm = s.probe.auger_rpm;
    augerAngle.current += ((rpm / 60) * Math.PI * 2 * dt * Math.min(st.speed, 4)) / 4;
    if (auger.current) auger.current.rotation.y = augerAngle.current;
    if (jets.current) {
      const q = s.probe.jet_lpm;
      jets.current.visible = q > 1 && st.view.cutaway;
      const len = 0.15 + (q / 45) * 0.45;
      jets.current.children.forEach((c) => c.scale.set(1, len, 1));
    }
    // ---- auger swirl particles ----
    if (swirl.current) {
      const on = Math.abs(rpm) > 20 && st.view.cutaway && tripodE >= 1;
      swirl.current.visible = on;
      if (on) {
        const tipY = floor + s.equip.lanceZ_m;
        const zc = tipY + 0.05 + 0.125;
        const rm = Math.min(0.9, s.probe.rm_m);
        const w = (augerAngle.current * 0.25) % (Math.PI * 2);
        for (let i = 0; i < NS; i++) {
          const [a0, rr, hh] = seeds[i];
          const r = 0.08 + rr * rm;
          const a = a0 + w * (1.4 - rr);
          let y = zc + (hh - 0.5) * 2 * rm * 0.8;
          y = Math.min(surf - 0.02, Math.max(floor + 0.02, y));
          const x = Math.max(-L / 2 + 0.05, Math.min(L / 2 - 0.05, Math.cos(a) * r));
          // Swirl drawn on the section plane (just proud of the cut face).
          const z = 0.012 + Math.abs(Math.sin(a)) * 0.02;
          tmpM.makeScale(1, 1, 1).setPosition(P.x + x, y, P.z + z);
          swirl.current.setMatrixAt(i, tmpM);
          const zl = y - floor;
          let k = 0;
          while (k < cells.length - 1 && cells[k].z0 + cells[k].h < zl) k++;
          const col = tsColor(cells[k].ts);
          swirl.current.setColorAt(i, tmpC.setRGB((col[0] / 255) * 0.62, (col[1] / 255) * 0.62, (col[2] / 255) * 0.62));
        }
        swirl.current.instanceMatrix.needsUpdate = true;
        if (swirl.current.instanceColor) swirl.current.instanceColor.needsUpdate = true;
      }
    }
    // ---- tripod ----
    if (tripod.current) {
      tripod.current.visible = tripodE > 0.001;
      const spread = 0.12 + 0.88 * tripodE;
      const headY = 1.6 + 1.85 * tripodE;
      tripod.current.position.set(P.x, 0, P.z);
      legs.current.forEach((leg, i) => {
        if (!leg) return;
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const fx = Math.cos(a) * spread;
        const fz = Math.sin(a) * spread;
        const len = Math.hypot(fx, headY, fz);
        leg.position.set(fx / 2, headY / 2, fz / 2);
        leg.scale.set(1, len, 1);
        leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-fx, headY, -fz).normalize());
      });
      if (cable.current) {
        const top = headY - 0.1;
        const lanceTop = floor + s.equip.lanceZ_m + LANCE_TOP;
        const len = Math.max(0.02, top - lanceTop);
        cable.current.visible = tripodE >= 1 && len > 0.03;
        cable.current.scale.set(1, len, 1);
        cable.current.position.set(0, lanceTop + len / 2, 0);
      }
    }
    // ---- manhole lid ----
    if (lid.current) {
      const target = s.equip.manholeOpen ? 0.78 : 0;
      lid.current.position.x += (P.x + target - lid.current.position.x) * Math.min(1, dt * 3);
      lid.current.position.y = s.equip.manholeOpen ? 0.06 : 0.03;
    }
  });

  return (
    <group>
      {/* -------- excavation (cutaway only) -------- */}
      {cutaway && (
        <group>
          <mesh position={[CUT.x0, CUT.floor / 2, (CUT.z0 + CUT.z1) / 2]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
            <planeGeometry args={[CUT.z1 - CUT.z0, -CUT.floor]} />
            <meshStandardMaterial map={soil} roughness={1} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[CUT.x1, CUT.floor / 2, (CUT.z0 + CUT.z1) / 2]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
            <planeGeometry args={[CUT.z1 - CUT.z0, -CUT.floor]} />
            <meshStandardMaterial map={soil} roughness={1} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[(CUT.x0 + CUT.x1) / 2, CUT.floor / 2, CUT.z0]} receiveShadow>
            <planeGeometry args={[CUT.x1 - CUT.x0, -CUT.floor]} />
            <meshStandardMaterial map={soil} roughness={1} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[(CUT.x0 + CUT.x1) / 2, CUT.floor, (CUT.z0 + CUT.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[CUT.x1 - CUT.x0, CUT.z1 - CUT.z0]} />
            <meshStandardMaterial color="#4a4038" roughness={1} />
          </mesh>
          {/* hazard edge marking the section */}
          {[
            [(CUT.x0 + CUT.x1) / 2, CUT.z1, CUT.x1 - CUT.x0, 0.05],
            [CUT.x0, (CUT.z0 + CUT.z1) / 2, 0.05, CUT.z1 - CUT.z0],
            [CUT.x1, (CUT.z0 + CUT.z1) / 2, 0.05, CUT.z1 - CUT.z0],
          ].map(([x, z, w, dd], i) => (
            <mesh key={i} position={[x, 0.02, z]}>
              <boxGeometry args={[w, 0.04, dd]} />
              <meshBasicMaterial color="#e3b11f" />
            </mesh>
          ))}
        </group>
      )}

      {/* -------- septic tank (concrete) -------- */}
      <group>
        <mesh position={[P.x, -2.4 - T / 2, P.z]} receiveShadow>
          <boxGeometry args={[L + 2 * T, T, Wd + 2 * T]} />
          <meshStandardMaterial color="#8f8b84" roughness={0.95} />
        </mesh>
        <mesh position={[P.x, -1.2, P.z - Wd / 2 - T / 2]} receiveShadow castShadow>
          <boxGeometry args={[L + 2 * T, 2.4, T]} />
          <meshStandardMaterial color="#9c978f" roughness={0.95} />
        </mesh>
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[P.x + sx * (L / 2 + T / 2), -1.2, P.z]} receiveShadow castShadow>
            <boxGeometry args={[T, 2.4, Wd + 2 * T]} />
            <meshStandardMaterial color="#9c978f" roughness={0.95} />
          </mesh>
        ))}
        {!cutaway && (
          <mesh position={[P.x, -1.2, P.z + Wd / 2 + T / 2]}>
            <boxGeometry args={[L + 2 * T, 2.4, T]} />
            <meshStandardMaterial color="#9c978f" />
          </mesh>
        )}
        {/* top slab: back half always; front half only without cutaway; manhole opening at the centre */}
        <mesh position={[P.x, -0.07, P.z - (Wd + 2 * T) / 4 - 0.15]} castShadow receiveShadow>
          <boxGeometry args={[L + 2 * T, 0.14, (Wd + 2 * T) / 2 - 0.3]} />
          <meshStandardMaterial color="#8b877f" roughness={0.95} />
        </mesh>
        {!cutaway && (
          <mesh position={[P.x, -0.07, P.z + (Wd + 2 * T) / 4 + 0.15]} receiveShadow>
            <boxGeometry args={[L + 2 * T, 0.14, (Wd + 2 * T) / 2 - 0.3]} />
            <meshStandardMaterial color="#8b877f" roughness={0.95} />
          </mesh>
        )}
        {[-1, 1].map((sx) => (
          <mesh key={`c${sx}`} position={[P.x + sx * ((L + 2 * T) / 4 + 0.15), -0.07, P.z]} receiveShadow>
            <boxGeometry args={[(L + 2 * T) / 2 - 0.3, 0.14, 0.6]} />
            <meshStandardMaterial color="#8b877f" roughness={0.95} />
          </mesh>
        ))}
        {/* manhole collar + sliding lid */}
        <mesh position={[P.x, 0.02, P.z]}>
          <boxGeometry args={[0.78, 0.04, 0.78]} />
          <meshStandardMaterial color="#77736b" roughness={0.9} />
        </mesh>
        <mesh ref={lid} position={[P.x, 0.03, P.z]} castShadow>
          <boxGeometry args={[0.62, 0.06, 0.62]} />
          <meshStandardMaterial color="#5e5b56" roughness={0.8} metalness={0.2} />
        </mesh>
      </group>

      {/* -------- contents -------- */}
      <mesh ref={column} material={sludge.mat}>
        <boxGeometry />
      </mesh>
      <mesh ref={rathole}>
        <coneGeometry args={[1, 1, 20, 1, true]} />
        <meshStandardMaterial color="#9fd4df" transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
      <instancedMesh ref={swirl} args={[undefined, undefined, NS]}>
        <sphereGeometry args={[0.014, 6, 4]} />
        <meshBasicMaterial />
      </instancedMesh>

      {/* -------- lance (tip at group origin) -------- */}
      <group ref={lance}>
        <mesh position={[0, (0.3 + LANCE_TOP - 0.05) / 2, 0]} castShadow>
          <cylinderGeometry args={[0.038, 0.038, LANCE_TOP - 0.35, 14]} />
          <meshStandardMaterial color="#c5ccd3" metalness={0.75} roughness={0.32} />
        </mesh>
        <mesh position={[0, 0.175, 0]}>
          <cylinderGeometry args={[0.044, 0.044, 0.25, 16, 1, true]} />
          <meshStandardMaterial color="#3d434a" metalness={0.6} roughness={0.5} wireframe />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.04, 16]} />
          <meshStandardMaterial color="#9aa3ad" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh ref={auger} geometry={augerGeo} position={[0, 0.05, 0]}>
          <meshStandardMaterial color="#e3b11f" metalness={0.5} roughness={0.35} />
        </mesh>
        <group ref={jets} position={[0, 0.06, 0]}>
          {[-1, 1].map((sx) => (
            <mesh key={sx} rotation={[0, 0, sx * 2.35]} position={[sx * 0.05, 0, 0]}>
              <coneGeometry args={[0.05, 1, 12, 1, true]} />
              <meshBasicMaterial color="#bfeaf5" transparent opacity={0.45} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
        {/* top elbow */}
        <mesh position={[0.07, LANCE_TOP - 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.042, 0.042, 0.16, 12]} />
          <meshStandardMaterial color="#c5ccd3" metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0, LANCE_TOP, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.05, 14]} />
          <meshStandardMaterial color="#2c3138" />
        </mesh>
      </group>

      {/* -------- davit tripod -------- */}
      <group ref={tripod}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} ref={(m) => (legs.current[i] = m)} castShadow>
            <cylinderGeometry args={[0.028, 0.028, 1, 8]} />
            <meshStandardMaterial color="#d9a521" metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
        <mesh ref={cable}>
          <cylinderGeometry args={[0.005, 0.005, 1, 4]} />
          <meshBasicMaterial color="#1e2226" />
        </mesh>
      </group>
    </group>
  );
}
