import { validateCompanionState } from '../../companionState.js';
import {
  advance,
  expectTimer,
  startFirstDay,
  tick,
  timerSeconds,
  visitGameplay,
} from '../support/gameplay.js';

function visit() {
  visitGameplay({
    onBeforeLoad(win) {
      win.__unhandledRejections = [];
      win.addEventListener('unhandledrejection', (event) => {
        win.__unhandledRejections.push(event.reason);
      });
    },
  });
}

function companionModule() {
  return cy.window().then((win) => {
    if (win.__companionPublishing) return win.__companionPublishing;
    // The page forbids eval, so a module script loads the same instance the
    // timer already imported. The hook exists only in this test.
    const script = win.document.createElement('script');
    script.type = 'module';
    script.textContent =
      "import * as publishing from './companionPublish.js'; globalThis.__companionPublishing = publishing;";
    win.document.head.appendChild(script);
    const started = Date.now();
    return new win.Promise((resolve, reject) => {
      const check = () => {
        if (win.__companionPublishing) {
          resolve(win.__companionPublishing);
          return;
        }
        if (Date.now() - started > 2000) {
          reject(new Error('The companion publishing module did not load'));
          return;
        }
        win.setTimeout(check, 10);
      };
      check();
    });
  });
}

function remember(snapshot, win) {
  win.__companionSnapshots.push(structuredClone(snapshot));
}

function enableRecorder() {
  return companionModule().then((mod) => {
    return cy.window().then((win) => {
      win.__companionSnapshots = [];
      mod.enableCompanionPublishing((snapshot) => remember(snapshot, win));
      return mod;
    });
  });
}

function snapshots() {
  return cy.window().its('__companionSnapshots');
}

function lastSnapshot() {
  return snapshots().then((list) => {
    expect(list.length).to.be.greaterThan(0);
    return list.at(-1);
  });
}

describe('Companion publishing', () => {
  beforeEach(() => {
    cy.clearLocalStorage();
  });

  afterEach(() => {
    cy.window().then((win) => {
      for (const snapshot of win.__companionSnapshots ?? []) {
        const result = validateCompanionState(snapshot);
        expect(result.ok, result.reason).to.equal(true);
      }
    });
  });

  it('stays disabled until a publisher is enabled', () => {
    visit();
    companionModule().then((mod) => {
      return cy.window().then((win) => {
        expect(mod.isCompanionPublishingEnabled()).to.equal(false);
        expect(win.__elapsed.heartbeatCount()).to.equal(0);
        mod.publishCompanionSnapshot();
        win.__companionSnapshots = [];
        mod.enableCompanionPublishing((snapshot) => remember(snapshot, win));
      });
    });

    snapshots().should('have.length', 1);
    lastSnapshot().should((shot) => {
      expect(shot.phase).to.equal('idle');
      expect(shot.day).to.equal(1);
      expect(shot.timer).to.deep.equal({
        status: 'idle',
        kind: null,
        remainingMs: 0,
        rate: 0,
      });
      expect(shot.counts).to.deep.equal({
        townsfolk: 7,
        outsider: 0,
        minion: 2,
        demon: 1,
        traveller: 0,
      });
    });
    cy.window().its('__elapsed').invoke('heartbeatCount').should('equal', 1);
  });

  it('publishes a new game as day 1 waiting to start', () => {
    visit();
    enableRecorder();
    cy.get('#settingsBtn').click();
    cy.get('#startNewGame').click();
    cy.get('#settingsDialog').should('not.be.visible');
    cy.get('.day-display > span').first().should('have.text', '1');

    lastSnapshot().should((shot) => {
      expect(shot.phase).to.equal('pregame');
      expect(shot.day).to.equal(1);
      expect(shot.timer.status).to.equal('idle');
      expect(shot.timer.remainingMs).to.equal(0);
      expect(shot.counts.traveller).to.equal(0);
    });
  });

  it('publishes Wake Up and then the day that follows it', () => {
    visit();
    enableRecorder();
    cy.get('#startBtn').click();
    cy.get('.timer-display').should('have.class', 'wake-up-countdown');
    cy.get('.day-display').should('have.class', 'dawn');

    lastSnapshot().should((shot) => {
      expect(shot.phase).to.equal('wake');
      expect(shot.timer.status).to.equal('running');
      expect(shot.timer.kind).to.equal('wake');
      expect(shot.timer.remainingMs).to.equal(6000);
      expect(shot.timer.rate).to.equal(1);
    });

    advance(6000);
    tick();
    cy.get('.timer-display').should('not.have.class', 'wake-up-countdown');
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');

    snapshots().should((list) => {
      const wake = list.at(-2);
      const day = list.at(-1);
      expect(wake.phase).to.equal('wake');
      expect(wake.timer.remainingMs).to.equal(6000);
      expect(day.phase).to.equal('day');
      expect(day.day).to.equal(1);
      expect(day.timer.status).to.equal('running');
      expect(day.timer.kind).to.equal('day');
      expect(day.timer.rate).to.equal(1);
      expect(day.timer.remainingMs).to.be.greaterThan(6000);
    });
  });

  it('publishes pause, resume, and reset from the running day', () => {
    visit();
    enableRecorder();
    startFirstDay();
    lastSnapshot().should((shot) => {
      expect(shot.phase).to.equal('day');
      expect(shot.timer.status).to.equal('running');
      expect(shot.timer.kind).to.equal('day');
      expect(shot.timer.rate).to.equal(1);
    });

    timerSeconds().then((dayLength) => {
      advance(2500);
      cy.get('#startBtn').click();
      cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');

      lastSnapshot().should((shot) => {
        expect(shot.phase).to.equal('day');
        expect(shot.timer.status).to.equal('paused');
        expect(shot.timer.kind).to.equal(null);
        expect(shot.timer.rate).to.equal(0);
        expect(shot.timer.remainingMs).to.equal(dayLength * 1000 - 2500);
      });

      advance(10000);
      tick();
      expectTimer(dayLength - 2);
      snapshots().then((beforeResume) => {
        const pausedCount = beforeResume.length;
        cy.get('#startBtn').click();
        cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
        lastSnapshot().should((shot) => {
          expect(shot.timer.status).to.equal('running');
          expect(shot.timer.kind).to.equal('day');
          expect(shot.timer.rate).to.equal(1);
          expect(shot.timer.remainingMs).to.equal(dayLength * 1000 - 2500);
        });
        snapshots().should('have.length', pausedCount + 1);

        cy.get('#resetBtn').click();
        cy.get('#startBtn .button-text').should('have.text', '⏰ Wake Up!');
        lastSnapshot().should((shot) => {
          expect(shot.phase).to.equal('day');
          expect(shot.timer.status).to.equal('ready');
          expect(shot.timer.rate).to.equal(0);
          expect(shot.timer.remainingMs).to.equal(dayLength * 1000);
        });
        expectTimer(dayLength);
      });
    });
  });

  it('publishes the engine acceleration rate and night only after dusk', () => {
    visit();
    enableRecorder();
    startFirstDay();
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn').click();
    cy.get('#accelerateBtn .button-text').should('have.text', 'Time flies…');

    lastSnapshot().then((shot) => {
      const timeLeft = shot.timer.remainingMs / 1000;
      const completionTime = 3000;
      const intervals = Math.min(timeLeft, Math.floor(completionTime / 50));
      const timePerTick = Math.ceil(timeLeft / intervals);
      const rate = (timePerTick * 1000) / 50;

      expect(shot.phase).to.equal('day');
      expect(shot.timer.status).to.equal('running');
      expect(shot.timer.kind).to.equal('day');
      expect(shot.timer.rate).to.equal(rate);
      expect(shot.timer.rate).to.be.greaterThan(1);

      const finishMs = shot.timer.remainingMs / shot.timer.rate;
      advance(finishMs);
      snapshots().then((beforeEnd) => {
        expect(beforeEnd.at(-1).phase).to.equal('day');
        tick();
        cy.get('.day-display').should('have.class', 'dusk');
        expectTimer(0);
        lastSnapshot().should((night) => {
          expect(night.phase).to.equal('night');
          expect(night.timer.status).to.equal('finished');
          expect(night.timer.remainingMs).to.equal(0);
          expect(night.timer.rate).to.equal(0);
          expect(night.day).to.equal(shot.day);
        });
        snapshots().should('have.length', beforeEnd.length + 1);
      });
    });
  });

  it('publishes live counts without changing the other four when travellers change', () => {
    visit();
    enableRecorder();
    startFirstDay();

    lastSnapshot().then((started) => {
      advance(2500);
      cy.get('#settingsBtn').click();
      cy.get('button.increment[data-input="playerCount"]').click();
      cy.get('#playerCount').should('have.value', '11');

      lastSnapshot().should((shot) => {
        expect(shot.timer.status).to.equal('running');
        expect(shot.timer.remainingMs).to.equal(started.timer.remainingMs - 2500);
        expect(shot.counts).to.deep.equal({
          townsfolk: 7,
          outsider: 1,
          minion: 2,
          demon: 1,
          traveller: 0,
        });
      });

      advance(1000);
      cy.get('button.increment[data-input="travellerCount"]').click();
      cy.get('#travellerCount').should('have.value', '1');
      cy.get('#closeSettings').click();

      lastSnapshot().should((shot) => {
        expect(shot.counts.townsfolk).to.equal(7);
        expect(shot.counts.outsider).to.equal(1);
        expect(shot.counts.minion).to.equal(2);
        expect(shot.counts.demon).to.equal(1);
        expect(shot.counts.traveller).to.equal(1);
        expect(shot.timer.remainingMs).to.equal(started.timer.remainingMs - 3500);
      });
      cy.get('#townsfolkAmount').should('have.text', '7');
      cy.get('#outsiderAmount').should('have.text', '1');
      cy.get('#travellerAmount').should('have.text', '1');
    });
  });

  it('heartbeats only while enabled and display ticks do not publish', () => {
    visit();
    enableRecorder();
    startFirstDay();

    snapshots().then((list) => {
      const beforeTicks = list.length;
      const running = list.at(-1);
      tick();
      tick();
      tick();
      tick();
      tick();
      snapshots().should('have.length', beforeTicks);

      advance(3000);
      cy.window().then((win) => {
        win.__elapsed.heartbeat();
      });
      lastSnapshot().should((shot) => {
        expect(shot.phase).to.equal('day');
        expect(shot.timer.status).to.equal('running');
        expect(shot.timer.remainingMs).to.equal(running.timer.remainingMs - 3000);
      });
      snapshots().should('have.length', beforeTicks + 1);
    });

    companionModule().then((mod) => {
      return cy.window().then((win) => {
        const before = win.__companionSnapshots.length;
        mod.disableCompanionPublishing();
        expect(mod.isCompanionPublishingEnabled()).to.equal(false);
        expect(win.__elapsed.heartbeatCount()).to.equal(0);
        win.__elapsed.heartbeat();
        expect(win.__companionSnapshots).to.have.length(before);

        mod.enableCompanionPublishing((snapshot) => remember(snapshot, win));
        expect(win.__elapsed.heartbeatCount()).to.equal(1);
        expect(win.__companionSnapshots).to.have.length(before + 1);
      });
    });
  });

  it('keeps playing when the publisher throws', () => {
    visit();
    companionModule().then((mod) => {
      return cy.window().then((win) => {
        win.__companionSnapshots = [];
        mod.enableCompanionPublishing((snapshot) => {
          remember(snapshot, win);
          throw new Error('publisher failed');
        });
      });
    });

    startFirstDay();
    timerSeconds().then((dayLength) => {
      advance(1000);
      tick();
      expectTimer(dayLength - 1);
      cy.get('#startBtn').click();
      cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
    });
    cy.window().its('__unhandledRejections').should('have.length', 0);
  });

  it('keeps playing when the publisher rejects', () => {
    visit();
    companionModule().then((mod) => {
      return cy.window().then((win) => {
        win.__companionSnapshots = [];
        mod.enableCompanionPublishing((snapshot) => {
          remember(snapshot, win);
          return Promise.reject(new Error('publisher rejected'));
        });
        return new win.Promise((resolve) => win.setTimeout(resolve, 0));
      });
    });

    cy.window().its('__unhandledRejections').should('have.length', 0);
    startFirstDay();
    cy.get('#startBtn .button-text').should('have.text', '⏸️ Pause Day');
    cy.get('#startBtn').click();
    cy.get('#startBtn .button-text').should('have.text', '▶️ Resume Day');
    cy.window().its('__unhandledRejections').should('have.length', 0);
  });
});
