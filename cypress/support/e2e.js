// Sound-effect files are stubbed per test via HTMLAudioElement.play.
// A failed effect also falls back to a generated beep, which does not go
// through that stub. Replace the audio context so the fallback stays silent.
Cypress.on('window:before:load', (win) => {
  function SilentAudioContext() {
    return {
      state: 'running',
      resume() {
        return Promise.resolve();
      },
      createOscillator() {
        return {
          connect() {},
          start() {},
          stop() {},
          frequency: { value: 0 },
        };
      },
      createGain() {
        return {
          connect() {},
          gain: { value: 0 },
        };
      },
      destination: {},
    };
  }

  if (typeof win.AudioContext === 'function') {
    win.AudioContext = SilentAudioContext;
  }
  if (typeof win.webkitAudioContext === 'function') {
    win.webkitAudioContext = SilentAudioContext;
  }
});
