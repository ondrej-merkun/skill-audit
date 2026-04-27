import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Skill } from '../packages/cli/src/types.js';

const testHome = join(tmpdir(), 'skill-audit-depsdev-test-' + process.pid);

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

function makeDepsDevPackageResponse(version = '1.0.0'): Response {
  return new Response(
    JSON.stringify({
      packageKey: { system: 'NPM', name: 'example' },
      versions: [{ versionKey: { system: 'NPM', name: 'example', version }, isDefault: true }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function makeDepsDevVersionResponse(advisoryCount: number, projectId?: string): Response {
  const advisoryKeys = Array.from({ length: advisoryCount }, (_, i) => ({ id: `GHSA-${i}` }));
  return new Response(
    JSON.stringify({
      versionKey: { system: 'NPM', name: 'example', version: '1.0.0' },
      advisoryKeys,
      ...(projectId === undefined
        ? {}
        : { relatedProjects: [{ projectKey: { id: projectId } }] }),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function makeDepsDevProjectResponse(score: number): Response {
  return new Response(JSON.stringify({ scorecard: { overallScore: score } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('enrichDepsDev', () => {
  beforeEach(async () => {
    await mkdir(join(testHome, 'skill'), { recursive: true });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    await rm(testHome, { recursive: true, force: true });
    vi.useRealTimers();
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
      .mockResolvedValueOnce(makeDepsDevPackageResponse('4.18.2'))
      .mockResolvedValueOnce(makeDepsDevVersionResponse(2, 'github.com/expressjs/express'))
      .mockResolvedValueOnce(makeDepsDevProjectResponse(7.4))
      .mockResolvedValueOnce(makeDepsDevPackageResponse('4.17.21'))
      .mockResolvedValueOnce(makeDepsDevVersionResponse(0));

    const result = await enrichDepsDev(makeSkill());
    expect(result).not.toBeNull();
    expect(result?.osvAdvisories).toBe(2);
    expect(result?.scorecardScore).toBe(7.4);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.deps.dev/v3alpha/systems/NPM/packages/express',
      expect.any(Object),
    );
  });

  it('reads Python deps from requirements.txt when no package.json', async () => {
    await writeFile(
      join(testHome, 'skill', 'requirements.txt'),
      'requests>=2.28.0\nnumpy==1.24.0\n',
    );

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeDepsDevPackageResponse('2.32.3'))
      .mockResolvedValueOnce(makeDepsDevVersionResponse(1))
      .mockResolvedValueOnce(makeDepsDevPackageResponse('1.24.0'))
      .mockResolvedValueOnce(makeDepsDevVersionResponse(0));

    const result = await enrichDepsDev(makeSkill());
    expect(result).not.toBeNull();
    expect(result?.osvAdvisories).toBe(1);

    // should use pypi ecosystem
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls[0]?.[0]).toMatch(/systems\/PYPI/);
  });

  it('encodes scoped npm package names for deps.dev paths', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ dependencies: { '@colors/colors': '^1.5.0' } }),
    );

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeDepsDevPackageResponse('1.5.0'))
      .mockResolvedValueOnce(makeDepsDevVersionResponse(0));

    const result = await enrichDepsDev(makeSkill());
    expect(result?.osvAdvisories).toBe(0);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
      'https://api.deps.dev/v3alpha/systems/NPM/packages/%40colors%2Fcolors',
    );
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe(
      'https://api.deps.dev/v3alpha/systems/NPM/packages/%40colors%2Fcolors/versions/1.5.0',
    );
  });

  it('returns zero advisories when all deps are clean', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ dependencies: { chalk: '^5.0.0' } }),
    );

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeDepsDevPackageResponse('5.0.0'))
      .mockResolvedValueOnce(makeDepsDevVersionResponse(0));

    const result = await enrichDepsDev(makeSkill());
    expect(result?.osvAdvisories).toBe(0);
  });

  it('returns null when deps.dev has no registry record', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ dependencies: { 'some-pkg': '^1.0.0' } }),
    );

    vi.mocked(fetch).mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const result = await enrichDepsDev(makeSkill());
    expect(result).toBeNull();
  });

  it('surfaces lookup failures instead of treating them as zero advisories', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ dependencies: { 'some-pkg': '^1.0.0' } }),
    );

    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    await expect(enrichDepsDev(makeSkill())).rejects.toThrow('deps.dev lookup failed');
  });

  it('serves stale cache when deps.dev fails after a prior successful lookup', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ dependencies: { cached: '^1.0.0' } }),
    );

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeDepsDevPackageResponse('1.0.0'))
      .mockResolvedValueOnce(makeDepsDevVersionResponse(3));
    await expect(enrichDepsDev(makeSkill())).resolves.toEqual({
      osvAdvisories: 3,
      scorecardScore: null,
    });

    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'));
    vi.mocked(fetch).mockReset();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    await expect(enrichDepsDev(makeSkill())).resolves.toEqual({
      osvAdvisories: 3,
      scorecardScore: null,
    });
  });

  it('ignores comment lines in requirements.txt', async () => {
    await writeFile(
      join(testHome, 'skill', 'requirements.txt'),
      '# this is a comment\nrequests>=2.0\n',
    );

    vi.mocked(fetch)
      .mockResolvedValueOnce(makeDepsDevPackageResponse('2.0.0'))
      .mockResolvedValueOnce(makeDepsDevVersionResponse(0));

    const result = await enrichDepsDev(makeSkill());
    expect(result).not.toBeNull();
    // only one real dep (requests), not the comment; deps.dev requires package + version calls.
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
