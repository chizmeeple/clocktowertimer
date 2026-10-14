// The two player options on this device. Anything else in the save is ignored.
// A bad save, or storage that throws, falls back without stopping the page.

export const COMPANION_PREFERENCES_KEY = 'timer-companion';

function defaultPreferences() {
  return { warnNearEnd: false, keepScreenOn: false };
}

function booleanPreference(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function openStorage(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function readCompanionPreferences(storage) {
  const store = openStorage(storage);
  if (!store) return defaultPreferences();
  let raw;
  try {
    raw = store.getItem(COMPANION_PREFERENCES_KEY);
  } catch {
    return defaultPreferences();
  }
  if (typeof raw !== 'string' || raw.length === 0) return defaultPreferences();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultPreferences();
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return defaultPreferences();
  }
  return {
    warnNearEnd: booleanPreference(parsed.warnNearEnd, false),
    keepScreenOn: booleanPreference(parsed.keepScreenOn, false),
  };
}

export function writeCompanionPreferences(preferences, storage) {
  const store = openStorage(storage);
  const saved = store ? readCompanionPreferences(store) : defaultPreferences();
  const next = {
    warnNearEnd: booleanPreference(preferences?.warnNearEnd, saved.warnNearEnd),
    keepScreenOn: booleanPreference(preferences?.keepScreenOn, saved.keepScreenOn),
  };
  if (!store) return next;
  try {
    store.setItem(COMPANION_PREFERENCES_KEY, JSON.stringify(next));
  } catch {
    // The visit keeps the choice in memory.
  }
  return next;
}
