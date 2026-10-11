const STORAGE_KEY = 'towerTimerSettings';
const DEFAULT_PLAYLIST =
  'https://www.youtube.com/watch?v=TInSYXP9ZB8&list=PLhCDyBm6z1NwkkOAyQAMQkeberU9rwMcc';

const VALID_SETTINGS = {
  playerCount: 12,
  travellerCount: 2,
  currentDay: 2,
  usedPresetByDay: { 1: 3 },
  hiddenPresetDays: [1],
  currentPace: 'speedy',
  playMusic: false,
  playMusicAtNight: true,
  playSoundEffects: false,
  soundEffectsVolume: 0,
  keepDisplayOn: false,
  showPlayerCountQr: true,
  showCurrentTime: false,
  clockFormat: '12',
  showSessionCountdown: true,
  sessionEndHour: 0,
  sessionEndMinute: 45,
  youtubeVolume: 0,
  youtubePlaylistUrl:
    'https://www.youtube.com/watch?v=1oCIZjPxthY&list=PLhCDyBm6z1NyrifTlGYj55uPb6xrlgBih',
  backgroundTheme: 'gothic-city',
  dayState: '',
  endOfDaySound: 'bell-and-crows-v2.mp3',
  wakeUpSoundFile: 'rooster-v2.mp3',
  nominationsOpenSoundFile: 'nominations-open-russell.mp3',
  autoOpenNominations: true,
  autoOpenNominationsDelay: 30,
  acceptedPortraitWarning: true,
  keyboardShortcuts: {
    settings: 'q',
    wakeUp: 'w',
    reset: 'r',
    accelerate: 'a',
    fullscreen: 'f',
    info: '',
  },
  futureFlag: false,
  customLabel: '',
};

function visitWithStoredSettings(raw) {
  cy.visit('/', {
    onBeforeLoad(win) {
      win.localStorage.setItem(
        STORAGE_KEY,
        typeof raw === 'string' ? raw : JSON.stringify(raw)
      );
    },
  });
}

function readStoredSettings() {
  return cy.window().then((win) => {
    const raw = win.localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : JSON.parse(raw);
  });
}

function openSettings() {
  cy.get('#settingsBtn').click();
  cy.get('#settingsDialog').should('be.visible');
}

describe('Settings persistence', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('initialises from defaults when nothing has been saved', () => {
    cy.visit('/');

    cy.get('#settingsDialog').should('be.visible');
    cy.get('#playerCount').should('have.value', '10');
    cy.get('#travellerCount').should('have.value', '0');
    cy.get('#gamePace').should('have.value', 'normal');
    cy.get('#playSoundEffects').should('be.checked');
    cy.get('#playMusic').should('not.be.checked');
    cy.get('#showCurrentTime').should('be.checked');
    cy.get('#clockFormat24').should('be.checked');
    cy.get('#showSessionCountdown').should('not.be.checked');

    cy.window().then((win) => {
      expect(win.localStorage.getItem(STORAGE_KEY)).to.eq(null);
    });

    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('.day-display span').should('have.text', '1');
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');

    readStoredSettings().then((settings) => {
      expect(settings.playerCount).to.eq(10);
      expect(settings.travellerCount).to.eq(0);
      expect(settings.currentPace).to.eq('normal');
      expect(settings.playSoundEffects).to.eq(true);
      expect(settings.playMusic).to.eq(false);
    });
  });

  it('restores valid saved preferences', () => {
    visitWithStoredSettings(VALID_SETTINGS);

    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('body')
      .should('have.attr', 'data-theme', 'gothic-city')
      .and('have.attr', 'data-pace', 'speedy');
    cy.get('.day-display span').should('have.text', '2');
    cy.get('.day-display .pace-indicator').should('contain', 'Speedy');
    cy.get('#currentTime').should('not.be.visible');
    cy.get('#sessionCountdown').should('be.visible');
    cy.get('#travellerDisplay').should('have.class', 'visible');
    cy.get('#travellerAmount').should('have.text', '2');
    cy.get('#playerCountQrWrapper').should('have.class', 'visible');

    openSettings();
    cy.get('#playerCount').should('have.value', '12');
    cy.get('#travellerCount').should('have.value', '2');
    cy.get('#gamePace').should('have.value', 'speedy');
    cy.get('#autoOpenNominations').should('be.checked');
    cy.get('#autoOpenNominationsDelay').should('have.value', '30');

    cy.get('.tab-button[data-tab="display"]').click();
    cy.get('#keepDisplayOn').should('not.be.checked');
    cy.get('#showPlayerCountQr').should('be.checked');
    cy.get('#backgroundTheme').should('have.value', 'gothic-city');

    cy.get('.tab-button[data-tab="time"]').click();
    cy.get('#showCurrentTime').should('not.be.checked');
    cy.get('#clockFormat12').should('be.checked');
    cy.get('#showSessionCountdown').should('be.checked');
    cy.get('#sessionEndHour').should('have.value', '0');
    cy.get('#sessionEndMinute').should('have.value', '45');

    cy.get('.tab-button[data-tab="effects"]').click();
    cy.get('#playSoundEffects').should('not.be.checked');
    cy.get('#soundEffectsVolume').should('have.value', '0');
    cy.get('#endOfDaySound').should('have.value', 'bell-and-crows-v2.mp3');
    cy.get('#wakeUpSound').should('have.value', 'rooster-v2.mp3');
    cy.get('#nominationsOpenSound').should(
      'have.value',
      'nominations-open-russell.mp3'
    );

    cy.get('.tab-button[data-tab="music"]').click();
    cy.get('#playMusic').should('not.be.checked');
    cy.get('#playMusicAtNight').should('be.checked');
    cy.get('#musicVolume').should('have.value', '0');
    cy.get('#youtubePlaylist').should(
      'have.value',
      VALID_SETTINGS.youtubePlaylistUrl
    );

    cy.get('.tab-button[data-tab="shortcuts"]').click();
    cy.get('#shortcutWakeUp').should('have.value', 'w');
    cy.get('#shortcutInfo').should('have.value', '');

    readStoredSettings().then((settings) => {
      expect(settings.playerCount).to.eq(12);
      expect(settings.youtubeVolume).to.eq(0);
      expect(settings.soundEffectsVolume).to.eq(0);
      expect(settings.playSoundEffects).to.eq(false);
      expect(settings.futureFlag).to.eq(false);
      expect(settings.customLabel).to.eq('');
      expect(settings.keyboardShortcuts.info).to.eq('');
      expect(settings.lastSeenVersion).to.match(/^\d+\.\d+\.\d+$/);
    });
  });

  it('initialises from defaults when saved JSON is malformed', () => {
    const corrupt = '{"playerCount":12,';
    visitWithStoredSettings(corrupt);

    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('.day-display span').should('have.text', '1');
    cy.get('.day-display .pace-indicator').should('contain', 'Normal');
    cy.get('#playerCount').should('have.value', '10');
    cy.get('#gamePace').should('have.value', 'normal');
    cy.get('#startBtn').should('not.be.disabled');

    cy.window().then((win) => {
      expect(win.localStorage.getItem(STORAGE_KEY)).to.eq(corrupt);
    });
  });

  it('initialises from defaults when saved JSON contains a non-finite number', () => {
    const corrupt = '{"playerCount":12,"youtubeVolume":NaN}';
    visitWithStoredSettings(corrupt);

    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('#playerCount').should('have.value', '10');
    cy.get('#musicVolume').should('have.value', '15');
    cy.window().then((win) => {
      expect(win.localStorage.getItem(STORAGE_KEY)).to.eq(corrupt);
    });
  });

  ['null', '"settings"', '[1,2,3]', '42', 'true'].forEach((raw) => {
    it(`initialises from defaults when saved settings are ${raw}`, () => {
      visitWithStoredSettings(raw);

      cy.get('#settingsDialog').should('not.be.visible');
      cy.get('#playerCount').should('have.value', '10');
      cy.get('#travellerCount').should('have.value', '0');
      cy.get('#gamePace').should('have.value', 'normal');
      cy.get('.day-display span').should('have.text', '1');
      cy.window().then((win) => {
        expect(win.localStorage.getItem(STORAGE_KEY)).to.eq(raw);
      });
    });
  });

  it('fills defaults for settings that were not saved', () => {
    visitWithStoredSettings({
      playerCount: 8,
      travellerCount: 0,
    });

    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('.day-display span').should('have.text', '1');
    cy.get('#currentTime').should('be.visible');
    cy.get('#sessionCountdown').should('not.be.visible');

    openSettings();
    cy.get('#playerCount').should('have.value', '8');
    cy.get('#travellerCount').should('have.value', '0');
    cy.get('#gamePace').should('have.value', 'normal');
    cy.get('#showCurrentTime').should('be.checked');
    cy.get('#clockFormat24').should('be.checked');
    cy.get('#showSessionCountdown').should('not.be.checked');
    cy.get('#musicVolume').should('have.value', '15');
    cy.get('#soundEffectsVolume').should('have.value', '75');
  });

  it('rejects values with the wrong type and keeps valid neighbours', () => {
    visitWithStoredSettings({
      playerCount: '12',
      travellerCount: 2,
      playMusic: 'true',
      playSoundEffects: 0,
      showCurrentTime: 1,
      currentPace: 1,
      clockFormat: 12,
      backgroundTheme: 'gothic-city',
      youtubeVolume: '0',
      soundEffectsVolume: false,
      keyboardShortcuts: ['q'],
      hiddenPresetDays: '1,2',
      usedPresetByDay: [],
      youtubePlaylistUrl: 'javascript:alert(1)',
      endOfDaySound: '../secret.mp3',
      autoOpenNominationsDelay: '30',
      sessionEndMinute: '15',
    });

    cy.get('body').should('have.attr', 'data-theme', 'gothic-city');
    cy.get('body').should('have.attr', 'data-pace', 'normal');
    cy.get('#travellerAmount').should('have.text', '2');
    cy.get('#currentTime').should('be.visible');
    cy.get('#youtubePlaylist').should('have.value', DEFAULT_PLAYLIST);
    cy.get('#endOfDaySound').should('have.value', 'cathedral-bell-v2.mp3');

    openSettings();
    cy.get('#playerCount').should('have.value', '10');
    cy.get('#travellerCount').should('have.value', '2');
    cy.get('#gamePace').should('have.value', 'normal');
    cy.get('#playMusic').should('not.be.checked');
    cy.get('#playSoundEffects').should('be.checked');
    cy.get('#clockFormat24').should('be.checked');
    cy.get('#musicVolume').should('have.value', '15');
    cy.get('#soundEffectsVolume').should('have.value', '75');
    cy.get('#autoOpenNominationsDelay').should('have.value', '60');
    cy.get('#sessionEndMinute').should('have.value', '0');
    cy.get('.tab-button[data-tab="shortcuts"]').click();
    cy.get('#shortcutWakeUp').should('have.value', 'Space');
  });

  it('clamps out-of-range counts and volumes and rejects impossible times', () => {
    visitWithStoredSettings({
      playerCount: 4,
      travellerCount: 9,
      youtubeVolume: 140,
      soundEffectsVolume: -5,
      sessionEndHour: -1,
      sessionEndMinute: 75,
      currentDay: 250,
    });

    cy.get('.day-display span').should('have.text', '1');
    openSettings();
    cy.get('#playerCount').should('have.value', '5');
    cy.get('#travellerCount').should('have.value', '5');
    cy.get('#musicVolume').should('have.value', '100');
    cy.get('#soundEffectsVolume').should('have.value', '0');
    cy.get('#sessionEndHour').should('have.value', '23');
    cy.get('#sessionEndMinute').should('have.value', '0');
  });

  it('keeps valid preferences when other saved fields are invalid', () => {
    visitWithStoredSettings({
      playerCount: 12,
      travellerCount: 0,
      currentDay: 4,
      currentPace: 'not-a-pace',
      youtubeVolume: 0,
      soundEffectsVolume: 0,
      playSoundEffects: false,
      playMusic: false,
      showCurrentTime: false,
      clockFormat: '12',
      sessionEndHour: 99,
      sessionEndMinute: 15,
      backgroundTheme: 'nope',
      keepDisplayOn: false,
      futureFlag: false,
      hiddenPresetDays: [1, 'nope', 2, 500],
      usedPresetByDay: { 1: 2, bad: 'x', 2: 3.5, 4: 4 },
      endOfDaySound: 'nope.mp3',
      youtubePlaylistUrl: 'not a url',
    });

    cy.get('.day-display span').should('have.text', '4');
    cy.get('.day-display .pace-indicator').should('contain', 'Normal');
    cy.get('#currentTime').should('not.be.visible');
    cy.get('body').should('have.attr', 'data-theme', 'medieval-cartoon');
    cy.get('#youtubePlaylist').should('have.value', DEFAULT_PLAYLIST);
    cy.get('#endOfDaySound').should('have.value', 'cathedral-bell-v2.mp3');

    openSettings();
    cy.get('#playerCount').should('have.value', '12');
    cy.get('#travellerCount').should('have.value', '0');
    cy.get('#keepDisplayOn').should('not.be.checked');
    cy.get('#playSoundEffects').should('not.be.checked');
    cy.get('#soundEffectsVolume').should('have.value', '0');
    cy.get('#musicVolume').should('have.value', '0');
    cy.get('#clockFormat12').should('be.checked');
    cy.get('#sessionEndHour').should('have.value', '23');
    cy.get('#sessionEndMinute').should('have.value', '15');

    readStoredSettings().then((settings) => {
      expect(settings.playerCount).to.eq(12);
      expect(settings.travellerCount).to.eq(0);
      expect(settings.currentPace).to.eq('normal');
      expect(settings.youtubeVolume).to.eq(0);
      expect(settings.playSoundEffects).to.eq(false);
      expect(settings.futureFlag).to.eq(false);
      expect(settings.hiddenPresetDays).to.deep.eq([1, 2]);
      expect(settings.usedPresetByDay).to.deep.eq({ 1: 2, 4: 4 });
    });
  });

  it('keeps older saves and fills settings that were added later', () => {
    visitWithStoredSettings({
      playerCount: 9,
      travellerCount: 0,
      currentPace: 'relaxed',
      currentDay: 2,
      dayOnePresetIndex: 1,
      endOfDaySound: 'single-church-bell.mp3',
      keyboardShortcuts: {
        settings: 'q',
        wakeup: 'w',
        reset: 'r',
        fullscreen: 'f',
        info: 'i',
      },
    });

    cy.get('.day-display span').should('have.text', '2');
    cy.get('.day-display .pace-indicator').should('contain', 'Relaxed');
    cy.get('#currentTime').should('be.visible');
    cy.get('#sessionCountdown').should('not.be.visible');
    cy.get('#endOfDaySound').should('have.value', 'single-church-bell-v2.mp3');

    openSettings();
    cy.get('#playerCount').should('have.value', '9');
    cy.get('#gamePace').should('have.value', 'relaxed');
    cy.get('#showCurrentTime').should('be.checked');
    cy.get('#showSessionCountdown').should('not.be.checked');
    cy.get('.tab-button[data-tab="shortcuts"]').click();
    cy.get('#shortcutWakeUp').should('have.value', 'w');
    cy.get('#shortcutAccelerate').should('have.value', 'a');

    readStoredSettings().then((settings) => {
      expect(settings.dayOnePresetIndex).to.eq(1);
      expect(settings.usedPresetByDay).to.deep.eq({ 1: 1, 2: 2 });
      expect(settings.keyboardShortcuts.wakeUp).to.eq('w');
      expect(settings.keyboardShortcuts).to.not.have.property('wakeup');
      expect(settings.endOfDaySound).to.eq('single-church-bell-v2.mp3');
    });
  });

  it('stays usable when storage access fails', () => {
    cy.visit('/', {
      onBeforeLoad(win) {
        const unavailable = new DOMException(
          'storage unavailable',
          'SecurityError'
        );
        cy.stub(win.localStorage, 'getItem').throws(unavailable);
        cy.stub(win.localStorage, 'setItem').throws(unavailable);
        cy.stub(win.localStorage, 'removeItem').throws(unavailable);
      },
    });

    cy.get('#settingsDialog').should('be.visible');
    cy.get('#playerCount').should('have.value', '10');
    cy.get('#gamePace').should('have.value', 'normal');
    cy.get('#closeSettings').click();
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('#startBtn').should('not.be.disabled');
    cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
  });

  it('saves settings and restores them after a reload', () => {
    cy.visit('/');
    cy.get('#settingsDialog').should('be.visible');
    cy.get('button.increment[data-input="playerCount"]').click();
    cy.get('button.increment[data-input="playerCount"]').click();
    cy.get('button.increment[data-input="playerCount"]').click();
    cy.get('#playerCount').should('have.value', '13');
    cy.get('#gamePace').select('blitz');
    cy.get('#closeSettings').click();

    cy.reload();
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('.day-display .pace-indicator').should('contain', 'Blitz');
    openSettings();
    cy.get('#playerCount').should('have.value', '13');
    cy.get('#gamePace').should('have.value', 'blitz');

    readStoredSettings().then((settings) => {
      expect(settings.playerCount).to.eq(13);
      expect(settings.currentPace).to.eq('blitz');
    });
  });
});
