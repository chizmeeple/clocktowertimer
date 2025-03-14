// Version tracking
export const APP_VERSION = '1.0.3';

export const CHANGELOG = {
  '1.0.3': {
    date: '2025-03-15',
    changes: {
      improvements: [
        'Updated website URL to <a href="https://timer.arcane-scripts.net">timer.arcane-scripts.net</a>',
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
