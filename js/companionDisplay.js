// Turns one companion view into the words and numbers on the player page.
// It does not read the clock or open a socket.

export function formatCountdown(seconds) {
  if (!Number.isInteger(seconds) || seconds < 0) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function countsOf(view) {
  const counts = view?.counts;
  if (!counts) return null;
  return {
    townsfolk: counts.townsfolk,
    outsider: counts.outsider,
    minion: counts.minion,
    demon: counts.demon,
    traveller: counts.traveller,
  };
}

function showsCountdown(view) {
  if (view.problem || view.displaySeconds == null) return false;
  if (view.phase === 'day' && ['running', 'paused', 'ready'].includes(view.timerStatus)) {
    return true;
  }
  return view.phase === 'wake' && view.timerStatus === 'running';
}

function phaseCopy(view, countdown) {
  const day = view.day == null ? '' : `Day ${view.day}`;
  if (view.problem === 'unsupported-version') {
    return {
      kicker: 'Companion',
      headline: 'Update needed',
      message: 'This session is from a newer Tower Timer than this page understands.',
      countdown: null,
    };
  }
  if (view.phase === 'pregame') {
    return {
      kicker: day || 'Pregame',
      headline: 'Getting ready',
      message: 'Waiting for the game to begin.',
      countdown: null,
    };
  }
  if (view.phase === 'wake') {
    return {
      kicker: 'Wake up',
      headline: countdown || 'Wake up',
      message: countdown ? 'The town is waking.' : 'Waiting for the Storyteller.',
      countdown,
    };
  }
  if (view.phase === 'night' || view.confirmedComplete) {
    return {
      kicker: day || 'Night',
      headline: 'Eyes closed',
      message: 'Waiting for the Storyteller.',
      countdown: null,
    };
  }
  if (view.phase === 'day') {
    if (view.locallyComplete && view.timerStatus === 'running') {
      return {
        kicker: day || 'Day',
        headline: countdown,
        message: 'Waiting for the Storyteller. Reaching zero here does not end the day.',
        countdown,
      };
    }
    if (view.timerStatus === 'paused') {
      return {
        kicker: day || 'Day',
        headline: countdown,
        message: 'Time is paused.',
        countdown,
      };
    }
    if (view.timerStatus === 'ready') {
      return {
        kicker: day || 'Day',
        headline: countdown,
        message: 'Ready when the Storyteller starts the day.',
        countdown,
      };
    }
    return {
      kicker: day || 'Day',
      headline: countdown,
      message: view.rate > 1 ? 'The countdown is sped up.' : '',
      countdown,
    };
  }
  return {
    kicker: 'Companion',
    headline: 'Waiting',
    message: 'Waiting for the Storyteller.',
    countdown: null,
  };
}

function statusCopy(view) {
  if (view.problem === 'unsupported-version') {
    return { tone: 'problem', label: 'Update', detail: 'This page needs a newer version.', quiet: false };
  }
  if (view.connection === 'ended') {
    return { tone: 'problem', label: 'Ended', detail: 'The Storyteller ended this session.', quiet: false };
  }
  if (view.connection === 'expired') {
    return { tone: 'problem', label: 'Expired', detail: 'This session has expired.', quiet: false };
  }
  if (view.connection === 'connecting') {
    return { tone: 'pending', label: 'Joining', detail: '', quiet: false };
  }
  if (view.connection === 'reconnecting') {
    const detail = view.counts
      ? 'Showing the last update, which may be out of date.'
      : 'Can’t reach the session. Check the code and your connection.';
    return { tone: 'problem', label: 'Offline', detail, quiet: false };
  }
  if (view.connection === 'live' && view.stale) {
    return {
      tone: 'problem',
      label: 'Out of date',
      detail: 'Updates have stopped. This display may be out of date.',
      quiet: false,
    };
  }
  if (view.connection === 'live' && view.fresh) {
    return { tone: 'live', label: 'Live', detail: '', quiet: true };
  }
  if (view.connection === 'live') {
    return { tone: 'pending', label: 'Waiting', detail: 'Connected. Waiting for the first update.', quiet: false };
  }
  return { tone: 'idle', label: '', detail: '', quiet: true };
}

export function presentCompanion(view) {
  const countdown = showsCountdown(view) ? formatCountdown(view.displaySeconds) : null;
  const copy = phaseCopy(view, countdown);
  const night = view.phase === 'night' || view.confirmedComplete === true;
  return {
    night: night && view.problem == null,
    kicker: copy.kicker,
    headline: copy.headline,
    message: copy.message,
    countdown,
    counts: countsOf(view),
    status: statusCopy(view),
    showSession: view.connection !== 'idle',
  };
}
