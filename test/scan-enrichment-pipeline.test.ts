import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  runRulesForSkill: vi.fn(),
}));

const { discoverAll } = await import('../packages/cli/src/discovery/index.js');
const { runRulesForSkill: runRules } = await import('../packages/cli/src/rules/engine.js');
const { runScan } = await import('../packages/cli/src/commands/scan.js');

function makeDepsDevPackageResponse(version = '1.0.0'): Response {
  return new Response(
    JSON.stringify({
      versions: [{ isDefault: true, versionKey: { version } }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function makeDepsDevVersionResponse(advisoryCount: number): Response {
  const advisoryKeys = Array.from({ length: advisoryCount }, (_, i) => ({ id: `GHSA-${i}` }));
  return new Response(
    JSON.stringify({
      advisoryKeys,
      relatedProjects: [{ projectKey: { id: 'github.com/example/source-skill' } }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function makeDepsDevProjectResponse(): Response {
  return new Response(JSON.stringify({ scorecard: { overallScore: 6.5 } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
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
        if (
          url ===
          'https://add-skill.vercel.sh/audit?source=github&skills=example%2Fsource-skill%2Frealistic-source-skill'
        ) {
          return new Response(
            JSON.stringify({
              'example/source-skill/realistic-source-skill': {
                gen: 'Low',
                socket: { alerts: 1 },
                snyk: 'Pass',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url === 'https://api.github.com/repos/example/source-skill') {
          return new Response(
            JSON.stringify({ stargazers_count: 7, created_at: '2025-01-01T00:00:00Z' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url === 'https://api.github.com/repos/example/unknown-contrib') {
          return new Response(
            JSON.stringify({ stargazers_count: 11, created_at: '2025-01-01T00:00:00Z' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url === 'https://api.github.com/repos/example/source-skill/contributors?anon=true&per_page=1') {
          return new Response(JSON.stringify([{ login: 'one' }, { login: 'two' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === 'https://api.github.com/repos/example/unknown-contrib/contributors?anon=true&per_page=1') {
          return new Response('rate limited', { status: 403 });
        }
        if (url === 'https://api.deps.dev/v3alpha/systems/NPM/packages/left-pad') {
          return makeDepsDevPackageResponse('1.3.0');
        }
        if (url === 'https://api.deps.dev/v3alpha/systems/NPM/packages/left-pad/versions/1.3.0') {
          return makeDepsDevVersionResponse(1);
        }
        if (url === 'https://api.deps.dev/v3alpha/projects/github.com%2Fexample%2Fsource-skill') {
          return makeDepsDevProjectResponse();
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

  it('does not populate pretty scan enrichment while enrichment is disabled', async () => {
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
    expect(out).not.toContain('ENRICHMENT');
    expect(out).not.toContain('Gen=Low');
    expect(out).not.toContain('GitHub=7 stars');
    expect(out).not.toContain('1 OSV advisory');
    expect(out).not.toContain('no metadata found');
    expect(fetch).not.toHaveBeenCalled();
    expect(stripAnsi(stderrChunks.join(''))).toBe('');
  });

  it('omits JSON and HTML enrichment while enrichment is disabled', async () => {
    const dir = await mkdtemp(join(testHome, 'json-html-skill-'));
    const htmlPath = join(testHome, 'report.html');
    await writeFile(join(dir, 'SKILL.md'), '# Source Skill\n');
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({
        repository: 'https://github.com/example/source-skill.git',
        dependencies: { 'left-pad': '^1.3.0' },
      })
    );
    vi.mocked(discoverAll).mockResolvedValue([makeSkill(dir)]);

    await runScan({ json: true });
    const json = JSON.parse(stdoutChunks.join('')) as {
      skills: Array<Record<string, unknown>>;
    };
    expect(json.skills[0]).not.toHaveProperty('enrichment');

    stdoutChunks = [];
    stderrChunks = [];
    await runScan({ html: htmlPath });
    const html = await readFile(htmlPath, 'utf8');
    expect(html).not.toContain('<th>Enrichment</th>');
    expect(html).not.toContain('Gen=Low');
    expect(html).not.toContain('1 OSV advisories');
    expect(fetch).not.toHaveBeenCalled();
    expect(stripAnsi(stderrChunks.join(''))).toContain(`HTML report written to ${htmlPath}`);
  });

  it('does not fetch GitHub contributors while enrichment is disabled', async () => {
    const dir = await mkdtemp(join(testHome, 'unknown-contrib-skill-'));
    const htmlPath = join(testHome, 'unknown-contrib.html');
    await writeFile(join(dir, 'SKILL.md'), '# Unknown Contributor Skill\n');
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ repository: 'https://github.com/example/unknown-contrib.git' })
    );
    vi.mocked(discoverAll).mockResolvedValue([makeSkill(dir)]);

    await runScan({});
    const out = stripAnsi(stdoutChunks.join(''));
    expect(out).not.toContain('GitHub=11 stars');
    expect(out).not.toContain('contributors unknown');
    expect(out).not.toContain('0 contributors');

    stdoutChunks = [];
    stderrChunks = [];
    await runScan({ json: true });
    const json = JSON.parse(stdoutChunks.join('')) as { skills: Array<Record<string, unknown>> };
    expect(json.skills[0]).not.toHaveProperty('enrichment');

    stdoutChunks = [];
    stderrChunks = [];
    await runScan({ html: htmlPath });
    const html = await readFile(htmlPath, 'utf8');
    expect(html).not.toContain('<th>Enrichment</th>');
    expect(html).not.toContain('class="enrichment-cell"');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not populate deps.dev enrichment from a nested tool manifest while disabled', async () => {
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
    expect(out).not.toContain('ENRICHMENT');
    expect(out).not.toContain('GitHub=7 stars');
    expect(out).not.toContain('1 OSV advisory');
    expect(fetch).not.toHaveBeenCalled();
    expect(stripAnsi(stderrChunks.join(''))).toBe('');
  });
});
