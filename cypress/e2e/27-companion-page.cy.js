const counts = { townsfolk: 7, outsider: 0, minion: 2, demon: 1, traveller: 0 };

function view(overrides) {
  return {
    connection: 'live',
    fresh: true,
    stale: false,
    phase: 'day',
    day: 1,
    counts,
    timerStatus: 'running',
    rate: 1,
    kind: 'day',
    problem: null,
    displaySeconds: 285,
    locallyComplete: false,
    confirmedComplete: false,
    rev: 1,
    code: 'ABC123',
    established: true,
    ...overrides,
  };
}

function show(overrides) {
  cy.window().its('__companionTest').invoke('show', view(overrides));
}

function expectNoHorizontalScroll() {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth).to.be.at.most(doc.documentElement.clientWidth + 1);
  });
}

function expectOnFirstScreen(selector) {
  cy.get(selector).should(($el) => {
    const rect = $el[0].getBoundingClientRect();
    const view = $el[0].ownerDocument.defaultView;
    expect(rect.width, `${selector} width`).to.be.greaterThan(8);
    expect(rect.height, `${selector} height`).to.be.greaterThan(8);
    expect(rect.top, `${selector} top`).to.be.at.least(-1);
    expect(rect.left, `${selector} left`).to.be.at.least(-1);
    expect(rect.bottom, `${selector} bottom`).to.be.at.most(view.innerHeight + 1);
    expect(rect.right, `${selector} right`).to.be.at.most(view.innerWidth + 1);
  });
}

function expectCompanionShell() {
  cy.title().should('eq', 'Companion · Tower Timer');
  cy.get('#joinForm').should('be.visible');
  cy.get('link[href*="css/companion.css"]').should(($link) => {
    expect($link[0].sheet, 'companion stylesheet').to.not.equal(null);
    expect($link[0].sheet.cssRules.length).to.be.greaterThan(0);
  });
  cy.get('script[src*="js/companion-page.js"]').should('exist');
  cy.window().its('__companionTest.show').should('be.a', 'function');
}

describe('Companion page', () => {
  ['/c', '/c/', '/c/index.html'].forEach((path) => {
    it(`loads at ${path} with its stylesheet and script`, () => {
      cy.visit(path);
      expectCompanionShell();
      cy.get('link[rel="stylesheet"], script[src]').then(($nodes) => {
        const urls = [...$nodes]
          .map((node) => node.href || node.src)
          .filter((url) => url.startsWith(Cypress.config('baseUrl')));
        expect(urls.some((url) => url.includes('/css/companion.css'))).to.equal(true);
        expect(urls.some((url) => url.includes('/js/companion-page.js'))).to.equal(true);
        for (const url of urls) {
          cy.request(url).its('status').should('eq', 200);
        }
      });
    });
  });

  it('keeps a direct session code on /c', () => {
    cy.visit('/c?code=ABC123');
    cy.location('pathname').should('match', /^\/c\/?$/);
    cy.location('search').should('eq', '?code=ABC123');
    cy.get('#code').should('have.value', 'ABC123');
    cy.get('#session').should('be.visible');
    cy.get('#status').invoke('text').should('match', /Joining|Offline/);
  });

  it('joins from the address, rejects a bad code, and can leave', () => {
    cy.visit('/c?code=not-a-code');
    cy.get('#codeError').should('be.visible').and('contain', 'not valid');
    cy.get('#session').should('not.be.visible');

    cy.visit('/c?code=ab-c1o2');
    cy.get('#code').should('have.value', 'ABC102');
    cy.get('#session').should('be.visible');
    cy.get('#status').invoke('text').should('match', /Joining|Offline/);
    cy.get('#leave').click();
    cy.get('#joinPanel').should('be.visible');
    cy.location('search').should('eq', '');

    cy.get('#code').type('xyz');
    cy.get('#joinForm').submit();
    cy.get('#codeError').should('be.visible');
  });

  it('renders the public countdown and all five counts', () => {
    cy.visit('/c');
    show({});
    cy.get('#headline').should('have.text', '04:45');
    cy.get('#kicker').should('have.text', 'Day 1');
    cy.get('#townsfolk').should('have.text', '7');
    cy.get('#outsider').should('have.text', '0');
    cy.get('#minion').should('have.text', '2');
    cy.get('#demon').should('have.text', '1');
    cy.get('#traveller').should('have.text', '0');
    cy.get('.character-type').eq(0).should('have.css', 'background-color', 'rgba(25, 118, 210, 0.7)');
    cy.get('.character-type').eq(1).should('have.css', 'background-color', 'rgba(25, 118, 210, 0.7)');
    cy.get('.character-type').eq(2).should('have.css', 'background-color', 'rgba(211, 47, 47, 0.7)');
    cy.get('.character-type').eq(3).should('have.css', 'background-color', 'rgba(211, 47, 47, 0.7)');
    cy.get('.character-type.traveller').should('have.css', 'background-color', 'rgba(198, 93, 0, 0.9)');
    cy.get('#status').should('have.text', 'Live');
    cy.get('#optionsHeading')
      .should('be.visible')
      .and('have.text', 'Options')
      .and('have.prop', 'tagName', 'H3')
      .and('not.have.attr', 'tabindex');
    cy.get('.options summary, .options details').should('not.exist');
    cy.get('#optionsHeading').click().should('not.be.focused');
    cy.get('#alertOption').should('be.visible').and('contain', 'Warn me near the end');
    cy.get('#alerts').should('be.visible').and('not.be.checked');
    cy.get('#alertNote').should('be.visible');
    cy.get('#testSound').should('be.visible').and('have.text', 'Test sound');
    cy.get('#wakeOption').should('be.visible').and('contain', 'Keep screen on');
    cy.get('#wake').should('be.visible').and('not.be.checked');

    show({ timerStatus: 'paused', displaySeconds: 90 });
    cy.get('#headline').should('have.text', '01:30');
    cy.get('#message').should('contain', 'paused');

    show({ rate: 4, displaySeconds: 40 });
    cy.get('#message').should('contain', 'sped up');

    show({ phase: 'pregame', timerStatus: 'idle', displaySeconds: null, kind: null });
    cy.get('#headline').should('contain', 'ready');

    show({ phase: 'wake', kind: 'wake', displaySeconds: 8 });
    cy.get('#kicker').should('have.text', 'Wake up');
    cy.get('#kicker').should('have.css', 'color', 'rgb(212, 175, 55)');
    cy.get('#headline').should('have.text', '00:08');

    show({
      phase: 'night',
      timerStatus: 'finished',
      kind: null,
      displaySeconds: 0,
      confirmedComplete: true,
      day: 2,
    });
    cy.get('body').should('have.class', 'game--night');
    cy.get('#kicker').should('have.text', 'Day 2');
    cy.get('#kicker').should('have.css', 'color', 'rgb(212, 175, 55)');
    cy.get('#headline').should('have.text', 'Eyes closed');
    cy.get('#headline').should('not.have.text', '00:00');

    show({ displaySeconds: 0, locallyComplete: true });
    cy.get('body').should('not.have.class', 'game--night');
    cy.get('#headline').should('have.text', '00:00');

    show({ connection: 'reconnecting', fresh: false, stale: true });
    cy.get('#status').should('have.text', 'Offline');
    cy.get('#statusDetail').should('contain', 'last update');
    cy.get('#townsfolk').should('have.text', '7');

    show({ connection: 'ended' });
    cy.get('#status').should('have.text', 'Ended');
    cy.get('#statusDetail').should('contain', 'ended');

    show({ connection: 'expired' });
    cy.get('#status').should('have.text', 'Expired');
    cy.get('#statusDetail').should('contain', 'expired');

    show({ problem: 'unsupported-version' });
    cy.get('#headline').should('contain', 'Update');
  });

  [
    [320, 568],
    [390, 844],
    [430, 932],
    [844, 390],
    [1024, 768],
  ].forEach(([width, height]) => {
    it(`fits a ${width} by ${height} screen`, () => {
      cy.viewport(width, height);
      cy.visit('/c');
      show({ displaySeconds: 285 });
      cy.get('#kicker').should('be.visible').and('have.css', 'font-weight', '700');
      cy.get('#kicker').should(($kicker) => {
        const heading = parseFloat($kicker.css('font-size'));
        const countdown = parseFloat(
          $kicker[0].ownerDocument.querySelector('#headline').style.fontSize ||
            getComputedStyle($kicker[0].ownerDocument.querySelector('#headline')).fontSize
        );
        const countdownSize = parseFloat(
          getComputedStyle($kicker[0].ownerDocument.querySelector('#headline')).fontSize
        );
        expect(heading, 'heading size').to.be.greaterThan(18);
        expect(countdownSize, 'countdown size').to.be.greaterThan(heading);
        expect(countdown, 'countdown size').to.be.greaterThan(heading);
      });
      expectOnFirstScreen('#kicker');
      expectOnFirstScreen('#headline');
      cy.get('#showQr').then(($qr) => {
        cy.get('#leave').should(($leave) => {
          const qrBox = $qr[0].getBoundingClientRect();
          const leaveBox = $leave[0].getBoundingClientRect();
          expect(leaveBox.left, 'leave sits beside show QR').to.be.greaterThan(qrBox.left);
          expect(Math.abs(qrBox.top - leaveBox.top), 'shared row').to.be.lessThan(2);
          expect(Math.abs(qrBox.height - leaveBox.height), 'matched height').to.be.lessThan(2);
        });
      });
      cy.get('#traveller').should('be.visible');
      cy.get('#optionsHeading').should('be.visible').and('have.text', 'Options');
      cy.get('#alerts').should('be.visible');
      cy.get('#wake').should('be.visible');
      cy.get('.companion-footer').should('be.visible');
      cy.get('.character-type .label').each(($label) => {
        expect($label.text().trim().length).to.be.greaterThan(0);
      });
      expectNoHorizontalScroll();
    });
  });

  it('credits Arcane Scripts without competing with the countdown', () => {
    cy.visit('/c');
    cy.get('.companion-footer a')
      .should('have.text', 'Arcane Scripts')
      .and('have.attr', 'href', 'https://arcane-scripts.net')
      .and('have.attr', 'target', '_blank')
      .and('have.attr', 'rel', 'noopener noreferrer')
      .and('be.visible');
    cy.get('.companion-footer').should('contain', 'Made by');
    show({});
    cy.get('#headline').invoke('css', 'font-size').then((countdown) => {
      cy.get('.companion-footer').invoke('css', 'font-size').then((footer) => {
        expect(parseFloat(countdown)).to.be.greaterThan(parseFloat(footer) * 3);
      });
    });
  });

  it('offers Keep screen on, and a refusal leaves the countdown running', () => {
    cy.visit('/c', {
      onBeforeLoad(win) {
        const requests = [];
        win.__wakeRequests = requests;
        Object.defineProperty(win.navigator, 'wakeLock', {
          configurable: true,
          value: {
            request() {
              const sentinel = {
                released: false,
                release() {
                  this.released = true;
                  return Promise.resolve();
                },
                addEventListener() {},
              };
              requests.push(sentinel);
              return Promise.reject(new DOMException('denied', 'NotAllowedError'));
            },
          },
        });
      },
    });
    show({});
    cy.get('#headline').should('have.text', '04:45');
    cy.get('#wakeOption').should('be.visible').and('contain', 'Keep screen on');
    cy.get('#wake').should('not.be.checked').and('not.be.disabled');
    cy.get('#wake').check();
    cy.get('#wakeNote').should('be.visible').and('contain', 'did not keep the screen on');
    cy.get('#wake').should('be.checked');
    cy.get('#headline').should('have.text', '04:45');
    cy.get('#status').should('have.text', 'Live');
  });

  it('keeps the screen on while the page is visible and releases it afterwards', () => {
    cy.visit('/c', {
      onBeforeLoad(win) {
        let visibilityListeners = 0;
        const real = win.document.addEventListener.bind(win.document);
        win.document.addEventListener = (type, listener, options) => {
          if (type === 'visibilitychange') visibilityListeners += 1;
          return real(type, listener, options);
        };
        const requests = [];
        win.__wakeRequests = requests;
        win.__visibilityListeners = () => visibilityListeners;
        Object.defineProperty(win.navigator, 'wakeLock', {
          configurable: true,
          value: {
            request() {
              const sentinel = {
                released: false,
                release() {
                  this.released = true;
                  return Promise.resolve();
                },
                addEventListener() {},
              };
              requests.push(sentinel);
              return Promise.resolve(sentinel);
            },
          },
        });
      },
    });
    cy.window().its('__visibilityListeners').should((read) => {
      expect(read()).to.equal(1);
    });
    show({});
    cy.get('#wake').should('be.visible').check();
    cy.window().its('__wakeRequests').should('have.length', 1);
    cy.document().then((doc) => {
      doc.dispatchEvent(new Event('visibilitychange'));
    });
    cy.window().its('__wakeRequests').should('have.length', 1);
    cy.window().its('__visibilityListeners').should((read) => {
      expect(read()).to.equal(1);
    });
    cy.window().then((win) => {
      Object.defineProperty(win.document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      win.document.dispatchEvent(new Event('visibilitychange'));
    });
    cy.window().its('__wakeRequests.0.released').should('equal', true);
    cy.window().then((win) => {
      Object.defineProperty(win.document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      win.document.dispatchEvent(new Event('visibilitychange'));
    });
    cy.window().its('__wakeRequests').should('have.length', 2);
    cy.get('#wake').uncheck();
    cy.window().should((win) => {
      expect(win.__wakeRequests[1].released).to.equal(true);
    });
  });

  it('explains when the browser cannot keep the screen on', () => {
    cy.visit('/c', {
      onBeforeLoad(win) {
        Object.defineProperty(win.navigator, 'wakeLock', {
          configurable: true,
          value: undefined,
        });
      },
    });
    show({});
    cy.get('#wake').should('be.visible').and('be.disabled').and('not.be.checked');
    cy.get('#wakeNote').should('be.visible').and('contain', 'cannot keep the screen on');
    show({});
    cy.get('#headline').should('have.text', '04:45');
  });
});

describe('Companion QR sharing', () => {
  const PLAYER_URL = 'https://timer.arcane-scripts.net/c?code=ABC123';

  beforeEach(() => {
    cy.intercept('GET', '**/api.qrserver.com/**', {
      statusCode: 200,
      headers: { 'content-type': 'image/svg+xml' },
      body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    });
  });

  it('stays unavailable before a session is established', () => {
    let sockets = 0;
    cy.visit('/c', {
      onBeforeLoad(win) {
        const Native = win.WebSocket;
        function CountingSocket(...args) {
          sockets += 1;
          return new Native(...args);
        }
        CountingSocket.prototype = Native.prototype;
        CountingSocket.OPEN = Native.OPEN;
        win.WebSocket = CountingSocket;
      },
    });
    cy.get('#showQr').should('not.be.visible');
    cy.visit('/c?code=not-a-code');
    cy.get('#showQr').should('not.be.visible');
    show({ connection: 'connecting', fresh: false, established: false });
    cy.get('#showQr').should('not.be.visible');
    show({
      connection: 'reconnecting',
      fresh: false,
      stale: true,
      established: false,
      counts: null,
    });
    cy.get('#showQr').should('not.be.visible');
    cy.then(() => {
      expect(sockets).to.equal(0);
    });
  });

  it('shares the live code, keeps sharing while reconnecting, and leaves the countdown running', () => {
    cy.visit('/c');
    show({});
    cy.get('#showQr').should('be.visible').focus().type('{enter}');
    cy.get('#qrDialog:modal').should('exist');
    cy.focused().should('have.id', 'qrClose');
    cy.get('#qrDialog').should('have.attr', 'aria-labelledby', 'qrHeading');
    cy.get('#qrHeading').should('have.text', 'Join this game');
    cy.get('#qrCode').should('have.text', 'ABC123');
    cy.get('.qr-address').should('have.text', 'timer.arcane-scripts.net/c');
    cy.get('#qrImage').should(($img) => {
      const src = decodeURIComponent($img.attr('src'));
      expect(src).to.include(PLAYER_URL);
      expect(src).to.not.include('/c/?');
      expect(src).to.not.include('writeToken');
    });
    cy.get('#headline').should('have.text', '04:45');
    show({ displaySeconds: 200 });
    cy.get('#headline').should('have.text', '03:20');
    cy.get('#qrDialog:modal').should('exist');
    cy.get('#qrClose').trigger('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    cy.get('#qrDialog').should('not.have.attr', 'open');
    cy.focused().should('have.id', 'showQr');
    cy.get('#headline').should('have.text', '03:20');

    show({ connection: 'reconnecting', fresh: false, stale: true });
    cy.get('#status').should('have.text', 'Offline');
    cy.get('#status').should('not.have.text', 'Live');
    cy.get('#showQr').click();
    cy.get('#qrCode').should('have.text', 'ABC123');
    cy.get('#qrClose').click();
    cy.focused().should('have.id', 'showQr');
  });

  it('removes the code when the session ends, expires, or the player leaves', () => {
    cy.visit('/c');
    show({});
    cy.get('#showQr').click();
    show({ connection: 'ended', established: false, code: null });
    cy.get('#qrDialog').should('not.have.attr', 'open');
    cy.get('#showQr').should('not.be.visible');
    cy.get('#qrImage').should('not.have.attr', 'src');
    cy.get('#qrCode').should('have.text', '');
    cy.focused().should('have.id', 'leave');

    show({ connection: 'connecting', fresh: false, established: false, code: 'NEWCDE' });
    cy.get('#showQr').should('not.be.visible');
    cy.get('#qrCode').should('have.text', '');
    show({
      connection: 'live',
      fresh: true,
      stale: false,
      established: true,
      code: 'NEWCDE',
    });
    cy.get('#showQr').click();
    cy.get('#qrCode').should('have.text', 'NEWCDE');
    cy.get('#qrImage').should(($img) => {
      const src = decodeURIComponent($img.attr('src'));
      expect(src).to.include('https://timer.arcane-scripts.net/c?code=NEWCDE');
      expect(src).to.not.include('ABC123');
    });
    cy.get('#qrClose').click();

    show({ connection: 'expired', established: false, code: 'NEWCDE' });
    cy.get('#showQr').should('not.be.visible');
    cy.get('#status').should('have.text', 'Expired');

    show({ connection: 'live', fresh: true, stale: false, established: true, code: 'NEWCDE' });
    cy.get('#showQr').should('be.visible');
    cy.get('#leave').click();
    cy.get('#joinPanel').should('be.visible');
    cy.get('#showQr').should('not.be.visible');
    cy.get('#qrDialog').should('not.have.attr', 'open');
    show({ connection: 'live', fresh: true, stale: false, established: true, code: 'ABC123' });
    cy.get('#showQr').click();
    cy.get('#qrCode').should('have.text', 'ABC123');
    cy.get('#qrCode').should('not.have.text', 'NEWCDE');
  });
});

describe('Companion countdown sounds', () => {
  function audible(win) {
    return win.__played.filter((item) => item.volume > 0);
  }

  function watchSounds(win) {
    const played = [];
    win.__played = played;
    win.HTMLAudioElement.prototype.play = function watchPlay() {
      played.push({ src: this.src, volume: this.volume, el: this });
      if (win.__failSounds) return Promise.reject(new Error('blocked'));
      return Promise.resolve();
    };
  }

  beforeEach(() => {
    cy.visit('/c');
    cy.window().then(watchSounds);
    show({});
  });

  it('plays the bowl and then the bell without changing the alert', () => {
    cy.get('#headline').should('have.text', '04:45');
    cy.get('#alerts').should('not.be.checked');
    cy.get('#testSound').click();
    cy.get('#soundStatus').should('have.text', '30-second warning');
    cy.get('#alerts').should('not.be.checked');
    cy.get('#headline').should('have.text', '04:45');
    cy.window().should((win) => {
      const clips = audible(win);
      expect(clips).to.have.length(1);
      expect(clips[0].src).to.include('warning-30sec.mp3');
      expect(clips[0].volume).to.be.lessThan(0.75);
    });
    cy.window().then((win) => {
      audible(win)[0].el.dispatchEvent(new Event('ended'));
    });
    cy.get('#soundStatus').should('have.text', 'End of the countdown');
    cy.window().should((win) => {
      const clips = audible(win);
      expect(clips).to.have.length(2);
      expect(clips[1].src).to.include('single-church-bell-v2.mp3');
      expect(clips[1].volume).to.be.greaterThan(clips[0].volume);
    });
    cy.get('#alerts').should('not.be.checked');
    cy.window().then((win) => {
      audible(win)[1].el.dispatchEvent(new Event('ended'));
    });
    cy.get('#soundStatus').should('have.text', '');
  });

  it('restarts the test instead of stacking sounds', () => {
    cy.get('#testSound').click();
    cy.get('#testSound').click();
    cy.window().should((win) => {
      const clips = audible(win);
      expect(clips.length).to.be.at.least(2);
      expect(clips.every((item) => item.src.includes('warning-30sec.mp3'))).to.equal(true);
      expect(new Set(clips.map((item) => item.el)).size).to.equal(1);
    });
    cy.get('#alerts').should('not.be.checked');
  });

  it('leaves the countdown running when playback is refused', () => {
    cy.window().then((win) => {
      win.__failSounds = true;
    });
    cy.get('#testSound').click();
    cy.get('#headline').should('have.text', '04:45');
    cy.get('#alerts').should('not.be.checked');
    cy.get('#soundStatus').should('have.text', '');
    cy.get('#status').should('have.text', 'Live');
  });

  it('plays each countdown alert once, and not while hidden or stale', () => {
    show({ displaySeconds: 40 });
    cy.get('#alerts').check();
    cy.get('#alerts').should('be.checked');
    show({ displaySeconds: 20 });
    cy.window().should((win) => {
      const clips = audible(win);
      expect(clips).to.have.length(1);
      expect(clips[0].src).to.include('warning-30sec.mp3');
    });
    show({ displaySeconds: 10 });
    cy.window().should((win) => {
      expect(audible(win)).to.have.length(1);
    });
    show({ displaySeconds: 0, locallyComplete: true });
    cy.window().should((win) => {
      const clips = audible(win);
      expect(clips).to.have.length(2);
      expect(clips[1].src).to.include('single-church-bell-v2.mp3');
    });
    show({ displaySeconds: 0, locallyComplete: true });
    cy.window().should((win) => {
      expect(audible(win)).to.have.length(2);
    });

    cy.window().then((win) => {
      win.__played.length = 0;
      Object.defineProperty(win.document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
    });
    show({ displaySeconds: 40, rev: 2 });
    show({ displaySeconds: 15, rev: 2 });
    cy.window().should((win) => {
      expect(audible(win)).to.have.length(0);
    });
    cy.window().then((win) => {
      Object.defineProperty(win.document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
    });
    show({ displaySeconds: 10, rev: 2 });
    cy.window().should((win) => {
      expect(audible(win)).to.have.length(0);
    });

    show({ fresh: false, stale: true, displaySeconds: 0, locallyComplete: true, rev: 3 });
    cy.window().should((win) => {
      expect(audible(win)).to.have.length(0);
    });
    cy.get('#headline').should('have.text', '00:00');
  });
});

describe('Companion player preferences', () => {
  function grantWakeLock(win) {
    const requests = [];
    win.__wakeRequests = requests;
    Object.defineProperty(win.navigator, 'wakeLock', {
      configurable: true,
      value: {
        request() {
          const sentinel = {
            released: false,
            release() {
              this.released = true;
              return Promise.resolve();
            },
            addEventListener() {},
          };
          requests.push(sentinel);
          return Promise.resolve(sentinel);
        },
      },
    });
  }

  function watchSounds(win) {
    const played = [];
    win.__played = played;
    win.HTMLAudioElement.prototype.play = function watchPlay() {
      played.push({ src: this.src, volume: this.volume });
      return Promise.resolve();
    };
  }

  it('starts from both options off and does not write a save', () => {
    cy.visit('/c');
    cy.get('#alerts').should('not.be.checked');
    cy.get('#wake').should('not.be.checked');
    cy.window().then((win) => {
      expect(win.localStorage.getItem('timer-companion')).to.equal(null);
    });
  });

  it('restores a saved warning without playing it, then warns on the next crossing', () => {
    cy.visit('/c', {
      onBeforeLoad(win) {
        watchSounds(win);
        win.localStorage.setItem('timer-companion', JSON.stringify({
          warnNearEnd: true,
          keepScreenOn: false,
        }));
      },
    });
    cy.get('#alerts').should('be.checked');
    cy.get('#wake').should('not.be.checked');
    cy.window().its('__played').should('have.length', 0);
    show({ displaySeconds: 15 });
    show({ displaySeconds: 0, locallyComplete: true, rev: 2 });
    cy.window().its('__played').should('have.length', 0);
    cy.get('#headline').should('have.text', '00:00');
    show({ displaySeconds: 40, rev: 3 });
    show({ displaySeconds: 20, rev: 3 });
    cy.window().should((win) => {
      expect(win.__played).to.have.length(1);
      expect(win.__played[0].src).to.include('warning-30sec.mp3');
      expect(win.__played[0].volume).to.be.greaterThan(0);
    });
    cy.get('#testSound').click();
    cy.get('#soundStatus').should('have.text', '30-second warning');
    cy.get('#alerts').should('be.checked');
  });

  it('remembers one option across a refresh without clearing the other', () => {
    cy.on('window:before:load', grantWakeLock);
    cy.visit('/c');
    show({});
    cy.get('#alerts').check();
    cy.get('#wake').check();
    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.getItem('timer-companion'))).to.deep.equal({
        warnNearEnd: true,
        keepScreenOn: true,
      });
    });
    cy.reload();
    cy.get('#alerts').should('be.checked');
    cy.get('#wake').should('be.checked');
    cy.window().its('__wakeRequests').should('have.length', 1);
    show({});
    cy.get('#wake').uncheck();
    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.getItem('timer-companion'))).to.deep.equal({
        warnNearEnd: true,
        keepScreenOn: false,
      });
    });
    cy.reload();
    cy.get('#alerts').should('be.checked');
    cy.get('#wake').should('not.be.checked');
    cy.window().its('__wakeRequests').should('have.length', 0);
  });

  it('requests a fresh wake lock when that choice was saved', () => {
    cy.visit('/c', {
      onBeforeLoad(win) {
        grantWakeLock(win);
        win.localStorage.setItem('timer-companion', JSON.stringify({
          warnNearEnd: false,
          keepScreenOn: true,
        }));
      },
    });
    cy.get('#wake').should('be.checked').and('not.be.disabled');
    cy.get('#alerts').should('not.be.checked');
    cy.window().its('__wakeRequests').should('have.length', 1);
    cy.get('#headline').should('exist');
  });

  it('keeps the saved wake choice when the browser refuses the lock', () => {
    cy.visit('/c', {
      onBeforeLoad(win) {
        win.localStorage.setItem('timer-companion', JSON.stringify({
          warnNearEnd: false,
          keepScreenOn: true,
        }));
        Object.defineProperty(win.navigator, 'wakeLock', {
          configurable: true,
          value: {
            request() {
              return Promise.reject(new DOMException('denied', 'NotAllowedError'));
            },
          },
        });
      },
    });
    show({});
    cy.get('#wake').should('be.checked');
    cy.get('#wakeNote').should('be.visible').and('contain', 'did not keep the screen on');
    cy.get('#headline').should('have.text', '04:45');
    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.getItem('timer-companion'))).to.deep.equal({
        warnNearEnd: false,
        keepScreenOn: true,
      });
    });
  });

  it('leaves a saved wake choice in place when the browser cannot keep the screen on', () => {
    cy.visit('/c', {
      onBeforeLoad(win) {
        win.localStorage.setItem('timer-companion', JSON.stringify({
          warnNearEnd: true,
          keepScreenOn: true,
        }));
        Object.defineProperty(win.navigator, 'wakeLock', {
          configurable: true,
          value: undefined,
        });
      },
    });
    show({});
    cy.get('#wake').should('be.disabled').and('not.be.checked');
    cy.get('#wakeNote').should('be.visible').and('contain', 'cannot keep the screen on');
    cy.get('#alerts').should('be.checked');
    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.getItem('timer-companion')).keepScreenOn).to.equal(true);
    });
  });

  it('ignores a broken save and still lets the player choose', () => {
    cy.on('window:before:load', grantWakeLock);
    cy.visit('/c', {
      onBeforeLoad(win) {
        win.localStorage.setItem('timer-companion', '{');
      },
    });
    cy.get('#alerts').should('not.be.checked');
    cy.get('#wake').should('not.be.checked');
    show({});
    cy.get('#headline').should('have.text', '04:45');
    cy.get('#alerts').check();
    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.getItem('timer-companion'))).to.deep.equal({
        warnNearEnd: true,
        keepScreenOn: false,
      });
    });
  });

  it('keeps a valid option when the other value has the wrong type', () => {
    cy.visit('/c', {
      onBeforeLoad(win) {
        grantWakeLock(win);
        win.localStorage.setItem('timer-companion', JSON.stringify({
          warnNearEnd: 'yes',
          keepScreenOn: true,
          code: 'ABC123',
        }));
      },
    });
    cy.get('#alerts').should('not.be.checked');
    cy.get('#wake').should('be.checked');
    cy.window().its('__wakeRequests').should('have.length', 1);
    show({});
    cy.get('#alerts').check();
    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.getItem('timer-companion'))).to.deep.equal({
        warnNearEnd: true,
        keepScreenOn: true,
      });
    });
  });

  it('still runs when storage itself throws', () => {
    cy.visit('/c', {
      onBeforeLoad(win) {
        grantWakeLock(win);
        const blocked = new Error('blocked');
        const storage = win.localStorage;
        const getItem = storage.getItem.bind(storage);
        const setItem = storage.setItem.bind(storage);
        cy.stub(storage, 'getItem').callsFake((key) => {
          if (key === 'timer-companion') throw blocked;
          return getItem(key);
        });
        cy.stub(storage, 'setItem').callsFake((key, value) => {
          if (key === 'timer-companion') throw blocked;
          return setItem(key, value);
        });
      },
    });
    cy.get('#alerts').should('not.be.checked');
    cy.get('#wake').should('not.be.checked');
    show({});
    cy.get('#headline').should('have.text', '04:45');
    cy.get('#alerts').check();
    cy.get('#alerts').should('be.checked');
    cy.get('#wake').check();
    cy.get('#wake').should('be.checked');
    cy.window().its('__wakeRequests').should('have.length', 1);
    cy.get('#status').should('have.text', 'Live');
  });
});
