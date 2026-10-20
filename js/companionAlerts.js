// Foreground warnings only. A crossing that happens while the snapshot
// is stale, the page is hidden, or the revision changed is not announced
// later. The first sample of a countdown is not an alert, so joining near
// zero does not sound. An accelerated countdown skips the 30-second cue:
// that threshold is no longer a real-time warning, and the zero cue remains.

export const COMPANION_WARNING_SECONDS = 30;

export function nextCompanionAlert(state, view, countdownShown, visible = true) {
  if (!visible) {
    return {
      previous: null,
      rev: view?.rev ?? state.rev,
      phase: view?.phase ?? state.phase,
      alert: null,
    };
  }
  const seconds = countdownShown ? view.displaySeconds : null;
  const armed = Boolean(
    view.fresh &&
    view.timerStatus === 'running' &&
    countdownShown &&
    seconds != null,
  );
  if (!armed) {
    // The storyteller publishes night when the day finishes. If that
    // arrives before the local countdown shows zero, this is the end cue.
    const dayEnded =
      view.fresh &&
      state.previous > 0 &&
      state.phase === 'day' &&
      (view.phase === 'night' || view.confirmedComplete === true);
    return {
      previous: null,
      rev: view?.rev ?? state.rev,
      phase: view?.phase ?? state.phase,
      alert: dayEnded ? 'zero' : null,
    };
  }
  const changed = state.rev !== view.rev || state.phase !== view.phase;
  if (changed || state.previous == null) {
    return { previous: seconds, rev: view.rev, phase: view.phase, alert: null };
  }
  let alert = null;
  if (
    state.previous > COMPANION_WARNING_SECONDS &&
    seconds <= COMPANION_WARNING_SECONDS &&
    seconds > 0 &&
    !(view.rate > 1)
  ) {
    alert = 'warning';
  }
  if (view.phase === 'day' && state.previous > 0 && seconds === 0) {
    alert = 'zero';
  }
  return { previous: seconds, rev: view.rev, phase: view.phase, alert };
}

// One day-start cue. Wake Up publishes a wake countdown. A preset publishes
// the running day directly. The cue is the first of those, not the later
// change from wake into the day, and not a new duration for a day that is
// already running.
export function nextDayStart(previous, view, visible = true) {
  const remembered = view?.fresh
    ? { phase: view.phase, day: view.day }
    : null;
  const started =
    visible &&
    view?.fresh === true &&
    previous != null &&
    ((view.phase === 'wake' && previous.phase !== 'wake') ||
      (view.phase === 'day' &&
        view.timerStatus === 'running' &&
        previous.phase !== 'day' &&
        previous.phase !== 'wake'));
  return { previous: remembered, started };
}
