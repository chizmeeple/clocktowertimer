// Public companion snapshot. Built from values the caller already has.
// It does not read the page, storage, or the clock, and it does not include
// a revision or a server time. Those belong to the session transport.

import { characterAmounts } from './helper.js';

export const COMPANION_PROTOCOL_VERSION = 1;

// Same upper bound the timer uses when it stores a day number.
export const MAX_COMPANION_DAY = 100;

const PHASES = new Set(['idle', 'pregame', 'wake', 'day', 'night']);
const STATUSES = new Set(['idle', 'running', 'paused', 'ready', 'finished']);
const KINDS = new Set(['day', 'wake']);

const PROJECTION_KEYS = ['v', 'phase', 'day', 'counts', 'timer'];
const COUNT_KEYS = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller'];
const STANDARD_COUNT_KEYS = ['townsfolk', 'outsider', 'minion', 'demon'];
const TIMER_KEYS = ['status', 'kind', 'remainingMs', 'rate'];

const MIN_TRAVELLER_COUNT = 0;
const MAX_TRAVELLER_COUNT = 5;

const distributions = new Set(
  Object.values(characterAmounts).map((row) => row.join(','))
);

const countExtremes = STANDARD_COUNT_KEYS.map((_, index) => {
  const values = Object.values(characterAmounts).map((row) => row[index]);
  return { min: Math.min(...values), max: Math.max(...values) };
});

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function fail(reason) {
  return { ok: false, reason };
}

function exactKeys(value, allowed) {
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key))) return 'unknown-field';
  if (allowed.some((key) => !Object.hasOwn(value, key))) return 'missing-field';
  return '';
}

function standardCounts(playerCount) {
  const row = characterAmounts[playerCount];
  if (!row) return null;
  return {
    townsfolk: row[0],
    outsider: row[1],
    minion: row[2],
    demon: row[3],
  };
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${label} must be true or false`);
  }
}

function assertRemaining(remainingMs) {
  if (!Number.isFinite(remainingMs) || remainingMs < 0) {
    throw new TypeError('Remaining time must be a finite, non-negative number');
  }
}

// The engine reports kind `wake-up` and leaves `running` false for that
// countdown. Public `running` means the segment is active.
function runningProjection(timer, phase, kind) {
  assertRemaining(timer.remainingMs);
  if (!(timer.rate > 0) || !Number.isFinite(timer.rate)) {
    throw new TypeError('A running countdown needs a finite rate above zero');
  }
  return {
    phase,
    status: 'running',
    kind,
    remainingMs: timer.remainingMs,
    rate: timer.rate,
  };
}

function stillProjection(phase, status, remainingMs) {
  assertRemaining(remainingMs);
  if (status === 'paused' || status === 'ready') {
    if (!(remainingMs > 0)) {
      throw new TypeError('A paused or ready day still has time left');
    }
  } else if (remainingMs !== 0) {
    throw new TypeError('An idle or finished countdown has no time left');
  }
  return {
    phase,
    status,
    kind: null,
    remainingMs,
    rate: 0,
  };
}

function assertIdleTimer(timer) {
  assertBoolean(timer.active, 'timer.active');
  assertBoolean(timer.running, 'timer.running');
  assertBoolean(timer.reset, 'timer.reset');
  if (timer.active || timer.running || timer.kind != null) {
    throw new TypeError('This phase has no running countdown');
  }
  assertRemaining(timer.remainingMs);
}

/**
 * Project one instant of gameplay into protocol v1.
 *
 * `game` uses the fields from createGameState().snapshot(): currentDay,
 * phase (`dawn`, `dusk`, or empty), and awaitingFirstDay. Other game fields
 * are ignored.
 * `timer` is createTimerEngine().snapshot(). Its kind stays `day`, `wake-up`,
 * or null. The public kind is `day`, `wake`, or null.
 * `playerCount` selects the four standard counts. `travellerCount` is the
 * separate traveller setting, from 0 to 5, and is not added to those four.
 *
 * @returns {{
 *   v: 1,
 *   phase: 'idle' | 'pregame' | 'wake' | 'day' | 'night',
 *   day: number,
 *   counts: {
 *     townsfolk: number,
 *     outsider: number,
 *     minion: number,
 *     demon: number,
 *     traveller: number,
 *   },
 *   timer: {
 *     status: 'idle' | 'running' | 'paused' | 'ready' | 'finished',
 *     kind: 'day' | 'wake' | null,
 *     remainingMs: number,
 *     rate: number,
 *   },
 * }}
 */
export function projectCompanionState({
  game,
  timer,
  playerCount,
  travellerCount,
}) {
  if (!isPlainObject(game) || !isPlainObject(timer)) {
    throw new TypeError('A companion projection needs game and timer records');
  }
  if (
    !Number.isInteger(game.currentDay) ||
    game.currentDay < 1 ||
    game.currentDay > MAX_COMPANION_DAY
  ) {
    throw new TypeError('Day number must be a tracked day');
  }
  if (game.phase !== '' && game.phase !== 'dawn' && game.phase !== 'dusk') {
    throw new TypeError('Game phase must be dawn, dusk, or empty');
  }
  assertBoolean(game.awaitingFirstDay, 'game.awaitingFirstDay');

  const counts = standardCounts(playerCount);
  if (!counts) {
    throw new TypeError('Player count must be a supported table size');
  }
  if (
    !Number.isInteger(travellerCount) ||
    travellerCount < MIN_TRAVELLER_COUNT ||
    travellerCount > MAX_TRAVELLER_COUNT
  ) {
    throw new TypeError('Traveller count must be a whole number from 0 to 5');
  }

  assertBoolean(timer.active, 'timer.active');
  assertBoolean(timer.running, 'timer.running');
  assertBoolean(timer.reset, 'timer.reset');
  if (timer.kind !== 'day' && timer.kind !== 'wake-up' && timer.kind !== null) {
    throw new TypeError('Countdown kind must be day, wake-up, or none');
  }

  // Dusk is the completed day, including when the countdown is no longer
  // running. Wake Up and a running day are their own phases. A stopped
  // countdown with time left is paused or ready, which dusk is not.
  let projected;
  if (game.phase === 'dusk') {
    assertIdleTimer(timer);
    projected = stillProjection('night', 'finished', timer.remainingMs);
  } else if (timer.active && timer.kind === 'wake-up') {
    projected = runningProjection(timer, 'wake', 'wake');
  } else if (game.phase === 'dawn') {
    throw new TypeError('Wake Up is published only while its countdown is running');
  } else if (timer.active && timer.kind === 'day') {
    projected = runningProjection(timer, 'day', 'day');
  } else if (game.awaitingFirstDay) {
    assertIdleTimer(timer);
    projected = stillProjection('pregame', 'idle', timer.remainingMs);
  } else if (!timer.active && timer.remainingMs > 0) {
    if (timer.running || timer.kind != null) {
      throw new TypeError('A stopped day countdown has no active segment');
    }
    projected = stillProjection(
      'day',
      timer.reset ? 'ready' : 'paused',
      timer.remainingMs
    );
  } else if (
    game.phase === '' &&
    !timer.active &&
    !timer.running &&
    !timer.reset &&
    timer.kind == null
  ) {
    projected = stillProjection('idle', 'idle', timer.remainingMs);
  } else {
    throw new TypeError('This gameplay state has no public companion phase');
  }

  return {
    v: COMPANION_PROTOCOL_VERSION,
    phase: projected.phase,
    day: game.currentDay,
    counts: { ...counts, traveller: travellerCount },
    timer: {
      status: projected.status,
      kind: projected.kind,
      remainingMs: projected.remainingMs,
      rate: projected.rate,
    },
  };
}

function combinationAllowed(phase, timer) {
  const { status, kind, remainingMs, rate } = timer;
  const running = status === 'running';
  if (running) {
    return (
      (phase === 'wake' || phase === 'day') &&
      kind === (phase === 'wake' ? 'wake' : 'day') &&
      remainingMs >= 0 &&
      rate > 0
    );
  }
  if (kind !== null || rate !== 0) return false;
  if (phase === 'day' && (status === 'paused' || status === 'ready')) {
    return remainingMs > 0;
  }
  if (phase === 'night' && status === 'finished') return remainingMs === 0;
  if ((phase === 'idle' || phase === 'pregame') && status === 'idle') {
    return remainingMs === 0;
  }
  return false;
}

/**
 * Check a protocol v1 payload. Malformed data is rejected, not repaired.
 * Revision and server time are not part of this payload; a message that
 * includes them fails as an unknown field.
 *
 * @returns {{ ok: true, value: object } | { ok: false, reason: string }}
 */
export function validateCompanionState(value) {
  if (!isPlainObject(value)) return fail('not-an-object');
  const shape = exactKeys(value, PROJECTION_KEYS);
  if (shape) return fail(shape);
  if (value.v !== COMPANION_PROTOCOL_VERSION) {
    return fail('unsupported-version');
  }
  if (!PHASES.has(value.phase)) return fail('invalid-phase');
  if (
    !Number.isInteger(value.day) ||
    value.day < 1 ||
    value.day > MAX_COMPANION_DAY
  ) {
    return fail('invalid-day');
  }
  if (!isPlainObject(value.counts)) return fail('invalid-counts');
  const countShape = exactKeys(value.counts, COUNT_KEYS);
  if (countShape) return fail(countShape);

  for (const [index, key] of STANDARD_COUNT_KEYS.entries()) {
    const count = value.counts[key];
    if (!Number.isInteger(count)) return fail('invalid-count');
    const { min, max } = countExtremes[index];
    if (count < min || count > max) return fail('out-of-range-count');
  }
  const standard = STANDARD_COUNT_KEYS.map((key) => value.counts[key]).join(',');
  if (!distributions.has(standard)) return fail('unknown-distribution');

  const travellers = value.counts.traveller;
  if (!Number.isInteger(travellers)) return fail('invalid-count');
  if (travellers < MIN_TRAVELLER_COUNT || travellers > MAX_TRAVELLER_COUNT) {
    return fail('out-of-range-count');
  }

  if (!isPlainObject(value.timer)) return fail('invalid-timer');
  const timerShape = exactKeys(value.timer, TIMER_KEYS);
  if (timerShape) return fail(timerShape);
  if (!STATUSES.has(value.timer.status)) return fail('invalid-status');
  if (value.timer.kind !== null && !KINDS.has(value.timer.kind)) {
    return fail('invalid-kind');
  }
  if (!Number.isFinite(value.timer.remainingMs) || value.timer.remainingMs < 0) {
    return fail('invalid-remaining');
  }
  if (!Number.isFinite(value.timer.rate) || value.timer.rate < 0) {
    return fail('invalid-rate');
  }
  if (!combinationAllowed(value.phase, value.timer)) {
    return fail('invalid-combination');
  }
  return { ok: true, value };
}

/**
 * Compare a transport revision with the one already held.
 * Revisions are not created here. The first held value is null.
 * A usable revision is an integer of 1 or more. A gap is acceptable,
 * because each payload is a full snapshot.
 *
 * @returns {'accept' | 'duplicate' | 'older' | 'invalid'}
 */
export function decideRevision(heldRev, incomingRev) {
  const usable = (rev) => Number.isInteger(rev) && rev >= 1;
  if (!usable(incomingRev)) return 'invalid';
  if (heldRev == null) return 'accept';
  if (!usable(heldRev)) return 'invalid';
  if (incomingRev === heldRev) return 'duplicate';
  if (incomingRev < heldRev) return 'older';
  return 'accept';
}

/**
 * Whether a received snapshot is older than the caller's limit.
 * `receivedAt` and `now` are timestamps on the same clock, supplied by
 * the caller. The limit is also the caller's. This does not watch the
 * network or the page.
 */
export function isSnapshotStale({ receivedAt, now, limitMs }) {
  if (
    !Number.isFinite(receivedAt) ||
    !Number.isFinite(now) ||
    !Number.isFinite(limitMs) ||
    limitMs < 0
  ) {
    throw new TypeError(
      'Staleness needs finite timestamps and a non-negative limit'
    );
  }
  return now - receivedAt > limitMs;
}
