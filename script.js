// Import helper functions
import { updateCharacterAmounts } from './helper.js';

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

// Function to generate day presets
function generateDayPresets(playerCount) {
  const { totalNumbers, dayStartValue, dayEndValue } =
    calcTimerStartEndValues(playerCount);
  const numberOfDays = Math.floor(totalNumbers);
  const presets = [];

  for (let day = 1; day <= numberOfDays; day++) {
    // Linear interpolation between start and end values
    const progress = (day - 1) / (numberOfDays - 1);
    const minutes = roundToNearestQuarter(
      dayStartValue - progress * (dayStartValue - dayEndValue)
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
    });
  }

  return presets;
}

// Timer state
let timeLeft = 0;
let timerId = null;
let isRunning = false;
let selectedSeconds = 0;
let selectedMinutes = 0;
let normalInterval = 1000; // Normal 1 second interval
let currentInterval = normalInterval;

// Settings state
let clocktowerMode = true; // Default to true
let playerCount = 10; // Default to 10 players
let travellerCount = 0; // Default to 0 travellers
let isFirstLoad = false;

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

// Load settings from localStorage
function loadSettings() {
  const savedSettings = localStorage.getItem('quickTimerSettings');
  if (savedSettings) {
    const settings = JSON.parse(savedSettings);
    clocktowerMode = settings.clocktowerMode ?? true;
    playerCount = settings.playerCount || 10;
    travellerCount = settings.travellerCount || 0;
  } else {
    isFirstLoad = true;
  }

  // Always update UI to reflect settings (whether loaded or default)
  clocktowerModeCheckbox.checked = clocktowerMode;
  playerCountInput.value = playerCount;
  travellerCountInput.value = travellerCount;
  clocktowerSettings.classList.toggle('visible', clocktowerMode);
  accelerateBtn.classList.toggle('visible', clocktowerMode);
  document
    .getElementById('characterCounts')
    .classList.toggle('visible', clocktowerMode);
  document
    .getElementById('travellerDisplay')
    .classList.toggle('visible', clocktowerMode && travellerCount > 0);

  // Update character amounts and presets if in clocktower mode
  if (clocktowerMode) {
    updateCharacterAmounts(playerCount);
    document.getElementById('travellerAmount').textContent = travellerCount;
    updateClocktowerPresets();
  }

  // Show settings dialog on first load
  if (isFirstLoad) {
    settingsDialog.showModal();
  }
}

// Save settings to localStorage
function saveSettings() {
  const settings = {
    clocktowerMode,
    playerCount,
    travellerCount,
  };
  localStorage.setItem('quickTimerSettings', JSON.stringify(settings));
  isFirstLoad = false;
}

// Create Audio element for the end sound
const endSound = new Audio('sounds/end-of-day.mp3');
endSound.preload = 'auto';

// DOM elements
const minutesDisplay = document.getElementById('minutes');
const secondsDisplay = document.getElementById('seconds');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsDialog = document.getElementById('settingsDialog');
const closeSettingsBtn = document.getElementById('closeSettings');
const clocktowerModeCheckbox = document.getElementById('clocktowerMode');
const playerCountInput = document.getElementById('playerCount');
const travellerCountInput = document.getElementById('travellerCount');
const clocktowerSettings = document.getElementById('clocktowerSettings');
const accelerateBtn = document.getElementById('accelerateBtn');
const minuteButtons = document.querySelectorAll('.minute-btn');
const secondButtons = document.querySelectorAll('.second-btn');

// Settings functionality
function updateClocktowerPresets() {
  const clocktowerPresetsDiv = document.getElementById('clocktowerPresets');
  clocktowerPresetsDiv.innerHTML = ''; // Clear existing presets

  if (!clocktowerMode) return;

  const presets = generateDayPresets(playerCount);
  presets.forEach((preset, index) => {
    const button = document.createElement('button');
    button.className = 'preset-btn clocktower-btn';
    button.textContent = `Day ${index + 1} (${preset.display})`;
    button.dataset.minutes = preset.minutes;
    button.dataset.seconds = preset.seconds;

    button.addEventListener('click', (e) => {
      // Update active state
      document
        .querySelectorAll('.clocktower-btn')
        .forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');

      // Update selected time
      selectedMinutes = preset.minutes;
      selectedSeconds = preset.seconds;

      // If timer is not running, update display
      if (!isRunning) {
        timeLeft = selectedMinutes * 60 + selectedSeconds;
        updateDisplay();
      }
    });

    clocktowerPresetsDiv.appendChild(button);
  });

  clocktowerPresetsDiv.classList.toggle('visible', clocktowerMode);
}

function toggleClocktowerSettings() {
  clocktowerMode = clocktowerModeCheckbox.checked;
  clocktowerSettings.classList.toggle('visible', clocktowerMode);
  accelerateBtn.classList.toggle('visible', clocktowerMode);
  document
    .getElementById('characterCounts')
    .classList.toggle('visible', clocktowerMode);
  document
    .getElementById('travellerDisplay')
    .classList.toggle('visible', clocktowerMode && travellerCount > 0);

  // Update character amounts and presets if enabling clocktower mode
  if (clocktowerMode) {
    updateCharacterAmounts(playerCount);
    document.getElementById('travellerAmount').textContent = travellerCount;
    updateClocktowerPresets();
  }
  saveSettings();
}

function updatePlayerCount() {
  playerCount = Math.min(
    Math.max(parseInt(playerCountInput.value) || 5, 5),
    15
  );
  playerCountInput.value = playerCount;
  if (clocktowerMode) {
    updateCharacterAmounts(playerCount);
    updateClocktowerPresets();
  }
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
    .classList.toggle('visible', clocktowerMode && travellerCount > 0);
  if (clocktowerMode) {
    document.getElementById('travellerAmount').textContent = travellerCount;
  }
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
  endSound.currentTime = 0; // Reset the sound to start
  endSound.play().catch((error) => {
    console.log('Error playing sound:', error);
    // Fallback to beep if sound file fails
    createBeep();
  });
}

// Create beep sound (fallback if mp3 fails to load)
function createBeep() {
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
      startBtn.textContent = 'Start';
      isRunning = false;
      currentInterval = normalInterval;
    }
  }, currentInterval);

  // Disable accelerate button after use
  accelerateBtn.disabled = true;
}

// Start timer
function startTimer() {
  if (isRunning) {
    // Pause timer
    clearInterval(timerId);
    startBtn.textContent = 'Start';
    isRunning = false;
    return;
  }

  // Start timer
  if (timeLeft === 0) {
    timeLeft = selectedMinutes * 60 + selectedSeconds;
    if (timeLeft === 0) return; // Don't start if no time is set
  }

  startBtn.textContent = 'Pause';
  isRunning = true;
  accelerateBtn.disabled = false; // Re-enable accelerate button

  timerId = setInterval(() => {
    timeLeft--;
    updateDisplay();

    if (timeLeft === 0) {
      clearInterval(timerId);
      playEndSound();
      startBtn.textContent = 'Start';
      isRunning = false;
    }
  }, normalInterval);
}

// Reset timer
function resetTimer() {
  clearInterval(timerId);
  timeLeft = 0;
  isRunning = false;
  currentInterval = normalInterval;
  startBtn.textContent = 'Start';
  accelerateBtn.disabled = false; // Re-enable accelerate button
  updateDisplay();
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
  }
}

// Event listeners
startBtn.addEventListener('click', startTimer);
resetBtn.addEventListener('click', resetTimer);
fullscreenBtn.addEventListener('click', toggleFullscreen);
settingsBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', closeSettings);
clocktowerModeCheckbox.addEventListener('change', toggleClocktowerSettings);
playerCountInput.addEventListener('change', updatePlayerCount);
playerCountInput.addEventListener('input', updatePlayerCount);
travellerCountInput.addEventListener('change', updateTravellerCount);
travellerCountInput.addEventListener('input', updateTravellerCount);
accelerateBtn.addEventListener('click', accelerateTime);

// Add keyboard shortcut for settings dialog
document.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'q') {
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

// Fullscreen change event listener
document.addEventListener('fullscreenchange', updateFullscreenButton);

// Initialize settings before anything else
loadSettings();
accelerateBtn.classList.toggle('visible', clocktowerMode); // Set initial visibility

// Set initial presets
document.querySelector('[data-minutes="5"]').classList.add('active');
document.querySelector('[data-seconds="0"]').classList.add('active');
selectedMinutes = 5; // Set initial minutes
updateDisplay();
