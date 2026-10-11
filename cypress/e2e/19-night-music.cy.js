import {
  finishAcceleratedDay,
  startFirstDay,
  visitGameplay,
} from '../support/gameplay.js';

function installFakeYoutube(win) {
  const calls = [];
  win.YT = {
    Player: function FakePlayer() {
      this.pauseVideo = () => {
        calls.push('pause');
      };
      this.playVideo = () => {
        calls.push('play');
      };
      this.cuePlaylist = () => {};
      this.setVolume = () => {};
      this.setShuffle = () => {};
      this.playVideoAt = () => {};
      this.getPlayerState = () => win.YT.PlayerState.PLAYING;
      this.getVideoData = () => ({ title: 'Test track' });
      this.destroy = () => {};
    },
    PlayerState: {
      UNSTARTED: -1,
      ENDED: 0,
      PLAYING: 1,
      PAUSED: 2,
      BUFFERING: 3,
      CUED: 5,
    },
  };
  win.__ytCalls = calls;
}

function visitWithMusic(playMusicAtNight) {
  visitGameplay({
    settings: {
      playMusic: true,
      playMusicAtNight,
      playSoundEffects: true,
    },
    onBeforeLoad: installFakeYoutube,
  });
  cy.window().then((win) => {
    win.onYouTubeIframeAPIReady();
  });
  cy.get('.youtube-control').should('exist');
}

function pauseCount() {
  return cy.window().then((win) => {
    return win.__ytCalls.filter((call) => call === 'pause').length;
  });
}

describe('Night music', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  it('keeps music playing when the day ends and Play Music at Night is on', () => {
    visitWithMusic(true);
    startFirstDay();
    pauseCount().should('eq', 0);

    finishAcceleratedDay();
    pauseCount().should('eq', 0);
  });

  it('pauses music when the day ends and Play Music at Night is off', () => {
    visitWithMusic(false);
    startFirstDay();
    pauseCount().should('eq', 0);

    finishAcceleratedDay();
    pauseCount().should('be.greaterThan', 0);
  });
});
