/**
 * Files outside the CLI package that pin the CLI version. Shared by
 * scripts/set-version.mjs, which writes the pins, and
 * test/version-pins.test.ts, which checks them.
 */

/** Repository-relative path of the package whose version the pins follow. */
export const CLI_PACKAGE_JSON = 'packages/cli/package.json';

// Matches the `default:` line inside the `version:` input block of action.yml.
// The 2-space `version:` key exists only under `inputs:`.
const ACTION_VERSION_DEFAULT = /^ {2}version:\n(?: {4}.*\n)*? {4}default: *'([^']*)'/gm;

// Matches every `@ondrej-merkun/skill-audit` reference. Group 1 is the version
// after the package name. A reference with no version yields an empty string,
// so an unpinned command also fails the check.
const CLI_PACKAGE_REFERENCE = /@ondrej-merkun\/skill-audit(?:@([\w.+-]+))?/g;

/**
 * Add one row per file that pins the CLI version. Each pattern is global, and
 * its group 1 is the pinned version. Patterns match LF text.
 *
 * @type {{ file: string, pattern: RegExp }[]}
 */
export const PINNED_LOCATIONS = [
  { file: 'action.yml', pattern: ACTION_VERSION_DEFAULT },
  { file: 'packages/skill/SKILL.md', pattern: CLI_PACKAGE_REFERENCE },
  { file: 'packages/skill/README.md', pattern: CLI_PACKAGE_REFERENCE },
];

/**
 * Returns capture group 1 of every match, so callers see both missing and
 * conflicting pins.
 *
 * @param {string} text
 * @param {RegExp} pattern
 * @returns {string[]}
 */
export function extractPinnedVersions(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? '');
}

/**
 * CRLF checkouts (Git for Windows autocrlf) must not hide a correct pin.
 *
 * @param {string} text
 * @returns {string}
 */
export function toLf(text) {
  return text.replace(/\r\n/g, '\n');
}
