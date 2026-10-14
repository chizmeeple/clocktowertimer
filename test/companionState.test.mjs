import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { characterAmounts } from '../js/helper.js';
import {
  decideRevision,
  isSnapshotStale,
  projectCompanionState,
  validateCompanionState,
} from '../js/companionState.js';

function game(overrides = {}) {
  return {
    currentDay: 1,
    phase: '',
    awaitingFirstDay: false,
    ...overrides,
  };
}

function timer(overrides = {}) {
  return {
    remainingMs: 0,
    running: false,
    reset: false,
    active: false,
    kind: null,
    rate: 0,
    ...overrides,
  };
}

function project(overrides = {}) {
  return projectCompanionState({
    game: game(),
    timer: timer(),
    playerCount: 10,
    travellerCount: 0,
    ...overrides,
  });
}

function reasons(value) {
  return validateCompanionState(value).reason;
}

describe('companion projection', () => {
  it('publishes all five counts, including zero travellers', () => {
    const projected = project();
    assert.deepEqual(projected.counts, {
      townsfolk: 7,
      outsider: 0,
      minion: 2,
      demon: 1,
      traveller: 0,
    });
    assert.deepEqual(validateCompanionState(projected), {
      ok: true,
      value: projected,
    });
  });

  it('keeps the four standard counts when the traveller count changes', () => {
    for (const playerCount of Object.keys(characterAmounts).map(Number)) {
      const row = characterAmounts[playerCount];
      for (const travellerCount of [0, 3, 5]) {
        const projected = project({ playerCount, travellerCount });
        assert.deepEqual(
          [
            projected.counts.townsfolk,
            projected.counts.outsider,
            projected.counts.minion,
            projected.counts.demon,
          ],
          row
        );
        assert.equal(projected.counts.traveller, travellerCount);
      }
    }
  });

  it('rejects a traveller count outside 0 to 5 and an unknown table size', () => {
    assert.throws(() => project({ travellerCount: 6 }), /Traveller count/);
    assert.throws(() => project({ travellerCount: -1 }), /Traveller count/);
    assert.throws(() => project({ travellerCount: 1.5 }), /Traveller count/);
    assert.throws(() => project({ playerCount: 4 }), /Player count/);
    assert.throws(() => project({ playerCount: 16 }), /Player count/);
  });

  it('describes the open page, a new game, and a completed day separately', () => {
    assert.deepEqual(project(), {
      v: 1,
      phase: 'idle',
      day: 1,
      counts: {
        townsfolk: 7,
        outsider: 0,
        minion: 2,
        demon: 1,
        traveller: 0,
      },
      timer: { status: 'idle', kind: null, remainingMs: 0, rate: 0 },
    });

    const waiting = project({
      game: game({ currentDay: 1, awaitingFirstDay: true }),
    });
    assert.equal(waiting.phase, 'pregame');
    assert.equal(waiting.timer.status, 'idle');

    const ended = project({
      game: game({ currentDay: 3, phase: 'dusk' }),
    });
    assert.equal(ended.phase, 'night');
    assert.equal(ended.day, 3);
    assert.equal(ended.timer.status, 'finished');
    assert.notEqual(ended.phase, waiting.phase);
  });

  it('publishes Wake Up as a running countdown of its own kind', () => {
    const projected = project({
      game: game({ currentDay: 2, phase: 'dawn' }),
      timer: timer({
        remainingMs: 6000,
        running: false,
        active: true,
        kind: 'wake-up',
        rate: 1,
      }),
    });
    assert.equal(projected.phase, 'wake');
    assert.deepEqual(projected.timer, {
      status: 'running',
      kind: 'wake',
      remainingMs: 6000,
      rate: 1,
    });
    assert.throws(
      () =>
        project({
          game: game({ phase: 'dawn' }),
          timer: timer({ remainingMs: 6000 }),
        }),
      /Wake Up is published only while its countdown is running/
    );
  });

  it('keeps a running day, a paused day, and a reset day distinct', () => {
    const running = project({
      game: game({ currentDay: 4, awaitingFirstDay: true }),
      timer: timer({
        remainingMs: 125400,
        running: true,
        active: true,
        kind: 'day',
        rate: 1,
      }),
    });
    assert.equal(running.phase, 'day');
    assert.equal(running.day, 4);
    assert.equal(running.timer.status, 'running');

    const paused = project({
      timer: timer({ remainingMs: 7500 }),
    });
    assert.equal(paused.phase, 'day');
    assert.equal(paused.timer.status, 'paused');
    assert.equal(paused.timer.kind, null);
    assert.equal(paused.timer.rate, 0);

    const ready = project({
      timer: timer({ remainingMs: 285000, reset: true }),
    });
    assert.equal(ready.phase, 'day');
    assert.equal(ready.timer.status, 'ready');
    assert.equal(ready.timer.remainingMs, 285000);
    assert.notEqual(ready.timer.status, paused.timer.status);
  });

  it('passes an accelerated rate through unchanged', () => {
    const projected = project({
      timer: timer({
        remainingMs: 100000,
        running: true,
        active: true,
        kind: 'day',
        rate: 40,
      }),
    });
    assert.equal(projected.timer.rate, 40);
    assert.equal(projected.timer.kind, 'day');
  });

  it('leaves private settings out of the public snapshot', () => {
    const projected = project({
      game: game({
        currentDay: 2,
        pace: 'blitz',
        usedPresetByDay: { 1: 8 },
        hiddenPresetDays: [2],
        youtubePlaylistUrl: 'https://secret.example/playlist',
        keyboardShortcuts: { wakeUp: ' ' },
        sessionEndHour: 23,
      }),
      travellerCount: 2,
    });
    const encoded = JSON.stringify(projected);
    assert.deepEqual(Object.keys(projected).sort(), [
      'counts',
      'day',
      'phase',
      'timer',
      'v',
    ]);
    assert.equal(encoded.includes('blitz'), false);
    assert.equal(encoded.includes('secret'), false);
    assert.equal(encoded.includes('wakeUp'), false);
    assert.equal(encoded.includes('sessionEndHour'), false);
    assert.equal(encoded.includes('usedPresetByDay'), false);
    assert.equal(projected.counts.traveller, 2);
    assert.equal(projected.phase, 'idle');
  });
});

describe('companion validation', () => {
  const valid = () => project({ travellerCount: 0 });

  it('rejects an unsupported version, a missing field, and an unknown field', () => {
    const payload = valid();
    assert.equal(reasons({ ...payload, v: 2 }), 'unsupported-version');
    assert.equal(reasons({ ...payload, v: '1' }), 'unsupported-version');
    const { day, ...withoutDay } = payload;
    assert.equal(reasons(withoutDay), 'missing-field');
    assert.equal(day, 1);
    assert.equal(
      reasons({ ...payload, youtubePlaylistUrl: 'https://secret.example' }),
      'unknown-field'
    );
    assert.equal(reasons(null), 'not-an-object');
    assert.equal(reasons([]), 'not-an-object');
  });

  it('rejects invalid days, counts, and distributions', () => {
    const payload = valid();
    assert.equal(reasons({ ...payload, day: 0 }), 'invalid-day');
    assert.equal(reasons({ ...payload, day: 101 }), 'invalid-day');
    assert.equal(reasons({ ...payload, day: 1.5 }), 'invalid-day');

    assert.equal(
      reasons({
        ...payload,
        counts: { ...payload.counts, traveller: 1.5 },
      }),
      'invalid-count'
    );
    assert.equal(
      reasons({
        ...payload,
        counts: { ...payload.counts, traveller: 6 },
      }),
      'out-of-range-count'
    );
    assert.equal(
      reasons({
        ...payload,
        counts: { ...payload.counts, townsfolk: 100 },
      }),
      'out-of-range-count'
    );
    assert.equal(
      reasons({
        ...payload,
        counts: { ...payload.counts, minion: 1 },
      }),
      'unknown-distribution'
    );
    const { traveller, ...withoutTraveller } = payload.counts;
    assert.equal(reasons({ ...payload, counts: withoutTraveller }), 'missing-field');
    assert.equal(traveller, 0);
    assert.equal(
      reasons({
        ...payload,
        counts: { ...payload.counts, pace: 'blitz' },
      }),
      'unknown-field'
    );
  });

  it('rejects invalid timer values and inconsistent combinations', () => {
    const payload = valid();
    const dayRunning = project({
      timer: timer({
        remainingMs: 1000,
        running: true,
        active: true,
        kind: 'day',
        rate: 1,
      }),
    });

    assert.equal(reasons({ ...payload, phase: 'dusk' }), 'invalid-phase');
    assert.equal(
      reasons({
        ...dayRunning,
        timer: { ...dayRunning.timer, kind: 'wake-up' },
      }),
      'invalid-kind'
    );
    assert.equal(
      reasons({
        ...dayRunning,
        timer: { ...dayRunning.timer, remainingMs: -1 },
      }),
      'invalid-remaining'
    );
    assert.equal(
      reasons({
        ...dayRunning,
        timer: { ...dayRunning.timer, remainingMs: Number.NaN },
      }),
      'invalid-remaining'
    );
    assert.equal(
      reasons({
        ...dayRunning,
        timer: { ...dayRunning.timer, rate: Number.POSITIVE_INFINITY },
      }),
      'invalid-rate'
    );
    assert.equal(
      reasons({
        ...dayRunning,
        timer: { ...dayRunning.timer, rate: -1 },
      }),
      'invalid-rate'
    );
    assert.equal(
      reasons({
        ...dayRunning,
        timer: { ...dayRunning.timer, rate: 0 },
      }),
      'invalid-combination'
    );
    assert.equal(
      reasons({
        ...dayRunning,
        timer: { ...dayRunning.timer, kind: null },
      }),
      'invalid-combination'
    );
    assert.equal(
      reasons({
        ...payload,
        phase: 'night',
        timer: { status: 'running', kind: 'day', remainingMs: 0, rate: 1 },
      }),
      'invalid-combination'
    );
    assert.equal(
      reasons({
        ...payload,
        phase: 'day',
        timer: { status: 'paused', kind: 'day', remainingMs: 1000, rate: 0 },
      }),
      'invalid-combination'
    );
    assert.equal(
      reasons({
        ...payload,
        phase: 'day',
        timer: { status: 'paused', kind: null, remainingMs: 0, rate: 0 },
      }),
      'invalid-combination'
    );
    assert.equal(
      reasons({
        ...payload,
        phase: 'wake',
        timer: { status: 'paused', kind: null, remainingMs: 1000, rate: 0 },
      }),
      'invalid-combination'
    );
    assert.equal(
      reasons({
        ...payload,
        timer: { ...payload.timer, status: 'complete' },
      }),
      'invalid-status'
    );
  });

  it('accepts a running day that has reached zero and a night that has finished', () => {
    const atZero = project({
      timer: timer({
        remainingMs: 0,
        running: true,
        active: true,
        kind: 'day',
        rate: 1,
      }),
    });
    assert.equal(atZero.phase, 'day');
    assert.equal(atZero.timer.status, 'running');
    assert.equal(validateCompanionState(atZero).ok, true);

    const night = project({ game: game({ currentDay: 2, phase: 'dusk' }) });
    assert.equal(validateCompanionState(night).ok, true);
    assert.equal(night.timer.status, 'finished');
  });
});

describe('revision and staleness', () => {
  it('accepts a newer revision and ignores a duplicate or an older one', () => {
    assert.equal(decideRevision(null, 1), 'accept');
    assert.equal(decideRevision(1, 2), 'accept');
    assert.equal(decideRevision(1, 5), 'accept');
    assert.equal(decideRevision(2, 2), 'duplicate');
    assert.equal(decideRevision(2, 1), 'older');
    assert.equal(decideRevision(null, 0), 'invalid');
    assert.equal(decideRevision(1, 1.5), 'invalid');
    assert.equal(decideRevision(1, -1), 'invalid');
    assert.equal(decideRevision(0, 1), 'invalid');
  });

  it('recognises a snapshot older than the supplied limit', () => {
    assert.equal(
      isSnapshotStale({ receivedAt: 0, now: 15000, limitMs: 15000 }),
      false
    );
    assert.equal(
      isSnapshotStale({ receivedAt: 0, now: 15001, limitMs: 15000 }),
      true
    );
    assert.throws(
      () => isSnapshotStale({ receivedAt: 1000, now: Number.NaN, limitMs: 1000 }),
      /finite timestamps/
    );
  });
});
