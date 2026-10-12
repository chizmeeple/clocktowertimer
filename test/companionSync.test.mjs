import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  acceptSample,
  measureRoundTrip,
  nextRetryDelay,
  offsetFromSamples,
  referenceTimeForSnapshot,
  serverNowFromMono,
  slewOffset,
} from '../companionSync.js';

describe('clock samples', () => {
  it('estimates the server offset from the middle of the round trip', () => {
    const sample = measureRoundTrip({
      sentAt: 1_000,
      receivedAt: 1_200,
      serverTime: 5_150,
    });
    assert.equal(sample.rtt, 200);
    assert.equal(sample.offsetMs, 5_150 - 1_100);
  });

  it('drops a negative trip and a trip that is too slow', () => {
    assert.equal(
      measureRoundTrip({ sentAt: 50, receivedAt: 40, serverTime: 50 }),
      null
    );
    assert.equal(
      measureRoundTrip({ sentAt: 0, receivedAt: 800, serverTime: 400 }),
      null
    );
  });

  it('keeps the fastest samples and ignores a later slow one', () => {
    let samples = [];
    samples = acceptSample(samples, { rtt: 40, offsetMs: 8 });
    samples = acceptSample(samples, { rtt: 20, offsetMs: 5 });
    samples = acceptSample(samples, { rtt: 30, offsetMs: 6 });
    samples = acceptSample(samples, { rtt: 90, offsetMs: 50 });
    assert.deepEqual(samples.map((item) => item.rtt), [20, 30, 40]);
    assert.equal(offsetFromSamples(samples), 5);
  });

  it('steps a large correction and eases a small one', () => {
    assert.equal(slewOffset(10, 12), 11);
    assert.equal(slewOffset(10, 400), 400);
    assert.equal(slewOffset(null, 7), 7);
  });

  it('advances the server estimate from the monotonic clock', () => {
    assert.equal(
      serverNowFromMono({ monoNow: 2_500, monoBase: 500, serverBase: 9_000 }),
      11_000
    );
  });

  it('places capture on the server clock when an upstream offset exists', () => {
    assert.deepEqual(
      referenceTimeForSnapshot({
        capturedAt: 1_000,
        upstreamOffsetMs: 40,
        serverTime: 1_200,
      }),
      { referenceTime: 1_040, timing: 'adjusted' }
    );
    assert.deepEqual(
      referenceTimeForSnapshot({
        capturedAt: 1_000,
        upstreamOffsetMs: null,
        serverTime: 1_200,
      }),
      { referenceTime: 1_200, timing: 'receipt' }
    );
  });

  it('grows the retry delay and then holds it', () => {
    assert.equal(nextRetryDelay(0, () => 0), 500);
    assert.equal(nextRetryDelay(1, () => 0), 1_000);
    assert.equal(nextRetryDelay(8, () => 0), 15_000);
    assert.equal(nextRetryDelay(0, () => 1), 600);
  });
});
