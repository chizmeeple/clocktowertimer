// Screen Wake Lock for the player page. The checkbox stays the source of the
// preference. A missing API, a refusal, or a failed release must not throw.

export function createWakeLockController({
  supported = false,
  request = async () => {
    throw new Error('Wake lock is unavailable');
  },
  visibility = () => 'visible',
  onActive = () => {},
  onRefused = () => {},
} = {}) {
  let enabled = false;
  let lock = null;
  let chain = Promise.resolve();

  async function step() {
    if (!supported) return;
    const want = enabled && visibility() === 'visible';
    if (!want) {
      const current = lock;
      lock = null;
      if (!current) return;
      try {
        await current.release();
      } catch {
        // The browser may already have released it.
      }
      return;
    }
    if (lock) return;
    let next;
    try {
      next = await request('screen');
    } catch {
      if (enabled && visibility() === 'visible') onRefused();
      return;
    }
    if (!enabled || visibility() !== 'visible') {
      try {
        await next?.release?.();
      } catch {
        // Ignore a lock we no longer want.
      }
      return;
    }
    lock = next;
    if (typeof next?.addEventListener === 'function') {
      next.addEventListener(
        'release',
        () => {
          if (lock === next) lock = null;
        },
        { once: true }
      );
    }
    onActive();
  }

  function apply() {
    const run = chain.then(step);
    chain = run.catch(() => {});
    return run;
  }

  return {
    supported: Boolean(supported),
    setEnabled(value) {
      enabled = Boolean(value);
      return apply();
    },
    onVisibilityChange() {
      return apply();
    },
  };
}
