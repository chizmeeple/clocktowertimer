// Sound-effect files would otherwise play through the test runner.
// Resolve play() without starting the media. A test that spies on playback
// or simulates a failure replaces this in its own onBeforeLoad.
// A failed effect also falls back to a generated beep, which does not go
// through play(). Replace the audio context so the fallback stays silent.
Cypress.on('window:before:load', (win) => {
  const audioPrototype = win.HTMLAudioElement?.prototype;
  const play = audioPrototype?.play;
  if (typeof play === 'function' && !play.isSinonProxy) {
    audioPrototype.play = function silentPlay() {
      return Promise.resolve();
    };
  }

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
