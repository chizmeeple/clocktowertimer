// Day, phase, pace, and preset rules. Phase is stored here; the page renders it.

export const PACE_MULTIPLIERS = {
  relaxed: 1,
  normal: 0.8,
  speedy: 0.5,
  blitz: 0.33,
};

export const DEFAULT_PACE = 'normal';
export const WAKE_UP_COUNTDOWN_SECONDS = 6;
export const MIN_NOMINATION_SECONDS = 3 * 60;
export const NIGHT_PHASE_SECONDS = 4 * 60;

const PHASES = new Set(['dawn', 'dusk']);

export function roundToNearestQuarter(n) {
  return Math.round(n * 4) / 4;
}

export function calcTimerStartEndValues(startingPlayerCount) {
  return {
    totalNumbers: startingPlayerCount - startingPlayerCount / 5,
    dayStartValue: startingPlayerCount * 0.4 + 2,
    dayEndValue: 2,
    nightStartValue: startingPlayerCount * 0.1 + 1,
    nightEndValue: 1,
  };
}

export function generateDayPresets(playerCount, pace) {
  const { totalNumbers, dayStartValue, dayEndValue } =
    calcTimerStartEndValues(playerCount);
  const numberOfDays = Math.floor(totalNumbers);
  const presets = [];
  const paceMultiplier = PACE_MULTIPLIERS[pace];

  for (let day = 1; day <= numberOfDays; day++) {
    const progress = (day - 1) / (numberOfDays - 1);
    let minutes = roundToNearestQuarter(
      (dayStartValue - progress * (dayStartValue - dayEndValue)) *
        paceMultiplier
    );

    if (pace === 'blitz' && (day === 1 || day === 2) && minutes < 2) {
      minutes = 2;
    }

    const wholeMinutes = Math.floor(minutes);
    const seconds = Math.round((minutes % 1) * 60);
    presets.push({
      minutes: wholeMinutes,
      seconds: seconds,
      display: `${String(wholeMinutes).padStart(2, '0')}:${String(
        seconds
      ).padStart(2, '0')}`,
      day: day,
    });
  }

  return presets;
}

// A night before each day, that day's timer, and nominations.
// Each night is 4 minutes. Nominations last as long as that day, and never
// less than 3 minutes. The total is rounded up to the next minute.
export function estimateGameLengthMinutes(playerCount, pace) {
  const presets = generateDayPresets(playerCount, pace);
  let totalSeconds = 0;

  presets.forEach((preset) => {
    const daySeconds = preset.minutes * 60 + preset.seconds;
    const nominationSeconds = Math.max(daySeconds, MIN_NOMINATION_SECONDS);
    totalSeconds += NIGHT_PHASE_SECONDS + daySeconds + nominationSeconds;
  });

  return Math.ceil(totalSeconds / 60);
}

export function presetForDay(playerCount, pace, day) {
  const presets = generateDayPresets(playerCount, pace);
  const safeDay = day ?? 1;
  return presets.find((preset) => preset.day === safeDay) ?? presets[0];
}

// effectiveDay is null for a skipped preset (shown as 💀).
export function getPresetDayLabel(presetDay, { usedPresetByDay, currentDay }) {
  const used = Object.values(usedPresetByDay).filter((p) => p >= 1);
  if (used.length === 0) {
    return { label: `Day ${presetDay}`, effectiveDay: presetDay };
  }
  const usedSorted = [...used].sort((a, b) => a - b);
  const minUsed = usedSorted[0];
  const maxUsed = usedSorted.at(-1);
  for (const [d, p] of Object.entries(usedPresetByDay)) {
    if (Number(p) === presetDay) {
      return { label: `Day ${d}`, effectiveDay: Number(d) };
    }
  }
  if (presetDay < minUsed) return { label: '💀', effectiveDay: null };
  for (let i = 0; i < usedSorted.length - 1; i++) {
    if (presetDay > usedSorted[i] && presetDay < usedSorted[i + 1]) {
      return { label: '💀', effectiveDay: null };
    }
  }
  const anchor =
    usedPresetByDay[currentDay] === undefined
      ? maxUsed + 1
      : usedPresetByDay[currentDay];
  const baseDay =
    usedPresetByDay[currentDay] === undefined ? currentDay + 1 : currentDay;
  if (presetDay >= anchor) {
    const eff = baseDay + (presetDay - anchor);
    return { label: `Day ${eff}`, effectiveDay: eff };
  }
  return { label: '💀', effectiveDay: null };
}

export function peekPresetDay({ currentDay, usedPresetByDay }) {
  let currentPresetDay = usedPresetByDay[currentDay];
  if (currentPresetDay === undefined) {
    const used = Object.values(usedPresetByDay);
    currentPresetDay = used.length > 0 ? Math.max(...used) + 1 : currentDay;
  }
  return currentPresetDay;
}

// Base day presets, plus extra slots when days were skipped, filtered the same
// way the preset row is shown. Skull presets stay visible except at dusk and,
// from day 2, before the previous day's preset.
export function listVisiblePresets({
  playerCount,
  pace,
  currentDay,
  usedPresetByDay,
  isDusk,
}) {
  const presets = generateDayPresets(playerCount, pace);
  const numberOfDays = presets.length;
  const labelState = { usedPresetByDay, currentDay };

  let skippedCount = 0;
  for (const preset of presets) {
    if (getPresetDayLabel(preset.day, labelState).effectiveDay === null) {
      skippedCount++;
    }
  }
  const maxUsed =
    currentDay !== null && Object.keys(usedPresetByDay).length > 0
      ? Math.max(...Object.values(usedPresetByDay))
      : 0;
  const curDay = currentDay ?? 1;
  const extrasNeeded = Math.max(skippedCount, Math.max(0, maxUsed - curDay));
  const lastBasePreset = presets[numberOfDays - 1];
  for (let i = 1; i <= extrasNeeded; i++) {
    presets.push({
      minutes: lastBasePreset.minutes,
      seconds: lastBasePreset.seconds,
      display: lastBasePreset.display,
      day: numberOfDays + i,
    });
  }

  let presetsToShow = presets;
  if (isDusk) {
    presetsToShow = presetsToShow.filter(
      (preset) => getPresetDayLabel(preset.day, labelState).effectiveDay !== null
    );
  } else if (currentDay >= 2) {
    const skipCutoff = usedPresetByDay[currentDay - 1];
    if (skipCutoff !== undefined) {
      presetsToShow = presets.filter((preset) => {
        const { effectiveDay } = getPresetDayLabel(preset.day, labelState);
        if (effectiveDay !== null) return true;
        return preset.day >= skipCutoff;
      });
    }
  }

  return presetsToShow.map((preset) => {
    const { label, effectiveDay } = getPresetDayLabel(preset.day, labelState);
    return { ...preset, label, effectiveDay };
  });
}

// Seconds until nominations open, or 0 when the countdown should not start.
export function nominationsDelaySeconds(enabled, delaySeconds) {
  if (!enabled || !(delaySeconds > 0)) return 0;
  return delaySeconds;
}

// One nominations tick. Opening happens when the count reaches zero.
export function stepNominationsCountdown(remainingSeconds) {
  const remaining = remainingSeconds - 1;
  return { remaining, open: remaining <= 0 };
}

function blankProgress() {
  return {
    currentDay: null,
    phase: '',
    pace: DEFAULT_PACE,
    usedPresetByDay: {},
    hiddenPresetDays: [],
    // True only after Start New Game, until the first daytime countdown.
    // A fresh page has the same empty phase, so this is what makes Night 1
    // look different from the pre-game screen. It is not a gameplay phase.
    awaitingFirstDay: false,
  };
}

// Night styling for the inactive countdown. Dusk and wake-up share it.
// A running or paused day countdown stays in the daytime appearance.
// Reset Day (time remaining, but marked reset) uses the daytime appearance.
export function isNightAppearance({
  phase = '',
  countdownKind = null,
  isRunning = false,
  timeLeft = 0,
  hasReset = false,
  awaitingFirstDay = false,
} = {}) {
  if (phase === 'dawn' || phase === 'dusk' || countdownKind === 'wake-up') {
    return true;
  }
  if (isRunning) return false;
  if (timeLeft > 0 && !hasReset) return false;
  return Boolean(awaitingFirstDay);
}

export function createGameState() {
  let progress = blankProgress();

  function snapshot() {
    return {
      currentDay: progress.currentDay,
      phase: progress.phase,
      pace: progress.pace,
      usedPresetByDay: { ...progress.usedPresetByDay },
      hiddenPresetDays: [...progress.hiddenPresetDays],
      awaitingFirstDay: progress.awaitingFirstDay,
    };
  }

  return {
    snapshot,
    getCurrentDay: () => progress.currentDay,
    getPhase: () => progress.phase,
    isDusk: () => progress.phase === 'dusk',
    getPace: () => progress.pace,
    getUsedPresetByDay: () => ({ ...progress.usedPresetByDay }),
    getHiddenPresetDays: () => [...progress.hiddenPresetDays],
    isAwaitingFirstDay: () => progress.awaitingFirstDay,

    clearAwaitingFirstDay() {
      progress.awaitingFirstDay = false;
    },

    setCurrentDay(day) {
      progress.currentDay = day;
    },

    setPhase(state) {
      progress.phase = PHASES.has(state) ? state : '';
    },

    ensureCurrentDay() {
      if (progress.currentDay === null || progress.currentDay === undefined) {
        progress.currentDay = 1;
      }
    },

    setPace(pace) {
      progress.pace = pace;
    },

    replaceProgress({ currentDay, usedPresetByDay, hiddenPresetDays, pace }) {
      progress.currentDay = currentDay;
      progress.usedPresetByDay = { ...usedPresetByDay };
      progress.hiddenPresetDays = [...hiddenPresetDays];
      progress.pace = pace;
    },

    // Wake-up advances the day only while the phase is dusk.
    // The phase itself stays put; the caller shows dawn afterwards.
    advanceDayIfDusk() {
      if (progress.currentDay !== null && progress.phase === 'dusk') {
        progress.currentDay += 1;
        return true;
      }
      return false;
    },

    // 'current' uses the preset for this day. 'next' stores it for the
    // following day and advances. Anything else leaves the day alone.
    // Dusk is cleared by the caller after this returns, as before.
    choosePreset(presetDay) {
      const { effectiveDay } = getPresetDayLabel(presetDay, {
        usedPresetByDay: progress.usedPresetByDay,
        currentDay: progress.currentDay,
      });
      const isAhead =
        effectiveDay !== null && effectiveDay > progress.currentDay;
      if (isAhead && progress.phase !== 'dusk') {
        progress.usedPresetByDay[progress.currentDay] = presetDay;
        return 'current';
      }
      if (progress.phase === 'dusk' && progress.currentDay !== null) {
        progress.usedPresetByDay[progress.currentDay + 1] = presetDay;
        progress.currentDay += 1;
        return 'next';
      }
      return 'unchanged';
    },

    claimPresetForCurrentDay() {
      if (progress.usedPresetByDay[progress.currentDay] !== undefined) {
        return {
          presetDay: progress.usedPresetByDay[progress.currentDay],
          assigned: false,
        };
      }
      const used = Object.values(progress.usedPresetByDay);
      const presetDay =
        used.length > 0 ? Math.max(...used) + 1 : progress.currentDay;
      progress.usedPresetByDay[progress.currentDay] = presetDay;
      return { presetDay, assigned: true };
    },

    peekPresetDay() {
      return peekPresetDay(snapshot());
    },

    startNewGame() {
      const pace = progress.pace;
      progress = blankProgress();
      progress.currentDay = 1;
      progress.pace = pace;
      progress.awaitingFirstDay = true;
    },
  };
}
