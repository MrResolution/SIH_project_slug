import type { ReactNode } from 'react';
import { StateGlyph } from './TopBar';

export type Tone = '' | 'ok' | 'warn' | 'alarm';

export interface BarSpec {
  value: number;
  min: number;
  max: number;
  marks?: { at: number; tone?: 'warn' | 'alarm' | '' }[];
  color?: string;
}

export function Tile({ label, tag, value, unit, sub, tone = '', bar, compact, title, children }: { label: string; tag?: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: Tone; bar?: BarSpec; compact?: boolean; title?: string; children?: ReactNode }) {
  const frac = bar ? Math.max(0, Math.min(1, (bar.value - bar.min) / (bar.max - bar.min))) : 0;
  const color = bar?.color ?? (tone === 'alarm' ? 'var(--alarm)' : tone === 'warn' ? 'var(--warn)' : tone === 'ok' ? 'var(--ok)' : 'var(--accent)');
  return (
    <div className={`tile ${tone} ${compact ? 'compact' : ''}`} title={title}>
      <div className="lbl">
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {tone === 'alarm' || tone === 'warn' ? (
            <span style={{ color: tone === 'alarm' ? 'var(--alarm)' : 'var(--warn)', display: 'inline-flex' }}>
              <StateGlyph tone={tone} size={8} />
            </span>
          ) : null}
          {label}
        </span>
        {tag && <span className="tagname">{tag}</span>}
      </div>
      <div className="val">
        {value}
        {unit && <span className="u">{unit}</span>}
      </div>
      {bar && (
        <div className="bar">
          <div className="fill" style={{ width: `${frac * 100}%`, background: color }} />
          {bar.marks?.map((m, i) => (
            <div key={i} className={`mark ${m.tone ?? ''}`} style={{ left: `calc(${(((m.at - bar.min) / (bar.max - bar.min)) * 100).toFixed(2)}% - 1px)` }} />
          ))}
        </div>
      )}
      {sub && <div className="sub">{sub}</div>}
      {children}
    </div>
  );
}

/** 240° arc gauge with coloured bands and a needle (PT-02 discharge pressure). */
export function Dial({ value, min, max, bands, label, unit, size = 150, ticks = [0, 5, 10, 15, 20, 25, 30], sub }: { value: number; min: number; max: number; bands: { from: number; to: number; color: string }[]; label: string; unit: string; size?: number; ticks?: number[]; sub?: ReactNode }) {
  const r = size * 0.4;
  const cx = size / 2;
  const cy = size * 0.52;
  const a0 = (-210 * Math.PI) / 180;
  const a1 = (30 * Math.PI) / 180;
  const ang = (v: number) => a0 + ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (a1 - a0);
  const pt = (a: number, rr: number) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  const arc = (from: number, to: number, rr: number) => {
    const [x0, y0] = pt(ang(from), rr);
    const [x1, y1] = pt(ang(to), rr);
    const large = ang(to) - ang(from) > Math.PI ? 1 : 0;
    return `M ${x0} ${y0} A ${rr} ${rr} 0 ${large} 1 ${x1} ${y1}`;
  };
  const na = ang(value);
  const [nx, ny] = pt(na, r * 0.86);
  return (
    <svg width={size} height={size * 0.82} viewBox={`0 0 ${size} ${size * 0.82}`} role="img" aria-label={`${label} ${value.toFixed(1)} ${unit}`}>
      <path d={arc(min, max, r)} stroke="#222a36" strokeWidth={9} fill="none" strokeLinecap="round" />
      {bands.map((b, i) => (
        <path key={i} d={arc(b.from, b.to, r)} stroke={b.color} strokeWidth={9} fill="none" opacity={0.85} />
      ))}
      <path d={arc(min, value, r - 11)} stroke="rgba(79,195,255,0.55)" strokeWidth={3} fill="none" strokeLinecap="round" />
      {ticks.map((t) => {
        const a = ang(t);
        const [x0, y0] = pt(a, r + 7);
        const [x1, y1] = pt(a, r + 2);
        const [tx, ty] = pt(a, r + 15);
        return (
          <g key={t}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#4c5768" strokeWidth={1.2} />
            <text x={tx} y={ty + 3} textAnchor="middle" fontSize={8.5} fill="#6b7789" fontFamily="var(--mono)">
              {t}
            </text>
          </g>
        );
      })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#e6ebf2" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4.5} fill="#e6ebf2" />
      <text x={cx} y={cy + r * 0.52} textAnchor="middle" fontSize={20} fontWeight={600} fill="#e6ebf2" fontFamily="var(--mono)">
        {value.toFixed(1)}
      </text>
      <text x={cx} y={cy + r * 0.52 + 13} textAnchor="middle" fontSize={9.5} fill="#6b7789">
        {unit} · {label}
      </text>
      {sub}
    </svg>
  );
}

/** Circular progress ring (ventilation timer). */
export function Ring({ frac, size = 64, color, children }: { frac: number; size?: number; color: string; children?: ReactNode }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#222a36" strokeWidth={6} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={6} fill="none" strokeDasharray={`${c * Math.max(0, Math.min(1, frac))} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}

/** Vertical level bar with low / high marks (LT-01). */
export function LevelBar({ frac, marks, color = 'var(--sludge)', height = 74, width = 26 }: { frac: number; marks: { at: number; label: string }[]; color?: string; height?: number; width?: number }) {
  return (
    <div style={{ position: 'relative', width: width + 26, height }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width, height, borderRadius: 5, border: '1px solid var(--line-3)', background: '#0c1117', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: `linear-gradient(180deg, ${color}, #5a4325)`, transition: 'height .25s' }} />
      </div>
      {marks.map((m) => (
        <div key={m.label} style={{ position: 'absolute', left: width - 4, bottom: `${m.at * 100}%`, display: 'flex', alignItems: 'center', gap: 3, transform: 'translateY(50%)' }}>
          <div style={{ width: 8, height: 1.5, background: 'var(--text-3)' }} />
          <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>{m.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Section({ title, tag, right, children }: { title: string; tag?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="sec-head">
        <div className="sec-title">
          {title}
          {tag && <span className="tag">{tag}</span>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
