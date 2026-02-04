describe('Timer Behavior', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    cy.clearLocalStorage();
  });

  it('handles wake up, pause, and reset day correctly', () => {
    // Visit the page
    cy.visit('/');

    // Settings dialog should be open on fresh start
    cy.get('#settingsDialog').should('be.visible');

    // Turn OFF effects (trigger change so playSoundEffects is updated before save)
    cy.get('.tab-button[data-tab="effects"]').click();
    cy.get('#playSoundEffects').uncheck().trigger('change');

    // Save and Close settings
    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');

    // Verify initial state (button label is in .button-text)
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    cy.get('#startBtn').should('not.be.disabled');
    cy.get('#resetBtn').should('have.text', '🔄 Reset Day').and('be.disabled');

    // Click Day 1 preset
    cy.get('#clocktowerPresets .clocktower-btn').first().click();

    // Verify state after starting timer
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    cy.get('#startBtn').should('not.be.disabled');
    cy.get('#resetBtn')
      .should('have.text', '🔄 Reset Day')
      .and('not.be.disabled');

    // Verify timer is counting down
    cy.get('.timer-display').should('not.have.text', '00:00');

    // Click Reset Day
    cy.get('#resetBtn').click();

    // Verify state after reset
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    cy.get('#startBtn').should('not.be.disabled');
    cy.get('#resetBtn').should('have.text', '🔄 Reset Day').and('be.disabled');

    // Verify timer shows full day countdown
    cy.get('.timer-display').should('not.have.text', '00:00');
  });

  it('shows the correct timer value when Reset Day is used', () => {
    cy.visit('/');

    cy.get('#settingsDialog').should('be.visible');

    // Turn OFF effects (trigger change so playSoundEffects is updated before save)
    cy.get('.tab-button[data-tab="effects"]').click();
    cy.get('#playSoundEffects').uncheck().trigger('change');

    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');

    // Click Day 1 preset to start the timer and capture its full duration
    cy.get('#clocktowerPresets .clocktower-btn')
      .first()
      .then(($btn) => {
        const expectedMinutes = String(
          parseInt($btn.attr('data-minutes'), 10)
        ).padStart(2, '0');
        const expectedSeconds = String(
          parseInt($btn.attr('data-seconds'), 10)
        ).padStart(2, '0');

        cy.get('#clocktowerPresets .clocktower-btn').first().click();
        cy.wait(1000); // Let timer count down briefly
        cy.get('#resetBtn').click();

        // Timer should show the full day value (same as Day 1 preset)
        cy.get('#minutes').should('have.text', expectedMinutes);
        cy.get('#seconds').should('have.text', expectedSeconds);
      });
  });
});
