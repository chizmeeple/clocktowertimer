import {
  advance,
  completeWakeUp,
  expectTimer,
  finishAcceleratedDay,
  startFirstDay,
  tick,
  timerSeconds,
  visitFirstRun,
  visitGameplay,
  visitStaleGame,
} from '../support/gameplay.js';

const HELD_REFRESH =
  'Automatic refresh is paused while a game is in progress';

function rememberPage() {
  cy.window().then((win) => {
    win.beforeReload = true;
  });
}

function expectNoReload() {
  cy.window().should('have.prop', 'beforeReload', true);
}

function muteAndCloseFirstRun() {
  cy.get('button.increment[data-input="playerCount"]').click();
  cy.get('#playerCount').should('have.value', '11');
  cy.get('.tab-button[data-tab="effects"]').click();
  cy.get('#playSoundEffects').uncheck().trigger('change');
  cy.get('.tab-button[data-tab="music"]').click();
  cy.get('#playMusic').uncheck().trigger('change');
  cy.get('#closeSettings').click();
  cy.get('#settingsDialog').should('not.be.visible');
}

describe('Storyteller journeys', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('plays a day, wakes into the next day, and returns to a fresh game', () => {
    visitFirstRun();
    muteAndCloseFirstRun();

    cy.get('.day-display > span').first().should('have.text', '1');
    cy.get('.day-display').should('not.have.class', 'dusk');
    cy.get('.day-display').should('not.have.class', 'dawn');
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    cy.get('#startBtn').should('not.be.disabled');
    cy.get('#resetBtn').should('be.disabled');
    cy.get('#accelerateBtn').should('be.disabled');
    expectTimer(0);
    cy.get('#townsfolkAmount').should('have.text', '7');
    cy.get('#outsiderAmount').should('have.text', '1');
    cy.get('#minionAmount').should('have.text', '2');
    cy.get('#demonAmount').should('have.text', '1');

    startFirstDay();
    timerSeconds().then((dayLength) => {
      advance(3000);
      tick();
      expectTimer(dayLength - 3);

      cy.get('#startBtn').click();
      cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
      advance(10000);
      tick();
      expectTimer(dayLength - 3);

      cy.get('#startBtn').click();
      cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
      advance(2000);
      tick();
      expectTimer(dayLength - 5);
    });

    finishAcceleratedDay();
    cy.get('.day-display > span').first().should('have.text', '1');
    cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');

    completeWakeUp();
    cy.get('.day-display').should('not.have.class', 'dusk');
    cy.get('.day-display > span').first().should('have.text', '2');
    cy.get('#resetBtn').should('not.be.disabled');
    cy.get('#accelerateBtn').should('not.be.disabled');

    timerSeconds().then((secondDay) => {
      advance(2000);
      tick();
      expectTimer(secondDay - 2);
    });

    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    cy.get('#settingsDialog').should('not.be.visible');

    cy.get('.day-display > span').first().should('have.text', '1');
    cy.get('.day-display').should('not.have.class', 'dusk');
    cy.get('.day-display').should('not.have.class', 'dawn');
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    cy.get('#startBtn').should('not.be.disabled');
    cy.get('#accelerateBtn').should('be.disabled');
    cy.get('#accelerateBtn .button-text').should(
      'have.text',
      '⏩ Accelerate Time'
    );
    cy.get('.clocktower-btn.skipped-day').should('have.length', 0);
    cy.get('.clocktower-btn.active').should('have.length', 0);
    cy.get('#townsfolkAmount').should('have.text', '7');
    cy.get('#outsiderAmount').should('have.text', '1');
    cy.get('.day-display').should('not.have.class', 'dusk');

    timerSeconds().then((shown) => {
      advance(5000);
      tick();
      expectTimer(shown);
    });
  });

  it('keeps the remaining time when pace changes during a pause, then finishes the day', () => {
    visitGameplay();
    startFirstDay();

    timerSeconds().then((dayLength) => {
      advance(5000);
      tick();
      const pausedAt = dayLength - 5;
      expectTimer(pausedAt);

      cy.get('#clocktowerPresets .clocktower-btn')
        .first()
        .find('.time')
        .invoke('text')
        .then((normalPreset) => {
          cy.get('#startBtn').click();
          cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');

          cy.get('#settingsBtn').click();
          cy.get('#gamePace').select('speedy');
          cy.get('#closeSettings').click();

          cy.get('.pace-indicator').should('contain', 'Speedy');
          cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
          expectTimer(pausedAt);
          cy.get('#clocktowerPresets .clocktower-btn')
            .first()
            .find('.time')
            .should('not.have.text', normalPreset);

          cy.get('#startBtn').click();
          cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
          advance(1000);
          tick();
          expectTimer(pausedAt - 1);
        });
    });

    finishAcceleratedDay();
    cy.get('.day-display > span').first().should('have.text', '1');

    completeWakeUp();
    cy.get('.day-display > span').first().should('have.text', '2');
    cy.get('.pace-indicator').should('contain', 'Speedy');
    cy.get('.clocktower-btn.active .time')
      .invoke('text')
      .then((preset) => {
        cy.get('#minutes').invoke('text').then((minutes) => {
          cy.get('#seconds').invoke('text').then((seconds) => {
            expect(`${minutes}:${seconds}`).to.eq(preset);
          });
        });
      });
  });

  it('holds stale-tab refresh through pause and a phase change, then allows it after a new game', () => {
    visitStaleGame();
    rememberPage();
    cy.contains('#staleTabMessage', 'Refreshing in');

    startFirstDay();
    cy.contains('#staleTabMessage', HELD_REFRESH);
    timerSeconds().as('runningTime');

    cy.tick(15000);
    expectNoReload();
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    cy.get('@runningTime').then((runningTime) => {
      expectTimer(runningTime - 15);
    });

    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
    timerSeconds().as('pausedTime');
    cy.tick(15000);
    expectNoReload();
    cy.contains('#staleTabMessage', HELD_REFRESH);
    cy.get('@pausedTime').then((pausedTime) => {
      expectTimer(pausedTime);
    });

    cy.get('#startBtn').click();
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn').click();
    cy.tick(12000);
    cy.get('.day-display').should('have.class', 'dusk');
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    expectNoReload();
    cy.contains('#staleTabMessage', HELD_REFRESH);

    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    cy.get('.day-display').should('have.class', 'dawn');
    cy.tick(3000);
    expectNoReload();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    cy.get('#seconds').should('have.text', '03');
    cy.contains('#staleTabMessage', HELD_REFRESH);

    cy.tick(3000);
    cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');
    cy.get('.day-display > span').first().should('have.text', '2');
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    expectNoReload();
    cy.contains('#staleTabMessage', HELD_REFRESH);

    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    cy.get('.day-display > span').first().should('have.text', '1');
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    expectNoReload();
    cy.contains('#staleTabMessage', 'Refreshing in 10 seconds');

    cy.tick(10000);
    cy.window().should('not.have.prop', 'beforeReload');
  });
});
