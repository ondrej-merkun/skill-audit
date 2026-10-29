/**
 * Sets the CLI release version in packages/cli/package.json and in every file
 * that pins it (PINNED_LOCATIONS in scripts/version-pins.mjs).
 *
 * Usage: node scripts/set-version.mjs <x.y.z>
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLI_PACKAGE_JSON,
  extractPinnedVersions,
  PINNED_LOCATIONS,
  toLf,
} from './version-pins.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const USAGE = 'Usage: node scripts/set-version.mjs <x.y.z>';

// Plain x.y.z only. The release workflow runs `npm publish` without `--tag`,
// and npm 11 refuses to publish a prerelease version that way.
const RELEASE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

try {
  await setVersion(process.argv.slice(2));
} catch (error) {
  console.error(`set-version: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

/** @param {string[]} args */
async function setVersion(args) {
  const [version] = args;
  if (args.length !== 1 || !RELEASE_VERSION.test(version)) {
    throw new Error(`expected one x.y.z version such as 1.2.3, got "${args.join(' ')}".\n${USAGE}`);
  }

  // Prepare every update before writing any file, so a failure changes nothing.
  const updates = [
    await preparePackageUpdate(version),
    ...(await Promise.all(PINNED_LOCATIONS.map((location) => preparePinUpdate(location, version)))),
  ];

  // Files are written with LF line endings, as Git stores them.
  for (const { file, updatedText, change } of updates) {
    await writeFile(join(REPO_ROOT, file), updatedText);
    console.log(`${file}: ${change}`);
  }
}

/** @param {string} version */
async function preparePackageUpdate(version) {
  const pkg = JSON.parse(await readFile(join(REPO_ROOT, CLI_PACKAGE_JSON), 'utf-8'));
  const previousVersion = pkg.version;
  pkg.version = version;

  // The file uses the JSON.stringify 2-space layout with a final newline.
  return {
    file: CLI_PACKAGE_JSON,
    updatedText: `${JSON.stringify(pkg, null, 2)}\n`,
    change: `${previousVersion} -> ${version}`,
  };
}

/**
 * @param {{ file: string, pattern: RegExp }} location
 * @param {string} version
 */
async function preparePinUpdate({ file, pattern }, version) {
  const text = toLf(await readFile(join(REPO_ROOT, file), 'utf-8'));

  const previousVersions = extractPinnedVersions(text, pattern);
  if (previousVersions.length === 0) {
    throw new Error(`${file} has no CLI version pin to update.`);
  }
  if (previousVersions.includes('')) {
    throw new Error(`${file} has a CLI reference with no version. Add the version by hand first.`);
  }

  const pinCount = `${previousVersions.length} ${previousVersions.length === 1 ? 'pin' : 'pins'}`;
  return {
    file,
    updatedText: replacePinnedVersions(text, pattern, version),
    change: `${pinCount}, ${[...new Set(previousVersions)].join(', ')} -> ${version}`,
  };
}

/**
 * Returns the text with capture group 1 of every pattern match set to the
 * version. Every match must have a group 1.
 *
 * @param {string} text
 * @param {RegExp} pattern
 * @param {string} version
 */
function replacePinnedVersions(text, pattern, version) {
  // The d flag reports where group 1 starts and ends inside the text.
  const pinPattern = new RegExp(pattern.source, `${pattern.flags}d`);
  let updatedText = '';
  let cursor = 0;

  for (const match of text.matchAll(pinPattern)) {
    const [versionStart, versionEnd] = match.indices[1];
    updatedText += text.slice(cursor, versionStart) + version;
    cursor = versionEnd;
  }

  return updatedText + text.slice(cursor);
}
