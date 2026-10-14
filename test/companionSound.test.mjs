import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  COMPANION_SOUNDS,
  companionSoundUrl,
  createCompanionSounds,
} from '../js/companionSound.js';

function createHarness() {
  const clips = [];
  const timers = [];
  const status = [];
  const harness = {
    clips,
    timers,
    status,
    hidden: false,
  };

  function createAudio(src) {
    const listeners = new Map();
    const clip = {
      src,
      volume: 1,
      currentTime: 0,
      paused: true,
      preload: '',
      plays: [],
      fail: null,
      play() {
        this.plays.push(this.volume);
        this.paused = false;
        if (this.fail) return Promise.reject(this.fail);
        return Promise.resolve();
      },
      pause() {
        this.paused = true;
      },
      addEventListener(type, fn) {
        listeners.set(type, fn);
      },
      removeEventListener(type, fn) {
        if (listeners.get(type) === fn) listeners.delete(type);
      },
      end() {
        listeners.get('ended')?.();
      },
    };
    clips.push(clip);
    return clip;
  }

  harness.player = createCompanionSounds({
    createAudio,
    hidden: () => harness.hidden,
    schedule(fn) {
      const entry = { fn, cleared: false };
      timers.push(entry);
      return entry;
    },
    cancel(entry) {
      entry.cleared = true;
    },
  });
  harness.warning = clips[0];
  harness.bell = clips[1];
  return harness;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('companion alert sounds', () => {
  it('selects the bowl for the warning and the existing bell at zero', () => {
    assert.ok(COMPANION_SOUNDS.warning.volume < COMPANION_SOUNDS.zero.volume);
    const warning = companionSoundUrl('warning');
    const zero = companionSoundUrl('zero');
    assert.match(warning.pathname, /\/sounds\/companion\/warning-30sec\.mp3$/);
    assert.match(zero.pathname, /\/sounds\/end-of-day\/single-church-bell-v2\.mp3$/);
    assert.equal(existsSync(fileURLToPath(warning)), true);
    assert.equal(existsSync(fileURLToPath(zero)), true);
    assert.equal(existsSync(fileURLToPath(new URL('../warning-30sec.mp3', import.meta.url))), false);

    for (const base of [
      'http://127.0.0.1:8006/c',
      'http://127.0.0.1:8006/c/',
      'http://127.0.0.1:8006/c/index.html',
      'http://127.0.0.1:8006/c?code=ABC123',
    ]) {
      const moduleUrl = new URL('../js/companionSound.js', base);
      assert.equal(moduleUrl.pathname, '/js/companionSound.js');
      assert.equal(
        companionSoundUrl('warning', moduleUrl).pathname,
        '/sounds/companion/warning-30sec.mp3'
      );
      assert.equal(
        companionSoundUrl('zero', moduleUrl).pathname,
        '/sounds/end-of-day/single-church-bell-v2.mp3'
      );
    }
  });

  it('plays each clip once per request and skips a hidden page', async () => {
    const harness = createHarness();
    harness.player.play('warning');
    await flush();
    assert.deepEqual(harness.warning.plays, [COMPANION_SOUNDS.warning.volume]);
    assert.deepEqual(harness.bell.plays, []);

    harness.player.play('zero');
    await flush();
    assert.equal(harness.warning.paused, true);
    assert.deepEqual(harness.bell.plays, [COMPANION_SOUNDS.zero.volume]);

    harness.hidden = true;
    harness.player.play('warning');
    await flush();
    assert.equal(harness.warning.plays.length, 1);
  });

  it('plays the test sequence without stacking a second press', async () => {
    const harness = createHarness();
    const alertState = { previous: 40, alert: null };
    harness.player.preview((label) => harness.status.push(label));
    await flush();
    assert.deepEqual(harness.status, ['30-second warning']);
    assert.deepEqual(alertState, { previous: 40, alert: null });
    assert.equal(harness.warning.plays.at(-1), COMPANION_SOUNDS.warning.volume);
    assert.equal(harness.bell.plays.every((volume) => volume === 0), true);

    harness.player.preview((label) => harness.status.push(label));
    await flush();
    assert.equal(harness.warning.paused, false);
    assert.equal(harness.timers.every((entry) => entry.cleared), true);
    const bellBeforeEnd = harness.bell.plays.filter((volume) => volume > 0).length;
    assert.equal(bellBeforeEnd, 0);

    harness.warning.end();
    await flush();
    assert.equal(harness.timers.length, 1);
    harness.timers[0].fn();
    await flush();
    assert.equal(harness.status.at(-1), 'End of the countdown');
    assert.deepEqual(
      harness.bell.plays.filter((volume) => volume > 0),
      [COMPANION_SOUNDS.zero.volume]
    );
    harness.bell.end();
    await flush();
    assert.equal(harness.status.at(-1), '');
    assert.deepEqual(alertState, { previous: 40, alert: null });
  });

  it('keeps going when playback fails', async () => {
    const harness = createHarness();
    harness.warning.fail = new Error('blocked');
    harness.bell.fail = new Error('blocked');
    harness.player.preview((label) => harness.status.push(label));
    await flush();
    assert.equal(harness.status.at(-1), '');

    harness.player.play('zero');
    await flush();
    assert.equal(harness.status.at(-1), '');
  });

  it('leaves the storyteller beep in place and drops the companion oscillator', () => {
    const page = readFileSync(new URL('../js/companion-page.js', import.meta.url), 'utf8');
    const storyteller = readFileSync(new URL('../js/script.js', import.meta.url), 'utf8');
    assert.equal(page.includes('createOscillator'), false);
    assert.equal(page.includes('companionSound.js'), true);
    assert.equal(storyteller.includes('createOscillator'), true);
  });
});
