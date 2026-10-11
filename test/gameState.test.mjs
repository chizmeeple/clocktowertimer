import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_PACE,
  WAKE_UP_COUNTDOWN_SECONDS,
  createGameState,
  estimateGameLengthMinutes,
  generateDayPresets,
  getPresetDayLabel,
  listVisiblePresets,
  nominationsDelaySeconds,
  presetForDay,
  stepNominationsCountdown,
} from '../gameState.js';

function presetMap(presets) {
  return Object.fromEntries(
    presets.map((preset) => [preset.day, preset.display])
  );
}

describe('day durations', () => {
  it('builds the normal, relaxed, speedy, and blitz day lengths', () => {
    assert.equal(WAKE_UP_COUNTDOWN_SECONDS, 6);
    assert.deepEqual(presetMap(generateDayPresets(10, 'normal')), {
      1: '04:45',
      2: '04:15',
      3: '04:00',
      4: '03:30',
      5: '03:00',
      6: '02:30',
      7: '02:00',
      8: '01:30',
    });
    assert.equal(generateDayPresets(10, 'relaxed')[0].display, '06:00');
    assert.equal(generateDayPresets(10, 'relaxed').at(-1).display, '02:00');
    assert.equal(generateDayPresets(10, 'speedy')[0].display, '03:00');
    assert.equal(generateDayPresets(10, 'blitz')[0].display, '02:00');
    assert.equal(generateDayPresets(10, 'blitz')[1].display, '02:00');
    assert.equal(generateDayPresets(5, 'normal')[0].display, '03:15');
    assert.equal(generateDayPresets(5, 'blitz')[1].display, '02:00');
  });

  it('includes a night and a nominations allowance in the estimated length', () => {
    assert.equal(estimateGameLengthMinutes(5, 'normal'), 38);
    assert.equal(estimateGameLengthMinutes(10, 'normal'), 86);
  });

  it('resets a day to that day number at the current pace', () => {
    assert.deepEqual(presetForDay(10, 'speedy', 1), {
      minutes: 3,
      seconds: 0,
      display: '03:00',
      day: 1,
    });
    assert.equal(presetForDay(10, 'normal', null).day, 1);
    assert.equal(presetForDay(10, 'normal', 99).day, 1);
  });
});

describe('preset labels', () => {
  it('labels an unused row as sequential days', () => {
    assert.deepEqual(getPresetDayLabel(1, { usedPresetByDay: {}, currentDay: 1 }), {
      label: 'Day 1',
      effectiveDay: 1,
    });
  });

  it('marks skipped presets and adds extra slots after a jump', () => {
    const usedPresetByDay = { 1: 8 };
    assert.deepEqual(
      getPresetDayLabel(2, { usedPresetByDay, currentDay: 1 }),
      { label: '💀', effectiveDay: null }
    );
    assert.deepEqual(
      getPresetDayLabel(8, { usedPresetByDay, currentDay: 1 }),
      { label: 'Day 1', effectiveDay: 1 }
    );

    const visible = listVisiblePresets({
      playerCount: 5,
      pace: 'normal',
      currentDay: 1,
      usedPresetByDay,
      isDusk: false,
    });
    assert.equal(visible.length, 11);
    assert.equal(visible.find((preset) => preset.day === 8).label, 'Day 1');
    assert.equal(
      visible.find((preset) => preset.day === 2).effectiveDay,
      null
    );
  });

  it('hides skulls at dusk and only the early skulls from day 2', () => {
    const usedPresetByDay = { 1: 3 };
    const dusk = listVisiblePresets({
      playerCount: 5,
      pace: 'normal',
      currentDay: 1,
      usedPresetByDay,
      isDusk: true,
    });
    assert.equal(
      dusk.some((preset) => preset.effectiveDay === null),
      false
    );

    const dayTwo = listVisiblePresets({
      playerCount: 5,
      pace: 'normal',
      currentDay: 2,
      usedPresetByDay,
      isDusk: false,
    });
    assert.equal(
      dayTwo.some((preset) => preset.day < 3 && preset.effectiveDay === null),
      false
    );
    assert.equal(dayTwo.some((preset) => preset.day === 1), false);
  });
});

describe('game state transitions', () => {
  it('starts from an empty day and phase', () => {
    const game = createGameState();
    assert.equal(game.getCurrentDay(), null);
    assert.equal(game.getPhase(), '');
    assert.equal(game.getPace(), DEFAULT_PACE);
    assert.deepEqual(game.getHiddenPresetDays(), []);
    game.ensureCurrentDay();
    assert.equal(game.getCurrentDay(), 1);
    game.ensureCurrentDay();
    assert.equal(game.getCurrentDay(), 1);
  });

  it('advances the day only from dusk', () => {
    const game = createGameState();
    game.setCurrentDay(1);
    assert.equal(game.advanceDayIfDusk(), false);
    assert.equal(game.getCurrentDay(), 1);

    game.setPhase('dawn');
    assert.equal(game.advanceDayIfDusk(), false);
    assert.equal(game.getPhase(), 'dawn');

    game.setPhase('dusk');
    assert.equal(game.advanceDayIfDusk(), true);
    assert.equal(game.getCurrentDay(), 2);
    assert.equal(game.getPhase(), 'dusk');

    game.setPhase('dawn');
    assert.equal(game.advanceDayIfDusk(), false);
    assert.equal(game.getCurrentDay(), 2);
  });

  it('does not advance a dusk wake-up when the day number is missing', () => {
    const game = createGameState();
    game.setPhase('dusk');
    assert.equal(game.getCurrentDay(), null);
    assert.equal(game.advanceDayIfDusk(), false);
    assert.equal(game.choosePreset(3), 'unchanged');
    assert.equal(game.getCurrentDay(), null);
  });

  it('rejects an unknown phase', () => {
    const game = createGameState();
    game.setCurrentDay(2);
    game.setPhase('night');
    assert.equal(game.getPhase(), '');
    assert.equal(game.getCurrentDay(), 2);
  });

  it('keeps dusk when the pace changes or other progress is replaced', () => {
    const game = createGameState();
    game.setCurrentDay(3);
    game.setPhase('dusk');
    game.setPace('speedy');
    assert.equal(game.getPace(), 'speedy');
    assert.equal(game.getPhase(), 'dusk');
    assert.equal(game.getCurrentDay(), 3);

    game.replaceProgress({
      currentDay: 3,
      usedPresetByDay: { 1: 1 },
      hiddenPresetDays: [4],
      pace: 'blitz',
    });
    assert.equal(game.getPhase(), 'dusk');
    assert.equal(game.getPace(), 'blitz');
    assert.deepEqual(game.getHiddenPresetDays(), [4]);
    assert.deepEqual(game.getUsedPresetByDay(), { 1: 1 });
  });

  it('uses an ahead preset for the current day, and any dusk preset for the next day', () => {
    const game = createGameState();
    game.setCurrentDay(1);
    game.setPhase('');
    assert.equal(game.choosePreset(4), 'current');
    assert.equal(game.getCurrentDay(), 1);
    assert.deepEqual(game.getUsedPresetByDay(), { 1: 4 });
    assert.equal(game.getPhase(), '');

    game.setPhase('dusk');
    assert.equal(game.choosePreset(6), 'next');
    assert.equal(game.getCurrentDay(), 2);
    assert.deepEqual(game.getUsedPresetByDay(), { 1: 4, 2: 6 });
    assert.equal(game.getPhase(), 'dusk');
  });

  it('leaves the day unchanged when the chosen preset is not ahead and it is not dusk', () => {
    const game = createGameState();
    game.setCurrentDay(2);
    game.replaceProgress({
      currentDay: 2,
      usedPresetByDay: { 1: 1, 2: 2 },
      hiddenPresetDays: [],
      pace: 'normal',
    });
    game.setPhase('dawn');
    assert.equal(game.choosePreset(2), 'unchanged');
    assert.equal(game.getCurrentDay(), 2);
    assert.deepEqual(game.getUsedPresetByDay(), { 1: 1, 2: 2 });
  });

  it('claims a preset for the current day only when one is missing', () => {
    const game = createGameState();
    game.setCurrentDay(2);
    game.replaceProgress({
      currentDay: 2,
      usedPresetByDay: { 1: 4 },
      hiddenPresetDays: [],
      pace: 'normal',
    });
    assert.deepEqual(game.claimPresetForCurrentDay(), {
      presetDay: 5,
      assigned: true,
    });
    assert.deepEqual(game.claimPresetForCurrentDay(), {
      presetDay: 5,
      assigned: false,
    });
    assert.equal(game.peekPresetDay(), 5);
  });

  it('clears the day, phase, and preset history for a new game without changing pace', () => {
    const game = createGameState();
    game.replaceProgress({
      currentDay: 4,
      usedPresetByDay: { 1: 2, 2: 5 },
      hiddenPresetDays: [3],
      pace: 'speedy',
    });
    game.setPhase('dusk');
    game.startNewGame();

    assert.equal(game.getCurrentDay(), 1);
    assert.equal(game.getPhase(), '');
    assert.equal(game.isDusk(), false);
    assert.deepEqual(game.getUsedPresetByDay(), {});
    assert.deepEqual(game.getHiddenPresetDays(), []);
    assert.equal(game.getPace(), 'speedy');
  });

  it('does not treat dusk as a day change by itself', () => {
    const game = createGameState();
    game.setCurrentDay(2);
    game.setPhase('dusk');
    assert.equal(game.isDusk(), true);
    assert.equal(game.getCurrentDay(), 2);
  });
});

describe('nominations countdown', () => {
  it('uses a positive delay and skips the countdown when it is off or empty', () => {
    assert.equal(nominationsDelaySeconds(true, 30), 30);
    assert.equal(nominationsDelaySeconds(true, 60), 60);
    assert.equal(nominationsDelaySeconds(true, 90), 90);
    assert.equal(nominationsDelaySeconds(false, 60), 0);
    assert.equal(nominationsDelaySeconds(true, 0), 0);
    assert.equal(nominationsDelaySeconds(true, -5), 0);
  });

  it('opens nominations on the tick that reaches zero and not before', () => {
    assert.deepEqual(stepNominationsCountdown(2), { remaining: 1, open: false });
    assert.deepEqual(stepNominationsCountdown(1), { remaining: 0, open: true });
  });
});
