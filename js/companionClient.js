// Read-only companion. It joins with a session code, keeps the latest
// revision, and projects the countdown on a local monotonic clock.
// It cannot publish.

import { decideRevision, isSnapshotStale, validateCompanionState } from './companionState.js';
import { readCompanionCountdown } from './companionClock.js';
import {
  STALE_AFTER_MS,
  acceptSample,
  COARSE_RTT_MS,
  measureRoundTrip,
  nextRetryDelay,
  offsetFromSamples,
  referenceTimeForSnapshot,
  serverNowFromMono,
  slewOffset,
} from './companionSync.js';

export { STALE_AFTER_MS };

export const PONG_TIMEOUT_MS = 5_000;
export const PING_RETRY_MS = 2_000;
export const PING_KEEPALIVE_MS = 15_000;

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
  let established = false;
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
  let pingTimer = null;
  let pingAttempts = 0;
  let resyncing = false;
  let holdExtrapolation = false;
  const viewState = {
    connection: 'idle',
    fresh: false,
    stale: false,
    timing: 'missing',
    rev: null,
    phase: null,
    day: null,
    counts: null,
    timerStatus: null,
    rate: null,
    kind: null,
    problem: null,
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

  function clearPing() {
    if (pingTimer != null) {
      cancel(pingTimer);
      pingTimer = null;
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
    const trip = {
      sentAt: pendingPing.sentAt,
      receivedAt: now(),
      serverTime: message.serverTime,
    };
    let sample = measureRoundTrip(trip);
    if (!sample && offsetMs == null) sample = measureRoundTrip(trip, COARSE_RTT_MS);
    pendingPing = null;
    samples = acceptSample(samples, sample);
    const next = offsetFromSamples(samples);
    if (next == null) {
      schedulePing(
        generation,
        pingAttempts >= 4 ? PING_KEEPALIVE_MS : PING_RETRY_MS,
      );
      return;
    }
    pingAttempts = 0;
    offsetMs = slewOffset(offsetMs, next);
    const monoNow = mono();
    serverBase = now() + offsetMs;
    monoBase = monoNow;
    emit();
    schedulePing(generation, PING_KEEPALIVE_MS);
  }

  function applySnapshot(message) {
    const validated = validateCompanionState(message.state);
    if (!validated.ok) {
      resyncing = false;
      if (validated.reason === 'unsupported-version') {
        viewState.problem = 'unsupported-version';
        emit();
      }
      return;
    }
    const decision = decideRevision(heldRev, message.rev);
    if (decision === 'invalid' || decision === 'older') return;
    resyncing = false;
    holdExtrapolation = false;
    if (decision === 'accept') {
      viewState.problem = null;
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
      resyncing = false;
      receivedMono = mono();
      emit();
      return;
    }
    if (message.type === 'session-ended') {
      intentional = true;
      established = false;
      resyncing = false;
      holdExtrapolation = false;
      code = null;
      clearRetry();
      clearPing();
      closeSocket();
      setConnection(message.reason === 'ended' ? 'ended' : 'expired');
    }
  }

  function schedulePing(gen, delay) {
    clearPing();
    pingTimer = schedule(() => {
      pingTimer = null;
      if (gen !== generation || intentional || !socket) return;
      if (pendingPing) {
        pendingPing = null;
        holdExtrapolation = true;
        resyncing = true;
        monoBase = null;
        serverBase = null;
        closeSocket();
        if (!code) return;
        setConnection('reconnecting');
        armRetry();
        return;
      }
      sendPing(gen);
    }, delay);
  }

  function sendPing(gen) {
    if (gen !== generation || !socket || socket.readyState !== Socket.OPEN) return;
    pingAttempts += 1;
    const id = `c${now().toString(36)}${Math.floor(random() * 1e6).toString(36)}`;
    pendingPing = { id, sentAt: now() };
    try {
      socket.send(JSON.stringify({ type: 'ping', id }));
    } catch {
      pendingPing = null;
      return;
    }
    schedulePing(gen, PONG_TIMEOUT_MS);
  }

  function connect() {
    if (intentional || !code || socket) return;
    const gen = generation + 1;
    generation = gen;
    pingAttempts = 0;
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
      clearPing();
      if (intentional) return;
      setConnection('reconnecting');
      armRetry();
    };
    if (
      viewState.connection !== 'ended' &&
      viewState.connection !== 'expired' &&
      viewState.connection !== 'reconnecting'
    ) {
      viewState.connection = 'connecting';
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
          now: holdExtrapolation
            ? timing.referenceTime
            : estimatedServerNow(monoNow),
          offsetMs: 0,
        });
      } catch {
        projected = null;
      }
    }
    const socketOpen = Boolean(socket && socket.readyState === Socket.OPEN);
    const connected = viewState.connection === 'live' || socketOpen;
    if (
      socketOpen &&
      !resyncing &&
      viewState.connection !== 'ended' &&
      viewState.connection !== 'expired'
    ) {
      viewState.connection = 'live';
      established = true;
    }
    let stale = false;
    if (viewState.connection === 'idle') {
      stale = false;
    } else if (!connected) {
      stale = snapshot != null;
    } else if (receivedMono == null) {
      stale = false;
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
      code,
      established,
      fresh,
      stale: stale && viewState.connection !== 'idle',
      timing: timing.timing,
      rev: heldRev,
      phase: snapshot?.phase ?? null,
      day: snapshot?.day ?? null,
      counts: snapshot?.counts ?? null,
      timerStatus: snapshot?.timer.status ?? null,
      rate: snapshot?.timer.rate ?? null,
      kind: snapshot?.timer.kind ?? null,
      problem: viewState.problem,
      remainingMs: projected?.remainingMs ?? null,
      displaySeconds: projected?.displaySeconds ?? null,
      locallyComplete: projected?.locallyComplete ?? false,
      confirmedComplete: projected?.confirmedComplete ?? false,
    };
  }

  function join(nextCode) {
    if (nextCode !== code) {
      established = false;
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
    resyncing = false;
    holdExtrapolation = false;
    attempt = 0;
    code = nextCode;
    clearRetry();
    clearPing();
    closeSocket();
    viewState.connection = 'connecting';
    connect();
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
    established = false;
    resyncing = false;
    holdExtrapolation = false;
    clearRetry();
    clearPing();
    closeSocket();
    code = null;
    heldRev = null;
    snapshot = null;
    envelope = null;
    receivedMono = null;
    viewState.problem = null;
    samples = [];
    offsetMs = null;
    monoBase = null;
    serverBase = null;
    setConnection('idle');
  }

  // A hidden page can freeze its clock and miss publishes. Drop the socket,
  // stop extrapolating, and take the next snapshot as authoritative.
  function resume() {
    if (intentional || !code) {
      emit();
      return;
    }
    resyncing = true;
    holdExtrapolation = true;
    monoBase = null;
    serverBase = null;
    pendingPing = null;
    clearRetry();
    clearPing();
    closeSocket();
    attempt = 0;
    viewState.connection = established ? 'reconnecting' : 'connecting';
    connect();
    if (viewState.connection !== 'ended' && viewState.connection !== 'expired') {
      viewState.connection = established ? 'reconnecting' : 'connecting';
    }
    emit();
  }

  return { join, leave, drop, resume, view };
}
