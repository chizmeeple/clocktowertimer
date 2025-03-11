// Timer state
let timeLeft = 0;
let timerId = null;
let isRunning = false;
let selectedSeconds = 0;
let selectedMinutes = 0;

// Create Audio element for the end sound
const endSound = new Audio('sounds/end-of-day.mp3');
endSound.preload = 'auto';

// DOM elements
const minutesDisplay = document.getElementById('minutes');
const secondsDisplay = document.getElementById('seconds');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const minuteButtons = document.querySelectorAll('.minute-btn');
const secondButtons = document.querySelectorAll('.second-btn');

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

// Add click handlers for preset buttons
minuteButtons.forEach((btn) => {
  btn.addEventListener('click', handleMinuteClick);
});

secondButtons.forEach((btn) => {
  btn.addEventListener('click', handleSecondClick);
});

// Set initial presets
document.querySelector('[data-minutes="5"]').classList.add('active');
document.querySelector('[data-seconds="0"]').classList.add('active');
selectedMinutes = 5; // Set initial minutes
updateDisplay();
