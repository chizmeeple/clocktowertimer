import { expectInViewport, visitGameplay } from '../support/gameplay.js';

const TABS = ['game', 'display', 'time', 'effects', 'music', 'shortcuts', 'companion'];

function expectNoHorizontalOverflow() {
  cy.document().should((doc) => {
    expect(doc.documentElement.scrollWidth).to.be.at.most(
      doc.documentElement.clientWidth + 1
    );
  });
}

function expectDialogWithinViewport() {
  cy.get('#settingsDialog').should(($dialog) => {
    const rect = $dialog[0].getBoundingClientRect();
    const view = $dialog[0].ownerDocument.defaultView;
    const expected = Math.min(1200, view.innerWidth - 32);
    expect(rect.left).to.be.at.least(-1);
    expect(rect.right).to.be.at.most(view.innerWidth + 1);
    expect(rect.width).to.be.closeTo(expected, 2);
  });
}

function expectTabRows(expected) {
  cy.get('.settings-tabs .tab-button').should(($tabs) => {
    expect($tabs).to.have.length(7);
    const rows = [];
    let rowTop = null;
    let count = 0;
    for (const tab of $tabs) {
      const rect = tab.getBoundingClientRect();
      const top = Math.round(rect.top);
      if (rowTop === null || Math.abs(top - rowTop) > 4) {
        if (count) rows.push(count);
        rowTop = top;
        count = 1;
      } else {
        count += 1;
      }
      expect(tab.scrollWidth, tab.textContent.trim()).to.be.at.most(rect.width + 1);
    }
    if (count) rows.push(count);
    expect(rows).to.deep.equal(expected);
    expect(rows.reduce((sum, row) => sum + row, 0)).to.equal(7);
    expect(Math.max(...rows) - Math.min(...rows)).to.be.at.most(1);
  });
}

function openSettings() {
  visitGameplay({ harness: false });
  cy.get('#settingsBtn').click();
  cy.get('#settingsDialog').should('be.visible');
  cy.get('.settings-tabs').should('be.visible');
}

describe('Settings layout', () => {
  it('puts all seven tabs on one row at desktop widths', () => {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [1024, 768],
    ]) {
      cy.viewport(width, height);
      openSettings();
      expectDialogWithinViewport();
      expectTabRows([7]);
      expectNoHorizontalOverflow();
      cy.get('#closeSettings').click();
    }
  });

  it('wraps the tabs into balanced rows on a tablet', () => {
    cy.viewport(768, 1024);
    openSettings();
    expectDialogWithinViewport();
    expectTabRows([4, 3]);
    expectNoHorizontalOverflow();
  });

  it('keeps every tab and the footer usable on a phone', () => {
    for (const [width, height, rows] of [
      [390, 844, [2, 2, 2, 1]],
      [320, 568, [2, 2, 2, 1]],
    ]) {
      cy.viewport(width, height);
      openSettings();
      expectDialogWithinViewport();
      expectTabRows(rows);
      expectNoHorizontalOverflow();
      for (const name of TABS) {
        cy.get(`.tab-button[data-tab="${name}"]`).click();
        cy.get(`.settings-panel[data-panel="${name}"]`).should('have.class', 'active');
        expectInViewport(`.tab-button[data-tab="${name}"]`);
      }
      cy.get('#companionEnabled').should('exist');
      cy.get('#companionAutoStart').should('exist');
      cy.get('#closeSettings').scrollIntoView();
      expectInViewport('#closeSettings');
      expectInViewport('#startNewGame');
    }
  });

  it('still switches every settings tab on a wide screen', () => {
    cy.viewport(1440, 900);
    openSettings();
    for (const name of TABS) {
      cy.get(`.tab-button[data-tab="${name}"]`).click();
      cy.get(`.tab-button[data-tab="${name}"]`).should('have.class', 'active');
      cy.get(`.settings-panel[data-panel="${name}"]`).should('be.visible');
    }
    cy.get('#companionEnabled').should('be.visible');
    cy.get('#playerCount').should('not.be.visible');
    cy.get('.tab-button[data-tab="game"]').click();
    cy.get('#playerCount').should('be.visible');
  });
});
