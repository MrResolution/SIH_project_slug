import { Activity, FlaskConical, Gauge, LineChart, Radio } from 'lucide-react';
import { useSim, type RightTab } from '../store/simStore';
import { Instruments } from './Instruments';
import { Charts } from './Charts';
import { Analysis } from './Analysis';
import { Sandbox } from './Sandbox';
import { Telemetry } from './Telemetry';

const TABS: { id: RightTab; label: string; icon: typeof Gauge }[] = [
  { id: 'instruments', label: 'Gauges', icon: Gauge },
  { id: 'charts', label: 'Trends', icon: LineChart },
  { id: 'analysis', label: 'Analysis', icon: Activity },
  { id: 'sandbox', label: 'Sandbox', icon: FlaskConical },
  { id: 'telemetry', label: 'Telemetry', icon: Radio },
];

export function RightPanel() {
  const tab = useSim((s) => s.rightTab);
  const set = useSim((s) => s.set);
  const nMsgs = useSim((s) => s.telemetry.length);
  return (
    <>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => set({ rightTab: t.id })}>
            <t.icon size={13} />
            {t.label}
            {t.id === 'telemetry' && nMsgs > 0 && (
              <span className="mono" style={{ fontSize: 9.5, color: 'var(--accent)' }}>
                {nMsgs}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="scroll" style={{ flex: 1, minHeight: 0 }} role="tabpanel">
        {tab === 'instruments' && <Instruments />}
        {tab === 'charts' && <Charts />}
        {tab === 'analysis' && <Analysis />}
        {tab === 'sandbox' && <Sandbox />}
        {tab === 'telemetry' && <Telemetry />}
      </div>
    </>
  );
}
