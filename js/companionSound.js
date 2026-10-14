// Player-page effects only. Volumes here are independent of the
// Storyteller's sound settings. The bowl is the early cue, so it
// stays quieter than the bell.

export const COMPANION_SOUND_GAP_MS = 600;

export const COMPANION_SOUNDS = {
  warning: {
    file: '../sounds/companion/warning-30sec.mp3',
    volume: 0.5,
    label: '30-second warning',
  },
  zero: {
    file: '../sounds/end-of-day/single-church-bell-v2.mp3',
    volume: 0.75,
    label: 'End of the countdown',
  },
  rooster: {
    file: '../sounds/wake-up/rooster-v2.mp3',
    volume: 0.75,
    label: 'New day',
  },
};

export function companionSoundUrl(kind, base = import.meta.url) {
  return new URL(COMPANION_SOUNDS[kind].file, base);
}

export function createCompanionSounds({
  createAudio = (src) => new Audio(src),
  hidden = () => false,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
  gap = COMPANION_SOUND_GAP_MS,
} = {}) {
  const clips = {};
  const primeStamp = new WeakMap();
  for (const kind of Object.keys(COMPANION_SOUNDS)) {
    const clip = createAudio(companionSoundUrl(kind).href);
    clip.preload = 'auto';
    clip.volume = COMPANION_SOUNDS[kind].volume;
    clips[kind] = clip;
  }

  let token = 0;
  let gapTimer = null;
  let stopWait = null;
  let report = () => {};

  function silence(clip) {
    try {
      clip.pause();
    } catch {
      /* A clip that has not loaded yet cannot be paused. */
    }
    try {
      clip.currentTime = 0;
    } catch {
      /* Seeking can fail before the browser knows the duration. */
    }
  }

  function halt() {
    token += 1;
    if (gapTimer != null) {
      cancel(gapTimer);
      gapTimer = null;
    }
    const finish = stopWait;
    stopWait = null;
    finish?.();
    for (const clip of Object.values(clips)) {
      primeStamp.set(clip, null);
      silence(clip);
    }
  }

  function prime(clip) {
    const stamp = {};
    primeStamp.set(clip, stamp);
    const volume = clip.volume;
    clip.volume = 0;
    const restore = () => {
      if (primeStamp.get(clip) !== stamp) return;
      primeStamp.set(clip, null);
      silence(clip);
      clip.volume = volume;
    };
    try {
      const pending = clip.play();
      if (pending?.then) pending.then(restore, restore);
      else restore();
    } catch {
      restore();
    }
  }

  function start(kind) {
    const clip = clips[kind];
    primeStamp.set(clip, null);
    silence(clip);
    clip.volume = COMPANION_SOUNDS[kind].volume;
    try {
      const pending = clip.play();
      if (pending?.then) return pending;
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function whenEnded(clip) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clip.removeEventListener('ended', onEnded);
        clip.removeEventListener('error', onError);
        if (stopWait === finish) stopWait = null;
        if (error) reject(error);
        else resolve();
      };
      const onEnded = () => finish();
      const onError = () => finish(new Error('The sound could not be played.'));
      stopWait = () => finish();
      clip.addEventListener('ended', onEnded);
      clip.addEventListener('error', onError);
    });
  }

  function wait(ms) {
    return new Promise((resolve) => {
      gapTimer = schedule(() => {
        gapTimer = null;
        resolve();
      }, ms);
    });
  }

  async function sequence() {
    const mine = token;
    prime(clips.zero);
    report(COMPANION_SOUNDS.warning.label);
    try {
      await start('warning');
      if (token !== mine) return;
      await whenEnded(clips.warning);
      if (token !== mine) return;
      await wait(gap);
      if (token !== mine) return;
      report(COMPANION_SOUNDS.zero.label);
      await start('zero');
      if (token !== mine) return;
      await whenEnded(clips.zero);
      if (token !== mine) return;
      report('');
    } catch {
      if (token === mine) report('');
    }
  }

  return {
    play(kind) {
      if (hidden()) return;
      halt();
      report('');
      start(kind).catch(() => {});
    },
    preview(onStatus) {
      if (hidden()) return;
      report = typeof onStatus === 'function' ? onStatus : () => {};
      halt();
      sequence();
    },
    unlock() {
      prime(clips.warning);
      prime(clips.zero);
      prime(clips.rooster);
    },
    stop() {
      halt();
      report('');
    },
  };
}
