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

function expectWallpaper(filename) {
  cy.get('body').should(($body) => {
    const style = getComputedStyle($body[0], '::before');
    expect(style.backgroundImage, 'wallpaper').to.include(filename);
    expect(style.backgroundSize, 'wallpaper size').to.eq('cover');
    expect(style.backgroundPosition, 'wallpaper position').to.eq('50% 50%');
    expect(style.opacity, 'wallpaper opacity').to.eq('0.15');
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
    visitGameplay({ settings: { backgroundTheme: 'gothic-city' } });
  });

  it('uses the night sky at night and the saved wallpaper by day, including while paused', () => {
    cy.get('body').should('not.have.class', 'game--night');
    expectWallpaper(SAVED_WALLPAPER);
    expectSavedTheme('gothic-city');

    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    cy.get('#settingsDialog').should('not.be.visible');

    cy.get('body').should('have.class', 'game--night');
    expectWallpaper(NIGHT_WALLPAPER);
    expectSavedTheme('gothic-city');
    expectTimer(0);
    cy.get('.day-display > span').first().should('have.text', '1');

    cy.viewport(390, 844);
    expectWallpaper(NIGHT_WALLPAPER);
    cy.viewport(1280, 800);

    cy.get('#settingsBtn').click();
    cy.get('#settingsDialog').should('be.visible');
    cy.get('body').should('have.class', 'game--night');
    expectWallpaper(SAVED_WALLPAPER);
    expectTimer(0);

    cy.get('.tab-button[data-tab="display"]').click();
    cy.get('#backgroundTheme').select('tower-in-forest');
    expectWallpaper(NEXT_WALLPAPER);
    cy.get('body').should('have.class', 'game--night');
    expectSavedTheme('tower-in-forest');

    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('body').should('have.class', 'game--night');
    expectWallpaper(NIGHT_WALLPAPER);
    expectSavedTheme('tower-in-forest');
    expectTimer(0);

    startFirstDay();
    cy.get('body').should('not.have.class', 'game--night');
    expectWallpaper(NEXT_WALLPAPER);

    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
    cy.get('body').should('not.have.class', 'game--night');
    expectWallpaper(NEXT_WALLPAPER);
  });

  it('keeps the night sky through dusk and wake-up, then restores the saved wallpaper', () => {
    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    startFirstDay();
    expectWallpaper(SAVED_WALLPAPER);

    cy.get('#settingsBtn').click();
    expectWallpaper(SAVED_WALLPAPER);
    cy.get('#closeSettings').click();
    cy.get('body').should('not.have.class', 'game--night');
    expectWallpaper(SAVED_WALLPAPER);

    finishAcceleratedDay();
    cy.get('body').should('have.class', 'game--night');
    expectWallpaper(NIGHT_WALLPAPER);
    expectSavedTheme('gothic-city');

    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    expectWallpaper(NIGHT_WALLPAPER);
    cy.get('body').should('have.class', 'game--night');

    advance(6000);
    tick();
    cy.get('.day-display > span').first().should('have.text', '2');
    cy.get('body').should('not.have.class', 'game--night');
    expectWallpaper(SAVED_WALLPAPER);
    expectSavedTheme('gothic-city');
  });

  it('restores the night sky when Settings is dismissed with Escape', () => {
    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    expectWallpaper(NIGHT_WALLPAPER);

    cy.get('#settingsBtn').click();
    expectWallpaper(SAVED_WALLPAPER);
    cy.get('#closeSettings').type('{esc}');
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('body').should('have.class', 'game--night');
    expectWallpaper(NIGHT_WALLPAPER);
    expectSavedTheme('gothic-city');
    expectTimer(0);
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
  });
});
