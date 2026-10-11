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

  it('scales a running countdown by the supplied multiplier and leaves a pause alone', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(10);
    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);

    assert.equal(timer.scaleIfRunning(2), true);
    assert.equal(timer.getTimeLeft(), 20);
    assert.equal(displaySeconds(timer.getTimeLeft()), 20);

    clock.advance(1000);
    assert.equal(timer.sample().shown, 19);

    timer.pause();
    timer.setTimeLeft(8);
    assert.equal(timer.scaleIfRunning(2), false);
    assert.equal(timer.getTimeLeft(), 8);
  });

  it('re-anchors a running countdown when the multiplier does not change the duration', () => {
    const { clock, timer } = engineAt();
    timer.setTimeLeft(10);
    timer.setRunning(true);
    timer.continueAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
    clock.advance(400);

    assert.equal(timer.scaleIfRunning(1), true);
    assert.equal(timer.getTimeLeft(), 9.6);
    assert.equal(displaySeconds(timer.getTimeLeft()), 10);

    clock.advance(600);
    assert.equal(timer.sample().shown, 9);
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
