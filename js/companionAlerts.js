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
    return { ...state, previous: null, alert: null };
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
