import {
  accelerationSecondsPerMs,
  advance,
  finishAcceleratedDay,
  ignoreExternalRequests,
  seedSettings,
  startFirstDay,
  tick,
  timerSeconds,
  visitClocked,
  visitGameplay,
  visitStaleGame,
} from '../support/gameplay.js';

const COUNTDOWN_STEP_MS = 50;

function showTimer(win) {
  win.document.documentElement.classList.add('fonts-ready');
}

function finishDayOnClock() {
  timerSeconds().then((shown) => {
    const finishMs = Math.ceil(shown / accelerationSecondsPerMs(shown, 0));
    const tickMs = Math.ceil(finishMs / COUNTDOWN_STEP_MS) * COUNTDOWN_STEP_MS;
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn').click();
    cy.tick(tickMs);
  });
  cy.get('.day-display').should('have.class', 'dusk');
}

function focusAsKeyboard(selector) {
  cy.get(selector).then(($el) => {
    $el[0].focus({ focusVisible: true });
  });
}

function expectSomeFocusIndicator(selector) {
  focusAsKeyboard(selector);
  cy.get(selector).should(($el) => {
    const style = getComputedStyle($el[0]);
    const hasOutline =
      style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
    const hasRing = style.boxShadow !== 'none';
    const border = style.borderTopColor;
    const hasFocusBorder =
      border === 'rgb(76, 175, 80)' || border === 'rgb(114, 164, 242)';
    expect(
      hasOutline || hasRing || hasFocusBorder,
      `${selector} focus`
    ).to.equal(true);
  });
}

describe('Accessibility', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  afterEach(() => {
    cy.then(() =>
      Cypress.automation('remote:debugger:protocol', {
        command: 'Emulation.setEmulatedMedia',
        params: { features: [] },
      })
    );
  });

  it('keeps gameplay shortcuts off dialogs and form fields', () => {
    visitGameplay();
    cy.get('#settingsBtn').click();
    cy.get('#settingsDialog').should('be.visible');

    cy.window().then((win) => {
      const button = win.document.getElementById('closeSettings');
      const event = new win.KeyboardEvent('keydown', {
        key: ' ',
        bubbles: true,
        cancelable: true,
      });
      button.dispatchEvent(event);
      expect(event.defaultPrevented, 'Space in a dialog').to.equal(false);
    });

    cy.get('body').type(' ');
    cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');
    cy.get('#settingsDialog').should('be.visible');

    cy.get('#closeSettings').focus().type(' ');
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');

    cy.get('body').type(' ');
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    cy.get('#startBtn').should('contain', 'Wake Up');
  });

  it('does not treat playlist typing as a shortcut', () => {
    visitGameplay();
    cy.get('#settingsBtn').click();
    cy.get('button[data-tab="music"]').click();
    cy.get('#playMusic').check({ force: true });
    cy.get('#youtubePlaylist').type('airq f');
    cy.get('#youtubePlaylist').invoke('val').should('include', 'airq f');
    cy.get('#infoDialog').should('not.be.visible');
    cy.get('#settingsDialog').should('be.visible');
    cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');
    cy.window().then((win) => {
      expect(win.document.fullscreenElement).to.equal(null);
    });
  });

  it('lets Escape close a dialog without leaving fullscreen', () => {
    visitGameplay();
    cy.get('#settingsBtn').click();
    cy.get('#closeSettings').type('{esc}');
    cy.get('#settingsDialog').should('not.be.visible');

    cy.window().then((win) => {
      const doc = win.document;
      let fullscreenEl = doc.documentElement;
      Object.defineProperty(doc, 'fullscreenElement', {
        configurable: true,
        get() {
          return fullscreenEl;
        },
      });
      cy.stub(doc, 'exitFullscreen')
        .callsFake(() => {
          fullscreenEl = null;
          return Promise.resolve();
        })
        .as('exitFullscreen');
    });

    cy.get('#settingsBtn').click();
    cy.window().then((win) => {
      const event = new win.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      win.document.getElementById('closeSettings').dispatchEvent(event);
      expect(event.defaultPrevented, 'Escape while a dialog is open').to.equal(
        false
      );
    });
    cy.get('@exitFullscreen').should('not.have.been.called');
    cy.get('#settingsDialog').should('be.visible');

    cy.window().then((win) => {
      const dialog = win.document.getElementById('settingsDialog');
      dialog.dispatchEvent(new win.Event('close', { bubbles: true }));
      dialog.close();
      win.document.dispatchEvent(
        new win.KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        })
      );
    });
    cy.get('@exitFullscreen').should('not.have.been.called');
    cy.get('#settingsDialog').should('not.be.visible');

    cy.window().then((win) => {
      win.document.dispatchEvent(
        new win.KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        })
      );
    });
    cy.get('@exitFullscreen').should('have.been.calledOnce');
  });

  it('names icon controls and the wake, pause, and resume actions', () => {
    visitGameplay();
    cy.get('#settingsBtn').should('have.attr', 'aria-label', 'Settings');
    cy.get('#infoBtn').should('have.attr', 'aria-label', 'About');
    cy.get('#fullscreenBtn').should('have.attr', 'aria-label', 'Enter fullscreen');
    cy.get('#settingsBtn svg').should('have.attr', 'aria-hidden', 'true');

    cy.get('#startBtn').should('not.have.attr', 'aria-label');
    cy.get('#startBtn').should('contain', 'Wake Up');

    cy.window().then((win) => {
      const doc = win.document;
      Object.defineProperty(doc, 'fullscreenElement', {
        configurable: true,
        get: () => doc.documentElement,
      });
      doc.dispatchEvent(new Event('fullscreenchange'));
    });
    cy.get('#fullscreenBtn').should('have.attr', 'aria-label', 'Exit fullscreen');

    startFirstDay();
    cy.get('#startBtn').should('contain', 'Pause');
    cy.get('#startBtn').click();
    cy.get('#startBtn').should('contain', 'Resume');

    cy.get('button.decrement[data-input="playerCount"]').should(
      'have.attr',
      'aria-label',
      'Decrease number of players'
    );
    cy.get('button.increment[data-input="playerCount"]').should(
      'have.attr',
      'aria-label',
      'Increase number of players'
    );
    cy.get('button.decrement[data-input="travellerCount"]').should(
      'have.attr',
      'aria-label',
      'Decrease number of travellers'
    );
    cy.get('button.increment[data-input="travellerCount"]').should(
      'have.attr',
      'aria-label',
      'Increase number of travellers'
    );
    cy.get('#playerCount').should('have.attr', 'id', 'playerCount');
    cy.get('label[for="playerCount"]').should('contain', 'Number of Players');
    cy.get('label[for="autoOpenNominationsDelay"]').should(
      'contain',
      'Nominations delay'
    );
  });

  it('keeps the countdown quiet and announces dawn and dusk once', () => {
    visitGameplay();
    cy.get('.timer-display').should('have.attr', 'aria-live', 'off');
    cy.get('.timer-display').should('have.attr', 'role', 'timer');
    cy.get('#minutes').should('not.have.attr', 'aria-label');
    cy.get('#seconds').should('not.have.attr', 'aria-label');
    cy.get('#currentTime').should('not.have.attr', 'aria-label');
    cy.get('#nominationsCountdown').should('have.attr', 'aria-live', 'off');
    cy.get('#sessionCountdown').should('have.attr', 'aria-live', 'off');
    cy.get('.day-display')
      .should('have.attr', 'aria-live', 'off')
      .and('have.attr', 'aria-label')
      .and('contain', 'Day 1');
    cy.get('#minutes').should('be.visible');

    cy.get('#startBtn').click();
    cy.get('#gameStatus').should('have.text', 'Dawn, day 1');
    cy.get('.day-display').invoke('attr', 'aria-label').should('contain', 'Dawn');
    advance(1000);
    tick();
    advance(1000);
    tick();
    cy.get('#gameStatus').should('have.text', 'Dawn, day 1');

    advance(6000);
    tick();
    cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');
    cy.get('#gameStatus').should('have.text', 'Dawn, day 1');

    finishAcceleratedDay();
    cy.get('#gameStatus').should('have.text', 'Dusk, day 1');
    tick();
    cy.get('#gameStatus').should('have.text', 'Dusk, day 1');
  });

  it('announces accelerate confirmation once, then nominations opening once', () => {
    visitGameplay();
    startFirstDay();
    cy.get('#accelerateBtn').click();
    cy.get('#gameStatus').should('have.text', 'Press again to accelerate time');
    advance(1000);
    tick();
    cy.get('#gameStatus').should('have.text', 'Press again to accelerate time');

    visitClocked({
      settings: { autoOpenNominations: true, playSoundEffects: false },
      onBeforeLoad(win) {
        cy.stub(win.Math, 'random').returns(0);
      },
    });
    startFirstDay();
    finishDayOnClock();
    cy.get('#gameStatus').should('have.text', 'Dusk, day 1');
    cy.get('#nominationsCountdown').should('be.visible');
    cy.tick(59000);
    cy.get('#nominationsCountdownSeconds').should('have.text', '1');
    cy.get('#gameStatus').should('have.text', 'Dusk, day 1');
    cy.tick(1000);
    cy.get('#gameStatus').should('have.text', 'Nominations are open');
    cy.tick(3000);
    cy.get('#gameStatus').should('have.text', 'Nominations are open');
  });

  it('shows focus on dialog, form, portrait, and stale-tab controls', () => {
    visitGameplay({ settings: { playSoundEffects: true } });
    cy.get('#settingsBtn').click();
    expectSomeFocusIndicator('#closeSettings');
    expectSomeFocusIndicator('#autoOpenNominations');
    cy.get('button[data-tab="effects"]').click();
    expectSomeFocusIndicator('#soundEffectsVolume');
    focusAsKeyboard('.preview-sound[data-type="end-of-day"]');
    cy.get('.preview-sound[data-type="end-of-day"]').should(($el) => {
      const style = getComputedStyle($el[0]);
      const hasOutline =
        style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
      const hasRing = style.boxShadow.includes('rgb(76, 175, 80)');
      expect(hasOutline || hasRing, 'preview focus').to.equal(true);
    });
    cy.get('button[data-tab="shortcuts"]').click();
    expectSomeFocusIndicator('#shortcutWakeUp');
    cy.get('#closeSettings').click();

    startFirstDay();
    focusAsKeyboard('#startBtn');
    cy.get('#startBtn').should(($el) => {
      const style = getComputedStyle($el[0]);
      expect(style.outlineStyle).to.equal('none');
      expect(style.boxShadow).to.include('76, 175, 80');
    });

    focusAsKeyboard('#resetBtn');
    cy.get('#resetBtn').should(($el) => {
      const style = getComputedStyle($el[0]);
      expect(style.outlineStyle).to.equal('none');
      expect(style.boxShadow).to.include('76, 175, 80');
    });

    cy.window().then((win) => {
      win.document.getElementById('portraitWarningDialog').showModal();
    });
    expectSomeFocusIndicator('#acceptPortraitWarning');
    cy.get('#acceptPortraitWarning').click();

    visitStaleGame();
    expectSomeFocusIndicator('#staleTabDismissBtn');
    expectSomeFocusIndicator('#staleTabRefreshBtn');
  });

  it('disables music controls until music is on and marks the selected tab', () => {
    visitGameplay();
    cy.get('#settingsBtn').click();
    cy.get('button[data-tab="game"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('button[data-tab="music"]').should('have.attr', 'aria-pressed', 'false');
    cy.get('button[data-tab="music"]').click();
    cy.get('button[data-tab="music"]').should('have.attr', 'aria-pressed', 'true');
    cy.get('button[data-tab="game"]').should('have.attr', 'aria-pressed', 'false');
    cy.get('.settings-panel[data-panel="game"]').should('not.be.visible');

    cy.get('#playMusicAtNight').should('be.disabled');
    cy.get('#youtubePlaylist').should('be.disabled');
    cy.get('#musicVolume').should('be.disabled');
    cy.get('#playMusicAtNight').should('not.have.attr', 'aria-hidden');
    cy.get('#youtubePlaylist').should('not.have.attr', 'aria-hidden');
    cy.get('#useBardcorePlaylist').should('have.attr', 'tabindex', '-1');

    cy.get('#playMusic').check({ force: true });
    cy.get('#playMusicAtNight').should('not.be.disabled');
    cy.get('#youtubePlaylist').should('not.be.disabled');
    cy.get('#musicVolume').should('not.be.disabled');
    cy.get('#useBardcorePlaylist').should('not.have.attr', 'tabindex');
  });

  it('names preview sounds and keeps a player iframe out of tab order', () => {
    visitGameplay({ settings: { playSoundEffects: true } });
    cy.get('.preview-sound[data-type="end-of-day"]').should(
      'have.attr',
      'aria-label',
      'Preview end of day sound'
    );
    cy.get('.preview-sound[data-type="wake-up"]').should(
      'have.attr',
      'aria-label',
      'Preview wake up sound'
    );
    cy.get('.preview-sound[data-type="nominations-open"]').should(
      'have.attr',
      'aria-label',
      'Preview nominations open sound'
    );
    cy.get('.preview-sound svg').first().should('have.attr', 'aria-hidden', 'true');

    cy.document().then((doc) => {
      const container = doc.createElement('div');
      container.className = 'youtube-player-container';
      container.appendChild(doc.createElement('iframe'));
      doc.body.appendChild(container);
    });
    cy.get('.youtube-player-container iframe').should('have.attr', 'tabindex', '-1');
  });

  it('gives Change History a heading', () => {
    visitGameplay();
    cy.get('#infoBtn').click();
    cy.get('#viewChangelog').click();
    cy.get('#changeHistoryDialog h2').should('have.text', 'Change History');
    cy.get('#changeHistoryDialog').should('be.visible');
  });

  it('stops the current-day pulse when reduced motion is requested', () => {
    visitGameplay();
    cy.get('.clocktower-btn.current-day').should(($btn) => {
      expect(getComputedStyle($btn[0]).animationName).to.equal('pulse');
    });

    cy.then(() =>
      Cypress.automation('remote:debugger:protocol', {
        command: 'Emulation.setEmulatedMedia',
        params: {
          features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
        },
      })
    );

    cy.get('.clocktower-btn.current-day').should(($btn) => {
      expect(getComputedStyle($btn[0]).animationName).to.equal('none');
    });
  });

  it('names the music play and pause control', () => {
    ignoreExternalRequests();
    cy.intercept('GET', 'https://www.youtube.com/iframe_api*', {
      statusCode: 200,
      headers: { 'content-type': 'application/javascript' },
      body: `
        window.YT = {
          PlayerState: { PLAYING: 1, PAUSED: 2, CUED: 5, ENDED: 0 },
          Player: function (id, config) {
            const host = document.getElementById(id);
            const iframe = document.createElement('iframe');
            host.replaceWith(iframe);
            this.getIframe = () => iframe;
            this.setVolume = () => {};
            this.cuePlaylist = () => {};
            this.playVideo = () => {};
            this.pauseVideo = () => {};
            this.getPlayerState = () => window.YT.PlayerState.PAUSED;
            config.events.onReady({ target: this });
          }
        };
        window.onYouTubeIframeAPIReady();
      `,
    });

    cy.visit('/', {
      onBeforeLoad(win) {
        showTimer(win);
        seedSettings(win, { playMusic: false, playSoundEffects: false });
      },
    });
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('#settingsBtn').click();
    cy.get('button[data-tab="music"]').click();
    cy.get('#playMusic').check({ force: true });
    cy.get('.youtube-control').should('have.attr', 'aria-label', 'Play music');
    cy.get('#closeSettings').click();
    cy.get('.youtube-player-container iframe').should('have.attr', 'tabindex', '-1');
    cy.get('.youtube-control').click();
    cy.get('.youtube-control').should('have.attr', 'aria-label', 'Pause music');
  });
});
