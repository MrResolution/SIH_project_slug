import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { E1, E1_HOSE_ROUTE, E1_LANE } from '../data/scenes/e1';
import { useSim } from '../store/simStore';
import { pColor, tsColor } from '../ui/colors';
import { PolylineCurve, sagCurve } from './geom';
import { LANCE_TOP } from './PitCutaway';

/**
 * Hose material: rubber when opaque; in X-ray the filled length shows the
 * pressure (or TS) ramp with stripes scrolling at the flow velocity, the
 * sludge front as a hard edge, and a red pulse above the 20 bar relief.
 */
function makeHoseMaterial(base: string, lengthM: number) {
  const data = new Uint8Array(64 * 4);
  const tex = new THREE.DataTexture(data, 64, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTex: { value: tex },
      uFill: { value: 0 },
      uFrom: { value: 0 },
      uTime: { value: 0 },
      uSpeed: { value: 0 },
      uXray: { value: 0 },
      uLen: { value: lengthM },
      uBase: { value: new THREE.Color(base) },
      uLight: { value: new THREE.Vector3(0.45, 0.8, 0.4).normalize() },
      uAlarm: { value: 0 },
      fogColor: { value: new THREE.Color() },
      fogNear: { value: 1 },
      fogFar: { value: 2000 },
    },
    fog: true,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN;
      #include <fog_pars_vertex>
      void main(){
        vUv = uv; vN = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform float uFill; uniform float uFrom; uniform float uTime; uniform float uSpeed; uniform float uXray; uniform float uLen; uniform vec3 uBase; uniform vec3 uLight; uniform float uAlarm;
      varying vec2 vUv; varying vec3 vN;
      #include <fog_pars_fragment>
      void main(){
        float s = vUv.x;
        if (s < uFrom) discard;
        vec3 n = normalize(vN);
        float l = 0.42 + 0.58 * max(dot(n, normalize((viewMatrix * vec4(uLight, 0.0)).xyz)), 0.0);
        vec4 prof = texture2D(uTex, vec2(s, 0.5));
        vec3 col; float a = 1.0;
        if (uXray > 0.5) {
          if (s <= uFill) {
            col = prof.rgb;
            float stripe = step(0.55, fract((s * uLen - uTime * uSpeed) * 1.4));
            col *= 0.82 + 0.3 * stripe;
            if (prof.a > 0.5) col = mix(col, vec3(1.0, 0.18, 0.2), 0.45 + 0.45 * sin(uTime * 9.0));
            float edge = smoothstep(uFill - 0.004, uFill, s);
            col = mix(col, vec3(1.0), edge * 0.6);
            a = 0.97;
          } else { col = vec3(0.32, 0.38, 0.46); a = 0.32; }
          col *= 0.75 + 0.35 * l;
        } else {
          col = uBase * l;
          // faint reinforcement bands
          col *= 0.94 + 0.06 * step(0.5, fract(s * uLen * 2.0));
        }
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  return { mat, tex, data };
}

/** Skid connection points in crawler-local coordinates. */
const LOCAL = {
  cubeInlet: new THREE.Vector3(-0.17, 0.75, -0.21),
  jetTee: new THREE.Vector3(0.17, 0.62, 0.24),
  controller: new THREE.Vector3(-0.2, 0.55, 0.23),
};

function parkWorld(v: THREE.Vector3) {
  // The crawler parks at the end of the lane heading +z (yaw 0).
  return new THREE.Vector3(E1.park.x + v.x, E1.park.y + v.y, E1.park.z + v.z);
}

export function Hoses() {
  const discharge = useMemo(() => {
    const g = new THREE.TubeGeometry(new PolylineCurve(E1_HOSE_ROUTE), 1100, 0.045, 8, false);
    return { geo: g, ...makeHoseMaterial('#2b5a8a', E1_HOSE_ROUTE.length) };
  }, []);
  const suction = useMemo(() => makeHoseMaterial('#2a2e33', 4), []);
  const suctionMesh = useRef<THREE.Mesh>(null);
  const jetMesh = useRef<THREE.Mesh>(null);
  const cableMesh = useRef<THREE.Mesh>(null);
  const ductMesh = useRef<THREE.Mesh>(null);
  const lastLance = useRef(-1);
  const time = useRef(0);

  useFrame((_, dt) => {
    const st = useSim.getState();
    const s = st.snap;
    if (!s) return;
    time.current += dt;
    const xray = st.view.xray ? 1 : 0;

    // ---- discharge hose ----
    const u = discharge.mat.uniforms;
    u.uXray.value = xray;
    u.uTime.value = time.current;
    u.uFill.value = s.hose.fill;
    const v = s.hose.q_lpm / 60000 / ((Math.PI * s.hose.d_m * s.hose.d_m) / 4);
    u.uSpeed.value = v * 3 * Math.min(st.speed, 4);
    const laneLeft = E1_LANE.length - s.vehicle.s_m;
    u.uFrom.value = s.vehicle.atPit ? 0 : Math.min(0.985, Math.max(0, (laneLeft + 1.5) / E1_HOSE_ROUTE.length));
    const d = discharge.data;
    const prof = s.hose.pProfile;
    const tsP = s.hose.tsProfile;
    for (let k = 0; k < 64; k++) {
      const f = (k / 63) * (prof.length - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(prof.length - 1, i0 + 1);
      const p = prof[i0] + (prof[i1] - prof[i0]) * (f - i0);
      const c = st.view.heat === 'ts' && tsP[i0] >= 0 && !xray ? tsColor(tsP[i0]) : pColor(p);
      d[k * 4] = c[0];
      d[k * 4 + 1] = c[1];
      d[k * 4 + 2] = c[2];
      d[k * 4 + 3] = p > 20 ? 255 : 0;
    }
    discharge.tex.needsUpdate = true;

    // ---- suction hose: lance top → cube inlet (rebuilt when the lance moves) ----
    const connected = s.equip.tripod >= 1 && s.vehicle.atPit;
    if (suctionMesh.current) {
      suctionMesh.current.visible = connected;
      const lz = s.equip.lanceZ_m;
      if (connected && Math.abs(lz - lastLance.current) > 0.01) {
        lastLance.current = lz;
        const top = new THREE.Vector3(E1.pit.x + 0.14, -s.pit.depth_m + lz + LANCE_TOP - 0.05, E1.pit.z);
        const inlet = parkWorld(LOCAL.cubeInlet);
        suctionMesh.current.geometry.dispose();
        suctionMesh.current.geometry = new THREE.TubeGeometry(sagCurve(top, inlet, 0, 0.4), 60, 0.045, 8, false);
        if (jetMesh.current) {
          jetMesh.current.geometry.dispose();
          jetMesh.current.geometry = new THREE.TubeGeometry(sagCurve(top.clone().add(new THREE.Vector3(-0.08, 0, 0.06)), parkWorld(LOCAL.jetTee), 0, 0.5), 60, 0.016, 6, false);
        }
      }
      const su = suction.mat.uniforms;
      su.uXray.value = xray;
      su.uTime.value = time.current;
      su.uFill.value = s.suction.riserFill;
      su.uSpeed.value = (s.suction.q_lpm / 60000 / 0.00456) * 3;
      const c = tsColor(s.suction.tsMix);
      for (let k = 0; k < 64; k++) {
        suction.data[k * 4] = c[0];
        suction.data[k * 4 + 1] = c[1];
        suction.data[k * 4 + 2] = c[2];
        suction.data[k * 4 + 3] = 0;
      }
      suction.tex.needsUpdate = true;
    }
    if (jetMesh.current) jetMesh.current.visible = connected;
    if (cableMesh.current) cableMesh.current.visible = s.equip.snifferPlaced && s.vehicle.atPit;
    if (ductMesh.current) ductMesh.current.visible = s.equip.blowerOn;
  });

  const cableGeo = useMemo(() => {
    const a = new THREE.Vector3(E1.pit.x - 0.36, 0.05, E1.pit.z + 0.3);
    return new THREE.TubeGeometry(sagCurve(a, parkWorld(LOCAL.controller), 0, 0.3), 40, 0.006, 4, false);
  }, []);
  const ductGeo = useMemo(() => {
    const a = new THREE.Vector3(E1.pit.x + 1.05, 0.32, E1.pit.z + 0.55);
    const b = new THREE.Vector3(E1.pit.x + 0.22, -0.25, E1.pit.z + 0.12);
    const curve = new THREE.CatmullRomCurve3([a, new THREE.Vector3(E1.pit.x + 0.75, 0.42, E1.pit.z + 0.42), new THREE.Vector3(E1.pit.x + 0.32, 0.22, E1.pit.z + 0.2), b]);
    return new THREE.TubeGeometry(curve, 30, 0.06, 10, false);
  }, []);

  return (
    <group>
      <mesh geometry={discharge.geo} material={discharge.mat} castShadow />
      <mesh ref={suctionMesh} material={suction.mat}>
        <bufferGeometry />
      </mesh>
      <mesh ref={jetMesh}>
        <bufferGeometry />
        <meshStandardMaterial color="#9b2f28" roughness={0.6} />
      </mesh>
      <mesh ref={cableMesh} geometry={cableGeo}>
        <meshStandardMaterial color="#141618" />
      </mesh>
      <mesh ref={ductMesh} geometry={ductGeo}>
        <meshStandardMaterial color="#c9b56a" roughness={0.8} />
      </mesh>
    </group>
  );
}
