import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCompanionClient } from '../companionClient.js';

class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static sockets = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeSocket.OPEN;
    this.sent = [];
    FakeSocket.sockets.push(this);
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  close() {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
}

function day(remainingMs, status = 'running') {
  return {
    v: 1,
    phase: status === 'finished' ? 'night' : 'day',
    day: 2,
    counts: { townsfolk: 7, outsider: 0, minion: 2, demon: 1, traveller: 1 },
    timer: {
      status,
      kind: status === 'running' ? 'day' : null,
      remainingMs,
      rate: status === 'running' ? 1 : 0,
    },
  };
}

function harness() {
  FakeSocket.sockets = [];
  let wall = 10_000;
  let monoNow = 100;
  const pending = [];
  const client = createCompanionClient({
    baseUrl: 'http://127.0.0.1:8787',
    WebSocket: FakeSocket,
    now: () => wall,
    mono: () => monoNow,
    random: () => 0,
    setTimeout(fn, delay) {
      const id = pending.length + 1;
      pending.push({ id, fn, delay });
      return id;
    },
    clearTimeout(id) {
      const index = pending.findIndex((item) => item.id === id);
      if (index >= 0) pending.splice(index, 1);
    },
  });
  return {
    client,
    pending,
    set wall(value) { wall = value; },
    set monoNow(value) { monoNow = value; },
    get wall() { return wall; },
    get monoNow() { return monoNow; },
  };
}

describe('companion client', () => {
  it('projects an adjusted countdown and ignores an older revision', async () => {
    const env = harness();
    env.client.join('ABCDEF');
    const socket = FakeSocket.sockets[0];
    assert.equal(socket.url.endsWith('/sessions/ABCDEF'), true);
    socket.onopen?.();
    const ping = socket.sent[0];
    socket.receive({ type: 'pong', id: ping.id, serverTime: 10_000 });

    socket.receive({
      type: 'snapshot',
      rev: 2,
      serverTime: 10_100,
      capturedAt: 9_000,
      upstreamOffsetMs: 1_000,
      state: day(60_000),
    });
    env.monoNow = 2_100;
    const view = env.client.view();
    assert.equal(view.connection, 'live');
    assert.equal(view.timing, 'adjusted');
    assert.equal(view.fresh, true);
    assert.equal(view.counts.traveller, 1);
    assert.equal(view.remainingMs, 58_000);
    assert.equal(view.confirmedComplete, false);

    socket.receive({
      type: 'snapshot',
      rev: 1,
      serverTime: 9_000,
      capturedAt: 8_000,
      upstreamOffsetMs: 1_000,
      state: day(10_000),
    });
    assert.equal(env.client.view().rev, 2);
    assert.equal(env.client.view().remainingMs, 58_000);
  });

  it('holds a paused countdown and marks a quiet socket stale', () => {
    const env = harness();
    env.client.join('ABCDEF');
    const socket = FakeSocket.sockets[0];
    socket.receive({
      type: 'snapshot',
      rev: 1,
      serverTime: 10_000,
      capturedAt: null,
      upstreamOffsetMs: null,
      state: day(40_000, 'paused'),
    });
    env.monoNow = 5_000;
    const paused = env.client.view();
    assert.equal(paused.remainingMs, 40_000);
    assert.equal(paused.locallyComplete, false);
    assert.equal(paused.fresh, true);

    env.monoNow = 40_000;
    const quiet = env.client.view();
    assert.equal(quiet.stale, true);
    assert.equal(quiet.fresh, false);
    assert.equal(quiet.connection, 'live');
    assert.equal(quiet.remainingMs, 40_000);
  });

  it('refreshes on the same revision and stops when the session ends', () => {
    const env = harness();
    env.client.join('ABCDEF');
    const socket = FakeSocket.sockets[0];
    socket.receive({
      type: 'snapshot',
      rev: 3,
      serverTime: 10_000,
      capturedAt: 10_000,
      upstreamOffsetMs: 0,
      state: day(5_000),
    });
    env.monoNow = 30_000;
    assert.equal(env.client.view().fresh, false);
    socket.receive({
      type: 'snapshot',
      rev: 3,
      serverTime: 40_000,
      capturedAt: 40_000,
      upstreamOffsetMs: 0,
      state: day(5_000),
    });
    assert.equal(env.client.view().fresh, true);
    socket.receive({ type: 'session-ended', reason: 'ended' });
    assert.equal(env.client.view().connection, 'ended');
    assert.equal(env.pending.length, 0);
  });

  it('records an unsupported snapshot version and clears it on leave', () => {
    const env = harness();
    env.client.join('ABCDEF');
    const socket = FakeSocket.sockets[0];
    socket.receive({
      type: 'snapshot',
      rev: 1,
      serverTime: 10_000,
      capturedAt: 10_000,
      upstreamOffsetMs: 0,
      state: { ...day(5_000), v: 2 },
    });
    assert.equal(env.client.view().problem, 'unsupported-version');
    assert.equal(env.client.view().timerStatus, null);
    env.client.leave();
    assert.equal(env.client.view().connection, 'idle');
    assert.equal(env.client.view().problem, null);
  });
});
