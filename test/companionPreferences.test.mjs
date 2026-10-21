import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPANION_PREFERENCES_KEY,
  readCompanionPreferences,
  writeCompanionPreferences,
} from '../js/companionPreferences.js';

const defaults = { warnNearEnd: false, keepScreenOn: false };

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}

function saved(storage) {
  return JSON.parse(storage.getItem(COMPANION_PREFERENCES_KEY));
}

describe('companion player preferences', () => {
  it('uses both options off when nothing is stored', () => {
    const storage = memoryStorage();
    assert.deepEqual(readCompanionPreferences(storage), defaults);
    assert.equal(storage.getItem(COMPANION_PREFERENCES_KEY), null);
  });

  it('restores a saved pair of booleans', () => {
    const storage = memoryStorage({
      [COMPANION_PREFERENCES_KEY]: JSON.stringify({
        warnNearEnd: true,
        keepScreenOn: true,
      }),
    });
    assert.deepEqual(readCompanionPreferences(storage), {
      warnNearEnd: true,
      keepScreenOn: true,
    });
  });

  it('saves one option without dropping the other', () => {
    const storage = memoryStorage();
    writeCompanionPreferences({ warnNearEnd: true }, storage);
    writeCompanionPreferences({ keepScreenOn: true }, storage);
    assert.deepEqual(saved(storage), { warnNearEnd: true, keepScreenOn: true });
    writeCompanionPreferences({ warnNearEnd: false }, storage);
    assert.deepEqual(saved(storage), {
      warnNearEnd: false,
      keepScreenOn: true,
    });
  });

  it('keeps the save for a later read, as a new page would', () => {
    const first = memoryStorage();
    writeCompanionPreferences({ keepScreenOn: true }, first);
    writeCompanionPreferences({ warnNearEnd: true }, first);
    const second = memoryStorage({
      [COMPANION_PREFERENCES_KEY]: first.getItem(COMPANION_PREFERENCES_KEY),
    });
    assert.deepEqual(readCompanionPreferences(second), {
      warnNearEnd: true,
      keepScreenOn: true,
    });
  });

  it('falls back to defaults when the JSON cannot be parsed', () => {
    for (const raw of ['{', '', 'null', '[]', '"true"', '1']) {
      const storage = memoryStorage({ [COMPANION_PREFERENCES_KEY]: raw });
      assert.deepEqual(readCompanionPreferences(storage), defaults, raw);
    }
  });

  it('defaults each missing or mistyped option on its own', () => {
    const missing = memoryStorage({
      [COMPANION_PREFERENCES_KEY]: JSON.stringify({ warnNearEnd: true }),
    });
    assert.deepEqual(readCompanionPreferences(missing), {
      warnNearEnd: true,
      keepScreenOn: false,
    });

    const mistyped = memoryStorage({
      [COMPANION_PREFERENCES_KEY]: JSON.stringify({
        warnNearEnd: 'yes',
        keepScreenOn: 1,
      }),
    });
    assert.deepEqual(readCompanionPreferences(mistyped), defaults);

    const oneValid = memoryStorage({
      [COMPANION_PREFERENCES_KEY]: JSON.stringify({
        warnNearEnd: 'yes',
        keepScreenOn: true,
      }),
    });
    assert.deepEqual(readCompanionPreferences(oneValid), {
      warnNearEnd: false,
      keepScreenOn: true,
    });
  });

  it('ignores anything other than the two booleans', () => {
    const storage = memoryStorage({
      [COMPANION_PREFERENCES_KEY]: JSON.stringify({
        warnNearEnd: true,
        keepScreenOn: false,
        code: 'ABC234',
        writeToken: 'secret',
        lock: { released: false },
      }),
    });
    assert.deepEqual(readCompanionPreferences(storage), {
      warnNearEnd: true,
      keepScreenOn: false,
    });
    writeCompanionPreferences({ keepScreenOn: true }, storage);
    assert.deepEqual(saved(storage), { warnNearEnd: true, keepScreenOn: true });
  });

  it('ignores a non-boolean update and keeps the stored value', () => {
    const storage = memoryStorage();
    writeCompanionPreferences(
      { warnNearEnd: true, keepScreenOn: true },
      storage,
    );
    writeCompanionPreferences({ warnNearEnd: 'no', code: 'ABC234' }, storage);
    assert.deepEqual(saved(storage), { warnNearEnd: true, keepScreenOn: true });
  });

  it('keeps working when storage reads or writes throw', () => {
    const blocked = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };
    assert.deepEqual(readCompanionPreferences(blocked), defaults);
    assert.deepEqual(
      writeCompanionPreferences(
        { warnNearEnd: true, keepScreenOn: true },
        blocked,
      ),
      { warnNearEnd: true, keepScreenOn: true },
    );

    const readable = memoryStorage({
      [COMPANION_PREFERENCES_KEY]: JSON.stringify({
        warnNearEnd: true,
        keepScreenOn: false,
      }),
    });
    readable.setItem = () => {
      throw new Error('blocked');
    };
    assert.deepEqual(
      writeCompanionPreferences({ keepScreenOn: true }, readable),
      {
        warnNearEnd: true,
        keepScreenOn: true,
      },
    );
    assert.deepEqual(saved(readable), {
      warnNearEnd: true,
      keepScreenOn: false,
    });
  });
});
