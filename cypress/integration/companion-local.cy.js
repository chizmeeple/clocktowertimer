import {
  startFirstDay,
  timerSeconds,
  visitGameplay,
} from '../support/gameplay.js';

function visitDev() {
  visitGameplay({ harness: false, path: '/?companionDev=1' });
}

function companionWindow() {
  return cy.window().then((win) => win.__companionDevClient);
}

function expectCompanion(selector, check) {
  cy.window().should((win) => {
    const child = win.__companionDevClient;
    expect(child && !child.closed, 'companion window').to.equal(true);
    const node = child.document.querySelector(selector);
    expect(node, selector).to.exist;
    check(node.textContent);
  });
}

function companionSeconds() {
  return companionWindow().then((child) => {
    const text = child.document.querySelector('#timer').textContent;
    expect(text, 'companion timer').to.match(/^\d{2}:\d{2}$/);
    const [minutes, seconds] = text.split(':').map(Number);
    return minutes * 60 + seconds;
  });
}

function openCompanion() {
  cy.get('#companionDevCode').invoke('text').then((code) => {
    cy.get('#companionDevOpen')
      .should('have.attr', 'href', `companion.html?code=${code}`)
      .and('have.attr', 'target', '_blank')
      .and('have.attr', 'rel', 'noopener');
    cy.get('#companionDevDiagnostics')
      .should('have.attr', 'href', `companion-dev.html?code=${code}`)
      .and('have.attr', 'target', '_blank')
      .and('have.attr', 'rel', 'noopener');
  });
  cy.get('#companionDevDiagnostics').click();
  cy.window().should((win) => {
    expect(win.__companionDevClient && !win.__companionDevClient.closed).to.equal(true);
    const href = win.__companionDevClient.location.href;
    const params = new URL(href).searchParams;
    expect(href).to.contain('companion-dev.html');
    expect(params.get('code'), 'session code').to.match(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(params.has('token')).to.equal(false);
    expect(params.has('writeToken')).to.equal(false);
    expect(href).not.to.contain('writeToken');
  });
}

describe('Local companion session', () => {
  afterEach(() => {
    cy.window().then((win) => {
      win.__companionDevClient?.close();
    });
  });

  it('follows the real timer through a local worker session', () => {
    visitDev();
    cy.get('#companionDev').should('be.visible');
    cy.get('#companionDevCode').should('have.text', '—');
    cy.get('#companionDevStatus').should('have.text', 'Idle');
    cy.get('#startBtn').should('exist');

    cy.get('#companionDevStart').click();
    cy.get('#companionDevStatus', { timeout: 10000 }).should('have.text', 'live');
    cy.get('#companionDevDelivery').should('contain', 'accepted');
    cy.get('#companionDevCode').invoke('text').should('match', /^[0-9A-HJKMNP-TV-Z]{6}$/);

    startFirstDay();
    openCompanion();
    expectCompanion('#connection', (text) => {
      expect(text).to.equal('live');
    });
    expectCompanion('#phase', (text) => {
      expect(text).to.equal('day');
    });
    expectCompanion('#day', (text) => {
      expect(text).to.equal('1');
    });
    expectCompanion('#townsfolk', (text) => {
      expect(text).to.equal('7');
    });
    expectCompanion('#outsider', (text) => {
      expect(text).to.equal('0');
    });
    expectCompanion('#minion', (text) => {
      expect(text).to.equal('2');
    });
    expectCompanion('#demon', (text) => {
      expect(text).to.equal('1');
    });
    expectCompanion('#traveller', (text) => {
      expect(text).to.equal('0');
    });
    expectCompanion('#freshness', (text) => {
      expect(text).to.equal('fresh');
    });
    expectCompanion('#timer', (text) => {
      expect(text).to.match(/^\d{2}:\d{2}$/);
    });

    companionSeconds().then((started) => {
      cy.wait(1500);
      companionSeconds().should((later) => {
        expect(later).to.be.lessThan(started);
      });
    });

    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
    cy.wait(400);
    companionSeconds().then((paused) => {
      cy.wait(1500);
      companionSeconds().should('equal', paused);
      timerSeconds().should((shown) => {
        expect(Math.abs(shown - paused)).to.be.at.most(1);
      });
    });

    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    companionSeconds().then((resumed) => {
      cy.wait(1500);
      companionSeconds().should((later) => {
        expect(later).to.be.lessThan(resumed);
      });
    });

    cy.get('#settingsBtn').click();
    cy.get('button.increment[data-input="playerCount"]').click();
    cy.get('#playerCount').should('have.value', '11');
    cy.get('button.increment[data-input="travellerCount"]').click();
    cy.get('#travellerCount').should('have.value', '1');
    cy.get('#closeSettings').click();
    expectCompanion('#outsider', (text) => {
      expect(text).to.equal('1');
    });
    expectCompanion('#townsfolk', (text) => {
      expect(text).to.equal('7');
    });
    expectCompanion('#traveller', (text) => {
      expect(text).to.equal('1');
    });

    cy.get('#companionDevDelivery').invoke('text').then((beforeDrop) => {
      cy.get('#companionDevDrop').click();
      cy.get('#companionDevStatus').should('have.text', 'reconnecting');
      cy.get('#companionDevStatus', { timeout: 10000 }).should('have.text', 'live');
      cy.get('#companionDevDelivery', { timeout: 10000 }).should((node) => {
        expect(node.text(), node.text()).not.to.equal(beforeDrop);
      });
    });
    expectCompanion('#connection', (text) => {
      expect(text).to.equal('live');
    });
    expectCompanion('#traveller', (text) => {
      expect(text).to.equal('1');
    });

    cy.window().then((win) => {
      win.__companionDevClient.document.querySelector('#drop').click();
    });
    expectCompanion('#connection', (text) => {
      expect(text).to.equal('live');
    });
    expectCompanion('#phase', (text) => {
      expect(text).to.equal('day');
    });

    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn .button-text').should('have.text', 'Time flies…');
    companionSeconds().then((before) => {
      cy.wait(1000);
      companionSeconds().should((later) => {
        expect(before - later).to.be.greaterThan(3);
      });
    });
    cy.window({ timeout: 20000 }).should((win) => {
      const doc = win.__companionDevClient.document;
      expect(doc.querySelector('#phase').textContent).to.equal('night');
      expect(doc.querySelector('#timer').textContent).to.equal('00:00');
      expect(doc.querySelector('#freshness').textContent).to.equal('fresh');
    });

    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    expectCompanion('#phase', (text) => {
      expect(text).to.equal('wake');
    });
    companionSeconds().then((wakeStart) => {
      expect(wakeStart).to.be.at.most(6);
      cy.wait(1200);
      companionSeconds().should((later) => {
        expect(later).to.be.lessThan(wakeStart);
      });
    });
    cy.window({ timeout: 12000 }).should((win) => {
      const phase = win.__companionDevClient.document.querySelector('#phase').textContent;
      expect(phase).to.equal('day');
    });

    cy.get('#resetBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    timerSeconds().then((shown) => {
      cy.window().should((win) => {
        const text = win.__companionDevClient.document.querySelector('#timer').textContent;
        const [minutes, seconds] = text.split(':').map(Number);
        expect(minutes * 60 + seconds).to.equal(shown);
      });
      cy.wait(1200);
      cy.window().should((win) => {
        const text = win.__companionDevClient.document.querySelector('#timer').textContent;
        const [minutes, seconds] = text.split(':').map(Number);
        expect(minutes * 60 + seconds).to.equal(shown);
      });
    });

    cy.get('#companionDevEnd').click();
    cy.get('#companionDevStatus', { timeout: 10000 }).should('have.text', 'ended');
    cy.get('#companionDevOpen').should('have.attr', 'aria-disabled', 'true').and('not.have.attr', 'href');
    cy.get('#companionDevDiagnostics').should('have.attr', 'aria-disabled', 'true').and('not.have.attr', 'href');
    expectCompanion('#connection', (text) => {
      expect(text).to.equal('ended');
    });
    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    expectCompanion('#connection', (text) => {
      expect(text).to.equal('ended');
    });
  });
});
