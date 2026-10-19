import { Polyline, v3, type Vec3 } from '../../core/geometry/route';

/**
 * E1 · Himalayan terraced village (Mussoorie / Shimla style, 2,200 m).
 *
 * World axes: y up, the hillside descends towards +z. The motorable road runs
 * along x at the top (y = 37.3 m); a stepped lane of seven stair flights
 * (≈ 31°, 0.17 m risers on 0.28 m treads) and terrace landings drops 37.3 m to
 * the courtyard of household HH-07, where the septic tank is.
 *
 * Everything here is plain data shared by the physics core (hose profile,
 * vehicle pitch) and the renderer (stairs, terrain carve, hose tube).
 * @see docs/simulation/04 §1 (E1) and §5.2 (stairs from one definition)
 */

export const E1_ROAD_Y = 37.3;
export const E1_ROAD_Z = -62;
export const E1_RISER_TARGET = 0.17;
export const E1_TREAD = 0.28;
export const E1_LANE_WIDTH = 1.1;

type Move = { kind: 'landing'; dx: number; dz: number } | { kind: 'flight'; drop: number };

/** Compact description of the lane from the road downwards. */
const MOVES: Move[] = [
  { kind: 'landing', dx: 0, dz: 4 },
  { kind: 'flight', drop: 6.3 },
  { kind: 'landing', dx: 0, dz: 1.5 },
  { kind: 'landing', dx: 8, dz: 0 },
  { kind: 'landing', dx: 0, dz: 1.2 },
  { kind: 'flight', drop: 5.6 },
  { kind: 'landing', dx: 0, dz: 1.5 },
  { kind: 'landing', dx: -9, dz: 0 },
  { kind: 'landing', dx: 0, dz: 1.2 },
  { kind: 'flight', drop: 5.6 },
  { kind: 'landing', dx: 0, dz: 1.5 },
  { kind: 'landing', dx: 8, dz: 0 },
  { kind: 'landing', dx: 0, dz: 1.2 },
  { kind: 'flight', drop: 5.6 },
  { kind: 'landing', dx: 0, dz: 1.5 },
  { kind: 'landing', dx: -8, dz: 0 },
  { kind: 'landing', dx: 0, dz: 1.2 },
  { kind: 'flight', drop: 5.0 },
  { kind: 'landing', dx: 0, dz: 1.5 },
  { kind: 'landing', dx: 7, dz: 0 },
  { kind: 'landing', dx: 0, dz: 1.2 },
  { kind: 'flight', drop: 4.6 },
  { kind: 'landing', dx: 0, dz: 1.5 },
  { kind: 'landing', dx: -6, dz: 0 },
  { kind: 'landing', dx: 0, dz: 1.2 },
  { kind: 'flight', drop: 4.6 },
  { kind: 'landing', dx: 0, dz: 4 },
];

export interface LaneSegment {
  kind: 'landing' | 'flight';
  a: Vec3;
  b: Vec3;
  /** Flights only. */
  steps?: number;
  riser?: number;
  tread?: number;
}

function buildLane(): { segments: LaneSegment[]; nodes: Vec3[] } {
  let p = v3(0, E1_ROAD_Y, -60);
  const nodes: Vec3[] = [p];
  const segments: LaneSegment[] = [];
  for (const m of MOVES) {
    if (m.kind === 'landing') {
      const q = v3(p.x + m.dx, p.y, p.z + m.dz);
      segments.push({ kind: 'landing', a: p, b: q });
      p = q;
    } else {
      const steps = Math.round(m.drop / E1_RISER_TARGET);
      const riser = m.drop / steps;
      const q = v3(p.x, p.y - m.drop, p.z + steps * E1_TREAD);
      segments.push({ kind: 'flight', a: p, b: q, steps, riser, tread: E1_TREAD });
      p = q;
    }
    nodes.push(p);
  }
  return { segments, nodes };
}

const lane = buildLane();
export const E1_LANE_SEGMENTS = lane.segments;
/** Lane centreline from the road (s = 0) to the courtyard. */
export const E1_LANE = new Polyline(lane.nodes);
export const E1_LANE_END = lane.nodes[lane.nodes.length - 1];

/** Key locations (world coordinates). */
export const E1 = {
  courtyard: { x0: -3, x1: 8.5, z0: E1_LANE_END.z - 4.2, z1: 34 },
  /** Septic tank of HH-07 (box 2.0 × 1.2 m, long side along x). Centre of the top slab. */
  pit: v3(1.7, 0, 28.6),
  manhole: v3(1.7, 0, 28.6),
  /** Crawler parking pose at the bottom of the lane (heading +z). */
  park: v3(E1_LANE_END.x, 0, E1_LANE_END.z),
  /** Road tanker, parked along the road (heading −x). */
  tanker: v3(-5.5, E1_ROAD_Y, -63.2),
  tankerInlet: v3(-2.6, E1_ROAD_Y + 1.6, -61.9),
  /** Operator stand-off with the pendant: ≥ 5 m from the manhole, upwind (wind from +x). */
  operator: v3(6.9, 0, 26.2),
  house: { x0: -10.5, x1: -3.6, z0: 25.5, z1: 33.5 },
  /** Wind blows from the east (+x) towards −x. */
  windFrom_deg: 90,
};

/** Height of the PCP outlet on the crawler deck above the ground. */
export const SKID_OUTLET_H = 0.9;

/**
 * Discharge hose route: PCP outlet on the parked crawler → up the lane → road →
 * tanker inlet. s = 0 at the PCP. Offset 0.32 m to the right of the centreline so
 * the crawler does not run over it.
 */
function buildHoseRoute(): Polyline {
  const pts: Vec3[] = [];
  const outlet = v3(E1.park.x + 0.25, SKID_OUTLET_H, E1.park.z - 0.7);
  pts.push(outlet);
  pts.push(v3(E1.park.x + 0.32, 0.05, E1.park.z - 1.4));
  const rev = [...lane.nodes].reverse();
  for (let i = 1; i < rev.length; i++) {
    const n = rev[i];
    pts.push(v3(n.x + 0.32, n.y + 0.05, n.z));
  }
  pts.push(v3(E1.tankerInlet.x + 1.2, E1_ROAD_Y + 0.05, E1.tankerInlet.z + 0.4));
  pts.push(E1.tankerInlet);
  return new Polyline(pts);
}

export const E1_HOSE_ROUTE = buildHoseRoute();
