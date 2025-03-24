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

  it('updates traveller count and visibility', () => {
    // Visit the page
    cy.visit('/');

    // Check that the settings dialog is visible
    cy.get('#settingsDialog').should('be.visible');

    // Verify initial traveller state
    cy.get('#travellerCount').should('have.value', '0');
    cy.get('#travellerDisplay').should('not.have.class', 'visible');

    // Click increment button for traveller count
    cy.get('button.increment[data-input="travellerCount"]').click();

    // Verify traveller count is 1 and display is visible
    cy.get('#travellerCount').should('have.value', '1');
    cy.get('#travellerDisplay').should('have.class', 'visible');
    cy.get('#travellerAmount').should('have.text', '1');
  });

  it('enforces min/max constraints for player count', () => {
    // Visit the page
    cy.visit('/');

    // Check that the settings dialog is visible
    cy.get('#settingsDialog').should('be.visible');

    // Click decrement button 10 times to try to go below minimum
    for (let i = 0; i < 10; i++) {
      cy.get('button.decrement[data-input="playerCount"]').click();
    }

    // Verify player count is still at minimum (5)
    cy.get('#playerCount').should('have.value', '5');

    // Click increment button 10 times to try to go above maximum
    for (let i = 0; i < 20; i++) {
      cy.get('button.increment[data-input="playerCount"]').click();
    }

    // Verify player count is still at maximum (15)
    cy.get('#playerCount').should('have.value', '15');
  });

  it('enforces min/max constraints for traveller count', () => {
    cy.visit('/');
    cy.get('#settingsDialog').should('be.visible');

    // First increment to 1 to make the traveller count visible
    cy.get('button.increment[data-input="travellerCount"]').click();
    cy.get('#travellerCount').should('have.value', '1');
    cy.get('#travellerAmount').should('have.text', '1');
    cy.get('#travellerDisplay').should('have.class', 'visible');

    // Try to go below zero
    cy.get('button.decrement[data-input="travellerCount"]').click();
    cy.get('#travellerCount').should('have.value', '0');
    cy.get('#travellerDisplay').should('not.have.class', 'visible');

    // Try to go below zero again
    cy.get('button.decrement[data-input="travellerCount"]').click();
    cy.get('#travellerCount').should('have.value', '0');
    cy.get('#travellerDisplay').should('not.have.class', 'visible');

    // Increment to 5
    for (let i = 0; i < 5; i++) {
      cy.get('button.increment[data-input="travellerCount"]').click();
      cy.get('#travellerCount').should('have.value', (i + 1).toString());
      cy.get('#travellerAmount').should('have.text', (i + 1).toString());
      cy.get('#travellerDisplay').should('have.class', 'visible');
    }

    // Try to go above 5
    cy.get('button.increment[data-input="travellerCount"]').click();
    cy.get('#travellerCount').should('have.value', '5');
    cy.get('#travellerAmount').should('have.text', '5');
    cy.get('#travellerDisplay').should('have.class', 'visible');
  });
});
