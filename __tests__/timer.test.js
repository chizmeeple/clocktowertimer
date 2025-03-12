/**
 * @jest-environment jsdom
 */

import { Timer } from '../src/Timer';
import { jest } from '@jest/globals';

describe('Timer Functionality', () => {
  let timer;
  let minutesDisplay;
  let secondsDisplay;

  beforeEach(() => {
    // Set up our document body
    document.body.innerHTML = `
      <div class="timer">
        <span class="minutes">00</span>:<span class="seconds">00</span>
      </div>
      <button id="startBtn">Start</button>
      <button id="resetBtn">Reset</button>
    `;

    // Initialize timer
    timer = new Timer();
    minutesDisplay = document.querySelector('.minutes');
    secondsDisplay = document.querySelector('.seconds');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('initial timer display shows 00:00', () => {
    expect(minutesDisplay.textContent).toBe('00');
    expect(secondsDisplay.textContent).toBe('00');
  });

  test('setTime updates display correctly', () => {
    timer.setTime(5, 30);
    expect(minutesDisplay.textContent).toBe('05');
    expect(secondsDisplay.textContent).toBe('30');
  });

  test('reset returns display to 00:00', () => {
    timer.setTime(5, 30);
    timer.reset();
    expect(minutesDisplay.textContent).toBe('00');
    expect(secondsDisplay.textContent).toBe('00');
  });

  test('timer starts counting down', () => {
    jest.useFakeTimers();
    timer.setTime(1, 0);
    timer.start();

    expect(timer.isActive()).toBe(true);

    // Fast-forward 1 second
    jest.advanceTimersByTime(1000);
    expect(minutesDisplay.textContent).toBe('00');
    expect(secondsDisplay.textContent).toBe('59');
  });

  test('timer stops at 00:00', () => {
    jest.useFakeTimers();
    timer.setTime(0, 2);
    timer.start();

    // Fast-forward 2 seconds
    jest.advanceTimersByTime(2000);
    expect(minutesDisplay.textContent).toBe('00');
    expect(secondsDisplay.textContent).toBe('00');
    expect(timer.isActive()).toBe(false);
  });
});
