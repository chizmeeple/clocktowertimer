import {
  accelerationSecondsPerMs,
  advance,
  endEndOfDaySound,
  expectTimer,
  finishAcceleratedDay,
  playCount,
  startFirstDay,
  tick,
  timerSeconds,
  visitClocked,
  visitGameplay,
} from '../support/gameplay.js';

function stubSteadyAcceleration(win) {
  cy.stub(win.Math, 'random').returns(0);
}

function finishDayOnClock() {
  timerSeconds().then((shown) => {
    const finishMs = Math.ceil(shown / accelerationSecondsPerMs(shown, 0));
    const tickMs = Math.ceil(finishMs / COUNTDOWN_STEP_MS) * COUNTDOWN_STEP_MS;
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn .button-text').should('have.text', 'Time flies…');
    cy.tick(tickMs);
  });
  cy.get('.day-display').should('have.class', 'dusk');
  cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
}

const COUNTDOWN_STEP_MS = 50;

describe('Sound cues', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('plays wake-up once when a day starts and end-of-day once when it finishes', () => {
    visitGameplay({
      settings: { playSoundEffects: true },
      audio: 'spy',
    });
    startFirstDay();
    playCount('wake-up').should('eq', 1);
    playCount('end-of-day').should('eq', 0);

    cy.get('#startBtn').click();
    cy.get('#startBtn').click();
    playCount('wake-up').should('eq', 1);
    playCount('end-of-day').should('eq', 0);

    finishAcceleratedDay();
    playCount('end-of-day').should('eq', 1);
    cy.get('#startBtn').should('be.disabled');

    advance(30000);
    tick();
    tick();
    playCount('end-of-day').should('eq', 1);
    cy.get('.day-display').should('have.class', 'dusk');
    cy.get('.day-display > span').first().should('have.text', '1');

    endEndOfDaySound();
    cy.get('#startBtn').should('not.be.disabled');
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
  });

  it('does not play or schedule the end-of-day sound when a running day is reset', () => {
    visitGameplay({
      settings: { playSoundEffects: true },
      audio: 'spy',
    });
    startFirstDay();

    timerSeconds().then((dayLength) => {
      advance(3000);
      tick();
      cy.get('#resetBtn').click();
      playCount('end-of-day').should('eq', 0);
      expectTimer(dayLength);

      advance((dayLength + 5) * 1000);
      tick();
      playCount('end-of-day').should('eq', 0);
      expectTimer(dayLength);
      cy.get('.day-display').should('not.have.class', 'dusk');
    });
  });

  it('plays the end-of-day sound chosen while the day is paused', () => {
    visitGameplay({
      settings: { playSoundEffects: true },
      audio: 'spy',
    });
    startFirstDay();
    cy.get('#startBtn').click();

    cy.get('#settingsBtn').click();
    cy.get('.tab-button[data-tab="effects"]').click();
    cy.get('#endOfDaySound').select('bell-and-crows-v2.mp3');
    cy.get('#closeSettings').click();
    cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');

    cy.get('#startBtn').click();
    finishAcceleratedDay();

    cy.window().then((win) => {
      const endSounds = win.__audioPlays.filter((play) =>
        play.src.includes('end-of-day')
      );
      expect(endSounds).to.have.length(1);
      expect(endSounds[0].src).to.include('bell-and-crows-v2.mp3');
      expect(endSounds[0].src).to.not.include('cathedral-bell');
    });
  });

  it('does not play sound effects when they are turned off', () => {
    visitGameplay({ audio: 'spy' });
    startFirstDay();
    finishAcceleratedDay();
    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    playCount('wake-up').should('eq', 0);
    playCount('end-of-day').should('eq', 0);
    playCount('nominations-open').should('eq', 0);
    cy.get('#startBtn').should('be.disabled');
  });

  it('still reaches dusk when playback fails', () => {
    visitGameplay({
      settings: { playSoundEffects: true },
      audio: 'fail',
    });
    startFirstDay();
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');

    finishAcceleratedDay();
    cy.get('#startBtn').should('not.be.disabled');
    cy.get('.day-display > span').first().should('have.text', '1');
  });

  it('announces nominations once when their countdown reaches zero', () => {
    visitClocked({
      settings: { playSoundEffects: true, autoOpenNominations: true },
      audio: 'spy',
      onBeforeLoad: stubSteadyAcceleration,
    });
    startFirstDay();
    finishDayOnClock();

    cy.get('#nominationsCountdown').should('be.visible');
    cy.get('#nominationsCountdownSeconds').should('have.text', '60');
    playCount('nominations-open').should('eq', 0);

    cy.tick(59000);
    cy.get('#nominationsCountdownSeconds').should('have.text', '1');
    playCount('nominations-open').should('eq', 0);

    cy.tick(1000);
    cy.get('#nominationsCountdown').should('not.be.visible');
    playCount('nominations-open').should('eq', 1);
    playCount('end-of-day').should('eq', 1);

    cy.tick(5000);
    playCount('nominations-open').should('eq', 1);
    cy.get('.day-display').should('have.class', 'dusk');
    cy.get('.day-display > span').first().should('have.text', '1');
  });

  it('clears a pending nominations announcement when the next day starts', () => {
    visitClocked({
      settings: { playSoundEffects: true, autoOpenNominations: true },
      audio: 'spy',
      onBeforeLoad: stubSteadyAcceleration,
    });
    startFirstDay();
    finishDayOnClock();

    cy.get('#nominationsCountdown').should('be.visible');
    endEndOfDaySound();
    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    cy.get('#nominationsCountdown').should('not.be.visible');

    cy.tick(7000);
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    cy.get('.day-display > span').first().should('have.text', '2');
    playCount('nominations-open').should('eq', 0);
    cy.get('#nominationsCountdown').should('not.be.visible');
  });

  it('uses a nominations delay chosen before a day starts', () => {
    visitClocked({
      settings: { playSoundEffects: false, autoOpenNominations: true },
      onBeforeLoad: stubSteadyAcceleration,
    });
    cy.get('#settingsBtn').click();
    cy.get('#autoOpenNominationsDelay').select('30');
    cy.get('#closeSettings').click();

    cy.window().then((win) => {
      const settings = JSON.parse(win.localStorage.getItem('towerTimerSettings'));
      expect(settings.autoOpenNominationsDelay).to.eq(30);
    });

    startFirstDay();
    finishDayOnClock();

    cy.get('#nominationsCountdown').should('be.visible');
    cy.get('#nominationsCountdownSeconds').should('have.text', '30');
  });

  it('uses a nominations delay changed while a day is running', () => {
    visitClocked({
      settings: { playSoundEffects: false, autoOpenNominations: true },
      onBeforeLoad: stubSteadyAcceleration,
    });
    startFirstDay();

    cy.get('#settingsBtn').click();
    cy.get('#autoOpenNominationsDelay').select('90');
    cy.get('#closeSettings').click();

    cy.window().then((win) => {
      const settings = JSON.parse(win.localStorage.getItem('towerTimerSettings'));
      expect(settings.autoOpenNominationsDelay).to.eq(90);
    });

    finishDayOnClock();

    cy.get('#nominationsCountdown').should('be.visible');
    cy.get('#nominationsCountdownSeconds').should('have.text', '90');
  });
});
