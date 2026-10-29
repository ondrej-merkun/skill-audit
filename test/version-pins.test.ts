/**
 * Version pins: files outside the CLI package that pin the CLI version must
 * match packages/cli/package.json, so a repository revision always runs the
 * CLI release it ships with.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLI_PACKAGE_JSON = 'packages/cli/package.json';

// Matches the `default:` line inside the `version:` input block of action.yml.
// The 2-space `version:` key exists only under `inputs:`.
const ACTION_VERSION_DEFAULT = /^ {2}version:\n(?: {4}.*\n)*? {4}default: *'([^']*)'/gm;

// Add one row per file that pins the CLI version.
const PINNED_LOCATIONS: PinnedLocation[] = [
  {
    file: 'action.yml',
    extractPinnedVersions: (text) => matchedGroups(text, ACTION_VERSION_DEFAULT),
  },
];

describe('CLI version pins', () => {
  it.each(PINNED_LOCATIONS)(
    '$file pins the CLI package version',
    async ({ file, extractPinnedVersions }) => {
      const packageVersion = await readCliPackageVersion();

      const pinnedVersions = extractPinnedVersions(await readRepoFile(file));

      expect([...new Set(pinnedVersions)]).toEqual([packageVersion]);
    }
  );
});

async function readCliPackageVersion(): Promise<string> {
  const pkg = JSON.parse(await readRepoFile(CLI_PACKAGE_JSON)) as { version: string };
  return pkg.version;
}

async function readRepoFile(file: string): Promise<string> {
  return readFile(join(REPO_ROOT, file), 'utf-8');
}

/**
 * Returns capture group 1 of every match of a global pattern, so the test sees
 * both missing and conflicting pins.
 */
function matchedGroups(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? '');
}

type PinnedLocation = {
  /** Repository-relative path. */
  file: string;
  /** Returns every CLI version that the file pins. */
  extractPinnedVersions: (text: string) => string[];
};
