const COUNTDOWN_REFRESH_MS = 50;

function installElapsedHarness(win) {
  let nowMs = 0;
  cy.stub(win.performance, 'now').callsFake(() => nowMs);

  let countdownTick = null;
  const nativeSetInterval = win.setInterval.bind(win);
  const nativeClearInterval = win.clearInterval.bind(win);
  let nextFakeId = 1000000000;
  const fakeIds = new Set();

  cy.stub(win, 'setInterval').callsFake((fn, delay, ...args) => {
    if (delay === COUNTDOWN_REFRESH_MS) {
      const id = nextFakeId;
      nextFakeId += 1;
      fakeIds.add(id);
      countdownTick = fn;
      return id;
    }
    return nativeSetInterval(fn, delay, ...args);
  });

  cy.stub(win, 'clearInterval').callsFake((id) => {
    if (fakeIds.has(id)) {
      fakeIds.delete(id);
      countdownTick = null;
      return undefined;
    }
    return nativeClearInterval(id);
  });

  win.__elapsed = {
    advance(ms) {
      nowMs += ms;
    },
    tick() {
      if (countdownTick) countdownTick();
    },
  };
}

function displayedSeconds(secondsRemaining) {
  if (!(secondsRemaining > 0)) return 0;
  const millis = Math.round(secondsRemaining * 1000);
  if (millis <= 0) return 0;
  return Math.ceil(millis / 1000);
}

function accelerationSecondsPerMs(remainingSeconds, randomValue = 0) {
  const completionTime = Math.floor(randomValue * 8000) + 3000;
  const intervals = Math.min(
    remainingSeconds,
    Math.floor(completionTime / COUNTDOWN_REFRESH_MS)
  );
  const timePerTick = Math.ceil(remainingSeconds / intervals);
  return timePerTick / COUNTDOWN_REFRESH_MS;
}

function closeFirstRunSettings() {
  cy.get('#settingsDialog').should('be.visible');
  cy.get('.tab-button[data-tab="effects"]').click();
  cy.get('#playSoundEffects').uncheck().trigger('change');
  cy.get('.tab-button[data-tab="music"]').click();
  cy.get('#playMusic').uncheck().trigger('change');
  cy.get('#closeSettings').click();
  cy.get('#settingsDialog').should('not.be.visible');
}

function visitWithHarness({ randomValue = null } = {}) {
  cy.visit('/', {
    onBeforeLoad(win) {
      installElapsedHarness(win);
      if (randomValue !== null) {
        cy.stub(win.Math, 'random').returns(randomValue);
      }
    },
  });
  closeFirstRunSettings();
}

function startFirstDay() {
  cy.get('#clocktowerPresets .clocktower-btn').first().click();
  cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
}

function timerSeconds() {
  return cy.get('#minutes').invoke('text').then((minutes) => {
    return cy.get('#seconds').invoke('text').then((seconds) => {
      return Number(minutes) * 60 + Number(seconds);
    });
  });
}

function expectTimer(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  cy.get('#minutes').should('have.text', minutes);
  cy.get('#seconds').should('have.text', seconds);
}

function advance(ms) {
  cy.window().then((win) => {
    win.__elapsed.advance(ms);
  });
}

function tick() {
  cy.window().then((win) => {
    win.__elapsed.tick();
  });
}

function confirmAccelerate() {
  cy.get('#accelerateBtn').should('not.be.disabled');
  cy.get('#accelerateBtn').click();
  cy.get('#accelerateBtn').click();
  cy.get('#accelerateBtn .button-text').should('have.text', 'Time flies…');
}

function showPage() {
  cy.document().then((doc) => {
    Object.defineProperty(doc, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    doc.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('Elapsed countdown', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('counts down by monotonic elapsed time rather than callback count', () => {
    visitWithHarness();
    startFirstDay();

    timerSeconds().then((start) => {
      tick();
      tick();
      tick();
      expectTimer(start);

      advance(5000);
      tick();
      expectTimer(start - 5);

      let stepped = start - 5;
      for (let i = 0; i < 100; i += 1) {
        advance(50);
        tick();
        stepped -= 0.05;
      }
      expectTimer(start - 10);
      expectTimer(displayedSeconds(stepped));
    });
  });

  it('applies the full delay when a single callback is late', () => {
    visitWithHarness();
    startFirstDay();

    timerSeconds().then((start) => {
      advance(12000);
      tick();
      expectTimer(start - 12);
    });
  });

  it('excludes paused time and resumes from the settled remainder', () => {
    visitWithHarness();
    startFirstDay();

    timerSeconds().then((start) => {
      advance(2500);
      tick();
      expectTimer(displayedSeconds(start - 2.5));

      cy.get('#startBtn').click();
      cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');

      advance(10000);
      tick();
      expectTimer(displayedSeconds(start - 2.5));

      cy.get('#startBtn').click();
      cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');

      advance(0);
      tick();
      expectTimer(displayedSeconds(start - 2.5));

      advance(1500);
      tick();
      expectTimer(displayedSeconds(start - 4));
    });
  });

  it('consumes accelerated time for a known elapsed duration without a jump', () => {
    visitWithHarness({ randomValue: 0 });
    startFirstDay();

    timerSeconds().then((start) => {
      advance(2000);
      tick();
      let remaining = start - 2;
      expectTimer(remaining);

      confirmAccelerate();
      advance(0);
      tick();
      expectTimer(displayedSeconds(remaining));

      const elapsedMs = 1000;
      const rate = accelerationSecondsPerMs(remaining);
      advance(elapsedMs);
      tick();
      remaining -= elapsedMs * rate;
      expectTimer(displayedSeconds(remaining));
      expect(rate).to.be.greaterThan(1 / 1000);
    });
  });

  it('switches between accelerated and normal speed without losing or double-counting time', () => {
    visitWithHarness({ randomValue: 0 });
    startFirstDay();

    timerSeconds().then((start) => {
      let remaining = start;
      confirmAccelerate();

      const acceleratedMs = 500;
      const rate = accelerationSecondsPerMs(remaining);
      advance(acceleratedMs);
      tick();
      remaining -= acceleratedMs * rate;
      const shown = displayedSeconds(remaining);
      expectTimer(shown);

      cy.get('#startBtn').click();
      cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
      advance(8000);
      tick();
      expectTimer(shown);

      cy.get('#startBtn').click();
      cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
      advance(0);
      tick();
      expectTimer(shown);

      advance(2000);
      tick();
      remaining -= 2;
      expectTimer(displayedSeconds(remaining));
    });
  });

  it('keeps remaining time exact across rapid acceleration transitions', () => {
    visitWithHarness({ randomValue: 0 });
    startFirstDay();

    timerSeconds().then((start) => {
      let remaining = start;

      advance(1000);
      tick();
      remaining -= 1;
      expectTimer(displayedSeconds(remaining));

      confirmAccelerate();
      const firstRate = accelerationSecondsPerMs(remaining);
      advance(500);
      tick();
      remaining -= 500 * firstRate;
      const afterFirst = displayedSeconds(remaining);
      expectTimer(afterFirst);

      cy.get('#accelerateBtn').invoke('prop', 'disabled', false);
      cy.get('#accelerateBtn').click();
      advance(0);
      tick();
      expectTimer(afterFirst);

      const secondRate = accelerationSecondsPerMs(remaining);
      advance(250);
      tick();
      remaining -= 250 * secondRate;
      expectTimer(displayedSeconds(remaining));

      cy.get('#startBtn').click();
      cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
      advance(4000);
      tick();
      expectTimer(displayedSeconds(remaining));

      cy.get('#startBtn').click();
      cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
      advance(1000);
      tick();
      remaining -= 1;
      expectTimer(displayedSeconds(remaining));
    });
  });

  it('restores the day length when reset during a running countdown', () => {
    visitWithHarness();
    startFirstDay();

    cy.get('#clocktowerPresets .clocktower-btn')
      .first()
      .then(($btn) => {
        const expected =
          Number($btn.attr('data-minutes')) * 60 +
          Number($btn.attr('data-seconds'));

        advance(4000);
        tick();
        timerSeconds().should('eq', expected - 4);

        cy.get('#resetBtn').click();
        cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
        expectTimer(expected);

        advance(4000);
        tick();
        expectTimer(expected);
      });
  });

  it('completes exactly once when a late callback passes the end', () => {
    visitWithHarness({ randomValue: 0 });
    startFirstDay();

    timerSeconds().then((start) => {
      const rate = accelerationSecondsPerMs(start);
      const finishMs = start / rate;

      confirmAccelerate();
      advance(finishMs - 1);
      tick();
      cy.get('.day-display').should('not.have.class', 'dusk');
      expectTimer(1);

      advance(1);
      tick();
      expectTimer(0);
      cy.get('.day-display').should('have.class', 'dusk');
      cy.get('.day-display > span').first().should('have.text', '1');
      cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
      cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');

      advance(30000);
      tick();
      tick();
      expectTimer(0);
      cy.get('.day-display').should('have.class', 'dusk');
      cy.get('.day-display > span').first().should('have.text', '1');
      cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
      cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');
    });
  });

  it('runs the wake-up countdown from elapsed time and starts the next day once', () => {
    visitWithHarness({ randomValue: 0 });
    startFirstDay();

    timerSeconds().then((start) => {
      const finishMs = start / accelerationSecondsPerMs(start);
      confirmAccelerate();
      advance(finishMs);
      tick();

      cy.get('#startBtn').click();
      cy.get('.timer-display').should('have.class', 'wake-up-countdown');
      cy.get('.day-display').should('have.class', 'dawn');
      expectTimer(6);

      advance(5999);
      tick();
      cy.get('.timer-display').should('have.class', 'wake-up-countdown');
      expectTimer(1);

      advance(1);
      tick();
      cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');
      cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
      cy.get('.day-display').should('not.have.class', 'dusk');
      cy.get('.day-display > span').first().should('have.text', '2');

      timerSeconds().then((dayStart) => {
        advance(3000);
        tick();
        expectTimer(dayStart - 3);
      });
    });
  });

  it('shows the correct remaining time as soon as the tab becomes visible', () => {
    visitWithHarness();
    startFirstDay();

    timerSeconds().then((start) => {
      advance(8000);
      showPage();
      expectTimer(start - 8);
    });
  });
});

describe('Elapsed countdown with Cypress clock', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('follows performance.now() controlled by cy.clock()', () => {
    cy.clock(Date.now(), [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'Date',
      'performance',
    ]);
    cy.visit('/');
    // The first-run settings dialog is opened on a 100ms timeout, scheduled
    // after the page load event Cypress waits for.
    cy.wait(50);
    cy.tick(200);
    cy.window().then((win) => {
      const dialog = win.document.getElementById('settingsDialog');
      expect(dialog.open, 'settings dialog opened by the fake clock').to.eq(
        true
      );
    });
    closeFirstRunSettings();
    startFirstDay();

    timerSeconds().then((start) => {
      cy.tick(5000);
      expectTimer(start - 5);
    });
  });
});
