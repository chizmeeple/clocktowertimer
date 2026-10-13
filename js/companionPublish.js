// Hands a public companion snapshot to an optional publisher.
// The timer does not start this. Nothing is sent until a caller enables it,
// and a publisher that throws or rejects does not touch the countdown.

import { validateCompanionState } from './companionState.js';

export const HEARTBEAT_MS = 10_000;

function problemText(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Lifecycle for one capture function.
 * `capture` reads the current public snapshot. It is called only while
 * publishing is enabled, at one moment per publish.
 * Identical transition snapshots are skipped after the publisher accepts
 * them. A throw or a rejected promise does not count as acceptance, so the
 * same snapshot can be offered again. A heartbeat always publishes, and
 * `publish(true)` captures a fresh copy even when it matches the last one.
 */
export function createCompanionPublishing({
  capture,
  setInterval: schedule = (fn, delay) => globalThis.setInterval(fn, delay),
  clearInterval: cancel = (id) => globalThis.clearInterval(id),
  warn = (message, error) => console.warn(message, error),
} = {}) {
  if (typeof capture !== 'function') {
    throw new TypeError('Companion publishing needs a capture function');
  }

  let publisher = null;
  let heartbeatId = null;
  let lastPayload = null;
  let lastProblem = null;

  function report(error) {
    const message = problemText(error);
    if (message === lastProblem) return;
    lastProblem = message;
    try {
      warn('Companion snapshot was not published.', error);
    } catch {
      // A diagnostic failure must not reach the countdown.
    }
  }

  function emit(heartbeat, force) {
    if (publisher === null) return;

    let snapshot;
    try {
      snapshot = capture();
    } catch (error) {
      report(error);
      return;
    }

    const validated = validateCompanionState(snapshot);
    if (!validated.ok) {
      report(new Error(validated.reason));
      return;
    }

    const encoded = JSON.stringify(validated.value);
    if (!heartbeat && !force && encoded === lastPayload) return;

    try {
      const result = publisher(validated.value);
      lastPayload = encoded;
      lastProblem = null;
      if (result && typeof result.then === 'function') {
        result.then(null, (error) => {
          if (lastPayload === encoded) lastPayload = null;
          report(error);
        });
      }
    } catch (error) {
      report(error);
    }
  }

  function safeEmit(heartbeat, force) {
    try {
      emit(heartbeat, force);
    } catch (error) {
      report(error);
    }
  }

  function disable() {
    publisher = null;
    lastPayload = null;
    lastProblem = null;
    if (heartbeatId != null) {
      cancel(heartbeatId);
      heartbeatId = null;
    }
  }

  function enable(next) {
    if (typeof next !== 'function') {
      throw new TypeError('Companion publishing needs a publish function');
    }
    disable();
    publisher = next;
    heartbeatId = schedule(() => safeEmit(true), HEARTBEAT_MS);
    safeEmit(false);
  }

  return {
    get enabled() {
      return publisher !== null;
    },
    enable,
    disable,
    publish(force = false) {
      safeEmit(false, force === true);
    },
  };
}

let publishing = null;

export function bindCompanionCapture(capture) {
  publishing?.disable();
  publishing = createCompanionPublishing({ capture });
}

export function enableCompanionPublishing(publish) {
  if (!publishing) {
    throw new TypeError('Companion publishing has no timer to read');
  }
  publishing.enable(publish);
}

export function disableCompanionPublishing() {
  publishing?.disable();
}

export function isCompanionPublishingEnabled() {
  return publishing?.enabled === true;
}

export function publishCompanionSnapshot(force = false) {
  publishing?.publish(force === true);
}
