/**
 * Shared colour ramps (UI + 3D). Lightness falls monotonically along each
 * ramp so the order still reads without hue (colour-blind safe).
 */
type Stop = [number, [number, number, number]];

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function ramp(stops: [number, string][]): Stop[] {
  return stops.map(([v, h]) => [v, hex(h)]);
}

function sample(stops: Stop[], v: number): [number, number, number] {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const t = (v - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
    }
  }
  return stops[stops.length - 1][1];
}

/** Total solids, % — liquid (pale) → conditioned slurry (green, ≤ 12 %) → cake (dark). */
export const TS_STOPS = ramp([
  [0, '#cfeef7'],
  [3, '#8fd2e2'],
  [7, '#56b8a6'],
  [11, '#8fb64a'],
  [14, '#d6a23a'],
  [18, '#b85a2b'],
  [24, '#4d2216'],
]);
/** Yield stress, log10(Pa) from 0 (1 Pa) to 2.5 (≈ 316 Pa). */
export const TAU_STOPS = ramp([
  [0, '#cfeef7'],
  [0.7, '#8fd2e2'],
  [1.2, '#56b8a6'],
  [1.6, '#8fb64a'],
  [1.95, '#d6a23a'],
  [2.25, '#b85a2b'],
  [2.5, '#4d2216'],
]);
/** Mobility 0..1 (immobile dark → fully mobile pale). */
export const MOB_STOPS = ramp([
  [0, '#3b1d14'],
  [0.25, '#8a3f22'],
  [0.5, '#c98b34'],
  [0.75, '#7fb35a'],
  [1, '#c8ecf3'],
]);
/** Pressure along the hose, bar (0 → 22, red pulsing above the 20 bar relief). */
export const P_STOPS = ramp([
  [0, '#2d63c4'],
  [4, '#2aa4c9'],
  [9, '#3fbf8a'],
  [14, '#d8c645'],
  [19, '#f0883a'],
  [22, '#ff4545'],
]);

export const rgb = (c: [number, number, number]) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
export const tsColor = (ts: number) => sample(TS_STOPS, ts);
export const tauColor = (tau: number) => sample(TAU_STOPS, Math.log10(Math.max(1, tau)));
export const mobColor = (m: number) => sample(MOB_STOPS, m);
export const pColor = (bar: number) => sample(P_STOPS, bar);

export const cssGradient = (stops: Stop[], lo: number, hi: number) =>
  `linear-gradient(90deg, ${stops.map(([v, c]) => `${rgb(c)} ${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`).join(', ')})`;

/** Series colours for charts (validated against the dark panel). */
export const SERIES = {
  blue: '#4fc3ff',
  orange: '#f5a142',
  green: '#3fd29a',
  violet: '#a99bff',
  red: '#ff6b6f',
  yellow: '#ecd35a',
  teal: '#3cc9c4',
  grey: '#9aa6b8',
};
