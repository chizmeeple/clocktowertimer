describe('Video Player', () => {
  it('shows correct initial state and enables music settings when Play Music is checked', () => {
    cy.visit('/');
    cy.get('#settingsDialog').should('be.visible');

    // Check initial state - custom player should not be visible
    cy.get('#customPlayer').should('not.exist');

    // Navigate to Music tab
    cy.get('button[data-tab="music"]').click();

    // Check initial state of music settings
    cy.get('#playMusic').should('not.be.checked');
    cy.get('#musicVolume').should('be.disabled');
    cy.get('#playMusicAtNight').should('not.be.checked');
    cy.get('#youtubePlaylist')
      .closest('label')
      .should('have.class', 'inactive');

    // Enable Play Music
    cy.get('#playMusic').check({ force: true });

    // Verify other music settings are now enabled
    cy.get('#musicVolume').should('not.be.disabled');
    cy.get('#playMusicAtNight').should('not.be.disabled');
    cy.get('#youtubePlaylist')
      .closest('label')
      .should('not.have.class', 'inactive');
  });
});
