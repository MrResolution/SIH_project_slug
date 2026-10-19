import type { JobStateName } from './control/jobMachine';
import type { BlockReason } from './control/interlock';
import type { SimEvent } from './events';
import type { FstpResult } from './state';
import type { TelemetryMessage } from './telemetry/encoder';
import type { VacMode } from './commands';

/**
 * Snapshot sent from the worker to the UI (30 Hz). Display units (bar, L/min,
 * °C, %) so the UI never re-derives physics. 3D-only fields are in world units.
 */
export interface Snapshot {
  t: number;
  clock_s: number;
  mode: SimMode;
  job: {
    state: JobStateName;
    enteredAt: number;
    jobId: string | null;
    checkedIn: boolean;
    ppe: boolean;
    k1: boolean;
    k2: boolean;
    travelEnable: boolean;
    override: boolean;
    estop: boolean;
    vent_s: number;
    ventTotal_s: number;
    ventDone: boolean;
    k1Block: BlockReason[];
    k2Block: BlockReason[];
    trips: { dryRun: boolean; overpressure: boolean; statorHot: boolean; tiltOk: boolean };
    faults: string[];
    seedEvent: boolean;
    seedOverride: boolean;
    deconConfirmed: boolean;
    closed: boolean;
    sop: boolean[];
    sopCurrent: number;
    criticals: string[];
    blockedAttempts: number;
    fstp: FstpResult | null;
    elapsed_s: number;
    exposure_s: number;
  };
  env: { altitude_m: number; pAtm_kPa: number; tAmb_C: number; wind_ms: number; hMaxSludge_m: number; hMaxWater_m: number; hMaxAerated_m: number };
  vehicle: { s_m: number; laneLength_m: number; moving: boolean; heading: 1 | -1; pitch_deg: number; roll_deg: number; tilt_deg: number; outriggers: number; chocks: number; atPit: boolean; v_ms: number; target: 'pit' | 'road' | null };
  equip: { manholeOpen: boolean; snifferPlaced: boolean; blowerOn: boolean; tripod: number; lanceZ_m: number; lanceDir: -1 | 0 | 1; lanceAuto: boolean; crewTask: string | null; heater: boolean; heaterCmd: boolean };
  gas: {
    sensed: { o2_pct: number; h2s_ppm: number; ch4_lel: number; co_ppm: number };
    true: { o2_pct: number; h2s_ppm: number; ch4_lel: number; co_ppm: number };
    alarm: boolean;
    alarmSpecies: string[];
    plume: number;
    dominant: string;
    qVent_m3h: number;
    headspace_m3: number;
    dissolved: number;
    peak: { h2s_ppm: number; ch4_lel: number; co_ppm: number; o2Min_pct: number };
  };
  pit: {
    depth_m: number;
    area_m2: number;
    l_m: number;
    w_m: number;
    surface_m: number;
    cells: { z0: number; h: number; ts: number; kind: number; w: number; mob: number }[];
    volume_L: number;
    volume0_L: number;
    removedPct: number;
    meanTS: number;
    bedTop_m: number;
    rathole_m: number;
    seedMargin_mm: number;
    depthGauge_m: number;
    si: number;
    collapsed: boolean;
    fluidT_C: number;
  };
  probe: {
    auger_rpm: number;
    augerDir: -1 | 0 | 1;
    augerSet_rpm: number;
    current_A: number;
    torque_Nm: number;
    stalled: boolean;
    wraps: number;
    blinding: number;
    jetCmd: boolean;
    jetValve: number;
    jet_lpm: number;
    airCmd: boolean;
    alpha: number;
    tauAuger_Pa: number;
    tauJet_Pa: number;
    rm_m: number;
    trash: Record<string, number>;
    deflected: number;
    intakeZ_m: number;
  };
  suction: { connected: boolean; q_lpm: number; primed: boolean; stalled: boolean; uncovered: number; starved: boolean; tsMix: number; tauY_Pa: number; riserFill: number; liftReq_m: number; liftAvail_m: number; frozen: boolean; airIn_lpm: number };
  cube: { level_L: number; levelPct: number; p_barg: number; p_kPa: number; pSet_barg: number; ts: number; floatTripped: boolean; vaneMode: VacMode; vaneU: number; rockTrap_kg: number; temp_C: number };
  pcp: {
    run: boolean;
    set_rpm: number;
    rpm: number;
    q_lpm: number;
    slip_lpm: number;
    dp_bar: number;
    pIn_kPa: number;
    torque_Nm: number;
    shaft_kW: number;
    motor_kW: number;
    option: 'A' | 'B';
    powerLimited: boolean;
    torqueStall: boolean;
    statorT_C: number;
    cavitation: number;
    gasFrac: number;
    etaVol: number;
    metered_L: number;
    burnt: boolean;
    limits: { etaMech: number; vd_L: number; rpmMin: number; rpmMax: number; motorA_kW: number; motorB_kW: number; dpTorqueLimit_bar: number; relief_bar: number; trip_bar: number };
  };
  hose: {
    pD_bar: number;
    q_lpm: number;
    relief_lpm: number;
    reliefLift: number;
    reliefOpen: boolean;
    jet_lpm: number;
    fill: number;
    front_m: number;
    length_m: number;
    vol_L: number;
    static_bar: number;
    yield_bar: number;
    visc_bar: number;
    meanTS: number;
    pProfile: number[];
    tsProfile: number[];
    kink: { s_m: number; severity: number } | null;
    crushed: { s_m: number } | null;
    backflow: boolean;
    checkValve: boolean;
    d_m: number;
    elevGain_m: number;
    /** Hose system curve coefficients for the current contents: ΔP = static + yield + visc·Q + c2·Q² (bar, Q in L/min). */
    curve: { static_bar: number; yield_bar: number; visc_bar_per_lpm: number; c2_bar_per_lpm2: number };
  };
  receiver: { v_L: number; cap_L: number };
  thermal: { line_C: number; batt_C: number; ice: number; heaterActive: boolean; residual: number };
  power: { source: 'battery' | 'engine'; soc: number; vBus: number; iBus: number; p_kW: number; energy_kWh: number; pump_kWh: number; specific_kWhm3: number; fuel_L: number; loads: Record<string, number>; limited: boolean };
  totals: { drawn_L: number; pumped_L: number; delivered_L: number; jetted_L: number; freshWater_L: number; maxPd_bar: number };
  objectives: { id: string; label: string; met: boolean | null; value: string; optional: boolean }[];
  alarms: string[];
  fail: { checkValveRemoved: boolean; dryRunTripDisabled: boolean; overpressureTripDisabled: boolean; h2sSensorStuck: boolean; detectorFault: boolean; batteryCold: boolean };
}

export type SimMode = 'sandbox' | 'training';

/** Delta message from the worker. */
export interface SnapshotMessage {
  type: 'snapshot';
  snap: Snapshot;
  events: SimEvent[];
  history: number[][];
  telemetry: TelemetryMessage[];
  perf: { stepsPerSec: number; stepCost_us: number; lagging: boolean; speed: number; paused: boolean };
}
