import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  COMPANION_WARNING_SECONDS,
  nextCompanionAlert,
  nextDayStart,
} from '../js/companionAlerts.js';
import {
  companionBaseUrl,
  companionQrImageUrl,
  isSessionCode,
  normaliseSessionCode,
  presentCompanionPlayerShare,
  sessionCodeFromLocation,
} from '../js/companionCode.js';
import {
  formatCountdown,
  missedCompanionNotice,
  presentCompanion,
} from '../js/companionDisplay.js';
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
    const skippedToTwelve = nextCompanionAlert(
      { previous: 40, rev: 1, phase: 'day' },
      view({ displaySeconds: 12 }),
      true,
    );
    assert.equal(skippedToTwelve.alert, 'warning');

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

    const paused = nextCompanionAlert(
      { previous: 40, rev: 1, phase: 'day' },
      view({ timerStatus: 'paused', displaySeconds: 40 }),
      true,
    );
    assert.equal(paused.alert, null);
    const resumed = nextCompanionAlert(
      paused,
      view({ displaySeconds: 10, rev: 2 }),
      true,
    );
    assert.equal(resumed.alert, null);

    const staleThenLow = nextCompanionAlert(
      { previous: 40, rev: 1, phase: 'day' },
      view({ fresh: false, stale: true, displaySeconds: 40 }),
      true,
    );
    assert.equal(
      nextCompanionAlert(staleThenLow, view({ displaySeconds: 5 }), true).alert,
      null,
    );

    const hidden = nextCompanionAlert(
      { previous: 40, rev: 1, phase: 'day' },
      view({ displaySeconds: 0, locallyComplete: true }),
      true,
      false,
    );
    assert.equal(hidden.alert, null);
    assert.equal(hidden.previous, null);
    const afterHidden = nextCompanionAlert(
      hidden,
      view({ displaySeconds: 0, locallyComplete: true }),
      true,
      true,
    );
    assert.equal(afterHidden.alert, null);

    const accelerated = nextCompanionAlert(
      { previous: 40, rev: 1, phase: 'day' },
      view({ displaySeconds: 20, rate: 4 }),
      true,
    );
    assert.equal(accelerated.alert, null);
    const acceleratedZero = nextCompanionAlert(
      { previous: 10, rev: 1, phase: 'day' },
      view({ displaySeconds: 0, rate: 4, locallyComplete: true }),
      true,
    );
    assert.equal(acceleratedZero.alert, 'zero');

    const endedEarly = nextCompanionAlert(
      { previous: 4, rev: 1, phase: 'day' },
      view({
        phase: 'night',
        timerStatus: 'finished',
        kind: null,
        rate: 0,
        displaySeconds: 0,
        confirmedComplete: true,
        rev: 2,
      }),
      false,
    );
    assert.equal(endedEarly.alert, 'zero');
    assert.equal(
      nextCompanionAlert(endedEarly, view({
        phase: 'night',
        timerStatus: 'finished',
        kind: null,
        rate: 0,
        displaySeconds: 0,
        confirmedComplete: true,
        rev: 2,
      }), false).alert,
      null,
    );
  });
});

describe('companion day start', () => {
  function remember(overrides) {
    return nextDayStart(null, view(overrides), true).previous;
  }

  it('plays once for a preset start and once for wake up, not for a running edit', () => {
    const waiting = remember({
      phase: 'pregame',
      timerStatus: 'idle',
      kind: null,
      displaySeconds: null,
    });
    const preset = nextDayStart(waiting, view({ displaySeconds: 285 }), true);
    assert.equal(preset.started, true);
    const ticking = nextDayStart(
      preset.previous,
      view({ displaySeconds: 280 }),
      true,
    );
    assert.equal(ticking.started, false);
    const edited = nextDayStart(
      ticking.previous,
      view({ displaySeconds: 600, rev: 2 }),
      true,
    );
    assert.equal(edited.started, false);

    const night = nextDayStart(
      edited.previous,
      view({
        phase: 'night',
        timerStatus: 'finished',
        kind: null,
        rate: 0,
        displaySeconds: 0,
        confirmedComplete: true,
        rev: 3,
      }),
      true,
    );
    assert.equal(night.started, false);
    const wake = nextDayStart(
      night.previous,
      view({
        phase: 'wake',
        kind: 'wake',
        timerStatus: 'running',
        displaySeconds: 6,
        day: 2,
        rev: 4,
      }),
      true,
    );
    assert.equal(wake.started, true);
    const repeatedWake = nextDayStart(
      wake.previous,
      view({
        phase: 'wake',
        kind: 'wake',
        timerStatus: 'running',
        displaySeconds: 4,
        day: 2,
        rev: 4,
      }),
      true,
    );
    assert.equal(repeatedWake.started, false);
    const dayAfterWake = nextDayStart(
      wake.previous,
      view({ displaySeconds: 285, day: 2, rev: 5 }),
      true,
    );
    assert.equal(dayAfterWake.started, false);
  });

  it('stays quiet for the first sample, a resume, a hidden page, and a stale jump', () => {
    assert.equal(
      nextDayStart(null, view({ phase: 'wake', kind: 'wake', displaySeconds: 6 }), true)
        .started,
      false,
    );
    const paused = nextDayStart(
      { phase: 'day', day: 1 },
      view({ timerStatus: 'paused', displaySeconds: 40 }),
      true,
    );
    assert.equal(paused.started, false);
    assert.equal(
      nextDayStart(paused.previous, view({ displaySeconds: 40, rev: 2 }), true)
        .started,
      false,
    );
    assert.equal(
      nextDayStart(
        { phase: 'night', day: 1 },
        view({ phase: 'wake', kind: 'wake', displaySeconds: 6, rev: 2 }),
        false,
      ).started,
      false,
    );
    const stale = nextDayStart(
      { phase: 'night', day: 1 },
      view({ fresh: false, stale: true, displaySeconds: 285 }),
      true,
    );
    assert.equal(stale.started, false);
    assert.equal(stale.previous, null);
  });
});

describe('missed companion events', () => {
  it('notes a day that ended or advanced while the page was away', () => {
    const watching = { phase: 'day', day: 2 };
    assert.equal(
      missedCompanionNotice(watching, view({ phase: 'night', confirmedComplete: true })),
      'The day ended while this page was away.',
    );
    assert.equal(
      missedCompanionNotice(watching, view({ phase: 'wake', day: 3 })),
      'The day ended while this page was away.',
    );
    assert.equal(
      missedCompanionNotice(watching, view({ displaySeconds: 20 })),
      '',
    );
    assert.equal(
      missedCompanionNotice({ phase: 'night', day: 2 }, view({ phase: 'wake', day: 3 })),
      '',
    );
    assert.equal(missedCompanionNotice(null, view({ phase: 'night' })), '');
    assert.equal(
      missedCompanionNotice(watching, view({ fresh: false, phase: 'night' })),
      '',
    );
  });
});

describe('companion alert test controls', () => {
  it('keeps both test buttons available and explains a missing api', () => {
    const page = readFileSync(
      new URL('../js/companion-page.js', import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(page, /testSoundButton\.hidden\s*=/);
    assert.doesNotMatch(page, /testVibrationButton\.hidden\s*=/);
    assert.match(page, /if \(!canSound && !canVibrate\) alertOption\.hidden = true/);
    assert.match(page, /This browser cannot play sound\./);
    assert.match(page, /This browser cannot vibrate\./);
    assert.match(page, /The browser did not vibrate\./);
    assert.match(page, /Vibration requested\./);
    assert.match(page, /navigator\.vibrate\(\[200, 100, 200, 100, 200\]\)/);
    assert.match(page, /\[300, 150, 300, 150, 500\]/);
    assert.doesNotMatch(page, /device vibrated/i);
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
    assert.match(page, /id="testVibration"/);
    assert.match(page, /id="vibrationStatus"[^>]*aria-live="polite"/);
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
