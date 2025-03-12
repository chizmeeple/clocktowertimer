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

  // Basic functionality tests
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

  // Edge cases for setTime
  test('setTime handles invalid inputs correctly', () => {
    // Test negative numbers
    timer.setTime(-1, -30);
    expect(minutesDisplay.textContent).toBe('00');
    expect(secondsDisplay.textContent).toBe('00');

    // Test non-numeric values
    timer.setTime('abc', 'def');
    expect(minutesDisplay.textContent).toBe('00');
    expect(secondsDisplay.textContent).toBe('00');

    // Test decimal values
    timer.setTime(1.5, 30.7);
    expect(minutesDisplay.textContent).toBe('01');
    expect(secondsDisplay.textContent).toBe('30');
  });

  // Start/Stop behavior tests
  test('start returns false when timer is at 00:00', () => {
    timer.setTime(0, 0);
    expect(timer.start()).toBe(false);
    expect(timer.isActive()).toBe(false);
  });

  test('start returns false when timer is already running', () => {
    timer.setTime(1, 0);
    expect(timer.start()).toBe(true);
    expect(timer.start()).toBe(false);
  });

  test('stop returns false when timer is not running', () => {
    timer.setTime(1, 0);
    expect(timer.stop()).toBe(false);
  });

  // Multiple minute countdown test
  test('timer counts down multiple minutes correctly', () => {
    jest.useFakeTimers();
    timer.setTime(2, 0);
    timer.start();

    // Fast-forward 1 minute
    jest.advanceTimersByTime(60000);
    expect(minutesDisplay.textContent).toBe('01');
    expect(secondsDisplay.textContent).toBe('00');

    // Fast-forward another 30 seconds
    jest.advanceTimersByTime(30000);
    expect(minutesDisplay.textContent).toBe('00');
    expect(secondsDisplay.textContent).toBe('30');
  });

  // Reset during running test
  test('reset stops and clears a running timer', () => {
    jest.useFakeTimers();
    timer.setTime(1, 0);
    timer.start();

    jest.advanceTimersByTime(30000);
    timer.reset();

    expect(timer.isActive()).toBe(false);
    expect(minutesDisplay.textContent).toBe('00');
    expect(secondsDisplay.textContent).toBe('00');
  });

  // getTime method test
  test('getTime returns correct time values', () => {
    timer.setTime(2, 30);
    const time = timer.getTime();
    expect(time.minutes).toBe(2);
    expect(time.seconds).toBe(30);
  });
});
