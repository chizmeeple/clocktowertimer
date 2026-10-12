// Public snapshot messages stay inside the Foundation 1 v1 object.
// rev and serverTime live only on the transport envelope.

export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_PATTERN = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;
export const CODE_ATTEMPTS = 8;

export const MAX_MESSAGE_BYTES = 2048;
export const MAX_READERS = 20;
export const MAX_STORYTELLER_SOCKETS = 3;

export const PUBLISH_LIMIT = 30;
export const PUBLISH_WINDOW_MS = 10_000;

export const IDLE_MS = 3 * 60 * 60 * 1000;
export const MAX_LIFETIME_MS = 12 * 60 * 60 * 1000;

export const CREATE_LIMIT = 120;
export const CREATE_WINDOW_MS = 60_000;

export const AUTH_TIMEOUT_MS = 5_000;

const CLIENT_KEYS = {
  auth: ['type', 'token'],
  publish: ['type', 'state'],
  end: ['type'],
};

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function parseClientMessage(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'malformed-json' };
  }
  if (!isPlainObject(value) || typeof value.type !== 'string') {
    return { ok: false, reason: 'invalid-message' };
  }
  const allowed = CLIENT_KEYS[value.type];
  if (!allowed) return { ok: false, reason: 'invalid-message' };
  const keys = Object.keys(value);
  if (
    keys.length !== allowed.length ||
    allowed.some((key) => !Object.hasOwn(value, key))
  ) {
    return { ok: false, reason: 'invalid-message' };
  }
  return { ok: true, value };
}

export function messageByteLength(message) {
  if (typeof message === 'string') return new TextEncoder().encode(message).byteLength;
  if (message instanceof ArrayBuffer) return message.byteLength;
  return message?.byteLength ?? MAX_MESSAGE_BYTES + 1;
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function tokensMatch(left, right) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function numberSetting(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}
