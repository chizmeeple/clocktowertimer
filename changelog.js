// Version tracking
export const APP_VERSION = '1.0.28';

export const CHANGELOG = {
  '1.0.28': {
    date: '2026-04-02',
    changes: {
      fixes: [
        'YouTube music: keep the `youtubePlayer` handle in sync with the real iframe API instance so pause, stop, and destroy actually run — avoids background playback and reduces browser tab crashes on low-memory devices (e38d30c).',
      ],
      improvements: [
        'Dev dependencies: bump minimatch and serve (9fc98c9).',
        'Dev dependencies: bump qs from 6.14.1 to 6.14.2 (6dc5672).',
        'Code quality: general improvements and refactoring (7ae8298).',
        'YouTube player: refactor and hardening — single player handle, shared container lookup, proper tear-down when music is disabled or the device goes offline (8585f17).',
      ],
    },
  },
  '1.0.27': {
    date: '2026-02-03',
    changes: {
      features: [
        'Revised accelerate-time (skip-ahead) flow: skipped preset days are styled as past, hidden when not current, and correctly numbered when starting a new day with Wake Up',
        'Add keyboard shortcut for Accelerate Time',
      ],
      improvements: [
        'Sound choices in settings are now applied correctly; sound loading is more reliable',
        'Nominations countdown resets when starting a new day; wake-up countdown shortened to 6 seconds',
        'Timer display no longer flickers when reloading',
      ],
    },
  },
  '1.0.26': {
    date: '2026-02-03',
    changes: {
      improvements: [
        'Timer display now uses monospaced font (Azeret Mono) so the time does not shift horizontally as digits change',
      ],
    },
  },
  '1.0.25': {
    date: '2026-02-03',
    changes: {
      improvements: [
        'Visual design refresh: DM Sans typography, refined colour palette, and polished UI',
        'Improved focus states for keyboard and TV remote navigation',
        'Refined timer display with subtle glow; softer shadows and transitions throughout',
        'Bottom bar and character counts styling; consistent border-radius and spacing',
        'Resolve code linting warnings',
      ],
    },
  },
  '1.0.24': {
    date: '2026-02-02',
    changes: {
      features: [
        'Add Discover More link to info dialog',
        'Add auto-open-nominations',
      ],
    },
  },
  '1.0.23': {
    date: '2026-02-02',
    changes: {
      improvements: [
        'Resolve issue with Reset Day showing incorrect timer value',
      ],
    },
  },
  '1.0.22': {
    date: '2026-02-02',
    changes: {
      improvements: [
        'Separated day display and Wake Up/Pause button for improved layout and usability',
        'Wake Up/Pause button now displays keyboard shortcut hint for quick reference',
        'Made Wake Up/Pause button taller and more prominent for easier interaction',
      ],
    },
  },
  '1.0.21': {
    date: '2026-02-02',
    changes: {
      features: [
        'Show estimated game length in Settings > Game (excl. nominations)',
      ],
      improvements: [
        'Blitz mode: enforce minimum 2-minute day length for days 1 and 2',
      ],
    },
  },
  '1.0.20': {
    date: '2026-02-02',
    changes: {
      features: [
        'Added "Blitz" game pace mode for ultra-fast games (67% shorter than relaxed pace)',
      ],
    },
  },
  '1.0.19': {
    date: '2025-10-29',
    changes: {
      improvements: ['Fix weird behaviour with ghost dialogs'],
    },
  },
  '1.0.18': {
    date: '2025-10-15',
    changes: {
      improvements: ['Update CSP header and cleanup browser console warnings'],
    },
  },
  '1.0.17': {
    date: '2025-10-15',
    changes: {
      improvements: [
        'Update audio file names to force a cache refresh; revert Chisel Bell to original volume',
      ],
    },
  },
  '1.0.16': {
    date: '2025-10-15',
    changes: {
      improvements: [
        '"TV Friendly" layout changes; update info dialogue layout',
      ],
    },
  },
  '1.0.15': {
    date: '2025-10-15',
    changes: {
      features: [
        'Added keyboard shortcuts for settings, wake up, reset, fullscreen, and info',
      ],
    },
  },
  '1.0.14': {
    date: '2025-04-03',
    changes: {
      improvements: ['"TV Friendly" layout changes; use less vertical space'],
    },
  },
  '1.0.13': {
    date: '2025-04-03',
    changes: {
      features: [
        'Added volume level indicators to the custom player showing current music and sound effects levels',
      ],
      improvements: [
        'Fixed volume control to immediately affect playing music when adjusted',
        'Updated default volume levels to 75% for sound effects and 15% for music',
        'Fixed issue where wake-up sound was playing twice when using the Wake Up button',
      ],
    },
  },
  '1.0.12': {
    date: '2025-03-27',
    changes: {
      features: [
        'Added wake-up sound effect when clicking on day preset buttons',
      ],
    },
  },
  '1.0.11': {
    date: '2025-03-26',
    changes: {
      improvements: [
        'Fixed Reset Day button behaviour to properly reset the timer and show Wake Up action',
        'Extended test suite to include general behaviour tests',
        'Fixed console error for fetchPlaylistTitle; removed test suite exclusion',
      ],
    },
  },
  '1.0.10': {
    date: '2025-03-24',
    changes: {
      features: ['Added test suite'],
    },
  },
  '1.0.9': {
    date: '2025-03-20',
    changes: {
      features: [
        'Added independent volume controls for sound effects and music',
      ],
      improvements: [
        'Fixed traveller count not displaying correctly in character counts area',
        'Increased default sound effect volume for better audibility in social settings',
        'Reorganised settings dialog into Game, Display, and Audio tabs for better clarity',
        'Redesigned YouTube player into a minimal control showing playlist name and current track',
        'Updated control button labels to be more explicit about day timer control',
      ],
    },
  },
  '1.0.8': {
    date: '2025-03-18',
    changes: {
      improvements: [
        'Fixed changelog dialog functionality',
        'Updated styling for settings dialog',
        'Simplified Ko-Fi support button to use a static image',
        'Fixed sound effect selections not showing correctly in settings dialog',
      ],
    },
  },
  '1.0.7': {
    date: '2025-03-17',
    changes: {
      features: [
        'Added portrait mode warning for better user experience on mobile devices',
      ],
    },
  },
  '1.0.6': {
    date: '2025-03-17',
    changes: {
      improvements: [
        'Fixed styling of sound effect options when "Play Sound Effects" is disabled',
        "Fixed What's New dialog not showing when updating from older versions",
      ],
    },
  },
  '1.0.5': {
    date: '2025-03-17',
    changes: {
      features: [
        'Added "Play Music at Night" setting to allow background music to continue playing during night phase',
      ],
      improvements: ['Enhanced visual feedback for dependent music settings'],
    },
  },
  '1.0.4': {
    date: '2025-03-14',
    changes: {
      improvements: [
        'Fixed issue where Day number was not displaying correctly after initial setup',
      ],
    },
  },
  '1.0.3': {
    date: '2025-03-14',
    changes: {
      improvements: [
        'Updated website URL to <a href="https://timer.arcane-scripts.net">timer.arcane-scripts.net</a>',
        'Added Open Graph metadata for better link sharing previews',
        'Improved accessibility with ARIA labels and keyboard navigation',
        'Enhanced performance with resource preloading',
        'Added Content Security Policy for better security',
      ],
    },
  },
  '1.0.2': {
    date: '2025-03-14',
    changes: {
      features: [
        'Added customisable sound selection for end-of-day and wake-up sounds',
        'Added sound preview functionality with play buttons',
      ],
      improvements: ['Minor style and display improvements'],
    },
  },
  '1.0.1': {
    date: '2025-03-14',
    changes: {
      features: [
        "Added What's New dialogue to show version changes",
        'Added version information and changelog to About screen',
      ],
      improvements: [
        'Improved About dialogue layout and usability',
        'Added keyboard shortcut (<code>i</code>) to open About dialogue',
      ],
    },
  },
  '1.0.0': {
    date: '2025-03-13',
    changes: {
      features: [
        'Initial release with core timer functionality',
        'Player count management',
        'Game pace settings',
        'Sound effects and music integration',
        'Theme support',
      ],
      improvements: [
        'Responsive design for all devices',
        'Offline capability',
        'Settings persistence',
      ],
    },
  },
};
