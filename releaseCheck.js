// Detect a newer published release and, when it is safe, load that document.
// This does not decide staleness for the inactive-tab banner, and it does not
// read or clear saved games or settings.

export const RELEASE_ATTEMPT_KEY = 'towerTimerReleaseRedirect';

export function shouldNavigateToRelease({
  appVersion,
  remoteVersion,
  safeToReload,
  attemptedVersion,
}) {
  if (typeof remoteVersion !== 'string' || remoteVersion.length === 0) {
    return false;
  }
  if (remoteVersion === appVersion) return false;
  if (!safeToReload) return false;
  if (attemptedVersion === remoteVersion) return false;
  return true;
}

export function releaseNavigationUrl(currentHref, remoteVersion) {
  const url = new URL(currentHref);
  url.searchParams.set('v', remoteVersion);
  return url.href;
}

function readAttempt(storage) {
  try {
    return storage.getItem(RELEASE_ATTEMPT_KEY);
  } catch {
    return null;
  }
}

function rememberAttempt(storage, remoteVersion) {
  try {
    storage.setItem(RELEASE_ATTEMPT_KEY, remoteVersion);
    return true;
  } catch {
    return false;
  }
}

// One request per page load. cache: 'no-store' and a unique query bypass the
// browser cache. GitHub Pages still applies its own cache to the path, so a
// document already cached by an older release cannot be updated from here.
export async function navigateToNewerRelease({
  appVersion,
  isSafeToReload,
  fetchImpl = globalThis.fetch,
  location = globalThis.location,
  storage = globalThis.sessionStorage,
  now = () => Date.now(),
  online = globalThis.navigator?.onLine !== false,
} = {}) {
  if (!online) return false;

  let remoteVersion = '';
  try {
    const url = new URL('release.json', location.href);
    url.searchParams.set('t', String(now()));
    const response = await fetchImpl(url.href, { cache: 'no-store' });
    if (!response.ok) return false;
    const body = await response.json();
    remoteVersion = typeof body?.version === 'string' ? body.version : '';
  } catch {
    return false;
  }

  if (
    !shouldNavigateToRelease({
      appVersion,
      remoteVersion,
      safeToReload: isSafeToReload(),
      attemptedVersion: readAttempt(storage),
    })
  ) {
    return false;
  }

  // Remember the attempt before navigating so a stale response cannot loop.
  if (!rememberAttempt(storage, remoteVersion)) return false;
  location.replace(releaseNavigationUrl(location.href, remoteVersion));
  return true;
}
