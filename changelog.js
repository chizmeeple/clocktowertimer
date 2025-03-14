// Version tracking
export const APP_VERSION = '1.0.1';

export const CHANGELOG = {
  '1.0.1': {
    date: '2024-03-21',
    changes: {
      features: [
        "Added What's New dialog to show version changes",
        'Added version information and changelog to About screen',
      ],
      improvements: [
        'Improved About dialog layout and usability',
        'Added keyboard shortcut (<code>i</code>) to open About dialog',
      ],
    },
  },
  '1.0.0': {
    date: '2024-03-21',
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
