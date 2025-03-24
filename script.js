// DOM Elements
let minutesDisplay,
  secondsDisplay,
  startBtn,
  resetBtn,
  fullscreenBtn,
  settingsBtn,
  settingsDialog,
  closeSettingsBtn,
  playerCountInput,
  travellerCountInput,
  accelerateBtn,
  minuteButtons,
  secondButtons,
  infoBtn,
  infoDialog,
  closeInfoBtn,
  whatsNewDialog,
  closeWhatsNewBtn,
  changeHistoryDialog,
  closeChangeHistoryBtn;

// Utility functions
const connectivityUtils = {
  isOnline: () => navigator.onLine,
  addStatusListener: (onlineCallback, offlineCallback) => {
    window.addEventListener('online', onlineCallback);
    window.addEventListener('offline', offlineCallback);
  },
  removeStatusListener: (onlineCallback, offlineCallback) => {
    window.removeEventListener('online', onlineCallback);
    window.removeEventListener('offline', offlineCallback);
  },
};

const orientationUtils = {
  isPortrait: () => window.matchMedia('(orientation: portrait)').matches,
  addOrientationListener: (callback) => {
    window
      .matchMedia('(orientation: portrait)')
      .addEventListener('change', (e) => {
        callback(e.matches);
      });
  },
  removeOrientationListener: (callback) => {
    window
      .matchMedia('(orientation: portrait)')
      .removeEventListener('change', callback);
  },
};

const youtubeUtils = {
  play: () => {
    if (playMusic && youtubePlayer && youtubePlayer.playVideo) {
      youtubePlayer.playVideo();
    }
  },
  pause: () => {
    if (playMusic && youtubePlayer && youtubePlayer.pauseVideo) {
      youtubePlayer.pauseVideo();
    }
  },
  stop: () => {
    if (playMusic && youtubePlayer && youtubePlayer.stopVideo) {
      youtubePlayer.stopVideo();
    }
  },
};

const timerUtils = {
  stop: () => {
    clearInterval(timerId);
    isRunning = false;
    updateDisplay();
  },
  updateButtonStates: (buttons, activeButton) => {
    buttons.forEach((btn) => btn.classList.remove('active'));
    if (activeButton) {
      activeButton.classList.add('active');
    }
  },
  holdToActivate: (button, holdDuration, onProgress, onComplete) => {
    let startTime;
    let animationFrame;
    let holdTimer;

    const start = (e) => {
      // Prevent text selection during hold
      e.preventDefault();
      startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / holdDuration, 1);

        if (onProgress) {
          button.style.setProperty('--progress-width', `${progress * 100}%`);
          onProgress(progress);
        }

        if (progress < 1) {
          animationFrame = requestAnimationFrame(animate);
        }
      };

      animate();

      holdTimer = setTimeout(() => {
        if (onComplete) {
          onComplete();
        }
      }, holdDuration);
    };

    const cancel = () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
      if (holdTimer) {
        clearTimeout(holdTimer);
      }
      if (onProgress) {
        button.style.setProperty('--progress-width', '0%');
        onProgress(0);
      }
    };

    // Add event listeners with passive option where appropriate
    button.addEventListener('mousedown', start);
    button.addEventListener('touchstart', start, { passive: false }); // We need preventDefault, so can't be passive
    button.addEventListener('mouseup', cancel, { passive: true });
    button.addEventListener('mouseleave', cancel, { passive: true });
    button.addEventListener('touchend', cancel, { passive: true });
    button.addEventListener('touchcancel', cancel, { passive: true });
  },
};

// Button Labels
const BUTTON_LABELS = {
  WAKE_UP: '⏰ Wake Up!',
  PAUSE: '⏸️ Pause Day',
  RESUME: '▶️ Resume Day',
  RESET: '🔄 Reset Day',
  ACCELERATE: '⏩ Accelerate Time',
  START_DAY: (day) => `▶ Start Day ${day}`,
  FULLSCREEN: {
    ENTER:
      '<svg viewBox="0 0 24 24" width="24" height="24" class="fullscreen-icon"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    EXIT: '<svg viewBox="0 0 24 24" width="24" height="24" class="fullscreen-icon"><path fill="currentColor" d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>',
  },
};

// Default YouTube playlist URL
const DEFAULT_YOUTUBE_PLAYLIST =
  'https://www.youtube.com/watch?v=TInSYXP9ZB8&list=PLhCDyBm6z1NwkkOAyQAMQkeberU9rwMcc';

const ATMOSPHERIC_PLAYLIST =
  'https://www.youtube.com/watch?v=1oCIZjPxthY&list=PLhCDyBm6z1NyrifTlGYj55uPb6xrlgBih';

// Import version tracking from changelog
import { APP_VERSION, CHANGELOG } from './changelog.js';

// Audio Elements
let endSound = null;
let wakeUpSound = null;
let previewSound = null; // New audio element for previews

// Wake Lock state
let wakeLock = null;

// Timer state
let timeLeft = 0;
let timerId = null;
let isRunning = false;
let selectedSeconds = 0;
let selectedMinutes = 0;
let normalInterval = 1000; // Normal 1 second interval
let currentInterval = normalInterval;
let wakeUpTimeout = null;
let isEndSoundPlaying = false; // New state variable

// Game pace multipliers
const PACE_MULTIPLIERS = {
  relaxed: 1,
  normal: 0.8, // 20% faster than relaxed
  speedy: 0.5, // 50% faster than relaxed
};

// Settings state
let playerCount = 10; // Default to 10 players
let travellerCount = 0; // Default to 0 travellers
let isFirstLoad = false;
let currentDay = null;
let currentPace = 'normal'; // Default pace
let playMusic = false; // Default to false for new users
let playMusicAtNight = false; // Default to false for new users
let playSoundEffects = true; // Default to true for sound effects
let youtubeVolume = 50; // Default to 50%
let soundEffectsVolume = 100; // Default to 100%
let backgroundTheme = 'medieval-cartoon'; // Default background theme
let youtubePlaylistUrl = DEFAULT_YOUTUBE_PLAYLIST; // Default playlist
let keepDisplayOn = true; // Default to true for wake lock
let youtubePlayer = null;
let endOfDaySound = 'cathedral-bell.mp3'; // Default end of day sound
let wakeUpSoundFile = 'chisel-bell-01-loud.mp3'; // Default wake up sound
let acceptedPortraitWarning = false; // Default to false for portrait warning

// Character amounts mapping
const characterAmounts = {
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};

// Helper function to update character amounts
function updateCharacterAmounts(count) {
  const amounts = characterAmounts[count] || [0, 0, 0, 0];
  document.getElementById('townsfolkAmount').textContent = amounts[0];
  document.getElementById('outsiderAmount').textContent = amounts[1];
  document.getElementById('minionAmount').textContent = amounts[2];
  document.getElementById('demonAmount').textContent = amounts[3];
}

// Request wake lock
async function requestWakeLock() {
  if (!keepDisplayOn) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    console.log('Wake Lock is active');
  } catch (err) {
    console.log(`Failed to request Wake Lock: ${err.name}, ${err.message}`);
  }
}

// Release wake lock
async function releaseWakeLock() {
  if (wakeLock) {
    try {
      await wakeLock.release();
      wakeLock = null;
      console.log('Wake Lock released');
    } catch (err) {
      console.log(`Failed to release Wake Lock: ${err.name}, ${err.message}`);
    }
  }
}

// Event listeners for wake lock
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    await requestWakeLock();
  } else {
    await releaseWakeLock();
  }
});

// Request wake lock and initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await requestWakeLock();
  } catch (error) {
    console.error('Error requesting wake lock:', error);
  }

  setupKeyboardNavigation();

  // Initialize audio
  endSound = new Audio(`sounds/end-of-day/${endOfDaySound}`);
  wakeUpSound = new Audio(`sounds/wake-up/${wakeUpSoundFile}`);

  // Add connectivity listeners
  connectivityUtils.addStatusListener(
    () => {
      // When we come back online
      if (playMusic) {
        initYoutubePlayer();
        // If timer is running, resume music after a short delay to allow player initialization
        if (isRunning && timeLeft > 0) {
          setTimeout(() => {
            youtubeUtils.play();
          }, 2000); // 2 second delay to allow player to initialize
        }
      }
    },
    () => {
      // When we go offline, remove the YouTube player
      const container = document.querySelector('.youtube-player-container');
      if (container) {
        container.remove();
      }
      youtubePlayer = null;
    }
  );

  // Initialize DOM elements
  minutesDisplay = document.getElementById('minutes');
  secondsDisplay = document.getElementById('seconds');
  startBtn = document.getElementById('startBtn');
  startBtn.textContent = BUTTON_LABELS.WAKE_UP;
  startBtn.disabled = false; // Ensure Wake Up button is enabled on load
  resetBtn = document.getElementById('resetBtn');
  resetBtn.textContent = BUTTON_LABELS.RESET;
  resetBtn.disabled = true; // Reset button should be disabled initially
  fullscreenBtn = document.getElementById('fullscreenBtn');
  settingsBtn = document.getElementById('settingsBtn');
  settingsDialog = document.getElementById('settingsDialog');
  closeSettingsBtn = document.getElementById('closeSettings');
  playerCountInput = document.getElementById('playerCount');
  travellerCountInput = document.getElementById('travellerCount');
  accelerateBtn = document.getElementById('accelerateBtn');
  accelerateBtn.textContent = BUTTON_LABELS.ACCELERATE;
  accelerateBtn.disabled = true; // Accelerate button should be disabled initially
  minuteButtons = document.querySelectorAll('.minute-btn');
  secondButtons = document.querySelectorAll('.second-btn');
  infoBtn = document.getElementById('infoBtn');
  infoDialog = document.getElementById('infoDialog');
  closeInfoBtn = document.getElementById('closeInfo');
  whatsNewDialog = document.getElementById('whatsNewDialog');
  closeWhatsNewBtn = document.getElementById('closeWhatsNew');
  changeHistoryDialog = document.getElementById('changeHistoryDialog');
  closeChangeHistoryBtn = document.getElementById('closeChangeHistory');

  // Add portrait warning dialog elements
  const portraitWarningDialog = document.getElementById(
    'portraitWarningDialog'
  );
  const acceptPortraitWarningBtn = document.getElementById(
    'acceptPortraitWarning'
  );

  // Add event listener for accepting portrait warning
  acceptPortraitWarningBtn.addEventListener('click', () => {
    acceptedPortraitWarning = true;
    saveSettings();
    portraitWarningDialog.close();
  });

  // Check for portrait mode and show warning if needed
  if (orientationUtils.isPortrait() && !acceptedPortraitWarning) {
    portraitWarningDialog.showModal();
  }

  // Add orientation change listener
  orientationUtils.addOrientationListener((isPortrait) => {
    if (isPortrait && !acceptedPortraitWarning) {
      portraitWarningDialog.showModal();
    }
  });

  // Add event listener for "Use original playlist" link
  document
    .getElementById('useBardcorePlaylist')
    .addEventListener('click', (e) => {
      e.preventDefault();
      const playlistInput = document.getElementById('youtubePlaylist');
      playlistInput.value = DEFAULT_YOUTUBE_PLAYLIST;
      youtubePlaylistUrl = DEFAULT_YOUTUBE_PLAYLIST;
      saveSettings();
      if (playMusic) {
        initYoutubePlayer();
      }
      updateYoutubeLink();
    });

  document
    .getElementById('useAtmosphericPlaylist')
    .addEventListener('click', (e) => {
      e.preventDefault();
      const playlistInput = document.getElementById('youtubePlaylist');
      playlistInput.value = ATMOSPHERIC_PLAYLIST;
      youtubePlaylistUrl = ATMOSPHERIC_PLAYLIST;
      saveSettings();
      if (playMusic) {
        initYoutubePlayer();
      }
      updateYoutubeLink();
    });

  // Add event listener for YouTube playlist input
  document.getElementById('youtubePlaylist').addEventListener('change', () => {
    updateYoutubePlaylist();
    updateYoutubeLink();
  });

  // Add event listener for YouTube link
  document
    .getElementById('openYoutubePlaylist')
    .addEventListener('click', (e) => {
      if (!playMusic) {
        e.preventDefault();
      }
    });

  // Add hold-to-activate for accelerate button
  timerUtils.holdToActivate(
    accelerateBtn,
    2000, // 2 seconds hold duration
    (progress) => {
      // Progress is now handled by CSS custom property
    },
    () => {
      // Reset button appearance and trigger acceleration
      accelerateBtn.style.setProperty('--progress-width', '0%');
      if (!accelerateBtn.disabled) {
        accelerateTime();
      }
    }
  );

  // Remove the click event listener for accelerate button since we're using hold now
  accelerateBtn.removeEventListener('click', accelerateTime);

  // Add event listeners
  startBtn.addEventListener('click', startTimer);
  resetBtn.addEventListener('click', resetTimer);
  fullscreenBtn.addEventListener('click', toggleFullscreen);
  settingsBtn.addEventListener('click', openSettings);
  closeSettingsBtn.addEventListener('click', closeSettings);
  infoBtn.addEventListener('click', openInfo);
  closeInfoBtn.addEventListener('click', closeInfo);
  playerCountInput.addEventListener('change', updatePlayerCount);
  playerCountInput.addEventListener('input', updatePlayerCount);
  travellerCountInput.addEventListener('change', updateTravellerCount);
  travellerCountInput.addEventListener('input', updateTravellerCount);
  document
    .getElementById('startNewGame')
    .addEventListener('click', startNewGame);
  document.getElementById('gamePace').addEventListener('change', (e) => {
    updateGamePace(e.target.value);
  });
  document
    .getElementById('playMusic')
    .addEventListener('change', updateMusicPlayback);
  document.getElementById('playMusicAtNight').addEventListener('change', () => {
    playMusicAtNight = document.getElementById('playMusicAtNight').checked;
    saveSettings();
  });
  document
    .getElementById('youtubePlaylist')
    .addEventListener('change', updateYoutubePlaylist);
  document
    .getElementById('musicVolume')
    .addEventListener('input', updateYoutubeVolume);
  document
    .getElementById('playSoundEffects')
    .addEventListener('change', updateSoundEffects);
  document
    .getElementById('soundEffectsVolume')
    .addEventListener('input', updateSoundEffectsVolume);
  document.getElementById('keepDisplayOn').addEventListener('change', (e) => {
    keepDisplayOn = e.target.checked;
    saveSettings();
    if (keepDisplayOn) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  });
  document
    .getElementById('backgroundTheme')
    .addEventListener('change', updateBackgroundTheme);

  // Add keyboard shortcut for settings
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'q' && !settingsDialog.open) {
      openSettings();
    }
    if (e.key.toLowerCase() === 'i' && !infoDialog.open) {
      openInfo();
    }
  });

  // Add click handlers for preset buttons
  minuteButtons.forEach((btn) => {
    btn.addEventListener('click', handleMinuteClick);
  });

  secondButtons.forEach((btn) => {
    btn.addEventListener('click', handleSecondClick);
  });

  // Add What's New dialog event listeners
  closeWhatsNewBtn.addEventListener('click', closeWhatsNew);
  whatsNewDialog.addEventListener('click', (e) => {
    if (e.target === whatsNewDialog) {
      closeWhatsNew();
    }
  });

  // Add View Full History link event listener
  document.getElementById('viewFullHistory').addEventListener('click', (e) => {
    e.preventDefault();
    closeWhatsNew();
    showChangeHistory();
  });

  // Add Change History dialog event listeners
  closeChangeHistoryBtn.addEventListener('click', closeChangeHistory);
  changeHistoryDialog.addEventListener('click', (e) => {
    if (e.target === changeHistoryDialog) {
      closeChangeHistory();
    }
  });

  // Add event listeners for sound preview buttons
  document.querySelectorAll('.preview-sound').forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.type;
      const select = button.parentElement.querySelector('select');
      const soundFile = select.value;

      // Stop any currently playing preview
      if (previewSound) {
        previewSound.pause();
        previewSound.currentTime = 0;
        document
          .querySelectorAll('.preview-sound')
          .forEach((btn) => btn.classList.remove('playing'));
      }

      // Create and play the new preview
      previewSound = new Audio(`sounds/${type}/${soundFile}`);
      button.classList.add('playing');

      previewSound.addEventListener(
        'ended',
        () => {
          button.classList.remove('playing');
          previewSound = null;
        },
        { once: true }
      );

      previewSound.play().catch((error) => {
        console.log('Error playing preview sound:', error);
        button.classList.remove('playing');
      });
    });
  });

  // Update the sound change handlers to stop any preview when changing sounds
  document.getElementById('endOfDaySound').addEventListener('change', (e) => {
    if (previewSound) {
      previewSound.pause();
      previewSound.currentTime = 0;
      document
        .querySelectorAll('.preview-sound')
        .forEach((btn) => btn.classList.remove('playing'));
    }
    endOfDaySound = e.target.value;
    endSound = new Audio(`sounds/end-of-day/${endOfDaySound}`);
    saveSettings();
  });

  document.getElementById('wakeUpSound').addEventListener('change', (e) => {
    if (previewSound) {
      previewSound.pause();
      previewSound.currentTime = 0;
      document
        .querySelectorAll('.preview-sound')
        .forEach((btn) => btn.classList.remove('playing'));
    }
    wakeUpSoundFile = e.target.value;
    wakeUpSound = new Audio(`sounds/wake-up/${wakeUpSoundFile}`);
    saveSettings();
  });

  // Initialize settings and update display
  loadSettings();
  updateClocktowerPresets();
  updateDisplay();

  // Add event listeners for settings tabs
  document.querySelectorAll('.tab-button').forEach((button) => {
    console.log('Adding click listener to tab button:', button.dataset.tab);
    button.addEventListener('click', () => {
      console.log('Tab button clicked:', button.dataset.tab);
      switchSettingsTab(button.dataset.tab);
    });
  });

  // Create YouTube container immediately if music is enabled
  if (playMusic) {
    createYoutubePlayer();
  }
});

// Helper functions for timer calculations
function calcTimerStartEndValues(startingPlayerCount) {
  return {
    totalNumbers: startingPlayerCount - startingPlayerCount / 5,
    dayStartValue: startingPlayerCount * 0.4 + 2,
    dayEndValue: 2,
    nightStartValue: startingPlayerCount * 0.1 + 1,
    nightEndValue: 1,
  };
}

function roundToNearestQuarter(n) {
  return Math.round(n * 4) / 4;
}

// Load settings from localStorage
function loadSettings() {
  const savedSettings = localStorage.getItem('quickTimerSettings');
  if (savedSettings) {
    const settings = JSON.parse(savedSettings);
    playerCount = settings.playerCount || 10;
    travellerCount = settings.travellerCount || 0;
    currentDay = settings.currentDay || 1;
    currentPace = settings.currentPace || 'normal';
    playMusic = settings.playMusic !== undefined ? settings.playMusic : false;
    playMusicAtNight =
      settings.playMusicAtNight !== undefined
        ? settings.playMusicAtNight
        : false;
    playSoundEffects =
      settings.playSoundEffects !== undefined
        ? settings.playSoundEffects
        : true;
    soundEffectsVolume = settings.soundEffectsVolume || 100;
    keepDisplayOn =
      settings.keepDisplayOn !== undefined ? settings.keepDisplayOn : true;
    youtubeVolume = settings.youtubeVolume || 50;
    backgroundTheme = settings.backgroundTheme || 'medieval-cartoon';
    youtubePlaylistUrl =
      settings.youtubePlaylistUrl || DEFAULT_YOUTUBE_PLAYLIST;
    endOfDaySound = settings.endOfDaySound || 'cathedral-bell.mp3';
    wakeUpSoundFile = settings.wakeUpSoundFile || 'chisel-bell-01-loud.mp3';
    acceptedPortraitWarning = settings.acceptedPortraitWarning || false;

    // Check for new version
    const lastSeenVersion = settings.lastSeenVersion;
    if (lastSeenVersion && lastSeenVersion !== APP_VERSION) {
      showWhatsNew(lastSeenVersion);
    }
    settings.lastSeenVersion = APP_VERSION;
    localStorage.setItem('quickTimerSettings', JSON.stringify(settings));

    // Restore day state if it exists
    const dayState = settings.dayState || '';
    updateDayDisplay(dayState);
  } else {
    isFirstLoad = true;
    currentDay = 1;
    endSound = new Audio(`sounds/end-of-day/${endOfDaySound}`);
    wakeUpSound = new Audio(`sounds/wake-up/${wakeUpSoundFile}`);
  }

  // Always update UI to reflect settings
  playerCountInput.value = playerCount;
  travellerCountInput.value = travellerCount;
  document.getElementById('gamePace').value = currentPace;
  document.getElementById('playSoundEffects').checked = playSoundEffects;
  document.getElementById('keepDisplayOn').checked = keepDisplayOn;
  document.getElementById('playMusic').checked = playMusic;
  document.getElementById('playMusicAtNight').checked = playMusicAtNight;
  document.getElementById('youtubePlaylist').value = youtubePlaylistUrl;
  document.getElementById('musicVolume').value = youtubeVolume;
  document.getElementById('soundEffectsVolume').value = soundEffectsVolume;
  document.getElementById('backgroundTheme').value = backgroundTheme;
  document.querySelector(
    'label:has(#musicVolume) .volume-value'
  ).textContent = `${youtubeVolume}%`;
  document.querySelector(
    'label:has(#soundEffectsVolume) .volume-value'
  ).textContent = `${soundEffectsVolume}%`;
  document.getElementById('endOfDaySound').value = endOfDaySound;
  document.getElementById('wakeUpSound').value = wakeUpSoundFile;

  // Enable/disable volume controls based on their respective settings
  const musicVolumeInput = document.getElementById('musicVolume');
  musicVolumeInput.disabled = !playMusic;
  musicVolumeInput.closest('label').classList.toggle('inactive', !playMusic);

  const soundEffectsVolumeInput = document.getElementById('soundEffectsVolume');
  soundEffectsVolumeInput.disabled = !playSoundEffects;
  soundEffectsVolumeInput
    .closest('label')
    .classList.toggle('inactive', !playSoundEffects);

  // Update states for music-related elements
  const musicDependentElements = [
    {
      element: document.getElementById('playMusicAtNight').closest('label'),
      type: 'label',
    },
    {
      element: document.getElementById('youtubePlaylist').closest('label'),
      type: 'label',
    },
    {
      element: document.getElementById('useBardcorePlaylist'),
      type: 'link',
    },
    {
      element: document.getElementById('useAtmosphericPlaylist'),
      type: 'link',
    },
    {
      element: document.getElementById('openYoutubePlaylist'),
      type: 'link',
    },
  ];

  // Apply inactive state to all dependent elements
  musicDependentElements.forEach(({ element, type }) => {
    if (element) {
      element.classList.toggle('inactive', !playMusic);
      if (type === 'label') {
        const input = element.querySelector('input, select');
        if (input) {
          input.setAttribute('aria-hidden', !playMusic);
        }
      }
    }
  });

  // Update display elements
  document
    .getElementById('travellerDisplay')
    .classList.toggle('visible', travellerCount > 0);
  document.getElementById('travellerAmount').textContent = travellerCount;
  updateYoutubeLink();
  document.body.setAttribute('data-theme', backgroundTheme);

  // Initialize YouTube player if music is enabled
  if (playMusic) {
    initYoutubePlayer();
  } else {
    const existingContainer = document.querySelector(
      '.youtube-player-container'
    );
    if (existingContainer) {
      existingContainer.remove();
    }
    youtubePlayer = null;
  }

  // Update character amounts and presets
  updateCharacterAmounts(playerCount);
  updateClocktowerPresets();

  // Update sound effects dependent elements
  updateSoundEffects();

  // Show settings dialog on first load
  if (isFirstLoad) {
    requestAnimationFrame(() => {
      settingsDialog.showModal();
    });
  }

  // Update playlist title
  const { playlistId } = extractVideoAndPlaylistIds(youtubePlaylistUrl);
  if (playlistId) {
    fetchPlaylistTitle(playlistId).then((title) => {
      if (title) {
        updatePlaylistBadge(title);
      }
    });
  }
}

// Save settings to localStorage
function saveSettings() {
  const dayInfo = document.querySelector('.day-display');
  const dayState = dayInfo.classList.contains('dusk')
    ? 'dusk'
    : dayInfo.classList.contains('dawn')
    ? 'dawn'
    : '';

  const settings = {
    playerCount,
    travellerCount,
    currentDay,
    currentPace,
    playMusic,
    playMusicAtNight,
    playSoundEffects,
    soundEffectsVolume,
    keepDisplayOn,
    youtubeVolume,
    youtubePlaylistUrl,
    backgroundTheme,
    dayState,
    lastSeenVersion: APP_VERSION,
    endOfDaySound,
    wakeUpSoundFile,
    acceptedPortraitWarning,
  };
  localStorage.setItem('quickTimerSettings', JSON.stringify(settings));
}

// Settings functionality
function updateClocktowerPresets() {
  const clocktowerPresetsDiv = document.getElementById('clocktowerPresets');
  clocktowerPresetsDiv.innerHTML = ''; // Clear existing presets

  const presets = generateDayPresets(playerCount);
  presets.forEach((preset) => {
    const button = document.createElement('button');
    button.className = 'preset-btn clocktower-btn';
    if (preset.day === currentDay) {
      button.classList.add('current-day');
    }
    button.innerHTML = `
      <span class="time">${preset.display}</span>
      <span class="day">Day ${preset.day}</span>
    `;
    button.dataset.minutes = preset.minutes;
    button.dataset.seconds = preset.seconds;
    button.dataset.day = preset.day;

    button.addEventListener('click', (e) => {
      // Update active state
      document
        .querySelectorAll('.clocktower-btn')
        .forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');

      // Update selected time
      selectedMinutes = preset.minutes;
      selectedSeconds = preset.seconds;

      // Reset any existing timer
      clearInterval(timerId);

      // Set and display the new time
      timeLeft = selectedMinutes * 60 + selectedSeconds;
      updateDisplay();

      // Start the timer
      startCountdown();
      startBtn.disabled = false;
      startBtn.textContent = BUTTON_LABELS.PAUSE;
      accelerateBtn.disabled = false;
    });

    clocktowerPresetsDiv.appendChild(button);
  });
}

// Update player count
function updatePlayerCount() {
  playerCount = Math.min(
    Math.max(parseInt(playerCountInput.value) || 5, 5),
    15
  );
  playerCountInput.value = playerCount;
  updateCharacterAmounts(playerCount);
  updateClocktowerPresets();
  saveSettings();
}

// Update traveller count
function updateTravellerCount() {
  travellerCount = Math.min(
    Math.max(parseInt(travellerCountInput.value) || 0, 0),
    5
  );
  travellerCountInput.value = travellerCount;
  document
    .getElementById('travellerDisplay')
    .classList.toggle('visible', travellerCount > 0);
  document.getElementById('travellerAmount').textContent = travellerCount;
  saveSettings();
}

function openSettings() {
  settingsDialog.showModal();

  // Add event listeners for settings tabs
  document.querySelectorAll('.tab-button').forEach((button) => {
    console.log('Adding click listener to tab button:', button.dataset.tab);
    button.addEventListener('click', () => {
      console.log('Tab button clicked:', button.dataset.tab);
      switchSettingsTab(button.dataset.tab);
    });
  });

  // Set initial tab
  switchSettingsTab('game');
}

function closeSettings() {
  saveSettings(); // Always save when closing
  updateDayDisplay(); // Force update of the day display
  updateClocktowerPresets(); // Update the presets to match current day

  // Remove event listeners from tab buttons
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.replaceWith(button.cloneNode(true));
  });

  settingsDialog.close();
}

// Handle settings tab switching
function switchSettingsTab(tabName) {
  console.log('Switching to tab:', tabName);

  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    console.log('Tab button:', button.dataset.tab, 'Active:', isActive);
    button.classList.toggle('active', isActive);
  });

  // Update panels
  document.querySelectorAll('.settings-panel').forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;
    console.log('Panel:', panel.dataset.panel, 'Active:', isActive);
    panel.classList.toggle('active', isActive);
  });
}

// Fullscreen functionality
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch((err) => {
      console.log('Error attempting to enable fullscreen:', err);
    });
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

// Update fullscreen button icon based on state
function updateFullscreenButton() {
  const isFullscreen = document.fullscreenElement !== null;
  fullscreenBtn.innerHTML = isFullscreen
    ? BUTTON_LABELS.FULLSCREEN.EXIT
    : BUTTON_LABELS.FULLSCREEN.ENTER;
}

// Play end sound
function playEndSound() {
  if (!playSoundEffects) return;

  // Stop music if playing and not set to play at night
  if (playMusic && !playMusicAtNight && player) {
    player.pauseVideo();
    const playPauseBtn = document.querySelector('.youtube-control');
    if (playPauseBtn) {
      playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>`;
    }
  }

  isEndSoundPlaying = true;
  startBtn.disabled = true;

  endSound.currentTime = 0; // Reset the sound to start
  endSound.volume = soundEffectsVolume / 100; // Apply volume control
  endSound.play().catch((error) => {
    console.log('Error playing sound:', error);
    // Fallback to beep if sound file fails
    createBeep();
    isEndSoundPlaying = false;
    updateDisplay();
  });

  // Enable the button after the sound finishes
  endSound.addEventListener(
    'ended',
    () => {
      isEndSoundPlaying = false;
      updateDisplay();
      // Resume music if playMusicAtNight is enabled
      if (playMusic && playMusicAtNight && player) {
        player.playVideo();
        const playPauseBtn = document.querySelector('.youtube-control');
        if (playPauseBtn) {
          playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>`;
        }
      }
    },
    { once: true }
  );
}

// Create beep sound (fallback if mp3 fails to load)
function createBeep() {
  if (!playSoundEffects) return;

  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.type = 'sine';
  oscillator.frequency.value = 440;
  gainNode.gain.value = (soundEffectsVolume / 100) * 0.5; // Apply volume control

  oscillator.start();

  // Beep for 0.5 seconds
  setTimeout(() => {
    oscillator.stop();
  }, 500);
}

// Update display
function updateDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  minutesDisplay.textContent = minutes.toString().padStart(2, '0');
  secondsDisplay.textContent = seconds.toString().padStart(2, '0');

  const timerDisplay = document.querySelector('.timer-display');
  const isWakeUpCountdown =
    timerDisplay.classList.contains('wake-up-countdown');

  // Handle the combined button states
  if (isWakeUpCountdown) {
    startBtn.textContent = BUTTON_LABELS.WAKE_UP;
    startBtn.disabled = true;
    accelerateBtn.disabled = true;
    resetBtn.disabled = true; // Disable reset during wake-up countdown
  } else if (isRunning) {
    startBtn.textContent = BUTTON_LABELS.PAUSE;
    startBtn.disabled = false;
    accelerateBtn.disabled = false;
    resetBtn.disabled = false; // Enable reset while running
  } else if (timeLeft > 0) {
    startBtn.textContent = BUTTON_LABELS.RESUME;
    startBtn.disabled = false;
    accelerateBtn.disabled = true;
    resetBtn.disabled = false; // Enable reset when paused with time remaining
  } else {
    startBtn.textContent = BUTTON_LABELS.WAKE_UP;
    startBtn.disabled = isEndSoundPlaying; // Disable during end sound
    accelerateBtn.disabled = true;
    resetBtn.disabled = true; // Disable reset when timer is at 0
  }

  // Update ARIA labels
  timerDisplay.setAttribute(
    'aria-label',
    `Timer: ${minutes} minutes and ${seconds} seconds remaining`
  );
}

// Acceleration functionality
function accelerateTime() {
  if (!isRunning || timeLeft <= 0) return;

  // Calculate a random completion time between 3-10 seconds
  const completionTime = Math.floor(Math.random() * 8000) + 3000; // 3000-10000ms

  // Calculate how many intervals we need
  const intervals = Math.min(timeLeft, Math.floor(completionTime / 50)); // Use 50ms intervals
  const timePerTick = Math.ceil(timeLeft / intervals);

  // Clear existing timer
  clearInterval(timerId);

  // Start accelerated timer
  currentInterval = 50; // 50ms intervals for smooth countdown
  timerId = setInterval(() => {
    timeLeft = Math.max(0, timeLeft - timePerTick);
    updateDisplay();

    if (timeLeft === 0) {
      clearInterval(timerId);
      playEndSound();
      isRunning = false;
      startBtn.disabled = true;
      startBtn.textContent = BUTTON_LABELS.RESUME;
      currentInterval = normalInterval;
      // Stop YouTube player when accelerated time ends
      if (playMusic && youtubePlayer && youtubePlayer.pauseVideo) {
        youtubePlayer.pauseVideo();
      }
      if (currentDay !== null) {
        updateDayDisplay('dusk');
      }
      updateDisplay(); // Make sure to update display one final time
    }
  }, currentInterval);

  // Disable accelerate button after use
  accelerateBtn.disabled = true;
}

// Start timer
function startTimer() {
  if (isRunning) {
    // Pause timer
    timerUtils.stop();
    if (playMusic && player) {
      player.pauseVideo();
      const playPauseBtn = document.querySelector('.youtube-control');
      if (playPauseBtn) {
        playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>`;
      }
    }
    return;
  }

  // If we have remaining time, resume the timer
  if (timeLeft > 0) {
    isRunning = true;
    if (playMusic && player) {
      player.playVideo();
      const playPauseBtn = document.querySelector('.youtube-control');
      if (playPauseBtn) {
        playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>`;
      }
    }
    startCountdown();
    return;
  }

  // If we're at 0, treat this as a Wake Up click
  playWakeUpSound();
}

// Reset timer
function resetTimer() {
  timerUtils.stop();
  if (wakeUpTimeout) {
    clearTimeout(wakeUpTimeout);
    wakeUpTimeout = null;
  }
  timeLeft = 0;
  currentInterval = normalInterval;
  startBtn.disabled = true;
  startBtn.textContent = BUTTON_LABELS.RESUME;
  accelerateBtn.disabled = true;
  resetBtn.disabled = true;

  // Stop music and update play/pause button
  if (playMusic && player) {
    player.stopVideo();
    const playPauseBtn = document.querySelector('.youtube-control');
    if (playPauseBtn) {
      playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>`;
    }
  }

  // Reset day display to normal state
  updateDayDisplay();

  // Clear wake-up countdown state
  document
    .querySelector('.timer-display')
    .classList.remove('wake-up-countdown');

  // Clear active state from preset buttons
  timerUtils.updateButtonStates(document.querySelectorAll('.clocktower-btn'));
}

// Handle minutes preset selection
function handleMinuteClick(e) {
  const minutes = parseInt(e.target.dataset.minutes);
  selectedMinutes = minutes;

  // Update active state
  timerUtils.updateButtonStates(minuteButtons, e.target);

  // If timer is not running, update display
  if (!isRunning) {
    timeLeft = selectedMinutes * 60 + selectedSeconds;
    updateDisplay();
    startBtn.disabled = false;
  }
}

// Handle seconds preset selection
function handleSecondClick(e) {
  const seconds = parseInt(e.target.dataset.seconds);
  selectedSeconds = seconds;

  // Update active state
  timerUtils.updateButtonStates(secondButtons, e.target);

  // If timer is not running, update display
  if (!isRunning) {
    timeLeft = selectedMinutes * 60 + selectedSeconds;
    updateDisplay();
    startBtn.disabled = false;
  }
}

// Fullscreen change event listener
document.addEventListener('fullscreenchange', updateFullscreenButton);

// Add handlers for number input increment/decrement buttons
document.querySelectorAll('.number-input-group button').forEach((button) => {
  button.addEventListener('click', (e) => {
    const input = document.getElementById(e.target.dataset.input);
    const min = parseInt(input.min);
    const max = parseInt(input.max);
    const currentValue = parseInt(input.value) || min;

    if (button.classList.contains('increment')) {
      input.value = Math.min(currentValue + 1, max);
    } else {
      input.value = Math.max(currentValue - 1, min);
    }

    // Trigger the change event
    input.dispatchEvent(new Event('change'));
  });
});

function playWakeUpSound() {
  if (isRunning) {
    resetTimer();
  }

  // Clear any existing wake-up timeout
  if (wakeUpTimeout) {
    clearTimeout(wakeUpTimeout);
  }

  if (playSoundEffects) {
    // Stop music if playing and not set to play at night
    if (playMusic && !playMusicAtNight) {
      youtubeUtils.pause();
    }

    wakeUpSound.currentTime = 0;
    wakeUpSound.volume = soundEffectsVolume / 100; // Apply volume control
    wakeUpSound.play().catch((error) => {
      console.log('Error playing wake-up sound:', error);
      createBeep();
    });
  }

  // Only increment day if we're in dusk state
  const dayInfo = document.querySelector('.day-display');
  if (currentDay !== null && dayInfo.classList.contains('dusk')) {
    currentDay++;
    saveSettings();
  }

  // Start countdown display
  const timerDisplay = document.querySelector('.timer-display');
  timerDisplay.classList.add('wake-up-countdown');

  // Show dawn state for current day
  updateDayDisplay('dawn');

  // Keep Wake Up label but disable the button during countdown
  startBtn.disabled = true;
  startBtn.textContent = BUTTON_LABELS.WAKE_UP;
  accelerateBtn.disabled = true;

  let countdownSeconds = 10;
  timeLeft = countdownSeconds;
  updateDisplay();

  // Update countdown every second
  timerId = setInterval(() => {
    timeLeft--;
    updateDisplay();

    if (timeLeft === 0) {
      clearInterval(timerId);
      timerDisplay.classList.remove('wake-up-countdown');

      // Remove dawn state and show regular day display
      updateDayDisplay();

      // Find and start the current day's timer
      const dayPreset = document.querySelector(
        `.clocktower-btn[data-day="${currentDay}"]`
      );
      if (dayPreset) {
        dayPreset.click();
      }
    }
  }, 1000);

  // Store the countdown interval ID
  wakeUpTimeout = timerId;
}

function startCountdown() {
  isRunning = true;

  // Start music if enabled and not in dusk state
  const dayInfo = document.querySelector('.day-display');
  const isDusk = dayInfo && dayInfo.classList.contains('dusk');
  if (playMusic && !isDusk) {
    if (player && player.getPlayerState() !== YT.PlayerState.PLAYING) {
      player.playVideo();
      // Update play/pause button state
      const playPauseBtn = document.querySelector('.youtube-control');
      if (playPauseBtn) {
        playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
        </svg>`;
      }
    }
  }

  timerId = setInterval(() => {
    timeLeft--;
    updateDisplay();

    if (timeLeft === 0) {
      clearInterval(timerId);
      playEndSound();
      isRunning = false;
      if (playMusic && player && player.pauseVideo) {
        player.pauseVideo();
        // Update play/pause button state
        const playPauseBtn = document.querySelector('.youtube-control');
        if (playPauseBtn) {
          playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>`;
        }
      }
      if (currentDay !== null) {
        updateDayDisplay('dusk');
      }
      updateDisplay();
    }
  }, normalInterval);
}

function startNewGame() {
  // Reset timer state
  clearInterval(timerId);
  timeLeft = 0;
  isRunning = false;
  currentInterval = normalInterval;

  // Set to Day 1
  currentDay = 1;
  updateDayDisplay();

  // Set button to Wake Up state
  startBtn.disabled = false;
  startBtn.textContent = BUTTON_LABELS.WAKE_UP;
  accelerateBtn.disabled = true; // Accelerate button should start disabled

  saveSettings();
  closeSettings();

  // Stop any playing video and reshuffle playlist
  if (playMusic && youtubePlayer) {
    const { playlistId } = extractVideoAndPlaylistIds(youtubePlaylistUrl);
    if (playlistId) {
      youtubePlayer.stopVideo();
      youtubePlayer.setShuffle(true);
      youtubePlayer.cuePlaylist({
        list: playlistId,
        listType: 'playlist',
        index: Math.floor(Math.random() * 50),
        suggestedQuality: 'small',
      });
    }
  }
}

// Update day display
function updateDayDisplay(state = '') {
  const dayInfo = document.querySelector('.day-display');
  if (!dayInfo) return;

  // Remove existing state classes
  dayInfo.classList.remove('dawn', 'dusk');

  // Ensure currentDay is at least 1
  if (currentDay === null || currentDay === undefined) {
    currentDay = 1;
  }

  const paceEmojis = {
    relaxed: '🐌',
    normal: '🏃',
    speedy: '⚡',
  };
  const paceEmoji = paceEmojis[currentPace];
  const paceText = currentPace.charAt(0).toUpperCase() + currentPace.slice(1);

  if (state === 'dawn') {
    dayInfo.classList.add('dawn');
    dayInfo.innerHTML = `<span>${currentDay}</span><div class="pace-indicator">${paceEmoji} ${paceText}</div>`;
  } else if (state === 'dusk') {
    dayInfo.classList.add('dusk');
    dayInfo.innerHTML = `<span>${currentDay}</span><div class="pace-indicator">${paceEmoji} ${paceText}</div>`;
    // Ensure button states are correct for dusk
    startBtn.disabled = false;
    startBtn.textContent = BUTTON_LABELS.WAKE_UP;
    accelerateBtn.disabled = true;
    resetBtn.disabled = true;
  } else {
    dayInfo.innerHTML = `<span>${currentDay}</span><div class="pace-indicator">${paceEmoji} ${paceText}</div>`;
  }

  // Update preset button highlighting
  document.querySelectorAll('.clocktower-btn').forEach((btn) => {
    btn.classList.toggle(
      'current-day',
      parseInt(btn.dataset.day) === currentDay
    );
  });

  // Save the current state
  saveSettings();
}

// Generate QR code for the website
function generateQRCode() {
  const url = 'https://timer.arcane-scripts.net';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
    url
  )}`;
  document.getElementById('qrCode').src = qrCodeUrl;
}

// Info dialog functionality
function openInfo() {
  generateQRCode();
  // Display current version
  document.getElementById('currentVersion').textContent = APP_VERSION;
  infoDialog.showModal();
}

// Add event listener for changelog link
document.getElementById('viewChangelog').addEventListener('click', (e) => {
  e.preventDefault();
  infoDialog.close();
  showChangeHistory();
});

function closeInfo() {
  infoDialog.close();
}

// Update game pace
function updateGamePace(newPace) {
  currentPace = newPace;
  updateClocktowerPresets();
  updateDayDisplay();
  saveSettings();

  // If timer is running, adjust current time
  if (isRunning && timeLeft > 0) {
    const oldTimeLeft = timeLeft;
    const multiplier =
      PACE_MULTIPLIERS[newPace] / PACE_MULTIPLIERS[currentPace];
    timeLeft = Math.round(oldTimeLeft * multiplier);
    updateDisplay();
  }
}

// Function to generate day presets with pace adjustment
function generateDayPresets(playerCount) {
  const { totalNumbers, dayStartValue, dayEndValue } =
    calcTimerStartEndValues(playerCount);
  const numberOfDays = Math.floor(totalNumbers);
  const presets = [];
  const paceMultiplier = PACE_MULTIPLIERS[currentPace];

  for (let day = 1; day <= numberOfDays; day++) {
    // Linear interpolation between start and end values
    const progress = (day - 1) / (numberOfDays - 1);
    const minutes = roundToNearestQuarter(
      (dayStartValue - progress * (dayStartValue - dayEndValue)) *
        paceMultiplier
    );

    // Convert to MM:SS format
    const wholeMinutes = Math.floor(minutes);
    const seconds = Math.round((minutes % 1) * 60);
    presets.push({
      minutes: wholeMinutes,
      seconds: seconds,
      display: `${String(wholeMinutes).padStart(2, '0')}:${String(
        seconds
      ).padStart(2, '0')}`,
      day: day,
    });
  }

  return presets;
}

// Add event listener for game pace changes
document.getElementById('gamePace').addEventListener('change', (e) => {
  updateGamePace(e.target.value);
});

// YouTube player functionality
let youtubeApiReady = false;
let player = null;

// Load YouTube IFrame API
function loadYoutubeApi() {
  if (
    !window.YT &&
    !document.querySelector('script[src*="youtube.com/iframe_api"]')
  ) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }
}

function initYoutubePlayer() {
  if (!window.YT || !youtubeApiReady) {
    loadYoutubeApi();
  } else {
    createYoutubePlayer();
  }
}

// Called by YouTube API when ready
window.onYouTubeIframeAPIReady = function () {
  youtubeApiReady = true;
  if (playMusic) {
    createYoutubePlayer();
  }
};

function createYoutubePlayerContainer() {
  const container = document.createElement('div');
  container.className = 'youtube-player-container';

  const playlistNameSpan = document.createElement('span');
  playlistNameSpan.className = 'playlist-name';

  const playlistLabel = document.createElement('span');
  playlistLabel.className = 'playlist-label';
  if (youtubePlaylistUrl === DEFAULT_YOUTUBE_PLAYLIST) {
    playlistLabel.textContent = 'Bardcore';
  } else if (youtubePlaylistUrl === ATMOSPHERIC_PLAYLIST) {
    playlistLabel.textContent = 'Atmospheric';
  } else {
    playlistLabel.textContent = 'Custom';
  }

  const trackTitle = document.createElement('span');
  trackTitle.className = 'track-title';
  trackTitle.textContent = 'Not Playing';

  playlistNameSpan.appendChild(playlistLabel);
  playlistNameSpan.appendChild(trackTitle);
  container.appendChild(playlistNameSpan);

  const playPauseBtn = document.createElement('button');
  playPauseBtn.className = 'youtube-control';
  playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z"/>
  </svg>`;
  playPauseBtn.addEventListener('click', () => {
    if (!player) return;
    if (player.getPlayerState() === YT.PlayerState.PLAYING) {
      player.pauseVideo();
      playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>`;
    } else {
      player.playVideo();
      playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
      </svg>`;
    }
  });
  container.appendChild(playPauseBtn);

  const playerDiv = document.createElement('div');
  playerDiv.id = 'youtube-player';
  container.appendChild(playerDiv);

  document.body.appendChild(container);
  return container;
}

async function createYoutubePlayer() {
  try {
    // Remove existing player and container
    if (player) {
      try {
        player.destroy();
      } catch (e) {
        console.log('Error destroying player:', e);
      }
      player = null;
    }

    const existingContainer = document.querySelector(
      '.youtube-player-container'
    );
    if (existingContainer) {
      existingContainer.remove();
    }

    // Create new container with controls
    createYoutubePlayerContainer();

    // Extract video and playlist IDs
    const { videoId, playlistId } =
      extractVideoAndPlaylistIds(youtubePlaylistUrl);
    if (!videoId && !playlistId) return;

    // Set initial playlist name
    if (youtubePlaylistUrl === DEFAULT_YOUTUBE_PLAYLIST) {
      updatePlaylistBadge('Bardcore');
    } else if (youtubePlaylistUrl === ATMOSPHERIC_PLAYLIST) {
      updatePlaylistBadge('Atmospheric');
    } else {
      updatePlaylistBadge('Custom');
    }

    // Create new player
    player = new YT.Player('youtube-player', {
      height: '1',
      width: '1',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        loop: 1,
        playlist: playlistId,
        iv_load_policy: 3,
        cc_load_policy: 0,
        showinfo: 0,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError,
      },
    });
  } catch (error) {
    console.error('Error initializing YouTube player:', error);
    updatePlaylistBadge('');
  }
}

function onPlayerReady(event) {
  event.target.setVolume(youtubeVolume);
  const { playlistId } = extractVideoAndPlaylistIds(youtubePlaylistUrl);

  if (playlistId) {
    event.target.cuePlaylist({
      list: playlistId,
      listType: 'playlist',
      index: Math.floor(Math.random() * 50),
      suggestedQuality: 'small',
    });
  }

  // If timer is already running, start playing
  if (isRunning && timeLeft > 0) {
    const dayInfo = document.querySelector('.day-display');
    const isDusk = dayInfo && dayInfo.classList.contains('dusk');
    if (!isDusk) {
      event.target.playVideo();
    }
  }
}

function onPlayerStateChange(event) {
  const playPauseBtn = document.querySelector('.youtube-control');

  if (event.data === YT.PlayerState.PLAYING) {
    if (playPauseBtn) {
      playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
      </svg>`;
    }
    // Get and display the current track title
    const title = player.getVideoData().title;
    if (title) {
      updatePlaylistBadge(title);
    }
  } else if (
    event.data === YT.PlayerState.PAUSED ||
    event.data === YT.PlayerState.CUED
  ) {
    if (playPauseBtn) {
      playPauseBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>`;
    }
  } else if (event.data === YT.PlayerState.ENDED) {
    const { playlistId } = extractVideoAndPlaylistIds(youtubePlaylistUrl);
    if (playlistId) {
      event.target.setShuffle(true);
      event.target.playVideoAt(0);
    } else {
      event.target.playVideo();
    }
  }
}

function onPlayerError(event) {
  console.error('YouTube player error:', event);
  updatePlaylistBadge('');
}

// Update YouTube playlist URL
function updateYoutubePlaylist() {
  const input = document.getElementById('youtubePlaylist');
  const newUrl = input.value;

  // Extract IDs to validate URL
  const { videoId, playlistId } = extractVideoAndPlaylistIds(newUrl);

  // Only update if we have a valid video or playlist ID
  if (videoId || playlistId) {
    youtubePlaylistUrl = newUrl;
    saveSettings();

    // Clear the badge - it will be updated when the player loads
    updatePlaylistBadge('');

    // If music is enabled, update the player immediately
    if (playMusic) {
      // Always destroy and recreate the player for URL changes
      if (youtubePlayer) {
        try {
          youtubePlayer.destroy();
        } catch (e) {
          console.log('Error destroying player:', e);
        }
        youtubePlayer = null;
      }

      // Remove the container
      const container = document.querySelector('.youtube-player-container');
      if (container) {
        container.remove();
      }

      // Create new player with updated URL
      createYoutubePlayer();
    }
  } else {
    // If invalid URL, revert to the saved URL
    console.log('Invalid YouTube URL, reverting to saved URL');
    input.value = youtubePlaylistUrl;
  }
}

// Toggle music playback
function updateMusicPlayback() {
  playMusic = document.getElementById('playMusic').checked;

  // Update states for music-related elements
  const playMusicAtNightLabel = document
    .getElementById('playMusicAtNight')
    .closest('label');
  const youtubePlaylistLabel = document
    .getElementById('youtubePlaylist')
    .closest('label');

  document
    .getElementById('youtubePlaylist')
    .setAttribute('aria-hidden', !playMusic);
  document
    .getElementById('musicVolume')
    .setAttribute('aria-hidden', !playMusic);
  document
    .getElementById('playMusicAtNight')
    .setAttribute('aria-hidden', !playMusic);

  playMusicAtNightLabel.classList.toggle('inactive', !playMusic);
  youtubePlaylistLabel.classList.toggle('inactive', !playMusic);

  document
    .getElementById('useBardcorePlaylist')
    .classList.toggle('inactive', !playMusic);
  document
    .getElementById('useAtmosphericPlaylist')
    .classList.toggle('inactive', !playMusic);
  document
    .getElementById('openYoutubePlaylist')
    .classList.toggle('inactive', !playMusic);

  if (playMusic) {
    initYoutubePlayer();
  } else {
    // Stop and remove the player
    youtubeUtils.stop();
    const container = document.querySelector('.youtube-player-container');
    if (container) {
      container.remove();
    }
    youtubePlayer = null;
  }
  saveSettings();
}

// Update YouTube volume
function updateYoutubeVolume() {
  youtubeVolume = parseInt(document.getElementById('musicVolume').value);
  document.querySelector(
    'label:has(#musicVolume) .volume-value'
  ).textContent = `${youtubeVolume}%`;
  if (youtubePlayer && youtubePlayer.setVolume) {
    youtubePlayer.setVolume(youtubeVolume);
  }
  saveSettings();
}

// Update sound effects playback
function updateSoundEffects() {
  playSoundEffects = document.getElementById('playSoundEffects').checked;

  // Get all sound effect dependent elements
  const soundDependentElements = [
    {
      element: document.querySelector('label:has(#endOfDaySound)'),
      type: 'label',
    },
    {
      element: document.querySelector('label:has(#wakeUpSound)'),
      type: 'label',
    },
    {
      element: document.querySelector('label:has(#soundEffectsVolume)'),
      type: 'label',
    },
  ];

  // Apply inactive state to all dependent elements
  soundDependentElements.forEach(({ element, type }) => {
    if (element) {
      element.classList.toggle('inactive', !playSoundEffects);
      element.setAttribute(
        'data-inactive-message',
        'Enable "Play Sound Effects" first'
      );
      if (type === 'label') {
        const input = element.querySelector('select, input');
        if (input) {
          input.setAttribute('aria-hidden', !playSoundEffects);
        }
      }
    }
  });

  saveSettings();
}

// Update sound effects volume
function updateSoundEffectsVolume() {
  soundEffectsVolume = parseInt(
    document.getElementById('soundEffectsVolume').value
  );
  document.querySelector(
    'label:has(#soundEffectsVolume) .volume-value'
  ).textContent = `${soundEffectsVolume}%`;
  saveSettings();
}

// Update background theme
function updateBackgroundTheme() {
  backgroundTheme = document.getElementById('backgroundTheme').value;
  document.body.setAttribute('data-theme', backgroundTheme);
  saveSettings();
}

// Extract video and playlist IDs from YouTube URL
function extractVideoAndPlaylistIds(url) {
  const videoRegex =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const playlistRegex = /[?&]list=([^#\&\?]+)/;

  const videoMatch = url.match(videoRegex);
  const playlistMatch = url.match(playlistRegex);

  return {
    videoId: videoMatch ? videoMatch[1] : null,
    playlistId: playlistMatch ? playlistMatch[1] : null,
  };
}

// Update YouTube link URL
function updateYoutubeLink() {
  const youtubeLink = document.getElementById('openYoutubePlaylist');
  youtubeLink.href = youtubePlaylistUrl;
  youtubeLink.classList.toggle('disabled', !playMusic);
}

// Update the badge function
function updatePlaylistBadge(title) {
  const playlistName = document.querySelector('.playlist-name');
  if (!playlistName) return;

  const playlistLabel = playlistName.querySelector('.playlist-label');
  const trackTitle = playlistName.querySelector('.track-title');

  // Update playlist label if needed
  if (!title) {
    if (youtubePlaylistUrl === DEFAULT_YOUTUBE_PLAYLIST) {
      playlistLabel.textContent = 'Bardcore';
    } else if (youtubePlaylistUrl === ATMOSPHERIC_PLAYLIST) {
      playlistLabel.textContent = 'Atmospheric';
    } else {
      playlistLabel.textContent = 'Custom';
    }
    trackTitle.textContent = 'Not Playing';
  } else {
    // Update track title
    if (title.length > 40) {
      trackTitle.textContent = title.substring(0, 37) + '...';
    } else {
      trackTitle.textContent = title;
    }
    trackTitle.title = title; // Add full title as tooltip
  }
}

// Show What's New dialog (for version updates)
function showWhatsNew(lastVersion) {
  // Compare versions properly using string comparison
  const versions = Object.entries(CHANGELOG)
    .filter(([version]) => {
      const [lastMajor, lastMinor, lastPatch] = lastVersion
        .split('.')
        .map(Number);
      const [verMajor, verMinor, verPatch] = version.split('.').map(Number);
      const [currMajor, currMinor, currPatch] =
        APP_VERSION.split('.').map(Number);

      // Create comparable numbers (e.g., 1.0.0 -> 100000)
      const lastNum = lastMajor * 10000 + lastMinor * 100 + lastPatch;
      const verNum = verMajor * 10000 + verMinor * 100 + verPatch;
      const currNum = currMajor * 10000 + currMinor * 100 + currPatch;

      // Show all versions between lastSeenVersion and current version
      return verNum > lastNum && verNum <= currNum;
    })
    .sort(([a], [b]) => {
      const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
      const [bMajor, bMinor, bPatch] = b.split('.').map(Number);
      const aNum = aMajor * 10000 + aMinor * 100 + aPatch;
      const bNum = bMajor * 10000 + bMinor * 100 + bPatch;
      return bNum - aNum;
    });

  if (versions.length === 0) return;

  // Get the most recent version for the header
  const [latestVersion, latestData] = versions[0];

  // Update dialog header with latest version
  document.querySelector(
    '.version-number'
  ).textContent = `Version ${latestVersion}`;
  document.querySelector('.version-date').textContent = latestData.date;

  // Create the content for all versions
  const content = document.querySelector('.changes-container');
  content.innerHTML = versions
    .map(([version, data]) => {
      const features = data.changes.features || [];
      const improvements = data.changes.improvements || [];

      return `
        ${
          version !== latestVersion
            ? `
          <div class="version-info">
            <span class="version-number">Version ${version}</span>
            <span class="version-date">${data.date}</span>
          </div>
        `
            : ''
        }
        ${
          features.length > 0
            ? `
          <div class="changes-section">
            <h3>New Features</h3>
            <ul class="features-list">
              ${features.map((feature) => `<li>${feature}</li>`).join('')}
            </ul>
          </div>
        `
            : ''
        }
        ${
          improvements.length > 0
            ? `
          <div class="changes-section">
            <h3>Improvements</h3>
            <ul class="improvements-list">
              ${improvements
                .map((improvement) => `<li>${improvement}</li>`)
                .join('')}
            </ul>
          </div>
        `
            : ''
        }
        ${
          version !== versions[versions.length - 1][0]
            ? '<hr class="version-separator">'
            : ''
        }
      `;
    })
    .join('');

  // Show dialog
  whatsNewDialog.showModal();
}

// Show Change History dialog (shows all versions)
function showChangeHistory() {
  const content = document.getElementById('changeHistoryContent');
  const versions = Object.entries(CHANGELOG).sort(
    ([a], [b]) => parseFloat(b) - parseFloat(a)
  );

  let html = '';
  versions.forEach(([version, data], index) => {
    const features = data.changes.features || [];
    const improvements = data.changes.improvements || [];

    html += `
      <div class="version-info">
        <span class="version-number">Version ${version}</span>
        <span class="version-date">${data.date}</span>
      </div>
      <div class="changes-container">
        ${
          features.length > 0
            ? `
          <div class="changes-section">
            <h3>New Features</h3>
            <ul class="features-list">
              ${features.map((feature) => `<li>${feature}</li>`).join('')}
            </ul>
          </div>
        `
            : ''
        }
        ${
          improvements.length > 0
            ? `
          <div class="changes-section">
            <h3>Improvements</h3>
            <ul class="improvements-list">
              ${improvements
                .map((improvement) => `<li>${improvement}</li>`)
                .join('')}
            </ul>
          </div>
        `
            : ''
        }
      </div>
      ${index < versions.length - 1 ? '<hr class="version-separator">' : ''}
    `;
  });

  content.innerHTML = html;
  changeHistoryDialog.showModal();
}

// Close What's New dialog
function closeWhatsNew() {
  whatsNewDialog.close();
}

// Close Change History dialog
function closeChangeHistory() {
  changeHistoryDialog.close();
}

// Add keyboard navigation support
function setupKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    // Existing keyboard shortcuts
    if (e.key.toLowerCase() === 'q' && !settingsDialog.open) {
      openSettings();
    }
    if (e.key.toLowerCase() === 'i' && !infoDialog.open) {
      openInfo();
    }

    // New keyboard shortcuts
    if (e.key === ' ' || e.key === 'Enter') {
      // Space or Enter
      if (!settingsDialog.open && !infoDialog.open) {
        e.preventDefault();
        startTimer();
      }
    }
    if (e.key === 'r' && !settingsDialog.open && !infoDialog.open) {
      // R key
      resetTimer();
    }
    if (e.key === 'f') {
      // F key
      e.preventDefault();
      toggleFullscreen();
    }
    if (e.key === 'Escape' && document.fullscreenElement) {
      document.exitFullscreen();
    }
  });
}

// Enhance error handling for async operations
async function safeAsyncOperation(operation, fallback = null) {
  try {
    return await operation();
  } catch (error) {
    console.error(`Operation failed: ${error.message}`);
    return fallback;
  }
}
