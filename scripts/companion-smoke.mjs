// One disposable session against a worker you have already deployed.
// The write token stays in this process. It is not printed.

const worker = process.env.COMPANION_WORKER_URL;
const origin = process.env.COMPANION_ORIGIN || 'http://127.0.0.1:8006';

if (!worker) {
  console.error(
    'Set COMPANION_WORKER_URL to the worker origin, such as https://clocktower-companion.<account>.workers.dev'
  );
  process.exit(1);
}

const root = worker.endsWith('/') ? worker.slice(0, -1) : worker;
const socketRoot = root.replace(/^http/, 'ws');

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function createSession() {
  const response = await fetch(`${root}/sessions`, {
    method: 'POST',
    headers: { Origin: origin },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail(`Create failed (${response.status} ${body.error || 'unknown'})`);
  if (typeof body.code !== 'string' || typeof body.writeToken !== 'string') {
    fail('Create response did not include a session');
  }
  return { code: body.code, token: body.writeToken };
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Origin: origin } });
    const messages = [];
    const waiting = [];
    socket.addEventListener('message', (event) => {
      const value = JSON.parse(event.data);
      const resolveNext = waiting.shift();
      if (resolveNext) resolveNext(value);
      else messages.push(value);
    });
    socket.addEventListener('open', () => resolve({
      socket,
      next() {
        if (messages.length > 0) return Promise.resolve(messages.shift());
        return new Promise((resolveNext, rejectNext) => {
          const timer = setTimeout(() => rejectNext(new Error('timed out')), 5000);
          waiting.push((value) => {
            clearTimeout(timer);
            resolveNext(value);
          });
        });
      },
    }));
    socket.addEventListener('error', () => reject(new Error(`socket failed for ${url}`)));
  });
}

const day = {
  v: 1,
  phase: 'day',
  day: 1,
  counts: { townsfolk: 7, outsider: 0, minion: 2, demon: 1, traveller: 0 },
  timer: { status: 'running', kind: 'day', remainingMs: 120000, rate: 1 },
};

const session = await createSession();
console.log(`Session ${session.code}`);

const storyteller = await connect(`${socketRoot}/sessions/${session.code}/storyteller`);
storyteller.socket.send(JSON.stringify({ type: 'auth', token: session.token }));
const authenticated = await storyteller.next();
if (authenticated.type !== 'authenticated') fail('Storyteller was not authenticated');

storyteller.socket.send(JSON.stringify({
  type: 'publish',
  state: day,
  capturedAt: Date.now(),
  upstreamOffsetMs: 0,
}));
let ack = null;
for (let attempt = 0; attempt < 4 && !ack; attempt += 1) {
  const message = await storyteller.next();
  if (message.type === 'published') ack = message;
}
if (!ack) fail('Publish was not acknowledged');

const reader = await connect(`${socketRoot}/sessions/${session.code}`);
const snapshot = await reader.next();
if (snapshot.type !== 'snapshot' || snapshot.rev !== ack.rev) {
  fail('Reader did not receive the snapshot');
}
if (snapshot.state?.counts?.traveller !== 0) fail('Reader snapshot was not the public state');
console.log(`Published revision ${ack.rev}`);

storyteller.socket.send(JSON.stringify({ type: 'end' }));
const ended = await reader.next();
if (ended.type !== 'session-ended') fail('Reader was not told the session ended');
console.log('Session ended');

storyteller.socket.close();
reader.socket.close();
