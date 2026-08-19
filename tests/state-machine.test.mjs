import assert from 'node:assert/strict';
import { RideController, STATES } from '../js/simulator/state-machine.js';

const STEP = 1 / 120;
const controller = new RideController();
const state = controller.state;

state.mode = STATES.RUNNING;
state.program = 'manual';
state.armLock = false;
state.faultRate = 'off';
state.nextFaultIn = Infinity;
controller.physics.setBrakeMode(state, 'RELEASED');

controller.hold('brakeHalf', true);
controller.tick(0.1);
assert.equal(state.brakeMode, 'HALF', 'X/half hold must select HALF');
assert.ok(state.brakePressure > 0.49 && state.brakePressure < 0.51);

controller.hold('brakeHalf', false);
controller.tick(0.1);
assert.equal(state.brakeMode, 'RELEASED', 'releasing X must free the gondola');
assert.equal(state.brakePressure, 0);

controller.hold('brakeFull', true);
controller.tick(0.1);
controller.tick(0.1);
assert.equal(state.brakeMode, 'FULL', 'B/full hold must select FULL');
assert.ok(state.brakePressure > 0.74);

controller.hold('armForward', true);
for (let frame = 0; frame < Math.round(5.25 / STEP); frame += 1) controller.tick(STEP);
assert.ok(Math.abs(state.gondolaVelocity - state.armVelocity) < 1, 'FULL must carry the gondola with the arms');

controller.hold('brakeFull', false);
const releasedAt = state.gondolaAngle;
let minAngle = releasedAt;
let maxAngle = releasedAt;
for (let frame = 0; frame < Math.round(12 / STEP); frame += 1) {
  controller.tick(STEP);
  minAngle = Math.min(minAngle, state.gondolaAngle);
  maxAngle = Math.max(maxAngle, state.gondolaAngle);
}
controller.hold('armForward', false);

const rotationTravel = Math.max(Math.abs(maxAngle - releasedAt), Math.abs(minAngle - releasedAt));
assert.equal(state.brakeMode, 'RELEASED');
assert.ok(rotationTravel > 360, `actual controller path must allow a complete inversion (${rotationTravel.toFixed(1)} deg)`);
assert.ok(state.inversions >= 1, `controller should register an inversion (${state.inversions})`);

console.log(JSON.stringify({
  brakeMode: state.brakeMode,
  brakePressure: state.brakePressure,
  rotationTravel,
  inversions: state.inversions,
  maxRpm: state.gondolaVelocity / 6
}, null, 2));
