import { APP_VERSION } from '../../changelog.js';

describe('Home Page', () => {
  it('loads successfully', () => {
    cy.visit('/');
    cy.get('body').should('exist');
    cy.get('script[type="importmap"]')
      .should('contain', `./helper.js?v=${APP_VERSION}`)
      .and('contain', `./timerEngine.js?v=${APP_VERSION}`)
      .and('contain', `./gameState.js?v=${APP_VERSION}`)
      .and('contain', `./changelog.js?v=${APP_VERSION}`)
      .and('contain', `./releaseCheck.js?v=${APP_VERSION}`);
    cy.get(`script[src="script.js?v=${APP_VERSION}"]`).should('exist');
    cy.get(`link[href="styles.css?v=${APP_VERSION}"]`).should('have.length', 2);
  });
});
