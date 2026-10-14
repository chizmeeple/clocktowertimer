import {
  advance,
  expectInViewport,
  startFirstDay,
  tick,
  timerSeconds,
  visitGameplay,
} from '../support/gameplay.js';

const WRITE_TOKEN = 'storyteller-write-token-value';

const LAYOUT_VIEWPORTS = [
  { name: '1080p', width: 1920, height: 1080 },
  { name: '720p', width: 1280, height: 720 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '800x1280', width: 800, height: 1280 },
  { name: '390x844', width: 390, height: 844 },
  { name: '320x568', width: 320, height: 568 },
];

function installHeldSocket(win) {
  win.__companionSockets = [];
  win.WebSocket = class {
    static OPEN = 1;

    constructor() {
      this.readyState = 0;
      win.__companionSockets.push(this);
    }

    send() {}

    close() {
      this.readyState = 3;
      const notify = this.onclose;
      this.onclose = null;
      notify?.({ code: 1000 });
    }
  };
}

function installSessionReplies(codes) {
  let creates = 0;
  cy.intercept('POST', '**/companion-api/sessions', (request) => {
    const code = codes[Math.min(creates, codes.length - 1)];
    creates += 1;
    request.reply({
      statusCode: 201,
      body: { code, writeToken: WRITE_TOKEN },
    });
  });
}

function openCompanionTab() {
  cy.get('#settingsBtn').click();
  cy.get('.tab-button[data-tab="companion"]').click();
  cy.get('.settings-panel[data-panel="companion"]').should('have.class', 'active');
}

function authenticateLatest() {
  cy.window().then((win) => {
    const socket = win.__companionSockets.at(-1);
    expect(socket, 'companion socket').to.exist;
    socket.readyState = win.WebSocket.OPEN;
    socket.onmessage({
      data: JSON.stringify({ type: 'authenticated' }),
    });
  });
}

function endLatest(reason) {
  cy.window().then((win) => {
    const socket = win.__companionSockets.at(-1);
    socket.onmessage({
      data: JSON.stringify({ type: 'session-ended', reason }),
    });
  });
}

function startAndGoLive(code) {
  cy.get('#companionStart').click();
  cy.get('#companionCode').should('have.text', code);
  cy.get('#companionJoin').should('not.be.visible');
  authenticateLatest();
  cy.get('#companionStatus').should('have.text', 'Live');
  cy.get('#companionJoin').should('be.visible');
  cy.get('#companionJoinValue').should('have.text', code);
  cy.get('#companionJoinState').should('not.be.visible');
  cy.get('#companionJoinCode').should('contain', 'Companion join code');
}

function expectJoinHidden() {
  cy.get('#companionJoin').should('not.be.visible');
  cy.get('#companionJoinValue').should('have.text', '');
}

function dismissPortraitWarningIfShown() {
  cy.get('body').then(($body) => {
    const dialog = $body.find('#portraitWarningDialog')[0];
    if (dialog?.open) {
      cy.get('#acceptPortraitWarning').click();
    }
  });
}

function expectNoHorizontalOverflow() {
  cy.document().should((doc) => {
    expect(doc.documentElement.scrollWidth, 'page width').to.be.at.most(
      doc.documentElement.clientWidth + 1
    );
  });
}

function rectsOverlap(a, b) {
  return (
    a.left < b.right - 1 &&
    a.right > b.left + 1 &&
    a.top < b.bottom - 1 &&
    a.bottom > b.top + 1
  );
}

describe('Companion join code', () => {
  it('stays off the timer when Companion Mode is disabled', () => {
    let creates = 0;
    cy.intercept('POST', '**/companion-api/sessions', (request) => {
      creates += 1;
      request.reply({ statusCode: 500, body: {} });
    });
    visitGameplay();
    expectJoinHidden();
    cy.get('#companionDev').should('not.exist');
    cy.get('#companionJoin').should('not.have.attr', 'tabindex');
    cy.get('#companionJoin').should('not.have.attr', 'aria-live');
    cy.then(() => {
      expect(creates).to.equal(0);
    });
  });

  it('stays hidden when Companion Mode is enabled but idle', () => {
    let creates = 0;
    cy.intercept('POST', '**/companion-api/sessions', (request) => {
      creates += 1;
      request.reply({ statusCode: 500, body: {} });
    });
    visitGameplay({ settings: { companionEnabled: true } });
    expectJoinHidden();
    openCompanionTab();
    cy.get('#companionStatus').should('have.text', 'Ready');
    expectJoinHidden();
    cy.then(() => {
      expect(creates).to.equal(0);
    });
  });

  it('shows the live session code and keeps it through timer changes', () => {
    installSessionReplies(['WH8X2P']);
    visitGameplay({
      settings: { companionEnabled: true },
      onBeforeLoad: installHeldSocket,
    });
    openCompanionTab();
    startAndGoLive('WH8X2P');
    cy.get('#companionJoin').should('not.have.class', 'is-reconnecting');
    cy.get('#companionJoin').invoke('text').should('not.match', /Live/);
    cy.get('body').should('not.contain', WRITE_TOKEN);

    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('#companionJoinValue').should('have.text', 'WH8X2P');

    cy.get('#companionJoin').then(($panel) => {
      const before = $panel[0].getBoundingClientRect();
      startFirstDay();
      timerSeconds().then((shown) => {
        advance(2000);
        tick();
        timerSeconds().should('be.lessThan', shown);
      });
      cy.get('#companionJoinValue').should('have.text', 'WH8X2P');
      cy.get('#companionJoin').should(($next) => {
        const after = $next[0].getBoundingClientRect();
        expect(after.top).to.be.closeTo(before.top, 1);
        expect(after.right).to.be.closeTo(before.right, 1);
      });
    });

    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
    cy.get('#companionJoinValue').should('have.text', 'WH8X2P');
    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    cy.get('#companionJoin').should('be.visible');

    cy.get('#settingsBtn').click();
    cy.get('.tab-button[data-tab="game"]').click();
    cy.get('#startNewGame').click();
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('#companionJoinValue').should('have.text', 'WH8X2P');
    cy.get('#clocktowerPresets .clocktower-btn').first().click();
    cy.get('#resetBtn').click();
    cy.get('#companionJoinValue').should('have.text', 'WH8X2P');
    cy.get('#companionJoinState').should('not.be.visible');
  });

  it('is unaffected by opening, switching, and closing Settings', () => {
    installSessionReplies(['WH8X2P']);
    visitGameplay({
      settings: { companionEnabled: true },
      onBeforeLoad: installHeldSocket,
    });
    openCompanionTab();
    startAndGoLive('WH8X2P');
    cy.get('.tab-button[data-tab="display"]').click();
    cy.get('.settings-panel[data-panel="companion"]').should('not.have.class', 'active');
    cy.get('#companionJoinValue').should('have.text', 'WH8X2P');
    cy.get('.tab-button[data-tab="time"]').click();
    cy.get('#companionJoin').should('be.visible');
    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('#companionJoinValue').should('have.text', 'WH8X2P');
    cy.get('#settingsBtn').click();
    cy.get('#companionJoinValue').should('have.text', 'WH8X2P');
    cy.get('#closeSettings').click();
    cy.get('#companionJoin').should('be.visible');
  });

  it('disappears when sharing stops, the session ends, or Companion Mode is turned off', () => {
    installSessionReplies(['WH8X2P']);
    visitGameplay({
      settings: { companionEnabled: true },
      onBeforeLoad: installHeldSocket,
    });
    openCompanionTab();
    startAndGoLive('WH8X2P');

    cy.window().then((win) => {
      cy.stub(win, 'confirm').returns(false).as('confirmStop');
    });
    cy.get('#companionEnabled').uncheck();
    cy.get('@confirmStop').should('have.been.called');
    cy.get('#companionEnabled').should('be.checked');
    cy.get('#companionJoinValue').should('have.text', 'WH8X2P');

    cy.get('#companionStop').click();
    endLatest('ended');
    cy.get('#companionStatus').should('have.text', 'Ended');
    expectJoinHidden();

    startAndGoLive('WH8X2P');
    endLatest('lifetime');
    cy.get('#companionStatus').should('have.text', 'Ended');
    expectJoinHidden();
    cy.get('#companionJoin').should('not.contain', 'WH8X2P');

    startAndGoLive('WH8X2P');
    cy.window().then((win) => {
      win.confirm.returns(true);
    });
    cy.get('#companionEnabled').uncheck();
    cy.get('#companionEnabled').should('not.be.checked');
    cy.get('#companionStatus').should('have.text', 'Disabled');
    expectJoinHidden();
  });

  it('keeps a reconnecting code visible without calling it Live', () => {
    installSessionReplies(['WH8X2P']);
    visitGameplay({
      settings: { companionEnabled: true },
      onBeforeLoad: installHeldSocket,
    });
    openCompanionTab();
    startAndGoLive('WH8X2P');
    cy.window().then((win) => {
      const socket = win.__companionSockets.at(-1);
      socket.onclose({ code: 1006 });
    });
    cy.get('#companionStatus').should('have.text', 'Reconnecting');
    cy.get('#companionJoin').should('be.visible').and('have.class', 'is-reconnecting');
    cy.get('#companionJoinValue').should('have.text', 'WH8X2P');
    cy.get('#companionJoinState').should('be.visible').and('have.text', 'Reconnecting');
    cy.get('#companionJoin').invoke('text').should('not.match', /Live/);
    cy.get('#companionStatus').should('not.have.text', 'Live');
  });

  it('replaces the previous code when a new session goes live', () => {
    installSessionReplies(['WH8X2P', 'ABCDEF']);
    visitGameplay({
      settings: { companionEnabled: true },
      onBeforeLoad: installHeldSocket,
    });
    openCompanionTab();
    startAndGoLive('WH8X2P');
    endLatest('ended');
    expectJoinHidden();
    cy.get('#companionJoin').should('not.contain', 'WH8X2P');
    startAndGoLive('ABCDEF');
    cy.get('#companionJoin').should('not.contain', 'WH8X2P');
    cy.get('#companionCode').should('have.text', 'ABCDEF');
  });

  it('does not show a second code when the development panel is open', () => {
    installSessionReplies(['WH8X2P']);
    visitGameplay({
      path: '/?companionDev=1',
      settings: { companionEnabled: true },
      onBeforeLoad: installHeldSocket,
    });
    cy.get('#companionDev').should('be.visible');
    cy.get('#companionDevStart').click();
    cy.get('#companionDevCode').should('have.text', 'WH8X2P');
    cy.get('#companionDevCodeLine').should('not.have.attr', 'hidden');
    cy.get('#companionJoin').should('not.be.visible');
    authenticateLatest();
    cy.get('#companionJoinValue').should('have.text', 'WH8X2P');
    cy.get('#companionDevCodeLine').should('have.attr', 'hidden');
    cy.get('#companionDevStatus').should('have.text', 'live');
    cy.get('#companionDevDelivery').should('be.visible');
    cy.get('#companionDevOpen')
      .should('have.attr', 'href', 'c?code=WH8X2P')
      .and('not.have.attr', 'aria-disabled');
    cy.get('#companionDevDiagnostics').should(
      'have.attr',
      'href',
      'companion-dev.html?code=WH8X2P'
    );
    cy.get('.companion-join').should('have.length', 1);
    cy.get('#companionDev').should(($dev) => {
      const dev = $dev[0].getBoundingClientRect();
      const join = $dev[0].ownerDocument
        .getElementById('companionJoin')
        .getBoundingClientRect();
      expect(rectsOverlap(dev, join), 'dev panel overlaps the join code').to.equal(
        false
      );
    });
    cy.window().should((win) => {
      const visible = [...win.document.body.querySelectorAll('*')].filter((el) => {
        if (el.childElementCount > 0) return false;
        if (el.textContent.trim() !== 'WH8X2P') return false;
        const view = el.ownerDocument.defaultView;
        let node = el;
        while (node) {
          const style = view.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (node.hasAttribute?.('hidden')) return false;
          node = node.parentElement;
        }
        return el.getClientRects().length > 0;
      });
      expect(visible.map((el) => el.id), 'visible code displays').to.deep.equal([
        'companionJoinValue',
      ]);
    });
  });

  it('lets a click through the join code reach a covered day preset', () => {
    installSessionReplies(['WH8X2P']);
    visitGameplay({
      settings: { companionEnabled: true },
      onBeforeLoad: installHeldSocket,
    });
    openCompanionTab();
    startAndGoLive('WH8X2P');
    cy.get('#closeSettings').click();
    cy.viewport(1024, 500);
    dismissPortraitWarningIfShown();

    cy.window().should((win) => {
      const panel = win.document.getElementById('companionJoin');
      const join = panel.getBoundingClientRect();
      expect(win.getComputedStyle(panel).pointerEvents).to.equal('none');
      for (const node of panel.querySelectorAll('*')) {
        expect(win.getComputedStyle(node).pointerEvents).to.equal('none');
      }

      const covered = [...win.document.querySelectorAll('.clocktower-btn')].find((btn) => {
        const rect = btn.getBoundingClientRect();
        const overlapX = Math.min(join.right, rect.right) - Math.max(join.left, rect.left);
        const overlapY = Math.min(join.bottom, rect.bottom) - Math.max(join.top, rect.top);
        return overlapX > 8 && overlapY > 8;
      });
      expect(covered, 'day preset under the join code').to.exist;
      const rect = covered.getBoundingClientRect();
      const x = (Math.max(join.left, rect.left) + Math.min(join.right, rect.right)) / 2;
      const y = (Math.max(join.top, rect.top) + Math.min(join.bottom, rect.bottom)) / 2;
      const hit = win.document.elementFromPoint(x, y);
      expect(panel.contains(hit), 'join code receives the click').to.equal(false);
      expect(covered.contains(hit), 'day preset receives the click').to.equal(true);
      win.__coveredPreset = {
        day: covered.dataset.day,
        offsetX: x - rect.left,
        offsetY: y - rect.top,
      };
    });

    cy.window().then((win) => {
      const { day, offsetX, offsetY } = win.__coveredPreset;
      cy.get(`.clocktower-btn[data-day="${day}"]`).click(offsetX, offsetY);
    });
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    cy.get('#companionJoinValue').should('have.text', 'WH8X2P');
  });

  it('stays clear of the countdown and controls at representative sizes', () => {
    installSessionReplies(['WH8X2P']);
    visitGameplay({
      settings: { companionEnabled: true },
      onBeforeLoad: installHeldSocket,
    });
    openCompanionTab();
    startAndGoLive('WH8X2P');
    cy.get('#closeSettings').click();

    LAYOUT_VIEWPORTS.forEach(({ name, width, height }) => {
      cy.viewport(width, height);
      dismissPortraitWarningIfShown();
      cy.get('#companionJoinValue').should('have.text', 'WH8X2P');
      expectNoHorizontalOverflow();
      expectInViewport('#companionJoin');
      expectInViewport('#startBtn');
      expectInViewport('.bottom-container');
      cy.get('#companionJoin').should(($panel) => {
        const join = $panel[0].getBoundingClientRect();
        const view = $panel[0].ownerDocument.defaultView;
        const doc = view.document;
        const bar = doc.querySelector('.bottom-container').getBoundingClientRect();
        const gap = bar.top - join.bottom;
        expect(gap, `${name} gap above the bottom bar`).to.be.within(0, 16);
        expect(join.top, `${name} top`).to.be.at.least(-1);
        expect(join.left, `${name} left`).to.be.at.least(-1);
        expect(join.right, `${name} right`).to.be.at.most(view.innerWidth + 1);
        expect(join.bottom, `${name} bottom`).to.be.at.most(view.innerHeight + 1);
        expect(view.innerWidth - join.right, `${name} right inset`).to.be.lessThan(28);
        expect(join.right, `${name} sits on the right`).to.be.greaterThan(
          view.innerWidth * 0.55
        );

        const codeSize = Number.parseFloat(
          view.getComputedStyle(doc.querySelector('.companion-join-code')).fontSize
        );
        expect(codeSize, `${name} code size`).to.be.at.least(18);

        const selectors = [
          '.timer-display .time',
          '#characterCounts',
          '#startBtn',
          '#clocktowerPresets',
          '#regularPresets',
          '#settingsBtn',
          '#resetBtn',
          '#fullscreenBtn',
        ];
        for (const selector of selectors) {
          const node = doc.querySelector(selector);
          const style = view.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') continue;
          const rect = node.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) continue;
          expect(rectsOverlap(join, rect), `${name} overlaps ${selector}`).to.equal(
            false
          );
        }
        expect(rectsOverlap(join, bar), `${name} overlaps the bottom bar`).to.equal(
          false
        );

        if (width >= 1024 && height >= 700) {
          const time = doc.querySelector('.timer-display .time').getBoundingClientRect();
          const counts = doc.querySelector('#characterCounts').getBoundingClientRect();
          expect(join.height, `${name} countdown`).to.be.lessThan(time.height * 0.55);
          expect(join.height, `${name} player counts`).to.be.lessThan(counts.height);
          expect(join.width, `${name} player count width`).to.be.lessThan(
            counts.width * 0.5
          );
        }
      });
      cy.log(name);
    });
  });
});
