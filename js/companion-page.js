import { nextCompanionAlert } from './companionAlerts.js';
import { companionBaseUrl, isSessionCode, normaliseSessionCode, sessionCodeFromLocation } from './companionCode.js';
import { createCompanionClient } from './companionClient.js';
import { presentCompanion } from './companionDisplay.js';

const joinPanel = document.querySelector('#joinPanel');
const joinForm = document.querySelector('#joinForm');
const codeInput = document.querySelector('#code');
const codeError = document.querySelector('#codeError');
const session = document.querySelector('#session');
const statusNode = document.querySelector('#status');
const statusDetail = document.querySelector('#statusDetail');
const kicker = document.querySelector('#kicker');
const headline = document.querySelector('#headline');
const message = document.querySelector('#message');
const leaveButton = document.querySelector('#leave');
const alertsInput = document.querySelector('#alerts');
const alertOption = document.querySelector('#alertOption');
const wakeInput = document.querySelector('#wake');
const wakeOption = document.querySelector('#wakeOption');
const wakeNote = document.querySelector('#wakeNote');
const countNodes = {
  townsfolk: document.querySelector('#townsfolk'),
  outsider: document.querySelector('#outsider'),
  minion: document.querySelector('#minion'),
  demon: document.querySelector('#demon'),
  traveller: document.querySelector('#traveller'),
};

const canSound = Boolean(window.AudioContext || window.webkitAudioContext);
const canVibrate = typeof navigator.vibrate === 'function';
const canWake = typeof navigator.wakeLock?.request === 'function';
if (!canSound && !canVibrate) alertOption.hidden = true;
if (!canWake) wakeOption.hidden = true;

const client = createCompanionClient({ baseUrl: companionBaseUrl(location) });
let alertState = { previous: null, rev: null, phase: null, alert: null };
let audio = null;
let wakeLock = null;
let rendered = '';

function text(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function paint(view) {
  const presentation = presentCompanion(view);
  document.body.classList.toggle('game--night', presentation.night);
  document.body.classList.toggle('wallpaper-ready', presentation.night);
  joinPanel.hidden = presentation.showSession;
  session.hidden = !presentation.showSession;
  const status = presentation.status;
  statusNode.hidden = !status.label;
  statusNode.className = `status ${status.tone}`;
  text(statusNode, status.label);
  text(statusDetail, status.detail || '');
  statusDetail.hidden = !status.detail;
  if (status.detail) statusNode.setAttribute('aria-label', `${status.label}. ${status.detail}`);
  else statusNode.removeAttribute('aria-label');
  text(kicker, presentation.kicker);
  text(headline, presentation.headline || '');
  headline.classList.toggle('words', presentation.countdown == null);
  text(message, presentation.message || '');
  const counts = presentation.counts;
  for (const key of Object.keys(countNodes)) {
    text(countNodes[key], counts ? String(counts[key]) : '–');
  }
  const signature = JSON.stringify(presentation);
  if (signature !== rendered) rendered = signature;

  if (alertsInput.checked) {
    const countdownShown = presentation.countdown != null;
    alertState = nextCompanionAlert(alertState, view, countdownShown);
    if (alertState.alert) playAlert(alertState.alert);
  } else {
    alertState = { previous: view.displaySeconds, rev: view.rev, phase: view.phase, alert: null };
  }
}

function playAlert(kind) {
  if (canVibrate) navigator.vibrate(kind === 'zero' ? [90, 40, 90] : 50);
  if (!canSound || !audio) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.frequency.value = kind === 'zero' ? 392 : 587;
  gain.gain.value = 0.04;
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.16);
}

function showCodeError(textValue) {
  codeError.hidden = !textValue;
  text(codeError, textValue || '');
}

function rememberCode(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('code', code);
  else url.searchParams.delete('code');
  history.replaceState(null, '', url);
}

function join(raw) {
  const code = normaliseSessionCode(raw);
  codeInput.value = code;
  if (!isSessionCode(code)) {
    showCodeError('Enter the six-character code from the Storyteller.');
    return;
  }
  showCodeError('');
  alertState = { previous: null, rev: null, phase: null, alert: null };
  rememberCode(code);
  client.join(code);
}

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  join(codeInput.value);
});

leaveButton.addEventListener('click', () => {
  client.leave();
  rememberCode('');
  showCodeError('');
  paint(client.view());
});

alertsInput.addEventListener('change', () => {
  if (!alertsInput.checked || !canSound) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  audio = audio || new Context();
  audio.resume();
});

async function syncWakeLock() {
  if (!canWake) return;
  if (!wakeInput.checked || document.visibilityState !== 'visible') {
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch {
        // The browser may already have released it.
      }
      wakeLock = null;
    }
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeNote.hidden = true;
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {
    wakeInput.checked = false;
    wakeNote.hidden = false;
    text(wakeNote, 'The browser did not keep the screen awake. You can still lock your phone.');
  }
}

wakeInput.addEventListener('change', () => {
  syncWakeLock();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') client.resume();
  syncWakeLock();
});

const initial = sessionCodeFromLocation(location);
if (initial) {
  codeInput.value = initial;
  if (isSessionCode(initial)) join(initial);
  else showCodeError('That code is not valid. Ask the Storyteller for the six-character code.');
}

let testView = null;
setInterval(() => paint(testView || client.view()), 200);
paint(client.view());

window.__companionTest = {
  show(view) {
    testView = view;
    paint(view);
  },
};
