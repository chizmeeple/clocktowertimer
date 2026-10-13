import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../js/changelog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STYLESHEET = 'css/styles.css';
const ENTRY_SCRIPT = 'js/script.js';
const COMPANION_HTML = 'c/index.html';
const COMPANION_ASSETS = [
  '../css/styles.css',
  '../css/companion.css',
  '../js/companion-page.js',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

export function localImportSpecifiers(source) {
  const code = stripComments(source);
  const specifiers = new Set();
  for (const match of code.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)) {
    specifiers.add(match[1]);
  }
  for (const match of code.matchAll(/\bimport\s+['"](\.[^'"]+)['"]/g)) {
    specifiers.add(match[1]);
  }
  return [...specifiers];
}

export function collectModuleSpecifiers(
  entryPath,
  readFile = readFileSync,
  baseDir = dirname(resolve(entryPath))
) {
  const rootDir = resolve(baseDir);
  const seen = new Set();
  const specifiers = new Set();

  function visit(filePath) {
    const absolute = resolve(filePath);
    if (seen.has(absolute)) return;
    seen.add(absolute);
    const source = readFile(absolute, 'utf8');
    for (const specifier of localImportSpecifiers(source)) {
      const clean = specifier.split('?')[0].split('#')[0];
      const importedPath = resolve(dirname(absolute), clean);
      const relativePath = relative(rootDir, importedPath).split('\\').join('/');
      specifiers.add(`./${relativePath}`);
      visit(importedPath);
    }
  }

  visit(entryPath);
  return [...specifiers].sort();
}

export function versionedUrl(specifier, version) {
  const [path, query = ''] = specifier.split('?');
  const params = new URLSearchParams(query);
  params.set('v', version);
  return `${path}?${params.toString()}`;
}

export function buildImportMap(version, specifiers) {
  const imports = {};
  for (const specifier of [...specifiers].sort()) {
    imports[specifier] = versionedUrl(specifier, version);
  }
  return { imports };
}

export function releaseAssetUrls(version, specifiers) {
  return [
    versionedUrl(STYLESHEET, version),
    versionedUrl(ENTRY_SCRIPT, version),
    ...[...specifiers].sort().map((specifier) => versionedUrl(specifier, version)),
  ];
}

export function importMapBlock(version, specifiers) {
  const json = JSON.stringify(buildImportMap(version, specifiers), null, 2);
  const indented = json
    .split('\n')
    .map((line) => `      ${line}`)
    .join('\n');
  return [
    '    <!-- release-assets -->',
    '    <script type="importmap">',
    indented,
    '    </script>',
  ].join('\n');
}

const IMPORT_MAP_BLOCK =
  /(?:[ \t]*<!-- release-assets -->\n)?[ \t]*<script type="importmap">[\s\S]*?<\/script>\n?/;

export function stampHtml(html, version, specifiers) {
  const stylesheet = versionedUrl(STYLESHEET, version);
  const entry = versionedUrl(ENTRY_SCRIPT, version);
  let next = html.replace(
    new RegExp(`href="${escapeRegExp(STYLESHEET)}(?:\\?[^"]*)?"`, 'g'),
    `href="${stylesheet}"`
  );
  next = next.replace(
    new RegExp(`src="${escapeRegExp(ENTRY_SCRIPT)}(?:\\?[^"]*)?"`, 'g'),
    `src="${entry}"`
  );

  const block = importMapBlock(version, specifiers);
  const moduleTag = `<script src="${entry}" type="module"></script>`;
  const moduleLine = new RegExp(
    `^[ \\t]*${moduleTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*$`,
    'm'
  );
  if (!moduleLine.test(next)) {
    throw new Error(`Could not find ${moduleTag}`);
  }

  if (next.includes('<script type="importmap">')) {
    next = next.replace(IMPORT_MAP_BLOCK, `${block}\n`);
  } else {
    next = next.replace(moduleLine, `${block}\n    ${moduleTag}`);
  }
  return next;
}

export function stampCompanionHtml(html, version) {
  let next = html;
  for (const asset of COMPANION_ASSETS) {
    const pattern = new RegExp(
      `((?:href|src)=")${escapeRegExp(asset)}(?:\\?[^"]*)?"`,
      'g'
    );
    if (!pattern.test(next)) {
      throw new Error(`Could not find ${asset}`);
    }
    pattern.lastIndex = 0;
    next = next.replace(pattern, `$1${versionedUrl(asset, version)}"`);
  }
  return next;
}

export function companionAssetProblems(html, version) {
  const problems = [];
  for (const asset of COMPANION_ASSETS) {
    const versioned = `="${versionedUrl(asset, version)}"`;
    const count = html.split(versioned).length - 1;
    if (count !== 1) {
      problems.push(`expected 1 ${asset} reference, found ${count}`);
    }
    if (new RegExp(`(?:href|src)="${escapeRegExp(asset)}"`).test(html)) {
      problems.push(`unversioned ${asset}`);
    }
  }
  return problems;
}

export function releaseManifest(version) {
  return `${JSON.stringify({ version }, null, 2)}\n`;
}

export function releaseAssetProblems(html, version, specifiers) {
  const problems = [];
  const expected = buildImportMap(version, specifiers).imports;
  const match = html.match(
    /<script type="importmap">([\s\S]*?)<\/script>/
  );
  if (!match) {
    problems.push('missing import map');
    return problems;
  }

  let actual;
  try {
    actual = JSON.parse(match[1]).imports ?? {};
  } catch {
    problems.push('import map is not valid JSON');
    return problems;
  }

  for (const [specifier, url] of Object.entries(expected)) {
    if (actual[specifier] !== url) {
      problems.push(`${specifier} should be ${url}`);
    }
  }
  for (const [specifier, url] of Object.entries(actual)) {
    if (!(specifier in expected)) {
      problems.push(`unexpected import map entry ${specifier}`);
    }
    if (url !== versionedUrl(specifier, version)) {
      problems.push(`${specifier} is not version ${version}`);
    }
  }

  const stylesheet = `href="${versionedUrl(STYLESHEET, version)}"`;
  const cssCount = html.split(stylesheet).length - 1;
  if (cssCount !== 2) {
    problems.push(`expected 2 stylesheet references, found ${cssCount}`);
  }
  if (new RegExp(`href="${escapeRegExp(STYLESHEET)}"`).test(html)) {
    problems.push('unversioned stylesheet reference');
  }
  if (!html.includes(`src="${versionedUrl(ENTRY_SCRIPT, version)}"`)) {
    problems.push('entry script is not versioned');
  }
  if (new RegExp(`src="${escapeRegExp(ENTRY_SCRIPT)}"`).test(html)) {
    problems.push('unversioned entry script');
  }
  return problems;
}

function writeReleaseAssets() {
  const entryPath = resolve(root, ENTRY_SCRIPT);
  const specifiers = collectModuleSpecifiers(entryPath, readFileSync, root);
  const htmlPath = resolve(root, 'index.html');
  const html = stampHtml(readFileSync(htmlPath, 'utf8'), APP_VERSION, specifiers);
  const problems = releaseAssetProblems(html, APP_VERSION, specifiers);
  const companionPath = resolve(root, COMPANION_HTML);
  const companion = stampCompanionHtml(
    readFileSync(companionPath, 'utf8'),
    APP_VERSION
  );
  const companionProblems = companionAssetProblems(companion, APP_VERSION);
  const all = [...problems, ...companionProblems];
  if (all.length > 0) {
    throw new Error(all.join('\n'));
  }
  writeFileSync(htmlPath, html);
  writeFileSync(companionPath, companion);
  writeFileSync(
    resolve(root, 'release.json'),
    releaseManifest(APP_VERSION)
  );
  console.log(`Stamped release ${APP_VERSION}`);
}

const isDirect =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect && process.argv.includes('--write')) {
  writeReleaseAssets();
}
