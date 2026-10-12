import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createStorytellerTransport } from '../companionTransport.js';

const TOKEN = 'storyteller-write-token-value';

class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static sockets = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeSocket.CONNECTING;
    this.sent = [];
    FakeSocket.sockets.push(this);
    queueMicrotask(() => {
      if (this.readyState !== FakeSocket.CONNECTING) return;
      this.readyState = FakeSocket.OPEN;
      this.onopen?.();
    });
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  close(code = 1006) {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({ code });
  }
}

function timers() {
  const pending = [];
  return {
    pending,
    schedule(fn, delay) {
      const id = pending.length + 1;
      pending.push({ id, fn, delay });
      return id;
    },
    cancel(id) {
      const index = pending.findIndex((item) => item.id === id);
      if (index >= 0) pending.splice(index, 1);
    },
    fire() {
      const next = pending.shift();
      next.fn();
    },
  };
}

function harness() {
  FakeSocket.sockets = [];
  const clock = timers();
  const posts = [];
  let enabled = 0;
  let disabled = 0;
  let republished = 0;
  let wall = 5_000;
  const statuses = [];
  const transport = createStorytellerTransport({
    baseUrl: 'http://127.0.0.1:8787',
    fetch: async (url, options) => {
      posts.push({ url, method: options?.method });
      return {
        ok: true,
        async json() {
          return { code: 'ABCDEF', writeToken: TOKEN };
        },
      };
    },
    WebSocket: FakeSocket,
    now: () => wall,
    random: () => 0,
    setTimeout: clock.schedule,
    clearTimeout: clock.cancel,
    enablePublishing(submit) {
      enabled += 1;
      transport.submit = submit;
    },
    disablePublishing() {
      disabled += 1;
    },
    republish() {
      republished += 1;
      transport.submit?.({ v: 1, phase: 'idle' });
    },
    onStatus(status) {
      statuses.push(status);
    },
  });
  return { transport, posts, clock, statuses, get enabled() { return enabled; }, get disabled() { return disabled; }, get republished() { return republished; }, set wall(value) { wall = value; } };
}

const day = {
  v: 1,
  phase: 'day',
  day: 1,
  counts: { townsfolk: 7, outsider: 0, minion: 2, demon: 1, traveller: 0 },
  timer: { status: 'running', kind: 'day', remainingMs: 50_000, rate: 1 },
};

describe('storyteller transport', () => {
  it('creates a session and authenticates without putting the token in the url', async () => {
    const { transport, posts } = harness();
    await transport.start();
    await Promise.resolve();
    const socket = FakeSocket.sockets[0];
    assert.equal(posts[0].url, 'http://127.0.0.1:8787/sessions');
    assert.equal(socket.url.includes(TOKEN), false);
    assert.equal(socket.url.endsWith('/sessions/ABCDEF/storyteller'), true);
    assert.deepEqual(socket.sent[0], { type: 'auth', token: TOKEN });

    socket.receive({ type: 'authenticated' });
    transport.submit(day);
    const publish = socket.sent.find((message) => message.type === 'publish');
    assert.deepEqual(publish.state, day);
    assert.equal(publish.capturedAt, 5_000);
    assert.equal('upstreamOffsetMs' in publish, false);
    assert.equal(JSON.stringify(socket.sent).includes('settings'), false);

    socket.receive({ type: 'published', rev: 4, serverTime: 5_010 });
    assert.equal(transport.status.delivery, 'accepted');
    assert.equal(transport.status.acceptedRev, 4);
    assert.equal(transport.status.connection, 'live');
  });

  it('reconnects once, reauthenticates, and sends a fresh snapshot', async () => {
    const env = harness();
    await env.transport.start();
    await Promise.resolve();
    const first = FakeSocket.sockets[0];
    first.receive({ type: 'authenticated' });
    assert.equal(env.enabled, 1);
    first.close();
    assert.equal(env.transport.status.connection, 'reconnecting');
    assert.equal(env.clock.pending.length, 1);
    env.clock.fire();
    await Promise.resolve();
    const second = FakeSocket.sockets[1];
    second.receive({ type: 'authenticated' });
    assert.equal(env.enabled, 1);
    assert.equal(env.republished, 1);
    assert.equal(second.sent.some((message) => message.type === 'publish'), true);
    assert.equal(
      FakeSocket.sockets.filter((item) => item.readyState === FakeSocket.OPEN).length,
      1
    );
  });

  it('does not reconnect after replacement, expiry, or an intentional stop', async () => {
    const replaced = harness();
    await replaced.transport.start();
    await Promise.resolve();
    const socket = FakeSocket.sockets[0];
    socket.receive({ type: 'authenticated' });
    socket.receive({ type: 'replaced' });
    assert.equal(replaced.transport.status.connection, 'replaced');
    assert.equal(replaced.clock.pending.length, 0);
    assert.equal(replaced.disabled, 1);

    const ended = harness();
    await ended.transport.start();
    await Promise.resolve();
    const ending = FakeSocket.sockets.at(-1);
    ending.receive({ type: 'authenticated' });
    ending.receive({ type: 'session-ended', reason: 'lifetime' });
    assert.equal(ended.transport.status.connection, 'expired');
    assert.equal(ended.clock.pending.length, 0);

    const stopped = harness();
    await stopped.transport.start();
    await Promise.resolve();
    stopped.transport.stop();
    assert.equal(stopped.transport.status.connection, 'disconnected');
    assert.equal(stopped.clock.pending.length, 0);
    FakeSocket.sockets.at(-1).close();
    assert.equal(stopped.clock.pending.length, 0);
  });

  it('retries one unacknowledged publish and ignores an old acknowledgement', async () => {
    const { transport, clock } = harness();
    await transport.start();
    await Promise.resolve();
    const socket = FakeSocket.sockets[0];
    socket.receive({ type: 'authenticated' });
    transport.submit(day);
    const firstSends = socket.sent.filter((message) => message.type === 'publish');
    assert.equal(firstSends.length, 1);
    assert.equal(transport.status.delivery, 'sent');
    clock.fire();
    const retried = socket.sent.filter((message) => message.type === 'publish');
    assert.equal(retried.length, 2);
    clock.fire();
    socket.close();
    clock.fire();
    await Promise.resolve();
    socket.receive({ type: 'published', rev: 9, serverTime: 1 });
    assert.equal(transport.status.acceptedRev, null);
  });
});
