import { RideController, STATES } from './state-machine.js';
import { click, alarm } from '../services/audio.js';
import { applySettings } from '../core/settings.js';

applySettings();

const q = selector => document.querySelector(selector);
const qa = selector => [...document.querySelectorAll(selector)];
const controller = new RideController();
const loader = q('#sim-loader');
const seatLamps = [];
let scene;
let cameraIndex = 0;
const cameraNames = ['operator', 'wide', 'platform'];

async function initialiseScene() {
  try {
    const { RideScene } = await import('./scene.js');
    scene = new RideScene(q('#ride-canvas'));
  } catch (error) {
    const fallback = q('#webgl-error');
    console.error('Ride scene initialisation failed:', error);
    fallback.dataset.error = error?.message || String(error);
    fallback.hidden = false;
    q('#load-status').textContent = '3D unavailable — control simulation ready';
  } finally {
    setTimeout(() => loader.classList.add('is-hidden'), 450);
  }
}

function buildSeatMap() {
  const map = q('#seat-map');
  for (let row = 0; row < 2; row += 1) {
    const rowElement = document.createElement('div');
    rowElement.className = 'seat-map__row';
    for (let seat = 0; seat < 19; seat += 1) {
      const lamp = document.createElement('i');
      lamp.title = `Row ${row + 1}, seat ${seat + 1}`;
      rowElement.append(lamp);
      seatLamps.push(lamp);
    }
    map.append(rowElement);
  }
}

const controls = {
  power: q('#power'),
  rideOpen: q('#ride-open'),
  loadGate: q('#load-gate'),
  restraints: q('#restraints'),
  platformClear: q('#platform'),
  drive: q('#drive'),
  water: q('#water'),
  gondolaBrake: q('#gondola-brake'),
  armLock: q('#arm-lock'),
  cycleStop: q('#cycle-stop')
};

controls.power.addEventListener('click', () => controller.togglePower());
controls.rideOpen.addEventListener('click', () => controller.toggleRideOpen());
controls.loadGate.addEventListener('click', () => controller.toggleLoadGate());
controls.restraints.addEventListener('click', () => controller.toggleRestraints());
controls.platformClear.addEventListener('click', () => controller.confirmPlatform());
controls.drive.addEventListener('click', () => controller.toggleDrive());
controls.water.addEventListener('click', () => controller.toggleWater());
controls.gondolaBrake.addEventListener('click', () => controller.toggleGondolaBrake());
controls.armLock.addEventListener('click', () => controller.toggleArmLock());
controls.cycleStop.addEventListener('click', () => controller.requestCycleStop());
q('#program').addEventListener('change', event => controller.setProgram(event.target.value));
q('#reset').addEventListener('click', () => controller.resetFault());
q('#estop').addEventListener('click', () => {
  alarm();
  controller.emergencyStop();
});

const dispatch = q('#dispatch');
dispatch.addEventListener('pointerdown', event => {
  event.preventDefault();
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* keyboard and older browsers */ }
  controller.beginDispatch();
});
dispatch.addEventListener('pointerup', () => controller.endDispatch());
dispatch.addEventListener('pointercancel', () => controller.endDispatch());

const holdControls = [
  ['#arm-forward', 'armForward'],
  ['#arm-reverse', 'armReverse']
];

for (const [selector, command] of holdControls) {
  const element = q(selector);
  const start = () => {
    if (controller.hold(command, true)) element.classList.add('pressed');
  };
  const end = () => {
    controller.hold(command, false);
    element.classList.remove('pressed');
  };
  element.addEventListener('pointerdown', event => {
    event.preventDefault();
    try { element.setPointerCapture(event.pointerId); } catch { /* no pointer capture */ }
    start();
  });
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
  element.addEventListener('blur', end);
}

function selectCamera(name) {
  const buttons = qa('.view-tabs button');
  const next = buttons.find(button => button.dataset.camera === name) || buttons[0];
  buttons.forEach(button => button.classList.toggle('active', button === next));
  cameraIndex = cameraNames.indexOf(next.dataset.camera);
  scene?.setCamera(next.dataset.camera);
}

qa('.view-tabs button').forEach(button => {
  button.addEventListener('click', () => selectCamera(button.dataset.camera));
});

function keyboardAction(key) {
  switch (key) {
    case 'k': return controller.togglePower();
    case 'o': return controller.toggleRideOpen();
    case 'g': return controller.toggleLoadGate();
    case 'r': return controller.toggleRestraints();
    case 'c': return controller.confirmPlatform();
    case 'd': return controller.toggleDrive();
    case 'b': return controller.toggleGondolaBrake();
    case 'l': return controller.toggleArmLock();
    case 's': return controller.requestCycleStop();
    case 'w': return controller.toggleWater();
    case 'e': alarm(); return controller.emergencyStop();
    case 'f': return controller.resetFault();
    case '1': q('#program').value = 'manual'; return controller.setProgram('manual');
    case '2': q('#program').value = 'sequence1'; return controller.setProgram('sequence1');
    case '3': q('#program').value = 'sequence2'; return controller.setProgram('sequence2');
    case '4': q('#program').value = 'sequence3'; return controller.setProgram('sequence3');
    case 'v': cameraIndex = (cameraIndex + 1) % cameraNames.length; selectCamera(cameraNames[cameraIndex]); return true;
    default: return false;
  }
}

const pressedKeys = new Set();
document.addEventListener('keydown', event => {
  if (event.target.matches('input, select, textarea') || q('#help-dialog').open) return;
  const key = event.key.toLowerCase();
  const controlled = [' ', 'arrowleft', 'arrowright', 'k', 'o', 'g', 'r', 'c', 'd', 'b', 'l', 's', 'w', 'e', 'f', '1', '2', '3', '4', 'v'];
  if (!controlled.includes(key)) return;
  event.preventDefault();
  if (pressedKeys.has(key)) return;
  pressedKeys.add(key);
  if (key === ' ') controller.beginDispatch();
  else if (key === 'arrowleft') {
    if (controller.hold('armReverse', true)) q('#arm-reverse').classList.add('pressed');
  } else if (key === 'arrowright') {
    if (controller.hold('armForward', true)) q('#arm-forward').classList.add('pressed');
  } else keyboardAction(key);
});

document.addEventListener('keyup', event => {
  const key = event.key.toLowerCase();
  pressedKeys.delete(key);
  if (key === ' ') controller.endDispatch();
  if (key === 'arrowleft') {
    controller.hold('armReverse', false);
    q('#arm-reverse').classList.remove('pressed');
  }
  if (key === 'arrowright') {
    controller.hold('armForward', false);
    q('#arm-forward').classList.remove('pressed');
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  pressedKeys.clear();
  controller.hold('armReverse', false);
  controller.hold('armForward', false);
  controller.endDispatch();
});

document.addEventListener('click', event => {
  if (event.target.closest('button')) click();
});

function setControlState(element, active, label) {
  element.classList.toggle('active', Boolean(active));
  const small = element.querySelector('small');
  if (small && label) small.textContent = label;
}

function renderState(state, message, type) {
  const moving = [STATES.RUNNING, STATES.RETURNING].includes(state.mode);
  document.body.className = `sim-page ${moving ? 'state-running' : state.fault ? 'state-fault' : 'state-idle'}`;
  q('#state-label').lastChild.textContent = ` ${state.mode}`;
  q('#score').textContent = state.score.toLocaleString('en-GB');

  const lamps = { ...controller.safetyCircuits, fault: state.fault };
  Object.entries(lamps).forEach(([name, active]) => {
    q(`[data-lamp="${name}"]`)?.classList.toggle('on', Boolean(active));
  });

  setControlState(controls.power, state.power, state.power ? 'ON' : 'OFF');
  setControlState(controls.rideOpen, state.rideOpen, state.rideOpen ? 'OPEN' : 'CLOSED');
  setControlState(controls.loadGate, state.loadGate, state.loadGate ? 'OPEN' : 'CLOSED');
  const restraintLabel = state.restraintProgress > 0 && state.restraintProgress < 1
    ? `${Math.round(state.restraintProgress * 100)}%`
    : state.restraintProved ? 'LOCKED / PROVED' : state.restraints ? 'CLOSING' : 'OPEN';
  setControlState(controls.restraints, state.restraints, restraintLabel);
  setControlState(controls.platformClear, state.platformClear, state.platformClear ? 'CLEAR' : 'NOT CLEAR');
  setControlState(controls.drive, state.drive, state.drive ? 'ENABLED' : 'DISABLED');
  setControlState(controls.water, state.water, state.water ? 'ARMED' : 'DISABLED');
  setControlState(controls.gondolaBrake, state.gondolaBrake, state.gondolaBrake ? 'APPLIED' : 'RELEASED');
  setControlState(controls.armLock, state.armLock, state.armLock ? 'ENGAGED' : 'RELEASED');
  setControlState(controls.cycleStop, state.cycleStopRequested, state.cycleStopRequested ? 'RETURN REQUESTED' : 'SEQUENCE STOP');

  dispatch.classList.toggle('ready', controller.canDispatch);
  q('#estop').classList.toggle('latched', state.estop);
  q('#program').disabled = moving;
  qa('#arm-forward,#arm-reverse,#arm-lock,#gondola-brake').forEach(element => {
    element.classList.toggle('inhibited', state.program !== 'manual' || state.mode !== STATES.RUNNING);
  });
  q('[data-status="entrance"]').textContent = state.rideOpen ? 'OPEN' : 'CLOSED';

  seatLamps.forEach((lamp, index) => {
    const occupied = index < state.onboard;
    lamp.classList.toggle('occupied', occupied);
    lamp.classList.toggle('moving', occupied && state.restraintProgress > 0 && state.restraintProgress < 1);
    lamp.classList.toggle('proved', occupied && state.restraintProved);
  });

  if (message) {
    q('#message-display p').textContent = message;
    toast(message, type);
  }
}

function renderTelemetry(state) {
  q('#state-label').lastChild.textContent = ` ${state.mode}`;
  q('#score').textContent = state.score.toLocaleString('en-GB');
  const liveLamps = { ...controller.safetyCircuits, fault: state.fault };
  Object.entries(liveLamps).forEach(([name, active]) => {
    q(`[data-lamp="${name}"]`)?.classList.toggle('on', Boolean(active));
  });
  dispatch.classList.toggle('ready', controller.canDispatch);
  if (state.restraintProgress > 0 && state.restraintProgress < 1) {
    q('#restraints small').textContent = `${Math.round(state.restraintProgress * 100)}%`;
  } else {
    q('#restraints small').textContent = state.restraintProved ? 'LOCKED / PROVED' : state.restraints ? 'CLOSING' : 'OPEN';
  }
  qa('[data-telemetry="queue"]').forEach(element => { element.textContent = state.queue; });
  qa('[data-telemetry="onboard"]').forEach(element => { element.textContent = state.onboard; });
  q('[data-telemetry="served"]').textContent = state.guestsServed;
  q('[data-telemetry="cycles"]').textContent = state.cycles;
  q('[data-telemetry="throughput"]').textContent = state.throughput;
  q('[data-telemetry="arm"]').textContent = state.arm.toFixed(1);
  q('[data-telemetry="rpm"]').textContent = Math.abs(state.rpm).toFixed(1);
  q('[data-telemetry="time"]').textContent = `${String(Math.floor(state.cycleElapsed / 60)).padStart(2, '0')}:${String(Math.floor(state.cycleElapsed % 60)).padStart(2, '0')}`;
  q('[data-telemetry="gforce"]').textContent = state.currentG.toFixed(1);
  q('[data-telemetry="happiness"]').textContent = Math.round(state.happiness);
  Object.entries(state.achievements).forEach(([name, complete]) => {
    q(`[data-challenge="${name}"]`)?.classList.toggle('complete', complete);
  });

  seatLamps.forEach((lamp, index) => {
    const occupied = index < state.onboard;
    lamp.classList.toggle('occupied', occupied);
    lamp.classList.toggle('moving', occupied && state.restraintProgress > 0 && state.restraintProgress < 1);
    lamp.classList.toggle('proved', occupied && state.restraintProved);
  });
}

function toast(message, type) {
  const element = document.createElement('div');
  element.className = `toast ${type === 'error' ? 'error' : ''}`;
  element.textContent = message;
  q('#toast-region').append(element);
  setTimeout(() => element.remove(), 3600);
}

controller.addEventListener('change', event => {
  renderState(event.detail.state, event.detail.message, event.detail.type);
  renderTelemetry(event.detail.state);
});

controller.addEventListener('tick', event => {
  renderTelemetry(event.detail);
});

buildSeatMap();
initialiseScene();
renderState(controller.snapshot(), 'Turn the control key to begin opening checks.');
renderTelemetry(controller.snapshot());

let previousFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - previousFrame) / 1000);
  previousFrame = now;
  controller.tick(dt);
  scene?.update(controller.snapshot(), dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

setInterval(() => {
  q('#clock').textContent = new Date().toLocaleTimeString('en-GB');
}, 1000);

q('#help-button').addEventListener('click', () => q('#help-dialog').showModal());
q('#help-close').addEventListener('click', () => q('#help-dialog').close());
