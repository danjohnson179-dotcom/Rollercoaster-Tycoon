import { TopSpinPhysics } from './topspin-physics.js';
import { GuestFlow } from './guest-flow.js';
import { WaterSystem } from './water-system.js';

export const STATES = Object.freeze({
  CLOSED: 'RIDE CLOSED',
  WAITING: 'WAITING FOR GUESTS',
  BOARDING: 'BOARDING',
  CHECKING: 'PLATFORM CHECKS',
  READY: 'READY TO DISPATCH',
  RUNNING: 'CYCLE ACTIVE',
  RETURNING: 'RETURNING TO LOAD',
  COMPLETE: 'CYCLE COMPLETE',
  UNLOADING: 'UNLOADING',
  FAULT: 'FAULT LATCHED'
});

export const PROGRAMS = Object.freeze({
  manual: { label: 'Manual operation', duration: 180, intensity: 3 },
  sequence1: { label: 'Sequence 1 — Pendulum', duration: 58, intensity: 1 },
  sequence2: { label: 'Sequence 2 — Inversion', duration: 74, intensity: 2 },
  sequence3: { label: 'Sequence 3 — Extreme', duration: 92, intensity: 3 }
});

export const FAULTS = Object.freeze({
  gate_sensor: { label: 'Load-gate limit switch disagreement', system: 'platform', severity: 'SERVICE', repairTime: 14 },
  restraint_channel: { label: 'Restraint prove channel B open', system: 'restraints', severity: 'SAFETY', repairTime: 18 },
  arm_encoder: { label: 'Arm encoder reference lost', system: 'drive', severity: 'SAFETY', repairTime: 23 },
  gondola_brake: { label: 'Gondola brake pressure transducer fault', system: 'brake', severity: 'SAFETY', repairTime: 26 },
  water_pressure: { label: 'Water-effects pump pressure low', system: 'effects', severity: 'SERVICE', repairTime: 12 }
});

const FAULT_INTERVALS = Object.freeze({
  off: [Infinity, Infinity],
  low: [150, 280],
  normal: [70, 125],
  high: [22, 45]
});

const CAPACITY = 38;
const DEG = Math.PI / 180;
const GRAVITY = 9.81;
const RIDER_RADIUS = 1.32;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const approach = (value, target, amount) => value + clamp(target - value, -amount, amount);
const wrappedAngle = value => ((value + 180) % 360 + 360) % 360 - 180;

const AUTO_SEQUENCES = Object.freeze({
  sequence1: [
    { until: 8, arm: 1, brake: 'FULL' },
    { until: 17, arm: 1, brake: 'RELEASED' },
    { until: 25, arm: -1, brake: 'HALF' },
    { until: 34, arm: 1, brake: 'FULL' },
    { until: 43, arm: 1, brake: 'RELEASED' },
    { until: 51, arm: -1, brake: 'HALF' },
    { until: 58, arm: 1, brake: 'FULL' }
  ],
  sequence2: [
    { until: 8, arm: 1, brake: 'FULL' },
    { until: 18, arm: 1, brake: 'RELEASED' },
    { until: 27, arm: 1, brake: 'HALF' },
    { until: 36, arm: -1, brake: 'RELEASED' },
    { until: 47, arm: 1, brake: 'FULL' },
    { until: 58, arm: 1, brake: 'RELEASED' },
    { until: 67, arm: -1, brake: 'HALF' },
    { until: 74, arm: 1, brake: 'FULL' }
  ],
  sequence3: [
    { until: 9, arm: 1, brake: 'FULL' },
    { until: 20, arm: 1, brake: 'RELEASED' },
    { until: 30, arm: 1, brake: 'HALF' },
    { until: 40, arm: -1, brake: 'RELEASED' },
    { until: 51, arm: 1, brake: 'HALF' },
    { until: 62, arm: 1, brake: 'FULL' },
    { until: 73, arm: -1, brake: 'RELEASED' },
    { until: 84, arm: 1, brake: 'HALF' },
    { until: 92, arm: 0, brake: 'FULL' }
  ]
});

export class RideController extends EventTarget {
  constructor() {
    super();
    this.state = {
      mode: STATES.CLOSED,
      power: false,
      rideOpen: false,
      loadGate: false,
      restraints: false,
      restraintProgress: 0,
      restraintProved: false,
      platformClear: false,
      drive: false,
      estop: false,
      fault: false,
      gondolaBrake: true,
      brakeMode: 'FULL',
      brakeDemand: 1,
      brakePressure: 1,
      brakeTemperature: 22,
      brakeFade: 1,
      armLock: true,
      armSpeedSetpoint: 0.72,
      armAngle: 0,
      armVelocity: 0,
      gondolaAngle: 0,
      gondolaVelocity: 0,
      program: 'manual',
      cycleElapsed: 0,
      parkElapsed: 0,
      cycleStopRequested: false,
      water: false,
      queue: 0,
      onboard: 0,
      boardingCount: 0,
      boardingStarted: 0,
      guestsServed: 0,
      cycles: 0,
      score: 0,
      happiness: 62,
      happinessStreak: 0,
      currentG: 1,
      maxG: 1,
      inversions: 0,
      continuousInversions: 0,
      maxContinuousInversions: 0,
      needsUnload: false,
      testMode: false,
      demandMode: 'dynamic',
      demandLevel: 'CLOSED',
      demandRate: 0,
      nextArrival: 0,
      nextWaveIn: 0,
      totalArrivals: 0,
      guestPhase: 'QUEUE CLOSED',
      loadBatchTarget: 0,
      loadBatchRemaining: 0,
      loadBatchCommitted: false,
      unloadingCount: 0,
      platformGuests: 0,
      returnStage: 'PARKED',
      unloadReady: true,
      faultCode: null,
      faultName: '',
      faultSeverity: '',
      faultRate: 'normal',
      nextFaultIn: 90,
      mechanicStatus: 'STANDBY',
      mechanicETA: 0,
      repairProgress: 0,
      diagnosisSystem: '',
      mechanicCallouts: 0,
      throughput: 0,
      achievements: {
        inversions3: false,
        inversions4: false,
        inversions5: false,
        happy30: false,
        gforce5: false,
        served500: false
      }
    };
    this.holds = new Set();
    this.dispatchStarted = 0;
    this.previousInversionBand = 0;
    this.lastArmVelocity = 0;
    this.lastArmAcceleration = 0;
    this.randomSeed = 0x5f3759df;
    this.faultTimer = 90;
    this.repairTimer = 0;
    this.physics = new TopSpinPhysics();
    this.guestFlow = new GuestFlow(() => this.random(), CAPACITY);
    this.waterSystem = new WaterSystem(30);
    this.guestFlow.initialiseState(this.state);
    this.waterSystem.initialiseState(this.state);
    this.physics.sanitise(this.state);
  }

  random() {
    this.randomSeed = (1664525 * this.randomSeed + 1013904223) >>> 0;
    return this.randomSeed / 4294967296;
  }

  getReturnStage() {
    const s = this.state;
    if (s.fault) return 'FAULT HOLD';
    if (s.mode === STATES.RETURNING) {
      const armError = Math.abs(wrappedAngle(s.armAngle));
      const gondolaError = Math.abs(wrappedAngle(s.gondolaAngle));
      if (Math.abs(s.armVelocity) > 4 || Math.abs(s.gondolaVelocity) > 8) return 'CONTROLLED BRAKING';
      if (armError > 4) return 'ARM PARKING';
      if (gondolaError > 4) return 'GONDOLA LEVELLING';
      return 'APPLYING LOAD LOCKS';
    }
    if (s.mode === STATES.COMPLETE && this.safeAtLoad) return 'LOAD POSITION PROVED';
    if (s.mode === STATES.RUNNING) return 'CYCLE IN MOTION';
    return this.safeAtLoad ? 'PARKED & LOCKED' : 'NOT AT LOAD';
  }

  snapshot() {
    const s = this.state;
    return {
      ...s,
      arm: wrappedAngle(s.armAngle),
      rpm: s.gondolaVelocity / 6,
      relativeRpm: (s.gondolaVelocity - s.armVelocity) / 6,
      relativeGondolaAngle: wrappedAngle(s.gondolaAngle - s.armAngle),
      pendulumPhase: Math.abs(wrappedAngle(s.gondolaAngle)) < 35
        ? 'BOTTOM'
        : Math.abs(wrappedAngle(s.gondolaAngle)) > 145 ? 'INVERTED' : 'CLIMBING',
      capacity: CAPACITY,
      programmeLabel: PROGRAMS[s.program].label,
      safeAtLoad: this.safeAtLoad,
      returnStage: this.getReturnStage(),
      unloadReady: this.safeAtLoad && s.mode === STATES.COMPLETE && s.onboard > 0
    };
  }

  emit(message, type = 'info') {
    this.dispatchEvent(new CustomEvent('change', {
      detail: { state: this.snapshot(), message, type }
    }));
  }

  reject(message, penalty = 10) {
    this.state.score = Math.max(0, this.state.score - penalty);
    this.emit(message, 'error');
    return false;
  }

  get stationary() {
    const s = this.state;
    return Math.abs(s.armVelocity) < 1.2 && Math.abs(s.gondolaVelocity) < 2;
  }

  get safeAtLoad() {
    const s = this.state;
    return this.stationary
      && Math.abs(wrappedAngle(s.armAngle)) < 3
      && Math.abs(wrappedAngle(s.gondolaAngle)) < 4
      && s.brakeMode === 'FULL'
      && s.brakePressure > 0.94
      && s.armLock;
  }

  get safetyCircuits() {
    const s = this.state;
    return {
      power: s.power,
      gate: !s.loadGate,
      restraints: s.restraintProved && s.restraints,
      platform: s.platformClear,
      brake: s.brakeMode === 'FULL' && s.brakePressure > 0.94,
      drive: s.drive && !s.fault && !s.estop
    };
  }

  get canDispatch() {
    const s = this.state;
    return Object.values(this.safetyCircuits).every(Boolean)
      && (s.onboard > 0 || s.testMode)
      && this.safeAtLoad
      && s.mode !== STATES.RUNNING
      && s.mode !== STATES.RETURNING;
  }

  togglePower() {
    const s = this.state;
    if ([STATES.RUNNING, STATES.RETURNING].includes(s.mode)) {
      return this.reject('Control power cannot be isolated while the ride is moving.');
    }
    if (s.power && (s.loadGate || s.boardingCount > 0 || s.onboard > 0)) {
      return this.reject('Control power cannot be isolated until the platform is empty and the load gate is closed.');
    }
    s.power = !s.power;
    if (s.power) this.resetFaultTimer();
    if (!s.power) {
      Object.assign(s, {
        rideOpen: false,
        loadGate: false,
        platformClear: false,
        drive: false,
        waterMaster: false,
        water: false,
        mode: STATES.CLOSED
      });
    }
    this.updateMode();
    this.emit(s.power
      ? 'Control circuits energised. Select PUBLIC OPERATION or EMPTY TEST.'
      : 'Control power isolated. Ride secured closed.');
    return true;
  }

  toggleRideOpen() {
    const s = this.state;
    if (!s.power) return this.reject('Turn the control key before opening the ride.');
    if (!s.rideOpen && s.testMode) return this.reject('Exit EMPTY TEST mode before opening the public queue.');
    s.rideOpen = !s.rideOpen;
    if (s.rideOpen) this.guestFlow.onEntranceOpened(s);
    if (![STATES.RUNNING, STATES.RETURNING].includes(s.mode)) s.platformClear = false;
    this.updateMode();
    this.emit(s.rideOpen
      ? 'Queue entrance opened. New guests are joining the waiting line.'
      : `Queue entrance closed. ${s.queue} waiting guests remain in the line.`);
    return true;
  }

  setTestMode(active) {
    const s = this.state;
    if ([STATES.RUNNING, STATES.RETURNING].includes(s.mode) || s.onboard > 0 || this.guestFlow.gateTransferActive || s.loadGate) {
      return this.reject('Operating status can only change with an empty gondola, closed load gate and stationary ride.');
    }
    s.testMode = Boolean(active);
    if (s.testMode) s.rideOpen = false;
    s.restraints = false;
    s.restraintProgress = 0;
    s.restraintProved = false;
    s.platformClear = false;
    s.drive = false;
    this.updateMode();
    this.emit(s.testMode
      ? 'EMPTY TEST selected. The ride may dispatch without guests after normal safety proving.'
      : 'PUBLIC OPERATION selected. At least one seated guest is required to dispatch.');
    return true;
  }

  setDemandMode(mode) {
    if (!this.guestFlow.setDemandMode(this.state, mode)) return false;
    this.emit(`Guest demand set to ${mode === 'dynamic' ? 'dynamic park waves' : mode.toUpperCase()}.`);
    return true;
  }

  setFaultRate(rate) {
    if (!FAULT_INTERVALS[rate]) return false;
    this.state.faultRate = rate;
    this.resetFaultTimer();
    this.emit(`Random fault frequency set to ${rate.toUpperCase()}.`);
    return true;
  }

  toggleLoadGate() {
    const s = this.state;
    if (!s.power) return this.reject('Control power is required.');
    if (!this.safeAtLoad) return this.reject('Load gate is inhibited until the ride is locked at load position.');
    if (s.drive) return this.reject('Disable the main drive before opening the load gate.');
    if (s.restraints || s.restraintProgress > 0.02) {
      return this.reject('Open the restraints before operating the load gate.');
    }
    if (s.loadGate && this.guestFlow.gateTransferActive) {
      return this.reject(`${s.platformGuests} guest${s.platformGuests === 1 ? ' is' : 's are'} still moving through the platform.`);
    }
    if (!s.loadGate && !s.rideOpen && s.queue === 0 && !s.needsUnload && !s.testMode) {
      return this.reject('There are no waiting guests to load. Open the queue entrance first.');
    }
    s.loadGate = !s.loadGate;
    s.platformClear = false;
    if (s.loadGate) {
      s.mode = s.needsUnload && s.onboard > 0 ? STATES.UNLOADING : STATES.BOARDING;
      if (!s.needsUnload && s.onboard === 0) s.loadBatchCommitted = false;
      this.emit(s.mode === STATES.UNLOADING
        ? 'Load gate opened. Guests are leaving the gondola.'
        : 'Load gate opened. Platform ready — press ADMIT NEXT BATCH when you want guests to board.');
    } else {
      this.updateMode();
      this.emit(s.onboard > 0
        ? 'Load gate closed. Close and prove all restraints.'
        : 'Load gate closed. Platform transfer secured.');
    }
    return true;
  }

  admitNextBatch() {
    const result = this.guestFlow.requestLoad(this.state, this.safeAtLoad);
    if (!result.ok) return this.reject(result.message);
    this.state.mode = STATES.BOARDING;
    this.emit(`Batch gate released. ${result.batchSize} guest${result.batchSize === 1 ? '' : 's'} admitted for this load only.`);
    return true;
  }

  toggleRestraints() {
    const s = this.state;
    if (!s.power) return this.reject('Control power is required.');
    if (s.loadGate) return this.reject('Close the load gate before moving the restraints.');
    if ([STATES.RUNNING, STATES.RETURNING].includes(s.mode)) {
      return this.reject('Restraints are mechanically locked during motion.');
    }
    if (!this.safeAtLoad) return this.reject('Restraints are inhibited away from load position.');
    if (!s.restraints && s.onboard === 0 && !s.testMode) return this.reject('There are no guests to secure. Select EMPTY TEST to prove an unloaded gondola.');
    s.restraints = !s.restraints;
    s.restraintProved = false;
    s.platformClear = false;
    this.updateMode();
    this.emit(s.restraints
      ? 'Restraints closing. Wait for all occupied-seat circuits to prove.'
      : 'Restraints opening. The load gate may be opened when fully released.');
    return true;
  }

  confirmPlatform() {
    const s = this.state;
    if (!s.power) return this.reject('Control power is required.');
    if (s.loadGate) return this.reject('Close the load gate before confirming platform clear.');
    if (!s.restraintProved || !s.restraints) return this.reject('All occupied-seat restraint circuits must prove first.');
    if (s.onboard === 0 && !s.testMode) return this.reject('Platform check cannot be completed with an empty gondola unless EMPTY TEST is selected.');
    s.platformClear = !s.platformClear;
    this.updateMode();
    this.emit(s.platformClear
      ? 'Platform clear confirmed. Enable the main drive.'
      : 'Platform clear confirmation cancelled.');
    return true;
  }

  toggleDrive() {
    const s = this.state;
    if (!s.power) return this.reject('Control power is required.');
    if ([STATES.RUNNING, STATES.RETURNING].includes(s.mode)) {
      return this.reject('Drive enable is locked during an active cycle.');
    }
    if (!s.drive && (!s.platformClear || !s.restraintProved || s.loadGate || !this.safeAtLoad)) {
      return this.reject('Drive enable denied: platform, restraints, gate or load-position circuit is open.');
    }
    s.drive = !s.drive;
    this.updateMode();
    this.emit(s.drive ? 'Main arm drive enabled.' : 'Main arm drive disabled.');
    return true;
  }

  setProgram(program) {
    const s = this.state;
    if (!PROGRAMS[program]) return false;
    if ([STATES.RUNNING, STATES.RETURNING].includes(s.mode)) {
      return this.reject('Operating mode is locked during a cycle.');
    }
    s.program = program;
    this.emit(`${PROGRAMS[program].label} selected.`);
    return true;
  }

  toggleWater() {
    if (!this.state.power) return this.reject('Control power is required before starting the Aquafun pump.');
    this.waterSystem.setMaster(this.state, !this.state.waterMaster);
    this.emit(`Aquafun pump ${this.state.waterMaster ? 'started' : 'stopped'}.`);
    return true;
  }

  setWaterMode(mode) {
    if (!this.waterSystem.setMode(this.state, mode)) return false;
    this.emit(`Aquafun pattern set to ${mode}.`);
    return true;
  }

  setWaterHeight(value) {
    this.waterSystem.setHeight(this.state, value);
    this.emit(`Aquafun height demand ${Math.round(this.state.waterHeightSetpoint * 100)}%.`);
    return true;
  }

  toggleWaterZone(zone) {
    if (!this.waterSystem.toggleZone(this.state, zone)) return false;
    this.emit(`${zone.toUpperCase()} fountain zone ${this.state.waterZones[zone] ? 'enabled' : 'isolated'}.`);
    return true;
  }

  setBrakeMode(mode, announce = false) {
    const s = this.state;
    if ((s.mode !== STATES.RUNNING || s.program !== 'manual') && mode !== 'FULL') {
      return this.reject('HALF and RELEASED gondola brake positions require an active manual cycle.');
    }
    if (!this.physics.setBrakeMode(s, mode)) return false;
    if (announce) {
      const messages = {
        RELEASED: 'Gondola brake RELEASED. The gondola is free-swinging.',
        HALF: 'Gondola brake at HALF pressure. Friction is trimming the swing without locking it.',
        FULL: 'Gondola brake FULL. The calipers are capturing the gondola relative to the arms.'
      };
      this.emit(messages[mode]);
    }
    return true;
  }

  setGondolaBrake(active, announce = false) {
    return this.setBrakeMode(active ? 'FULL' : 'RELEASED', announce);
  }

  setArmSpeed(value) {
    const s = this.state;
    if ([STATES.RUNNING, STATES.RETURNING].includes(s.mode)) {
      return this.reject('Arm speed selection is locked during a cycle.', 2);
    }
    s.armSpeedSetpoint = clamp(Number(value) || 0.72, 0.42, 1);
    this.emit(`Arm drive speed set to ${Math.round(s.armSpeedSetpoint * 100)}%.`);
    return true;
  }

  toggleArmLock() {
    const s = this.state;
    if (s.mode !== STATES.RUNNING || s.program !== 'manual') {
      return this.reject('Arm lock control is available during a manual cycle only.');
    }
    if (!s.armLock && Math.abs(s.armVelocity) > 5) {
      return this.reject('Arm lock cannot engage above 5°/s. Release the drive command and allow the arms to slow.');
    }
    s.armLock = !s.armLock;
    if (s.armLock) this.holds.clear();
    this.emit(s.armLock ? 'Arm lock engaged.' : 'Arm lock released. Hold an arm direction to move.');
    return true;
  }

  hold(control, active) {
    const s = this.state;
    if (active && (s.mode !== STATES.RUNNING || s.program !== 'manual')) {
      return this.reject('Manual arm commands require an active manual cycle.', 2);
    }
    if (active && s.armLock) return this.reject('Release the arm lock before commanding movement.', 2);
    active ? this.holds.add(control) : this.holds.delete(control);
    return true;
  }

  beginDispatch() {
    if (!this.canDispatch) {
      return this.reject('Dispatch denied: check guests, load position and every safety circuit.');
    }
    if (!this.dispatchStarted) {
      this.dispatchStarted = performance.now();
      this.emit('Dispatch validation started. Continue holding SPACE or the dispatch button.');
    }
    return true;
  }

  endDispatch() {
    if (!this.dispatchStarted) return false;
    const held = performance.now() - this.dispatchStarted;
    this.dispatchStarted = 0;
    if (held < 750) return this.reject('Dispatch released too early. Hold for the full validation period.');
    if (!this.canDispatch) return this.reject('Dispatch interrupted by an open interlock.');
    const s = this.state;
    s.mode = STATES.RUNNING;
    s.cycleElapsed = 0;
    s.cycleStopRequested = false;
    s.inversions = 0;
    s.continuousInversions = 0;
    s.maxG = 1;
    s.happiness = 62;
    this.previousInversionBand = Math.floor((s.gondolaAngle + 180) / 360);
    if (s.program !== 'manual') {
      s.armLock = false;
      this.applyBrake(true);
    } else {
      this.applyBrake('FULL');
    }
    this.emit(s.program === 'manual'
      ? 'Manual cycle started. Release ARM LOCK, drive the arms, then use RELEASED / HALF / FULL gondola braking.'
      : `${PROGRAMS[s.program].label} started. Sequence controller has command.`);
    return true;
  }

  requestCycleStop() {
    const s = this.state;
    if (s.mode !== STATES.RUNNING) return this.reject('There is no active cycle to stop.');
    s.cycleStopRequested = true;
    s.mode = STATES.RETURNING;
    s.armLock = false;
    this.holds.clear();
    this.physics.beginReturn(s);
    this.emit('RETURN TO LOAD accepted. Controlled braking, arm parking, gondola levelling and load locks are automatic.');
    return true;
  }

  emergencyStop() {
    const s = this.state;
    if (!s.estop) {
      s.estop = true;
      s.fault = true;
      s.faultCode = 'estop';
      s.faultName = 'Emergency-stop circuit latched';
      s.faultSeverity = 'EMERGENCY';
      s.mechanicStatus = 'RELEASE E-STOP';
      s.mode = STATES.FAULT;
      s.drive = false;
      s.armLock = true;
      this.applyBrake(true);
      this.holds.clear();
      this.emit('EMERGENCY STOP LATCHED — service braking active.', 'error');
    } else {
      s.estop = false;
      s.mechanicStatus = 'RESET REQUIRED';
      this.emit('Emergency stop released. Press FAULT RESET after all motion has stopped.');
    }
    return true;
  }

  resetFault() {
    const s = this.state;
    if (s.estop) return this.reject('Release the emergency stop before resetting the fault circuit.');
    if (!this.stationary) return this.reject('Fault reset denied while the ride is moving.');
    if (s.faultCode && s.faultCode !== 'estop' && s.mechanicStatus !== 'AWAITING RESET') {
      return this.reject('Fault reset denied. A mechanic must diagnose and complete the repair first.');
    }
    s.fault = false;
    s.faultCode = null;
    s.faultName = '';
    s.faultSeverity = '';
    s.mechanicStatus = 'STANDBY';
    s.mechanicETA = 0;
    s.repairProgress = 0;
    s.diagnosisSystem = '';
    s.drive = false;
    s.platformClear = false;
    s.armLock = true;
    this.applyBrake(true);
    if (!this.safeAtLoad) {
      s.mode = STATES.RETURNING;
      s.armLock = false;
      this.physics.beginReturn(s);
      this.emit('Fault reset accepted. Controlled recovery to load position has started.');
    } else {
      this.updateMode();
      this.emit('Fault circuit reset. Re-establish the platform and drive checks.');
    }
    this.resetFaultTimer();
    return true;
  }

  resetFaultTimer() {
    const range = FAULT_INTERVALS[this.state.faultRate];
    this.faultTimer = Number.isFinite(range[0])
      ? range[0] + this.random() * (range[1] - range[0])
      : Infinity;
    this.state.nextFaultIn = this.faultTimer;
  }

  triggerFault(code, source = 'random') {
    const definition = FAULTS[code];
    const s = this.state;
    if (!definition || s.fault || !s.power) return false;
    s.fault = true;
    s.faultCode = code;
    s.faultName = definition.label;
    s.faultSeverity = definition.severity;
    s.mechanicStatus = 'CALL REQUIRED';
    s.mechanicETA = 0;
    s.repairProgress = 0;
    s.diagnosisSystem = '';
    s.mode = STATES.FAULT;
    s.drive = false;
    s.platformClear = false;
    s.armLock = true;
    this.applyBrake(true);
    if (code === 'water_pressure') this.waterSystem.setMaster(s, false);
    this.holds.clear();
    this.emit(`${definition.severity} FAULT ${code.toUpperCase()}: ${definition.label}. Stop operation and call maintenance.`, 'error');
    if (source === 'random') this.resetFaultTimer();
    return true;
  }

  injectFault(code) {
    if (!this.state.testMode) return this.reject('Fault simulation is available in EMPTY TEST mode only.');
    return this.triggerFault(code, 'test');
  }

  callMechanic() {
    const s = this.state;
    if (!s.faultCode || s.faultCode === 'estop') return this.reject('There is no maintenance fault requiring a callout.');
    if (s.mechanicStatus !== 'CALL REQUIRED') return this.reject(`Maintenance status is already ${s.mechanicStatus}.`, 2);
    s.mechanicStatus = 'EN ROUTE';
    s.mechanicETA = Math.round(10 + this.random() * 18);
    s.mechanicCallouts += 1;
    this.emit(`Maintenance control contacted. Technician ETA ${s.mechanicETA} seconds.`);
    return true;
  }

  diagnoseFault(system) {
    const s = this.state;
    const definition = FAULTS[s.faultCode];
    if (!definition) return this.reject('No diagnostic fault is active.');
    if (s.mechanicStatus !== 'ON SITE') return this.reject('Wait for the mechanic to arrive before authorising diagnostic work.');
    s.diagnosisSystem = system;
    if (system !== definition.system) {
      s.score = Math.max(0, s.score - 75);
      this.emit(`No defect found in ${system.toUpperCase()}. Select another system; callout time has increased.`, 'error');
      return false;
    }
    s.mechanicStatus = 'REPAIRING';
    this.repairTimer = definition.repairTime;
    s.repairProgress = 0;
    this.emit(`${definition.system.toUpperCase()} fault confirmed. Repair authorised; estimated work time ${definition.repairTime} seconds.`);
    return true;
  }

  tickMaintenance(dt) {
    const s = this.state;
    if (s.mechanicStatus === 'EN ROUTE') {
      s.mechanicETA = Math.max(0, s.mechanicETA - dt);
      if (s.mechanicETA <= 0) {
        s.mechanicStatus = 'ON SITE';
        this.emit('Mechanic on site. Select the suspected system and authorise diagnosis.');
      }
    } else if (s.mechanicStatus === 'REPAIRING') {
      this.repairTimer = Math.max(0, this.repairTimer - dt);
      const duration = FAULTS[s.faultCode]?.repairTime || 15;
      s.repairProgress = 1 - this.repairTimer / duration;
      if (this.repairTimer <= 0) {
        s.repairProgress = 1;
        s.mechanicStatus = 'AWAITING RESET';
        this.emit('Repair complete and tested. Press FAULT RESET to clear the latched circuit.');
      }
    }
  }

  tickRandomFaults(dt) {
    const s = this.state;
    if (!s.power || s.fault || s.faultRate === 'off') {
      s.nextFaultIn = s.faultRate === 'off' ? Infinity : this.faultTimer;
      return;
    }
    if (s.brakeTemperature > 245) {
      this.triggerFault('gondola_brake');
      return;
    }
    this.faultTimer -= dt;
    s.nextFaultIn = Math.max(0, this.faultTimer);
    if (this.faultTimer <= 0) {
      const codes = Object.keys(FAULTS);
      const code = codes[Math.floor(this.random() * codes.length)];
      this.triggerFault(code);
    }
  }

  updateMode() {
    const s = this.state;
    if (s.fault) s.mode = STATES.FAULT;
    else if (!s.power) s.mode = STATES.CLOSED;
    else if ([STATES.RUNNING, STATES.RETURNING].includes(s.mode)) return;
    else if (s.loadGate) s.mode = s.needsUnload && s.onboard > 0 ? STATES.UNLOADING : STATES.BOARDING;
    else if (this.canDispatch) s.mode = STATES.READY;
    else if (s.onboard > 0) s.mode = STATES.CHECKING;
    else if (s.testMode) s.mode = STATES.CHECKING;
    else if (!s.rideOpen && s.queue === 0) s.mode = STATES.CLOSED;
    else s.mode = STATES.WAITING;
  }

  applyBrake(mode) {
    const brakeMode = typeof mode === 'string' ? mode : mode ? 'FULL' : 'RELEASED';
    this.physics.setBrakeMode(this.state, brakeMode);
  }

  getAutoCommand() {
    const s = this.state;
    const sequence = AUTO_SEQUENCES[s.program];
    return sequence?.find(step => s.cycleElapsed < step.until) || null;
  }

  tickGuests(dt) {
    this.guestFlow.tick(this.state, dt, this.safeAtLoad);
    if (this.state.loadGate) {
      this.state.mode = this.state.needsUnload || this.state.unloadingCount > 0
        ? STATES.UNLOADING
        : STATES.BOARDING;
    }
  }

  tickRestraints(dt) {
    const s = this.state;
    const target = s.restraints ? 1 : 0;
    s.restraintProgress = approach(s.restraintProgress, target, dt * 0.72);
    if (s.restraints && s.restraintProgress >= 0.999) {
      s.restraintProgress = 1;
      s.restraintProved = s.onboard > 0 || s.testMode;
    }
    if (!s.restraints && s.restraintProgress <= 0.001) {
      s.restraintProgress = 0;
      s.restraintProved = false;
    }
  }

  tickMotion(dt) {
    const s = this.state;
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.05) : 0;
    let targetSpeed = 0;

    if (s.mode === STATES.RUNNING) {
      s.cycleElapsed += safeDt;
      if (s.program === 'manual') {
        let armCommand = 0;
        if (!s.armLock) {
          if (this.holds.has('armForward')) armCommand += 1;
          if (this.holds.has('armReverse')) armCommand -= 1;
        }
        targetSpeed = armCommand * (16 + s.armSpeedSetpoint * 32);
        if (s.cycleElapsed >= PROGRAMS.manual.duration) {
          s.mode = STATES.RETURNING;
          this.physics.beginReturn(s);
          this.emit('Maximum manual cycle time reached. Service return engaged.', 'error');
        }
      } else {
        const command = this.getAutoCommand();
        if (!command) {
          s.mode = STATES.RETURNING;
          this.physics.beginReturn(s);
          this.emit('Programme complete. Returning the gondola to load position.');
        } else {
          targetSpeed = command.arm * (22 + PROGRAMS[s.program].intensity * 6);
          s.armLock = command.arm === 0;
          this.applyBrake(command.brake);
        }
      }
    }

    if (![STATES.RUNNING, STATES.RETURNING].includes(s.mode)) targetSpeed = 0;
    if (s.fault || s.estop || s.armLock) targetSpeed = 0;
    if (s.mode === STATES.RETURNING) s.armLock = false;

    const result = this.physics.step(s, safeDt, {
      armTargetSpeed: targetSpeed,
      returning: s.mode === STATES.RETURNING
    });
    this.lastArmAcceleration = (s.armVelocity - this.lastArmVelocity) / Math.max(safeDt, 0.001);
    this.lastArmVelocity = s.armVelocity;

    if (s.mode === STATES.RETURNING && result.settled) {
      this.completeCycle();
      return;
    }

    if (s.mode === STATES.RUNNING && safeDt > 0) {
      this.updateRideMetrics(
        safeDt,
        result.armDelta,
        result.pivotAccelerationY,
        result.pivotAccelerationZ,
        result.gondolaAcceleration
      );
    }
  }

  updateRideMetrics(dt, armDelta, pivotAccelerationY, pivotAccelerationZ, thetaAcceleration) {
    const s = this.state;
    const theta = s.gondolaAngle * DEG;
    const omega = s.gondolaVelocity * DEG;
    const relativeAccelerationZ = RIDER_RADIUS * (Math.sin(theta) * omega ** 2 - Math.cos(theta) * thetaAcceleration);
    const relativeAccelerationY = RIDER_RADIUS * (Math.cos(theta) * omega ** 2 + Math.sin(theta) * thetaAcceleration);
    const specificZ = pivotAccelerationZ + relativeAccelerationZ;
    const specificY = pivotAccelerationY + relativeAccelerationY + GRAVITY;
    s.currentG = clamp(Math.hypot(specificZ, specificY) / GRAVITY, 0, 6.2);
    s.maxG = Math.max(s.maxG, s.currentG);
    s.achievements.gforce5 ||= s.currentG >= 5;

    const excitement = clamp((s.currentG - 1) * 7 + Math.abs(s.gondolaVelocity) * 0.045, 0, 30);
    const discomfort = s.currentG > 5.2 ? (s.currentG - 5.2) * 12 : 0;
    s.happiness = clamp(s.happiness + (excitement - discomfort - 4) * dt * 0.055, 20, 100);
    s.happinessStreak = s.happiness >= 80 ? s.happinessStreak + dt : 0;
    s.achievements.happy30 ||= s.happinessStreak >= 30;

    const inversionBand = Math.floor((s.gondolaAngle + 180) / 360);
    if (inversionBand !== this.previousInversionBand && Math.abs(s.gondolaVelocity) > 45) {
      const change = Math.abs(inversionBand - this.previousInversionBand);
      s.inversions += change;
      s.continuousInversions += change;
      s.maxContinuousInversions = Math.max(s.maxContinuousInversions, s.continuousInversions);
      s.achievements.inversions3 ||= s.maxContinuousInversions >= 3;
      s.achievements.inversions4 ||= s.maxContinuousInversions >= 4;
      s.achievements.inversions5 ||= s.maxContinuousInversions >= 5;
      s.score += change * 120;
      this.previousInversionBand = inversionBand;
    }
    if (Math.abs(s.gondolaVelocity) < 18 && Math.abs(armDelta) < 0.2) s.continuousInversions = 0;
  }

  completeCycle() {
    const s = this.state;
    s.mode = STATES.COMPLETE;
    s.drive = false;
    s.platformClear = false;
    s.armLock = true;
    s.cycleStopRequested = false;
    s.needsUnload = s.onboard > 0;
    s.cycles += 1;
    s.score += 250 + s.inversions * 40 + Math.round(s.happiness * 2);
    this.holds.clear();
    this.emit(s.onboard > 0
      ? `Cycle complete: ${s.inversions} inversions, ${s.maxG.toFixed(1)}G peak, ${Math.round(s.happiness)}% guest happiness. LOAD POSITION PROVED — open restraints to unload.`
      : `Empty test complete: ${s.inversions} inversions and ${s.maxG.toFixed(1)}G peak. LOAD POSITION PROVED — no unload required.`);
  }

  tick(dt) {
    const s = this.state;
    this.tickRestraints(dt);
    this.tickGuests(dt);
    this.tickMotion(dt);
    this.waterSystem.tick(s, dt, [STATES.RUNNING, STATES.RETURNING].includes(s.mode));
    this.tickMaintenance(dt);
    this.tickRandomFaults(dt);
    s.throughput = s.parkElapsed > 10 ? Math.round(s.guestsServed / s.parkElapsed * 3600) : 0;
    this.dispatchEvent(new CustomEvent('tick', { detail: this.snapshot() }));
  }
}
