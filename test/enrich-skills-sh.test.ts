import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Skill } from '../packages/cli/src/types.js';

const testHome = join(tmpdir(), 'skill-audit-skills-sh-test-' + process.pid);

vi.mock('node:os', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:os')>();
  return { ...orig, homedir: () => testHome };
});

const { enrichSkillsSh } = await import('../packages/cli/src/enrich/skills-sh.js');

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'test-skill',
    agentId: 'test',
    name: 'test-skill',
    path: join(testHome, 'skill'),
    manifestPath: null,
    format: 'SKILL.md',
    scope: 'user',
    treeSha256: 'abc123',
    ...overrides,
  };
}

describe('enrichSkillsSh', () => {
  beforeEach(async () => {
    await mkdir(join(testHome, 'skill'), { recursive: true });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(async () => {
    await rm(testHome, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns null when no package.json or SKILL.md exists', async () => {
    const result = await enrichSkillsSh(makeSkill());
    expect(result).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resolves slug from package.json repository string', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ repository: 'https://github.com/owner/my-skill.git' }),
    );

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ gen: 'Pass', socket_alerts: 0, snyk: 'Pass' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await enrichSkillsSh(makeSkill());
    expect(result).toEqual({ gen: 'Pass', socketAlerts: 0, snyk: 'Pass' });
    expect(fetch).toHaveBeenCalledWith(
      'https://add-skill.vercel.sh/audit',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ slug: 'owner/my-skill' }),
      }),
    );
  });

  it('resolves slug from package.json repository.url object', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ repository: { url: 'git+https://github.com/acme/cool-skill.git' } }),
    );

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ gen: 'High', socket_alerts: 2, snyk: 'Critical' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await enrichSkillsSh(makeSkill());
    expect(result?.gen).toBe('High');
    expect(result?.socketAlerts).toBe(2);
    expect(result?.snyk).toBe('Critical');
  });

  it('falls back to SKILL.md for slug when package.json is absent', async () => {
    const skillMdPath = join(testHome, 'skill', 'SKILL.md');
    await writeFile(
      skillMdPath,
      '# My Skill\nSee https://github.com/org/skill-repo for details.',
    );

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ gen: 'Pass', socket_alerts: 1, snyk: 'Pass' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await enrichSkillsSh(makeSkill({ manifestPath: skillMdPath }));
    expect(result).not.toBeNull();
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as { slug: string };
    expect(body.slug).toBe('org/skill-repo');
  });

  it('returns null on non-200 response with no stale cache', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ repository: 'https://github.com/owner/repo' }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    const result = await enrichSkillsSh(makeSkill());
    expect(result).toBeNull();
  });

  it('returns null on network error (fail-silent)', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ repository: 'https://github.com/owner/repo' }),
    );
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const result = await enrichSkillsSh(makeSkill());
    expect(result).toBeNull();
  });

  it('returns cached data without network call on fresh cache', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ repository: 'https://github.com/owner/cached-skill' }),
    );

    // First call populates cache
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ gen: 'Pass', socket_alerts: 0, snyk: 'Pass' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await enrichSkillsSh(makeSkill());
    expect(fetch).toHaveBeenCalledTimes(1);

    // Second call should use cache, no fetch
    vi.mocked(fetch).mockClear();
    const result = await enrichSkillsSh(makeSkill());
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toEqual({ gen: 'Pass', socketAlerts: 0, snyk: 'Pass' });
  });

  it('sends honest User-Agent header', async () => {
    await writeFile(
      join(testHome, 'skill', 'package.json'),
      JSON.stringify({ repository: 'https://github.com/owner/ua-test' }),
    );
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ gen: 'Pass', socket_alerts: 0, snyk: 'Pass' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await enrichSkillsSh(makeSkill());
    const headers = (vi.mocked(fetch).mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/^skill-audit\//);
  });
});
