import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOWS_DIR = path.join(REPO_ROOT, '.github', 'workflows');
const COMPOSITE_ACTION = path.join(REPO_ROOT, 'action.yml');

// A tag or branch can move to new code; a full commit SHA cannot.
const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;
// A `uses:` key in a step or job, with an optional list dash and quotes.
const USES_LINE = /^\s*(?:-\s+)?uses:\s*['"]?([^'"\s#]+)/;

describe('GitHub Actions supply chain', () => {
  it('pins every remote action to a full commit SHA', () => {
    const references = actionFiles().flatMap(readRemoteActionReferences);
    const unpinned = references
      .filter(({ ref }) => !FULL_COMMIT_SHA.test(ref.slice(ref.lastIndexOf('@') + 1)))
      .map(({ file, ref }) => `${file}: ${ref}`);

    // Guards against a vacuous pass if the extraction stops matching.
    expect(references.length).toBeGreaterThan(0);
    expect(unpinned).toEqual([]);
  });
});

function actionFiles(): string[] {
  const workflows = readdirSync(WORKFLOWS_DIR)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => path.join(WORKFLOWS_DIR, name));

  return [...workflows, COMPOSITE_ACTION];
}

function readRemoteActionReferences(file: string): ActionReference[] {
  const relativeFile = path.relative(REPO_ROOT, file);

  return readFileSync(file, 'utf-8')
    .split('\n')
    .map((line) => USES_LINE.exec(line)?.[1])
    .filter((ref): ref is string => ref !== undefined && isRemoteAction(ref))
    .map((ref) => ({ file: relativeFile, ref }));
}

// Local actions live in this repository, and Docker images are not git refs.
function isRemoteAction(ref: string): boolean {
  return !ref.startsWith('./') && !ref.startsWith('docker://');
}

type ActionReference = {
  file: string;
  ref: string;
};
