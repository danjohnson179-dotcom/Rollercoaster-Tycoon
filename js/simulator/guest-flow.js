const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const DEMAND_PROFILES = Object.freeze({
  quiet: { label: 'QUIET', guestsPerMinute: 5, minParty: 1, maxParty: 2 },
  steady: { label: 'STEADY', guestsPerMinute: 10, minParty: 1, maxParty: 3 },
  busy: { label: 'BUSY', guestsPerMinute: 17, minParty: 2, maxParty: 4 },
  surge: { label: 'SURGE', guestsPerMinute: 26, minParty: 2, maxParty: 6 }
});

/** Explicit guest lifecycle: park arrival -> queue -> admitted batch -> walking -> seated -> unloading. */
export class GuestFlow {
  constructor(random, capacity = 38) {
    this.random = random;
    this.capacity = capacity;
    this.currentDemand = 'quiet';
    this.arrivalTimer = 4;
    this.waveTimer = 34;
    this.boardingSchedule = [];
    this.walkingToSeats = [];
    this.unloadingSchedule = [];
    this.walkingToExit = [];
    this.lastNeedsUnload = false;
  }

  initialiseState(state) {
    Object.assign(state, {
      guestPhase: 'QUEUE CLOSED',
      loadBatchTarget: 0,
      loadBatchRemaining: 0,
      loadBatchCommitted: false,
      unloadingCount: 0,
      platformGuests: 0,
      totalArrivals: state.totalArrivals || 0
    });
  }

  onEntranceOpened(state) {
    this.currentDemand = state.demandMode === 'dynamic' ? 'quiet' : state.demandMode;
    this.arrivalTimer = 3.2 + this.random() * 4.8;
    this.waveTimer = 30 + this.random() * 38;
    state.guestPhase = state.queue ? 'QUEUE FORMING' : 'AWAITING ARRIVALS';
  }

  setDemandMode(state, mode) {
    if (mode !== 'dynamic' && !DEMAND_PROFILES[mode]) return false;
    state.demandMode = mode;
    if (mode !== 'dynamic') this.currentDemand = mode;
    this.waveTimer = 28 + this.random() * 40;
    return true;
  }

  advanceWave(state) {
    if (state.demandMode !== 'dynamic') {
      this.currentDemand = state.demandMode;
      this.waveTimer = 45 + this.random() * 35;
      return;
    }
    const transitions = {
      quiet: ['quiet', 'steady', 'steady', 'busy'],
      steady: ['quiet', 'steady', 'busy', 'busy', 'surge'],
      busy: ['steady', 'busy', 'busy', 'surge'],
      surge: ['busy', 'busy', 'steady']
    };
    const options = transitions[this.currentDemand] || transitions.quiet;
    this.currentDemand = options[Math.floor(this.random() * options.length)];
    this.waveTimer = 34 + this.random() * 52;
  }

  requestLoad(state, safeAtLoad) {
    if (state.testMode) return { ok: false, message: 'Guest admission is isolated in EMPTY TEST.' };
    if (!state.loadGate || !safeAtLoad) return { ok: false, message: 'Open the load gate with the ride proved at load position.' };
    if (state.needsUnload || state.unloadingCount > 0) return { ok: false, message: 'Complete unloading before admitting the next group.' };
    if (state.loadBatchCommitted) return { ok: false, message: 'This cycle already has a committed load. Late arrivals remain queued for the next cycle.' };
    if (state.boardingCount > 0 || this.boardingSchedule.length > 0) return { ok: false, message: 'The admitted group is still boarding.' };
    const availableSeats = this.capacity - state.onboard;
    const batchSize = Math.min(state.queue, availableSeats);
    if (batchSize <= 0) return { ok: false, message: state.queue ? 'The gondola is already at capacity.' : 'No guests are waiting at the batch gate.' };

    this.boardingSchedule = Array.from({ length: batchSize }, (_, index) => ({
      delay: index * 0.16,
      duration: 3.05 + (index % 5) * 0.09
    }));
    state.loadBatchTarget = batchSize;
    state.loadBatchRemaining = batchSize;
    state.loadBatchCommitted = true;
    state.guestPhase = 'BATCH ADMITTED';
    return { ok: true, batchSize };
  }

  startUnloading(state) {
    if (!state.needsUnload || state.onboard <= 0 || this.unloadingSchedule.length || this.walkingToExit.length) return;
    const count = state.onboard;
    this.unloadingSchedule = Array.from({ length: count }, (_, index) => ({
      delay: index * 0.13,
      duration: 2.65 + (index % 4) * 0.09
    }));
    state.guestPhase = 'UNLOADING';
  }

  tickArrivals(state, dt) {
    if (!state.rideOpen || state.testMode) {
      state.demandLevel = state.testMode ? 'ISOLATED' : 'CLOSED';
      state.demandRate = 0;
      state.nextArrival = 0;
      state.nextWaveIn = 0;
      if (!state.loadGate && state.onboard === 0) state.guestPhase = state.testMode ? 'EMPTY TEST' : 'QUEUE CLOSED';
      return;
    }

    state.parkElapsed += dt;
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) this.advanceWave(state);
    const profile = DEMAND_PROFILES[this.currentDemand] || DEMAND_PROFILES.quiet;
    state.demandLevel = profile.label;
    state.demandRate = profile.guestsPerMinute;
    state.nextWaveIn = Math.max(0, this.waveTimer);

    this.arrivalTimer -= dt;
    if (this.arrivalTimer <= 0 && state.queue < 96) {
      const spread = profile.maxParty - profile.minParty + 1;
      const partySize = profile.minParty + Math.floor(this.random() * spread);
      const admitted = Math.min(partySize, 96 - state.queue);
      state.queue += admitted;
      state.totalArrivals += admitted;
      const partyMean = (profile.minParty + profile.maxParty) / 2;
      const partiesPerMinute = profile.guestsPerMinute / partyMean;
      const baseInterval = 60 / partiesPerMinute;
      this.arrivalTimer = baseInterval * (0.7 + this.random() * 0.65);
      if (state.guestPhase === 'AWAITING ARRIVALS' || state.guestPhase === 'QUEUE CLOSED') state.guestPhase = 'QUEUE FORMING';
    }
    state.nextArrival = Math.max(0, this.arrivalTimer);
  }

  tickBoarding(state, dt) {
    for (let index = this.boardingSchedule.length - 1; index >= 0; index -= 1) {
      const guest = this.boardingSchedule[index];
      guest.delay -= dt;
      if (guest.delay <= 0) {
        this.boardingSchedule.splice(index, 1);
        if (state.queue <= 0 || state.onboard + this.walkingToSeats.length >= this.capacity) continue;
        state.queue -= 1;
        state.boardingStarted += 1;
        state.loadBatchRemaining = Math.max(0, state.loadBatchRemaining - 1);
        this.walkingToSeats.push({ remaining: guest.duration });
      }
    }

    for (let index = this.walkingToSeats.length - 1; index >= 0; index -= 1) {
      const guest = this.walkingToSeats[index];
      guest.remaining -= dt;
      if (guest.remaining <= 0) {
        this.walkingToSeats.splice(index, 1);
        state.onboard += 1;
        state.score += 2;
      }
    }
    state.boardingCount = this.walkingToSeats.length;
    state.platformGuests = state.boardingCount + state.unloadingCount;

    if (state.loadBatchTarget > 0 && state.loadBatchRemaining === 0 && state.boardingCount === 0) {
      state.guestPhase = 'LOAD COMPLETE';
      state.loadBatchTarget = 0;
    } else if (state.boardingCount > 0 || this.boardingSchedule.length > 0) {
      state.guestPhase = 'BOARDING';
    }
  }

  tickUnloading(state, dt) {
    for (let index = this.unloadingSchedule.length - 1; index >= 0; index -= 1) {
      const guest = this.unloadingSchedule[index];
      guest.delay -= dt;
      if (guest.delay <= 0) {
        this.unloadingSchedule.splice(index, 1);
        if (state.onboard <= 0) continue;
        state.onboard -= 1;
        this.walkingToExit.push({ remaining: guest.duration });
      }
    }

    for (let index = this.walkingToExit.length - 1; index >= 0; index -= 1) {
      const guest = this.walkingToExit[index];
      guest.remaining -= dt;
      if (guest.remaining <= 0) {
        this.walkingToExit.splice(index, 1);
        state.guestsServed += 1;
        state.achievements.served500 ||= state.guestsServed >= 500;
        state.score += Math.round(18 + state.happiness * 0.32);
      }
    }
    state.unloadingCount = this.unloadingSchedule.length + this.walkingToExit.length;
    state.platformGuests = state.boardingCount + state.unloadingCount;

    if (state.needsUnload && state.onboard === 0 && state.unloadingCount === 0) {
      state.needsUnload = false;
      state.loadBatchCommitted = false;
      state.guestPhase = state.queue > 0 ? 'READY FOR NEXT BATCH' : 'AWAITING ARRIVALS';
    }
  }

  tick(state, dt, safeAtLoad) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const safeDt = clamp(dt, 0, 0.1);
    this.tickArrivals(state, safeDt);

    if (state.loadGate && safeAtLoad) {
      if (state.needsUnload) this.startUnloading(state);
      this.tickUnloading(state, safeDt);
      if (!state.needsUnload) this.tickBoarding(state, safeDt);
    } else {
      // Guests already walking finish their movement; no new platform transfer starts.
      this.tickBoarding(state, safeDt);
      this.tickUnloading(state, safeDt);
    }
  }

  get gateTransferActive() {
    return this.boardingSchedule.length > 0
      || this.walkingToSeats.length > 0
      || this.unloadingSchedule.length > 0
      || this.walkingToExit.length > 0;
  }
}
