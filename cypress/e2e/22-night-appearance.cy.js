import {
  advance,
  expectTimer,
  finishAcceleratedDay,
  startFirstDay,
  tick,
  visitGameplay,
} from '../support/gameplay.js';

const DAY_DIGITS = 'rgb(212, 175, 55)';
const NIGHT_DIGITS = 'rgb(154, 143, 106)';
const WAKE_UP_GREEN = 'rgb(69, 160, 73)';

function expectAppearance(night) {
  cy.get('body').should(night ? 'have.class' : 'not.have.class', 'game--night');
  cy.get('.timer-display .time').should(
    'have.css',
    'color',
    night ? NIGHT_DIGITS : DAY_DIGITS
  );
  if (!night) {
    cy.get('.timer-display .time').should('have.css', 'animation-name', 'none');
  }
}

function expectWakeUpAndCountsProminent() {
  cy.get('#startBtn').should('have.css', 'background-color', WAKE_UP_GREEN);
  cy.get('#startBtn').should('have.css', 'opacity', '1');
  cy.get('#startBtn').should('have.css', 'color', 'rgb(255, 255, 255)');
  cy.get('#townsfolkAmount').should('have.css', 'color', 'rgb(255, 255, 255)');
  cy.get('#townsfolkAmount').should('have.css', 'opacity', '1');
  cy.get('#demonAmount').should('have.css', 'color', 'rgb(255, 255, 255)');
  cy.get('#demonAmount').should('have.css', 'opacity', '1');
  cy.get('.day-display > span')
    .first()
    .should('have.css', 'opacity', '1');
  cy.get('#settingsBtn').should('have.css', 'opacity', '1');
}

describe('Night appearance', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.viewport(1280, 800);
  });

  it('stays neutral until a game starts, then uses night before Day 1', () => {
    visitGameplay();
    expectAppearance(false);
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    expectWakeUpAndCountsProminent();

    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    cy.get('#settingsDialog').should('not.be.visible');

    expectAppearance(true);
    cy.get('.timer-display .time').should('have.css', 'animation-name', 'none');
    expectTimer(0);
    cy.get('.day-display > span').first().should('have.text', '1');
    expectWakeUpAndCountsProminent();

    cy.get('#settingsBtn').click();
    cy.get('body').should('have.class', 'game--night');
    cy.get('#gamePace').select('speedy');
    cy.get('#closeSettings').click();
    cy.get('.pace-indicator').should('contain', 'Speedy');
    expectAppearance(true);

    cy.viewport(390, 844);
    expectAppearance(true);
    expectWakeUpAndCountsProminent();
    cy.viewport(1280, 800);
    expectAppearance(true);

    startFirstDay();
    expectAppearance(false);
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    expectWakeUpAndCountsProminent();
  });

  it('keeps the daytime appearance while paused, then switches at dusk', () => {
    visitGameplay();
    startFirstDay();
    expectAppearance(false);

    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
    expectAppearance(false);
    expectWakeUpAndCountsProminent();

    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    expectAppearance(false);

    finishAcceleratedDay();
    expectAppearance(true);
    expectTimer(0);
    expectWakeUpAndCountsProminent();

    cy.get('#settingsBtn').click();
    cy.get('#gamePace').select('relaxed');
    cy.get('#closeSettings').click();
    cy.get('.day-display').should('have.class', 'dusk');
    cy.get('.pace-indicator').should('contain', 'Relaxed');
    expectAppearance(true);
    expectWakeUpAndCountsProminent();
  });

  it('stays night through the wake-up countdown and returns to day afterwards', () => {
    visitGameplay();
    startFirstDay();
    finishAcceleratedDay();
    expectAppearance(true);

    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    cy.get('.day-display').should('have.class', 'dawn');
    expectAppearance(true);
    cy.get('#townsfolkAmount').should('have.css', 'opacity', '1');
    cy.get('#townsfolkAmount').should('have.css', 'color', 'rgb(255, 255, 255)');
    advance(2000);
    tick();
    expectTimer(4);
    expectAppearance(true);

    advance(4000);
    tick();
    cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');
    cy.get('.day-display > span').first().should('have.text', '2');
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    expectAppearance(false);
    expectWakeUpAndCountsProminent();
  });

  it('matches reset and a new game, and a skipped preset starts the day', () => {
    visitGameplay();
    startFirstDay();
    expectAppearance(false);

    cy.get('#resetBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    cy.get('#resetBtn').should('be.disabled');
    expectAppearance(false);
    expectWakeUpAndCountsProminent();

    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    expectAppearance(true);
    cy.get('.day-display').should('not.have.class', 'dusk');
    cy.get('.day-display').should('not.have.class', 'dawn');
    expectTimer(0);
    expectWakeUpAndCountsProminent();

    startFirstDay();
    finishAcceleratedDay();
    expectAppearance(true);

    cy.contains('#clocktowerPresets .clocktower-btn .day', 'Day 2')
      .closest('button')
      .click();
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    cy.get('.day-display').should('not.have.class', 'dusk');
    expectAppearance(false);
  });
});
