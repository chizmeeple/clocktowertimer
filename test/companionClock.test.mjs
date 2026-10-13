import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readCompanionCountdown } from '../js/companionClock.js';
import { projectCompanionState } from '../js/companionState.js';
import { displaySeconds } from '../js/timerEngine.js';

function countdown(snapshot, times = {}) {
  return readCompanionCountdown({
    snapshot,
    referenceTime: 10_000,
    now: 10_000,
    offsetMs: 0,
    ...times,
  });
}

function runningDay(remainingMs, rate = 1) {
  return projectCompanionState({
    game: { currentDay: 3, phase: '', awaitingFirstDay: false },
    timer: {
      remainingMs,
      running: true,
      reset: false,
      active: true,
      kind: 'day',
      rate,
    },
    playerCount: 10,
    travellerCount: 1,
  });
}

describe('companion countdown', () => {
  it('advances a normal countdown by elapsed real time', () => {
    const shown = countdown(runningDay(10_000), { now: 12_500 });
    assert.equal(shown.remainingMs, 7500);
    assert.equal(shown.displaySeconds, displaySeconds(7.5));
    assert.equal(shown.displaySeconds, 8);
    assert.equal(shown.locallyComplete, false);
    assert.equal(shown.confirmedComplete, false);
  });

  it('holds a paused, ready, idle, or finished countdown', () => {
    const paused = projectCompanionState({
      game: { currentDay: 2, phase: '', awaitingFirstDay: false },
      timer: {
        remainingMs: 4500,
        running: false,
        reset: false,
        active: false,
        kind: null,
        rate: 0,
      },
      playerCount: 8,
      travellerCount: 0,
    });
    const ready = projectCompanionState({
      game: { currentDay: 2, phase: '', awaitingFirstDay: false },
      timer: {
        remainingMs: 285000,
        running: false,
        reset: true,
        active: false,
        kind: null,
        rate: 0,
      },
      playerCount: 8,
      travellerCount: 0,
    });
    const idle = projectCompanionState({
      game: { currentDay: 1, phase: '', awaitingFirstDay: false },
      timer: {
        remainingMs: 0,
        running: false,
        reset: false,
        active: false,
        kind: null,
        rate: 0,
      },
      playerCount: 5,
      travellerCount: 0,
    });
    const finished = projectCompanionState({
      game: { currentDay: 2, phase: 'dusk', awaitingFirstDay: false },
      timer: {
        remainingMs: 0,
        running: false,
        reset: false,
        active: false,
        kind: null,
        rate: 0,
      },
      playerCount: 5,
      travellerCount: 5,
    });

    assert.equal(paused.timer.status, 'paused');
    assert.deepEqual(countdown(paused, { now: 99_000 }), {
      remainingMs: 4500,
      displaySeconds: 5,
      locallyComplete: false,
      confirmedComplete: false,
    });
    assert.equal(countdown(ready, { now: 99_000 }).remainingMs, 285000);
    assert.equal(countdown(ready, { now: 99_000 }).displaySeconds, displaySeconds(285));
    assert.deepEqual(countdown(idle, { now: 99_000 }), {
      remainingMs: 0,
      displaySeconds: 0,
      locallyComplete: false,
      confirmedComplete: false,
    });
    assert.equal(finished.phase, 'night');
    assert.equal(finished.counts.traveller, 5);
    assert.deepEqual(countdown(finished, { now: 99_000 }), {
      remainingMs: 0,
      displaySeconds: 0,
      locallyComplete: false,
      confirmedComplete: true,
    });
  });

  it('applies an accelerated rate to elapsed real time', () => {
    const shown = countdown(runningDay(10_000, 40), { now: 10_100 });
    assert.equal(shown.remainingMs, 6000);
    assert.equal(shown.displaySeconds, 6);
    assert.equal(shown.locallyComplete, false);
  });

  it('matches the storyteller display around a second boundary', () => {
    const justUnder = countdown(runningDay(1001));
    const onTheSecond = countdown(runningDay(1000));
    assert.equal(justUnder.displaySeconds, 2);
    assert.equal(onTheSecond.displaySeconds, 1);
    assert.equal(justUnder.displaySeconds, displaySeconds(1.001));
    assert.equal(onTheSecond.displaySeconds, displaySeconds(1));
  });

  it('uses a supplied offset when the local clock disagrees', () => {
    const ahead = countdown(runningDay(10_000), {
      now: 15_000,
      offsetMs: -5000,
    });
    assert.equal(ahead.remainingMs, 10_000);

    const behind = countdown(runningDay(10_000), {
      now: 10_000,
      offsetMs: 2000,
    });
    assert.equal(behind.remainingMs, 8000);

    const accelerated = countdown(runningDay(10_000, 20), {
      now: 10_100,
      offsetMs: 50,
    });
    assert.equal(accelerated.remainingMs, 7000);
  });

  it('does not run the countdown backwards when the reference time is still ahead', () => {
    const shown = countdown(runningDay(10_000), { now: 9_000 });
    assert.equal(shown.remainingMs, 10_000);
    assert.equal(shown.locallyComplete, false);
  });

  it('clamps a local zero without treating it as a finished day', () => {
    const shown = countdown(runningDay(1000), { now: 12_500 });
    assert.equal(shown.remainingMs, 0);
    assert.equal(shown.displaySeconds, 0);
    assert.equal(shown.locallyComplete, true);
    assert.equal(shown.confirmedComplete, false);

    const alreadyZero = countdown(runningDay(0), { now: 10_000 });
    assert.equal(alreadyZero.locallyComplete, true);
    assert.equal(alreadyZero.confirmedComplete, false);
  });

  it('confirms completion only from a finished night snapshot', () => {
    const night = projectCompanionState({
      game: { currentDay: 3, phase: 'dusk', awaitingFirstDay: false },
      timer: {
        remainingMs: 0,
        running: false,
        reset: false,
        active: false,
        kind: null,
        rate: 0,
      },
      playerCount: 10,
      travellerCount: 0,
    });
    const shown = countdown(night, { now: 80_000 });
    assert.equal(shown.confirmedComplete, true);
    assert.equal(shown.locallyComplete, false);
    assert.equal(night.phase, 'night');
  });

  it('rejects a snapshot that is not protocol v1', () => {
    const snapshot = runningDay(1000);
    assert.throws(
      () => countdown({ ...snapshot, v: 2 }),
      /unsupported-version/
    );
    assert.throws(
      () => countdown({ ...snapshot, secret: true }),
      /unknown-field/
    );
    assert.throws(
      () => countdown(snapshot, { now: Number.NaN }),
      /finite numbers/
    );
  });
});
