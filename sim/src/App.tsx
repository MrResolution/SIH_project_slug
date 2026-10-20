import { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { bridge, send } from './bridge/simBridge';
import { useSim } from './store/simStore';
import { TopBar } from './ui/TopBar';
import { LeftPanel } from './ui/LeftPanel';
import { RightPanel } from './ui/RightPanel';
import { BottomPanel } from './ui/BottomPanel';
import { Viewport } from './ui/Viewport';
import { Briefing } from './ui/Briefing';
import { HelpOverlay } from './ui/HelpOverlay';
import { Debrief } from './ui/Debrief';

/** URL parameters let the team share exact setups: ?scenario=S02&mode=sandbox&seed=42 */
function readUrl() {
  const q = new URLSearchParams(location.search);
  const mode = q.get('mode') === 'sandbox' ? 'sandbox' : 'training';
  const seed = Number(q.get('seed') ?? 42) || 42;
  const scenario = q.get('scenario') ?? 'S02';
  return { mode, seed, scenario } as const;
}

let started = false;

export function App() {
  const leftOpen = useSim((s) => s.leftOpen);
  const rightOpen = useSim((s) => s.rightOpen);
  const set = useSim((s) => s.set);

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __sim: unknown }).__sim = { useSim, bridge, send };
    if (started) return;
    started = true;
    const u = readUrl();
    bridge.start(u.scenario, u.seed, u.mode);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const st = useSim.getState();
      const k = e.key.toLowerCase();
      if (k === ' ') {
        e.preventDefault();
        bridge.setPaused(!st.paused);
      } else if (k === '?' || (k === '/' && e.shiftKey)) set({ helpOpen: !st.helpOpen });
      else if (k === 'escape') set({ helpOpen: false });
      else if (k === 'f') set({ leftOpen: !(st.leftOpen && st.rightOpen), rightOpen: !(st.leftOpen && st.rightOpen) });
      else if (k === 'p') set({ bottomOpen: !st.bottomOpen });
      else if (k === 'c') st.setView({ cutaway: !st.view.cutaway });
      else if (k === 'x') st.setView({ xray: !st.view.xray });
      else if (k === 'g') st.setView({ gas: !st.view.gas });
      else if (k === 'e') send({ type: 'ESTOP' });
      else if (k === '1') bridge.setSpeed(0.25);
      else if (k === '2') bridge.setSpeed(1);
      else if (k === '3') bridge.setSpeed(4);
      else if (k === '4') bridge.setSpeed(16);
      else if (k === 'o') st.setCamera('overview');
      else if (k === 'k') st.setCamera('pit');
      else if (k === 'b') st.setCamera('skid');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [set]);

  return (
    <div className="app">
      <TopBar />
      <aside className={`left side ${leftOpen ? '' : 'collapsed'}`} aria-label="Job and procedure">
        {leftOpen && <LeftPanel />}
      </aside>
      <main className="viewport" aria-label="3D view">
        <Viewport />
        <button className={`collapse-tab l ${leftOpen ? 'open' : ''}`} onClick={() => set({ leftOpen: !leftOpen })} aria-label={leftOpen ? 'Hide procedure panel' : 'Show procedure panel'}>
          {leftOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
        </button>
        <button className={`collapse-tab r ${rightOpen ? 'open' : ''}`} onClick={() => set({ rightOpen: !rightOpen })} aria-label={rightOpen ? 'Hide instruments panel' : 'Show instruments panel'}>
          {rightOpen ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </main>
      <aside className={`right side ${rightOpen ? '' : 'collapsed'}`} aria-label="Instruments and analysis">
        {rightOpen && <RightPanel />}
      </aside>
      <BottomPanel />
      <Briefing />
      <Debrief />
      <HelpOverlay />
    </div>
  );
}
