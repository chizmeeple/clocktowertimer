import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { companionDevHrefs } from '../js/companionDev.js';

describe('companion dev links', () => {
  it('points both pages at the current code and drops them when the session closes', () => {
    assert.deepEqual(companionDevHrefs({ connection: 'live', code: 'WH8X2P' }), {
      companion: 'companion.html?code=WH8X2P',
      diagnostics: 'companion-dev.html?code=WH8X2P',
    });
    assert.deepEqual(companionDevHrefs({ connection: 'reconnecting', code: 'ABCD12' }), {
      companion: 'companion.html?code=ABCD12',
      diagnostics: 'companion-dev.html?code=ABCD12',
    });
    assert.deepEqual(companionDevHrefs({ connection: 'ended', code: 'WH8X2P' }), {
      companion: null,
      diagnostics: null,
    });
    for (const connection of ['idle', 'expired', 'disconnected', 'replaced', 'failed']) {
      assert.deepEqual(companionDevHrefs({ connection, code: 'WH8X2P' }), {
        companion: null,
        diagnostics: null,
      });
    }
    assert.equal(
      companionDevHrefs({ connection: 'live', code: 'A B&C' }).companion,
      'companion.html?code=A+B%26C'
    );
  });
});
