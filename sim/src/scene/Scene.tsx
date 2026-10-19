import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { useSim } from '../store/simStore';
import { SCENARIOS } from '../data/scenes';
import { Environment } from './Environment';
import { PitCutaway } from './PitCutaway';
import { Crawler } from './Crawler';
import { Hoses } from './Hoses';
import { SiteProps } from './SiteProps';
import { CameraRig } from './CameraRig';
import { Labels } from './Labels';

/** Winter-morning sun: azimuth ≈ 140° (SE), elevation ≈ 24°. +x east, −z north (uphill). */
function sunDir(timeOfDay_h: number) {
  const az = ((90 + (timeOfDay_h - 6) * 15) * Math.PI) / 180;
  const el = (Math.max(6, 34 - Math.abs(timeOfDay_h - 12.5) * 4.2) * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

export function Scene() {
  const scenarioId = useSim((s) => s.scenarioId);
  const sc = SCENARIOS[scenarioId];
  const snow = sc?.site.weather === 'snow';
  const { scene, gl } = useThree();
  const sun = useMemo(() => sunDir(sc?.startTime_h ?? 9.5), [sc]);

  useEffect(() => {
    scene.fog = new THREE.Fog('#b8c6d4', 140, 900);
    scene.background = new THREE.Color('#b8c6d4');
    gl.localClippingEnabled = true;
  }, [scene, gl]);

  const sunPos = sun.clone().multiplyScalar(120);
  return (
    <>
      <Sky distance={4500} sunPosition={[sun.x * 100, sun.y * 100, sun.z * 100]} turbidity={7} rayleigh={1.1} mieCoefficient={0.006} mieDirectionalG={0.86} />
      <hemisphereLight args={['#d7e6f7', '#5f5446', 0.95]} />
      <ambientLight intensity={0.12} />
      <directionalLight
        position={[sunPos.x, sunPos.y, sunPos.z]}
        intensity={2.1}
        color="#fff2dd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-near={10}
        shadow-camera-far={400}
      />
      <Environment snow={snow} />
      <PitCutaway />
      <Crawler />
      <Hoses />
      <SiteProps snow={snow} />
      <Labels />
      <CameraRig />
    </>
  );
}
