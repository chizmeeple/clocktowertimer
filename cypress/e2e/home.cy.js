describe('Home Page', () => {
  it('loads successfully', () => {
    cy.visit('/');
    cy.get('body').should('exist');
    cy.get('script[src="script.js"]').should('exist');
    cy.get('link[href="styles.css"]').should('exist');
  });
});
