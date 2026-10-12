// Clock samples and retry delays for the companion transport.
// Every timestamp is passed in. This module does not read a clock.

export const MAX_RTT_MS = 500;
export const OFFSET_JUMP_MS = 150;
export const SAMPLE_LIMIT = 5;
export const STALE_AFTER_MS = 25_000;

/**
 * `sentAt` and `receivedAt` are the local wall clock around one ping.
 * `serverTime` is the worker clock when it answered.
 * The offset is server minus local, estimated at the midpoint of the trip.
 * A negative or very large trip is discarded rather than trusted.
 */
export function measureRoundTrip({ sentAt, receivedAt, serverTime }) {
  if (
    !Number.isFinite(sentAt) ||
    !Number.isFinite(receivedAt) ||
    !Number.isFinite(serverTime)
  ) {
    return null;
  }
  const rtt = receivedAt - sentAt;
  if (rtt < 0 || rtt > MAX_RTT_MS) return null;
  return { rtt, offsetMs: serverTime - (sentAt + rtt / 2) };
}

// Keeps the lowest-latency samples. After a few good trips, a much slower
// one is ignored so a stalled tab does not drag the estimate.
export function acceptSample(samples, sample) {
  if (!sample) return samples;
  const best = samples.reduce((min, item) => Math.min(min, item.rtt), Infinity);
  if (samples.length >= 3 && sample.rtt > best * 2) return samples;
  return [...samples, sample]
    .sort((left, right) => left.rtt - right.rtt)
    .slice(0, SAMPLE_LIMIT);
}

export function offsetFromSamples(samples) {
  if (!samples.length) return null;
  return samples[0].offsetMs;
}

// Small corrections move halfway, so the countdown does not visibly jump.
// A large correction steps straight to the new estimate.
export function slewOffset(previous, next, threshold = OFFSET_JUMP_MS) {
  if (!Number.isFinite(next)) return previous ?? null;
  if (previous == null || !Number.isFinite(previous)) return next;
  const delta = next - previous;
  if (Math.abs(delta) >= threshold) return next;
  return previous + delta / 2;
}

export function serverNowFromMono({ monoNow, monoBase, serverBase }) {
  if (
    !Number.isFinite(monoNow) ||
    !Number.isFinite(monoBase) ||
    !Number.isFinite(serverBase)
  ) {
    throw new TypeError('Server estimate needs finite clock readings');
  }
  return serverBase + (monoNow - monoBase);
}

/**
 * Capture time on the worker clock.
 * `adjusted` uses the Storyteller's measured offset.
 * `receipt` anchors at the moment the worker stored the snapshot, which is
 * later than the capture. It is not treated as a zero-delay capture.
 */
export function referenceTimeForSnapshot({
  capturedAt,
  upstreamOffsetMs,
  serverTime,
}) {
  if (Number.isFinite(capturedAt) && Number.isFinite(upstreamOffsetMs)) {
    return {
      referenceTime: capturedAt + upstreamOffsetMs,
      timing: 'adjusted',
    };
  }
  if (Number.isFinite(serverTime)) {
    return { referenceTime: serverTime, timing: 'receipt' };
  }
  return { referenceTime: null, timing: 'missing' };
}

export function nextRetryDelay(attempt, random = Math.random) {
  const step = Math.min(Math.max(0, attempt), 5);
  const delay = Math.min(500 * 2 ** step, 15_000);
  return Math.round(delay + delay * 0.2 * random());
}
