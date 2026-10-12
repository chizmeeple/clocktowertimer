import { startFirstDay, visitGameplay } from '../support/gameplay.js';

const COUNT_FOR_TEN = 'https://count.arcane-scripts.net/?p=10';
const DAY_PAPER = 'rgb(245, 241, 230)';
const NIGHT_PAPER = 'rgb(230, 238, 245)';
const GOOD_TEAM = 'rgba(25, 118, 210, 0.7)';

function destinationFor(playerCount) {
  return `https://count.arcane-scripts.net/?p=${playerCount}`;
}

function expectDestination(playerCount) {
  const destination = destinationFor(playerCount);
  cy.get('#playerCountQrLink').should('have.attr', 'href', destination);
  cy.get('#playerCountQrImg')
    .should('have.attr', 'src')
    .then((src) => {
      const params = new URL(src).searchParams;
      expect(params.get('data')).to.eq(destination);
      expect(params.get('format')).to.eq('svg');
      expect(params.get('qzone')).to.eq('0');
      expect(params.get('color')).to.eq('000000');
      expect(params.get('bgcolor')).to.eq('ffffff');
    });
}

function expectTheme(night) {
  cy.get('body').should(night ? 'have.class' : 'not.have.class', 'game--night');
  cy.get('#playerCountQrWrapper').should(
    'have.css',
    'background-color',
    night ? NIGHT_PAPER : DAY_PAPER
  );
  cy.get('#playerCountQrWrapper').should('have.css', 'box-shadow', 'none');
  cy.get('#playerCountQrWrapper').should('have.css', 'transition-duration', '0s');
  cy.get('#playerCountQrImg').should(($img) => {
    const filter = $img.css('filter');
    expect(filter).to.include(night ? 'player-count-qr-night' : 'player-count-qr-day');
    expect(filter).to.not.include(night ? 'player-count-qr-day' : 'player-count-qr-night');
  });
}

function expectGeometry() {
  cy.get('#playerCountQrImg').should('have.css', 'border-radius', '0px');
  cy.get('#playerCountQrLink').should('have.css', 'overflow', 'visible');
  cy.get('#playerCountQrWrapper').then(($card) => {
    const card = $card[0].getBoundingClientRect();
    cy.get('#playerCountQrImg').then(($img) => {
      const img = $img[0].getBoundingClientRect();
      expect(img.width, 'code width').to.be.greaterThan(48);
      expect(img.height, 'code height').to.be.closeTo(img.width, 1);
      expect(img.left, 'left quiet zone').to.be.greaterThan(card.left + 3);
      expect(card.right - img.right, 'right quiet zone').to.be.greaterThan(3);
      expect(img.top, 'top quiet zone').to.be.greaterThan(card.top + 3);
      expect(card.bottom - img.bottom, 'bottom quiet zone').to.be.greaterThan(3);
    });
  });
  cy.get('#demonAmount')
    .parents('.character-type')
    .then(($demon) => {
      cy.get('#playerCountQrWrapper').then(($qr) => {
        const demon = $demon[0].getBoundingClientRect();
        const qr = $qr[0].getBoundingClientRect();
        const separated =
          qr.left >= demon.right - 1 ||
          demon.left >= qr.right - 1 ||
          qr.top >= demon.bottom - 1 ||
          demon.top >= qr.bottom - 1;
        expect(separated, 'QR clears the Demon card').to.eq(true);
      });
    });
  cy.get('.character-counts .character-type')
    .first()
    .should('have.css', 'background-color', GOOD_TEAM)
    .should(($card) => {
      expect($card.css('box-shadow')).to.include('inset');
    });
}

function expectNoHorizontalOverflow() {
  cy.document().should((doc) => {
    expect(doc.documentElement.scrollWidth, 'page width').to.be.at.most(
      doc.documentElement.clientWidth + 1
    );
  });
}

describe('Player count QR', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.viewport(1280, 800);
  });

  it('stays hidden until the setting is saved, then comes back', () => {
    cy.visit('/');
    cy.get('#settingsDialog').should('be.visible');
    cy.get('#playerCountQrWrapper').should('not.be.visible');
    cy.get('#playerCountQrWrapper').should('not.have.class', 'visible');

    cy.get('.tab-button[data-tab="display"]').click();
    cy.get('#showPlayerCountQr').should('not.be.checked').click();
    cy.get('#playerCountQrWrapper').should('be.visible').and('have.class', 'visible');
    expectDestination(10);

    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');
    cy.reload();
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('#playerCountQrWrapper').should('be.visible');
    expectDestination(10);
    cy.get('#settingsBtn').click();
    cy.get('.tab-button[data-tab="display"]').click();
    cy.get('#showPlayerCountQr').should('be.checked').click();
    cy.get('#playerCountQrWrapper').should('not.be.visible');
    cy.get('#closeSettings').click();

    cy.reload();
    cy.get('#playerCountQrWrapper').should('not.be.visible');
    cy.get('#settingsBtn').click();
    cy.get('.tab-button[data-tab="display"]').click();
    cy.get('#showPlayerCountQr').should('not.be.checked');
  });

  it('keeps the count link when settings open and the player count changes', () => {
    visitGameplay({ settings: { showPlayerCountQr: true } });
    cy.get('#playerCountQrWrapper').should('be.visible');
    expectDestination(10);
    expectTheme(false);

    cy.get('#playerCountQrImg').invoke('attr', 'src').as('qrSrc');
    cy.get('#settingsBtn').click();
    cy.get('#settingsDialog').should('be.visible');
    cy.get('@qrSrc').then((src) => {
      cy.get('#playerCountQrImg').should('have.attr', 'src', src);
    });
    cy.get('#playerCountQrLink').should('have.attr', 'href', COUNT_FOR_TEN);
    cy.get('.tab-button[data-tab="display"]').click();
    cy.get('#showPlayerCountQr').should('be.checked');
    cy.get('body').should('not.have.class', 'game--night');

    cy.get('.tab-button[data-tab="game"]').click();
    cy.get('button.increment[data-input="playerCount"]').click();
    cy.get('#playerCount').should('have.value', '11');
    expectDestination(11);
    cy.get('#closeSettings').click();
    expectDestination(11);
    cy.get('#townsfolkAmount').should('have.text', '7');
    cy.get('#outsiderAmount').should('have.text', '1');
  });

  it('follows day and night without rebuilding the code', () => {
    visitGameplay({ settings: { showPlayerCountQr: true } });
    expectTheme(false);
    expectGeometry();
    cy.get('#playerCountQrImg').invoke('attr', 'src').as('qrSrc');

    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    cy.get('#settingsDialog').should('not.be.visible');
    expectTheme(true);
    cy.get('@qrSrc').then((src) => {
      cy.get('#playerCountQrImg').should('have.attr', 'src', src);
    });
    expectDestination(10);

    cy.get('#settingsBtn').click();
    cy.get('body').should('have.class', 'game--night');
    expectTheme(true);
    cy.get('#closeSettings').click();
    expectTheme(true);

    startFirstDay();
    cy.get('body').should('not.have.class', 'game--night');
    expectTheme(false);
    cy.get('@qrSrc').then((src) => {
      cy.get('#playerCountQrImg').should('have.attr', 'src', src);
    });
  });

  it('keeps its size beside the counts on wide, laptop, and phone layouts', () => {
    visitGameplay({ settings: { showPlayerCountQr: true } });

    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 844, height: 390 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ];

    viewports.forEach(({ width, height }) => {
      cy.viewport(width, height);
      cy.get('#playerCountQrWrapper').should('be.visible');
      expectGeometry();
      expectNoHorizontalOverflow();
    });
  });
});
