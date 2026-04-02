describe('Wake-up countdown', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('completes the wake-up countdown when time is advanced with cy.clock()', () => {
    cy.visit('/');

    cy.get('#settingsDialog').should('be.visible');

    cy.get('.tab-button[data-tab="effects"]').click();
    cy.get('#playSoundEffects').uncheck().trigger('change');

    cy.get('.tab-button[data-tab="music"]').click();
    cy.get('#playMusic').uncheck().trigger('change');

    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');

    cy.get('#clocktowerPresets .clocktower-btn').first().click();

    cy.get('#accelerateBtn', { timeout: 20000 }).should('not.be.disabled');
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn').click();

    cy.contains('#startBtn .button-text', '⏰ Wake Up!', {
      timeout: 20000,
    }).should('be.visible');

    cy.get('.day-display').should('have.class', 'dusk');

    cy.clock();

    cy.get('#startBtn').click();

    cy.get('.timer-display').should('have.class', 'wake-up-countdown');

    // Six one-second ticks: 6 → 0 → interval callback removes wake-up-countdown and starts the day
    cy.tick(6000);

    cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    cy.get('.day-display').should('not.have.class', 'dusk');
  });
});
