describe('Character Count Changes', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    cy.clearLocalStorage();
  });

  it('updates character counts when changing player count', () => {
    // Visit the page
    cy.visit('/');

    // Check that the settings dialog is visible
    cy.get('#settingsDialog').should('be.visible');

    // Click the decrement button for player count 5 times (from 10 to 5)
    for (let i = 0; i < 5; i++) {
      cy.get('button.decrement[data-input="playerCount"]').click();
    }

    // Verify initial state (5 players)
    cy.get('#playerCount').should('have.value', '5');
    cy.get('#townsfolkAmount').should('have.text', '3');
    cy.get('#outsiderAmount').should('have.text', '0');
    cy.get('#minionAmount').should('have.text', '1');
    cy.get('#demonAmount').should('have.text', '1');

    // Test each player count from 6 to 15
    const expectedCounts = {
      6: [3, 1, 1, 1],
      7: [5, 0, 1, 1],
      8: [5, 1, 1, 1],
      9: [5, 2, 1, 1],
      10: [7, 0, 2, 1],
      11: [7, 1, 2, 1],
      12: [7, 2, 2, 1],
      13: [9, 0, 3, 1],
      14: [9, 1, 3, 1],
      15: [9, 2, 3, 1],
    };

    // Test each player count
    Object.entries(expectedCounts).forEach(
      ([playerCount, [townsfolk, outsiders, minions, demon]]) => {
        // Click increment button
        cy.get('button.increment[data-input="playerCount"]').click();

        // Verify player count
        cy.get('#playerCount').should('have.value', playerCount);

        // Verify character counts
        cy.get('#townsfolkAmount').should('have.text', townsfolk);
        cy.get('#outsiderAmount').should('have.text', outsiders);
        cy.get('#minionAmount').should('have.text', minions);
        cy.get('#demonAmount').should('have.text', demon);
      }
    );
  });
});
