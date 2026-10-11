import { expectInViewport, visitGameplay } from '../support/gameplay.js';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

function dismissPortraitWarningIfShown() {
  cy.get('body').then(($body) => {
    const dialog = $body.find('#portraitWarningDialog')[0];
    if (dialog?.open) {
      cy.get('#acceptPortraitWarning').click();
    }
  });
}

function installOrientationControl(win) {
  let portrait = false;
  const queries = [];
  const nativeMatchMedia = win.matchMedia.bind(win);

  cy.stub(win, 'matchMedia').callsFake((query) => {
    if (query !== '(orientation: portrait)') {
      return nativeMatchMedia(query);
    }

    const listeners = new Set();
    const list = {
      media: query,
      get matches() {
        return portrait;
      },
      addEventListener(type, listener) {
        if (type === 'change') listeners.add(listener);
      },
      removeEventListener(type, listener) {
        listeners.delete(listener);
      },
    };
    list.listeners = listeners;
    queries.push(list);
    return list;
  });

  win.__setPortrait = (next) => {
    portrait = next;
    for (const list of queries) {
      for (const listener of list.listeners) {
        listener({ matches: next, media: '(orientation: portrait)' });
      }
    }
  };
}

describe('Responsive controls', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  afterEach(() => {
    cy.viewport(1000, 660);
  });

  VIEWPORTS.forEach(({ name, width, height }) => {
    it(`keeps the storyteller controls usable on a ${name} screen`, () => {
      cy.viewport(width, height);
      visitGameplay({ harness: false });

      dismissPortraitWarningIfShown();

      expectInViewport('#startBtn');
      expectInViewport('#minutes');
      expectInViewport('.day-display');
      expectInViewport('#settingsBtn');
      expectInViewport('#resetBtn');
      expectInViewport('#clocktowerPresets .clocktower-btn');
      if (width >= 768) {
        expectInViewport('#accelerateBtn');
      }

      cy.get('#settingsBtn').click();
      cy.get('#settingsDialog').should('be.visible');
      expectInViewport('#playerCount');
      cy.get('button.increment[data-input="playerCount"]').click();
      cy.get('#playerCount').should('have.value', '11');
      cy.get('#outsiderAmount').should('have.text', '1');
      cy.get('#closeSettings').scrollIntoView().click();

      cy.get('#settingsDialog').should('not.be.visible');
      cy.get('#outsiderAmount').should('have.text', '1');
      cy.get('#startBtn').should('not.be.disabled');
      cy.get('.day-display > span').first().should('have.text', '1');
    });
  });

  // Portrait is narrower than the bottom bar, and the app warns that it may
  // not fit. Landscape is the orientation the timer is designed for.
  it('keeps Accelerate fully on a landscape phone screen', () => {
    cy.viewport(844, 390);
    visitGameplay({ harness: false });
    dismissPortraitWarningIfShown();
    expectInViewport('#accelerateBtn');
  });

  // The portrait check runs before saved settings are applied, so a returning
  // player still sees the warning.
  it('stays quiet in portrait when the warning was already accepted', () => {
    cy.viewport(390, 844);
    visitGameplay({
      harness: false,
      settings: { acceptedPortraitWarning: true },
    });
    cy.get('#portraitWarningDialog').should('not.be.visible');
  });

  it('warns in portrait until the warning is accepted, including after rotating back', () => {
    cy.viewport(390, 844);
    visitGameplay({
      harness: false,
      settings: { acceptedPortraitWarning: false },
      onBeforeLoad: installOrientationControl,
    });

    cy.get('#portraitWarningDialog').should('not.be.visible');
    cy.window().then((win) => {
      win.__setPortrait(true);
    });
    cy.get('#portraitWarningDialog').should('be.visible');
    cy.get('#acceptPortraitWarning').should('be.visible');

    cy.window().then((win) => {
      win.__setPortrait(false);
    });
    cy.get('#portraitWarningDialog').should('not.be.visible');

    cy.window().then((win) => {
      win.__setPortrait(true);
    });
    cy.get('#portraitWarningDialog').should('be.visible');
    cy.get('#acceptPortraitWarning').click();
    cy.get('#portraitWarningDialog').should('not.be.visible');

    cy.window().then((win) => {
      win.__setPortrait(false);
      win.__setPortrait(true);
    });
    cy.get('#portraitWarningDialog').should('not.be.visible');
    cy.get('#startBtn').should('be.visible');
  });
});
