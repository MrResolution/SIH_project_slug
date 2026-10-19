import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import { HCOL, type HistoryColumn } from '../core';
import { useSim } from '../store/simStore';
import { SERIES } from './colors';
import { Section } from './widgets';

export interface SeriesSpec {
  col: HistoryColumn;
  label: string;
  color: string;
  scale?: string;
  dash?: number[];
}

const AXIS = { stroke: '#6b7789', grid: { stroke: '#1c232e', width: 1 }, ticks: { stroke: '#2a3443', width: 1, size: 4 }, font: '10px JetBrains Mono, monospace', size: 34 };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Live time-series chart over the worker history (uPlot, fast for 100 Hz data). */
export function TimeChart({ series, height = 116, windowS, yRange, y2Range, y2Label, yLabel }: { series: SeriesSpec[]; height?: number; windowS: number; yRange?: [number, number]; y2Range?: [number, number]; yLabel?: string; y2Label?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const win = useRef(windowS);
  win.current = windowS;

  useEffect(() => {
    if (!host.current) return;
    const hasY2 = series.some((s) => s.scale === 'y2');
    const opts: uPlot.Options = {
      width: host.current.clientWidth,
      height,
      padding: [6, hasY2 ? 4 : 10, 0, 0],
      cursor: { points: { size: 5 }, drag: { x: false, y: false } },
      legend: { show: false },
      scales: {
        x: { time: false },
        y: yRange ? { range: (_u, lo, hi) => [Math.min(yRange[0], lo), Math.max(yRange[1], hi)] } : {},
        ...(hasY2 ? { y2: y2Range ? { range: (_u, lo, hi) => [Math.min(y2Range[0], lo), Math.max(y2Range[1], hi)] } : {} } : {}),
      },
      axes: [
        { ...AXIS, values: (_u, v) => v.map(mmss), size: 22 },
        { ...AXIS, label: yLabel, labelSize: 12, labelFont: '10px Inter, sans-serif', values: (_u, v) => v.map((x) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(1))) },
        ...(hasY2 ? [{ ...AXIS, scale: 'y2', side: 1 as const, grid: { show: false }, label: y2Label, labelSize: 12, labelFont: '10px Inter, sans-serif' }] : []),
      ],
      series: [{}, ...series.map((s) => ({ label: s.label, stroke: s.color, width: 1.6, scale: s.scale ?? 'y', dash: s.dash, points: { show: false }, spanGaps: false }))],
    };
    const empty: uPlot.AlignedData = [[], ...series.map(() => [])];
    plot.current = new uPlot(opts, empty, host.current);
    const ro = new ResizeObserver(() => {
      if (host.current && plot.current) plot.current.setSize({ width: host.current.clientWidth, height });
    });
    ro.observe(host.current);

    let last = 0;
    const update = () => {
      const st = useSim.getState();
      const h = st.history;
      const t = h[HCOL.t] as number[];
      if (!t.length || !plot.current) return;
      const tEnd = t[t.length - 1];
      const t0 = win.current > 0 ? tEnd - win.current : t[0];
      let i0 = 0;
      if (win.current > 0) {
        let lo = 0;
        let hi = t.length - 1;
        while (lo < hi) {
          const m = (lo + hi) >> 1;
          if (t[m] < t0) lo = m + 1;
          else hi = m;
        }
        i0 = lo;
      }
      const data = [t.slice(i0), ...series.map((s) => h[HCOL[s.col]].slice(i0))] as uPlot.AlignedData;
      plot.current.setData(data, false);
      plot.current.setScale('x', { min: Math.max(t[0], t0), max: Math.max(tEnd, t0 + 10) });
    };
    update();
    const unsub = useSim.subscribe((s, prev) => {
      if (s.historyVersion === prev.historyVersion) return;
      const now = performance.now();
      if (now - last < 250) return;
      last = now;
      update();
    });
    return () => {
      unsub();
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
    // series identity is static per chart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  return <div ref={host} className="plot" style={{ width: '100%' }} />;
}

export function ChartCard({ title, series, ...rest }: { title: string; series: SeriesSpec[]; windowS: number; height?: number; yRange?: [number, number]; y2Range?: [number, number]; yLabel?: string; y2Label?: string }) {
  return (
    <div className="chart-card">
      <div className="ch-head">
        <span className="ch-title">{title}</span>
        <div className="legend-row">
          {series.map((s) => (
            <span key={s.col}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <TimeChart series={series} {...rest} />
    </div>
  );
}

const WINDOWS: [string, number][] = [
  ['2 min', 120],
  ['10 min', 600],
  ['30 min', 1800],
  ['All', 0],
];

export function Charts() {
  const [w, setW] = useState(600);
  return (
    <Section
      title="Trends"
      tag="0.5 s samples"
      right={
        <div className="seg text">
          {WINDOWS.map(([l, v]) => (
            <button key={l} className={w === v ? 'on accent' : ''} onClick={() => setW(v)}>
              {l}
            </button>
          ))}
        </div>
      }
    >
      <ChartCard
        key={`p${w}`}
        title="Pressure"
        windowS={w}
        yRange={[-1, 10]}
        yLabel="bar"
        series={[
          { col: 'pD_bar', label: 'PT-02 discharge', color: SERIES.orange },
          { col: 'pCube_barg', label: 'PT-01 cube', color: SERIES.blue },
        ]}
      />
      <ChartCard
        key={`q${w}`}
        title="Flow"
        windowS={w}
        yRange={[0, 50]}
        yLabel="L/min"
        series={[
          { col: 'qSuction_lpm', label: 'Suction', color: SERIES.blue },
          { col: 'qHose_lpm', label: 'To tanker', color: SERIES.green },
          { col: 'qJet_lpm', label: 'Jets', color: SERIES.violet },
          { col: 'qRelief_lpm', label: 'Relief', color: SERIES.red },
        ]}
      />
      <ChartCard
        key={`g${w}`}
        title="Gas at the manhole"
        windowS={w}
        yRange={[0, 12]}
        yLabel="ppm / %LEL"
        y2Label="O₂ %"
        y2Range={[18, 21.5]}
        series={[
          { col: 'h2s_ppm', label: 'H₂S ppm', color: SERIES.yellow },
          { col: 'ch4_lel', label: 'CH₄ %LEL', color: SERIES.orange },
          { col: 'co_ppm', label: 'CO ppm', color: SERIES.grey },
          { col: 'o2_pct', label: 'O₂ %', color: SERIES.teal, scale: 'y2' },
        ]}
      />
      <ChartCard
        key={`c${w}`}
        title="Conditioning"
        windowS={w}
        yRange={[0, 14]}
        yLabel="% TS"
        y2Label="A"
        y2Range={[0, 8]}
        series={[
          { col: 'tsPumped', label: 'Pumped TS %', color: SERIES.orange },
          { col: 'tsPit', label: 'Pit mean TS %', color: SERIES.grey, dash: [4, 3] },
          { col: 'augerA', label: 'Auger A', color: SERIES.violet, scale: 'y2' },
        ]}
      />
      <ChartCard
        key={`e${w}`}
        title="Machine"
        windowS={w}
        yRange={[0, 6]}
        yLabel="kW"
        y2Label="°C / %"
        y2Range={[0, 100]}
        series={[
          { col: 'power_kW', label: 'Power kW', color: SERIES.blue },
          { col: 'statorC', label: 'Stator °C', color: SERIES.red, scale: 'y2' },
          { col: 'soc_pct', label: 'SOC %', color: SERIES.green, scale: 'y2' },
          { col: 'pitPct', label: 'Removed %', color: SERIES.yellow, scale: 'y2', dash: [4, 3] },
        ]}
      />
    </Section>
  );
}
