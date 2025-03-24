describe('First Time User Flow', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    cy.clearLocalStorage();
  });

  it('shows settings dialog on first visit and saves settings', () => {
    // Visit the page
    cy.visit('/');

    // Check that the settings dialog is visible
    cy.get('#settingsDialog').should('be.visible');

    // Verify default values in settings dialog
    cy.get('#playerCount').should('have.value', '10');
    cy.get('#travellerCount').should('have.value', '0');
    cy.get('#gamePace').should('have.value', 'normal');

    // Click the Save and Close button
    cy.get('#closeSettings').click();

    // Verify the settings dialog is no longer visible
    cy.get('#settingsDialog').should('not.be.visible');

    // Verify default character counts
    cy.get('#townsfolkAmount').should('have.text', '7');
    cy.get('#minionAmount').should('have.text', '2');
    cy.get('#demonAmount').should('have.text', '1');
    cy.get('#outsiderAmount').should('have.text', '0');

    // Verify traveller information is not visible
    cy.get('#travellerDisplay').should('not.have.class', 'visible');

    // Verify day count is 1 and pace is Normal
    cy.get('.day-display span').should('have.text', '1');
    cy.get('.day-display .pace-indicator').should('contain', '🏃 Normal');

    // Verify button states
    cy.get('#startBtn')
      .should('have.text', '⏰ Wake Up!')
      .and('not.be.disabled');
    cy.get('#resetBtn').should('have.text', '🔄 Reset Day').and('be.disabled');
    cy.get('#accelerateBtn')
      .should('have.text', '⏩ Accelerate Time')
      .and('be.disabled');

    // Verify there are 8 preset buttons
    cy.get('#clocktowerPresets .clocktower-btn').should('have.length', 8);

    // Verify localStorage has been updated with settings
    cy.window().then((win) => {
      const settings = JSON.parse(
        win.localStorage.getItem('quickTimerSettings')
      );
      expect(settings).to.not.be.null;
      expect(settings).to.have.property('playerCount');
      expect(settings).to.have.property('travellerCount');
      expect(settings).to.have.property('playMusic');
      expect(settings).to.have.property('playSoundEffects');
    });
  });
});
