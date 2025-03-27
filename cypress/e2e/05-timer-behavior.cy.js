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

    // Save and Close settings
    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');

    // Verify initial state
    cy.get('#startBtn')
      .should('have.text', '⏰ Wake Up!')
      .and('not.be.disabled');
    cy.get('#resetBtn').should('have.text', '🔄 Reset Day').and('be.disabled');

    // Click Day 1 preset
    cy.get('#clocktowerPresets .clocktower-btn').first().click();

    // Verify state after starting timer
    cy.get('#startBtn')
      .should('have.text', '⏸️ Pause Day')
      .and('not.be.disabled');
    cy.get('#resetBtn')
      .should('have.text', '🔄 Reset Day')
      .and('not.be.disabled');

    // Verify timer is counting down
    cy.get('.timer-display').should('not.have.text', '00:00');

    // Click Reset Day
    cy.get('#resetBtn').click();

    // Verify state after reset
    cy.get('#startBtn')
      .should('have.text', '⏰ Wake Up!')
      .and('not.be.disabled');
    cy.get('#resetBtn').should('have.text', '🔄 Reset Day').and('be.disabled');

    // Verify timer shows full day countdown
    cy.get('.timer-display').should('not.have.text', '00:00');
  });
});
