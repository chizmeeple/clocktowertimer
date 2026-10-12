import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COUNTDOWN_REFRESH_MS,
  NORMAL_COUNTDOWN_MS_PER_REAL_MS,
  createTimerEngine,
  displaySeconds,
} from '../timerEngine.js';

function installClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance(ms) {
      current += ms;
    },
  };
}

function engineAt(start = 0) {
  const clock = installClock(start);
  const timer = createTimerEngine({ now: clock.now });
  return { clock, timer };
}

describe('displaySeconds', () => {
  it('keeps the current second until it has fully elapsed', () => {
    assert.equal(displaySeconds(0), 0);
    assert.equal(displaySeconds(-1), 0);
    assert.equal(displaySeconds(1), 1);
    assert.equal(displaySeconds(1.2), 2);
    assert.equal(displaySeconds(7.5), 8);
  });
});

describe('timer engine', () => {
  it('measures elapsed time from the clock, not from how often it is sampled', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(10);
    timer.setRunning(true);
    const started = timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    assert.equal(started.type, 'running');
    assert.equal(started.shown, 10);

    clock.advance(2500);
    const frame = timer.sample();
    assert.equal(frame.type, 'running');
    assert.equal(frame.shown, 8);
    assert.equal(timer.getTimeLeft(), 7.5);

    clock.advance(500);
    assert.equal(timer.sample().shown, 7);
  });

  it('does not move while the clock stands still', () => {
    const { timer } = engineAt();
    timer.setTimeLeft(10);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    assert.equal(timer.sample().shown, 10);
    assert.equal(timer.sample().shown, 10);
    assert.equal(timer.getTimeLeft(), 10);
  });

  it('preserves remaining time across pause and ignores the paused gap', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(10);
    timer.setRunning(true);
    timer.setHasReset(false);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);

    clock.advance(2500);
    timer.pause();

    assert.equal(timer.isRunning(), false);
    assert.equal(timer.isCountdownActive(), false);
    assert.equal(timer.getCountdownKind(), null);
    assert.equal(timer.hasReset(), false);
    assert.equal(timer.getTimeLeft(), 7.5);
    assert.equal(displaySeconds(timer.getTimeLeft()), 8);

    clock.advance(10000);
    assert.equal(timer.sample().type, 'idle');
    assert.equal(timer.getTimeLeft(), 7.5);

    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    clock.advance(500);
    const frame = timer.sample();
    assert.equal(frame.shown, 7);
    assert.equal(timer.getTimeLeft(), 7);
  });

  it('completes a day once when remaining time reaches zero', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(2);
    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);

    clock.advance(1999);
    assert.equal(timer.sample().type, 'running');

    clock.advance(1);
    const done = timer.sample();
    assert.deepEqual(done, {
      type: 'complete',
      kind: 'day',
      wasAccelerated: false,
    });
    assert.equal(timer.getTimeLeft(), 0);
    assert.equal(timer.isRunning(), false);
    assert.equal(timer.getCountdownKind(), null);
    assert.equal(timer.getCurrentInterval(), timer.getNormalInterval());

    clock.advance(5000);
    assert.equal(timer.sample().type, 'idle');
    assert.equal(timer.getTimeLeft(), 0);
  });

  it('completes just inside the remaining-time threshold and not just outside it', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(1);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);

    clock.advance(999.998);
    assert.equal(timer.sample().type, 'running');

    const later = engineAt();
    later.timer.setTimeLeft(1);
    later.timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    later.clock.advance(999.999);
    assert.equal(later.timer.sample().type, 'complete');
  });

  it('keeps a wake-up countdown distinct from a day countdown', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(6);
    timer.setRunning(false);
    const started = timer.continueAt(
      'wake-up',
      NORMAL_COUNTDOWN_MS_PER_REAL_MS
    );
    assert.equal(started.shown, 6);
    assert.equal(timer.getCountdownKind(), 'wake-up');
    assert.equal(timer.isRunning(), false);

    clock.advance(1000);
    assert.equal(timer.sample().shown, 5);
    assert.equal(timer.getCountdownKind(), 'wake-up');

    const accelerated = timer.accelerate(0);
    assert.equal(accelerated.type, 'ignored');
    assert.equal(timer.getCountdownKind(), 'wake-up');

    clock.advance(5000);
    assert.deepEqual(timer.sample(), {
      type: 'complete',
      kind: 'wake-up',
      wasAccelerated: false,
    });
    assert.equal(timer.sample().type, 'idle');
  });

  it('finishes an expired wake-up as a wake-up if a day start arrives late', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(6);
    timer.continueAt('wake-up', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    clock.advance(6000);

    const frame = timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    assert.equal(frame.type, 'complete');
    assert.equal(frame.kind, 'wake-up');
    assert.equal(timer.isCountdownActive(), false);
    assert.equal(timer.getTimeLeft(), 0);
  });

  it('accelerates from the settled remainder without counting the same time twice', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(100);
    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    clock.advance(1000);
    timer.sample();
    assert.equal(timer.getTimeLeft(), 99);

    const started = timer.accelerate(0);
    assert.equal(started.type, 'running');
    assert.equal(timer.getCountdownKind(), 'day');
    assert.equal(timer.getCurrentInterval(), COUNTDOWN_REFRESH_MS);

    clock.advance(1000);
    const frame = timer.sample();
    assert.equal(frame.type, 'running');
    assert.equal(frame.shown, 59);
    assert.equal(timer.getTimeLeft(), 59);
    assert.equal(frame.wasAccelerated, undefined);
  });

  it('reports accelerated completion once', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(5);
    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    timer.accelerate(0);

    clock.advance(249);
    assert.equal(timer.sample().type, 'running');

    clock.advance(1);
    const done = timer.sample();
    assert.deepEqual(done, {
      type: 'complete',
      kind: 'day',
      wasAccelerated: true,
    });
    assert.equal(timer.sample().type, 'idle');
  });

  it('ignores acceleration when the timer is paused or empty', () => {
    const { timer } = engineAt();
    timer.setTimeLeft(10);
    timer.setRunning(false);
    assert.equal(timer.accelerate(0).type, 'ignored');
    assert.equal(timer.getTimeLeft(), 10);

    timer.setRunning(true);
    timer.setTimeLeft(0);
    assert.equal(timer.accelerate(0).type, 'ignored');
    assert.equal(timer.getCountdownKind(), null);
  });

  it('can still finish a remainder that rounds below one millisecond', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(0.0004);
    const started = timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    assert.equal(started.type, 'running');

    clock.advance(1);
    assert.equal(timer.sample().type, 'complete');
  });

  it('drops a segment without treating the cleared time as a completion', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(6);
    timer.setRunning(true);
    timer.setHasReset(true);
    timer.continueAt('wake-up', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    timer.clearSegment();
    timer.setTimeLeft(0);
    timer.setRunning(false);
    timer.setHasReset(false);
    timer.setCurrentInterval(timer.getNormalInterval());

    clock.advance(6000);
    assert.equal(timer.sample().type, 'idle');
    assert.equal(timer.getTimeLeft(), 0);
    assert.equal(timer.isRunning(), false);
    assert.equal(timer.hasReset(), false);
    assert.equal(timer.getCountdownKind(), null);
  });

  it('does not resume an idle countdown that has no time left', () => {
    const { timer } = engineAt();
    timer.setTimeLeft(0);
    assert.equal(
      timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS).type,
      'idle'
    );
    assert.equal(timer.isCountdownActive(), false);
  });
});

function engineFacts(timer) {
  return {
    timeLeft: timer.getTimeLeft(),
    running: timer.isRunning(),
    reset: timer.hasReset(),
    active: timer.isCountdownActive(),
    kind: timer.getCountdownKind(),
    interval: timer.getCurrentInterval(),
  };
}

describe('timer snapshot', () => {
  it('describes an idle timer without a countdown', () => {
    const { timer } = engineAt();
    assert.deepEqual(timer.snapshot(), {
      remainingMs: 0,
      running: false,
      reset: false,
      active: false,
      kind: null,
      rate: 0,
    });
  });

  it('reads a running day from the injected clock', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(10);
    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);

    assert.deepEqual(timer.snapshot(), {
      remainingMs: 10000,
      running: true,
      reset: false,
      active: true,
      kind: 'day',
      rate: 1,
    });

    clock.advance(2500);
    const before = engineFacts(timer);
    assert.deepEqual(timer.snapshot(), {
      remainingMs: 7500,
      running: true,
      reset: false,
      active: true,
      kind: 'day',
      rate: 1,
    });
    assert.deepEqual(engineFacts(timer), before);
    assert.equal(timer.getTimeLeft(), 10);

    clock.advance(500);
    assert.equal(timer.snapshot().remainingMs, 7000);
    assert.equal(timer.sample().type, 'running');
    assert.equal(timer.sample().shown, 7);
  });

  it('keeps a paused remainder and a resumed segment distinct', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(10);
    timer.setRunning(true);
    timer.setHasReset(false);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    clock.advance(2500);
    timer.pause();

    assert.deepEqual(timer.snapshot(), {
      remainingMs: 7500,
      running: false,
      reset: false,
      active: false,
      kind: null,
      rate: 0,
    });

    clock.advance(10000);
    assert.equal(timer.snapshot().remainingMs, 7500);

    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    clock.advance(500);
    const shot = timer.snapshot();
    assert.equal(shot.remainingMs, 7000);
    assert.equal(shot.running, true);
    assert.equal(shot.active, true);
    assert.equal(shot.kind, 'day');
    assert.equal(shot.rate, 1);
    assert.equal(shot.reset, false);
  });

  it('records a reset day as time remaining with the reset flag set', () => {
    const { timer } = engineAt();
    timer.setTimeLeft(285);
    timer.setRunning(false);
    timer.setHasReset(true);
    assert.deepEqual(timer.snapshot(), {
      remainingMs: 285000,
      running: false,
      reset: true,
      active: false,
      kind: null,
      rate: 0,
    });
  });

  it('reads the accelerated rate without settling the segment', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(100);
    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    const started = timer.accelerate(0);
    assert.equal(started.type, 'running');

    const before = engineFacts(timer);
    const shot = timer.snapshot();
    // random 0 finishes across 60 ticks of 2 countdown seconds, so the
    // segment rate is 40 countdown milliseconds per real millisecond.
    assert.equal(shot.rate, 40);
    assert.equal(shot.kind, 'day');
    assert.equal(shot.running, true);
    assert.equal(shot.active, true);
    assert.equal(shot.remainingMs, 100000);
    assert.deepEqual(engineFacts(timer), before);

    clock.advance(1000);
    assert.equal(timer.snapshot().remainingMs, 60000);
    assert.equal(timer.getCurrentInterval(), COUNTDOWN_REFRESH_MS);
    assert.equal(engineFacts(timer).interval, COUNTDOWN_REFRESH_MS);
  });

  it('shows a completed countdown as idle once the segment has finished', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(2);
    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    clock.advance(2000);
    assert.equal(timer.sample().type, 'complete');

    assert.deepEqual(timer.snapshot(), {
      remainingMs: 0,
      running: false,
      reset: false,
      active: false,
      kind: null,
      rate: 0,
    });
    assert.equal(timer.sample().type, 'idle');
  });

  it('keeps a wake-up countdown on its own kind and leaves the running flag unset', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(6);
    timer.continueAt('wake-up', NORMAL_COUNTDOWN_MS_PER_REAL_MS);

    const shot = timer.snapshot();
    assert.equal(shot.kind, 'wake-up');
    assert.equal(shot.active, true);
    assert.equal(shot.running, false);
    assert.equal(shot.rate, 1);
    assert.equal(shot.remainingMs, 6000);

    clock.advance(1000);
    assert.equal(timer.snapshot().remainingMs, 5000);
    assert.equal(timer.snapshot().kind, 'wake-up');
    assert.equal(timer.getCountdownKind(), 'wake-up');
  });

  it('returns the same snapshot from repeated reads', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(8);
    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    clock.advance(1500);
    const first = timer.snapshot();
    const second = timer.snapshot();
    assert.deepEqual(second, first);
    assert.notEqual(second, first);
    second.remainingMs = 0;
    assert.equal(timer.snapshot().remainingMs, 6500);
  });

  it('reads the remainder beside a displayed-second boundary without completing', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(2);
    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    clock.advance(1000.4);

    const before = engineFacts(timer);
    const shot = timer.snapshot();
    assert.equal(shot.remainingMs, 999.6);
    assert.equal(shot.active, true);
    assert.equal(displaySeconds(shot.remainingMs / 1000), 1);
    assert.deepEqual(engineFacts(timer), before);
    assert.equal(timer.sample().type, 'running');
  });

  it('does not complete a countdown that has already run out', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(2);
    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    clock.advance(5000);

    const shot = timer.snapshot();
    assert.equal(shot.remainingMs, 0);
    assert.equal(shot.active, true);
    assert.equal(shot.kind, 'day');
    assert.equal(shot.running, true);
    assert.equal(timer.getTimeLeft(), 2);
    assert.equal(timer.isCountdownActive(), true);

    assert.equal(timer.sample().type, 'complete');
    assert.equal(timer.snapshot().active, false);
    assert.equal(timer.snapshot().remainingMs, 0);
  });

  it('uses a supplied timestamp and does not ask the clock again', () => {
    let calls = 0;
    const timer = createTimerEngine({
      now() {
        calls += 1;
        return 0;
      },
    });
    timer.setTimeLeft(5);
    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS, 0);
    const callsAfterStart = calls;

    assert.equal(timer.snapshot(2500).remainingMs, 2500);
    assert.equal(calls, callsAfterStart);
    assert.equal(timer.getTimeLeft(), 5);
    assert.equal(timer.sample(2500).type, 'running');
  });
});
