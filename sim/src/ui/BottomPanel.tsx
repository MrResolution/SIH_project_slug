import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react';
import type { SimEvent } from '../core';
import { useSim } from '../store/simStore';
import { Pid } from './Pid';
import { clock } from './format';
import { StateGlyph } from './TopBar';

type Filter = 'all' | 'alarm' | 'warn' | 'ok';

export function BottomPanel() {
  const open = useSim((s) => s.bottomOpen);
  const set = useSim((s) => s.set);
  const [maximized, setMaximized] = useState(false);
  const [customHeight, setCustomHeight] = useState<number | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const h = Math.max(140, Math.min(window.innerHeight - 100, window.innerHeight - e.clientY));
      setCustomHeight(h);
      setMaximized(false);
    };
    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (!open) {
      document.documentElement.style.setProperty('--bottom-h-dyn', '34px');
    } else if (maximized) {
      document.documentElement.style.setProperty('--bottom-h-dyn', 'min(450px, 55vh)');
    } else if (customHeight) {
      document.documentElement.style.setProperty('--bottom-h-dyn', `${customHeight}px`);
    } else {
      document.documentElement.style.removeProperty('--bottom-h-dyn');
    }
    return () => {
      document.documentElement.style.removeProperty('--bottom-h-dyn');
    };
  }, [open, maximized, customHeight]);

  const panelStyle = open
    ? maximized
      ? { height: 'min(450px, 55vh)' }
      : customHeight
      ? { height: `${customHeight}px` }
      : undefined
    : undefined;

  return (
    <section className={`bottom ${open ? '' : 'collapsed'}`} style={panelStyle} aria-label="Process diagram and event log">
      {open && (
        <div
          className="bottom-resizer"
          onMouseDown={startResize}
          title="Drag up/down to resize bottom bar"
        />
      )}
      <div className="pid-wrap">
        <div className="panel-head">
          <div className="sec-title">
            Live P&amp;ID <span className="tag">ISA-5.1 style · click a symbol to fly there</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PidLegend />
            {open && (
              <button
                className="btn xs ghost icon"
                onClick={() => setMaximized(!maximized)}
                aria-label={maximized ? 'Restore height' : 'Maximize height'}
                title={maximized ? 'Restore normal height' : 'Maximize bottom bar'}
              >
                {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
            )}
            <button className="btn xs ghost icon" onClick={() => set({ bottomOpen: !open })} aria-label={open ? 'Collapse' : 'Expand'} title="Toggle (P)">
              {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          </div>
        </div>
        {open && <Pid />}
      </div>
      <EventLog open={open} />
    </section>
  );
}

function PidLegend() {
  return (
    <div className="legend-row tb-hide-md">
      <span>
        <i style={{ background: '#56b8a6', height: 3 }} /> flowing (TS colour)
      </span>
      <span>
        <i style={{ background: '#3a4454', height: 3 }} /> empty / air
      </span>
      <span>
        <i style={{ background: '#f3b343', height: 3 }} /> relief / warning
      </span>
    </div>
  );
}

function EventLog({ open }: { open: boolean }) {
  const events = useSim((s) => s.events);
  const ui = useSim((s) => s.ui);
  const [filter, setFilter] = useState<Filter>('all');
  const list = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const tod0 = ui ? ui.clock_s - ui.t : 0;
  const shown = events.filter((e) => e.code !== 'I_PARAM' && (filter === 'all' ? true : filter === 'ok' ? e.sev === 'ok' : filter === 'warn' ? e.sev === 'warn' : e.sev === 'alarm'));

  useEffect(() => {
    const el = list.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  const counts = { alarm: events.filter((e) => e.sev === 'alarm').length, warn: events.filter((e) => e.sev === 'warn').length };
  return (
    <div className="log">
      <div className="panel-head">
        <div className="sec-title">Event log</div>
        <div className="seg text">
          {(
            [
              ['all', 'All'],
              ['alarm', `Alarms ${counts.alarm || ''}`],
              ['warn', `Warnings ${counts.warn || ''}`],
              ['ok', 'Steps'],
            ] as [Filter, string][]
          ).map(([k, l]) => (
            <button key={k} className={filter === k ? 'on accent' : ''} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {open && (
        <div
          className="log-list scroll"
          ref={list}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
          role="log"
          aria-live="polite"
        >
          {shown.slice(-300).map((e) => (
            <LogItem key={e.seq} e={e} tod0={tod0} />
          ))}
          {!shown.length && <div className="note" style={{ padding: 12 }}>No events yet.</div>}
        </div>
      )}
    </div>
  );
}

function LogItem({ e, tod0 }: { e: SimEvent; tod0: number }) {
  const tone = e.sev === 'alarm' ? 'alarm' : e.sev === 'warn' ? 'warn' : e.sev === 'ok' ? 'ok' : '';
  const color = e.sev === 'alarm' ? 'var(--alarm)' : e.sev === 'warn' ? 'var(--warn)' : e.sev === 'ok' ? 'var(--ok)' : 'var(--text-4)';
  return (
    <div className={`log-item ${e.sev}`}>
      <span className="t">{clock(tod0 + e.t)}</span>
      <span style={{ color, paddingTop: 2 }}>{tone === 'ok' ? <Check /> : <StateGlyph tone={tone} size={9} />}</span>
      <span className="m">{e.msg}</span>
    </div>
  );
}

const Check = () => (
  <svg width="10" height="10" viewBox="0 0 10 10">
    <path d="M1.5 5.2 L4 7.6 L8.6 2.4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  </svg>
);
