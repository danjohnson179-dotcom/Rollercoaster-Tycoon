import { RideController, STATES } from './state-machine.js';
import { click, alarm, updateRideAudio } from '../services/audio.js';
import { applySettings } from '../core/settings.js';

applySettings();

const q = selector => document.querySelector(selector);
const qa = selector => [...document.querySelectorAll(selector)];
const clampGauge = value => Math.round(Math.min(1, Math.max(0, value)) * 100);
const controller = new RideController();
const loader = q('#sim-loader');
const seatLamps = [];
const seatLoadOrder = [];
for (let offset = 0; offset <= 9; offset += 1) {
  const candidates = offset === 0
    ? [9, 28]
    : [9 - offset, 28 - offset, 9 + offset, 28 + offset];
  seatLoadOrder.push(...candidates.filter(index => index >= 0 && index < 38));
}
const seatLoadRank = Array(38).fill(99);
seatLoadOrder.forEach((seatIndex, rank) => { seatLoadRank[seatIndex] = rank; });
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
controls.armLock.addEventListener('click', () => controller.toggleArmLock());
controls.cycleStop.addEventListener('click', () => controller.requestCycleStop());
q('#admit-batch').addEventListener('click', () => controller.admitNextBatch());
q('#program').addEventListener('change', event => controller.setProgram(event.target.value));
q('#arm-speed').addEventListener('change', event => controller.setArmSpeed(event.target.value));
qa('[data-brake-mode]').forEach(button => {
  button.addEventListener('click', () => controller.setBrakeMode(button.dataset.brakeMode, true));
});
q('#water-pattern').addEventListener('change', event => controller.setWaterMode(event.target.value));
q('#water-height').addEventListener('change', event => controller.setWaterHeight(Number(event.target.value) / 100));
q('#water-height').addEventListener('input', event => {
  q('[data-telemetry="water-height"]').textContent = event.target.value;
});
qa('[data-water-zone]').forEach(button => {
  button.addEventListener('click', () => controller.toggleWaterZone(button.dataset.waterZone));
});
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

function selectConsolePage(page) {
  const consoleElement = q('.console');
  const changed = consoleElement.dataset.activePanel !== page;
  consoleElement.dataset.activePanel = page;
  qa('[data-console-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.consoleTab === page);
  });
  if (changed) consoleElement.scrollTo({ top: 0, behavior: 'smooth' });
}

qa('[data-console-tab]').forEach(button => {
  button.addEventListener('click', () => selectConsolePage(button.dataset.consoleTab));
});
selectConsolePage('operate');

q('#operation-mode').addEventListener('change', event => {
  const accepted = controller.setTestMode(event.target.value === 'test');
  if (!accepted) event.target.value = controller.state.testMode ? 'test' : 'public';
});
q('#demand-mode').addEventListener('change', event => controller.setDemandMode(event.target.value));
q('#fault-rate').addEventListener('change', event => controller.setFaultRate(event.target.value));
q('#call-mechanic').addEventListener('click', () => controller.callMechanic());
q('#diagnose').addEventListener('click', () => controller.diagnoseFault(q('#diagnosis-system').value));
q('#inject-fault').addEventListener('click', () => controller.injectFault(q('#fault-inject').value));

function keyboardAction(key) {
  switch (key) {
    case 'k': return controller.togglePower();
    case 'o': return controller.toggleRideOpen();
    case 'g': return controller.toggleLoadGate();
    case 'a': return controller.admitNextBatch();
    case 'r': return controller.toggleRestraints();
    case 'c': return controller.confirmPlatform();
    case 'd': return controller.toggleDrive();
    case 'l': return controller.toggleArmLock();
    case 's': return controller.requestCycleStop();
    case 'w': return controller.toggleWater();
    case 'z': selectConsolePage('motion'); return controller.setBrakeMode('RELEASED', true);
    case 'x': selectConsolePage('motion'); return controller.setBrakeMode('HALF', true);
    case 'b': selectConsolePage('motion'); return controller.setBrakeMode('FULL', true);
    case '[': {
      const next = Math.max(0, controller.state.waterHeightSetpoint - 0.1);
      q('#water-height').value = Math.round(next * 100);
      return controller.setWaterHeight(next);
    }
    case ']': {
      const next = Math.min(1, controller.state.waterHeightSetpoint + 0.1);
      q('#water-height').value = Math.round(next * 100);
      return controller.setWaterHeight(next);
    }
    case 'p': {
      const patterns = ['CURTAIN', 'CHASE', 'ALTERNATE', 'PULSE', 'AUTO'];
      const next = patterns[(patterns.indexOf(controller.state.waterMode) + 1) % patterns.length];
      q('#water-pattern').value = next;
      return controller.setWaterMode(next);
    }
    case 'e': alarm(); return controller.emergencyStop();
    case 'f': return controller.resetFault();
    case 'm': selectConsolePage('maintenance'); return controller.callMechanic();
    case 't': return controller.setTestMode(!controller.state.testMode);
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
  const controlled = [' ', 'arrowleft', 'arrowright', 'k', 'o', 'g', 'a', 'r', 'c', 'd', 'z', 'x', 'b', 'l', 's', 'w', '[', ']', 'p', 'e', 'f', 'm', 't', '1', '2', '3', '4', 'v'];
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
  controller.setBrakeMode('FULL', false);
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
  document.body.classList.toggle('state-running', moving);
  document.body.classList.toggle('state-fault', state.fault);
  document.body.classList.toggle('state-idle', !moving && !state.fault);
  q('#state-label').lastChild.textContent = ` ${state.mode}`;
  q('#score').textContent = state.score.toLocaleString('en-GB');

  const lamps = {
    ...controller.safetyCircuits,
    fault: state.fault,
    test: state.testMode,
    loadReady: state.safeAtLoad
  };
  Object.entries(lamps).forEach(([name, active]) => {
    qa(`[data-lamp="${name}"]`).forEach(lamp => lamp.classList.toggle('on', Boolean(active)));
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
  setControlState(controls.water, state.waterMaster, state.waterMaster ? 'RUNNING' : 'STOPPED');
  setControlState(controls.armLock, state.armLock, state.armLock ? 'ENGAGED' : 'RELEASED');
  setControlState(controls.cycleStop, state.cycleStopRequested, state.cycleStopRequested ? state.returnStage : 'PRESS ONCE — AUTOMATIC PARK');
  qa('[data-brake-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.brakeMode === state.brakeMode);
  });
  qa('[data-water-zone]').forEach(button => {
    button.classList.toggle('active', Boolean(state.waterZones?.[button.dataset.waterZone]));
  });

  q('#operation-mode').value = state.testMode ? 'test' : 'public';
  q('#demand-mode').value = state.demandMode;
  q('#fault-rate').value = state.faultRate;
  q('#operation-permit-note').innerHTML = state.testMode
    ? '<strong>EMPTY TEST</strong> Public entry is isolated. An empty gondola may be dispatched after safety proving.'
    : '<strong>PUBLIC</strong> Guests arrive gradually only while the queue entrance is open.';
  controls.rideOpen.disabled = state.testMode;
  q('#demand-mode').disabled = state.testMode;
  q('#operation-mode').disabled = moving || state.onboard > 0 || state.boardingCount > 0 || state.loadGate;
  q('#admit-batch').disabled = state.testMode || !state.loadGate || !state.safeAtLoad
    || state.needsUnload || state.unloadingCount > 0 || state.boardingCount > 0
    || state.loadBatchCommitted || state.queue <= 0 || state.onboard >= 38;
  q('#inject-fault').disabled = !state.testMode || !state.power || state.fault;
  q('#call-mechanic').disabled = !state.faultCode || state.faultCode === 'estop' || state.mechanicStatus !== 'CALL REQUIRED';
  q('#diagnose').disabled = state.mechanicStatus !== 'ON SITE';
  q('#diagnosis-system').disabled = state.mechanicStatus !== 'ON SITE';
  q('[data-console-tab="maintenance"]').classList.toggle('alarm', state.fault);
  q('#fault-display').classList.toggle('active', state.fault);
  if (state.fault && type === 'error') {
    selectConsolePage('maintenance');
    q('.console').scrollTo({ top: 0, behavior: 'smooth' });
  }

  dispatch.classList.toggle('ready', controller.canDispatch);
  q('#estop').classList.toggle('latched', state.estop);
  q('#program').disabled = moving;
  q('#arm-speed').disabled = moving;
  q('#water-pattern').value = state.waterMode;
  q('#water-pattern').disabled = !state.power;
  q('#water-height').disabled = !state.power;
  qa('[data-water-zone]').forEach(element => { element.disabled = !state.power; });
  qa('#arm-forward,#arm-reverse,#arm-lock,[data-brake-mode]').forEach(element => {
    element.classList.toggle('inhibited', state.program !== 'manual' || state.mode !== STATES.RUNNING);
  });
  qa('[data-brake-mode]').forEach(element => {
    element.disabled = element.dataset.brakeMode !== 'FULL'
      && (state.program !== 'manual' || state.mode !== STATES.RUNNING);
  });
  q('[data-status="entrance"]').textContent = state.rideOpen ? 'OPEN' : 'CLOSED';

  seatLamps.forEach((lamp, index) => {
    const occupied = seatLoadRank[index] < state.onboard;
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
  const liveLamps = {
    ...controller.safetyCircuits,
    fault: state.fault,
    test: state.testMode,
    loadReady: state.safeAtLoad
  };
  Object.entries(liveLamps).forEach(([name, active]) => {
    qa(`[data-lamp="${name}"]`).forEach(lamp => lamp.classList.toggle('on', Boolean(active)));
  });
  dispatch.classList.toggle('ready', controller.canDispatch);
  q('#admit-batch').disabled = state.testMode || !state.loadGate || !state.safeAtLoad
    || state.needsUnload || state.unloadingCount > 0 || state.boardingCount > 0
    || state.loadBatchCommitted || state.loadBatchRemaining > 0 || state.queue <= 0 || state.onboard >= 38;
  qa('[data-brake-mode]').forEach(button => {
    button.classList.toggle('active', button.dataset.brakeMode === state.brakeMode);
  });
  setControlState(controls.cycleStop, state.cycleStopRequested,
    state.cycleStopRequested ? state.returnStage : 'PRESS ONCE — AUTOMATIC PARK');
  if (state.restraintProgress > 0 && state.restraintProgress < 1) {
    q('#restraints small').textContent = `${Math.round(state.restraintProgress * 100)}%`;
  } else {
    q('#restraints small').textContent = state.restraintProved ? 'LOCKED / PROVED' : state.restraints ? 'CLOSING' : 'OPEN';
  }
  qa('[data-telemetry="queue"]').forEach(element => { element.textContent = state.queue; });
  q('[data-telemetry="boarding"]').textContent = state.boardingCount;
  qa('[data-telemetry="onboard"]').forEach(element => { element.textContent = state.onboard; });
  q('[data-telemetry="served"]').textContent = state.guestsServed;
  q('[data-telemetry="cycles"]').textContent = state.cycles;
  q('[data-telemetry="throughput"]').textContent = state.throughput;
  q('[data-telemetry="arm"]').textContent = state.arm.toFixed(1);
  q('[data-telemetry="rpm"]').textContent = Math.abs(state.rpm).toFixed(1);
  q('[data-telemetry="relative"]').textContent = state.relativeGondolaAngle.toFixed(0);
  q('[data-telemetry="brake"]').textContent = Math.round(state.brakePressure * 100);
  q('[data-telemetry="arm-console"]').textContent = state.arm.toFixed(1);
  q('[data-telemetry="rpm-console"]').textContent = Math.abs(state.rpm).toFixed(1);
  q('[data-telemetry="relative-console"]').textContent = state.relativeGondolaAngle.toFixed(0);
  q('[data-telemetry="brake-console"]').textContent = Math.round(state.brakePressure * 100);
  q('[data-telemetry="relative-rpm"]').textContent = Math.abs(state.relativeRpm).toFixed(1);
  q('[data-telemetry="brake-temp"]').textContent = Math.round(state.brakeTemperature);
  q('[data-telemetry="phase"]').textContent = state.pendulumPhase;
  q('[data-telemetry="flips"]').textContent = state.continuousInversions;
  q('[data-telemetry="time"]').textContent = `${String(Math.floor(state.cycleElapsed / 60)).padStart(2, '0')}:${String(Math.floor(state.cycleElapsed % 60)).padStart(2, '0')}`;
  q('[data-telemetry="gforce"]').textContent = state.currentG.toFixed(1);
  q('[data-telemetry="happiness"]').textContent = Math.round(state.happiness);
  q('[data-telemetry="demand-level"]').textContent = state.demandLevel;
  q('[data-telemetry="next-arrival"]').textContent = state.rideOpen ? `${Math.ceil(state.nextArrival)}s` : '--';
  q('[data-telemetry="next-wave"]').textContent = state.rideOpen && state.demandMode === 'dynamic' ? `${Math.ceil(state.nextWaveIn)}s` : state.demandMode === 'dynamic' ? '--' : 'FIXED';
  q('[data-telemetry="guest-phase"]').textContent = state.guestPhase;
  q('[data-telemetry="batch-remaining"]').textContent = state.loadBatchRemaining;
  q('[data-telemetry="batch-target"]').textContent = state.loadBatchTarget;
  q('[data-telemetry="platform-guests"]').textContent = state.platformGuests;
  q('[data-telemetry="unloading"]').textContent = state.unloadingCount;
  q('[data-telemetry="return-stage"]')?.replaceChildren(state.returnStage);
  q('[data-telemetry="return-stage-compact"]').textContent = state.returnStage;
  q('[data-telemetry="brake-mode"]').textContent = state.brakeMode;
  q('[data-telemetry="water-height"]').textContent = Math.round(state.waterHeightSetpoint * 100);
  q('[data-telemetry="water-pressure"]').textContent = Math.round(state.waterPumpPressure * 100);
  q('#brake-pressure-fill').style.width = `${Math.round(state.brakePressure * 100)}%`;
  if (document.activeElement !== q('#water-height')) q('#water-height').value = Math.round(state.waterHeightSetpoint * 100);
  q('[data-gauge="arm"]').style.setProperty('--gauge', `${clampGauge(Math.abs(state.arm) / 180)}%`);
  q('[data-gauge="speed"]').style.setProperty('--gauge', `${clampGauge(Math.abs(state.rpm) / 28)}%`);
  q('[data-gauge="relative"]').style.setProperty('--gauge', `${clampGauge(Math.abs(state.relativeGondolaAngle) / 180)}%`);
  q('[data-gauge="brake"]').style.setProperty('--gauge', `${Math.round(state.brakePressure * 100)}%`);
  q('[data-telemetry="fault-name"]').textContent = state.faultName || 'All monitored systems normal';
  q('[data-telemetry="fault-severity"]').textContent = state.fault ? `${state.faultSeverity} / ${String(state.faultCode).toUpperCase()}` : 'SYSTEM AVAILABLE';
  q('#fault-display > span').textContent = state.fault ? 'LATCHED FAULT' : 'NO ACTIVE FAULT';
  q('[data-telemetry="mechanic-status"]').textContent = state.mechanicStatus;
  q('[data-telemetry="mechanic-eta"]').textContent = state.mechanicStatus === 'EN ROUTE' ? `${Math.ceil(state.mechanicETA)}s` : '--';
  q('[data-telemetry="repair-progress"]').textContent = `${Math.round(state.repairProgress * 100)}%`;
  q('#repair-bar').style.width = `${Math.round(state.repairProgress * 100)}%`;
  q('[data-telemetry="next-fault"]').textContent = Number.isFinite(state.nextFaultIn) && state.power ? `${Math.ceil(state.nextFaultIn)}s` : '--';

  Object.entries(state.achievements).forEach(([name, complete]) => {
    q(`[data-challenge="${name}"]`)?.classList.toggle('complete', complete);
  });

  const coach = q('#manual-coach');
  if (state.mode === STATES.RUNNING && state.program === 'manual') {
    if (state.brakeTemperature > 175) {
      coach.textContent = 'Manual coach: brake temperature is high. Release the paddle and allow the disc to cool before the next capture.';
    } else if (state.brakeMode === 'FULL') {
      coach.textContent = 'FULL brake is capturing the gondola to the arms. Select RELEASED before the crest to preserve swing energy.';
    } else if (state.brakeMode === 'HALF') {
      coach.textContent = 'HALF brake is trimming relative speed without locking. Use it to calm an over-energetic swing or shape the next inversion.';
    } else if (state.pendulumPhase === 'BOTTOM' && Math.abs(state.relativeRpm) > 7) {
      coach.textContent = 'Manual coach: high speed through the bottom — reverse arm direction now, or use a short brake capture to add energy.';
    } else if (state.pendulumPhase === 'INVERTED') {
      coach.textContent = 'Manual coach: gondola inverted. Keep the brake released for continuous flips; capture only when you want to lock the pose.';
    } else {
      coach.textContent = 'Manual coach: keep driving the arms and let the free gondola swing. Brake timing, not a powered gondola motor, creates the flips.';
    }
  } else {
    coach.textContent = 'Manual coach: lock the gondola to the moving arms, then release the brake to convert arm movement into free swing.';
  }

  seatLamps.forEach((lamp, index) => {
    const occupied = seatLoadRank[index] < state.onboard;
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

setInterval(() => {
  q('#clock').textContent = new Date().toLocaleTimeString('en-GB');
}, 1000);

q('#help-button').addEventListener('click', () => q('#help-dialog').showModal());
q('#help-close').addEventListener('click', () => q('#help-dialog').close());
