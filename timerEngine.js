// Countdown state for one timer. Elapsed time comes from an injected clock
// (performance.now() in the browser), so a late callback cannot skip or stretch
// the remaining duration.

export const COUNTDOWN_REFRESH_MS = 50;
export const NORMAL_COUNTDOWN_MS_PER_REAL_MS = 1;

const NORMAL_INTERVAL_MS = 1000;

// The current second stays up until it has fully elapsed.
export function displaySeconds(secondsRemaining) {
  if (!(secondsRemaining > 0)) return 0;
  const millis = Math.round(secondsRemaining * 1000);
  if (millis <= 0) return 0;
  return Math.ceil(millis / 1000);
}

export function createTimerEngine({ now = () => performance.now() } = {}) {
  let timeLeft = 0;
  let isRunning = false;
  let hasReset = false;
  let countdownActive = false;
  let countdownKind = null;
  let segmentStartRemainingMs = 0;
  let segmentStartAt = 0;
  let segmentCountdownPerRealMs = 0;
  let currentInterval = NORMAL_INTERVAL_MS;

  function readRemainingMs(timestamp = now()) {
    if (!countdownActive) return Math.max(0, Math.round(timeLeft * 1000));
    const elapsed = timestamp - segmentStartAt;
    if (!(elapsed > 0)) return segmentStartRemainingMs;
    const remaining =
      segmentStartRemainingMs - elapsed * segmentCountdownPerRealMs;
    if (remaining <= 0.001) return 0;
    return remaining;
  }

  function anchorSegment(countdownPerRealMs, timestamp = now()) {
    segmentStartRemainingMs = Math.max(0, Math.round(timeLeft * 1000));
    // Keep a sub-millisecond remainder counting so it can still reach zero.
    if (segmentStartRemainingMs === 0 && timeLeft > 0) {
      segmentStartRemainingMs = 1;
    }
    segmentStartAt = timestamp;
    segmentCountdownPerRealMs = countdownPerRealMs;
    countdownActive = segmentStartRemainingMs > 0;
  }

  function clearSegment() {
    countdownActive = false;
    countdownKind = null;
    segmentCountdownPerRealMs = 0;
  }

  function completeActive(timestamp = now()) {
    if (!countdownActive) return { type: 'idle' };
    const remainingMs = readRemainingMs(timestamp);
    if (remainingMs <= 0) {
      const kind = countdownKind;
      const wasAccelerated =
        segmentCountdownPerRealMs !== NORMAL_COUNTDOWN_MS_PER_REAL_MS;
      timeLeft = 0;
      clearSegment();
      isRunning = false;
      currentInterval = NORMAL_INTERVAL_MS;
      return { type: 'complete', kind, wasAccelerated };
    }
    timeLeft = remainingMs / 1000;
    return { type: 'running', shown: displaySeconds(timeLeft) };
  }

  return {
    getTimeLeft: () => timeLeft,
    setTimeLeft(seconds) {
      timeLeft = seconds;
    },
    isRunning: () => isRunning,
    setRunning(value) {
      isRunning = value;
    },
    hasReset: () => hasReset,
    setHasReset(value) {
      hasReset = value;
    },
    isCountdownActive: () => countdownActive,
    getCountdownKind: () => countdownKind,
    getCurrentInterval: () => currentInterval,
    setCurrentInterval(value) {
      currentInterval = value;
    },
    getNormalInterval: () => NORMAL_INTERVAL_MS,

    readRemainingMs,
    clearSegment,

    // Settle any active segment, then drop it. Paused time stays in timeLeft.
    pause(timestamp = now()) {
      if (countdownActive) {
        timeLeft = readRemainingMs(timestamp) / 1000;
      }
      clearSegment();
      isRunning = false;
    },

    // Apply time already elapsed at the current speed, then run at the new rate.
    // A segment that has already finished completes as its existing kind.
    continueAt(kind, countdownPerRealMs, timestamp = now()) {
      if (countdownActive) {
        timeLeft = readRemainingMs(timestamp) / 1000;
        if (timeLeft <= 0) {
          return completeActive(timestamp);
        }
      }
      if (!(timeLeft > 0)) return { type: 'idle' };
      countdownKind = kind;
      anchorSegment(countdownPerRealMs, timestamp);
      return { type: 'running', shown: displaySeconds(timeLeft) };
    },

    sample(timestamp = now()) {
      return completeActive(timestamp);
    },

    // `randomValue` is Math.random() in the browser. The rate matches the
    // previous time-per-tick acceleration: countdown seconds per refresh.
    accelerate(randomValue, timestamp = now()) {
      if (!isRunning || timeLeft <= 0) return { type: 'ignored' };
      if (countdownActive) {
        timeLeft = readRemainingMs(timestamp) / 1000;
      }
      if (timeLeft <= 0) {
        return completeActive(timestamp);
      }

      const completionTime = Math.floor(randomValue * 8000) + 3000;
      const intervals = Math.min(
        timeLeft,
        Math.floor(completionTime / COUNTDOWN_REFRESH_MS)
      );
      if (!(intervals > 0)) return { type: 'ignored' };
      const timePerTick = Math.ceil(timeLeft / intervals);

      currentInterval = COUNTDOWN_REFRESH_MS;
      countdownKind = 'day';
      anchorSegment((timePerTick * 1000) / COUNTDOWN_REFRESH_MS, timestamp);
      return { type: 'running', shown: displaySeconds(timeLeft) };
    },

    // Scale a running countdown. A paused timer is left untouched.
    // Returns whether the running branch was entered.
    scaleIfRunning(multiplier, timestamp = now()) {
      if (!(isRunning && timeLeft > 0)) return false;
      if (countdownActive) {
        timeLeft = readRemainingMs(timestamp) / 1000;
      }
      const oldTimeLeft = timeLeft;
      timeLeft = Number.isInteger(oldTimeLeft)
        ? Math.round(oldTimeLeft * multiplier)
        : oldTimeLeft * multiplier;
      if (countdownActive) {
        anchorSegment(segmentCountdownPerRealMs, timestamp);
      }
      return true;
    },
  };
}
