describe('Keyboard Shortcuts', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    cy.clearLocalStorage();
  });

  it('shows shortcuts tab and displays default shortcuts', () => {
    cy.visit('/');

    // Open settings dialog
    cy.get('#settingsDialog').should('be.visible');

    // Navigate to Shortcuts tab
    cy.get('button[data-tab="shortcuts"]').click();

    // Verify shortcuts panel is visible
    cy.get('.settings-panel[data-panel="shortcuts"]').should('be.visible');
    cy.contains('h3', 'Keyboard Shortcuts').should('be.visible');

    // Verify all shortcut inputs are present
    cy.get('#shortcutSettings').should('exist');
    cy.get('#shortcutWakeUp').should('exist');
    cy.get('#shortcutReset').should('exist');
    cy.get('#shortcutFullscreen').should('exist');
    cy.get('#shortcutInfo').should('exist');

    // Verify default values are displayed (Space is converted to 'Space' for display)
    cy.get('#shortcutSettings').should('have.value', 'q');
    cy.get('#shortcutWakeUp').should('have.value', 'Space');
    cy.get('#shortcutReset').should('have.value', 'r');
    cy.get('#shortcutFullscreen').should('have.value', 'f');
    cy.get('#shortcutInfo').should('have.value', 'i');

    // Verify action buttons are present
    cy.get('#resetShortcuts').should('be.visible');
    cy.get('#clearShortcuts').should('be.visible');
  });

  it('allows recording new shortcuts', () => {
    cy.visit('/');

    // Open settings and navigate to shortcuts tab
    cy.get('#settingsDialog').should('be.visible');
    cy.get('button[data-tab="shortcuts"]').click();

    // Click on the Wake Up shortcut input to start recording
    cy.get('#shortcutWakeUp').click();

    // Verify recording state
    cy.get('#shortcutWakeUp').should('have.class', 'recording');
    cy.get('#shortcutWakeUp').should('have.value', 'Press a key...');

    // Verify other inputs are disabled during recording
    cy.get('#shortcutSettings').should('be.disabled');
    cy.get('#shortcutReset').should('be.disabled');
    cy.get('#shortcutFullscreen').should('be.disabled');
    cy.get('#shortcutInfo').should('be.disabled');

    // Simulate pressing a key using the body element (since inputs are readonly during recording)
    cy.get('body').type('w');

    // Verify the shortcut was recorded
    cy.get('#shortcutWakeUp').should('have.value', 'w');
    cy.get('#shortcutWakeUp').should('not.have.class', 'recording');

    // Verify other inputs are re-enabled
    cy.get('#shortcutSettings').should('not.be.disabled');
    cy.get('#shortcutReset').should('not.be.disabled');
    cy.get('#shortcutFullscreen').should('not.be.disabled');
    cy.get('#shortcutInfo').should('not.be.disabled');
  });

  it('handles escape key to cancel recording', () => {
    cy.visit('/');

    // Open settings and navigate to shortcuts tab
    cy.get('#settingsDialog').should('be.visible');
    cy.get('button[data-tab="shortcuts"]').click();

    // Click on a shortcut input to start recording
    cy.get('#shortcutReset').click();

    // Verify recording state
    cy.get('#shortcutReset').should('have.class', 'recording');
    cy.get('#shortcutReset').should('have.value', 'Press a key...');

    // Press escape to cancel using body element
    cy.get('body').type('{esc}');

    // Verify recording was cancelled and original value restored
    cy.get('#shortcutReset').should('not.have.class', 'recording');
    cy.get('#shortcutReset').should('have.value', 'r');

    // Verify other inputs are re-enabled
    cy.get('#shortcutSettings').should('not.be.disabled');
  });

  it('detects and shows conflict warnings', () => {
    cy.visit('/');

    // Open settings and navigate to shortcuts tab
    cy.get('#settingsDialog').should('be.visible');
    cy.get('button[data-tab="shortcuts"]').click();

    // Set a shortcut that will conflict
    cy.get('#shortcutWakeUp').click();
    cy.get('body').type('q'); // This should conflict with settings shortcut

    // Verify conflict warning is shown
    cy.get('#shortcutWakeUp').should('have.class', 'shortcut-conflict');
    cy.get('#shortcutWakeUp').should('have.value', 'Conflict with settings');

    // Wait for conflict warning to clear
    cy.wait(2000);
    cy.get('#shortcutWakeUp').should('not.have.class', 'shortcut-conflict');
    cy.get('#shortcutWakeUp').should('have.value', 'Press a key...');
  });

  it('saves and loads custom shortcuts', () => {
    cy.visit('/');

    // Open settings and navigate to shortcuts tab
    cy.get('#settingsDialog').should('be.visible');
    cy.get('button[data-tab="shortcuts"]').click();

    // Set a custom shortcut
    cy.get('#shortcutWakeUp').click();
    cy.get('body').type('w');
    cy.get('#shortcutWakeUp').should('have.value', 'w');

    // Close settings
    cy.get('#closeSettings').click();

    // Reopen settings and navigate to shortcuts tab
    cy.get('#settingsBtn').click();
    cy.get('button[data-tab="shortcuts"]').click();

    // Verify the custom shortcut was saved
    cy.get('#shortcutWakeUp').should('have.value', 'w');
  });

  it('resets shortcuts to defaults', () => {
    cy.visit('/');

    // Open settings and navigate to shortcuts tab
    cy.get('#settingsDialog').should('be.visible');
    cy.get('button[data-tab="shortcuts"]').click();

    // Set a custom shortcut first
    cy.get('#shortcutWakeUp').click();
    cy.get('body').type('w');
    cy.get('#shortcutWakeUp').should('have.value', 'w');

    // Click reset to defaults button
    cy.get('#resetShortcuts').click();

    // Confirm the reset dialog
    cy.on('window:confirm', () => true);

    // Verify shortcuts are reset to defaults
    cy.get('#shortcutSettings').should('have.value', 'q');
    cy.get('#shortcutWakeUp').should('have.value', 'Space');
    cy.get('#shortcutReset').should('have.value', 'r');
    cy.get('#shortcutFullscreen').should('have.value', 'f');
    cy.get('#shortcutInfo').should('have.value', 'i');
  });

  it('clears all shortcuts', () => {
    cy.visit('/');

    // Open settings and navigate to shortcuts tab
    cy.get('#settingsDialog').should('be.visible');
    cy.get('button[data-tab="shortcuts"]').click();

    // Click clear all button
    cy.get('#clearShortcuts').click();

    // Confirm the clear dialog
    cy.on('window:confirm', () => true);

    // Verify all shortcuts are cleared
    cy.get('#shortcutSettings').should('have.value', '');
    cy.get('#shortcutWakeUp').should('have.value', '');
    cy.get('#shortcutReset').should('have.value', '');
    cy.get('#shortcutFullscreen').should('have.value', '');
    cy.get('#shortcutInfo').should('have.value', '');
  });

  it('works with custom shortcuts after configuration', () => {
    cy.visit('/');

    // Open settings and navigate to shortcuts tab
    cy.get('#settingsDialog').should('be.visible');
    cy.get('button[data-tab="shortcuts"]').click();

    // Set a custom shortcut for settings (change from 'q' to 's')
    cy.get('#shortcutSettings').click();
    cy.get('body').type('s');
    cy.get('#shortcutSettings').should('have.value', 's');

    // Close settings
    cy.get('#closeSettings').click();

    // Test the custom shortcut works
    cy.get('body').type('s');
    cy.get('#settingsDialog').should('be.visible');

    // Test that the old shortcut no longer works
    cy.get('#closeSettings').click();
    cy.get('body').type('q');
    cy.get('#settingsDialog').should('not.be.visible');
  });

  it('prevents multiple simultaneous recordings', () => {
    cy.visit('/');

    // Open settings and navigate to shortcuts tab
    cy.get('#settingsDialog').should('be.visible');
    cy.get('button[data-tab="shortcuts"]').click();

    // Start recording on one input
    cy.get('#shortcutWakeUp').click();
    cy.get('#shortcutWakeUp').should('have.class', 'recording');

    // Try to start recording on another input (should be disabled, so use force)
    cy.get('#shortcutReset').click({ force: true });

    // Verify the first recording was cancelled and the second one started
    cy.get('#shortcutWakeUp').should('not.have.class', 'recording');
    cy.get('#shortcutReset').should('have.class', 'recording');

    // Cancel the recording using body element since input is disabled
    cy.get('body').type('{esc}');
  });

  it('has proper two-column layout', () => {
    cy.visit('/');

    // Open settings and navigate to shortcuts tab
    cy.get('#settingsDialog').should('be.visible');
    cy.get('button[data-tab="shortcuts"]').click();

    // Verify the shortcuts container has grid layout
    cy.get('.shortcuts-container').should('have.css', 'display', 'grid');
    cy.get('.shortcuts-container').should('have.css', 'grid-template-columns');

    // Verify all shortcut items are present
    cy.get('.shortcut-item').should('have.length', 5);

    // Verify the 5th item spans both columns
    cy.get('.shortcut-item:nth-child(5)').should(
      'have.css',
      'grid-column',
      '1 / -1'
    );
  });

  it('handles special keys like PlayPause', () => {
    cy.visit('/');

    // Open settings and navigate to shortcuts tab
    cy.get('#settingsDialog').should('be.visible');
    cy.get('button[data-tab="shortcuts"]').click();

    // Test that special keys are accepted (simulate with a custom key)
    cy.get('#shortcutWakeUp').click();
    cy.get('body').type('{enter}'); // Use Enter key as a special key

    // Verify the special key was recorded
    cy.get('#shortcutWakeUp').should('have.value', 'Enter');
    cy.get('#shortcutWakeUp').should('not.have.class', 'recording');
  });

  it('migrates old lowercase shortcut data', () => {
    // Set up localStorage with old lowercase data
    cy.window().then((win) => {
      const oldSettings = {
        playerCount: 10,
        travellerCount: 0,
        keyboardShortcuts: {
          settings: 'q',
          wakeup: 'w', // lowercase - old format
          reset: 'r',
          fullscreen: 'f',
          info: 'i',
        },
      };
      win.localStorage.setItem(
        'quickTimerSettings',
        JSON.stringify(oldSettings)
      );
    });

    cy.visit('/');

    // Open settings dialog first
    cy.get('#settingsBtn').click();
    cy.get('#settingsDialog').should('be.visible');
    cy.get('button[data-tab="shortcuts"]').click();

    // Verify the migration worked (wakeup should be migrated to wakeUp)
    cy.get('#shortcutWakeUp').should('have.value', 'w');

    // Verify the old lowercase key was removed and camelCase key exists
    cy.window().then((win) => {
      const settings = JSON.parse(
        win.localStorage.getItem('quickTimerSettings')
      );
      expect(settings.keyboardShortcuts).to.have.property('wakeUp', 'w');
      expect(settings.keyboardShortcuts).to.not.have.property('wakeup');
    });
  });
});
