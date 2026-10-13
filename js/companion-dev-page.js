import { createCompanionClient } from './companionClient.js';

const client = createCompanionClient();
const codeInput = document.querySelector('#code');
const params = new URLSearchParams(location.search);
if (params.get('code')) codeInput.value = params.get('code');

function pad(value) {
  return String(value).padStart(2, '0');
}

function render(view) {
  const seconds = view.displaySeconds;
  document.querySelector('#timer').textContent = seconds == null
    ? '—'
    : `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
  document.querySelector('#connection').textContent = view.connection;
  document.querySelector('#freshness').textContent = view.fresh
    ? 'fresh'
    : view.stale
      ? 'stale'
      : 'waiting';
  document.querySelector('#phase').textContent = view.phase ?? '—';
  document.querySelector('#day').textContent = view.day ?? '—';
  document.querySelector('#townsfolk').textContent = view.counts?.townsfolk ?? '—';
  document.querySelector('#outsider').textContent = view.counts?.outsider ?? '—';
  document.querySelector('#minion').textContent = view.counts?.minion ?? '—';
  document.querySelector('#demon').textContent = view.counts?.demon ?? '—';
  document.querySelector('#traveller').textContent = view.counts?.traveller ?? '—';
  document.querySelector('#rev').textContent = view.rev ?? '—';
  document.querySelector('#timing').textContent = view.timing;
}

document.querySelector('#joinForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = codeInput.value.trim().toUpperCase();
  if (code) client.join(code);
});
document.querySelector('#drop').addEventListener('click', () => client.drop());
document.querySelector('#leave').addEventListener('click', () => client.leave());

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') client.resume();
});

if (codeInput.value) client.join(codeInput.value.trim().toUpperCase());
setInterval(() => render(client.view()), 200);
render(client.view());
