import {
  advance,
  expectTimer,
  finishAcceleratedDay,
  startFirstDay,
  tick,
  visitGameplay,
} from '../support/gameplay.js';

const NIGHT_WALLPAPER = 'night-sky.jpg';
const SAVED_WALLPAPER = 'gothic-city.png';
const NEXT_WALLPAPER = 'tower-in-forest.png';

function setReducedMotion(reduce) {
  cy.then(() =>
    Cypress.automation('remote:debugger:protocol', {
      command: 'Emulation.setEmulatedMedia',
      params: {
        features: [
          {
            name: 'prefers-reduced-motion',
            value: reduce ? 'reduce' : 'no-preference',
          },
        ],
      },
    })
  );
}

function expectDayLayer(filename) {
  cy.get('body').should(($body) => {
    const style = getComputedStyle($body[0], '::before');
    expect(style.backgroundImage, 'day wallpaper').to.include(filename);
    expect(style.backgroundSize, 'day wallpaper size').to.eq('cover');
    expect(style.backgroundPosition, 'day wallpaper position').to.eq('50% 50%');
    expect(style.opacity, 'day wallpaper opacity').to.eq('0.15');
  });
}

function expectNightLayer(visible) {
  cy.get('body').should('have.class', 'wallpaper-ready');
  cy.get('.night-wallpaper').should(($layer) => {
    const style = getComputedStyle($layer[0]);
    expect(style.backgroundImage, 'night wallpaper').to.include(NIGHT_WALLPAPER);
    expect(style.opacity, 'night wallpaper opacity').to.eq(visible ? '1' : '0');
    expect(style.pointerEvents, 'night wallpaper pointer events').to.eq('none');
    expect(style.backgroundSize, 'night wallpaper size').to.eq('cover, cover');
    expect(style.backgroundPosition, 'night wallpaper position').to.eq(
      '50% 50%, 50% 50%'
    );
    expect(style.transitionProperty, 'crossfade property').to.eq('opacity');
    expect(style.transitionDuration, 'crossfade duration').to.eq('0.6s');
    expect(style.transitionTimingFunction, 'crossfade easing').to.eq(
      'ease-in-out'
    );
  });
}

function expectSavedTheme(theme) {
  cy.get('body').should('have.attr', 'data-theme', theme);
  cy.window().then((win) => {
    const settings = JSON.parse(win.localStorage.getItem('towerTimerSettings'));
    expect(settings.backgroundTheme).to.eq(theme);
  });
}

describe('Night wallpaper', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
    cy.viewport(1280, 800);
    setReducedMotion(false);
    visitGameplay({ settings: { backgroundTheme: 'gothic-city' } });
  });

  it('uses the night sky at night and the saved wallpaper by day, including while paused', () => {
    cy.get('body').should('not.have.class', 'game--night');
    expectDayLayer(SAVED_WALLPAPER);
    expectNightLayer(false);
    expectSavedTheme('gothic-city');

    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    cy.get('#settingsDialog').should('not.be.visible');

    cy.get('body').should('have.class', 'game--night');
    expectNightLayer(true);
    expectDayLayer(SAVED_WALLPAPER);
    expectSavedTheme('gothic-city');
    expectTimer(0);
    cy.get('.day-display > span').first().should('have.text', '1');

    cy.viewport(390, 844);
    expectNightLayer(true);
    expectDayLayer(SAVED_WALLPAPER);
    cy.viewport(1280, 800);

    cy.get('#settingsBtn').click();
    cy.get('#settingsDialog').should('be.visible');
    cy.get('body').should('have.class', 'game--night');
    expectNightLayer(false);
    expectDayLayer(SAVED_WALLPAPER);
    expectTimer(0);

    cy.get('.tab-button[data-tab="display"]').click();
    cy.get('#backgroundTheme').select('tower-in-forest');
    expectDayLayer(NEXT_WALLPAPER);
    expectNightLayer(false);
    cy.get('body').should('have.class', 'game--night');
    expectSavedTheme('tower-in-forest');

    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('body').should('have.class', 'game--night');
    expectNightLayer(true);
    expectDayLayer(NEXT_WALLPAPER);
    expectSavedTheme('tower-in-forest');
    expectTimer(0);

    startFirstDay();
    cy.get('body').should('not.have.class', 'game--night');
    expectNightLayer(false);
    expectDayLayer(NEXT_WALLPAPER);

    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
    cy.get('body').should('not.have.class', 'game--night');
    expectNightLayer(false);
    expectDayLayer(NEXT_WALLPAPER);
  });

  it('keeps the night sky through dusk and wake-up, then restores the saved wallpaper', () => {
    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    startFirstDay();
    expectNightLayer(false);
    expectDayLayer(SAVED_WALLPAPER);

    cy.get('#settingsBtn').click();
    expectNightLayer(false);
    expectDayLayer(SAVED_WALLPAPER);
    cy.get('#closeSettings').click();
    cy.get('body').should('not.have.class', 'game--night');
    expectNightLayer(false);
    expectDayLayer(SAVED_WALLPAPER);

    finishAcceleratedDay();
    cy.get('body').should('have.class', 'game--night');
    expectNightLayer(true);
    expectDayLayer(SAVED_WALLPAPER);
    expectSavedTheme('gothic-city');

    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    expectNightLayer(true);
    cy.get('body').should('have.class', 'game--night');

    advance(6000);
    tick();
    cy.get('.day-display > span').first().should('have.text', '2');
    cy.get('body').should('not.have.class', 'game--night');
    expectNightLayer(false);
    expectDayLayer(SAVED_WALLPAPER);
    expectSavedTheme('gothic-city');
  });

  it('restores the night sky when Settings is dismissed with Escape', () => {
    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    expectNightLayer(true);

    cy.get('#settingsBtn').click();
    expectNightLayer(false);
    expectDayLayer(SAVED_WALLPAPER);
    cy.get('#closeSettings').type('{esc}');
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('body').should('have.class', 'game--night');
    expectNightLayer(true);
    expectSavedTheme('gothic-city');
    expectTimer(0);
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
  });

  it('shows a restored night immediately and follows the latest Settings state', () => {
    cy.clearLocalStorage();
    visitGameplay({
      settings: { backgroundTheme: 'gothic-city', dayState: 'dusk' },
    });
    cy.get('.day-display').should('have.class', 'dusk');
    cy.get('.night-wallpaper').should(($layer) => {
      expect(getComputedStyle($layer[0]).opacity).to.eq('1');
      const running = $layer[0]
        .getAnimations()
        .filter((animation) => animation.playState === 'running');
      expect(running, 'crossfade on load').to.have.length(0);
    });
    expectDayLayer(SAVED_WALLPAPER);

    cy.get('#settingsBtn').click();
    cy.get('#closeSettings').click();
    cy.get('body').should('have.class', 'game--night');
    expectNightLayer(true);
    expectDayLayer(SAVED_WALLPAPER);
    expectTimer(0);
  });

  it('drops the crossfade when reduced motion is requested', () => {
    setReducedMotion(true);
    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    cy.get('.night-wallpaper').should(($layer) => {
      const style = getComputedStyle($layer[0]);
      expect(style.opacity).to.eq('1');
      expect(style.transitionProperty).to.eq('none');
    });
    cy.get('body').should('have.class', 'game--night');
    expectDayLayer(SAVED_WALLPAPER);
    setReducedMotion(false);
  });
});
