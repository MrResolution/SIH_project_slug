import type { Command, TimedCommand } from './commands';
import { HISTORY_DT } from './history';
import { applyOverrides, defaultParams, pcpMotor_kW, setPath, type Params } from './params';
import type { Scenario } from './scenario';
import { DT, initState, type SimGeometry, type SimState } from './state';
import type { Snapshot, SimMode } from './snapshot';
import type { EventLog, Severity } from './events';
import type { Rng } from './rng';
import { TelemetryEncoder, jobIdFor } from './telemetry/encoder';
import { blockReasons, interlock, travelEnable, type InterlockInputs } from './control/interlock';
import { PCP_STATES, RUN_STATES, STATE_LABEL, transition, type JobEventType, type JobStateName } from './control/jobMachine';
import { SOP } from './control/sop';
import { hMaxSuction_m, tAmb_C } from './models/atmosphere';
import { plumeIntensity, stepGas, trueReading } from './models/gas';
import {
  N_CELLS,
  applyDraw,
  applyInjection,
  bedTop,
  columnDensityAbove,
  computeDraw,
  layoutPit,
  meanTS,
  mixZone,
  pitVolume,
  updateRathole,
  wallStability,
  type DrawResult,
  type PitLayout,
} from './models/pit';
import { augerLoad, jetFlow, shearField, stepTrash } from './models/probe';
import { bulkDensity, muP, tauY } from './models/rheology';
import { solveSuction } from './models/suction';
import { cubePressure, stepCube, vaneControl } from './models/surgeCube';
import { cavitationFactor, etaVolEstimate, pumpAt, shaftLoad, slipCoeff, stepStator, type PumpInputs } from './models/pcp';
import { advanceHose, hoseCoeffs, hoseFlowAt, hoseMeanTS, hoseProfile } from './models/hose';
import { reliefFlow, reliefTargetLift } from './models/valves';
import { linesBlocked, stepThermal } from './models/thermal';
import { battResistance, pcpPowerAvailable, stepPower } from './models/power';
import { stepVehicle, workingTilt } from './models/vehicle';
import { bisectDecreasing } from './solver';
import { G, boreArea, clamp, lag, lpmToM3s, slew, smoothstep } from './units';

/** Auto-follow keeps the lance tip this far below the free surface (m). */
export const LANCE_AUTO_DEPTH = 0.45;

export interface SimOptions {
  scenario: Scenario;
  geometry: SimGeometry;
  seed?: number;
  mode?: SimMode;
  params?: Params;
}

/**
 * The deterministic simulation: createSim(scenario, params, seed) → step().
 * Order of a 10 ms step follows docs/simulation/02 §4:
 *   commands → atmosphere → vehicle/equipment → gas → interlock → FSM → actuators
 *   → pit/probe → suction → PCP ⇄ hose → valves → integrate → trips → thermal → power
 *   → SOP / telemetry / history.
 */
export class Sim {
  readonly scenario: Scenario;
  readonly geom: SimGeometry;
  readonly seed: number;
  readonly mode: SimMode;
  params: Params;
  state: SimState;
  readonly rng: Rng;
  readonly log: EventLog;
  readonly telem: TelemetryEncoder;
  readonly recorded: TimedCommand[] = [];
  readonly history: number[][] = [];

  private queue: Command[] = [];
  private lay: PitLayout;
  private draw: DrawResult;
  private tauEff = new Float64Array(N_CELLS);
  private mixG = new Float64Array(N_CELLS);
  private ks = 0;
  private lastHistoryT = -1;
  private lastTelemT = -1;
  private hPrev = 0;
  private alarmsSeen: { code: string; t: number }[] = [];
  private crewValue = false;
  private wasPrimed = false;
  private lastCurve = { static_Pa: 0, yield_Pa: 0, visc: 0, c2: 0 };

  constructor(opts: SimOptions) {
    this.scenario = opts.scenario;
    this.geom = opts.geometry;
    this.seed = opts.seed ?? 42;
    this.mode = opts.mode ?? 'sandbox';
    this.params = applyOverrides(opts.params ?? defaultParams(), opts.scenario.params);
    const init = initState({ params: this.params, scenario: this.scenario, geom: this.geom, seed: this.seed });
    this.state = init.state;
    this.rng = init.rng;
    this.log = init.log;
    this.telem = new TelemetryEncoder(this.scenario);
    this.lay = layoutPit(this.state.pit);
    this.draw = computeDraw(this.params, this.state.pit, this.lay, 10, this.tauEff);
    this.ks = slipCoeff(this.params);
    this.hPrev = this.state.pit.hLiq_m;
    this.say('info', 'I_SESSION', `Scenario ${this.scenario.id}: ${this.scenario.title.en}. Seed ${this.seed}, ${this.mode} mode.`);
  }

  enqueue(cmd: Command) {
    this.queue.push(cmd);
  }

  /** Runs `seconds` of sim time headless (tests, sweeps). */
  run(seconds: number) {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) this.step();
  }

  private say(sev: Severity, code: string, msg: string) {
    this.log.push(this.state.t, sev, code, msg);
    if (sev === 'alarm') this.alarmsSeen.push({ code, t: this.state.t });
  }

  private block(msg: string) {
    this.state.job.blockedAttempts++;
    this.say('warn', 'W_BLOCKED', `Blocked: ${msg}`);
  }

  private go(ev: JobEventType, note?: string): boolean {
    const s = this.state;
    const next = transition(s.job.state, ev);
    if (!next) return false;
    s.job.prev = s.job.state;
    s.job.state = next;
    s.job.enteredAt = s.t;
    this.say(next === 'Fault' ? 'alarm' : 'ok', `S_${next.toUpperCase()}`, `State → ${STATE_LABEL[next]}${note ? ` (${note})` : ''}`);
    this.onEnter(next);
    return true;
  }

  private onEnter(st: JobStateName) {
    const s = this.state;
    if (st === 'Fault') {
      s.probe.augerDir = 0;
      s.pcp.run = false;
      s.cube.vaneMode = 'off';
      s.probe.jetCmd = false;
      s.probe.airCmd = false;
    } else if (st === 'Purging') {
      s.probe.augerDir = 0;
      s.probe.jetCmd = false;
      s.probe.airCmd = false;
      s.cube.vaneMode = 'blow';
      s.cube.blow_s = 0;
      if (s.il.k2) {
        s.pcp.run = true;
        s.pcp.set_rpm = Math.max(this.params.pcp.rpmMin, Math.min(s.pcp.set_rpm, 250));
      }
    } else if (st === 'SeedLimit') {
      // The machine stops at the seed layer; the crew chooses FINISH or a logged override.
      s.pcp.run = false;
      s.probe.augerDir = 0;
      s.probe.jetCmd = false;
      s.probe.airCmd = false;
    } else if (st === 'Extracting' && s.job.prev === 'SeedLimit') {
      s.pcp.run = true;
    } else if (st === 'Decon') {
      s.cube.vaneMode = 'off';
      s.pcp.run = false;
    } else if (st === 'Armed' && !s.job.startedSent && s.job.jobId && s.job.vent) {
      s.job.startedSent = true;
      s.job.startT = s.t;
      const v = s.job.vent;
      this.telem.started(s.t, s.job.jobId, { duration_s: (v.done_t || s.t) - v.start_t, o2Min: v.o2Min, h2sMax: v.h2sMax, ch4Max: v.ch4Max, coMax: v.coMax });
    }
  }

  // ------------------------------------------------------------------ commands
  private apply(cmd: Command) {
    const s = this.state;
    const p = this.params;
    const st = s.job.state;
    const runOk = s.il.k1 && RUN_STATES.has(st);
    switch (cmd.type) {
      case 'DRIVE': {
        if (s.equip.tripod > 0 || s.equip.lanceZ_m < s.pit.depth_m) return this.block('stow the lance and tripod before travelling');
        if (!s.il.travelEnable) return this.block(s.pcp.rpm > 1 ? 'travel inhibited while the PCP runs' : s.vehicle.chocks > 0 ? 'travel inhibited: remove the chocks' : 'travel inhibited: raise the outriggers');
        s.vehicle.target = cmd.target;
        this.say('info', 'I_DRIVE', cmd.target === 'pit' ? 'Crawler descending the lane to HH-07 (paying out hose).' : 'Crawler climbing back to the road.');
        return;
      }
      case 'DRIVE_STOP':
        s.vehicle.target = null;
        return;
      case 'OUTRIGGERS':
        if (cmd.down && !s.vehicle.atPit) return this.block('outriggers deploy only at the work site');
        if (!cmd.down && s.pcp.rpm > 1) return this.block('stop the PCP before raising the outriggers');
        s.vehicle.outriggersCmd = cmd.down;
        this.say('info', 'I_OUTRIGGERS', cmd.down ? 'Outriggers deploying.' : 'Outriggers retracting.');
        return;
      case 'CHOCKS':
        if (cmd.engaged && !s.vehicle.atPit) return this.block('chocks are placed at the work site');
        s.vehicle.chocksCmd = cmd.engaged;
        return;
      case 'SCAN_QR':
        if (!s.vehicle.atPit) return this.block('scan the household QR at the site');
        if (st !== 'Idle') return this.block('job already checked in');
        s.job.jobId = jobIdFor(this.scenario);
        s.job.checkedIn = true;
        this.go('SCAN_QR', `${this.scenario.household.qr}`);
        this.say('ok', 'I_CHECKIN', `Household ${this.scenario.household.qr} checked in. Job ${s.job.jobId} opened; GPS fix ±6 m.`);
        return;
      case 'CONFIRM_PPE':
        if (st !== 'CheckIn') return this.block(st === 'Idle' ? 'check in first' : 'PPE already confirmed');
        s.job.ppe = true;
        this.go('CREW_LOGGED', 'crew of 3, PPE confirmed');
        return;
      case 'MANHOLE':
        if (!s.vehicle.atPit) return this.block('the crew is not at the site');
        if (!cmd.open && s.equip.lanceZ_m < s.pit.depth_m + 0.2) return this.block('raise the lance out of the manhole first');
        if (!cmd.open && s.equip.tripod > 0) return this.block('stow the tripod first');
        this.startCrew('manhole', cmd.open, 2.5);
        return;
      case 'SNIFFER':
        if (cmd.placed && !s.equip.manholeOpen) return this.block('open the manhole to hang the sniffer');
        this.startCrew('sniffer', cmd.placed, 1.5);
        return;
      case 'BLOWER':
        if (cmd.on && !s.equip.manholeOpen) return this.block('the blower duct goes into the open manhole');
        this.startCrew('blower', cmd.on, cmd.on ? 2 : 0.5);
        return;
      case 'TRIPOD':
        if (cmd.deployed && !s.equip.manholeOpen) return this.block('open the manhole first');
        if (!cmd.deployed && s.equip.lanceZ_m < s.pit.depth_m + 0.25) return this.block('raise the lance fully before stowing the tripod');
        s.equip.tripodCmd = cmd.deployed;
        return;
      case 'LANCE':
        if (cmd.dir !== 0 && s.equip.tripod < 1) return this.block('set up the tripod and winch first');
        s.equip.lanceDir = cmd.dir;
        s.equip.lanceTarget_m = null;
        s.equip.lanceAuto = false;
        return;
      case 'LANCE_AUTO':
        if (cmd.on && s.equip.tripod < 1) return this.block('set up the tripod and winch first');
        s.equip.lanceAuto = cmd.on;
        s.equip.lanceDir = 0;
        this.say('info', 'I_LANCE_AUTO', cmd.on ? `Lance auto-follow ON: tip held ${LANCE_AUTO_DEPTH} m below the surface (DT-01).` : 'Lance auto-follow OFF.');
        return;
      case 'LANCE_TO':
        if (s.equip.tripod < 1) return this.block('set up the tripod and winch first');
        s.equip.lanceTarget_m = clamp(cmd.z_m, 0, s.pit.depth_m + 0.35);
        s.equip.lanceAuto = false;
        return;
      case 'ARM':
        if (st !== 'Ventilating') return this.block(st === 'Armed' ? 'already armed' : `ARM is only possible after ventilation (state: ${STATE_LABEL[st]})`);
        if (!s.il.k1) return this.block(this.k1Text());
        this.go('ARM');
        return;
      case 'ESTOP':
        if (!s.il.estopLatched) {
          s.il.estopLatched = true;
          this.say('alarm', 'A_ESTOP', 'E-STOP pressed — K1 dropped, all motors stopped.');
        }
        return;
      case 'ESTOP_RESET':
        if (s.il.estopLatched) {
          s.il.estopLatched = false;
          this.say('info', 'I_ESTOP_RESET', 'E-STOP twist-reset. Press RESET on the pendant to clear the fault.');
        }
        return;
      case 'VAC':
        if (cmd.mode === 'off') {
          s.cube.vaneMode = 'off';
          return;
        }
        if (!runOk) return this.block(st === 'Ventilating' || st === 'GasHold' ? 'press ARM first' : this.k1Text());
        if (cmd.mode === 'vac' && st === 'Armed') this.go('VAC_START', 'vane pump on vacuum');
        s.cube.vaneMode = cmd.mode;
        return;
      case 'AUGER':
        if (cmd.dir === 0) {
          s.probe.augerDir = 0;
          return;
        }
        if (!runOk) return this.block(this.k1Text());
        if (s.probe.stalled && cmd.dir > 0) return this.block('auger overload — run in reverse to clear');
        s.probe.augerDir = cmd.dir;
        return;
      case 'AUGER_SPEED':
        s.probe.augerSet_rpm = clamp(cmd.rpm, 0, p.probe.rpmMax);
        return;
      case 'PCP':
        if (!cmd.run) {
          s.pcp.run = false;
          return;
        }
        if (!PCP_STATES.has(st)) return this.block(st === 'Armed' ? 'prime the cube first (VAC PRIME)' : `PCP not available in ${STATE_LABEL[st]}`);
        if (!s.il.k2) return this.block(this.k2Text());
        if (st === 'Priming') {
          if (s.cube.vLiq_m3 * 1000 < p.cube.primeLevel_L) return this.block(`cube level ${(s.cube.vLiq_m3 * 1000).toFixed(0)} L — wait for > ${p.cube.primeLevel_L} L`);
          this.go('PCP_START');
        }
        s.pcp.run = true;
        return;
      case 'PCP_SPEED':
        s.pcp.set_rpm = clamp(cmd.rpm, p.pcp.rpmMin, p.pcp.rpmMax);
        return;
      case 'JET':
        if (cmd.on && !runOk) return this.block(this.k1Text());
        s.probe.jetCmd = cmd.on;
        if (cmd.on && st === 'Extracting') this.go('JET_ON', 'closed-loop jetting');
        if (!cmd.on && st === 'Jetting') this.go('JET_OFF');
        return;
      case 'AIR':
        if (cmd.on && !runOk) return this.block(this.k1Text());
        s.probe.airCmd = cmd.on;
        return;
      case 'HEATER':
        s.equip.heaterCmd = cmd.on;
        return;
      case 'SEED_OVERRIDE':
        if (st !== 'SeedLimit') return this.block('override is only available at the seed-layer limit');
        s.job.seedOverride = true;
        s.job.seedReason = cmd.reason;
        this.go('OVERRIDE', `logged: "${cmd.reason}"`);
        this.say('warn', 'W_SEED_OVERRIDE', `Seed-layer override logged: ${cmd.reason}`);
        return;
      case 'FINISH':
        if (!this.go('FINISH', 'purge sequence')) this.block(`FINISH not available in ${STATE_LABEL[st]}`);
        return;
      case 'DECON_CONFIRM':
        if (st !== 'Decon') return this.block('decon follows the purge');
        s.job.deconConfirmed = true;
        this.go('DECON_OK', '1% chlorine on couplings and lance, lime on spills');
        return;
      case 'CLOSE_JOB': {
        if (st !== 'CheckOut') return this.block('close-out follows decon');
        const missing: string[] = [];
        if (s.equip.manholeOpen) missing.push('close the manhole');
        if (s.equip.tripod > 0) missing.push('stow the tripod');
        if (s.vehicle.outriggers > 0) missing.push('raise the outriggers');
        if (missing.length) return this.block(missing.join(', '));
        s.job.closed = true;
        s.job.endT = s.t;
        this.telem.closed(s.t, s.job.jobId!, {
          volume_pumped_l: this.meteredDelivered_L(),
          seed_override: s.job.seedOverride,
          alarms: this.alarmsSeen,
          decon_confirmed: s.job.deconConfirmed,
        });
        this.go('CLOSE', 'job record closed');
        return;
      }
      case 'FSTP_CHECKOUT':
        if (!s.job.closed) return this.block('close the job first');
        if (s.job.fstp) return this.block('already checked out');
        this.fstpCheckout(cmd.facility);
        return;
      case 'FAULT_RESET':
        this.tryReset();
        return;
      case 'SET_PARAM':
        if (this.mode === 'training') return this.block('parameters are locked in Training mode');
        if (setPath(this.params, cmd.path, cmd.value)) {
          this.ks = slipCoeff(this.params);
          if (cmd.path === 'hose.d_m') s.hose.area_m2 = boreArea(this.params.hose.d_m);
          this.say('info', 'I_PARAM', `Parameter ${cmd.path} = ${cmd.value}`);
        }
        return;
      case 'FAILURE':
        this.failure(cmd);
        return;
      case 'GAS_SPIKE':
        s.gasSpike = cmd.mult;
        this.say('warn', 'W_GAS_SPIKE', `Injected H₂S release ×${cmd.mult}.`);
        return;
      case 'TRASH_BURST':
        s.probe.blinding = Math.min(0.9, s.probe.blinding + 0.45);
        s.probe.wraps += 1;
        this.say('warn', 'W_TRASH', 'Rag mat drawn onto the screen; one wrap on the auger.');
        return;
    }
  }

  private failure(cmd: Extract<Command, { type: 'FAILURE' }>) {
    const s = this.state;
    if (this.mode === 'training' && cmd.key === 'interlockOverride') return this.block('interlock override is disabled in Training mode');
    switch (cmd.key) {
      case 'kink':
        s.hose.kink = cmd.on ? { s_m: cmd.s_m ?? 60, severity: clamp(cmd.severity ?? 0.85, 0.05, 1) } : null;
        if (cmd.on) this.say('warn', 'W_KINK', `Hose kinked at s = ${(cmd.s_m ?? 60).toFixed(0)} m.`);
        break;
      case 'crush':
        s.hose.crushed = cmd.on ? { s_m: cmd.s_m ?? 40 } : null;
        if (cmd.on) this.say('warn', 'W_CRUSH', `Hose crushed at s = ${(cmd.s_m ?? 40).toFixed(0)} m (vehicle / rock on hose).`);
        break;
      case 'interlockOverride':
        s.il.override = cmd.on;
        if (cmd.on) s.job.overrideUsed = true;
        this.say(cmd.on ? 'alarm' : 'info', 'W_OVERRIDE', cmd.on ? 'SANDBOX INTERLOCK OVERRIDE ON — logged in the recording.' : 'Interlock override off.');
        break;
      default:
        s.fail[cmd.key] = cmd.on;
        this.say(cmd.on ? 'warn' : 'info', 'I_FAILURE', `Failure ${cmd.key} ${cmd.on ? 'injected' : 'cleared'}.`);
    }
  }

  private startCrew(task: 'manhole' | 'sniffer' | 'blower', value: boolean, dur: number) {
    const e = this.state.equip;
    if (e.crewTask) return this.block(`crew busy (${e.crewTask})`);
    e.crewTask = task;
    e.crewTaskLeft_s = dur;
    this.crewValue = value;
  }

  private k1Text() {
    return this.reasons().k1.map((r) => r.text).join('; ') || 'machine power not available';
  }
  private k2Text() {
    const r = this.reasons();
    return [...r.k1, ...r.k2].map((x) => x.text).join('; ') || 'PCP not enabled';
  }

  private ilInputs(): InterlockInputs {
    const s = this.state;
    return {
      estopChainOk: !s.il.estopLatched,
      gasDetectorHealthy: !s.fail.detectorFault,
      gasAlarm: s.gas.alarm,
      ventTimerDone: s.il.ventDone,
      watchdogOk: s.il.watchdogOk,
      outriggersDown: s.vehicle.outriggers >= 0.999,
      chocksEngaged: s.vehicle.chocks >= 0.999,
      tiltOk: s.il.tiltOk,
      dryRun: s.il.dryRun,
      overpressure: s.il.overpressure,
      statorOk: !s.il.statorHot,
    };
  }

  private reasons() {
    const s = this.state;
    const g = s.gas.sensed;
    const parts: string[] = [];
    for (const sp of s.gas.alarmSpecies) {
      if (sp === 'H2S') parts.push(`H₂S ${g.h2s_ppm.toFixed(0)} ppm`);
      if (sp === 'O2') parts.push(`O₂ ${g.o2_pct.toFixed(1)} %`);
      if (sp === 'CH4') parts.push(`CH₄ ${g.ch4_lel.toFixed(0)} %LEL`);
      if (sp === 'CO') parts.push(`CO ${g.co_ppm.toFixed(0)} ppm`);
    }
    return blockReasons(this.ilInputs(), {
      ventLeft_s: Math.max(0, this.params.safety.vent_s - s.il.ventTimer_s),
      gasText: parts.join(', ') || 'detector',
      tilt_deg: workingTilt(s.vehicle),
      statorT_C: s.pcp.statorT_C,
    });
  }

  private tryReset() {
    const s = this.state;
    const p = this.params;
    if (s.job.state !== 'Fault') return this.block('nothing to reset');
    if (s.il.estopLatched) return this.block('twist-reset the E-STOP first');
    if (s.il.overpressure && s.hose.pD_Pa > 18e5) return this.block('pressure still above 18 bar');
    if (s.il.statorHot && s.pcp.statorT_C > 70) return this.block(`stator still ${s.pcp.statorT_C.toFixed(0)} °C — let it cool below 70 °C`);
    if (s.pcp.burnt) return this.block('stator burnt — replace the stator (sandbox: reload scenario)');
    s.il.overpressure = false;
    s.il.overTimer_s = 0;
    s.il.dryRun = s.il.dryRun && s.cube.vLiq_m3 * 1000 < p.cube.lowLevel_L;
    s.il.dryRunTimer_s = 0;
    if (s.il.statorHot && s.pcp.statorT_C <= 70) s.il.statorHot = false;
    const k = interlock(this.ilInputs());
    s.job.faults = [];
    this.go(k.k1 ? 'RESET_TO_ARMED' : 'RESET_TO_VENT', k.k1 ? 'fault cleared' : 'fault cleared; ventilation must complete again');
  }

  /**
   * Volume the controller reports as delivered: PCP metering (BST-07) minus the
   * hose hold-up it knows from the hose bore, length and fill.
   */
  meteredDelivered_L(): number {
    const s = this.state;
    return Math.max(0, (s.pcp.metered_m3 - s.hose.vol_m3) * 1000);
  }

  private fstpCheckout(fac: 'fstp' | 'drain') {
    const s = this.state;
    const sc = this.scenario;
    const received = s.receiver.v_m3 * 1000;
    const metered = this.meteredDelivered_L();
    const diff = metered > 0 ? Math.abs(received - metered) / metered : 1;
    const rules = [
      { id: 'R1', label: 'Geofence', pass: fac === 'fstp', detail: fac === 'fstp' ? `Discharge GPS inside ${sc.facility.name} (${sc.facility.geofence_m} m fence)` : 'Discharge GPS outside every facility geofence — roadside drain' },
      { id: 'R2', label: 'Volume match', pass: diff <= 0.15, detail: `Received ${received.toFixed(0)} L vs metered ${metered.toFixed(0)} L (${(diff * 100).toFixed(1)} %, limit 15 %)` },
      { id: 'R3', label: 'Time window', pass: true, detail: 'Discharged within 24 h of the last job' },
      { id: 'R4', label: 'Safety record', pass: !!s.job.vent && s.job.startedSent, detail: s.job.vent ? `Ventilation ${Math.round(s.job.vent.done_t - s.job.vent.start_t)} s with gas record` : 'No ventilation record' },
    ];
    const verified = rules.every((r) => r.pass);
    s.job.fstp = { facility: fac, received_L: received, metered_L: metered, rules, verified };
    if (fac === 'drain') {
      s.job.criticals.push('illegal_dump');
      this.say('alarm', 'A_DUMP', 'Discharge outside the FSTP geofence — job flagged, incentive withheld.');
    } else this.say(verified ? 'ok' : 'warn', 'I_FSTP', verified ? `FSTP check-out verified: ${received.toFixed(0)} L received. Incentive released.` : 'FSTP check-out needs manual review.');
    this.telem.fstp(s.t, s.job.jobId!, { volume_received_l: Math.round(received), verified, rules: rules.map((r) => ({ id: r.id, pass: r.pass })) });
  }

  private scenarioEvents() {
    const s = this.state;
    this.scenario.events.forEach((ev, i) => {
      if (s.firedEvents[i]) return;
      let due = false;
      const m = /^t:(\d+(?:\.\d+)?)$/.exec(ev.at);
      const ms = /^state:(\w+)\+(\d+(?:\.\d+)?)s$/.exec(ev.at);
      if (m) due = s.t >= Number(m[1]);
      else if (ms) due = s.job.state === ms[1] && s.t - s.job.enteredAt >= Number(ms[2]);
      if (!due) return;
      s.firedEvents[i] = true;
      const a = ev.args ?? {};
      if (ev.do === 'gas_spike') this.apply({ type: 'GAS_SPIKE', mult: Number(a.mult ?? 4) });
      else if (ev.do === 'kink') this.apply({ type: 'FAILURE', key: 'kink', on: true, s_m: Number(a.s_m ?? 60), severity: Number(a.severity ?? 1) });
      else if (ev.do === 'crush') this.apply({ type: 'FAILURE', key: 'crush', on: true, s_m: Number(a.s_m ?? 40) });
      else if (ev.do === 'trash_burst') this.apply({ type: 'TRASH_BURST' });
    });
  }

  // ---------------------------------------------------------------------- step
  step() {
    const s = this.state;
    const p = this.params;
    const sc = this.scenario;
    const dt = DT;
    s.step++;
    s.t = s.step * DT;

    // 1 · commands (stamped with the step they are applied at)
    if (this.queue.length) {
      for (const c of this.queue) {
        this.recorded.push({ step: s.step, cmd: c });
        this.apply(c);
      }
      this.queue.length = 0;
    }
    this.scenarioEvents();

    // 2 · atmosphere
    s.env.tAmb_C = tAmb_C(s.tod0_s + s.t, sc.site.ambient.mean_c, sc.site.ambient.amplitude_c, sc.site.ambient.t0_h);

    // 3 · vehicle and crew
    const travelW = stepVehicle(p, s.vehicle, this.geom.lane, s.il.travelEnable, p.vehicle.parkTilt_deg, dt);
    this.stepEquipment(dt);
    const pit = s.pit;
    const lay = layoutPit(pit, this.lay);

    // 4 · gas
    s.gasSpike = s.gasSpike > 0.01 ? s.gasSpike * Math.exp(-dt / 60) : 0;
    stepGas(
      s.gas,
      p,
      sc,
      {
        headspace_m3: pit.area_m2 * pit.depth_m - pitVolume(pit),
        manholeOpen: s.equip.manholeOpen,
        blowerOn: s.equip.blowerOn,
        snifferPlaced: s.equip.snifferPlaced,
        wind_ms: s.env.wind_ms,
        augerRpm: s.probe.auger_rpm,
        jet_m3s: s.hose.jet_m3s,
        spike: s.gasSpike,
        stuck: s.fail.h2sSensorStuck,
        detectorFault: s.fail.detectorFault,
      },
      this.rng,
      dt,
    );
    this.stepVentTimer(dt);

    // 5 · interlock
    s.il.tiltOk = workingTilt(s.vehicle) < p.safety.tiltAlarm_deg;
    const k = interlock(this.ilInputs());
    s.il.k1 = k.k1 || s.il.override;
    s.il.k2 = k.k2 || s.il.override;
    s.il.travelEnable = travelEnable(s.pcp.rpm > 1, s.vehicle.outriggers <= 0.001) && s.vehicle.chocks <= 0.001;

    // 6 · FSM automatic transitions
    this.autoTransitions();

    // 7 · actuators
    const st = s.job.state;
    const k1Run = s.il.k1 && RUN_STATES.has(st);
    const pcpRun = s.il.k2 && PCP_STATES.has(st) && s.pcp.run && !s.pcp.burnt;
    const probe = s.probe;
    let augerTarget = 0;
    if (k1Run) {
      if (!probe.stalled) augerTarget = probe.augerDir * probe.augerSet_rpm;
      else if (probe.augerDir < 0) augerTarget = -probe.augerSet_rpm;
    }
    probe.auger_rpm = slew(probe.auger_rpm, augerTarget, k1Run ? p.probe.accel_rpms : 1500, dt);
    s.pcp.cmd_rpm = slew(s.pcp.cmd_rpm, pcpRun ? s.pcp.set_rpm : 0, pcpRun ? p.pcp.accel_rpms : 600, dt);
    probe.jetValve = slew(probe.jetValve, k1Run && probe.jetCmd ? 1 : 0, 1 / p.probe.valveTravel_s, dt);
    if (!k1Run && s.cube.vaneMode !== 'off' && st !== 'Purging') s.cube.vaneMode = 'off';
    s.cube.vaneU = k1Run ? vaneControl(p, s.cube, s.env.pAtm, dt) : 0;
    const airFree = k1Run && probe.airCmd ? lpmToM3s(p.probe.air_lpm) : 0;

    // 8 · pit / probe: shear field and the draw at the intake
    const zIntake = s.equip.lanceZ_m + p.probe.footH_m;
    const connected = s.suction.connected;
    const pJetPrev = Math.min(s.hose.pD_Pa, p.probe.prv_bar * 1e5);
    const shear = shearField(p, pit, lay, zIntake, probe, pJetPrev, this.tauEff);
    const draw = computeDraw(p, pit, lay, zIntake, this.tauEff, this.draw);
    const aug = augerLoad(p, probe, s.power.vBus);
    if (aug.T > p.probe.tMax_Nm && !probe.stalled) {
      probe.stalled = true;
      this.say('alarm', 'A_AUGER_STALL', `Auger overload ${aug.T.toFixed(0)} N·m — REVERSE to clear.`);
    }
    if (probe.auger_rpm < -100) {
      probe.reverseClear_s += dt;
      if (probe.reverseClear_s >= 2.5) {
        probe.reverseClear_s = 0;
        if (probe.wraps > 0) {
          probe.wraps--;
          this.say('info', 'I_WRAP_CLR', `Wrap cleared by reversal (${probe.wraps} left).`);
        }
        if (probe.stalled && probe.wraps === 0) {
          probe.stalled = false;
          this.say('ok', 'I_STALL_CLR', 'Auger stall cleared. Resume forward.');
        }
      }
    } else probe.reverseClear_s = 0;

    // 9 · suction leg
    const cube = s.cube;
    const zCube = pit.depth_m + p.cube.inletZ_m;
    const submerged = connected && zIntake < lay.surface;
    s.suction.frozen = linesBlocked(p, s.thermal);
    let qLiq = 0;
    let airIngest = 0;
    if (connected && cube.vaneMode !== 'blow' && !s.suction.frozen) {
      const sol = solveSuction(p, {
        pAtm: s.env.pAtm,
        pCube: cubePressure(p, cube),
        zSurf: lay.surface,
        zIntake,
        zCube,
        rhoCol: columnDensityAbove(p, pit, lay, zIntake),
        tsMix: draw.tsMix,
        rhoSlurry: draw.rhoMix,
        temp_C: pit.fluidT_C,
        blinding: probe.blinding,
        airFree_m3s: airFree,
        length_m: pit.depth_m + p.suction.lanceAboveGround_m - zIntake + p.suction.hoseLen_m,
      });
      const u = submerged ? draw.uncovered : 1;
      const starveF = Math.min(1, draw.mobile_m3 / (p.suction.starveVolume_L / 1000));
      s.suction.starved = submerged && starveF < 1 && sol.q_m3s > 0;
      qLiq = Math.min(sol.q_m3s * (1 - u) * starveF, pitVolume(pit) / dt);
      const qAirActual = sol.q_m3s * (u + (1 - u) * (1 - starveF)) * 3;
      airIngest = (qAirActual * cubePressure(p, cube)) / s.env.pAtm;
      s.suction.stalled = sol.stalled && submerged && cube.vaneMode === 'vac' && cube.p_Pa < p.cube.pultFrac * s.env.pAtm * 1.8;
      s.suction.liftReq_m = sol.liftReq_m;
      s.suction.liftAvail_m = sol.liftAvail_m;
      s.suction.dpLoss_Pa = sol.dpLoss_Pa;
      probe.alpha = sol.alpha;
      const zEq = lay.surface + (s.env.pAtm - cube.p_Pa) / (draw.rhoMix * G);
      s.suction.riserFill = submerged ? clamp((zEq - zIntake) / (zCube - zIntake), 0, 1) : 0;
    } else {
      s.suction.stalled = false;
      s.suction.starved = false;
      probe.alpha = 0;
      s.suction.riserFill = cube.vaneMode === 'blow' ? lag(s.suction.riserFill, 0, 1.5, dt) : 0;
    }
    s.suction.uncovered = submerged ? draw.uncovered : 1;
    s.suction.q_m3s = qLiq;
    s.suction.airIn_m3s = airIngest;
    s.suction.tsMix = draw.tsMix;
    s.suction.rhoMix = draw.rhoMix;
    s.suction.mobile_m3 = draw.mobile_m3;
    s.suction.primed = qLiq > 1e-6;
    if (s.suction.primed && !this.wasPrimed) this.say('ok', 'I_PRIMED', 'Suction primed — sludge reaching the surge cube.');
    this.wasPrimed = s.suction.primed;
    this.log.edge(s.t, s.suction.stalled, 'warn', 'W_SUCTION_STALL', `Suction stalled — lift limit. Need ${s.suction.liftReq_m.toFixed(1)} m, vane pump gives ${s.suction.liftAvail_m.toFixed(1)} m at ${sc.site.altitude_m} m. Condition (thinner slurry) or air-assist.`, 'Suction restored.');
    this.log.edge(s.t, connected && submerged && draw.uncovered > 0.5 && cube.vaneMode === 'vac', 'warn', 'W_AIR_INGEST', 'Intake uncovered — air ingested, prime lost. Lower the lance.', undefined);
    this.log.edge(s.t, s.suction.starved && draw.uncovered < 0.5, 'warn', 'W_RATHOLE', 'Intake starved: immobile cake around the lance (rathole). Run the auger / jets.', undefined);
    // Early cue before the intake uncovers: the level is closing on the top of the screen.
    this.log.edge(s.t, submerged && s.pcp.rpm > 20 && !s.equip.lanceAuto && lay.surface - (zIntake + p.suction.screenH_m) < 0.12 && s.equip.lanceZ_m > 0.02, 'warn', 'W_LANCE_HIGH', `Level ${((lay.surface - zIntake) * 100).toFixed(0)} cm above the intake — lower the lance or switch the winch to AUTO.`, undefined);

    // Blow-back of the suction leg during purge; leg hold-up while primed.
    let blowBack = 0;
    let legFill = 0;
    if (connected && cube.vaneMode === 'blow') {
      const head = s.env.pAtm + columnDensityAbove(p, pit, lay, zIntake) * G * Math.max(0, lay.surface - zIntake);
      if (cube.p_Pa > head) blowBack = Math.min(0.004, (cube.p_Pa - head) / 2e6);
      if (s.suction.legLiquid_m3 > 0) {
        const back = Math.min(s.suction.legLiquid_m3, 0.004 * dt);
        s.suction.legLiquid_m3 -= back;
        applyInjection(pit, lay, zIntake, back, draw.tsMix);
      }
    } else if (s.suction.primed) {
      const full = boreArea(p.suction.d_m) * (pit.depth_m + p.suction.lanceAboveGround_m - zIntake + p.suction.hoseLen_m);
      if (s.suction.legLiquid_m3 < full) {
        legFill = Math.min(full - s.suction.legLiquid_m3, qLiq * dt * 0.2);
        s.suction.legLiquid_m3 += legFill;
      }
    }

    // 10 · PCP ⇄ hose ⇄ relief ⇄ jets (series solve)
    const hose = s.hose;
    const pcp = s.pcp;
    const hoseLaid = s.vehicle.atPit;
    const coeffs = hoseCoeffs(p, hose, this.geom.hoseElev);
    this.lastCurve = { static_Pa: coeffs.static_Pa, yield_Pa: coeffs.yield_Pa, visc: coeffs.visc, c2: coeffs.c2 };
    const checkValve = p.hose.checkValve && !s.fail.checkValveRemoved;
    const rhoCube = bulkDensity(p, cube.ts);
    const pIn = cube.p_Pa + rhoCube * G * (p.cube.floodH_m + cube.vLiq_m3 / p.cube.footprint_m2);
    const motorW = pcpPowerAvailable(p, s.power, s.power.pTotal_W - s.power.loads.pcp, s.env.altitude_m, pcpMotor_kW(p) * 1000);
    pcp.powerAvail_W = motorW;
    const pumpIn: PumpInputs = {
      nCmd_revs: pcp.cmd_rpm / 60,
      pAtm: s.env.pAtm,
      pIn,
      mu: muP(p, cube.ts, cube.temp_C),
      motor_W: motorW,
      cav: cavitationFactor(p, pIn, rhoCube),
      liqFrac: smoothstep(0.0005, p.cube.lowLevel_L / 1000, cube.vLiq_m3),
      ks: this.ks,
    };
    const lift = hose.reliefLift;
    const jetValve = connected ? probe.jetValve : 0;
    const flows = (P: number) => {
      const pt = pumpAt(p, pumpIn, P);
      const qh = hoseLaid ? hoseFlowAt(coeffs, P, checkValve) : 0;
      const qr = reliefFlow(p, lift, P);
      const qj = jetFlow(p, jetValve, P, rhoCube);
      return { pt, qh, qr, qj };
    };
    let pD: number;
    const lo = pIn - s.env.pAtm - 0.3e5;
    if (pumpIn.nCmd_revs > 1e-3) {
      const hi = p.pcp.dpTorqueLimit_bar * 1e5 + pIn - s.env.pAtm + 0.5e5;
      pD = bisectDecreasing((P) => {
        const f = flows(P);
        return f.pt.q - f.qh - f.qr - f.qj;
      }, lo, hi, 48);
    } else if (checkValve || !hoseLaid) {
      pD = Math.max(0, coeffs.static_Pa);
    } else {
      // No check valve: the hill column drains back through the stopped rotor's slip path.
      pD = bisectDecreasing((P) => {
        const f = flows(P);
        return f.pt.q - f.qh;
      }, lo, Math.max(coeffs.static_Pa + coeffs.yield_Pa + 1e5, 1e5), 48);
    }
    const fl = flows(pD);
    const running = pumpIn.nCmd_revs > 1e-3;
    const qPump = running ? fl.pt.q : checkValve || !hoseLaid ? 0 : fl.pt.q;
    const qHose = running ? fl.qh : checkValve || !hoseLaid ? 0 : fl.qh;
    const qRelief = running ? fl.qr : 0;
    const qJet = running ? fl.qj : 0;
    const load = shaftLoad(p, fl.pt);
    pcp.rpm = running ? fl.pt.n * 60 : 0;
    pcp.q_m3s = qPump;
    pcp.slip_m3s = running ? fl.pt.slip : 0;
    pcp.dp_Pa = fl.pt.dp;
    pcp.pIn_Pa = pIn;
    pcp.torque_Nm = running ? load.torque : 0;
    pcp.shaft_W = running ? load.shaft_W : 0;
    pcp.powerLimited = running && fl.pt.powerLimited;
    pcp.torqueStall = running && fl.pt.torqueStall;
    pcp.cavitation = pumpIn.cav;
    pcp.gasFrac = running ? 1 - pumpIn.liqFrac : 0;
    pcp.etaVol = running && fl.pt.n > 0 ? clamp(qPump / (fl.pt.n * (p.pcp.vd_L / 1000)), 0, 1) : 1;
    pcp.revs += fl.pt.n * dt * (running ? 1 : 0);
    // BST-07 metering: V = N_rev·V_d·η_vol(ΔP), minus the jet and relief branches the controller knows about.
    if (running) pcp.metered_m3 += Math.max(0, fl.pt.n * (p.pcp.vd_L / 1000) * etaVolEstimate(fl.pt.dp / 1e5) - qRelief - qJet) * dt;
    hose.pD_Pa = pD;
    hose.q_m3s = qHose;
    hose.relief_m3s = qRelief;
    hose.jet_m3s = qJet;
    hose.static_Pa = coeffs.static_Pa;
    hose.yield_Pa = coeffs.yield_Pa;
    hose.visc_Pa = coeffs.visc * Math.max(0, qHose);
    hose.minor_Pa = coeffs.c2 * qHose * qHose;
    hose.backflow = qHose < -1e-6;
    hose.reliefLift = lag(hose.reliefLift, reliefTargetLift(p, pD), p.hose.reliefTau_s, dt);
    s.totals.maxPd_Pa = Math.max(s.totals.maxPd_Pa, pD);

    // 11 · integrate the fluid path
    const drawn = applyDraw(pit, draw.w, qLiq * dt);
    s.totals.drawn_m3 += drawn;
    if (qJet > 0) {
      applyInjection(pit, lay, zIntake, qJet * dt, cube.ts);
      s.totals.jetted_m3 += qJet * dt;
    }
    if (submerged || (connected && zIntake < lay.surface + 0.3)) {
      const rpmAbs = Math.abs(probe.auger_rpm);
      if (rpmAbs > 20 && shear.submerged) mixZone(pit, lay, zIntake, p.suction.screenH_m, probe.rm_m, p.probe.kMix * (rpmAbs / 300), dt, this.mixG);
      if (qJet > 0) mixZone(pit, lay, zIntake, p.suction.screenH_m, p.probe.jetMixReach_m, p.probe.kMixJet * (qJet / lpmToM3s(p.probe.jetRef_lpm)), dt, this.mixG);
    }
    updateRathole(pit, lay, zIntake, qLiq > 0, draw.mobility[this.intakeCell(lay, zIntake)] ?? 0, Math.abs(probe.auger_rpm) > 50, dt);
    const rock = stepTrash(p, sc.containment.trash_recipe, probe, qLiq, this.rng, this.log, s.t, dt);
    cube.rockTrap_kg += rock + qLiq * dt * draw.rhoMix * (draw.tsMix / 100) * p.cube.gritFrac;
    stepCube(
      p,
      cube,
      s.env.pAtm,
      {
        qIn_m3s: Math.max(0, drawn - legFill) / dt,
        tsIn: draw.tsMix,
        qOut_m3s: Math.max(0, qPump),
        qReturn_m3s: qRelief + Math.max(0, -qPump),
        airFree_m3s: airFree + airIngest,
        blowBack_m3s: blowBack,
        fluidT_C: pit.fluidT_C,
      },
      dt,
    );
    if (cube.vaneMode === 'blow') cube.blow_s += dt;
    if (hoseLaid) {
      const adv = advanceHose(p, hose, qHose, cube.ts, pit.fluidT_C, dt);
      s.receiver.v_m3 += adv.delivered_m3;
      s.receiver.solids_kg += adv.deliveredSolids_kg;
      s.totals.delivered_m3 += adv.delivered_m3;
      if (qHose > 0) s.totals.pumped_m3 += qHose * dt;
      hoseProfile(p, hose, this.geom.hoseElev, pD, qHose);
    }
    stepStator(p, pcp, cube.temp_C, dt);

    // pit derived quantities
    const vPit = pitVolume(pit);
    pit.hLiq_m = vPit / pit.area_m2;
    pit.dhdt = lag(pit.dhdt, (pit.hLiq_m - this.hPrev) / dt, 5, dt);
    this.hPrev = pit.hLiq_m;
    pit.si = wallStability(pit);

    // 12 · trips and protective logic
    this.trips(dt, qLiq);

    // 13 · thermal and power
    stepThermal(
      p,
      s.thermal,
      {
        tAmb_C: s.env.tAmb_C,
        tFluid_C: pit.fluidT_C,
        flowing: qLiq > 0 || qHose > 0,
        heaterCmd: s.equip.heaterCmd,
        iBus_A: s.power.iBus,
        rBatt_ohm: battResistance(p, s.thermal.batt_C),
        linesWet: s.suction.primed,
      },
      dt,
    );
    if (st === 'Purging' && cube.blow_s > 10) s.thermal.residual = Math.min(s.thermal.residual, p.thermal.purgeResidual);
    const L = s.power.loads;
    L.pcp = pcp.shaft_W > 0 ? pcp.shaft_W / p.pcp.motorEta + p.pcp.dryTorque_Nm * (pcp.rpm / 60) * 2 * Math.PI * pcp.gasFrac * 0.5 : 0;
    L.auger = aug.power_W;
    L.vane = cube.vaneMode === 'off' ? 0 : cube.vaneMode === 'blow' ? p.cube.vanePower_kW * 1000 : 250 + p.cube.vanePower_kW * 1000 * cube.vaneU;
    L.blower = s.equip.blowerOn ? p.power.blower_W : 0;
    L.heater = s.thermal.heaterActive ? p.thermal.heater_W : 0;
    L.aux = p.power.aux_W + (s.job.state !== 'Idle' ? 15 : 0);
    L.travel = travelW;
    stepPower(p, s.power, s.thermal.batt_C, s.fail.batteryCold, dt);

    // 14 · SOP, telemetry, history
    this.updateSop(dt);
    if (s.job.jobId && s.job.startedSent && !s.job.closed && ['Priming', 'Extracting', 'Jetting', 'SeedLimit', 'Purging'].includes(s.job.state) && s.t - this.lastTelemT >= 10 - 1e-9) {
      this.lastTelemT = s.t;
      this.telem.sample(s.t, s.job.jobId, {
        p_d: +(hose.pD_Pa / 1e5).toFixed(1),
        p_c: +((cube.p_Pa - s.env.pAtm) / 1e5).toFixed(2),
        rpm: Math.round(pcp.rpm),
        q: Math.round(qHose * 60000),
        aug_a: +probe.current_A.toFixed(1),
        jet: probe.jetValve > 0.5,
      });
    }
    if (s.t - this.lastHistoryT >= HISTORY_DT - 1e-9) {
      this.lastHistoryT = s.t;
      this.history.push(this.historyRow());
      if (this.history.length > 14400) this.history.splice(0, this.history.length - 14400);
    }
  }

  private intakeCell(lay: PitLayout, z: number): number {
    for (let i = 0; i < N_CELLS; i++) if (lay.h[i] > 1e-6 && z < lay.zBot[i] + lay.h[i]) return i;
    return N_CELLS - 1;
  }

  private stepEquipment(dt: number) {
    const s = this.state;
    const p = this.params;
    const e = s.equip;
    if (e.crewTask) {
      e.crewTaskLeft_s -= dt;
      if (e.crewTaskLeft_s <= 0) {
        const v = this.crewValue;
        if (e.crewTask === 'manhole') {
          e.manholeOpen = v;
          this.say('info', 'I_MANHOLE', v ? 'Manhole opened with the lifter. Sealed headspace released.' : 'Manhole closed.');
          if (!v) {
            e.snifferPlaced = false;
            e.blowerOn = false;
          }
        } else if (e.crewTask === 'sniffer') {
          e.snifferPlaced = v;
          this.say('info', 'I_SNIFFER', v ? 'Gas sniffer GD-01 hung in the manhole.' : 'Sniffer removed.');
        } else if (e.crewTask === 'blower') {
          e.blowerOn = v;
          this.say('info', 'I_BLOWER', v ? 'Ex-proof blower BL-01 ON, duct into the manhole.' : 'Blower OFF.');
        }
        e.crewTask = null;
      }
    }
    // Tripod set-up / stow by the crew at the manhole.
    const tTarget = e.tripodCmd ? 1 : 0;
    const before = e.tripod;
    e.tripod = clamp(e.tripod + Math.sign(tTarget - e.tripod) * (dt / p.vehicle.tripodTime_s), 0, 1);
    if (before < 1 && e.tripod >= 1) this.say('info', 'I_TRIPOD', 'Davit tripod and winch set over the manhole.');
    if (before > 0 && e.tripod <= 0) this.say('info', 'I_TRIPOD_STOW', 'Tripod stowed on the rear deck.');
    // Winch.
    if (e.tripod >= 1) {
      const zMax = s.pit.depth_m + 0.35;
      if (e.lanceAuto) {
        // Only ever lowers: a deliberate deeper placement (e.g. at the cake interface) is kept.
        const follow = clamp(this.lay.surface - LANCE_AUTO_DEPTH, 0, zMax);
        if (e.lanceTarget_m !== null) e.lanceTarget_m = Math.min(e.lanceTarget_m, follow);
        else if (e.lanceZ_m > follow + 0.005) e.lanceTarget_m = follow;
      }
      if (e.lanceTarget_m !== null) {
        e.lanceZ_m = slew(e.lanceZ_m, e.lanceTarget_m, p.probe.lanceSpeed_ms, dt);
        if (Math.abs(e.lanceZ_m - e.lanceTarget_m) < 1e-4 && !e.lanceAuto) e.lanceTarget_m = null;
      } else if (e.lanceDir !== 0) e.lanceZ_m = clamp(e.lanceZ_m + e.lanceDir * p.probe.lanceSpeed_ms * dt, 0, zMax);
      if ((e.lanceZ_m <= 0 && e.lanceDir < 0) || (e.lanceZ_m >= zMax && e.lanceDir > 0)) e.lanceDir = 0;
    } else {
      e.lanceDir = 0;
      e.lanceAuto = false;
    }
    s.suction.connected = e.tripod >= 1 && e.lanceZ_m < s.pit.depth_m;

    // Exposure: crew working over an open manhole while the true headspace is unsafe.
    // With PPE, the short SOP tasks done from the rim with the lifter (open, hang sniffer,
    // place duct) are protected; leaning over the opening to rig the tripod is not.
    const shortTask = e.crewTask === 'manhole' || e.crewTask === 'sniffer' || e.crewTask === 'blower';
    const rigging = e.tripod > 0 && e.tripod < 1;
    const atManhole = rigging || (shortTask && !s.job.ppe);
    const tr = trueReading(s.gas);
    const unsafe = tr.h2s_ppm >= p.safety.h2sMax_ppm || tr.ch4_lel >= p.safety.ch4Max_lel || tr.co_ppm >= p.safety.coMax_ppm || tr.o2_pct < p.safety.o2Low_pct;
    const open = e.manholeOpen || e.crewTask === 'manhole';
    if (atManhole && open && unsafe) {
      e.exposure_s += dt * (s.job.ppe ? 0.5 : 1);
      if (e.exposure_s > 5 && !s.job.criticals.includes('gas_exposure')) {
        s.job.criticals.push('gas_exposure');
        this.say('alarm', 'A_EXPOSURE', `Critical: crew exposed at the manhole (${tr.h2s_ppm.toFixed(0)} ppm H₂S) for > 5 s${s.job.ppe ? '' : ' without PPE'}.`);
      }
    }
  }

  private stepVentTimer(dt: number) {
    const s = this.state;
    const p = this.params;
    const e = s.equip;
    const g = s.gas;
    const ventilating = e.manholeOpen && e.blowerOn && e.snifferPlaced;
    if (g.alarm) {
      if (s.il.ventTimer_s > 0 || s.il.ventDone) this.say(s.il.ventDone ? 'alarm' : 'warn', 'W_VENT_RESET', `Gas alarm (${g.alarmSpecies.join(', ') || 'detector'}) — ventilation timer reset.`);
      s.il.ventTimer_s = 0;
      s.il.ventDone = false;
    } else if (ventilating && !s.il.ventDone) {
      if (s.il.ventTimer_s === 0) {
        if (!s.job.vent) s.job.vent = { start_t: s.t, done_t: 0, o2Min: 99, h2sMax: 0, ch4Max: 0, coMax: 0 };
        // The record covers the clean window that releases K1.
        const v = s.job.vent;
        v.o2Min = 99;
        v.h2sMax = 0;
        v.ch4Max = 0;
        v.coMax = 0;
      }
      s.il.ventTimer_s += dt;
      const v = s.job.vent!;
      v.o2Min = Math.min(v.o2Min, g.sensed.o2_pct);
      v.h2sMax = Math.max(v.h2sMax, g.sensed.h2s_ppm);
      v.ch4Max = Math.max(v.ch4Max, g.sensed.ch4_lel);
      v.coMax = Math.max(v.coMax, g.sensed.co_ppm);
      if (s.il.ventTimer_s >= p.safety.vent_s) {
        s.il.ventDone = true;
        v.done_t = s.t;
        this.say('ok', 'I_VENT_DONE', 'Ventilation complete and gas safe — K1 permitted. Press ARM.');
      }
    } else if (!ventilating && !s.il.ventDone && s.il.ventTimer_s > 0) {
      s.il.ventTimer_s = 0;
      this.say('warn', 'W_VENT_INT', 'Ventilation interrupted — timer reset.');
    }
    // Peaks for the debrief.
    const pk = g.peak;
    if (e.snifferPlaced) {
      pk.h2s_ppm = Math.max(pk.h2s_ppm, g.sensed.h2s_ppm);
      pk.ch4_lel = Math.max(pk.ch4_lel, g.sensed.ch4_lel);
      pk.co_ppm = Math.max(pk.co_ppm, g.sensed.co_ppm);
      pk.o2Min_pct = Math.min(pk.o2Min_pct, g.sensed.o2_pct);
    }
    this.log.edge(s.t, g.alarm && e.snifferPlaced, 'alarm', 'A_GAS', `GAS ALARM: ${g.alarmSpecies.join(', ')} outside limits.`, 'Gas back inside limits.');
  }

  private autoTransitions() {
    const s = this.state;
    const st = s.job.state;
    const g = s.gas;
    if (st === 'Setup' && s.vehicle.outriggers >= 0.999 && s.equip.snifferPlaced && s.equip.blowerOn) this.go('SETUP_DONE', 'outriggers down, sniffer at manhole, blower ON');
    else if (st === 'Ventilating' && g.alarm) this.go('GAS_UNSAFE', g.alarmSpecies.join(', '));
    else if (st === 'GasHold' && !g.alarm) this.go('GAS_SAFE', 'timer restarts');
    else if (RUN_STATES.has(st) && !s.il.override) {
      let code: string | null = null;
      if (s.il.estopLatched) code = 'ESTOP';
      else if (s.fail.detectorFault) code = 'DETECTOR';
      else if (g.alarm) code = 'GAS';
      else if (PCP_STATES.has(st) && (s.pcp.run || s.pcp.rpm > 1)) {
        if (s.il.overpressure) code = 'OVERPRESSURE';
        else if (s.il.dryRun) code = 'DRY_RUN';
        else if (s.il.statorHot) code = 'STATOR';
        else if (!s.il.tiltOk) code = 'TILT';
      }
      if (code) {
        s.job.faults = [code];
        this.go('FAULT', code);
        if (code === 'GAS') this.say('alarm', 'A_GAS_RUN', 'Gas alarm during work: K1 dropped, all motors stopped, blower stays ON. Keep the crew back.');
      }
    }
    if ((st === 'Extracting' || st === 'Jetting') && s.pit.seedEvent && !s.job.seedOverride) this.go('SEED_LIMIT', 'depth gauge at 95 %');
    if (st === 'Purging' && s.cube.vLiq_m3 < 0.002 && s.cube.blow_s >= 20 && s.pcp.rpm < 1) this.go('PURGED', 'lines blown clear');
  }

  private trips(dt: number, qLiq: number) {
    const s = this.state;
    const p = this.params;
    const pcp = s.pcp;
    const il = s.il;
    // Overpressure: PT-02 > 22 bar for 200 ms drops K2 (relief already open at 20 bar).
    if (s.hose.pD_Pa > p.hose.trip_bar * 1e5 && !s.fail.overpressureTripDisabled) {
      il.overTimer_s += dt;
      if (il.overTimer_s >= p.hose.tripDelay_s && !il.overpressure) {
        il.overpressure = true;
        this.say('alarm', 'A_OVERPRESSURE', `PT-02 ${(s.hose.pD_Pa / 1e5).toFixed(1)} bar > ${p.hose.trip_bar} bar — K2 dropped. Find the kink / blockage.`);
      }
    } else il.overTimer_s = 0;
    if (s.hose.pD_Pa > 30e5 && !s.job.criticals.includes('hose_burst')) {
      s.job.criticals.push('hose_burst');
      this.say('alarm', 'A_BURST', 'HOSE BURST above 30 bar — sludge spray. (Trip was disabled.)');
      il.overpressure = true;
    }
    this.log.edge(s.t, s.hose.reliefLift > 0.05, 'warn', 'W_RELIEF', `Relief valve open at ${(s.hose.pD_Pa / 1e5).toFixed(1)} bar — flow returning to the cube. Condition the sludge (DR-2) or check the hose.`, 'Relief valve reseated.');
    // Dry-run: LT-01 low while the PCP turns.
    const low = s.cube.vLiq_m3 * 1000 < p.cube.lowLevel_L;
    if (s.job.state === 'Purging') {
      // During the purge the blown cube keeps the inlet flooded; pump down to 1.5 L.
      if (s.cube.vLiq_m3 * 1000 < 1.5 && pcp.run && s.cube.blow_s > 3) {
        pcp.run = false;
        this.say('ok', 'I_PUMPOUT', 'Cube pumped out; PCP stopped on low level.');
      }
      il.dryRunTimer_s = 0;
    } else if (low && pcp.rpm > 20) {
      il.dryRunTimer_s += dt;
      if (il.dryRunTimer_s >= p.safety.dryRunTrip_s && !il.dryRun) {
        if (s.fail.dryRunTripDisabled) this.log.edge(s.t, true, 'warn', 'W_DRYRUN_NOTRIP', 'PCP running dry — trip DISABLED (sandbox). Watch TT-01.');
        else {
          il.dryRun = true;
          this.say('alarm', 'A_DRY_RUN', `Dry-run trip: LT-01 below ${p.cube.lowLevel_L} L for ${p.safety.dryRunTrip_s} s — K2 dropped.`);
        }
      }
    } else il.dryRunTimer_s = 0;
    if (pcp.statorT_C >= p.pcp.statorTrip_C && !il.statorHot) {
      il.statorHot = true;
      this.say('alarm', 'A_STATOR', `TT-01 stator ${pcp.statorT_C.toFixed(0)} °C ≥ ${p.pcp.statorTrip_C} °C — K2 dropped.`);
    }
    if (pcp.burnt) this.log.edge(s.t, true, 'alarm', 'A_STATOR_BURNT', 'Stator burnt (> 120 °C). Pump out of service.');
    this.log.edge(s.t, pcp.cavitation < 0.97 && pcp.rpm > 20, 'warn', 'W_CAVITATION', `PCP inlet ${(pcp.pIn_Pa / 1000).toFixed(0)} kPa abs below NPSH — cavitation / gas release (DR-3). Reduce cube vacuum.`, 'PCP inlet pressure recovered.');
    this.log.edge(s.t, pcp.powerLimited && pcp.rpm > 20, 'warn', 'W_POWER_LIMIT', `PCP at its ${pcpMotor_kW(p)} kW power limit — speed reduced to ${pcp.rpm.toFixed(0)} rpm (DR-1).`, 'PCP back below its power limit.');
    this.log.edge(s.t, s.probe.blinding > 0.55, 'warn', 'W_BLINDING', `Screen ${Math.round(s.probe.blinding * 100)} % blinded — run the auger to wipe it.`, 'Screen clear.');
    this.log.edge(s.t, s.cube.floatTripped, 'warn', 'W_FLOAT', 'Cube float high — vane pump isolated.', undefined);
    this.log.edge(s.t, s.cube.rockTrap_kg > p.cube.rockTrapLimit_kg, 'warn', 'W_ROCKTRAP', 'Rock trap full — empty at the next stop.', undefined);
    this.log.edge(s.t, s.suction.frozen, 'alarm', 'A_FROZEN', 'Small lines blocked by ice. Run the jacket heater; purge before idle periods.', 'Lines thawed.');
    this.log.edge(s.t, s.receiver.v_m3 > s.receiver.cap_m3, 'alarm', 'A_TANKER_FULL', 'Tanker full — stop pumping.', undefined);
    this.log.edge(s.t, s.probe.current_A > 6 && s.probe.jetValve < 0.5 && ['Extracting', 'Priming'].includes(s.job.state), 'info', 'I_CAKE', `Auger current ${s.probe.current_A.toFixed(1)} A — consolidated cake at the tip. Consider JET ON.`, undefined);
    // Seed layer (DT-01 / 95 % volume).
    const pit = s.pit;
    const removed = 1 - pitVolume(pit) / pit.v0_m3;
    if (!pit.seedEvent && (pit.hLiq_m <= p.safety.seedLayer_mm / 1000 + p.safety.seedMargin_m || removed >= p.safety.seedFrac) && (qLiq > 0 || pcp.rpm > 20)) {
      pit.seedEvent = true;
      this.say('warn', 'W_SEED', `Seed-layer limit: ${(removed * 100).toFixed(0)} % removed, ${(pit.hLiq_m * 1000).toFixed(0)} mm left. Stop, or override (logged).`);
    }
    if (pit.hLiq_m < p.safety.seedLayer_mm / 1000 && !s.job.criticals.includes('seed_removed') && !s.job.seedOverride) {
      s.job.criticals.push('seed_removed');
      this.say('warn', 'W_SEED_REMOVED', 'Seed layer removed without justification.');
    }
    if (pit.si > 1 && !pit.collapsed) {
      pit.collapsed = true;
      this.say('alarm', 'A_COLLAPSE', 'Pit wall collapse (SI > 1). Fast draw-down in an unlined pit — use soft draw-down.');
      if (s.equip.crewTask) s.job.criticals.push('collapse');
    }
  }

  private updateSop(dt: number) {
    const s = this.state;
    const p = this.params;
    const d = s.job.sop;
    const latch = (i: number, cond: boolean) => {
      if (!d[i] && cond) {
        d[i] = true;
        this.say('ok', `SOP_${i + 1}`, `Step ${i + 1} complete: ${SOP[i].title}.`);
      }
    };
    latch(0, s.vehicle.atPit && s.vehicle.outriggers >= 0.999 && s.vehicle.chocks >= 0.999);
    latch(1, s.job.checkedIn);
    latch(2, s.job.ppe);
    latch(3, s.equip.manholeOpen);
    latch(4, s.il.ventDone);
    latch(5, s.equip.tripod >= 1 && s.equip.lanceZ_m + p.probe.footH_m < this.lay.surface);
    latch(6, s.suction.primed && s.cube.vLiq_m3 * 1000 > p.cube.primeLevel_L);
    latch(7, s.pcp.rpm > 50 && Math.abs(s.probe.auger_rpm) > 50);
    if (s.pcp.rpm > 50 && (s.probe.jetValve > 0.9 || s.suction.tsMix <= 12)) s.job.conditionTimer_s += dt;
    latch(8, d[7] && s.job.conditionTimer_s > 30);
    latch(9, s.pit.seedEvent);
    latch(10, s.job.state === 'Decon' || s.job.deconConfirmed);
    latch(11, s.job.deconConfirmed);
    latch(12, s.job.deconConfirmed && !s.equip.manholeOpen && s.equip.tripod <= 0 && s.vehicle.outriggers <= 0);
    latch(13, s.job.closed && !!s.job.fstp);
  }

  private historyRow(): number[] {
    const s = this.state;
    const v = pitVolume(s.pit);
    return [
      s.t,
      s.hose.pD_Pa / 1e5,
      (s.cube.p_Pa - s.env.pAtm) / 1e5,
      s.hose.q_m3s * 60000,
      s.suction.q_m3s * 60000,
      s.hose.jet_m3s * 60000,
      s.hose.relief_m3s * 60000,
      s.gas.sensed.h2s_ppm,
      s.gas.sensed.o2_pct,
      s.gas.sensed.ch4_lel,
      s.gas.sensed.co_ppm,
      s.probe.current_A,
      s.suction.q_m3s > 0 ? s.suction.tsMix : NaN,
      s.pcp.statorT_C,
      s.power.soc * 100,
      s.power.pTotal_W / 1000,
      s.cube.vLiq_m3 * 1000,
      (100 * (s.pit.v0_m3 - v)) / s.pit.v0_m3,
      s.pcp.rpm,
      meanTS(s.pit),
      Math.min(1, s.hose.vol_m3 / (s.hose.length_m * s.hose.area_m2)) * 100,
    ];
  }

  // ------------------------------------------------------------------ snapshot
  objectives(): Snapshot['objectives'] {
    const s = this.state;
    const removed = (100 * (s.pit.v0_m3 - pitVolume(s.pit))) / s.pit.v0_m3;
    const jobMin = s.job.startT !== null ? ((s.job.endT ?? s.t) - s.job.startT) / 60 : 0;
    return this.scenario.objectives.map((o) => {
      let met: boolean | null = null;
      let value = '';
      switch (o.type) {
        case 'volume_removed_pct':
          value = `${removed.toFixed(0)} %`;
          met = removed >= (o.gte ?? 90) ? true : s.job.closed ? false : null;
          break;
        case 'seed_layer_respected':
          value = s.job.criticals.includes('seed_removed') ? 'removed' : `${Math.max(0, s.pit.hLiq_m * 1000).toFixed(0)} mm left`;
          met = s.job.criticals.includes('seed_removed') ? false : s.job.closed ? true : null;
          break;
        case 'fresh_water_used_l':
          value = `${s.totals.freshWater_L.toFixed(0)} L`;
          met = s.totals.freshWater_L <= (o.lte ?? 0);
          break;
        case 'no_critical_violation': {
          const crit = s.job.criticals.filter((c) => c !== 'seed_removed');
          value = crit.length ? crit.join(', ') : 'none';
          met = crit.length ? false : s.job.closed ? true : null;
          break;
        }
        case 'job_time_min':
          value = `${jobMin.toFixed(0)} min`;
          met = jobMin > (o.lte ?? 90) ? false : s.job.closed ? true : null;
          break;
      }
      return { id: o.id, label: o.label, met, value, optional: !!o.optional };
    });
  }

  snapshot(): Snapshot {
    const s = this.state;
    const p = this.params;
    const pit = s.pit;
    const lay = this.lay;
    const r = this.reasons();
    const vPit = pitVolume(pit);
    const tr = trueReading(s.gas);
    const plume = plumeIntensity(s.gas);
    const kWh = s.power.energy_J / 3.6e6;
    const pumped = s.totals.pumped_m3;
    const sopCurrent = s.job.sop.findIndex((x) => !x);
    const zIntake = s.equip.lanceZ_m + p.probe.footH_m;
    const c = this.scenario.containment;
    return {
      t: s.t,
      clock_s: s.tod0_s + s.t,
      mode: this.mode,
      job: {
        state: s.job.state,
        enteredAt: s.job.enteredAt,
        jobId: s.job.jobId,
        checkedIn: s.job.checkedIn,
        ppe: s.job.ppe,
        k1: s.il.k1,
        k2: s.il.k2,
        travelEnable: s.il.travelEnable,
        override: s.il.override,
        estop: s.il.estopLatched,
        vent_s: s.il.ventTimer_s,
        ventTotal_s: p.safety.vent_s,
        ventDone: s.il.ventDone,
        k1Block: r.k1,
        k2Block: r.k2,
        trips: { dryRun: s.il.dryRun, overpressure: s.il.overpressure, statorHot: s.il.statorHot, tiltOk: s.il.tiltOk },
        faults: s.job.faults,
        seedEvent: pit.seedEvent,
        seedOverride: s.job.seedOverride,
        deconConfirmed: s.job.deconConfirmed,
        closed: s.job.closed,
        sop: [...s.job.sop],
        sopCurrent: sopCurrent < 0 ? s.job.sop.length : sopCurrent,
        criticals: [...s.job.criticals],
        blockedAttempts: s.job.blockedAttempts,
        fstp: s.job.fstp,
        elapsed_s: s.job.startT !== null ? (s.job.endT ?? s.t) - s.job.startT : 0,
        exposure_s: s.equip.exposure_s,
      },
      env: {
        altitude_m: s.env.altitude_m,
        pAtm_kPa: s.env.pAtm / 1000,
        tAmb_C: s.env.tAmb_C,
        wind_ms: s.env.wind_ms,
        hMaxSludge_m: hMaxSuction_m(s.env.altitude_m, p.fluid.rhoSludge, p.vacuum.etaVac),
        hMaxWater_m: hMaxSuction_m(s.env.altitude_m, p.fluid.rhoWater, 1),
        hMaxAerated_m: hMaxSuction_m(s.env.altitude_m, 700, p.vacuum.etaVac),
      },
      vehicle: {
        s_m: s.vehicle.s_m,
        laneLength_m: this.geom.lane.length,
        moving: s.vehicle.moving,
        heading: s.vehicle.heading,
        pitch_deg: s.vehicle.pitch_deg,
        roll_deg: s.vehicle.roll_deg,
        tilt_deg: workingTilt(s.vehicle),
        outriggers: s.vehicle.outriggers,
        chocks: s.vehicle.chocks,
        atPit: s.vehicle.atPit,
        v_ms: s.vehicle.v_ms,
        target: s.vehicle.target,
      },
      equip: {
        manholeOpen: s.equip.manholeOpen,
        snifferPlaced: s.equip.snifferPlaced,
        blowerOn: s.equip.blowerOn,
        tripod: s.equip.tripod,
        lanceZ_m: s.equip.lanceZ_m,
        lanceDir: s.equip.lanceDir,
        lanceAuto: s.equip.lanceAuto,
        crewTask: s.equip.crewTask,
        heater: s.thermal.heaterActive,
        heaterCmd: s.equip.heaterCmd,
      },
      gas: {
        sensed: { ...s.gas.sensed },
        true: tr,
        alarm: s.gas.alarm,
        alarmSpecies: [...s.gas.alarmSpecies],
        plume: s.equip.manholeOpen ? plume.level : 0,
        dominant: plume.dominant,
        qVent_m3h: s.gas.qVent_m3s * 3600,
        headspace_m3: s.gas.headspace_m3,
        dissolved: s.gas.dissolved,
        peak: { ...s.gas.peak },
      },
      pit: {
        depth_m: pit.depth_m,
        area_m2: pit.area_m2,
        l_m: c.l_m,
        w_m: c.w_m,
        surface_m: lay.surface,
        cells: Array.from({ length: N_CELLS }, (_, i) => ({ z0: lay.zBot[i], h: lay.h[i], ts: pit.ts[i], kind: pit.kind[i], w: this.draw.w[i], mob: this.draw.mobility[i] })),
        volume_L: vPit * 1000,
        volume0_L: pit.v0_m3 * 1000,
        removedPct: (100 * (pit.v0_m3 - vPit)) / pit.v0_m3,
        meanTS: meanTS(pit),
        bedTop_m: bedTop(pit, lay),
        rathole_m: pit.rathole_m,
        seedMargin_mm: (lay.surface - p.safety.seedLayer_mm / 1000) * 1000,
        depthGauge_m: zIntake < lay.surface ? ((lay.surface - s.equip.lanceZ_m) * columnDensityAbove(p, pit, lay, s.equip.lanceZ_m)) / 1000 : 0,
        si: pit.si,
        collapsed: pit.collapsed,
        fluidT_C: pit.fluidT_C,
      },
      probe: {
        auger_rpm: s.probe.auger_rpm,
        augerDir: s.probe.augerDir,
        augerSet_rpm: s.probe.augerSet_rpm,
        current_A: s.probe.current_A,
        torque_Nm: s.probe.torque_Nm,
        stalled: s.probe.stalled,
        wraps: s.probe.wraps,
        blinding: s.probe.blinding,
        jetCmd: s.probe.jetCmd,
        jetValve: s.probe.jetValve,
        jet_lpm: s.hose.jet_m3s * 60000,
        airCmd: s.probe.airCmd,
        alpha: s.probe.alpha,
        tauAuger_Pa: s.probe.tauAuger_Pa,
        tauJet_Pa: s.probe.tauJet_Pa,
        rm_m: s.probe.rm_m,
        trash: { ...s.probe.trash },
        deflected: s.probe.deflected,
        intakeZ_m: zIntake,
      },
      suction: {
        connected: s.suction.connected,
        q_lpm: s.suction.q_m3s * 60000,
        primed: s.suction.primed,
        stalled: s.suction.stalled,
        uncovered: s.suction.uncovered,
        starved: s.suction.starved,
        tsMix: s.suction.tsMix,
        tauY_Pa: tauY(p, s.suction.tsMix, pit.fluidT_C),
        riserFill: s.suction.riserFill,
        liftReq_m: s.suction.liftReq_m,
        liftAvail_m: s.suction.liftAvail_m,
        frozen: s.suction.frozen,
        airIn_lpm: s.suction.airIn_m3s * 60000,
      },
      cube: {
        level_L: s.cube.vLiq_m3 * 1000,
        levelPct: (s.cube.vLiq_m3 * 1000 * 100) / p.cube.v_L,
        p_barg: (s.cube.p_Pa - s.env.pAtm) / 1e5,
        p_kPa: s.cube.p_Pa / 1000,
        pSet_barg: (s.cube.pSet_Pa - s.env.pAtm) / 1e5,
        ts: s.cube.ts,
        floatTripped: s.cube.floatTripped,
        vaneMode: s.cube.vaneMode,
        vaneU: s.cube.vaneU,
        rockTrap_kg: s.cube.rockTrap_kg,
        temp_C: s.cube.temp_C,
      },
      pcp: {
        run: s.pcp.run,
        set_rpm: s.pcp.set_rpm,
        rpm: s.pcp.rpm,
        q_lpm: s.pcp.q_m3s * 60000,
        slip_lpm: s.pcp.slip_m3s * 60000,
        dp_bar: s.pcp.dp_Pa / 1e5,
        pIn_kPa: s.pcp.pIn_Pa / 1000,
        torque_Nm: s.pcp.torque_Nm,
        shaft_kW: s.pcp.shaft_W / 1000,
        motor_kW: pcpMotor_kW(p),
        option: p.pcp.option,
        powerLimited: s.pcp.powerLimited,
        torqueStall: s.pcp.torqueStall,
        statorT_C: s.pcp.statorT_C,
        cavitation: s.pcp.cavitation,
        gasFrac: s.pcp.gasFrac,
        etaVol: s.pcp.etaVol,
        metered_L: s.pcp.metered_m3 * 1000,
        burnt: s.pcp.burnt,
        limits: { etaMech: p.pcp.etaMech, vd_L: p.pcp.vd_L, rpmMin: p.pcp.rpmMin, rpmMax: p.pcp.rpmMax, motorA_kW: p.pcp.motorA_kW, motorB_kW: p.pcp.motorB_kW, dpTorqueLimit_bar: p.pcp.dpTorqueLimit_bar, relief_bar: p.hose.relief_bar, trip_bar: p.hose.trip_bar },
      },
      hose: {
        pD_bar: s.hose.pD_Pa / 1e5,
        q_lpm: s.hose.q_m3s * 60000,
        relief_lpm: s.hose.relief_m3s * 60000,
        reliefLift: s.hose.reliefLift,
        reliefOpen: s.hose.reliefLift > 0.02,
        jet_lpm: s.hose.jet_m3s * 60000,
        fill: Math.min(1, s.hose.vol_m3 / (s.hose.length_m * s.hose.area_m2)),
        front_m: Math.min(s.hose.length_m, s.hose.vol_m3 / s.hose.area_m2),
        length_m: s.hose.length_m,
        vol_L: s.hose.vol_m3 * 1000,
        static_bar: s.hose.static_Pa / 1e5,
        yield_bar: s.hose.yield_Pa / 1e5,
        visc_bar: s.hose.visc_Pa / 1e5,
        meanTS: hoseMeanTS(s.hose),
        pProfile: Array.from(s.hose.pProfile, (x) => x / 1e5),
        tsProfile: Array.from(s.hose.tsProfile),
        kink: s.hose.kink,
        crushed: s.hose.crushed,
        backflow: s.hose.backflow,
        checkValve: p.hose.checkValve && !s.fail.checkValveRemoved,
        d_m: p.hose.d_m,
        elevGain_m: this.geom.hoseElev.at(this.geom.hoseRoute.length) - this.geom.hoseElev.at(0),
        curve: { static_bar: this.lastCurve.static_Pa / 1e5, yield_bar: this.lastCurve.yield_Pa / 1e5, visc_bar_per_lpm: this.lastCurve.visc / 1e5 / 60000, c2_bar_per_lpm2: this.lastCurve.c2 / 1e5 / 60000 / 60000 },
      },
      receiver: { v_L: s.receiver.v_m3 * 1000, cap_L: s.receiver.cap_m3 * 1000 },
      thermal: { line_C: s.thermal.line_C, batt_C: s.thermal.batt_C, ice: s.thermal.ice, heaterActive: s.thermal.heaterActive, residual: s.thermal.residual },
      power: {
        source: p.power.source,
        soc: s.power.soc,
        vBus: s.power.vBus,
        iBus: s.power.iBus,
        p_kW: s.power.pTotal_W / 1000,
        energy_kWh: kWh,
        pump_kWh: s.power.energyPump_J / 3.6e6,
        specific_kWhm3: pumped > 0.05 ? kWh / pumped : 0,
        fuel_L: s.power.fuel_L,
        loads: { ...s.power.loads },
        limited: s.power.limited,
      },
      totals: {
        drawn_L: s.totals.drawn_m3 * 1000,
        pumped_L: pumped * 1000,
        delivered_L: s.totals.delivered_m3 * 1000,
        jetted_L: s.totals.jetted_m3 * 1000,
        freshWater_L: s.totals.freshWater_L,
        maxPd_bar: s.totals.maxPd_Pa / 1e5,
      },
      objectives: this.objectives(),
      alarms: this.log.activeCodes().filter((c) => c.startsWith('A_')),
      fail: { ...s.fail },
    };
  }

  /** Stable hash of the continuous state (determinism tests, replay checks). */
  hash(): string {
    const s = this.state;
    const nums = [s.t, s.cube.mGas, s.cube.vLiq_m3, s.cube.ts, s.hose.pD_Pa, s.hose.vol_m3, s.pcp.statorT_C, s.gas.c.h2s, s.gas.sensed.h2s_ppm, s.power.soc, s.probe.blinding, ...s.pit.v, ...s.pit.ts];
    let h = 2166136261 >>> 0;
    for (const x of nums) {
      const str = x.toPrecision(17);
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
    }
    return h.toString(16).padStart(8, '0');
  }
}

export function createSim(opts: SimOptions): Sim {
  return new Sim(opts);
}
