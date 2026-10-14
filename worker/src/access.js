// Browser origin checks and per-address rate limits.
// CORS is not authentication. A non-browser client can set Origin.
// The write token still has to be presented on the Storyteller socket.

export function allowedOriginSet(env) {
  const raw = typeof env?.ALLOWED_ORIGINS === 'string' ? env.ALLOWED_ORIGINS : '';
  return new Set(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function requestOrigin(request) {
  const origin = request.headers.get('Origin');
  return origin && origin.trim() ? origin.trim() : null;
}

export function originAllowed(request, env) {
  const origin = requestOrigin(request);
  if (!origin) return false;
  return allowedOriginSet(env).has(origin);
}

// Cloudflare overwrites this header at the edge. A client cannot choose it
// on the deployed worker. Local tests omit it, and those calls are not
// collapsed into one shared bucket.
export function clientKey(request) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || !ip.trim()) return null;
  return ip.trim();
}

export async function withinLimit(limiter, key) {
  if (!key || !limiter || typeof limiter.limit !== 'function') return true;
  try {
    const result = await limiter.limit({ key });
    return result?.success !== false;
  } catch {
    return false;
  }
}

export function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin,
    vary: 'Origin',
  };
}

export function preflight(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'Content-Type',
      'access-control-max-age': '86400',
      'cache-control': 'no-store',
    },
  });
}
