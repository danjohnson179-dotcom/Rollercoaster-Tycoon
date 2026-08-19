const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const GRAVITY = 9.81;
const ARM_RADIUS = 6.05;
const PENDULUM_LENGTH = 2.72;

// A Top Spin gondola is a broad, high-inertia body rather than a point mass on
// a playground-swing rope. These two factors retain the arm-pivot excitation
// that creates rotations while reducing the exaggerated gravity-only rocking
// produced by a simple pendulum approximation.
const GRAVITY_TORQUE_SCALE = 0.27;
const PIVOT_EXCITATION_SCALE = 1.2;

// Hydraulic response is intentionally quick. The brake button is a momentary
// operator control, so a press needs to be felt immediately and a release must
// dump pressure without leaving an invisible brake applied for several seconds.
const BRAKE_APPLY_RATE = 7.5;
const BRAKE_RELEASE_RATE = 10.5;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const approach = (value, target, amount) => value + clamp(target - value, -amount, amount);
const wrapDegrees = value => ((value + 180) % 360 + 360) % 360 - 180;

export const BRAKE_LEVELS = Object.freeze({
  RELEASED: 0,
  HALF: 0.5,
  FULL: 1
});

const finiteOr = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

/**
 * Stable two-degree-of-freedom Top Spin dynamics.
 *
 * The arms are motor driven. The gondola is a physical pendulum suspended from
 * their moving pivot. RELEASED permits free swing, HALF adds friction without
 * locking an angle, and FULL captures the current gondola-to-arm relationship.
 */
export class TopSpinPhysics {
  constructor() {
    this.brakeCapture = 0;
    this.lastBrakeMode = 'FULL';
    this.returnArmTarget = 0;
    this.returnGondolaTarget = 0;
    this.returnActive = false;
  }

  sanitise(state) {
    state.armAngle = finiteOr(state.armAngle);
    state.armVelocity = finiteOr(state.armVelocity);
    state.gondolaAngle = finiteOr(state.gondolaAngle);
    state.gondolaVelocity = finiteOr(state.gondolaVelocity);
    state.brakePressure = clamp(finiteOr(state.brakePressure, 1), 0, 1);
    state.brakeTemperature = clamp(finiteOr(state.brakeTemperature, 22), 22, 260);
    state.brakeFade = clamp(finiteOr(state.brakeFade, 1), 0.62, 1);
    if (!BRAKE_LEVELS.hasOwnProperty(state.brakeMode)) state.brakeMode = 'FULL';
    state.brakeDemand = BRAKE_LEVELS[state.brakeMode];
    state.gondolaBrake = state.brakeMode === 'FULL';
  }

  setBrakeMode(state, mode) {
    if (!BRAKE_LEVELS.hasOwnProperty(mode)) return false;
    this.sanitise(state);
    if (mode === 'FULL' && this.lastBrakeMode !== 'FULL') {
      this.brakeCapture = wrapDegrees(state.gondolaAngle - state.armAngle);
    }
    state.brakeMode = mode;
    state.brakeDemand = BRAKE_LEVELS[mode];
    state.gondolaBrake = mode === 'FULL';
    this.lastBrakeMode = mode;
    return true;
  }

  beginReturn(state) {
    this.sanitise(state);
    this.returnArmTarget = Math.round(state.armAngle / 360) * 360;
    this.returnGondolaTarget = Math.round(state.gondolaAngle / 360) * 360;
    this.returnActive = true;
    this.setBrakeMode(state, 'HALF');
  }

  cancelReturn() {
    this.returnActive = false;
  }

  step(state, dt, options = {}) {
    this.sanitise(state);
    if (!Number.isFinite(dt) || dt <= 0) {
      return {
        armDelta: 0,
        pivotAccelerationY: 0,
        pivotAccelerationZ: 0,
        gondolaAcceleration: 0,
        settled: false
      };
    }

    const safeDt = Math.min(dt, 0.05);
    const returning = Boolean(options.returning);
    if (returning && !this.returnActive) this.beginReturn(state);
    if (!returning) this.returnActive = false;

    let targetArmSpeed = finiteOr(options.armTargetSpeed);
    if (returning) {
      const armError = this.returnArmTarget - state.armAngle;
      targetArmSpeed = Math.abs(armError) < 0.2 ? 0 : clamp(armError * 0.68, -24, 24);
      const gondolaError = this.returnGondolaTarget - state.gondolaAngle;
      if (Math.abs(armError) < 8 && Math.abs(gondolaError) < 12) this.setBrakeMode(state, 'FULL');
      else this.setBrakeMode(state, 'HALF');
    }
    if (state.fault || state.estop || state.armLock) targetArmSpeed = 0;
    targetArmSpeed = clamp(targetArmSpeed, -52, 52);

    const oldArmAngle = state.armAngle;
    const substeps = Math.max(1, Math.ceil(safeDt / (1 / 240)));
    const step = safeDt / substeps;
    let pivotAccelerationY = 0;
    let pivotAccelerationZ = 0;
    let gondolaAcceleration = 0;

    for (let index = 0; index < substeps; index += 1) {
      const previousArmVelocity = state.armVelocity;
      const accelerationLimit = Math.abs(targetArmSpeed) > Math.abs(state.armVelocity) ? 31 : 47;
      state.armVelocity = approach(state.armVelocity, targetArmSpeed, accelerationLimit * step);
      if (state.fault || state.estop) state.armVelocity = approach(state.armVelocity, 0, 72 * step);
      const armAcceleration = (state.armVelocity - previousArmVelocity) / step;
      state.armAngle += state.armVelocity * step;

      const armAngle = state.armAngle * DEG;
      const armVelocity = state.armVelocity * DEG;
      const armAccelerationRad = armAcceleration * DEG;
      let gondolaAngle = state.gondolaAngle * DEG;
      let gondolaVelocity = state.gondolaVelocity * DEG;

      pivotAccelerationZ = ARM_RADIUS * (
        Math.sin(armAngle) * armVelocity ** 2
        - Math.cos(armAngle) * armAccelerationRad
      );
      pivotAccelerationY = ARM_RADIUS * (
        Math.cos(armAngle) * armVelocity ** 2
        + Math.sin(armAngle) * armAccelerationRad
      );

      if (returning) {
        const gondolaError = (this.returnGondolaTarget - state.gondolaAngle) * DEG;
        gondolaAcceleration = clamp(gondolaError * 3.25 - gondolaVelocity * 2.85, -3.5, 3.5);
      } else {
        gondolaAcceleration = (
          -GRAVITY * GRAVITY_TORQUE_SCALE * Math.sin(gondolaAngle)
          + PIVOT_EXCITATION_SCALE * (
            pivotAccelerationZ * Math.cos(gondolaAngle)
            - pivotAccelerationY * Math.sin(gondolaAngle)
          )
        ) / PENDULUM_LENGTH;

        // Bearing and aerodynamic losses calm low-energy rocking without
        // removing the momentum needed for a deliberately built inversion.
        gondolaAcceleration -= gondolaVelocity * (0.18 + 0.03 * Math.abs(gondolaVelocity));
        gondolaAcceleration -= Math.tanh(gondolaVelocity * 7) * 0.035;

        const relativeVelocity = gondolaVelocity - armVelocity;
        const demand = BRAKE_LEVELS[state.brakeMode];
        const pressureRate = demand > state.brakePressure
          ? BRAKE_APPLY_RATE
          : BRAKE_RELEASE_RATE;
        state.brakePressure = approach(state.brakePressure, demand, pressureRate * step);

        if (state.brakePressure > 0.015) {
          // HALF is a genuine friction brake. Its strength is scaled by line
          // pressure exactly once; the previous model scaled it twice, making
          // half brake almost cosmetic at realistic gondola speeds.
          const friction = -Math.tanh(relativeVelocity * 4.8) * 2.8;
          const viscous = -relativeVelocity * 3;
          let brakeAcceleration = (friction + viscous)
            * state.brakePressure * state.brakeFade;

          // FULL brake captures an angle; HALF deliberately remains a friction brake.
          if (state.brakeMode === 'FULL' && state.brakePressure > 0.16) {
            const relativeError = wrapDegrees(
              (state.gondolaAngle - state.armAngle) - this.brakeCapture
            ) * DEG;
            const capture = -relativeError * 30 - relativeVelocity * 11;
            const captureBlend = clamp((state.brakePressure - 0.16) / 0.42, 0, 1);
            brakeAcceleration += clamp(capture, -32, 32)
              * captureBlend * state.brakeFade;

            if (state.brakePressure > 0.96
              && Math.abs(relativeVelocity) < 0.12
              && Math.abs(relativeError) < 0.028) {
              gondolaAngle = (state.armAngle + this.brakeCapture) * DEG;
              gondolaVelocity = armVelocity;
              brakeAcceleration = 0;
            }
          }

          gondolaAcceleration += brakeAcceleration;
          state.brakeTemperature = clamp(
            state.brakeTemperature
              + Math.abs(brakeAcceleration * relativeVelocity) * step * 0.92
              - Math.max(0, state.brakeTemperature - 22) * step * 0.024,
            22,
            260
          );
        } else {
          state.brakePressure = approach(state.brakePressure, 0, BRAKE_RELEASE_RATE * step);
          state.brakeTemperature = Math.max(22, state.brakeTemperature
            - Math.max(0, state.brakeTemperature - 22) * step * 0.026);
        }

        state.brakeFade = clamp(1 - Math.max(0, state.brakeTemperature - 165) / 245, 0.62, 1);
      }

      gondolaVelocity += gondolaAcceleration * step;
      // A soft limiter absorbs impossible numerical energy without flattening real flips.
      const speedLimit = 3.1;
      if (Math.abs(gondolaVelocity) > speedLimit) {
        gondolaVelocity = approach(gondolaVelocity, Math.sign(gondolaVelocity) * speedLimit, 3.2 * step);
      }
      gondolaVelocity = clamp(gondolaVelocity, -3.35, 3.35);
      gondolaAngle += gondolaVelocity * step;
      state.gondolaVelocity = gondolaVelocity * RAD_TO_DEG;
      state.gondolaAngle = gondolaAngle * RAD_TO_DEG;
    }

    this.sanitise(state);
    let settled = false;
    if (returning) {
      const armError = this.returnArmTarget - state.armAngle;
      const gondolaError = this.returnGondolaTarget - state.gondolaAngle;
      settled = Math.abs(armError) < 0.55
        && Math.abs(state.armVelocity) < 1.15
        && Math.abs(gondolaError) < 1.3
        && Math.abs(state.gondolaVelocity) < 1.9;
      if (settled) {
        state.armAngle = this.returnArmTarget;
        state.gondolaAngle = this.returnGondolaTarget;
        state.armVelocity = 0;
        state.gondolaVelocity = 0;
        state.brakePressure = 1;
        state.armLock = true;
        this.brakeCapture = 0;
        this.setBrakeMode(state, 'FULL');
        this.returnActive = false;
      }
    }

    return {
      armDelta: state.armAngle - oldArmAngle,
      pivotAccelerationY,
      pivotAccelerationZ,
      gondolaAcceleration,
      settled
    };
  }
}
