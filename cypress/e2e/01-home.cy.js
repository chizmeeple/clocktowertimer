import { APP_VERSION } from '../../js/changelog.js';

describe('Home Page', () => {
  it('loads successfully', () => {
    cy.visit('/');
    cy.get('body').should('exist');
    cy.get('script[type="importmap"]')
      .should('contain', `./js/helper.js?v=${APP_VERSION}`)
      .and('contain', `./js/timerEngine.js?v=${APP_VERSION}`)
      .and('contain', `./js/gameState.js?v=${APP_VERSION}`)
      .and('contain', `./js/changelog.js?v=${APP_VERSION}`)
      .and('contain', `./js/releaseCheck.js?v=${APP_VERSION}`);
    cy.get(`script[src="js/script.js?v=${APP_VERSION}"]`).should('exist');
    cy.get(`link[href="css/styles.css?v=${APP_VERSION}"]`).should('have.length', 2);
  });
});
