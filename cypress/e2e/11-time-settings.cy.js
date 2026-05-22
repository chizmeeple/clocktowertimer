const SAVED_TIME_SETTINGS = {
  playerCount: 10,
  travellerCount: 0,
  showCurrentTime: false,
  showSessionCountdown: true,
  sessionEndHour: 22,
  sessionEndMinute: 30,
  clockFormat: '12',
};

function openTimeTab() {
  cy.get('.tab-button[data-tab="time"]').click();
  cy.get('.settings-panel[data-panel="time"]').should('have.class', 'active');
}

function openSettingsToTimeTab() {
  cy.visit('/');
  cy.get('#settingsDialog').should('be.visible');
  openTimeTab();
}

function closeSettings() {
  cy.get('#closeSettings').click();
  cy.get('#settingsDialog').should('not.be.visible');
}

function reopenSettingsToTimeTab() {
  cy.get('#settingsBtn').click();
  cy.get('#settingsDialog').should('be.visible');
  openTimeTab();
}

describe('Time settings', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('shows the Time tab with sensible defaults', () => {
    openSettingsToTimeTab();

    cy.get('#showCurrentTime').should('be.checked');
    cy.get('#clockFormat24').should('be.checked');
    cy.get('#clockFormat12').should('not.be.checked');
    cy.get('#showSessionCountdown').should('not.be.checked');
    cy.get('#sessionEndHour').should('be.disabled');
    cy.get('#sessionEndMinute').should('be.disabled');
    cy.get('#sessionEndHour').should('have.value', '23');
    cy.get('#sessionEndMinute').should('have.value', '0');
  });

  it('hides the clock display when Show current time is turned off', () => {
    openSettingsToTimeTab();
    closeSettings();
    cy.get('#currentTime').should('be.visible');

    reopenSettingsToTimeTab();
    cy.get('#showCurrentTime').uncheck().trigger('change');
    closeSettings();

    cy.get('#currentTime').should('not.be.visible');
  });

  it('disables clock format options when Show current time is off', () => {
    openSettingsToTimeTab();

    cy.get('#showCurrentTime').uncheck().trigger('change');
    cy.get('#clockFormat24').should('be.disabled');
    cy.get('#clockFormat12').should('be.disabled');
    cy.get('label:has(#clockFormat24)').should('have.class', 'inactive');
  });

  it('displays the current time in 24-hour format', () => {
    cy.visit('/');
    cy.get('#closeSettings').click();
    cy.clock(new Date('2026-05-22T15:06:00'));
    cy.tick(1000);

    cy.get('#currentTime').should('be.visible').and('contain', '15:06');
  });

  it('displays the current time in 12-hour format', () => {
    openSettingsToTimeTab();
    cy.get('#clockFormat12').check().trigger('change');
    closeSettings();

    cy.clock(new Date('2026-05-22T15:06:00'));
    cy.tick(1000);

    cy.get('#currentTime')
      .should('be.visible')
      .invoke('text')
      .should('match', /3:06\s*PM/i);
  });

  it('enables session end time when session countdown is turned on', () => {
    openSettingsToTimeTab();

    cy.get('#showSessionCountdown').check().trigger('change');
    cy.get('#sessionEndHour').should('not.be.disabled');
    cy.get('#sessionEndMinute').should('not.be.disabled');
    cy.get('#sessionEndTimeLabel').should('not.have.class', 'inactive');
  });

  it('shows the session countdown when enabled', () => {
    openSettingsToTimeTab();
    cy.get('#showSessionCountdown').check().trigger('change');
    closeSettings();

    cy.clock(new Date('2026-05-22T20:00:00'));
    reopenSettingsToTimeTab();
    cy.get('#sessionEndHour').select('23');
    cy.get('#sessionEndMinute').select('0');
    closeSettings();

    cy.get('#sessionCountdown')
      .should('be.visible')
      .and('contain', '3 hours remaining');
  });

  it('updates the session countdown when the end time changes', () => {
    openSettingsToTimeTab();
    cy.get('#showSessionCountdown').check().trigger('change');
    cy.get('#sessionEndHour').select('23');
    cy.get('#sessionEndMinute').select('0');
    closeSettings();

    cy.clock(new Date('2026-05-22T20:00:00'));
    reopenSettingsToTimeTab();
    cy.get('#sessionEndHour').select('23');
    closeSettings();
    cy.get('#sessionCountdown').should('contain', '3 hours remaining');

    reopenSettingsToTimeTab();
    cy.get('#sessionEndHour').select('22');
    closeSettings();
    cy.get('#sessionCountdown').should('contain', '2 hours remaining');
  });

  it('shows minutes remaining in the final hour', () => {
    openSettingsToTimeTab();
    cy.get('#showSessionCountdown').check().trigger('change');
    closeSettings();

    cy.clock(new Date('2026-05-22T22:15:00'));
    reopenSettingsToTimeTab();
    cy.get('#sessionEndHour').select('23');
    cy.get('#sessionEndMinute').select('0');
    closeSettings();

    cy.get('#sessionCountdown')
      .should('be.visible')
      .and('contain', '45 minutes remaining')
      .and('have.class', 'final-hour');
  });

  it('shows TIME\'S UP! after the session end time has passed', () => {
    openSettingsToTimeTab();
    cy.get('#showSessionCountdown').check().trigger('change');
    closeSettings();

    cy.clock(new Date('2026-05-22T23:30:00'));
    reopenSettingsToTimeTab();
    cy.get('#sessionEndHour').select('23');
    cy.get('#sessionEndMinute').select('0');
    closeSettings();

    cy.get('#sessionCountdown')
      .should('be.visible')
      .and('contain', "TIME'S UP!")
      .and('have.class', 'times-up');
  });

  it('hides the session countdown when it is turned off', () => {
    openSettingsToTimeTab();
    cy.get('#showSessionCountdown').check().trigger('change');
    closeSettings();
    cy.get('#sessionCountdown').should('be.visible');

    reopenSettingsToTimeTab();
    cy.get('#showSessionCountdown').uncheck().trigger('change');
    closeSettings();

    cy.get('#sessionCountdown').should('not.be.visible');
  });

  it('persists time settings in localStorage', () => {
    openSettingsToTimeTab();
    cy.get('#clockFormat12').check().trigger('change');
    cy.get('#showSessionCountdown').check().trigger('change');
    cy.get('#sessionEndHour').select('22');
    cy.get('#sessionEndMinute').select('30');
    cy.get('#showCurrentTime').uncheck().trigger('change');

    cy.window().then((win) => {
      const settings = JSON.parse(
        win.localStorage.getItem('quickTimerSettings')
      );
      expect(settings.showCurrentTime).to.eq(false);
      expect(settings.showSessionCountdown).to.eq(true);
      expect(settings.sessionEndHour).to.eq(22);
      expect(settings.sessionEndMinute).to.eq(30);
      expect(settings.clockFormat).to.eq('12');
    });
  });

  it('restores saved time settings after reload', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        win.localStorage.setItem(
          'quickTimerSettings',
          JSON.stringify(SAVED_TIME_SETTINGS)
        );
      },
    });

    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('#currentTime').should('not.be.visible');
    cy.get('#sessionCountdown').should('be.visible');

    cy.get('#settingsBtn').click();
    openTimeTab();

    cy.get('#showCurrentTime').should('not.be.checked');
    cy.get('#showSessionCountdown').should('be.checked');
    cy.get('#sessionEndHour').should('have.value', '22');
    cy.get('#sessionEndMinute').should('have.value', '30');
    cy.get('#clockFormat12').should('be.checked');
  });
});
