import type { ElevationTable, Polyline } from './geometry/route';
import type { VacMode } from './commands';
import type { JobStateName } from './control/jobMachine';
import type { Params } from './params';
import type { Scenario } from './scenario';
import { EventLog } from './events';
import { createRng, type Rng } from './rng';
import { pAtm_Pa } from './models/atmosphere';
import { initPit, type PitState } from './models/pit';
import { initGas, type GasState } from './models/gas';
import { boreArea } from './units';

/** Fixed physics step, 10 ms (SIM-NFR-03). */
export const DT = 0.01;

/** Scene geometry resolved for the scenario (from src/data/scenes). */
export interface SimGeometry {
  lane: Polyline;
  laneElev: ElevationTable;
  hoseRoute: Polyline;
  hoseElev: ElevationTable;
}

export interface VehicleState {
  s_m: number;
  target: 'pit' | 'road' | null;
  moving: boolean;
  v_ms: number;
  pitch_deg: number;
  roll_deg: number;
  heading: 1 | -1;
  outriggers: number;
  outriggersCmd: boolean;
  chocks: number;
  chocksCmd: boolean;
  atPit: boolean;
  travel_m: number;
  rolledOver: boolean;
}

export type CrewTask = 'manhole' | 'sniffer' | 'blower' | 'tripod' | 'stow';

export interface EquipState {
  manholeOpen: boolean;
  snifferPlaced: boolean;
  blowerOn: boolean;
  tripod: number;
  tripodCmd: boolean;
  /** Lance foot (tip) elevation in pit-local coordinates (pit floor = 0). */
  lanceZ_m: number;
  lanceDir: -1 | 0 | 1;
  lanceTarget_m: number | null;
  /** Winch follows the falling level (DT-01), keeping the tip LANCE_AUTO_DEPTH below the surface. */
  lanceAuto: boolean;
  heaterCmd: boolean;
  crewTask: CrewTask | null;
  crewTaskLeft_s: number;
  exposure_s: number;
}

export interface InterlockState {
  estopLatched: boolean;
  watchdogOk: boolean;
  ventTimer_s: number;
  ventDone: boolean;
  dryRunTimer_s: number;
  dryRun: boolean;
  overTimer_s: number;
  overpressure: boolean;
  statorHot: boolean;
  tiltOk: boolean;
  k1: boolean;
  k2: boolean;
  travelEnable: boolean;
  override: boolean;
}

export interface ProbeState {
  augerDir: -1 | 0 | 1;
  augerSet_rpm: number;
  /** Signed actual speed (+ forward / − reverse). */
  auger_rpm: number;
  torque_Nm: number;
  current_A: number;
  stalled: boolean;
  wraps: number;
  reverseClear_s: number;
  blinding: number;
  jetCmd: boolean;
  jetValve: number;
  airCmd: boolean;
  alpha: number;
  rm_m: number;
  tauAuger_Pa: number;
  tauJet_Pa: number;
  trash: Record<string, number>;
  deflected: number;
}

export interface SuctionState {
  connected: boolean;
  q_m3s: number;
  airIn_m3s: number;
  primed: boolean;
  stalled: boolean;
  uncovered: number;
  starved: boolean;
  tsMix: number;
  rhoMix: number;
  riserFill: number;
  liftReq_m: number;
  liftAvail_m: number;
  dpLoss_Pa: number;
  mobile_m3: number;
  legLiquid_m3: number;
  frozen: boolean;
}

export interface CubeState {
  vLiq_m3: number;
  ts: number;
  /** Gas content as P·V (Pa·m³); isothermal, so P = m / V_gas. */
  mGas: number;
  p_Pa: number;
  floatTripped: boolean;
  vaneMode: VacMode;
  vaneU: number;
  pSet_Pa: number;
  levelI: number;
  rockTrap_kg: number;
  temp_C: number;
  blow_s: number;
}

export interface PcpState {
  run: boolean;
  set_rpm: number;
  /** VFD reference after ramp. */
  cmd_rpm: number;
  rpm: number;
  q_m3s: number;
  slip_m3s: number;
  dp_Pa: number;
  pIn_Pa: number;
  torque_Nm: number;
  shaft_W: number;
  powerLimited: boolean;
  torqueStall: boolean;
  statorT_C: number;
  cavitation: number;
  gasFrac: number;
  etaVol: number;
  revs: number;
  metered_m3: number;
  burnt: boolean;
  powerAvail_W: number;
}

export interface Parcel {
  v: number;
  ts: number;
  rho: number;
  tauY: number;
  mu: number;
}

export interface HoseState {
  parcels: Parcel[];
  vol_m3: number;
  length_m: number;
  area_m2: number;
  /** PT-02, gauge, just downstream of the check valve. */
  pD_Pa: number;
  q_m3s: number;
  relief_m3s: number;
  reliefLift: number;
  jet_m3s: number;
  static_Pa: number;
  yield_Pa: number;
  visc_Pa: number;
  minor_Pa: number;
  kink: { s_m: number; severity: number } | null;
  crushed: { s_m: number } | null;
  /** p(s) and TS(s) on 33 samples along the route (UI + 3D colour ramp). */
  pProfile: Float64Array;
  tsProfile: Float64Array;
  backflow: boolean;
}

export interface ThermalState {
  line_C: number;
  batt_C: number;
  ice: number;
  residual: number;
  heaterActive: boolean;
}

export interface PowerState {
  soc: number;
  vBus: number;
  iBus: number;
  pTotal_W: number;
  energy_J: number;
  energyPump_J: number;
  fuel_L: number;
  loads: { pcp: number; auger: number; vane: number; blower: number; heater: number; aux: number; travel: number };
  limited: boolean;
}

export interface FailureState {
  checkValveRemoved: boolean;
  dryRunTripDisabled: boolean;
  overpressureTripDisabled: boolean;
  h2sSensorStuck: boolean;
  detectorFault: boolean;
  batteryCold: boolean;
}

export interface JobCtx {
  state: JobStateName;
  prev: JobStateName;
  enteredAt: number;
  jobId: string | null;
  checkedIn: boolean;
  ppe: boolean;
  vent: { start_t: number; done_t: number; o2Min: number; h2sMax: number; ch4Max: number; coMax: number } | null;
  startedSent: boolean;
  seedOverride: boolean;
  seedReason: string;
  deconConfirmed: boolean;
  closed: boolean;
  faults: string[];
  startT: number | null;
  endT: number | null;
  fstp: FstpResult | null;
  sop: boolean[];
  conditionTimer_s: number;
  criticals: string[];
  blockedAttempts: number;
  overrideUsed: boolean;
}

export interface FstpResult {
  facility: 'fstp' | 'drain';
  received_L: number;
  metered_L: number;
  rules: { id: string; label: string; pass: boolean; detail: string }[];
  verified: boolean;
}

export interface Totals {
  drawn_m3: number;
  pumped_m3: number;
  delivered_m3: number;
  jetted_m3: number;
  freshWater_L: number;
  maxPd_Pa: number;
}

export interface SimState {
  t: number;
  step: number;
  tod0_s: number;
  env: { altitude_m: number; pAtm: number; tAmb_C: number; wind_ms: number };
  vehicle: VehicleState;
  equip: EquipState;
  gas: GasState;
  il: InterlockState;
  job: JobCtx;
  pit: PitState;
  probe: ProbeState;
  suction: SuctionState;
  cube: CubeState;
  pcp: PcpState;
  hose: HoseState;
  receiver: { v_m3: number; solids_kg: number; cap_m3: number };
  thermal: ThermalState;
  power: PowerState;
  fail: FailureState;
  totals: Totals;
  /** Decaying multiplier for injected / scripted gas spikes. */
  gasSpike: number;
  firedEvents: boolean[];
}

export interface SimContext {
  params: Params;
  scenario: Scenario;
  geom: SimGeometry;
  rng: Rng;
  log: EventLog;
  seed: number;
}

export const SOP_STEPS = 14;

export function initState(ctx: Omit<SimContext, 'rng' | 'log'>): { state: SimState; rng: Rng; log: EventLog } {
  const { params: p, scenario: sc, geom } = ctx;
  const rng = createRng(ctx.seed);
  const log = new EventLog();
  const pAtm = pAtm_Pa(sc.site.altitude_m);
  const pit = initPit(sc, p);
  const area = boreArea(p.hose.d_m);
  const state: SimState = {
    t: 0,
    step: 0,
    tod0_s: sc.startTime_h * 3600,
    env: { altitude_m: sc.site.altitude_m, pAtm, tAmb_C: sc.site.ambient.mean_c, wind_ms: sc.site.wind_ms },
    vehicle: {
      s_m: 0,
      target: null,
      moving: false,
      v_ms: 0,
      pitch_deg: 0,
      roll_deg: 0,
      heading: 1,
      outriggers: 0,
      outriggersCmd: false,
      chocks: 0,
      chocksCmd: false,
      atPit: false,
      travel_m: 0,
      rolledOver: false,
    },
    equip: {
      manholeOpen: false,
      snifferPlaced: false,
      blowerOn: false,
      tripod: 0,
      tripodCmd: false,
      lanceZ_m: pit.depth_m + 0.35,
      lanceDir: 0,
      lanceTarget_m: null,
      lanceAuto: false,
      heaterCmd: sc.site.ambient.mean_c < 5,
      crewTask: null,
      crewTaskLeft_s: 0,
      exposure_s: 0,
    },
    gas: initGas(sc, p),
    il: {
      estopLatched: false,
      watchdogOk: true,
      ventTimer_s: 0,
      ventDone: false,
      dryRunTimer_s: 0,
      dryRun: false,
      overTimer_s: 0,
      overpressure: false,
      statorHot: false,
      tiltOk: true,
      k1: false,
      k2: false,
      travelEnable: true,
      override: false,
    },
    job: {
      state: 'Idle',
      prev: 'PowerOff',
      enteredAt: 0,
      jobId: null,
      checkedIn: false,
      ppe: false,
      vent: null,
      startedSent: false,
      seedOverride: false,
      seedReason: '',
      deconConfirmed: false,
      closed: false,
      faults: [],
      startT: null,
      endT: null,
      fstp: null,
      sop: new Array(SOP_STEPS).fill(false),
      conditionTimer_s: 0,
      criticals: [],
      blockedAttempts: 0,
      overrideUsed: false,
    },
    pit,
    probe: {
      augerDir: 0,
      augerSet_rpm: 300,
      auger_rpm: 0,
      torque_Nm: 0,
      current_A: 0,
      stalled: false,
      wraps: 0,
      reverseClear_s: 0,
      blinding: 0,
      jetCmd: false,
      jetValve: 0,
      airCmd: false,
      alpha: 0,
      rm_m: p.probe.rm0_m,
      tauAuger_Pa: 0,
      tauJet_Pa: 0,
      trash: {},
      deflected: 0,
    },
    suction: {
      connected: false,
      q_m3s: 0,
      airIn_m3s: 0,
      primed: false,
      stalled: false,
      uncovered: 1,
      starved: false,
      tsMix: 0,
      rhoMix: p.fluid.rhoSludge,
      riserFill: 0,
      liftReq_m: 0,
      liftAvail_m: 0,
      dpLoss_Pa: 0,
      mobile_m3: 0,
      legLiquid_m3: 0,
      frozen: false,
    },
    cube: {
      vLiq_m3: 0,
      ts: 0,
      mGas: pAtm * (p.cube.v_L / 1000),
      p_Pa: pAtm,
      floatTripped: false,
      vaneMode: 'off',
      vaneU: 0,
      pSet_Pa: pAtm,
      levelI: 0,
      rockTrap_kg: 0,
      temp_C: sc.site.ambient.mean_c,
      blow_s: 0,
    },
    pcp: {
      run: false,
      set_rpm: 300,
      cmd_rpm: 0,
      rpm: 0,
      q_m3s: 0,
      slip_m3s: 0,
      dp_Pa: 0,
      pIn_Pa: pAtm,
      torque_Nm: 0,
      shaft_W: 0,
      powerLimited: false,
      torqueStall: false,
      statorT_C: sc.site.ambient.mean_c,
      cavitation: 1,
      gasFrac: 0,
      etaVol: 1,
      revs: 0,
      metered_m3: 0,
      burnt: false,
      powerAvail_W: 0,
    },
    hose: {
      parcels: [],
      vol_m3: 0,
      length_m: geom.hoseRoute.length,
      area_m2: area,
      pD_Pa: 0,
      q_m3s: 0,
      relief_m3s: 0,
      reliefLift: 0,
      jet_m3s: 0,
      static_Pa: 0,
      yield_Pa: 0,
      visc_Pa: 0,
      minor_Pa: 0,
      kink: null,
      crushed: null,
      pProfile: new Float64Array(33),
      tsProfile: new Float64Array(33).fill(-1),
      backflow: false,
    },
    receiver: { v_m3: 0, solids_kg: 0, cap_m3: p.receiver.cap_L / 1000 },
    thermal: {
      line_C: sc.site.ambient.mean_c,
      batt_C: Math.max(sc.site.ambient.mean_c, 6),
      ice: 0,
      residual: 0,
      heaterActive: false,
    },
    power: {
      soc: sc.equipment.battery_soc,
      vBus: 51.2,
      iBus: 0,
      pTotal_W: 0,
      energy_J: 0,
      energyPump_J: 0,
      fuel_L: 0,
      loads: { pcp: 0, auger: 0, vane: 0, blower: 0, heater: 0, aux: 0, travel: 0 },
      limited: false,
    },
    fail: {
      checkValveRemoved: false,
      dryRunTripDisabled: false,
      overpressureTripDisabled: false,
      h2sSensorStuck: false,
      detectorFault: false,
      batteryCold: false,
    },
    totals: { drawn_m3: 0, pumped_m3: 0, delivered_m3: 0, jetted_m3: 0, freshWater_L: 0, maxPd_Pa: 0 },
    gasSpike: 0,
    firedEvents: sc.events.map(() => false),
  };
  return { state, rng, log };
}
