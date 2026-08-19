import assert from 'node:assert/strict';
import { TopSpinPhysics } from '../js/simulator/topspin-physics.js';

const STEP = 1 / 120;
const wrap = value => ((value + 180) % 360 + 360) % 360 - 180;

function makeState(overrides = {}) {
  return {
    armAngle: 0,
    armVelocity: 0,
    gondolaAngle: 0,
    gondolaVelocity: 0,
    brakeMode: 'RELEASED',
    brakeDemand: 0,
    brakePressure: 0,
    brakeTemperature: 22,
    brakeFade: 1,
    gondolaBrake: false,
    armLock: false,
    fault: false,
    estop: false,
    ...overrides
  };
}

function run(physics, state, seconds, options = {}, sample) {
  const frames = Math.round(seconds / STEP);
  for (let frame = 0; frame < frames; frame += 1) {
    physics.step(state, STEP, options);
    sample?.(state, frame * STEP);
  }
  return state;
}

function brakeComparison() {
  const releasedPhysics = new TopSpinPhysics();
  const halfPhysics = new TopSpinPhysics();
  const initial = {
    armAngle: 35,
    armVelocity: 26,
    gondolaAngle: 75,
    gondolaVelocity: 142
  };
  const released = makeState(initial);
  const half = makeState(initial);

  releasedPhysics.setBrakeMode(released, 'RELEASED');
  halfPhysics.setBrakeMode(half, 'HALF');
  let releasedSlip = 0;
  let halfSlip = 0;
  run(releasedPhysics, released, 0.8, { armTargetSpeed: 26 }, sample => {
    releasedSlip += Math.abs(sample.gondolaVelocity - sample.armVelocity) * STEP;
  });
  run(halfPhysics, half, 0.8, { armTargetSpeed: 26 }, sample => {
    halfSlip += Math.abs(sample.gondolaVelocity - sample.armVelocity) * STEP;
  });

  const releasedRelativeSpeed = Math.abs(released.gondolaVelocity - released.armVelocity);
  const halfRelativeSpeed = Math.abs(half.gondolaVelocity - half.armVelocity);
  assert.ok(
    halfSlip < releasedSlip * 0.55,
    `half brake should remove at least 45% of relative travel (${halfSlip.toFixed(1)} vs ${releasedSlip.toFixed(1)} deg)`
  );
  assert.equal(half.brakeMode, 'HALF');
  assert.ok(half.brakePressure > 0.48 && half.brakePressure < 0.52);
  return { releasedRelativeSpeed, halfRelativeSpeed, releasedSlip, halfSlip };
}

function fullCapture() {
  const physics = new TopSpinPhysics();
  const state = makeState({
    armAngle: 48,
    armVelocity: 24,
    gondolaAngle: 121,
    gondolaVelocity: 128
  });
  physics.setBrakeMode(state, 'RELEASED');
  const captured = wrap(state.gondolaAngle - state.armAngle);
  physics.setBrakeMode(state, 'FULL');
  run(physics, state, 0.9, { armTargetSpeed: 34 });

  const relativeSpeed = Math.abs(state.gondolaVelocity - state.armVelocity);
  const captureError = Math.abs(wrap((state.gondolaAngle - state.armAngle) - captured));
  assert.ok(relativeSpeed < 2.5, `full brake relative speed ${relativeSpeed.toFixed(2)} deg/s`);
  assert.ok(captureError < 1.5, `full brake capture error ${captureError.toFixed(2)} deg`);
  assert.ok(state.brakePressure > 0.99);
  return { relativeSpeed, captureError };
}

function releaseResponse() {
  const physics = new TopSpinPhysics();
  const state = makeState({ brakeMode: 'FULL', brakeDemand: 1, brakePressure: 1 });
  physics.setBrakeMode(state, 'RELEASED');
  run(physics, state, 0.14, { armTargetSpeed: 0 });
  assert.ok(state.brakePressure < 0.02, `released pressure ${state.brakePressure.toFixed(3)}`);
  return { pressure: state.brakePressure };
}

function rockingDecay() {
  const physics = new TopSpinPhysics();
  const state = makeState({ gondolaAngle: 32 });
  physics.setBrakeMode(state, 'RELEASED');
  let lastPeak = 0;
  run(physics, state, 16, { armTargetSpeed: 0 }, (sample, time) => {
    if (time > 13) lastPeak = Math.max(lastPeak, Math.abs(wrap(sample.gondolaAngle)));
  });
  assert.ok(lastPeak < 9, `free rocking remains too large (${lastPeak.toFixed(1)} deg)`);
  return { lastPeak };
}

function operatorInversion() {
  const physics = new TopSpinPhysics();
  const state = makeState({ brakeMode: 'FULL', brakeDemand: 1, brakePressure: 1 });
  physics.setBrakeMode(state, 'RELEASED');
  physics.setBrakeMode(state, 'FULL');

  // Hold the gondola to the arms while lifting, then release close to the arm
  // crest and keep the arm drive moving. This is the core manual Top Spin move.
  const defaultArmSpeed = 16 + 0.72 * 32;
  run(physics, state, 5.25, { armTargetSpeed: defaultArmSpeed });
  physics.setBrakeMode(state, 'RELEASED');
  const releasedAt = state.gondolaAngle;
  let minAngle = state.gondolaAngle;
  let maxAngle = state.gondolaAngle;
  let maxRpm = 0;
  run(physics, state, 12, { armTargetSpeed: defaultArmSpeed }, sample => {
    minAngle = Math.min(minAngle, sample.gondolaAngle);
    maxAngle = Math.max(maxAngle, sample.gondolaAngle);
    maxRpm = Math.max(maxRpm, Math.abs(sample.gondolaVelocity / 6));
  });
  const rotationTravel = Math.max(Math.abs(maxAngle - releasedAt), Math.abs(minAngle - releasedAt));
  assert.ok(rotationTravel > 360, `release should produce a complete rotation (${rotationTravel.toFixed(1)} deg)`);
  assert.ok(maxRpm > 5 && maxRpm < 31, `rotation speed ${maxRpm.toFixed(1)} RPM`);
  return { rotationTravel, maxRpm };
}

const results = {
  halfBrake: brakeComparison(),
  fullBrake: fullCapture(),
  release: releaseResponse(),
  rocking: rockingDecay(),
  inversion: operatorInversion()
};

console.log(JSON.stringify(results, null, 2));
