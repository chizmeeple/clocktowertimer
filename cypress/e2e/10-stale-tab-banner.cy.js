const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function visitWithLastActiveAt(lastActiveAt) {
  cy.visit('/', {
    onBeforeLoad(win) {
      win.localStorage.setItem('lastActiveAt', String(lastActiveAt));
    },
  });
  cy.get('#closeSettings').click();
}

function visitWithPageAge(pageAgeMs) {
  cy.visit('/', {
    onBeforeLoad(win) {
      const timeOrigin = win.Date.now() - pageAgeMs;
      Object.defineProperty(win.performance, 'timeOrigin', {
        configurable: true,
        get: () => timeOrigin,
      });
    },
  });
  cy.get('#closeSettings').click();
}

function dispatchVisibility(state) {
  cy.document().then((doc) => {
    Object.defineProperty(doc, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
    doc.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('Stale tab banner', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('shows when the tab was inactive for more than two days', () => {
    visitWithLastActiveAt(Date.now() - THREE_DAYS_MS);

    cy.get('#staleTabBanner').should('be.visible');
    cy.contains('#staleTabBanner', 'Refresh to load the latest version');
  });

  it('shows when the page has been open for more than two days', () => {
    visitWithPageAge(THREE_DAYS_MS);

    cy.get('#staleTabBanner').should('be.visible');
  });

  it('does not show for a recently active tab', () => {
    cy.visit('/');
    cy.get('#closeSettings').click();

    cy.get('#staleTabBanner').should('not.be.visible');
  });

  it('can be dismissed', () => {
    visitWithLastActiveAt(Date.now() - THREE_DAYS_MS);

    cy.get('#staleTabDismissBtn').click();
    cy.get('#staleTabBanner').should('not.be.visible');
  });

  it('offers a Refresh action when the banner is shown', () => {
    visitWithLastActiveAt(Date.now() - THREE_DAYS_MS);

    cy.get('#staleTabRefreshBtn')
      .should('be.visible')
      .and('contain', 'Refresh');
  });

  it('shows again when returning to the tab after two days away', () => {
    cy.visit('/');
    cy.get('#settingsDialog').then(($dialog) => {
      if ($dialog[0].open) {
        cy.get('#closeSettings').click();
      }
    });
    cy.get('#staleTabBanner').should('not.be.visible');

    cy.clock(new Date('2026-05-22T12:00:00'));
    dispatchVisibility('hidden');
    cy.tick(TWO_DAYS_MS + 1);
    dispatchVisibility('visible');

    cy.get('#staleTabBanner').should('be.visible');
  });
});
