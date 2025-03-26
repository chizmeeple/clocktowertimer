describe('General Behaviour', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    cy.clearLocalStorage();
  });

  it('handles keyboard shortcuts and button clicks correctly', () => {
    // Visit the page
    cy.visit('/');

    // Test keyboard shortcuts
    // 'q' opens settings
    cy.get('body').type('q');
    cy.get('#settingsDialog').should('be.visible');
    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');

    // 'i' opens About
    cy.get('body').type('i');
    cy.get('#infoDialog').should('be.visible');
    cy.get('#closeInfo').click();
    cy.get('#infoDialog').should('not.be.visible');

    // Test button clicks
    // Settings button opens settings
    cy.get('#settingsBtn').click();
    cy.get('#settingsDialog').should('be.visible');
    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');

    // Info button opens About
    cy.get('#infoBtn').click();
    cy.get('#infoDialog').should('be.visible');
    cy.get('#closeInfo').click();
    cy.get('#infoDialog').should('not.be.visible');
  });
});
