/**
 * @jest-environment jsdom
 */

import { Timer } from '../src/Timer';
import { jest } from '@jest/globals';

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

  beforeEach(() => {
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

    // Set up our document body
    document.body.innerHTML = `
      <div class="timer">
        <span class="minutes">00</span>:<span class="seconds">00</span>
      </div>
      <button id="startBtn">Start</button>
      <button id="resetBtn">Reset</button>
      <dialog id="settingsDialog" class="settings-dialog">
        <div class="dialog-content">
          <h2>Settings</h2>
          <div class="setting-group">
            <label>
              <span>Number of Players</span>
              <input type="number" id="playerCount" value="10" />
            </label>
            <label>
              <span>Number of Travellers</span>
              <input type="number" id="travellerCount" value="0" />
            </label>
            <label>
              <span>Game Pace</span>
              <select id="gamePace">
                <option value="normal">Normal</option>
                <option value="relaxed">Relaxed</option>
                <option value="speedy">Speedy</option>
              </select>
            </label>
          </div>
          <div class="dialog-buttons">
            <button id="closeSettings">Save and Close</button>
          </div>
        </div>
      </dialog>
    `;

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
  });

  test('settings are saved to localStorage when closing dialog', () => {
    // Set some values
    const playerCount = document.getElementById('playerCount');
    const travellerCount = document.getElementById('travellerCount');
    const gamePace = document.getElementById('gamePace');

    playerCount.value = '8';
    travellerCount.value = '2';
    gamePace.value = 'speedy';

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

    // The dialog should not be shown
    expect(settingsDialog.hasAttribute('open')).toBe(false);
    expect(settingsDialog.showModal).not.toHaveBeenCalled();

    // Verify settings were loaded
    expect(document.getElementById('playerCount').value).toBe('8');
    expect(document.getElementById('travellerCount').value).toBe('0');
    expect(document.getElementById('gamePace').value).toBe('normal');
  });
});
