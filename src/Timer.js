export class Timer {
  constructor() {
    this.minutesDisplay = document.querySelector('.minutes');
    this.secondsDisplay = document.querySelector('.seconds');
    this.startBtn = document.querySelector('#startBtn');
    this.resetBtn = document.querySelector('#resetBtn');
    this.minutes = 0;
    this.seconds = 0;
    this.isRunning = false;
    this.timerInterval = null;

    // Try to restore saved state
    this.restoreState();
  }

  setTime(minutes, seconds) {
    const parsedMinutes = parseInt(minutes);
    const parsedSeconds = parseInt(seconds);

    this.minutes =
      !isNaN(parsedMinutes) && parsedMinutes >= 0 ? parsedMinutes : 0;
    this.seconds =
      !isNaN(parsedSeconds) && parsedSeconds >= 0 ? parsedSeconds : 0;

    this.updateDisplay();
    this.saveState();
  }

  updateDisplay() {
    if (this.minutesDisplay && this.secondsDisplay) {
      this.minutesDisplay.textContent = String(this.minutes).padStart(2, '0');
      this.secondsDisplay.textContent = String(this.seconds).padStart(2, '0');
    }
  }

  start() {
    if (!this.isRunning && (this.minutes > 0 || this.seconds > 0)) {
      this.isRunning = true;
      this.timerInterval = setInterval(() => this.tick(), 1000);
      this.saveState();
      return true;
    }
    return false;
  }

  stop() {
    if (this.isRunning) {
      clearInterval(this.timerInterval);
      this.isRunning = false;
      this.saveState();
      return true;
    }
    return false;
  }

  reset() {
    this.stop();
    this.minutes = 0;
    this.seconds = 0;
    this.updateDisplay();
    this.saveState();
  }

  tick() {
    if (this.minutes === 0 && this.seconds === 0) {
      this.stop();
      return;
    }

    if (this.seconds === 0) {
      this.minutes--;
      this.seconds = 59;
    } else {
      this.seconds--;
    }

    if (this.minutes === 0 && this.seconds === 0) {
      this.stop();
    }

    this.updateDisplay();
    this.saveState();
  }

  getTime() {
    return {
      minutes: this.minutes,
      seconds: this.seconds,
    };
  }

  isActive() {
    return this.isRunning;
  }

  saveState() {
    try {
      const state = {
        minutes: this.minutes,
        seconds: this.seconds,
        isRunning: this.isRunning,
      };
      localStorage.setItem('timerState', JSON.stringify(state));
      return true;
    } catch (error) {
      console.error('Failed to save timer state:', error);
      return false;
    }
  }

  restoreState() {
    try {
      const savedState = localStorage.getItem('timerState');
      if (savedState) {
        const state = JSON.parse(savedState);
        this.minutes = state.minutes;
        this.seconds = state.seconds;
        this.updateDisplay();

        // Start the timer after setting up the state if it was running
        if (state.isRunning) {
          this.start();
        }
        return true;
      }
    } catch (error) {
      console.error('Failed to restore timer state:', error);
    }
    return false;
  }

  clearSavedState() {
    try {
      localStorage.removeItem('timerState');
      return true;
    } catch (error) {
      console.error('Failed to clear timer state:', error);
      return false;
    }
  }
}
