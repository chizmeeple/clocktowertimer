// Timer state
let timeLeft = 0;
let timerId = null;
let isRunning = false;
let selectedSeconds = 0;
let selectedMinutes = 0;

// Settings state
let clocktowerMode = false;
let playerCount = 5;

// Load settings from localStorage
function loadSettings() {
  const savedSettings = localStorage.getItem('quickTimerSettings');
  if (savedSettings) {
    const settings = JSON.parse(savedSettings);
    clocktowerMode = settings.clocktowerMode || false;
    playerCount = settings.playerCount || 5;

    // Update UI to reflect loaded settings
    clocktowerModeCheckbox.checked = clocktowerMode;
    playerCountInput.value = playerCount;
    clocktowerSettings.classList.toggle('visible', clocktowerMode);
  }
}

// Save settings to localStorage
function saveSettings() {
  const settings = {
    clocktowerMode,
    playerCount,
  };
  localStorage.setItem('quickTimerSettings', JSON.stringify(settings));
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
const clocktowerSettings = document.getElementById('clocktowerSettings');
const minuteButtons = document.querySelectorAll('.minute-btn');
const secondButtons = document.querySelectorAll('.second-btn');

// Settings functionality
function toggleClocktowerSettings() {
  clocktowerMode = clocktowerModeCheckbox.checked;
  clocktowerSettings.classList.toggle('visible', clocktowerMode);
  saveSettings();
}

function updatePlayerCount() {
  playerCount = Math.min(
    Math.max(parseInt(playerCountInput.value) || 5, 5),
    15
  );
  playerCountInput.value = playerCount;
  saveSettings();
}

function openSettings() {
  settingsDialog.showModal();
}

function closeSettings() {
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

  timerId = setInterval(() => {
    timeLeft--;
    updateDisplay();

    if (timeLeft === 0) {
      clearInterval(timerId);
      playEndSound();
      startBtn.textContent = 'Start';
      isRunning = false;
    }
  }, 1000);
}

// Reset timer
function resetTimer() {
  clearInterval(timerId);
  timeLeft = 0;
  isRunning = false;
  startBtn.textContent = 'Start';
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

// Add click handlers for preset buttons
minuteButtons.forEach((btn) => {
  btn.addEventListener('click', handleMinuteClick);
});

secondButtons.forEach((btn) => {
  btn.addEventListener('click', handleSecondClick);
});

// Fullscreen change event listener
document.addEventListener('fullscreenchange', updateFullscreenButton);

// Set initial presets
document.querySelector('[data-minutes="5"]').classList.add('active');
document.querySelector('[data-seconds="0"]').classList.add('active');
selectedMinutes = 5; // Set initial minutes
loadSettings(); // Load saved settings
updateDisplay();
