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
    cy.get('#alerts').should('not.be.checked');
    cy.get('#wake').should('not.be.checked');

    show({ timerStatus: 'paused', displaySeconds: 90 });
    cy.get('#headline').should('have.text', '01:30');
    cy.get('#message').should('contain', 'paused');

    show({ rate: 4, displaySeconds: 40 });
    cy.get('#message').should('contain', 'sped up');

    show({ phase: 'pregame', timerStatus: 'idle', displaySeconds: null, kind: null });
    cy.get('#headline').should('contain', 'ready');

    show({ phase: 'wake', kind: 'wake', displaySeconds: 8 });
    cy.get('#kicker').should('have.text', 'Wake up');
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
    [844, 390],
    [1024, 768],
  ].forEach(([width, height]) => {
    it(`fits a ${width} by ${height} screen`, () => {
      cy.viewport(width, height);
      cy.visit('/c');
      show({ displaySeconds: 285 });
      cy.get('#headline').should('be.visible');
      cy.get('#traveller').should('be.visible');
      cy.get('.character-type .label').each(($label) => {
        expect($label.text().trim().length).to.be.greaterThan(0);
      });
      expectNoHorizontalScroll();
    });
  });
});
