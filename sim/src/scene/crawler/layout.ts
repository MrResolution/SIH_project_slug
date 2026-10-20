import * as THREE from 'three';
import { SKID_OUTLET_H } from '../../data/scenes/e1';

/**
 * Crawler B general arrangement, in one place so the meshes, the hose attach
 * points (Hoses.tsx) and the label anchors (Labels.tsx) always agree.
 *
 * Local frame: +z forward (direction of travel), y up, origin at the centre of
 * the track contact patch. +x is the PCP side, the side most camera presets
 * look at. Metres. Overall width 750 mm (MOB-01).
 *
 * Layout after docs/03 §7: hose reel at the front; PCP + motor, surge cube +
 * vane pump and controller on the 950 × 680 ISO skid; PPE locker and decon
 * sprayer on the rear deck; probe lance and davit tripod stowed on the roof
 * rack; outriggers at the four deck corners (MOB-04).
 */

/** Half of the 750 mm overall width. */
export const HALF_W = 0.375;

export const TRACK = {
  /** Belt centreline (outer edge at 0.375). */
  x: 0.285,
  /** 180 mm rubber track. */
  width: 0.18,
  /** Carcass thickness. */
  belt: 0.03,
  /** Tread lug height (the vehicle stands on the lugs, so y = 0 is the lug face). */
  lug: 0.018,
  lugPitch: 0.072,
  /** Rear drive sprocket and front idler: belt inner radius around each. */
  sprocket: { z: -0.7, r: 0.135 },
  idler: { z: 0.7, r: 0.125 },
  rollers: [-0.42, -0.14, 0.14, 0.42],
  rollerR: 0.05,
  carrierR: 0.035,
} as const;
export const SPROCKET_Y = TRACK.lug + TRACK.belt + TRACK.sprocket.r;
export const IDLER_Y = TRACK.lug + TRACK.belt + TRACK.idler.r;

/** Chassis tub between the tracks (battery bay). */
export const TUB = { w: 0.38, y0: 0.12, y1: 0.37, l: 1.48 };
export const DECK = { y0: 0.38, y1: 0.43, l: 1.82, w: 0.74 };
/** ISO quick-release skid frame, 950 × 680 mm, 4 twist-locks (docs/03 §6). */
export const SKID = { x: 0.32, top: 0.48, z0: -0.66, z1: 0.29 };

export const REEL = {
  y: 0.78,
  z: 0.62,
  /** Flange radius. */
  R: 0.3,
  /** Flange half-spacing. */
  halfW: 0.235,
  hub: 0.11,
  /** Coil radius with the full 150 m wound on. */
  full: 0.28,
  cap_m: 150,
};

/** Progressive cavity pump train along z on the +x side; stations are [z0, z1]. */
export const PCP = {
  x: 0.18,
  y: 0.57,
  cowl: [-0.89, -0.86],
  motor: [-0.86, -0.66],
  gearbox: [-0.66, -0.56],
  bearing: [-0.56, -0.48],
  suction: [-0.48, -0.34],
  stator: [-0.34, 0.2],
  discharge: [0.2, 0.3],
  /** Stator pitch (2 × rotor pitch); the stator is 3 pitches long. */
  statorPitch: 0.18,
  /** Rotor eccentricity. */
  e: 0.012,
} as const;

export const CUBE = { x: -0.16, y: 0.69, z: -0.44, w: 0.36, h: 0.4, d: 0.4, cap_L: 90 };
export const CTRL = { x: -0.19, z: 0, w: 0.28, h: 0.26, d: 0.3 };
/** Tubular roof frame (two hoops, side rails, a middle cross-bar). */
export const ROOF = { x: 0.358, y: 1.12, zF: 0.22, zM: -0.23, zR: -0.68, r: 0.016 };
/** Discharge hose run across the roof rollers. */
export const HOSE_RUN_X = 0.18;
export const HOSE_R = 0.045;

/**
 * The discharge hose leaves the rear fairlead here. Must equal the first point
 * of E1_HOSE_ROUTE (data/scenes/e1.ts: park + (0.25, SKID_OUTLET_H, −0.7)).
 */
export const HOSE_EXIT = new THREE.Vector3(0.25, SKID_OUTLET_H, -0.7);

/** PCP discharge riser and the fittings on it. */
export const RISER = { z: 0.25, top: 0.9, jetY: 0.7, gaugeY: 0.82 };

/** Surge-cube inlet gooseneck: riser from the lid, then a 3" cam-lock facing +x (towards the pit side). */
export const GOOSENECK = { x: -0.04, z: -0.3, y: 1.04 };

/** Connection points and label anchors in crawler-local coordinates. */
export const ATTACH = {
  /** 3" cam-lock on the surge-cube inlet gooseneck (suction hose from the lance). */
  cubeInlet: new THREE.Vector3(0.085, GOOSENECK.y, GOOSENECK.z),
  /** The suction hose leaves the machine over the +x deck edge here, between the roof hoops. */
  suctionOut: new THREE.Vector3(0.52, 0.98, GOOSENECK.z + 0.04),
  /** V-01 outlet port on the jetting branch (1" jet hose to the lance). */
  jetTee: new THREE.Vector3(0.31, RISER.jetY, RISER.z),
  /** GD-01 sniffer socket on the junction box at the +x front corner. */
  sniffer: new THREE.Vector3(0.38, 0.55, 0.13),
  /** PT-02 discharge pressure gauge. */
  pt02: new THREE.Vector3(0.235, RISER.gaugeY, RISER.z),
  /** Top of the surge cube (LT-01 / PT-01). */
  cube: new THREE.Vector3(CUBE.x, CUBE.y + CUBE.h / 2, CUBE.z),
};
