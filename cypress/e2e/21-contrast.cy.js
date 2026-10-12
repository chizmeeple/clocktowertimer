import {
  advance,
  completeWakeUp,
  finishAcceleratedDay,
  tick,
  visitGameplay,
} from '../support/gameplay.js';
import {
  composite,
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
});
