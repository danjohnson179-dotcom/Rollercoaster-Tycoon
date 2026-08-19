import { RideController, STATES } from './state-machine.js?v=11';
import { click, alarm, updateRideAudio } from '../services/audio.js';
import { applySettings } from '../core/settings.js';

applySettings();

const q = selector => document.querySelector(selector);
const qa = selector => [...document.querySelectorAll(selector)];
const controller = new RideController();
const seatLamps = [];
const cameraNames = ['operator', 'wide', 'platform'];
let cameraIndex = 0;
let scene;

function buildSeatMap() {
  const map = q('#seat-map');
  for (let index = 0; index < 38; index += 1) {
    const lamp = document.createElement('i');
    lamp.title = `Seat ${index + 1}`;
    map.append(lamp);
    seatLamps.push(lamp);
  }
}

async function initialiseScene() {
  try {
    const { RideScene } = await import('./scene.js?v=11');
    scene = new RideScene(q('#ride-canvas'));
  } catch (error) {
    console.error('Ride scene initialisation failed:', error);
    const fallback = q('#webgl-error');
    fallback.hidden = false;
    fallback.dataset.error = error?.message || String(error);
    q('#load-status').textContent = '3D unavailable — controls ready';
  } finally {
    setTimeout(() => q('#sim-loader').classList.add('is-hidden'), 420);
  }
}

function selectCamera(name) {
  const next = cameraNames.includes(name) ? name : 'operator';
  cameraIndex = cameraNames.indexOf(next);
  qa('[data-camera]').forEach(button => button.classList.toggle('active', button.dataset.camera === next));
  scene?.setCamera(next);
}

function cycleCamera() {
  cameraIndex = (cameraIndex + 1) % cameraNames.length;
  selectCamera(cameraNames[cameraIndex]);
}

qa('[data-camera]').forEach(button => button.addEventListener('click', () => selectCamera(button.dataset.camera)));
q('#view-button').addEventListener('click', cycleCamera);

const controls = {
  power: q('#power'),
  entrance: q('#ride-open'),
  gates: q('#load-gate'),
  restraints: q('#restraints'),
  water: q('#water'),
  cycleStop: q('#cycle-stop'),
  dispatch: q('#dispatch')
};

controls.power.addEventListener('click', () => controller.togglePower());
controls.entrance.addEventListener('click', () => controller.toggleRideOpen());
controls.gates.addEventListener('click', () => controller.toggleLoadGate());
controls.restraints.addEventListener('click', () => controller.toggleRestraints());
controls.cycleStop.addEventListener('click', () => controller.requestCycleStop());
q('#estop').addEventListener('click', () => { alarm(); controller.emergencyStop(); });
q('#reset').addEventListener('click', () => controller.resetFault());

function bindHold(element, begin, end) {
  const press = event => {
    event?.preventDefault();
    if (element.disabled) return;
    try { element.setPointerCapture(event.pointerId); } catch { /* keyboard or unsupported capture */ }
    if (begin() !== false) element.classList.add('pressed');
  };
  const release = () => {
    end();
    element.classList.remove('pressed');
  };
  element.addEventListener('pointerdown', press);
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', release);
  element.addEventListener('blur', release);
  return { press, release };
}

const holdBindings = {
  armReverse: bindHold(q('#arm-reverse'), () => controller.hold('armReverse', true), () => controller.hold('armReverse', false)),
  armForward: bindHold(q('#arm-forward'), () => controller.hold('armForward', true), () => controller.hold('armForward', false)),
  brakeHalf: bindHold(q('#brake-half'), () => controller.hold('brakeHalf', true), () => controller.hold('brakeHalf', false)),
  brakeFull: bindHold(q('#brake-full'), () => controller.hold('brakeFull', true), () => controller.hold('brakeFull', false)),
  water: bindHold(controls.water, () => controller.setWaterActive(true), () => controller.setWaterActive(false))
};

const dispatchBinding = bindHold(controls.dispatch, () => controller.beginDispatch(), () => controller.endDispatch());

const options = q('#options-dialog');
const openOptions = () => { if (!options.open) options.showModal(); };
const closeOptions = () => { if (options.open) options.close(); };
q('#options-button').addEventListener('click', openOptions);
q('#help-button').addEventListener('click', openOptions);
q('#options-close').addEventListener('click', closeOptions);
options.addEventListener('click', event => {
  if (event.target === options) closeOptions();
});

q('#operation-mode').addEventListener('change', event => {
  const accepted = controller.setTestMode(event.target.value === 'test');
  if (!accepted) event.target.value = controller.state.testMode ? 'test' : 'public';
});
q('#program').addEventListener('change', event => controller.setProgram(event.target.value));
q('#arm-speed').addEventListener('change', event => controller.setArmSpeed(event.target.value));
q('#demand-mode').addEventListener('change', event => controller.setDemandMode(event.target.value));
q('#fault-rate').addEventListener('change', event => controller.setFaultRate(event.target.value));
q('#water-pattern').addEventListener('change', event => controller.setWaterMode(event.target.value));
q('#water-height').addEventListener('input', event => {
  controller.setWaterHeight(Number(event.target.value) / 100);
  qa('[data-telemetry="water-height"]').forEach(element => { element.textContent = event.target.value; });
});
qa('[data-water-zone]').forEach(button => button.addEventListener('click', () => controller.toggleWaterZone(button.dataset.waterZone)));
q('#call-mechanic').addEventListener('click', () => controller.callMechanic());
q('#diagnose').addEventListener('click', () => controller.diagnoseFault(q('#diagnosis-system').value));

const pressedKeys = new Set();

function pressInput(key) {
  switch (key) {
    case 'arrowleft': return controller.hold('armReverse', true);
    case 'arrowright': return controller.hold('armForward', true);
    case 'x': return controller.hold('brakeHalf', true);
    case 'b': return controller.hold('brakeFull', true);
    case 'w': return controller.setWaterActive(true);
    case ' ': return controller.beginDispatch();
    default: return false;
  }
}

function releaseInput(key) {
  switch (key) {
    case 'arrowleft': controller.hold('armReverse', false); q('#arm-reverse').classList.remove('pressed'); break;
    case 'arrowright': controller.hold('armForward', false); q('#arm-forward').classList.remove('pressed'); break;
    case 'x': controller.hold('brakeHalf', false); q('#brake-half').classList.remove('pressed'); break;
    case 'b': controller.hold('brakeFull', false); q('#brake-full').classList.remove('pressed'); break;
    case 'w': controller.setWaterActive(false); controls.water.classList.remove('pressed'); break;
    case ' ': controller.endDispatch(); controls.dispatch.classList.remove('pressed'); break;
    default: break;
  }
}

function clickCommand(key) {
  switch (key) {
    case 'k': return controller.togglePower();
    case 'o': return controller.toggleRideOpen();
    case 'g': return controller.toggleLoadGate();
    case 'r': return controller.toggleRestraints();
    case 's': return controller.requestCycleStop();
    case 'e': alarm(); return controller.emergencyStop();
    case 'f': return controller.resetFault();
    case 'm': openOptions(); return controller.callMechanic();
    case 't': return controller.setTestMode(!controller.state.testMode);
    case 'v': cycleCamera(); return true;
    case '1': q('#program').value = 'manual'; return controller.setProgram('manual');
    case '2': q('#program').value = 'sequence1'; return controller.setProgram('sequence1');
    case '3': q('#program').value = 'sequence2'; return controller.setProgram('sequence2');
    case '4': q('#program').value = 'sequence3'; return controller.setProgram('sequence3');
    default: return false;
  }
}

document.addEventListener('keydown', event => {
  if (event.target.matches('input, select, textarea') || options.open) return;
  const key = event.key.toLowerCase();
  const held = ['arrowleft', 'arrowright', 'x', 'b', 'w', ' '];
  const clicked = ['k', 'o', 'g', 'r', 's', 'e', 'f', 'm', 't', 'v', '1', '2', '3', '4'];
  if (![...held, ...clicked].includes(key)) return;
  event.preventDefault();
  if (pressedKeys.has(key)) return;
  pressedKeys.add(key);
  if (held.includes(key)) {
    const accepted = pressInput(key);
    if (accepted !== false) {
      const element = {
        arrowleft: '#arm-reverse', arrowright: '#arm-forward', x: '#brake-half', b: '#brake-full', w: '#water', ' ': '#dispatch'
      }[key];
      q(element)?.classList.add('pressed');
    }
  } else clickCommand(key);
});

document.addEventListener('keyup', event => {
  const key = event.key.toLowerCase();
  pressedKeys.delete(key);
  releaseInput(key);
});

function releaseAllInputs() {
  ['arrowleft', 'arrowright', 'x', 'b', 'w', ' '].forEach(releaseInput);
  pressedKeys.clear();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseAllInputs();
});
window.addEventListener('blur', releaseAllInputs);
document.addEventListener('click', event => { if (event.target.closest('button')) click(); });

function setControl(element, active, status) {
  element.classList.toggle('active', Boolean(active));
  const small = element.querySelector('small');
  if (small && status) small.textContent = status;
}

function renderState(state, message, type) {
  q('#state-label span').textContent = state.mode;
  q('#state-label').classList.toggle('fault', state.fault);
  document.body.classList.toggle('state-running', [STATES.RUNNING, STATES.RETURNING].includes(state.mode));
  document.body.classList.toggle('state-fault', state.fault);

  setControl(controls.power, state.power, state.power ? 'ON' : 'OFF');
  setControl(controls.entrance, state.rideOpen, state.rideOpen ? 'OPEN' : 'CLOSED');
  setControl(controls.gates, state.loadGate, state.loadGate ? 'OPEN' : 'CLOSED');
  const restraintStatus = state.restraintProgress > 0 && state.restraintProgress < 1
    ? `${Math.round(state.restraintProgress * 100)}%`
    : state.restraintProved ? 'LOCKED' : state.restraints ? 'CLOSING' : 'OPEN';
  setControl(controls.restraints, state.restraints, restraintStatus);
  controls.water.classList.toggle('active', state.waterMaster);
  controls.cycleStop.classList.toggle('active', state.mode === STATES.RETURNING);
  controls.dispatch.classList.toggle('ready', controller.canDispatch);
  q('#estop').classList.toggle('latched', state.estop);

  const moving = [STATES.RUNNING, STATES.RETURNING].includes(state.mode);
  const manualRunning = state.mode === STATES.RUNNING && state.program === 'manual';
  controls.entrance.disabled = !state.power || state.testMode;
  controls.gates.disabled = !state.power || moving || !state.safeAtLoad || state.restraintProgress > 0.01
    || state.platformGuests > 0 || state.loadBatchRemaining > 0;
  controls.restraints.disabled = !state.power || state.loadGate || moving || !state.safeAtLoad;
  controls.dispatch.disabled = !controller.canDispatch;
  controls.cycleStop.disabled = state.mode !== STATES.RUNNING;
  qa('#arm-reverse,#arm-forward,#brake-half,#brake-full').forEach(element => { element.disabled = !manualRunning; });

  q('#operation-mode').value = state.testMode ? 'test' : 'public';
  q('#program').value = state.program;
  q('#demand-mode').value = state.demandMode;
  q('#fault-rate').value = state.faultRate;
  q('#operation-mode').disabled = moving || state.onboard > 0 || state.loadGate;
  q('#program').disabled = moving;
  q('#arm-speed').disabled = moving;
  q('#call-mechanic').disabled = state.mechanicStatus !== 'CALL REQUIRED';
  q('#diagnose').disabled = state.mechanicStatus !== 'ON SITE';
  q('#reset').disabled = !state.fault;

  qa('[data-water-zone]').forEach(button => button.classList.toggle('active', Boolean(state.waterZones?.[button.dataset.waterZone])));
  q('[data-status="entrance"]').textContent = state.rideOpen ? 'OPEN' : 'CLOSED';
  if (message) {
    q('#message-display p').textContent = message;
    toast(message, type);
  }
}

function renderTelemetry(state) {
  const text = (selector, value) => qa(selector).forEach(element => { element.textContent = value; });
  text('[data-telemetry="queue"]', state.queue);
  text('[data-telemetry="onboard"]', state.onboard);
  text('[data-telemetry="boarding"]', state.boardingCount + state.unloadingCount);
  text('[data-telemetry="throughput"]', state.throughput);
  text('[data-telemetry="arm"]', state.arm.toFixed(1));
  text('[data-telemetry="rpm"]', Math.abs(state.rpm).toFixed(1));
  text('[data-telemetry="brake-mode"]', state.brakeMode);
  text('[data-telemetry="brake-pressure"]', Math.round(state.brakePressure * 100));
  text('[data-telemetry="gforce"]', state.currentG.toFixed(1));
  text('[data-telemetry="happiness"]', Math.round(state.happiness));
  text('[data-telemetry="time"]', `${String(Math.floor(state.cycleElapsed / 60)).padStart(2, '0')}:${String(Math.floor(state.cycleElapsed % 60)).padStart(2, '0')}`);
  text('[data-telemetry="water-height"]', Math.round(state.waterHeightSetpoint * 100));
  text('[data-telemetry="water-pressure"]', Math.round(state.waterPumpPressure * 100));
  text('[data-telemetry="fault-name"]', state.faultName || 'No active fault');
  text('[data-telemetry="mechanic-status"]', state.mechanicStatus);
  q('#score').textContent = state.score.toLocaleString('en-GB');

  q('#brake-half').classList.toggle('live', state.brakeMode === 'HALF');
  q('#brake-full').classList.toggle('live', state.brakeMode === 'FULL' && state.mode === STATES.RUNNING);
  q('#water').classList.toggle('live', state.waterMaster);

  seatLamps.forEach((lamp, index) => {
    lamp.classList.toggle('occupied', index < state.onboard);
    lamp.classList.toggle('proved', index < state.onboard && state.restraintProved);
  });
}

function toast(message, type) {
  const element = document.createElement('div');
  element.className = `toast ${type === 'error' ? 'error' : ''}`;
  element.textContent = message;
  q('#toast-region').append(element);
  setTimeout(() => element.remove(), 3000);
}

controller.addEventListener('change', event => {
  renderState(event.detail.state, event.detail.message, event.detail.type);
  renderTelemetry(event.detail.state);
});
controller.addEventListener('tick', event => {
  renderState(event.detail);
  renderTelemetry(event.detail);
});

buildSeatMap();
initialiseScene();
renderState(controller.snapshot(), 'Turn on the power to begin.');
renderTelemetry(controller.snapshot());

let previousFrame = performance.now();
function frame(now) {
  const elapsed = (now - previousFrame) / 1000;
  const dt = Number.isFinite(elapsed) && elapsed > 0 ? Math.min(0.05, elapsed) : 0;
  previousFrame = now;
  controller.tick(dt);
  const snapshot = controller.snapshot();
  scene?.update(snapshot, dt);
  updateRideAudio(snapshot);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setInterval(() => { q('#clock').textContent = new Date().toLocaleTimeString('en-GB'); }, 1000);
