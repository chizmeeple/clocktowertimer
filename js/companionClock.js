// Local countdown display for one validated companion snapshot.
// The caller supplies every timestamp and any clock offset. Nothing here
// reads Date.now() or performance.now(), and a local zero does not change
// the published phase.

import { displaySeconds } from './timerEngine.js';
import { validateCompanionState } from './companionState.js';

/**
 * Remaining time at one instant.
 *
 * `referenceTime` is the timestamp the snapshot belongs to, on the reference
 * clock. `now` is the caller's current timestamp. `offsetMs` is added to
 * `now` to estimate that reference clock (reference minus local). It is
 * zero when the caller is already on the reference clock.
 *
 * A running countdown moves by real elapsed time multiplied by `rate`.
 * Paused, ready, idle, and finished countdowns stay where they were.
 *
 * `locallyComplete` means this calculation reached zero while the snapshot
 * still says the countdown is running. `confirmedComplete` is true only when
 * the snapshot itself says the day has finished. Reaching zero locally does
 * not make the phase night.
 *
 * @returns {{
 *   remainingMs: number,
 *   displaySeconds: number,
 *   locallyComplete: boolean,
 *   confirmedComplete: boolean,
 * }}
 */
export function readCompanionCountdown({
  snapshot,
  referenceTime,
  now,
  offsetMs = 0,
}) {
  const validated = validateCompanionState(snapshot);
  if (!validated.ok) {
    throw new TypeError(`Companion snapshot is not valid: ${validated.reason}`);
  }
  if (!Number.isFinite(referenceTime) || !Number.isFinite(now) || !Number.isFinite(offsetMs)) {
    throw new TypeError('Countdown times must be finite numbers');
  }

  const timer = validated.value.timer;
  const confirmedComplete =
    validated.value.phase === 'night' && timer.status === 'finished';

  let remainingMs = timer.remainingMs;
  if (timer.status === 'running') {
    const elapsedReal = now + offsetMs - referenceTime;
    if (elapsedReal > 0) {
      remainingMs = timer.remainingMs - elapsedReal * timer.rate;
    }
  }
  if (remainingMs < 0) remainingMs = 0;

  return {
    remainingMs,
    displaySeconds: displaySeconds(remainingMs / 1000),
    locallyComplete: timer.status === 'running' && remainingMs === 0,
    confirmedComplete,
  };
}
