import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { orientationUtils } from '../helper.js';

const PORTRAIT_QUERY = '(orientation: portrait)';

function installMatchMedia(initialMatches = false) {
  const queries = [];
  let matches = initialMatches;

  globalThis.matchMedia = (query) => {
    const listeners = new Set();
    const mediaQueryList = {
      get matches() {
        return matches;
      },
      media: query,
      added: [],
      removed: [],
      addEventListener(type, listener) {
        if (type !== 'change') {
          return;
        }
        listeners.add(listener);
        mediaQueryList.added.push(listener);
      },
      removeEventListener(type, listener) {
        if (type !== 'change') {
          return;
        }
        mediaQueryList.removed.push({
          listener,
          removed: listeners.delete(listener),
        });
      },
      listeners,
    };
    queries.push(mediaQueryList);
    return mediaQueryList;
  };

  return {
    queries,
    dispatch(nextMatches) {
      matches = nextMatches;
      for (const query of queries) {
        for (const listener of [...query.listeners]) {
          listener({ matches: nextMatches, media: query.media });
        }
      }
    },
    totalListeners() {
      return queries.reduce((count, query) => count + query.listeners.size, 0);
    },
  };
}

describe('orientationUtils', () => {
  const registered = [];

  afterEach(() => {
    for (const callback of registered) {
      orientationUtils.removeOrientationListener(callback);
    }
    registered.length = 0;
    delete globalThis.matchMedia;
  });

  function add(callback) {
    registered.push(callback);
    orientationUtils.addOrientationListener(callback);
  }

  it('reports the current portrait orientation from the media query', () => {
    const media = installMatchMedia(true);
    assert.equal(orientationUtils.isPortrait(), true);
    assert.equal(media.queries[0].media, PORTRAIT_QUERY);
    assert.equal(media.queries[0].added.length, 0);

    installMatchMedia(false);
    assert.equal(orientationUtils.isPortrait(), false);
  });

  it('calls registered callbacks with the matches boolean', () => {
    const media = installMatchMedia(false);
    const received = [];
    add((isPortrait) => {
      received.push(isPortrait);
    });

    media.dispatch(true);
    media.dispatch(false);

    assert.deepEqual(received, [true, false]);
    assert.equal(
      received.every((value) => typeof value === 'boolean'),
      true
    );
    assert.equal(media.queries[0].media, PORTRAIT_QUERY);
  });

  it('does not call a callback after it is removed', () => {
    const media = installMatchMedia(false);
    let calls = 0;
    const callback = () => {
      calls += 1;
    };
    add(callback);

    media.dispatch(true);
    assert.equal(calls, 1);

    orientationUtils.removeOrientationListener(callback);
    media.dispatch(false);

    assert.equal(calls, 1);
    assert.equal(media.totalListeners(), 0);
    assert.equal(
      media.queries[0].removed[0].listener,
      media.queries[0].added[0]
    );
    assert.equal(media.queries[0].removed[0].removed, true);
    assert.equal(media.queries.length, 1);
  });

  it('removes callbacks independently', () => {
    const media = installMatchMedia(false);
    const calls = { first: 0, second: 0 };
    const first = (isPortrait) => {
      assert.equal(isPortrait, true);
      calls.first += 1;
    };
    const second = (isPortrait) => {
      assert.equal(isPortrait, true);
      calls.second += 1;
    };
    add(first);
    add(second);

    media.dispatch(true);
    assert.deepEqual(calls, { first: 1, second: 1 });

    orientationUtils.removeOrientationListener(first);
    media.dispatch(true);
    assert.deepEqual(calls, { first: 1, second: 2 });

    orientationUtils.removeOrientationListener(second);
    media.dispatch(true);
    assert.deepEqual(calls, { first: 1, second: 2 });
    assert.equal(media.totalListeners(), 0);
  });

  it('handles repeated registration and removal of the same callback', () => {
    const media = installMatchMedia(false);
    let calls = 0;
    const callback = (isPortrait) => {
      assert.equal(typeof isPortrait, 'boolean');
      if (isPortrait === true) {
        calls += 1;
      }
    };

    add(callback);
    orientationUtils.addOrientationListener(callback);
    assert.equal(media.totalListeners(), 1);

    media.dispatch(true);
    assert.equal(calls, 1);

    orientationUtils.removeOrientationListener(callback);
    orientationUtils.removeOrientationListener(callback);
    media.dispatch(true);
    assert.equal(calls, 1);
    assert.equal(media.totalListeners(), 0);

    orientationUtils.addOrientationListener(callback);
    media.dispatch(false);
    media.dispatch(true);
    assert.equal(calls, 2);
    assert.equal(media.totalListeners(), 1);
    assert.equal(orientationUtils.isPortrait(), true);
  });
});
