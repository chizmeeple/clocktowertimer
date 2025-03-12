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
  }

  setTime(minutes, seconds) {
    this.minutes = parseInt(minutes) || 0;
    this.seconds = parseInt(seconds) || 0;
    this.updateDisplay();
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
      return true;
    }
    return false;
  }

  stop() {
    if (this.isRunning) {
      clearInterval(this.timerInterval);
      this.isRunning = false;
      return true;
    }
    return false;
  }

  reset() {
    this.stop();
    this.minutes = 0;
    this.seconds = 0;
    this.updateDisplay();
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
}
