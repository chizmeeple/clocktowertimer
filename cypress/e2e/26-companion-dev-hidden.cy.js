import { visitGameplay } from '../support/gameplay.js';

describe('Companion dev panel', () => {
  it('stays off the public timer unless the local flag is set', () => {
    visitGameplay();
    cy.get('#companionDev').should('not.exist');
    cy.get('#startBtn').should('exist');
    cy.get('#resetBtn').should('exist');
    cy.window().then((win) => {
      const stored = JSON.stringify(win.localStorage);
      expect(stored).not.to.contain('writeToken');
    });
  });
});
