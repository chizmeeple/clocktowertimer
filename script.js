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
  closeInfoBtn;

// Audio Elements
let endSound = null;
let wakeUpSound = null;

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
let playSoundEffects = true; // Default to true for sound effects
let youtubeVolume = 20; // Default volume
let youtubePlaylistUrl =
  'https://www.youtube.com/watch?v=TInSYXP9ZB8&list=PLhCDyBm6z1NwkkOAyQAMQkeberU9rwMcc'; // Default playlist
let youtubePlayer = null;

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
  await requestWakeLock();

  // Initialize audio
  endSound = new Audio('sounds/end-of-day/cathedral-bell.mp3');
  wakeUpSound = new Audio('sounds/wake-up/chisel-bell-01-loud.mp3');

  // Initialize DOM elements
  minutesDisplay = document.getElementById('minutes');
  secondsDisplay = document.getElementById('seconds');
  startBtn = document.getElementById('startBtn');
  resetBtn = document.getElementById('resetBtn');
  fullscreenBtn = document.getElementById('fullscreenBtn');
  settingsBtn = document.getElementById('settingsBtn');
  settingsDialog = document.getElementById('settingsDialog');
  closeSettingsBtn = document.getElementById('closeSettings');
  playerCountInput = document.getElementById('playerCount');
  travellerCountInput = document.getElementById('travellerCount');
  accelerateBtn = document.getElementById('accelerateBtn');
  minuteButtons = document.querySelectorAll('.minute-btn');
  secondButtons = document.querySelectorAll('.second-btn');
  infoBtn = document.getElementById('infoBtn');
  infoDialog = document.getElementById('infoDialog');
  closeInfoBtn = document.getElementById('closeInfo');

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
  accelerateBtn.addEventListener('click', accelerateTime);
  document
    .getElementById('wakeUpBtn')
    .addEventListener('click', playWakeUpSound);
  document
    .getElementById('startNewGame')
    .addEventListener('click', startNewGame);
  document.getElementById('gamePace').addEventListener('change', (e) => {
    updateGamePace(e.target.value);
  });
  document
    .getElementById('playMusic')
    .addEventListener('change', updateMusicPlayback);
  document
    .getElementById('youtubePlaylist')
    .addEventListener('change', updateYoutubePlaylist);
  document
    .getElementById('youtubeVolume')
    .addEventListener('input', updateYoutubeVolume);
  document
    .getElementById('playSoundEffects')
    .addEventListener('change', updateSoundEffects);

  // Add keyboard shortcut for settings
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'q' && !settingsDialog.open) {
      openSettings();
    }
  });

  // Add click handlers for preset buttons
  minuteButtons.forEach((btn) => {
    btn.addEventListener('click', handleMinuteClick);
  });

  secondButtons.forEach((btn) => {
    btn.addEventListener('click', handleSecondClick);
  });

  // Initialize settings and update display
  loadSettings();
  updateClocktowerPresets();
  updateDisplay();
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
    currentDay = settings.currentDay || null;
    currentPace = settings.currentPace || 'normal';
    playMusic = settings.playMusic !== undefined ? settings.playMusic : false;
    playSoundEffects =
      settings.playSoundEffects !== undefined
        ? settings.playSoundEffects
        : true;
    youtubeVolume = settings.youtubeVolume || 20;
    youtubePlaylistUrl =
      settings.youtubePlaylistUrl ||
      'https://www.youtube.com/watch?v=TInSYXP9ZB8&list=PLhCDyBm6z1NwkkOAyQAMQkeberU9rwMcc';
  } else {
    isFirstLoad = true;
  }

  // Always update UI to reflect settings
  playerCountInput.value = playerCount;
  travellerCountInput.value = travellerCount;
  document.getElementById('gamePace').value = currentPace;
  document.getElementById('playSoundEffects').checked = playSoundEffects;
  document.getElementById('playMusic').checked = playMusic;
  document.getElementById('youtubePlaylist').value = youtubePlaylistUrl;
  document.getElementById('youtubePlaylist').disabled = !playMusic;
  document.getElementById('youtubeVolume').value = youtubeVolume;
  document.getElementById('youtubeVolume').disabled = !playMusic;
  document.querySelector('.volume-value').textContent = `${youtubeVolume}%`;
  document
    .getElementById('travellerDisplay')
    .classList.toggle('visible', travellerCount > 0);
  updateDayDisplay();

  // Update character amounts and presets
  updateCharacterAmounts(playerCount);
  document.getElementById('travellerAmount').textContent = travellerCount;
  updateClocktowerPresets();

  // Show settings dialog on first load
  if (isFirstLoad) {
    settingsDialog.showModal();
  }

  // Initialize YouTube player only if music is enabled
  if (playMusic) {
    initYoutubePlayer();
  } else {
    // Remove existing player if music is disabled
    const existingContainer = document.querySelector(
      '.youtube-player-container'
    );
    if (existingContainer) {
      existingContainer.remove();
    }
    youtubePlayer = null;
  }
}

// Save settings to localStorage
function saveSettings() {
  const settings = {
    playerCount,
    travellerCount,
    currentDay,
    currentPace,
    playMusic,
    playSoundEffects,
    youtubeVolume,
    youtubePlaylistUrl,
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
      isRunning = true;
      startBtn.disabled = false;
      accelerateBtn.disabled = false;

      // Start YouTube player
      if (playMusic && youtubePlayer && youtubePlayer.playVideo) {
        youtubePlayer.playVideo();
      }

      timerId = setInterval(() => {
        timeLeft--;
        updateDisplay();

        if (timeLeft === 0) {
          clearInterval(timerId);
          playEndSound();
          isRunning = false;
          startBtn.disabled = true;
          // Stop YouTube player when timer ends
          if (playMusic && youtubePlayer && youtubePlayer.pauseVideo) {
            youtubePlayer.pauseVideo();
          }
          if (currentDay !== null) {
            updateDayDisplay('dusk');
          }
        }
      }, normalInterval);
    });

    clocktowerPresetsDiv.appendChild(button);
  });
}

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
}

function closeSettings() {
  saveSettings(); // Always save when closing
  settingsDialog.close();
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
    ? '<svg viewBox="0 0 24 24" width="24" height="24" class="fullscreen-icon"><path fill="currentColor" d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>'
    : '<svg viewBox="0 0 24 24" width="24" height="24" class="fullscreen-icon"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>';
}

// Play end sound
function playEndSound() {
  if (!playSoundEffects) return;

  endSound.currentTime = 0; // Reset the sound to start
  endSound.play().catch((error) => {
    console.log('Error playing sound:', error);
    // Fallback to beep if sound file fails
    createBeep();
  });
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
  gainNode.gain.value = 0.5;

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
      startBtn.textContent = 'Start';
      currentInterval = normalInterval;
      // Stop YouTube player when accelerated time ends
      if (playMusic && youtubePlayer && youtubePlayer.pauseVideo) {
        youtubePlayer.pauseVideo();
      }
      if (currentDay !== null) {
        updateDayDisplay('dusk');
      }
    }
  }, currentInterval);

  // Disable accelerate button after use
  accelerateBtn.disabled = true;
}

// Start timer
function startTimer() {
  if (isRunning) {
    // Pause timer and YouTube
    clearInterval(timerId);
    isRunning = false;
    if (playMusic && youtubePlayer && youtubePlayer.pauseVideo) {
      youtubePlayer.pauseVideo();
    }
    startBtn.textContent = 'Start';
    return;
  }

  // Start timer
  if (timeLeft === 0) {
    timeLeft = selectedMinutes * 60 + selectedSeconds;
    if (timeLeft === 0) return; // Don't start if no time is set
  }

  isRunning = true;
  startBtn.textContent = 'Pause';
  accelerateBtn.disabled = false; // Re-enable accelerate button

  // Start YouTube player if music is enabled
  if (playMusic && youtubePlayer && youtubePlayer.playVideo) {
    youtubePlayer.playVideo();
  }

  timerId = setInterval(() => {
    timeLeft--;
    updateDisplay();

    if (timeLeft === 0) {
      clearInterval(timerId);
      playEndSound();
      isRunning = false;
      startBtn.disabled = true;
      startBtn.textContent = 'Start';
      // Stop YouTube player when timer ends
      if (playMusic && youtubePlayer && youtubePlayer.pauseVideo) {
        youtubePlayer.pauseVideo();
      }
      if (currentDay !== null) {
        updateDayDisplay('dusk');
      }
    }
  }, normalInterval);
}

// Reset timer
function resetTimer() {
  clearInterval(timerId);
  if (wakeUpTimeout) {
    clearTimeout(wakeUpTimeout);
    wakeUpTimeout = null;
  }
  timeLeft = 0;
  isRunning = false;
  currentInterval = normalInterval;
  startBtn.disabled = true;
  startBtn.textContent = 'Start';
  accelerateBtn.disabled = false;
  updateDisplay();

  // Stop YouTube player
  if (playMusic && youtubePlayer && youtubePlayer.stopVideo) {
    youtubePlayer.stopVideo();
  }

  // Reset day display to normal state
  updateDayDisplay();

  // Clear wake-up countdown state
  document
    .querySelector('.timer-display')
    .classList.remove('wake-up-countdown');

  // Clear active state from preset buttons
  document.querySelectorAll('.clocktower-btn').forEach((btn) => {
    btn.classList.remove('active');
  });
}

// Handle minutes preset selection
function handleMinuteClick(e) {
  const minutes = parseInt(e.target.dataset.minutes);
  selectedMinutes = minutes;

  // Update active state
  minuteButtons.forEach((btn) => btn.classList.remove('active'));
  e.target.classList.add('active');

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
  secondButtons.forEach((btn) => btn.classList.remove('active'));
  e.target.classList.add('active');

  // If timer is not running, update display
  if (!isRunning) {
    timeLeft = selectedMinutes * 60 + selectedSeconds;
    updateDisplay();
    startBtn.disabled = false;
  }
}

// Event listeners
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
accelerateBtn.addEventListener('click', accelerateTime);

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

// Initialize settings before anything else
loadSettings();

// Set initial presets
updateClocktowerPresets();
updateDisplay();

function playWakeUpSound() {
  if (isRunning) {
    resetTimer();
  }

  // Clear any existing wake-up timeout
  if (wakeUpTimeout) {
    clearTimeout(wakeUpTimeout);
  }

  if (playSoundEffects) {
    wakeUpSound.currentTime = 0;
    wakeUpSound.play().catch((error) => {
      console.log('Error playing wake-up sound:', error);
      createBeep();
    });
  }

  // Increment day counter if we're in a game
  if (currentDay !== null) {
    currentDay++;
    updateDayDisplay('dawn');
    saveSettings();

    // Start countdown display
    const timerDisplay = document.querySelector('.timer-display');
    timerDisplay.classList.add('wake-up-countdown');

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
        updateDayDisplay(); // Reset to normal day display

        // Start next day's timer
        const nextDayPreset = document.querySelector(
          `.clocktower-btn[data-day="${currentDay}"]`
        );
        if (nextDayPreset) {
          nextDayPreset.click();
        }
      }
    }, 1000);

    // Store the countdown interval ID so it can be cleared if needed
    wakeUpTimeout = timerId;
  }
}

function startNewGame() {
  currentDay = 1;
  updateDayDisplay();
  saveSettings();
  closeSettings();

  // Stop any playing video and reshuffle playlist
  if (playMusic && youtubePlayer) {
    const { playlistId } = extractVideoAndPlaylistIds(youtubePlaylistUrl);
    if (playlistId) {
      youtubePlayer.stopVideo(); // Stop current video if playing
      youtubePlayer.setShuffle(true); // Ensure shuffle is enabled
      // Load a new random video from the playlist without playing
      youtubePlayer.cuePlaylist({
        list: playlistId,
        listType: 'playlist',
        index: Math.floor(Math.random() * 50), // Start at random position
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

  if (currentDay === null) {
    dayInfo.innerHTML = 'Day&nbsp;-';
    return;
  }

  const paceEmojis = {
    relaxed: '🐢',
    normal: '🚶',
    speedy: '⚡',
  };
  const paceEmoji = paceEmojis[currentPace];
  const paceText = currentPace.charAt(0).toUpperCase() + currentPace.slice(1);

  if (state === 'dawn') {
    dayInfo.classList.add('dawn');
    dayInfo.innerHTML = `Dawn of Day&nbsp;${currentDay}<div class="pace-indicator">${paceEmoji} ${paceText}</div>`;
  } else if (state === 'dusk') {
    dayInfo.classList.add('dusk');
    dayInfo.innerHTML = `Day&nbsp;${currentDay}, Dusk<div class="pace-indicator">${paceEmoji} ${paceText}</div>`;
  } else {
    dayInfo.innerHTML = `Day&nbsp;${currentDay}<div class="pace-indicator">${paceEmoji} ${paceText}</div>`;
  }

  // Update preset button highlighting
  document.querySelectorAll('.clocktower-btn').forEach((btn) => {
    btn.classList.toggle(
      'current-day',
      parseInt(btn.dataset.day) === currentDay
    );
  });
}

// Generate QR code for the website
function generateQRCode() {
  const url = 'https://chizmw.github.io/clocktowertimer/';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
    url
  )}`;
  document.getElementById('qrCode').src = qrCodeUrl;
}

// Info dialog functionality
function openInfo() {
  generateQRCode();
  infoDialog.showModal();
}

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
function extractVideoAndPlaylistIds(url) {
  const videoRegExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const playlistRegExp = /[?&]list=([^#\&\?]+)/;

  const videoMatch = url.match(videoRegExp);
  const playlistMatch = url.match(playlistRegExp);

  return {
    videoId: videoMatch && videoMatch[2].length === 11 ? videoMatch[2] : null,
    playlistId: playlistMatch ? playlistMatch[1] : null,
  };
}

function initYoutubePlayer() {
  // Remove existing player if any
  const existingContainer = document.querySelector('.youtube-player-container');
  if (existingContainer) {
    existingContainer.remove();
  }

  // Create container for YouTube player
  const container = document.createElement('div');
  container.className = 'youtube-player-container';
  document.body.appendChild(container);

  // Extract video and playlist IDs from URL
  const { videoId, playlistId } =
    extractVideoAndPlaylistIds(youtubePlaylistUrl);
  if (!videoId && !playlistId) return;

  // Load YouTube IFrame API if not already loaded
  if (!window.YT) {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }

  // Create player when API is ready
  window.onYouTubeIframeAPIReady = function () {
    youtubePlayer = new YT.Player(container, {
      height: '135',
      width: '240',
      playerVars: {
        autoplay: 0,
        controls: 1,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
        loop: 1,
      },
      events: {
        onReady: function (event) {
          event.target.setVolume(youtubeVolume); // Use saved volume setting
          if (playlistId) {
            // Enable shuffle before loading playlist
            event.target.setShuffle(true);
            // Load but don't play the playlist
            event.target.cuePlaylist({
              list: playlistId,
              listType: 'playlist',
              index: Math.floor(Math.random() * 50), // Start at random position
              suggestedQuality: 'small',
            });
          } else if (videoId) {
            event.target.cueVideoById(videoId);
          }
        },
        onStateChange: function (event) {
          // When video is cued (ready to play), ensure shuffle is enabled
          if (event.data === YT.PlayerState.CUED && playlistId) {
            event.target.setShuffle(true);
          }
          // Handle video ending
          if (event.data === YT.PlayerState.ENDED) {
            if (playlistId) {
              // For playlists, let YouTube handle the next video
              // The shuffle setting will ensure it's random
            } else {
              // For single videos, replay
              event.target.playVideo();
            }
          }
        },
      },
    });
  };
}

function onPlayerReady(event) {
  // Player is ready but don't autoplay
}

function onPlayerStateChange(event) {
  // Handle player state changes if needed
}

// Update YouTube playlist URL
function updateYoutubePlaylist() {
  const input = document.getElementById('youtubePlaylist');
  youtubePlaylistUrl = input.value;
  saveSettings();
  if (playMusic) {
    initYoutubePlayer();
  }
}

// Toggle music playback
function updateMusicPlayback() {
  playMusic = document.getElementById('playMusic').checked;
  document.getElementById('youtubePlaylist').disabled = !playMusic;
  document.getElementById('youtubeVolume').disabled = !playMusic;

  if (playMusic) {
    initYoutubePlayer();
  } else {
    // Stop and remove the player
    if (youtubePlayer) {
      youtubePlayer.stopVideo();
      const container = document.querySelector('.youtube-player-container');
      if (container) {
        container.remove();
      }
      youtubePlayer = null;
    }
  }
  saveSettings();
}

// Update YouTube volume
function updateYoutubeVolume() {
  youtubeVolume = parseInt(document.getElementById('youtubeVolume').value);
  document.querySelector('.volume-value').textContent = `${youtubeVolume}%`;
  if (youtubePlayer && youtubePlayer.setVolume) {
    youtubePlayer.setVolume(youtubeVolume);
  }
  saveSettings();
}

// Update sound effects playback
function updateSoundEffects() {
  playSoundEffects = document.getElementById('playSoundEffects').checked;
  saveSettings();
}
