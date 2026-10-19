export const fmt = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(d));
export const fmtInt = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('en-IN'));
export const signed = (v: number, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);

const p2 = (n: number) => String(Math.floor(n)).padStart(2, '0');

/** Time of day (seconds since midnight) → HH:MM:SS. */
export function clock(s: number) {
  const d = ((s % 86400) + 86400) % 86400;
  return `${p2(d / 3600)}:${p2((d % 3600) / 60)}:${p2(d % 60)}`;
}
/** Duration → M:SS or H:MM:SS. */
export function dur(s: number) {
  const v = Math.max(0, s);
  if (v >= 3600) return `${Math.floor(v / 3600)}:${p2((v % 3600) / 60)}:${p2(v % 60)}`;
  return `${Math.floor(v / 60)}:${p2(v % 60)}`;
}
/** Sim time → mm:ss for the event log. */
export const tstamp = (s: number) => `${p2(s / 60)}:${p2(s % 60)}`;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function download(name: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
