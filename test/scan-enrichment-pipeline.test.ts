import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import stripAnsi from './helpers/strip-ansi.js';
import type { Skill } from '../packages/cli/src/types.js';

const testHome = join(tmpdir(), `skill-audit-scan-enrichment-${process.pid}`);

vi.mock('node:os', async (importOriginal) => {
  const orig = await importOriginal<typeof import('node:os')>();
  return { ...orig, homedir: () => testHome };
});

vi.mock('../packages/cli/src/discovery/index.js', () => ({
  clearPlugins: vi.fn(),
  initDefaultPlugins: vi.fn(),
  discoverAll: vi.fn(),
}));

vi.mock('../packages/cli/src/rules/engine.js', () => ({
  runRules: vi.fn(),
}));

const { discoverAll } = await import('../packages/cli/src/discovery/index.js');
const { runRules } = await import('../packages/cli/src/rules/engine.js');
const { runScan } = await import('../packages/cli/src/commands/scan.js');

function makeDepsDevResponse(advisoryCount: number): Response {
  const advisoryKeys = Array.from({ length: advisoryCount }, (_, i) => ({ id: `GHSA-${i}` }));
  return new Response(
    JSON.stringify({
      versions: [{ isDefault: true, advisoryKeys }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function makeSkill(skillPath: string): Skill {
  return {
    id: 'realistic-source-skill',
    agentId: 'claude-code',
    name: 'realistic-source-skill',
    path: skillPath,
    manifestPath: join(skillPath, 'SKILL.md'),
    format: 'SKILL.md',
    scope: 'user',
    treeSha256: 'abc123',
  };
}

describe('scan enrichment pipeline', () => {
  let stdoutChunks: string[];
  let stderrChunks: string[];

  beforeEach(async () => {
    await mkdir(testHome, { recursive: true });
    stdoutChunks = [];
    stderrChunks = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutChunks.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });
    vi.mocked(runRules).mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url === 'https://add-skill.vercel.sh/audit') {
          return new Response(
            JSON.stringify({ gen: 'Low', socket_alerts: 1, snyk: 'Pass' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url === 'https://api.github.com/repos/example/source-skill') {
          return new Response(
            JSON.stringify({ stargazers_count: 7, created_at: '2025-01-01T00:00:00Z' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url === 'https://api.github.com/repos/example/source-skill/contributors?anon=true&per_page=1') {
          return new Response(JSON.stringify([{ login: 'one' }, { login: 'two' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === 'https://api.deps.dev/v3alpha/packages/npm/left-pad') {
          return makeDepsDevResponse(1);
        }
        return new Response('not found', { status: 404 });
      })
    );
  });

  afterEach(async () => {
    await rm(testHome, { recursive: true, force: true });
    process.exitCode = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('populates the pretty scan enrichment column from discovered skill metadata', async () => {
    const dir = await mkdtemp(join(testHome, 'skill-'));
    await writeFile(join(dir, 'SKILL.md'), '# Source Skill\n');
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        repository: 'https://github.com/example/source-skill.git',
        dependencies: { 'left-pad': '^1.3.0' },
      })
    );
    vi.mocked(discoverAll).mockResolvedValue([makeSkill(dir)]);

    await runScan({});

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('ENRICHMENT');
    expect(out).toContain('Gen=Low');
    expect(out).toContain('Socket=1');
    expect(out).toContain('Snyk=Pass');
    expect(out).toContain('GitHub=7 stars');
    expect(out).toContain('2 contributors');
    expect(out).toContain('1 OSV advisory');
    expect(out).not.toContain('no metadata found');
    expect(stripAnsi(stderrChunks.join(''))).toBe('');
  });

  it('populates deps.dev enrichment from a nested tool manifest', async () => {
    const dir = await mkdtemp(join(testHome, 'nested-skill-'));
    await mkdir(join(dir, 'tools', 'node-helper'), { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), '# Nested Source Skill\n');
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ repository: 'https://github.com/example/source-skill.git' })
    );
    await writeFile(
      join(dir, 'tools', 'node-helper', 'package.json'),
      JSON.stringify({ dependencies: { 'left-pad': '^1.3.0' } })
    );
    vi.mocked(discoverAll).mockResolvedValue([makeSkill(dir)]);

    await runScan({});

    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).toContain('ENRICHMENT');
    expect(out).toContain('GitHub=7 stars');
    expect(out).toContain('1 OSV advisory');
    expect(stripAnsi(stderrChunks.join(''))).toBe('');
  });
});
