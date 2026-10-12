import {
  advance,
  completeWakeUp,
  finishAcceleratedDay,
  tick,
  visitGameplay,
} from '../support/gameplay.js';
import {
  composite,
  contrastOf,
  contrastRatio,
  isLargeText,
  parseColor,
} from '../../test/contrast.mjs';

function renderedContrast(el) {
  const view = el.ownerDocument.defaultView;
  const style = view.getComputedStyle(el);
  const text = parseColor(style.color);
  text[3] *= Number(style.opacity) || 1;

  const layers = [];
  let node = el;
  while (node) {
    const nodeStyle = view.getComputedStyle(node);
    const background = parseColor(nodeStyle.backgroundColor);
    background[3] *= Number(nodeStyle.opacity) || 1;
    layers.push(background);
    if (background[3] >= 0.999) break;
    node = node.parentElement;
  }

  let background = [26, 26, 26, 1];
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    background = composite(layers[index], background);
  }
  return contrastRatio(composite(text, background), background);
}

function expectContrast(selector, minimum, { maximum, large = false } = {}) {
  cy.get(selector).first().should(($el) => {
    const el = $el[0];
    const ratio = renderedContrast(el);
    expect(ratio, `${selector} contrast`).to.be.at.least(minimum);
    if (maximum !== undefined) {
      expect(ratio, `${selector} stayed bright`).to.be.below(maximum);
    }
    if (large) {
      const style = el.ownerDocument.defaultView.getComputedStyle(el);
      expect(
        isLargeText(style.fontSize, style.fontWeight),
        `${selector} is large text`
      ).to.equal(true);
    }
  });
}

describe('Colour contrast', () => {
  const settings = { travellerCount: 2, playerCount: 10 };

  it('keeps readable text in the normal theme', () => {
    visitGameplay({ settings });
    expectContrast('#startBtn', 3, { maximum: 4, large: true });
    expectContrast('#characterCounts .character-type:nth-child(1) .label', 4.5);
    expectContrast('#characterCounts .character-type:nth-child(3) .label', 4.5);
    expectContrast('#travellerDisplay .label', 4.5);
    expectContrast('#travellerAmount', 3, { large: true });
    expectContrast('#clocktowerPresets .day', 4.5);

    cy.get('#settingsBtn').click();
    expectContrast('.setting-group h3', 4.5);
    expectContrast('#startNewGame', 4.5);
    expectContrast('.tab-button.active', 4.5);
    cy.get('#closeSettings').click();

    cy.get('#startBtn').click();
    cy.get('.day-display').should('have.class', 'dawn');
    expectContrast('.day-display.dawn .pace-indicator', 4.5);
    expectContrast('.day-display.dawn > span', 3, { large: true });
    advance(6000);
    tick();
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    expectContrast('#startBtn', 3, { maximum: 4, large: true });
    expectContrast('#clocktowerPresets button.active .time', 4.5);
    expectContrast('#clocktowerPresets button.active .day', 4.5);
    expectContrast('#clocktowerPresets button:not(.active) .day', 4.5);
  });

  it('keeps readable text in Blitz mode', () => {
    visitGameplay({ settings: { ...settings, currentPace: 'blitz' } });
    expectContrast('#startBtn', 3, { maximum: 4.5, large: true });

    cy.get('#settingsBtn').click();
    expectContrast('.setting-group h3', 4.5);
    expectContrast('#startNewGame', 4.5);
    expectContrast('.tab-button.active', 4.5);
    cy.get('#closeSettings').click();

    completeWakeUp();
    expectContrast('#clocktowerPresets button.active .time', 4.5);
    expectContrast('#clocktowerPresets button.active .day', 4.5);
    finishAcceleratedDay();
    expectContrast('.day-display.dusk .pace-indicator', 4.5);
    expectContrast('#startBtn', 3, { maximum: 4.5, large: true });
  });

  it('keeps night text readable without fading Wake Up or the player counts', () => {
    visitGameplay({ settings });
    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    cy.get('body').should('have.class', 'game--night');

    expectContrast('.timer-display .time', 3, { large: true });
    expectContrast('#startBtn', 3, { maximum: 4, large: true });
    expectContrast('#characterCounts .character-type:nth-child(1) .label', 4.5);
    expectContrast('#characterCounts .character-type:nth-child(3) .label', 4.5);
    expectContrast('.day-display > span', 3, { large: true });
    expectContrast('.day-display .pace-indicator', 4.5);
    expectContrast('#currentTime', 4.5);
    expectContrast('#clocktowerPresets .clocktower-btn:not(.active) .time', 4.5);
    expectContrast('#clocktowerPresets .clocktower-btn:not(.active) .day', 4.5);
    cy.get('.day-display').should(($el) => {
      const header = $el[0].ownerDocument.defaultView.getComputedStyle(
        $el[0],
        '::before'
      );
      expect(
        contrastOf(header.color, header.backgroundColor),
        'day header contrast'
      ).to.be.at.least(4.5);
    });

    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    cy.get('body').should('have.class', 'game--night');
    expectContrast('.timer-display .time', 3, { large: true });
    cy.get('.timer-display').should(($el) => {
      const view = $el[0].ownerDocument.defaultView;
      const label = view.getComputedStyle($el[0], '::before');
      const ratio = contrastRatio(
        composite(parseColor(label.color), [26, 26, 26, 1]),
        [26, 26, 26, 1]
      );
      expect(ratio, 'wake-up label contrast').to.be.at.least(4.5);
    });
    expectContrast('.day-display.dawn > span', 3, { large: true });
    expectContrast('.day-display.dawn .pace-indicator', 4.5);
  });
});
