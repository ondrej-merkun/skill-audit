import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Skill } from '../packages/cli/src/types.js';

const testHome = join(tmpdir(), 'skillaudit-depsdev-test-' + process.pid);

vi.mock('node:os', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:os')>();
  return { ...orig, homedir: () => testHome };
});

const { enrichDepsDev } = await import('../packages/cli/src/enrich/deps-dev.js');

function makeSkill(skillPath = join(testHome, 'skill')): Skill {
  return {
    id: 'test-skill',
    agentId: 'test',
    name: 'test-skill',
    path: skillPath,
    manifestPath: null,
    format: 'SKILL.md',
    scope: 'user',
    treeSha256: 'abc123',
  };
}

function makeDepsDevResponse(advisoryCount: number): Response {
  const advisoryKeys = Array.from({ length: advisoryCount }, (_, i) => ({ id: `GHSA-${i}` }));
  return new Response(
    JSON.stringify({
      packageKey: { system: 'NPM', name: 'example' },
      versions: [
        { versionKey: { system: 'NPM', name: 'example', version: '1.0.0' }, isDefault: true, advisoryKeys },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('enrichDepsDev', () => {
  beforeEach(async () => {
    await mkdir(join(testHome, 'skill'), { recursive: true });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    await rm(testHome, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns null when no package.json or requirements.txt exists', async () => {
    const result = await enrichDepsDev(makeSkill());
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reads npm deps from package.json and returns advisory count', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ dependencies: { express: '^4.0.0', lodash: '^4.0.0' } }),
    );

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeDepsDevResponse(2))
      .mockResolvedValueOnce(makeDepsDevResponse(0));

    const result = await enrichDepsDev(makeSkill());
    expect(result).not.toBeNull();
    expect(result?.osvAdvisories).toBe(2);
    expect(result?.scorecardScore).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reads Python deps from requirements.txt when no package.json', async () => {
    await writeFile(
      join(testHome, 'skill', 'requirements.txt'),
      'requests>=2.28.0\nnumpy==1.24.0\n',
    );

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeDepsDevResponse(1))
      .mockResolvedValueOnce(makeDepsDevResponse(0));

    const result = await enrichDepsDev(makeSkill());
    expect(result).not.toBeNull();
    expect(result?.osvAdvisories).toBe(1);

    // should use pypi ecosystem
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls[0]?.[0]).toMatch(/pypi/);
  });

  it('returns zero advisories when all deps are clean', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ dependencies: { chalk: '^5.0.0' } }),
    );

    vi.mocked(fetch).mockResolvedValueOnce(makeDepsDevResponse(0));

    const result = await enrichDepsDev(makeSkill());
    expect(result?.osvAdvisories).toBe(0);
  });

  it('fails silently when API returns non-200', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ dependencies: { 'some-pkg': '^1.0.0' } }),
    );

    vi.mocked(fetch).mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const result = await enrichDepsDev(makeSkill());
    expect(result).not.toBeNull();
    expect(result?.osvAdvisories).toBe(0);
  });

  it('fails silently when fetch throws', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ dependencies: { 'some-pkg': '^1.0.0' } }),
    );

    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const result = await enrichDepsDev(makeSkill());
    expect(result).not.toBeNull();
    expect(result?.osvAdvisories).toBe(0);
  });

  it('ignores comment lines in requirements.txt', async () => {
    await writeFile(
      join(testHome, 'skill', 'requirements.txt'),
      '# this is a comment\nrequests>=2.0\n',
    );

    vi.mocked(fetch).mockResolvedValueOnce(makeDepsDevResponse(0));

    const result = await enrichDepsDev(makeSkill());
    expect(result).not.toBeNull();
    // only one real dep (requests), not the comment
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
