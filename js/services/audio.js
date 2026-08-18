import { loadSettings } from '../core/settings.js';

let context;
let rideBed;
let brakeWasApplied = true;

function ctx() {
  return context || (context = new (window.AudioContext || window.webkitAudioContext)());
}

function outputGain(value) {
  const settings = loadSettings();
  return settings.audio ? value * (settings.volume ?? 0.55) : 0;
}

export function tone(frequency = 520, duration = 0.045, type = 'square', gain = 0.025) {
  if (!loadSettings().audio) return;
  try {
    const audio = ctx();
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(outputGain(gain), audio.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
    oscillator.connect(envelope).connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  } catch { /* Audio is an enhancement; simulator logic remains available. */ }
}

function createRideBed() {
  if (rideBed) return rideBed;
  const audio = ctx();
  const master = audio.createGain();
  const motor = audio.createOscillator();
  const motorGain = audio.createGain();
  const hydraulic = audio.createOscillator();
  const hydraulicGain = audio.createGain();
  const filter = audio.createBiquadFilter();
  motor.type = 'sawtooth';
  hydraulic.type = 'triangle';
  filter.type = 'lowpass';
  filter.frequency.value = 420;
  master.gain.value = 0;
  motorGain.gain.value = 0;
  hydraulicGain.gain.value = 0;
  motor.connect(motorGain).connect(filter);
  hydraulic.connect(hydraulicGain).connect(filter);
  filter.connect(master).connect(audio.destination);
  motor.start();
  hydraulic.start();
  rideBed = { audio, master, motor, motorGain, hydraulic, hydraulicGain };
  return rideBed;
}

export function updateRideAudio(state) {
  if (!context || context.state !== 'running') return;
  const bed = createRideBed();
  const now = bed.audio.currentTime;
  const settings = loadSettings();
  const moving = state.mode === 'CYCLE ACTIVE' || state.mode === 'RETURNING TO LOAD';
  const armSpeed = Math.abs(state.armVelocity || 0);
  const gondolaSpeed = Math.abs(state.gondolaVelocity || 0);
  const masterTarget = settings.audio && state.power ? (moving ? 0.065 : 0.012) * (settings.volume ?? 0.55) : 0;
  bed.master.gain.setTargetAtTime(masterTarget, now, 0.08);
  bed.motor.frequency.setTargetAtTime(48 + armSpeed * 1.7, now, 0.05);
  bed.motorGain.gain.setTargetAtTime(moving ? 0.22 + Math.min(0.28, armSpeed / 120) : 0.06, now, 0.08);
  bed.hydraulic.frequency.setTargetAtTime(76 + gondolaSpeed * 0.18, now, 0.06);
  bed.hydraulicGain.gain.setTargetAtTime(moving ? 0.11 + state.brakePressure * 0.12 : 0.025, now, 0.08);

  if (state.gondolaBrake && !brakeWasApplied && moving) tone(104, 0.16, 'sawtooth', 0.024);
  brakeWasApplied = state.gondolaBrake;
}

export const click = () => tone(420, 0.035, 'square', 0.018);
export const alarm = () => {
  tone(190, 0.18, 'sawtooth', 0.04);
  setTimeout(() => tone(150, 0.22, 'sawtooth', 0.04), 190);
};
