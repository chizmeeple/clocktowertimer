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

    // Click the Save and Close button
    cy.get('#closeSettings').click();

    // Verify the settings dialog is no longer visible
    cy.get('#settingsDialog').should('not.be.visible');

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
