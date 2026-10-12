// Read-only companion. It joins with a session code, keeps the latest
// revision, and projects the countdown on a local monotonic clock.
// It cannot publish.

import { decideRevision, isSnapshotStale, validateCompanionState } from './companionState.js';
import { readCompanionCountdown } from './companionClock.js';
import {
  STALE_AFTER_MS,
  acceptSample,
  measureRoundTrip,
  nextRetryDelay,
  offsetFromSamples,
  referenceTimeForSnapshot,
  serverNowFromMono,
  slewOffset,
} from './companionSync.js';

export { STALE_AFTER_MS };

function trimBase(baseUrl) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

export function createCompanionClient({
  baseUrl = '/companion-api',
  WebSocket: Socket = globalThis.WebSocket,
  now = () => Date.now(),
  mono = () => globalThis.performance.now(),
  random = Math.random,
  setTimeout: schedule = globalThis.setTimeout.bind(globalThis),
  clearTimeout: cancel = globalThis.clearTimeout.bind(globalThis),
  onChange = () => {},
} = {}) {
  const root = trimBase(baseUrl);
  let code = null;
  let socket = null;
  let generation = 0;
  let intentional = false;
  let attempt = 0;
  let retryTimer = null;
  let heldRev = null;
  let snapshot = null;
  let envelope = null;
  let receivedMono = null;
  let samples = [];
  let offsetMs = null;
  let monoBase = null;
  let serverBase = null;
  let pendingPing = null;
  const viewState = {
    connection: 'idle',
    fresh: false,
    stale: false,
    timing: 'missing',
    rev: null,
    phase: null,
    day: null,
    counts: null,
    remainingMs: null,
    displaySeconds: null,
    locallyComplete: false,
    confirmedComplete: false,
  };

  function socketUrl(path) {
    if (root.startsWith('http://') || root.startsWith('https://')) {
      return `${root.replace(/^http/, 'ws')}${path}`;
    }
    const loc = globalThis.location;
    const protocol = loc?.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${loc.host}${root}${path}`;
  }

  function emit() {
    try {
      onChange(view());
    } catch {
      // The projection is still available from view().
    }
  }

  function setConnection(connection) {
    viewState.connection = connection;
    emit();
  }

  function clearRetry() {
    if (retryTimer != null) {
      cancel(retryTimer);
      retryTimer = null;
    }
  }

  function closeSocket() {
    const current = socket;
    socket = null;
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
      connect();
    }, delay);
  }

  function estimatedServerNow(monoNow) {
    if (monoBase == null || serverBase == null) return now() + (offsetMs ?? 0);
    return serverNowFromMono({
      monoNow,
      monoBase,
      serverBase,
    });
  }

  function noteSample(message) {
    if (!pendingPing || pendingPing.id !== message.id) return;
    const sample = measureRoundTrip({
      sentAt: pendingPing.sentAt,
      receivedAt: now(),
      serverTime: message.serverTime,
    });
    pendingPing = null;
    samples = acceptSample(samples, sample);
    const next = offsetFromSamples(samples);
    if (next == null) return;
    offsetMs = slewOffset(offsetMs, next);
    const monoNow = mono();
    serverBase = now() + offsetMs;
    monoBase = monoNow;
    emit();
  }

  function applySnapshot(message) {
    const validated = validateCompanionState(message.state);
    if (!validated.ok) return;
    const decision = decideRevision(heldRev, message.rev);
    if (decision === 'invalid' || decision === 'older') return;
    if (decision === 'accept') {
      heldRev = message.rev;
      snapshot = validated.value;
      envelope = {
        serverTime: message.serverTime,
        capturedAt: message.capturedAt,
        upstreamOffsetMs: message.upstreamOffsetMs,
      };
    }
    receivedMono = mono();
    emit();
  }

  function onMessage(gen, event) {
    if (gen !== generation) return;
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === 'snapshot') {
      applySnapshot(message);
      return;
    }
    if (message.type === 'pong') {
      noteSample(message);
      return;
    }
    if (message.type === 'waiting') {
      receivedMono = mono();
      emit();
      return;
    }
    if (message.type === 'session-ended') {
      intentional = true;
      clearRetry();
      closeSocket();
      setConnection(message.reason === 'ended' ? 'ended' : 'expired');
    }
  }

  function sendPing(gen) {
    if (gen !== generation || !socket) return;
    const id = `c${now().toString(36)}${Math.floor(random() * 1e6).toString(36)}`;
    pendingPing = { id, sentAt: now() };
    try {
      socket.send(JSON.stringify({ type: 'ping', id }));
    } catch {
      pendingPing = null;
    }
  }

  function connect() {
    if (intentional || !code || socket) return;
    const gen = generation + 1;
    generation = gen;
    let opened;
    try {
      opened = new Socket(socketUrl(`/sessions/${code}`));
    } catch {
      armRetry();
      return;
    }
    socket = opened;
    opened.onopen = () => {
      if (gen === generation) sendPing(gen);
    };
    opened.onmessage = (event) => onMessage(gen, event);
    opened.onerror = () => {};
    opened.onclose = () => {
      if (gen !== generation) return;
      socket = null;
      pendingPing = null;
      if (intentional) return;
      setConnection('reconnecting');
      armRetry();
    };
    setConnection(viewState.connection === 'idle' ? 'connecting' : viewState.connection);
    if (viewState.connection !== 'live') {
      viewState.connection = attempt === 0 ? 'connecting' : 'reconnecting';
    }
  }

  function view(monoNow = mono()) {
    const timing = envelope
      ? referenceTimeForSnapshot(envelope)
      : { referenceTime: null, timing: 'missing' };
    let projected = null;
    if (snapshot && timing.referenceTime != null) {
      try {
        projected = readCompanionCountdown({
          snapshot,
          referenceTime: timing.referenceTime,
          now: estimatedServerNow(monoNow),
          offsetMs: 0,
        });
      } catch {
        projected = null;
      }
    }
    const connected = viewState.connection === 'live' || (
      socket && socket.readyState === Socket.OPEN
    );
    if (socket && socket.readyState === Socket.OPEN && viewState.connection !== 'ended' && viewState.connection !== 'expired') {
      viewState.connection = 'live';
    }
    let stale = false;
    if (receivedMono == null || !connected) {
      stale = viewState.connection !== 'idle';
    } else {
      try {
        stale = isSnapshotStale({
          receivedAt: receivedMono,
          now: monoNow,
          limitMs: STALE_AFTER_MS,
        });
      } catch {
        stale = true;
      }
    }
    const fresh = viewState.connection === 'live' && !stale && snapshot != null;
    return {
      connection: viewState.connection,
      fresh,
      stale: stale && viewState.connection !== 'idle',
      timing: timing.timing,
      rev: heldRev,
      phase: snapshot?.phase ?? null,
      day: snapshot?.day ?? null,
      counts: snapshot?.counts ?? null,
      remainingMs: projected?.remainingMs ?? null,
      displaySeconds: projected?.displaySeconds ?? null,
      locallyComplete: projected?.locallyComplete ?? false,
      confirmedComplete: projected?.confirmedComplete ?? false,
    };
  }

  function join(nextCode) {
    if (nextCode !== code) {
      heldRev = null;
      snapshot = null;
      envelope = null;
      receivedMono = null;
      samples = [];
      offsetMs = null;
      monoBase = null;
      serverBase = null;
    }
    intentional = false;
    attempt = 0;
    code = nextCode;
    clearRetry();
    closeSocket();
    viewState.connection = 'connecting';
    connect();
    // connect() bumps attempt only on retry. The first connection uses attempt 0
    // but connect sets generation. connection was set inside connect after attempt
    // check. Force connecting for the first attempt.
    if (viewState.connection !== 'live') viewState.connection = 'connecting';
    emit();
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

  function leave() {
    intentional = true;
    clearRetry();
    closeSocket();
    code = null;
    setConnection('idle');
  }

  function resume() {
    emit();
    if (intentional || !code) return;
    if (!socket || socket.readyState !== Socket.OPEN) {
      closeSocket();
      viewState.connection = 'reconnecting';
      connect();
      return;
    }
    const current = view();
    if (current.stale) {
      closeSocket();
      viewState.connection = 'reconnecting';
      connect();
    }
  }

  return { join, leave, drop, resume, view };
}
