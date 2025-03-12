/**
 * @jest-environment jsdom
 */

import { Timer } from '../src/Timer';
import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Settings Dialog Functionality', () => {
  let settingsDialog;
  let closeSettingsBtn;
  let localStorageMock;
  let isFirstLoad;

  // Mock functions from script.js
  function loadSettings() {
    const savedSettings = localStorageMock.getItem('quickTimerSettings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      document.getElementById('playerCount').value = settings.playerCount || 10;
      document.getElementById('travellerCount').value =
        settings.travellerCount || 0;
      document.getElementById('gamePace').value =
        settings.currentPace || 'normal';
    } else {
      isFirstLoad = true;
      // Show settings dialog on first load
      requestAnimationFrame(() => {
        settingsDialog.showModal();
      });
    }
  }

  function saveSettings() {
    const settings = {
      playerCount: parseInt(document.getElementById('playerCount').value),
      travellerCount: parseInt(document.getElementById('travellerCount').value),
      currentPace: document.getElementById('gamePace').value,
      playMusic: false,
      playSoundEffects: true,
      backgroundTheme: 'medieval-cartoon',
    };
    localStorageMock.setItem('quickTimerSettings', JSON.stringify(settings));
  }

  function closeSettings() {
    saveSettings();
    settingsDialog.close();
  }

  function updateDayDisplay(state = '') {
    const dayInfo = document.querySelector('.day-display');
    if (!dayInfo) return;

    // Remove existing state classes
    dayInfo.classList.remove('dawn', 'dusk');

    const paceEmojis = {
      relaxed: '🐢',
      normal: '🚶',
      speedy: '⚡',
    };
    const currentPace = document.getElementById('gamePace').value;
    const paceEmoji = paceEmojis[currentPace];
    const paceText = currentPace.charAt(0).toUpperCase() + currentPace.slice(1);

    const currentDaySpan = document.getElementById('currentDay');
    currentDaySpan.textContent = '1';
    dayInfo.querySelector('.pace-indicator')?.remove();
    dayInfo.insertAdjacentHTML(
      'beforeend',
      `<div class="pace-indicator">${paceEmoji} ${paceText}</div>`
    );
  }

  beforeEach(() => {
    // Load the HTML fixture
    const fixture = readFileSync(
      resolve(__dirname, './fixtures/app.html'),
      'utf8'
    );
    document.documentElement.innerHTML = fixture;

    // Mock requestAnimationFrame
    jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb) => cb());

    // Mock localStorage
    localStorageMock = {
      store: {},
      getItem: jest.fn((key) => localStorageMock.store[key]),
      setItem: jest.fn((key, value) => {
        localStorageMock.store[key] = value;
      }),
      removeItem: jest.fn((key) => {
        delete localStorageMock.store[key];
      }),
      clear: jest.fn(() => {
        localStorageMock.store = {};
      }),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
    });

    // Reset isFirstLoad
    isFirstLoad = false;

    // Initialize elements
    settingsDialog = document.getElementById('settingsDialog');
    closeSettingsBtn = document.getElementById('closeSettings');

    // Mock dialog methods
    settingsDialog.showModal = jest.fn(() => {
      settingsDialog.setAttribute('open', '');
    });
    settingsDialog.close = jest.fn(() => {
      settingsDialog.removeAttribute('open');
    });

    // Add event listeners
    closeSettingsBtn.addEventListener('click', closeSettings);

    // Load settings
    loadSettings();
    updateDayDisplay();
  });

  afterEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test('settings dialog shows on first load when localStorage is empty', () => {
    // The dialog should be shown
    expect(settingsDialog.hasAttribute('open')).toBe(true);
    expect(settingsDialog.showModal).toHaveBeenCalled();

    // Verify day display shows Day 1 and Normal pace
    const dayDisplay = document.querySelector('.day-display');
    const currentDay = document.getElementById('currentDay');
    expect(currentDay.textContent).toBe('1');
    expect(dayDisplay.querySelector('.pace-indicator').textContent).toBe(
      '🚶 Normal'
    );

    // Verify button states
    const wakeUpBtn = document.getElementById('startBtn');
    const resetBtn = document.getElementById('resetBtn');
    const accelerateBtn = document.getElementById('accelerateBtn');

    expect(wakeUpBtn).not.toBeNull();
    expect(wakeUpBtn.disabled).toBe(false);
    expect(wakeUpBtn.textContent).toBe('Wake Up');

    expect(resetBtn).not.toBeNull();
    expect(resetBtn.disabled).toBe(false);
    expect(resetBtn.textContent).toBe('Reset');

    expect(accelerateBtn).not.toBeNull();
    expect(accelerateBtn.disabled).toBe(true);
    expect(accelerateBtn.textContent).toBe('Accelerate Time');
  });

  test('settings are saved to localStorage when closing dialog', () => {
    // Set some values
    const playerCount = document.getElementById('playerCount');
    const travellerCount = document.getElementById('travellerCount');
    const gamePace = document.getElementById('gamePace');

    playerCount.value = '8';
    travellerCount.value = '2';
    gamePace.value = 'speedy';
    updateDayDisplay();

    // Close the dialog which should trigger save
    closeSettingsBtn.click();

    // Verify localStorage was called with correct values
    const savedSettings = JSON.parse(
      localStorageMock.store.quickTimerSettings || '{}'
    );
    expect(savedSettings).toMatchObject({
      playerCount: 8,
      travellerCount: 2,
      currentPace: 'speedy',
    });
    expect(settingsDialog.close).toHaveBeenCalled();
    expect(settingsDialog.hasAttribute('open')).toBe(false);

    // Verify day display shows Day 1 and Speedy pace
    const dayDisplay = document.querySelector('.day-display');
    const currentDay = document.getElementById('currentDay');
    expect(currentDay.textContent).toBe('1');
    expect(dayDisplay.querySelector('.pace-indicator').textContent).toBe(
      '⚡ Speedy'
    );

    // Verify button states remain correct after settings change
    const wakeUpBtn = document.getElementById('startBtn');
    const resetBtn = document.getElementById('resetBtn');
    const accelerateBtn = document.getElementById('accelerateBtn');

    expect(wakeUpBtn.disabled).toBe(false);
    expect(resetBtn.disabled).toBe(false);
    expect(accelerateBtn.disabled).toBe(true);
  });

  test('settings dialog does not show on load when localStorage has values', () => {
    // Clear any existing state
    settingsDialog.removeAttribute('open');
    jest.clearAllMocks();

    // Set up existing localStorage data
    localStorageMock.store.quickTimerSettings = JSON.stringify({
      playerCount: 8,
      travellerCount: 0,
      currentPace: 'normal',
      playMusic: false,
      playSoundEffects: true,
      backgroundTheme: 'medieval-cartoon',
    });

    // Load settings again
    loadSettings();
    updateDayDisplay();

    // The dialog should not be shown
    expect(settingsDialog.hasAttribute('open')).toBe(false);
    expect(settingsDialog.showModal).not.toHaveBeenCalled();

    // Verify settings were loaded
    expect(document.getElementById('playerCount').value).toBe('8');
    expect(document.getElementById('travellerCount').value).toBe('0');
    expect(document.getElementById('gamePace').value).toBe('normal');

    // Verify day display shows Day 1 and Normal pace
    const dayDisplay = document.querySelector('.day-display');
    const currentDay = document.getElementById('currentDay');
    expect(currentDay.textContent).toBe('1');
    expect(dayDisplay.querySelector('.pace-indicator').textContent).toBe(
      '🚶 Normal'
    );

    // Verify button states are correct with loaded settings
    const wakeUpBtn = document.getElementById('startBtn');
    const resetBtn = document.getElementById('resetBtn');
    const accelerateBtn = document.getElementById('accelerateBtn');

    expect(wakeUpBtn.disabled).toBe(false);
    expect(resetBtn.disabled).toBe(false);
    expect(accelerateBtn.disabled).toBe(true);
  });
});
