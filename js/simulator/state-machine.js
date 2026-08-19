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

const CAPACITY = 38;
const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const GRAVITY = 9.81;
const ARM_RADIUS = 6.05;
const PHYSICAL_PENDULUM_LENGTH = 2.55;
const RIDER_RADIUS = 1.32;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const approach = (value, target, amount) => value + clamp(target - value, -amount, amount);
const wrappedAngle = value => ((value + 180) % 360 + 360) % 360 - 180;

const AUTO_SEQUENCES = Object.freeze({
  sequence1: [
    { until: 8, arm: 1, brake: true },
    { until: 16, arm: 1, brake: false },
    { until: 24, arm: -1, brake: false },
    { until: 33, arm: 1, brake: true },
    { until: 42, arm: 1, brake: false },
    { until: 50, arm: -1, brake: false },
    { until: 58, arm: 1, brake: true }
  ],
  sequence2: [
    { until: 8, arm: 1, brake: true },
    { until: 17, arm: 1, brake: false },
    { until: 27, arm: 1, brake: true },
    { until: 36, arm: -1, brake: false },
    { until: 47, arm: 1, brake: true },
    { until: 58, arm: 1, brake: false },
    { until: 67, arm: -1, brake: false },
    { until: 74, arm: 1, brake: true }
  ],
  sequence3: [
    { until: 9, arm: 1, brake: true },
    { until: 19, arm: 1, brake: false },
    { until: 29, arm: 1, brake: true },
    { until: 39, arm: -1, brake: false },
    { until: 50, arm: 1, brake: false },
    { until: 61, arm: 1, brake: true },
    { until: 72, arm: -1, brake: false },
    { until: 84, arm: 1, brake: true },
    { until: 92, arm: 0, brake: false }
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
      water: true,
      queue: 18,
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
    this.arrivalAccumulator = 0;
    this.guestAccumulator = 0;
    this.boardingTransfers = [];
    this.brakeOffset = 0;
    this.previousInversionBand = 0;
    this.lastArmVelocity = 0;
    this.lastArmAcceleration = 0;
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
      safeAtLoad: this.safeAtLoad
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
      && s.gondolaBrake
      && s.armLock;
  }

  get safetyCircuits() {
    const s = this.state;
    return {
      power: s.power,
      gate: !s.loadGate,
      restraints: s.restraintProved && s.restraints,
      platform: s.platformClear,
      brake: s.gondolaBrake,
      drive: s.drive && !s.fault && !s.estop
    };
  }

  get canDispatch() {
    const s = this.state;
    return Object.values(this.safetyCircuits).every(Boolean)
      && s.onboard > 0
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
    if (!s.power) {
      Object.assign(s, {
        rideOpen: false,
        loadGate: false,
        platformClear: false,
        drive: false,
        mode: STATES.CLOSED
      });
    }
    this.updateMode();
    this.emit(s.power
      ? 'Control circuits energised. Open the ride entrance when ready.'
      : 'Control power isolated. Ride secured closed.');
    return true;
  }

  toggleRideOpen() {
    const s = this.state;
    if (!s.power) return this.reject('Turn the control key before opening the ride.');
    s.rideOpen = !s.rideOpen;
    if (![STATES.RUNNING, STATES.RETURNING].includes(s.mode)) s.platformClear = false;
    this.updateMode();
    this.emit(s.rideOpen
      ? 'Queue entrance opened. New guests are joining the waiting line.'
      : `Queue entrance closed. ${s.queue} waiting guests remain in the line.`);
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
    if (s.loadGate && s.boardingCount > 0) {
      return this.reject(`${s.boardingCount} guest${s.boardingCount === 1 ? ' is' : 's are'} still walking to the gondola.`);
    }
    if (!s.rideOpen && s.queue === 0 && !s.needsUnload) return this.reject('There are no waiting guests to load. Open the queue entrance first.');
    s.loadGate = !s.loadGate;
    s.platformClear = false;
    if (s.loadGate) {
      s.mode = s.needsUnload && s.onboard > 0 ? STATES.UNLOADING : STATES.BOARDING;
      this.emit(s.mode === STATES.UNLOADING
        ? 'Load gate opened. Guests are leaving the gondola.'
        : 'Load gate opened. Guests are boarding available seats.');
    } else {
      this.updateMode();
      this.emit(s.onboard > 0
        ? 'Load gate closed. Close and prove all restraints.'
        : 'Load gate closed. Waiting for guests.');
    }
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
    if (!s.restraints && s.onboard === 0) return this.reject('There are no guests to secure.');
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
    if (s.onboard === 0) return this.reject('Platform check cannot be completed with an empty gondola.');
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
    this.state.water = !this.state.water;
    this.emit(`Water effects ${this.state.water ? 'armed' : 'disabled'}.`);
    return true;
  }

  setGondolaBrake(active, announce = false) {
    const s = this.state;
    if (s.mode !== STATES.RUNNING || s.program !== 'manual') {
      if (!active) {
        this.applyBrake(true);
        return true;
      }
      return this.reject('Gondola brake control is available during a manual cycle only.');
    }
    this.applyBrake(Boolean(active));
    if (announce) this.emit(active
      ? 'Gondola brake paddle held. Calipers are applying.'
      : 'Gondola brake paddle released. Gondola is free-swinging.');
    return true;
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
      this.applyBrake(false);
    }
    this.emit(s.program === 'manual'
      ? 'Manual cycle started. Release ARM LOCK, drive the arms and time the GONDOLA BRAKE.'
      : `${PROGRAMS[s.program].label} started. Sequence controller has command.`);
    return true;
  }

  requestCycleStop() {
    const s = this.state;
    if (s.mode !== STATES.RUNNING) return this.reject('There is no active cycle to stop.');
    if (s.program !== 'manual') {
      s.mode = STATES.RETURNING;
      this.holds.clear();
      this.emit('Automatic sequence cancelled. Service return to load position started.');
      return true;
    }
    s.cycleStopRequested = true;
    if (this.safeAtLoad) {
      this.completeCycle();
      return true;
    }
    this.emit('Manual stop requested. Return both arms and gondola upright, then engage both locks.');
    return true;
  }

  emergencyStop() {
    const s = this.state;
    if (!s.estop) {
      s.estop = true;
      s.fault = true;
      s.mode = STATES.FAULT;
      s.drive = false;
      s.armLock = true;
      this.applyBrake(true);
      this.holds.clear();
      this.emit('EMERGENCY STOP LATCHED — service braking active.', 'error');
    } else {
      s.estop = false;
      this.emit('Emergency stop released. Press FAULT RESET after all motion has stopped.');
    }
    return true;
  }

  resetFault() {
    const s = this.state;
    if (s.estop) return this.reject('Release the emergency stop before resetting the fault circuit.');
    if (!this.stationary) return this.reject('Fault reset denied while the ride is moving.');
    s.fault = false;
    s.drive = false;
    s.platformClear = false;
    s.armLock = true;
    this.applyBrake(true);
    s.mode = s.rideOpen ? STATES.CHECKING : STATES.CLOSED;
    this.emit('Fault circuit reset. Re-establish the platform and drive checks.');
    return true;
  }

  updateMode() {
    const s = this.state;
    if (s.fault) s.mode = STATES.FAULT;
    else if (!s.power) s.mode = STATES.CLOSED;
    else if ([STATES.RUNNING, STATES.RETURNING].includes(s.mode)) return;
    else if (s.loadGate) s.mode = s.needsUnload && s.onboard > 0 ? STATES.UNLOADING : STATES.BOARDING;
    else if (this.canDispatch) s.mode = STATES.READY;
    else if (s.onboard > 0) s.mode = STATES.CHECKING;
    else if (!s.rideOpen && s.queue === 0) s.mode = STATES.CLOSED;
    else s.mode = STATES.WAITING;
  }

  applyBrake(engaged) {
    const s = this.state;
    if (engaged && !s.gondolaBrake) this.brakeOffset = s.gondolaAngle - s.armAngle;
    s.gondolaBrake = engaged;
  }

  getAutoCommand() {
    const s = this.state;
    const sequence = AUTO_SEQUENCES[s.program];
    return sequence?.find(step => s.cycleElapsed < step.until) || null;
  }

  tickGuests(dt) {
    const s = this.state;
    if (s.rideOpen) {
      s.parkElapsed += dt;
      this.arrivalAccumulator += dt * (0.32 + Math.min(0.18, s.cycles * 0.015));
      while (this.arrivalAccumulator >= 1 && s.queue < 80) {
        s.queue += 1;
        this.arrivalAccumulator -= 1;
      }
    }

    for (let index = this.boardingTransfers.length - 1; index >= 0; index -= 1) {
      this.boardingTransfers[index] -= dt;
      if (this.boardingTransfers[index] <= 0) {
        this.boardingTransfers.splice(index, 1);
        s.onboard += 1;
        s.score += 2;
      }
    }
    s.boardingCount = this.boardingTransfers.length;

    if (!s.loadGate || !this.safeAtLoad) return;
    // Approximate a staffed group load rather than teleporting a full gondola.
    this.guestAccumulator += dt * (s.needsUnload ? 1.48 : 1.15);
    while (this.guestAccumulator >= 1) {
      if (s.needsUnload && s.onboard > 0) {
        s.onboard -= 1;
        s.guestsServed += 1;
        s.achievements.served500 = s.guestsServed >= 500;
        s.score += Math.round(18 + s.happiness * 0.32);
      } else {
        if (s.needsUnload) {
          s.needsUnload = false;
          s.mode = STATES.BOARDING;
        }
        if (s.queue > 0 && s.onboard + this.boardingTransfers.length < CAPACITY) {
          s.queue -= 1;
          this.boardingTransfers.push(3.15 + (s.queue % 5) * 0.08);
          s.boardingCount = this.boardingTransfers.length;
          s.boardingStarted += 1;
        } else {
          this.guestAccumulator = 0;
          break;
        }
      }
      this.guestAccumulator -= 1;
    }
  }

  tickRestraints(dt) {
    const s = this.state;
    const target = s.restraints ? 1 : 0;
    s.restraintProgress = approach(s.restraintProgress, target, dt * 0.72);
    if (s.restraints && s.restraintProgress >= 0.999) {
      s.restraintProgress = 1;
      s.restraintProved = s.onboard > 0;
    }
    if (!s.restraints && s.restraintProgress <= 0.001) {
      s.restraintProgress = 0;
      s.restraintProved = false;
    }
  }

  tickMotion(dt) {
    const s = this.state;
    let targetSpeed = 0;
    let returnArmTarget = null;
    let returnGondolaTarget = null;

    if (s.mode === STATES.RUNNING) {
      s.cycleElapsed += dt;
      if (s.program === 'manual') {
        let armCommand = 0;
        if (!s.armLock) {
          if (this.holds.has('armForward')) armCommand += 1;
          if (this.holds.has('armReverse')) armCommand -= 1;
        }
        targetSpeed = armCommand * (20 + s.armSpeedSetpoint * 40);
        if (s.cycleElapsed >= PROGRAMS.manual.duration) {
          s.mode = STATES.RETURNING;
          this.emit('Maximum manual cycle time reached. Service return engaged.', 'error');
        }
      } else {
        const command = this.getAutoCommand();
        if (!command) {
          s.mode = STATES.RETURNING;
          this.emit('Programme complete. Returning the gondola to load position.');
        } else {
          targetSpeed = command.arm * (27 + PROGRAMS[s.program].intensity * 7);
          s.armLock = command.arm === 0;
          this.applyBrake(command.brake);
        }
      }
    }

    if (s.mode === STATES.RETURNING) {
      returnArmTarget = Math.round(s.armAngle / 360) * 360;
      returnGondolaTarget = Math.round(s.gondolaAngle / 360) * 360;
      const error = returnArmTarget - s.armAngle;
      targetSpeed = Math.abs(error) < 0.25 ? 0 : clamp(error * 0.92, -28, 28);
      s.armLock = false;
      this.applyBrake(false);
    }

    if (![STATES.RUNNING, STATES.RETURNING].includes(s.mode)) targetSpeed = 0;
    if (s.fault || s.estop || s.armLock) targetSpeed = 0;

    const oldArm = s.armAngle;
    const substeps = Math.max(1, Math.ceil(dt / (1 / 180)));
    const step = dt / substeps;
    let pivotAccelerationY = 0;
    let pivotAccelerationZ = 0;
    let thetaAcceleration = 0;

    // Semi-implicit sub-stepping keeps brake captures and multiple flips stable
    // even when a slow browser frame supplies the maximum 50 ms timestep.
    for (let index = 0; index < substeps; index += 1) {
      const previousArmVelocity = s.armVelocity;
      const driveAcceleration = Math.abs(targetSpeed) > Math.abs(s.armVelocity) ? 46 : 68;
      s.armVelocity = approach(s.armVelocity, targetSpeed, driveAcceleration * step);
      if (s.fault || s.estop) s.armVelocity = approach(s.armVelocity, 0, 110 * step);
      const armAcceleration = (s.armVelocity - previousArmVelocity) / step;
      s.armAngle += s.armVelocity * step;

      const alpha = s.armAngle * DEG;
      const alphaVelocity = s.armVelocity * DEG;
      const alphaAcceleration = armAcceleration * DEG;
      let theta = s.gondolaAngle * DEG;
      let thetaVelocity = s.gondolaVelocity * DEG;
      pivotAccelerationZ = ARM_RADIUS * (Math.sin(alpha) * alphaVelocity ** 2 - Math.cos(alpha) * alphaAcceleration);
      pivotAccelerationY = ARM_RADIUS * (Math.cos(alpha) * alphaVelocity ** 2 + Math.sin(alpha) * alphaAcceleration);

      if (s.mode === STATES.RETURNING) {
        const gondolaError = (returnGondolaTarget - s.gondolaAngle) * DEG;
        thetaAcceleration = clamp(gondolaError * 4.8 - thetaVelocity * 2.9, -4.6, 4.6);
      } else {
        thetaAcceleration = (-GRAVITY * Math.sin(theta)
          + pivotAccelerationZ * Math.cos(theta)
          - pivotAccelerationY * Math.sin(theta)) / PHYSICAL_PENDULUM_LENGTH;
        thetaAcceleration -= thetaVelocity * (0.036 + 0.008 * Math.abs(thetaVelocity));
      }

      const pressureTarget = s.gondolaBrake ? 1 : 0;
      s.brakePressure = approach(s.brakePressure, pressureTarget, step * (s.gondolaBrake ? 4.7 : 8.5));
      const relativeVelocity = thetaVelocity - alphaVelocity;
      let caliperAcceleration = 0;
      if (s.brakePressure > 0.002 && s.mode !== STATES.RETURNING) {
        const relativeAngle = wrappedAngle((s.gondolaAngle - s.armAngle) - this.brakeOffset) * DEG;
        s.brakeFade = clamp(1 - Math.max(0, s.brakeTemperature - 155) / 210, 0.56, 1);
        caliperAcceleration = clamp(-relativeAngle * 38 - relativeVelocity * 15.5, -32, 32)
          * s.brakePressure * s.brakeFade;
        thetaAcceleration += caliperAcceleration;

        if (s.brakePressure > 0.985 && Math.abs(relativeVelocity) < 0.07 && Math.abs(relativeAngle) < 0.012) {
          theta = (s.armAngle + this.brakeOffset) * DEG;
          thetaVelocity = alphaVelocity;
          thetaAcceleration = alphaAcceleration;
        }
      }

      s.brakeTemperature = clamp(
        s.brakeTemperature
          + Math.abs(caliperAcceleration * relativeVelocity) * step * 0.13
          - Math.max(0, s.brakeTemperature - 22) * step * 0.028,
        22,
        280
      );
      if (s.brakeTemperature < 155) s.brakeFade = 1;

      thetaVelocity += thetaAcceleration * step;
      thetaVelocity = clamp(thetaVelocity, -7.4, 7.4);
      theta += thetaVelocity * step;
      s.gondolaVelocity = thetaVelocity * RAD_TO_DEG;
      s.gondolaAngle = theta * RAD_TO_DEG;
    }

    const armDelta = s.armAngle - oldArm;
    this.lastArmAcceleration = (s.armVelocity - this.lastArmVelocity) / Math.max(dt, 0.001);
    this.lastArmVelocity = s.armVelocity;

    if (s.fault) {
      s.gondolaVelocity = approach(s.gondolaVelocity, 0, 105 * dt);
    }

    if (s.mode === STATES.RETURNING) {
      const armError = returnArmTarget - s.armAngle;
      const gondolaError = returnGondolaTarget - s.gondolaAngle;
      if (Math.abs(armError) < 0.65 && Math.abs(s.armVelocity) < 1.5
        && Math.abs(gondolaError) < 1.6 && Math.abs(s.gondolaVelocity) < 2.3) {
        s.armAngle = returnArmTarget;
        s.gondolaAngle = returnGondolaTarget;
        s.armVelocity = 0;
        s.gondolaVelocity = 0;
        s.armLock = true;
        this.brakeOffset = 0;
        this.applyBrake(true);
        s.brakePressure = 1;
        this.completeCycle();
        return;
      }
    }

    if (s.mode === STATES.RUNNING) {
      this.updateRideMetrics(dt, armDelta, pivotAccelerationY, pivotAccelerationZ, thetaAcceleration);
      if (s.program === 'manual' && s.cycleStopRequested && this.safeAtLoad) this.completeCycle();
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
    s.needsUnload = true;
    s.cycles += 1;
    s.score += 250 + s.inversions * 40 + Math.round(s.happiness * 2);
    this.holds.clear();
    this.emit(`Cycle complete: ${s.inversions} inversions, ${s.maxG.toFixed(1)}G peak, ${Math.round(s.happiness)}% guest happiness. Open restraints to unload.`);
  }

  tick(dt) {
    const s = this.state;
    this.tickRestraints(dt);
    this.tickGuests(dt);
    this.tickMotion(dt);
    s.throughput = s.parkElapsed > 10 ? Math.round(s.guestsServed / s.parkElapsed * 3600) : 0;
    this.dispatchEvent(new CustomEvent('tick', { detail: this.snapshot() }));
  }
}
