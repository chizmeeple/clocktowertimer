import { APP_VERSION } from '../../changelog.js';
import { HEARTBEAT_MS } from '../../companionPublish.js';

export const COUNTDOWN_REFRESH_MS = 50;

export const CLOCK_METHODS = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'Date',
  'performance',
];

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// A returning storyteller: skip the first-run dialog and the portrait warning.
export const RETURNING_PLAYER_SETTINGS = {
  playerCount: 10,
  travellerCount: 0,
  currentPace: 'normal',
  playMusic: false,
  playSoundEffects: false,
  acceptedPortraitWarning: true,
  lastSeenVersion: APP_VERSION,
};

export function ignoreExternalRequests() {
  cy.intercept('GET', 'https://fonts.googleapis.com/**', {
    statusCode: 200,
    headers: { 'content-type': 'text/css' },
    body: '',
  });
  cy.intercept('GET', 'https://fonts.gstatic.com/**', {
    statusCode: 200,
    body: '',
  });
  cy.intercept('GET', '**/googleapis.com/**', {
    statusCode: 200,
    body: '{}',
  });
  cy.intercept('GET', '**/qrserver.com/**', { statusCode: 200, body: '' });
  cy.intercept('GET', 'https://www.youtube.com/**', {
    statusCode: 204,
    body: '',
  });
}

function showTimerDigits(win) {
  win.document.documentElement.classList.add('fonts-ready');
}

export function seedSettings(win, settings = {}) {
  win.localStorage.setItem(
    'towerTimerSettings',
    JSON.stringify({ ...RETURNING_PLAYER_SETTINGS, ...settings })
  );
}

// The countdown reads performance.now() and refreshes on a 50ms interval.
// Other timers, including the nominations countdown, keep the real clock.
export function installElapsedHarness(win) {
  let nowMs = 0;
  cy.stub(win.performance, 'now').callsFake(() => nowMs);

  const nativeSetInterval = win.setInterval.bind(win);
  const nativeClearInterval = win.clearInterval.bind(win);
  let nextFakeId = 1000000000;
  const fakeTicks = new Map();

  cy.stub(win, 'setInterval').callsFake((fn, delay, ...args) => {
    if (delay === COUNTDOWN_REFRESH_MS || delay === HEARTBEAT_MS) {
      const id = nextFakeId;
      nextFakeId += 1;
      fakeTicks.set(id, {
        kind: delay === COUNTDOWN_REFRESH_MS ? 'countdown' : 'heartbeat',
        fn,
      });
      return id;
    }
    return nativeSetInterval(fn, delay, ...args);
  });

  cy.stub(win, 'clearInterval').callsFake((id) => {
    if (fakeTicks.has(id)) {
      fakeTicks.delete(id);
      return undefined;
    }
    return nativeClearInterval(id);
  });

  function ticks(kind) {
    return [...fakeTicks.values()].filter((entry) => entry.kind === kind);
  }

  win.__elapsed = {
    advance(ms) {
      nowMs += ms;
    },
    tick() {
      for (const entry of ticks('countdown')) entry.fn();
    },
    heartbeat() {
      for (const entry of ticks('heartbeat')) entry.fn();
    },
    heartbeatCount() {
      return ticks('heartbeat').length;
    },
  };
}

export function accelerationSecondsPerMs(remainingSeconds, randomValue = 0) {
  const completionTime = Math.floor(randomValue * 8000) + 3000;
  const intervals = Math.min(
    remainingSeconds,
    Math.floor(completionTime / COUNTDOWN_REFRESH_MS)
  );
  const timePerTick = Math.ceil(remainingSeconds / intervals);
  return timePerTick / COUNTDOWN_REFRESH_MS;
}

function allowRewind(win) {
  Object.defineProperty(win.HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get() {
      return 0;
    },
    set() {},
  });
}

export function installAudioSpy(win) {
  allowRewind(win);
  const plays = [];
  cy.stub(win.HTMLAudioElement.prototype, 'play').callsFake(function () {
    plays.push({ src: this.src, el: this });
    return Promise.resolve();
  });
  win.__audioPlays = plays;
}

export function installFailingAudio(win) {
  allowRewind(win);
  cy.stub(win.HTMLAudioElement.prototype, 'play').callsFake(
    () => Promise.reject(new DOMException('Playback failed', 'NotAllowedError'))
  );
}

export function visitGameplay({
  settings = {},
  harness = true,
  randomValue = 0,
  audio = null,
  path = '/',
  onBeforeLoad,
} = {}) {
  ignoreExternalRequests();
  cy.visit(path, {
    onBeforeLoad(win) {
      showTimerDigits(win);
      seedSettings(win, settings);
      if (harness) {
        installElapsedHarness(win);
        if (randomValue !== null) {
          cy.stub(win.Math, 'random').returns(randomValue);
        }
      }
      if (audio === 'spy') installAudioSpy(win);
      if (audio === 'fail') installFailingAudio(win);
      onBeforeLoad?.(win);
    },
  });
  cy.get('#settingsDialog').should('not.be.visible');
  cy.get('.day-display > span').first().should('have.text', '1');
}

export function visitFirstRun({ randomValue = 0 } = {}) {
  ignoreExternalRequests();
  cy.visit('/', {
    onBeforeLoad(win) {
      showTimerDigits(win);
      installElapsedHarness(win);
      if (randomValue !== null) {
        cy.stub(win.Math, 'random').returns(randomValue);
      }
    },
  });
  cy.get('#settingsDialog').should('be.visible');
}

export function visitClocked({ settings = {}, audio = null, onBeforeLoad } = {}) {
  const now = Date.now();
  ignoreExternalRequests();
  cy.clock(now, CLOCK_METHODS);
  cy.visit('/', {
    onBeforeLoad(win) {
      showTimerDigits(win);
      seedSettings(win, settings);
      if (audio === 'spy') installAudioSpy(win);
      if (audio === 'fail') installFailingAudio(win);
      onBeforeLoad?.(win);
    },
  });
  cy.get('#settingsDialog').should('not.be.visible');
}

export function visitStaleGame({ settings = {} } = {}) {
  const now = Date.now();
  ignoreExternalRequests();
  cy.clock(now, CLOCK_METHODS);
  cy.visit('/', {
    onBeforeLoad(win) {
      showTimerDigits(win);
      win.localStorage.setItem(
        'towerTimerLastActiveAt',
        String(now - THREE_DAYS_MS)
      );
      seedSettings(win, settings);
    },
  });
  cy.get('#settingsDialog').should('not.be.visible');
  cy.get('#staleTabBanner').should('be.visible');
}

export function timerSeconds() {
  return cy.get('#minutes').invoke('text').then((minutes) => {
    return cy.get('#seconds').invoke('text').then((seconds) => {
      return Number(minutes) * 60 + Number(seconds);
    });
  });
}

export function expectTimer(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  cy.get('#minutes').should('have.text', minutes);
  cy.get('#seconds').should('have.text', seconds);
}

export function advance(ms) {
  cy.window().then((win) => {
    win.__elapsed.advance(ms);
  });
}

export function tick() {
  cy.window().then((win) => {
    win.__elapsed.tick();
  });
}

export function startFirstDay() {
  cy.get('#clocktowerPresets .clocktower-btn').first().click();
  cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
}

export function finishAcceleratedDay() {
  timerSeconds().then((shown) => {
    const finishMs = shown / accelerationSecondsPerMs(shown, 0);
    cy.get('#accelerateBtn').should('not.be.disabled');
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn .button-text').should('have.text', 'Time flies…');
    advance(finishMs);
    tick();
  });
  cy.get('.day-display').should('have.class', 'dusk');
  expectTimer(0);
  cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
}

export function completeWakeUp() {
  cy.get('#startBtn').click();
  cy.get('.timer-display').should('have.class', 'wake-up-countdown');
  cy.get('.day-display').should('have.class', 'dawn');
  expectTimer(6);
  advance(6000);
  tick();
  cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');
  cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
}

export function playCount(fragment) {
  return cy.window().then((win) => {
    return win.__audioPlays.filter((play) => play.src.includes(fragment))
      .length;
  });
}

export function endEndOfDaySound() {
  cy.window().then((win) => {
    const play = [...win.__audioPlays]
      .reverse()
      .find((item) => item.src.includes('end-of-day'));
    expect(play, 'end-of-day sound').to.exist;
    play.el.dispatchEvent(new Event('ended'));
  });
}

export function expectInViewport(selector) {
  cy.get(selector)
    .first()
    .scrollIntoView()
    .should(($el) => {
      const rect = $el[0].getBoundingClientRect();
      const view = $el[0].ownerDocument.defaultView;
      expect(rect.width, `${selector} width`).to.be.greaterThan(8);
      expect(rect.height, `${selector} height`).to.be.greaterThan(8);
      expect(rect.top, `${selector} top`).to.be.at.least(-1);
      expect(rect.left, `${selector} left`).to.be.at.least(-1);
      expect(rect.bottom, `${selector} bottom`).to.be.at.most(
        view.innerHeight + 1
      );
      expect(rect.right, `${selector} right`).to.be.at.most(
        view.innerWidth + 1
      );
    });
}
