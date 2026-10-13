// Session codes use the worker's Crockford alphabet. I, L, O and U are
// absent so a code can be read aloud. Spoken I, L and O are folded in.

const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function normaliseSessionCode(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function isSessionCode(code) {
  return (
    typeof code === 'string' &&
    code.length === 6 &&
    [...code].every((character) => CODE_ALPHABET.includes(character))
  );
}

export function sessionCodeFromLocation(location) {
  const params = new URLSearchParams(location?.search || '');
  return normaliseSessionCode(params.get('code') || '');
}

// Local pages keep using the development proxy, which can point at a
// local worker or the deployed one. The public site talks to Cloudflare.
export function companionBaseUrl(location) {
  const host = location?.hostname || '';
  if (host === 'localhost' || host === '127.0.0.1') return '/companion-api';
  return 'https://clocktower-companion.redmeeple.workers.dev';
}
