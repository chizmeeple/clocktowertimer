import { nextCompanionAlert } from './companionAlerts.js';
import {
  companionBaseUrl,
  companionQrImageUrl,
  isSessionCode,
  normaliseSessionCode,
  presentCompanionPlayerShare,
  sessionCodeFromLocation,
} from './companionCode.js';
import { createCompanionClient } from './companionClient.js';
import { presentCompanion } from './companionDisplay.js';
import { createWakeLockController } from './companionWake.js';

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
const wakeNote = document.querySelector('#wakeNote');
const showQrButton = document.querySelector('#showQr');
const qrDialog = document.querySelector('#qrDialog');
const qrImage = document.querySelector('#qrImage');
const qrCodeText = document.querySelector('#qrCode');
const qrClose = document.querySelector('#qrClose');
const countNodes = {
  townsfolk: document.querySelector('#townsfolk'),
  outsider: document.querySelector('#outsider'),
  minion: document.querySelector('#minion'),
  demon: document.querySelector('#demon'),
  traveller: document.querySelector('#traveller'),
};

const canSound = Boolean(window.AudioContext || window.webkitAudioContext);
const canVibrate = typeof navigator.vibrate === 'function';
if (!canSound && !canVibrate) alertOption.hidden = true;

const client = createCompanionClient({ baseUrl: companionBaseUrl(location) });
let alertState = { previous: null, rev: null, phase: null, alert: null };
let audio = null;
let rendered = '';
let currentView = null;
let testView = null;

const wake = createWakeLockController({
  supported: typeof navigator.wakeLock?.request === 'function',
  request: (type) => navigator.wakeLock.request(type),
  visibility: () => document.visibilityState,
  onActive() {
    wakeNote.hidden = true;
    text(wakeNote, '');
  },
  onRefused() {
    wakeNote.hidden = false;
    text(wakeNote, 'The browser did not keep the screen on.');
  },
});

if (!wake.supported) {
  wakeInput.disabled = true;
  wakeInput.checked = false;
  wakeNote.hidden = false;
  text(wakeNote, 'This browser cannot keep the screen on.');
}

function text(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function paint(view) {
  currentView = view;
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
  syncShare(view);
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

function focusAfterQr() {
  if (showQrButton.isConnected && !showQrButton.hidden) {
    showQrButton.focus();
    return;
  }
  if (!session.hidden && !leaveButton.hidden) {
    leaveButton.focus();
    return;
  }
  codeInput.focus();
}

function syncShare(view) {
  const share = presentCompanionPlayerShare(view);
  showQrButton.hidden = !share.canShare;
  if (!share.canShare) {
    if (qrDialog.open) qrDialog.close();
    qrImage.removeAttribute('src');
    text(qrCodeText, '');
    return;
  }
  if (!qrDialog.open) return;
  const src = companionQrImageUrl(share.playerUrl);
  if (qrImage.getAttribute('src') !== src) qrImage.src = src;
  qrImage.alt = `QR code for companion session ${share.code}`;
  text(qrCodeText, share.code);
}

function openQr() {
  const share = presentCompanionPlayerShare(currentView);
  if (!share.canShare || qrDialog.open) return;
  qrImage.src = companionQrImageUrl(share.playerUrl);
  qrImage.alt = `QR code for companion session ${share.code}`;
  text(qrCodeText, share.code);
  qrDialog.showModal();
  qrClose.focus();
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
  testView = null;
  client.leave();
  rememberCode('');
  showCodeError('');
  paint(client.view());
});

showQrButton.addEventListener('click', () => {
  openQr();
});

qrClose.addEventListener('click', () => {
  qrDialog.close();
});

qrDialog.addEventListener('close', () => {
  qrImage.removeAttribute('src');
  focusAfterQr();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !qrDialog.open) return;
  event.preventDefault();
  qrDialog.close();
});

alertsInput.addEventListener('change', () => {
  if (!alertsInput.checked || !canSound) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  audio = audio || new Context();
  audio.resume();
});

wakeInput.addEventListener('change', () => {
  if (!wakeInput.checked && wake.supported) {
    wakeNote.hidden = true;
    text(wakeNote, '');
  }
  if (!wake.supported) return;
  wake.setEnabled(wakeInput.checked);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') client.resume();
  wake.onVisibilityChange();
});

const initial = sessionCodeFromLocation(location);
if (initial) {
  codeInput.value = initial;
  if (isSessionCode(initial)) join(initial);
  else showCodeError('That code is not valid. Ask the Storyteller for the six-character code.');
}

setInterval(() => paint(testView || client.view()), 200);
paint(client.view());

window.__companionTest = {
  show(view) {
    testView = view;
    paint(view);
  },
};
