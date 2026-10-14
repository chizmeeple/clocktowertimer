// One Storyteller companion session for Settings and the development panel.
// The write token stays inside the transport and is never returned here.

import {
  companionBaseUrl,
  companionPlayerUrl,
  isSessionCode,
} from './companionCode.js';
import {
  disableCompanionPublishing,
  enableCompanionPublishing,
  publishCompanionSnapshot,
} from './companionPublish.js';
import { createStorytellerTransport } from './companionTransport.js';

export { companionPlayerUrl, companionQrImageUrl } from './companionCode.js';

const SHARING = new Set(['connecting', 'live', 'reconnecting']);

const IDLE_STATUS = {
  connection: 'idle',
  delivery: 'idle',
  code: null,
  acceptedRev: null,
  offsetMs: null,
};

export function presentCompanionSharing({ enabled, connection, code }) {
  const active = Boolean(enabled) && SHARING.has(connection) && typeof code === 'string' && code.length > 0;
  let status = 'Disabled';
  let detail = '';
  if (enabled) {
    if (connection === 'connecting') status = 'Connecting';
    else if (connection === 'live') status = 'Live';
    else if (connection === 'reconnecting') status = 'Reconnecting';
    else if (connection === 'failed' || connection === 'disconnected') {
      status = 'Offline';
      detail = connection === 'failed' ? 'Sharing did not start. You can try again.' : '';
    } else if (connection === 'ended' || connection === 'expired' || connection === 'replaced') {
      status = 'Ended';
      detail = 'The previous code is no longer valid.';
    } else status = 'Ready';
  }
  return {
    status,
    detail,
    code: active ? code : '',
    playerUrl: active ? companionPlayerUrl(code) : '',
    canStart: Boolean(enabled) && !SHARING.has(connection),
    canStop: Boolean(enabled) && SHARING.has(connection),
    canShare: active,
  };
}

const JOIN_CONNECTIONS = new Set(['live', 'reconnecting']);

// The timer shows a code only for a valid session that players can still join.
// Connecting, offline, and ended sessions stay off the timer face.
export function presentCompanionJoin({ enabled, connection, code }) {
  const visible =
    Boolean(enabled) && JOIN_CONNECTIONS.has(connection) && isSessionCode(code);
  return {
    visible,
    code: visible ? code : '',
    reconnecting: visible && connection === 'reconnecting',
  };
}

export function resolveCompanionEnabledChange({ nextEnabled, sharing, confirmed }) {
  if (nextEnabled || !sharing) {
    return { enabled: Boolean(nextEnabled), endSession: false };
  }
  if (!confirmed) return { enabled: true, endSession: false };
  return { enabled: false, endSession: true };
}

export function createCompanionSessionController({ createTransport } = {}) {
  let transport = null;
  let latest = { ...IDLE_STATUS };
  let autoStarted = false;
  const listeners = new Set();

  function ensure() {
    if (transport) return transport;
    transport = createTransport({
      onStatus(status) {
        latest = status;
        for (const listener of listeners) {
          try {
            listener(status);
          } catch {
            // A settings listener must not stop the timer.
          }
        }
      },
    });
    return transport;
  }

  function start() {
    return Promise.resolve(ensure().start()).catch(() => latest);
  }

  return {
    status: () => ({ ...latest }),
    subscribe(listener) {
      listeners.add(listener);
      listener(latest);
      return () => listeners.delete(listener);
    },
    start,
    stop: () => ensure().stop(),
    drop: () => ensure().drop(),
    end: () => ensure().end(),
    maybeAutoStart({ enabled, autoStart }) {
      if (!enabled || !autoStart || autoStarted) return false;
      autoStarted = true;
      start();
      return true;
    },
  };
}

export const companionSession = createCompanionSessionController({
  createTransport({ onStatus }) {
    return createStorytellerTransport({
      baseUrl: companionBaseUrl(globalThis.location),
      enablePublishing: enableCompanionPublishing,
      disablePublishing: disableCompanionPublishing,
      republish: () => publishCompanionSnapshot(true),
      onStatus,
    });
  },
});
