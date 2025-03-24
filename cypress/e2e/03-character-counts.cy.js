describe('Character Count Changes', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    cy.clearLocalStorage();
  });

  it('updates character counts when reducing player count', () => {
    // Visit the page
    cy.visit('/');

    // Check that the settings dialog is visible
    cy.get('#settingsDialog').should('be.visible');

    // Verify initial character counts
    cy.get('#townsfolkAmount').should('have.text', '7');
    cy.get('#outsiderAmount').should('have.text', '0');
    cy.get('#minionAmount').should('have.text', '2');
    cy.get('#demonAmount').should('have.text', '1');

    // Click the decrement button for player count 5 times (from 10 to 5)
    for (let i = 0; i < 5; i++) {
      cy.get('button.decrement[data-input="playerCount"]').click();
    }

    // Verify the player count input is now 5
    cy.get('#playerCount').should('have.value', '5');

    // Verify updated character counts
    cy.get('#townsfolkAmount').should('have.text', '3');
    cy.get('#outsiderAmount').should('have.text', '0');
    cy.get('#minionAmount').should('have.text', '1');
    cy.get('#demonAmount').should('have.text', '1');
  });
});
