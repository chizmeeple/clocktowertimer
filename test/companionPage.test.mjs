import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  COMPANION_WARNING_SECONDS,
  nextCompanionAlert,
} from '../js/companionAlerts.js';
import {
  companionBaseUrl,
  companionQrImageUrl,
  isSessionCode,
  normaliseSessionCode,
  presentCompanionPlayerShare,
  sessionCodeFromLocation,
} from '../js/companionCode.js';
import { formatCountdown, presentCompanion } from '../js/companionDisplay.js';
import { APP_VERSION } from '../js/changelog.js';

function view(overrides) {
  return {
    connection: 'live',
    fresh: true,
    stale: false,
    phase: 'day',
    day: 1,
    counts: { townsfolk: 7, outsider: 0, minion: 2, demon: 1, traveller: 0 },
    timerStatus: 'running',
    rate: 1,
    kind: 'day',
    problem: null,
    displaySeconds: 285,
    locallyComplete: false,
    confirmedComplete: false,
    rev: 1,
    ...overrides,
  };
}

describe('companion page codes', () => {
  it('normalises a spoken code and rejects anything else', () => {
    assert.equal(normaliseSessionCode(' ab-cd ef '), 'ABCDEF');
    assert.equal(normaliseSessionCode('oiloiu'), '01101U');
    assert.equal(isSessionCode(normaliseSessionCode('oiloiu')), false);
    assert.equal(isSessionCode('ABC123'), true);
    assert.equal(isSessionCode('ABCDEFG'), false);
    assert.equal(
      sessionCodeFromLocation({ search: '?code=ab%20c12o' }),
      'ABC120',
    );
  });

  it('uses the local proxy at home and the deployed worker in production', () => {
    assert.equal(companionBaseUrl({ hostname: '127.0.0.1' }), '/companion-api');
    assert.equal(companionBaseUrl({ hostname: 'localhost' }), '/companion-api');
    assert.equal(
      companionBaseUrl({ hostname: 'timer.arcane-scripts.net' }),
      'https://clocktower-companion.redmeeple.workers.dev',
    );
  });
});

describe('companion presentation', () => {
  it('shows a running day, a pause, and a sped-up countdown', () => {
    const running = presentCompanion(view({}));
    assert.equal(running.headline, '04:45');
    assert.equal(running.countdown, '04:45');
    assert.equal(running.kicker, 'Day 1');
    assert.equal(presentCompanion(view({ day: 4 })).kicker, 'Day 4');
    assert.equal(running.counts.traveller, 0);
    assert.equal(running.night, false);

    const paused = presentCompanion(
      view({ timerStatus: 'paused', displaySeconds: 120 }),
    );
    assert.equal(paused.headline, '02:00');
    assert.match(paused.message, /paused/i);

    const fast = presentCompanion(view({ rate: 4, displaySeconds: 30 }));
    assert.match(fast.message, /sped up/i);
  });

  it('keeps a local zero on the day and gives night its own message', () => {
    const zero = presentCompanion(
      view({
        displaySeconds: 0,
        locallyComplete: true,
      }),
    );
    assert.equal(zero.headline, '00:00');
    assert.equal(zero.night, false);
    assert.match(zero.message, /does not end the day/i);

    const night = presentCompanion(
      view({
        phase: 'night',
        timerStatus: 'finished',
        displaySeconds: 0,
        confirmedComplete: true,
        day: 3,
      }),
    );
    assert.equal(night.headline, 'Back to Town');
    assert.equal(night.countdown, null);
    assert.equal(night.night, true);
    assert.equal(night.kicker, 'Day 3');
  });

  it('describes pregame, wake, expiry and an unsupported version', () => {
    assert.match(
      presentCompanion(
        view({ phase: 'pregame', timerStatus: 'idle', displaySeconds: null }),
      ).headline,
      /ready/i,
    );
    const wake = presentCompanion(
      view({ phase: 'wake', kind: 'wake', displaySeconds: 10 }),
    );
    assert.equal(wake.kicker, 'Wake up');
    assert.equal(wake.headline, '00:10');

    const expired = presentCompanion(
      view({ connection: 'expired', fresh: false, stale: true }),
    );
    assert.match(expired.status.label, /expired/i);
    assert.equal(expired.showSession, true);

    const ended = presentCompanion(view({ connection: 'ended' }));
    assert.match(ended.status.label, /ended/i);

    const unsupported = presentCompanion(
      view({ problem: 'unsupported-version', displaySeconds: 10 }),
    );
    assert.match(unsupported.headline, /update/i);
    assert.equal(unsupported.countdown, null);

    const reconnecting = presentCompanion(
      view({
        connection: 'reconnecting',
        fresh: false,
        stale: true,
        counts: null,
      }),
    );
    assert.equal(reconnecting.status.label, 'Offline');
    assert.match(reconnecting.status.detail, /can’t reach the session/i);

    assert.equal(formatCountdown(null), null);
    assert.equal(
      presentCompanion(view({ connection: 'idle' })).showSession,
      false,
    );
  });
});

describe('companion player sharing', () => {
  const code = 'ABC123';

  function share(overrides) {
    return presentCompanionPlayerShare({
      connection: 'live',
      code,
      established: true,
      ...overrides,
    });
  }

  it('encodes only the public player url for a live session', () => {
    const live = share({});
    assert.equal(live.canShare, true);
    assert.equal(live.code, 'ABC123');
    assert.equal(
      live.playerUrl,
      'https://timer.arcane-scripts.net/c?code=ABC123',
    );
    assert.equal(live.playerUrl.includes('/c/?'), false);
    const qr = companionQrImageUrl(live.playerUrl);
    assert.match(
      decodeURIComponent(qr),
      /https:\/\/timer\.arcane-scripts\.net\/c\?code=ABC123/,
    );
    assert.equal(qr.includes('writeToken'), false);
    assert.equal(share({ stale: true }).canShare, true);
  });

  it('hides the code until the session is established, and after it ends', () => {
    assert.equal(
      share({ connection: 'idle', code: null, established: false }).canShare,
      false,
    );
    assert.equal(
      share({ connection: 'connecting', established: false }).playerUrl,
      '',
    );
    assert.equal(
      share({ connection: 'connecting', established: true }).canShare,
      false,
    );
    assert.equal(
      share({ connection: 'reconnecting', established: false }).canShare,
      false,
    );
    assert.equal(
      share({ connection: 'reconnecting', established: true }).playerUrl,
      'https://timer.arcane-scripts.net/c?code=ABC123',
    );
    for (const connection of ['ended', 'expired', 'idle']) {
      const closed = share({ connection, established: false });
      assert.equal(closed.canShare, false);
      assert.equal(closed.code, '');
      assert.equal(closed.playerUrl, '');
    }
    assert.equal(share({ code: 'NOPE' }).canShare, false);
    assert.equal(share({ code: '' }).canShare, false);
    assert.equal(share({ code: null }).canShare, false);
  });
});

describe('companion heading style', () => {
  it('enlarges the phase heading without overtaking the countdown', () => {
    const css = readFileSync(
      new URL('../css/companion.css', import.meta.url),
      'utf8',
    );
    const kicker = css.match(/\.kicker\s*\{([^}]+)\}/)[1];
    const headline = css.match(/\.headline\s*\{([^}]+)\}/)[1];
    assert.match(kicker, /font-size:\s*clamp\(1\.75rem, 8vw, 2\.75rem\)/);
    assert.match(kicker, /font-weight:\s*700/);
    assert.match(kicker, /var\(--colour-gold\)/);
    assert.match(headline, /font-size:\s*clamp\(3\.5rem, 22vw, 7\.5rem\)/);
  });
});

describe('companion alerts', () => {
  it('warns once before zero and does not warn from a stale gap', () => {
    let state = { previous: null, rev: null, phase: null };
    state = nextCompanionAlert(state, view({ displaySeconds: 40 }), true);
    assert.equal(state.alert, null);
    state = nextCompanionAlert(
      state,
      view({ displaySeconds: COMPANION_WARNING_SECONDS }),
      true,
    );
    assert.equal(state.alert, 'warning');
    state = nextCompanionAlert(state, view({ displaySeconds: 20 }), true);
    assert.equal(state.alert, null);
    state = nextCompanionAlert(
      state,
      view({ displaySeconds: 0, locallyComplete: true }),
      true,
    );
    assert.equal(state.alert, 'zero');
    state = nextCompanionAlert(
      state,
      view({ displaySeconds: 0, locallyComplete: true }),
      true,
    );
    assert.equal(state.alert, null);
    state = nextCompanionAlert(state, view({ displaySeconds: 30 }), true);
    assert.equal(state.alert, null);

    const skippedWarning = nextCompanionAlert(
      { previous: 40, rev: 1, phase: 'day' },
      view({ displaySeconds: 0, locallyComplete: true }),
      true,
    );
    assert.equal(skippedWarning.alert, 'zero');

    const staleGap = nextCompanionAlert(
      { previous: 40, rev: 1, phase: 'day' },
      view({ fresh: false, stale: true, displaySeconds: 5 }),
      true,
    );
    assert.equal(staleGap.alert, null);

    const stale = nextCompanionAlert(
      { previous: 40, rev: 1, phase: 'day' },
      view({
        fresh: false,
        stale: true,
        displaySeconds: 0,
        locallyComplete: true,
      }),
      true,
    );
    assert.equal(stale.alert, null);
    const afterStale = nextCompanionAlert(
      stale,
      view({ displaySeconds: 0, locallyComplete: true }),
      true,
    );
    assert.equal(afterStale.alert, null);

    const reconnected = nextCompanionAlert(
      { previous: 40, rev: 1, phase: 'day' },
      view({ rev: 2, displaySeconds: 5 }),
      true,
    );
    assert.equal(reconnected.alert, null);

    const joinedAtZero = nextCompanionAlert(
      { previous: null, rev: null, phase: null },
      view({ displaySeconds: 0, locallyComplete: true }),
      true,
    );
    assert.equal(joinedAtZero.alert, null);
  });
});

describe('companion page policy', () => {
  it('allows only the deployed worker on the companion page', () => {
    const page = readFileSync(
      new URL('../c/index.html', import.meta.url),
      'utf8',
    );
    const timer = readFileSync(
      new URL('../index.html', import.meta.url),
      'utf8',
    );
    assert.match(
      page,
      new RegExp(`\\.\\./css/companion\\.css\\?v=${APP_VERSION}`),
    );
    assert.match(
      page,
      new RegExp(`\\.\\./js/companion-page\\.js\\?v=${APP_VERSION}`),
    );
    assert.match(page, /img-src 'self' https:\/\/api\.qrserver\.com/);
    assert.match(
      page,
      /https:\/\/clocktower-companion\.redmeeple\.workers\.dev/,
    );
    assert.match(page, /href="https:\/\/arcane-scripts\.net"/);
    assert.match(page, /rel="noopener noreferrer"/);
    assert.match(page, />Arcane Scripts</);
    assert.match(page, /<h3 id="optionsHeading">Options<\/h3>/);
    assert.match(page, /Enable alerts/);
    assert.match(page, /id="testSound"/);
    assert.match(page, /Keep screen on/);
    assert.doesNotMatch(page, /<details|<summary/);
    assert.match(page, /Show QR code/);
    assert.match(page, /Join this game/);
    assert.doesNotMatch(timer, /companion-footer/);
    assert.doesNotMatch(timer, /Keep screen on/);
    assert.match(page, /wss:\/\/clocktower-companion\.redmeeple\.workers\.dev/);
    assert.doesNotMatch(page, /connect-src[^;]*\*/);
    const timerPolicy = timer.match(/content="([^"]*connect-src[^"]*)"/)[1];
    assert.match(
      timerPolicy,
      /https:\/\/clocktower-companion\.redmeeple\.workers\.dev/,
    );
    assert.match(
      timerPolicy,
      /wss:\/\/clocktower-companion\.redmeeple\.workers\.dev/,
    );
    assert.equal(timerPolicy.match(/wss:\/\//g).length, 1);
    assert.doesNotMatch(timerPolicy, /\*\.workers\.dev/);
    assert.doesNotMatch(timerPolicy, /wss:\/\/\*/);
  });

  it('resolves companion assets from /c, /c/ and /c/index.html', () => {
    const page = readFileSync(
      new URL('../c/index.html', import.meta.url),
      'utf8',
    );
    const refs = [...page.matchAll(/(?:href|src)="(\.\.\/[^"]+)"/g)].map(
      (match) => match[1].split('?')[0],
    );
    assert.deepEqual(refs, [
      '../favicon.svg',
      '../css/styles.css',
      '../css/companion.css',
      '../index.html',
      '../js/companion-page.js',
    ]);
    for (const base of [
      'http://127.0.0.1:8006/c',
      'http://127.0.0.1:8006/c/',
      'http://127.0.0.1:8006/c/index.html',
      'http://127.0.0.1:8006/c?code=ABC123',
    ]) {
      for (const ref of refs) {
        const url = new URL(ref, base);
        assert.equal(url.pathname.startsWith('/c/'), false);
        assert.equal(
          existsSync(
            fileURLToPath(new URL(`..${url.pathname}`, import.meta.url)),
          ),
          true,
        );
      }
    }
    assert.equal(
      existsSync(fileURLToPath(new URL('../companion.html', import.meta.url))),
      false,
    );
  });
});
