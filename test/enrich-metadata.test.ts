import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  extractGitHubSlugFromUrl,
  readDependencyRefs,
  resolveGitHubSlug,
} from '../packages/cli/src/enrich/metadata.js';
import type { Skill } from '../packages/cli/src/types.js';

const testRoot = join(tmpdir(), `skill-audit-metadata-${process.pid}`);

function makeSkill(path: string): Skill {
  return {
    id: 'metadata-skill',
    agentId: 'test',
    name: 'metadata-skill',
    path,
    manifestPath: join(path, 'SKILL.md'),
    format: 'SKILL.md',
    scope: 'user',
    treeSha256: 'abc123',
  };
}

describe('extractGitHubSlugFromUrl', () => {
  it.each([
    ['https://github.com/owner/repo', 'owner/repo'],
    ['https://github.com/owner/repo.git', 'owner/repo'],
    ['git+https://github.com/owner/repo.git', 'owner/repo'],
    ['git@github.com:owner/repo.git', 'owner/repo'],
    ['ssh://git@github.com/owner/repo.git', 'owner/repo'],
    ['https://github.com/owner/repo/', 'owner/repo'],
    ['https://github.com/owner/repo/tree/main/packages/skill', 'owner/repo'],
  ])('normalizes %s', (input, expected) => {
    expect(extractGitHubSlugFromUrl(input)).toBe(expected);
  });

  it.each([
    'https://github.com',
    'https://github.com/features',
    'https://docs.github.com/en/repositories',
    'github.com',
  ])('ignores non-repository GitHub references: %s', (input) => {
    expect(extractGitHubSlugFromUrl(input)).toBeNull();
  });
});

describe('enrichment metadata extraction', () => {
  beforeEach(async () => {
    await mkdir(testRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(testRoot, { recursive: true, force: true });
  });

  it('uses package.json repository, homepage, and bugs fields before SKILL.md examples', async () => {
    const dir = await mkdtemp(join(testRoot, 'repo-'));
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        homepage: 'https://github.com/real-owner/homepage-repo#readme',
        bugs: { url: 'https://github.com/real-owner/bug-repo/issues' },
      })
    );
    await writeFile(
      join(dir, 'SKILL.md'),
      'Example only: https://github.com/example/example-repo/tree/main',
    );

    await expect(resolveGitHubSlug(makeSkill(dir))).resolves.toBe('real-owner/homepage-repo');
  });

  it('does not fall back to SKILL.md prose when a package manifest exists without a repository slug', async () => {
    const dir = await mkdtemp(join(testRoot, 'manifest-'));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'local-wrapper' }));
    await writeFile(join(dir, 'SKILL.md'), 'Docs mention https://github.com/example/example-repo.');

    await expect(resolveGitHubSlug(makeSkill(dir))).resolves.toBeNull();
  });

  it('falls back to SKILL.md when no package manifests exist', async () => {
    const dir = await mkdtemp(join(testRoot, 'skillmd-'));
    await writeFile(join(dir, 'SKILL.md'), 'Source: https://github.com/source/skill-repo.git');

    await expect(resolveGitHubSlug(makeSkill(dir))).resolves.toBe('source/skill-repo');
  });

  it('finds npm and Python dependency manifests in nested skill payload directories', async () => {
    const dir = await mkdtemp(join(testRoot, 'deps-'));
    await mkdir(join(dir, 'tools', 'node-helper'), { recursive: true });
    await mkdir(join(dir, 'tools', 'python-helper'), { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), '# Nested deps');
    await writeFile(
      join(dir, 'tools', 'node-helper', 'package.json'),
      JSON.stringify({
        dependencies: { chalk: '^5.0.0' },
        optionalDependencies: { ora: '^8.0.0' },
      })
    );
    await writeFile(join(dir, 'tools', 'python-helper', 'requirements.txt'), 'requests>=2\n');

    await expect(readDependencyRefs(makeSkill(dir))).resolves.toEqual([
      { ecosystem: 'npm', name: 'chalk' },
      { ecosystem: 'npm', name: 'ora' },
      { ecosystem: 'pypi', name: 'requests' },
    ]);
  });

  it('does not walk node_modules when collecting dependency manifests', async () => {
    const dir = await mkdtemp(join(testRoot, 'skip-'));
    await mkdir(join(dir, 'node_modules', 'bad'), { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), '# Skip node_modules');
    await writeFile(
      join(dir, 'node_modules', 'bad', 'package.json'),
      JSON.stringify({ dependencies: { should_not_scan: '1.0.0' } })
    );

    await expect(readDependencyRefs(makeSkill(dir))).resolves.toEqual([]);
  });
});
