import { visitGameplay } from '../support/gameplay.js';

const SESSION_URL = 'https://timer.arcane-scripts.net/companion.html?code=WH8X2P';
const WRITE_TOKEN = 'storyteller-write-token-value';

function installClosingSocket(win) {
  win.WebSocket = class {
    constructor() {
      this.readyState = 0;
      setTimeout(() => {
        if (this.readyState !== 0) return;
        this.readyState = 3;
        this.onclose?.({ code: 1006 });
      }, 0);
    }

    send() {}

    close() {
      this.readyState = 3;
      this.onclose?.({ code: 1000 });
    }
  };
}

function installHeldSocket(win) {
  win.__companionSockets = [];
  win.WebSocket = class {
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

function replyWithSession(request) {
  request.reply({
    statusCode: 201,
    body: { code: 'WH8X2P', writeToken: WRITE_TOKEN },
  });
}

function openCompanionTab() {
  cy.get('#settingsBtn').click();
  cy.get('.tab-button[data-tab="companion"]').click();
  cy.get('.settings-panel[data-panel="companion"]').should('have.class', 'active');
}

describe('Companion settings', () => {
  it('adds a Companion Mode tab that stays off and does not touch the timer', () => {
    let creates = 0;
    cy.intercept('POST', '**/companion-api/sessions', (request) => {
      creates += 1;
      request.reply({ statusCode: 500, body: {} });
    });
    visitGameplay();
    cy.get('#companionStart').should('not.be.visible');
    cy.get('#playerCountQrWrapper').should('exist');
    cy.get('#startBtn').should('be.enabled');
    openCompanionTab();
    cy.get('.tab-button[data-tab="companion"]').invoke('text').invoke('trim').should('eq', 'Companion');
    cy.get('.settings-panel[data-panel="companion"]').should(
      'contain',
      'Let players follow the timer and public character counts on their own devices.'
    );
    cy.get('#companionEnabled').should('not.be.checked');
    cy.get('#companionAutoStart').should('not.be.checked').and('be.disabled');
    cy.get('#companionStatus').should('have.text', 'Disabled');
    cy.get('#companionSession').should('have.attr', 'hidden');
    cy.get('.tab-button[data-tab="game"]').click();
    cy.get('.settings-panel[data-panel="companion"]').should('not.have.class', 'active');
    cy.get('.tab-button[data-tab="companion"]').click();
    cy.get('#companionStatus').should('have.text', 'Disabled');
    cy.then(() => {
      expect(creates).to.equal(0);
    });
  });

  it('remembers both checkboxes and does not start when automatic start is off', () => {
    let creates = 0;
    cy.intercept('POST', '**/companion-api/sessions', (request) => {
      creates += 1;
      request.reply({ statusCode: 500, body: {} });
    });
    visitGameplay({ settings: { companionEnabled: true } });
    openCompanionTab();
    cy.get('#companionEnabled').should('be.checked');
    cy.get('#companionAutoStart').should('not.be.checked').and('not.be.disabled');
    cy.get('#companionStatus').should('have.text', 'Ready');
    cy.get('#companionStart').should('not.be.disabled');
    cy.then(() => {
      expect(creates).to.equal(0);
    });
    cy.get('#companionAutoStart').check();
    cy.get('#closeSettings').click();
    cy.reload();
    cy.get('#settingsDialog').should('not.be.visible');
    openCompanionTab();
    cy.get('#companionEnabled').should('be.checked');
    cy.get('#companionAutoStart').should('be.checked');
    cy.get('#companionStatus').should('have.text', 'Offline');
    cy.get('#companionStart').click();
    cy.get('#companionStatus').should('have.text', 'Offline');
    cy.then(() => {
      expect(creates).to.equal(2);
    });
  });

  it('starts one session on load and keeps that code across games and settings', () => {
    let creates = 0;
    cy.intercept('POST', '**/companion-api/sessions', (request) => {
      creates += 1;
      replyWithSession(request);
    });
    visitGameplay({
      settings: { companionEnabled: true, companionAutoStart: true },
      onBeforeLoad: installClosingSocket,
    });
    openCompanionTab();
    cy.get('#companionStatus')
      .invoke('text')
      .should('match', /Connecting|Reconnecting/);
    cy.get('#companionStatus').should('not.contain', 'Live');
    cy.get('#companionCode').should('have.text', 'WH8X2P');
    cy.get('body').should('not.contain', WRITE_TOKEN);
    cy.get('.tab-button[data-tab="display"]').click();
    cy.get('.tab-button[data-tab="companion"]').click();
    cy.get('#companionCode').should('have.text', 'WH8X2P');
    cy.get('#closeSettings').click();
    cy.get('#settingsBtn').click();
    cy.get('.tab-button[data-tab="companion"]').click();
    cy.get('#companionCode').should('have.text', 'WH8X2P');
    cy.get('.tab-button[data-tab="game"]').click();
    cy.get('#startNewGame').click();
    cy.get('.clocktower-btn').first().click();
    cy.get('#resetBtn').should('not.be.disabled').click();
    cy.get('#settingsBtn').click();
    cy.get('[data-input="playerCount"].increment').click();
    cy.get('[data-input="travellerCount"].increment').click();
    cy.get('.tab-button[data-tab="companion"]').click();
    cy.get('#companionCode').should('have.text', 'WH8X2P');
    cy.get('#companionStatus').should('not.have.text', 'Live');
    cy.get('#companionStop').click();
    cy.get('#companionStatus', { timeout: 8000 }).should('have.text', 'Ended');
    cy.get('#companionCodeRow').should('have.attr', 'hidden');
    cy.get('#companionEnabled').should('be.checked');
    cy.get('#companionCopy').should('be.disabled');
    cy.then(() => {
      expect(creates).to.equal(1);
    });
  });

  it('shares, copies and shows a public link, then stops or expires', () => {
    let creates = 0;
    cy.intercept('POST', '**/companion-api/sessions', (request) => {
      creates += 1;
      replyWithSession(request);
    });
    cy.intercept('GET', '**/api.qrserver.com/**', { statusCode: 200, body: '' });
    visitGameplay({ onBeforeLoad: installHeldSocket });
    openCompanionTab();
    cy.get('#companionEnabled').check();
    cy.get('#companionStart').click().click({ force: true });
    cy.get('#companionCode').should('have.text', 'WH8X2P');
    cy.get('#companionStatus').should('have.text', 'Connecting');
    cy.then(() => {
      expect(creates).to.equal(1);
    });

    cy.window().then((win) => {
      const writeText = cy.stub().resolves().as('copyLink');
      if (!win.navigator.clipboard) {
        Object.defineProperty(win.navigator, 'clipboard', {
          configurable: true,
          value: { writeText },
        });
      } else {
        cy.stub(win.navigator.clipboard, 'writeText').resolves().as('copyLink');
      }
    });
    cy.get('#companionCopy').click();
    cy.get('@copyLink').should('have.been.calledWith', SESSION_URL);
    cy.get('#companionCopyFeedback').should('have.text', 'Link copied');

    cy.get('#companionShowQr').click();
    cy.get('#companionQrImage')
      .should('have.attr', 'src')
      .and('include', 'qzone=2')
      .and('include', 'color=000000')
      .and('include', 'bgcolor=ffffff')
      .and('include', encodeURIComponent(SESSION_URL))
      .and('not.include', WRITE_TOKEN)
      .and('not.include', 'writeToken');
    cy.get('#companionQrCode').should('have.text', 'WH8X2P');
    cy.get('#companionQrClose').click();
    cy.get('#companionQr').should('have.attr', 'hidden');
    cy.get('#companionCode').should('have.text', 'WH8X2P');

    cy.window().then((win) => {
      cy.stub(win, 'confirm').returns(false).as('confirmStop');
    });
    cy.get('#companionEnabled').uncheck();
    cy.get('@confirmStop').should('have.been.called');
    cy.get('#companionEnabled').should('be.checked');
    cy.get('#companionCode').should('have.text', 'WH8X2P');

    cy.window().then((win) => {
      win.confirm.returns(true);
    });
    cy.get('#companionEnabled').uncheck();
    cy.get('#companionEnabled').should('not.be.checked');
    cy.get('#companionStatus').should('have.text', 'Disabled');
    cy.get('#companionSession').should('have.attr', 'hidden');
    cy.get('#companionAutoStart').should('be.disabled');
  });

  it('shows that an expired code has ended and can be replaced on purpose', () => {
    let creates = 0;
    cy.intercept('POST', '**/companion-api/sessions', (request) => {
      creates += 1;
      request.reply({
        statusCode: 201,
        body: { code: creates === 1 ? 'WH8X2P' : 'ABCDEF', writeToken: WRITE_TOKEN },
      });
    });
    visitGameplay({
      settings: { companionEnabled: true },
      onBeforeLoad: installHeldSocket,
    });
    openCompanionTab();
    cy.get('#companionStart').click();
    cy.get('#companionCode').should('have.text', 'WH8X2P');
    cy.window().then((win) => {
      const socket = win.__companionSockets.at(-1);
      socket.onmessage({
        data: JSON.stringify({ type: 'session-ended', reason: 'lifetime' }),
      });
    });
    cy.get('#companionStatus').should('have.text', 'Ended');
    cy.get('#companionStatusDetail').should('contain', 'no longer valid');
    cy.get('#companionCodeRow').should('have.attr', 'hidden');
    cy.get('#companionCopy').should('be.disabled');
    cy.get('#companionStart').click();
    cy.get('#companionCode').should('have.text', 'ABCDEF');
    cy.get('body').should('not.contain', WRITE_TOKEN);
    cy.then(() => {
      expect(creates).to.equal(2);
    });
  });

  it('uses the same session as the development panel', () => {
    let creates = 0;
    cy.intercept('POST', '**/companion-api/sessions', (request) => {
      creates += 1;
      replyWithSession(request);
    });
    visitGameplay({
      path: '/?companionDev=1',
      settings: { companionEnabled: true },
      onBeforeLoad: installHeldSocket,
    });
    cy.get('#companionDevStart').click();
    cy.get('#companionDevCode').should('have.text', 'WH8X2P');
    cy.get('#companionDevOpen')
      .should('have.attr', 'href', 'companion.html?code=WH8X2P')
      .and('have.attr', 'target', '_blank');
    cy.get('#companionDevDiagnostics').should(
      'have.attr',
      'href',
      'companion-dev.html?code=WH8X2P'
    );
    openCompanionTab();
    cy.get('#companionCode').should('have.text', 'WH8X2P');
    cy.get('#companionStart').click({ force: true });
    cy.then(() => {
      expect(creates).to.equal(1);
    });
  });

  it('reports a failed copy without exposing the write token', () => {
    cy.intercept('POST', '**/companion-api/sessions', replyWithSession);
    visitGameplay({
      settings: { companionEnabled: true },
      onBeforeLoad(win) {
        installHeldSocket(win);
        Object.defineProperty(win.navigator, 'clipboard', {
          configurable: true,
          value: { writeText: () => Promise.reject(new Error('denied')) },
        });
      },
    });
    openCompanionTab();
    cy.get('#companionStart').click();
    cy.get('#companionCopy').click();
    cy.get('#companionCopyFeedback').should('have.text', 'Could not copy the link');
    cy.get('body').should('not.contain', WRITE_TOKEN);
  });
});
