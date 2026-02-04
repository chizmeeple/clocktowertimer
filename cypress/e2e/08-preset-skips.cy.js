describe('Preset skips and accelerate behaviour', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('keeps all days while hiding only appropriate skipped presets', () => {
    // Load page
    cy.visit('/');

    // Settings dialog open on first load
    cy.get('#settingsDialog').should('be.visible');

    // Game settings: 12 players
    cy.get('#playerCount').clear().type('12');

    // Turn OFF effects (trigger change so playSoundEffects is updated before save)
    cy.get('.tab-button[data-tab="effects"]').click();
    cy.get('#playSoundEffects').uncheck().trigger('change');

    // Turn OFF music (trigger change so playMusic is updated before save)
    cy.get('.tab-button[data-tab="music"]').click();
    cy.get('#playMusic').uncheck().trigger('change');

    // Start new game
    cy.get('#startNewGame').click();
    cy.get('#settingsDialog').should('not.be.visible');

    // Capture the initial set of visible day labels (Day 1..Day N for this player count)
    let initialDayLabels = [];
    cy.get('#clocktowerPresets .clocktower-btn:visible .day').then(($spans) => {
      const labels = Array.from($spans, (el) => el.textContent.trim());
      initialDayLabels = labels.filter((t) => t.startsWith('Day '));
      expect(initialDayLabels.length).to.be.greaterThan(0);
    });

    // Helper: assert visible day labels stay the same set as at the start
    const expectSameDaySet = () => {
      cy.get('#clocktowerPresets .clocktower-btn:visible .day').then(
        ($spans) => {
          const labels = Array.from($spans, (el) => el.textContent.trim());
          const dayLabels = labels.filter((t) => t.startsWith('Day '));
          expect(dayLabels).to.deep.equal(initialDayLabels);
        }
      );
    };

    // Initially we should have a stable set of Day presets
    expectSameDaySet();

    // Select the Day 4 preset while on Day 1
    cy.contains('#clocktowerPresets .clocktower-btn .day', 'Day 4')
      .closest('button')
      .click();

    // First three presets visible and marked as skipped (💀)
    cy.get('#clocktowerPresets .clocktower-btn')
      .filter(':visible')
      .eq(0)
      .should('have.class', 'skipped-day');
    cy.get('#clocktowerPresets .clocktower-btn')
      .filter(':visible')
      .eq(1)
      .should('have.class', 'skipped-day');
    cy.get('#clocktowerPresets .clocktower-btn')
      .filter(':visible')
      .eq(2)
      .should('have.class', 'skipped-day');

    // Still have the same visible day presets
    expectSameDaySet();

    // Day 4 preset click already started the timer; accelerate is enabled
    // Use Accelerate Time (click then confirm)
    cy.get('#accelerateBtn', { timeout: 20000 }).should('not.be.disabled');
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn').click();

    // Wait for accelerated day to complete (Wake Up active again)
    cy.contains('#startBtn .button-text', '⏰ Wake Up!', {
      timeout: 20000,
    }).should('be.visible');

    // After day end: no visible skipped presets, same Day set
    cy.get('#clocktowerPresets .clocktower-btn.skipped-day:visible').should(
      'have.length',
      0
    );
    expectSameDaySet();

    // In dusk with Wake Up active, click Day 4 for the next day
    cy.contains('#clocktowerPresets .clocktower-btn .day', 'Day 4')
      .closest('button')
      .click();

    // Now on Day 2: pattern Day 1, 💀, 💀, Day 2, Day 3..Day 9
    cy.get('#clocktowerPresets .clocktower-btn')
      .filter(':visible')
      .then(($btns) => {
        const labels = Array.from($btns, (btn) =>
          btn.querySelector('.day').textContent.trim()
        );
        const classes = Array.from($btns, (btn) => btn.className);

        expect(labels[0]).to.equal('Day 1');
        expect(classes[1]).to.include('skipped-day');
        expect(classes[2]).to.include('skipped-day');
        expect(labels[3]).to.equal('Day 2');
        // The remaining visible day labels should still include all later days
        const remainingDays = labels
          .slice(3)
          .filter((t) => t.startsWith('Day '))
          .map((t) => Number(t.replace('Day ', '')));
        expect(remainingDays).to.include.members([3, 4, 5, 6, 7, 8, 9]);
      });

    // Day 4 preset click already started the timer; accelerate is enabled
    cy.get('#accelerateBtn', { timeout: 20000 }).should('not.be.disabled');
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn').click();

    cy.contains('#startBtn .button-text', '⏰ Wake Up!', {
      timeout: 20000,
    }).should('be.visible');

    // After second day end: no skulls, same Day set
    cy.get('#clocktowerPresets .clocktower-btn.skipped-day:visible').should(
      'have.length',
      0
    );
    expectSameDaySet();

    // In dusk again, click Day 4 for the next day
    cy.contains('#clocktowerPresets .clocktower-btn .day', 'Day 4')
      .closest('button')
      .click();

    // Now on Day 3: Day 1, Day 2, 💀, Day 3..Day 9
    cy.get('#clocktowerPresets .clocktower-btn')
      .filter(':visible')
      .then(($btns) => {
        const labels = Array.from($btns, (btn) =>
          btn.querySelector('.day').textContent.trim()
        );
        const classes = Array.from($btns, (btn) => btn.className);

        expect(labels[0]).to.equal('Day 1');
        expect(labels[1]).to.equal('Day 2');
        expect(classes[2]).to.include('skipped-day');
        expect(labels[3]).to.equal('Day 3');
        const remainingDays = labels
          .slice(3)
          .filter((t) => t.startsWith('Day '));
        expect(remainingDays.length).to.be.greaterThan(0);
      });

    // Day 4 preset click already started the timer; accelerate is enabled
    cy.get('#accelerateBtn', { timeout: 20000 }).should('not.be.disabled');
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn').click();

    cy.contains('#startBtn .button-text', '⏰ Wake Up!', {
      timeout: 20000,
    }).should('be.visible');

    // After third day end: no skulls, same Day set
    cy.get('#clocktowerPresets .clocktower-btn.skipped-day:visible').should(
      'have.length',
      0
    );
    expectSameDaySet();
  });
});
