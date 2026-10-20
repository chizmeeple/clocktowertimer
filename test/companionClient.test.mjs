import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { presentCompanionPlayerShare } from '../js/companionCode.js';
import {
  PING_KEEPALIVE_MS,
  PING_RETRY_MS,
  PONG_TIMEOUT_MS,
  STATUS_TIMEOUT_MS,
  createCompanionClient,
} from '../js/companionClient.js';

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

function statusResult(status, httpStatus = 200) {
  return {
    ok: httpStatus >= 200 && httpStatus < 300,
    status: httpStatus,
    async json() {
      return { status };
    },
  };
}

function harness({ fetch: doFetch } = {}) {
  FakeSocket.sockets = [];
  let wall = 10_000;
  let monoNow = 100;
  const pending = [];
  const client = createCompanionClient({
    baseUrl: 'http://127.0.0.1:8787',
    WebSocket: FakeSocket,
    fetch: doFetch ?? (async () => statusResult('active')),
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
    assert.equal(env.client.view().code, null);
    assert.equal(presentCompanionPlayerShare(env.client.view()).canShare, false);
  });

  it('shares a live code through a reconnect, then forgets it when the session ends', () => {
    class HeldSocket {
      static OPEN = 1;

      constructor() {
        this.readyState = 0;
        HeldSocket.latest = this;
      }

      send() {}

      close() {
        this.readyState = 3;
        this.onclose?.();
      }

      receive(message) {
        this.onmessage?.({ data: JSON.stringify(message) });
      }
    }

    const client = createCompanionClient({
      baseUrl: 'http://127.0.0.1:8787',
      WebSocket: HeldSocket,
      fetch: async () => statusResult('active'),
      now: () => 10_000,
      mono: () => 100,
      random: () => 0,
      setTimeout() {
        return 1;
      },
      clearTimeout() {},
    });

    client.join('ABC123');
    const first = client.view();
    assert.equal(first.connection, 'connecting');
    assert.equal(first.established, false);
    assert.equal(presentCompanionPlayerShare(first).canShare, false);

    HeldSocket.latest.close();
    const failed = client.view();
    assert.equal(failed.connection, 'reconnecting');
    assert.equal(failed.established, false);
    assert.equal(presentCompanionPlayerShare(failed).playerUrl, '');

    client.join('ABC123');
    HeldSocket.latest.readyState = HeldSocket.OPEN;
    const live = client.view();
    assert.equal(live.connection, 'live');
    assert.equal(live.code, 'ABC123');
    assert.equal(presentCompanionPlayerShare(live).playerUrl, 'https://timer.arcane-scripts.net/c?code=ABC123');

    HeldSocket.latest.close();
    const reconnecting = client.view();
    assert.equal(reconnecting.connection, 'reconnecting');
    assert.equal(reconnecting.code, 'ABC123');
    assert.equal(reconnecting.established, true);
    assert.equal(
      presentCompanionPlayerShare(reconnecting).playerUrl,
      'https://timer.arcane-scripts.net/c?code=ABC123'
    );

    HeldSocket.latest = null;
    client.join('ABC123');
    const again = HeldSocket.latest;
    again.readyState = HeldSocket.OPEN;
    client.view();
    again.receive({ type: 'session-ended', reason: 'ended' });
    const ended = client.view();
    assert.equal(ended.connection, 'ended');
    assert.equal(ended.code, null);
    assert.equal(presentCompanionPlayerShare(ended).canShare, false);

    client.join('NEWCDE');
    const next = client.view();
    assert.equal(next.connection, 'connecting');
    assert.equal(next.code, 'NEWCDE');
    assert.equal(presentCompanionPlayerShare(next).playerUrl, '');
    assert.equal(JSON.stringify(next).includes('ABC123'), false);
    HeldSocket.latest.readyState = HeldSocket.OPEN;
    const replacement = client.view();
    assert.equal(replacement.code, 'NEWCDE');
    assert.equal(
      presentCompanionPlayerShare(replacement).playerUrl,
      'https://timer.arcane-scripts.net/c?code=NEWCDE'
    );
  });

  it('counts down from the snapshot without a message every second', () => {
    const env = harness();
    env.client.join('ABCDEF');
    const socket = FakeSocket.sockets[0];
    socket.onopen?.();
    const ping = socket.sent.find((message) => message.type === 'ping');
    socket.receive({ type: 'pong', id: ping.id, serverTime: 10_000 });
    socket.receive({
      type: 'snapshot',
      rev: 1,
      serverTime: 10_000,
      capturedAt: 10_000,
      upstreamOffsetMs: 0,
      state: day(60_000),
    });
    env.monoNow = 4_100;
    assert.equal(env.client.view().remainingMs, 56_000);
    assert.equal(env.client.view().fresh, true);
    assert.equal(socket.sent.filter((message) => message.type === 'ping').length, 1);
  });

  it('drops a frozen clock when the page returns and takes the next snapshot', () => {
    const env = harness();
    env.client.join('ABCDEF');
    const socket = FakeSocket.sockets[0];
    socket.onopen?.();
    const ping = socket.sent.find((message) => message.type === 'ping');
    socket.receive({ type: 'pong', id: ping.id, serverTime: 10_000 });
    socket.receive({
      type: 'snapshot',
      rev: 4,
      serverTime: 10_000,
      capturedAt: 10_000,
      upstreamOffsetMs: 0,
      state: day(60_000),
    });
    env.monoNow = 5_100;
    assert.equal(env.client.view().remainingMs, 55_000);

    env.wall = 70_000;
    env.client.resume();
    const returned = env.client.view();
    assert.equal(returned.connection, 'reconnecting');
    assert.equal(returned.fresh, false);
    assert.equal(returned.remainingMs, 60_000);
    assert.equal(FakeSocket.sockets.length, 2);
    assert.equal(FakeSocket.sockets[0].readyState, FakeSocket.CLOSED);

    const next = FakeSocket.sockets[1];
    next.onopen?.();
    next.receive({
      type: 'snapshot',
      rev: 8,
      serverTime: 70_000,
      capturedAt: 70_000,
      upstreamOffsetMs: 0,
      state: day(10_000),
    });
    const caughtUp = env.client.view();
    assert.equal(caughtUp.connection, 'live');
    assert.equal(caughtUp.fresh, true);
    assert.equal(caughtUp.remainingMs, 10_000);
    env.wall = 73_000;
    assert.equal(env.client.view().remainingMs, 7_000);
  });

  it('retries a ping that is too slow to trust and reconnects when a ping is not answered', () => {
    const coarse = harness();
    coarse.client.join('ABCDEF');
    const coarseSocket = FakeSocket.sockets[0];
    coarseSocket.onopen?.();
    const coarsePing = coarseSocket.sent.find((message) => message.type === 'ping');
    coarse.wall = 10_800;
    coarseSocket.receive({ type: 'pong', id: coarsePing.id, serverTime: 10_400 });
    assert.equal(coarseSocket.sent.filter((message) => message.type === 'ping').length, 1);
    assert.equal(coarse.pending[0].delay, PING_KEEPALIVE_MS);

    const env = harness();
    env.client.join('ABCDEF');
    const socket = FakeSocket.sockets[0];
    socket.onopen?.();
    const ping = socket.sent.find((message) => message.type === 'ping');
    env.wall = 14_000;
    socket.receive({ type: 'pong', id: ping.id, serverTime: 12_000 });
    assert.equal(socket.sent.filter((message) => message.type === 'ping').length, 1);
    assert.equal(env.pending[0].delay, PING_RETRY_MS);
    env.pending[0].fn();
    env.pending.shift();
    assert.equal(socket.sent.filter((message) => message.type === 'ping').length, 2);

    const quiet = harness();
    quiet.client.join('ABCDEF');
    const open = FakeSocket.sockets[0];
    open.onopen?.();
    assert.equal(quiet.pending[0].delay, PONG_TIMEOUT_MS);
    quiet.pending[0].fn();
    quiet.pending.shift();
    assert.equal(quiet.client.view().connection, 'reconnecting');
    assert.equal(open.readyState, FakeSocket.CLOSED);
    assert.equal(quiet.pending[0].delay, 500);
  });

  it('keeps a keepalive after a usable ping and clears it when the session ends', () => {
    const env = harness();
    env.client.join('ABCDEF');
    const socket = FakeSocket.sockets[0];
    socket.onopen?.();
    const ping = socket.sent.find((message) => message.type === 'ping');
    socket.receive({ type: 'pong', id: ping.id, serverTime: 10_000 });
    assert.equal(env.pending.length, 1);
    assert.equal(env.pending[0].delay, PING_KEEPALIVE_MS);
    socket.receive({ type: 'session-ended', reason: 'ended' });
    assert.equal(env.pending.length, 0);
    assert.equal(env.client.view().connection, 'ended');
  });

  it('does not call an open socket stale before the first message', () => {
    const env = harness();
    env.client.join('ABCDEF');
    const waiting = env.client.view();
    assert.equal(waiting.connection, 'live');
    assert.equal(waiting.stale, false);
    assert.equal(waiting.fresh, false);
  });
});

function later() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

async function settle() {
  await later();
  await later();
}

describe('companion status after a failed upgrade', () => {
  it('keeps retrying when the session is still active and takes the next snapshot', async () => {
    const urls = [];
    const env = harness({
      fetch: async (url) => {
        urls.push(url);
        return statusResult('active');
      },
    });
    env.client.join('ABCDEF');
    FakeSocket.sockets[0].close();
    await settle();
    assert.equal(env.client.view().connection, 'reconnecting');
    assert.equal(urls.length, 1);
    assert.equal(urls[0].endsWith('/sessions/ABCDEF/status'), true);
    const retry = env.pending.find((timer) => timer.delay === 500);
    assert.ok(retry);
    retry.fn();
    const next = FakeSocket.sockets.at(-1);
    next.onopen?.();
    const ping = next.sent.find((message) => message.type === 'ping');
    next.receive({ type: 'pong', id: ping.id, serverTime: 10_000 });
    next.receive({
      type: 'snapshot',
      rev: 4,
      serverTime: 10_000,
      capturedAt: 10_000,
      upstreamOffsetMs: 0,
      state: day(60_000),
    });
    assert.equal(env.client.view().connection, 'live');
    assert.equal(env.client.view().rev, 4);
    assert.equal(env.client.view().remainingMs, 60_000);
    assert.equal(urls.length, 1);
  });

  it('stops after a failed upgrade when the session is gone and does not keep counting', async () => {
    const env = harness({
      fetch: async () => statusResult('unavailable'),
    });
    env.client.join('ABCDEF');
    const open = FakeSocket.sockets[0];
    open.onopen?.();
    const ping = open.sent.find((message) => message.type === 'ping');
    open.receive({ type: 'pong', id: ping.id, serverTime: 10_000 });
    open.receive({
      type: 'snapshot',
      rev: 2,
      serverTime: 10_000,
      capturedAt: 10_000,
      upstreamOffsetMs: 0,
      state: day(60_000),
    });
    env.monoNow = 5_100;
    env.wall = 15_000;
    assert.equal(env.client.view().remainingMs, 55_000);
    open.close();
    const retry = env.pending.find((timer) => timer.delay === 500);
    retry.fn();
    const failed = FakeSocket.sockets.at(-1);
    failed.close();
    await settle();
    const stopped = env.client.view();
    assert.equal(stopped.connection, 'expired');
    assert.equal(stopped.code, null);
    assert.equal(stopped.fresh, false);
    assert.equal(stopped.remainingMs, 55_000);
    env.monoNow = 20_000;
    env.wall = 30_000;
    assert.equal(env.client.view().remainingMs, 55_000);
    assert.equal(env.client.view().connection, 'expired');

    const sockets = FakeSocket.sockets.length;
    env.client.resume();
    for (const timer of [...env.pending]) timer.fn();
    await settle();
    assert.equal(FakeSocket.sockets.length, sockets);
    assert.equal(env.client.view().connection, 'expired');

    env.client.join('NEWCDE');
    assert.equal(env.client.view().connection, 'live');
    assert.equal(env.client.view().code, 'NEWCDE');
  });

  it('treats HTTP 410 as a finished session', async () => {
    const env = harness({
      fetch: async () => statusResult('active', 410),
    });
    env.client.join('ABCDEF');
    FakeSocket.sockets[0].close();
    await settle();
    assert.equal(env.client.view().connection, 'expired');
    assert.equal(env.pending.length, 0);
  });

  it('keeps reconnecting when the status request fails, times out, or is rate limited', async () => {
    const failure = harness({
      fetch: async () => {
        throw new Error('offline');
      },
    });
    failure.client.join('ABCDEF');
    FakeSocket.sockets[0].close();
    await settle();
    assert.equal(failure.client.view().connection, 'reconnecting');
    assert.equal(failure.pending.some((timer) => timer.delay === 500), true);

    const limited = harness({
      fetch: async () => statusResult('unavailable', 429),
    });
    limited.client.join('ABCDEF');
    FakeSocket.sockets[0].close();
    await settle();
    assert.equal(limited.client.view().connection, 'reconnecting');
    assert.equal(limited.pending.some((timer) => timer.delay === 500), true);

    const broken = harness({
      fetch: async () => statusResult('unavailable', 503),
    });
    broken.client.join('ABCDEF');
    FakeSocket.sockets[0].close();
    await settle();
    assert.equal(broken.client.view().connection, 'reconnecting');

    const hung = harness({
      fetch: (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    });
    hung.client.join('ABCDEF');
    FakeSocket.sockets[0].close();
    const timeout = hung.pending.find((timer) => timer.delay === STATUS_TIMEOUT_MS);
    assert.ok(timeout);
    assert.equal(hung.pending.some((timer) => timer.delay === 500), false);
    timeout.fn();
    await settle();
    assert.equal(hung.client.view().connection, 'reconnecting');
    assert.equal(hung.pending.some((timer) => timer.delay === 500), true);
    assert.equal(FakeSocket.sockets.length, 1);
  });

  it('ignores a late status after leave, resume, or a different code', async () => {
    let gate;
    const leaveEnv = harness({
      fetch: () => new Promise((resolve) => {
        gate = resolve;
      }),
    });
    leaveEnv.client.join('ABCDEF');
    FakeSocket.sockets[0].close();
    assert.equal(leaveEnv.client.view().connection, 'reconnecting');
    leaveEnv.client.leave();
    gate(statusResult('unavailable'));
    await settle();
    assert.equal(leaveEnv.client.view().connection, 'idle');
    assert.equal(leaveEnv.client.view().code, null);
    const leftSockets = FakeSocket.sockets.length;
    for (const timer of [...leaveEnv.pending]) timer.fn();
    await settle();
    assert.equal(FakeSocket.sockets.length, leftSockets);

    let resumeGate;
    const resumeEnv = harness({
      fetch: () => new Promise((resolve) => {
        resumeGate = resolve;
      }),
    });
    resumeEnv.client.join('ABCDEF');
    FakeSocket.sockets[0].close();
    resumeEnv.client.resume();
    resumeGate(statusResult('unavailable'));
    await settle();
    assert.equal(resumeEnv.client.view().code, 'ABCDEF');
    assert.notEqual(resumeEnv.client.view().connection, 'expired');
    assert.equal(FakeSocket.sockets.length, 2);

    let changeGate;
    const changeEnv = harness({
      fetch: () => new Promise((resolve) => {
        changeGate = resolve;
      }),
    });
    changeEnv.client.join('ABCDEF');
    FakeSocket.sockets[0].close();
    changeEnv.client.join('ZZZZZZ');
    changeGate(statusResult('unavailable'));
    await settle();
    assert.equal(changeEnv.client.view().code, 'ZZZZZZ');
    assert.notEqual(changeEnv.client.view().connection, 'expired');
  });

  it('does not ask when the player leaves or the socket had already opened', async () => {
    let calls = 0;
    const env = harness({
      fetch: async () => {
        calls += 1;
        return statusResult('unavailable');
      },
    });
    env.client.join('ABCDEF');
    env.client.leave();
    await settle();
    assert.equal(calls, 0);
    assert.equal(env.client.view().connection, 'idle');

    env.client.join('ABCDEF');
    const socket = FakeSocket.sockets.at(-1);
    socket.onopen?.();
    socket.close();
    await settle();
    assert.equal(calls, 0);
    assert.equal(env.client.view().connection, 'reconnecting');
    assert.equal(env.pending.some((timer) => timer.delay === 500), true);
  });
});
