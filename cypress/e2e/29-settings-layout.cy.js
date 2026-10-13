import { expectInViewport, visitGameplay } from '../support/gameplay.js';

const TABS = ['game', 'display', 'time', 'effects', 'music', 'shortcuts', 'companion'];
const DIALOG_MAX = 640;

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
    const expected = Math.min(DIALOG_MAX, view.innerWidth - 32);
    expect(rect.left).to.be.at.least(-1);
    expect(rect.right).to.be.at.most(view.innerWidth + 1);
    expect(rect.width).to.be.closeTo(expected, 2);
    expect(rect.left).to.be.closeTo((view.innerWidth - rect.width) / 2, 2);
  });
}

function expectTabRows(expected) {
  cy.get('.settings-tabs .tab-button').should(($tabs) => {
    expect($tabs).to.have.length(7);
    const rows = [];
    let rowTop = null;
    let count = 0;
    const rects = [];
    for (const tab of $tabs) {
      const rect = tab.getBoundingClientRect();
      rects.push(rect);
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

    const widths = rects.map((rect) => rect.width);
    expect(Math.max(...widths) - Math.min(...widths)).to.be.lessThan(2);

    const lastCount = rows[rows.length - 1];
    if (lastCount < rows[0]) {
      const firstRow = rects.slice(0, rows[0]);
      const lastRow = rects.slice(-lastCount);
      const firstMid = (firstRow[0].left + firstRow[firstRow.length - 1].right) / 2;
      const lastMid = (lastRow[0].left + lastRow[lastRow.length - 1].right) / 2;
      expect(lastMid).to.be.closeTo(firstMid, 2);
    }
  });
}

function openSettings() {
  visitGameplay({ harness: false });
  cy.get('#settingsBtn').click();
  cy.get('#settingsDialog').should('be.visible');
  cy.get('.settings-tabs').should('be.visible');
  cy.get('#settingsDialog h2').should('be.visible');
}

describe('Settings layout', () => {
  it('uses a compact dialog and a balanced 4 + 3 tab layout', () => {
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [1280, 720],
      [1024, 768],
      [800, 1280],
    ]) {
      cy.viewport(width, height);
      openSettings();
      expectDialogWithinViewport();
      expectTabRows([4, 3]);
      expectNoHorizontalOverflow();
      cy.get('#closeSettings').scrollIntoView();
      expectInViewport('#closeSettings');
      expectInViewport('#startNewGame');
      cy.get('#closeSettings').click();
    }
  });

  it('keeps every tab and the footer usable on a phone', () => {
    for (const [width, height] of [
      [390, 844],
      [320, 568],
    ]) {
      cy.viewport(width, height);
      openSettings();
      expectDialogWithinViewport();
      expectTabRows([2, 2, 2, 1]);
      expectNoHorizontalOverflow();
      for (const name of TABS) {
        cy.get(`.tab-button[data-tab="${name}"]`).click();
        cy.get(`.settings-panel[data-panel="${name}"]`).should('have.class', 'active');
        cy.get(`.tab-button[data-tab="${name}"]`).should('have.class', 'active');
        expectInViewport(`.tab-button[data-tab="${name}"]`);
      }
      cy.get('#companionEnabled').should('exist');
      cy.get('#companionAutoStart').should('exist');
      cy.get('#closeSettings').scrollIntoView();
      expectInViewport('#closeSettings');
      expectInViewport('#startNewGame');
    }
  });

  it('follows DOM order and keeps the active tab and companion controls', () => {
    cy.viewport(1280, 720);
    openSettings();
    cy.get('.settings-tabs .tab-button').each(($button, index) => {
      expect($button.attr('data-tab')).to.equal(TABS[index]);
      cy.wrap($button).focus();
      cy.wrap($button).should('have.focus');
    });
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
