import type { Scenario } from '../scenario';

/**
 * Telemetry messages identical to docs/07 §4 (MQTT JSON).
 * Topic: fsm/{state}/{gp}/{unit_id}/{event}
 */

export interface TelemetrySample {
  t: number;
  p_d: number;
  p_c: number;
  rpm: number;
  q: number;
  aug_a: number;
  jet: boolean;
}

export interface TelemetryMessage {
  seq: number;
  topic: string;
  event: 'job.started' | 'job.telemetry' | 'job.closed' | 'fstp.checkout';
  t: number;
  payload: Record<string, unknown>;
}

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');

/** ISO-8601 local time with the IST offset, from the scenario start + sim time. */
export function isoTime(sc: Scenario, simT_s: number): string {
  const [y, m, d] = sc.startDate.split('-').map(Number);
  const total = sc.startTime_h * 3600 + simT_s;
  const dayOffset = Math.floor(total / 86400);
  const secs = total - dayOffset * 86400;
  const date = new Date(Date.UTC(y, m - 1, d + dayOffset));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(secs / 3600)}:${pad((secs % 3600) / 60)}:${pad(secs % 60)}+05:30`;
}

export function jobIdFor(sc: Scenario): string {
  return `${sc.equipment.unit_id}-${sc.startDate.replace(/-/g, '')}-01`;
}

export class TelemetryEncoder {
  readonly out: TelemetryMessage[] = [];
  private batch: TelemetrySample[] = [];
  private batchT0 = 0;
  private seq = 0;
  constructor(private sc: Scenario) {}

  private topic(ev: string) {
    return `fsm/${this.sc.site.state}/${this.sc.site.gp}/${this.sc.equipment.unit_id}/${ev}`;
  }

  private emit(event: TelemetryMessage['event'], t: number, payload: Record<string, unknown>) {
    this.seq++;
    this.out.push({ seq: this.seq, topic: this.topic(event), event, t, payload });
    if (this.out.length > 500) this.out.splice(0, this.out.length - 500);
  }

  started(t: number, jobId: string, vent: { duration_s: number; o2Min: number; h2sMax: number; ch4Max: number; coMax: number }) {
    this.emit('job.started', t, {
      job_id: jobId,
      hh_qr: this.sc.household.qr,
      operator_id: this.sc.equipment.operator_id,
      ts: isoTime(this.sc, t),
      gps: { lat: this.sc.household.lat, lon: this.sc.household.lon, acc_m: 6 },
      vent: {
        duration_s: Math.round(vent.duration_s),
        gas_min: { o2: +vent.o2Min.toFixed(1) },
        gas_max: { h2s: Math.round(vent.h2sMax), ch4_lel: Math.round(vent.ch4Max), co: Math.round(vent.coMax) },
      },
      fw: this.sc.equipment.fw,
    });
    this.batch = [];
    this.batchT0 = t;
  }

  /** Called every 10 s of sim time while the job is running. Flushes 6-sample batches. */
  sample(t: number, jobId: string, s: Omit<TelemetrySample, 't'>) {
    this.batch.push({ t: Math.round(t - this.batchT0), ...s });
    if (this.batch.length >= 6) this.flush(t, jobId);
  }

  flush(t: number, jobId: string) {
    if (!this.batch.length) return;
    this.emit('job.telemetry', t, { job_id: jobId, samples: this.batch });
    this.batch = [];
  }

  closed(t: number, jobId: string, body: { volume_pumped_l: number; seed_override: boolean; alarms: { code: string; t: number }[]; decon_confirmed: boolean }) {
    this.flush(t, jobId);
    this.emit('job.closed', t, {
      job_id: jobId,
      volume_pumped_l: Math.round(body.volume_pumped_l),
      seed_override: body.seed_override,
      alarms: body.alarms.map((a) => ({ code: a.code, ts: isoTime(this.sc, a.t) })),
      decon_confirmed: body.decon_confirmed,
    });
  }

  fstp(t: number, jobId: string, body: Record<string, unknown>) {
    this.emit('fstp.checkout', t, { job_id: jobId, fac_qr: this.sc.facility.qr, ts: isoTime(this.sc, t), ...body });
  }

  get count() {
    return this.seq;
  }
}
