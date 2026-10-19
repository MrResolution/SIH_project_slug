import { useMemo } from 'react';
import * as THREE from 'three';
import { E1 } from '../data/scenes/e1';
import { useSim } from '../store/simStore';

/**
 * Cutaway box in front of the septic tank: the terrain inside it is clipped
 * (clipIntersection = the box only) and replaced by an excavation with soil
 * section faces, so the tank and its stratified contents are visible.
 */
export const CUT = {
  x0: E1.pit.x - 1.6,
  x1: E1.pit.x + 1.6,
  z0: E1.pit.z - 0.74,
  z1: E1.pit.z + 3.1,
  floor: -2.95,
};

const planes = [
  new THREE.Plane(new THREE.Vector3(1, 0, 0), -CUT.x1),
  new THREE.Plane(new THREE.Vector3(-1, 0, 0), CUT.x0),
  new THREE.Plane(new THREE.Vector3(0, 0, 1), -CUT.z1),
  new THREE.Plane(new THREE.Vector3(0, 0, -1), CUT.z0),
];

export function useCutawayPlanes(): THREE.Plane[] {
  const on = useSim((s) => s.view.cutaway);
  return useMemo(() => (on ? planes : []), [on]);
}
