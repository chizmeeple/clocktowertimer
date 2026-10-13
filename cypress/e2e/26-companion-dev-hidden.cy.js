import { visitGameplay } from '../support/gameplay.js';

describe('Companion dev panel', () => {
  it('stays off the public timer unless the local flag is set', () => {
    let workerCalls = 0;
    cy.intercept('**/companion-api/**', (request) => {
      workerCalls += 1;
      request.reply({ statusCode: 500, body: {} });
    });
    cy.intercept('https://*.workers.dev/**', (request) => {
      workerCalls += 1;
      request.reply({ statusCode: 500, body: {} });
    });
    visitGameplay();
    cy.get('#companionDev').should('not.exist');
    cy.get('#startBtn').should('exist');
    cy.get('#resetBtn').should('exist');
    cy.window().then((win) => {
      const stored = JSON.stringify(win.localStorage);
      expect(stored).not.to.contain('writeToken');
    });
    cy.then(() => {
      expect(workerCalls).to.equal(0);
    });
  });

  it('keeps the player and diagnostic links closed until a session exists', () => {
    visitGameplay({ path: '/?companionDev=1' });
    cy.get('#companionDev').should('be.visible');
    for (const id of ['#companionDevOpen', '#companionDevDiagnostics']) {
      cy.get(id)
        .should('have.attr', 'target', '_blank')
        .and('have.attr', 'rel', 'noopener')
        .and('have.attr', 'aria-disabled', 'true')
        .and('not.have.attr', 'href');
    }
    cy.get('#companionDevOpen').should('have.text', 'Open companion');
    cy.get('#companionDevDiagnostics').should('have.text', 'Open diagnostics');
  });
});
