import { setCodeSequence, takeCode } from './codes.js';
import { directoryStub, SessionDirectory } from './directory.js';
import { CompanionSession } from './session.js';
import {
  CODE_ATTEMPTS,
  CODE_PATTERN,
  randomToken,
  sha256Hex,
} from './protocol.js';

export { CompanionSession, SessionDirectory, setCodeSequence };

function json(body, status, extraHeaders) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store', ...extraHeaders },
  });
}

function hasTokenInUrl(url) {
  return url.searchParams.has('token') || url.searchParams.has('writeToken');
}

async function createSession(env) {
  const directory = directoryStub(env);
  const now = Date.now();
  if (!(await directory.creationAllowed(now))) {
    return json({ error: 'create-limit' }, 429);
  }

  const sessionId = crypto.randomUUID();
  const writeToken = randomToken();
  const tokenHash = await sha256Hex(writeToken);
  let code = null;
  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const candidate = takeCode();
    const reserved = await directory.reserve(candidate, sessionId, now);
    if (reserved.ok) {
      code = candidate;
      break;
    }
  }
  if (!code) return json({ error: 'code-unavailable' }, 503);

  const stub = env.COMPANION_SESSION.get(
    env.COMPANION_SESSION.idFromName(sessionId)
  );
  try {
    await stub.open({ sessionId, code, tokenHash, createdAt: now });
  } catch {
    await directory.retire(code, sessionId);
    return json({ error: 'session-unavailable' }, 500);
  }
  return json({ code, writeToken }, 201);
}

async function joinSession(request, env, code) {
  const found = await directoryStub(env).lookup(code);
  if (!found.sessionId) return json({ error: 'unknown-code' }, 404);
  const stub = env.COMPANION_SESSION.get(
    env.COMPANION_SESSION.idFromName(found.sessionId)
  );
  return stub.fetch(request);
}

async function route(request, env) {
  const url = new URL(request.url);
  if (hasTokenInUrl(url)) return json({ error: 'token-in-url' }, 400);

  if (url.pathname === '/health') return json({ ok: true }, 200);

  if (url.pathname === '/sessions' && request.method === 'POST') {
    return createSession(env);
  }
  if (url.pathname === '/sessions') return json({ error: 'not-found' }, 404);

  const match = url.pathname.match(
    /^\/sessions\/([0123456789ABCDEFGHJKMNPQRSTVWXYZ]{6})(?:\/storyteller)?$/
  );
  if (!match || !CODE_PATTERN.test(match[1])) {
    return json({ error: 'unknown-code' }, 404);
  }
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return json({ error: 'upgrade-required' }, 426);
  }
  return joinSession(request, env, match[1]);
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch {
      return json({ error: 'unavailable' }, 500);
    }
  },
};
