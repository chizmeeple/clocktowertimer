import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../changelog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

export function collectModuleSpecifiers(entryPath, readFile = readFileSync) {
  const rootDir = dirname(resolve(entryPath));
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
    versionedUrl('styles.css', version),
    versionedUrl('script.js', version),
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
  let next = html.replace(
    /href="styles\.css(?:\?[^"]*)?"/g,
    `href="styles.css?v=${version}"`
  );
  next = next.replace(
    /src="script\.js(?:\?[^"]*)?"/g,
    `src="script.js?v=${version}"`
  );

  const block = importMapBlock(version, specifiers);
  const moduleTag = `<script src="script.js?v=${version}" type="module"></script>`;
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

  const cssCount = html.split(`href="styles.css?v=${version}"`).length - 1;
  if (cssCount !== 2) {
    problems.push(`expected 2 stylesheet references, found ${cssCount}`);
  }
  if (/href="styles\.css"/.test(html)) {
    problems.push('unversioned stylesheet reference');
  }
  if (!html.includes(`src="script.js?v=${version}"`)) {
    problems.push('entry script is not versioned');
  }
  if (/src="script\.js"/.test(html)) {
    problems.push('unversioned entry script');
  }
  return problems;
}

function writeReleaseAssets() {
  const entryPath = resolve(root, 'script.js');
  const specifiers = collectModuleSpecifiers(entryPath);
  const htmlPath = resolve(root, 'index.html');
  const html = stampHtml(readFileSync(htmlPath, 'utf8'), APP_VERSION, specifiers);
  const problems = releaseAssetProblems(html, APP_VERSION, specifiers);
  if (problems.length > 0) {
    throw new Error(problems.join('\n'));
  }
  writeFileSync(htmlPath, html);
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
