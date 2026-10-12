# (Yet Another) Clocktower Timer

![Screen grab of app](images/readme/screen-grab.png)

## Finding It

Simply visit
[https://timer.arcane-scripts.net](https://timer.arcane-scripts.net)
to use this timer.

## Features

### Core Timer Features

- Basic countdown functionality
- Pause/Resume capability
- Reset functionality
- Fullscreen mode

### Game Day Management

- Day tracking (Day 1 through N)
- Automatic day progression
- Day state indicators (Dawn/Normal/Dusk)
- "Wake Up" transition between days
- Short countdown (10 seconds) when waking up

### Player Count Features

- Support for 5-15 players
- Automatic timer duration calculation based on player count
- Character distribution display (Townsfolk/Outsider/Minion/Demon)
- Traveller count support (0-5)

### Game Pace Settings

- Three pace options: Relaxed, Normal, Speedy
- Automatic timer adjustment based on pace
- Visual indicators for current pace (🐢/🚶/⚡)

### Timer Presets

- Dynamic day presets based on player count
- Automatic time scaling for different game paces
- Visual highlighting of current day's preset

### Sound Features

- Wake up bell sound
- End of day bell sound
- Fallback beep sound if audio files fail to load
- Toggleable sound effects

### Music Integration

- YouTube playlist support
- Custom playlist URL support
- Volume control
- Auto-pause/resume with timer
- Playlist shuffling
- Offline mode handling

### Visual Features

- Large, clear timer display
- Day/Dawn/Dusk state indicators
- Theme support (medieval-cartoon and others)
- Button state management
- Progress indicator for accelerate button

### Special Functions

- "Accelerate Time" feature (hold-to-activate)
- Wake Lock to prevent device sleep
- QR code generation for sharing
- Settings persistence (localStorage)

### UI/UX Features

- Settings dialog
- Info dialog
- Keyboard shortcuts (e.g., 'Q' for settings)
- Responsive design
- Clear button states and labels
- First-time user onboarding

### Technical Features

- Offline capability
- Error handling for audio and YouTube
- Device wake lock
- Local storage for settings
- Pure HTML, CSS, and JavaScript, with a small release stamp so cached
  files from different versions are not mixed

## Settings Dialog

![Settings dialog](images/readme/settings.png)

## Development

This is a pure HTML, CSS, and JavaScript application. To run locally:

```bash
python3 -m http.server
```

Then visit `http://localhost:8000` in your browser.

The static server ignores the version query string on CSS and JavaScript, so
local development does not need a build. While you are editing the current
version, those URLs stay the same, and a browser may reuse a cached module
until you hard-refresh or change `APP_VERSION`.

Install dependencies, then run the checks you need. Cypress uses the
installed Google Chrome browser by default, so Chrome must be installed for
the browser tests. `npm test` starts a static server on port 8006, waits
until it responds, runs the complete Cypress suite, and stops the server when
Cypress finishes. `npm run test:open` starts the same server and launches
interactive Cypress. `npm run test:unit` does not need that server. To use
another supported browser, pass `--browser` to Cypress, which overrides the
default. `npm run stamp-release` writes the current version into the entry
page and release manifest; use it only when preparing or updating a release,
not during ordinary testing.

```bash
npm ci
npm run test:unit
npm test
npm run test:open
npm run stamp-release
```

## Releasing

GitHub Pages publishes the `main` branch from the repository root. There is no
generated site directory. `APP_VERSION` in `changelog.js` is the application
version.

When it changes, update the entry page and release manifest so the stylesheet
and every local module use that version:

```bash
npm run stamp-release
```

Commit `index.html` and `release.json` with the version change. The node tests
check that those files match `APP_VERSION` and that local module imports are
covered. GitHub Pages does not support custom cache headers.
