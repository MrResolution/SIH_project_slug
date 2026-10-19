import { Download, Radio } from 'lucide-react';
import type { TelemetryMessage } from '../core';
import { useSim } from '../store/simStore';
import { Section } from './widgets';
import { download, tstamp } from './format';

/** Minimal JSON syntax highlighting for the message inspector. */
function Json({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  const parts = text.split(/("(?:\\.|[^"\\])*"(?:\s*:)?|-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|true|false|null)/g);
  return (
    <pre>
      {parts.map((p, i) => {
        if (/^".*":$/.test(p)) return <span key={i} className="json-key">{p}</span>;
        if (/^"/.test(p)) return <span key={i} className="json-str">{p}</span>;
        if (/^-?\d/.test(p) || p === 'true' || p === 'false' || p === 'null') return <span key={i} className="json-num">{p}</span>;
        return p;
      })}
    </pre>
  );
}

export function Telemetry() {
  const msgs = useSim((s) => s.telemetry);
  const exportJsonl = () => download('telemetry.jsonl', msgs.map((m: TelemetryMessage) => JSON.stringify({ topic: m.topic, payload: m.payload })).join('\n'), 'application/x-ndjson');
  return (
    <>
      <Section
        title="Telemetry node"
        tag="docs/07 §4 · MQTT JSON"
        right={
          <button className="btn xs" onClick={exportJsonl} disabled={!msgs.length}>
            <Download size={12} /> .jsonl
          </button>
        }
      >
        <div className="tile compact" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Radio size={16} color="var(--text-3)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Local log · broker not configured</div>
            <div className="dim" style={{ fontSize: 11 }}>
              Same messages the real unit publishes over GSM (store-and-forward). {msgs.length} message{msgs.length === 1 ? '' : 's'} so far.
            </div>
          </div>
        </div>
      </Section>
      <Section title="Messages" tag="newest first">
        {!msgs.length && <div className="note">job.started is published when the crew presses ARM after a clean ventilation record; job.telemetry follows every 60 s (6 × 10 s samples).</div>}
        {[...msgs].reverse().map((m) => (
          <div className="msg" key={m.seq}>
            <div className="mh">
              <span className={`chip ${m.event === 'job.closed' || m.event === 'fstp.checkout' ? 'ok' : 'info'}`}>{m.event}</span>
              <span className="mono dim" style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.topic}
              </span>
              <span className="mono dim">{tstamp(m.t)}</span>
            </div>
            <Json value={m.payload} />
          </div>
        ))}
      </Section>
    </>
  );
}
