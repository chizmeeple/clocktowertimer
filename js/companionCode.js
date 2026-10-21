// Session codes use the worker's Crockford alphabet. I, L, O and U are
// absent so a code can be read aloud. Spoken I, L and O are folded in.
// 0 and 1 are removed because they are easily confused with O and I.

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

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

// Public player link. The Storyteller page and the player page both use this.
// There is no slash before the query, and the write token is never included.
const PLAYER_PAGE = 'https://timer.arcane-scripts.net/c';

export function companionPlayerUrl(code) {
  const params = new URLSearchParams({ code });
  return `${PLAYER_PAGE}?${params.toString()}`;
}

export function companionQrImageUrl(playerUrl) {
  const params = new URLSearchParams({
    size: '360x360',
    format: 'svg',
    qzone: '2',
    color: '000000',
    bgcolor: 'ffffff',
    data: playerUrl,
  });
  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
}

// A player can share a code while it is live, or while reconnecting after it
// has already been live. The first connection attempt cannot, and neither can
// a session that has ended, expired, or been left.
export function presentCompanionPlayerShare(view) {
  const connection = view?.connection;
  const code = view?.code;
  const established = view?.established === true;
  const valid = isSessionCode(code);
  const canShare =
    valid &&
    (connection === 'live' || (connection === 'reconnecting' && established));
  return {
    canShare,
    code: canShare ? code : '',
    playerUrl: canShare ? companionPlayerUrl(code) : '',
  };
}

// Local pages keep using the development proxy, which can point at a
// local worker or the deployed one. The public site talks to Cloudflare.
export function companionBaseUrl(location) {
  const host = location?.hostname || '';
  if (host === 'localhost' || host === '127.0.0.1') return '/companion-api';
  return 'https://clocktower-companion.redmeeple.workers.dev';
}
