const { defineConfig } = require('cypress');

module.exports = defineConfig({
  projectId: '4s4hw6',
  e2e: {
    baseUrl: 'http://localhost:8006',
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    video: false,
    screenshotOnRunFailure: false,
  },
});
