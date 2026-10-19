import type { SimEvent, Snapshot } from '../core';
import { useSim } from '../store/simStore';

/**
 * Minimal Web Audio engine (docs/simulation/04 §8): PCP whine with pitch ∝ rpm,
 * vane-pump hiss ∝ vacuum, and distinct alarm tones per hazard so alarms are
 * never colour-only (SIM-NFR-06). Off until the user enables sound.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private pcpOsc: OscillatorNode | null = null;
  private pcpGain: GainNode | null = null;
  private hiss: GainNode | null = null;
  private lastAlarm = 0;

  private ensure() {
    if (!useSim.getState().sound) return null;
    if (!this.ctx) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(lp).connect(g).connect(master);
      osc.start();
      // Pink-ish noise for the vane pump.
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < d.length; i++) {
        b = 0.97 * b + 0.03 * (Math.random() * 2 - 1);
        d[i] = b * 3;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 1800;
      const hg = ctx.createGain();
      hg.gain.value = 0;
      src.connect(hp).connect(hg).connect(master);
      src.start();
      this.ctx = ctx;
      this.master = master;
      this.pcpOsc = osc;
      this.pcpGain = g;
      this.hiss = hg;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setEnabled(on: boolean) {
    useSim.setState({ sound: on });
    if (!on && this.ctx) void this.ctx.suspend();
    if (on) this.ensure();
  }

  onSnapshot(s: Snapshot) {
    const ctx = this.ensure();
    if (!ctx || !this.pcpOsc || !this.pcpGain || !this.hiss) return;
    const t = ctx.currentTime;
    const rpm = s.pcp.rpm;
    this.pcpOsc.frequency.setTargetAtTime(40 + rpm * 0.32 + (s.pcp.cavitation < 0.97 ? 18 * Math.random() : 0), t, 0.1);
    this.pcpGain.gain.setTargetAtTime(rpm > 5 ? 0.04 + 0.05 * Math.min(1, s.pcp.dp_bar / 20) : 0, t, 0.2);
    const vac = s.cube.vaneMode === 'off' ? 0 : 0.02 + 0.05 * s.cube.vaneU;
    this.hiss.gain.setTargetAtTime(vac, t, 0.3);
    if (s.alarms.length && performance.now() - this.lastAlarm > 1600) {
      this.lastAlarm = performance.now();
      const a = s.alarms[0];
      if (a.includes('GAS') || a.includes('EXPOSURE')) this.tone([880, 660, 880, 660], 0.16, 'square');
      else if (a.includes('OVERPRESSURE') || a.includes('BURST')) this.tone([1200, 1200, 1200], 0.09, 'square');
      else this.tone([520, 780], 0.22, 'triangle');
    }
  }

  onEvents(events: SimEvent[]) {
    if (!this.ensure()) return;
    for (const e of events) {
      if (e.sev === 'ok' && e.code.startsWith('SOP_')) this.tone([660, 990], 0.08, 'sine', 0.12);
      else if (e.sev === 'warn' && e.code === 'W_BLOCKED') this.tone([220, 180], 0.1, 'square', 0.12);
    }
  }

  click() {
    if (!this.ensure()) return;
    this.tone([1400], 0.015, 'square', 0.05);
  }

  private tone(freqs: number[], dur: number, type: OscillatorType, level = 0.22) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    let t = ctx.currentTime;
    for (const f of freqs) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + 0.01);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
      t += dur + 0.03;
    }
  }
}

export const audio = new AudioEngine();
