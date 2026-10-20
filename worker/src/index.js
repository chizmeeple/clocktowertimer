import {
  clientKey,
  corsHeaders,
  originAllowed,
  preflight,
  requestOrigin,
  withinLimit,
} from './access.js';
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

function json(body, status, origin) {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
      ...(origin ? corsHeaders(origin) : {}),
    },
  });
}

function hasTokenInUrl(url) {
  return url.searchParams.has('token') || url.searchParams.has('writeToken');
}

async function createSession(env, origin) {
  const directory = directoryStub(env);
  const now = Date.now();
  if (!(await directory.creationAllowed(now))) {
    return json({ error: 'create-limit' }, 429, origin);
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
  if (!code) return json({ error: 'code-unavailable' }, 503, origin);

  const stub = env.COMPANION_SESSION.get(
    env.COMPANION_SESSION.idFromName(sessionId)
  );
  try {
    await stub.open({ sessionId, code, tokenHash, createdAt: now });
  } catch {
    await directory.retire(code, sessionId);
    return json({ error: 'session-unavailable' }, 500, origin);
  }
  return json({ code, writeToken }, 201, origin);
}

async function joinSession(request, env, code, origin) {
  if (!(await withinLimit(env.GUESS_BUDGET, clientKey(request)))) {
    return json({ error: 'join-limit' }, 429, origin);
  }
  const found = await directoryStub(env).lookup(code);
  if (!found.sessionId) return json({ error: 'unknown-code' }, 404, origin);
  const stub = env.COMPANION_SESSION.get(
    env.COMPANION_SESSION.idFromName(found.sessionId)
  );
  return stub.fetch(request);
}

// A browser cannot read a refused WebSocket upgrade. This is a read of the
// directory only: it does not create, wake, or change a session.
async function sessionStatus(request, env, code, origin) {
  if (!(await withinLimit(env.GUESS_BUDGET, clientKey(request)))) {
    return json({ error: 'join-limit' }, 429, origin);
  }
  if (!CODE_PATTERN.test(code)) {
    return json({ status: 'unavailable' }, 200, origin);
  }
  const found = await directoryStub(env).availability(code);
  const status = found.availability === 'active' ? 'active' : 'unavailable';
  return json({ status }, 200, origin);
}

async function route(request, env) {
  const url = new URL(request.url);
  if (hasTokenInUrl(url)) return json({ error: 'token-in-url' }, 400);

  if (
    url.pathname === '/health' &&
    (request.method === 'GET' || request.method === 'HEAD')
  ) {
    return json({ ok: true }, 200);
  }

  const statusMatch = url.pathname.match(/^\/sessions\/([^/]+)\/status$/);
  if (statusMatch && request.method === 'GET') {
    const origin = requestOrigin(request);
    // A cross-origin browser always sends Origin. A same-origin GET often
    // does not, and this read has no credential to steal.
    if (origin && !originAllowed(request, env)) {
      return json({ error: 'origin-rejected' }, 403);
    }
    return sessionStatus(request, env, statusMatch[1], origin);
  }

  const origin = requestOrigin(request);
  if (request.method === 'OPTIONS' && url.pathname === '/sessions') {
    if (!originAllowed(request, env)) return json({ error: 'origin-rejected' }, 403);
    return preflight(origin);
  }

  if (!originAllowed(request, env)) return json({ error: 'origin-rejected' }, 403);

  if (url.pathname === '/sessions' && request.method === 'POST') {
    if (!(await withinLimit(env.CREATE_BUDGET, clientKey(request)))) {
      return json({ error: 'create-rate' }, 429, origin);
    }
    return createSession(env, origin);
  }
  if (url.pathname === '/sessions') return json({ error: 'not-found' }, 404, origin);

  const match = url.pathname.match(
    /^\/sessions\/([0123456789ABCDEFGHJKMNPQRSTVWXYZ]{6})(?:\/storyteller)?$/
  );
  if (!match || !CODE_PATTERN.test(match[1])) {
    return json({ error: 'unknown-code' }, 404, origin);
  }
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return json({ error: 'upgrade-required' }, 426, origin);
  }
  return joinSession(request, env, match[1], origin);
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
