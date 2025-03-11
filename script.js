// Create audio context for the beep sound
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Timer state
let timeLeft = 0;
let timerId = null;
let isRunning = false;

// DOM elements
const minutesDisplay = document.getElementById('minutes');
const secondsDisplay = document.getElementById('seconds');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const timeInput = document.getElementById('timeInput');

// Create beep sound
function createBeep() {
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
    timeLeft = parseInt(timeInput.value) * 60;
  }

  startBtn.textContent = 'Pause';
  isRunning = true;

  timerId = setInterval(() => {
    timeLeft--;
    updateDisplay();

    if (timeLeft === 0) {
      clearInterval(timerId);
      createBeep();
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

// Event listeners
startBtn.addEventListener('click', startTimer);
resetBtn.addEventListener('click', resetTimer);
timeInput.addEventListener('change', () => {
  if (!isRunning) {
    timeLeft = 0;
    updateDisplay();
  }
});
