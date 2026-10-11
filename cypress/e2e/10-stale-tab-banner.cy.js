const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function visitWithLastActiveAt(lastActiveAt) {
  cy.visit('/', {
    onBeforeLoad(win) {
      win.localStorage.setItem('towerTimerLastActiveAt', String(lastActiveAt));
    },
  });
  cy.get('#closeSettings').click();
}

const CLOCK_METHODS = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'Date',
  'performance',
];

function visitStaleTab({
  clocked = false,
  mute = false,
  withPerformance = false,
} = {}) {
  const now = Date.now();
  if (clocked) {
    if (withPerformance) {
      cy.clock(now, CLOCK_METHODS);
    } else {
      cy.clock(now);
    }
  }
  cy.visit('/', {
    onBeforeLoad(win) {
      win.localStorage.setItem(
        'towerTimerLastActiveAt',
        String(now - THREE_DAYS_MS)
      );
    },
  });
  if (clocked) {
    // The settings dialog opens on a timer scheduled after an await, so let
    // that timer be registered on the fake clock before advancing it.
    cy.wait(50);
    cy.tick(200);
  }
  if (mute) {
    cy.get('.tab-button[data-tab="effects"]').click();
    cy.get('#playSoundEffects').uncheck().trigger('change');
    cy.get('.tab-button[data-tab="music"]').click();
    cy.get('#playMusic').uncheck().trigger('change');
  }
  cy.get('#closeSettings').click();
}

function rememberPage(win) {
  win.beforeReload = true;
}

function startDay() {
  cy.get('#clocktowerPresets .clocktower-btn').first().click();
  cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
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
    cy.contains(
      '#staleTabBanner',
      /Refreshing in \d+ seconds? to load the latest version/
    );
    cy.get('#staleTabProgress').should('be.visible');
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
      .and('contain', 'Refresh now');
  });

  it('counts down, then reloads automatically', () => {
    visitStaleTab({ clocked: true });

    // cy.clock() replaces performance.timeOrigin with the fake clock epoch,
    // which Cypress restores unchanged across a reload. A property on the
    // window object only survives if this is still the same document.
    cy.window().then((win) => {
      win.beforeReload = true;
    });
    cy.contains('#staleTabMessage', 'Refreshing in 10 seconds');
    cy.tick(1000);
    cy.contains('#staleTabMessage', 'Refreshing in 9 seconds');
    cy.tick(8000);
    cy.contains('#staleTabMessage', 'Refreshing in 1 second');
    cy.tick(1000);
    cy.window().should('not.have.prop', 'beforeReload');
    cy.get('#staleTabBanner').should('not.be.visible');
  });

  it('reloads immediately when Refresh now is clicked', () => {
    visitStaleTab();

    cy.window().then((win) => {
      const origin = win.performance.timeOrigin;
      cy.get('#staleTabRefreshBtn').click();
      cy.window().its('performance.timeOrigin').should('not.eq', origin);
    });
    cy.get('#staleTabBanner').should('not.be.visible');
  });

  it('does not reload automatically after it is dismissed', () => {
    visitStaleTab({ clocked: true });

    cy.window().then((win) => {
      win.beforeReload = true;
    });
    cy.get('#staleTabDismissBtn').click();
    cy.get('#staleTabBanner').should('not.be.visible');
    cy.tick(15000);
    cy.window().should('have.prop', 'beforeReload', true);
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

describe('Stale tab refresh safety', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  function expectNoReload() {
    cy.window().should('have.prop', 'beforeReload', true);
  }

  it('refreshes a stale idle tab automatically', () => {
    visitStaleTab({ clocked: true });
    cy.window().then(rememberPage);
    cy.contains('#staleTabMessage', 'Refreshing in 10 seconds');
    cy.tick(10000);
    cy.window().should('not.have.prop', 'beforeReload');
  });

  it('does not refresh while a countdown is running', () => {
    visitStaleTab({ clocked: true, mute: true, withPerformance: true });
    cy.window().then(rememberPage);
    cy.contains('#staleTabMessage', 'Refreshing in 10 seconds');

    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    cy.contains(
      '#staleTabMessage',
      'Automatic refresh is paused while a game is in progress'
    );

    cy.tick(5000);
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    expectNoReload();

    startDay();
    cy.tick(15000);
    expectNoReload();
    cy.contains(
      '#staleTabMessage',
      'Automatic refresh is paused while a game is in progress'
    );
  });

  it('does not refresh while a countdown is paused', () => {
    visitStaleTab({ clocked: true, mute: true, withPerformance: true });
    cy.window().then(rememberPage);
    startDay();
    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');

    cy.tick(15000);
    expectNoReload();
    cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
    cy.contains(
      '#staleTabMessage',
      'Automatic refresh is paused while a game is in progress'
    );

    cy.get('#staleTabDismissBtn').click();
    cy.get('#staleTabBanner').should('not.be.visible');
    cy.tick(15000);
    expectNoReload();
  });

  it('does not refresh between days or after a countdown completes', () => {
    visitStaleTab({ clocked: true, mute: true, withPerformance: true });
    cy.window().then(rememberPage);
    startDay();

    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn').click();
    cy.tick(12000);

    cy.get('.day-display').should('have.class', 'dusk');
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    cy.contains(
      '#staleTabMessage',
      'Automatic refresh is paused while a game is in progress'
    );
    expectNoReload();

    cy.tick(20000);
    expectNoReload();
    cy.get('.day-display').should('have.class', 'dusk');
    cy.contains('#staleTabMessage', 'Refreshing in').should('not.exist');
  });

  it('cancels a pending refresh when a game starts', () => {
    visitStaleTab({ clocked: true, mute: true, withPerformance: true });
    cy.window().then(rememberPage);
    cy.contains('#staleTabMessage', 'Refreshing in 10 seconds');

    startDay();
    cy.contains(
      '#staleTabMessage',
      'Automatic refresh is paused while a game is in progress'
    );

    cy.tick(15000);
    expectNoReload();
    cy.contains('#staleTabMessage', 'Refreshing in').should('not.exist');
  });

  it('rechecks the current state before a scheduled refresh runs', () => {
    visitStaleTab({ clocked: true, mute: true, withPerformance: true });
    cy.window().then((win) => {
      rememberPage(win);
      win.staleGeneration = win.staleTabUtils.refreshGeneration;
    });
    cy.contains('#staleTabMessage', 'Refreshing in 10 seconds');

    startDay();
    cy.window().then((win) => {
      win.staleTabUtils.requestAutomaticRefresh(win.staleGeneration);
      win.staleTabUtils.requestAutomaticRefresh();
    });
    expectNoReload();
    cy.contains(
      '#staleTabMessage',
      'Automatic refresh is paused while a game is in progress'
    );

    cy.get('#resetBtn').click();
    cy.contains('#staleTabMessage', 'Refreshing in 10 seconds');
    cy.window().then((win) => {
      win.staleTabUtils.requestAutomaticRefresh(win.staleGeneration);
    });
    expectNoReload();
    cy.contains('#staleTabMessage', 'Refreshing in 10 seconds');
  });

  it('refreshes again after the game is reset', () => {
    visitStaleTab({ clocked: true, mute: true, withPerformance: true });
    cy.window().then(rememberPage);
    startDay();
    cy.contains(
      '#staleTabMessage',
      'Automatic refresh is paused while a game is in progress'
    );

    cy.get('#resetBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    cy.contains('#staleTabMessage', 'Refreshing in 10 seconds');

    cy.tick(10000);
    cy.window().should('not.have.prop', 'beforeReload');
  });

  it('does not schedule a second refresh when freshness is checked again', () => {
    const now = Date.now();
    cy.clock(now, CLOCK_METHODS);
    cy.visit('/', {
      onBeforeLoad(win) {
        const timeOrigin = win.Date.now() - THREE_DAYS_MS;
        Object.defineProperty(win.performance, 'timeOrigin', {
          configurable: true,
          get: () => timeOrigin,
        });
        win.localStorage.setItem(
          'towerTimerLastActiveAt',
          String(now - THREE_DAYS_MS)
        );
      },
    });
    cy.wait(50);
    cy.tick(200);
    cy.get('#closeSettings').click();

    cy.contains('#staleTabMessage', 'Refreshing in 10 seconds');
    cy.tick(1000);
    cy.contains('#staleTabMessage', 'Refreshing in 9 seconds');

    dispatchVisibility('hidden');
    dispatchVisibility('visible');
    cy.window().then((win) => {
      win.dispatchEvent(
        new win.PageTransitionEvent('pageshow', { persisted: true })
      );
    });

    cy.contains('#staleTabMessage', 'Refreshing in 9 seconds');
    cy.tick(1000);
    cy.contains('#staleTabMessage', 'Refreshing in 8 seconds');
  });

  it('does not refresh when a hidden game tab becomes visible again', () => {
    cy.visit('/');
    cy.get('.tab-button[data-tab="effects"]').click();
    cy.get('#playSoundEffects').uncheck().trigger('change');
    cy.get('.tab-button[data-tab="music"]').click();
    cy.get('#playMusic').uncheck().trigger('change');
    cy.get('#closeSettings').click();

    startDay();
    cy.window().then(rememberPage);

    // Advance the calendar only. Mocking performance or the countdown
    // interval would run the open day down while the tab is hidden.
    cy.clock(new Date('2026-05-22T12:00:00'), ['Date']);
    dispatchVisibility('hidden');
    cy.tick(TWO_DAYS_MS + 1);
    dispatchVisibility('visible');

    cy.get('#staleTabBanner').should('be.visible');
    cy.contains(
      '#staleTabMessage',
      'Automatic refresh is paused while a game is in progress'
    );
    cy.contains('#staleTabMessage', 'Refreshing in').should('not.exist');
    cy.get('#staleTabRefreshBtn').should('be.visible');
    cy.get('#staleTabDismissBtn').should('be.visible');

    cy.window().then((win) => {
      win.staleTabUtils.requestAutomaticRefresh();
    });
    expectNoReload();
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
  });

  it('keeps the banner usable during a game and still refreshes on request', () => {
    visitStaleTab({ mute: true });
    startDay();

    cy.get('#staleTabBanner').should('be.visible');
    cy.contains(
      '#staleTabMessage',
      'Automatic refresh is paused while a game is in progress'
    );
    cy.get('#staleTabDismissBtn').should('be.visible');
    cy.get('#staleTabRefreshBtn')
      .should('be.visible')
      .and('contain', 'Refresh now');

    cy.window().then((win) => {
      const origin = win.performance.timeOrigin;
      cy.get('#staleTabRefreshBtn').click();
      cy.window().its('performance.timeOrigin').should('not.eq', origin);
    });
    cy.get('#staleTabBanner').should('not.be.visible');
  });

  it('does not refresh a restored dusk game when the tab is stale', () => {
    const now = Date.now();
    cy.clock(now, CLOCK_METHODS);
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          'towerTimerLastActiveAt',
          String(now - THREE_DAYS_MS)
        );
        win.localStorage.setItem(
          'towerTimerSettings',
          JSON.stringify({ dayState: 'dusk', currentDay: 2, playerCount: 10 })
        );
      },
    });
    cy.wait(50);
    cy.tick(200);
    cy.window().then(rememberPage);

    cy.get('#staleTabBanner').should('be.visible');
    cy.contains(
      '#staleTabMessage',
      'Automatic refresh is paused while a game is in progress'
    );
    cy.get('.day-display').should('have.class', 'dusk');

    cy.tick(15000);
    expectNoReload();
  });
});
