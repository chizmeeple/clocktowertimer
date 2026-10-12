import {
  expectInViewport,
  visitGameplay,
  visitStaleGame,
} from '../support/gameplay.js';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

const LAYOUT_VIEWPORTS = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet landscape', width: 1280, height: 800 },
  { name: 'tablet portrait', width: 800, height: 1280 },
  { name: 'mobile landscape', width: 844, height: 390 },
  { name: 'mobile portrait', width: 390, height: 844 },
  { name: 'narrow mobile', width: 320, height: 568 },
];

function expectNoHorizontalOverflow() {
  cy.document().should((doc) => {
    expect(
      doc.documentElement.scrollWidth,
      'page width'
    ).to.be.at.most(doc.documentElement.clientWidth + 1);
  });
}

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

  it('keeps the timer within the page at every supported size', () => {
    visitGameplay({ harness: false });

    LAYOUT_VIEWPORTS.forEach(({ name, width, height }) => {
      cy.viewport(width, height);
      dismissPortraitWarningIfShown();
      expectNoHorizontalOverflow();
      expectInViewport('#startBtn');
      expectInViewport('.day-display');
      expectInViewport('#settingsBtn');
      if (width >= 768) {
        expectInViewport('#accelerateBtn');
        expectInViewport('#resetBtn');
        expectInViewport('#fullscreenBtn');
      }
      cy.log(name);
    });
  });

  it('keeps settings and about usable on a narrow phone', () => {
    cy.viewport(320, 568);
    visitGameplay({ harness: false });
    dismissPortraitWarningIfShown();

    cy.get('#settingsBtn').click();
    cy.get('#settingsDialog').should('be.visible');
    cy.get('#settingsDialog').should(($dialog) => {
      const rect = $dialog[0].getBoundingClientRect();
      const view = $dialog[0].ownerDocument.defaultView;
      expect(rect.left).to.be.at.least(-1);
      expect(rect.right).to.be.at.most(view.innerWidth + 1);
    });
    cy.get('#playerCount').should('be.visible');
    cy.get('#closeSettings').scrollIntoView();
    expectInViewport('#closeSettings');
    expectNoHorizontalOverflow();
    cy.get('#closeSettings').click();

    cy.get('#infoBtn').click();
    cy.get('#infoDialog').should('be.visible');
    cy.get('#closeInfo').scrollIntoView();
    expectInViewport('#closeInfo');
    expectNoHorizontalOverflow();
  });

  it('keeps the changelog dialogs reachable on a short landscape phone', () => {
    cy.viewport(844, 390);
    visitGameplay({ harness: false });

    cy.window().then((win) => {
      win.document.getElementById('whatsNewDialog').showModal();
    });
    cy.get('#whatsNewDialog').should('be.visible');
    cy.get('#closeWhatsNew').scrollIntoView();
    expectInViewport('#closeWhatsNew');
    expectNoHorizontalOverflow();
    cy.get('#closeWhatsNew').click();

    cy.window().then((win) => {
      win.document.getElementById('changeHistoryDialog').showModal();
    });
    cy.get('#changeHistoryDialog').should('be.visible');
    cy.get('#closeChangeHistory').scrollIntoView();
    expectInViewport('#closeChangeHistory');
    expectNoHorizontalOverflow();
  });

  it('stacks keyboard shortcuts on a narrow screen and pairs them when there is room', () => {
    cy.viewport(320, 568);
    visitGameplay({ harness: false });
    dismissPortraitWarningIfShown();
    cy.get('#settingsBtn').click();
    cy.get('.tab-button[data-tab="shortcuts"]').click();
    cy.get('.settings-panel[data-panel="shortcuts"]').should('be.visible');
    cy.get('.shortcut-item').should(($items) => {
      const first = $items[0].getBoundingClientRect();
      const second = $items[1].getBoundingClientRect();
      expect(second.top).to.be.greaterThan(first.top + first.height / 2);
    });

    cy.viewport(844, 390);
    cy.get('.shortcut-item').should(($items) => {
      const first = $items[0].getBoundingClientRect();
      const second = $items[1].getBoundingClientRect();
      expect(second.top).to.be.closeTo(first.top, 4);
    });
  });

  it('shows the stale-tab banner without widening a narrow page', () => {
    cy.viewport(320, 568);
    visitStaleGame();
    dismissPortraitWarningIfShown();
    cy.get('#staleTabBanner').should('be.visible');
    expectInViewport('#staleTabRefreshBtn');
    expectInViewport('#staleTabDismissBtn');
    expectNoHorizontalOverflow();
  });
});
