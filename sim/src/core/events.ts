/**
 * Event and alarm log. Severity follows the HUD convention: info (neutral),
 * ok (step completed), warn (amber) and alarm (red; shape + colour + sound).
 */
export type Severity = 'info' | 'ok' | 'warn' | 'alarm';

export interface SimEvent {
  seq: number;
  t: number;
  sev: Severity;
  code: string;
  msg: string;
}

export class EventLog {
  private seq = 0;
  readonly items: SimEvent[] = [];
  /** Codes currently active (for alarms that should not repeat every step). */
  private active = new Set<string>();

  push(t: number, sev: Severity, code: string, msg: string): SimEvent {
    const e = { seq: ++this.seq, t, sev, code, msg };
    this.items.push(e);
    if (this.items.length > 2000) this.items.splice(0, this.items.length - 2000);
    return e;
  }

  /** Emits once when `cond` becomes true; re-arms when it becomes false. */
  edge(t: number, cond: boolean, sev: Severity, code: string, msg: string, clearMsg?: string) {
    if (cond && !this.active.has(code)) {
      this.active.add(code);
      this.push(t, sev, code, msg);
    } else if (!cond && this.active.has(code)) {
      this.active.delete(code);
      if (clearMsg) this.push(t, 'info', `${code}_CLR`, clearMsg);
    }
  }

  isActive(code: string) {
    return this.active.has(code);
  }

  activeCodes(): string[] {
    return [...this.active];
  }

  since(seq: number): SimEvent[] {
    // items are in seq order; scan from the end.
    let i = this.items.length;
    while (i > 0 && this.items[i - 1].seq > seq) i--;
    return this.items.slice(i);
  }

  get lastSeq() {
    return this.seq;
  }
}
