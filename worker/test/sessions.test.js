import { env, exports } from 'cloudflare:workers';
import {
  evictDurableObject,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { validateCompanionState } from '../../companionState.js';
import { setCodeSequence } from '../src/codes.js';
import { DIRECTORY_NAME } from '../src/directory.js';
import {
  CODE_PATTERN,
  CREATE_LIMIT,
  IDLE_MS,
  MAX_LIFETIME_MS,
  MAX_MESSAGE_BYTES,
  MAX_READERS,
  PUBLISH_LIMIT,
  sha256Hex,
} from '../src/protocol.js';

const ORIGIN = 'http://companion.local';

afterEach(async () => {
  setCodeSequence(null);
  await reset();
});

function runningDay(remainingMs, traveller = 0) {
  return {
    v: 1,
    phase: 'day',
    day: 3,
    counts: {
      townsfolk: 7,
      outsider: 0,
      minion: 2,
      demon: 1,
      traveller,
    },
    timer: {
      status: 'running',
      kind: 'day',
      remainingMs,
      rate: 1,
    },
  };
}

function listen(ws) {
  const queued = [];
  const waiting = [];
  const acks = [];
  const ackWaiting = [];
  ws.addEventListener('message', (event) => {
    const text = typeof event.data === 'string'
      ? event.data
      : new TextDecoder().decode(event.data);
    const value = JSON.parse(text);
    if (value.type === 'published') {
      const resolve = ackWaiting.shift();
      if (resolve) resolve(value);
      else acks.push(value);
      return;
    }
    const resolve = waiting.shift();
    if (resolve) resolve(value);
    else queued.push(value);
  });
  ws.addEventListener('error', () => {});
  return {
    async next(timeoutMs = 2000) {
      if (queued.length > 0) return queued.shift();
      return new Promise((resolve, reject) => {
        let settle;
        const timer = setTimeout(() => {
          const index = waiting.indexOf(settle);
          if (index >= 0) waiting.splice(index, 1);
          reject(new Error('timed out waiting for a socket message'));
        }, timeoutMs);
        settle = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
        waiting.push(settle);
      });
    },
    ack(timeoutMs = 2000) {
      if (acks.length > 0) return Promise.resolve(acks.shift());
      return new Promise((resolve, reject) => {
        let settle;
        const timer = setTimeout(() => {
          const index = ackWaiting.indexOf(settle);
          if (index >= 0) ackWaiting.splice(index, 1);
          reject(new Error('timed out waiting for a publish acknowledgement'));
        }, timeoutMs);
        settle = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
        ackWaiting.push(settle);
      });
    },
  };
}

async function postSession() {
  const response = await exports.default.fetch(
    new Request(`${ORIGIN}/sessions`, { method: 'POST' })
  );
  return { response, body: await response.json() };
}

async function openSocket(path) {
  return exports.default.fetch(
    new Request(`${ORIGIN}${path}`, {
      headers: { Upgrade: 'websocket' },
    })
  );
}

function accept(response) {
  const ws = response.webSocket;
  const inbox = listen(ws);
  ws.accept();
  return { ws, inbox };
}

async function connectStoryteller(code, token) {
  const response = await openSocket(`/sessions/${code}/storyteller`);
  expect(response.status).toBe(101);
  const socket = accept(response);
  socket.ws.send(JSON.stringify({ type: 'auth', token }));
  const authenticated = await socket.inbox.next();
  return { ...socket, authenticated };
}

async function connectReader(code) {
  const response = await openSocket(`/sessions/${code}`);
  expect(response.status).toBe(101);
  const socket = accept(response);
  const first = await socket.inbox.next();
  return { ...socket, first };
}

async function sessionStub(code) {
  const rows = await codeRows();
  const row = rows.find((item) => item.code === code);
  if (!row) throw new Error(`No directory row for ${code}`);
  return env.COMPANION_SESSION.get(
    env.COMPANION_SESSION.idFromName(row.session_id)
  );
}

function directoryStub() {
  return env.SESSION_DIRECTORY.get(env.SESSION_DIRECTORY.idFromName(DIRECTORY_NAME));
}

async function codeRows() {
  return runInDurableObject(directoryStub(), (_instance, state) =>
    state.storage.sql.exec('SELECT code, status, session_id FROM codes').toArray()
  );
}

function expectSnapshot(message, { rev, remainingMs, traveller = 0 }) {
  expect(message.type).toBe('snapshot');
  expect(message.rev).toBe(rev);
  expect(message.serverTime).toBeGreaterThan(Date.now() - 5000);
  expect(message.serverTime).toBeLessThanOrEqual(Date.now() + 1000);
  expect(message.state.timer.remainingMs).toBe(remainingMs);
  expect(message.state.counts.traveller).toBe(traveller);
  expect(validateCompanionState(message.state)).toEqual({
    ok: true,
    value: message.state,
  });
  expect(message.state.rev).toBeUndefined();
  expect(message.state.serverTime).toBeUndefined();
}

describe('companion sessions', () => {
  it('creates a session and keeps the write token out of storage', async () => {
    const { response, body } = await postSession();
    expect(response.status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(['code', 'writeToken']);
    expect(body.code).toMatch(CODE_PATTERN);
    expect(body.writeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const stored = await runInDurableObject(await sessionStub(body.code), (_instance, state) => {
      const rows = state.storage.sql.exec('SELECT token_hash FROM meta').toArray();
      return rows[0].token_hash;
    });
    expect(stored).toHaveLength(64);
    expect(stored).not.toBe(body.writeToken);
    expect(stored).toBe(await sha256Hex(body.writeToken));
  });

  it('uses the Crockford alphabet and does not repeat a live code', async () => {
    const first = await postSession();
    const second = await postSession();
    expect(first.body.code).toMatch(CODE_PATTERN);
    expect(second.body.code).toMatch(CODE_PATTERN);
    expect(second.body.code).not.toBe(first.body.code);
    expect(first.body.code).not.toMatch(/[ILOU]/);
  });

  it('retries a code collision and stops when every attempt is taken', async () => {
    setCodeSequence(['ABCDEF', 'ABCDEF', 'GHJKMN']);
    const first = await postSession();
    const second = await postSession();
    expect(first.body.code).toBe('ABCDEF');
    expect(second.body.code).toBe('GHJKMN');

    setCodeSequence(['ZZZZZZ', ...Array(8).fill('ZZZZZZ')]);
    const third = await postSession();
    expect(third.body.code).toBe('ZZZZZZ');
    const blocked = await postSession();
    expect(blocked.response.status).toBe(503);
    expect(blocked.body).toEqual({ error: 'code-unavailable' });
  });

  it('authenticates the storyteller with the first socket message', async () => {
    const { body } = await postSession();
    const withToken = await openSocket(
      `/sessions/${body.code}/storyteller?token=${body.writeToken}`
    );
    expect(withToken.status).toBe(400);
    expect(await withToken.json()).toEqual({ error: 'token-in-url' });

    const storyteller = await connectStoryteller(body.code, body.writeToken);
    expect(storyteller.authenticated).toEqual({ type: 'authenticated' });

    const replacement = accept(
      await openSocket(`/sessions/${body.code}/storyteller`)
    );
    replacement.ws.send(JSON.stringify({ type: 'auth', token: body.writeToken }));
    expect(await storyteller.inbox.next()).toEqual({ type: 'replaced' });
    expect(await replacement.inbox.next()).toEqual({ type: 'authenticated' });
  });

  it('rejects an incorrect write token without publishing', async () => {
    const { body } = await postSession();
    const storyteller = accept(
      await openSocket(`/sessions/${body.code}/storyteller`)
    );
    storyteller.ws.send(JSON.stringify({ type: 'auth', token: 'not-the-write-token-value' }));
    expect(await storyteller.inbox.next()).toEqual({
      type: 'error',
      reason: 'invalid-token',
    });

    const reader = await connectReader(body.code);
    expect(reader.first).toMatchObject({ type: 'waiting' });
    reader.ws.send(JSON.stringify({ type: 'publish', state: runningDay(1000) }));
    expect(await reader.inbox.next()).toEqual({ type: 'error', reason: 'not-writer' });
  });

  it('lets a reader join and receive the latest snapshot only', async () => {
    const { body } = await postSession();
    const early = await connectReader(body.code);
    expect(early.first.type).toBe('waiting');
    expect(typeof early.first.serverTime).toBe('number');

    const storyteller = await connectStoryteller(body.code, body.writeToken);
    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(80_000) }));
    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(70_000, 2) }));

    expectSnapshot(await early.inbox.next(), { rev: 1, remainingMs: 80_000 });
    expectSnapshot(await early.inbox.next(), {
      rev: 2,
      remainingMs: 70_000,
      traveller: 2,
    });

    const late = await connectReader(body.code);
    expectSnapshot(late.first, { rev: 2, remainingMs: 70_000, traveller: 2 });
    expect(late.first.state.counts).toEqual({
      townsfolk: 7,
      outsider: 0,
      minion: 2,
      demon: 1,
      traveller: 2,
    });
  });

  it('does not let a reader become the storyteller', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    const reader = await connectReader(body.code);
    reader.ws.send(JSON.stringify({ type: 'auth', token: body.writeToken }));
    expect(await reader.inbox.next()).toEqual({ type: 'error', reason: 'not-writer' });

    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(5000) }));
    expectSnapshot(await storyteller.inbox.next(), { rev: 1, remainingMs: 5000 });
    const other = await connectReader(body.code);
    expectSnapshot(other.first, { rev: 1, remainingMs: 5000 });
  });

  it('rejects an invalid public snapshot and a client revision', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    const broken = runningDay(1000);
    broken.settings = { youtube: true };
    storyteller.ws.send(JSON.stringify({ type: 'publish', state: broken }));
    expect(await storyteller.inbox.next()).toEqual({
      type: 'error',
      reason: 'invalid-state',
      detail: 'unknown-field',
    });

    storyteller.ws.send(JSON.stringify({
      type: 'publish',
      state: runningDay(1000),
      rev: 99,
      serverTime: 1,
    }));
    expect(await storyteller.inbox.next()).toEqual({
      type: 'error',
      reason: 'invalid-message',
    });

    storyteller.ws.send('{');
    expect(await storyteller.inbox.next()).toEqual({
      type: 'error',
      reason: 'malformed-json',
    });

    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(4000) }));
    expectSnapshot(await storyteller.inbox.next(), { rev: 1, remainingMs: 4000 });
  });

  it('rejects a traveller count outside 0 to 5 and keeps the other counts', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    const tooMany = runningDay(3000, 6);
    storyteller.ws.send(JSON.stringify({ type: 'publish', state: tooMany }));
    expect(await storyteller.inbox.next()).toEqual({
      type: 'error',
      reason: 'invalid-state',
      detail: 'out-of-range-count',
    });

    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(3000, 0) }));
    const none = await storyteller.inbox.next();
    expectSnapshot(none, { rev: 1, remainingMs: 3000, traveller: 0 });

    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(2500, 4) }));
    const some = await storyteller.inbox.next();
    expectSnapshot(some, { rev: 2, remainingMs: 2500, traveller: 4 });
    expect(some.state.counts.townsfolk).toBe(7);
    expect(some.state.counts.outsider).toBe(0);
    expect(some.state.counts.minion).toBe(2);
    expect(some.state.counts.demon).toBe(1);
  });

  it('rejects an oversized message without advancing the revision', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    storyteller.ws.send('x'.repeat(MAX_MESSAGE_BYTES + 1));
    expect(await storyteller.inbox.next()).toEqual({
      type: 'error',
      reason: 'too-large',
    });
    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(1500) }));
    expectSnapshot(await storyteller.inbox.next(), { rev: 1, remainingMs: 1500 });
  });

  it('assigns revisions in order and leaves the captured remainder unchanged', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    const before = Date.now();
    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(125_400) }));
    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(125_000) }));
    const first = await storyteller.inbox.next();
    const second = await storyteller.inbox.next();
    expectSnapshot(first, { rev: 1, remainingMs: 125_400 });
    expectSnapshot(second, { rev: 2, remainingMs: 125_000 });
    expect(second.rev).toBeGreaterThan(first.rev);
    expect(second.serverTime).toBeGreaterThanOrEqual(first.serverTime);
    expect(first.serverTime).toBeGreaterThanOrEqual(before);
    expect(first.state.timer.remainingMs).toBe(125_400);
  });

  it('broadcasts one snapshot to every reader and stops at 20', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    const readers = [];
    for (let index = 0; index < MAX_READERS; index += 1) {
      readers.push(await connectReader(body.code));
    }
    const extra = await openSocket(`/sessions/${body.code}`);
    expect(extra.status).toBe(403);
    expect(await extra.json()).toEqual({ error: 'reader-limit', limit: MAX_READERS });

    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(42_000) }));
    const delivered = await Promise.all(readers.map((reader) => reader.inbox.next()));
    for (const message of delivered) {
      expectSnapshot(message, { rev: 1, remainingMs: 42_000 });
    }
  }, 20_000);

  it('keeps the session when the storyteller socket closes', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(9000) }));
    expectSnapshot(await storyteller.inbox.next(), { rev: 1, remainingMs: 9000 });
    storyteller.ws.close(1000, 'gone');

    const reader = await connectReader(body.code);
    expectSnapshot(reader.first, { rev: 1, remainingMs: 9000 });

    const again = await connectStoryteller(body.code, body.writeToken);
    expect(again.authenticated.type).toBe('authenticated');
    expectSnapshot(await again.inbox.next(), { rev: 1, remainingMs: 9000 });
    again.ws.send(JSON.stringify({ type: 'publish', state: runningDay(8000) }));
    expectSnapshot(await again.inbox.next(), { rev: 2, remainingMs: 8000 });
  });

  it('ends the session when the storyteller says so', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    const reader = await connectReader(body.code);
    storyteller.ws.send(JSON.stringify({ type: 'end' }));
    expect(await reader.inbox.next()).toEqual({ type: 'session-ended', reason: 'ended' });
    expect(await storyteller.inbox.next()).toEqual({ type: 'session-ended', reason: 'ended' });

    const again = await openSocket(`/sessions/${body.code}`);
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: 'unknown-code' });
  });

  it('expires an idle session from the alarm and rejects the code afterwards', async () => {
    const { body } = await postSession();
    const reader = await connectReader(body.code);
    const stub = await sessionStub(body.code);
    await runInDurableObject(stub, (_instance, state) => {
      const past = Date.now() - IDLE_MS - 1000;
      state.storage.sql.exec(
        'UPDATE meta SET created_at = ?, last_publish_at = ? WHERE id = 1',
        past,
        past
      );
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await reader.inbox.next()).toEqual({ type: 'session-ended', reason: 'idle' });

    const again = await openSocket(`/sessions/${body.code}`);
    expect(again.status).toBe(404);
    expect(await codeRows()).toEqual([
      expect.objectContaining({ code: body.code, status: 'retired' }),
    ]);
  });

  it('expires at the twelve hour cap even after a recent publish', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(10_000) }));
    await storyteller.inbox.next();
    const reader = await connectReader(body.code);
    const stub = await sessionStub(body.code);
    await runInDurableObject(stub, (_instance, state) => {
      const now = Date.now();
      state.storage.sql.exec(
        'UPDATE meta SET created_at = ?, last_publish_at = ? WHERE id = 1',
        now - MAX_LIFETIME_MS - 1000,
        now - 1000
      );
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await reader.inbox.next()).toEqual({
      type: 'session-ended',
      reason: 'lifetime',
    });
    expect((await openSocket(`/sessions/${body.code}`)).status).toBe(404);
  });

  it('does not expire when the alarm runs before either deadline', async () => {
    const { body } = await postSession();
    const stub = await sessionStub(body.code);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const reader = await connectReader(body.code);
    expect(reader.first.type).toBe('waiting');
    expect(await codeRows()).toEqual([
      expect.objectContaining({ code: body.code, status: 'active' }),
    ]);
  });

  it('retires the code once and ignores a repeated cleanup', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    storyteller.ws.send(JSON.stringify({ type: 'end' }));
    await storyteller.inbox.next();
    const stub = await sessionStub(body.code);
    await runInDurableObject(stub, (instance) => instance.alarm());
    await runInDurableObject(stub, (instance) => instance.alarm());

    expect(await codeRows()).toEqual([
      expect.objectContaining({ code: body.code, status: 'retired' }),
    ]);
    expect((await openSocket(`/sessions/${body.code}`)).status).toBe(404);

    setCodeSequence([body.code, 'ABCDEF']);
    const next = await postSession();
    expect(next.response.status).toBe(201);
    expect(next.body.code).toBe('ABCDEF');
    const rows = await codeRows();
    expect(rows).toContainEqual(expect.objectContaining({
      code: body.code,
      status: 'retired',
    }));
    expect(rows).toContainEqual(expect.objectContaining({
      code: 'ABCDEF',
      status: 'active',
    }));
  });

  it('recovers the revision and socket roles after the object is evicted', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    const reader = await connectReader(body.code);
    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(60_000) }));
    expectSnapshot(await storyteller.inbox.next(), { rev: 1, remainingMs: 60_000 });
    expectSnapshot(await reader.inbox.next(), { rev: 1, remainingMs: 60_000 });

    const stub = await sessionStub(body.code);
    await evictDurableObject(stub);

    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(55_000, 1) }));
    expectSnapshot(await reader.inbox.next(), {
      rev: 2,
      remainingMs: 55_000,
      traveller: 1,
    });
    expectSnapshot(await storyteller.inbox.next(), {
      rev: 2,
      remainingMs: 55_000,
      traveller: 1,
    });

    const stored = await runInDurableObject(stub, (_instance, state) => {
      const rows = state.storage.sql.exec('SELECT rev, state_json FROM meta').toArray();
      return { rev: rows[0].rev, state: JSON.parse(rows[0].state_json) };
    });
    expect(stored.rev).toBe(2);
    expect(stored.state.timer.remainingMs).toBe(55_000);

    const late = await connectReader(body.code);
    expectSnapshot(late.first, { rev: 2, remainingMs: 55_000, traveller: 1 });
  });

  it('closes a storyteller socket that never authenticates', async () => {
    const { body } = await postSession();
    const storyteller = accept(await openSocket(`/sessions/${body.code}/storyteller`));
    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(1000) }));
    expect(await storyteller.inbox.next()).toEqual({
      type: 'error',
      reason: 'unauthenticated',
    });

    const quiet = accept(await openSocket(`/sessions/${body.code}/storyteller`));
    await new Promise((resolve) => {
      setTimeout(resolve, Number(env.AUTH_TIMEOUT_MS) + 100);
    });
    await runDurableObjectAlarm(await sessionStub(body.code));
    expect(await quiet.inbox.next()).toEqual({ type: 'error', reason: 'auth-timeout' });
    const reader = await connectReader(body.code);
    expect(reader.first.type).toBe('waiting');
  }, 20_000);

  it('stops accepting publishes after the session rate is reached', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    for (let index = 0; index < PUBLISH_LIMIT; index += 1) {
      storyteller.ws.send(JSON.stringify({
        type: 'publish',
        state: runningDay(10_000 + index),
      }));
    }
    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(1) }));

    for (let index = 0; index < PUBLISH_LIMIT; index += 1) {
      expectSnapshot(await storyteller.inbox.next(5000), {
        rev: index + 1,
        remainingMs: 10_000 + index,
      });
    }
    expect(await storyteller.inbox.next()).toEqual({
      type: 'error',
      reason: 'rate-limited',
    });

    const reader = await connectReader(body.code);
    expectSnapshot(reader.first, {
      rev: PUBLISH_LIMIT,
      remainingMs: 10_000 + PUBLISH_LIMIT - 1,
    });
  }, 20_000);

  it('refuses new sessions once the directory creation budget is spent', async () => {
    await runInDurableObject(directoryStub(), (_instance, state) => {
      for (let index = 0; index < CREATE_LIMIT; index += 1) {
        state.storage.sql.exec(
          'INSERT INTO create_log (created_at) VALUES (?)',
          Date.now()
        );
      }
    });
    const blocked = await postSession();
    expect(blocked.response.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'create-limit' });
  });

  it('acknowledges an accepted publish and stays quiet when it is rejected', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    const reader = await connectReader(body.code);
    storyteller.ws.send(JSON.stringify({
      type: 'publish',
      state: runningDay(40_000),
      capturedAt: 1_000,
      upstreamOffsetMs: 25,
    }));
    const snapshot = await reader.inbox.next();
    expectSnapshot(snapshot, { rev: 1, remainingMs: 40_000 });
    expect(snapshot.capturedAt).toBe(1_000);
    expect(snapshot.upstreamOffsetMs).toBe(25);
    expectSnapshot(await storyteller.inbox.next(), { rev: 1, remainingMs: 40_000 });
    const ack = await storyteller.inbox.ack();
    expect(ack).toMatchObject({ type: 'published', rev: 1 });
    expect(ack.serverTime).toBe(snapshot.serverTime);

    storyteller.ws.send(JSON.stringify({ type: 'publish', state: { v: 1 } }));
    expect(await storyteller.inbox.next()).toMatchObject({
      type: 'error',
      reason: 'invalid-state',
    });
    storyteller.ws.send(JSON.stringify({
      type: 'publish',
      state: runningDay(30_000),
      capturedAt: 500,
    }));
    expect(await storyteller.inbox.next()).toEqual({
      type: 'error',
      reason: 'stale-publish',
    });
    const late = await connectReader(body.code);
    expectSnapshot(late.first, { rev: 1, remainingMs: 40_000 });
  });

  it('answers a ping with the worker clock', async () => {
    const { body } = await postSession();
    const reader = await connectReader(body.code);
    const before = Date.now();
    reader.ws.send(JSON.stringify({ type: 'ping', id: 'sample-1' }));
    const pong = await reader.inbox.next();
    expect(pong.type).toBe('pong');
    expect(pong.id).toBe('sample-1');
    expect(pong.serverTime).toBeGreaterThanOrEqual(before);
    expect(pong.serverTime).toBeLessThanOrEqual(Date.now() + 50);
  });

  it('expires each unauthenticated socket on its own deadline', async () => {
    const { body } = await postSession();
    const storyteller = await connectStoryteller(body.code, body.writeToken);
    const reader = await connectReader(body.code);
    const first = accept(await openSocket(`/sessions/${body.code}/storyteller`));
    const second = accept(await openSocket(`/sessions/${body.code}/storyteller`));
    const stub = await sessionStub(body.code);
    const now = Date.now();
    await runInDurableObject(stub, (_instance, state) => {
      const pending = state.getWebSockets('storyteller').filter((ws) => {
        return !ws.deserializeAttachment()?.authenticated;
      });
      pending[0].serializeAttachment({
        ...pending[0].deserializeAttachment(),
        authDeadline: now - 1000,
      });
      pending[1].serializeAttachment({
        ...pending[1].deserializeAttachment(),
        authDeadline: now + 60_000,
      });
    });

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const [firstMessage, secondMessage] = await Promise.all([
      first.inbox.next(1000).then((message) => message, () => null),
      second.inbox.next(1000).then((message) => message, () => null),
    ]);
    const closed = [firstMessage, secondMessage].filter(Boolean);
    expect(closed).toEqual([{ type: 'error', reason: 'auth-timeout' }]);
    const survivor = firstMessage ? second : first;
    const alarmAfterFirst = await runInDurableObject(stub, (_instance, state) =>
      state.storage.getAlarm()
    );
    expect(alarmAfterFirst).toBeGreaterThan(now + 30_000);
    expect(alarmAfterFirst).toBeLessThan(now + 90_000);

    await runInDurableObject(stub, (_instance, state) => {
      const pending = state.getWebSockets('storyteller').filter((ws) => {
        return !ws.deserializeAttachment()?.authenticated;
      });
      expect(pending).toHaveLength(1);
      pending[0].serializeAttachment({
        ...pending[0].deserializeAttachment(),
        authDeadline: Date.now() - 1000,
      });
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await survivor.inbox.next()).toEqual({ type: 'error', reason: 'auth-timeout' });

    storyteller.ws.send(JSON.stringify({ type: 'publish', state: runningDay(12_000) }));
    expectSnapshot(await reader.inbox.next(), { rev: 1, remainingMs: 12_000 });

    await evictDurableObject(stub);
    const restored = await runInDurableObject(stub, async (_instance, state) => {
      return state.storage.getAlarm();
    });
    expect(restored).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
    const again = await connectReader(body.code);
    expectSnapshot(again.first, { rev: 1, remainingMs: 12_000 });
  });

  it('does not list sessions', async () => {
    await postSession();
    const response = await exports.default.fetch(new Request(`${ORIGIN}/sessions`));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not-found' });
  });
});
