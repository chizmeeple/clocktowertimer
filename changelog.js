// Version tracking
export const APP_VERSION = '1.0.9';

export const CHANGELOG = {
  '1.0.9': {
    date: '2025-03-20',
    changes: {
      features: [
        'Added independent volume controls for sound effects and music',
      ],
      improvements: [
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
