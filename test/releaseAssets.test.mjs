import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../js/changelog.js';
import {
  navigateToNewerRelease,
  releaseNavigationUrl,
  shouldNavigateToRelease,
} from '../js/releaseCheck.js';
import {
  collectModuleSpecifiers,
  releaseAssetProblems,
  releaseAssetUrls,
  releaseManifest,
  stampHtml,
  versionedUrl,
} from '../scripts/release-assets.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const entryPath = fileURLToPath(new URL('../js/script.js', import.meta.url));
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const specifiers = collectModuleSpecifiers(entryPath, readFileSync, root);

describe('release asset versions', () => {
  it('versions the whole local module graph', () => {
    const dir = mkdtempSync(join(tmpdir(), 'release-assets-'));
    try {
      writeFileSync(join(dir, 'leaf.js'), 'export const leaf = 1;\n');
      writeFileSync(
        join(dir, 'mid.js'),
        "import { leaf } from './leaf.js';\nexport const mid = leaf;\n"
      );
      writeFileSync(join(dir, 'entry.js'), "import { mid } from './mid.js';\n");
      assert.deepEqual(collectModuleSpecifiers(join(dir, 'entry.js')), [
        './leaf.js',
        './mid.js',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('gives a new application version different asset URLs', () => {
    const previous = releaseAssetUrls('1.1.0', specifiers);
    const current = releaseAssetUrls(APP_VERSION, specifiers);
    assert.notEqual(APP_VERSION, '1.1.0');
    for (const url of current) {
      assert.equal(previous.includes(url), false);
      assert.match(url, new RegExp(`\\?v=${APP_VERSION.replaceAll('.', '\\.')}$`));
    }
  });

  it('keeps one version across the entry script, modules, and CSS', () => {
    const urls = releaseAssetUrls(APP_VERSION, specifiers);
    assert.ok(urls.includes(`css/styles.css?v=${APP_VERSION}`));
    assert.ok(urls.includes(`js/script.js?v=${APP_VERSION}`));
    for (const specifier of specifiers) {
      assert.ok(urls.includes(versionedUrl(specifier, APP_VERSION)));
    }
    const versions = new Set(urls.map((url) => new URLSearchParams(url.split('?')[1]).get('v')));
    assert.deepEqual([...versions], [APP_VERSION]);
  });

  it('stamps stylesheet, entry script, and module imports', () => {
    const bare = [
      '<link rel="preload" href="css/styles.css" as="style" />',
      '<link rel="stylesheet" href="css/styles.css" />',
      '<script src="js/script.js" type="module"></script>',
    ].join('\n');
    const stamped = stampHtml(bare, '2.0.0', ['./js/helper.js', './js/leaf.js']);
    assert.equal(
      releaseAssetProblems(stamped, '2.0.0', ['./js/helper.js', './js/leaf.js']).join('\n'),
      ''
    );
    assert.equal(stamped.includes('href="css/styles.css"'), false);
    assert.equal(stamped.includes('src="js/script.js"'), false);

    const next = stampHtml(stamped, '2.0.1', ['./js/helper.js', './js/leaf.js']);
    assert.equal(next.includes('?v=2.0.0'), false);
    assert.equal(
      releaseAssetProblems(next, '2.0.1', ['./js/helper.js', './js/leaf.js']).join('\n'),
      ''
    );
    assert.equal(stampHtml(next, '2.0.1', ['./js/helper.js', './js/leaf.js']), next);
  });

  it('publishes one consistent release', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const lock = JSON.parse(
      readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')
    );
    const manifest = JSON.parse(
      readFileSync(new URL('../release.json', import.meta.url), 'utf8')
    );

    assert.equal(pkg.version, APP_VERSION);
    assert.equal(lock.version, APP_VERSION);
    assert.equal(lock.packages[''].version, APP_VERSION);
    assert.equal(manifest.version, APP_VERSION);
    assert.equal(releaseManifest(APP_VERSION), `${JSON.stringify(manifest, null, 2)}\n`);
    assert.equal(releaseAssetProblems(indexHtml, APP_VERSION, specifiers).join('\n'), '');
    assert.equal(stampHtml(indexHtml, APP_VERSION, specifiers), indexHtml);
    assert.ok(specifiers.includes('./js/helper.js'));
    assert.ok(specifiers.includes('./js/timerEngine.js'));
    assert.ok(specifiers.includes('./js/gameState.js'));
    assert.ok(specifiers.includes('./js/changelog.js'));
    assert.ok(specifiers.includes('./js/releaseCheck.js'));
  });
});

describe('release navigation', () => {
  it('loads a newer release only when a game is not in progress', () => {
    assert.equal(
      shouldNavigateToRelease({
        appVersion: '1.1.0',
        remoteVersion: '1.1.1',
        safeToReload: true,
        attemptedVersion: null,
      }),
      true
    );
    assert.equal(
      shouldNavigateToRelease({
        appVersion: '1.1.0',
        remoteVersion: '1.1.1',
        safeToReload: false,
        attemptedVersion: null,
      }),
      false
    );
    assert.equal(
      shouldNavigateToRelease({
        appVersion: '1.1.1',
        remoteVersion: '1.1.1',
        safeToReload: true,
        attemptedVersion: null,
      }),
      false
    );
    assert.equal(
      shouldNavigateToRelease({
        appVersion: '1.1.0',
        remoteVersion: '1.1.1',
        safeToReload: true,
        attemptedVersion: '1.1.1',
      }),
      false
    );
    assert.equal(
      shouldNavigateToRelease({
        appVersion: '1.1.0',
        remoteVersion: '',
        safeToReload: true,
        attemptedVersion: null,
      }),
      false
    );
  });

  it('requests a document URL the browser has not cached', () => {
    assert.equal(
      releaseNavigationUrl('https://timer.arcane-scripts.net/', '1.1.1'),
      'https://timer.arcane-scripts.net/?v=1.1.1'
    );
    assert.equal(
      releaseNavigationUrl('https://timer.arcane-scripts.net/?v=1.1.0', '1.1.1'),
      'https://timer.arcane-scripts.net/?v=1.1.1'
    );
  });

  it('simulates an idle upgrade and leaves an active game on the loaded release', async () => {
    const storage = new Map();
    const session = {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, value),
    };
    const location = {
      href: 'https://timer.arcane-scripts.net/',
      replace(url) {
        this.replaced = url;
      },
    };
    const fetchImpl = async (url) => {
      assert.match(url, /release\.json\?t=/);
      return {
        ok: true,
        json: async () => ({ version: '1.1.1' }),
      };
    };

    const upgraded = await navigateToNewerRelease({
      appVersion: '1.1.0',
      isSafeToReload: () => true,
      fetchImpl,
      location,
      storage: session,
      now: () => 100,
      online: true,
    });
    assert.equal(upgraded, true);
    assert.equal(location.replaced, 'https://timer.arcane-scripts.net/?v=1.1.1');

    location.replaced = undefined;
    const paused = await navigateToNewerRelease({
      appVersion: '1.1.0',
      isSafeToReload: () => false,
      fetchImpl,
      location,
      storage: {
        getItem: () => null,
        setItem() {
          throw new Error('storage should not be written');
        },
      },
      now: () => 100,
      online: true,
    });
    assert.equal(paused, false);
    assert.equal(location.replaced, undefined);
  });

  it('checks safety again after the release manifest returns', async () => {
    let safe = true;
    const location = {
      href: 'https://timer.arcane-scripts.net/',
      replace() {
        throw new Error('should not navigate');
      },
    };
    const navigated = await navigateToNewerRelease({
      appVersion: '1.1.0',
      isSafeToReload: () => safe,
      fetchImpl: async () => {
        safe = false;
        return {
          ok: true,
          json: async () => ({ version: '1.1.1' }),
        };
      },
      location,
      storage: {
        getItem: () => null,
        setItem() {},
      },
      now: () => 1,
      online: true,
    });
    assert.equal(navigated, false);
  });

  it('does not fetch a release manifest while offline', async () => {
    const navigated = await navigateToNewerRelease({
      appVersion: '1.1.0',
      isSafeToReload: () => true,
      fetchImpl: async () => {
        throw new Error('should not fetch');
      },
      location: { href: 'https://timer.arcane-scripts.net/' },
      storage: { getItem: () => null, setItem() {} },
      online: false,
    });
    assert.equal(navigated, false);
  });
});
