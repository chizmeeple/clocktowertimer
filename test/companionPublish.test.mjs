import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HEARTBEAT_MS,
  createCompanionPublishing,
  enableCompanionPublishing,
} from '../companionPublish.js';
import { projectCompanionState } from '../companionState.js';

function idleSnapshot(day = 1) {
  return projectCompanionState({
    game: { currentDay: day, phase: '', awaitingFirstDay: false },
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
}

function harness(capture = idleSnapshot) {
  const timers = new Map();
  let nextId = 1;
  const warnings = [];
  const published = [];
  const publishing = createCompanionPublishing({
    capture,
    setInterval(fn, delay) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { fn, delay });
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    warn(message, error) {
      warnings.push({ message, error });
    },
  });
  return { timers, warnings, published, publishing };
}

describe('companion publishing', () => {
  it('refuses to enable the page publisher before a timer is bound', () => {
    assert.equal(HEARTBEAT_MS, 10_000);
    assert.throws(
      () => enableCompanionPublishing(() => {}),
      /no timer to read/
    );
  });

  it('publishes once on enable and skips an identical transition', () => {
    const { published, publishing, timers } = harness();
    publishing.enable((snapshot) => {
      published.push(snapshot);
    });

    assert.equal(publishing.enabled, true);
    assert.equal(published.length, 1);
    assert.equal(published[0].phase, 'idle');
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].delay, HEARTBEAT_MS);

    publishing.publish();
    assert.equal(published.length, 1);
  });

  it('publishes a changed snapshot and always publishes a heartbeat', () => {
    let day = 1;
    const { published, publishing, timers } = harness(() => idleSnapshot(day));
    publishing.enable((snapshot) => {
      published.push(snapshot);
    });

    day = 2;
    publishing.publish();
    assert.equal(published.at(-1).day, 2);

    const beat = [...timers.values()][0].fn;
    beat();
    assert.equal(published.length, 3);
    assert.equal(published.at(-1).day, 2);
  });

  it('replaces the heartbeat when publishing is enabled again', () => {
    const { published, publishing, timers } = harness();
    const first = (snapshot) => published.push({ publisher: 'first', snapshot });
    const second = (snapshot) => published.push({ publisher: 'second', snapshot });

    publishing.enable(first);
    publishing.enable(second);

    assert.equal(timers.size, 1);
    assert.equal(published.length, 2);
    assert.equal(published[0].publisher, 'first');
    assert.equal(published[1].publisher, 'second');

    [...timers.values()][0].fn();
    assert.equal(published.at(-1).publisher, 'second');
  });

  it('stops the heartbeat and further publishes when disabled', () => {
    const { published, publishing, timers } = harness();
    publishing.enable((snapshot) => {
      published.push(snapshot);
    });
    const beat = [...timers.values()][0].fn;

    publishing.disable();
    assert.equal(publishing.enabled, false);
    assert.equal(timers.size, 0);

    beat();
    publishing.publish();
    assert.equal(published.length, 1);

    publishing.enable((snapshot) => {
      published.push(snapshot);
    });
    assert.equal(timers.size, 1);
    assert.equal(published.length, 2);
  });

  it('keeps going when capture throws or the snapshot is not valid', () => {
    let mode = 'throw';
    const { published, publishing, warnings, timers } = harness(() => {
      if (mode === 'throw') throw new Error('timer is mid-transition');
      return { v: 1 };
    });

    assert.doesNotThrow(() => {
      publishing.enable((snapshot) => {
        published.push(snapshot);
      });
    });
    assert.equal(published.length, 0);
    assert.equal(warnings.length, 1);
    assert.equal(timers.size, 1);

    [...timers.values()][0].fn();
    assert.equal(warnings.length, 1);

    mode = 'invalid';
    [...timers.values()][0].fn();
    assert.equal(published.length, 0);
    assert.equal(warnings.length, 2);

    publishing.publish();
    assert.equal(publishing.enabled, true);
  });

  it('swallows a publisher that throws', () => {
    const { publishing, warnings } = harness();
    assert.doesNotThrow(() => {
      publishing.enable(() => {
        throw new Error('publisher failed');
      });
    });
    assert.equal(warnings.length, 1);
    assert.equal(publishing.enabled, true);
    assert.doesNotThrow(() => publishing.publish());
    assert.equal(warnings.length, 1);
  });

  it('handles a publisher that returns a rejected promise', async () => {
    let calls = 0;
    const { publishing, warnings } = harness();
    publishing.enable(() => {
      calls += 1;
      return Promise.reject(new Error('publisher rejected'));
    });
    await Promise.resolve();
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].error.message, 'publisher rejected');
    assert.equal(publishing.enabled, true);

    publishing.publish();
    await Promise.resolve();
    assert.equal(calls, 2);
  });

  it('sends a fresh copy when asked, even if the snapshot matches', () => {
    const { published, publishing } = harness();
    publishing.enable((snapshot) => {
      published.push(snapshot);
    });
    publishing.publish();
    assert.equal(published.length, 1);
    publishing.publish(true);
    assert.equal(published.length, 2);
    assert.deepEqual(published[0], published[1]);
  });

  it('leaves an enabled publisher in place when enable is given no function', () => {
    const { publishing, timers } = harness();
    publishing.enable(() => {});
    assert.throws(
      () => publishing.enable(undefined),
      /needs a publish function/
    );
    assert.equal(publishing.enabled, true);
    assert.equal(timers.size, 1);
  });
});
