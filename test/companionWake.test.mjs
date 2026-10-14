import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createWakeLockController } from '../js/companionWake.js';

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function harness({ supported = true, visibility = 'visible' } = {}) {
  const requests = [];
  const notes = [];
  let state = visibility;
  const locks = [];
  const controller = createWakeLockController({
    supported,
    visibility: () => state,
    request() {
      const pending = deferred();
      const record = { pending, listeners: 0 };
      requests.push(record);
      locks.push(record);
      return pending.promise;
    },
    onActive() {
      notes.push('active');
    },
    onRefused() {
      notes.push('refused');
    },
  });
  return {
    controller,
    requests,
    notes,
    set visibility(value) {
      state = value;
    },
    grant(index = requests.length - 1) {
      let released = false;
      const sentinel = {
        get released() {
          return released;
        },
        release() {
          released = true;
          return Promise.resolve();
        },
        addEventListener() {
          requests[index].listeners += 1;
        },
      };
      requests[index].sentinel = sentinel;
      requests[index].pending.resolve(sentinel);
      return sentinel;
    },
  };
}

describe('companion wake lock', () => {
  it('requests one lock when enabled and does not request it again while held', async () => {
    const env = harness();
    const first = env.controller.setEnabled(true);
    await flush();
    assert.equal(env.requests.length, 1);
    env.grant();
    await first;
    assert.deepEqual(env.notes, ['active']);
    await env.controller.onVisibilityChange();
    await env.controller.setEnabled(true);
    assert.equal(env.requests.length, 1);
    assert.equal(env.requests[0].listeners, 1);
  });

  it('releases the lock when disabled and asks again when the page returns', async () => {
    const env = harness();
    const first = env.controller.setEnabled(true);
    await flush();
    const sentinel = env.grant();
    await first;
    await env.controller.setEnabled(false);
    assert.equal(sentinel.released, true);

    env.visibility = 'hidden';
    const hidden = env.controller.setEnabled(true);
    await hidden;
    assert.equal(env.requests.length, 1);

    env.visibility = 'visible';
    const again = env.controller.onVisibilityChange();
    await flush();
    assert.equal(env.requests.length, 2);
    env.grant();
    await again;
    assert.equal(env.notes.at(-1), 'active');
  });

  it('survives an unsupported browser, a refusal, and a release that throws', async () => {
    const missing = harness({ supported: false });
    await missing.controller.setEnabled(true);
    await missing.controller.onVisibilityChange();
    assert.equal(missing.requests.length, 0);
    assert.deepEqual(missing.notes, []);

    const refused = createWakeLockController({
      supported: true,
      request() {
        return Promise.reject(new Error('denied'));
      },
      onRefused() {
        refused.notes.push('refused');
      },
    });
    refused.notes = [];
    await refused.setEnabled(true);
    assert.deepEqual(refused.notes, ['refused']);
    await refused.setEnabled(false);

    const env = harness();
    const pending = env.controller.setEnabled(true);
    await flush();
    const sentinel = env.grant();
    sentinel.release = () => {
      throw new Error('already released');
    };
    await pending;
    await env.controller.setEnabled(false);
    await env.controller.onVisibilityChange();
  });

  it('drops a lock that arrives after the option was turned off', async () => {
    const env = harness();
    const started = env.controller.setEnabled(true);
    await flush();
    const stopped = env.controller.setEnabled(false);
    const sentinel = env.grant();
    await started;
    await stopped;
    assert.equal(sentinel.released, true);
    assert.equal(env.notes.includes('active'), false);
  });
});
