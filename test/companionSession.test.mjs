import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  companionPlayerUrl,
  companionQrImageUrl,
  createCompanionSessionController,
  presentCompanionJoin,
  presentCompanionSharing,
  resolveCompanionEnabledChange,
} from '../js/companionSession.js';
import { createStorytellerTransport } from '../js/companionTransport.js';

const TOKEN = 'storyteller-write-token-value';

describe('companion sharing presentation', () => {
  it('builds a public player link and a high-contrast QR url', () => {
    const playerUrl = companionPlayerUrl('WH8X2P');
    const qrUrl = companionQrImageUrl(playerUrl);
    assert.equal(playerUrl, 'https://timer.arcane-scripts.net/c?code=WH8X2P');
    assert.equal(new URL(playerUrl).pathname, '/c');
    assert.equal(
      companionPlayerUrl('A B&C'),
      'https://timer.arcane-scripts.net/c?code=A+B%26C'
    );
    assert.match(qrUrl, /^https:\/\/api\.qrserver\.com\/v1\/create-qr-code\/\?/);
    assert.match(qrUrl, /size=360x360/);
    assert.match(qrUrl, /qzone=2/);
    assert.match(qrUrl, /color=000000/);
    assert.match(qrUrl, /bgcolor=ffffff/);
    assert.match(decodeURIComponent(qrUrl), /https:\/\/timer\.arcane-scripts\.net\/c\?code=WH8X2P/);
    assert.equal(qrUrl.includes(TOKEN), false);
    assert.equal(qrUrl.includes('writeToken'), false);
  });

  it('names connection states and hides a code that is no longer active', () => {
    assert.equal(
      presentCompanionSharing({ enabled: false, connection: 'live', code: 'WH8X2P' }).status,
      'Disabled'
    );
    assert.equal(
      presentCompanionSharing({ enabled: true, connection: 'idle', code: null }).status,
      'Ready'
    );
    const connecting = presentCompanionSharing({
      enabled: true,
      connection: 'connecting',
      code: 'WH8X2P',
    });
    assert.equal(connecting.status, 'Connecting');
    assert.equal(connecting.status === 'Live', false);
    assert.equal(connecting.canShare, true);
    assert.equal(
      presentCompanionSharing({ enabled: true, connection: 'live', code: 'WH8X2P' }).status,
      'Live'
    );
    assert.equal(
      presentCompanionSharing({ enabled: true, connection: 'reconnecting', code: 'WH8X2P' }).status,
      'Reconnecting'
    );
    const offline = presentCompanionSharing({
      enabled: true,
      connection: 'failed',
      code: 'WH8X2P',
    });
    assert.equal(offline.status, 'Offline');
    assert.equal(offline.code, '');
    assert.equal(offline.canStart, true);
    for (const connection of ['ended', 'expired', 'replaced']) {
      const ended = presentCompanionSharing({ enabled: true, connection, code: 'WH8X2P' });
      assert.equal(ended.status, 'Ended');
      assert.equal(ended.code, '');
      assert.equal(ended.playerUrl, '');
      assert.match(ended.detail, /no longer valid/);
      assert.equal(ended.canStart, true);
    }
  });

  it('shows a join code only while a valid session is live or reconnecting', () => {
    assert.deepEqual(
      presentCompanionJoin({ enabled: false, connection: 'live', code: 'WH8X2P' }),
      { visible: false, code: '', reconnecting: false }
    );
    assert.deepEqual(
      presentCompanionJoin({ enabled: true, connection: 'idle', code: null }),
      { visible: false, code: '', reconnecting: false }
    );
    assert.deepEqual(
      presentCompanionJoin({ enabled: true, connection: 'connecting', code: 'WH8X2P' }),
      { visible: false, code: '', reconnecting: false }
    );
    assert.deepEqual(
      presentCompanionJoin({ enabled: true, connection: 'live', code: 'WH8X2P' }),
      { visible: true, code: 'WH8X2P', reconnecting: false }
    );
    assert.deepEqual(
      presentCompanionJoin({ enabled: true, connection: 'reconnecting', code: 'WH8X2P' }),
      { visible: true, code: 'WH8X2P', reconnecting: true }
    );
    for (const connection of ['failed', 'disconnected', 'ended', 'expired', 'replaced']) {
      assert.deepEqual(
        presentCompanionJoin({ enabled: true, connection, code: 'WH8X2P' }),
        { visible: false, code: '', reconnecting: false }
      );
    }
    for (const code of [null, '', 'ABC', 'WH8X2I', 'wh8x2p', 'OLDCODE']) {
      assert.equal(
        presentCompanionJoin({ enabled: true, connection: 'live', code }).visible,
        false
      );
    }
  });

  it('keeps sharing when disabling is cancelled', () => {
    assert.deepEqual(
      resolveCompanionEnabledChange({ nextEnabled: false, sharing: true, confirmed: false }),
      { enabled: true, endSession: false }
    );
    assert.deepEqual(
      resolveCompanionEnabledChange({ nextEnabled: false, sharing: true, confirmed: true }),
      { enabled: false, endSession: true }
    );
    assert.deepEqual(
      resolveCompanionEnabledChange({ nextEnabled: false, sharing: false, confirmed: false }),
      { enabled: false, endSession: false }
    );
  });
});

describe('companion session controller', () => {
  it('starts automatically once and does not open a second session', async () => {
    let starts = 0;
    const controller = createCompanionSessionController({
      createTransport({ onStatus }) {
        return {
          start() {
            starts += 1;
            onStatus({
              connection: 'connecting',
              delivery: 'idle',
              code: 'WH8X2P',
              acceptedRev: null,
              offsetMs: null,
            });
            return { connection: 'connecting' };
          },
          stop() {},
          drop() {},
          end() {},
        };
      },
    });
    assert.equal(controller.maybeAutoStart({ enabled: false, autoStart: true }), false);
    assert.equal(controller.maybeAutoStart({ enabled: true, autoStart: false }), false);
    assert.equal(starts, 0);
    assert.equal(controller.maybeAutoStart({ enabled: true, autoStart: true }), true);
    assert.equal(controller.maybeAutoStart({ enabled: true, autoStart: true }), false);
    assert.equal(starts, 1);
  });

  it('keeps one transport and allows a manual retry after a network failure', async () => {
    let posts = 0;
    let transports = 0;
    const controller = createCompanionSessionController({
      createTransport({ onStatus }) {
        transports += 1;
        return createStorytellerTransport({
          baseUrl: 'https://clocktower-companion.redmeeple.workers.dev',
          fetch: async () => {
            posts += 1;
            if (posts === 1) throw new Error('offline');
            return {
              ok: true,
              async json() {
                return { code: 'ABCDEF', writeToken: TOKEN };
              },
            };
          },
          WebSocket: class {
            constructor() {
              this.readyState = 0;
            }
            send() {}
            close() {}
          },
          enablePublishing() {},
          disablePublishing() {},
          republish() {},
          onStatus,
        });
      },
    });
    await controller.start();
    assert.equal(controller.status().connection, 'failed');
    assert.equal(
      presentCompanionSharing({ enabled: true, ...controller.status() }).code,
      ''
    );
    const hung = controller.start();
    controller.start();
    await hung;
    assert.equal(posts, 2);
    assert.equal(transports, 1);
    assert.equal(controller.status().code, 'ABCDEF');
    assert.equal(JSON.stringify(controller.status()).includes(TOKEN), false);
  });

  it('hides the previous code while the next session is still being created', async () => {
    let mode = 'first';
    let hold;
    const transport = createStorytellerTransport({
      baseUrl: 'https://clocktower-companion.redmeeple.workers.dev',
      fetch: () => {
        if (mode === 'first') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ code: 'OLDCOD', writeToken: TOKEN }),
          });
        }
        return new Promise((resolve) => {
          hold = resolve;
        });
      },
      WebSocket: class {
        constructor() {
          this.readyState = 0;
        }
        send() {}
        close() {}
      },
      enablePublishing() {},
      disablePublishing() {},
      republish() {},
      onStatus() {},
    });
    await transport.start();
    transport.stop();
    mode = 'second';
    const pending = transport.start();
    assert.equal(transport.status.connection, 'connecting');
    assert.equal(transport.status.code, null);
    assert.equal(
      presentCompanionSharing({ enabled: true, ...transport.status }).code,
      ''
    );
    hold({
      ok: true,
      json: async () => ({ code: 'NEWCOD', writeToken: TOKEN }),
    });
    await pending;
    assert.equal(transport.status.code, 'NEWCOD');
    assert.equal(JSON.stringify(transport.status).includes(TOKEN), false);
  });
});
