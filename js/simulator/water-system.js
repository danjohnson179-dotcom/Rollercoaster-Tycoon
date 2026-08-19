const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const approach = (value, target, amount) => value + clamp(target - value, -amount, amount);

export const WATER_MODES = Object.freeze(['CURTAIN', 'CHASE', 'ALTERNATE', 'PULSE', 'AUTO']);

export class WaterSystem {
  constructor(jetCount = 30) {
    this.jetCount = jetCount;
    this.phase = 0;
  }

  initialiseState(state) {
    Object.assign(state, {
      water: false,
      waterMaster: false,
      waterMode: 'CURTAIN',
      waterHeightSetpoint: 0.64,
      waterHeight: 0,
      waterPumpPressure: 0,
      waterZones: { left: true, centre: true, right: true },
      waterJets: Array(this.jetCount).fill(0)
    });
  }

  setMaster(state, active) {
    state.waterMaster = Boolean(active);
    state.water = state.waterMaster;
    return true;
  }

  setMode(state, mode) {
    if (!WATER_MODES.includes(mode)) return false;
    state.waterMode = mode;
    return true;
  }

  setHeight(state, value) {
    state.waterHeightSetpoint = clamp(Number(value) || 0, 0, 1);
    return true;
  }

  toggleZone(state, zone) {
    if (!Object.hasOwn(state.waterZones, zone)) return false;
    state.waterZones = { ...state.waterZones, [zone]: !state.waterZones[zone] };
    return true;
  }

  zoneEnabled(state, laneIndex) {
    const position = laneIndex / 14;
    if (position < 0.335) return state.waterZones.left;
    if (position > 0.665) return state.waterZones.right;
    return state.waterZones.centre;
  }

  patternLevel(state, laneIndex, bankIndex, running) {
    const x = laneIndex / 14;
    switch (state.waterMode) {
      case 'CHASE': {
        const head = (this.phase * 0.34) % 1.4 - 0.2;
        const distance = Math.min(Math.abs(x - head), Math.abs(x - (1.2 - head)));
        return clamp(1 - distance * 4.6, 0.08, 1);
      }
      case 'ALTERNATE':
        return (Math.floor(this.phase * 1.7) + bankIndex) % 2 ? 0.18 : 1;
      case 'PULSE':
        return 0.34 + (Math.sin(this.phase * 3.4 + laneIndex * 0.18) + 1) * 0.33;
      case 'AUTO': {
        if (!running) return 0;
        const nearBottom = 1 - clamp(Math.abs((((state.armAngle + 180) % 360 + 360) % 360) - 180) / 92, 0, 1);
        const sweep = 0.46 + Math.sin(this.phase * 2.2 + laneIndex * 0.34 + bankIndex * 1.7) * 0.24;
        return clamp(nearBottom * 0.72 + sweep, 0.12, 1);
      }
      case 'CURTAIN':
      default:
        return 1;
    }
  }

  tick(state, dt, running) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const safeDt = Math.min(dt, 0.1);
    this.phase += safeDt;
    const masterTarget = state.waterMaster ? 1 : 0;
    state.waterPumpPressure = approach(state.waterPumpPressure, masterTarget, safeDt * (state.waterMaster ? 0.74 : 1.8));
    state.waterHeight = approach(
      state.waterHeight,
      state.waterHeightSetpoint * state.waterPumpPressure,
      safeDt * 0.82
    );

    for (let index = 0; index < this.jetCount; index += 1) {
      const bankIndex = index >= 15 ? 1 : 0;
      const laneIndex = index % 15;
      const enabled = this.zoneEnabled(state, laneIndex);
      const pattern = enabled && state.waterMaster
        ? this.patternLevel(state, laneIndex, bankIndex, running)
        : 0;
      const target = pattern * state.waterHeight;
      state.waterJets[index] = approach(state.waterJets[index] || 0, target, safeDt * 2.6);
    }
    state.water = state.waterMaster;
  }
}
