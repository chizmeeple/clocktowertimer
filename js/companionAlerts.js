// Foreground warnings only. A crossing that happens while the snapshot
// is stale is not announced later. The first sample of a countdown is
// not an alert, so joining near zero does not sound.

export const COMPANION_WARNING_SECONDS = 30;

export function nextCompanionAlert(state, view, countdownShown) {
  const seconds = countdownShown ? view.displaySeconds : null;
  const armed = Boolean(
    view.fresh &&
    view.timerStatus === 'running' &&
    countdownShown &&
    seconds != null,
  );
  if (!armed) {
    return { ...state, previous: seconds, alert: null };
  }
  const changed = state.rev !== view.rev || state.phase !== view.phase;
  if (changed || state.previous == null) {
    return { previous: seconds, rev: view.rev, phase: view.phase, alert: null };
  }
  let alert = null;
  if (
    state.previous > COMPANION_WARNING_SECONDS &&
    seconds <= COMPANION_WARNING_SECONDS &&
    seconds > 0
  ) {
    alert = 'warning';
  }
  if (view.phase === 'day' && state.previous > 0 && seconds === 0) {
    alert = 'zero';
  }
  return { previous: seconds, rev: view.rev, phase: view.phase, alert };
}
