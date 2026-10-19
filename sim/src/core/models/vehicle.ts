import type { Polyline } from '../geometry/route';
import type { Params } from '../params';
import type { VehicleState } from '../state';
import { G, lag, radToDeg } from '../units';

/**
 * Tier 3 · Mule. Kinematic "rail" crawler along the lane centreline — the
 * fallback mode docs/simulation/07 §7 specifies for Demo (Rapier rigid-body
 * dynamics come later). Speed is lower on flights; pitch follows the lane and
 * travel energy is m·g·v·sinθ/η plus rolling resistance.
 */

const CRAWLER_LEN = 1.8;

export function stepVehicle(p: Params, v: VehicleState, lane: Polyline, travelEnable: boolean, parkTilt_deg: number, dt: number): number {
  let travelW = 0;
  const goal = v.target === 'pit' ? lane.length : v.target === 'road' ? 0 : null;
  if (goal !== null && travelEnable) {
    const dir = goal > v.s_m ? 1 : -1;
    const here = lane.sample(v.s_m);
    const slope = Math.abs(here.t.y) > 0.2;
    const vMax = slope ? p.vehicle.vStairs_ms : p.vehicle.vFlat_ms;
    v.v_ms = lag(v.v_ms, vMax, 0.8, dt);
    const ds = Math.min(Math.abs(goal - v.s_m), v.v_ms * dt);
    v.s_m += dir * ds;
    v.travel_m += ds;
    v.heading = dir as 1 | -1;
    v.moving = ds > 1e-6;
    // Climbing when moving against the descending lane.
    const sinUp = -here.t.y * dir;
    const m = p.vehicle.mass_kg;
    travelW = Math.max(250, (m * G * v.v_ms * Math.max(0, sinUp) + p.vehicle.crr * m * G * v.v_ms) / p.vehicle.etaDrive);
    if (Math.abs(goal - v.s_m) < 1e-6) {
      v.target = null;
      v.moving = false;
      v.v_ms = 0;
    }
  } else {
    v.moving = false;
    v.v_ms = 0;
  }
  // Pitch from the chord across the track length (smooths stair nosings).
  const a = lane.sample(v.s_m - CRAWLER_LEN / 2);
  const b = lane.sample(v.s_m + CRAWLER_LEN / 2);
  const dy = b.p.y - a.p.y;
  const dh = Math.hypot(b.p.x - a.p.x, b.p.z - a.p.z) || 1e-6;
  v.pitch_deg = lag(v.pitch_deg, radToDeg(Math.atan2(dy, dh)), 0.35, dt);
  v.atPit = v.s_m >= lane.length - 0.05;
  v.roll_deg = lag(v.roll_deg, v.atPit && !v.moving ? parkTilt_deg : 0, 1.5, dt);

  // Outriggers and chocks only deploy when parked.
  const parked = !v.moving;
  const oTarget = v.outriggersCmd && parked ? 1 : 0;
  v.outriggers = Math.max(0, Math.min(1, v.outriggers + Math.sign(oTarget - v.outriggers) * (dt / p.vehicle.outriggerTime_s)));
  const cTarget = v.chocksCmd && parked ? 1 : 0;
  v.chocks = Math.max(0, Math.min(1, v.chocks + Math.sign(cTarget - v.chocks) * (dt / p.vehicle.chockTime_s)));
  return travelW;
}

/** Working tilt seen by the inclinometer IN-01 (outriggers level the skid partially). */
export function workingTilt(v: VehicleState): number {
  const tilt = Math.hypot(v.pitch_deg, v.roll_deg);
  return v.outriggers >= 0.999 ? tilt * 0.35 : tilt;
}
