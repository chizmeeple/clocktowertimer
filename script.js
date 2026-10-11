import { orientationUtils, updateCharacterAmounts } from './helper.js';
import {
  COUNTDOWN_REFRESH_MS,
  NORMAL_COUNTDOWN_MS_PER_REAL_MS,
  createTimerEngine,
  displaySeconds,
} from './timerEngine.js';
import {
  DEFAULT_PACE,
  PACE_MULTIPLIERS,
  WAKE_UP_COUNTDOWN_SECONDS,
  createGameState,
  estimateGameLengthMinutes,
  getPresetDayLabel,
  listVisiblePresets,
  nominationsDelaySeconds,
  presetForDay,
  stepNominationsCountdown,
} from './gameState.js';

// Show timer digits only after Azeret Mono has loaded to prevent font flicker
(function () {
  function showTimer() {
    document.documentElement.classList.add('fonts-ready');
  }
  if (document.fonts?.load) {
    document.fonts
      .load('600 1em "Azeret Mono"')
      .then(showTimer)
      .catch(showTimer);
    setTimeout(showTimer, 3000); // Show anyway if font fails or is slow
  } else {
    showTimer();
  }
})();

// DOM Elements
let minutesDisplay,
  secondsDisplay,
  timerDisplayEl,
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

let updateCurrentTimeDisplay = () => {};
let updateSessionCountdownDisplay = () => {};

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const SESSION_COUNTDOWN_HOUR_THRESHOLD_MS = 90 * ONE_MINUTE_MS;
const STALE_TAB_MS = 2 * ONE_DAY_MS;
const STALE_TAB_REFRESH_SECONDS = 10;
const STALE_TAB_HELD_MESSAGE =
  'This tab has been inactive for a while. Automatic refresh is paused while a game is in progress.';
const LAST_ACTIVE_AT_KEY = 'towerTimerLastActiveAt';
const SETTINGS_STORAGE_KEY = 'towerTimerSettings';
const LEGACY_SETTINGS_STORAGE_KEY = 'quickTimerSettings';

let hasWarnedAboutStorage = false;

function warnStorageUnavailable() {
  if (hasWarnedAboutStorage) return;
  hasWarnedAboutStorage = true;
  console.warn(
    'Browser storage is unavailable; continuing with in-memory settings.'
  );
}

function readStorageItem(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    warnStorageUnavailable();
    return null;
  }
}

function writeStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    warnStorageUnavailable();
    return false;
  }
}

function removeStorageItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    warnStorageUnavailable();
    return false;
  }
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function migrateLegacySettings() {
  const legacySettings = readStorageItem(LEGACY_SETTINGS_STORAGE_KEY);
  if (legacySettings === null) return;

  if (!writeStorageItem(SETTINGS_STORAGE_KEY, legacySettings)) return;
  removeStorageItem(LEGACY_SETTINGS_STORAGE_KEY);
}

function getSessionEndDate(now, hour, minute) {
  const end = new Date(now);
  end.setHours(hour, minute, 0, 0);

  if (end <= now) {
    if (hour < 12 && now.getHours() >= 12) {
      end.setDate(end.getDate() + 1);
    } else {
      return null;
    }
  }

  return end;
}

function formatSessionCountdownText(remainingMs) {
  if (remainingMs <= 0) {
    return { text: "TIME'S UP!", phase: 'times-up' };
  }

  if (remainingMs >= SESSION_COUNTDOWN_HOUR_THRESHOLD_MS) {
    const hours = Math.floor(remainingMs / ONE_HOUR_MS);
    return {
      text: `${hours} hour${hours === 1 ? '' : 's'} remaining`,
      phase: 'hours',
    };
  }

  const minutes = Math.max(1, Math.ceil(remainingMs / ONE_MINUTE_MS));
  return {
    text: `${minutes} minute${minutes === 1 ? '' : 's'} remaining`,
    phase: 'minutes',
  };
}

function initSessionEndTimeSelectors() {
  const hourSelect = document.getElementById('sessionEndHour');
  const minuteSelect = document.getElementById('sessionEndMinute');
  if (!hourSelect || !minuteSelect || hourSelect.options.length > 0) return;

  for (let hour = 0; hour < 24; hour += 1) {
    const option = document.createElement('option');
    option.value = hour;
    option.textContent = String(hour).padStart(2, '0');
    hourSelect.appendChild(option);
  }

  for (let minute = 0; minute < 60; minute += 1) {
    const option = document.createElement('option');
    option.value = minute;
    option.textContent = String(minute).padStart(2, '0');
    minuteSelect.appendChild(option);
  }
}

function updateTimeSettingsUi() {
  const showCurrentTimeInput = document.getElementById('showCurrentTime');
  if (showCurrentTimeInput) {
    showCurrentTimeInput.checked = showCurrentTime;
  }

  const currentTimeEl = document.getElementById('currentTime');
  if (currentTimeEl) {
    currentTimeEl.hidden = !showCurrentTime;
  }

  document
    .querySelectorAll('label:has(input[name="clockFormat"])')
    .forEach((label) => {
      label.classList.toggle('inactive', !showCurrentTime);
      const input = label.querySelector('input');
      if (input) {
        input.disabled = !showCurrentTime;
      }
    });

  const showSessionCountdownInput = document.getElementById(
    'showSessionCountdown'
  );
  if (showSessionCountdownInput) {
    showSessionCountdownInput.checked = showSessionCountdown;
  }

  const sessionEndHourSelect = document.getElementById('sessionEndHour');
  const sessionEndMinuteSelect = document.getElementById('sessionEndMinute');
  if (sessionEndHourSelect) {
    sessionEndHourSelect.value = String(sessionEndHour);
    sessionEndHourSelect.disabled = !showSessionCountdown;
  }
  if (sessionEndMinuteSelect) {
    sessionEndMinuteSelect.value = String(sessionEndMinute);
    sessionEndMinuteSelect.disabled = !showSessionCountdown;
  }

  const sessionEndTimeLabel = document.getElementById('sessionEndTimeLabel');
  if (sessionEndTimeLabel) {
    sessionEndTimeLabel.classList.toggle('inactive', !showSessionCountdown);
  }

  const sessionCountdownEl = document.getElementById('sessionCountdown');
  if (sessionCountdownEl) {
    sessionCountdownEl.hidden = !showSessionCountdown;
  }

  if (showCurrentTime) {
    updateCurrentTimeDisplay();
  }
  if (showSessionCountdown) {
    updateSessionCountdownDisplay();
  }
}

function initTimeDisplays() {
  initSessionEndTimeSelectors();

  const currentTimeEl = document.getElementById('currentTime');
  const sessionCountdownEl = document.getElementById('sessionCountdown');

  updateCurrentTimeDisplay = () => {
    if (!currentTimeEl) return;
    const now = new Date();
    currentTimeEl.dateTime = now.toISOString();
    currentTimeEl.textContent = now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: clockFormat === '12',
    });
  };

  updateSessionCountdownDisplay = () => {
    if (!sessionCountdownEl) return;

    const now = new Date();
    const sessionEnd = getSessionEndDate(now, sessionEndHour, sessionEndMinute);
    const remainingMs = sessionEnd ? sessionEnd - now : 0;
    const { text, phase } = formatSessionCountdownText(remainingMs);

    sessionCountdownEl.textContent = text;
    sessionCountdownEl.setAttribute('aria-label', text);
    sessionCountdownEl.classList.toggle('final-hour', phase === 'minutes');
    sessionCountdownEl.classList.toggle('times-up', phase === 'times-up');
  };

  const tickTimeDisplays = () => {
    if (showCurrentTime) {
      updateCurrentTimeDisplay();
    }
    if (showSessionCountdown) {
      updateSessionCountdownDisplay();
    }
  };

  tickTimeDisplays();
  setInterval(tickTimeDisplays, 1000);
}

// Utility functions
const connectivityUtils = {
  isOnline: () => navigator.onLine,
  addStatusListener: (onlineCallback, offlineCallback) => {
    globalThis.addEventListener('online', onlineCallback);
    globalThis.addEventListener('offline', offlineCallback);
  },
  removeStatusListener: (onlineCallback, offlineCallback) => {
    globalThis.removeEventListener('online', onlineCallback);
    globalThis.removeEventListener('offline', offlineCallback);
  },
};

// Set when this page starts a countdown or restores a dawn/dusk phase.
// A finished, paused, or between-days timer does not clear it. Reset Day
// and Start New Game do. A fresh page with no live session stays idle.
let gameSessionActive = false;
// Dawn/dusk in storage is consulted only until saved settings are applied.
let initialSettingsApplied = false;

function peekSavedDayState() {
  const raw = readStorageItem(SETTINGS_STORAGE_KEY);
  if (!raw) return '';
  const parsed = parseStoredSettings(raw);
  if (!parsed.ok || !isPlainObject(parsed.value)) return '';
  return readDayState(parsed.value.dayState);
}

// Automatic reload is allowed only when this page can positively show that
// no game is in progress. Anything uncertain stays on the page.
function isSafeToAutoRefresh() {
  if (gameSessionActive) return false;
  if (timer.isRunning() || timer.isCountdownActive() || timer.getCountdownKind()) {
    return false;
  }
  if (wakeUpTimeout) return false;
  if (isEndSoundPlaying) return false;
  if (autoOpenNominationsInterval) return false;
  // A paused countdown still has time left. Reset Day sets hasReset.
  if (timer.getTimeLeft() > 0 && !timer.hasReset()) return false;
  if (game.getPhase() === 'dawn' || game.getPhase() === 'dusk') return false;

  if (!initialSettingsApplied) {
    const savedDayState = peekSavedDayState();
    if (savedDayState === 'dawn' || savedDayState === 'dusk') return false;
  }

  return true;
}

function beginGameSession() {
  gameSessionActive = true;
  staleTabUtils.onGameActivityChanged();
}

function endGameSession() {
  gameSessionActive = false;
  staleTabUtils.onGameActivityChanged();
}

const staleTabUtils = {
  bannerDismissed: false,
  bannerEl: null,
  messageEl: null,
  statusEl: null,
  progressEl: null,
  refreshTimerId: null,
  refreshGeneration: 0,
  secondsLeft: STALE_TAB_REFRESH_SECONDS,

  markActive() {
    writeStorageItem(LAST_ACTIVE_AT_KEY, String(Date.now()));
  },

  isStale() {
    if (Date.now() - performance.timeOrigin >= STALE_TAB_MS) {
      return true;
    }

    const lastActive = Number(readStorageItem(LAST_ACTIVE_AT_KEY));
    return lastActive > 0 && Date.now() - lastActive >= STALE_TAB_MS;
  },

  countdownUnit() {
    return this.secondsLeft === 1 ? 'second' : 'seconds';
  },

  renderCountdown() {
    if (!this.messageEl) return;
    const count = document.createElement('strong');
    count.textContent = `${this.secondsLeft} ${this.countdownUnit()}`;
    this.messageEl.replaceChildren(
      document.createTextNode(
        'This tab has been inactive for a while. Refreshing in '
      ),
      count,
      document.createTextNode(' to load the latest version.')
    );
  },

  syncBannerHeight() {
    if (!this.bannerEl || this.bannerEl.hasAttribute('hidden')) return;
    document.documentElement.style.setProperty(
      '--stale-tab-banner-height',
      `${this.bannerEl.offsetHeight}px`
    );
  },

  clearRefreshTimer() {
    // Bump the generation first so a callback that already started, or one
    // that still runs after clearInterval, cannot reload the page.
    this.refreshGeneration += 1;
    if (this.refreshTimerId !== null) {
      clearInterval(this.refreshTimerId);
      this.refreshTimerId = null;
    }
  },

  // Explicit Refresh now. This does not consult automatic-refresh safety.
  refreshPage() {
    this.clearRefreshTimer();
    location.reload();
  },

  // Last step of a scheduled refresh. Safety is decided here, not when the
  // countdown was armed. A stale generation means the callback was cancelled.
  requestAutomaticRefresh(generation = this.refreshGeneration) {
    if (generation !== this.refreshGeneration) return;
    if (!isSafeToAutoRefresh()) {
      this.holdAutoRefresh();
      return;
    }
    this.refreshPage();
  },

  renderHeldMessage() {
    if (!this.messageEl) return;
    this.messageEl.textContent = STALE_TAB_HELD_MESSAGE;
  },

  announceCountdown() {
    if (!this.statusEl) return;
    this.statusEl.textContent = `This tab has been inactive for a while. Refreshing automatically in ${STALE_TAB_REFRESH_SECONDS} seconds to load the latest version.`;
  },

  announceHeld() {
    if (!this.statusEl) return;
    this.statusEl.textContent = STALE_TAB_HELD_MESSAGE;
  },

  revealBanner() {
    this.bannerEl.removeAttribute('hidden');
    document.body.classList.add('stale-tab-banner-visible');
    this.syncBannerHeight();
  },

  holdAutoRefresh() {
    this.clearRefreshTimer();
    if (this.progressEl) {
      this.progressEl.style.animation = 'none';
      this.progressEl.style.transform = 'scaleX(0)';
    }
    if (!this.bannerEl || this.bannerEl.hasAttribute('hidden')) return;
    this.renderHeldMessage();
    this.announceHeld();
    this.syncBannerHeight();
  },

  armCountdown() {
    if (this.refreshTimerId !== null) return;
    if (!isSafeToAutoRefresh()) {
      this.holdAutoRefresh();
      return;
    }

    const reduceMotion = globalThis.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    if (this.progressEl) {
      this.progressEl.style.transform = '';
      if (!reduceMotion) {
        this.progressEl.style.animation = 'none';
        void this.progressEl.offsetWidth;
        this.progressEl.style.animation = `stale-tab-refresh-countdown ${STALE_TAB_REFRESH_SECONDS}s linear forwards`;
      }
    }

    const generation = this.refreshGeneration;
    this.refreshTimerId = setInterval(() => {
      if (generation !== this.refreshGeneration) return;
      if (!isSafeToAutoRefresh()) {
        this.holdAutoRefresh();
        return;
      }
      this.secondsLeft -= 1;
      if (this.secondsLeft <= 0) {
        this.requestAutomaticRefresh(generation);
        return;
      }
      this.renderCountdown();
      this.syncBannerHeight();
    }, 1000);
  },

  resumeCountdown() {
    if (this.refreshTimerId !== null) return;
    if (!isSafeToAutoRefresh()) return;
    this.secondsLeft = STALE_TAB_REFRESH_SECONDS;
    this.renderCountdown();
    this.announceCountdown();
    this.armCountdown();
  },

  showBanner() {
    if (!this.bannerEl) return;
    if (!isSafeToAutoRefresh()) {
      this.revealBanner();
      this.holdAutoRefresh();
      return;
    }
    const alreadyCounting =
      !this.bannerEl.hasAttribute('hidden') && this.refreshTimerId !== null;
    if (!alreadyCounting) {
      this.clearRefreshTimer();
      this.secondsLeft = STALE_TAB_REFRESH_SECONDS;
      this.renderCountdown();
    }
    this.revealBanner();
    if (!alreadyCounting) {
      this.announceCountdown();
      this.armCountdown();
    }
  },

  hideBanner() {
    if (!this.bannerEl) return;
    this.clearRefreshTimer();
    if (this.progressEl) {
      this.progressEl.style.animation = 'none';
    }
    this.bannerEl.setAttribute('hidden', '');
    document.body.classList.remove('stale-tab-banner-visible');
    document.documentElement.style.removeProperty('--stale-tab-banner-height');
  },

  checkOnResume() {
    if (this.isStale() && !this.bannerDismissed) {
      this.showBanner();
    }
  },

  // Cancel a pending refresh when a game becomes active, and arm one
  // countdown only when a visible banner becomes safe again.
  onGameActivityChanged() {
    if (!isSafeToAutoRefresh()) {
      if (this.bannerEl && !this.bannerEl.hasAttribute('hidden')) {
        this.holdAutoRefresh();
      } else {
        this.clearRefreshTimer();
      }
      return;
    }

    if (
      this.bannerDismissed ||
      !this.bannerEl ||
      this.bannerEl.hasAttribute('hidden')
    ) {
      return;
    }

    // The banner was shown because the tab was already stale. markActive()
    // updates the stored timestamp, so do not ask isStale() again here.
    this.resumeCountdown();
  },

  onBecameVisible() {
    this.bannerDismissed = false;
    this.checkOnResume();
    this.markActive();
  },

  onBecameHidden() {
    this.markActive();
  },

  init() {
    this.bannerEl = document.getElementById('staleTabBanner');
    this.messageEl = document.getElementById('staleTabMessage');
    this.statusEl = document.getElementById('staleTabStatus');
    this.progressEl = document.getElementById('staleTabProgress');
    document
      .getElementById('staleTabRefreshBtn')
      ?.addEventListener('click', () => {
        this.refreshPage();
      });
    document.getElementById('staleTabDismissBtn')?.addEventListener('click', () => {
      this.bannerDismissed = true;
      this.hideBanner();
    });

    if (globalThis.Cypress) {
      globalThis.staleTabUtils = this;
    }

    this.checkOnResume();
    this.markActive();
  },
};

const youtubeUtils = {
  play: () => {
    runYoutube((player) => {
      player.playVideo?.();
    });
  },
  pause: () => {
    runYoutube((player) => {
      player.pauseVideo?.();
    });
  },
  stop: () => {
    runYoutube((player) => {
      player.stopVideo?.();
    });
  },
};

/** Inline SVG for the in-page YouTube play/pause control (`playing` → show pause icon). */
const YOUTUBE_CONTROL_SVG_PLAY = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const YOUTUBE_CONTROL_SVG_PAUSE = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

function setYoutubeControlButtonIcon(playing) {
  const btn = document.querySelector('.youtube-control');
  if (!btn) return;
  btn.innerHTML = playing ? YOUTUBE_CONTROL_SVG_PAUSE : YOUTUBE_CONTROL_SVG_PLAY;
}

const YOUTUBE_PLAYER_CONTAINER_CLASS = 'youtube-player-container';

function getYoutubePlayerContainer() {
  return document.querySelector(`.${YOUTUBE_PLAYER_CONTAINER_CLASS}`);
}

// Remove the iframe without calling the YouTube API. destroy() can hang the
// page once the network has gone, which freezes day controls.
function detachYoutubePlayer() {
  youtubePlayer = null;
  const container = getYoutubePlayerContainer();
  if (container) {
    container.remove();
  }
}

function destroyYoutubePlayer() {
  const player = youtubePlayer;
  youtubePlayer = null;
  if (player && connectivityUtils.isOnline()) {
    try {
      player.destroy();
    } catch (error) {
      console.log('Error destroying YouTube player:', error);
    }
  }
  detachYoutubePlayer();
}

function runYoutube(fn) {
  if (!playMusic || !youtubePlayer || !connectivityUtils.isOnline()) return;
  try {
    fn(youtubePlayer);
  } catch (error) {
    console.log('YouTube player call failed:', error);
    detachYoutubePlayer();
  }
}

// Play a sound effect without letting a missing file or a dead network stop the timer.
function safePlaySound(audio, { onEnded, onError, fallbackBeep = false } = {}) {
  let finished = false;
  const fail = (error) => {
    if (finished) return;
    finished = true;
    console.log('Error playing sound:', error);
    if (fallbackBeep) {
      try {
        createBeep();
      } catch (beepError) {
        console.log('Error playing fallback beep:', beepError);
      }
    }
    onError?.();
  };

  if (!playSoundEffects || !audio) {
    onError?.();
    return;
  }

  // Seeking or loading while offline can stall the page. Only play media that
  // is already buffered; otherwise fall back to a generated beep.
  const buffered = audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
  if (!connectivityUtils.isOnline() && !buffered) {
    fail(new Error('Sound is not available offline'));
    return;
  }

  try {
    audio.volume = soundEffectsVolume / 100;
    if (connectivityUtils.isOnline()) {
      try {
        audio.currentTime = 0;
      } catch (error) {
        console.log('Could not rewind sound:', error);
        if (!buffered) {
          fail(error);
          return;
        }
      }
    }

    if (onEnded) {
      audio.addEventListener(
        'ended',
        () => {
          if (!finished) onEnded();
        },
        { once: true }
      );
    }

    const playPromise = audio.play();
    if (!playPromise?.then) return;

    const stallTimer = setTimeout(() => {
      fail(new Error('Sound playback stalled'));
    }, 5000);

    playPromise
      .then(() => {
        clearTimeout(stallTimer);
      })
      .catch((error) => {
        clearTimeout(stallTimer);
        fail(error);
      });
  } catch (error) {
    fail(error);
  }
}

const timerUtils = {
  stop: () => {
    timer.pause();
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
    wakeUpTimeout = null;
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

// Keyboard shortcuts utilities
const keyboardShortcutsUtils = {
  isValidShortcut: (event) => {
    // Allow single keys, but exclude some system keys
    const excludedKeys = [
      'F1',
      'F2',
      'F3',
      'F4',
      'F5',
      'F6',
      'F7',
      'F8',
      'F9',
      'F10',
      'F11',
      'F12',
    ];
    const key = event.key.toUpperCase();
    return (
      !excludedKeys.includes(key) &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    );
  },

  checkConflict: (newKey, currentAction) => {
    for (const [action, key] of Object.entries(keyboardShortcuts)) {
      if (action !== currentAction && key === newKey) {
        return action;
      }
    }
    return null;
  },

  updateShortcutDisplay: (inputId, key) => {
    const input = document.getElementById(inputId);
    if (input) {
      if (key === ' ') {
        input.value = 'Space';
      } else if (key === '') {
        input.value = '';
      } else {
        input.value = key;
      }
    }
  },

  loadShortcuts: () => {
    keyboardShortcutsUtils.updateShortcutDisplay(
      'shortcutSettings',
      keyboardShortcuts.settings
    );
    keyboardShortcutsUtils.updateShortcutDisplay(
      'shortcutWakeUp',
      keyboardShortcuts.wakeUp
    );
    keyboardShortcutsUtils.updateShortcutDisplay(
      'shortcutReset',
      keyboardShortcuts.reset
    );
    keyboardShortcutsUtils.updateShortcutDisplay(
      'shortcutAccelerate',
      keyboardShortcuts.accelerate
    );
    keyboardShortcutsUtils.updateShortcutDisplay(
      'shortcutFullscreen',
      keyboardShortcuts.fullscreen
    );
    keyboardShortcutsUtils.updateShortcutDisplay(
      'shortcutInfo',
      keyboardShortcuts.info
    );
  },

  resetToDefaults: () => {
    // Explicitly reset to defaults, clearing any corrupted data
    keyboardShortcuts = { ...DEFAULT_KEYBOARD_SHORTCUTS };

    // Update the UI immediately
    keyboardShortcutsUtils.loadShortcuts();

    // Update shortcut hints on buttons
    updateWakeUpShortcutHint();
    updateAccelerateShortcutHint();

    // Save the clean defaults to localStorage
    saveSettings();

    console.log('Keyboard shortcuts reset to defaults:', keyboardShortcuts);
  },

  // Nuclear option: completely remove and recreate the keyboardShortcuts key
  forceReset: () => {
    // Get current settings
    const savedSettings = readStorageItem(SETTINGS_STORAGE_KEY);
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        if (isPlainObject(settings)) {
          delete settings.keyboardShortcuts;
          writeStorageItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        }
      } catch {
        console.warn(
          'Saved settings could not be parsed; keyboard shortcuts were reset in memory.'
        );
      }
    }

    // Reset to defaults
    keyboardShortcuts = { ...DEFAULT_KEYBOARD_SHORTCUTS };

    // Update the UI immediately
    keyboardShortcutsUtils.loadShortcuts();
    updateWakeUpShortcutHint();
    updateAccelerateShortcutHint();

    // Save the clean defaults to localStorage
    saveSettings();

    console.log(
      'Keyboard shortcuts force reset (key deleted and recreated):',
      keyboardShortcuts
    );
  },

  clearAll: () => {
    // Clear all shortcuts (set to empty strings)
    keyboardShortcuts = {
      settings: '',
      wakeUp: '',
      reset: '',
      accelerate: '',
      fullscreen: '',
      info: '',
    };

    // Update the UI immediately
    keyboardShortcutsUtils.loadShortcuts();

    // Update shortcut hints on buttons
    updateWakeUpShortcutHint();
    updateAccelerateShortcutHint();

    // Save the cleared shortcuts to localStorage
    saveSettings();

    console.log('All keyboard shortcuts cleared:', keyboardShortcuts);
  },
};

// Button Labels
const BUTTON_LABELS = {
  WAKE_UP: '⏰ Wake Up!',
  PAUSE: '⏸️ Pause Day',
  RESUME: '▶️ Resume Day',
  RESET: '🔄 Reset Day',
  ACCELERATE: '⏩ Accelerate Time',
  ACCELERATE_CONFIRM: 'Confirm…',
  ACCELERATE_TIME_FLIES: 'Time flies…',
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

// YouTube API Key (placeholder - replace with actual key if needed)
const YOUTUBE_API_KEY = 'YOUR_YOUTUBE_API_KEY_HERE';

// Import version tracking from changelog
import { APP_VERSION, CHANGELOG } from './changelog.js';

// Audio Elements
let endSound = null;
let wakeUpSound = null;
let nominationsOpenSound = null;
let previewSound = null; // New audio element for previews

// Wake Lock state
let wakeLock = null;

// Scheduling and the last painted second stay here. Remaining time, pace, and
// the running segment live in the timer engine.
let timerId = null;
let selectedSeconds = 0;
let selectedMinutes = 0;
let wakeUpTimeout = null;
let isEndSoundPlaying = false; // New state variable
let accelerateConfirmTimeout = null;
let lastRenderedSeconds = null;
const timer = createTimerEngine();

const MIN_PLAYER_COUNT = 5;
const MAX_PLAYER_COUNT = 15;
const DEFAULT_PLAYER_COUNT = 10;
const MIN_TRAVELLER_COUNT = 0;
const MAX_TRAVELLER_COUNT = 5;
const DEFAULT_TRAVELLER_COUNT = 0;
const DEFAULT_CURRENT_DAY = 1;
// A corrupt day or preset number must not build an unbounded preset list.
const MAX_TRACKED_DAY = 100;
const MIN_VOLUME = 0;
const MAX_VOLUME = 100;
const DEFAULT_YOUTUBE_VOLUME = 15;
const DEFAULT_SOUND_EFFECTS_VOLUME = 75;
const DEFAULT_PLAY_MUSIC = false;
const DEFAULT_PLAY_MUSIC_AT_NIGHT = false;
const DEFAULT_PLAY_SOUND_EFFECTS = true;
const DEFAULT_KEEP_DISPLAY_ON = true;
const DEFAULT_SHOW_PLAYER_COUNT_QR = false;
const DEFAULT_SHOW_CURRENT_TIME = true;
const DEFAULT_SHOW_SESSION_COUNTDOWN = false;
const CLOCK_FORMATS = ['12', '24'];
const DEFAULT_CLOCK_FORMAT = '24';
const DEFAULT_SESSION_END_HOUR = 23;
const DEFAULT_SESSION_END_MINUTE = 0;
const BACKGROUND_THEMES = [
  'none',
  'gothic-city',
  'medieval-cartoon',
  'tower-in-forest',
  'infested-city',
  'circle-of-people',
  'large-clock-face',
];
const DEFAULT_BACKGROUND_THEME = 'medieval-cartoon';
const END_OF_DAY_SOUNDS = [
  'cathedral-bell-v2.mp3',
  'bell-and-crows-v2.mp3',
  'single-church-bell-v2.mp3',
  'alarm-siren-fast-v2.mp3',
];
const DEFAULT_END_OF_DAY_SOUND = END_OF_DAY_SOUNDS[0];
const WAKE_UP_SOUNDS = [
  'chisel-bell-01-loud-v2.mp3',
  'rooster-v2.mp3',
  'quick-bell-v2.mp3',
];
const DEFAULT_WAKE_UP_SOUND = WAKE_UP_SOUNDS[0];
const NOMINATIONS_OPEN_SOUNDS = [
  'nominations-open-laura.mp3',
  'nominations-open-russell.mp3',
  'nominations-open-serafina.mp3',
];
const DEFAULT_NOMINATIONS_OPEN_SOUND = NOMINATIONS_OPEN_SOUNDS[0];
const NOMINATION_OPEN_DELAYS = [30, 60, 90];
const DEFAULT_NOMINATION_OPEN_DELAY = 60;
const DEFAULT_AUTO_OPEN_NOMINATIONS = false;
const DEFAULT_ACCEPTED_PORTRAIT_WARNING = false;
const DAY_STATES = ['dawn', 'dusk'];
const MAX_SHORTCUT_LENGTH = 32;
const MAX_PLAYLIST_URL_LENGTH = 2048;
const BLOCKED_SETTING_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

// Settings state
let playerCount = DEFAULT_PLAYER_COUNT;
let travellerCount = DEFAULT_TRAVELLER_COUNT;
let isFirstLoad = false;
const game = createGameState();
let playMusic = DEFAULT_PLAY_MUSIC;
let playMusicAtNight = DEFAULT_PLAY_MUSIC_AT_NIGHT;
let playSoundEffects = DEFAULT_PLAY_SOUND_EFFECTS;
let youtubeVolume = DEFAULT_YOUTUBE_VOLUME;
let soundEffectsVolume = DEFAULT_SOUND_EFFECTS_VOLUME;
let backgroundTheme = DEFAULT_BACKGROUND_THEME;
let youtubePlaylistUrl = DEFAULT_YOUTUBE_PLAYLIST;
let keepDisplayOn = DEFAULT_KEEP_DISPLAY_ON;
let showPlayerCountQr = DEFAULT_SHOW_PLAYER_COUNT_QR;
let showCurrentTime = DEFAULT_SHOW_CURRENT_TIME;
let clockFormat = DEFAULT_CLOCK_FORMAT;
let showSessionCountdown = DEFAULT_SHOW_SESSION_COUNTDOWN;
let sessionEndHour = DEFAULT_SESSION_END_HOUR;
let sessionEndMinute = DEFAULT_SESSION_END_MINUTE;
let youtubePlayer = null;
let endOfDaySound = DEFAULT_END_OF_DAY_SOUND;
let wakeUpSoundFile = DEFAULT_WAKE_UP_SOUND;
let nominationsOpenSoundFile = DEFAULT_NOMINATIONS_OPEN_SOUND;
let acceptedPortraitWarning = DEFAULT_ACCEPTED_PORTRAIT_WARNING;
let autoOpenNominations = DEFAULT_AUTO_OPEN_NOMINATIONS;
let autoOpenNominationsDelay = DEFAULT_NOMINATION_OPEN_DELAY; // seconds
let autoOpenNominationsInterval = null;
let nominationsCountdownRemaining = 0;
/** Reused for fallback beep to avoid allocating a new AudioContext each time */
let beepAudioContext = null;

// Keyboard shortcuts
const DEFAULT_KEYBOARD_SHORTCUTS = {
  settings: 'q',
  wakeUp: ' ',
  reset: 'r',
  accelerate: 'a',
  fullscreen: 'f',
  info: 'i',
};

let keyboardShortcuts = { ...DEFAULT_KEYBOARD_SHORTCUTS };

/** Maps shortcut input element ids to keyboardShortcuts keys */
const SHORTCUT_INPUT_ID_TO_ACTION = {
  shortcutSettings: 'settings',
  shortcutWakeUp: 'wakeUp',
  shortcutReset: 'reset',
  shortcutAccelerate: 'accelerate',
  shortcutFullscreen: 'fullscreen',
  shortcutInfo: 'info',
};

// Helper function to re-enable all shortcut inputs
function reEnableShortcutInputs() {
  document.querySelectorAll('.shortcut-input').forEach((el) => {
    el.disabled = false;
    el.style.opacity = '1';
  });
}

// Start recording a new shortcut
function startShortcutRecording(input, action) {
  // Clear any existing recording and restore their previous values
  document.querySelectorAll('.shortcut-input.recording').forEach((el) => {
    el.classList.remove('recording');
    // Restore the previous value for any inputs that were in recording mode
    const inputId = el.id;
    const actionName = SHORTCUT_INPUT_ID_TO_ACTION[inputId];
    if (actionName && keyboardShortcuts[actionName]) {
      keyboardShortcutsUtils.updateShortcutDisplay(
        inputId,
        keyboardShortcuts[actionName]
      );
    }
  });

  // Start recording this input
  input.classList.add('recording');
  input.value = 'Press a key...';
  input.focus();

  // Disable other shortcut inputs while recording
  document.querySelectorAll('.shortcut-input').forEach((el) => {
    if (el !== input) {
      el.disabled = true;
      el.style.opacity = '0.5';
    }
  });

  const handleKeyDown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      // Cancel recording
      input.classList.remove('recording');
      keyboardShortcutsUtils.updateShortcutDisplay(
        input.id,
        keyboardShortcuts[action]
      );

      // Re-enable other shortcut inputs
      reEnableShortcutInputs();

      document.removeEventListener('keydown', handleKeyDown);
      return;
    }

    if (keyboardShortcutsUtils.isValidShortcut(e)) {
      const newKey = e.key;

      // Check for conflicts
      const conflict = keyboardShortcutsUtils.checkConflict(newKey, action);
      if (conflict) {
        // Show conflict warning
        input.classList.add('shortcut-conflict');
        input.value = `Conflict with ${conflict}`;
        setTimeout(() => {
          input.classList.remove('shortcut-conflict');
          input.value = 'Press a key...';
        }, 2000);
        return;
      }

      // Update the shortcut
      keyboardShortcuts[action] = newKey;
      input.classList.remove('recording');
      keyboardShortcutsUtils.updateShortcutDisplay(input.id, newKey);

      // Re-enable other shortcut inputs
      reEnableShortcutInputs();

      // Update shortcut hints if changed
      if (action === 'wakeUp') {
        updateWakeUpShortcutHint();
      }
      if (action === 'accelerate') {
        updateAccelerateShortcutHint();
      }

      saveSettings();
      document.removeEventListener('keydown', handleKeyDown);
    }
  };

  document.addEventListener('keydown', handleKeyDown);
}

// Helper function to update wake up shortcut hint
function updateWakeUpShortcutHint() {
  const hintElement = document.getElementById('wakeUpShortcutHint');
  if (!hintElement) return;

  const shortcutKey = keyboardShortcuts.wakeUp;

  if (!shortcutKey) {
    hintElement.textContent = '';
    return;
  }

  // Special handling for MediaPlayPause
  if (shortcutKey === 'MediaPlayPause') {
    hintElement.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="12" style="vertical-align: middle;"><path fill="currentColor" d="M3 5v14l8-7z"/><path fill="currentColor" d="M14 5h2v14h-2zm4 0h2v14h-2z"/></svg>';
  } else if (shortcutKey === ' ') {
    hintElement.textContent = 'Space';
  } else {
    hintElement.textContent = shortcutKey.toUpperCase();
  }
}

// Helper function to update accelerate shortcut hint
function updateAccelerateShortcutHint() {
  const hintElement = document.getElementById('accelerateShortcutHint');
  if (!hintElement) return;

  const shortcutKey = keyboardShortcuts.accelerate;

  if (!shortcutKey) {
    hintElement.textContent = '';
    return;
  }

  hintElement.textContent = shortcutKey.toUpperCase();
}

// Helper to set only the accelerate button label (preserves shortcut hint)
function setAccelerateButtonLabel(text) {
  const textEl = accelerateBtn?.querySelector('.button-text');
  if (textEl) textEl.textContent = text;
}

function getAccelerateButtonLabel() {
  return accelerateBtn?.querySelector('.button-text')?.textContent ?? '';
}

// Helper function to update start button text (preserving the shortcut hint)
function updateStartButtonText(text) {
  const buttonTextElement = startBtn.querySelector('.button-text');
  if (buttonTextElement) {
    buttonTextElement.textContent = text;
  } else {
    // Fallback if structure doesn't exist
    startBtn.textContent = text;
  }
}

function updateEstimatedGameLength() {
  const totalMinutes = estimateGameLengthMinutes(playerCount, game.getPace());
  const estimatedGameLengthElement = document.getElementById(
    'estimatedGameLength'
  );
  if (estimatedGameLengthElement) {
    estimatedGameLengthElement.textContent = `${totalMinutes} minutes`;
  }
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

// Event listeners for wake lock and stale-tab banner
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    // A throttled interval may not have run while the tab was hidden.
    // Catch the display and completion up to monotonic time immediately.
    if (timer.isCountdownActive()) {
      renderCountdownFrame();
    }
    staleTabUtils.onBecameVisible();
    await requestWakeLock();
  } else {
    staleTabUtils.onBecameHidden();
    await releaseWakeLock();
  }
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    staleTabUtils.onBecameVisible();
  }
});

// Request wake lock and initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  staleTabUtils.init();

  try {
    await requestWakeLock();
  } catch (error) {
    console.error('Error requesting wake lock:', error);
  }

  // Initialize audio
  endSound = new Audio(`sounds/end-of-day/${endOfDaySound}`);
  wakeUpSound = new Audio(`sounds/wake-up/${wakeUpSoundFile}`);
  nominationsOpenSound = new Audio(
    `sounds/nominations-open/${nominationsOpenSoundFile}`
  );

  // Add connectivity listeners
  connectivityUtils.addStatusListener(
    () => {
      // When we come back online
      if (playMusic) {
        initYoutubePlayer();
        // If timer is running, resume music after a short delay to allow player initialization
        if (timer.isRunning() && timer.getTimeLeft() > 0) {
          setTimeout(() => {
            youtubeUtils.play();
          }, 2000); // 2 second delay to allow player to initialize
        }
      }
    },
    () => {
      // When we go offline, drop the player immediately. destroy() is skipped
      // because it can hang and leave the timer controls unresponsive.
      detachYoutubePlayer();
    }
  );

  // Initialize DOM elements
  minutesDisplay = document.getElementById('minutes');
  secondsDisplay = document.getElementById('seconds');
  timerDisplayEl = document.querySelector('.timer-display');
  startBtn = document.getElementById('startBtn');
  updateStartButtonText(BUTTON_LABELS.WAKE_UP);
  startBtn.disabled = false; // Ensure Wake Up button is enabled on load
  initTimeDisplays();
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
  resetAccelerateButton();
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
  // Ensure change history dialog is closed on initialization
  if (changeHistoryDialog) {
    changeHistoryDialog.close();
    // Also remove the 'open' attribute if present
    changeHistoryDialog.removeAttribute('open');
    // Double-check after a short delay in case something tries to open it
    setTimeout(() => {
      if (changeHistoryDialog.open) {
        changeHistoryDialog.close();
        changeHistoryDialog.removeAttribute('open');
      }
    }, 100);
  }

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

  // Add click-outside-to-close handler for portrait warning dialog
  portraitWarningDialog.addEventListener('click', (e) => {
    if (e.target === portraitWarningDialog) {
      acceptedPortraitWarning = true;
      saveSettings();
      portraitWarningDialog.close();
    }
  });

  // Add orientation change listener
  orientationUtils.addOrientationListener((isPortrait) => {
    if (isPortrait && !acceptedPortraitWarning) {
      portraitWarningDialog.showModal();
    } else if (!isPortrait) {
      // Close dialog if user rotates back to landscape
      portraitWarningDialog.close();
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

  // Accelerate button: click -> "Confirm…", second click within 5s triggers acceleration
  accelerateBtn.addEventListener('click', () => {
    if (accelerateBtn.disabled) return;
    if (getAccelerateButtonLabel() === BUTTON_LABELS.ACCELERATE) {
      setAccelerateButtonLabel(BUTTON_LABELS.ACCELERATE_CONFIRM);
      accelerateBtn.setAttribute(
        'aria-label',
        'Click again to accelerate time'
      );
      if (accelerateConfirmTimeout) clearTimeout(accelerateConfirmTimeout);
      accelerateConfirmTimeout = setTimeout(() => {
        accelerateConfirmTimeout = null;
        resetAccelerateButton();
      }, ACCELERATE_CONFIRM_SECONDS * 1000);
    } else {
      // Confirm: clear timeout, show "time flies", disable, then accelerate
      if (accelerateConfirmTimeout) {
        clearTimeout(accelerateConfirmTimeout);
        accelerateConfirmTimeout = null;
      }
      setAccelerateButtonLabel(BUTTON_LABELS.ACCELERATE_TIME_FLIES);
      accelerateBtn.setAttribute('aria-label', 'Time is accelerating');
      accelerateBtn.disabled = true;
      accelerateTime();
    }
  });

  // Add event listeners
  startBtn.addEventListener('click', startTimer);
  resetBtn.addEventListener('click', () => {
    resetTimer();
    endGameSession();
  });
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
  document.getElementById('showPlayerCountQr').addEventListener('change', (e) => {
    showPlayerCountQr = e.target.checked;
    document
      .getElementById('playerCountQrWrapper')
      .classList.toggle('visible', showPlayerCountQr);
    saveSettings();
  });
  document.getElementById('showCurrentTime').addEventListener('change', (e) => {
    showCurrentTime = e.target.checked;
    saveSettings();
    updateTimeSettingsUi();
  });
  document
    .getElementById('showSessionCountdown')
    .addEventListener('change', (e) => {
      showSessionCountdown = e.target.checked;
      saveSettings();
      updateTimeSettingsUi();
    });
  document.getElementById('sessionEndHour').addEventListener('change', (e) => {
    sessionEndHour = Number.parseInt(e.target.value, 10);
    saveSettings();
    updateSessionCountdownDisplay();
  });
  document.getElementById('sessionEndMinute').addEventListener('change', (e) => {
    sessionEndMinute = Number.parseInt(e.target.value, 10);
    saveSettings();
    updateSessionCountdownDisplay();
  });
  document.querySelectorAll('input[name="clockFormat"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      if (!e.target.checked) return;
      clockFormat = e.target.value;
      saveSettings();
      updateCurrentTimeDisplay();
    });
  });

  // Add keyboard shortcuts event listeners
  document.querySelectorAll('.shortcut-input').forEach((input) => {
    input.addEventListener('click', () => {
      // Map input IDs to shortcut action names
      const actionMap = {
        shortcutSettings: 'settings',
        shortcutWakeUp: 'wakeUp',
        shortcutReset: 'reset',
        shortcutAccelerate: 'accelerate',
        shortcutFullscreen: 'fullscreen',
        shortcutInfo: 'info',
      };
      const action = actionMap[input.id];
      startShortcutRecording(input, action);
    });
  });

  document.getElementById('resetShortcuts').addEventListener('click', () => {
    if (
      confirm(
        'Are you sure you want to reset all keyboard shortcuts to their default values? This cannot be undone.'
      )
    ) {
      keyboardShortcutsUtils.forceReset();
    }
  });

  document.getElementById('clearShortcuts').addEventListener('click', () => {
    if (
      confirm(
        'Are you sure you want to clear all keyboard shortcuts? This will remove all shortcut assignments.'
      )
    ) {
      keyboardShortcutsUtils.clearAll();
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
  if (closeChangeHistoryBtn) {
    closeChangeHistoryBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeChangeHistory();
    });
  }
  if (changeHistoryDialog) {
    changeHistoryDialog.addEventListener('click', (e) => {
      if (e.target === changeHistoryDialog) {
        closeChangeHistory();
      }
    });
  }

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

      // Create and play the new preview (nominations-open uses its own folder)
      const previewPath =
        type === 'nominations-open'
          ? `sounds/nominations-open/${soundFile}`
          : `sounds/${type}/${soundFile}`;
      previewSound = new Audio(previewPath);
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

  document
    .getElementById('nominationsOpenSound')
    .addEventListener('change', (e) => {
      if (previewSound) {
        previewSound.pause();
        previewSound.currentTime = 0;
        document
          .querySelectorAll('.preview-sound')
          .forEach((btn) => btn.classList.remove('playing'));
      }
      nominationsOpenSoundFile = e.target.value;
      nominationsOpenSound = new Audio(
        `sounds/nominations-open/${nominationsOpenSoundFile}`
      );
      saveSettings();
    });

  document
    .getElementById('autoOpenNominations')
    .addEventListener('change', (e) => {
      autoOpenNominations = e.target.checked;
      document.getElementById('autoOpenNominationsDelay').disabled =
        !autoOpenNominations;
      const nominationsOpenSelect = document.getElementById(
        'nominationsOpenSound'
      );
      const nominationsOpenLabelEl = document.querySelector(
        'label:has(#nominationsOpenSound)'
      );
      if (nominationsOpenSelect) {
        nominationsOpenSelect.disabled = !autoOpenNominations;
      }
      if (nominationsOpenLabelEl) {
        nominationsOpenLabelEl.classList.toggle(
          'inactive',
          !playSoundEffects || !autoOpenNominations
        );
      }
      saveSettings();
    });

  document
    .getElementById('autoOpenNominationsDelay')
    .addEventListener('change', (e) => {
      autoOpenNominationsDelay = Number.parseInt(e.target.value, 10);
      saveSettings();
    });

  // Initialize settings and update display before the portrait check.
  // The warning uses acceptedPortraitWarning, which loadSettings applies.
  loadSettings();
  updateClocktowerPresets();
  updateDisplay();

  if (orientationUtils.isPortrait() && !acceptedPortraitWarning) {
    portraitWarningDialog.showModal();
  } else {
    portraitWarningDialog.close();
  }

  // Add event listeners for settings tabs
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.addEventListener('click', () => {
      switchSettingsTab(button.dataset.tab);
    });
  });

  // Create YouTube container immediately if music is enabled
  if (playMusic) {
    initYoutubePlayer();
  }

  // Load keyboard shortcuts into UI
  keyboardShortcutsUtils.loadShortcuts();

  // Update shortcut hints on buttons
  updateWakeUpShortcutHint();
  updateAccelerateShortcutHint();

  // Setup keyboard navigation after shortcuts are loaded
  setupKeyboardNavigation();
});

const KNOWN_SETTINGS_KEYS = new Set([
  'playerCount',
  'travellerCount',
  'currentDay',
  'usedPresetByDay',
  'hiddenPresetDays',
  'currentPace',
  'playMusic',
  'playMusicAtNight',
  'playSoundEffects',
  'soundEffectsVolume',
  'keepDisplayOn',
  'showPlayerCountQr',
  'showCurrentTime',
  'clockFormat',
  'showSessionCountdown',
  'sessionEndHour',
  'sessionEndMinute',
  'youtubeVolume',
  'youtubePlaylistUrl',
  'backgroundTheme',
  'dayState',
  'lastSeenVersion',
  'endOfDaySound',
  'wakeUpSoundFile',
  'nominationsOpenSoundFile',
  'autoOpenNominations',
  'autoOpenNominationsDelay',
  'acceptedPortraitWarning',
  'keyboardShortcuts',
]);

// Fields from a future version, kept so a later save does not drop them.
let preservedUnknownSettings = {};

function readBoundedInteger(
  value,
  minimum,
  maximum,
  fallback,
  clampOutOfRange
) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
  if (value < minimum || value > maximum) {
    return clampOutOfRange
      ? Math.min(maximum, Math.max(minimum, value))
      : fallback;
  }
  return value;
}

function readBooleanSetting(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function readEnum(value, allowed, fallback) {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

function readSoundFile(value, allowed, fallback) {
  if (typeof value !== 'string') return fallback;
  if (allowed.includes(value)) return value;
  // Older saves used names such as cathedral-bell.mp3.
  if (value.endsWith('.mp3')) {
    const migrated = `${value.slice(0, -4)}-v2.mp3`;
    if (allowed.includes(migrated)) return migrated;
  }
  return fallback;
}

function readPlaylistUrl(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_PLAYLIST_URL_LENGTH
  ) {
    return DEFAULT_YOUTUBE_PLAYLIST;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return DEFAULT_YOUTUBE_PLAYLIST;
    }
  } catch {
    return DEFAULT_YOUTUBE_PLAYLIST;
  }
  return value;
}

function readDayState(value) {
  return DAY_STATES.includes(value) ? value : '';
}

function readHiddenPresetDays(value) {
  if (!Array.isArray(value)) return [];
  const hidden = [];
  for (const entry of value) {
    if (!Number.isInteger(entry) || entry < 1 || entry > MAX_TRACKED_DAY) {
      continue;
    }
    if (!hidden.includes(entry)) hidden.push(entry);
  }
  return hidden;
}

function readUsedPresetByDay(settings, day) {
  if (Object.hasOwn(settings, 'usedPresetByDay')) {
    if (!isPlainObject(settings.usedPresetByDay)) return {};
    const result = {};
    for (const [key, value] of Object.entries(settings.usedPresetByDay)) {
      if (BLOCKED_SETTING_KEYS.has(key)) continue;
      const dayNumber = Number(key);
      if (String(dayNumber) !== key) continue;
      if (
        dayNumber < 1 ||
        dayNumber > MAX_TRACKED_DAY ||
        !Number.isInteger(value) ||
        value < 1 ||
        value > MAX_TRACKED_DAY
      ) {
        continue;
      }
      result[dayNumber] = value;
    }
    return result;
  }

  const start = settings.dayOnePresetIndex;
  if (!Number.isInteger(start) || start < 1 || start > MAX_TRACKED_DAY) {
    return {};
  }
  // Older saves recorded only the day-one preset and assumed the rest were sequential.
  const result = {};
  const lastDay = Math.min(day, MAX_TRACKED_DAY);
  for (let index = 1; index <= lastDay; index += 1) {
    const preset = start + index - 1;
    if (preset > MAX_TRACKED_DAY) break;
    result[index] = preset;
  }
  return result;
}

function isStoredShortcut(value) {
  return typeof value === 'string' && value.length <= MAX_SHORTCUT_LENGTH;
}

function readKeyboardShortcuts(raw) {
  if (!isPlainObject(raw)) {
    return { shortcuts: { ...DEFAULT_KEYBOARD_SHORTCUTS }, migrated: false };
  }

  const source = {};
  for (const key of Object.keys(raw)) {
    if (BLOCKED_SETTING_KEYS.has(key)) continue;
    source[key] = raw[key];
  }

  let migrated = false;
  if (source.wakeup && !source.wakeUp && isStoredShortcut(source.wakeup)) {
    source.wakeUp = source.wakeup;
    delete source.wakeup;
    migrated = true;
  }
  if (source.accelerate === undefined) {
    source.accelerate = DEFAULT_KEYBOARD_SHORTCUTS.accelerate;
    migrated = true;
  }

  const shortcuts = {};
  for (const action of Object.keys(DEFAULT_KEYBOARD_SHORTCUTS)) {
    shortcuts[action] = isStoredShortcut(source[action])
      ? source[action]
      : DEFAULT_KEYBOARD_SHORTCUTS[action];
  }

  for (const [key, shortcut] of Object.entries(source)) {
    if (
      Object.hasOwn(DEFAULT_KEYBOARD_SHORTCUTS, key) ||
      BLOCKED_SETTING_KEYS.has(key) ||
      key.length > MAX_SHORTCUT_LENGTH
    ) {
      continue;
    }
    if (isStoredShortcut(shortcut)) shortcuts[key] = shortcut;
  }

  return { shortcuts, migrated };
}

function isJsonValue(value, depth = 0) {
  if (depth > 20) return false;
  if (value === null) return true;
  const type = typeof value;
  if (type === 'boolean' || type === 'string') return true;
  if (type === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry, depth + 1));
  }
  if (!isPlainObject(value)) return false;
  return Object.keys(value).every(
    (key) => !BLOCKED_SETTING_KEYS.has(key) && isJsonValue(value[key], depth + 1)
  );
}

function rememberUnknownSettings(settings) {
  preservedUnknownSettings = {};
  for (const key of Object.keys(settings)) {
    if (KNOWN_SETTINGS_KEYS.has(key) || BLOCKED_SETTING_KEYS.has(key)) continue;
    const value = settings[key];
    if (isJsonValue(value)) preservedUnknownSettings[key] = value;
  }
}

function applyInMemoryDefaultSettings() {
  preservedUnknownSettings = {};
  playerCount = DEFAULT_PLAYER_COUNT;
  travellerCount = DEFAULT_TRAVELLER_COUNT;
  game.replaceProgress({
    currentDay: DEFAULT_CURRENT_DAY,
    usedPresetByDay: {},
    hiddenPresetDays: [],
    pace: DEFAULT_PACE,
  });
  playMusic = DEFAULT_PLAY_MUSIC;
  playMusicAtNight = DEFAULT_PLAY_MUSIC_AT_NIGHT;
  playSoundEffects = DEFAULT_PLAY_SOUND_EFFECTS;
  soundEffectsVolume = DEFAULT_SOUND_EFFECTS_VOLUME;
  keepDisplayOn = DEFAULT_KEEP_DISPLAY_ON;
  showPlayerCountQr = DEFAULT_SHOW_PLAYER_COUNT_QR;
  showCurrentTime = DEFAULT_SHOW_CURRENT_TIME;
  clockFormat = DEFAULT_CLOCK_FORMAT;
  showSessionCountdown = DEFAULT_SHOW_SESSION_COUNTDOWN;
  sessionEndHour = DEFAULT_SESSION_END_HOUR;
  sessionEndMinute = DEFAULT_SESSION_END_MINUTE;
  youtubeVolume = DEFAULT_YOUTUBE_VOLUME;
  backgroundTheme = DEFAULT_BACKGROUND_THEME;
  youtubePlaylistUrl = DEFAULT_YOUTUBE_PLAYLIST;
  endOfDaySound = DEFAULT_END_OF_DAY_SOUND;
  wakeUpSoundFile = DEFAULT_WAKE_UP_SOUND;
  nominationsOpenSoundFile = DEFAULT_NOMINATIONS_OPEN_SOUND;
  autoOpenNominations = DEFAULT_AUTO_OPEN_NOMINATIONS;
  autoOpenNominationsDelay = DEFAULT_NOMINATION_OPEN_DELAY;
  acceptedPortraitWarning = DEFAULT_ACCEPTED_PORTRAIT_WARNING;
  keyboardShortcuts = { ...DEFAULT_KEYBOARD_SHORTCUTS };
  updateDayDisplay('', { persist: false });
}

function parseStoredSettings(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, value: null };
  }
}

// Apply a parsed settings object. Invalid fields fall back individually.
function applyParsedSettings(settings) {
  rememberUnknownSettings(settings);

  playerCount = readBoundedInteger(
    settings.playerCount,
    MIN_PLAYER_COUNT,
    MAX_PLAYER_COUNT,
    DEFAULT_PLAYER_COUNT,
    true
  );
  travellerCount = readBoundedInteger(
    settings.travellerCount,
    MIN_TRAVELLER_COUNT,
    MAX_TRAVELLER_COUNT,
    DEFAULT_TRAVELLER_COUNT,
    true
  );
  const restoredDay = readBoundedInteger(
    settings.currentDay,
    1,
    MAX_TRACKED_DAY,
    DEFAULT_CURRENT_DAY,
    false
  );
  game.replaceProgress({
    currentDay: restoredDay,
    usedPresetByDay: readUsedPresetByDay(settings, restoredDay),
    hiddenPresetDays: readHiddenPresetDays(settings.hiddenPresetDays),
    pace: readEnum(
      settings.currentPace,
      Object.keys(PACE_MULTIPLIERS),
      DEFAULT_PACE
    ),
  });
  playMusic = readBooleanSetting(settings.playMusic, DEFAULT_PLAY_MUSIC);
  playMusicAtNight = readBooleanSetting(
    settings.playMusicAtNight,
    DEFAULT_PLAY_MUSIC_AT_NIGHT
  );
  playSoundEffects = readBooleanSetting(
    settings.playSoundEffects,
    DEFAULT_PLAY_SOUND_EFFECTS
  );
  soundEffectsVolume = readBoundedInteger(
    settings.soundEffectsVolume,
    MIN_VOLUME,
    MAX_VOLUME,
    DEFAULT_SOUND_EFFECTS_VOLUME,
    true
  );
  keepDisplayOn = readBooleanSetting(
    settings.keepDisplayOn,
    DEFAULT_KEEP_DISPLAY_ON
  );
  showPlayerCountQr = readBooleanSetting(
    settings.showPlayerCountQr,
    DEFAULT_SHOW_PLAYER_COUNT_QR
  );
  showCurrentTime = readBooleanSetting(
    settings.showCurrentTime,
    DEFAULT_SHOW_CURRENT_TIME
  );
  clockFormat = readEnum(
    settings.clockFormat,
    CLOCK_FORMATS,
    DEFAULT_CLOCK_FORMAT
  );
  showSessionCountdown = readBooleanSetting(
    settings.showSessionCountdown,
    DEFAULT_SHOW_SESSION_COUNTDOWN
  );
  sessionEndHour = readBoundedInteger(
    settings.sessionEndHour,
    0,
    23,
    DEFAULT_SESSION_END_HOUR,
    false
  );
  sessionEndMinute = readBoundedInteger(
    settings.sessionEndMinute,
    0,
    59,
    DEFAULT_SESSION_END_MINUTE,
    false
  );
  youtubeVolume = readBoundedInteger(
    settings.youtubeVolume,
    MIN_VOLUME,
    MAX_VOLUME,
    DEFAULT_YOUTUBE_VOLUME,
    true
  );
  backgroundTheme = readEnum(
    settings.backgroundTheme,
    BACKGROUND_THEMES,
    DEFAULT_BACKGROUND_THEME
  );
  youtubePlaylistUrl = readPlaylistUrl(settings.youtubePlaylistUrl);
  endOfDaySound = readSoundFile(
    settings.endOfDaySound,
    END_OF_DAY_SOUNDS,
    DEFAULT_END_OF_DAY_SOUND
  );
  wakeUpSoundFile = readSoundFile(
    settings.wakeUpSoundFile,
    WAKE_UP_SOUNDS,
    DEFAULT_WAKE_UP_SOUND
  );
  nominationsOpenSoundFile = readSoundFile(
    settings.nominationsOpenSoundFile,
    NOMINATIONS_OPEN_SOUNDS,
    DEFAULT_NOMINATIONS_OPEN_SOUND
  );
  autoOpenNominations = readBooleanSetting(
    settings.autoOpenNominations,
    DEFAULT_AUTO_OPEN_NOMINATIONS
  );
  autoOpenNominationsDelay = NOMINATION_OPEN_DELAYS.includes(
    settings.autoOpenNominationsDelay
  )
    ? settings.autoOpenNominationsDelay
    : DEFAULT_NOMINATION_OPEN_DELAY;
  acceptedPortraitWarning = readBooleanSetting(
    settings.acceptedPortraitWarning,
    DEFAULT_ACCEPTED_PORTRAIT_WARNING
  );

  const shortcutResult = readKeyboardShortcuts(settings.keyboardShortcuts);
  keyboardShortcuts = shortcutResult.shortcuts;
  if (shortcutResult.migrated) {
    saveSettings();
  }

  if (
    typeof settings.lastSeenVersion === 'string' &&
    settings.lastSeenVersion !== APP_VERSION
  ) {
    try {
      showWhatsNew(settings.lastSeenVersion);
    } catch {
      console.warn(
        'The saved version could not be shown; continuing with the loaded settings.'
      );
    }
  }

  settings.lastSeenVersion = APP_VERSION;
  settings.endOfDaySound = endOfDaySound;
  settings.wakeUpSoundFile = wakeUpSoundFile;
  settings.keyboardShortcuts = keyboardShortcuts;
  try {
    writeStorageItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    console.warn(
      'Saved settings could not be updated; continuing with the loaded settings.'
    );
  }
  updateDayDisplay(readDayState(settings.dayState));
}

function initSoundsFirstLoad() {
  isFirstLoad = true;
  game.setCurrentDay(1);
  endSound = new Audio(`sounds/end-of-day/${endOfDaySound}`);
  wakeUpSound = new Audio(`sounds/wake-up/${wakeUpSoundFile}`);
  nominationsOpenSound = new Audio(
    `sounds/nominations-open/${nominationsOpenSoundFile}`
  );
}

function applySettingsToForm() {
  playerCountInput.value = playerCount;
  travellerCountInput.value = travellerCount;
  document.getElementById('gamePace').value = game.getPace();
  document.getElementById('playSoundEffects').checked = playSoundEffects;
  document.getElementById('keepDisplayOn').checked = keepDisplayOn;
  document.getElementById('showPlayerCountQr').checked = showPlayerCountQr;
  document
    .getElementById('playerCountQrWrapper')
    .classList.toggle('visible', showPlayerCountQr);
  updatePlayerCountQr();
  document.getElementById('playMusic').checked = playMusic;
  document.getElementById('playMusicAtNight').checked = playMusicAtNight;
  document.getElementById('youtubePlaylist').value = youtubePlaylistUrl;
  document.getElementById('musicVolume').value = youtubeVolume;
  document.getElementById('soundEffectsVolume').value = soundEffectsVolume;
  document.getElementById('backgroundTheme').value = backgroundTheme;
  document.querySelector(
    `input[name="clockFormat"][value="${clockFormat}"]`
  ).checked = true;
  updateTimeSettingsUi();
  document.querySelector(
    'label:has(#musicVolume) .volume-value'
  ).textContent = `${youtubeVolume}%`;
  document.querySelector(
    'label:has(#soundEffectsVolume) .volume-value'
  ).textContent = `${soundEffectsVolume}%`;
  document.getElementById('endOfDaySound').value = endOfDaySound;
  document.getElementById('wakeUpSound').value = wakeUpSoundFile;
  document.getElementById('nominationsOpenSound').value =
    nominationsOpenSoundFile;
  document.getElementById('autoOpenNominations').checked = autoOpenNominations;
  document.getElementById('autoOpenNominationsDelay').value =
    autoOpenNominationsDelay;
  document.getElementById('autoOpenNominationsDelay').disabled =
    !autoOpenNominations;

  const nominationsOpenSoundSelect = document.getElementById(
    'nominationsOpenSound'
  );
  const nominationsOpenLabel = document.querySelector(
    'label:has(#nominationsOpenSound)'
  );
  if (nominationsOpenSoundSelect) {
    nominationsOpenSoundSelect.disabled = !autoOpenNominations;
  }
  if (nominationsOpenLabel) {
    nominationsOpenLabel.classList.toggle(
      'inactive',
      !playSoundEffects || !autoOpenNominations
    );
  }

  nominationsOpenSound = new Audio(
    `sounds/nominations-open/${nominationsOpenSoundFile}`
  );

  const musicVolumeInput = document.getElementById('musicVolume');
  musicVolumeInput.disabled = !playMusic;
  musicVolumeInput.closest('label').classList.toggle('inactive', !playMusic);

  const soundEffectsVolumeInput = document.getElementById('soundEffectsVolume');
  soundEffectsVolumeInput.disabled = !playSoundEffects;
  soundEffectsVolumeInput
    .closest('label')
    .classList.toggle('inactive', !playSoundEffects);

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
}

// Load settings from localStorage
function loadSettings() {
  migrateLegacySettings();
  const savedSettings = readStorageItem(SETTINGS_STORAGE_KEY);
  if (savedSettings) {
    const parsed = parseStoredSettings(savedSettings);
    let applied = false;
    if (!parsed.ok) {
      console.warn('Saved settings are not valid JSON; using defaults.');
    } else if (!isPlainObject(parsed.value)) {
      console.warn(
        'Saved settings have an unexpected format; using defaults.'
      );
    } else {
      try {
        applyParsedSettings(parsed.value);
        applied = true;
      } catch {
        console.warn('Saved settings could not be applied; using defaults.');
      }
    }
    if (!applied) {
      applyInMemoryDefaultSettings();
    }
    // Recreate Audio objects so they use the loaded sound files (they were
    // initially created with defaults in DOMContentLoaded).
    endSound = new Audio(`sounds/end-of-day/${endOfDaySound}`);
    wakeUpSound = new Audio(`sounds/wake-up/${wakeUpSoundFile}`);
    nominationsOpenSound = new Audio(
      `sounds/nominations-open/${nominationsOpenSoundFile}`
    );
  } else {
    initSoundsFirstLoad();
  }

  applySettingsToForm();

  document
    .getElementById('travellerDisplay')
    .classList.toggle('visible', travellerCount > 0);
  document.getElementById('travellerAmount').textContent = travellerCount;
  updateYoutubeLink();
  document.body.dataset.theme = backgroundTheme;
  document.body.dataset.pace = game.getPace();

  if (playMusic) {
    initYoutubePlayer();
  } else {
    const existingContainer = getYoutubePlayerContainer();
    if (existingContainer) {
      existingContainer.remove();
    }
    youtubePlayer = null;
  }

  updateCharacterAmounts(playerCount);
  updateClocktowerPresets();
  updateEstimatedGameLength();
  updateSoundEffects();

  if (isFirstLoad) {
    setTimeout(() => {
      settingsDialog.showModal();
    }, 100);
  }

  if (changeHistoryDialog?.open) {
    changeHistoryDialog.close();
    changeHistoryDialog.removeAttribute('open');
  }

  const { playlistId } = extractVideoAndPlaylistIds(youtubePlaylistUrl);
  if (playlistId) {
    fetchPlaylistTitle(playlistId).then((title) => {
      if (title) {
        updatePlaylistBadge(title);
      }
    });
  }

  initialSettingsApplied = true;
  if (game.getPhase() === 'dusk' || game.getPhase() === 'dawn') {
    gameSessionActive = true;
  }
  staleTabUtils.onGameActivityChanged();
}

// Additional safeguard on globalThis load to ensure change history dialog is closed
globalThis.addEventListener('load', () => {
  const changeHistoryDialog = document.getElementById('changeHistoryDialog');
  if (changeHistoryDialog?.open) {
    changeHistoryDialog.close();
    changeHistoryDialog.removeAttribute('open');
  }
});

// Save settings to localStorage
function saveSettings() {
  const progress = game.snapshot();
  const settings = {
    ...preservedUnknownSettings,
    playerCount,
    travellerCount,
    currentDay: progress.currentDay,
    usedPresetByDay: progress.usedPresetByDay,
    hiddenPresetDays: progress.hiddenPresetDays,
    currentPace: progress.pace,
    playMusic,
    playMusicAtNight,
    playSoundEffects,
    soundEffectsVolume,
    keepDisplayOn,
    showPlayerCountQr,
    showCurrentTime,
    clockFormat,
    showSessionCountdown,
    sessionEndHour,
    sessionEndMinute,
    youtubeVolume,
    youtubePlaylistUrl,
    backgroundTheme,
    dayState: progress.phase,
    lastSeenVersion: APP_VERSION,
    endOfDaySound,
    wakeUpSoundFile,
    nominationsOpenSoundFile,
    autoOpenNominations,
    autoOpenNominationsDelay,
    acceptedPortraitWarning,
    keyboardShortcuts,
  };
  try {
    writeStorageItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    console.warn(
      'Settings could not be saved; continuing with in-memory settings.'
    );
  }
}

function updateClocktowerPresets() {
  const clocktowerPresetsDiv = document.getElementById('clocktowerPresets');
  clocktowerPresetsDiv.innerHTML = '';

  const progress = game.snapshot();
  const presets = listVisiblePresets({
    playerCount,
    pace: progress.pace,
    currentDay: progress.currentDay,
    usedPresetByDay: progress.usedPresetByDay,
    isDusk: progress.phase === 'dusk',
  });

  presets.forEach((preset) => {
    const button = document.createElement('button');
    button.className = 'preset-btn clocktower-btn';
    if (preset.effectiveDay === null) {
      button.classList.add('skipped-day');
    }
    if (
      preset.effectiveDay !== null &&
      preset.effectiveDay === progress.currentDay
    ) {
      button.classList.add('current-day');
    }
    if (
      preset.effectiveDay !== null &&
      preset.effectiveDay < progress.currentDay
    ) {
      button.classList.add('past-day');
    }
    button.innerHTML = `
      <span class="time">${preset.display}</span>
      <span class="day">${preset.label}</span>
    `;
    button.dataset.minutes = preset.minutes;
    button.dataset.seconds = preset.seconds;
    button.dataset.day = preset.day;

    button.addEventListener('click', () => {
      const choice = game.choosePreset(preset.day);

      if (choice === 'current') {
        saveSettings();
        updateClocktowerPresets();
      } else if (choice === 'next') {
        saveSettings();
        // Clear dusk so the new day shows the full preset row until its countdown ends
        updateDayDisplay();
        updateClocktowerPresets();
      }

      document
        .querySelectorAll('.clocktower-btn')
        .forEach((btn) => btn.classList.remove('active'));
      document
        .querySelector(`.clocktower-btn[data-day="${preset.day}"]`)
        ?.classList.add('active');

      selectedMinutes = preset.minutes;
      selectedSeconds = preset.seconds;

      clearCountdownSchedule();
      clearNominationsCountdown();

      timer.setTimeLeft(selectedMinutes * 60 + selectedSeconds);
      updateDisplay();

      updateDayDisplay();

      startCountdown();
      startBtn.disabled = false;
      updateStartButtonText(BUTTON_LABELS.PAUSE);
      resetAccelerateButton();
      accelerateBtn.disabled = false;
      resetBtn.disabled = false;

      if (
        playSoundEffects &&
        !timerDisplayEl.classList.contains('wake-up-countdown')
      ) {
        safePlaySound(wakeUpSound, { fallbackBeep: true });
      }
    });

    clocktowerPresetsDiv.appendChild(button);
  });
}

// Update QR code and link for player count (count.arcane-scripts.net)
function updatePlayerCountQr() {
  const url = `https://count.arcane-scripts.net/?p=${playerCount}`;
  const link = document.getElementById('playerCountQrLink');
  const img = document.getElementById('playerCountQrImg');
  if (link) link.href = url;
  if (img) {
    img.src =
      'https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=' +
      encodeURIComponent(url);
  }
}

// Update player count
function updatePlayerCount() {
  playerCount = Math.min(
    Math.max(
      Number.parseInt(playerCountInput.value) || MIN_PLAYER_COUNT,
      MIN_PLAYER_COUNT
    ),
    MAX_PLAYER_COUNT
  );
  playerCountInput.value = playerCount;
  updateCharacterAmounts(playerCount);
  updateClocktowerPresets();
  updateEstimatedGameLength();
  updatePlayerCountQr();
  saveSettings();
}

// Update traveller count
function updateTravellerCount() {
  travellerCount = Math.min(
    Math.max(
      Number.parseInt(travellerCountInput.value) || MIN_TRAVELLER_COUNT,
      MIN_TRAVELLER_COUNT
    ),
    MAX_TRAVELLER_COUNT
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
    button.addEventListener('click', () => {
      switchSettingsTab(button.dataset.tab);
    });
  });

  // Set initial tab
  switchSettingsTab('game');
}

function closeSettings() {
  saveSettings(); // Always save when closing
  refreshDayPhase(); // Refresh the pace label without dropping dawn or dusk
  updateClocktowerPresets(); // Update the presets to match current day

  // Remove event listeners from tab buttons
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.replaceWith(button.cloneNode(true));
  });

  settingsDialog.close();
}

// Handle settings tab switching
function switchSettingsTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.tab-button').forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle('active', isActive);
  });

  // Update panels
  document.querySelectorAll('.settings-panel').forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;
    panel.classList.toggle('active', isActive);
  });
}

// Fullscreen functionality
function toggleFullscreen() {
  if (document.fullscreenElement) {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  } else {
    document.documentElement.requestFullscreen().catch((err) => {
      console.log('Error attempting to enable fullscreen:', err);
    });
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
  if (!playMusicAtNight) {
    runYoutube((player) => {
      player.pauseVideo?.();
      setYoutubeControlButtonIcon(false);
    });
  }

  isEndSoundPlaying = true;
  startBtn.disabled = true;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    isEndSoundPlaying = false;
    updateDisplay();
    // Resume music if playMusicAtNight is enabled
    if (playMusicAtNight) {
      runYoutube((player) => {
        player.playVideo?.();
        setYoutubeControlButtonIcon(true);
      });
    }
  };

  safePlaySound(endSound, {
    fallbackBeep: true,
    onEnded: finish,
    onError: finish,
  });
}

// Play nominations open sound
function playNominationsOpenSound() {
  safePlaySound(nominationsOpenSound);
}

// Clear the nominations countdown (interval and UI)
function clearNominationsCountdown() {
  if (autoOpenNominationsInterval) {
    clearInterval(autoOpenNominationsInterval);
    autoOpenNominationsInterval = null;
  }
  const el = document.getElementById('nominationsCountdown');
  if (el) {
    el.hidden = true;
  }
}

// Start the nominations countdown display and schedule the sound
function startNominationsCountdown() {
  beginGameSession();
  clearNominationsCountdown();
  const delay = nominationsDelaySeconds(
    autoOpenNominations,
    autoOpenNominationsDelay
  );
  if (!delay) return;

  const countdownEl = document.getElementById('nominationsCountdown');
  const secondsEl = document.getElementById('nominationsCountdownSeconds');
  if (!countdownEl || !secondsEl) return;

  nominationsCountdownRemaining = delay;
  secondsEl.textContent = nominationsCountdownRemaining;
  countdownEl.hidden = false;
  countdownEl.setAttribute(
    'aria-label',
    `Nominations open in ${nominationsCountdownRemaining} seconds`
  );

  autoOpenNominationsInterval = setInterval(() => {
    const step = stepNominationsCountdown(nominationsCountdownRemaining);
    nominationsCountdownRemaining = step.remaining;
    secondsEl.textContent = nominationsCountdownRemaining;
    countdownEl.setAttribute(
      'aria-label',
      `Nominations open in ${nominationsCountdownRemaining} seconds`
    );

    if (step.open) {
      clearNominationsCountdown();
      playNominationsOpenSound();
    }
  }, 1000);
}

// Create beep sound (fallback if mp3 fails to load)
function createBeep() {
  if (!playSoundEffects) return;

  if (!beepAudioContext) {
    beepAudioContext = new (globalThis.AudioContext ||
      globalThis.webkitAudioContext)();
  }
  const audioContext = beepAudioContext;
  if (audioContext.state === 'suspended') {
    void audioContext.resume();
  }
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

function clearCountdownSchedule() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  timer.clearSegment();
  wakeUpTimeout = null;
}

function ensureCountdownLoop() {
  if (timerId !== null) return;
  timerId = setInterval(renderCountdownFrame, COUNTDOWN_REFRESH_MS);
  if (timer.getCountdownKind() === 'wake-up') {
    wakeUpTimeout = timerId;
  }
}

function publishCountdownFrame(frame) {
  if (frame.type !== 'complete') return false;
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  wakeUpTimeout = null;
  if (frame.kind === 'wake-up') {
    finishWakeUpCountdown();
  } else {
    finishDayCountdown(frame.wasAccelerated);
  }
  return true;
}

// Apply time already elapsed at the current speed, then run at `countdownPerRealMs`.
function continueCountdownAt(kind, countdownPerRealMs) {
  const frame = timer.continueAt(kind, countdownPerRealMs);
  if (publishCountdownFrame(frame)) return;
  if (frame.type === 'running') {
    ensureCountdownLoop();
  }
}

function renderCountdownFrame() {
  const frame = timer.sample();
  if (publishCountdownFrame(frame)) return;
  if (frame.type === 'running' && frame.shown !== lastRenderedSeconds) {
    updateDisplay();
  }
}

function finishDayCountdown(wasAccelerated) {
  // Night music keeps playing when the day ends. The end-of-day sound
  // pauses it only when Play Music at Night is off.
  if (!playMusicAtNight) {
    runYoutube((player) => {
      player.pauseVideo?.();
      if (!wasAccelerated) {
        setYoutubeControlButtonIcon(false);
      }
    });
  }
  if (game.getCurrentDay() !== null) {
    updateDayDisplay('dusk');
    updateClocktowerPresets();
  }
  playEndSound();
  updateDisplay();

  if (autoOpenNominations && autoOpenNominationsDelay > 0) {
    startNominationsCountdown();
  }
}

function finishWakeUpCountdown() {
  timerDisplayEl.classList.remove('wake-up-countdown');
  updateDayDisplay();

  const claimed = game.claimPresetForCurrentDay();
  const currentPresetDay = claimed.presetDay;
  if (claimed.assigned) {
    saveSettings();
    updateClocktowerPresets();
  }
  const dayPreset = document.querySelector(
    `.clocktower-btn[data-day="${currentPresetDay}"]`
  );
  if (!dayPreset) return;

  document
    .querySelectorAll('.clocktower-btn')
    .forEach((btn) => btn.classList.remove('active'));
  dayPreset.classList.add('active');

  selectedMinutes = Number.parseInt(dayPreset.dataset.minutes);
  selectedSeconds = Number.parseInt(dayPreset.dataset.seconds);
  timer.setTimeLeft(selectedMinutes * 60 + selectedSeconds);
  updateDisplay();

  startCountdown();
  startBtn.disabled = false;
  updateStartButtonText(BUTTON_LABELS.PAUSE);
  resetAccelerateButton();
  accelerateBtn.disabled = false;
  resetBtn.disabled = false;
}

// Update display
function updateDisplay() {
  const totalSeconds = displaySeconds(timer.getTimeLeft());
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minuteText = minutes.toString().padStart(2, '0');
  const secondText = seconds.toString().padStart(2, '0');
  if (minutesDisplay.textContent !== minuteText) {
    minutesDisplay.textContent = minuteText;
  }
  if (secondsDisplay.textContent !== secondText) {
    secondsDisplay.textContent = secondText;
  }
  lastRenderedSeconds = totalSeconds;

  const isWakeUpCountdown =
    timerDisplayEl.classList.contains('wake-up-countdown');

  // Handle the combined button states
  if (isWakeUpCountdown) {
    updateStartButtonText(BUTTON_LABELS.WAKE_UP);
    startBtn.disabled = true;
    accelerateBtn.disabled = true;
    resetBtn.disabled = true; // Disable reset during wake-up countdown
  } else if (timer.isRunning()) {
    updateStartButtonText(BUTTON_LABELS.PAUSE);
    startBtn.disabled = false;
    // Keep accelerate disabled during accelerated countdown ("time flies")
    accelerateBtn.disabled =
      getAccelerateButtonLabel() === BUTTON_LABELS.ACCELERATE_TIME_FLIES;
    resetBtn.disabled = false; // Enable reset while running
  } else if (timer.getTimeLeft() > 0 && !timer.hasReset()) {
    updateStartButtonText(BUTTON_LABELS.RESUME);
    startBtn.disabled = false;
    accelerateBtn.disabled = true;
    resetBtn.disabled = false; // Enable reset when paused with time remaining
  } else {
    updateStartButtonText(BUTTON_LABELS.WAKE_UP);
    startBtn.disabled = isEndSoundPlaying; // Disable during end sound
    accelerateBtn.disabled = true;
    resetBtn.disabled = true; // Disable reset when timer is at 0 or after reset
  }

  // Update ARIA labels
  timerDisplayEl.setAttribute(
    'aria-label',
    `Timer: ${minutes} minutes and ${seconds} seconds remaining`
  );
}

const ACCELERATE_CONFIRM_SECONDS = 5;

function resetAccelerateButton() {
  if (accelerateConfirmTimeout) {
    clearTimeout(accelerateConfirmTimeout);
    accelerateConfirmTimeout = null;
  }
  setAccelerateButtonLabel(BUTTON_LABELS.ACCELERATE);
  accelerateBtn.setAttribute(
    'aria-label',
    'Accelerate time (click then confirm)'
  );
  accelerateBtn.style.setProperty('--progress-width', '0%');
}

// Acceleration keeps the previous rate: countdown seconds per 50ms of monotonic
// time. Elapsed time is applied at the speed already running, then the new
// speed starts. Completion is the moment remaining time reaches zero.
function accelerateTime() {
  const frame = timer.accelerate(Math.random());
  if (frame.type === 'ignored') return;
  if (publishCountdownFrame(frame)) return;
  ensureCountdownLoop();
  // Disable accelerate button after use (do not reset label during accelerated countdown)
  accelerateBtn.disabled = true;
}

// Start timer
function startTimer() {
  if (timer.isRunning()) {
    // Pause timer before touching music, so a dead player cannot block the click
    timerUtils.stop();
    runYoutube((player) => {
      player.pauseVideo?.();
      setYoutubeControlButtonIcon(false);
    });
    return;
  }

  // If we have remaining time, resume the timer
  if (timer.getTimeLeft() > 0) {
    timer.setRunning(true);
    timer.setHasReset(false); // Clear the reset state when starting timer
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
  clearNominationsCountdown();

  // Reset to the full day countdown time (use current day's preset, which includes pace)
  const preset = presetForDay(
    playerCount,
    game.getPace(),
    game.getCurrentDay()
  );
  timer.setTimeLeft(preset.minutes * 60 + preset.seconds);
  selectedMinutes = preset.minutes;
  selectedSeconds = preset.seconds;
  timer.setCurrentInterval(timer.getNormalInterval());
  timer.setRunning(false);
  timer.setHasReset(true);
  isEndSoundPlaying = false;

  // Reset button states
  startBtn.disabled = false;
  updateStartButtonText(BUTTON_LABELS.WAKE_UP);
  resetAccelerateButton();
  accelerateBtn.disabled = true;
  resetBtn.disabled = true;

  // Stop music and update play/pause button
  runYoutube((player) => {
    player.stopVideo?.();
    setYoutubeControlButtonIcon(false);
  });

  // Reset day display to normal state
  updateDayDisplay();

  // Clear wake-up countdown state
  timerDisplayEl.classList.remove('wake-up-countdown');

  // Clear active state from preset buttons
  timerUtils.updateButtonStates(document.querySelectorAll('.clocktower-btn'));

  // Update the display with the new time
  updateDisplay();
}

// Handle minutes preset selection
function handleMinuteClick(e) {
  const minutes = Number.parseInt(e.target.dataset.minutes);
  selectedMinutes = minutes;

  // Update active state
  timerUtils.updateButtonStates(minuteButtons, e.target);

  // If timer is not running, update display
  if (!timer.isRunning()) {
    timer.setTimeLeft(selectedMinutes * 60 + selectedSeconds);
    updateDisplay();
    startBtn.disabled = false;
  }
}

// Handle seconds preset selection
function handleSecondClick(e) {
  const seconds = Number.parseInt(e.target.dataset.seconds);
  selectedSeconds = seconds;

  // Update active state
  timerUtils.updateButtonStates(secondButtons, e.target);

  // If timer is not running, update display
  if (!timer.isRunning()) {
    timer.setTimeLeft(selectedMinutes * 60 + selectedSeconds);
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
    const min = Number.parseInt(input.min);
    const max = Number.parseInt(input.max);
    const currentValue = Number.parseInt(input.value) || min;

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
  // Wake-up continues the same session. resetTimer() below only clears the
  // current countdown, so the session must be marked before that runs.
  beginGameSession();
  if (timer.isRunning()) {
    resetTimer();
  }

  // Clear any existing wake-up timeout and countdown segment before
  // assigning the six-second wake-up duration.
  if (wakeUpTimeout) {
    clearTimeout(wakeUpTimeout);
    wakeUpTimeout = null;
  }
  clearCountdownSchedule();
  clearNominationsCountdown();

  // Stop music if playing and not set to play at night
  if (playSoundEffects && !playMusicAtNight) {
    youtubeUtils.pause();
  }

  // Only increment day if we're in dusk state
  if (game.advanceDayIfDusk()) {
    saveSettings();
  }

  // Start countdown display
  timerDisplayEl.classList.add('wake-up-countdown');

  // Show dawn state for current day
  updateDayDisplay('dawn');

  // Keep Wake Up label but disable the button during countdown
  startBtn.disabled = true;
  updateStartButtonText(BUTTON_LABELS.WAKE_UP);
  accelerateBtn.disabled = true;

  timer.setTimeLeft(WAKE_UP_COUNTDOWN_SECONDS);
  updateDisplay();

  timer.setCurrentInterval(timer.getNormalInterval());
  continueCountdownAt('wake-up', NORMAL_COUNTDOWN_MS_PER_REAL_MS);

  // Sound comes last so a failed or stalled file cannot skip the countdown
  safePlaySound(wakeUpSound, { fallbackBeep: true });
}

function startCountdown() {
  beginGameSession();
  timer.setRunning(true);
  timer.setCurrentInterval(timer.getNormalInterval());
  continueCountdownAt('day', NORMAL_COUNTDOWN_MS_PER_REAL_MS);
  updateDisplay();

  // Music is best-effort and must not prevent the countdown from starting
  if (!game.isDusk()) {
    runYoutube((player) => {
      const playing =
        globalThis.YT &&
        player.getPlayerState?.() === globalThis.YT.PlayerState.PLAYING;
      if (!playing) {
        player.playVideo?.();
        setYoutubeControlButtonIcon(true);
      }
    });
  }
}

function startNewGame() {
  // Reset timer state, including a wake-up countdown still on screen
  clearCountdownSchedule();
  clearNominationsCountdown();
  timer.setTimeLeft(0);
  timer.setRunning(false);
  isEndSoundPlaying = false;
  timer.setHasReset(false);
  timer.setCurrentInterval(timer.getNormalInterval());
  timerDisplayEl.classList.remove('wake-up-countdown');

  game.startNewGame();
  updateDayDisplay();

  // Set button to Wake Up state
  startBtn.disabled = false;
  updateStartButtonText(BUTTON_LABELS.WAKE_UP);
  resetAccelerateButton();
  accelerateBtn.disabled = true; // Accelerate button should start disabled
  updateDisplay();

  saveSettings();
  closeSettings();
  endGameSession();

  // Stop any playing video and reshuffle playlist. Failure must not undo the new game.
  runYoutube((player) => {
    const { playlistId } = extractVideoAndPlaylistIds(youtubePlaylistUrl);
    if (!playlistId) return;
    player.stopVideo?.();
    player.setShuffle?.(true);
    player.cuePlaylist?.({
      list: playlistId,
      listType: 'playlist',
      index: Math.floor(Math.random() * 50),
      suggestedQuality: 'small',
    });
  });
}

function readDayPhase() {
  return game.getPhase();
}

// Rebuild the day label while keeping the phase already on screen.
// Entering dusk also resets the day controls, so keep Wake Up disabled
// when the end-of-day sound is still playing.
function refreshDayPhase() {
  updateDayDisplay(readDayPhase());
  if (isEndSoundPlaying) {
    startBtn.disabled = true;
  }
}

// Update day display
function updateDayDisplay(state = '', options = {}) {
  const shouldPersist = options.persist !== false;
  const dayInfo = document.querySelector('.day-display');
  if (!dayInfo) return;

  // Remove existing state classes
  dayInfo.classList.remove('dawn', 'dusk');

  game.setPhase(state);
  game.ensureCurrentDay();
  const progress = game.snapshot();

  const paceEmojis = {
    relaxed: '🐌',
    normal: '🏃',
    speedy: '⚡',
    blitz: '🚀',
  };
  const paceEmoji = paceEmojis[progress.pace];
  const paceText =
    progress.pace.charAt(0).toUpperCase() + progress.pace.slice(1);
  const dayMarkup = `<span>${progress.currentDay}</span><div class="pace-indicator">${paceEmoji} ${paceText}</div>`;

  if (progress.phase === 'dawn') {
    dayInfo.classList.add('dawn');
    dayInfo.innerHTML = dayMarkup;
  } else if (progress.phase === 'dusk') {
    dayInfo.classList.add('dusk');
    dayInfo.innerHTML = dayMarkup;
    // Ensure button states are correct for dusk
    startBtn.disabled = false;
    updateStartButtonText(BUTTON_LABELS.WAKE_UP);
    resetAccelerateButton();
    accelerateBtn.disabled = true;
    resetBtn.disabled = true;
  } else {
    dayInfo.innerHTML = dayMarkup;
  }

  // Update preset button highlighting (honour skip-ahead: use next preset if current day not yet chosen)
  const currentPresetDay = game.peekPresetDay();
  document.querySelectorAll('.clocktower-btn').forEach((btn) => {
    const btnDay = Number.parseInt(btn.dataset.day);
    const { effectiveDay: eff } = getPresetDayLabel(btnDay, progress);
    btn.classList.toggle('current-day', btnDay === currentPresetDay);
    btn.classList.toggle('past-day', eff !== null && eff < progress.currentDay);
  });

  if (shouldPersist) {
    // Save the current state
    saveSettings();
  }
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
// Later days use the new pace. A countdown that is already running, paused,
// accelerated, or in wake-up keeps the time it already has.
function updateGamePace(newPace) {
  game.setPace(newPace);
  document.body.dataset.pace = newPace;
  updateClocktowerPresets();
  refreshDayPhase();
  updateEstimatedGameLength();
  saveSettings();
}

// YouTube player functionality
let youtubeApiReady = false;

// Load YouTube IFrame API
function loadYoutubeApi() {
  if (
    !globalThis.YT &&
    !document.querySelector('script[src*="youtube.com/iframe_api"]')
  ) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }
}

function initYoutubePlayer() {
  if (!playMusic || !connectivityUtils.isOnline()) return;
  if (!globalThis.YT || !youtubeApiReady) {
    loadYoutubeApi();
  } else {
    createYoutubePlayer();
  }
}

// Called by YouTube API when ready
globalThis.onYouTubeIframeAPIReady = function () {
  youtubeApiReady = true;
  if (playMusic && connectivityUtils.isOnline()) {
    createYoutubePlayer();
  }
};

function createYoutubePlayerContainer() {
  const container = document.createElement('div');
  container.className = YOUTUBE_PLAYER_CONTAINER_CLASS;

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

  const volumeInfo = document.createElement('span');
  volumeInfo.className = 'volume-info';
  volumeInfo.innerHTML = `Music: ${youtubeVolume}%<br>Effects: ${soundEffectsVolume}%`;

  playlistNameSpan.appendChild(playlistLabel);
  playlistNameSpan.appendChild(trackTitle);
  container.appendChild(playlistNameSpan);
  container.appendChild(volumeInfo);

  const playPauseBtn = document.createElement('button');
  playPauseBtn.className = 'youtube-control';
  playPauseBtn.innerHTML = YOUTUBE_CONTROL_SVG_PLAY;
  playPauseBtn.addEventListener('click', () => {
    runYoutube((player) => {
      if (player.getPlayerState?.() === globalThis.YT?.PlayerState?.PLAYING) {
        player.pauseVideo?.();
        playPauseBtn.innerHTML = YOUTUBE_CONTROL_SVG_PLAY;
      } else {
        player.playVideo?.();
        playPauseBtn.innerHTML = YOUTUBE_CONTROL_SVG_PAUSE;
      }
    });
  });
  container.appendChild(playPauseBtn);

  const playerDiv = document.createElement('div');
  playerDiv.id = 'youtube-player';
  container.appendChild(playerDiv);

  // Find the bottom container and the right buttons
  const bottomContainer = document.querySelector('.bottom-container');
  const rightButtons = bottomContainer.querySelector('.right-buttons');

  // Insert the container before the right buttons
  rightButtons.before(container);

  return container;
}

async function createYoutubePlayer() {
  if (!playMusic || !connectivityUtils.isOnline()) return;
  try {
    destroyYoutubePlayer();

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

    youtubePlayer = new YT.Player('youtube-player', {
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
    youtubePlayer = null;
  }
}

function onPlayerReady(event) {
  if (!connectivityUtils.isOnline()) {
    detachYoutubePlayer();
    return;
  }
  try {
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
    if (timer.isRunning() && timer.getTimeLeft() > 0 && !game.isDusk()) {
      event.target.playVideo();
    }
  } catch (error) {
    console.log('YouTube player ready handler failed:', error);
    detachYoutubePlayer();
  }
}

function onPlayerStateChange(event) {
  try {
    if (event.data === YT.PlayerState.PLAYING) {
      setYoutubeControlButtonIcon(true);
      // Get and display the current track title
      const title = event.target.getVideoData()?.title;
      if (title) {
        updatePlaylistBadge(title);
      }
      // Ensure volume is set correctly when starting playback
      event.target.setVolume(youtubeVolume);
    } else if (
      event.data === YT.PlayerState.PAUSED ||
      event.data === YT.PlayerState.CUED
    ) {
      setYoutubeControlButtonIcon(false);
    } else if (event.data === YT.PlayerState.ENDED) {
      const { playlistId } = extractVideoAndPlaylistIds(youtubePlaylistUrl);
      if (playlistId) {
        event.target.setShuffle(true);
        event.target.playVideoAt(0);
      } else {
        event.target.playVideo();
      }
    }
  } catch (error) {
    console.log('YouTube player state handler failed:', error);
    detachYoutubePlayer();
  }
}

function onPlayerError(event) {
  console.error('YouTube player error:', event);
  updatePlaylistBadge('');
  if (!connectivityUtils.isOnline()) {
    detachYoutubePlayer();
  }
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
  const musicVolumeInput = document.getElementById('musicVolume');

  document
    .getElementById('youtubePlaylist')
    .setAttribute('aria-hidden', !playMusic);
  musicVolumeInput.setAttribute('aria-hidden', !playMusic);
  musicVolumeInput.disabled = !playMusic;
  document
    .getElementById('playMusicAtNight')
    .setAttribute('aria-hidden', !playMusic);

  playMusicAtNightLabel.classList.toggle('inactive', !playMusic);
  youtubePlaylistLabel.classList.toggle('inactive', !playMusic);
  musicVolumeInput.closest('label').classList.toggle('inactive', !playMusic);

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
    destroyYoutubePlayer();
  }
  saveSettings();
}

// Update YouTube volume
function updateYoutubeVolume() {
  youtubeVolume = Number.parseInt(document.getElementById('musicVolume').value);
  document.querySelector(
    'label:has(#musicVolume) .volume-value'
  ).textContent = `${youtubeVolume}%`;
  runYoutube((player) => {
    player.setVolume?.(youtubeVolume);
  });
  // Update volume info display
  const volumeInfo = document.querySelector('.volume-info');
  if (volumeInfo) {
    volumeInfo.innerHTML = `Music: ${youtubeVolume}%<br>Effects: ${soundEffectsVolume}%`;
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
      element: document.querySelector('label:has(#nominationsOpenSound)'),
      type: 'label',
    },
    {
      element: document.querySelector('label:has(#soundEffectsVolume)'),
      type: 'label',
    },
  ];

  // Apply inactive state to all dependent elements
  const nominationsOpenLabel = document.querySelector(
    'label:has(#nominationsOpenSound)'
  );
  const nominationsOpenSelect = document.getElementById('nominationsOpenSound');

  soundDependentElements.forEach(({ element, type }) => {
    if (element) {
      const isNominationsOpen = element === nominationsOpenLabel;
      const inactive = isNominationsOpen
        ? !playSoundEffects || !autoOpenNominations
        : !playSoundEffects;
      element.classList.toggle('inactive', inactive);
      element.dataset.inactiveMessage =
        isNominationsOpen && !autoOpenNominations
          ? 'Enable "Automatically open nominations" in Game settings first'
          : 'Enable "Play Sound Effects" first';
      if (type === 'label') {
        const input = element.querySelector('select, input');
        if (input) {
          input.setAttribute('aria-hidden', inactive);
          if (input === nominationsOpenSelect) {
            input.disabled = !autoOpenNominations;
          }
        }
      }
    }
  });
}

// Update sound effects volume
function updateSoundEffectsVolume() {
  soundEffectsVolume = Number.parseInt(
    document.getElementById('soundEffectsVolume').value
  );
  document.querySelector(
    'label:has(#soundEffectsVolume) .volume-value'
  ).textContent = `${soundEffectsVolume}%`;
  // Update volume info display
  const volumeInfo = document.querySelector('.volume-info');
  if (volumeInfo) {
    volumeInfo.innerHTML = `Music: ${youtubeVolume}%<br>Effects: ${soundEffectsVolume}%`;
  }
  saveSettings();
}

// Update background theme
function updateBackgroundTheme() {
  backgroundTheme = document.getElementById('backgroundTheme').value;
  document.body.dataset.theme = backgroundTheme;
  saveSettings();
}

// Extract video and playlist IDs from YouTube URL
function extractVideoAndPlaylistIds(url) {
  const videoIdPattern = String.raw`[^"&?/\s]{11}`;
  const youtuBeRegex = new RegExp(
    String.raw`youtu\.be/(${videoIdPattern})`,
    'i'
  );
  const youtubePathRegex = new RegExp(
    String.raw`(?:v|e(?:mbed)?)/(${videoIdPattern})`,
    'i'
  );
  const youtubeQueryRegex = new RegExp(String.raw`[?&]v=(${videoIdPattern})`);

  const videoId =
    url.match(youtuBeRegex)?.[1] ??
    url.match(youtubePathRegex)?.[1] ??
    url.match(youtubeQueryRegex)?.[1];

  const playlistMatch = url.match(/[?&]list=([^#&?]+)/);

  return {
    videoId: videoId ?? null,
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

  // Update playlist label if needed, or update track title
  if (title) {
    if (title.length > 40) {
      trackTitle.textContent = title.substring(0, 37) + '...';
    } else {
      trackTitle.textContent = title;
    }
    trackTitle.title = title; // Add full title as tooltip
  } else {
    if (youtubePlaylistUrl === DEFAULT_YOUTUBE_PLAYLIST) {
      playlistLabel.textContent = 'Bardcore';
    } else if (youtubePlaylistUrl === ATMOSPHERIC_PLAYLIST) {
      playlistLabel.textContent = 'Atmospheric';
    } else {
      playlistLabel.textContent = 'Custom';
    }
    trackTitle.textContent = 'Not Playing';
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
      const fixes = data.changes.fixes || [];
      const improvements = data.changes.improvements || [];

      return `
        ${
          version === latestVersion
            ? ''
            : `
          <div class="version-info">
            <span class="version-number">Version ${version}</span>
            <span class="version-date">${data.date}</span>
          </div>
        `
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
          fixes.length > 0
            ? `
          <div class="changes-section">
            <h3>Fixes</h3>
            <ul class="fixes-list">
              ${fixes.map((fix) => `<li>${fix}</li>`).join('')}
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
          version === versions.at(-1)[0] ? '' : '<hr class="version-separator">'
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

  // Check if CHANGELOG is available
  if (!CHANGELOG) {
    console.error('CHANGELOG not available');
    return;
  }

  const versions = Object.entries(CHANGELOG).sort(
    ([a], [b]) => Number.parseFloat(b) - Number.parseFloat(a)
  );

  // Don't open dialog if there's no changelog data
  if (versions.length === 0) {
    console.warn('No changelog data available');
    return;
  }

  let html = '';
  versions.forEach(([version, data], index) => {
    const features = data.changes.features || [];
    const fixes = data.changes.fixes || [];
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
          fixes.length > 0
            ? `
          <div class="changes-section">
            <h3>Fixes</h3>
            <ul class="fixes-list">
              ${fixes.map((fix) => `<li>${fix}</li>`).join('')}
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

  if (!content) {
    console.error('changeHistoryContent element not found');
    return;
  }

  content.innerHTML = html;

  // Only open dialog if content was successfully populated
  if (html.trim().length > 0 && changeHistoryDialog) {
    changeHistoryDialog.showModal();
  } else {
    console.warn('No content to display in change history dialog');
  }
}

// Close What's New dialog
function closeWhatsNew() {
  whatsNewDialog.close();
}

// Close Change History dialog
function closeChangeHistory() {
  if (changeHistoryDialog) {
    changeHistoryDialog.close();
    changeHistoryDialog.removeAttribute('open');
  }
}

function tryHandleResetShortcut(e, currentKey) {
  if (
    !keyboardShortcuts.reset ||
    currentKey !== keyboardShortcuts.reset ||
    settingsDialog.open ||
    infoDialog.open
  ) {
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  resetTimer();
  endGameSession();
}

// Add keyboard navigation support
function setupKeyboardNavigation() {
  document.removeEventListener('keydown', handleKeyboardNavigation);

  function handleKeyboardNavigation(e) {
    if (e.target.classList.contains('shortcut-input')) return;

    const currentKey = e.key;

    if (
      keyboardShortcuts.settings &&
      currentKey === keyboardShortcuts.settings &&
      !settingsDialog.open
    ) {
      openSettings();
    }
    if (
      keyboardShortcuts.info &&
      currentKey === keyboardShortcuts.info &&
      !infoDialog.open
    ) {
      openInfo();
    }
    if (keyboardShortcuts.wakeUp && currentKey === keyboardShortcuts.wakeUp) {
      if (!settingsDialog.open && !infoDialog.open) {
        e.preventDefault();
        // Match the Wake Up button: it is disabled during the wake-up countdown
        // and while the end-of-day sound is playing.
        if (!startBtn.disabled) {
          startTimer();
        }
      }
    }
    tryHandleResetShortcut(e, currentKey);
    if (
      keyboardShortcuts.accelerate &&
      currentKey === keyboardShortcuts.accelerate &&
      !settingsDialog.open &&
      !infoDialog.open
    ) {
      e.preventDefault();
      if (!accelerateBtn.disabled) {
        accelerateBtn.click();
      }
    }
    if (
      keyboardShortcuts.fullscreen &&
      currentKey === keyboardShortcuts.fullscreen
    ) {
      e.preventDefault();
      toggleFullscreen();
    }
    if (e.key === 'Escape' && document.fullscreenElement) {
      document.exitFullscreen();
    }
  }

  document.addEventListener('keydown', handleKeyboardNavigation);
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

async function fetchPlaylistTitle(playlistId) {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${YOUTUBE_API_KEY}`
    );
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      return data.items[0].snippet.title;
    }
    return null;
  } catch (error) {
    console.error('Error fetching playlist title:', error);
    return null;
  }
}
