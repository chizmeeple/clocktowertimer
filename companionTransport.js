// Storyteller side of a companion session.
// Gameplay stays in the page. This module only creates a session, sends the
// public snapshot, and reconnects. The write token stays in memory.

import {
  acceptSample,
  measureRoundTrip,
  nextRetryDelay,
  offsetFromSamples,
  slewOffset,
} from './companionSync.js';

const ACK_RETRY_MS = 2_000;

function trimBase(baseUrl) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

export function createStorytellerTransport({
  baseUrl = '/companion-api',
  fetch: doFetch = globalThis.fetch.bind(globalThis),
  WebSocket: Socket = globalThis.WebSocket,
  now = () => Date.now(),
  random = Math.random,
  setTimeout: schedule = globalThis.setTimeout.bind(globalThis),
  clearTimeout: cancel = globalThis.clearTimeout.bind(globalThis),
  enablePublishing,
  disablePublishing,
  republish,
  onStatus = () => {},
} = {}) {
  const root = trimBase(baseUrl);
  let token = null;
  let code = null;
  let socket = null;
  let generation = 0;
  let authed = false;
  let intentional = false;
  let ending = false;
  let publishing = false;
  let attempt = 0;
  let retryTimer = null;
  let ackTimer = null;
  let retries = 0;
  let latest = null;
  let samples = [];
  let offsetMs = null;
  let announcedOffset = false;
  let pendingPing = null;
  const status = {
    connection: 'idle',
    delivery: 'idle',
    code: null,
    acceptedRev: null,
    offsetMs: null,
  };

  function emitStatus() {
    status.code = code;
    status.offsetMs = offsetMs;
    try {
      onStatus({ ...status });
    } catch {
      // A status listener must not stop the timer.
    }
  }

  function setConnection(connection) {
    status.connection = connection;
    emitStatus();
  }

  function socketUrl(path) {
    if (root.startsWith('ws://') || root.startsWith('wss://')) return `${root}${path}`;
    if (root.startsWith('http://') || root.startsWith('https://')) {
      return `${root.replace(/^http/, 'ws')}${path}`;
    }
    const loc = globalThis.location;
    const protocol = loc?.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${loc.host}${root}${path}`;
  }

  function clearRetry() {
    if (retryTimer != null) {
      cancel(retryTimer);
      retryTimer = null;
    }
  }

  function clearAck() {
    if (ackTimer != null) {
      cancel(ackTimer);
      ackTimer = null;
    }
  }

  function dropPublishing() {
    if (!publishing) return;
    publishing = false;
    try {
      disablePublishing();
    } catch {
      // The page timer still owns the countdown.
    }
  }

  function closeSocket() {
    const current = socket;
    socket = null;
    authed = false;
    if (!current) return;
    current.onopen = null;
    current.onmessage = null;
    current.onclose = null;
    current.onerror = null;
    try {
      current.close();
    } catch {
      // Already closed.
    }
  }

  function armRetry() {
    clearRetry();
    const delay = nextRetryDelay(attempt, random);
    attempt += 1;
    retryTimer = schedule(() => {
      retryTimer = null;
      connectSocket();
    }, delay);
  }

  function armAck(gen, capturedAt) {
    clearAck();
    ackTimer = schedule(() => {
      ackTimer = null;
      if (gen !== generation || status.delivery !== 'sent' || !latest) return;
      if (latest.capturedAt !== capturedAt || retries >= 1) return;
      retries += 1;
      flush();
    }, ACK_RETRY_MS);
  }

  function flush() {
    if (!authed || !socket || socket.readyState !== Socket.OPEN || !latest) return;
    const body = {
      type: 'publish',
      state: latest.snapshot,
      capturedAt: latest.capturedAt,
    };
    if (Number.isFinite(latest.upstreamOffsetMs)) {
      body.upstreamOffsetMs = latest.upstreamOffsetMs;
    }
    const gen = generation;
    const capturedAt = latest.capturedAt;
    try {
      socket.send(JSON.stringify(body));
    } catch {
      return;
    }
    status.delivery = 'sent';
    emitStatus();
    armAck(gen, capturedAt);
  }

  function submit(snapshot) {
    try {
      latest = {
        snapshot,
        capturedAt: now(),
        upstreamOffsetMs: offsetMs,
      };
      retries = 0;
      status.delivery = 'queued';
      emitStatus();
      flush();
    } catch {
      // Publishing must not interrupt the countdown.
    }
  }

  function noteSample(message) {
    if (!pendingPing || pendingPing.id !== message.id) return;
    const sentAt = pendingPing.sentAt;
    pendingPing = null;
    const sample = measureRoundTrip({
      sentAt,
      receivedAt: now(),
      serverTime: message.serverTime,
    });
    samples = acceptSample(samples, sample);
    const next = offsetFromSamples(samples);
    if (next == null) return;
    offsetMs = slewOffset(offsetMs, next);
    emitStatus();
    if (!announcedOffset) {
      announcedOffset = true;
      try {
        republish();
      } catch {
        // The next transition can carry the offset.
      }
    }
  }

  function onSocketMessage(gen, event) {
    if (gen !== generation) return;
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === 'authenticated') {
      authed = true;
      attempt = 0;
      clearRetry();
      if (ending) {
        try {
          socket?.send(JSON.stringify({ type: 'end' }));
        } catch {
          finish('ended');
        }
        return;
      }
      setConnection('live');
      if (!publishing) {
        publishing = true;
        try {
          enablePublishing(submit);
        } catch {
          publishing = false;
          setConnection('failed');
        }
      } else {
        try {
          republish();
        } catch {
          // The socket is up. The next change will publish.
        }
      }
      sendPing(gen);
      return;
    }
    if (message.type === 'pong') {
      noteSample(message);
      return;
    }
    if (message.type === 'published') {
      if (Number.isInteger(message.rev) && message.rev >= 1) {
        status.acceptedRev = message.rev;
        status.delivery = 'accepted';
        clearAck();
        emitStatus();
      }
      return;
    }
    if (message.type === 'replaced') {
      finish('replaced');
      return;
    }
    if (message.type === 'session-ended') {
      finish(message.reason === 'ended' ? 'ended' : 'expired');
      return;
    }
    if (message.type === 'error' && message.reason === 'invalid-token') {
      finish('failed');
    }
  }

  function sendPing(gen) {
    if (gen !== generation || !authed || !socket) return;
    const id = `p${now().toString(36)}${Math.floor(random() * 1e6).toString(36)}`;
    pendingPing = { id, sentAt: now() };
    try {
      socket.send(JSON.stringify({ type: 'ping', id }));
    } catch {
      pendingPing = null;
    }
  }

  function connectSocket() {
    if (intentional || !token || !code || socket) return;
    const gen = generation + 1;
    generation = gen;
    authed = false;
    let opened;
    try {
      opened = new Socket(socketUrl(`/sessions/${code}/storyteller`));
    } catch {
      armRetry();
      return;
    }
    socket = opened;
    opened.onopen = () => {
      if (gen !== generation) return;
      try {
        opened.send(JSON.stringify({ type: 'auth', token }));
      } catch {
        // onclose schedules the next attempt.
      }
    };
    opened.onmessage = (event) => onSocketMessage(gen, event);
    opened.onerror = () => {};
    opened.onclose = () => {
      if (gen !== generation) return;
      socket = null;
      authed = false;
      pendingPing = null;
      if (intentional) {
        if (ending) finish('ended');
        return;
      }
      if (ending && attempt >= 2) {
        finish('ended');
        return;
      }
      setConnection('reconnecting');
      armRetry();
    };
  }

  function finish(connection) {
    intentional = true;
    ending = false;
    clearRetry();
    clearAck();
    dropPublishing();
    closeSocket();
    token = null;
    latest = null;
    status.delivery = 'idle';
    setConnection(connection);
  }

  async function start() {
    if (token || status.connection === 'connecting' || status.connection === 'live') {
      return { ...status };
    }
    intentional = false;
    ending = false;
    setConnection('connecting');
    let response;
    try {
      response = await doFetch(`${root}/sessions`, { method: 'POST' });
    } catch {
      setConnection('failed');
      return { ...status };
    }
    if (!response.ok) {
      setConnection('failed');
      return { ...status };
    }
    let body;
    try {
      body = await response.json();
    } catch {
      setConnection('failed');
      return { ...status };
    }
    if (typeof body.code !== 'string' || typeof body.writeToken !== 'string') {
      setConnection('failed');
      return { ...status };
    }
    code = body.code;
    token = body.writeToken;
    connectSocket();
    emitStatus();
    return { ...status };
  }

  function stop() {
    finish('disconnected');
  }

  function drop() {
    const current = socket;
    if (!current) return;
    const notify = current.onclose;
    current.onclose = null;
    current.onerror = null;
    try {
      current.close();
    } catch {
      // The local close path still runs.
    }
    notify?.();
  }

  function end() {
    ending = true;
    if (authed && socket && socket.readyState === Socket.OPEN) {
      intentional = true;
      try {
        socket.send(JSON.stringify({ type: 'end' }));
      } catch {
        finish('ended');
      }
      return;
    }
    if (token && code) {
      intentional = false;
      closeSocket();
      connectSocket();
      return;
    }
    finish('ended');
  }

  return {
    start,
    stop,
    drop,
    end,
    submit,
    get status() {
      return { ...status };
    },
  };
}
