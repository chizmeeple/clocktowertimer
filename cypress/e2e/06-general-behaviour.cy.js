import { APP_VERSION } from '../../changelog.js';

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

  it('displays correct content in About dialog', () => {
    // Visit the page
    cy.visit('/');

    // Wait for the page to load
    cy.wait(100);

    // Close the settings dialog if it's open
    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');

    // Open About dialog
    cy.get('#infoBtn').click();

    // Verify dialog content
    cy.get('#infoDialog').within(() => {
      // Check version information
      cy.contains('h2', 'About Tower Timer').should('be.visible');
      cy.contains('Version').should('be.visible');
      cy.get('#currentVersion').should('have.text', APP_VERSION);

      // Check website link
      cy.contains('a', 'timer.arcane-scripts.net')
        .should('have.attr', 'href', 'https://timer.arcane-scripts.net')
        .and('have.attr', 'target', '_blank');

      // Check Ko-fi support section
      cy.get('a[href="https://ko-fi.com/chizmw"]')
        .find('img[alt="Support Me on Ko-fi"]')
        .should('be.visible');
      cy.get('a[href="https://ko-fi.com/chizmw"]')
        .should('have.attr', 'target', '_blank')
        .and('have.attr', 'rel', 'noopener noreferrer');

      // Check disclaimer
      cy.contains('This timer is an open source project').should('be.visible');
      cy.contains('The Pandemonium Institute').should('be.visible');
      cy.contains('Github').should('be.visible');

      // Check dialog footer
      cy.contains('View Change History').should('be.visible');
      cy.contains('button', 'Close').should('be.visible');
    });

    // Close dialog
    cy.get('#closeInfo').click();
    cy.get('#infoDialog').should('not.be.visible');
  });
});
