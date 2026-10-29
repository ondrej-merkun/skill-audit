/**
 * Version pins: files outside the CLI package that pin the CLI version must
 * match packages/cli/package.json, so a repository revision always runs the
 * CLI release it ships with.
 */

import { execFile } from 'node:child_process';
import { appendFile, copyFile, cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  CLI_PACKAGE_JSON,
  extractPinnedVersions,
  PINNED_LOCATIONS,
  toLf,
} from '../scripts/version-pins.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SET_VERSION_SCRIPT = 'scripts/set-version.mjs';
const SKILL_README = 'packages/skill/README.md';
// Must differ from the current package version, so a pin that the script
// misses fails the test.
const NEW_VERSION = '9.9.9';

const execFileAsync = promisify(execFile);

describe('CLI version pins', () => {
  it.each(PINNED_LOCATIONS)('$file pins the CLI package version', async (location) => {
    const packageVersion = await readCliPackageVersion(REPO_ROOT);

    const pinnedVersions = await readPinnedVersions(REPO_ROOT, location);

    expect(pinnedVersions).toEqual([packageVersion]);
  });

  it('scripts/set-version.mjs sets the package version and every pin', async () => {
    const copyRoot = await copyPinnedFiles();
    const skillReadme = join(copyRoot, SKILL_README);

    try {
      // A pin at the end of a sentence must keep its period.
      await appendFile(skillReadme, sentenceEndPin(await readCliPackageVersion(copyRoot)));

      await execFileAsync(process.execPath, [join(copyRoot, SET_VERSION_SCRIPT), NEW_VERSION]);

      expect(await readCliPackageVersion(copyRoot)).toBe(NEW_VERSION);
      for (const location of PINNED_LOCATIONS) {
        expect(await readPinnedVersions(copyRoot, location), location.file).toEqual([NEW_VERSION]);
      }
      expect(await readFile(skillReadme, 'utf-8')).toContain(sentenceEndPin(NEW_VERSION));
    } finally {
      await rm(copyRoot, { recursive: true, force: true });
    }
  });
});

/**
 * Copies the scripts, the CLI package.json, and every pinned file to a temp
 * repository root. The script finds the root from its own path, so it then
 * edits only the copy.
 */
async function copyPinnedFiles(): Promise<string> {
  const copyRoot = await mkdtemp(join(tmpdir(), 'skill-audit-set-version-'));
  await cp(join(REPO_ROOT, 'scripts'), join(copyRoot, 'scripts'), { recursive: true });

  for (const file of [CLI_PACKAGE_JSON, ...PINNED_LOCATIONS.map(({ file }) => file)]) {
    await mkdir(dirname(join(copyRoot, file)), { recursive: true });
    await copyFile(join(REPO_ROOT, file), join(copyRoot, file));
  }

  return copyRoot;
}

function sentenceEndPin(version: string): string {
  return `Run npx @ondrej-merkun/skill-audit@${version}.\n`;
}

async function readCliPackageVersion(root: string): Promise<string> {
  const pkg = JSON.parse(await readFile(join(root, CLI_PACKAGE_JSON), 'utf-8')) as {
    version: string;
  };
  return pkg.version;
}

/** Returns each distinct version that the file pins, in order of appearance. */
async function readPinnedVersions(root: string, location: PinnedLocation): Promise<string[]> {
  const text = toLf(await readFile(join(root, location.file), 'utf-8'));
  return [...new Set(extractPinnedVersions(text, location.pattern))];
}

type PinnedLocation = (typeof PINNED_LOCATIONS)[number];
