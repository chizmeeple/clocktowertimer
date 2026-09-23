describe('Offline timer behaviour', () => {
  const throwOnMediaSeek = (win) => {
    Object.defineProperty(win.HTMLMediaElement.prototype, 'currentTime', {
      configurable: true,
      get() {
        return 0;
      },
      set() {
        throw new DOMException(
          'The media resource is not available',
          'InvalidStateError'
        );
      },
    });
  };

  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('starts, pauses, and resets a day when sound playback throws', () => {
    cy.visit('/', {
      onBeforeLoad: throwOnMediaSeek,
    });

    cy.get('#settingsDialog').should('be.visible');
    cy.get('#closeSettings').click();

    cy.get('#clocktowerPresets .clocktower-btn').first().click();
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    cy.get('#startBtn').should('not.be.disabled');
    cy.get('#minutes').invoke('text').should('not.eq', '00');

    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');

    cy.get('#resetBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    cy.get('#resetBtn').should('be.disabled');
  });

  it('starts the wake-up countdown when sound playback throws', () => {
    cy.visit('/', {
      onBeforeLoad: throwOnMediaSeek,
    });

    cy.get('#settingsDialog').should('be.visible');
    cy.get('#closeSettings').click();

    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    cy.get('#startBtn').should('be.disabled');
    cy.get('#seconds').should('not.have.text', '00');
  });

  it('starts a new game and a day when the browser is offline', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        throwOnMediaSeek(win);
        Object.defineProperty(win.navigator, 'onLine', {
          configurable: true,
          get: () => false,
        });
      },
    });

    cy.get('#settingsDialog').should('be.visible');
    cy.get('#closeSettings').click();

    cy.window().then((win) => {
      win.dispatchEvent(new Event('offline'));
    });

    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('.day-display > span').first().should('have.text', '1');

    cy.get('#clocktowerPresets .clocktower-btn').first().click();
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
  });
});
