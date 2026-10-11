import {
  advance,
  expectTimer,
  finishAcceleratedDay,
  startFirstDay,
  tick,
  timerSeconds,
  visitClocked,
  visitGameplay,
} from '../support/gameplay.js';

describe('Timer interactions', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('restores the full day when reset while paused and does not keep counting', () => {
    visitGameplay();
    startFirstDay();

    cy.get('#clocktowerPresets .clocktower-btn')
      .first()
      .then(($btn) => {
        const dayLength =
          Number($btn.attr('data-minutes')) * 60 +
          Number($btn.attr('data-seconds'));

        advance(4000);
        tick();
        expectTimer(dayLength - 4);

        cy.get('#startBtn').click();
        cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
        cy.get('#resetBtn').click();

        cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
        cy.get('#resetBtn').should('be.disabled');
        cy.get('#accelerateBtn').should('be.disabled');
        cy.get('.day-display').should('not.have.class', 'dusk');
        expectTimer(dayLength);

        advance(10000);
        tick();
        expectTimer(dayLength);
      });
  });

  it('replaces a running countdown when a later day preset is chosen', () => {
    visitGameplay();
    startFirstDay();

    timerSeconds().then((dayLength) => {
      advance(3000);
      tick();
      expectTimer(dayLength - 3);

      cy.get('#clocktowerPresets .clocktower-btn')
        .eq(1)
        .then(($btn) => {
          const replacement =
            Number($btn.attr('data-minutes')) * 60 +
            Number($btn.attr('data-seconds'));

          cy.wrap($btn).click();
          cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
          cy.get('.clocktower-btn').eq(0).should('have.class', 'skipped-day');
          expectTimer(replacement);

          advance(1000);
          tick();
          expectTimer(replacement - 1);
        });
    });
  });

  it('keeps a running countdown when the player and traveller counts change', () => {
    visitGameplay();
    startFirstDay();

    timerSeconds().then((dayLength) => {
      advance(2000);
      tick();
      expectTimer(dayLength - 2);

      cy.get('#settingsBtn').click();
      cy.get('button.increment[data-input="playerCount"]').click();
      cy.get('button.increment[data-input="playerCount"]').click();
      cy.get('#playerCount').should('have.value', '12');
      cy.get('button.increment[data-input="travellerCount"]').click();
      cy.get('#travellerCount').should('have.value', '1');
      cy.get('#closeSettings').click();

      cy.get('#townsfolkAmount').should('have.text', '7');
      cy.get('#outsiderAmount').should('have.text', '2');
      cy.get('#minionAmount').should('have.text', '2');
      cy.get('#demonAmount').should('have.text', '1');
      cy.get('#travellerDisplay').should('have.class', 'visible');
      cy.get('#travellerAmount').should('have.text', '1');
      cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
      expectTimer(dayLength - 2);

      advance(3000);
      tick();
      expectTimer(dayLength - 5);
    });
  });

  it('registers the pace change handler once', () => {
    visitGameplay({
      onBeforeLoad(win) {
        let paceListeners = 0;
        const original = win.EventTarget.prototype.addEventListener;
        cy.stub(win.EventTarget.prototype, 'addEventListener').callsFake(
          function (type, listener, options) {
            if (this?.id === 'gamePace' && type === 'change') {
              paceListeners += 1;
            }
            return original.call(this, type, listener, options);
          }
        );
        win.__paceListenerCount = () => paceListeners;
      },
    });

    cy.window().should((win) => {
      expect(win.__paceListenerCount()).to.eq(1);
    });

    cy.get('#settingsBtn').click();
    cy.get('#gamePace').select('speedy');
    cy.get('#closeSettings').click();
    cy.get('.pace-indicator').should('contain', 'Speedy');
    cy.window().should((win) => {
      expect(win.__paceListenerCount()).to.eq(1);
    });
  });

  it('does not jump a running countdown when the pace changes', () => {
    visitGameplay();
    startFirstDay();

    timerSeconds().then((dayLength) => {
      advance(2000);
      tick();
      expectTimer(dayLength - 2);

      cy.get('#settingsBtn').click();
      cy.get('#gamePace').select('speedy');
      cy.get('#closeSettings').click();

      cy.get('.pace-indicator').should('contain', 'Speedy');
      cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
      expectTimer(dayLength - 2);

      advance(2000);
      tick();
      expectTimer(dayLength - 4);
    });
  });

  it('follows wake, pause, accelerate, and reset from the keyboard', () => {
    visitGameplay();

    cy.get('body').type(' ');
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    cy.get('#startBtn').should('be.disabled');
    advance(6000);
    tick();
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    cy.get('.day-display > span').first().should('have.text', '1');

    timerSeconds().then((dayLength) => {
      cy.get('body').type('q');
      cy.get('#settingsDialog').should('be.visible');
      cy.get('body').type(' ');
      cy.get('#closeSettings').click();
      cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');

      cy.get('body').type(' ');
      cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
      cy.get('body').type('a');
      cy.get('#accelerateBtn .button-text').should(
        'have.text',
        '⏩ Accelerate Time'
      );
      advance(4000);
      tick();
      expectTimer(dayLength);

      cy.get('body').type(' ');
      cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
      cy.get('body').type('a');
      cy.get('body').type('a');
      cy.get('#accelerateBtn .button-text').should('have.text', 'Time flies…');

      cy.get('body').type('r');
      cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
      cy.get('#resetBtn').should('be.disabled');
      cy.get('#accelerateBtn .button-text').should(
        'have.text',
        '⏩ Accelerate Time'
      );
      expectTimer(dayLength);

      advance(8000);
      tick();
      expectTimer(dayLength);
      cy.get('.day-display').should('not.have.class', 'dusk');
    });
  });

  it('cancels an unconfirmed acceleration and still accelerates on the next confirmation', () => {
    visitClocked();
    startFirstDay();

    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn .button-text').should('have.text', 'Confirm…');
    cy.tick(4999);
    cy.get('#accelerateBtn .button-text').should('have.text', 'Confirm…');
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');

    cy.tick(1);
    cy.get('#accelerateBtn .button-text').should(
      'have.text',
      '⏩ Accelerate Time'
    );
    cy.get('.day-display').should('not.have.class', 'dusk');
    cy.get('#minutes').invoke('text').should('not.eq', '00');

    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn .button-text').should('have.text', 'Time flies…');
    cy.tick(12000);
    cy.get('.day-display').should('have.class', 'dusk');
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
  });

  it('clears the clock and disables Reset Day when a new game starts', () => {
    visitGameplay();
    startFirstDay();
    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();

    expectTimer(0);
    cy.get('#resetBtn').should('be.disabled');
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    cy.get('.day-display > span').first().should('have.text', '1');
  });

  it('cancels a wake-up countdown when a new game starts', () => {
    visitGameplay();
    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    advance(1000);
    tick();
    expectTimer(5);

    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();

    cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');
    cy.get('.day-display').should('not.have.class', 'dawn');
    expectTimer(0);
    cy.get('#resetBtn').should('be.disabled');
    cy.get('#startBtn').should('not.be.disabled');
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
    cy.get('.day-display > span').first().should('have.text', '1');

    advance(6000);
    tick();
    expectTimer(0);
  });

  it('keeps dusk when settings are closed, so the next wake-up advances the day', () => {
    visitGameplay();
    startFirstDay();
    finishAcceleratedDay();

    cy.get('#settingsBtn').click();
    cy.get('#closeSettings').click();

    cy.get('.day-display').should('have.class', 'dusk');
    cy.get('.day-display > span').first().should('have.text', '1');

    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    advance(6000);
    tick();
    cy.get('.day-display > span').first().should('have.text', '2');
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
  });

  it('keeps dusk when the pace changes, so the next wake-up advances the day', () => {
    visitGameplay();
    startFirstDay();
    finishAcceleratedDay();

    cy.get('#settingsBtn').click();
    cy.get('#gamePace').select('speedy');
    cy.get('#closeSettings').click();

    cy.get('.day-display').should('have.class', 'dusk');
    cy.get('.pace-indicator').should('contain', 'Speedy');
    cy.get('.day-display > span').first().should('have.text', '1');

    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    advance(6000);
    tick();
    cy.get('.day-display > span').first().should('have.text', '2');
    cy.get('.pace-indicator').should('contain', 'Speedy');
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
  });

  it('keeps the wake-up countdown running when its shortcut is pressed', () => {
    visitGameplay();
    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    cy.get('.day-display').should('have.class', 'dawn');

    advance(1000);
    tick();
    expectTimer(5);

    cy.get('body').type(' ');
    advance(5000);
    tick();

    cy.get('.day-display').should('not.have.class', 'dusk');
    cy.get('.day-display > span').first().should('have.text', '1');
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');
    cy.get('#minutes').invoke('text').should('not.eq', '00');
  });
});
